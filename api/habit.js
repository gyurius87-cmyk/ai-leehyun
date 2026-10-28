// 습관 챌린지. 챌린지마다 알아보기 힘든 id가 있고, 그 주소(?g=id)를 받은 사람만 들어와 체크함.
// 새 챌린지 만들기와 내 챌린지 목록은 ADMIN_KEY(Vercel 환경변수)를 아는 이현님만.
// 저장(Redis): habit:g:<id> 챌린지 정보, habit:m:<id>:<YYYY-MM> 달별 멤버(hash), habit:c:<id>:<YYYY-MM> 체크(hash "습관id|날짜")
import { redis, hasRedis } from "./_redis.js";

const clip = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const okId = (s) => /^[a-zA-Z0-9_-]{4,40}$/.test(String(s || ""));
const okMonth = (s) => /^20\d\d-(0[1-9]|1[0-2])$/.test(String(s || ""));
const okDate = (s) => /^20\d\d-\d\d-\d\d$/.test(String(s || ""));
const newId = (n = 12) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const pairs = (flat) => { const o = {}; for (let i = 0; flat && i < flat.length; i += 2) o[flat[i]] = flat[i + 1]; return o; };

function cleanMember(m) {
  const habits = (Array.isArray(m?.habits) ? m.habits : []).slice(0, 6).map((h) => {
    const days = [...new Set((Array.isArray(h?.days) ? h.days : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    const per = Math.max(1, Math.min(7, Number(h?.perWeek) || days.length || 3));
    return { id: okId(h?.id) ? h.id : newId(8), name: clip(h?.name, 30) || "습관", perWeek: days.length ? days.length : per, days };
  });
  return { id: okId(m?.id) ? m.id : newId(8), name: clip(m?.name, 20) || "이름", habits, order: Number(m?.order) || Date.now() };
}

export default async function handler(req, res) {
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const g = req.method === "GET" ? req.query.g : b.g;

  // 이현님: 내 챌린지 목록
  if (req.method === "GET" && req.query.list) {
    if (!admin) return res.status(401).json({ error: "auth" });
    const [h] = await redis([["HGETALL", "habit:groups"]]);
    return res.json({ groups: Object.entries(pairs(h)).map(([id, v]) => ({ id, ...JSON.parse(v) })) });
  }
  // 이현님: 새 챌린지
  if (req.method === "POST" && b.op === "create") {
    if (!admin) return res.status(401).json({ error: "auth" });
    const id = newId(), title = clip(b.title, 40) || "습관 챌린지", month = okMonth(b.month) ? b.month : null;
    const meta = { title, months: month ? [month] : [], createdAt: Date.now() };
    await redis([["SET", `habit:g:${id}`, JSON.stringify(meta)], ["HSET", "habit:groups", id, JSON.stringify({ title, createdAt: meta.createdAt })]]);
    return res.json({ id });
  }

  if (!okId(g)) return res.status(400).json({ error: "g" });
  const [raw] = await redis([["GET", `habit:g:${g}`]]);
  if (!raw) return res.status(404).json({ error: "not_found" });
  const meta = JSON.parse(raw);

  // 전체 기간 대시보드: 모든 달의 멤버·체크를 한 번에
  if (req.method === "GET" && req.query.all) {
    const ms = meta.months.slice(-24);
    const out = ms.length ? await redis(ms.flatMap((m) => [["HGETALL", `habit:m:${g}:${m}`], ["HGETALL", `habit:c:${g}:${m}`]])) : [];
    return res.json({ meta, months: ms.map((m, i) => ({ month: m, members: Object.values(pairs(out[2 * i])).map((v) => JSON.parse(v)).sort((a, b) => a.order - b.order), checks: pairs(out[2 * i + 1]) })) });
  }
  if (req.method === "GET") {
    const month = okMonth(req.query.m) ? req.query.m : meta.months[meta.months.length - 1];
    if (!month) return res.json({ meta, month: null, members: [], checks: {}, admin: !!admin });
    const [m, c] = await redis([["HGETALL", `habit:m:${g}:${month}`], ["HGETALL", `habit:c:${g}:${month}`]]);
    const members = Object.values(pairs(m)).map((v) => JSON.parse(v)).sort((a, b) => a.order - b.order);
    return res.json({ meta, month, members, checks: pairs(c), admin: !!admin });
  }
  if (req.method !== "POST") return res.status(405).end();

  const month = b.month;
  if (b.op === "title") {
    if (!admin) return res.status(401).json({ error: "auth" });
    meta.title = clip(b.title, 40) || meta.title;
    await redis([["SET", `habit:g:${g}`, JSON.stringify(meta)], ["HSET", "habit:groups", g, JSON.stringify({ title: meta.title, createdAt: meta.createdAt })]]);
    return res.json({ ok: true });
  }
  // 지금까지 모인 돈: 이현님(관리 키)만 정함, 모두에게 보임
  if (b.op === "pot") {
    if (!admin) return res.status(401).json({ error: "auth" });
    meta.pot = Math.max(0, Math.min(1e10, Math.round(Number(b.pot) || 0)));
    meta.potAt = Date.now();
    await redis([["SET", `habit:g:${g}`, JSON.stringify(meta)]]);
    return res.json({ ok: true, pot: meta.pot });
  }
  if (!okMonth(month)) return res.status(400).json({ error: "month" });

  if (b.op === "addMonth") {
    if (meta.months.includes(month)) return res.json({ ok: true });
    if (meta.months.length >= 60) return res.status(400).json({ error: "too_many" });
    meta.months = [...meta.months, month].sort();
    const cmds = [["SET", `habit:g:${g}`, JSON.stringify(meta)]];
    // 지난달 멤버·습관 설정을 그대로 가져옴 (체크는 새로 시작)
    if (okMonth(b.copyFrom) && meta.months.includes(b.copyFrom)) {
      const [m] = await redis([["HGETALL", `habit:m:${g}:${b.copyFrom}`]]);
      const flat = Object.entries(pairs(m)).flat();
      if (flat.length) cmds.push(["HSET", `habit:m:${g}:${month}`, ...flat]);
    }
    await redis(cmds);
    return res.json({ ok: true });
  }
  if (!meta.months.includes(month)) return res.status(400).json({ error: "no_month" });

  if (b.op === "saveMember") {
    const m = cleanMember(b.member);
    const [n] = await redis([["HLEN", `habit:m:${g}:${month}`]]);
    if (n >= 30 && !b.member?.id) return res.status(400).json({ error: "full" });
    await redis([["HSET", `habit:m:${g}:${month}`, m.id, JSON.stringify(m)]]);
    return res.json({ member: m });
  }
  if (b.op === "delMember") {
    if (!okId(b.id)) return res.status(400).json({ error: "id" });
    await redis([["HDEL", `habit:m:${g}:${month}`, b.id]]);
    return res.json({ ok: true });
  }
  if (b.op === "check") {
    if (!okId(b.hid) || !okDate(b.date) || !b.date.startsWith(month)) return res.status(400).json({ error: "check" });
    const f = `${b.hid}|${b.date}`;
    await redis([b.on ? ["HSET", `habit:c:${g}:${month}`, f, "1"] : ["HDEL", `habit:c:${g}:${month}`, f]]);
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "op" });
}
