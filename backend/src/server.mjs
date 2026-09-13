import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { parsePost } from "./parser.mjs";
import { launchOnOtc, otcWalletStatus } from "./otc-launch.mjs";

const { Pool } = pg;
const PORT = Number(process.env.PORT || 8789);
const MODE = process.env.LAUNCH_MODE === "live" ? "live" : "test";
const AGENT_HANDLE = (process.env.AGENT_HANDLE || "").replace(/^@/, "");
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "";
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "*";
const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!INTERNAL_SECRET) throw new Error("INTERNAL_SECRET is required");
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes("railway.internal") ? false : { rejectUnauthorized: false } });
const pairs = JSON.parse(await readFile(new URL("../../data/pairs.json", import.meta.url), "utf8"));
const byPair = new Map(pairs.flatMap((pair) => [[pair.symbol.toLowerCase(), pair], [pair.mint, pair]]));
await pool.query(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": PUBLIC_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET,POST,OPTIONS", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let value = ""; for await (const chunk of req) { value += chunk; if (value.length > 1_000_000) throw new Error("body_too_large"); }
  return value ? JSON.parse(value) : {};
}
function authorized(req) { return INTERNAL_SECRET && req.headers.authorization === `Bearer ${INTERNAL_SECRET}`; }
function launchShape(row) { return { id: row.id, name: row.name, ticker: row.ticker, imageUrl: row.image_url, creatorHandle: row.creator_handle, pairSymbol: row.pair_symbol, pairLogo: row.pair_logo, status: row.status, contractAddress: row.contract_address, sourceUrl: row.source_url, liveUrl: row.live_url, createdAt: row.created_at, reason: row.rejection_reason, testMode: row.test_mode }; }

async function addActivity(client, launchId, key, message, status) {
  await client.query("INSERT INTO activity (launch_id,event_key,message,status) VALUES ($1,$2,$3,$4) ON CONFLICT (launch_id,event_key) DO NOTHING", [launchId,key,message,status]);
}

async function ingest(payload) {
  const postId = String(payload.postId || ""); const sourceUrl = String(payload.sourceUrl || ""); const creator = String(payload.creatorHandle || "").replace(/^@/, ""); const text = String(payload.text || "");
  const images = Array.isArray(payload.images) ? payload.images.filter(Boolean) : [];
  if (!/^\d{5,30}$/.test(postId) || !/^https:\/\/(x\.com|twitter\.com)\//i.test(sourceUrl) || !creator || !text) throw Object.assign(new Error("Invalid post payload."), { status: 400 });
  const parsed = parsePost(text, AGENT_HANDLE);
  let reason = !parsed.ok ? parsed.reason : images.length !== 1 ? "Post must include exactly one image." : null;
  let pair = null;
  if (!reason) { pair = byPair.get(parsed.value.pair.toLowerCase()) || byPair.get(parsed.value.pair); if (!pair) reason = `Unsupported OTC pair: ${parsed.value.pair}.`; }
  const name = parsed.ok ? parsed.value.name : null; const ticker = parsed.ok ? parsed.value.ticker : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`INSERT INTO launches (source_post_id,source_url,creator_handle,source_text,image_url,name,ticker,pair_symbol,pair_mint,pair_logo,status,rejection_reason,test_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (source_post_id) DO NOTHING RETURNING *`, [postId,sourceUrl,creator,text,images[0]||null,name,ticker,pair?.symbol||null,pair?.mint||null,pair?.logo||null,reason?"rejected":"processing",reason,MODE==="test"]);
    if (!inserted.rowCount) { await client.query("ROLLBACK"); const existing = await pool.query("SELECT * FROM launches WHERE source_post_id=$1",[postId]); return { duplicate:true, launch:launchShape(existing.rows[0]) }; }
    const row=inserted.rows[0]; await addActivity(client,row.id,"detected",`Detected @${creator}'s launch request for ${ticker ? "$"+ticker : "an invalid token"}.`,"processing");
    if (reason) await addActivity(client,row.id,"rejected",reason,"rejected"); else await addActivity(client,row.id,"validated",`${pair.symbol} matched OTC's official supported-pair catalog.`,"processing");
    await client.query("COMMIT"); return { duplicate:false, launch:launchShape(row) };
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function executeLaunch(row) {
  if (MODE === "test") {
    const digest = createHash("sha256").update(`${row.source_post_id}:${row.pair_mint}`).digest("hex").slice(0,40);
    return { contractAddress:`test_${digest}`, liveUrl:`https://otcdesks.cash/launcher?simulation=${row.source_post_id}` };
  }
  return launchOnOtc(row);
}

let processing=false;
async function workQueue() {
  if(processing) return; processing=true; const client=await pool.connect(); let row;
  try { await client.query("BEGIN"); const found=await client.query("SELECT * FROM launches WHERE status='processing' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"); row=found.rows[0]; if(row) await client.query("UPDATE launches SET launch_attempts=launch_attempts+1,updated_at=now() WHERE id=$1",[row.id]); await client.query("COMMIT"); }
  catch(error){await client.query("ROLLBACK"); console.error("queue_claim_failed",error);} finally{client.release();}
  if(!row){processing=false;return;}
  try { const result=await executeLaunch(row); const updated=await pool.query("UPDATE launches SET status='completed',contract_address=$2,live_url=$3,reply_status='pending',updated_at=now() WHERE id=$1 AND status='processing' RETURNING *",[row.id,result.contractAddress,result.liveUrl]); if(updated.rowCount) await addActivity(pool,row.id,"completed",`${row.ticker} completed on ${row.pair_symbol}.`,"completed"); }
  catch(error){ const attempts=row.launch_attempts+1; if(attempts>=5){await pool.query("UPDATE launches SET status='rejected',rejection_reason=$2,updated_at=now() WHERE id=$1",[row.id,error.message]);await addActivity(pool,row.id,"launch_failed",`Launch failed after ${attempts} attempts: ${error.message}`,"rejected");}else{const delay=Math.min(300,2**attempts*5);await pool.query("UPDATE launches SET next_attempt_at=now()+($2||' seconds')::interval,updated_at=now() WHERE id=$1",[row.id,String(delay)]);}}
  finally{processing=false;}
}
setInterval(()=>workQueue().catch(console.error),2000);
setInterval(()=>pool.query("UPDATE launches SET reply_status='pending',updated_at=now() WHERE reply_status='sending' AND updated_at < now()-interval '5 minutes'").catch(console.error),60000);

const server=http.createServer(async(req,res)=>{
  try {
    if(req.method==="OPTIONS") return json(res,204,{});
    const url=new URL(req.url,"http://local");
    if(req.method==="GET"&&url.pathname==="/health"){await pool.query("SELECT 1");return json(res,200,{ok:true,mode:MODE,pairs:pairs.length,wallet:await otcWalletStatus(),time:new Date().toISOString()});}
    if(req.method==="GET"&&url.pathname==="/v1/pairs") return json(res,200,{pairs});
    if(req.method==="GET"&&url.pathname==="/v1/public/snapshot") { const [launches,events,hb]=await Promise.all([pool.query("SELECT * FROM launches ORDER BY created_at DESC LIMIT 50"),pool.query("SELECT id,message,status,created_at FROM activity ORDER BY created_at DESC LIMIT 100"),pool.query("SELECT * FROM listener_heartbeats ORDER BY last_seen_at DESC LIMIT 1")]); const last=hb.rows[0]; return json(res,200,{mode:MODE,listener:{ok:!!last&&Date.now()-new Date(last.last_seen_at).getTime()<90000,lastHeartbeat:last?.last_seen_at},backend:{ok:true},launches:launches.rows.map(launchShape),activity:events.rows.map(e=>({id:String(e.id),message:e.message,status:e.status,at:e.created_at}))}); }
    if(!authorized(req)) return json(res,401,{error:"unauthorized"});
    if(req.method==="POST"&&url.pathname==="/v1/internal/ingest") return json(res,200,await ingest(await body(req)));
    if(req.method==="POST"&&url.pathname==="/v1/internal/heartbeat") { const p=await body(req); await pool.query("INSERT INTO listener_heartbeats (listener_id,agent_handle,version,last_seen_at,detail) VALUES ($1,$2,$3,now(),$4) ON CONFLICT (listener_id) DO UPDATE SET agent_handle=excluded.agent_handle,version=excluded.version,last_seen_at=now(),detail=excluded.detail",[String(p.listenerId||"mac-primary"),AGENT_HANDLE,String(p.version||"unknown"),p.detail||{}]); return json(res,200,{ok:true}); }
    if(req.method==="POST"&&url.pathname==="/v1/internal/replies/next") { const c=await pool.connect(); try{await c.query("BEGIN");const q=await c.query("SELECT * FROM launches WHERE reply_status='pending' ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1");const row=q.rows[0];if(row)await c.query("UPDATE launches SET reply_status='sending',reply_attempts=reply_attempts+1,updated_at=now() WHERE id=$1",[row.id]);await c.query("COMMIT");return json(res,200,{reply:row?{launchId:row.id,sourcePostId:row.source_post_id,sourceUrl:row.source_url,text:`Launched $${row.ticker} paired with ${row.pair_symbol}. ${row.live_url}`}:null});}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
    if(req.method==="POST"&&url.pathname==="/v1/internal/replies/ack") { const p=await body(req); const q=await pool.query("UPDATE launches SET reply_status='sent',reply_post_id=$2,reply_error=null,updated_at=now() WHERE id=$1 AND reply_status='sending' RETURNING *",[p.launchId,String(p.replyPostId||"")]); if(q.rowCount)await addActivity(pool,p.launchId,"replied","Posted the single launch reply on X.","completed");return json(res,200,{ok:!!q.rowCount}); }
    if(req.method==="POST"&&url.pathname==="/v1/internal/replies/fail") { const p=await body(req); await pool.query("UPDATE launches SET reply_status=CASE WHEN reply_attempts>=5 THEN 'sent' ELSE 'pending' END,reply_error=$2,updated_at=now() WHERE id=$1 AND reply_status='sending'",[p.launchId,String(p.error||"reply failed")]);return json(res,200,{ok:true}); }
    return json(res,404,{error:"not_found"});
  } catch(error){console.error("request_failed",error);return json(res,error.status||500,{error:error.message||"internal_error"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log(JSON.stringify({event:"backend_started",port:PORT,mode:MODE,pairs:pairs.length})));
