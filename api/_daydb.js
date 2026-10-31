// 일별 DB: 그날 모든 탭(오늘의 정리·지수·뉴스·유튜버·SNS 발언·레딧·유명인 포폴·대가 매매)을 모아 Claude가 한 줄씩 남김.
// 매일 아침 cron이 '어제' 것을 만들고, 화면에서 오늘 것을 미리 만들거나 다시 만들 수 있음. stk:db:<날짜>, 목록 stk:dbdays.
import Anthropic from "@anthropic-ai/sdk";
import { redis, kstDay } from "./_redis.js";
import { recordUsage } from "./_usage.js";
import { famousAll } from "./_famous.js";

const MODEL = process.env.STOCK_MODEL || "claude-sonnet-5-5";
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const kd = (t) => (t ? kstDay(new Date(typeof t === "number" ? t : Date.parse(t))) : "");

const IDX = [["^IXIC", "나스닥"], ["^SOX", "필라델피아 반도체"], ["^GSPC", "S&P500"], ["^KS11", "코스피"], ["^KQ11", "코스닥"], ["^TNX", "미 10년물 금리"], ["KRW=X", "원/달러"], ["^VIX", "VIX"], ["CL=F", "WTI 유가"], ["GC=F", "금"], ["BTC-USD", "비트코인"]];
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const unx = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
// 그날 나온 기사 제목 (구글 뉴스 날짜 검색) — 지난 날도 다시 볼 수 있음
async function newsOn(day) {
  const nx = new Date(Date.parse(day) + 864e5).toISOString().slice(0, 10);
  const one = async (q, hl, gl, ceid) => { try { const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} after:${day} before:${nx}`)}&hl=${hl}&gl=${gl}&ceid=${ceid}`, { headers: UA }); if (!r.ok) return []; return (await r.text()).split("<item>").slice(1, 26).map((it) => unx((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).replace(/\s+-\s+[^-]+$/, "")).filter(Boolean); } catch { return []; } };
  const [en, ko] = await Promise.all([one('("stock market" OR Nasdaq OR "Wall Street" OR Fed OR Nvidia)', "en-US", "US", "US:en"), one("(코스피 OR 코스닥 OR 증시 OR 환율 OR 반도체주)", "ko", "KR", "KR:ko")]);
  return { en: en.slice(0, 22), ko: ko.slice(0, 18) };
}

// deps: { news, backtest, chart } (_stock.js에서 넘겨줌, 서로 import하지 않게)
export async function dayDb(day, deps, force) {
  const key = "stk:db:" + day;
  if (!force) { const [c] = await redis([["GET", key]]); const j = json(c); if (j?.cells) return j; }
  const today = kstDay(), recent = (Date.parse(today) - Date.parse(day)) / 864e5 <= 1;
  const [[br, feed, soc], nd, bt, fam, ...ch] = await Promise.all([
    redis([["GET", "stk:brief:" + day], ["GET", "stk:yt:feed"], ["GET", "stk:soc"]]),
    newsOn(day),
    deps.backtest().catch(() => null),
    famousAll().catch(() => null),
    ...IDX.map(([s]) => deps.chart(s, "3mo").catch(() => null)),
  ]);
  const mv = IDX.map(([s, n], i) => { const rows = ch[i]?.rows || [], k = rows.findIndex((r) => r.d === day); if (k < 1) return `${n}: 그날 거래 없음`; const c = rows[k].c, p = rows[k - 1].c; return `${n}: ${c.toFixed(2)} (${s === "^TNX" ? `${(c - p >= 0 ? "+" : "") + (c - p).toFixed(2)}%p` : `${((c / p - 1) * 100).toFixed(2)}%`})`; });
  const B = json(br), F = (json(feed) || []).filter((v) => kd(v.at) === day), S = json(soc);
  const sums = F.length ? await redis(F.map((v) => ["GET", "stk:yt:s:" + v.id])) : [];
  const yt = F.map((v, i) => ({ ...v, s: json(sums[i]) }));
  const picks = (S?.people || []).flatMap((p) => p.picks.filter((x) => kd(x.at) === day || (recent && !x.at)).map((x) => ({ who: p.who, ...x })));
  const raws = (S?.people || []).flatMap((p) => p.raw.filter((x) => kd(x.at) === day).map((x) => ({ who: p.who, t: x.t })));
  const mt = Object.entries(bt?.masters || {}).flatMap(([id, m]) => (m.trades || []).filter((t) => t.d === day).map((t) => ({ id, n: t.n, side: t.side, why: t.why })));
  const fm = (fam?.list || []).filter((f) => f.data && (f.data.filed === day || f.data.day === day)).map((f) => ({ who: f.who, news: (f.data.rows || []).filter((r) => r.ch === "new").slice(0, 5).map((r) => r.n || r.t), sold: (f.data.sold || []).slice(0, 5).map((r) => r.n || r.t) }));

  const counts = { yt: yt.length, ytSum: yt.filter((v) => v.s).length, sns: picks.length + raws.length, master: mt.length, famous: fm.length, news: nd.en.length + nd.ko.length };
  const parts = [
    `[지수·매크로 그날 종가와 전날 대비] ${mv.join(", ")}`,
    B ? `[그날 아침 오늘의 정리] ${B.headline}\n미국: ${B.us?.move || ""} 이유: ${(B.us?.why || []).join(" / ")}\n한국: ${B.kr?.move || ""} 이유: ${(B.kr?.why || []).join(" / ")}\n전문가: ${(B.experts || []).map((e) => `${e.who}(${e.src}): ${e.said}`).join(" / ")}` : "",
    `[그날 미국 기사 제목] ${nd.en.join(" | ") || "없음"}`,
    `[그날 한국 기사 제목] ${nd.ko.join(" | ") || "없음"}`,
    `[유튜버 영상 ${yt.length}개] ${yt.map((v) => `${v.chName}: ${v.title}${v.s ? ` → ${v.s.sum?.[0] || ""} (${v.s.tone}; 종목 ${(v.s.stocks || []).join(",")})` : ""}`).join(" | ") || "없음"}`,
    `[유명인 SNS·발언 ${picks.length + raws.length}개] ${[...picks.map((x) => `${x.who}: ${x.take} (${x.impact})`), ...raws.slice(0, 20).map((x) => `${x.who}: ${x.t}`)].join(" | ") || "없음"}`,
    recent && S?.reddit ? `[레딧 월스트리트베츠 많이 언급] ${S.reddit.top.slice(0, 8).map((t) => t.s).join(", ")}` : "",
    `[대가 모의 매매 ${mt.length}건] ${mt.map((t) => `${t.id} ${t.n} ${t.side}`).join(", ") || "없음"}`,
    fm.length ? `[유명인 포트폴리오 공시] ${fm.map((f) => `${f.who}: 새로 ${f.news.join(",") || "-"} / 판 것 ${f.sold.join(",") || "-"}`).join(" | ")}` : "",
  ].filter(Boolean).join("\n\n");

  let ai = null;
  try {
    const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 3000, output_config: { effort: "low" }, messages: [{ role: "user", content: `아래는 ${day}(한국 시간) 하루 동안 주식 프로그램에 모인 자료예요. 나중에 날짜별로 흐름을 훑어볼 수 있게 '그날의 DB'를 한국어로 짧게 남겨 주세요.
자료에 없는 사건이나 숫자는 지어내지 마세요. 자료가 없는 칸은 빈 문자열로 두세요.

${parts}

JSON 하나만. 각 칸은 엑셀 칸에 들어갈 만큼 짧게(20~40자), g는 투자자 입장에서 좋음|나쁨|중립, 자료가 없으면 t를 빈 문자열로:
{"line":"그날을 한 줄로 (무슨 일이 굵었나)","mood":"강세|약세|혼조|관망","keys":["키워드 3~5개"],"hot":["그날 많이 나온 종목·자산 최대 5개"],"cells":{"us":{"t":"미국 증시","g":""},"kr":{"t":"한국 증시","g":""},"macro":{"t":"금리·환율·유가·VIX","g":""},"semi":{"t":"반도체·AI","g":""},"news":{"t":"뉴스에서 많았던 이야기","g":""},"policy":{"t":"연준·정책·관세·정치","g":""},"talk":{"t":"유명인 발언","g":""},"yt":{"t":"유튜버들이 많이 다룬 것","g":""},"crowd":{"t":"개미·레딧 분위기","g":""},"masters":{"t":"대가 매매·유명인 포폴","g":""}}}` }] });
    await recordUsage(msg.usage || {}, MODEL);
    const t = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    ai = json(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch (e) { return { day, err: String(e?.message || e).slice(0, 100) }; }
  if (!ai?.line || !ai.cells) return { day, err: "shape" };
  const out = { day, ...ai, counts, partial: day === today, at: Date.now() };
  await redis([["SET", key, JSON.stringify(out)], ["EXPIRE", key, 60 * 60 * 24 * 800], ["LREM", "stk:dbdays", 0, day], ["LPUSH", "stk:dbdays", day], ["LTRIM", "stk:dbdays", 0, 799]]);
  return out;
}

export async function dayDbList(n = 90) {
  const [days] = await redis([["LRANGE", "stk:dbdays", 0, n - 1]]);
  const list = Array.isArray(days) ? [...new Set(days)].sort().reverse() : [];
  const vals = list.length ? await redis(list.map((d) => ["GET", "stk:db:" + d])) : [];
  return { list: vals.map(json).filter(Boolean) };
}

// 지난 n일(오늘 빼고) 중 없는 날을 한꺼번에 만들기
export async function dayDbFill(n, deps, force) {
  const days = Array.from({ length: n }, (_, i) => kstDay(new Date(Date.now() - (i + 1) * 864e5)));
  const r = await Promise.all(days.map((d) => dayDb(d, deps, force).then((x) => (x.err ? "err" : "ok")).catch(() => "err")));
  return { days, r };
}
