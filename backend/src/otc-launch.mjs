import BN from "bn.js";
import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";

const OTC_ORIGIN = "https://otcdesks.cash";
const OTC_REWARD_WALLET = new PublicKey(
  process.env.OTC_REWARD_WALLET || "2k5hrzuykwyTbUe8L7UriYAQhr5hijNLgBvEB4B9pP5y",
);
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_AMM_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

function signerFromEnvironment() {
  const value = process.env.OTC_LAUNCHER_KEYPAIR_JSON?.trim();
  if (!value) throw new Error("OTC_LAUNCHER_KEYPAIR_JSON is missing.");
  let bytes;
  if (value.startsWith("[")) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("Wallet secret must be a JSON byte array or base58 string.");
    bytes = Uint8Array.from(parsed);
  } else {
    bytes = bs58.decode(value);
  }
  if (bytes.length !== 64) throw new Error("Wallet secret must contain exactly 64 bytes.");
  return Keypair.fromSecretKey(bytes);
}

function connection() {
  return new Connection(process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL, "confirmed");
}

function configuredLookupTable() {
  const value = process.env.OTC_LAUNCH_LOOKUP_TABLE?.trim();
  return value ? new PublicKey(value) : null;
}

export async function otcWalletStatus() {
  try {
    const signer = signerFromEnvironment();
    const rpc = connection();
    const lookupTable = configuredLookupTable();
    const [balance, table] = await Promise.all([
      rpc.getBalance(signer.publicKey, "confirmed"),
      lookupTable ? rpc.getAddressLookupTable(lookupTable) : Promise.resolve({ value: null }),
    ]);
    return {
      configured: true,
      publicKey: signer.publicKey.toBase58(),
      balanceLamports: balance,
      rpcReachable: true,
      lookupTableConfigured: Boolean(lookupTable),
      lookupTableReadable: Boolean(table.value),
      ready: balance > 0 && Boolean(table.value),
    };
  } catch (error) {
    return { configured: false, ready: false, error: error.message };
  }
}

async function uploadMetadata(row, mint) {
  const imageResponse = await fetch(row.image_url, { signal: AbortSignal.timeout(30_000) });
  if (!imageResponse.ok) throw new Error(`Source image returned ${imageResponse.status}.`);
  const type = imageResponse.headers.get("content-type") || "application/octet-stream";
  if (!type.startsWith("image/")) throw new Error("Source attachment is not an image.");
  const image = await imageResponse.blob();
  if (image.size > 10_000_000) throw new Error("Source image is larger than 10 MB.");

  const form = new FormData();
  form.append("file", image, `launch.${type.split("/")[1]?.split(";")[0] || "png"}`);
  form.append("name", row.name.trim());
  form.append("symbol", row.ticker.trim());
  form.append("description", `Launched from ${row.source_url}`);
  form.append("twitter", row.source_url);
  form.append("website", `${OTC_ORIGIN}/coin/${mint.toBase58()}`);
  form.append("showName", "true");
  const response = await fetch(`${OTC_ORIGIN}/api/ipfs`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.metadataUri) {
    throw new Error(result.error || `OTC metadata upload returned ${response.status}.`);
  }
  return result.metadataUri;
}

function creatorVaults(sharingConfig) {
  const [pumpCreatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), sharingConfig.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  const [ammCreatorVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator_vault"), sharingConfig.toBuffer()],
    PUMP_AMM_PROGRAM_ID,
  );
  return [pumpCreatorVault, ammCreatorVault];
}

function quoteAtaInstructions({ mint, payer, owners, tokenProgram }) {
  const seen = new Set();
  return owners.flatMap((owner) => {
    const key = owner.toBase58();
    if (seen.has(key)) return [];
    seen.add(key);
    const ata = getAssociatedTokenAddressSync(
      mint,
      owner,
      true,
      tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    return [createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      mint,
      tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )];
  });
}

async function confirm(rpc, signature, blockhash, lastValidBlockHeight) {
  const result = await rpc.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (result.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
}

export async function launchOnOtc(row) {
  const signer = signerFromEnvironment();
  const rpc = connection();
  const lookupTableAddress = configuredLookupTable();
  if (!lookupTableAddress) throw new Error("OTC_LAUNCH_LOOKUP_TABLE is missing.");

  const pairMint = new PublicKey(row.pair_mint);
  const pairAccount = await rpc.getAccountInfo(pairMint, "confirmed");
  if (!pairAccount) throw new Error("The selected OTC pair mint is not readable on chain.");
  const quoteTokenProgram = pairAccount.owner;
  if (!quoteTokenProgram.equals(TOKEN_PROGRAM_ID) && !quoteTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("The selected OTC pair is not owned by a supported token program.");
  }

  const lookup = await rpc.getAddressLookupTable(lookupTableAddress);
  if (!lookup.value) throw new Error("OTC's launch lookup table is not readable on chain.");
  const mintSigner = Keypair.generate();
  const metadataUri = await uploadMetadata(row, mintSigner.publicKey);
  const online = new OnlinePumpSdk(rpc);
  const global = await online.fetchGlobal();
  const base = {
    global,
    mint: mintSigner.publicKey,
    name: row.name.trim(),
    symbol: row.ticker.trim(),
    uri: metadataUri,
    creator: signer.publicKey,
    user: signer.publicKey,
    mayhemMode: false,
    quoteMint: pairMint,
    quoteTokenProgram,
    creatorFeeBps: new BN(100),
  };
  const createIx = await PUMP_SDK.createV2Instruction(base);
  const sharingConfig = feeSharingConfigPda(mintSigner.publicKey);
  const createSharingIx = await PUMP_SDK.createFeeSharingConfig({
    creator: signer.publicKey,
    mint: mintSigner.publicKey,
    pool: null,
  });
  const updateSharesIx = await PUMP_SDK.updateFeeSharesV2({
    authority: signer.publicKey,
    mint: mintSigner.publicKey,
    currentShareholders: [signer.publicKey],
    newShareholders: [{ address: OTC_REWARD_WALLET, shareBps: 10_000 }],
    quoteMint: pairMint,
    quoteTokenProgram,
  });
  const ataIxs = quoteAtaInstructions({
    mint: pairMint,
    payer: signer.publicKey,
    owners: [...creatorVaults(sharingConfig), signer.publicKey, OTC_REWARD_WALLET],
    tokenProgram: quoteTokenProgram,
  });

  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash("confirmed");
  const transaction = (instructions) => new VersionedTransaction(
    new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
        ...instructions,
      ],
    }).compileToV0Message([lookup.value]),
  );
  const createTx = transaction([createIx]);
  const feeTx = transaction([createSharingIx, ...ataIxs, updateSharesIx]);
  createTx.sign([signer, mintSigner]);
  feeTx.sign([signer]);

  const createSimulation = await rpc.simulateTransaction(createTx, { commitment: "confirmed" });
  if (createSimulation.value.err) {
    throw new Error(`OTC create simulation failed: ${JSON.stringify(createSimulation.value.err)}`);
  }
  const createSignature = await rpc.sendRawTransaction(createTx.serialize(), { maxRetries: 3 });
  await confirm(rpc, createSignature, blockhash, lastValidBlockHeight);

  let feeSignature = null;
  for (let attempt = 1; attempt <= 3 && !feeSignature; attempt += 1) {
    try {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      feeSignature = await rpc.sendRawTransaction(feeTx.serialize(), { maxRetries: 3 });
      await confirm(rpc, feeSignature, blockhash, lastValidBlockHeight);
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`Coin ${mintSigner.publicKey.toBase58()} was created, but OTC fee assignment failed: ${error.message}`);
      }
    }
  }

  const registration = {
    mint: mintSigner.publicKey.toBase58(),
    name: row.name.trim(),
    symbol: row.ticker.trim(),
    uri: metadataUri,
    image: row.image_url,
    description: `Launched from ${row.source_url}`,
    rewardMint: row.pair_mint,
    rewardSymbol: row.pair_symbol,
    pairMint: row.pair_mint,
    pairSymbol: row.pair_symbol,
    creator: signer.publicKey.toBase58(),
    createTx: createSignature,
    twitter: row.source_url,
  };
  let registered = false;
  let registrationError = "unknown error";
  for (let attempt = 0; attempt < 8 && !registered; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1_500));
    const response = await fetch(`${OTC_ORIGIN}/api/coins`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(registration),
      signal: AbortSignal.timeout(30_000),
    }).catch((error) => ({ ok: false, status: 0, json: async () => ({ error: error.message }) }));
    if (response.ok) {
      registered = true;
    } else {
      const result = await response.json().catch(() => ({}));
      registrationError = result.error || `HTTP ${response.status}`;
      if (response.status !== 409) break;
    }
  }
  if (!registered) {
    throw new Error(`Coin ${mintSigner.publicKey.toBase58()} launched and fees were assigned, but OTC registration failed: ${registrationError}`);
  }
  return {
    contractAddress: mintSigner.publicKey.toBase58(),
    liveUrl: `${OTC_ORIGIN}/coin/${mintSigner.publicKey.toBase58()}`,
    createSignature,
    feeSignature,
  };
}
