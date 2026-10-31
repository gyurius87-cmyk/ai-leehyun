// 시장·뉴스 묶음 (Vercel 무료 요금제 함수 12개 제한 때문에 한 파일에서 나눔)
// /api/market?ainews=1 → AI 백과사전 'AI 새 소식' (예전 /api/ai-news)
// /api/market?op=... → 주식 프로그램 (이현님 전용, x-admin-key)
import ainews from "./_ainews.js";
import { stockHandler } from "./_stock.js";
import { hasRedis } from "./_redis.js";

export default async function handler(req, res) {
  if (req.query?.ainews) return ainews(req, res);
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  const admin = !!process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  return stockHandler(req, res, admin);
}
