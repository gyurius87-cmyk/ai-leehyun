// AI 사용량 기록. 애널리틱스의 '쓴 돈'과 구독 관리실의 'API 사용량'(어디서 얼마나)에 씀.
// ai:<날짜>, ai:total = 전체 합계 / aif:<날짜>, aif:total = 기능별 ("<기능>|calls" 같은 칸)
import { redis, kstDay, expire } from "./_redis.js";

// 1M 토큰당 달러 (입력, 출력). gpt-image-1 은 그림 토큰 기준 추정, Gemini 는 무료 한도로 씀.
const PRICE = {
  "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5],
  "gpt-image-1": [10, 40], gemini: [0, 0],
};
const price = (model) => PRICE[model] || (/^gemini/.test(model) ? PRICE.gemini : /^gpt-image/.test(model) ? PRICE["gpt-image-1"] : PRICE["claude-haiku-5-5"]);

// feat: 어느 기능에서 썼는지 (help, sns, detail, detail-img, golf, stock, stock-yt …)
export async function recordUsage(u, model, feat = "etc") {
  const [pi, po] = price(model);
  const inT = (u.input_tokens || u.promptTokenCount || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const outT = u.output_tokens || u.candidatesTokenCount || 0;
  if (!inT && !outT) return; // 구독(접수함)으로 처리된 답은 API 돈이 안 나감
  const usdMicro = Math.round(inT * pi + outT * po); // 토큰 × ($/1M) = 백만분의 1달러
  const day = kstDay(), cmds = [], f = String(feat).replace(/[^a-z0-9-]/g, "").slice(0, 20) || "etc";
  for (const k of [`ai:${day}`, "ai:total"]) cmds.push(["HINCRBY", k, "calls", 1], ["HINCRBY", k, "in", inT], ["HINCRBY", k, "out", outT], ["HINCRBY", k, "usd_u", usdMicro]);
  for (const k of [`aif:${day}`, "aif:total"]) cmds.push(["HINCRBY", k, `${f}|calls`, 1], ["HINCRBY", k, `${f}|in`, inT], ["HINCRBY", k, `${f}|out`, outT], ["HINCRBY", k, `${f}|usd_u`, usdMicro]);
  cmds.push(expire(`ai:${day}`), expire(`aif:${day}`));
  try { await redis(cmds); } catch (e) { console.error(e); }
}
