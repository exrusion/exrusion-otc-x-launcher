import http from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(here,"../..");
const STORAGE=resolve(ROOT,"runtime");
const SEEN=resolve(STORAGE,"seen-posts.json");
const REPLIED=resolve(STORAGE,"replied-posts.json");
const BACKEND=(process.env.BACKEND_URL||"").replace(/\/$/,"");
const SECRET=process.env.INTERNAL_SECRET||"";
const HANDLE=(process.env.AGENT_HANDLE||"").replace(/^@/,"");
const CDP_URL=process.env.CHROME_CDP_URL||"http://127.0.0.1:9337";
const LOCAL_PORT=Number(process.env.LOCAL_API_PORT||8799);
const POLL_MS=Number(process.env.POLL_MS||15000);
if(!BACKEND||!SECRET||!HANDLE) throw new Error("BACKEND_URL, INTERNAL_SECRET and AGENT_HANDLE are required");
await mkdir(STORAGE,{recursive:true});

async function readJournal(path){try{return JSON.parse(await readFile(path,"utf8"));}catch{return {};}}
async function writeJournal(path,value){const tmp=`${path}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,path);}
const seen=await readJournal(SEEN); const replied=await readJournal(REPLIED);
async function api(path,payload={}){const response=await fetch(`${BACKEND}${path}`,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${SECRET}`},body:JSON.stringify(payload)});if(!response.ok)throw new Error(`${path} returned ${response.status}: ${await response.text()}`);return response.json();}

let browser; let page; let healthy=false; let lastPoll=null; let lastError=null;
async function connect(){browser=await chromium.connectOverCDP(CDP_URL);const context=browser.contexts()[0];if(!context)throw new Error("Isolated Chrome context is unavailable");page=context.pages().find(p=>p.url().includes("x.com"))||await context.newPage();return page;}
async function ensureMentions(){if(!page||page.isClosed())await connect();const expected="/notifications/mentions";if(!page.url().includes(expected)){await page.goto(`https://x.com${expected}`,{waitUntil:"domcontentloaded",timeout:30000});}if(/\/i\/flow\/login|\/login/.test(page.url()))throw new Error("The isolated X profile is not signed in");await page.waitForSelector('article[data-testid="tweet"]',{timeout:20000});}
async function collectMentions(){await ensureMentions();return page.locator('article[data-testid="tweet"]').evaluateAll((articles,handle)=>articles.map(article=>{const status=[...article.querySelectorAll('a[href*="/status/"]')].map(a=>a.getAttribute("href")).find(Boolean);const match=status?.match(/\/([^/]+)\/status\/(\d+)/);const text=article.querySelector('[data-testid="tweetText"]')?.textContent||"";const images=[...new Set([...article.querySelectorAll('img[src*="pbs.twimg.com/media"]')].map(i=>i.src.split("&name=")[0]+"&name=orig"))];return match?{postId:match[2],sourceUrl:`https://x.com${status.split("?")[0]}`,creatorHandle:match[1],text,images}:null;}).filter(x=>x&&new RegExp(`@${handle}\\b`,"i").test(x.text)&&/\blaunch\b/i.test(x.text)),HANDLE);}

async function ingestNew(){const posts=await collectMentions();for(const post of posts.reverse()){if(seen[post.postId])continue;const result=await api("/v1/internal/ingest",post);seen[post.postId]={at:new Date().toISOString(),duplicate:result.duplicate,status:result.launch.status};await writeJournal(SEEN,seen);console.log(JSON.stringify({event:"post_ingested",postId:post.postId,status:result.launch.status,duplicate:result.duplicate}));}}
async function sendReply(job){if(replied[job.sourcePostId]){await api("/v1/internal/replies/ack",{launchId:job.launchId,replyPostId:replied[job.sourcePostId].replyPostId||"journaled"});return;}
  await page.goto(job.sourceUrl,{waitUntil:"domcontentloaded",timeout:30000});const article=page.locator('article[data-testid="tweet"]').first();await article.waitFor({state:"visible",timeout:20000});await article.locator('[data-testid="reply"]').click();const composer=page.locator('[data-testid="tweetTextarea_0"]');await composer.fill(job.text);await page.locator('[data-testid="tweetButton"]').click();await page.waitForTimeout(2500);replied[job.sourcePostId]={at:new Date().toISOString(),replyPostId:"posted"};await writeJournal(REPLIED,replied);await api("/v1/internal/replies/ack",{launchId:job.launchId,replyPostId:"posted"});console.log(JSON.stringify({event:"reply_posted",postId:job.sourcePostId}));
}
async function processReply(){const {reply}=await api("/v1/internal/replies/next");if(!reply)return;try{await sendReply(reply);}catch(error){await api("/v1/internal/replies/fail",{launchId:reply.launchId,error:error.message}).catch(()=>{});throw error;}}
async function heartbeat(){await api("/v1/internal/heartbeat",{listenerId:"mac-primary",version:"0.1.0",detail:{healthy,lastPoll,lastError,cdp:CDP_URL}});}
async function cycle(){try{await ingestNew();await processReply();healthy=true;lastError=null;lastPoll=new Date().toISOString();}catch(error){healthy=false;lastError=error.message;console.error(JSON.stringify({event:"cycle_failed",error:error.message}));if(page?.isClosed())page=null;}await heartbeat().catch(e=>console.error(JSON.stringify({event:"heartbeat_failed",error:e.message})));}

http.createServer((req,res)=>{if(req.url!=="/health"){res.writeHead(404);return res.end();}res.writeHead(healthy?200:503,{"content-type":"application/json"});res.end(JSON.stringify({ok:healthy,agentHandle:HANDLE,lastPoll,lastError,pid:process.pid}));}).listen(LOCAL_PORT,"127.0.0.1");
await connect();await cycle();setInterval(cycle,POLL_MS);
console.log(JSON.stringify({event:"listener_started",handle:HANDLE,cdp:CDP_URL,localPort:LOCAL_PORT,pollMs:POLL_MS}));
