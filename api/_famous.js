import { createHash } from "node:crypto";
// 유명인 포트폴리오: 미국 SEC 13F(분기, 45일 늦음) + ARK(매일 공개)
// 매일 아침 cron에서 새 공시가 있는지만 보고, 바뀐 것만 다시 받음.
import { claude, aiRid } from "./_ai.js";
import { redis } from "./_redis.js";
import { recordUsage } from "./_usage.js";

// SEC는 연락처가 담긴 User-Agent를 요구함 (Vercel env SEC_UA로 바꿀 수 있음)
// SEC는 '이름 + 이메일' 꼴이 아니면 403으로 막아요. 그래서 연락처 꼴을 넣고, 그래도 막히면 고정 IP 프록시로 한 번 더 시도해요.
const SEC_UA = { "User-Agent": process.env.SEC_UA || "AI-leehyun Research admin@ai-leehyun.vercel.app", Accept: "application/json, text/xml, */*", "Accept-Encoding": "gzip, deflate" };
let secAgent;
export async function secFetch(url) {
  let r, e1;
  try { r = await fetch(url, { headers: SEC_UA }); if (r.ok) return r; } catch (e) { e1 = e; }
  if (process.env.OUTBOUND_PROXY_URL) {
    const { ProxyAgent, fetch: uf } = await import("undici"); secAgent ||= new ProxyAgent(process.env.OUTBOUND_PROXY_URL);
    try { const r2 = await uf(url, { headers: SEC_UA, dispatcher: secAgent }); if (r2.ok) return r2; throw new Error(`sec ${r?.status || "net"}/proxy ${r2.status}`); } catch (e) { throw new Error(String(e?.message || e).startsWith("sec ") ? e.message : `sec ${r?.status || e1?.message || "net"}/proxy ${e?.message || e}`); }
  }
  throw new Error(`sec ${r?.status || e1?.message || "net"}`);
}
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
  { id: "c1061768", who: "세스 클라만", fund: "바우포스트", cik: 1061768, note: "'안전마진' 저자." },
  { id: "c1079114", who: "데이비드 아인혼", fund: "그린라이트", cik: 1079114, note: "가치투자와 공매도를 함께 하는 투자자." },
  { id: "c1040273", who: "댄 로브", fund: "써드 포인트", cik: 1040273, note: "날카로운 주주 서한으로 유명한 행동주의 헤지펀드 매니저예요." },
  { id: "c1167483", who: "체이스 콜먼", fund: "타이거 글로벌", cik: 1167483, note: "줄리언 로버트슨의 '타이거 새끼' 중 하나." },
  { id: "c1135730", who: "필립 라폰트", fund: "코투", cik: 1135730, note: "기술주 중심 헤지펀드." },
  { id: "c1061165", who: "스티븐 맨델", fund: "론 파인", cik: 1061165, note: "타이거 출신 성장주 투자자." },
  { id: "c1103804", who: "안드레아스 할보르센", fund: "바이킹 글로벌", cik: 1103804, note: "타이거 출신." },
  { id: "c1656456", who: "데이비드 테퍼", fund: "아팔루사", cik: 1656456, note: "2009년 금융위기 바닥에서 은행주를 사서 큰돈을 번 투자자." },
  { id: "c1029160", who: "조지 소로스", fund: "소로스 펀드", cik: 1029160, note: "'영란은행을 무너뜨린 남자'." },
  { id: "c921669", who: "칼 아이칸", fund: "아이칸 엔터프라이즈", cik: 921669, note: "기업 사냥꾼으로 불린 원조 행동주의 투자자예요." },
  { id: "c1791786", who: "폴 싱어", fund: "엘리엇", cik: 1791786, note: "강경한 행동주의 펀드." },
  { id: "c1166559", who: "게이츠 재단 신탁", fund: "게이츠 재단 신탁", cik: 1166559, note: "빌 게이츠 재단의 투자 자산." },
  { id: "c1112520", who: "척 애크리", fund: "에이크 캐피털", cik: 1112520, note: "'복리 기계' 같은 우량 기업을 오래 들고 가는 투자자예요." },
  { id: "c1569205", who: "테리 스미스", fund: "펀드스미스", cik: 1569205, note: "'좋은 회사를 사고, 비싸게 사지 말고, 아무것도 하지 마라'로 유명한 영국 투자자예요." },
  { id: "c1096343", who: "토머스 게이너", fund: "마켈", cik: 1096343, note: "'작은 버크셔'로 불리는 보험·투자 회사예요." },
  { id: "c1418814", who: "밸류액트 캐피털", fund: "밸류액트 캐피털", cik: 1418814, note: "조용한 행동주의 펀드." },
  { id: "c1345471", who: "넬슨 펠츠", fund: "트라이언", cik: 1345471, note: "소비재 기업에 들어가 경영 개선을 요구하는 행동주의 투자자예요." },
  { id: "c934639", who: "리 에인슬리", fund: "매버릭", cik: 934639, note: "타이거 출신 롱숏 헤지펀드예요." },
  { id: "c1720792", who: "루안 커니프 (세쿼이아 펀드)", fund: "루안 커니프 (세쿼이아 펀드)", cik: 1720792, note: "버핏이 추천했던 세쿼이아 펀드를 운용하는 가치투자 회사예요." },
  { id: "c1034524", who: "폴렌 캐피털", fund: "폴렌 캐피털", cik: 1034524, note: "소수 우량 성장주 집중 투자 회사예요." },
  { id: "c1088875", who: "베일리 기포드", fund: "베일리 기포드", cik: 1088875, note: "테슬라·엔비디아 초기 투자로 유명한 영국의 장기 성장주 투자 회사예요." },
  { id: "c1697748", who: "캐시 우드", fund: "ARK 인베스트", cik: 1697748, note: "파괴적 혁신(AI·로봇·유전체·핀테크)에 투자하는 ETF 운용사." },
  { id: "c1541617", who: "브래드 거스트너", fund: "알티미터", cik: 1541617, note: "기술·AI 성장주 투자자." },
  { id: "c1358706", who: "데이비드 에이브럼스", fund: "에이브럼스 캐피털", cik: 1358706, note: "바우포스트 출신의 조용한 가치투자자예요." },
  { id: "c732905", who: "트위디 브라운", fund: "트위디 브라운", cik: 732905, note: "벤저민 그레이엄과 인연이 깊은 오래된 가치투자 회사예요." },
  { id: "c1325447", who: "퍼스트 이글", fund: "퍼스트 이글", cik: 1325447, note: "금과 가치주를 함께 담는 보수적인 운용사예요." },
  { id: "c905567", who: "야크트먼 자산운용", fund: "야크트먼 자산운용", cik: 905567, note: "우량 소비재 중심의 가치투자 회사예요." },
  { id: "c807985", who: "사우스이스턴 (롱리프)", fund: "사우스이스턴 (롱리프)", cik: 807985, note: "집중 가치투자 회사예요." },
  { id: "c200217", who: "다지 앤 콕스", fund: "다지 앤 콕스", cik: 200217, note: "1930년 설립된 대형 가치투자 운용사예요." },
  { id: "c813917", who: "해리스 어소시에이츠 (오크마크)", fund: "해리스 어소시에이츠 (오크마크)", cik: 813917, note: "빌 나이그렌이 이끄는 가치투자 운용사예요." },
  { id: "c1631014", who: "알타록 파트너스", fund: "알타록 파트너스", cik: 1631014, note: "소수 종목 집중 장기 투자 회사예요." },
  { id: "c1647251", who: "크리스 혼", fund: "TCI", cik: 1647251, note: "'어린이 투자 펀드'." },
  { id: "c1759760", who: "돤융핑", fund: "H&H", cik: 1759760, note: "'중국의 버핏'." },
  { id: "c1549575", who: "모니시 파브라이", fund: "달랄 스트리트", cik: 1549575, note: "버핏 '클로닝'을 공개적으로 말하는 가치투자자." },
  { id: "c1056831", who: "브루스 버코위츠", fund: "페어홈", cik: 1056831, note: "역발상 집중 투자자." },
  { id: "c1138995", who: "래리 로빈스", fund: "글렌뷰", cik: 1138995, note: "헬스케어 등에 강한 헤지펀드예요." },
  { id: "c1517137", who: "제프 스미스", fund: "스타보드 밸류", cik: 1517137, note: "이사회 교체를 요구하는 행동주의 펀드예요." },
  { id: "c1403528", who: "하워드 막스", fund: "오크트리", cik: 1403528, note: "'투자에 대한 생각' 저자." },
  { id: "c1798849", who: "헨리 엘런보겐", fund: "듀러블 캐피털", cik: 1798849, note: "성장주 중심 투자자예요." },
  { id: "ark", who: "캐시 우드", fund: "ARK 이노베이션 ETF (ARKK)", ark: "ARK_INNOVATION_ETF_ARKK_HOLDINGS", note: "매일 보유 종목을 공개해요" },
];

const pad = (n) => String(n).padStart(10, "0");
export async function secJson(url) { return (await secFetch(url)).json(); }
async function secText(url) { return (await secFetch(url)).text(); }

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

export async function filing13F(cik, acc) {
  const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}`;
  const idx = await secJson(`${dir}/index.json`); await sleep(150);
  const xmls = (idx?.directory?.item || []).map((x) => x.name).filter((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  for (const n of xmls) { const t = await secText(`${dir}/${n}`); await sleep(150); if (/infoTable/i.test(t)) return parseInfoTable(t); }
  return [];
}

// 지난 분기와 비교해서 새로 산 것 / 늘린 것 / 줄인 것 / 다 판 것
export function diff(cur, prev) {
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
export async function famousRefresh(force, budget = 50e3) {
  const res = {}, t0 = Date.now();
  // 사람이 많아서 한 번에 다 못 하면, 자료 없는 사람 → 오래된 사람 순으로 시간 안에 되는 만큼 (다음 번에 이어서)
  const vals = await redis([...FAMOUS.map((f) => ["GET", "stk:fam:" + f.id]), ["GET", "stk:f13meta"]]), fix = json(vals.pop())?.fix || {};
  const age = (i) => { const d = json(vals[i]); return d ? d.at || 0 : -1; };
  const order = FAMOUS.map((f, i) => ({ f: f.cik && fix[f.cik] ? { ...f, cik: fix[f.cik] } : f, a: age(i) })).sort((x, y) => x.a - y.a).map((x) => x.f);
  for (const f of order) { if (Date.now() - t0 > budget) { res[f.id] = "다음에"; continue; } try { const o = f.ark ? await refreshArk(f) : await refresh13F(f, force); res[f.id] = o.acc || o.day; } catch (e) { res[f.id] = "err:" + String(e?.message || e).slice(0, 60); } }
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
export async function koMap(names) {
  const [c] = await redis([["GET", "stk:konames"]]); const M = json(c) || {};
  const miss = [...new Set(names.filter((n) => n && !(n in M)))].slice(0, 300);
  // 같은 이름 묶음은 6시간에 한 번만 요청 (구독 접수함에 같은 일이 쌓이지 않게)
  const pk = "stk:kopend:" + createHash("sha1").update(miss.join("|")).digest("hex").slice(0, 16);
  const me = aiRid() || "x", [setOk, cur] = miss.length ? await redis([["SET", pk, me, "NX", "EX", "21600"], ["GET", pk]]) : [null, null];
  if (miss.length && (setOk || cur === me)) {
    try {
      const model = process.env.STOCK_MODEL || "claude-sonnet-5-5";
      const msg = await claude({ model, max_tokens: 8000, output_config: { effort: "low" }, messages: [{ role: "user", content: `미국 증권 공시에 나온 회사·ETF 이름이에요. 한국 투자자가 흔히 부르는 한글 이름으로 바꿔 주세요 (예: APPLE INC → 애플, AMERICAN EXPRESS CO → 아메리칸 익스프레스, SPDR S&P 500 ETF TR → SPDR S&P500 ETF). 모르는 회사는 영어 발음대로 한글로 적어 주세요.
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
