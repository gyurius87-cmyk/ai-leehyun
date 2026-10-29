// 공부한 것 고치기. 사이트의 data/timeline.json 위에 덮어쓰는 수정본을 Redis(tl:edits)에 둠.
// 보기는 누구나(고친 내용이 모두에게 보여야 하니까), 고치기는 ADMIN_KEY(Vercel 환경변수)를 아는 이현님만.
import { redis, hasRedis } from "./_redis.js";

const H = "tl:edits";
const CATS = ["사이트", "프로그램", "자동화", "브랜드", "공부노트", "사업", "재테크모임"];
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const item = (b) => {
  const o = { text: clip(b.text, 400), cat: CATS.includes(b.cat) ? b.cat : "사이트", time: /^\d{2}:\d{2}$/.test(b.time) ? b.time : "" };
  const link = clip(b.link, 300);
  if (link && /^(\/|https:\/\/)/.test(link)) o.link = link;
  return o;
};

export default async function handler(req, res) {
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  if (req.method === "GET") {
    const flat = (await redis([["HGETALL", H]]))[0] || [];
    const edits = {};
    for (let i = 0; i < flat.length; i += 2) { try { edits[flat[i]] = JSON.parse(flat[i + 1]); } catch {} }
    res.setHeader("Cache-Control", "no-store");
    return res.json({ edits });
  }
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  if (!admin) return res.status(401).json({ error: "auth" });
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const k = clip(b.k, 120);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : "";
  // op: edit(원래 항목 고치기) · del(원래 항목 숨기기) · add(새 항목) · undo(고친 것 되돌리기) · min(그날 공부 시간)
  if (b.op === "edit" && k) {
    const o = item(b);
    if (!o.text) return res.status(400).json({ error: "text" });
    await redis([["HSET", H, k, JSON.stringify(o)]]);
  } else if (b.op === "del" && k) await redis([["HSET", H, k, JSON.stringify({ del: true })]]);
  else if (b.op === "undo" && k) await redis([["HDEL", H, k]]);
  else if (b.op === "add" && date) {
    const o = item(b);
    if (!o.text || !o.time) return res.status(400).json({ error: "text" });
    const id = /^add\|/.test(k) ? k : `add|${date}|${Date.now().toString(36)}`;
    await redis([["HSET", H, id, JSON.stringify({ ...o, date })]]);
  } else if (b.op === "min" && date) {
    const m = Math.round(Number(b.minutes));
    if (!(m >= 0 && m <= 1440)) return res.status(400).json({ error: "minutes" });
    await redis([["HSET", H, `min|${date}`, JSON.stringify({ minutes: m })]]);
  } else return res.status(400).json({ error: "op" });
  return res.json({ ok: true });
}
