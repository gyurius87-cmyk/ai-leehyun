// 골프 중독자들. 친구들은 공유 주소(?k=보기 열쇠)로 보고 계산기를 씀. 영상 추가·수정은 ADMIN_KEY(Vercel 환경변수)를 아는 이현님만.
// 저장(Redis): golf:videos (hash id → 영상 JSON), golf:key (보기 열쇠), golf:log (hash 접속id-종류 → 계산기 사용 기록 JSON, 최근 400개)
// 스코어표 사진 읽기(op scan)는 서버에서 Claude를 부름. 키는 Vercel 환경변수 ANTHROPIC_API_KEY에만 둠.
import Anthropic from "@anthropic-ai/sdk";
import { redis, hasRedis } from "./_redis.js";
import { recordUsage } from "./_usage.js";
import { ytId } from "./mom.js";

export const config = { maxDuration: 60 };

const MODEL = process.env.GOLF_MODEL || "claude-sonnet-5-5";
const SCANS_PER_IP_PER_DAY = 30;
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);
const okId = (s) => /^[a-z0-9]{6,20}$/.test(String(s || ""));
const okDate = (s) => /^20\d\d-\d\d-\d\d$/.test(String(s || ""));
const newId = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const pairs = (flat) => { const o = {}; for (let i = 0; flat && i < flat.length; i += 2) o[flat[i]] = flat[i + 1]; return o; };

const LOG_KINDS = ["fee", "tadang", "scan"], LOG_MAX = 400, LOGS_PER_IP_PER_DAY = 300;
const device = (ua = "") => (/iPhone|iPad/.test(ua) ? "아이폰" : /Android/.test(ua) ? "안드로이드" : /Mac/.test(ua) ? "맥" : /Windows/.test(ua) ? "PC" : "기타");
const logHits = new Map();
const hits = new Map();
function allow(ip) {
  const k = new Date().toISOString().slice(0, 10) + "|" + ip, n = (hits.get(k) || 0) + 1;
  if (hits.size > 5000) hits.clear();
  hits.set(k, n);
  return n <= SCANS_PER_IP_PER_DAY;
}

async function ytTitle(vid) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + vid)}`);
    return r.ok ? clip((await r.json()).title, 80) : "";
  } catch { return ""; }
}

const SCAN_PROMPT = `이 사진은 골프 스코어표(스코어카드 종이나 골프장 앱 화면)입니다. 사람마다 홀별 타수를 읽어 주세요.
- 타수는 그 홀에서 친 실제 타수(예: 4, 5, 7)로 적습니다. 표가 파 기준 +/−(예: +1, 0, -1, 또는 ●, △ 같은 기호)로 적혀 있으면 그 홀의 파를 더해 실제 타수로 바꿉니다.
- 파(PAR) 줄이 보이면 par 에 적고, 안 보이면 par 는 null.
- 홀 수는 보이는 만큼(보통 18, 9홀이면 9). 안 보이거나 읽을 수 없는 칸은 null.
- 이름은 표에 적힌 그대로. 이름이 없으면 "1번", "2번"처럼.
- 스코어표가 아니면 {"error":"not_scorecard"} 만 답합니다.
JSON 하나만 답합니다:
{"par":[4,4,3,...] 또는 null,"players":[{"name":"","scores":[5,4,null,...]}],"note":"읽기 애매했던 점 한 줄, 없으면 빈 문자열"}`;

async function scan(img) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(img || ""));
  if (!m || m[2].length > 4_000_000) return { status: 400, body: { error: "image" } };
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }, { type: "text", text: SCAN_PROMPT }] }],
  });
  await recordUsage(msg.usage || {}, MODEL);
  const out = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const r = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  if (r.error) return { status: 422, body: { error: r.error } };
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" && Number(v) > 0 && Number(v) < 20 ? Math.round(Number(v)) : null);
  const players = (Array.isArray(r.players) ? r.players : []).slice(0, 8).map((p, i) => ({ name: clip(p?.name, 12) || `${i + 1}번`, scores: (Array.isArray(p?.scores) ? p.scores : []).slice(0, 18).map(num) }));
  if (!players.length) return { status: 422, body: { error: "empty" } };
  const holes = Math.max(...players.map((p) => p.scores.length), Array.isArray(r.par) ? r.par.length : 0) > 9 ? 18 : 9;
  const par = Array.isArray(r.par) ? r.par.slice(0, holes).map(num) : null;
  return { status: 200, body: { holes, par, players, note: clip(r.note, 200) } };
}

export default async function handler(req, res) {
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  res.setHeader("Cache-Control", "no-store");
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }

  let [key] = await redis([["GET", "golf:key"]]);
  const k = req.method === "GET" ? req.query.k : b.k;
  if (!admin && (!key || k !== key)) return res.status(401).json({ error: "auth" });

  if (req.method === "GET" && req.query.logs) {
    if (!admin) return res.status(401).json({ error: "auth" });
    const [h] = await redis([["HGETALL", "golf:log"]]);
    return res.json({ logs: Object.values(pairs(h)).map((v) => JSON.parse(v)).sort((a, b) => b.at - a.at) });
  }
  if (req.method === "GET") {
    if (admin && !key) { key = newId(16); await redis([["SET", "golf:key", key]]); }
    const [h] = await redis([["HGETALL", "golf:videos"]]);
    return res.json({ videos: Object.values(pairs(h)).map((v) => JSON.parse(v)), admin: !!admin, ...(admin ? { key } : {}) });
  }
  if (req.method !== "POST") return res.status(405).end();

  // 친구들이 계산기를 쓴 기록 (이현님 DB 탭에서 봄). 한 번 들어와 쓰는 동안은 같은 줄을 덮어씀
  if (b.op === "log") {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
    const dk = new Date().toISOString().slice(0, 10) + "|" + ip, n = (logHits.get(dk) || 0) + 1;
    if (logHits.size > 5000) logHits.clear();
    logHits.set(dk, n);
    if (n > LOGS_PER_IP_PER_DAY) return res.status(429).json({ error: "limit" });
    const data = JSON.stringify(b.data ?? null);
    if (!/^[a-z0-9]{8,20}$/.test(String(b.sid || "")) || !LOG_KINDS.includes(b.kind) || data.length > 6000) return res.status(400).json({ error: "log" });
    const id = `${b.sid}-${b.kind}`;
    const [old, len] = await redis([["HGET", "golf:log", id], ["HLEN", "golf:log"]]);
    const now = Date.now();
    const row = { id, sid: b.sid, kind: b.kind, at: now, first: old ? JSON.parse(old).first : now, who: admin ? "admin" : "friend", dev: device(req.headers["user-agent"]), data: JSON.parse(data) };
    const cmds = [["HSET", "golf:log", id, JSON.stringify(row)]];
    if (!old && len >= LOG_MAX) {
      const [h] = await redis([["HGETALL", "golf:log"]]);
      const oldest = Object.values(pairs(h)).map((v) => JSON.parse(v)).sort((a, c) => a.at - c.at).slice(0, len - LOG_MAX + 20);
      if (oldest.length) cmds.push(["HDEL", "golf:log", ...oldest.map((r) => r.id)]);
    }
    await redis(cmds);
    return res.json({ ok: true });
  }

  // 친구들도 쓰는 것: 스코어표 읽기
  if (b.op === "scan") {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
    if (!allow(ip)) return res.status(429).json({ error: "limit" });
    try {
      const r = await scan(b.image);
      return res.status(r.status).json(r.body);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
      console.error(err);
      return res.status(502).json({ error: "api" });
    }
  }

  // 여기부터 이현님만
  if (!admin) return res.status(401).json({ error: "auth" });
  if (b.op === "save") {
    const v = b.item || {};
    const vid = ytId(v.url);
    if (!vid) return res.status(400).json({ error: "url" });
    const it = { id: okId(v.id) ? v.id : newId(), vid, title: clip(v.title, 80) || (await ytTitle(vid)), memo: clip(v.memo, 400), at: Number(v.at) || Date.now() };
    if (okDate(v.date)) it.date = v.date;
    const [n] = await redis([["HLEN", "golf:videos"]]);
    if (n >= 500 && !okId(v.id)) return res.status(400).json({ error: "full" });
    await redis([["HSET", "golf:videos", it.id, JSON.stringify(it)]]);
    return res.json({ item: it });
  }
  if (b.op === "del") {
    if (!okId(b.id)) return res.status(400).json({ error: "id" });
    await redis([["HDEL", "golf:videos", b.id]]);
    return res.json({ ok: true });
  }
  if (b.op === "logDel") {
    if (b.all) await redis([["DEL", "golf:log"]]);
    else if (/^[a-z0-9]{8,20}-[a-z]+$/.test(String(b.id || ""))) await redis([["HDEL", "golf:log", b.id]]);
    return res.json({ ok: true });
  }
  if (b.op === "newKey") {
    const nk = newId(16);
    await redis([["SET", "golf:key", nk]]);
    return res.json({ key: nk });
  }
  return res.status(400).json({ error: "op" });
}
