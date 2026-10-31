// 일별 DB: 그날 모든 탭(오늘의 정리·지수·뉴스·유튜버·SNS 발언·레딧·유명인 포폴·대가 매매)을 모아 Claude가 한 줄씩 남김.
// 매일 아침 cron이 '어제' 것을 만들고, 화면에서 오늘 것을 미리 만들거나 다시 만들 수 있음. stk:db:<날짜>, 목록 stk:dbdays.
import Anthropic from "@anthropic-ai/sdk";
import { redis, kstDay } from "./_redis.js";
import { recordUsage } from "./_usage.js";
import { famousAll } from "./_famous.js";

const MODEL = process.env.STOCK_MODEL || "claude-sonnet-5-5";
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const kd = (t) => (t ? kstDay(new Date(typeof t === "number" ? t : Date.parse(t))) : "");

// deps: { snapshot, news, backtest } (_stock.js에서 넘겨줌, 서로 import하지 않게)
export async function dayDb(day, deps, force) {
  const key = "stk:db:" + day;
  if (!force) { const [c] = await redis([["GET", key]]); const j = json(c); if (j) return j; }
  const today = kstDay(), recent = (Date.parse(today) - Date.parse(day)) / 864e5 <= 1;
  const [[br, feed, soc], snap, nw, bt, fam] = await Promise.all([
    redis([["GET", "stk:brief:" + day], ["GET", "stk:yt:feed"], ["GET", "stk:soc"]]),
    recent ? deps.snapshot().catch(() => null) : null,
    recent ? deps.news().catch(() => null) : null,
    deps.backtest().catch(() => null),
    famousAll().catch(() => null),
  ]);
  const B = json(br), F = (json(feed) || []).filter((v) => kd(v.at) === day), S = json(soc);
  const sums = F.length ? await redis(F.map((v) => ["GET", "stk:yt:s:" + v.id])) : [];
  const yt = F.map((v, i) => ({ ...v, s: json(sums[i]) }));
  const picks = (S?.people || []).flatMap((p) => p.picks.filter((x) => kd(x.at) === day || (recent && !x.at)).map((x) => ({ who: p.who, ...x })));
  const raws = (S?.people || []).flatMap((p) => p.raw.filter((x) => kd(x.at) === day).map((x) => ({ who: p.who, t: x.t })));
  const mt = Object.entries(bt?.masters || {}).flatMap(([id, m]) => (m.trades || []).filter((t) => t.d === day).map((t) => ({ id, n: t.n, side: t.side, why: t.why })));
  const fm = (fam?.list || []).filter((f) => f.data && (f.data.filed === day || f.data.day === day)).map((f) => ({ who: f.who, news: (f.data.rows || []).filter((r) => r.ch === "new").slice(0, 5).map((r) => r.n || r.t), sold: (f.data.sold || []).slice(0, 5).map((r) => r.n || r.t) }));

  const counts = { yt: yt.length, ytSum: yt.filter((v) => v.s).length, sns: picks.length, snsRaw: raws.length, master: mt.length, famous: fm.length, news: recent ? nw?.items?.length || 0 : 0 };
  const parts = [
    B ? `[오늘의 정리] ${B.headline}\n미국: ${B.us?.move || ""} 이유: ${(B.us?.why || []).join(" / ")}\n한국: ${B.kr?.move || ""} 이유: ${(B.kr?.why || []).join(" / ")}\n매크로: ${(B.macro || []).join(" / ")}\n전문가: ${(B.experts || []).map((e) => `${e.who}(${e.src}): ${e.said}`).join(" / ")}` : "[오늘의 정리] 없음",
    snap ? `[지수 (자료 날짜 표시)] ${snap.indices.filter((x) => !x.err).map((x) => `${x.n} ${x.d1}% [${x.d}]`).join(", ")}` : "",
    nw ? `[주요 헤드라인] ${nw.items.slice(0, 30).map((x) => x.title).join(" | ")}` : "",
    `[유튜버 영상 ${yt.length}개] ${yt.map((v) => `${v.chName}: ${v.title}${v.s ? ` → ${v.s.sum?.[0] || ""} (${v.s.tone}; 종목 ${(v.s.stocks || []).join(",")})` : ""}`).join(" | ") || "없음"}`,
    `[SNS 발언 해석 ${picks.length}개] ${picks.map((x) => `${x.who}: ${x.take} (${x.impact}; ${(x.stocks || []).join(",")})`).join(" | ") || "없음"}`,
    raws.length ? `[유명인 관련 헤드라인 ${raws.length}개] ${raws.slice(0, 25).map((x) => `${x.who}: ${x.t}`).join(" | ")}` : "",
    recent && S?.reddit ? `[레딧 월스트리트베츠 많이 언급] ${S.reddit.top.slice(0, 8).map((t) => t.s).join(", ")}` : "",
    `[대가 모의 매매 ${mt.length}건] ${mt.map((t) => `${t.id} ${t.n} ${t.side}`).join(", ") || "없음"}`,
    fm.length ? `[유명인 포트폴리오 공시] ${fm.map((f) => `${f.who}: 새로 ${f.news.join(",") || "-"} / 판 것 ${f.sold.join(",") || "-"}`).join(" | ")}` : "",
  ].filter(Boolean).join("\n\n");

  let ai = null;
  try {
    const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 2500, output_config: { effort: "low" }, messages: [{ role: "user", content: `아래는 ${day}(한국 시간) 하루 동안 주식 프로그램에 모인 자료예요. 나중에 날짜별로 흐름을 훑어볼 수 있게 '그날의 DB'를 한국어로 짧게 남겨 주세요.
자료에 없는 사건이나 숫자는 지어내지 마세요. 자료가 없는 칸은 빈 문자열로 두세요.

${parts}

JSON 하나만:
{"line":"그날을 한 줄로 (무슨 일이 굵었나)","mood":"강세|약세|혼조|관망","keys":["그날 키워드 3~6개"],"hot":["그날 여러 곳에서 많이 나온 종목·자산 최대 6개"],"market":"지수·매크로 한 줄","talk":"뉴스·전문가·유명인 발언에서 많았던 이야기 한 줄","yt":"유튜버들이 많이 다룬 것 한 줄","masters":"대가 매매·유명인 포폴 움직임 한 줄"}` }] });
    await recordUsage(msg.usage || {}, MODEL);
    const t = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    ai = json(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch (e) { return { day, err: String(e?.message || e).slice(0, 100) }; }
  if (!ai?.line) return { day, err: "shape" };
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
