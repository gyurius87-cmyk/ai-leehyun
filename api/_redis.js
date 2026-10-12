// Upstash Redis(REST) 얇은 도우미. Vercel Storage에서 Redis를 연결하면 아래 환경변수가 자동으로 생김.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasRedis = () => Boolean(URL_ && TOKEN);

// 명령 여러 개를 한 번에: [["INCR","k"],["HINCRBY","h","f",1]] → 결과 배열
export async function redis(cmds) {
  if (!hasRedis()) return null;
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).map((r) => r.result);
}

// 한국 시간 기준 날짜 (YYYY-MM-DD)
export const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const TTL = 60 * 60 * 24 * 120; // 날짜별 기록은 120일 보관
export const expire = (k) => ["EXPIRE", k, TTL];
