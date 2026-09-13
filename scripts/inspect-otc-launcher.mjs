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
  if (snippets.length) results.push({ source, bytes: code.length, snippets });
}

console.log(JSON.stringify({ launcherUrl, scriptCount: sources.length, results }, null, 2));
