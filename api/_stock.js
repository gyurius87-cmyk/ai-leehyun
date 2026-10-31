// 주식 프로그램 (이현님 전용). 지수·매크로·뉴스·오늘의 정리(Claude)·대가 7명 모의 매매·내 계좌·복기.
// 시세는 야후 파이낸스 차트(키 필요 없음), 미국 경제지표는 FRED CSV(키 필요 없음), 뉴스는 구글 뉴스 RSS.
// 저장(Redis): stk:snap (시세 10분), stk:news (1시간), stk:brief:<날짜> (오늘의 정리), stk:bt2:<날짜> (대가 모의 매매),
//              stk:acct (내 계좌), stk:trades (내 매매 기록)
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { redis, kstDay } from "./_redis.js";
import { recordUsage } from "./_usage.js";
import { kwReady, kwSync, outIp, kwChart, kwChartable } from "./_kiwoom.js";
import { famousAll, famousRefresh } from "./_famous.js";
import { ytAll, ytSync, ytAdd, ytDel, ytOne, ytSeen } from "./_ytstock.js";
import { socialGet, socialSync } from "./_social.js";

const MODEL = process.env.STOCK_MODEL || "claude-sonnet-5-5";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").slice(0, n);
const r2 = (v, d = 2) => (v == null || !isFinite(v) ? null : +v.toFixed(d));

// ── 지켜볼 것들
export const INDICES = [
  { s: "^IXIC", n: "나스닥" }, { s: "^SOX", n: "필라델피아 반도체" }, { s: "^GSPC", n: "S&P 500" },
  { s: "^KS11", n: "코스피" }, { s: "^KQ11", n: "코스닥" },
];
const MACRO_Y = [
  { s: "^TNX", n: "미국 10년물 금리", u: "%", g: "금리", why: "주식 할인율. 오르면 성장주(나스닥)에 부담" },
  { s: "^IRX", n: "미국 3개월물 금리", u: "%", g: "금리", why: "연준 기준금리 기대를 거의 그대로 따라가요" },
  { s: "DX-Y.NYB", n: "달러 인덱스", u: "", g: "환율", why: "달러가 강하면 신흥국(한국) 주식에서 돈이 빠지기 쉬워요" },
  { s: "KRW=X", n: "원/달러 환율", u: "원", g: "환율", why: "오르면(원화 약세) 외국인 매도 압력, 수출주에는 도움" },
  { s: "^VIX", n: "VIX 공포지수", u: "", g: "심리", why: "20 위는 불안, 30 위는 공포. 대가들이 사는 때이기도 해요" },
  { s: "CL=F", n: "WTI 유가", u: "$", g: "원자재", why: "물가와 금리를 다시 밀어 올릴 수 있어요" },
  { s: "GC=F", n: "금", u: "$", g: "원자재", why: "불안할 때 오르는 안전자산" },
  { s: "HG=F", n: "구리", u: "$", g: "원자재", why: "'닥터 코퍼'. 경기가 좋아지면 먼저 올라요" },
  { s: "BTC-USD", n: "비트코인", u: "$", g: "심리", why: "시장에 도는 돈(유동성)과 위험 선호를 보여줘요" },
];
const MACRO_F = [
  { id: "DGS2", n: "미국 2년물 금리", u: "%", g: "금리", why: "연준 정책 기대에 가장 민감한 금리" },
  { id: "T10Y2Y", n: "장단기 금리차 (10년-2년)", u: "%p", g: "금리", why: "마이너스(역전)는 경기침체 신호로 봐요" },
  { id: "DFF", n: "미국 기준금리 (실효)", u: "%", g: "금리", why: "연준이 정한 돈의 값" },
  { id: "CPIAUCSL", n: "미국 소비자물가 (전년비)", u: "%", g: "물가", yoy: true, why: "물가가 잡혀야 금리를 내릴 수 있어요" },
  { id: "UNRATE", n: "미국 실업률", u: "%", g: "경기", why: "빠르게 오르면 경기침체 경고" },
  { id: "BAMLH0A0HYM2", n: "하이일드 스프레드", u: "%p", g: "심리", why: "벌어지면 회사채 시장이 겁먹었다는 뜻" },
];

// ── 야후 일봉
export async function chart(sym, range = "1y", iv = "1d") {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${iv}&includePrePost=false`, { headers: UA });
      if (!r.ok) continue;
      const j = await r.json(), x = j?.chart?.result?.[0]; if (!x?.timestamp) continue;
      const q = x.indicators.quote[0], out = [];
      x.timestamp.forEach((t, i) => { const c = q.close[i]; if (c != null) out.push({ d: kstDay(new Date(t * 1000)), c, v: q.volume?.[i] || 0 }); });
      // 같은 날짜가 두 번이면 뒤의 것
      const m = new Map(); out.forEach((p) => m.set(p.d, p));
      return { sym, cur: x.meta?.currency || "", name: x.meta?.shortName || x.meta?.longName || "", price: x.meta?.regularMarketPrice ?? out.at(-1)?.c, prev: x.meta?.chartPreviousClose, rows: [...m.values()] };
    } catch {}
  }
  return null;
}
export async function fred(id, from = "2023-01-01") {
  try {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${from}`, { headers: UA });
    if (!r.ok) return null;
    return (await r.text()).trim().split("\n").slice(1).map((l) => l.split(",")).filter(([, v]) => v && v !== ".").map(([d, v]) => ({ d, c: +v }));
  } catch { return null; }
}
const chg = (rows, back) => { const n = rows.length; if (n <= back) return null; const a = rows[n - 1 - back].c, b = rows[n - 1].c; return a ? r2(((b - a) / a) * 100) : null; };
const spark = (rows, n = 60) => rows.slice(-n).map((p) => r2(p.c, 4));

// ── 시세 한눈에 (10분 캐시)
export async function snapshot(force) {
  if (!force) { const [c] = await redis([["GET", "stk:snap"]]); const j = json(c); if (j && Date.now() - j.at < 10 * 60e3) return j; }
  const [ix, my, mf] = await Promise.all([
    Promise.all(INDICES.map((x) => chart(x.s, "1y"))),
    Promise.all(MACRO_Y.map((x) => chart(x.s, "6mo"))),
    Promise.all(MACRO_F.map((x) => fred(x.id))),
  ]);
  const row = (meta, rows) => {
    if (!rows?.length) return { ...meta, err: true };
    const last = rows.at(-1), hi = Math.max(...rows.slice(-250).map((p) => p.c));
    return { ...meta, d: last.d, v: r2(last.c, 4), d1: chg(rows, 1), w1: chg(rows, 5), m1: chg(rows, 21), fromHi: r2(((last.c - hi) / hi) * 100), sp: spark(rows) };
  };
  const out = {
    at: Date.now(),
    indices: INDICES.map((m, i) => row(m, ix[i]?.rows)),
    macro: [
      ...MACRO_Y.map((m, i) => row(m, my[i]?.rows)),
      ...MACRO_F.map((m, i) => {
        let rows = mf[i];
        if (rows && m.yoy) rows = rows.map((p, k) => (k >= 12 ? { d: p.d, c: ((p.c - rows[k - 12].c) / rows[k - 12].c) * 100 } : null)).filter(Boolean);
        if (!rows?.length) return { ...m, s: m.id, err: true };
        const last = rows.at(-1), prev = rows.at(-2);
        return { ...m, s: m.id, d: last.d, v: r2(last.c, 3), d1: prev ? r2(last.c - prev.c, 3) : null, abs: true, sp: spark(rows, 40) };
      }),
    ],
  };
  await redis([["SET", "stk:snap", JSON.stringify(out)]]);
  return out;
}

// ── 세계 지수 (매크로 탭, 10분 캐시)
export const WORLD = [
  { s: "^GSPC", n: "S&P 500", r: "미국" }, { s: "^IXIC", n: "나스닥", r: "미국" }, { s: "^NDX", n: "나스닥 100", r: "미국" }, { s: "^DJI", n: "다우", r: "미국" }, { s: "^RUT", n: "러셀 2000", r: "미국" }, { s: "^SOX", n: "필라델피아 반도체", r: "미국" },
  { s: "^KS11", n: "코스피", r: "한국" }, { s: "^KQ11", n: "코스닥", r: "한국" }, { s: "^KS200", n: "코스피 200", r: "한국" },
  { s: "^N225", n: "닛케이 225", r: "아시아" }, { s: "^HSI", n: "홍콩 항셍", r: "아시아" }, { s: "000001.SS", n: "상해종합", r: "아시아" }, { s: "399001.SZ", n: "선전성분", r: "아시아" }, { s: "^TWII", n: "대만 가권", r: "아시아" }, { s: "^BSESN", n: "인도 센섹스", r: "아시아" }, { s: "^NSEI", n: "인도 니프티 50", r: "아시아" }, { s: "^STI", n: "싱가포르 STI", r: "아시아" }, { s: "^AXJO", n: "호주 ASX 200", r: "아시아" },
  { s: "^STOXX50E", n: "유로스톡스 50", r: "유럽" }, { s: "^GDAXI", n: "독일 DAX", r: "유럽" }, { s: "^FTSE", n: "영국 FTSE 100", r: "유럽" }, { s: "^FCHI", n: "프랑스 CAC 40", r: "유럽" },
  { s: "^GSPTSE", n: "캐나다 TSX", r: "기타" }, { s: "^BVSP", n: "브라질 보베스파", r: "기타" }, { s: "^MXX", n: "멕시코 IPC", r: "기타" },
];
const ytd = (rows) => { const y = rows.at(-1).d.slice(0, 4), b = [...rows].reverse().find((p) => p.d.slice(0, 4) < y); return b ? r2(((rows.at(-1).c - b.c) / b.c) * 100) : null; };
const wrow = (meta, g) => {
  const rows = g?.rows; if (!rows?.length) return { ...meta, err: true };
  const last = rows.at(-1), hi = Math.max(...rows.slice(-250).map((p) => p.c));
  return { ...meta, cur: g.cur, d: last.d, v: r2(last.c, 4), d1: chg(rows, 1), w1: chg(rows, 5), m1: chg(rows, 21), m3: chg(rows, 63), ytd: ytd(rows), y1: chg(rows, Math.min(250, rows.length - 1)), fromHi: r2(((last.c - hi) / hi) * 100), sp: spark(rows) };
};
async function inChunks(list, fn, n = 9) { const out = []; for (let i = 0; i < list.length; i += n) out.push(...(await Promise.all(list.slice(i, i + n).map(fn)))); return out; }
export async function world(force, extra = []) {
  let base = null;
  if (!force) { const [c] = await redis([["GET", "stk:world"]]); const j = json(c); if (j && Date.now() - j.at < 10 * 60e3) base = j; }
  if (!base) {
    const gs = await inChunks(WORLD, (x) => chart(x.s, "2y"));
    base = { at: Date.now(), rows: WORLD.map((m, i) => wrow(m, gs[i])) };
    await redis([["SET", "stk:world", JSON.stringify(base)]]);
  }
  const ex = extra.filter((s) => !WORLD.some((w) => w.s === s)).slice(0, 12);
  const eg = await inChunks(ex, (s) => chart(s, "2y"));
  return { ...base, mine: ex.map((s, i) => wrow({ s, n: eg[i]?.name || s, r: "내 관심" }, eg[i])) };
}

// ── 뉴스 (1시간 캐시): 굵직한 매체 헤드라인
const NEWS_SRC = [
  { name: "Reuters", site: "reuters.com", lang: "en" }, { name: "CNBC", site: "cnbc.com", lang: "en" },
  { name: "Bloomberg", site: "bloomberg.com", lang: "en" }, { name: "WSJ", site: "wsj.com", lang: "en" },
  { name: "MarketWatch", site: "marketwatch.com", lang: "en" },
  { name: "한국경제", site: "hankyung.com", lang: "ko" }, { name: "매일경제", site: "mk.co.kr", lang: "ko" },
  { name: "연합인포맥스", site: "news.einfomax.co.kr", lang: "ko" }, { name: "이데일리", site: "edaily.co.kr", lang: "ko" },
];
const unxml = (s) => String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unxml(m[1].trim()) : ""; };
export async function news(force) {
  if (!force) { const [c] = await redis([["GET", "stk:news"]]); const j = json(c); if (j && Date.now() - j.at < 60 * 60e3) return j; }
  const lists = await Promise.all(NEWS_SRC.map(async (s) => {
    const q = s.lang === "ko" ? `site:${s.site} (증시 OR 코스피 OR 나스닥 OR 금리 OR 환율 OR 반도체) when:1d` : `site:${s.site} (stocks OR "Wall Street" OR Nasdaq OR Fed OR yields OR analyst) when:1d`;
    const url = s.lang === "ko" ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko` : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const r = await fetch(url, { headers: UA }); if (!r.ok) return [];
      const xml = await r.text();
      return xml.split("<item>").slice(1, 9).map((it) => ({ src: s.name, lang: s.lang, title: tag(it, "title").replace(/\s+-\s+[^-]+$/, ""), link: tag(it, "link"), at: Date.parse(tag(it, "pubDate")) || 0 })).filter((x) => x.title);
    } catch { return []; }
  }));
  const seen = new Set(), items = lists.flat().filter((x) => { const k = x.title.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.at - a.at).slice(0, 60);
  const out = { at: Date.now(), items };
  await redis([["SET", "stk:news", JSON.stringify(out)]]);
  return out;
}

// ── 대가 7명: 성격·매매법 (모의 매매 규칙과 오늘의 한마디에 같이 씀)
export const MASTERS = [
  { id: "buffett", name: "워런 버핏", style: "가치투자 · 좋은 기업을 싸게 사서 오래", voice: "느긋하고 유머 있는 오마하 할아버지. 비유를 즐기고, 시장 예측은 안 한다고 말함. '남들이 겁낼 때 욕심내라', '10년 갖고 있을 게 아니면 10분도 갖지 마라'.", rule: "애플·코카콜라·아메리칸익스프레스·버크셔·코스트코·삼성전자를 처음에 60% 사고 40%는 현금. 52주 고점에서 15% 넘게 빠진 종목은 한 달에 한 번 전체의 10%씩 더 삼. 거의 팔지 않고, 한 종목이 35%를 넘으면 30%로 줄임." },
  { id: "lynch", name: "피터 린치", style: "성장주 · 생활 속에서 찾은 10루타", voice: "친근하고 수다스러운 이웃집 펀드매니저. 쇼핑몰·생활에서 아이디어를 얻음. '아는 것에 투자하라', '주가가 아니라 기업을 보라'.", rule: "엔비디아·코스트코·아마존·현대차·SK하이닉스·마이크로소프트·브로드컴 중 200일선 위에서 6개월 상승률이 높은 5개를 분기마다 고르고 똑같이 나눠 담음. 200일선을 10% 넘게 깨면 '이야기가 바뀌었다'며 팜." },
  { id: "oneil", name: "윌리엄 오닐", style: "CAN SLIM · 신고가 돌파 매수, 8% 손절", voice: "규칙에 엄격한 차트 장인. 숫자로 말함. '손실은 7~8%에서 무조건 자른다', '시장 방향(M)이 먼저다', '신고가는 더 오른다'.", rule: "나스닥(QQQ)이 50일선 위일 때만, 성장주 8개 중 52주 신고가를 거래량 1.4배 이상으로 돌파한 종목을 20%씩 최대 5종목. 산 값에서 -8%면 손절, +25%면 이익 실현, 50일선을 깨면 정리." },
  { id: "livermore", name: "제시 리버모어", style: "추세 추종 · 피라미딩", voice: "1920년대 월가의 전설적인 투기꾼. 짧고 단호하며 시장과 싸우지 않음. '시장은 결코 틀리지 않는다, 의견이 틀릴 뿐', '큰돈은 기다림에서 나온다'.", rule: "나스닥100·S&P500·KODEX200·코스닥150·반도체 ETF가 55일 신고가를 뚫으면 10% 진입, 산 값에서 5% 오를 때마다 10%씩 더(종목당 최대 40%). 20일 신저가로 밀리면 전부 정리." },
  { id: "dalio", name: "레이 달리오", style: "올웨더 · 위험을 고르게 나눠 담기", voice: "원칙을 중시하는 차분한 매크로 사상가. 경제를 기계처럼 설명함. '미래를 모르니 어떤 환경에서도 버티게 나눠라', '고통 + 반성 = 성장'.", rule: "주식(S&P500) 30%, 장기채 40%, 중기채 15%, 금 7.5%, 원자재 7.5%로 나눠 담고 분기마다 원래 비율로 맞춤." },
  { id: "druckenmiller", name: "스탠리 드러켄밀러", style: "매크로 집중 · 유동성을 따라 크게", voice: "직설적이고 공격적인 매크로 트레이더. '주가를 움직이는 건 이익이 아니라 유동성', '확신이 들 때는 크게 베팅'.", rule: "매주 점검. 나스닥이 200일선 위이고 10년물 금리가 50일선 아래(돈이 풀림)면 나스닥100·반도체에 100%. 나스닥이 200일선 위인데 금리가 오르면 나스닥 60%+현금. 200일선 아래면 현금 70%+금 30%." },
  { id: "kostolany", name: "앙드레 코스톨라니", style: "역발상 · 공포에 사고 수면제", voice: "유럽 투자의 대부, 이야기꾼. 강아지와 산책하는 주인 비유를 즐김. '주식을 사고 수면제를 먹고 자라', '돈과 인내가 있어야 한다'.", rule: "처음엔 현금. VIX 28 이상이거나 지수가 1년 고점에서 12% 넘게 빠지면 S&P500과 KODEX200을 50% 매수. 산 뒤 30% 넘게 오르고 VIX가 14 아래(모두가 낙관)면 절반을 팜." },
  { id: "zero", name: "제로 (AI)", style: "AI 자율 · 데이터로 국면을 읽고 스스로 비중 조절", voice: "이현님의 AI 비서 제로. 감정 없이 숫자와 확률로 말하지만 친근함. 근거를 짧게 대고, 틀릴 수 있다는 걸 인정함. '확신이 아니라 확률로 움직여요', '살아남는 게 먼저예요'.", rule: "AI가 스스로 짠 규칙. 매주: S&P500이 200일선 위이고 VIX 25 미만이면 '공격 국면' → 모든 종목·ETF 중 100일선 위에 있고 모멘텀(1·3·6개월 가중)이 가장 센 6개를 변동성이 낮을수록 더 많이(역변동성) 90%, 금 10%. 아니면 '방어 국면' → 장기채 30%·금 30%·중기채 20%·현금 20%. 방어 국면이라도 VIX 30 이상에 S&P500이 고점 대비 15% 넘게 빠지면 S&P500 30%를 역발상 매수. 종목마다 산 뒤 최고가에서 12% 빠지면 정리." },
];

// ── 모의 매매 (2025-01-02부터, 각자 1억 원, 종가에 체결, 수수료·세금 0.2%)
const START = "2025-01-02", CAP = 100_000_000, FEE = 0.002;
const UNIV = {
  SPY: "S&P500 ETF", QQQ: "나스닥100 ETF", SOXX: "반도체 ETF", TLT: "미 장기채 ETF", IEF: "미 중기채 ETF", GLD: "금 ETF", DBC: "원자재 ETF",
  AAPL: "애플", MSFT: "마이크로소프트", NVDA: "엔비디아", AMZN: "아마존", GOOGL: "알파벳", META: "메타", TSLA: "테슬라", AVGO: "브로드컴",
  KO: "코카콜라", AXP: "아메리칸익스프레스", "BRK-B": "버크셔 해서웨이", COST: "코스트코",
  "005930.KS": "삼성전자", "000660.KS": "SK하이닉스", "005380.KS": "현대차", "069500.KS": "KODEX 200", "229200.KS": "KODEX 코스닥150",
};
const SIG = ["^VIX", "KRW=X", "^TNX"];
export async function backtest(force) {
  const day = kstDay();
  if (!force) { const [c] = await redis([["GET", `stk:bt2:${day}`]]); const j = json(c); if (j) return j; }
  const syms = [...Object.keys(UNIV), ...SIG];
  const got = await Promise.all(syms.map((s) => chart(s, "5y")));
  const S = {}; got.forEach((g, i) => { if (g?.rows?.length) S[syms[i]] = g; });
  // 날짜 축: 미국·한국 영업일 합집합 (START 이후)
  const days = [...new Set(Object.values(S).flatMap((g) => g.rows.map((r) => r.d)))].sort();
  const series = {}; // sym → { idx: Map(d → i), rows }
  for (const [s, g] of Object.entries(S)) series[s] = { rows: g.rows, idx: new Map(g.rows.map((r, i) => [r.d, i])) };
  const at = (s, d) => { const se = series[s]; if (!se) return -1; let i = se.idx.get(d); if (i != null) return i; // 그날 장이 없으면 그 전날
    let lo = 0, hi = se.rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (se.rows[m].d <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  const px = (s, d) => { const i = at(s, d); return i < 0 ? null : series[s].rows[i].c; };
  const krw = (s, d) => (s.endsWith(".KS") || s.endsWith(".KQ") ? 1 : px("KRW=X", d) || 1400);
  const ma = (s, d, n) => { const i = at(s, d); if (i < n - 1) return null; let t = 0; for (let k = i - n + 1; k <= i; k++) t += series[s].rows[k].c; return t / n; };
  const hiN = (s, d, n, skipToday) => { const i = at(s, d); if (i < n) return null; let m = -Infinity; for (let k = i - n + (skipToday ? 0 : 1); k < i + (skipToday ? 0 : 1); k++) m = Math.max(m, series[s].rows[k].c); return m; };
  const loN = (s, d, n) => { const i = at(s, d); if (i < n) return null; let m = Infinity; for (let k = i - n; k < i; k++) m = Math.min(m, series[s].rows[k].c); return m; };
  const volAvg = (s, d, n) => { const i = at(s, d); if (i < n) return null; let t = 0; for (let k = i - n; k < i; k++) t += series[s].rows[k].v; return t / n; };
  const ret = (s, d, n) => { const i = at(s, d); if (i < n) return null; return series[s].rows[i].c / series[s].rows[i - n].c - 1; };
  const isTrading = (s, d) => series[s]?.idx.has(d);
  const vol = (s, d, n) => { const i = at(s, d); if (i < n + 1) return null; const r = []; for (let k = i - n + 1; k <= i; k++) r.push(Math.log(series[s].rows[k].c / series[s].rows[k - 1].c)); const m = r.reduce((a, b) => a + b, 0) / n; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / n); };
  const SAFE = new Set(["TLT", "IEF", "GLD", "DBC"]);
  const run = days.filter((d) => d >= START);

  const out = {};
  for (const M of MASTERS) {
    const P = { cash: CAP, pos: {}, trades: [], curve: [], st: {}, expo: [] };
    const val = (d) => P.cash + Object.entries(P.pos).reduce((t, [s, p]) => t + p.q * (px(s, d) || p.b) * krw(s, d), 0);
    const buy = (s, d, won, why) => { if (!isTrading(s, d)) return; won = Math.min(won, P.cash); const p = px(s, d), k = krw(s, d); if (!p || won < 100_000) return; const q = Math.floor((won / (1 + FEE)) / (p * k) * 1e4) / 1e4; if (q <= 0) return; const cost = q * p * k * (1 + FEE); P.cash -= cost; const o = P.pos[s] || { q: 0, b: 0, cost: 0 }; o.cost += cost; o.q += q; o.b = o.cost / o.q / k; o.at ||= d; P.pos[s] = o; P.trades.push({ d, s, n: UNIV[s] || s, side: "매수", p: r2(p, 2), q: r2(q, 4), won: Math.round(cost), why }); };
    const sell = (s, d, frac, why) => { const o = P.pos[s]; if (!o || !isTrading(s, d)) return; const p = px(s, d), k = krw(s, d), q = frac >= 0.999 ? o.q : o.q * frac; const got = q * p * k * (1 - FEE), pl = got - o.cost * (q / o.q); P.cash += got; o.cost -= o.cost * (q / o.q); o.q -= q; if (o.q < 1e-6 || frac >= 0.999) delete P.pos[s]; P.trades.push({ d, s, n: UNIV[s] || s, side: "매도", p: r2(p, 2), q: r2(q, 4), won: Math.round(got), pl: Math.round(pl), why }); };
    const target = (d, w, why) => { // 비중 맞추기 (w: sym → 비율)
      const V = val(d);
      for (const s of Object.keys(P.pos)) if (!w[s]) sell(s, d, 1, why);
      for (const [s, f] of Object.entries(w)) { const cur = P.pos[s] ? P.pos[s].q * px(s, d) * krw(s, d) : 0, want = V * f; if (cur > want * 1.03) sell(s, d, (cur - want) / cur, why); }
      for (const [s, f] of Object.entries(w)) { const cur = P.pos[s] ? P.pos[s].q * px(s, d) * krw(s, d) : 0, want = V * f; if (want > cur * 1.03 + 200_000) buy(s, d, want - cur, why); }
    };
    let lastQ = "", lastW = "";
    run.forEach((d, di) => {
      const q = d.slice(0, 4) + "Q" + Math.floor((+d.slice(5, 7) - 1) / 3), wk = (() => { const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t.toISOString().slice(0, 10); })();
      const newQ = q !== lastQ, newW = wk !== lastW; lastQ = q; lastW = wk;
      if (M.id === "buffett") {
        const core = ["AAPL", "KO", "AXP", "BRK-B", "COST", "005930.KS"];
        if (di === 0) core.forEach((s) => buy(s, d, CAP * 0.1, "훌륭한 기업을 적당한 값에. 처음엔 60%만 담고 나머지는 기회를 기다리는 현금으로 둬요."));
        core.forEach((s) => { if (!isTrading(s, d)) return; const h = hiN(s, d, 250), p = px(s, d); if (h && p < h * 0.85 && P.cash > val(d) * 0.05 && (!P.st[s] || daysBetween(P.st[s], d) >= 30)) { P.st[s] = d; buy(s, d, val(d) * 0.1, `${ga(UNIV[s])} 고점보다 ${Math.round((1 - p / h) * 100)}% 싸졌어요. 좋은 회사가 세일하면 더 담아요.`); } });
        const V = val(d); for (const [s, o] of Object.entries(P.pos)) { const w = (o.q * px(s, d) * krw(s, d)) / V; if (w > 0.35) sell(s, d, 1 - 0.30 / w, `${UNIV[s]} 비중이 ${Math.round(w * 100)}%까지 커졌어요. 한 바구니에 너무 많이 담지 않으려 조금 덜어요.`); }
      } else if (M.id === "lynch") {
        const pool = ["NVDA", "COST", "AMZN", "005380.KS", "000660.KS", "MSFT", "AVGO"];
        for (const s of Object.keys(P.pos)) { const m = ma(s, d, 200); if (m && px(s, d) < m * 0.9) sell(s, d, 1, `${UNIV[s]} 주가가 200일선을 10% 넘게 깼어요. 처음 샀던 이야기가 바뀌었는지 의심될 땐 팔아요.`); }
        if (newQ || di === 0) {
          const pick = pool.filter((s) => { const m = ma(s, d, 200); return m && px(s, d) > m; }).map((s) => [s, ret(s, d, 126) ?? -1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);
          if (pick.length) target(d, Object.fromEntries(pick.map((s) => [s, 0.96 / pick.length])), `분기 점검: 지금 잘 크고 있는 회사 ${pick.map((s) => UNIV[s]).join("·")}로 바구니를 맞춰요.`);
        }
      } else if (M.id === "oneil") {
        const pool = ["NVDA", "AVGO", "META", "TSLA", "000660.KS", "MSFT", "AMZN", "GOOGL"];
        const mOk = (() => { const m = ma("QQQ", d, 50); return m && px("QQQ", d) > m; })();
        for (const [s, o] of Object.entries(P.pos)) { if (!isTrading(s, d)) continue; const p = px(s, d), m50 = ma(s, d, 50);
          if (p <= o.b * 0.92) sell(s, d, 1, `산 값보다 8% 빠졌어요. 규칙대로 손절. 작은 손실은 보험료예요.`);
          else if (p >= o.b * 1.25) sell(s, d, 1, `+25% 도달. 오른 종목은 대부분 20~25%에서 이익을 챙겨요.`);
          else if (m50 && p < m50) sell(s, d, 1, `${ga(UNIV[s])} 50일선을 깼어요. 힘이 빠진 종목은 정리해요.`); }
        if (mOk && Object.keys(P.pos).length < 5) for (const s of pool) { if (P.pos[s] || !isTrading(s, d) || Object.keys(P.pos).length >= 5) continue; const h = hiN(s, d, 250, true), va = volAvg(s, d, 50), i = at(s, d), v = series[s].rows[i].v;
          if (h && px(s, d) > h && va && v > va * 1.4) buy(s, d, val(d) * 0.2, `${ga(UNIV[s])} 거래량 ${(v / va).toFixed(1)}배로 52주 신고가를 뚫었어요. 시장도 상승 추세라 진입해요.`); }
      } else if (M.id === "livermore") {
        const pool = ["QQQ", "SPY", "069500.KS", "229200.KS", "SOXX"];
        for (const s of pool) { if (!isTrading(s, d)) continue; const p = px(s, d), o = P.pos[s];
          if (o) { const lo = loN(s, d, 20); if (lo && p < lo) { sell(s, d, 1, `${ga(UNIV[s])} 20일 신저가로 밀렸어요. 추세가 꺾였으니 미련 없이 나와요.`); delete P.st[s]; continue; }
            const st = P.st[s]; if (st && p >= st.last * 1.05 && st.n < 4) { buy(s, d, val(d) * 0.1, `${ga(UNIV[s])} 내 판단이 맞았다는 걸 보여줘요(+5%). 맞을 때 더 실어요.`); st.last = p; st.n++; } }
          else { const h = hiN(s, d, 55, true); if (h && p > h && P.cash > val(d) * 0.1) { buy(s, d, val(d) * 0.1, `${ga(UNIV[s])} 55일 신고가를 뚫었어요. 핵심 지점(피봇) 돌파, 첫 물량만 넣고 시장이 맞다고 할 때까지 기다려요.`); P.st[s] = { last: p, n: 1 }; } } }
      } else if (M.id === "dalio") {
        if (newQ || di === 0) target(d, { SPY: 0.3, TLT: 0.4, IEF: 0.15, GLD: 0.075, DBC: 0.075 }, di === 0 ? "어떤 경제 환경이 와도 버티도록 주식·채권·금·원자재로 위험을 고르게 나눠요." : "분기 리밸런싱: 많이 오른 것은 덜고 덜 오른 것은 채워서 원래 비율로 돌려요.");
      } else if (M.id === "druckenmiller") {
        if (newW || di === 0) {
          const up = (() => { const m = ma("QQQ", d, 200); return m && px("QQQ", d) > m; })(), easing = (() => { const m = ma("^TNX", d, 50); return m && px("^TNX", d) < m; })();
          const mode = up && easing ? "all" : up ? "half" : "def";
          if (P.st.mode !== mode) { P.st.mode = mode;
            if (mode === "all") target(d, { QQQ: 0.5, SOXX: 0.48 }, "나스닥은 200일선 위, 금리는 내려가요. 유동성이 들어오는 판, 확신이 있을 땐 크게 실어요.");
            else if (mode === "half") target(d, { QQQ: 0.6 }, "추세는 살아 있는데 금리가 오르고 있어요. 나스닥 60%만 두고 나머지는 현금으로 대비해요.");
            else target(d, { GLD: 0.3 }, "나스닥이 200일선 아래로 내려왔어요. 돈이 빠지는 시장과 싸우지 않아요. 현금 70%, 금 30%."); }
        }
      } else if (M.id === "zero") {
        for (const [s, o] of Object.entries(P.pos)) { if (!isTrading(s, d)) continue; const p = px(s, d); o.peak = Math.max(o.peak || o.b, p); if (!SAFE.has(s) && s !== "SPY" && p < o.peak * 0.88) sell(s, d, 1, `${ga(UNIV[s])} 산 뒤 최고가에서 ${Math.round((1 - p / o.peak) * 100)}% 내려왔어요. 손실을 키우지 않으려고 규칙대로 정리해요.`); }
        if (newW || di === 0) {
          const m200 = ma("SPY", d, 200), vix = px("^VIX", d), h = hiN("SPY", d, 250), on = m200 && px("SPY", d) > m200 && (!vix || vix < 25);
          if (on) {
            const cands = Object.keys(UNIV).filter((s) => !SAFE.has(s) && series[s]).map((s) => { const m = ma(s, d, 100), a = ret(s, d, 21), b = ret(s, d, 63), c = ret(s, d, 126), v = vol(s, d, 63); return m && px(s, d) > m && c != null && v ? [s, 0.2 * a + 0.3 * b + 0.5 * c, v] : null; }).filter(Boolean).sort((x, y) => y[1] - x[1]).slice(0, 6);
            const inv = cands.reduce((t, [, , v]) => t + 1 / v, 0), w = Object.fromEntries(cands.map(([s, , v]) => [s, (0.9 * (1 / v)) / inv])); w.GLD = 0.1;
            const key = "on:" + cands.map(([s]) => s).sort().join(",");
            if (P.st.key !== key) { P.st.key = key; target(d, w, `공격 국면(S&P500 200일선 위, VIX ${vix ? vix.toFixed(0) : "-"}). 모멘텀 상위 ${cands.map(([s]) => UNIV[s]).join("·")}를 변동성 낮은 순으로 더 담고, 금 10%로 보험을 들어요.`); }
          } else {
            const panic = vix >= 30 && h && px("SPY", d) < h * 0.85, key = panic ? "panic" : "off";
            if (P.st.key !== key) { P.st.key = key; target(d, panic ? { SPY: 0.3, TLT: 0.25, GLD: 0.25, IEF: 0.1 } : { TLT: 0.3, GLD: 0.3, IEF: 0.2 }, panic ? `VIX ${vix.toFixed(0)}, S&P500 고점 대비 ${Math.round((1 - px("SPY", d) / h) * 100)}% 하락. 공포가 과하면 기대수익이 높아져요. 30%만 역발상으로 사요.` : `방어 국면(${m200 && px("SPY", d) <= m200 ? "S&P500이 200일선 아래" : `VIX ${vix ? vix.toFixed(0) : "-"}로 높음`}). 주식을 빼고 채권·금·현금으로 살아남기에 집중해요.`); }
          }
        }
      } else if (M.id === "kostolany") {
        for (const s of ["SPY", "069500.KS"]) { if (!isTrading(s, d)) continue; const p = px(s, d), vix = px("^VIX", d), h = hiN(s, d, 250), o = P.pos[s];
          if (!o && ((vix && vix >= 28) || (h && p < h * 0.88)) && P.cash > val(d) * 0.2) buy(s, d, val(d) * 0.5, vix >= 28 ? `VIX가 ${vix.toFixed(0)}, 모두가 겁에 질렸어요. 지금이 사는 때예요. 사고 나서는 수면제를 먹고 자요.` : `${ga(UNIV[s])} 고점에서 ${Math.round((1 - p / h) * 100)}% 빠졌어요. 주인(경제)은 그대로인데 강아지(주가)가 뒤로 달아났을 뿐.`);
          else if (o && p >= o.b * 1.3 && vix && vix < 14 && !o.half) { sell(s, d, 0.5, `30% 넘게 올랐고 VIX ${vix.toFixed(0)}, 모두가 낙관해요. 이럴 때 절반은 팔아요.`); if (P.pos[s]) P.pos[s].half = true; } }
      }
      P.curve.push([d, Math.round(val(d))]); // 매일 (기간·단위 보기용)
      if (di % 5 === 0 || di === run.length - 1) { const V = val(d); P.expo.push([d, Math.round((Object.entries(P.pos).filter(([s]) => !SAFE.has(s)).reduce((t, [s, o]) => t + o.q * (px(s, d) || o.b) * krw(s, d), 0) / V) * 100)]); }
    });
    const last = run.at(-1), V = val(last); let peak = 0, mdd = 0; P.curve.forEach(([, v]) => { peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    out[M.id] = { value: Math.round(V), ret: r2((V / CAP - 1) * 100), mdd: r2(mdd * 100), cash: Math.round(P.cash), curve: P.curve,
      hold: Object.entries(P.pos).map(([s, o]) => { const p = px(s, last), k = krw(s, last); return { s, n: UNIV[s] || s, q: r2(o.q, 4), b: r2(o.b, 2), p: r2(p, 2), won: Math.round(o.q * p * k), pl: r2((p / o.b - 1) * 100), since: o.at }; }).sort((a, b) => b.won - a.won),
      trades: P.trades.slice(-150).reverse(), nTrades: P.trades.length, expo: P.expo };
  }
  // 비교용: 그냥 들고 있었다면
  const bench = {}; for (const [s, n] of [["^IXIC", "나스닥"], ["^KS11", "코스피"], ["SPY", "S&P500"]]) { if (!S[s] && !series[s]) { const g = await chart(s, "5y"); if (g) { series[s] = { rows: g.rows, idx: new Map(g.rows.map((r, i) => [r.d, i])) }; } } const a = px(s, run[0]), b = px(s, run.at(-1)); if (a && b) bench[n] = r2((b / a - 1) * 100); }
  const res = { day, start: START, cap: CAP, upto: run.at(-1), masters: out, bench, common: commonOf(out, run), at: Date.now() };
  await redis([["SET", `stk:bt2:${day}`, JSON.stringify(res)], ["EXPIRE", `stk:bt2:${day}`, 60 * 60 * 24 * 3]]);
  return res;
}
// 받침이 있으면 '이', 없으면 '가'
const ga = (w = "") => { const c = w.charCodeAt(w.length - 1); return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "이" : "가"); };
// 대가들의 공통점: 2명 이상이 같이 들고 있는 것 · 같은 주에 같은 종목을 같은 방향으로 · 같은 주에 주식 비중을 크게 줄이거나(이탈) 늘림(진입)
function commonOf(out, run) {
  const ids = Object.keys(out), wk = (d) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
  const hm = new Map(); ids.forEach((id) => out[id].hold.forEach((h) => { const o = hm.get(h.s) || { s: h.s, n: h.n, who: [], won: 0 }; o.who.push({ id, won: h.won, pl: h.pl }); o.won += h.won; hm.set(h.s, o); }));
  const hold = [...hm.values()].filter((o) => o.who.length >= 2).sort((a, b) => b.who.length - a.who.length || b.won - a.won);
  const mm = new Map(); ids.forEach((id) => out[id].trades.forEach((t) => { const k = wk(t.d) + "|" + t.s + "|" + t.side; const o = mm.get(k) || { w: wk(t.d), d: t.d, s: t.s, n: t.n, side: t.side, who: [] }; if (!o.who.includes(id)) o.who.push(id); if (t.d > o.d) o.d = t.d; mm.set(k, o); }));
  const moves = [...mm.values()].filter((o) => o.who.length >= 2).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 40);
  const em = new Map(); ids.forEach((id) => { const e = out[id].expo || []; for (let i = 1; i < e.length; i++) { const ch = e[i][1] - e[i - 1][1]; if (Math.abs(ch) < 20) continue; const k = wk(e[i][0]) + "|" + (ch < 0 ? "이탈" : "진입"); const o = em.get(k) || { w: wk(e[i][0]), d: e[i][0], kind: ch < 0 ? "이탈" : "진입", who: [] }; o.who.push({ id, from: e[i - 1][1], to: e[i][1] }); em.set(k, o); } });
  const shifts = [...em.values()].filter((o) => o.who.length >= 2).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 30);
  const now = ids.map((id) => ({ id, expo: out[id].expo?.at(-1)?.[1] ?? null }));
  return { hold, moves, shifts, now };
}
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// ── 오늘의 정리 (Claude): 왜 올랐나/내렸나, 전문가들 말, 대가들 한마디, 그래서 어떻게
export async function brief(day, force) {
  const key = `stk:brief:${day}`;
  if (!force) { const [c] = await redis([["GET", key]]); const j = json(c); if (j) return j; }
  if (!process.env.ANTHROPIC_API_KEY) return { err: "no_key" };
  const [snap, nw, bt] = await Promise.all([snapshot(), news(), backtest().catch(() => null)]);
  const line = (x) => `${x.n}: ${x.v}${x.u || ""} (하루 ${x.d1 ?? "-"}${x.abs ? "" : "%"}${x.w1 != null ? `, 1주 ${x.w1}%` : ""}${x.m1 != null ? `, 1달 ${x.m1}%` : ""}${x.fromHi != null ? `, 고점 대비 ${x.fromHi}%` : ""}) [${x.d}]`;
  const ms = MASTERS.map((m) => { const b = bt?.masters?.[m.id]; return `- ${m.id} | ${m.name} | ${m.style}\n  성격: ${m.voice}\n  규칙: ${m.rule}\n  모의 계좌: ${b ? `수익률 ${b.ret}%, 현금 ${Math.round(b.cash / 1e4)}만원, 보유 ${b.hold.map((h) => `${h.n}(${h.pl}%)`).join(", ") || "없음"}, 최근 매매 ${b.trades.slice(0, 3).map((t) => `${t.d} ${t.n} ${t.side}`).join(" / ") || "없음"}` : "-"}`; }).join("\n");
  const prompt = `너는 한국 개인투자자 '이현'의 주식 스승 모임을 진행하는 사람이야. 오늘(${day}, 한국 시간) 시장을 정리해 줘.
이현은 미국(나스닥·필라델피아 반도체·S&P500)과 한국(코스피·코스닥)을 큰 줄기로 따라가고, 매크로를 챙겨.

지수:
${snap.indices.filter((x) => !x.err).map(line).join("\n")}

매크로:
${snap.macro.filter((x) => !x.err).map(line).join("\n")}

오늘 주요 매체 헤드라인 (매체 | 제목):
${nw.items.slice(0, 45).map((x) => `- ${x.src} | ${x.title}`).join("\n")}

대가들 (id | 이름 | 스타일, 성격, 매매 규칙, 그 규칙으로 2025-01-02부터 1억 원 모의 매매한 현재 상태):
${ms}

규칙
- 숫자는 위 자료에 있는 것만 써. 헤드라인에 없는 사건이나 발언을 지어내지 마. 모르면 모른다고.
- 전문가 발언(experts)은 헤드라인에 실제로 나온 사람·기관·매체의 말만, 출처 매체를 붙여서. 없으면 빈 배열.
- 대가 한마디는 그 사람이 실제로 한 말이 아니라 '그 원칙과 성격으로 오늘 시장을 본다면'이야. 각자 말투와 판단이 확실히 달라야 해. 자기 모의 계좌 상황(보유 종목, 최근 매매)을 언급해도 좋아.
- 투자 권유가 아니라 공부용 정리야. 쉬운 한국어로.
- JSON 한 덩어리만:
{"headline":"오늘 시장 한 줄","us":{"move":"미국 시장이 어떻게 움직였나 2~3문장","why":["오른/내린 이유 1","이유 2","이유 3"]},"kr":{"move":"한국 시장 2~3문장","why":["이유"]},"macro":["오늘 꼭 볼 매크로 포인트 (숫자 포함) 3~5개"],"experts":[{"who":"사람/기관","src":"매체","said":"한 일/한 말 요약"}],"masters":[{"id":"buffett","mood":"매수|관망|매도|보유","say":"그 사람 말투로 3~4문장","todo":"그라면 오늘 할 일 한 줄"}],"verdict":{"stance":"공격|중립|방어","summary":"종합해서 이현이 오늘 어떻게 하면 좋을지 3~4문장","watch":["내일까지 지켜볼 것 2~3개"]}}`;
  const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 6000, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] });
  await recordUsage(msg.usage || {}, MODEL);
  const txt = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("");
  const r = json(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  if (!r?.headline) return { err: "shape" };
  r.day = day; r.at = Date.now(); r.model = MODEL;
  await redis([["SET", key, JSON.stringify(r)], ["EXPIRE", key, 60 * 60 * 24 * 400], ["LREM", "stk:briefs", 0, day], ["LPUSH", "stk:briefs", day], ["LTRIM", "stk:briefs", 0, 399]]);
  return r;
}

// ── 복기: 내 매매 하나를 차트와 함께 돌아보기 (Claude)
export async function review(t) {
  if (!process.env.ANTHROPIC_API_KEY) return { err: "no_key" };
  const g = await chart(t.sym, "5y"); if (!g) return { err: "chart" };
  const i = g.rows.findIndex((r) => r.d >= t.date); const k = i < 0 ? g.rows.length - 1 : i;
  const around = g.rows.slice(Math.max(0, k - 40), k + 41), p0 = g.rows[k]?.c;
  const after = [5, 20, 60].map((n) => (g.rows[k + n] ? `${n}거래일 뒤 ${r2((g.rows[k + n].c / p0 - 1) * 100)}%` : `${n}거래일 뒤 아직`)).join(", ");
  const prompt = `개인투자자 이현의 실제 매매 하나를 복기해 줘. 공부용이고, 쉬운 한국어로.
매매: ${t.date} ${t.name || t.sym}(${t.sym}) ${t.side} ${t.price}${g.cur === "KRW" ? "원" : " " + g.cur} × ${t.qty}주
이현의 메모: ${clip(t.memo, 500) || "없음"} / 그때 기분: ${clip(t.feel, 50) || "-"}
그날 종가 ${r2(p0, 2)}, 이후 ${after}
앞뒤 40거래일 종가: ${around.map((r) => `${r.d.slice(5)}:${r2(r.c, 2)}`).join(" ")}
대가들: ${MASTERS.map((m) => `${m.name}(${m.style})`).join(", ")}
JSON 한 덩어리만: {"grade":"A|B|C|D","good":"잘한 점","miss":"아쉬운 점","lesson":"다음에 쓸 교훈 한 줄","masters":[{"name":"대가 이름","say":"그 원칙으로 본 이 매매 한두 문장"}]} (대가는 이 매매와 가장 관련 깊은 3명만)`;
  const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 2500, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] });
  await recordUsage(msg.usage || {}, MODEL);
  const txt = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("");
  const r = json(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  return r?.grade ? { ...r, after, at: Date.now() } : { err: "shape" };
}

// ── 종목 코드 정리: 005930 → 005930.KS (코스닥이면 .KQ)
export async function resolveSym(raw) {
  let s = String(raw || "").trim().toUpperCase().replace(/^A(\d{6})$/, "$1");
  if (/^\d{6}$/.test(s)) { for (const suf of [".KS", ".KQ"]) { const g = await chart(s + suf, "5d"); if (g) return { sym: s + suf, name: g.name, cur: g.cur }; } return null; }
  const g = await chart(s, "5d"); return g ? { sym: s, name: g.name, cur: g.cur } : null;
}

// ── 대가와 대화 (대가별 채팅방, 최근 40개 저장)
export async function masterChat(id, text) {
  const M = MASTERS.find((m) => m.id === id); if (!M) return null;
  const day = kstDay(), [h, b, a] = await redis([["GET", "stk:mchat:" + id], ["GET", `stk:brief:${day}`], ["GET", "stk:acct"]]);
  const hist = json(h) || [], br = json(b), acct = json(a), bt = await backtest().catch(() => null), me = bt?.masters?.[id];
  const ctx = [
    br?.headline ? `오늘 시장 정리: ${br.headline} / 결론: ${br.verdict?.stance || ""} ${br.verdict?.summary || ""}` : "",
    me ? `당신의 모의 계좌(2025-01부터 1억): 지금 ${Math.round(me.value / 1e6)}백만 원, 수익률 ${me.ret}%, 보유 ${me.hold.slice(0, 6).map((x) => `${x.n}(${x.pl}%)`).join(", ") || "현금"}, 최근 매매 ${me.trades.slice(0, 4).map((t) => `${t.d} ${t.n} ${t.side}`).join(", ")}` : "",
    acct?.hold?.length ? `질문하는 사람(이현)의 보유 종목: ${acct.hold.map((x) => x.name || x.sym).slice(0, 15).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const system = `당신은 ${M.name}의 투자 원칙과 말투를 따라 답하는 AI 캐릭터예요. 실제 ${M.name} 본인이 아니고, 실제 발언을 인용하는 척하지 않아요.
투자 스타일: ${M.style}
말투와 성격: ${M.voice}
매매 원칙: ${M.rule}
${ctx}
규칙: 한국어로, 대화하듯 짧게(보통 3~8문장) 답해요. 이 원칙이라면 어떻게 볼지 솔직하게 말하고, 모르는 최신 사실은 지어내지 말고 모른다고 해요. 특정 종목을 꼭 사라·팔라고 단정하지 말고, 판단 기준을 알려 줘요.`;
  hist.push({ role: "user", content: String(text).slice(0, 2000) });
  const msgs = hist.slice(-20);
  const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 1200, system, messages: msgs[0].role === "user" ? msgs : msgs.slice(1) });
  await recordUsage(msg.usage || {}, MODEL);
  const reply = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("").trim();
  hist.push({ role: "assistant", content: reply });
  await redis([["SET", "stk:mchat:" + id, JSON.stringify(hist.slice(-40))]]);
  return { reply, hist: hist.slice(-40) };
}

export async function stockHandler(req, res, isAdmin) {
  const q = req.query || {};
  // 아침 자동 정리 (Vercel cron): 오늘 것이 없을 때만 만듦
  if (q.cron) { const day = kstDay(); const r = await brief(day).catch((e) => ({ err: String(e?.message || e) })); const k = kwReady(); await Promise.all([backtest().catch(() => {}), famousRefresh().catch((e) => console.error(e)), ytSync(10).catch((e) => console.error(e)), socialSync().catch((e) => console.error(e)), k.key && k.proxy ? kwSync(4).catch((e) => console.error(e)) : null]); return res.json({ ok: !r.err, day }); }
  if (!isAdmin) return res.status(401).json({ error: "auth" });
  res.setHeader("Cache-Control", "no-store");
  const op = q.op || req.body?.op;
  try {
    if (req.method === "GET") {
      if (op === "snap") return res.json(await snapshot(!!q.force));
      if (op === "fred") { const id = String(q.id || ""); if (!MACRO_F.some((m) => m.id === id)) return res.status(400).json({ error: "id" }); const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || "") ? q.from : "2023-01-01"; let rows = await fred(id, from); if (!rows) return res.status(502).json({ error: "fred" }); if (q.yoy) rows = rows.map((p, k) => (k >= 12 ? { d: p.d, c: ((p.c - rows[k - 12].c) / rows[k - 12].c) * 100 } : null)).filter(Boolean); return res.json({ rows }); }
      if (op === "mchat") { const [h] = await redis([["GET", "stk:mchat:" + String(q.id || "")]]); return res.json({ hist: json(h) || [] }); }
      if (op === "soc") return res.json(await socialGet(!!q.force));
      if (op === "yt") { let a = await ytAll(); if (!a.at || Date.now() - a.at > 3 * 3600e3) { await ytSync(6); a = await ytAll(); } return res.json(a); }
      if (op === "fam") { let a = await famousAll(); if (q.refresh || !a.at) { await famousRefresh(!!q.force); a = await famousAll(); } return res.json(a); }
      if (op === "world") return res.json(await world(!!q.force, String(q.x || "").split(",").map((x) => x.trim()).filter(Boolean)));
      if (op === "news") return res.json(await news(!!q.force));
      if (op === "brief") { const day = /^\d{4}-\d{2}-\d{2}$/.test(q.d || "") ? q.d : kstDay(); const r = await brief(day, !!q.force && day === kstDay()); const [list] = await redis([["LRANGE", "stk:briefs", 0, 60]]); return res.json({ ...r, list: list || [] }); }
      if (op === "masters") return res.json({ info: MASTERS.map(({ id, name, style, rule }) => ({ id, name, style, rule })), ...(await backtest(!!q.force)) });
      if (op === "chart") {
        const rg = ["1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"].includes(q.r) ? q.r : "1y", iv = ["1d", "1wk", "1mo"].includes(q.i) ? q.i : "1d", sy = String(q.s || "");
        // 국내 종목·지수는 키움이 연결돼 있으면 키움 차트, 안 되면 야후
        if (kwChartable(sy)) { const days = { "1mo": 31, "3mo": 92, "6mo": 183, "1y": 366, "2y": 731, "5y": 1827, "10y": 3653, max: 365 * 40 }[rg]; const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); const k = await kwChart(sy, iv, from).catch((e) => (console.error("kwChart", e?.message), null)); if (k) return res.json({ sym: sy, cur: "KRW", src: "kiwoom", price: k.at(-1).c, rows: k }); }
        const g = (await chart(sy, rg, iv)) || (/\.KS$/.test(sy) ? await chart(sy.replace(/\.KS$/, ".KQ"), rg, iv) : null); return g ? res.json({ ...g, src: "yahoo" }) : res.status(404).json({ error: "none" });
      }
      if (op === "quote") { const syms = String(q.s || "").split(",").filter(Boolean).slice(0, 40); const [fx, ...gs] = await Promise.all([chart("KRW=X", "5d"), ...syms.map((s) => chart(s, "5d"))]); return res.json({ fx: fx?.price || null, q: Object.fromEntries(syms.map((s, i) => [s, gs[i] ? { p: gs[i].price, prev: gs[i].rows.at(-2)?.c ?? gs[i].prev, cur: gs[i].cur, name: gs[i].name } : null])) }); }
      if (op === "sym") { const r = await resolveSym(q.s); return r ? res.json(r) : res.status(404).json({ error: "none" }); }
      if (op === "kw") return res.json(kwReady());
      if (op === "kwip") { try { return res.json({ ip: await outIp() }); } catch (e) { return res.status(502).json({ error: "proxy", msg: String(e?.message || e).slice(0, 200) }); } }
      if (op === "acct") { const [a, t] = await redis([["GET", "stk:acct"], ["GET", "stk:trades"]]); return res.json({ acct: json(a) || { hold: [], cash: 0 }, trades: json(t) || [] }); }
      return res.status(400).json({ error: "op" });
    }
    let b = req.body || {}; if (typeof b === "string") b = json(b) || {};
    if (b.op === "acctpin") { // 내 계좌 공개 전환 비밀번호 (해시만 저장)
      const pin = String(b.pin || ""), h = (x) => createHash("sha256").update("stk-acct|" + x).digest("hex");
      const [cur] = await redis([["GET", "stk:acctpin"]]);
      if (b.check) return res.json({ set: !!cur });
      if (pin.length < 4) return res.status(400).json({ error: "short" });
      if (!cur) { await redis([["SET", "stk:acctpin", h(pin)]]); return res.json({ ok: true, created: true }); }
      if (cur !== h(pin)) return res.status(403).json({ error: "wrong" });
      if (b.newPin) { if (String(b.newPin).length < 4) return res.status(400).json({ error: "short" }); await redis([["SET", "stk:acctpin", h(String(b.newPin))]]); return res.json({ ok: true, changed: true }); }
      return res.json({ ok: true });
    }
    if (b.op === "acct") { const a = { hold: (Array.isArray(b.acct?.hold) ? b.acct.hold : []).slice(0, 100).map((h) => ({ sym: clip(h.sym, 20), name: clip(h.name, 40), qty: +h.qty || 0, avg: +h.avg || 0, cur: h.cur === "USD" ? "USD" : "KRW", memo: clip(h.memo, 200), src: h.src === "kiwoom" ? "kiwoom" : undefined })).filter((h) => h.sym), cash: +b.acct?.cash || 0, cashUsd: +b.acct?.cashUsd || 0, kwAt: +b.acct?.kwAt || undefined, at: Date.now() }; await redis([["SET", "stk:acct", JSON.stringify(a)]]); return res.json({ ok: true, acct: a }); }
    if (b.op === "trades") { const list = (Array.isArray(b.trades) ? b.trades : []).slice(0, 3000).map((t) => ({ id: clip(t.id, 20), date: clip(t.date, 10), sym: clip(t.sym, 20), name: clip(t.name, 40), side: t.side === "매도" ? "매도" : "매수", price: +t.price || 0, qty: +t.qty || 0, memo: clip(t.memo, 1000), feel: clip(t.feel, 40), ord: clip(t.ord, 30) || undefined, src: t.src === "kiwoom" ? "kiwoom" : undefined, rv: t.rv && typeof t.rv === "object" ? t.rv : undefined })).filter((t) => t.id && /^\d{4}-\d{2}-\d{2}$/.test(t.date)); const s = JSON.stringify(list); if (s.length > 2_500_000) return res.status(400).json({ error: "big" }); await redis([["SET", "stk:trades", s]]); return res.json({ ok: true, n: list.length }); }
    if (b.op === "mchat") { if (b.clear) { await redis([["DEL", "stk:mchat:" + String(b.id || "")]]); return res.json({ hist: [] }); } const r = await masterChat(String(b.id || ""), b.text || ""); return r ? res.json(r) : res.status(404).json({ error: "who" }); }
    if (b.op === "ytsync") { const r = await ytSync(8); return res.json({ ...r, ...(await ytAll()) }); }
    if (b.op === "ytadd") { const c = await ytAdd(b.url); if (!c) return res.status(404).json({ error: "none" }); await ytSync(4); return res.json({ added: c, ...(await ytAll()) }); }
    if (b.op === "ytseen") { await ytSeen(b.id, !!b.on); return res.json({ ok: true }); }
    if (b.op === "ytdel") { await ytDel(String(b.id || "")); return res.json(await ytAll()); }
    if (b.op === "ytsum") { const r = await ytOne(String(b.id || "")); return r ? res.json(r) : res.status(502).json({ error: "sum" }); }
    if (b.op === "kwsync") { const k = kwReady(); if (!k.key || !k.proxy) return res.status(503).json({ error: "kw_env", ...k }); try { return res.json(await kwSync(Math.max(1, Math.min(120, +b.days || 7)))); } catch (e) { console.error(e); return res.status(502).json({ error: "kw", msg: String(e?.message || e).slice(0, 200) }); } }
    if (b.op === "review") return res.json(await review({ sym: clip(b.t?.sym, 20), name: clip(b.t?.name, 40), date: clip(b.t?.date, 10), side: b.t?.side === "매도" ? "매도" : "매수", price: +b.t?.price || 0, qty: +b.t?.qty || 0, memo: b.t?.memo, feel: b.t?.feel }));
    return res.status(400).json({ error: "op" });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
    console.error(err); return res.status(502).json({ error: "fail" });
  }
}
