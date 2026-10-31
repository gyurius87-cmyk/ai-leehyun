// 주식 유튜버: 등록한 채널의 새 영상(RSS, 키 없음) + 자막(되면)이나 설명란으로 AI 요약
import Anthropic from "@anthropic-ai/sdk";
import { redis } from "./_redis.js";
import { recordUsage } from "./_usage.js";

const MODEL = process.env.STOCK_MODEL || "claude-sonnet-5-5";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const unxml = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

// 처음 등록해 두는 채널 (이현님이 지우거나 더할 수 있음)
const SEED = ["@syukaworld", "@3protv", "@sosumonkey"];

// 채널 주소·@핸들·UC아이디 → { id, name, handle }
export async function resolveChannel(raw) {
  const t = String(raw || "").trim(); let id = (t.match(/(UC[\w-]{22})/) || [])[1], handle = (t.match(/@([\w.\-가-힣%]+)/) || [])[1];
  const page = id ? `https://www.youtube.com/channel/${id}` : handle ? `https://www.youtube.com/@${handle}` : null; if (!page) return null;
  const r = await fetch(page, { headers: UA }); if (!r.ok) return null; const h = await r.text();
  id ||= (h.match(/"externalId":"(UC[\w-]{22})"/) || h.match(/channel\/(UC[\w-]{22})/) || [])[1]; if (!id) return null;
  const name = unxml((h.match(/<meta property="og:title" content="([^"]*)"/) || [])[1]) || handle || id;
  return { id, name, handle: handle ? "@" + decodeURIComponent(handle) : "" };
}

async function channels() {
  const [c] = await redis([["GET", "stk:yt:ch"]]); let ch = json(c);
  if (!ch) { ch = (await Promise.all(SEED.map((h) => resolveChannel(h).catch(() => null)))).filter(Boolean); await redis([["SET", "stk:yt:ch", JSON.stringify(ch)]]); }
  return ch;
}
export async function ytAdd(raw) { const ch = await channels(), c = await resolveChannel(raw); if (!c) return null; if (!ch.some((x) => x.id === c.id)) ch.push(c); await redis([["SET", "stk:yt:ch", JSON.stringify(ch)]]); return c; }
export async function ytDel(id) { const ch = (await channels()).filter((x) => x.id !== id); await redis([["SET", "stk:yt:ch", JSON.stringify(ch)]]); return ch; }

async function feed(c) {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`, { headers: UA }); if (!r.ok) return [];
  const x = await r.text();
  return [...x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<yt:videoId>([^<]+)/) || [])[1], ch: c.id, chName: c.name, title: unxml((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
    at: (e.match(/<published>([^<]+)/) || [])[1], desc: unxml((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1]).slice(0, 3000),
    short: /\/shorts\//.test((e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || ""),
  })).filter((v) => v.id);
}

// 자막 (유튜브가 서버 접속을 막으면 빈 문자열 → 설명란으로 요약)
async function transcript(vid) {
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", { method: "POST", headers: { ...UA, "Content-Type": "application/json" }, body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "ko" } }, videoId: vid }) });
    const j = await r.json(), tr = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []; if (!tr.length) return "";
    const pick = tr.find((t) => t.languageCode === "ko" && t.kind !== "asr") || tr.find((t) => t.languageCode === "ko") || tr[0];
    const x = await (await fetch(pick.baseUrl.replace(/&fmt=[^&]*/, ""), { headers: UA })).text();
    return [...x.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g)].map(([, t]) => unxml(t.replace(/<[^>]+>/g, ""))).join(" ").replace(/\s+/g, " ").trim();
  } catch { return ""; }
}

// 구글 Gemini는 유튜브 주소만 주면 영상을 직접 보고 내용을 정리해 줌 (GEMINI_API_KEY가 있을 때)
// 무료 한도(분당 토큰)에 걸리지 않게 화면은 10초에 한 장, 저해상도로만 봄. 실패하면 이유를 돌려줌.
async function geminiNotes(vid) {
  const key = process.env.GEMINI_API_KEY; if (!key) return { t: "", err: "GEMINI_API_KEY가 Vercel에 없어요" };
  const call = async (meta) => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({
      contents: [{ parts: [{ file_data: { file_uri: `https://www.youtube.com/watch?v=${vid}` }, ...(meta ? { video_metadata: { fps: 0.1 } } : {}) }, { text: "이 주식·경제 영상의 내용을 한국어로 자세히 정리해 주세요. 말한 주장, 근거로 든 숫자·차트, 언급한 종목과 그에 대한 의견(사라/팔라/관망), 결론을 빠짐없이. 2000자 이내." }] }],
      generationConfig: { mediaResolution: "MEDIA_RESOLUTION_LOW", maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 0 } } }) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, t: (j?.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("").trim(), msg: j?.error?.message || j?.candidates?.[0]?.finishReason || "" };
  };
  try {
    let o = await call(true); if (o.status === 400) o = await call(false);
    if (o.t) return { t: o.t };
    const why = o.status === 429 ? "Gemini 무료 한도에 걸렸어요 (잠시 뒤 다시)" : o.status === 400 || o.status === 403 ? `Gemini가 거절했어요 (${o.status}): ${o.msg.slice(0, 120)}` : `Gemini 응답 없음 (${o.status} ${o.msg.slice(0, 80)})`;
    return { t: "", err: why };
  } catch (e) { return { t: "", err: "Gemini 연결 실패: " + String(e?.message || e).slice(0, 80) }; }
}

async function summarize(v) {
  let tx = await transcript(v.id), basis = tx.length > 300 ? "자막" : "설명란", gErr = "";
  if (basis === "설명란") { const g = await geminiNotes(v.id); if (g.t.length > 200) { tx = g.t; basis = "영상"; } else gErr = g.err || "영상 내용을 거의 못 받았어요"; }
  if (basis === "설명란") { await redis([["SET", "stk:yt:e:" + v.id, JSON.stringify({ err: gErr, at: Date.now() }), "EX", "86400"]]); return { err: gErr }; } // 이현님 요청(10/31): 설명란만 보고 하는 요약은 안 함
  const prompt = `주식 유튜브 영상을 한국어로 요약해 주세요. ${basis === "설명란" ? "자막을 못 받아서 제목과 설명란만 있어요. 거기 없는 내용은 지어내지 말고, 정보가 적으면 적다고 써 주세요." : ""}
채널: ${v.chName}
제목: ${v.title}
설명란: ${v.desc.slice(0, 1500)}
${tx ? `${basis === "영상" ? "영상 내용 정리" : "자막(앞부분)"}: ${tx.slice(0, 14000)}` : ""}

JSON 하나만 답해 주세요:
{"sum":["핵심 한 줄","핵심 한 줄","핵심 한 줄"],"points":["숫자·근거가 담긴 포인트 (최대 5개)"],"stocks":["언급된 종목·자산 이름 (최대 8개)"],"tone":"강세|약세|중립|정보"}`;
  const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 1500, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] });
  await recordUsage(msg.usage || {}, MODEL);
  const txt = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""), o = json(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  if (!o?.sum) return null;
  const out = { sum: o.sum.slice(0, 3), points: (o.points || []).slice(0, 5), stocks: (o.stocks || []).slice(0, 8), tone: o.tone || "정보", basis, at: Date.now() };
  await redis([["SET", "stk:yt:s:" + v.id, JSON.stringify(out)]]);
  return out;
}

// 새 영상 받기 + 아직 요약 없는 최근 영상 요약 (한 번에 max개까지)
export async function ytSync(max = 8) {
  const ch = await channels(), lists = await Promise.all(ch.map((c) => feed(c).catch(() => [])));
  const all = lists.flat().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 120);
  await redis([["SET", "stk:yt:feed", JSON.stringify(all)], ["SET", "stk:yt:at", String(Date.now())]]);
  const recent = all.filter((v) => Date.now() - Date.parse(v.at) < 10 * 864e5).slice(0, 40);
  const have = recent.length ? await redis([...recent.map((v) => ["GET", "stk:yt:s:" + v.id]), ...recent.map((v) => ["GET", "stk:yt:e:" + v.id])]) : [];
  const todo = recent.filter((_, i) => { const h = json(have[i]), e = json(have[recent.length + i]); return (!h || h.basis === "설명란") && !(e && Date.now() - e.at < 3600e3 && !/GEMINI_API_KEY/.test(e.err)); }).slice(0, max);
  // 서버 시간 제한(120초) 안에 끝나도록: 75초가 지나면 새로 시작하지 않음
  const t0 = Date.now(); let done = 0;
  for (let i = 0; i < todo.length && Date.now() - t0 < 75e3; i += 3) { const rs = await Promise.all(todo.slice(i, i + 3).map((v) => summarize(v).catch((e) => ({ err: String(e?.message || e) })))); done += rs.filter((r) => r && !r.err).length; }
  return { videos: all.length, summarized: done, tried: todo.length };
}
export async function ytOne(vid) { const [f] = await redis([["GET", "stk:yt:feed"]]); const v = (json(f) || []).find((x) => x.id === vid); return v ? summarize(v) : null; }

export async function ytAll() {
  const [c, f, at, seen] = await redis([["GET", "stk:yt:ch"], ["GET", "stk:yt:feed"], ["GET", "stk:yt:at"], ["SMEMBERS", "stk:yt:seen"]]);
  const feedL = (json(f) || []).slice(0, 80), sums = feedL.length ? await redis([...feedL.map((v) => ["GET", "stk:yt:s:" + v.id]), ...feedL.map((v) => ["GET", "stk:yt:e:" + v.id])]) : [];
  return { at: +at || 0, gem: !!process.env.GEMINI_API_KEY, seen: seen || [], ch: json(c) || [], feed: feedL.map((v, i) => { const sm = json(sums[i]), e = json(sums[feedL.length + i]); return { ...v, desc: v.desc.slice(0, 300), s: sm && sm.basis !== "설명란" ? sm : null, e: e?.err || null }; }) };
}

// 내가 본 영상 표시 (사이트에서 열었거나 '봤어요'를 누른 것)
export async function ytSeen(id, on) { await redis([[on ? "SADD" : "SREM", "stk:yt:seen", String(id)]]); }
