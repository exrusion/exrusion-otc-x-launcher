export function parsePost(text, agentHandle) {
  const cleanHandle = String(agentHandle || "").replace(/^@/, "");
  if (!cleanHandle) return { ok: false, reason: "Agent handle is not configured." };
  if (!new RegExp(`@${escapeRegex(cleanHandle)}\\b`, "i").test(text)) return { ok: false, reason: `Post must tag @${cleanHandle}.` };
  if (!/\blaunch\b/i.test(text)) return { ok: false, reason: "Post must include the word launch." };
  const field = (name) => text.match(new RegExp(`(?:^|\\n)\\s*${name}\\s*:\\s*([^\\n]+)`, "i"))?.[1]?.trim();
  const name = field("name"); const ticker = field("ticker")?.replace(/^\$/, ""); const pair = field("pair");
  if (!name || name.length > 32) return { ok: false, reason: "Name is required and must be 32 characters or fewer." };
  if (!ticker || !/^[a-z0-9]{1,13}$/i.test(ticker)) return { ok: false, reason: "Ticker must be 1–13 letters or numbers." };
  if (!pair) return { ok: false, reason: "Pair is required." };
  return { ok: true, value: { name, ticker: ticker.toUpperCase(), pair } };
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
