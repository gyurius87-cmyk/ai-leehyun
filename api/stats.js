// AI이현 전용 애널리틱스 데이터. ADMIN_KEY(Vercel 환경변수)를 아는 사람만 볼 수 있음.
import { redis, hasRedis, kstDay } from "./_redis.js";

const days = (n) => Array.from({ length: n }, (_, i) => kstDay(new Date(Date.now() - i * 864e5))).reverse();
const pairs = (flat) => { const o = {}; for (let i = 0; flat && i < flat.length; i += 2) o[flat[i]] = Number(flat[i + 1]); return o; };
const merge = (list) => { const o = {}; list.forEach((h) => Object.entries(pairs(h)).forEach(([k, v]) => (o[k] = (o[k] || 0) + v))); return o; };
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

export default async function handler(req, res) {
  const key = process.env.ADMIN_KEY;
  if (!key) return res.status(503).json({ error: "no_admin_key" });
  if (req.headers["x-admin-key"] !== key) return res.status(401).json({ error: "auth" });
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });

  if (req.method === "POST") {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const usd = Number(b.usd);
    if (!(usd >= 0 && usd < 100000)) return res.status(400).json({ error: "usd" });
    const micro = Math.round(usd * 1e6);
    if (b.action === "topup") await redis([["INCRBY", "credit:charged", micro]]);
    else if (b.action === "set") await redis([["SET", "credit:charged", micro]]);
    else return res.status(400).json({ error: "action" });
  }

  const d14 = days(14), d7 = d14.slice(-7);
  const cmds = [
    ...d14.flatMap((d) => [["GET", `v:${d}`], ["PFCOUNT", `u:${d}`], ["HGET", `ai:${d}`, "calls"], ["HGET", `ai:${d}`, "usd_u"]]),
    ...d7.map((d) => ["HGETALL", `p:${d}`]),
    ...d7.map((d) => ["HGETALL", `c:${d}`]),
    ...d7.map((d) => ["HGETALL", `s:${d}`]),
    ["PFCOUNT", ...d7.map((d) => `u:${d}`)],
    ["PFCOUNT", "u:all"],
    ["HGETALL", "ai:total"],
    ["GET", "credit:charged"],
  ];
  const r = await redis(cmds);
  let i = 0;
  const series = d14.map((day) => ({ day, views: Number(r[i++] || 0), visitors: Number(r[i++] || 0), calls: Number(r[i++] || 0), usd: Number(r[i++] || 0) / 1e6 }));
  const pages = top(merge(r.slice(i, (i += 7))), 10), clicks = top(merge(r.slice(i, (i += 7))), 10);
  const srcToday = top(pairs(r[i + 6]), 10), sources = top(merge(r.slice(i, (i += 7))), 10);
  const visitors7 = Number(r[i++] || 0), visitorsAll = Number(r[i++] || 0), ai = pairs(r[i++]), charged = Number(r[i++] || 0) / 1e6;
  const spent = (ai.usd_u || 0) / 1e6;
  return res.status(200).json({
    today: kstDay(), series, pages, clicks, sources, srcToday, visitors7, visitorsAll,
    ai: { calls: ai.calls || 0, inTokens: ai.in || 0, outTokens: ai.out || 0, spent, charged, left: charged ? charged - spent : null, model: process.env.BOTTLENECK_MODEL || "claude-haiku-5-5" },
  });
}
