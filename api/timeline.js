// 공부한 것 고치기. 사이트의 data/timeline.json 위에 덮어쓰는 수정본을 Redis(tl:edits)에 둠.
// 보기는 누구나(고친 내용이 모두에게 보여야 하니까), 고치기는 ADMIN_KEY(Vercel 환경변수)를 아는 이현님만.
import { redis, hasRedis } from "./_redis.js";

const H = "tl:edits";
const CATS = ["사이트", "프로그램", "자동화", "브랜드", "공부노트", "사업", "재테크모임"];
const clip = (s, n) => String(s ?? "").trim().slice(0, n);
const item = (b) => {
  const o = { text: clip(b.text, 400), cat: CATS.includes(b.cat) ? b.cat : "사이트", time: /^\d{2}:\d{2}$/.test(b.time) ? b.time : "" };
  const link = clip(b.link, 300);
  if (link && /^(\/|https:\/\/)/.test(link)) o.link = link;
  return o;
};

export default async function handler(req, res) {
  if (!hasRedis()) return res.status(503).json({ error: "no_redis" });
  if (req.method === "GET") {
    const flat = (await redis([["HGETALL", H]]))[0] || [];
    const edits = {};
    for (let i = 0; i < flat.length; i += 2) { try { edits[flat[i]] = JSON.parse(flat[i + 1]); } catch {} }
    res.setHeader("Cache-Control", "no-store");
    return res.json({ edits });
  }
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  // 순일시간 체크: 켜져 있던 구간(세션) 저장. 이현님(관리자 키) 또는 이현님이 만들어 준 사람 주소(?u=)로.
  if (b.op === "work") {
    const P = "work:p";
    const TOK = /^[a-f0-9]{24}$/;
    let who = "";
    if (b.u) {
      if (!TOK.test(b.u) || !(await redis([["HEXISTS", P, b.u]]))[0]) return res.status(401).json({ error: "auth" });
      who = b.u;
    } else if (!admin) return res.status(401).json({ error: "auth" });
    else if (b.view) { if (!TOK.test(b.view)) return res.status(400).json({ error: "view" }); who = b.view; }
    const W = who ? "work:s:" + who : "work:s", M = who ? "work:meta:" + who : "work:meta";
    const id = /^[a-z0-9]{4,40}$/.test(b.id) ? b.id : "";
    const num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.round(+v) : 0);
    const getP = async (u) => { try { return JSON.parse((await redis([["HGET", P, u]]))[0] || "null"); } catch { return null; } };
    // 사람 주소: 내 이름 보기·정하기
    if (b.act === "me") { if (!who) return res.json({ admin: true }); return res.json({ me: await getP(who) }); }
    if (b.act === "name" && who) {
      const o = (await getP(who)) || { created: Date.now() };
      o.name = clip(b.name, 20);
      await redis([["HSET", P, who, JSON.stringify(o)]]);
      return res.json({ ok: true, me: o });
    }
    // 이현님만: 사람 목록·추가·빼기
    if (admin && !b.u && b.act === "people") {
      const flat = (await redis([["HGETALL", P]]))[0] || [];
      const ppl = [];
      for (let i = 0; i < flat.length; i += 2) { try { ppl.push({ u: flat[i], ...JSON.parse(flat[i + 1]) }); } catch {} }
      ppl.sort((a, c) => (a.created || 0) - (c.created || 0));
      const all = ppl.length ? await redis(ppl.map((p) => ["HGETALL", "work:s:" + p.u])) : [];
      const now = Date.now(), from = num(b.from), wk = num(b.wk);
      ppl.forEach((p, j) => {
        const f = all[j] || []; let today = 0, week = 0, lastAt = 0;
        for (let i = 0; i < f.length; i += 2) {
          try {
            const o = JSON.parse(f[i + 1]); const end = (!o.stopped && now - o.last < 90000) ? now : o.last;
            lastAt = Math.max(lastAt, o.last);
            if (from) today += Math.max(0, end - Math.max(o.start, from));
            if (wk) week += Math.max(0, end - Math.max(o.start, wk));
          } catch {}
        }
        p.today = today; p.week = week; p.lastAt = lastAt; p.live = now - lastAt < 90000;
      });
      return res.json({ people: ppl });
    }
    if (admin && !b.u && b.act === "addp") {
      const { randomBytes } = await import("node:crypto");
      const u = randomBytes(12).toString("hex");
      await redis([["HSET", P, u, JSON.stringify({ name: clip(b.name, 20), created: Date.now() })]]);
      return res.json({ u });
    }
    if (admin && !b.u && b.act === "delp" && TOK.test(b.target)) {
      await redis([["HDEL", P, b.target], ["DEL", "work:s:" + b.target], ["DEL", "work:meta:" + b.target]]);
      return res.json({ ok: true });
    }
    if (b.act === "save" && id && num(b.start) && num(b.last) >= num(b.start)) {
      const o = { start: num(b.start), last: num(b.last), dev: clip(b.dev, 20) };
      if (b.stopped) o.stopped = true;
      await redis([["HSET", W, id, JSON.stringify(o)]]);
      return res.json({ ok: true });
    }
    if (b.act === "del" && id) { await redis([["HDEL", W, id]]); return res.json({ ok: true }); }
    if (b.act === "goal") {
      if (b.set && typeof b.set === "object" && !b.view) {
        const m = num(b.set.min);
        if (m > 0 && m <= 1440) await redis([["HSET", M, "goal", JSON.stringify({ min: m, at: Date.now() })]]);
        else await redis([["HDEL", M, "goal"]]);
      }
      const v = (await redis([["HGET", M, "goal"]]))[0];
      let goal = null; try { goal = v ? JSON.parse(v) : null; } catch {}
      return res.json({ goal });
    }
    if (b.act === "meta") {
      if (b.set && typeof b.set === "object") await redis([["HSET", M, "aw", JSON.stringify({ last: num(b.set.last), snooze: num(b.set.snooze) })]]);
      const v = (await redis([["HGET", M, "aw"]]))[0];
      let aw = null; try { aw = v ? JSON.parse(v) : null; } catch {}
      return res.json({ aw });
    }
    if (b.act === "list") {
      const from = num(b.from), to = num(b.to) || Infinity;
      const flat = (await redis([["HGETALL", W]]))[0] || [];
      const sessions = [];
      for (let i = 0; i < flat.length; i += 2) { try { const o = JSON.parse(flat[i + 1]); if (o.last >= from && o.start < to) sessions.push({ id: flat[i], ...o }); } catch {} }
      res.setHeader("Cache-Control", "no-store");
      return res.json({ sessions });
    }
    return res.status(400).json({ error: "work" });
  }
  if (!admin) return res.status(401).json({ error: "auth" });
  // 즐겨찾기 비공개 바로가기 주소(공개 저장소·사이트에 못 적는 주소): 관리자만 읽고 씀
  if (b.op === "links") {
    const L = "fav:links";
    if (b.set && /^[a-z0-9-]{1,40}$/.test(b.set.id)) {
      const href = clip(b.set.href, 300);
      if (/^https:\/\//.test(href)) await redis([["HSET", L, b.set.id, href]]);
      else if (!href) await redis([["HDEL", L, b.set.id]]);
      else return res.status(400).json({ error: "href" });
    }
    const flat = (await redis([["HGETALL", L]]))[0] || [];
    const links = {};
    for (let i = 0; i < flat.length; i += 2) links[flat[i]] = flat[i + 1];
    return res.json({ links });
  }
  const k = clip(b.k, 120);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : "";
  // op: edit(원래 항목 고치기) · del(원래 항목 숨기기) · add(새 항목) · undo(고친 것 되돌리기) · min(그날 공부 시간)
  if (b.op === "edit" && k) {
    const o = item(b);
    if (!o.text) return res.status(400).json({ error: "text" });
    await redis([["HSET", H, k, JSON.stringify(o)]]);
  } else if (b.op === "del" && k) await redis([["HSET", H, k, JSON.stringify({ del: true })]]);
  else if (b.op === "undo" && k) await redis([["HDEL", H, k]]);
  else if (b.op === "add" && date) {
    const o = item(b);
    if (!o.text || !o.time) return res.status(400).json({ error: "text" });
    const id = /^add\|/.test(k) ? k : `add|${date}|${Date.now().toString(36)}`;
    await redis([["HSET", H, id, JSON.stringify({ ...o, date })]]);
  } else if (b.op === "min" && date) {
    const m = Math.round(Number(b.minutes));
    if (!(m >= 0 && m <= 1440)) return res.status(400).json({ error: "minutes" });
    await redis([["HSET", H, `min|${date}`, JSON.stringify({ minutes: m })]]);
  } else return res.status(400).json({ error: "op" });
  return res.json({ ok: true });
}
