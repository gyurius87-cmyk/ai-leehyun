// 스터디 (블로그): 스터디 발표 글. 블록 = 글(마크다운) | 사진 | 영상 | 제로에게 맡기기(AI가 채우는 칸)
// 저장: stk:blog:<id> {id,title,blocks,at,upd}, 목록 stk:blogs (id), 사진 stk:bimg:<id> (data URL, 화면에서 줄여서 올림)
import { claude } from "./_ai.js";
import { redis, kstDay } from "./_redis.js";

const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clip = (s, n) => String(s ?? "").slice(0, n);
const cleanBlock = (b) => {
  const t = ["text", "img", "video", "ai"].includes(b?.t) ? b.t : "text";
  if (t === "img") return { t, img: clip(b.img, 40), cap: clip(b.cap, 300) };
  if (t === "video") return { t, url: clip(b.url, 500), cap: clip(b.cap, 300) };
  if (t === "ai") return { t, ask: clip(b.ask, 3000), out: clip(b.out, 30000), at: +b.at || 0 };
  return { t, md: clip(b.md, 30000) };
};

export async function blogList() {
  const [ids] = await redis([["LRANGE", "stk:blogs", 0, 199]]); if (!ids?.length) return { list: [] };
  const vals = await redis(ids.map((i) => ["GET", "stk:blog:" + i]));
  return { list: vals.map(json).filter(Boolean).map((p) => ({ id: p.id, title: p.title, at: p.at, upd: p.upd, n: p.blocks.length, cover: p.blocks.find((b) => b.t === "img")?.img || "", lead: (p.blocks.find((b) => b.t === "text" && b.md)?.md || "").slice(0, 120) })) };
}
export async function blogGet(id) { const [c] = await redis([["GET", "stk:blog:" + id]]); return json(c); }
export async function blogSave(p) {
  const id = /^[a-z0-9]{6,20}$/.test(p?.id || "") ? p.id : nid(), old = await blogGet(id);
  const out = { id, title: clip(p?.title, 200) || "제목 없음", blocks: (p?.blocks || []).slice(0, 300).map(cleanBlock), at: old?.at || Date.now(), upd: Date.now() };
  await redis([["SET", "stk:blog:" + id, JSON.stringify(out)], ...(old ? [] : [["LPUSH", "stk:blogs", id]])]);
  return out;
}
export async function blogDel(id) { const p = await blogGet(id); await redis([["DEL", "stk:blog:" + id], ["LREM", "stk:blogs", 0, id], ...(p?.blocks || []).filter((b) => b.t === "img" && b.img).map((b) => ["DEL", "stk:bimg:" + b.img])]); return { ok: true }; }
export async function blogImgPut(data) {
  if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(data || "") || data.length > 950000) return { err: "img" };
  const id = nid(); await redis([["SET", "stk:bimg:" + id, data]]); return { id };
}
export async function blogImgGet(id) { const [d] = await redis([["GET", "stk:bimg:" + id]]); return { data: d || "" }; }

// 제로에게 맡기기: 글 전체를 맥락으로, 그 칸의 부탁을 채움 (구독 접수함)
export async function blogAi(id, bi, deps) {
  const p = await blogGet(id); if (!p) return { err: "none" }; const b = p.blocks[+bi]; if (!b || b.t !== "ai" || !b.ask.trim()) return { err: "block" };
  const ctx = p.blocks.map((x, i) => (i === +bi ? `[▶ 여기를 채워 주세요: ${x.ask}]` : x.t === "text" ? x.md : x.t === "img" ? `[사진${x.cap ? ": " + x.cap : ""}]` : x.t === "video" ? `[영상 ${x.url}${x.cap ? " " + x.cap : ""}]` : x.out ? `[제로가 쓴 칸: ${x.out.slice(0, 1500)}]` : "")).filter(Boolean).join("\n\n");
  const [br] = await redis([["GET", "stk:brief:" + kstDay()]]); const B = json(br);
  const prompt = `이현이 주식 스터디 발표 글을 블로그처럼 쓰고 있어요. 글 중간의 한 칸을 당신(제로)에게 맡겼어요. 그 칸에 들어갈 내용만 써 주세요.
- 이현의 부탁: ${b.ask}
- 글 제목: ${p.title}
- 쉬운 한국어, 마크다운 (소제목 ##, 목록, 표 가능). 앞뒤 글과 자연스럽게 이어지게. 인사말·설명 없이 칸에 들어갈 내용만.
- 모르는 최신 사실·숫자는 지어내지 말고 "확인 필요"라고 적어요. 투자 권유가 아니라 공부용이에요.
${B?.headline ? `- 참고: 오늘(${kstDay()}) 시장 정리 한 줄: ${B.headline}` : ""}

[지금까지의 글]
${ctx}`;
  const msg = await claude({ max_tokens: 4000, messages: [{ role: "user", content: prompt }] }, "스터디 글 칸");
  const t = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("").trim();
  const now = await blogGet(id); const nb = now?.blocks?.[+bi]; if (!nb || nb.t !== "ai") return { err: "moved" };
  nb.out = t; nb.at = Date.now(); now.upd = Date.now();
  await redis([["SET", "stk:blog:" + id, JSON.stringify(now)]]);
  return now;
}
