const ORIGIN = "https://otcdesks.cash";
const launcherUrl = `${ORIGIN}/launcher`;

const launcher = await fetch(launcherUrl);
if (!launcher.ok) throw new Error(`Launcher returned ${launcher.status}`);
const html = await launcher.text();
const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((match) => new URL(match[1], ORIGIN).href);

const needles = [
  "REWARD_WALLET is not configured",
  "LAUNCH_LOOKUP_TABLE",
  "feeShareholders",
  "pointing its fees at the protocol did not land",
  "metadataUri",
  "Your coin launched",
  "Keypair.generate",
  "/api/ipfs",
  "/api/coins",
];

function occurrences(haystack, needle, limit = 8) {
  const found = [];
  let cursor = 0;
  while (found.length < limit) {
    const index = haystack.indexOf(needle.toLowerCase(), cursor);
    if (index === -1) break;
    found.push(index);
    cursor = index + needle.length;
  }
  return found;
}

const results = [];
for (const source of sources) {
  const response = await fetch(source);
  if (!response.ok) continue;
  const code = await response.text();
  const lower = code.toLowerCase();
  const snippets = needles.flatMap((needle) =>
    occurrences(lower, needle).map((index, occurrence) => ({
      needle,
      occurrence,
      index,
      code: code.slice(Math.max(0, index - 4_000), Math.min(code.length, index + 10_000)),
    })),
  );
  const focused = [
    ["constantsModuleHead", "33840,e=>", 0, 12_000],
    ["launcherModuleHead", "58798,e=>", 0, 8_000],
    ["pumpSdkAlias", "lF=", 2_000, 3_000],
    ["sharingConfigPda", "function l9", 2_000, 4_000],
    ["sharingAtaPda", "function lX", 2_000, 4_000],
    ["creatorVaultPda", "function rw", 2_000, 4_000],
  ].flatMap(([label, target, before, after]) => {
    const index = code.indexOf(target);
    return index === -1 ? [] : [{
      label,
      index,
      code: code.slice(Math.max(0, index - before), Math.min(code.length, index + after)),
    }];
  });
  if (lower.includes("reward_wallet is not configured")) {
    focused.push({ label: "constantsChunkHead", index: 0, code: code.slice(0, 16_000) });
    const addressContexts = [...code.matchAll(/["']([1-9A-HJ-NP-Za-km-z]{32,44})["']/g)]
      .map((match) => ({
        address: match[1],
        index: match.index,
        context: code.slice(Math.max(0, match.index - 100), Math.min(code.length, match.index + 150)),
      }));
    focused.push({ label: "constantsAddressContexts", index: 0, code: JSON.stringify(addressContexts) });
  }
  if (lower.includes("metadatauri") && lower.includes("createfeesharingconfig")) {
    focused.push({ label: "launcherChunkHead", index: 0, code: code.slice(0, 16_000) });
  }
  if (snippets.length || focused.length) results.push({ source, bytes: code.length, focused, snippets });
}

console.log(JSON.stringify({ launcherUrl, scriptCount: sources.length, results }, null, 2));
