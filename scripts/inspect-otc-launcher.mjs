const ORIGIN = "https://otcdesks.cash";
const launcherUrl = `${ORIGIN}/launcher`;

const launcher = await fetch(launcherUrl);
if (!launcher.ok) throw new Error(`Launcher returned ${launcher.status}`);
const html = await launcher.text();
const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((match) => new URL(match[1], ORIGIN).href);

const needles = [
  "REWARD_WALLET",
  "feeShareholders",
  "PUMP_CREATOR_FEE_BPS",
  "pointing its fees",
  "/api/ipfs",
  "/api/coins",
  "createTx",
  "pairMint",
  "quoteMint",
];

const results = [];
for (const source of sources) {
  const response = await fetch(source);
  if (!response.ok) continue;
  const code = await response.text();
  const lower = code.toLowerCase();
  const matches = needles.filter((needle) => lower.includes(needle.toLowerCase()));
  if (!matches.length) continue;

  const snippets = matches.map((needle) => {
    const index = lower.indexOf(needle.toLowerCase());
    return {
      needle,
      code: code.slice(Math.max(0, index - 2_500), Math.min(code.length, index + 6_000)),
    };
  });
  results.push({ source, bytes: code.length, snippets });
}

console.log(JSON.stringify({ launcherUrl, scriptCount: sources.length, results }, null, 2));
