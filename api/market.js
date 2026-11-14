// 시장·뉴스 묶음 (Vercel 무료 요금제 함수 12개 제한 때문에 한 파일에서 나눔)
// /api/market?ainews=1 → AI 백과사전 'AI 새 소식' (예전 /api/ai-news)
// /api/market?op=... → 주식 프로그램 (이현님 전용, x-admin-key)
// 주식의 AI는 API 키를 쓰지 않아요: _ai.js 의 접수함 → 이현님 구독 Claude 예약 작업이 처리
import ainews from "./_ainews.js";
import { stockHandler } from "./_stock.js";
import { hasRedis } from "./_redis.js";
import { aiRun, newRid, aiMissed, isQueued, aiReq, aiSaveRes, aiList, aiPut, aiStat, aiReady, capRes } from "./_ai.js";

// 요청 하나를 접수함 방식으로 실행: AI 답이 아직 없으면 202 {queued, rid}
async function runStock(rid, req, admin) {
  const cap = capRes(); let missed = 0, err = null;
  await aiRun(rid, { method: req.method, query: req.query || {}, body: req.body || null }, async () => {
    try { await stockHandler(req, cap, admin); } catch (e) { if (!isQueued(e)) err = e; }
    missed = aiMissed();
  });
  if (err) throw err;
  return { cap, missed };
}

export default async function handler(req, res) {
  if (req.query?.ainews) return ainews(req, res);
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  const admin = !!process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  const op = req.query?.op || req.body?.op;
  if (op && op.startsWith("ai") && op !== "aistat" && !admin) return res.status(401).json({ error: "auth" });
  res.setHeader("Cache-Control", "no-store");
  // ── 접수함 (예약 작업·화면용)
  if (op === "aistat") { if (!admin) return res.status(401).json({ error: "auth" }); return res.json(await aiStat(String(req.query.rid || ""))); }
  if (op === "aiq") { const r = await aiReady(); return res.json({ ...r, list: await aiList(+req.query.n || 20) }); }
  if (op === "aiput") return res.json(await aiPut(req.body?.items || (req.body?.key ? [req.body] : [])));
  if (op === "aireplay") {
    const rid = String(req.body?.rid || req.query.rid || ""); const r0 = await aiReq(rid);
    if (!r0) { await aiSaveRes(rid, 410, { error: "gone" }); return res.json({ rid, gone: true }); }
    const fake = { method: r0.method, query: r0.query || {}, body: r0.body, headers: {} };
    const { cap, missed } = await runStock(rid, fake, true).catch((e) => ({ cap: { code: 502, body: { error: String(e?.message || e).slice(0, 120) } }, missed: 0 }));
    if (missed) return res.json({ rid, queued: missed });
    await aiSaveRes(rid, cap.code, cap.body); return res.json({ rid, done: true, status: cap.code });
  }
  const rid = newRid();
  const { cap, missed } = await runStock(rid, req, admin).catch((e) => { console.error(e); return { cap: { code: 502, body: { error: "fail" }, headers: {}, sent: true }, missed: 0 }; });
  // AI 답을 기다려야 끝나는 요청이면 접수 번호를 돌려줘요 (화면이 op=aistat 으로 기다림)
  if (missed && (cap.code >= 300 || !cap.sent)) return res.status(202).json({ queued: true, rid, n: missed });
  for (const [k, v] of Object.entries(cap.headers || {})) res.setHeader(k, v);
  if (missed) res.setHeader("x-ai-queued", rid);
  return res.status(cap.code).json(cap.body ?? {});
}
