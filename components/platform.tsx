"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Check, Clock3, Copy, HeartPulse, Search, ShieldCheck, XCircle, Zap } from "lucide-react";
import { pairs, type PairCategory } from "@/lib/pairs";

type Section = "launches" | "pairs" | "activity" | "how";
type Launch = {
  id: string; name: string; ticker: string; imageUrl?: string; creatorHandle: string;
  pairSymbol: string; pairLogo?: string; status: "processing" | "completed" | "rejected";
  contractAddress?: string; sourceUrl: string; liveUrl?: string; createdAt: string;
  reason?: string; testMode?: boolean;
};
type Snapshot = {
  mode: "test" | "live";
  listener: { ok: boolean; lastHeartbeat?: string };
  backend: { ok: boolean };
  launches: Launch[];
  activity: { id: string; message: string; status: string; at: string }[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "https://api-production-5483.up.railway.app";
const nav: { key: Section; label: string; href: string }[] = [
  { key: "launches", label: "Launches", href: "/" },
  { key: "pairs", label: "Supported pairs", href: "/supported-pairs" },
  { key: "activity", label: "Activity", href: "/activity" },
  { key: "how", label: "How to post", href: "/how-to-post" },
];
const emptySnapshot: Snapshot = { mode: "test", listener: { ok: false }, backend: { ok: false }, launches: [], activity: [] };

function StatusPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-3 py-2 text-sm font-medium text-[#263329]"><span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />{children}</span>;
}

function Shell({ section, snapshot, children }: { section: Section; snapshot: Snapshot; children: React.ReactNode }) {
  return <div className="min-h-screen">
    <header className="sticky top-0 z-30 border-b border-black/8 bg-[#f5f7f5]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 sm:px-8">
        <a href="/" className="flex items-center gap-3" aria-label="OTC X Launcher home">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#163f2a] text-lg font-black text-[#d7ff67]">O</span>
          <span><b className="block leading-none">OTC X</b><span className="text-sm text-[#69736b]">Launcher</span></span>
        </a>
        <nav className="hidden items-center gap-1 rounded-full border border-black/8 bg-white p-1 md:flex">
          {nav.map((item) => <a key={item.key} href={item.href} className={`rounded-full px-4 py-2 text-sm font-semibold ${section === item.key ? "bg-[#163f2a] text-white" : "text-[#657067] hover:bg-[#edf1ee]"}`}>{item.label}</a>)}
        </nav>
        <span className="rounded-full bg-[#d7ff67] px-3 py-2 text-xs font-black uppercase tracking-[.12em] text-[#163f2a]">{snapshot.mode} mode</span>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
        {nav.map((item) => <a key={item.key} href={item.href} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${section === item.key ? "bg-[#163f2a] text-white" : "bg-white text-[#657067]"}`}>{item.label}</a>)}
      </nav>
    </header>
    {children}
    <footer className="mx-auto flex max-w-[1440px] flex-col gap-3 border-t border-black/8 px-4 py-8 text-sm text-[#69736b] sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>Independent automation layer for OTC’s official launcher.</span><a className="font-semibold text-[#163f2a]" href="https://otcdesks.cash/docs" target="_blank" rel="noreferrer">OTC protocol docs <ArrowUpRight className="inline h-4 w-4" /></a></footer>
  </div>;
}

function LaunchCard({ launch }: { launch: Launch }) {
  const pair = pairs.find((item) => item.symbol.toLowerCase() === launch.pairSymbol.toLowerCase());
  const styles = launch.status === "completed" ? "bg-emerald-50 text-emerald-700" : launch.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <article className="group grid gap-5 rounded-[24px] border border-black/8 bg-white p-4 shadow-[0_14px_50px_rgba(22,63,42,.05)] sm:grid-cols-[88px_1fr_auto] sm:p-5">
    <div className="h-[88px] w-[88px] overflow-hidden rounded-2xl bg-[#edf1ee]">{launch.imageUrl ? <img className="h-full w-full object-cover" src={launch.imageUrl} alt="" /> : <div className="grid h-full place-items-center text-2xl font-black text-[#163f2a]">{launch.ticker.slice(0,2)}</div>}</div>
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-xl font-black tracking-tight">{launch.name}</h3><span className="text-sm font-bold text-[#69736b]">${launch.ticker}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${styles}`}>{launch.status}</span>{launch.testMode && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">simulation</span>}</div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-[#69736b]"><span>by @{launch.creatorHandle}</span><span className="flex items-center gap-1.5">paired with <img src={launch.pairLogo || pair?.logo} alt="" className="h-5 w-5 rounded-full" /> <b className="text-[#163f2a]">{launch.pairSymbol}</b></span></div>
      {launch.contractAddress && <button className="mt-3 flex max-w-full items-center gap-2 rounded-lg bg-[#f2f5f2] px-3 py-2 font-mono text-xs text-[#4d5850]" onClick={() => navigator.clipboard.writeText(launch.contractAddress!)}><span className="truncate">{launch.contractAddress}</span><Copy className="h-3.5 w-3.5 shrink-0" /></button>}
      {launch.reason && <p className="mt-3 text-sm text-red-700">{launch.reason}</p>}
    </div>
    <div className="flex items-end gap-2 sm:flex-col sm:justify-between"><span className="text-xs text-[#7b847d]">{new Date(launch.createdAt).toLocaleString()}</span><div className="flex gap-2">{launch.sourceUrl && <a className="rounded-xl border border-black/10 px-3 py-2 text-sm font-bold" href={launch.sourceUrl} target="_blank" rel="noreferrer">Post</a>}{launch.liveUrl && <a className="rounded-xl bg-[#163f2a] px-3 py-2 text-sm font-bold text-white" href={launch.liveUrl} target="_blank" rel="noreferrer">Open <ArrowUpRight className="inline h-4 w-4" /></a>}</div></div>
  </article>;
}

function Launches({ snapshot }: { snapshot: Snapshot }) {
  return <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-12">
    <section className="noise overflow-hidden rounded-[30px] bg-[#163f2a] p-6 text-white sm:p-10">
      <div className="grid gap-10 lg:grid-cols-[1.25fr_.75fr]">
        <div><span className="mb-5 inline-flex rounded-full bg-white/10 px-3 py-2 text-sm font-bold text-[#d7ff67]">Post on X. Launch on OTC.</span><h1 className="max-w-3xl text-4xl font-black leading-[1.02] tracking-[-.045em] sm:text-6xl">Tokens paired with stocks, pre-IPO assets, and crypto.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-white/68">Tag the agent with a name, ticker, image, and supported pair. The listener validates the post, launches through OTC, and replies with one verified link.</p></div>
        <div className="rounded-[24px] border border-white/12 bg-white/7 p-5 backdrop-blur"><p className="text-xs font-bold uppercase tracking-[.16em] text-white/50">Live system</p><div className="mt-4 flex flex-wrap gap-2"><StatusPill ok={snapshot.listener.ok}>X listener</StatusPill><StatusPill ok={snapshot.backend.ok}>Backend</StatusPill></div><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-black/14 p-4"><b className="text-3xl">{pairs.length}</b><span className="mt-1 block text-sm text-white/55">supported pairs</span></div><div className="rounded-2xl bg-black/14 p-4"><b className="text-3xl">{snapshot.launches.length}</b><span className="mt-1 block text-sm text-white/55">launches tracked</span></div></div></div>
      </div>
    </section>
    <div className="mt-10 flex items-end justify-between gap-4"><div><p className="text-sm font-black uppercase tracking-[.14em] text-[#6d766f]">Automatic feed</p><h2 className="mt-1 text-3xl font-black tracking-tight">Latest launches</h2></div><a href="/how-to-post" className="hidden rounded-xl bg-[#d7ff67] px-4 py-3 text-sm font-black text-[#163f2a] sm:block">Post format</a></div>
    <div className="mt-5 grid gap-4">{snapshot.launches.length ? snapshot.launches.map((launch) => <LaunchCard key={launch.id} launch={launch} />) : <div className="rounded-[24px] border border-dashed border-[#b9c3bb] bg-white/55 px-6 py-14 text-center"><Clock3 className="mx-auto h-7 w-7 text-[#7d887f]" /><h3 className="mt-3 text-lg font-black">Waiting for the first test post</h3><p className="mt-1 text-[#69736b]">New detected posts will appear here without a pasted link.</p></div>}</div>
  </main>;
}

function PairsDirectory() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | PairCategory>("All");
  const shown = useMemo(() => pairs.filter((p) => (category === "All" || p.category === category) && `${p.symbol} ${p.name} ${p.mint}`.toLowerCase().includes(query.toLowerCase())), [category, query]);
  return <main className="mx-auto max-w-[1440px] px-4 py-9 sm:px-8 sm:py-12"><div className="max-w-3xl"><p className="text-sm font-black uppercase tracking-[.14em] text-[#6d766f]">Official live catalog</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl">Supported pairs</h1><p className="mt-4 text-lg leading-8 text-[#667067]">Validated from OTC’s launcher. Pair by ticker or exact mint address.</p></div>
    <div className="sticky top-[76px] z-20 mt-8 rounded-2xl border border-black/8 bg-[#f5f7f5]/92 p-3 backdrop-blur"><div className="flex flex-col gap-3 sm:flex-row"><label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-black/8 bg-white px-4"><Search className="h-5 w-5 text-[#7a847c]" /><input className="h-12 w-full outline-none" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search ticker, name, or mint" /></label><div className="flex gap-2 overflow-x-auto">{(["All","xStocks","Backpack","Crypto"] as const).map((c)=><button key={c} onClick={()=>setCategory(c)} className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold ${category===c?"bg-[#163f2a] text-white":"bg-white text-[#5d675f]"}`}>{c}</button>)}</div></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{shown.map((pair)=><article key={pair.mint} className="rounded-2xl border border-black/8 bg-white p-4"><div className="flex items-center gap-3"><img src={pair.logo} alt="" className="h-11 w-11 rounded-full border border-black/5 object-cover" /><div className="min-w-0"><b className="block text-lg">{pair.symbol}</b><span className="block truncate text-sm text-[#707a72]">{pair.name}</span></div><span className="ml-auto rounded-full bg-[#edf1ee] px-2 py-1 text-xs font-bold text-[#627066]">{pair.category}</span></div><button onClick={()=>navigator.clipboard.writeText(pair.mint)} className="mt-4 flex w-full items-center gap-2 rounded-xl bg-[#f3f6f3] px-3 py-2 text-left font-mono text-xs text-[#667067]"><span className="truncate">{pair.mint}</span><Copy className="ml-auto h-3.5 w-3.5 shrink-0" /></button></article>)}</div>
  </main>;
}

function ActivityView({ snapshot }: { snapshot: Snapshot }) {
  const icon = (s:string) => s === "completed" ? <Check className="h-4 w-4"/> : s === "rejected" ? <XCircle className="h-4 w-4"/> : <Clock3 className="h-4 w-4"/>;
  return <main className="mx-auto max-w-5xl px-4 py-9 sm:px-8 sm:py-12"><p className="text-sm font-black uppercase tracking-[.14em] text-[#6d766f]">Listener timeline</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl">Activity</h1><div className="mt-8 overflow-hidden rounded-[24px] border border-black/8 bg-white">{snapshot.activity.length ? snapshot.activity.map((item)=><div key={item.id} className="flex gap-4 border-b border-black/6 p-5 last:border-0"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf1ee] text-[#163f2a]">{icon(item.status)}</span><div><p className="font-semibold">{item.message}</p><p className="mt-1 text-sm text-[#748078]">{new Date(item.at).toLocaleString()}</p></div></div>) : <div className="px-6 py-16 text-center"><Activity className="mx-auto h-7 w-7 text-[#748078]"/><p className="mt-3 font-bold">No listener events yet</p></div>}</div></main>;
}

function HowToPost() {
  const steps: [typeof Zap,string,string][] = [[Zap,"Detected automatically","The listener watches the agent’s mentions. Do not paste the post link anywhere."],[ShieldCheck,"Validated first","Unsupported pairs, missing images, and duplicate posts are rejected safely."],[HeartPulse,"One reply only","A database lock prevents duplicate launches and duplicate success replies."]];
  return <main className="mx-auto grid max-w-[1200px] gap-8 px-4 py-9 sm:px-8 sm:py-12 lg:grid-cols-[.85fr_1.15fr]"><section><p className="text-sm font-black uppercase tracking-[.14em] text-[#6d766f]">Four fields. One image.</p><h1 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-5xl">How to post</h1><p className="mt-5 text-lg leading-8 text-[#667067]">Use the exact agent handle, keep each field on its own line, and attach exactly one image. Pair tickers are matched case-insensitively against the official 93-pair catalog.</p><div className="mt-8 space-y-4">{steps.map(([Icon,title,copy])=><div key={title} className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#d7ff67] text-[#163f2a]"><Icon className="h-5 w-5"/></span><div><h2 className="font-black">{title}</h2><p className="mt-1 leading-7 text-[#6b756d]">{copy}</p></div></div>)}</div></section><section className="rounded-[28px] bg-[#163f2a] p-5 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[.15em] text-white/50">Copy this format</p><pre className="mt-5 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-black/20 p-5 font-mono text-sm leading-8 text-[#eaffb3]">{`@AGENT_HANDLE launch\nName: Future Apple\nTicker: FAPL\nPair: AAPLx\n\n[attach exactly one image]`}</pre><div className="mt-6 rounded-2xl border border-white/12 p-5"><h2 className="font-black">Accepted</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-white/65"><li>• Name: 1–32 characters</li><li>• Ticker: 1–13 letters or numbers</li><li>• Pair: exact supported ticker or mint</li><li>• Image: one attached JPG, PNG, or WebP</li></ul></div><p className="mt-5 text-sm leading-6 text-white/55">The agent replies only after OTC returns a confirmed launch. Rejected posts are visible in Activity with a clear reason.</p></section></main>;
}

export function Platform({ section }: { section: Section }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  useEffect(() => { let live = true; const load = async () => { if (!API) return; try { const response = await fetch(`${API}/v1/public/snapshot`, { cache: "no-store" }); if (response.ok && live) setSnapshot(await response.json()); } catch {} }; load(); const timer = setInterval(load, 15000); return () => { live = false; clearInterval(timer); }; }, []);
  return <Shell section={section} snapshot={snapshot}>{section === "launches" ? <Launches snapshot={snapshot}/> : section === "pairs" ? <PairsDirectory/> : section === "activity" ? <ActivityView snapshot={snapshot}/> : <HowToPost/>}</Shell>;
}
