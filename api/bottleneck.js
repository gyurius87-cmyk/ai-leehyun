// 문제 해결 도우미 (옛 이름 생각 병목 찾기): 사이트 방문자가 로그인 없이 쓰도록 서버에서 Claude API를 부름.
// 키는 Vercel 환경변수 ANTHROPIC_API_KEY에만 둠. 질문(프롬프트)도 서버에서 만들어 아무 질문이나 못 보내게 함.
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "./_usage.js";

export const config = { maxDuration: 60 };

const MODEL = process.env.BOTTLENECK_MODEL || "claude-haiku-5-5";
const PER_IP_PER_DAY = Number(process.env.BOTTLENECK_PER_IP_PER_DAY || 5);
const ASK_PER_IP_PER_DAY = PER_IP_PER_DAY * 3; // 맞춤 질문은 가볍고 다시 받을 수 있게 넉넉히

// 같은 사람이 하루에 너무 많이 누르지 않게 (서버 인스턴스별 대략적인 제한, 진짜 상한은 Console 사용 한도)
const hits = new Map();
function allow(ip, mode) {
  const day = new Date().toISOString().slice(0, 10), k = day + "|" + mode + "|" + ip, n = (hits.get(k) || 0) + 1;
  if (hits.size > 5000) hits.clear();
  hits.set(k, n);
  return n <= (mode === "ask" ? ASK_PER_IP_PER_DAY : PER_IP_PER_DAY);
}

const clip = (s, n) => String(s ?? "").slice(0, n);
const WHO = (text, p) => `이 사람:
- 고민 분야: ${p.cat || "모름"}
- 직업: ${p.job || "모름"}
- MBTI: ${p.mbti || "모름"}
- 하루 여유 시간: ${p.spare || "모름"}
- 스스로 말한 약점: ${p.stuck || "모름"}

고민:
"""
${text}
"""`;
// 1단계: 더 정확히 이해하려고 되묻는 질문 3개
const ASK_PROMPT = (text, p) => `너는 한 사람만을 위한 코치야. 바로 답하지 말고, 이 사람에게 맞는 해결책을 주려면 꼭 알아야 할 것을 먼저 물어봐.

${WHO(text, p)}

질문 정확히 3개를 만들어.
- 순서: ① 지금 상황의 구체적 사실(얼마나, 언제부터, 누구와) ② 이 사람이 진짜 원하는 결과 ③ 지금까지 해본 것이나 실제로 막는 것.
- q는 30자 안팎의 쉬운 존댓말 질문. 고민에 나온 구체적인 말을 넣어서 이 사람만을 위한 질문처럼.
- 이미 적힌 정보(직업, MBTI, 여유 시간, 약점)는 다시 묻지 마.
- options는 눌러서 고를 수 있는 짧은 답 3~4개(각 12자 안팎), 서로 겹치지 않게.

JSON만 답해: {"questions":[{"q":"...","options":["...","...","..."]}]}`;
const PROMPT = (text, p, qa) => `너는 한 사람만을 위한 코치야. 누구에게나 할 수 있는 조언은 실패야.

${WHO(text, p)}
${qa.length ? `
더 물어본 질문과 이 사람의 답 (가장 중요한 근거로 써):
${qa.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n")}
` : ""}
할 일: 이 사람이 읽고 "나를 정말 이해했다, 이대로 하면 풀리겠다"고 느낄 만큼 깊고 구체적인 해결 리포트를 만들어.

1. bottleneck: 하나를 풀면 가장 많은 고민이 같이 풀리는 '핵심 문제' 하나.
   - title 20자 안팎.
   - why 3~4문장: 왜 이게 핵심인지, 이게 다른 고민들을 어떻게 만들어 내는지, 이 사람의 직업·성향과 어떻게 이어지는지.
   - evidence 정확히 3개(각 45자 안팎): 이렇게 판단한 근거. 고민이나 답에 나온 이 사람의 말을 따옴표로 인용해서.
2. roots 정확히 3단계(각 30자 안팎): 겉으로 보이는 문제 → 그 아래 이유 → 진짜 원인. '왜?'를 파고드는 흐름.
3. mind: 이 사람이 왜 이 굴레를 반복하는지.
   - loop 4단계(각 15자 안팎): 상황 → 감정/생각 → 행동 → 결과, 그 결과가 다시 처음 상황을 부름.
   - why 3문장: 고리를 돌리는 심리(불안, 완벽주의, 손실 회피, 인정 욕구, 결정 피로 같은 쉬운 말)를 MBTI·약점과 연결. 진단·단정 말고 '~하기 쉽습니다' 톤.
   - strength 2문장: 이 사람의 MBTI·직업이 가진 강점을 이 문제 해결에 어떻게 쓰면 되는지.
   - tips 정확히 3개(각 50자 안팎): 생각을 바꾸는 한 문장이나 그 순간 바로 쓰는 작은 행동. 뻔한 위로 금지.
4. quotes 정확히 2개: 이 해결 방향을 뒷받침하는 명언·책 구절·속담·고사성어.
   - 실제로 널리 알려진 말만. 누가 했는지 확실하지 않으면 속담이나 고사성어를 써. 절대 지어내지 마.
   - text는 한국어 번역 문장, who는 '피터 드러커', '스티브 잡스', '논어', '한국 속담'처럼 짧게.
   - apply 45자 안팎: 이 말이 이 사람의 상황에 어떻게 들어맞는지.
5. todos: 해결 로드맵 4~5단계, 순서대로.
   - when은 '오늘', '내일', '이번 주', '2주 안', '이번 달' 중 하나. 첫 단계는 반드시 '오늘', 15분 안에 끝나는 아주 작은 행동.
   - t 30자 안팎: 이 사람 직업에서 실제로 쓰는 도구·문서·상황 이름이 들어간 구체적 행동(예: '견적서에 수정 2회 조항 넣기').
   - mins는 숫자, 하루 여유 시간 안에.
   - how 2문장: 정확히 어떻게 하는지. 예시 문장이나 숫자를 넣어서 바로 따라 할 수 있게.
   - done 25자 안팎: 이 단계가 끝났다고 볼 기준.
   - fit 35자 안팎: 이 사람의 MBTI·약점 때문에 왜 이 방식이 맞는지.
   - 금지: "우선순위를 정하세요", "휴식을 취하세요", "계획을 세우세요", "시간 관리를 하세요"처럼 누구에게나 맞는 말.
6. risks 정확히 2개: 실행하다 막히기 쉬운 순간과 대처. if 30자 안팎('~할 때'), then 45자 안팎(바로 할 행동).
7. effects 정확히 4개: 로드맵대로 했을 때의 기대효과.
   - value는 숫자가 들어간 짧은 값(예: "주 6시간", "+20%", "7일 안"), label 15자 안팎, when은 효과가 나타나는 시점(예: "2주 후"), basis 40자 안팎은 그 숫자의 계산 근거.
   - 과장 없는 현실적인 예상치.
8. change: 지금(before)과 한 달 뒤(after)의 하루 모습을 각각 정확히 3줄(각 25자 안팎), 같은 순서로 짝지어서.
9. cheer: 이 사람에게 건네는 마지막 한마디 2문장. 이 사람의 상황을 담아서, 뻔한 응원 말고.
정보가 '모름'이면 고민만으로 최대한 구체적으로. 모든 문장은 한국어 존댓말.

JSON만 답해: {"bottleneck":{"title":"...","why":"...","evidence":["...","...","..."]},"roots":["...","...","..."],"mind":{"loop":["...","...","...","..."],"why":"...","strength":"...","tips":["...","...","..."]},"quotes":[{"text":"...","who":"...","apply":"..."}],"todos":[{"t":"...","when":"오늘","mins":10,"how":"...","done":"...","fit":"..."}],"risks":[{"if":"...","then":"..."}],"effects":[{"value":"...","label":"...","when":"...","basis":"..."}],"change":{"before":["...","...","..."],"after":["...","...","..."]},"cheer":"..."}`;
const validQ = (r) => Array.isArray(r?.questions) && r.questions.length && r.questions.every((q) => q?.q);
const valid = (r) => r && r.bottleneck?.title && Array.isArray(r.todos) && r.todos.length && Array.isArray(r.effects) && r.effects.length;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "no_key" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const text = clip(body.text, 2000).trim();
  if (!text) return res.status(400).json({ error: "empty" });
  const pr = body.profile || {};
  const p = { cat: clip(pr.cat, 20), job: clip(pr.job, 40), mbti: clip(pr.mbti, 8), spare: clip(pr.spare, 30), stuck: clip(pr.stuck, 40) };
  const ask = body.mode === "ask";
  const qa = (Array.isArray(body.qa) ? body.qa : []).slice(0, 5).map((x) => ({ q: clip(x?.q, 120), a: clip(x?.a, 200).trim() })).filter((x) => x.q && x.a);
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (!allow(ip, ask ? "ask" : "solve")) return res.status(429).json({ error: "limit" });

  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: ask ? 1200 : 8000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: ask ? ASK_PROMPT(text, p) : PROMPT(text, p, qa) }],
    });
    await recordUsage(msg.usage || {}, MODEL);
    if (msg.stop_reason === "refusal") return res.status(422).json({ error: "refusal" });
    const out = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const r = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    if (ask) {
      if (!validQ(r)) return res.status(502).json({ error: "shape" });
      return res.status(200).json({ questions: r.questions.slice(0, 3).map((q) => ({ q: clip(q.q, 80), options: (Array.isArray(q.options) ? q.options : []).slice(0, 4).map((o) => clip(o, 24)) })) });
    }
    if (!valid(r)) return res.status(502).json({ error: "shape" });
    return res.status(200).json(r);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
    if (err instanceof Anthropic.APIError) {
      console.error("anthropic", err.status, err.message);
      return res.status(502).json({ error: "api", status: err.status });
    }
    console.error(err);
    return res.status(500).json({ error: "server" });
  }
}
