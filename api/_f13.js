// 13F 탭: 유명 펀드 약 45곳의 13F를 모아 순위·종목 역조회·내 계좌 겹치기·따라 하기 백테스트, 그리고 아무 기관 검색
// SEC는 초당 10회까지라 150ms씩 쉬고, 한 번 부를 때 시간 예산 안에서만 받고 나머지는 다음에 이어서 받음
import { redis } from "./_redis.js";
import { filing13F, diff, koMap, secJson, secFetch } from "./_famous.js";

const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(10, "0");

// [CIK, 한글 이름, SEC 이름에 들어 있어야 할 말]. CIK가 틀리면 그 말로 SEC에서 다시 찾음
export const F13 = [
  [1067983, "버크셔 해서웨이 (워런 버핏)", "BERKSHIRE"], [1336528, "퍼싱 스퀘어 (빌 애크먼)", "PERSHING"], [1649339, "사이언 (마이클 버리)", "SCION"],
  [1350694, "브리지워터 (레이 달리오)", "BRIDGEWATER"], [1536411, "듀케인 (드러켄밀러)", "DUQUESNE"], [1709323, "히말라야 (리루)", "HIMALAYA"],
  [1061768, "바우포스트 (세스 클라만)", "BAUPOST"], [1079114, "그린라이트 (데이비드 아인혼)", "GREENLIGHT"], [1040273, "써드 포인트 (댄 로브)", "THIRD POINT"],
  [1167483, "타이거 글로벌", "TIGER GLOBAL"], [1135730, "코투", "COATUE"], [1061165, "론 파인", "LONE PINE"], [1103804, "바이킹 글로벌", "VIKING"],
  [1656456, "아팔루사 (데이비드 테퍼)", "APPALOOSA"], [1029160, "소로스 펀드", "SOROS"], [921669, "칼 아이칸", "ICAHN"], [1791786, "엘리엇", "ELLIOTT"],
  [1166559, "게이츠 재단", "GATES"], [1112520, "에이크 캐피털", "AKRE"], [1569205, "펀드스미스 (테리 스미스)", "FUNDSMITH"], [1096343, "마켈", "MARKEL"],
  [1418814, "밸류액트", "VALUEACT"], [1345471, "트라이언 (넬슨 펠츠)", "TRIAN"], [934639, "매버릭", "MAVERICK"], [1720792, "루안 커니프 (세쿼이아)", "RUANE"],
  [1034524, "폴렌 캐피털", "POLEN"], [1088875, "베일리 기포드", "BAILLIE"], [1697748, "ARK (캐시 우드)", "ARK"], [1541617, "알티미터", "ALTIMETER"],
  [1358706, "에이브럼스 캐피털", "ABRAMS"], [732905, "트위디 브라운", "TWEEDY"], [1325447, "퍼스트 이글", "FIRST EAGLE"], [905567, "야크트먼", "YACKTMAN"],
  [807985, "사우스이스턴 (롱리프)", "SOUTHEASTERN"], [200217, "다지 앤 콕스", "DODGE"], [813917, "해리스 (오크마크)", "HARRIS"], [1631014, "알타록", "ALTAROCK"],
  [1647251, "TCI (크리스 혼)", "TCI"], [1759760, "H&H (돤융핑)", "H&H"], [1549575, "달랄 스트리트 (모니시 파브라이)", "DALAL"], [1608046, "국민연금", "NATIONAL PENSION"],
  [1056831, "페어홈 (브루스 버코위츠)", "FAIRHOLME"], [1138995, "글렌뷰", "GLENVIEW"], [1517137, "스타보드 밸류", "STARBOARD"], [1403528, "오크트리 (하워드 막스)", "OAKTREE"], [1798849, "듀러블 캐피털", "DURABLE"],
].map(([cik, ko, kw]) => ({ cik, ko, kw }));

// 회사 이름 맞추기용 정리 (13F의 "NVIDIA CORPORATION" = SEC 목록의 "NVIDIA CORP")
const STOP = new Set(["INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "PLC", "LLC", "LP", "L P", "HLDGS", "HLDG", "HOLDINGS", "HOLDING", "GROUP", "GRP", "THE", "CL", "CLASS", "A", "B", "C", "COM", "NEW", "SA", "NV", "N V", "AG", "SE", "ADR", "ADS", "SPONSORED", "SPON", "DEL", "ORD", "SHS", "INTL", "TR", "TRUST"]);
export const norm = (s) => String(s || "").toUpperCase().replace(/&AMP;/g, "&").replace(/[^A-Z0-9& ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).join(" ");

// SEC 종목 목록 (티커 ↔ 회사 이름), 1주 캐시
async function secTickers() {
  const [c] = await redis([["GET", "stk:sectk"]]); const j = json(c); if (j && Date.now() - j.at < 7 * 864e5) return j;
  try {
    const r = await secFetch("https://www.sec.gov/files/company_tickers.json"); const d = await r.json();
    const t2n = {}; Object.values(d).forEach((x) => { if (x.ticker && x.title && !t2n[x.ticker]) t2n[x.ticker] = x.title; });
    const out = { at: Date.now(), t2n }; await redis([["SET", "stk:sectk", JSON.stringify(out)]]); return out;
  } catch (e) { console.error("sectk", e?.message); return j || { at: 0, t2n: {} }; }
}
let N2T = null;
async function nameToTicker() { if (N2T) return N2T; const { t2n } = await secTickers(); N2T = {}; Object.entries(t2n).sort((a, b) => a[0].length - b[0].length).forEach(([t, n]) => { const k = norm(n); if (k && !N2T[k]) N2T[k] = t; }); return N2T; }

// 이름으로 기관 찾기 (SEC 전체 검색)
export async function f13Find(q) {
  q = String(q || "").trim(); if (!q) return [];
  const ql = q.toLowerCase(), out = F13.filter((f) => f.ko.toLowerCase().includes(ql) || f.kw.toLowerCase().includes(ql)).map((f) => ({ cik: f.cik, name: f.ko, star: true }));
  if (/^\d{3,10}$/.test(q)) out.push({ cik: +q, name: "CIK " + q });
  if (/[a-z]/i.test(q)) try {
    const r = await secFetch(`https://efts.sec.gov/LATEST/search-index?keysTyped=${encodeURIComponent(q)}`); const j = await r.json();
    for (const h of j?.hits?.hits || []) { const s = h._source || {}, cik = +String(h._id || s.ciks?.[0] || "").replace(/\D/g, ""), name = s.entity || s.display_names?.[0] || s.entity_words || ""; if (cik && !out.some((o) => o.cik === cik)) out.push({ cik, name: String(name).slice(0, 80) }); }
  } catch (e) { console.error("efts", e?.message); }
  return out.slice(0, 15);
}

// 한 기관의 최신 13F (공시가 같으면 캐시 그대로). prev가 저장돼 있으면 재사용
export async function f13Fund(cik, force) {
  cik = +cik; const key = "stk:f13:" + cik, [c] = await redis([["GET", key]]); const old = json(c);
  if (old && !force && Date.now() - (old.chk || 0) < 6 * 3600e3) return old;
  const sub = await secJson(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`); await sleep(150);
  const R = sub?.filings?.recent || {}, list = [];
  (R.form || []).forEach((form, i) => { if (form === "13F-HR" && !list.some((x) => x.period === R.reportDate[i])) list.push({ acc: R.accessionNumber[i], filed: R.filingDate[i], period: R.reportDate[i] }); });
  if (!list.length) { const o = { cik, name: sub?.name || "", none: true, chk: Date.now() }; await redis([["SET", key, JSON.stringify(o)]]); return o; }
  if (old?.acc === list[0].acc && !force) { old.chk = Date.now(); old.hist = list.slice(0, 12); await redis([["SET", key, JSON.stringify(old)]]); return old; }
  const cur = await filing13F(cik, list[0].acc);
  const prev = old?.acc && old.acc === list[1]?.acc && old.all ? old.all : list[1] ? await filing13F(cik, list[1].acc) : null;
  const total = cur.reduce((t, r) => t + r.val, 0), d = diff(cur, prev);
  const rows = d.rows.map((r) => ({ ...r, w: total ? Math.round((r.val / total) * 10000) / 100 : 0 }));
  const out = { cik, name: sub?.name || "", acc: list[0].acc, filed: list[0].filed, period: list[0].period, prevPeriod: list[1]?.period || null, total, count: cur.length, rows: rows.slice(0, 400), sold: d.sold.slice(0, 50), all: cur.slice(0, 1500).map(({ n, cusip, pc, val, sh }) => ({ n, cusip, pc, val, sh })), hist: list.slice(0, 12), chk: Date.now(), at: Date.now() };
  await redis([["SET", key, JSON.stringify(out)]]);
  return out;
}
export async function f13FundView(cik, force) { const d = await f13Fund(cik, force); if (!d || d.none) return d; const { all, ...v } = d; const M = await koMap([...v.rows.slice(0, 120), ...v.sold.slice(0, 30)].map((r) => r.n)); const T = await nameToTicker(); v.rows = v.rows.map((r) => ({ ...r, ko: M[r.n] || "", t: T[norm(r.n)] || "" })); v.sold = v.sold.map((r) => ({ ...r, ko: M[r.n] || "", t: T[norm(r.n)] || "" })); v.star = F13.find((f) => f.cik === v.cik)?.ko || ""; return v; }

// 유명 펀드 전체 새로고침 (시간 예산 안에서) → 끝나면 모아서 순위표(stk:f13agg) 다시 만들기
export async function f13Refresh(budget = 80e3, force) {
  const t0 = Date.now(), [m] = await redis([["GET", "stk:f13meta"]]); const meta = json(m) || { fix: {}, err: {}, done: {} };
  let left = 0;
  for (const f of F13) {
    const cik = meta.fix[f.cik] || f.cik;
    if (!force && meta.done[cik] && !meta.err[f.cik] && Date.now() - meta.done[cik] < 20 * 3600e3) continue; // 실패했던 곳은 누를 때마다 다시
    if (Date.now() - t0 > budget) { left++; continue; }
    try {
      let d = await f13Fund(cik, force);
      if (!String(d.name).toUpperCase().includes(f.kw) && !meta.fix[f.cik]) { // CIK가 다른 회사면 이름으로 다시 찾기
        const c2 = (await f13Find(f.kw)).find((x) => !x.star && String(x.name).toUpperCase().includes(f.kw));
        if (c2) { meta.fix[f.cik] = c2.cik; d = await f13Fund(c2.cik, force); }
      }
      meta.done[cik] = Date.now(); delete meta.err[f.cik];
    } catch (e) { meta.err[f.cik] = String(e?.message || e).slice(0, 80); meta.done[cik] = Date.now() - 18 * 3600e3; } // 실패는 2시간 뒤 다시
  }
  meta.at = Date.now(); await redis([["SET", "stk:f13meta", JSON.stringify(meta)]]);
  const got = F13.filter((f) => meta.done[meta.fix[f.cik] || f.cik] && !meta.err[f.cik]).length;
  return { left, got, total: F13.length, err: Object.fromEntries(Object.entries(meta.err).map(([k, v]) => [F13.find((f) => f.cik === +k)?.ko || k, v])) };
}
// 순위표 만들기는 따로 (받기와 같은 요청에서 하면 2분 제한에 걸림)
export async function f13Build() { const [m] = await redis([["GET", "stk:f13meta"]]); const meta = json(m) || { fix: {}, err: {}, done: {} }; const a = await f13BuildAgg(meta); return { ok: true, n: a.list.length, funds: a.funds.length }; }

// 순위표: 종목별로 누가 들고 있고, 이번 분기 누가 새로 샀고 늘렸고 줄였고 다 팔았는지
async function f13BuildAgg(meta) {
  const ciks = F13.map((f) => meta.fix[f.cik] || f.cik), funds = [];
  for (let i = 0; i < ciks.length; i += 6) { const vals = await redis(ciks.slice(i, i + 6).map((c) => ["GET", "stk:f13:" + c])); vals.forEach((v) => { const d = json(v); if (d && !d.none) funds.push(d); }); }
  const T = await nameToTicker(), by = new Map();
  const get = (n) => { const k = norm(n); if (!k) return null; let o = by.get(k); if (!o) by.set(k, (o = { k, n, t: T[k] || "", h: [], val: 0 })); return o; };
  funds.forEach((d, fi) => {
    d.rows.forEach((r) => { if (r.pc) return; const o = get(r.n); if (!o) return; o.h.push([fi, r.w, r.ch === "new" ? "N" : r.ch == null ? 0 : r.ch]); o.val += r.val; });
    (d.sold || []).forEach((r) => { if (r.pc) return; const o = get(r.n); if (o) o.h.push([fi, 0, "S"]); });
  });
  const list = [...by.values()].filter((o) => o.h.length >= 1);
  const M = await Promise.race([koMap(list.filter((o) => o.h.length >= 2).sort((a, b) => b.h.length - a.h.length).slice(0, 150).map((o) => o.n)), sleep(45e3).then(() => ({}))]).catch(() => ({})); // 한글 이름은 45초 안에 되는 만큼만
  list.forEach((o) => { o.ko = M[o.n] || ""; });
  const fl = funds.map((d) => ({ cik: d.cik, ko: F13.find((f) => (meta.fix[f.cik] || f.cik) === d.cik)?.ko || d.name, period: d.period, filed: d.filed, total: d.total }));
  const period = fl.map((f) => f.period).sort().at(-1);
  const out = { at: Date.now(), period, funds: fl, list: list.filter((o) => o.h.length >= 2 || o.h.some((h) => h[1] >= 1)).map((o) => ({ ...o, val: Math.round(o.val) })) };
  await redis([["SET", "stk:f13agg", JSON.stringify(out)]]);
  return out;
}
export async function f13Agg() {
  const [c, m, k] = await redis([["GET", "stk:f13agg"], ["GET", "stk:f13meta"], ["GET", "stk:konames"]]); const agg = json(c), K = json(k) || {};
  if (agg?.list) { agg.list.forEach((o) => { if (!o.ko && K[o.n]) o.ko = K[o.n]; });
    // 많이 담긴 종목인데 한글 이름이 없으면 이름 짓기 요청 (구독 접수함, 같은 묶음은 6시간에 한 번)
    const miss = agg.list.filter((o) => !o.ko && o.h.length >= 2).sort((a, b) => b.h.length - a.h.length).slice(0, 150).map((o) => o.n);
    if (miss.length) { const M2 = await koMap(miss).catch(() => ({})); agg.list.forEach((o) => { if (!o.ko && M2[o.n]) o.ko = M2[o.n]; }); } }
  return { agg, meta: json(m) };
}

// 종목 이름·티커 → 순위표 안의 그 종목 (한글 이름이면 findSym으로 티커부터)
export async function f13Stock(q, findSym) {
  const [c] = await redis([["GET", "stk:f13agg"]]); const agg = json(c); if (!agg) return { none: true };
  q = String(q || "").trim(); const { t2n } = await secTickers(); let keys = [];
  const tk = q.toUpperCase().replace(/\.(KS|KQ)$/, "");
  if (t2n[tk]) keys.push(norm(t2n[tk]));
  if (!keys.length && /[가-힣]/.test(q)) { const hits = (await findSym(q).catch(() => [])).filter((x) => !/\.(KS|KQ)$/.test(x.s)); for (const h of hits) if (t2n[h.s]) keys.push(norm(t2n[h.s])); }
  const nq = norm(q), list = agg.list.filter((o) => keys.includes(o.k) || (nq.length >= 3 && o.k.includes(nq)) || (o.ko && o.ko.includes(q)) || o.t === tk).sort((a, b) => b.h.length - a.h.length).slice(0, 5);
  return { funds: agg.funds, period: agg.period, list };
}

// 내 계좌의 미국 종목 → 순위표에서 찾기
export async function f13Mine(acct) {
  const [c] = await redis([["GET", "stk:f13agg"]]); const agg = json(c); if (!agg) return { none: true };
  const { t2n } = await secTickers();
  const us = (acct?.hold || []).filter((h) => h.cur === "USD" || !/\.(KS|KQ)$/.test(h.sym));
  const rows = us.map((h) => { const t = String(h.sym).toUpperCase(), k = t2n[t] ? norm(t2n[t]) : norm(h.name), o = agg.list.find((x) => x.k === k || x.t === t); return { sym: h.sym, name: h.name, o: o || null }; });
  return { funds: agg.funds, period: agg.period, rows };
}

// 따라 하기 백테스트: 공시가 나온 날 그 펀드 상위 25종목을 비중대로 사서 다음 공시 날까지 들고 있기 (S&P500과 비교)
export async function f13Backtest(cik, chart) {
  const d = await f13Fund(cik); if (!d || d.none) return { err: "none" };
  const ck = `stk:f13bt2:${cik}:${d.acc}`, [c] = await redis([["GET", ck]]); const hit = json(c); if (hit) return hit;
  const T = await nameToTicker(), hist = d.hist.slice(0, 9).reverse(), qs = [];
  for (const h of hist) {
    const hk = "stk:f13h:" + h.acc, [hc] = await redis([["GET", hk]]); let top = json(hc);
    if (!top) { const rows = h.acc === d.acc ? d.all : await filing13F(d.cik, h.acc); top = rows.filter((r) => !r.pc).sort((a, b) => b.val - a.val).slice(0, 40).map((r) => [r.n, r.val]); await redis([["SET", hk, JSON.stringify(top)]]); await sleep(150); }
    const tot = top.reduce((t, x) => t + x[1], 0), w = []; top.forEach(([n, v]) => { const t = T[norm(n)]; if (t && w.length < 25) w.push([t.replace(/\./g, "-"), v]); });
    const wt = w.reduce((t, x) => t + x[1], 0); qs.push({ filed: h.filed, period: h.period, cover: tot ? Math.round((wt / tot) * 100) : 0, w: w.map(([t, v]) => [t, v / wt]) });
  }
  const syms = [...new Set(qs.flatMap((q) => q.w.map((x) => x[0]))), "SPY"], px = {};
  for (let i = 0; i < syms.length; i += 10) await Promise.all(syms.slice(i, i + 10).map(async (s) => { const g = await chart(s, "5y").catch(() => null); if (g?.rows?.length) px[s] = new Map(g.rows.map((r) => [r.d, r.c])); }));
  if (!px.SPY) return { err: "price" };
  const days = [...px.SPY.keys()].filter((x) => x >= qs[0].filed).sort(), last = {};
  let eq = 1, units = null, qi = -1; const curve = [], spy0 = px.SPY.get(days[0]), per = [];
  for (const day of days) {
    for (const s of syms) { const v = px[s]?.get(day); if (v != null) last[s] = v; }
    const value = units ? units.reduce((t, [s, u]) => t + u * (last[s] ?? 0), 0) + (units.cash || 0) : eq;
    if (qi + 1 < qs.length && day >= qs[qi + 1].filed) { // 리밸런싱
      if (qi >= 0) per.push({ ...qs[qi], to: day, ret: Math.round((value / per.startEq - 1) * 1000) / 10 });
      qi++; eq = value; const ok = qs[qi].w.filter(([s]) => last[s]); const sw = ok.reduce((t, x) => t + x[1], 0);
      units = ok.map(([s, w]) => [s, (eq * w) / sw / last[s]]); units.cash = ok.length ? 0 : eq; per.startEq = eq;
    }
    curve.push([day, Math.round(value * 10000) / 100 - 100, Math.round((last.SPY / spy0) * 10000) / 100 - 100]);
  }
  if (qi >= 0) { const v = curve.at(-1)[1] / 100 + 1; per.push({ ...qs[qi], to: days.at(-1), ret: Math.round((v / per.startEq - 1) * 1000) / 10 }); }
  // 가장 최근 13F 포트 그대로: 분기 말(기준일)부터 · 공개일부터 지금까지
  const all = [...px.SPY.keys()].sort(), endD = all.at(-1), L = qs.at(-1);
  const pAt = (s, from) => { for (const dd of all) if (dd >= from) { const v = px[s]?.get(dd); if (v != null) return v; } return null; };
  const hold = (from) => { if (!L || from > endD) return null; let t = 0, ws = 0; L.w.forEach(([s, w]) => { const a = pAt(s, from), b = px[s]?.get(endD) ?? [...(px[s]?.values() || [])].at(-1); if (a && b) { t += w * (b / a); ws += w; } }); const sa = pAt("SPY", from); return ws ? { ret: Math.round((t / ws - 1) * 1000) / 10, spy: sa ? Math.round((px.SPY.get(endD) / sa - 1) * 1000) / 10 : null, from: all.find((dd) => dd >= from) } : null; };
  const latest = L ? { period: L.period, filed: L.filed, cover: L.cover, top: L.w.slice(0, 5).map((x) => x[0]), sincePeriod: hold(L.period), sinceFiled: hold(L.filed) } : null;
  const out = { cik: d.cik, name: d.name, from: days[0], to: days.at(-1), latest, ret: curve.at(-1)?.[1], spy: curve.at(-1)?.[2], curve, per: per.map(({ w, ...p }) => ({ ...p, top: w.slice(0, 5).map((x) => x[0]) })), at: Date.now() };
  await redis([["SET", ck, JSON.stringify(out)]]);
  return out;
}
