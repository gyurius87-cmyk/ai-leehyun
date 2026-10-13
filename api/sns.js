// SNS 통합 관리 (AI이현 전용). ADMIN_KEY(Vercel 환경변수)를 아는 사람만 씀.
// GET: 보드 불러오기 / PUT: 보드 저장 / POST {action:"ai"}: 채널 성격에 맞는 아이디어·레퍼런스 추천 / POST {action:"match"}: 소재에 맞는 채널 고르기
// POST {action:"watch"}: 벤치마크 유튜브 채널의 최근 영상 / POST {action:"watchAi"}: 벤치마크 채널 분석
// 각 플랫폼 연동(자동 업로드, 댓글 가져오기)은 다음 단계. 그때 토큰도 여기(서버)에서만 다룸.
import Anthropic from "@anthropic-ai/sdk";
import { redis, hasRedis } from "./_redis.js";
import { recordUsage } from "./_usage.js";
import { fetchChannel } from "./_youtube.js";

export const config = { maxDuration: 60 };

const KEY = "sns:board";
const MODEL = process.env.SNS_MODEL || process.env.BOTTLENECK_MODEL || "claude-haiku-5-5";
const clip = (s, n) => String(s ?? "").slice(0, n);

// 채널 성격: 화면에서 채운 항목을 "- 항목: 값" 줄로 만들어 보냄 (profileText)
const persona = (c) => `- 플랫폼: ${c.platform || "모름"}\n${c.profileText || "- (아직 안 적음)"}`;
const cleanChan = (c) => ({ id: clip(c?.id, 40), name: clip(c?.name, 40), platform: clip(c?.platform, 20), profileText: clip(c?.profileText, 2500) });

const PROMPT = (c, recent, best, refs) => `너는 SNS 채널 하나만 맡은 기획자야. 이 채널 주인은 침구 쇼핑몰을 14년 운영했고, 주식 전업 투자자이며, 성격이 다른 채널 10개를 혼자 운영해.

채널 "${c.name}"의 성격:
${persona(c)}

최근에 올렸거나 준비 중인 것:
${recent.length ? recent.map((t) => "- " + t).join("\n") : "- 없음"}
${best.length ? `\n반응이 좋았던 것 (조회·좋아요):\n${best.map((b) => `- ${b.title} (${b.views}회, ♥${b.likes})`).join("\n")}\n` : ""}${refs.length ? `\n주인이 모은 레퍼런스에서 좋다고 적은 점:\n${refs.map((r) => "- " + r).join("\n")}\n` : ""}
할 일:
1. ideas 정확히 3개: 위 채널 성격의 모든 항목(목표, 대상, 말투, 형식, 길이, 촬영 방식)에 맞고, 피할 것은 피하고, 최근 것과 겹치지 않는 다음 콘텐츠.
   - title 25자 안팎(바로 제목으로 쓸 수 있게), format은 '릴스', '캐러셀', '쇼츠', '글'처럼 짧게, why 40자 안팎(왜 이 채널에 맞는지, 어떻게 찍을지 한마디).
2. refs 정확히 3개: 참고할 레퍼런스를 찾는 법.
   - what 30자 안팎(어떤 계정·영상 유형을 보라는지), search는 그 플랫폼 검색창에 그대로 넣을 검색어(한국어, 15자 안팎, 해시태그면 # 없이).
   - 실제 계정 이름을 지어내지 마.
3. tip 1문장(50자 안팎): 이 채널을 이번 주에 키우는 데 가장 효과 있을 한 가지.
모든 문장은 한국어 존댓말.

JSON만 답해: {"ideas":[{"title":"...","format":"...","why":"..."}],"refs":[{"what":"...","search":"..."}],"tip":"..."}`;

const WATCH_PROMPT = (w, mine) => `너는 SNS 벤치마킹 분석가야. 아래 유튜브 채널의 최근 영상을 보고, 내 채널에 가져올 점을 찾아 줘.

벤치마크 채널: ${w.name}
최근 영상 (올린 날, 조회수, 쇼츠 여부, 제목):
${w.items.map((x) => `- ${x.published.slice(0, 10)} · ${x.views}회${x.short ? " · 쇼츠" : ""} · ${x.title}`).join("\n")}

내 채널 "${mine.name}"의 성격:
${persona(mine)}

할 일:
1. summary 2문장: 이 채널이 요즘 무엇을 어떤 방식으로 올리고, 무엇이 잘 되는지 (숫자를 넣어서).
2. patterns 정확히 3개(각 40자 안팎): 조회수가 높은 영상들의 공통점 (주제, 제목 구조, 길이, 올리는 주기).
3. hooks 정확히 3개(각 30자 안팎): 따라 써 볼 만한 제목·첫 문장 틀. 원래 제목을 베끼지 말고 틀만.
4. borrow 정확히 3개: 내 채널 성격에 맞게 바꾼 콘텐츠 아이디어. title 25자 안팎, why 40자 안팎.
5. avoid 1문장(40자 안팎): 이 채널에서 내 채널이 따라 하면 안 되는 점.
모든 문장은 한국어 존댓말.

JSON만 답해: {"summary":"...","patterns":["..."],"hooks":["..."],"borrow":[{"title":"...","why":"..."}],"avoid":"..."}`;

const MATCH_PROMPT = (text, kind, chans) => `한 사람이 성격이 다른 SNS 채널 여러 개를 운영해. 새로 생긴 소재를 어느 채널에 올리면 가장 맞는지 골라 줘.

소재 (${kind === "shot" ? "이미 찍은 영상·사진" : kind === "ref" ? "참고할 레퍼런스" : "아이디어"}):
"""
${text}
"""

채널들:
${chans.map((c) => `[${c.id}] ${c.name}\n${persona(c)}`).join("\n\n")}

가장 잘 맞는 채널 1~2개를 맞는 순서로. why는 25자 안팎 한국어로, 채널 성격의 어떤 점과 맞는지.
JSON만 답해: {"picks":[{"id":"채널 id","why":"..."}]}`;

async function ask(content, maxTokens) {
  const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: maxTokens, output_config: { effort: "low" }, messages: [{ role: "user", content }] });
  await recordUsage(msg.usage || {}, MODEL);
  const out = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("");
  return JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
}

export default async function handler(req, res) {
  const admin = process.env.ADMIN_KEY;
  if (!admin) return res.status(503).json({ error: "no_admin_key" });
  if (req.headers["x-admin-key"] !== admin) return res.status(401).json({ error: "auth" });
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }

  if (req.method === "POST" && b.action === "watch") {
    try {
      const ch = await fetchChannel(clip(b.url, 300));
      if (!ch) return res.status(404).json({ error: "not_found" });
      return res.status(200).json(ch);
    } catch (err) {
      console.error(err);
      return res.status(502).json({ error: "fetch" });
    }
  }

  if (req.method === "POST" && (b.action === "ai" || b.action === "match" || b.action === "watchAi")) {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "no_key" });
    try {
      if (b.action === "match") {
        const chans = (Array.isArray(b.channels) ? b.channels : []).slice(0, 20).map(cleanChan).filter((c) => c.id && c.name);
        const text = clip(b.text, 500).trim();
        if (!text || !chans.length) return res.status(400).json({ error: "input" });
        const r = await ask(MATCH_PROMPT(text, b.kind, chans), 400);
        const ids = new Set(chans.map((c) => c.id));
        return res.status(200).json({ picks: (Array.isArray(r?.picks) ? r.picks : []).filter((p) => ids.has(p?.id)).slice(0, 2).map((p) => ({ id: p.id, why: clip(p.why, 80) })) });
      }
      if (b.action === "watchAi") {
        const mine = cleanChan(b.channel);
        const items = (Array.isArray(b.items) ? b.items : []).slice(0, 15).map((x) => ({ title: clip(x?.title, 100), published: clip(x?.published, 25), views: Number(x?.views) || 0, short: !!x?.short })).filter((x) => x.title);
        if (!mine.name || !items.length) return res.status(400).json({ error: "input" });
        const r = await ask(WATCH_PROMPT({ name: clip(b.name, 60), items }, mine), 1500);
        if (!r?.summary) return res.status(502).json({ error: "shape" });
        const arr = (v, n, m) => (Array.isArray(v) ? v : []).slice(0, n).map((t) => clip(t, m));
        return res.status(200).json({
          summary: clip(r.summary, 300), patterns: arr(r.patterns, 3, 100), hooks: arr(r.hooks, 3, 80),
          borrow: (Array.isArray(r.borrow) ? r.borrow : []).slice(0, 3).map((x) => ({ title: clip(x?.title, 60), why: clip(x?.why, 100) })),
          avoid: clip(r.avoid, 120),
        });
      }
      const c = cleanChan(b.channel);
      if (!c.name) return res.status(400).json({ error: "channel" });
      const recent = (Array.isArray(b.recent) ? b.recent : []).slice(0, 12).map((t) => clip(t, 60)).filter(Boolean);
      const best = (Array.isArray(b.best) ? b.best : []).slice(0, 5).map((x) => ({ title: clip(x?.title, 60), views: Number(x?.views) || 0, likes: Number(x?.likes) || 0 })).filter((x) => x.title);
      const refs = (Array.isArray(b.refs) ? b.refs : []).slice(0, 5).map((t) => clip(t, 100)).filter(Boolean);
      const r = await ask(PROMPT(c, recent, best, refs), 1500);
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
