// 주식 프로그램의 AI는 API 키로 부르지 않아요. 이현님 구독으로 도는 Claude 예약 작업이 처리해요.
// 흐름: 사이트가 Claude가 필요할 때 할 일을 '접수함'(stk:aiq)에 넣고 202 {queued, rid}를 돌려줌
//   → 예약 작업이 op=aiq 로 할 일을 가져가 답을 쓰고 op=aiput 으로 넣음
//   → op=aireplay 가 원래 요청을 그대로 다시 실행 (이번엔 답이 있으니 끝까지 진행, 저장도 원래대로)
//   → 그 결과를 stk:aires:<rid> 에 남겨 두면 화면이 op=aistat 으로 받아 감
import { AsyncLocalStorage } from "node:async_hooks";
import { redis } from "./_redis.js";

const ALS = new AsyncLocalStorage();
export class Queued extends Error { constructor(rid) { super("queued"); this.rid = rid; } }
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const DAY = 60 * 60 * 24;

// 요청 하나를 감싸서 실행: 같은 요청 안의 Claude 호출에 차례 번호를 붙여요
export function aiRun(rid, req, fn) { return ALS.run({ rid, req, n: 0, miss: 0 }, fn); }
export const newRid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Anthropic SDK의 messages.create 와 같은 모양으로 돌려줘요 ({content:[{type:"text",text}], usage:{}})
export async function claude({ messages, system, max_tokens = 2000 }, label = "") {
  const c = ALS.getStore(); if (!c) throw new Error("ai_ctx");
  const key = `${c.rid}:${c.n++}`;
  const [r] = await redis([["GET", "stk:air:" + key]]);
  if (r != null) return { content: [{ type: "text", text: String(json(r) ?? r) }], usage: {} };
  const prompt = (messages || []).map((m) => (typeof m.content === "string" ? m.content : (m.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n"))).join("\n\n");
  const job = { key, rid: c.rid, label, system: system || "", messages: messages || [], prompt, max: max_tokens, at: Date.now() };
  await redis([["HSET", "stk:aiq", key, JSON.stringify(job)], ["SET", "stk:aireq:" + c.rid, JSON.stringify(c.req), "EX", 7 * DAY, "NX"], ["SADD", "stk:airids", c.rid]]);
  c.miss++;
  throw new Queued(c.rid);
}
export const aiMissed = () => ALS.getStore()?.miss || 0;
export const isQueued = (e) => e instanceof Queued || e?.message === "queued";

// 예약 작업용: 밀린 일 목록 (오래된 것부터)
export async function aiList(limit = 30) {
  const [h] = await redis([["HGETALL", "stk:aiq"]]);
  const arr = []; for (let i = 0; i < (h || []).length; i += 2) { const j = json(h[i + 1]); if (j) arr.push(j); }
  return arr.sort((a, b) => a.at - b.at).slice(0, limit);
}
// 예약 작업용: 답 넣기 (여러 개 한 번에)
export async function aiPut(items) {
  const cmds = []; const rids = new Set();
  for (const { key, text } of items || []) { if (!key || typeof text !== "string") continue; cmds.push(["SET", "stk:air:" + key, JSON.stringify(text), "EX", 7 * DAY], ["HDEL", "stk:aiq", key]); rids.add(String(key).split(":")[0]); }
  if (cmds.length) await redis(cmds);
  return { ok: cmds.length / 2, rids: [...rids] };
}
// 화면용: 접수함에 남은 일(이름·접수 시각)과 예약 작업이 마지막으로 접수함을 본 시각
export async function aiWaiting() { const [l, [seen]] = await Promise.all([aiList(500), redis([["GET", "stk:ai:seen"]])]); return { jobs: l.map((j) => ({ label: j.label || "", at: j.at })), seen: +seen || 0 }; }
// 아직 답이 덜 온 요청(rid)인지
export async function aiPending(rid) { const l = await aiList(500); return l.some((j) => j.rid === rid); }
export async function aiReq(rid) { const [r] = await redis([["GET", "stk:aireq:" + rid]]); return json(r); }
export async function aiSaveRes(rid, status, body) { await redis([["SET", "stk:aires:" + rid, JSON.stringify({ status, body, at: Date.now() }), "EX", 7 * DAY], ["SREM", "stk:airids", rid]]); }
// 답이 다 와서 다시 실행할 차례인 요청들
export async function aiReady() { const [ids] = await redis([["SMEMBERS", "stk:airids"]]); const jobs = await aiList(500), wait = new Set(jobs.map((j) => j.rid)); return { ready: (ids || []).filter((r) => !wait.has(r)), waiting: [...wait], jobs: jobs.length }; }
// res 를 바로 보내지 않고 담아 두는 가짜 응답
export function capRes() {
  const o = { code: 200, body: undefined, headers: {}, sent: false,
    status(c) { o.code = c; return o; }, setHeader(k, v) { o.headers[k] = v; return o; },
    json(b) { o.body = b; o.sent = true; return o; }, send(b) { o.body = b; o.sent = true; return o; }, end(b) { if (b !== undefined) o.body = b; o.sent = true; return o; } };
  return o;
}
export async function aiStat(rid) { const [r] = await redis([["GET", "stk:aires:" + rid]]); const j = json(r); if (j) return { done: true, ...j }; return { done: false, waiting: await aiPending(rid) }; }
