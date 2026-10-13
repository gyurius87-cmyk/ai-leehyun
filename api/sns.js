// SNS 통합 관리 (AI이현 전용). ADMIN_KEY(Vercel 환경변수)를 아는 사람만 씀.
// GET: 보드 불러오기 / PUT: 보드 저장 / POST {action:"ai"}: 채널별 아이디어·레퍼런스 추천
// 각 플랫폼 연동(자동 업로드, 댓글 가져오기)은 다음 단계. 그때 토큰도 여기(서버)에서만 다룸.
import Anthropic from "@anthropic-ai/sdk";
import { redis, hasRedis } from "./_redis.js";
import { recordUsage } from "./_usage.js";

export const config = { maxDuration: 60 };

const KEY = "sns:board";
const MODEL = process.env.SNS_MODEL || process.env.BOTTLENECK_MODEL || "claude-haiku-5-5";
const clip = (s, n) => String(s ?? "").slice(0, n);

const PROMPT = (c, recent, best) => `너는 SNS 채널 하나만 맡은 기획자야. 이 채널 주인은 침구 쇼핑몰을 14년 운영했고, 주식 전업 투자자이며, 채널 10개를 혼자 운영해.

채널:
- 이름: ${c.name}
- 플랫폼: ${c.platform || "모름"}
- 톤/주제: ${c.tone || "모름"}

최근에 올렸거나 준비 중인 것:
${recent.length ? recent.map((t) => "- " + t).join("\n") : "- 없음"}
${best.length ? `\n반응이 좋았던 것 (조회·좋아요):\n${best.map((b) => `- ${b.title} (${b.views}회, ♥${b.likes})`).join("\n")}\n` : ""}
할 일:
1. ideas 정확히 3개: 이 채널 톤에 맞고, 최근 것과 겹치지 않는 다음 콘텐츠.
   - title 25자 안팎(바로 제목으로 쓸 수 있게), format은 '릴스', '캐러셀', '쇼츠', '글'처럼 짧게, why 40자 안팎(왜 지금 이 채널에 맞는지).
2. refs 정확히 3개: 참고할 레퍼런스를 찾는 법.
   - what 30자 안팎(어떤 계정·영상 유형을 보라는지), search는 그 플랫폼 검색창에 그대로 넣을 검색어(한국어, 15자 안팎, 해시태그면 # 없이).
   - 실제 계정 이름을 지어내지 마.
3. tip 1문장(50자 안팎): 이 채널을 이번 주에 키우는 데 가장 효과 있을 한 가지.
모든 문장은 한국어 존댓말.

JSON만 답해: {"ideas":[{"title":"...","format":"...","why":"..."}],"refs":[{"what":"...","search":"..."}],"tip":"..."}`;

export default async function handler(req, res) {
  const admin = process.env.ADMIN_KEY;
  if (!admin) return res.status(503).json({ error: "no_admin_key" });
  if (req.headers["x-admin-key"] !== admin) return res.status(401).json({ error: "auth" });
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }

  if (req.method === "POST" && b.action === "ai") {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "no_key" });
    const c = { name: clip(b.channel?.name, 40), platform: clip(b.channel?.platform, 20), tone: clip(b.channel?.tone, 120) };
    if (!c.name) return res.status(400).json({ error: "channel" });
    const recent = (Array.isArray(b.recent) ? b.recent : []).slice(0, 12).map((t) => clip(t, 60)).filter(Boolean);
    const best = (Array.isArray(b.best) ? b.best : []).slice(0, 5).map((x) => ({ title: clip(x?.title, 60), views: Number(x?.views) || 0, likes: Number(x?.likes) || 0 })).filter((x) => x.title);
    try {
      const msg = await new Anthropic().messages.create({
        model: MODEL,
        max_tokens: 1500,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: PROMPT(c, recent, best) }],
      });
      await recordUsage(msg.usage || {}, MODEL);
      const out = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("");
      const r = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
      if (!Array.isArray(r?.ideas) || !r.ideas.length) return res.status(502).json({ error: "shape" });
      return res.status(200).json({
        ideas: r.ideas.slice(0, 3).map((i) => ({ title: clip(i.title, 60), format: clip(i.format, 12), why: clip(i.why, 100) })),
        refs: (Array.isArray(r.refs) ? r.refs : []).slice(0, 3).map((x) => ({ what: clip(x.what, 80), search: clip(x.search, 40) })),
        tip: clip(r.tip, 120),
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) { console.error("anthropic", err.status, err.message); return res.status(502).json({ error: "api" }); }
      console.error(err);
      return res.status(500).json({ error: "server" });
    }
  }

  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  if (req.method === "PUT") {
    const board = b.board;
    if (!board || typeof board !== "object" || !Array.isArray(board.channels)) return res.status(400).json({ error: "board" });
    const json = JSON.stringify(board);
    if (json.length > 900_000) return res.status(413).json({ error: "too_big" });
    await redis([["SET", KEY, json]]);
    return res.status(200).json({ ok: true, updated: board.updated || 0 });
  }
  if (req.method === "GET") {
    const [raw] = (await redis([["GET", KEY]])) || [];
    let board = null; try { board = raw ? JSON.parse(raw) : null; } catch {}
    return res.status(200).json({ board });
  }
  return res.status(405).json({ error: "method" });
}
