// 키움 REST API로 내 계좌(국내 주식) 잔고·체결을 받아 옴.
// 키움은 등록한 IP에서만 받아 주므로, 쇼핑몰 쪽 고정 IP 프록시(OUTBOUND_PROXY_URL)를 거쳐 나감.
// 환경변수: KIWOOM_APPKEY, KIWOOM_SECRETKEY, OUTBOUND_PROXY_URL (값은 이현님이 Vercel에만 넣음)
import { ProxyAgent, fetch as ufetch } from "undici";
import { redis } from "./_redis.js";

const BASE = process.env.KIWOOM_MOCK ? "https://mockapi.kiwoom.com" : "https://api.kiwoom.com";
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const num = (v) => Math.abs(Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0); // 키움 값은 "+00012300" 처럼 부호·0이 붙음
const code = (v) => String(v || "").trim().replace(/^A/, "").replace(/_(AL|NX)$/, "");
let agent = null;
const out = (url, opt = {}) => { if (process.env.OUTBOUND_PROXY_URL) agent ||= new ProxyAgent(process.env.OUTBOUND_PROXY_URL); return ufetch(url, agent ? { ...opt, dispatcher: agent } : opt); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const kwReady = () => ({ key: !!(process.env.KIWOOM_APPKEY && process.env.KIWOOM_SECRETKEY), proxy: !!process.env.OUTBOUND_PROXY_URL });

// 프록시를 거쳐 나가는 IP 확인 (키움에 등록한 IP와 같아야 함)
export async function outIp() { const r = await out("https://api.ipify.org?format=json"); return (await r.json()).ip; }

async function token(force) {
  if (!force) { const [c] = await redis([["GET", "stk:kwtok"]]); const t = json(c); if (t && t.exp > Date.now() + 60e3) return t.token; }
  const r = await out(`${BASE}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json;charset=UTF-8" }, body: JSON.stringify({ grant_type: "client_credentials", appkey: process.env.KIWOOM_APPKEY, secretkey: process.env.KIWOOM_SECRETKEY }) });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error("kw_token:" + (j.return_msg || r.status));
  const e = String(j.expires_dt || ""); // YYYYMMDDHHMMSS (한국 시간)
  const exp = e.length >= 12 ? Date.parse(`${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)}T${e.slice(8, 10)}:${e.slice(10, 12)}:00+09:00`) : Date.now() + 12 * 3600e3;
  await redis([["SET", "stk:kwtok", JSON.stringify({ token: j.token, exp })], ["EXPIRE", "stk:kwtok", Math.max(60, Math.floor((exp - Date.now()) / 1000))]]);
  return j.token;
}
// TR 하나 부르기 (연속 조회는 cont-yn / next-key 로 끝까지)
async function tr(apiId, body, listKey, path = "acnt", more = () => true) {
  let tok = await token(), cont = "N", next = "", rows = [], first = null;
  for (let page = 0; page < 20; page++) {
    const r = await out(`${BASE}/api/dostk/${path}`, { method: "POST", headers: { "Content-Type": "application/json;charset=UTF-8", "api-id": apiId, authorization: `Bearer ${tok}`, "cont-yn": cont, "next-key": next }, body: JSON.stringify(body) });
    if (r.status === 401 && page === 0) { tok = await token(true); continue; }
    const j = await r.json().catch(() => ({}));
    if (j.return_code != null && Number(j.return_code) !== 0) throw new Error(`kw_${apiId}:${j.return_msg || j.return_code}`);
    first ||= j;
    // 목록 키 이름이 문서와 다를 수 있어서, 못 찾으면 응답 안의 첫 배열을 씀
    const list = listKey && (Array.isArray(j[listKey]) ? j[listKey] : Object.values(j).find((v) => Array.isArray(v) && v.length && typeof v[0] === "object"));
    if (list) rows.push(...list);
    cont = r.headers.get("cont-yn") || "N"; next = r.headers.get("next-key") || "";
    if (cont !== "Y" || !listKey || !more(rows)) break;
    await sleep(250);
  }
  return { first, rows };
}

// 잔고 (kt00018) + 예수금 (kt00001)
export async function kwHoldings() {
  const { first, rows } = await tr("kt00018", { qry_tp: "1", dmst_stex_tp: "KRX" }, "acnt_evlt_remn_indv_tot");
  await sleep(250);
  const dep = await tr("kt00001", { qry_tp: "3" }).catch(() => ({ first: {} }));
  return {
    hold: rows.map((x) => ({ code: code(x.stk_cd), name: String(x.stk_nm || "").trim(), qty: num(x.rmnd_qty), avg: num(x.pur_pric), cur: num(x.cur_prc) })).filter((h) => h.code && h.qty > 0),
    cash: num(dep.first?.entr), total: num(first?.prsm_dpst_aset_amt || first?.tot_evlt_amt),
  };
}

// 하루치 체결 (kt00007, 매도·매수 따로 불러서 방향을 확실히)
export async function kwFills(day) { // day: YYYY-MM-DD
  const ord_dt = day.replace(/-/g, ""), out2 = [];
  for (const [sell_tp, side] of [["1", "매도"], ["2", "매수"]]) {
    const { rows } = await tr("kt00007", { ord_dt, qry_tp: "4", stk_bond_tp: "0", sell_tp, stk_cd: "", fr_ord_no: "", dmst_stex_tp: "%" }, "acnt_ord_cntr_prps_dtl");
    // 같은 주문이 나눠서 체결되면 주문번호별로 수량 가중 평균
    const byOrd = new Map();
    for (const x of rows) { const q = num(x.cntr_qty); if (!q) continue; const k = String(x.ord_no || "") + "|" + code(x.stk_cd); const o = byOrd.get(k) || { code: code(x.stk_cd), name: String(x.stk_nm || "").trim(), q: 0, amt: 0, ord: String(x.ord_no || "") }; o.q += q; o.amt += q * num(x.cntr_uv); byOrd.set(k, o); }
    for (const o of byOrd.values()) out2.push({ date: day, code: o.code, name: o.name, side, price: Math.round(o.amt / o.q), qty: o.q, ord: o.ord });
    await sleep(250);
  }
  return out2;
}

// 내 계좌·매매 기록에 합치기 (키움에서 온 국내 종목은 덮어쓰고, 손으로 적은 해외 종목은 그대로)
export async function kwSync(days = 7, mkt = null) { // mkt: 6자리 코드 → ".KS"|".KQ" (상장 목록)
  const [a, t] = await redis([["GET", "stk:acct"], ["GET", "stk:trades"]]);
  const acct = json(a) || { hold: [], cash: 0, cashUsd: 0 }, trades = json(t) || [];
  const H = await kwHoldings();
  const sfx = (c) => mkt?.[c] || (acct.hold.find((h) => h.sym?.startsWith(c + "."))?.sym?.slice(6)) || ".KS";
  acct.hold = [...acct.hold.filter((h) => !(h.src === "kiwoom" || /^\d{6}\.(KS|KQ)$/.test(h.sym))), ...H.hold.map((h) => ({ sym: h.code + sfx(h.code), name: h.name, qty: h.qty, avg: h.avg, cur: "KRW", src: "kiwoom" }))];
  acct.cash = H.cash; acct.kwAt = Date.now();
  const seen = new Set(trades.map((x) => x.ord ? `${x.date}|${x.ord}|${x.side}` : `${x.date}|${x.name}|${x.side}|${x.price}|${x.qty}`));
  let added = 0;
  const today = new Date(Date.now() + 9 * 3600e3);
  for (let k = 0; k < Math.min(120, days); k++) {
    const d = new Date(today.getTime() - k * 864e5), dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue;
    const day = d.toISOString().slice(0, 10);
    for (const f of await kwFills(day)) {
      const key1 = `${f.date}|${f.ord}|${f.side}`, key2 = `${f.date}|${f.name}|${f.side}|${f.price}|${f.qty}`;
      if (seen.has(key1) || seen.has(key2)) continue; seen.add(key1);
      trades.push({ id: Math.random().toString(36).slice(2, 12), date: f.date, sym: f.code + sfx(f.code), name: f.name, side: f.side, price: f.price, qty: f.qty, ord: f.ord, memo: "", feel: "", src: "kiwoom" }); added++;
    }
  }
  if (mkt) trades.forEach((x) => { const m = /^(\d{6})\.(KS|KQ)$/.exec(x.sym || ""); if (m && mkt[m[1]]) x.sym = m[1] + mkt[m[1]]; });
  await redis([["SET", "stk:acct", JSON.stringify(acct)], ["SET", "stk:trades", JSON.stringify(trades)]]);
  return { ok: true, hold: H.hold.length, added, cash: H.cash, at: acct.kwAt };
}

// ── 국내 차트 (일·주·월봉). 종목은 ka10081~3, 업종 지수는 ka20006~8. 실패하면 null → 야후로.
const IDX = { "^KS11": "001", "^KQ11": "101", "^KS200": "201" };
const TRS = { stock: { "1d": ["ka10081", "stk_dt_pole_chart_qry"], "1wk": ["ka10082", "stk_stk_pole_chart_qry"], "1mo": ["ka10083", "stk_mth_pole_chart_qry"] }, idx: { "1d": ["ka20006", "inds_dt_pole_qry"], "1wk": ["ka20007", "inds_stk_pole_qry"], "1mo": ["ka20008", "inds_mth_pole_qry"] } };
export const kwChartable = (sym) => !!IDX[sym] || /^\d{6}\.(KS|KQ)$/.test(sym);
export function kwChartRows(rows, isIdx, f = "") {
  let out = rows.map((x) => ({ d: String(x.dt || x.date || ""), c: num(x.cur_prc ?? x.close_pric ?? x.clpr), v: num(x.trde_qty), o: num(x.open_pric), h: num(x.high_pric), l: num(x.low_pric) })).filter((p) => /^\d{8}$/.test(p.d) && p.c > 0 && p.d >= f)
    .map((p) => ({ d: `${p.d.slice(0, 4)}-${p.d.slice(4, 6)}-${p.d.slice(6, 8)}`, c: p.c, v: p.v, o: p.o || p.c, h: p.h || p.c, l: p.l || p.c })).sort((a, b) => a.d.localeCompare(b.d));
  if (isIdx && out.length && out.at(-1).c > 20000) out = out.map((p) => ({ ...p, c: p.c / 100, o: p.o / 100, h: p.h / 100, l: p.l / 100 })); // 업종 지수는 100배로 오는 경우가 있음
  return out;
}
export async function kwChart(sym, iv = "1d", from = "2000-01-01") {
  const k = kwReady(); if (!k.key || !k.proxy || !kwChartable(sym)) return null;
  const ck = `stk:kc:${sym}:${iv}:${from}`, [c] = await redis([["GET", ck]]); const hit = json(c); if (hit) return hit;
  const isIdx = !!IDX[sym], [apiId, key] = TRS[isIdx ? "idx" : "stock"][iv] || TRS.stock["1d"];
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ""), f = from.replace(/-/g, "");
  const body = isIdx ? { inds_cd: IDX[sym], base_dt: today } : { stk_cd: sym.slice(0, 6), base_dt: today, upd_stkpc_tp: "1" };
  const { rows } = await tr(apiId, body, key, "chart", (rs) => { const last = rs.at(-1); return !last || String(last.dt || last.date || "") > f; });
  const out = kwChartRows(rows, isIdx, f);
  if (out.length < 2) return null;
  await redis([["SET", ck, JSON.stringify(out)], ["EXPIRE", ck, 3600]]);
  return out;
}

// 국내 상장 종목 목록 (이름 → 코드 검색용). ka10099 종목정보 리스트: 0 코스피, 10 코스닥
export async function kwStockList() {
  const k = kwReady(); if (!k.key || !k.proxy) return null;
  const out = [];
  for (const [mk, suf] of [["0", ".KS"], ["10", ".KQ"]]) {
    const { rows } = await tr("ka10099", { mrkt_tp: mk }, "list", "stkinfo");
    rows.forEach((x) => { const c = String(x.code || x.stk_cd || "").slice(0, 6), n = String(x.name || x.stk_nm || "").trim(); if (/^\d{6}$/.test(c) && n) out.push({ s: c + suf, n }); });
  }
  return out.length > 500 ? out : null;
}
