// 쇼핑몰 뭐 팔까? — 팔 상품 찾기 (이현님 전용, x-admin-key)
// /api/youtube?shop=1&op=... 로 들어와요 (Vercel 무료 요금제 함수 12개 제한 때문에 youtube.js 안에서 나눔)
// 쓰는 자료 (키는 전부 Vercel 환경변수에만 있어요):
//  - 네이버 데이터랩 검색어 트렌드·쇼핑인사이트, 네이버 쇼핑 검색: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (developers.naver.com)
//  - 네이버 검색광고 키워드 도구(월 검색량·연관 키워드·광고 경쟁): NAVER_AD_API_KEY / NAVER_AD_SECRET / NAVER_AD_CUSTOMER_ID (searchad.naver.com)
// 키가 없으면 화면이 볼 수 있게 '예시 자료'를 돌려줘요 (demo:true).
// Claude(AI)는 부르지 않아요. 점수는 숫자 규칙으로만 매겨요.
import { createHmac } from "node:crypto";
import { hasRedis, redis } from "./_redis.js";

const NV = () => process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET;
const AD = () => process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET && process.env.NAVER_AD_CUSTOMER_ID;
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const HOUR = 3600;

// 네이버 쇼핑 대분류 (데이터랩 쇼핑인사이트 카테고리 번호)
export const CATS = [
  ["50000000", "패션의류"], ["50000001", "패션잡화"], ["50000002", "화장품/미용"], ["50000003", "디지털/가전"],
  ["50000004", "가구/인테리어"], ["50000005", "출산/육아"], ["50000006", "식품"], ["50000007", "스포츠/레저"],
  ["50000008", "생활/건강"], ["50000009", "여가/생활편의"], ["50000011", "도서"],
];
const catId = (name) => (CATS.find(([, n]) => n === name) || [])[0] || "";

// ── 캐시 (하루 호출 한도 아끼기)
async function cached(key, ttl, fn) {
  if (hasRedis()) { const [v] = await redis([["GET", "shop:c:" + key]]); const j = json(v); if (j) return j; }
  const out = await fn();
  if (hasRedis() && out) await redis([["SET", "shop:c:" + key, JSON.stringify(out), "EX", ttl]]);
  return out;
}
const hash = (s) => createHmac("sha1", "k").update(s).digest("hex").slice(0, 16);

// ── 네이버 오픈API
async function nv(path, body) {
  const r = await fetch("https://openapi.naver.com" + path, {
    method: body ? "POST" : "GET",
    headers: { "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID, "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`naver ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}
// ── 네이버 검색광고 API (서명: HMAC-SHA256(시간.메서드.주소))
async function ad(uri, qs) {
  const ts = String(Date.now());
  const sig = createHmac("sha256", process.env.NAVER_AD_SECRET).update(`${ts}.GET.${uri}`).digest("base64");
  const r = await fetch(`https://api.searchad.naver.com${uri}?${qs}`, {
    headers: { "X-Timestamp": ts, "X-API-KEY": process.env.NAVER_AD_API_KEY, "X-Customer": String(process.env.NAVER_AD_CUSTOMER_ID), "X-Signature": sig },
  });
  if (!r.ok) throw new Error(`searchad ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

const ymd = (d) => d.toISOString().slice(0, 10);
const range = (months) => { const e = new Date(Date.now() - 864e5); const s = new Date(e); s.setMonth(s.getMonth() - months); return { startDate: ymd(s), endDate: ymd(e) }; };
const num = (v) => (typeof v === "number" ? v : String(v).includes("<") ? 5 : +v || 0); // "< 10" → 5
const clean = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// 연관 키워드 + 월 검색량 (한 번에 힌트 5개까지, 공백은 빼야 해요)
async function related(hints) {
  const h = hints.map((x) => x.replace(/\s+/g, "")).filter(Boolean).slice(0, 5);
  return cached("rel:" + hash(h.join(",")), 24 * HOUR, async () => {
    const j = await ad("/keywordstool", "hintKeywords=" + encodeURIComponent(h.join(",")) + "&showDetail=1");
    return (j.keywordList || []).map((k) => ({
      kw: k.relKeyword, pc: num(k.monthlyPcQcCnt), mo: num(k.monthlyMobileQcCnt),
      vol: num(k.monthlyPcQcCnt) + num(k.monthlyMobileQcCnt),
      clk: Math.round((num(k.monthlyAvePcClkCnt) + num(k.monthlyAveMobileClkCnt)) * 10) / 10,
      comp: k.compIdx || "", depth: +k.plAvgDepth || 0,
    }));
  });
}
// 쇼핑 검색: 상품 수, 가격, 판매처, 카테고리
async function shopInfo(kw) {
  return cached("shop:" + hash(kw), 12 * HOUR, async () => {
    const j = await nv("/v1/search/shop.json?display=100&sort=sim&query=" + encodeURIComponent(kw));
    const items = (j.items || []).map((x) => ({ t: clean(x.title), p: +x.lprice || 0, mall: x.mallName, brand: x.brand, c: [x.category1, x.category2, x.category3, x.category4].filter(Boolean), img: x.image, link: x.link, type: +x.productType }));
    const prices = items.map((x) => x.p).filter((p) => p > 0);
    const malls = {}; for (const x of items) malls[x.mall] = (malls[x.mall] || 0) + 1;
    const cats = {}; for (const x of items) { const k = x.c.slice(0, 3).join(" > "); if (k) cats[k] = (cats[k] || 0) + 1; }
    const topMalls = Object.entries(malls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, n }));
    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    return {
      total: +j.total || 0, n: items.length,
      price: { min: prices.length ? Math.min(...prices) : 0, med: median(prices), max: prices.length ? Math.max(...prices) : 0, q1: median(prices.filter((p) => p <= median(prices))), q3: median(prices.filter((p) => p >= median(prices))) },
      priceBins: bins(prices), topMalls, topCat, cat1: items[0]?.c[0] || "",
      naverMall: items.filter((x) => x.mall === "네이버").length, // 가격비교 묶음(카탈로그) 비중
      top: items.slice(0, 8).map(({ t, p, mall, img, link }) => ({ t, p, mall, img, link })),
    };
  });
}
function bins(prices) {
  if (!prices.length) return [];
  const s = [...prices].sort((a, b) => a - b), lo = s[Math.floor(s.length * 0.05)], hi = s[Math.floor(s.length * 0.95)] || lo;
  const step = Math.max(1, (hi - lo) / 8), out = Array.from({ length: 8 }, (_, i) => ({ from: Math.round(lo + step * i), n: 0 }));
  for (const p of s) { const i = Math.min(7, Math.max(0, Math.floor((p - lo) / step))); out[i].n++; }
  return out;
}
// 검색어 트렌드 (최대 5개, 주 단위 1년 + 월 단위 3년)
async function trend(kws, unit = "week", months = 12) {
  const k = kws.slice(0, 5);
  return cached(`tr:${unit}:${months}:` + hash(k.join(",")), 12 * HOUR, async () => {
    const j = await nv("/v1/datalab/search", { ...range(months), timeUnit: unit, keywordGroups: k.map((x) => ({ groupName: x, keywords: [x] })) });
    return (j.results || []).map((r) => ({ kw: r.title, data: (r.data || []).map((d) => [d.period, d.ratio]) }));
  });
}
// 쇼핑인사이트: 키워드의 성별·나이·기기 (카테고리 번호가 필요해요)
async function audience(cat, kw) {
  return cached("aud:" + cat + ":" + hash(kw), 24 * HOUR, async () => {
    const base = { ...range(12), timeUnit: "month", category: cat, keyword: kw };
    const sum = (j) => { const m = {}; for (const d of j.results?.[0]?.data || []) m[d.group] = (m[d.group] || 0) + d.ratio; const t = Object.values(m).reduce((a, b) => a + b, 0) || 1; return Object.fromEntries(Object.entries(m).map(([g, v]) => [g, Math.round((v / t) * 1000) / 10])); };
    const [g, a, d] = await Promise.all(["gender", "age", "device"].map((x) => nv("/v1/datalab/shopping/category/keyword/" + x, base).then(sum).catch(() => ({}))));
    return { gender: g, age: a, device: d };
  });
}
// 카테고리 흐름: 대분류 11개 (3개씩 묶어 부르고, 같은 묶음 안 비율이라 성장률만 비교해요)
async function catTrend() {
  return cached("cats:" + ymd(new Date()), 24 * HOUR, async () => {
    const out = [];
    for (let i = 0; i < CATS.length; i += 3) {
      const g = CATS.slice(i, i + 3);
      const j = await nv("/v1/datalab/shopping/categories", { ...range(24), timeUnit: "month", category: g.map(([id, name]) => ({ name, param: [id] })) });
      for (const r of j.results || []) out.push({ id: catId(r.title), name: r.title, data: (r.data || []).map((d) => [d.period, d.ratio]) });
    }
    return out.map((c) => ({ ...c, ...growth(c.data, "month") }));
  });
}
// 같은 카테고리 안 키워드 클릭 비교 (최대 5개, 진짜 서로 비교되는 비율)
async function catKeywords(cat, kws) {
  const k = kws.slice(0, 5);
  return cached("ck:" + cat + ":" + hash(k.join(",")), 12 * HOUR, async () => {
    const j = await nv("/v1/datalab/shopping/category/keywords", { ...range(12), timeUnit: "week", category: cat, keyword: k.map((x) => ({ name: x, param: [x] })) });
    return (j.results || []).map((r) => ({ kw: r.title, data: (r.data || []).map((d) => [d.period, d.ratio]) }));
  });
}

// 성장률(최근 3달 ÷ 1년 전 같은 3달)과 성수기 달
function growth(data, unit = "week") {
  if (!data?.length) return { grow: null, peak: [], recent: 0 };
  const per = unit === "week" ? 13 : 3, yr = unit === "week" ? 52 : 12;
  const v = data.map((d) => d[1]), n = v.length;
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const recent = avg(v.slice(n - per)), before = n >= yr + per ? avg(v.slice(n - yr - per, n - yr)) : avg(v.slice(0, per));
  const months = {}; for (const [p, r] of data) { const m = +p.slice(5, 7); (months[m] ||= []).push(r); }
  const mAvg = Object.entries(months).map(([m, a]) => [+m, avg(a)]).sort((a, b) => b[1] - a[1]);
  return { grow: before > 0 ? Math.round((recent / before - 1) * 100) : null, peak: mAvg.slice(0, 3).map(([m]) => m), recent: Math.round(recent * 10) / 10 };
}

// ── 점수 (0~100): 수요 30 · 경쟁 30 · 성장 20 · 광고 10 · 내 조건 10
export function score(x, prof = {}) {
  const parts = {};
  const v = x.vol || 0;
  parts.demand = v ? Math.max(0, Math.min(30, Math.round((Math.log10(v) - 2) * 10))) : 0; // 100회=0, 1천=10, 1만=20, 10만=30
  const ratio = v && x.total ? x.total / v : null; x.ratio = ratio == null ? null : Math.round(ratio * 10) / 10;
  parts.comp = ratio == null ? 10 : ratio < 0.5 ? 30 : ratio < 1 ? 26 : ratio < 3 ? 20 : ratio < 10 ? 12 : ratio < 30 ? 6 : 2;
  parts.grow = x.grow == null ? 10 : Math.max(0, Math.min(20, Math.round(10 + x.grow / 5)));
  parts.ads = { "낮음": 10, "중간": 6, "높음": 2 }[x.comp] ?? 5;
  let fit = 5;
  const p = x.price?.med || 0;
  if (prof.pmin || prof.pmax) fit += p && (!prof.pmin || p >= prof.pmin) && (!prof.pmax || p <= prof.pmax) ? 3 : -3;
  if (prof.cats?.length && x.cat1) fit += prof.cats.includes(x.cat1) ? 2 : -2;
  if (prof.avoid?.some((w) => w && (x.kw || "").includes(w))) fit = 0;
  parts.fit = Math.max(0, Math.min(10, fit));
  x.parts = parts; x.score = Object.values(parts).reduce((a, b) => a + b, 0);
  return x;
}

// 키워드 하나 자세히
async function analyze(kw, prof) {
  const [rel, shop, tw, tm] = await Promise.all([
    AD() ? related([kw]).catch((e) => ({ error: e.message })) : null,
    shopInfo(kw),
    trend([kw], "week", 12).catch(() => []),
    trend([kw], "month", 36).catch(() => []),
  ]);
  const me = Array.isArray(rel) ? rel.find((r) => r.kw.replace(/\s/g, "") === kw.replace(/\s/g, "")) || null : null;
  const cat = catId(shop.cat1);
  const aud = cat ? await audience(cat, kw).catch(() => null) : null;
  const g = growth(tm[0]?.data || [], "month");
  const x = score({ kw, vol: me?.vol || 0, pc: me?.pc || 0, mo: me?.mo || 0, clk: me?.clk || 0, comp: me?.comp || "", total: shop.total, price: shop.price, cat1: shop.cat1, grow: g.grow }, prof);
  return {
    ...x, peak: g.peak, shop, aud, cat, week: tw[0]?.data || [], month: tm[0]?.data || [],
    related: Array.isArray(rel) ? rel.filter((r) => r !== me).sort((a, b) => b.vol - a.vol).slice(0, 60) : [], relError: rel?.error || null,
  };
}

// 내 조건으로 추천: 씨앗 키워드 → 연관 키워드 수백 개 → 검색량·광고 경쟁으로 1차 → 쇼핑 검색으로 2차 → 트렌드로 마무리
async function recommend(prof) {
  if (!AD()) return { needAd: true, list: [] };
  const seeds = (prof.seeds || []).filter(Boolean).slice(0, 15);
  if (!seeds.length) return { list: [], msg: "씨앗 키워드를 1개 이상 넣어 주세요" };
  const pool = new Map();
  for (let i = 0; i < seeds.length; i += 5) for (const r of await related(seeds.slice(i, i + 5))) if (!pool.has(r.kw)) pool.set(r.kw, r);
  const vmin = prof.vmin ?? 1000, vmax = prof.vmax ?? 100000;
  let cand = [...pool.values()].filter((r) => r.vol >= vmin && r.vol <= vmax && !(prof.avoid || []).some((w) => w && r.kw.includes(w)));
  const adw = { "낮음": 1.4, "중간": 1, "높음": 0.6 };
  cand = cand.sort((a, b) => b.vol * (adw[b.comp] || 1) - a.vol * (adw[a.comp] || 1)).slice(0, 40);
  const shops = []; for (let i = 0; i < cand.length; i += 8) shops.push(...(await Promise.all(cand.slice(i, i + 8).map((c) => shopInfo(c.kw).catch(() => null)))));
  let list = cand.map((c, i) => shops[i] && score({ ...c, total: shops[i].total, price: shops[i].price, cat1: shops[i].cat1, topCat: shops[i].topCat, img: shops[i].top[0]?.img || "", grow: null }, prof)).filter(Boolean);
  list = list.sort((a, b) => b.score - a.score).slice(0, 20);
  for (let i = 0; i < list.length; i += 5) {
    const t = await trend(list.slice(i, i + 5).map((x) => x.kw), "month", 24).catch(() => []);
    for (const r of t) { const x = list.find((y) => y.kw === r.kw); if (x) { Object.assign(x, growth(r.data, "month")); x.spark = r.data.map((d) => d[1]); score(x, prof); } }
  }
  return { list: list.sort((a, b) => b.score - a.score), pool: pool.size, checked: cand.length, at: Date.now() };
}

// ── 예시 자료 (키가 없을 때 화면이 어떻게 보이는지만)
function demoAnalyze(kw) {
  const wk = Array.from({ length: 52 }, (_, i) => [ymd(new Date(Date.now() - (51 - i) * 7 * 864e5)), Math.round(40 + 30 * Math.sin(i / 8) + i / 2)]);
  const mo = Array.from({ length: 36 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 35 + i, 1); return [ymd(d), Math.round(50 + 35 * Math.cos(((d.getMonth() - 0) / 12) * 2 * Math.PI) + i / 3)]; });
  const x = score({ kw, vol: 24300, pc: 4100, mo: 20200, clk: 312.4, comp: "중간", total: 51230, price: { min: 9900, q1: 29800, med: 45900, q3: 69000, max: 189000 }, cat1: "가구/인테리어", grow: 18 });
  return { ...x, demo: true, peak: [12, 1, 11], cat: "50000004", week: wk, month: mo,
    shop: { total: 51230, n: 100, price: x.price, priceBins: [9900, 22000, 34000, 46000, 58000, 70000, 82000, 94000].map((f, i) => ({ from: f, n: [6, 14, 22, 25, 15, 9, 6, 3][i] })), topMalls: [{ name: "네이버", n: 31 }, { name: "예시몰A", n: 8 }, { name: "예시몰B", n: 6 }], topCat: "가구/인테리어 > 침구단품 > 이불", cat1: "가구/인테리어", naverMall: 31, top: [] },
    aud: { gender: { f: 71.2, m: 28.8 }, age: { 20: 12.1, 30: 33.4, 40: 31.2, 50: 15.8, 60: 7.5 }, device: { mo: 82.3, pc: 17.7 } },
    related: ["예시 연관 1", "예시 연관 2", "예시 연관 3", "예시 연관 4", "예시 연관 5"].map((k, i) => ({ kw: k, vol: 18000 - i * 3100, pc: 2000, mo: 16000 - i * 3100, clk: 120 - i * 15, comp: ["높음", "중간", "낮음", "중간", "낮음"][i], depth: 15 })) };
}
function demoRecommend(prof) {
  const names = ["예시 키워드 가", "예시 키워드 나", "예시 키워드 다", "예시 키워드 라", "예시 키워드 마", "예시 키워드 바"];
  const list = names.map((kw, i) => score({ kw, vol: 30000 - i * 4200, comp: ["낮음", "중간", "낮음", "높음", "중간", "낮음"][i], total: [8000, 40000, 15000, 300000, 90000, 2000][i], price: { med: [39000, 59000, 25000, 89000, 45000, 32000][i] }, cat1: "가구/인테리어", topCat: "가구/인테리어 > 침구단품", grow: [35, 10, -5, 22, 0, 60][i], peak: [12, 1, 2], spark: Array.from({ length: 24 }, (_, j) => 40 + ((j * (i + 3)) % 30)) }, prof));
  return { demo: true, list: list.sort((a, b) => b.score - a.score), pool: 612, checked: 40, at: Date.now() };
}
function demoCats() {
  return CATS.map(([id, name], i) => { const data = Array.from({ length: 24 }, (_, j) => { const d = new Date(); d.setMonth(d.getMonth() - 23 + j, 1); return [ymd(d), Math.round(30 + ((i * 7 + j * (i % 4 + 1)) % 50))]; }); return { id, name, data, ...growth(data, "month") }; });
}

const DEF_PROF = { seeds: [], cats: [], pmin: 0, pmax: 0, vmin: 1000, vmax: 100000, avoid: [], memo: "" };
async function getProf() { if (!hasRedis()) return DEF_PROF; const [v] = await redis([["GET", "shop:prof"]]); return { ...DEF_PROF, ...(json(v) || {}) }; }

export default async function shop(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const admin = !!process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  if (!admin) return res.status(401).json({ error: "auth" });
  const q = { ...(req.query || {}), ...(typeof req.body === "object" && req.body ? req.body : {}) };
  const op = q.op || "status";
  const live = !!NV();
  try {
    if (op === "status") return res.json({ naver: live, searchad: !!AD(), redis: hasRedis(), cats: CATS });
    if (op === "prof") {
      if (req.method === "POST" && q.prof) {
        const p = q.prof, list = (a) => (Array.isArray(a) ? a : String(a || "").split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
        const prof = { seeds: list(p.seeds), cats: list(p.cats), avoid: list(p.avoid), pmin: +p.pmin || 0, pmax: +p.pmax || 0, vmin: +p.vmin || 0, vmax: +p.vmax || 0, memo: String(p.memo || "").slice(0, 2000) };
        if (hasRedis()) await redis([["SET", "shop:prof", JSON.stringify(prof)]]);
        return res.json({ ok: true, prof });
      }
      return res.json({ prof: await getProf() });
    }
    if (op === "kw") {
      const kw = String(q.kw || "").trim().slice(0, 40); if (!kw) return res.status(400).json({ error: "kw" });
      const prof = await getProf();
      return res.json(live ? await analyze(kw, prof) : demoAnalyze(kw));
    }
    if (op === "compare") { // 여러 키워드 한 그래프 (검색 트렌드)
      const kws = String(q.kws || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
      if (!live) return res.json({ demo: true, list: kws.map((kw, i) => ({ kw, data: demoAnalyze(kw).week.map(([p, r]) => [p, Math.max(1, r - i * 9)]) })) });
      const [tr, ck] = await Promise.all([trend(kws, "week", 12), q.cat ? catKeywords(String(q.cat), kws).catch(() => null) : null]);
      return res.json({ list: tr, click: ck });
    }
    if (op === "cats") return res.json({ list: live ? await catTrend() : demoCats(), demo: !live });
    if (op === "rec") {
      const prof = await getProf();
      if (!live || !AD()) return res.json({ ...demoRecommend(prof), needAd: !AD(), needNv: !live });
      const out = await recommend(prof);
      if (hasRedis() && out.list?.length) await redis([["SET", "shop:lastrec", JSON.stringify(out)]]);
      return res.json(out);
    }
    if (op === "lastrec") { const [v] = hasRedis() ? await redis([["GET", "shop:lastrec"]]) : [null]; return res.json(json(v) || { list: [] }); }
    if (op === "picks") { // 찜 목록
      if (req.method === "POST") {
        if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
        const [v] = await redis([["GET", "shop:picks"]]); let picks = json(v) || [];
        if (q.add) { const a = q.add; picks = picks.filter((p) => p.kw !== a.kw); picks.unshift({ kw: String(a.kw).slice(0, 40), score: +a.score || 0, vol: +a.vol || 0, ratio: a.ratio ?? null, grow: a.grow ?? null, price: +a.price || 0, note: String(a.note || "").slice(0, 300), status: a.status || "후보", at: Date.now() }); }
        if (q.upd) picks = picks.map((p) => (p.kw === q.upd.kw ? { ...p, ...(q.upd.note != null ? { note: String(q.upd.note).slice(0, 300) } : {}), ...(q.upd.status ? { status: String(q.upd.status).slice(0, 10) } : {}) } : p));
        if (q.del) picks = picks.filter((p) => p.kw !== q.del);
        await redis([["SET", "shop:picks", JSON.stringify(picks.slice(0, 200))]]);
        return res.json({ picks });
      }
      const [v] = hasRedis() ? await redis([["GET", "shop:picks"]]) : [null];
      return res.json({ picks: json(v) || [] });
    }
    return res.status(400).json({ error: "op" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: String(e?.message || e).slice(0, 200) });
  }
}
