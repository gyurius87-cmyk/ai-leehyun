// 유명인 포트폴리오: 미국 SEC 13F(분기, 45일 늦음) + ARK(매일 공개)
// 매일 아침 cron에서 새 공시가 있는지만 보고, 바뀐 것만 다시 받음.
import Anthropic from "@anthropic-ai/sdk";
import { redis } from "./_redis.js";
import { recordUsage } from "./_usage.js";

// SEC는 연락처가 담긴 User-Agent를 요구함 (Vercel env SEC_UA로 바꿀 수 있음)
const SEC_UA = { "User-Agent": process.env.SEC_UA || "AI-leehyun personal research tool (ai-leehyun.vercel.app)", Accept: "application/json, text/xml, */*" };
const BROWSER = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const FAMOUS = [
  { id: "buffett", who: "워런 버핏", fund: "버크셔 해서웨이", cik: 1067983, note: "가치투자의 상징. 애플·은행·에너지 위주" },
  { id: "druckenmiller", who: "스탠리 드러켄밀러", fund: "듀케인 패밀리 오피스", cik: 1536411, note: "매크로 트레이더. 분기마다 크게 갈아타요" },
  { id: "dalio", who: "레이 달리오", fund: "브리지워터", cik: 1350694, note: "세계 최대 헤지펀드. ETF로 넓게 분산" },
  { id: "burry", who: "마이클 버리", fund: "사이언 에셋", cik: 1649339, note: "'빅쇼트'의 주인공. 풋옵션도 자주 써요" },
  { id: "ackman", who: "빌 애크먼", fund: "퍼싱 스퀘어", cik: 1336528, note: "10개 안팎만 집중 보유" },
  { id: "lilu", who: "리루", fund: "히말라야 캐피털", cik: 1709323, note: "멍거가 돈을 맡긴 가치투자자" },
  { id: "nps", who: "국민연금", fund: "국민연금공단 (미국 주식)", cik: 1608046, note: "우리 국민연금이 미국에서 뭘 샀나" },
  { id: "ark", who: "캐시 우드", fund: "ARK 이노베이션 ETF (ARKK)", ark: "ARK_INNOVATION_ETF_ARKK_HOLDINGS", note: "매일 보유 종목을 공개해요" },
];

const pad = (n) => String(n).padStart(10, "0");
async function secJson(url) { const r = await fetch(url, { headers: SEC_UA }); if (!r.ok) throw new Error(`sec ${r.status}`); return r.json(); }
async function secText(url) { const r = await fetch(url, { headers: SEC_UA }); if (!r.ok) throw new Error(`sec ${r.status}`); return r.text(); }

// 13F 정보표 XML → 종목 목록 (같은 종목이 여러 줄이면 합침)
export function parseInfoTable(xml) {
  const tag = (blk, t) => { const m = blk.match(new RegExp(`<(?:\\w+:)?${t}>([\\s\\S]*?)</(?:\\w+:)?${t}>`, "i")); return m ? m[1].trim() : ""; };
  const by = new Map();
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi)) {
    const b = m[1], cusip = tag(b, "cusip").toUpperCase(), pc = tag(b, "putCall"), k = cusip + "|" + pc;
    const o = by.get(k) || { n: tag(b, "nameOfIssuer").replace(/&amp;/g, "&"), cls: tag(b, "titleOfClass"), cusip, pc, val: 0, sh: 0 };
    o.val += +tag(b, "value") || 0; o.sh += +tag(b, "sshPrnamt") || 0; by.set(k, o);
  }
  return [...by.values()].sort((a, b) => b.val - a.val);
}

async function filing13F(cik, acc) {
  const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}`;
  const idx = await secJson(`${dir}/index.json`); await sleep(150);
  const xmls = (idx?.directory?.item || []).map((x) => x.name).filter((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  for (const n of xmls) { const t = await secText(`${dir}/${n}`); await sleep(150); if (/infoTable/i.test(t)) return parseInfoTable(t); }
  return [];
}

// 지난 분기와 비교해서 새로 산 것 / 늘린 것 / 줄인 것 / 다 판 것
function diff(cur, prev) {
  if (!prev) return { rows: cur.map((r) => ({ ...r, ch: null })), sold: [] };
  const pm = new Map(prev.map((r) => [r.cusip + "|" + r.pc, r]));
  const rows = cur.map((r) => { const p = pm.get(r.cusip + "|" + r.pc); pm.delete(r.cusip + "|" + r.pc); return { ...r, ch: !p ? "new" : p.sh ? Math.round(((r.sh - p.sh) / p.sh) * 1000) / 10 : null }; });
  return { rows, sold: [...pm.values()].sort((a, b) => b.val - a.val).slice(0, 30).map(({ n, cls, cusip, pc, val, sh }) => ({ n, cls, cusip, pc, val, sh })) };
}

async function refresh13F(f, force) {
  const [c] = await redis([["GET", "stk:fam:" + f.id]]); const old = json(c);
  const sub = await secJson(`https://data.sec.gov/submissions/CIK${pad(f.cik)}.json`); await sleep(150);
  const R = sub?.filings?.recent || {}, list = [];
  (R.form || []).forEach((form, i) => { if (form === "13F-HR") list.push({ acc: R.accessionNumber[i], filed: R.filingDate[i], period: R.reportDate[i] }); });
  if (!list.length) throw new Error("no 13F");
  if (!force && old?.acc === list[0].acc && old.hist) return old;
  const cur = await filing13F(f.cik, list[0].acc), prev = list[1] ? await filing13F(f.cik, list[1].acc) : null;
  const total = cur.reduce((t, r) => t + r.val, 0), d = diff(cur, prev);
  const out = { id: f.id, kind: "13f", secName: sub.name, acc: list[0].acc, filed: list[0].filed, period: list[0].period, prevPeriod: list[1]?.period || null, total, count: cur.length, rows: d.rows.slice(0, 60), sold: d.sold, hist: list.slice(0, 12), at: Date.now() };
  await redis([["SET", "stk:fam:" + f.id, JSON.stringify(out)]]);
  return out;
}

// ARK CSV: date,fund,company,ticker,cusip,shares,"market value ($)","weight (%)"
function parseArkCsv(t) {
  const lines = t.trim().split(/\r?\n/), split = (l) => { const o = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o.map((s) => s.trim()); };
  const h = split(lines[0]).map((s) => s.toLowerCase()), ix = (k) => h.findIndex((x) => x.startsWith(k));
  const [iD, iC, iT, iS, iV, iW] = ["date", "company", "ticker", "shares", "market value", "weight"].map(ix);
  const num = (s) => +String(s || "").replace(/[$,%\s]/g, "") || 0;
  const rows = lines.slice(1).map(split).filter((r) => r[iC] && r[iD] && /\d/.test(r[iD])).map((r) => ({ d: r[iD], n: r[iC], t: r[iT], sh: num(r[iS]), val: num(r[iV]), w: num(r[iW]) }));
  const [m, d, y] = (rows[0]?.d || "").split("/"); return { day: y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : rows[0]?.d, rows };
}
async function refreshArk(f) {
  const [c] = await redis([["GET", "stk:fam:" + f.id]]); const old = json(c);
  const r = await fetch(`https://assets.ark-funds.com/fund-documents/funds-etf-csv/${f.ark}.csv`, { headers: BROWSER }); if (!r.ok) throw new Error("ark " + r.status);
  const p = parseArkCsv(await r.text()); if (!p.rows.length) throw new Error("ark empty");
  if (old?.day === p.day) return old;
  const pm = new Map((old?.raw || []).map((x) => [x.t || x.n, x]));
  const rows = p.rows.sort((a, b) => b.val - a.val).map((x) => { const q = pm.get(x.t || x.n); pm.delete(x.t || x.n); return { n: x.n, t: x.t, sh: x.sh, val: x.val, w: x.w, ch: !old ? null : !q ? "new" : q.sh ? Math.round(((x.sh - q.sh) / q.sh) * 1000) / 10 : null }; });
  const out = { id: f.id, kind: "ark", day: p.day, prevDay: old?.day || null, total: rows.reduce((t, x) => t + x.val, 0), count: rows.length, rows, sold: old ? [...pm.values()].map(({ n, t, sh, val }) => ({ n, t, sh, val })) : [], raw: p.rows.map(({ n, t, sh }) => ({ n, t, sh })), at: Date.now() };
  await redis([["SET", "stk:fam:" + f.id, JSON.stringify(out)]]);
  return out;
}

// 전체 새로고침 (cron 또는 버튼). 하나가 실패해도 나머지는 계속.
export async function famousRefresh(force) {
  const res = {};
  for (const f of FAMOUS) { try { const o = f.ark ? await refreshArk(f) : await refresh13F(f, force); res[f.id] = o.acc || o.day; } catch (e) { res[f.id] = "err:" + String(e?.message || e).slice(0, 60); } }
  await redis([["SET", "stk:fam:at", String(Date.now())]]);
  return res;
}
export async function famousAll() {
  const vals = await redis([...FAMOUS.map((f) => ["GET", "stk:fam:" + f.id]), ["GET", "stk:fam:at"]]);
  const at = +vals.pop() || 0;
  const ds = FAMOUS.map((f, i) => { const d = json(vals[i]); if (d) delete d.raw; return d; });
  const M = await koMap(ds.flatMap((d) => [...(d?.rows || []), ...(d?.sold || [])].map((r) => r.n)));
  ds.forEach((d) => { if (!d) return; d.rows.forEach((r) => (r.ko = M[r.n] || "")); (d.sold || []).forEach((r) => (r.ko = M[r.n] || "")); });
  return { at, list: FAMOUS.map((f, i) => ({ ...f, data: ds[i] })) };
}

// 지난 분기 보기: 그 분기 공시 + 바로 전 분기와 비교 (한 번 받으면 계속 저장)
export async function famQuarter(id, acc) {
  const f = FAMOUS.find((x) => x.id === id); if (!f?.cik) return null;
  const ck = `stk:famq:${id}:${acc}`, [c, l] = await redis([["GET", ck], ["GET", "stk:fam:" + id]]); const hit = json(c); if (hit) return withKo(hit);
  const hist = json(l)?.hist || [], i = hist.findIndex((h) => h.acc === acc); if (i < 0) return null;
  const cur = await filing13F(f.cik, acc), prev = hist[i + 1] ? await filing13F(f.cik, hist[i + 1].acc) : null;
  const total = cur.reduce((t, r) => t + r.val, 0), d = diff(cur, prev);
  const out = { id, kind: "13f", acc, filed: hist[i].filed, period: hist[i].period, prevPeriod: hist[i + 1]?.period || null, total, count: cur.length, rows: d.rows.slice(0, 60), sold: d.sold, past: true, at: Date.now() };
  await redis([["SET", ck, JSON.stringify(out)]]);
  return withKo(out);
}

// 종목 한글 이름: 한 번 번역한 건 stk:konames에 모아 둠
async function koMap(names) {
  const [c] = await redis([["GET", "stk:konames"]]); const M = json(c) || {};
  const miss = [...new Set(names.filter((n) => n && !(n in M)))].slice(0, 300);
  if (miss.length && process.env.ANTHROPIC_API_KEY) {
    try {
      const model = process.env.STOCK_MODEL || "claude-sonnet-5-5";
      const msg = await new Anthropic().messages.create({ model, max_tokens: 8000, output_config: { effort: "low" }, messages: [{ role: "user", content: `미국 증권 공시에 나온 회사·ETF 이름이에요. 한국 투자자가 흔히 부르는 한글 이름으로 바꿔 주세요 (예: APPLE INC → 애플, AMERICAN EXPRESS CO → 아메리칸 익스프레스, SPDR S&P 500 ETF TR → SPDR S&P500 ETF). 모르는 회사는 영어 발음대로 한글로 적어 주세요.
${miss.map((n, i) => `${i}. ${n}`).join("\n")}

JSON 하나만: {"0":"한글 이름", "1":"..."}` }] });
      await recordUsage(msg.usage || {}, model);
      const t = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""), o = json(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) || {};
      miss.forEach((n, i) => { if (o[i]) M[n] = String(o[i]).slice(0, 40); });
      await redis([["SET", "stk:konames", JSON.stringify(M)]]);
    } catch (e) { console.error("koMap", e?.message); }
  }
  return M;
}
async function withKo(d) {
  if (!d) return d; const M = await koMap([...(d.rows || []), ...(d.sold || [])].map((r) => r.n));
  (d.rows || []).forEach((r) => (r.ko = M[r.n] || "")); (d.sold || []).forEach((r) => (r.ko = M[r.n] || ""));
  return d;
}
