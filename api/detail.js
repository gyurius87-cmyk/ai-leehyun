// 쇼핑몰 상페 교체 (psd버전). PSD에서 만든 '틀'과 올린 글꼴을 저장하고, 공유 주소로 다른 사람도 쓰게 함.
// 이현님(ADMIN_KEY) 또는 이현님이 만든 공유 열쇠(?k=)를 가진 사람만. AI 글 채우기는 이현님 API 키(ANTHROPIC_API_KEY)로.
// 저장(Redis): ds:tpls (id → 요약), ds:tpl:<id> (틀 JSON), ds:fonts (id → 글꼴 정보),
//              ds:b:<id> (파일 정보 {type,n,size}), ds:b:<id>:<i> (파일 조각, base64), ds:keys (열쇠 → {name,at})
import Anthropic from "@anthropic-ai/sdk";
import { redis, hasRedis } from "./_redis.js";
import { recordUsage } from "./_usage.js";

const MODEL = process.env.DETAIL_MODEL || "claude-sonnet-5-5";
const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").slice(0, n);
const okId = (s) => /^[a-z0-9]{6,24}$/.test(String(s || ""));
const newId = (n = 12) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const pairs = (flat) => { const o = {}; for (let i = 0; flat && i < flat.length; i += 2) o[flat[i]] = flat[i + 1]; return o; };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const MAX_CHUNK = 950_000, MAX_PARTS = 40, TYPES = /^(image\/(jpeg|png|webp)|font\/(ttf|otf|woff2?)|application\/octet-stream)$/;

async function who(req) {
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  if (admin) return "admin";
  const k = String(req.headers["x-share-key"] || req.query?.k || "");
  if (/^[a-z0-9]{10,24}$/.test(k)) { const r = await redis([["HGET", "ds:keys", k]]); if (r?.[0]) return "share"; }
  return null;
}

export default async function handler(req, res) {
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  const role = await who(req);
  if (!role) return res.status(401).json({ error: "auth" });
  const q = req.query || {};

  if (req.method === "GET") {
    // 파일 조각: 바이트 그대로 (id가 바뀌지 않으니 오래 캐시)
    if (q.b) {
      if (!okId(q.b)) return res.status(400).end();
      const i = Math.max(0, Math.min(MAX_PARTS - 1, Number(q.i) || 0));
      const [meta, part] = await redis([["GET", `ds:b:${q.b}`], ["GET", `ds:b:${q.b}:${i}`]]);
      const m = json(meta); if (!m || part == null) return res.status(404).end();
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("X-Parts", String(m.n)); res.setHeader("X-Type", m.type);
      return res.send(Buffer.from(part, "base64"));
    }
    if (q.tpl) {
      if (!okId(q.tpl)) return res.status(400).end();
      const [t] = await redis([["GET", `ds:tpl:${q.tpl}`]]);
      if (!t) return res.status(404).json({ error: "none" });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ tpl: json(t) });
    }
    const [tpls, fonts, keys] = await redis([["HGETALL", "ds:tpls"], ["HGETALL", "ds:fonts"], ["HGETALL", "ds:keys"]]);
    const list = (h) => Object.values(pairs(h)).map(json).filter(Boolean).sort((a, b) => (b.at || 0) - (a.at || 0));
    res.setHeader("Cache-Control", "no-store");
    return res.json({ role, fill: !!process.env.OPENAI_API_KEY, tpls: list(tpls), fonts: list(fonts), keys: role === "admin" ? Object.entries(pairs(keys)).map(([k, v]) => ({ k, ...json(v) })) : undefined });
  }

  let b = req.body || {};
  if (typeof b === "string") b = json(b) || {};
  const op = b.op;

  // 파일 올리기: 조각마다 한 번씩 (첫 조각에 전체 정보)
  if (op === "put") {
    const id = okId(b.id) ? b.id : null, i = Number(b.i), n = Number(b.n), data = String(b.data || "");
    if (!id || !(i >= 0 && i < n && n <= MAX_PARTS) || !data || data.length > MAX_CHUNK * 1.4 || !/^[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ error: "put" });
    const cmds = [["SET", `ds:b:${id}:${i}`, data]];
    if (i === 0) { if (!TYPES.test(b.type)) return res.status(400).json({ error: "type" }); cmds.push(["SET", `ds:b:${id}`, JSON.stringify({ type: b.type, n, size: Number(b.size) || 0 })]); }
    await redis(cmds);
    return res.json({ ok: true });
  }
  if (op === "tpl") {
    const t = b.tpl, s = JSON.stringify(t || {});
    if (!t || !okId(t.id) || s.length > 900_000) return res.status(400).json({ error: "tpl" });
    t.name = clip(t.name, 60) || "이름 없는 틀"; t.at = Date.now();
    const sum = { id: t.id, name: t.name, w: t.w, h: t.h, at: t.at, thumb: okId(t.thumb) ? t.thumb : "", slots: (t.slots || []).length, fonts: (Array.isArray(t.fonts) ? t.fonts : []).slice(0, 40).map((f) => ({ ps: clip(f?.ps, 80), slot: !!f?.slot })).filter((f) => f.ps) };
    await redis([["SET", `ds:tpl:${t.id}`, JSON.stringify(t)], ["HSET", "ds:tpls", t.id, JSON.stringify(sum)]]);
    return res.json({ ok: true, id: t.id });
  }
  if (op === "deltpl") {
    if (!okId(b.id)) return res.status(400).end();
    const [t] = await redis([["GET", `ds:tpl:${b.id}`]]);
    const blobs = new Set(); JSON.stringify(json(t) || {}, (k, v) => { if (/^(img|mask|over|under|orig|thumb|src)$/.test(k) && okId(v)) blobs.add(v); return v; });
    await dropBlobs([...blobs], [["DEL", `ds:tpl:${b.id}`], ["HDEL", "ds:tpls", b.id]]);
    return res.json({ ok: true });
  }
  if (op === "font") {
    if (!okId(b.blob)) return res.status(400).end();
    const f = { id: okId(b.id) ? b.id : newId(), blob: b.blob, name: clip(b.name, 80), ps: clip(b.ps, 80), family: clip(b.family, 80), file: clip(b.file, 120), at: Date.now() };
    await redis([["HSET", "ds:fonts", f.id, JSON.stringify(f)]]);
    return res.json({ ok: true, font: f });
  }
  if (op === "delfont") {
    if (!okId(b.id)) return res.status(400).end();
    const [f] = await redis([["HGET", "ds:fonts", b.id]]);
    await dropBlobs([json(f)?.blob].filter(okId), [["HDEL", "ds:fonts", b.id]]);
    return res.json({ ok: true });
  }
  if (op === "ai") return aiFill(b, res);
  if (op === "qs") return aiQs(b, res);
  if (op === "fill") return genFill(b, res);
  if (op === "tplqs") {
    if (!okId(b.id)) return res.status(400).end();
    const [t] = await redis([["GET", `ds:tpl:${b.id}`]]); const tpl = json(t);
    if (!tpl) return res.status(404).json({ error: "none" });
    tpl.qs = cleanQs(b.qs, new Set((tpl.slots || []).map((x) => x.id)));
    await redis([["SET", `ds:tpl:${b.id}`, JSON.stringify(tpl)]]);
    return res.json({ ok: true, qs: tpl.qs });
  }

  // 공유 열쇠는 이현님만
  if (role !== "admin") return res.status(403).json({ error: "admin" });
  if (op === "keyadd") { const k = newId(14); await redis([["HSET", "ds:keys", k, JSON.stringify({ name: clip(b.name, 30) || "공유", at: Date.now() })]]); return res.json({ ok: true, k }); }
  if (op === "keydel") { await redis([["HDEL", "ds:keys", clip(b.k, 30)]]); return res.json({ ok: true }); }
  return res.status(400).json({ error: "op" });
}

async function dropBlobs(ids, extra) {
  const metas = ids.length ? await redis(ids.map((id) => ["GET", `ds:b:${id}`])) : [];
  const cmds = [...extra];
  ids.forEach((id, j) => { const n = json(metas[j])?.n || 0; cmds.push(["DEL", `ds:b:${id}`, ...Array.from({ length: n }, (_, i) => `ds:b:${id}:${i}`)]); });
  await redis(cmds);
}

// 빈칸 채우기 (포토샵 생성형 채우기처럼): 주변 그림 + 칠한 자리(마스크) → OpenAI 이미지가 그 자리만 새로 그림
const FILL_MODEL = process.env.FILL_MODEL || "gpt-image-1";
async function genFill(b, res) {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "no_key" });
  const size = ["1024x1024", "1536x1024", "1024x1536"].includes(b.size) ? b.size : "1024x1024";
  const img = String(b.img || ""), mask = String(b.mask || "");
  if (!/^[A-Za-z0-9+/=]+$/.test(img) || !/^[A-Za-z0-9+/=]+$/.test(mask) || img.length > 3_000_000 || mask.length > 600_000) return res.status(400).json({ error: "img" });
  const want = clip(b.prompt, 300).trim();
  const prompt = `Fill the transparent masked area of this e-commerce product detail page so it blends seamlessly with the surroundings: match lighting, colors, texture, perspective and style exactly. ${want ? `Draw: ${want}.` : "Continue the existing background naturally; do not add text, logos or new objects."} Keep everything outside the mask unchanged.`;
  const fd = new FormData();
  fd.append("model", FILL_MODEL); fd.append("prompt", prompt); fd.append("size", size); fd.append("n", "1");
  fd.append("quality", ["low", "medium", "high"].includes(b.quality) ? b.quality : "medium");
  fd.append("output_format", "jpeg"); fd.append("output_compression", "90");
  fd.append("image", new Blob([Buffer.from(img, "base64")], { type: "image/jpeg" }), "image.jpg");
  fd.append("mask", new Blob([Buffer.from(mask, "base64")], { type: "image/png" }), "mask.png");
  try {
    const r = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("fill", r.status, j?.error?.message); return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? "busy" : r.status === 400 ? "refused" : "api", msg: clip(j?.error?.message, 200) }); }
    const out = j?.data?.[0]?.b64_json; if (!out) return res.status(502).json({ error: "shape" });
    return res.json({ img: out });
  } catch (err) { console.error(err); return res.status(502).json({ error: "api" }); }
}

// 질문칸: {id, label, hint, ex(원래 글에서 본 예), long(여러 줄), fill(그 답이 칸 글 전체면 그 칸 id)}
function cleanQs(list, slotIds) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).slice(0, 30).map((q, i) => {
    let id = /^q[a-z0-9]{1,12}$/.test(q?.id) ? q.id : "q" + (i + 1);
    while (seen.has(id)) id += "x"; seen.add(id);
    return { id, label: clip(q?.label, 30).trim(), hint: clip(q?.hint, 80), ex: clip(q?.ex, 200), long: !!q?.long, fill: slotIds.has(q?.fill) ? q.fill : "" };
  }).filter((q) => q.label);
}

// 상세페이지 글을 읽고 이 틀에 맞는 상품 정보 질문칸을 만듦
async function aiQs(b, res) {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "no_key" });
  const slots = (Array.isArray(b.slots) ? b.slots : []).slice(0, 60).map((s) => ({ id: clip(s.id, 30), label: clip(s.label, 40), orig: clip(s.orig, 300) })).filter((s) => s.id);
  const other = clip(b.other, 3000);
  if (!slots.length) return res.status(400).json({ error: "empty" });
  const prompt = `너는 한국 온라인 쇼핑몰 상세페이지를 매일 새 상품으로 바꿔 만드는 일을 돕는 사람이야.
아래는 한 상세페이지 틀의 글 칸들(위에서 아래 순서)이야. 이 페이지를 이해하고, 새 상품으로 바꿀 때 직원이 채워야 하는 '상품 정보 질문칸'을 만들어 줘.

규칙
- 정보 하나에 질문칸 하나: 예) 상품명, 컬러, 사이즈, 실측(총장·가슴단면 등), 소재, 두께감·신축성, 세탁, 핏, 추천 포인트… 이 페이지에 실제로 있는 정보만.
- 상품이 바뀌어도 그대로인 글(브랜드명, 배송·교환 안내, 공통 문구)은 질문으로 만들지 마.
- label은 짧게(2~8자). hint는 무엇을 어떻게 적는지 한 줄. ex는 원래 글에서 그대로 따온 예시.
- 표처럼 여러 줄인 정보(사이즈별 실측 등)는 long: true.
- 어떤 글 칸의 글 전체가 그 질문의 답 하나와 같으면(예: 상품명 칸) fill에 그 칸 id. 아니면 "".
- 많아야 12개. 중요한 순서로.
- JSON 한 덩어리만 답해: {"qs":[{"id":"q1","label":"","hint":"","ex":"","long":false,"fill":""}]}

글 칸 (id | 이름 | 원래 글):
${slots.map((s) => `- ${s.id} | ${s.label || "-"} | ${JSON.stringify(s.orig)}`).join("\n")}${other ? `\n\n칸이 아닌 다른 글(참고):\n${other}` : ""}`;
  try {
    const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 3000, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] });
    await recordUsage(msg.usage || {}, MODEL);
    const out = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("");
    const r = json(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    if (!Array.isArray(r?.qs)) return res.status(502).json({ error: "shape" });
    return res.json({ qs: cleanQs(r.qs, new Set(slots.map((s) => s.id))) });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
    console.error(err);
    return res.status(502).json({ error: "api" });
  }
}

// 상품 메모를 읽고 글 칸마다 원래 글과 같은 길이·말투로 채움
async function aiFill(b, res) {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "no_key" });
  const memo = clip(b.memo, 4000).trim();
  const slots = (Array.isArray(b.slots) ? b.slots : []).slice(0, 60).map((s) => ({ id: clip(s.id, 30), label: clip(s.label, 40), orig: clip(s.orig, 300), lines: Math.max(1, Math.min(20, Number(s.lines) || 1)) })).filter((s) => s.id);
  if (!memo || !slots.length) return res.status(400).json({ error: "empty" });
  const prompt = `너는 한국 온라인 쇼핑몰 상세페이지 카피를 바꿔 쓰는 사람이야. 같은 틀에 상품만 바뀌어.
아래 '새 상품 정보'를 보고, 각 글 칸을 새 상품에 맞게 바꿔 써 줘.

규칙
- 원래 글과 길이, 줄 수, 말투, 형식(숫자·단위·기호·줄바꿈 위치)을 최대한 그대로 맞춰. 칸 크기가 정해져 있어서 길어지면 안 돼.
- 새 상품 정보에 없는 사실(소재 비율, 치수, 인증, 숫자)은 지어내지 마. 모르면 원래 글을 그대로 둬.
- 상품과 상관없는 글(브랜드 이름, 공통 안내, 배송 안내 등)은 원래 글 그대로 둬.
- JSON 한 덩어리만 답해: {"values": {"칸 id": "새 글", ...}}

새 상품 정보:
${memo}

글 칸 (id, 이름, 원래 줄 수, 원래 글):
${slots.map((s) => `- ${s.id} | ${s.label || "-"} | ${s.lines}줄 | ${JSON.stringify(s.orig)}`).join("\n")}`;
  try {
    const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 4000, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] });
    await recordUsage(msg.usage || {}, MODEL);
    const out = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("");
    const r = json(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    if (!r?.values || typeof r.values !== "object") return res.status(502).json({ error: "shape" });
    const values = {}; for (const s of slots) if (typeof r.values[s.id] === "string") values[s.id] = clip(r.values[s.id], 600);
    return res.json({ values });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
    console.error(err);
    return res.status(502).json({ error: "api" });
  }
}
