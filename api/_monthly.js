// 월례회: 한 달 동안 무슨 일이 있었고, 지수·종목이 어떻게 움직였는지 발표 자료 한 장으로.
// 재료: 그달의 '오늘의 정리'(stk:brief:<날짜>), 일별 DB(stk:db:<날짜>), 지수·매크로 종가, 날짜별 기사 제목(구글 뉴스, 출처·날짜·링크).
// AI는 claude()(구독 접수함)로. 저장 stk:mon:<YYYY-MM>, 목록 stk:mons.
import { claude, isQueued } from "./_ai.js";
import { redis, kstDay } from "./_redis.js";

const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** k) / 10 ** k);
export const MON_IDX = [["^IXIC", "나스닥"], ["^GSPC", "S&P 500"], ["^SOX", "필라델피아 반도체"], ["^KS11", "코스피"], ["^KQ11", "코스닥"], ["^TNX", "미 10년물 금리"], ["KRW=X", "원/달러"], ["^VIX", "VIX"], ["CL=F", "WTI 유가"], ["GC=F", "금"], ["BTC-USD", "비트코인"]];
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

export async function monthGet(m) { const [c, l] = await redis([["GET", "stk:mon:" + m], ["LRANGE", "stk:mons", 0, 60]]); return { mon: json(c), list: l || [] }; }

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
  const prompt = `개인투자자 이현의 '주식 월례회' 발표 자료를 만들어요. 기간: ${first} ~ ${last} (${m.slice(5)}월, 어제까지). 앞의 '(지난달)'은 이어지는 흐름을 보여 주기 위한 지난달 마지막 주 자료예요.
공부·기록용이고 투자 권유가 아니에요. "어떻게 하라"는 행동 조언은 쓰지 말고, 무슨 일이 있었고 시장이 어떻게 반응했는지만 정리해요. 쉬운 한국어.

[지수·매크로 이달 변화 (전달 말 → ${last})]
${stats.filter((x) => !x.err).map((x) => `${x.n}(${x.s}) ${x.chg > 0 ? "+" : ""}${x.chg}% · 최고 ${x.hi.d} ${x.hi.c} · 최저 ${x.lo.d} ${x.lo.c}`).join("\n")}

[큰 하루 등락 (1.8% 이상)]
${big.join(", ") || "없음"}

[날짜별 기록 (오늘의 정리·일별 DB)]
${dayLines.join("\n") || "없음"}

[날짜별 기사 제목 (번호 | 날짜 | 매체 | 제목)]
${nl.slice(0, 220).map((x, i) => `${i} | ${x.d} | ${x.src} | ${x.t}`).join("\n")}

규칙
- 숫자는 위 자료에 있는 것만. 없는 사건·발언·숫자를 지어내지 마요.
- quote 는 위 기사 목록의 번호(n)로만 고르고, 제목을 바꾸지 마요.
- timeline 은 이달 시장을 움직인 굵직한 날 6~12개 (날짜순). move 는 그날 실제로 크게 움직인 지수·종목 (위 자료의 숫자만, 모르면 빈 배열).
- stocks 는 이달 기사·기록에서 많이 나온 개별 종목 3~6개 (야후 심볼, 한국은 6자리.KS/.KQ). why 는 왜 화제였는지 한 줄.
- JSON 하나만:
{"title":"이달을 한 줄로 (25자 안)","sub":"부제 한 줄","summary":"이달 시장 요약 4~6문장","lead":"지난달 말부터 이어진 흐름 2~3문장 (없으면 빈 문자열)",
"phases":[{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","name":"구간 이름 (예: 관세 충격)","desc":"한두 문장"}],
"timeline":[{"d":"YYYY-MM-DD","tag":"정책|실적|매크로|지정학|AI·반도체|국내|기타","title":"짧은 제목","what":"무슨 일이 있었나 1~2문장","why":"시장이 왜 그렇게 반응했나 1문장","move":[{"s":"^IXIC","n":"나스닥","p":-2.1}],"quote":[번호, 번호]}],
"themes":[{"name":"이달의 테마","desc":"한두 문장","syms":["NVDA"]}],
"stocks":[{"s":"NVDA","n":"엔비디아","why":"한 줄"}],
"numbers":[{"k":"숫자로 본 이달 (예: 코스피 최고치 경신 횟수)","v":"값"}],
"next":["다음 달 확인할 일정·지표 (사실만, 행동 조언 금지)"]}`;
  let ai;
  try {
    const msg = await claude({ max_tokens: 7000, messages: [{ role: "user", content: prompt }] }, "월례회 " + m);
    const t = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""); ai = json(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch (e) { if (isQueued(e)) { await redis([["SET", "stk:mon:pend:" + m, JSON.stringify({ nl }), "EX", 3 * 86400]]); throw e; } return { err: String(e?.message || e).slice(0, 100) }; }
  if (!ai?.title) return { err: "shape" };
  // 답의 기사 번호는 질문을 만들 때의 목록 기준 → 그때 목록을 다시 씀
  const [pd] = await redis([["GET", "stk:mon:pend:" + m]]); const NL = json(pd)?.nl || nl;
  (ai.timeline || []).forEach((x) => { x.quotes = (x.quote || []).map((n) => NL[+n]).filter(Boolean).slice(0, 2); delete x.quote; });
  const out = { m, from: first, upto: last, at: Date.now(), ...ai, stats, days: keys.filter((d) => B[d] || D[d]).length };
  await redis([["SET", "stk:mon:" + m, JSON.stringify(out)], ["DEL", "stk:mon:pend:" + m], ["LREM", "stk:mons", 0, m], ["LPUSH", "stk:mons", m]]);
  return out;
}
