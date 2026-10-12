// 생각 병목 찾기: 사이트 방문자가 로그인 없이 쓰도록 서버에서 Claude API를 부름.
// 키는 Vercel 환경변수 ANTHROPIC_API_KEY에만 둠. 질문(프롬프트)도 서버에서 만들어 아무 질문이나 못 보내게 함.
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 60 };

const MODEL = process.env.BOTTLENECK_MODEL || "claude-opus-5-5";
const PER_IP_PER_DAY = Number(process.env.BOTTLENECK_PER_IP_PER_DAY || 5);

// 같은 사람이 하루에 너무 많이 누르지 않게 (서버 인스턴스별 대략적인 제한, 진짜 상한은 Console 사용 한도)
const hits = new Map();
function allow(ip) {
  const day = new Date().toISOString().slice(0, 10), k = day + "|" + ip, n = (hits.get(k) || 0) + 1;
  if (hits.size > 5000) hits.clear();
  hits.set(k, n);
  return n <= PER_IP_PER_DAY;
}

const clip = (s, n) => String(s ?? "").slice(0, n);
const PROMPT = (text, p) => `너는 한 사람만을 위한 코치야. 누구에게나 할 수 있는 조언은 실패야.

이 사람:
- 직업: ${p.job || "모름"}
- MBTI: ${p.mbti || "모름"}
- 하루 여유 시간: ${p.spare || "모름"}
- 스스로 말한 약점: ${p.stuck || "모름"}

걱정거리:
"""
${text}
"""

할 일:
1. 걱정들 사이의 원인 관계를 보고, 하나를 풀면 가장 많은 걱정이 같이 풀리는 '병목' 하나를 골라. title은 20자 안팎. why는 두 문장 이내로, 걱정 속 구체적인 말과 이 사람의 직업·성향을 근거로 들어.
2. 병목을 푸는 할 일 딱 3개, 순서대로. 첫 번째는 오늘 15분 안에 끝나는 아주 작은 행동.
   - t는 30자 안팎, 이 사람 직업에서 실제로 쓰는 도구·문서·상황 이름이 들어간 구체적 행동(예: '견적서에 수정 2회 조항 넣기').
   - 하루 여유 시간 안에 들어가게 mins(숫자)를 잡아.
   - fit은 30자 안팎으로, 이 사람의 MBTI·약점 때문에 왜 이 방식이 맞는지.
   - 금지: "우선순위를 정하세요", "휴식을 취하세요", "계획을 세우세요", "시간 관리를 하세요"처럼 누구에게나 맞는 말.
3. mind: 이 사람이 왜 이 굴레를 반복하는지.
   - loop: 반복되는 고리 4단계(각 15자 안팎). 상황 → 드는 감정/생각 → 하는 행동 → 결과, 그리고 그 결과가 다시 처음 상황을 부르는 흐름.
   - why: 그 고리를 돌리는 심리적 이유 두 문장 이내. 불안, 완벽주의, 손실 회피, 인정 욕구, 결정 피로 같은 쉬운 말로, 이 사람의 MBTI·약점과 연결해서. 진단하거나 단정하지 말고 '~하기 쉽습니다' 톤.
   - tips: 그 마음에서 빠져나오는 팁 정확히 2개(각 45자 안팎). 생각을 바꾸는 말 한 문장, 또는 그 순간 바로 쓰는 작은 행동. 뻔한 위로 금지.
4. effects: 할 일 3개를 했을 때의 기대효과 정확히 3개. value는 숫자가 들어간 짧은 값(예: "주 6시간", "+20%", "7일 안"), label은 15자 안팎. 과장 없는 현실적인 예상치.
정보가 '모름'이면 걱정거리만으로 최대한 구체적으로. 모든 문장은 한국어 존댓말, 짧게.

JSON만 답해: {"bottleneck":{"title":"...","why":"..."},"todos":[{"t":"...","when":"오늘","mins":10,"fit":"..."}],"mind":{"loop":["...","...","...","..."],"why":"...","tips":["...","..."]},"effects":[{"value":"...","label":"..."}]}`;
const valid = (r) => r && r.bottleneck?.title && Array.isArray(r.todos) && r.todos.length && Array.isArray(r.effects) && r.effects.length;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "no_key" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const text = clip(body.text, 2000).trim();
  if (!text) return res.status(400).json({ error: "empty" });
  const pr = body.profile || {};
  const p = { job: clip(pr.job, 40), mbti: clip(pr.mbti, 8), spare: clip(pr.spare, 30), stuck: clip(pr.stuck, 40) };
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (!allow(ip)) return res.status(429).json({ error: "limit" });

  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: PROMPT(text, p) }],
    });
    if (msg.stop_reason === "refusal") return res.status(422).json({ error: "refusal" });
    const out = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const r = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
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
