// AI 사용량 기록. 애널리틱스의 '쓴 돈'과 '남은 금액 추정'에 씀 (문제 해결 도우미, SNS 통합 관리가 같이 씀).
import { redis, kstDay, expire } from "./_redis.js";

// 1M 토큰당 달러 (입력, 출력)
const PRICE = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };

export async function recordUsage(u, model) {
  const [pi, po] = PRICE[model] || PRICE["claude-haiku-5-5"];
  const inT = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), outT = u.output_tokens || 0;
  const usdMicro = Math.round(inT * pi + outT * po); // 토큰 × ($/1M) = 백만분의 1달러
  const day = kstDay(), cmds = [];
  for (const k of [`ai:${day}`, "ai:total"]) cmds.push(["HINCRBY", k, "calls", 1], ["HINCRBY", k, "in", inT], ["HINCRBY", k, "out", outT], ["HINCRBY", k, "usd_u", usdMicro]);
  cmds.push(expire(`ai:${day}`));
  try { await redis(cmds); } catch (e) { console.error(e); }
}
