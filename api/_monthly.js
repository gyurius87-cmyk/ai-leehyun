// 월례회: 한 달 동안 무슨 일이 있었고, 지수·종목이 어떻게 움직였는지 발표 자료 한 장으로.
// 재료: 그달의 '오늘의 정리'(stk:brief:<날짜>), 일별 DB(stk:db:<날짜>), 지수·매크로 종가, 날짜별 기사 제목(구글 뉴스, 출처·날짜·링크).
// AI는 claude()(구독 접수함)로. 저장 stk:mon:<YYYY-MM>, 목록 stk:mons.
import { claude, isQueued, aiWaiting } from "./_ai.js";
import { redis, kstDay } from "./_redis.js";

const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** k) / 10 ** k);
export const MON_IDX = [["^IXIC", "나스닥"], ["^GSPC", "S&P 500"], ["^SOX", "필라델피아 반도체"], ["^KS11", "코스피"], ["^KQ11", "코스닥"], ["^TNX", "미 10년물 금리"], ["KRW=X", "원/달러"], ["^VIX", "VIX"], ["CL=F", "WTI 유가"], ["GC=F", "금"], ["BTC-USD", "비트코인"]];
// 화제 종목 후보: 미리 종가를 받아 두고 숫자를 질문에 넣어요 (AI가 고른 종목의 차트도 여기서)
const MON_CAND = [["NVDA", "엔비디아"], ["AMD", "AMD"], ["MU", "마이크론"], ["INTC", "인텔"], ["AVGO", "브로드컴"], ["TSM", "TSMC"], ["MSFT", "마이크로소프트"], ["META", "메타"], ["GOOGL", "알파벳"], ["AMZN", "아마존"], ["AAPL", "애플"], ["TSLA", "테슬라"], ["ORCL", "오라클"], ["CRWV", "코어위브"], ["QCOM", "퀄컴"], ["005930.KS", "삼성전자"], ["000660.KS", "SK하이닉스"]];
const WD = ["일", "월", "화", "수", "목", "금", "토"], wd = (d) => WD[new Date(d + "T00:00:00Z").getUTCDay()];
function pxRows(g, first, last) {
  const rows = (g?.rows || []).filter((r) => r.c != null), pre = rows.filter((r) => r.d < first).at(-1), inM = rows.filter((r) => r.d >= first && r.d <= last);
  if (!inM.length) return null; const base = pre?.c ?? inM[0].c;
  return { base: r2(base, 4), chg: r2((inM.at(-1).c / base - 1) * 100), rows: inM.map((r, k) => ({ d: r.d, c: r2(r.c, 4), p: r2(((r.c / (k ? inM[k - 1].c : base)) - 1) * 100) })) };
}
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const unx = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

// 기간 안 기사 제목 (출처·날짜·링크까지)
async function gnewsRange(q, from, to, hl, gl, ceid) {
  try {
    const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} after:${from} before:${to}`)}&hl=${hl}&gl=${gl}&ceid=${ceid}`, { headers: UA }); if (!r.ok) return [];
    return (await r.text()).split("<item>").slice(1, 60).map((it) => {
      const t = unx((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), src = unx((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
      const pd = Date.parse(unx((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1])), link = unx((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
      return { t: t.replace(/\s+-\s+[^-]+$/, ""), src, d: pd ? kstDay(new Date(pd)) : "", link };
    }).filter((x) => x.t && x.d);
  } catch { return []; }
}
async function monthNews(from, to) {
  // 주 단위로 나눠서 (구글 뉴스는 한 번에 100개 정도만 줌)
  const weeks = []; for (let d = Date.parse(from); d < Date.parse(to); d += 7 * 864e5) weeks.push([new Date(d).toISOString().slice(0, 10), new Date(Math.min(d + 7 * 864e5, Date.parse(to))).toISOString().slice(0, 10)]);
  const EN = '("stock market" OR Nasdaq OR "Wall Street" OR Fed OR Nvidia OR tariff)', KO = "(코스피 OR 코스닥 OR 증시 OR 환율 OR 반도체주 OR 외국인)";
  const got = await Promise.all(weeks.flatMap(([a, b]) => [gnewsRange(EN, a, b, "en-US", "US", "US:en"), gnewsRange(KO, a, b, "ko", "KR", "KR:ko")]));
  const seen = new Set(); return got.flat().filter((x) => { const k = x.t.slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; });
}

export async function monthGet(m) {
  const [[c, l], w] = await Promise.all([redis([["GET", "stk:mon:" + m], ["LRANGE", "stk:mons", 0, 60]]), aiWaiting()]);
  const pj = w.jobs.filter((j) => j.label === "월례회 " + m);
  return { mon: json(c), list: l || [], pend: pj.length ? { at: Math.min(...pj.map((j) => j.at)) } : null, seen: w.seen };
}

// deps.chart(sym, range) 를 _stock.js 에서 넘겨받아요
export async function monthMake(m, deps) {
  if (!/^\d{4}-\d{2}$/.test(m)) return { err: "month" };
  const today = kstDay(), first = m + "-01", nextM = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 10);
  const last = new Date(Math.min(Date.parse(nextM), Date.parse(today)) - 864e5).toISOString().slice(0, 10); // 어제까지 (지난달이면 말일까지)
  if (last < first) return { err: "early" };
  const days = []; for (let d = Date.parse(first); d <= Date.parse(last); d += 864e5) days.push(new Date(d).toISOString().slice(0, 10));
  const lead = []; for (let d = Date.parse(first) - 7 * 864e5; d < Date.parse(first); d += 864e5) lead.push(new Date(d).toISOString().slice(0, 10)); // 지난달 마지막 주 (이어지는 흐름)
  const keys = [...lead, ...days];
  const [vals, news, ...charts] = await Promise.all([
    redis(keys.flatMap((d) => [["GET", "stk:brief:" + d], ["GET", "stk:db:" + d]])),
    monthNews(lead[0], new Date(Date.parse(last) + 864e5).toISOString().slice(0, 10)),
    ...MON_IDX.map(([s]) => deps.chart(s, "6mo").catch(() => null)),
  ]);
  const candG = await Promise.all(MON_CAND.map(([s]) => deps.chart(s, "6mo").catch(() => null)));
  const PX = {}; MON_CAND.forEach(([s], i) => { const x = pxRows(candG[i], first, last); if (x) PX[s] = x; });
  const B = {}, D = {}; keys.forEach((d, i) => { B[d] = json(vals[i * 2]); D[d] = json(vals[i * 2 + 1]); });
  // 지수별 이달 변화 (전달 마지막 종가 → 기간 마지막 종가), 날짜별 하루 등락
  const stats = MON_IDX.map(([s, n], i) => {
    const rows = (charts[i]?.rows || []).filter((r) => r.c != null), pre = rows.filter((r) => r.d < first).at(-1), inM = rows.filter((r) => r.d >= first && r.d <= last);
    if (!inM.length) return { s, n, err: true };
    const base = pre?.c ?? inM[0].c, end = inM.at(-1).c, hi = inM.reduce((a, r) => (r.c > a.c ? r : a)), lo = inM.reduce((a, r) => (r.c < a.c ? r : a));
    const daily = inM.map((r, k) => ({ d: r.d, c: r2(r.c, 4), p: r2(((r.c / (k ? inM[k - 1].c : base)) - 1) * 100) }));
    return { s, n, base: r2(base, 4), end: r2(end, 4), chg: r2((end / base - 1) * 100), hi: { d: hi.d, c: r2(hi.c, 4) }, lo: { d: lo.d, c: r2(lo.c, 4) }, daily };
  });
  const big = stats.filter((x) => !x.err && ["^IXIC", "^SOX", "^KS11", "^KQ11"].includes(x.s)).flatMap((x) => x.daily.filter((d) => Math.abs(d.p) >= 1.8).map((d) => `${d.d} ${x.n} ${d.p > 0 ? "+" : ""}${d.p}%`));
  const dayLines = keys.map((d) => {
    const b = B[d], x = D[d]; if (!b && !x) return null;
    return `${d}${lead.includes(d) ? " (지난달)" : ""}: ${x?.line || b?.headline || ""}${x?.event?.t ? ` / 사건: ${x.event.t} — ${x.event.w}` : ""}${b ? ` / 미국: ${(b.us?.why || []).slice(0, 2).join("; ")} / 한국: ${(b.kr?.why || []).slice(0, 2).join("; ")}` : ""}`;
  }).filter(Boolean);
  const nl = news.filter((x) => x.d >= lead[0] && x.d <= last).sort((a, b) => a.d.localeCompare(b.d));
  const tdays = [...new Set(stats.filter((x) => !x.err).flatMap((x) => x.daily.map((d) => d.d)))].sort();
  const dayIdx = tdays.map((d) => `${d}(${wd(d)}): ` + stats.filter((x) => !x.err).map((x) => { const v = x.daily.find((y) => y.d === d); return v ? `${x.n} ${v.p > 0 ? "+" : ""}${v.p}%` : null; }).filter(Boolean).join(", "));
  const candLines = MON_CAND.filter(([s]) => PX[s]).map(([s, n]) => `${n}(${s}) 이달 ${PX[s].chg > 0 ? "+" : ""}${PX[s].chg}% · 큰 날: ${PX[s].rows.filter((r) => Math.abs(r.p) >= 3).map((r) => `${r.d.slice(5)} ${r.p > 0 ? "+" : ""}${r.p}%`).join(", ") || "없음"}`);
  const prompt = `개인투자자 이현의 '주식 월례회' 발표 자료를 만들어요. 기간: ${first} ~ ${last} (${m.slice(5)}월, 어제까지). 앞의 '(지난달)'은 이어지는 흐름을 보여 주기 위한 지난달 마지막 주 자료예요.
공부·기록용이고 투자 권유가 아니에요. "어떻게 하라"는 행동 조언은 쓰지 말고, 무슨 일이 있었고 시장이 어떻게 반응했는지만 정리해요. 쉬운 한국어.

[지수·매크로 이달 변화 (전달 말 → ${last})]
${stats.filter((x) => !x.err).map((x) => `${x.n}(${x.s}) ${x.chg > 0 ? "+" : ""}${x.chg}% · 최고 ${x.hi.d} ${x.hi.c} · 최저 ${x.lo.d} ${x.lo.c}`).join("\n")}

[큰 하루 등락 (1.8% 이상)]
${big.join(", ") || "없음"}

[거래일별 지수 하루 등락 (그날 종가 기준, 미국·한국 거래일이 달라 빈 칸이 있을 수 있어요)]
${dayIdx.join("\n")}

[주요 종목 이달 변화와 3% 넘게 움직인 날]
${candLines.join("\n") || "없음"}

[날짜별 기록 (오늘의 정리·일별 DB)]
${dayLines.join("\n") || "없음"}

[날짜별 기사 제목 (번호 | 날짜 | 매체 | 제목)]
${nl.slice(0, 400).map((x, i) => `${i} | ${x.d} | ${x.src} | ${x.t}`).join("\n")}

규칙
- 숫자는 위 자료에 있는 것만. 없는 사건·발언·숫자를 지어내지 마요.
- quote 는 위 기사 목록의 번호(n)로만 고르고, 제목을 바꾸지 마요.
- 2~3시간 발표용이라 자세하게 써요. 한 줄로 끝내지 말고 맥락·이유·숫자를 풀어서.
- timeline 은 이달 시장을 움직인 굵직한 날 6~12개 (날짜순). move 는 그날 실제로 크게 움직인 지수·종목 (위 자료의 숫자만, 모르면 빈 배열).
- days 는 위 '거래일별 지수 하루 등락'의 모든 거래일 하나하나 (날짜순). story 는 그날 무슨 일이 있었고 시장이 어떻게 반응했는지 4~6문장. idx 는 그날 의미 있게 움직인 지수마다 왜 그렇게 움직였는지 한 줄씩 (숫자는 위 자료만). 미국 날짜·한국 날짜가 하루 어긋나는 점(미국 밤 사건 → 다음 날 한국장)을 풀어서 설명해요.
- themes 는 이달의 사건 테마 4~6개 (예: 젠슨 황 사태, 블루웨이브, 금리 인상 재등장). 테마마다 desc 6~10문장, sym 은 이 테마를 가장 잘 보여 주는 차트 하나 (위 종목 심볼이나 지수 심볼), steps 는 테마가 날짜(요일)별로 어떻게 전개됐는지와 그날 주가·지수 반응 (숫자는 위 자료만), impact 는 테마 전체가 시장에 준 영향 3~5문장, watch 는 앞으로 지켜볼 점.
- stocks 는 이달 화제 개별 종목 4~6개 (위 종목 목록 심볼 우선). about 은 어떤 회사인지 2~3문장, story 는 이달 무슨 일이 있었고 주가가 어떻게 움직였는지 6~10문장 (숫자는 위 자료만), events 는 날짜별 주요 사건과 그날 주가 반응.
- JSON 하나만:
{"title":"이달을 한 줄로 (25자 안)","sub":"부제 한 줄","summary":"이달 시장 요약 4~6문장","lead":"지난달 말부터 이어진 흐름 2~3문장 (없으면 빈 문자열)",
"phases":[{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","name":"구간 이름 (예: 관세 충격)","desc":"한두 문장"}],
"timeline":[{"d":"YYYY-MM-DD","tag":"정책|실적|매크로|지정학|AI·반도체|국내|기타","title":"짧은 제목","what":"무슨 일이 있었나 1~2문장","why":"시장이 왜 그렇게 반응했나 1문장","move":[{"s":"^IXIC","n":"나스닥","p":-2.1}],"quote":[번호, 번호]}],
"days":[{"d":"YYYY-MM-DD","title":"그날 한 줄 제목","story":"4~6문장","idx":[{"s":"^SOX","why":"한 줄"}],"quote":[번호]}],
"themes":[{"name":"테마 이름","desc":"6~10문장","sym":"NVDA","steps":[{"d":"YYYY-MM-DD","what":"그날 무슨 일 + 주가 반응"}],"impact":"3~5문장","watch":"앞으로 볼 점","quote":[번호]}],
"stocks":[{"s":"NVDA","n":"엔비디아","why":"한 줄","about":"2~3문장","story":"6~10문장","events":[{"d":"YYYY-MM-DD","what":"사건 + 주가 반응"}],"watch":"앞으로 볼 점"}],
"numbers":[{"k":"숫자로 본 이달 (예: 코스피 최고치 경신 횟수)","v":"값"}],
"next":["다음 달 확인할 일정·지표 (사실만, 행동 조언 금지)"]}`;
  let ai;
  try {
    const msg = await claude({ max_tokens: 16000, messages: [{ role: "user", content: prompt }] }, "월례회 " + m);
    const t = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""); ai = json(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch (e) { if (isQueued(e)) { await redis([["SET", "stk:mon:pend:" + m, JSON.stringify({ nl }), "EX", 3 * 86400]]); throw e; } return { err: String(e?.message || e).slice(0, 100) }; }
  if (!ai?.title) return { err: "shape" };
  // 답의 기사 번호는 질문을 만들 때의 목록 기준 → 그때 목록을 다시 씀
  const [pd] = await redis([["GET", "stk:mon:pend:" + m]]); const NL = json(pd)?.nl || nl;
  const qq = (x, k) => { x.quotes = (x.quote || []).map((n) => NL[+n]).filter(Boolean).slice(0, k); delete x.quote; };
  (ai.timeline || []).forEach((x) => qq(x, 2)); (ai.days || []).forEach((x) => qq(x, 3)); (ai.themes || []).forEach((x) => qq(x, 3));
  // 테마·종목 차트용 종가 (후보에 없던 심볼은 여기서 받아요)
  const need = [...new Set([...(ai.stocks || []).map((x) => x.s), ...(ai.themes || []).map((x) => x.sym)].filter((x) => x && !PX[x] && !MON_IDX.some(([s]) => s === x)))].slice(0, 8);
  const extra = await Promise.all(need.map((x) => deps.chart(x, "6mo").catch(() => null))); need.forEach((x, i) => { const v = pxRows(extra[i], first, last); if (v) PX[x] = v; });
  const px = { ...PX }; // 후보 종목 전부 (겹쳐 보기 차트용) + AI가 고른 종목
  const pxn = Object.fromEntries([...MON_CAND, ...(ai.stocks || []).map((x) => [x.s, x.n])]);
  const out = { m, from: first, upto: last, at: Date.now(), ...ai, ndays: ai.days, days: keys.filter((d) => B[d] || D[d]).length, stats, px, pxn };
  delete out.ndays; out.daily = ai.days || [];
  await redis([["SET", "stk:mon:" + m, JSON.stringify(out)], ["DEL", "stk:mon:pend:" + m], ["LREM", "stk:mons", 0, m], ["LPUSH", "stk:mons", m]]);
  return out;
}
