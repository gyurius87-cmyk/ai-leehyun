// 동기부여 저장소. 이현님이 고른 유튜브 영상 목록 (Redis 해시 motiv:items, id → 항목 JSON).
// 보기·추가·삭제 모두 ADMIN_KEY(관리자 키)를 아는 이현님만. /api/motiv 로 들어와 youtube.js 가 넘겨줌 (함수 12개 한도).
import { redis, hasRedis } from "./_redis.js";

const KEY = "motiv:items";
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const pairs = (flat) => { const o = {}; for (let i = 0; flat && i < flat.length; i += 2) o[flat[i]] = flat[i + 1]; return o; };
export const ytId = (u) => {
  const s = String(u || "").trim();
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/) || s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
};
async function ytInfo(vid) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + vid)}`);
    if (!r.ok) return {};
    const j = await r.json();
    return { title: clip(j.title, 100), by: clip(j.author_name, 60) };
  } catch { return {}; }
}

export default async function motiv(req, res) {
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  res.setHeader("Cache-Control", "no-store");
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  if (!admin) return res.status(401).json({ error: "auth" });

  if (req.method === "GET") {
    const [h] = await redis([["HGETALL", KEY]]);
    return res.json({ items: Object.values(pairs(h)).map((v) => JSON.parse(v)) });
  }
  if (req.method !== "POST") return res.status(405).end();
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }

  if (b.op === "add") {
    const urls = (Array.isArray(b.urls) ? b.urls : []).slice(0, 30);
    const [h] = await redis([["HGETALL", KEY]]);
    const have = pairs(h);
    if (Object.keys(have).length >= 1000) return res.status(400).json({ error: "full" });
    const added = [], dup = [], bad = [];
    for (const u of urls) {
      const vid = ytId(u);
      if (!vid) { bad.push(clip(u, 80)); continue; }
      if (have[vid] || added.some((a) => a.id === vid)) { dup.push(vid); continue; }
      const short = /\/shorts\//.test(String(u));
      added.push({ id: vid, short, at: Date.now(), plays: 0, ...(await ytInfo(vid)) });
    }
    if (added.length) await redis([["HSET", KEY, ...added.flatMap((a) => [a.id, JSON.stringify(a)])]]);
    return res.json({ added, dup, bad });
  }
  if (b.op === "del" || b.op === "play" || b.op === "memo") {
    const vid = ytId(b.id);
    if (!vid) return res.status(400).json({ error: "id" });
    if (b.op === "del") { await redis([["HDEL", KEY, vid]]); return res.json({ ok: true }); }
    const [cur] = await redis([["HGET", KEY, vid]]);
    if (!cur) return res.status(404).json({ error: "none" });
    const it = JSON.parse(cur);
    if (b.op === "play") { it.plays = (it.plays || 0) + 1; it.last = Date.now(); }
    else it.memo = clip(b.memo, 200);
    await redis([["HSET", KEY, vid, JSON.stringify(it)]]);
    return res.json({ item: it });
  }
  return res.status(400).json({ error: "op" });
}
