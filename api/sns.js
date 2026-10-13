// SNS 통합 관리 (AI이현 전용). ADMIN_KEY(Vercel 환경변수)를 아는 사람만 씀.
// GET: 보드 불러오기 / PUT: 보드 저장 / POST {action:"ai"}: 채널 성격에 맞는 아이디어·레퍼런스 추천 / POST {action:"match"}: 소재에 맞는 채널 고르기
// POST {action:"watch"}: 벤치마크 유튜브 채널의 최근 영상 / POST {action:"watchAi"}: 벤치마크 채널 분석 / POST {action:"script"}: 프로젝트 대본 / POST {action:"score"}: 기획 100점 채점
// 각 플랫폼 연동(자동 업로드, 댓글 가져오기)은 다음 단계. 그때 토큰도 여기(서버)에서만 다룸.
import Anthropic from "@anthropic-ai/sdk";
import { redis, hasRedis } from "./_redis.js";
import { recordUsage } from "./_usage.js";
import { fetchChannel } from "./_youtube.js";
import { createRequire } from "node:module";

// 공부하면서 쌓은 콘텐츠 기획 (Claude가 data/sns-ideas.json에 더함). 못 읽어도 나머지는 동작
let studyIdeas = null;
try { studyIdeas = createRequire(import.meta.url)("../data/sns-ideas.json"); } catch (e) { console.error("sns-ideas", e.message); }

export const config = { maxDuration: 60 };

const KEY = "sns:board";
const MODEL = process.env.SNS_MODEL || process.env.BOTTLENECK_MODEL || "claude-haiku-5-5";
const clip = (s, n) => String(s ?? "").slice(0, n);

// 채널 성격: 화면에서 채운 항목을 "- 항목: 값" 줄로 만들어 보냄 (profileText)
const persona = (c) => `- 플랫폼: ${c.platform || "모름"}\n${c.profileText || "- (아직 안 적음)"}`;
const cleanChan = (c) => ({ id: clip(c?.id, 40), name: clip(c?.name, 40), platform: clip(c?.platform, 20), profileText: clip(c?.profileText, 2500) });

const lines = (arr) => arr.map((t) => "- " + t).join("\n");
const PROMPT = (c, x) => `너는 SNS 채널 하나만 맡은 기획자야. 이 채널 주인은 침구 쇼핑몰을 14년 운영했고, 주식 전업 투자자이며, 성격이 다른 채널 10개를 혼자 운영해.

채널 "${c.name}"의 성격:
${persona(c)}
${x.direction ? `\n이번에 원하는 방향: ${x.direction}\n` : ""}
이미 있는 기획·콘텐츠 (겹치면 안 됨):
${x.recent.length ? lines(x.recent) : "- 없음"}
${x.best.length ? `\n반응이 좋았던 것 (조회·좋아요):\n${x.best.map((b) => `- ${b.title} (${b.views}회, ♥${b.likes})`).join("\n")}\n` : ""}${x.liked.length ? `\n주인이 ⭐ 표시한 기획 (이런 결이 좋음):\n${lines(x.liked)}\n` : ""}${x.dropped.length ? `\n주인이 버린 기획 (이런 결은 피함):\n${lines(x.dropped)}\n` : ""}${x.refs.length ? `\n주인이 모은 레퍼런스에서 좋다고 적은 점:\n${lines(x.refs)}\n` : ""}${x.bench.length ? `\n벤치마크 채널에서 잘 되는 패턴:\n${lines(x.bench)}\n` : ""}
할 일:
1. ideas 정확히 5개: 위 채널 성격의 모든 항목(목표, 대상, 말투, 형식, 길이, 촬영 방식)에 맞고, 피할 것은 피하고, 이미 있는 것과 겹치지 않는 콘텐츠 기획. 5개는 서로 각도가 달라야 해 (정보, 후기·사례, 비교, 실수·경고, 비하인드 등).
   - title 25자 안팎(바로 제목으로 쓸 수 있게)
   - hook 30자 안팎: 첫 3초에 할 말이나 자막
   - body 70자 안팎: 무엇을 어떤 순서로 보여 줄지
   - format은 '릴스 30초', '캐러셀 6장', '쇼츠 45초'처럼 짧게
   - why 30자 안팎: 왜 이 채널에 맞는지
2. refs 정확히 3개: 참고할 레퍼런스를 찾는 법. what 30자 안팎, search는 그 플랫폼 검색창에 그대로 넣을 한국어 검색어(15자 안팎, # 없이). 실제 계정 이름을 지어내지 마.
3. tip 1문장(50자 안팎): 이 채널을 이번 주에 키우는 데 가장 효과 있을 한 가지.
모든 문장은 한국어 존댓말 (단, hook과 body는 채널 말투를 따라).

JSON만 답해: {"ideas":[{"title":"...","hook":"...","body":"...","format":"...","why":"..."}],"refs":[{"what":"...","search":"..."}],"tip":"..."}`;

const SCRIPT_PROMPT = (c, x) => `너는 SNS 숏폼·콘텐츠 대본 작가야. 아래 채널 성격에 딱 맞는 대본을 써 줘.

채널 "${c.name}"의 성격:
${persona(c)}

이 콘텐츠의 기획:
- 제목: ${x.title}
- 첫 3초 훅: ${x.plan.hook || "(없음, 네가 만들어)"}
- 시놉시스: ${x.plan.synopsis || "(없음)"}
- 핵심 내용: ${x.plan.body || "(없음, 제목을 보고 짜)"}
- 형식: ${x.plan.format || "(채널 성격의 형식·길이를 따름)"}
- 왜 이 채널에: ${x.plan.why || "-"}
${x.refs.length ? `\n참고 레퍼런스에서 좋았던 점:\n${lines(x.refs)}\n` : ""}${x.prev ? `\n지금 대본 (이걸 고쳐서 다시 써):\n"""\n${x.prev}\n"""\n` : ""}${x.ask ? `\n주인의 요청: ${x.ask}\n` : ""}
규칙:
- 채널의 말투(존댓말/반말), 분위기, 자주 쓰는 말, 누가 말하나, 얼굴 노출, 촬영 방식, 자막 스타일을 그대로 따라.
- 형식이 영상이면 scenes는 시간 순서 장면 4~8개. t는 '0~3초'처럼, visual은 화면에 보이는 것과 촬영 방법(30자 안팎), line은 그 장면의 대사나 자막(40자 안팎, 말하듯이).
- 형식이 캐러셀·사진이면 scenes는 장(슬라이드)별로, t는 '1장', visual은 이미지 구성, line은 그 장의 문구.
- 첫 장면은 반드시 훅. 피할 것은 쓰지 마. 과장·허위 효능 표현 금지.
- cta: 채널의 끝맺음·행동 유도를 반영한 마지막 한마디.
- caption: 올릴 때 쓸 본문 3~5줄 (줄바꿈 \\n), 채널 말투로.
- tags: 해시태그 8~12개 (고정 해시태그가 있으면 꼭 포함, # 붙여서).
- thumb: 썸네일·첫 화면 큰 글씨 문구 15자 안팎.

JSON만 답해: {"hook":"...","scenes":[{"t":"...","visual":"...","line":"..."}],"cta":"...","caption":"...","tags":["#..."],"thumb":"..."}`;

// 기획 채점: 100점 = 훅 25 + 채널 맞춤 25 + 반응 예상 20 + 새로움 15 + 만들기 쉬움 15 (합계는 서버에서 더함)
const SCORE_PARTS = { hook: 25, fit: 25, react: 20, fresh: 15, easy: 15 };
const SCORE_PROMPT = (c, x) => `너는 깐깐한 SNS 기획 심사위원이야. 아래 채널에 올릴 기획들을 하나씩 채점해 줘.

채널 "${c.name}"의 성격:
${persona(c)}
${x.liked.length ? `\n주인이 ⭐ 표시한 기획 (주인 취향):\n${lines(x.liked)}\n` : ""}${x.dropped.length ? `\n주인이 버린 기획 (주인이 싫어하는 결):\n${lines(x.dropped)}\n` : ""}${x.best.length ? `\n이 채널에서 반응이 좋았던 것:\n${lines(x.best)}\n` : ""}${x.track.length ? `\n지금까지 올린 콘텐츠의 실제 성과 (기획 때 받은 점수 → 올린 뒤 실제 반응, 배수는 이 채널 보통 조회수 대비):\n${lines(x.track)}\n
먼저 이 기록부터 봐. 점수가 높았는데 반응이 낮았던 것, 점수가 낮았는데 반응이 높았던 것을 비교해서 이 채널에서 실제로 먹히는 요소와 과대평가했던 요소를 찾아. 그 결과대로 이번 채점을 고쳐: 실제로 먹힌 요소가 있는 기획은 점수를 더 주고, 과대평가했던 요소는 덜 줘. (항목과 만점은 그대로)\n` : ""}
채점할 기획:
${x.ideas.map((i) => `[${i.id}] 제목: ${i.title}${i.hook ? ` / 훅: ${i.hook}` : ""}${i.body ? ` / 내용: ${i.body}` : ""}${i.format ? ` / 형식: ${i.format}` : ""}`).join("\n")}

채점 기준 (항목별 만점):
- hook 25: 첫 3초에 멈추게 하는 힘. 훅이 안 적혀 있으면 제목만으로 판단하되 깎아.
- fit 25: 채널 성격(목표, 대상, 말투, 형식, 피할 것)에 맞는 정도.
- react 20: 저장·공유·댓글이 나올 만한 정도 (쓸모, 공감, 논쟁거리).
- fresh 15: 흔한 기획과 다른 각도, 주인만 할 수 있는 이야기인지.
- easy 15: 혼자 촬영·편집하기 쉬운 정도 (쉬울수록 높음).
점수는 짜게 줘. 보통 기획은 합계 55~70점, 85점 넘는 건 정말 좋은 것만.
good은 가장 잘한 점 한 문장(35자 안팎), fix는 점수를 가장 많이 올릴 고칠 점 한 문장(50자 안팎, 구체적으로). 한국어 존댓말.
${x.track.length ? `lesson: 실제 성과 기록을 보고 채점을 어떻게 바꿨는지 한 문장(70자 안팎, 예: '숫자 제목이 평균 2배라 훅 점수를 더 줌').` : `lesson은 빈 문자열.`}

JSON만 답해: {"lesson":"...","scores":[{"id":"...","hook":0,"fit":0,"react":0,"fresh":0,"easy":0,"good":"...","fix":"..."}]}`;

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

  if (req.method === "POST" && ["ai", "match", "watchAi", "script", "score"].includes(b.action)) {
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
      const list = (v, n, m) => (Array.isArray(v) ? v : []).slice(0, n).map((t) => clip(t, m)).filter(Boolean);
      const refs = list(b.refs, 5, 100);
      if (b.action === "score") {
        const ideas = (Array.isArray(b.ideas) ? b.ideas : []).slice(0, 10).map((i) => ({ id: clip(i?.id, 40), title: clip(i?.title, 80), hook: clip(i?.hook, 150), body: clip(i?.body, 400), format: clip(i?.format, 30) })).filter((i) => i.id && i.title);
        if (!ideas.length) return res.status(400).json({ error: "ideas" });
        const r = await ask(SCORE_PROMPT(c, { ideas, liked: list(b.liked, 5, 60), dropped: list(b.dropped, 5, 60), best: list(b.best, 5, 60), track: list(b.track, 12, 220) }), 2500);
        const ids = new Set(ideas.map((i) => i.id));
        const scores = (Array.isArray(r?.scores) ? r.scores : []).filter((x) => ids.has(x?.id)).map((x) => {
          const p = Object.fromEntries(Object.entries(SCORE_PARTS).map(([k, max]) => [k, Math.max(0, Math.min(max, Math.round(Number(x[k]) || 0)))]));
          return { id: x.id, total: Object.values(p).reduce((a, n) => a + n, 0), p, good: clip(x.good, 100), fix: clip(x.fix, 140) };
        });
        if (!scores.length) return res.status(502).json({ error: "shape" });
        return res.status(200).json({ scores, lesson: clip(r.lesson, 160) });
      }
      if (b.action === "script") {
        const pl = b.plan || {};
        const x = { title: clip(b.title, 80), plan: { hook: clip(pl.hook, 200), synopsis: clip(pl.synopsis, 800), body: clip(pl.body, 800), format: clip(pl.format, 40), why: clip(pl.why, 200) }, refs, prev: clip(b.prev, 3000), ask: clip(b.ask, 300) };
        if (!x.title) return res.status(400).json({ error: "title" });
        const r = await ask(SCRIPT_PROMPT(c, x), 3000);
        if (!Array.isArray(r?.scenes) || !r.scenes.length) return res.status(502).json({ error: "shape" });
        return res.status(200).json({
          hook: clip(r.hook, 200),
          scenes: r.scenes.slice(0, 12).map((y) => ({ t: clip(y?.t, 20), visual: clip(y?.visual, 200), line: clip(y?.line, 300) })),
          cta: clip(r.cta, 200), caption: clip(r.caption, 1500), tags: list(r.tags, 15, 40), thumb: clip(r.thumb, 60),
        });
      }
      const best = (Array.isArray(b.best) ? b.best : []).slice(0, 5).map((x) => ({ title: clip(x?.title, 60), views: Number(x?.views) || 0, likes: Number(x?.likes) || 0 })).filter((x) => x.title);
      const r = await ask(PROMPT(c, { direction: clip(b.direction, 200), recent: list(b.recent, 25, 60), best, refs, liked: list(b.liked, 5, 60), dropped: list(b.dropped, 5, 60), bench: list(b.bench, 3, 200) }), 2500);
      if (!Array.isArray(r?.ideas) || !r.ideas.length) return res.status(502).json({ error: "shape" });
      return res.status(200).json({
        ideas: r.ideas.slice(0, 5).map((i) => ({ title: clip(i.title, 60), hook: clip(i.hook, 120), body: clip(i.body, 300), format: clip(i.format, 20), why: clip(i.why, 100) })),
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
    // 공부하면서 Claude가 저장소에 쌓은 콘텐츠 기획(AI이현 채널 기획실로 들어감)
    return res.status(200).json({ board, study: studyIdeas });
  }
  return res.status(405).json({ error: "method" });
}
