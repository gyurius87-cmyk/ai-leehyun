// 미국 기업 실적 (SEC XBRL 공시) → 연간 매출·순이익·영업이익·설비투자 + 최근 4분기 합
import { redis } from "./_redis.js";
import { secFetch } from "./_famous.js";
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const TAGS = {
  rev: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"],
  ni: ["NetIncomeLoss", "ProfitLoss"],
  op: ["OperatingIncomeLoss"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements"],
};
async function cikOf(sym) {
  const [c] = await redis([["GET", "stk:seccik"]]); let m = json(c);
  if (!m || Date.now() - m.at > 7 * 864e5) {
    const d = await sec("https://www.sec.gov/files/company_tickers.json"); m = { at: Date.now(), t: {} };
    Object.values(d).forEach((x) => { if (x.ticker && !m.t[x.ticker]) m.t[x.ticker] = x.cik_str; }); await redis([["SET", "stk:seccik", JSON.stringify(m)]]);
  }
  return m.t[String(sym).toUpperCase().replace("-", ".")] || m.t[String(sym).toUpperCase()] || null;
}
// SEC는 초당 10회 제한 → 동시에 5개까지만
let act = 0; const wq = [];
async function sec(url) { while (act >= 5) await new Promise((r) => wq.push(r)); act++; try { return await (await secFetch(url)).json(); } finally { act--; wq.shift()?.(); } }
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
// 한 지표: 태그별로 받아서 연간(FY) 값과 최근 4분기 합(TTM)
async function metric(cik, tags) {
  const pad = String(cik).padStart(10, "0"); let best = null;
  for (const t of tags) {
    let d; try { d = await sec(`https://data.sec.gov/api/xbrl/companyconcept/CIK${pad}/us-gaap/${t}.json`); } catch { continue; }
    const U = (d.units?.USD || []).filter((x) => x.start && x.end && x.val != null);
    const fy = new Map(); U.filter((x) => /^10-K/.test(x.form) && days(x.start, x.end) > 340 && days(x.start, x.end) < 380).forEach((x) => { const o = fy.get(x.end); if (!o || x.filed > o.filed) fy.set(x.end, x); });
    const A = [...fy.values()].sort((a, b) => (a.end < b.end ? -1 : 1));
    if (!A.length) continue;
    if (!best || A.at(-1).end > best.A.at(-1).end) best = { t, A, U };
  }
  if (!best) return null;
  const { A, U } = best, last = A.at(-1);
  // 최근 분기 누적(YTD) - 1년 전 같은 누적 + 마지막 연간
  const q = U.filter((x) => /^10-Q/.test(x.form) && x.end > last.end && days(x.start, x.end) > 80).sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : days(b.start, b.end) - days(a.start, a.end)));
  let ttm = null;
  if (q.length) { const ytd = q.filter((x) => x.end === q.at(-1).end).sort((a, b) => days(b.start, b.end) - days(a.start, a.end))[0], len = days(ytd.start, ytd.end);
    const prev = U.filter((x) => Math.abs(days(x.end, ytd.end) - 365) < 20 && Math.abs(days(x.start, x.end) - len) < 20).sort((a, b) => (a.filed > b.filed ? -1 : 1))[0];
    if (prev && days(ytd.start, ytd.end) < 340) ttm = { end: ytd.end, v: last.val + ytd.val - prev.val }; }
  return { tag: best.t, y: A.slice(-5).map((x) => ({ end: x.end, v: x.val })), ttm };
}
export async function finGet(sym, force) {
  sym = String(sym || "").toUpperCase().slice(0, 12); if (!sym) return null;
  const [c] = await redis([["GET", "stk:fin:" + sym]]); const hit = json(c); if (hit && !force && Date.now() - hit.at < 3 * 864e5) return hit;
  try {
    const cik = await cikOf(sym); if (!cik) return { sym, none: "cik" };
    const ks = Object.keys(TAGS), vs = await Promise.all(ks.map((k) => metric(cik, TAGS[k]).catch(() => null)));
    const out = { sym, cik, at: Date.now(), m: Object.fromEntries(ks.map((k, i) => [k, vs[i]])) };
    if (vs.some(Boolean)) await redis([["SET", "stk:fin:" + sym, JSON.stringify(out)]]);
    return out;
  } catch (e) { return hit || { sym, none: "sec", msg: String(e?.message || e).slice(0, 160) }; }
}
export async function finMany(syms) { return { list: await Promise.all(String(syms || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10).map((s) => finGet(s).catch(() => ({ sym: s, none: "err" })))) }; }
