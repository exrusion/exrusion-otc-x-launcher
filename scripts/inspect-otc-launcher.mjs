const ORIGIN = "https://otcdesks.cash";
const launcherUrl = `${ORIGIN}/launcher`;

const launcher = await fetch(launcherUrl);
if (!launcher.ok) throw new Error(`Launcher returned ${launcher.status}`);
const html = await launcher.text();
const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((match) => new URL(match[1], ORIGIN).href);

const needles = [
  "/api/",
  "fetch(",
  "launch",
  "pump",
  "meteora",
  "transaction",
  "creatorFee",
  "feeRecipient",
  "rewardMint",
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

  const endpoints = [...code.matchAll(/["'`](https?:\/\/[^"'`\\s]+|\/api\/[^"'`\\s]+)["'`]/g)]
    .map((match) => match[1])
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 50);
  const snippets = matches.slice(0, 10).map((needle) => {
    const index = lower.indexOf(needle.toLowerCase());
    return code.slice(Math.max(0, index - 500), Math.min(code.length, index + 1_500));
  });
  results.push({ source, bytes: code.length, matches, endpoints, snippets });
}

console.log(JSON.stringify({ launcherUrl, scriptCount: sources.length, results }, null, 2));
