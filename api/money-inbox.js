// AI 가계부 알림 받는 칸. 폰(MacroDroid)이 은행·카드 알림을 그대로 보내면 쌓아 두고,
// 밤 12시 예약 작업이 읽어 가계부에 넣은 뒤 비움. 키는 Vercel 환경변수 MONEY_INBOX_KEY (채팅·코드에 두지 않음).
import { redis, hasRedis } from "./_redis.js";

const KEY = "money:inbox";
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export default async function handler(req, res) {
  const secret = process.env.MONEY_INBOX_KEY;
  if (!secret) return res.status(503).json({ error: "no_key" });
  const given = req.headers["x-money-key"] || req.query?.k;
  if (given !== secret) return res.status(401).json({ error: "auth" });
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });

  if (req.method === "POST") {
    let b = req.body ?? {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = { text: b }; } }
    const row = { app: clip(b.app, 40), title: clip(b.title, 120), text: clip(b.text, 500), at: Date.now() };
    if (!row.text && !row.title) return res.status(400).json({ error: "empty" });
    const [len] = await redis([["RPUSH", KEY, JSON.stringify(row)]]);
    await redis([["LTRIM", KEY, -3000, -1], ["EXPIRE", KEY, 60 * 60 * 24 * 120]]);
    return res.status(200).json({ ok: true, waiting: len });
  }
  if (req.method === "GET") {
    const [rows] = await redis([["LRANGE", KEY, 0, -1]]);
    return res.status(200).json({ items: (rows || []).map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean) });
  }
  if (req.method === "DELETE") {
    // 읽어 간 개수만큼 앞에서 지움 (그 사이 새로 온 알림은 남김)
    const n = Math.max(0, Number(req.query?.count) || 0);
    if (n) await redis([["LTRIM", KEY, n, -1]]);
    return res.status(200).json({ ok: true, removed: n });
  }
  return res.status(405).end();
}
