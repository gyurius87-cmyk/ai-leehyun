// 엄마 일기. 가족은 공유 주소(?k=보기 열쇠)로 보기만, 추가·수정·삭제는 ADMIN_KEY(Vercel 환경변수)를 아는 이현님만.
// 저장(Redis): mom:items (hash id → 항목 JSON), mom:key (보기 열쇠)
import { redis, hasRedis } from "./_redis.js";

const SECS = ["sched", "bucket", "video", "health", "trip"];
// 여행 다녀온 곳: 시·도 코드 (kmap.json 과 같음)
const REGIONS = ["11", "21", "22", "23", "24", "25", "26", "29", "31", "32", "33", "34", "35", "36", "37", "38", "39"];
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);
const okId = (s) => /^[a-z0-9]{6,20}$/.test(String(s || ""));
const okDate = (s) => /^20\d\d-\d\d-\d\d$/.test(String(s || ""));
const okTime = (s) => /^\d\d:\d\d$/.test(String(s || ""));
const newId = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const pairs = (flat) => { const o = {}; for (let i = 0; flat && i < flat.length; i += 2) o[flat[i]] = flat[i + 1]; return o; };

// 유튜브 주소 → 영상 id (일반·짧은 주소·쇼츠·임베드)
export const ytId = (u) => {
  const s = String(u || "").trim();
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/) || s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
};

async function ytTitle(vid) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + vid)}`);
    if (!r.ok) return "";
    return clip((await r.json()).title, 80);
  } catch { return ""; }
}

async function clean(b) {
  const sec = SECS.includes(b?.sec) ? b.sec : null;
  if (!sec) return null;
  const it = { id: okId(b.id) ? b.id : newId(), sec, title: clip(b.title, 80), memo: clip(b.memo, 600), at: Number(b.at) || Date.now() };
  if (okDate(b.date)) it.date = b.date;
  if (okTime(b.time)) it.time = b.time;
  if (sec === "sched" || sec === "health") it.place = clip(b.place, 60);
  if (sec === "bucket") { it.done = !!b.done; if (it.done && okDate(b.doneOn)) it.doneOn = b.doneOn; }
  if (sec === "trip") {
    if (!REGIONS.includes(String(b.region))) return { error: "region" };
    it.region = String(b.region);
  }
  if (sec === "video") {
    const vid = ytId(b.url);
    if (!vid) return { error: "url" };
    it.vid = vid;
    if (!it.title) it.title = await ytTitle(vid);
  }
  if (!it.title && sec !== "video" && sec !== "trip") return { error: "title" };
  return it;
}

export default async function handler(req, res) {
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  res.setHeader("Cache-Control", "no-store");
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;

  if (req.method === "GET") {
    let [key, h] = await redis([["GET", "mom:key"], ["HGETALL", "mom:items"]]);
    if (!admin && (!key || req.query.k !== key)) return res.status(401).json({ error: "auth" });
    if (admin && !key) { key = newId(16); await redis([["SET", "mom:key", key]]); }
    const items = Object.values(pairs(h)).map((v) => JSON.parse(v));
    return res.json({ items, admin: !!admin, ...(admin ? { key } : {}) });
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!admin) return res.status(401).json({ error: "auth" });

  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  if (b.op === "save") {
    const it = await clean(b.item);
    if (!it || it.error) return res.status(400).json({ error: it?.error || "item" });
    const [n] = await redis([["HLEN", "mom:items"]]);
    if (n >= 500 && !b.item?.id) return res.status(400).json({ error: "full" });
    await redis([["HSET", "mom:items", it.id, JSON.stringify(it)]]);
    return res.json({ item: it });
  }
  if (b.op === "del") {
    if (!okId(b.id)) return res.status(400).json({ error: "id" });
    await redis([["HDEL", "mom:items", b.id]]);
    return res.json({ ok: true });
  }
  // 공유 주소를 바꾸면 예전 주소로는 더 못 들어옴
  if (b.op === "newKey") {
    const key = newId(16);
    await redis([["SET", "mom:key", key]]);
    return res.json({ key });
  }
  return res.status(400).json({ error: "op" });
}
