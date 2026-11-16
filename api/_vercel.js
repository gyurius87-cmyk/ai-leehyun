// 버셀 모니터링 — 이번 결제 기간에 어디에 얼마 썼고, 포함 크레딧이 얼마 남았는지 (이현님 전용, x-admin-key)
// /api/youtube?vc=1 로 들어와요 (/api/vercel 이 여기로 이어짐)
// 키: VERCEL_TOKEN (vercel.com/account/tokens 에서 만든 토큰) — Vercel 환경변수에만 둬요.
//     VERCEL_TEAM_ID 는 없어도 돼요 (없으면 첫 번째 팀을 찾아 써요).
// 자료: 결제 내역 /v1/billing/charges (FOCUS 형식 JSONL, 하루 단위), 프로젝트 /v9/projects, 배포 /v6/deployments
// 토큰이 없으면 화면이 볼 수 있게 '예시 자료'를 돌려줘요 (demo:true).
import { gunzipSync } from "node:zlib";
import { hasRedis, redis } from "./_redis.js";

const TOKEN = () => process.env.VERCEL_TOKEN;
const API = "https://api.vercel.com";
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ymd = (d) => d.toISOString().slice(0, 10);

async function vc(path, raw) {
  const r = await fetch(API + path, { headers: { Authorization: "Bearer " + TOKEN() } });
  if (!r.ok) throw new Error(`vercel ${r.status} ${path.split("?")[0]} ${(await r.text()).slice(0, 160)}`);
  if (!raw) return r.json();
  let buf = Buffer.from(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return buf.toString("utf8");
}

async function cached(key, ttl, fn) {
  if (hasRedis()) { const [v] = await redis([["GET", "vc:c:" + key]]); const j = json(v); if (j) return j; }
  const out = await fn();
  if (hasRedis() && out) await redis([["SET", "vc:c:" + key, JSON.stringify(out), "EX", ttl]]);
  return out;
}

// 결제 기간: 매달 day 일에 시작 (Pro 결제한 날)
function period(day, now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  let y = kst.getUTCFullYear(), m = kst.getUTCMonth();
  if (kst.getUTCDate() < day) m -= 1;
  const from = new Date(Date.UTC(y, m, day));
  const to = new Date(Date.UTC(y, m + 1, day));
  const days = Math.round((to - from) / 864e5);
  const elapsed = Math.min(days, Math.max(1, (kst - from) / 864e5));
  return { from: ymd(from), to: ymd(to), days, elapsed };
}

// FOCUS 한 줄에서 필요한 것만 (이름이 조금 달라도 찾게)
function pick(o, ...ks) { for (const k of ks) if (o[k] != null && o[k] !== "") return o[k]; return undefined; }
function parseCharges(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const o = json(line.trim()); if (!o) continue;
    const tags = (typeof o.Tags === "string" ? json(o.Tags) : o.Tags) || {};
    rows.push({
      day: String(pick(o, "ChargePeriodStart", "UsageStart", "BillingPeriodStart") || "").slice(0, 10),
      service: pick(o, "ServiceName", "ChargeDescription", "SkuId") || "기타",
      cat: pick(o, "ServiceCategory") || "",
      cost: num(pick(o, "BilledCost", "EffectiveCost", "ListCost")),
      qty: num(pick(o, "ConsumedQuantity", "PricingQuantity")),
      unit: pick(o, "ConsumedUnit", "PricingUnit") || "",
      project: pick(tags, "ProjectName", "projectName", "project", "ProjectId", "projectId") || "",
    });
  }
  return rows;
}

function summarize(rows, per) {
  const by = (keyf) => {
    const m = new Map();
    for (const r of rows) { const k = keyf(r); if (!k) continue; const e = m.get(k) || { name: k, cost: 0, qty: 0, unit: r.unit }; e.cost += r.cost; e.qty += r.qty; m.set(k, e); }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  };
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const days = [];
  for (let d = new Date(per.from + "T00:00:00Z"); ymd(d) < per.to; d = new Date(d.getTime() + 864e5)) days.push(ymd(d));
  const dayMap = new Map(days.map((d) => [d, {}]));
  for (const r of rows) { const e = dayMap.get(r.day); if (e) e[r.service] = (e[r.service] || 0) + r.cost; }
  return {
    total,
    projected: total / per.elapsed * per.days,
    byService: by((r) => r.service),
    byProject: by((r) => r.project),
    byDay: days.map((d) => ({ day: d, ...dayMap.get(d) })),
  };
}

async function teamId() {
  if (process.env.VERCEL_TEAM_ID) return process.env.VERCEL_TEAM_ID;
  // 팀 하나에만 쓰는 토큰은 팀 목록을 못 봐요(403) → 내 정보의 기본 팀 → 프로젝트 주인 순서로 찾아요
  return cached("team", 86400, async () => {
    const tries = [
      async () => (await vc("/v2/teams?limit=20")).teams?.[0]?.id,
      async () => { const u = (await vc("/v2/user")).user || {}; return u.defaultTeamId; },
      async () => { const p = await vc("/v9/projects/" + (process.env.VERCEL_PROJECT_NAME || "ai-leehyun")); return p.accountId; },
      async () => (await vc("/v9/projects?limit=1")).projects?.[0]?.accountId,
    ];
    for (const t of tries) { try { const id = await t(); if (id) return id; } catch {} }
    return "";
  }).catch(() => "");
}

async function live(day, fresh) {
  const per = period(day);
  const tid = await teamId();
  const tq = tid ? "teamId=" + encodeURIComponent(tid) : "";
  const key = `b:${per.from}`;
  if (fresh && hasRedis()) await redis([["DEL", "vc:c:" + key], ["DEL", "vc:c:p"], ["DEL", "vc:c:d"]]);
  const [bill, projects, deps] = await Promise.all([
    cached(key, 1800, async () => {
      const toD = new Date(Math.min(Date.now() + 864e5, Date.parse(per.to + "T00:00:00Z")));
      const qs = `from=${per.from}T00:00:00.000Z&to=${ymd(toD)}T00:00:00.000Z`;
      let text;
      try { text = await vc(`/v1/billing/charges?${tq}&${qs}`, true); }
      catch (e) { if (!tq || !/ 404 /.test(e.message)) throw e; text = await vc(`/v1/billing/charges?${qs}`, true); }
      return summarize(parseCharges(text), per);
    }).catch((e) => ({ error: String(e.message || e), noPlan: /Plan not found/i.test(String(e.message)) })),
    cached("p", 1800, async () => {
      const j = await vc(`/v9/projects?limit=100&${tq}`);
      return (j.projects || []).map((p) => ({ name: p.name, framework: p.framework || "", updatedAt: p.updatedAt, created: p.createdAt, node: p.nodeVersion || "" }));
    }).catch((e) => ({ error: String(e.message || e) })),
    cached("d", 600, async () => {
      const j = await vc(`/v6/deployments?limit=40&${tq}`);
      return (j.deployments || []).map((d) => ({ name: d.name, state: d.state || d.readyState, target: d.target || "preview", created: d.created, build: d.ready && d.buildingAt ? Math.round((d.ready - d.buildingAt) / 1000) : null, msg: (d.meta && (d.meta.githubCommitMessage || "")).split("\n")[0].slice(0, 80) }));
    }).catch((e) => ({ error: String(e.message || e) })),
  ]);
  return { demo: false, per, bill, projects, deps, at: Date.now() };
}

// ── 예시 자료
function demo(day) {
  const per = period(day);
  const svc = [["Function Invocations", 0.02], ["Fluid Active CPU", 0.11], ["Fast Data Transfer", 0.07], ["Edge Requests", 0.04], ["Image Optimization", 0.03], ["Build Minutes", 0.05]];
  const projs = ["ai-leehyun", "shop-tools", "golf-app"];
  const rows = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < Math.floor(per.elapsed); i++) {
    const d = ymd(new Date(Date.parse(per.from + "T00:00:00Z") + i * 864e5));
    for (const [s, base] of svc) rows.push({ day: d, service: s, cost: base * (0.6 + rnd() * 1.2), qty: 0, unit: "", project: projs[Math.floor(rnd() * 3)] });
  }
  const now = Date.now();
  const deps = Array.from({ length: 12 }, (_, i) => ({ name: projs[i % 3], state: i === 2 ? "ERROR" : "READY", target: i % 4 ? "production" : "preview", created: now - i * 5.3 * 3600e3, build: 35 + Math.round(rnd() * 60), msg: ["타임라인 자동 기록", "쇼핑몰 뭐 팔까? 추가", "AI 사무실 현황 자동 갱신", "버튼 색 고침"][i % 4] }));
  return { demo: true, per, bill: summarize(rows, per), projects: projs.map((n, i) => ({ name: n, framework: i ? "nextjs" : "astro", updatedAt: now - i * 864e5 * 3, created: now - 864e5 * (40 + i * 10) })), deps, at: now };
}

export default async function vercel(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const admin = !!process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  if (!admin) return res.status(401).json({ error: "auth" });
  const day = Math.min(28, Math.max(1, parseInt(req.query.day, 10) || 16));
  try {
    if (!TOKEN()) return res.json(demo(day));
    return res.json(await live(day, req.query.fresh === "1"));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
