// 공부 탭: 이현님이 묻는 것(질문) 또는 해보고 싶은 전략(백테스트)을 받아 Claude가 답하고, 기록으로 남김.
// 백테스트는 Claude가 말을 '규칙(JSON)'으로 바꾸고, 서버가 실제 과거 시세로 계산한 뒤, 결과를 Claude가 풀이함.
// 저장: stk:study (id 목록), stk:study:<id>
import Anthropic from "@anthropic-ai/sdk";
import { redis, kstDay } from "./_redis.js";
import { recordUsage } from "./_usage.js";

const MODEL = process.env.STOCK_MODEL || "claude-sonnet-5-5";
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const r2 = (v, d = 2) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const pickJson = (t) => json(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
async function ask(content, max = 3000) {
  const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: max, output_config: { effort: "low" }, messages: typeof content === "string" ? [{ role: "user", content }] : content });
  await recordUsage(msg.usage || {}, MODEL);
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

const SPEC_HELP = `백테스트 규칙 JSON 형식:
{"syms":["종목 심볼 1~5개 (야후 기준: 삼성전자 005930.KS, 코스닥 종목 .KQ, 미국 AAPL, 지수 ^IXIC ^GSPC ^KS11 ^KQ11 ^SOX, ETF QQQ SPY TQQQ SOXL, 금 GLD, 채권 TLT)"],
 "start":"YYYY-MM-DD (말이 없으면 10년 전)", "end":"YYYY-MM-DD 또는 빈 문자열(오늘)",
 "mode":"rule | hold | dca",
 "entry":[조건...], "exit":[조건...],  (mode가 rule일 때. entry는 모두 만족하면 사고, exit는 하나라도 만족하면 팜)
 "stop":손절 % (예 -10, 없으면 null), "take":익절 % (예 20, 없으면 null), "maxDays":최대 보유일 (없으면 null),
 "dcaDay":매달 적립일 (mode dca일 때, 1~28), "weights":[종목별 비중 합 1] (hold일 때, 없으면 똑같이),
 "bench":"비교할 심볼 (보통 ^GSPC 또는 ^KS11)"}
조건 하나: {"l":지표,"op":">"|"<"|"crossUp"|"crossDown","r":지표 또는 숫자}
지표: {"f":"close"} 종가, {"f":"ma","n":20} 이동평균, {"f":"rsi","n":14}, {"f":"ret","n":5} n일 수익률%, {"f":"dd","n":252} n일 고점 대비 %(음수), {"f":"vol","n":20} n일 변동성%(연율), 그리고 다른 심볼 값은 "s" 추가 (예 {"f":"close","s":"^VIX"}).
예: 골든크로스 = entry [{"l":{"f":"ma","n":50},"op":"crossUp","r":{"f":"ma","n":200}}], exit [{"l":{"f":"ma","n":50},"op":"crossDown","r":{"f":"ma","n":200}}]
예: RSI 30 아래에서 사서 70 위에서 팜 = entry [{"l":{"f":"rsi","n":14},"op":"<","r":30}], exit [{"l":{"f":"rsi","n":14},"op":">","r":70}]`;

// ── 지표 계산
function indicator(rows, ind) {
  const c = rows.map((r) => r.c), n = Math.max(1, +ind.n || 14), out = new Array(c.length).fill(null);
  if (ind.f === "close") return c.slice();
  if (ind.f === "ma") { let s = 0; c.forEach((v, i) => { s += v; if (i >= n) s -= c[i - n]; if (i >= n - 1) out[i] = s / n; }); return out; }
  if (ind.f === "ret") { c.forEach((v, i) => { if (i >= n) out[i] = (v / c[i - n] - 1) * 100; }); return out; }
  if (ind.f === "dd") { c.forEach((v, i) => { const hi = Math.max(...c.slice(Math.max(0, i - n + 1), i + 1)); out[i] = (v / hi - 1) * 100; }); return out; }
  if (ind.f === "vol") { c.forEach((v, i) => { if (i < n) return; const rs = []; for (let k = i - n + 1; k <= i; k++) rs.push(Math.log(c[k] / c[k - 1])); const m = rs.reduce((a, b) => a + b, 0) / n; out[i] = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / n) * Math.sqrt(252) * 100; }); return out; }
  if (ind.f === "rsi") { let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], up = Math.max(0, d), dn = Math.max(0, -d); if (i <= n) { g += up / n; l += dn / n; if (i === n) out[i] = l ? 100 - 100 / (1 + g / l) : 100; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = l ? 100 - 100 / (1 + g / l) : 100; } } return out; }
  return out;
}

export async function runBacktest(spec, chart) {
  const syms = [...new Set((spec.syms || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 5);
  if (!syms.length) throw new Error("종목이 없어요");
  const start = /^\d{4}-\d{2}-\d{2}$/.test(spec.start || "") ? spec.start : kstDay(new Date(Date.now() - 3652 * 864e5));
  const end = /^\d{4}-\d{2}-\d{2}$/.test(spec.end || "") ? spec.end : kstDay();
  const bench = spec.bench || (syms.some((s) => /\.K[SQ]$|\^KS|\^KQ/.test(s)) ? "^KS11" : "^GSPC");
  const extra = new Set(); const walk = (cs) => (cs || []).forEach((c) => [c.l, c.r].forEach((x) => x?.s && extra.add(x.s)));
  walk(spec.entry); walk(spec.exit);
  const all = [...new Set([...syms, bench, ...extra])];
  const got = await Promise.all(all.map((s) => chart(s, "max").catch(() => null)));
  const D = {}; all.forEach((s, i) => { if (got[i]?.rows?.length) D[s] = got[i].rows; });
  const miss = syms.filter((s) => !D[s]); if (miss.length) throw new Error("시세를 못 받은 종목: " + miss.join(", "));
  // 공통 날짜: 첫 종목의 거래일 기준
  const days = D[syms[0]].map((r) => r.d).filter((d) => d >= start && d <= end);
  if (days.length < 30) throw new Error("기간이 너무 짧거나 그때 시세가 없어요");
  const at = (s, d) => { const rs = D[s]; let lo = 0, hi = rs.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rs[m].d <= d) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
  const cache = new Map(); const ind = (s, x) => { const key = s + JSON.stringify(x); if (!cache.has(key)) cache.set(key, indicator(D[x.s || s], x)); return cache.get(key); };
  const val = (s, x, d, back = 0) => { if (typeof x === "number") return x; if (!x || typeof x !== "object") return Number(x); const src = x.s || s, k = at(src, d) - back; if (k < 0) return null; return ind(s, x)[k]; };
  const test = (s, c, d) => { const a = val(s, c.l, d), b = val(s, c.r, d); if (a == null || b == null) return false; if (c.op === ">") return a > b; if (c.op === "<") return a < b; const a0 = val(s, c.l, d, 1), b0 = val(s, c.r, d, 1); if (a0 == null || b0 == null) return false; return c.op === "crossUp" ? a0 <= b0 && a > b : a0 >= b0 && a < b; };
  const px = (s, d) => { const k = at(s, d); return k >= 0 ? D[s][k].c : null; };

  const CAP = 100_000_000, FEE = 0.002; let cash = CAP; const pos = {}, trades = [], curve = [];
  const mode = spec.mode || "rule", W = spec.weights?.length === syms.length ? spec.weights : syms.map(() => 1 / syms.length);
  const buy = (s, d, won, why) => { const p = px(s, d); if (!p || won < 10000) return; won = Math.min(won, cash); const q = won / (1 + FEE) / p; cash -= won; const o = pos[s] || { q: 0, cost: 0, at: d }; o.q += q; o.cost += won; pos[s] = o; trades.push({ d, s, side: "매수", p: r2(p), why }); };
  const sell = (s, d, why) => { const o = pos[s], p = px(s, d); if (!o || !p) return; const got = o.q * p * (1 - FEE); cash += got; trades.push({ d, s, side: "매도", p: r2(p), pl: r2((got / o.cost - 1) * 100), why }); delete pos[s]; };
  days.forEach((d, i) => {
    if (mode === "hold" && i === 0) syms.forEach((s, k) => buy(s, d, CAP * W[k], "처음에 사서 계속 보유"));
    if (mode === "dca") { const day = +d.slice(8), prev = days[i - 1]; const first = !prev || prev.slice(0, 7) !== d.slice(0, 7); if (first && day >= 1) { const monthly = CAP / Math.max(1, Math.round(days.length / 21)); cash += 0; syms.forEach((s, k) => { const o = pos[s] || { q: 0, cost: 0, at: d }; const p = px(s, d); if (!p) return; const won = monthly * W[k]; o.q += won / (1 + FEE) / p; o.cost += won; pos[s] = o; }); trades.push({ d, s: syms.join(","), side: "적립", p: null, why: "매달 적립" }); } }
    if (mode === "rule") {
      syms.forEach((s) => {
        const o = pos[s];
        if (o) { const p = px(s, d), ch = (p * o.q) / o.cost * 100 - 100, held = days.indexOf(d) - days.indexOf(o.at);
          if (spec.stop != null && ch <= spec.stop) return sell(s, d, `손절 ${r2(ch, 1)}%`);
          if (spec.take != null && ch >= spec.take) return sell(s, d, `익절 ${r2(ch, 1)}%`);
          if (spec.maxDays && held >= spec.maxDays) return sell(s, d, `${spec.maxDays}일 보유`);
          if ((spec.exit || []).some((c) => test(s, c, d))) return sell(s, d, "매도 조건"); }
        else if ((spec.entry || []).length && spec.entry.every((c) => test(s, c, d))) { const free = syms.filter((x) => !pos[x]).length; buy(s, d, cash / Math.max(1, free), "매수 조건"); }
      });
    }
    const invested = mode === "dca" ? Object.values(pos).reduce((t, o) => t + o.cost, 0) : CAP;
    const v = cash * (mode === "dca" ? 0 : 1) + Object.entries(pos).reduce((t, [s, o]) => t + o.q * (px(s, d) || 0), 0);
    curve.push([d, mode === "dca" ? (invested ? (v / invested) * CAP : CAP) : v]);
  });
  // 비교: 벤치마크를 처음에 사서 보유
  const b0 = px(bench, days[0]), bc = days.map((d) => [d, b0 ? (px(bench, d) / b0) * CAP : null]);
  const stats = (cv) => { const v = cv.map((x) => x[1]).filter((x) => x != null); if (v.length < 2) return null; let pk = v[0], mdd = 0; v.forEach((x) => { pk = Math.max(pk, x); mdd = Math.min(mdd, x / pk - 1); }); const yrs = (Date.parse(cv.at(-1)[0]) - Date.parse(cv[0][0])) / 864e5 / 365.25; return { ret: r2((v.at(-1) / v[0] - 1) * 100), cagr: r2(((v.at(-1) / v[0]) ** (1 / Math.max(yrs, 0.1)) - 1) * 100), mdd: r2(mdd * 100) }; };
  const sells = trades.filter((t) => t.side === "매도");
  const step = Math.max(1, Math.floor(curve.length / 400));
  return {
    syms, bench, start: days[0], end: days.at(-1), mode,
    me: { ...stats(curve), trades: trades.length, wins: sells.filter((t) => t.pl > 0).length, losses: sells.filter((t) => t.pl <= 0).length },
    bm: stats(bc),
    curve: curve.filter((_, i) => i % step === 0 || i === curve.length - 1).map(([d, v]) => [d, Math.round(v)]),
    bcurve: bc.filter((_, i) => i % step === 0 || i === bc.length - 1).map(([d, v]) => [d, v && Math.round(v)]),
    trades: trades.slice(-60).reverse(), nTrades: trades.length,
  };
}

// ── 질문 하나 처리: 질문/백테스트 판단 → 답 또는 계산+풀이
export async function studyAsk(text, chart, ctx = "") {
  text = String(text || "").trim().slice(0, 2000); if (!text) throw new Error("빈 질문");
  const first = await ask(`너는 한국 개인투자자 '이현'의 주식 공부 선생님이야. 이현이 아래처럼 물었어.
"${text}"

${ctx ? `참고(오늘 시장 정리): ${ctx}\n` : ""}
이게 '과거 데이터로 전략을 시험해 보자(백테스트)'는 요청이면 규칙 JSON으로 바꾸고, 그냥 질문이면 바로 답해.
${SPEC_HELP}

JSON 하나만:
백테스트면 {"kind":"bt","title":"짧은 제목","spec":{...},"plain":"이 규칙을 쉬운 말로 한두 문장 (내가 어떻게 해석했는지)"}
질문이면 {"kind":"qa","title":"짧은 제목","answer":"마크다운 답 (쉬운 한국어, 숫자는 아는 것만, 모르면 모른다고, 필요하면 표·목록)","tags":["주제 2~4개"]}`, 4000);
  const o = pickJson(first); if (!o?.kind) throw new Error("답을 못 만들었어요");
  const id = Date.now().toString(36), rec = { id, q: text, kind: o.kind, title: o.title || text.slice(0, 30), at: Date.now() };
  if (o.kind === "qa") { rec.answer = o.answer || ""; rec.tags = o.tags || []; }
  else {
    rec.spec = o.spec; rec.plain = o.plain || "";
    try { rec.bt = await runBacktest(o.spec || {}, chart); }
    catch (e) { rec.err = String(e?.message || e); }
    if (rec.bt) {
      const b = rec.bt;
      rec.answer = await ask(`이현이 "${text}" 를 백테스트해 달라고 했고, 이렇게 해석해서 계산했어: ${rec.plain}
규칙: ${JSON.stringify(o.spec)}
기간 ${b.start} ~ ${b.end}, 1억 원 시작, 수수료 0.2%
결과: 총수익 ${b.me.ret}%, 연평균 ${b.me.cagr}%, 최대 낙폭 ${b.me.mdd}%, 거래 ${b.nTrades}번 (이익 ${b.me.wins} / 손해 ${b.me.losses})
비교(${b.bench} 그냥 보유): 총수익 ${b.bm?.ret}%, 연평균 ${b.bm?.cagr}%, 최대 낙폭 ${b.bm?.mdd}%
최근 매매: ${b.trades.slice(0, 12).map((t) => `${t.d} ${t.s} ${t.side}${t.pl != null ? ` ${t.pl}%` : ""} (${t.why})`).join(" / ")}

쉬운 한국어 마크다운으로 풀이해 줘: 1) 한 줄 결론 2) 잘된 점·안된 점 (숫자로) 3) 왜 그런 결과가 났을지 4) 이 백테스트의 한계 (과최적화, 생존 편향, 세금·슬리피지 빠짐 등 해당되는 것만) 5) 더 해볼 만한 변형 2~3개. 투자 권유가 아니라 공부용이라는 톤.`, 2500);
    } else rec.answer = `계산하지 못했어요: ${rec.err}`;
  }
  rec.msgs = [{ role: "user", content: text }, { role: "assistant", content: rec.answer }];
  await redis([["SET", "stk:study:" + id, JSON.stringify(rec)], ["LPUSH", "stk:study", id], ["LTRIM", "stk:study", 0, 499]]);
  return rec;
}

// 같은 기록에 이어서 묻기
export async function studyFollow(id, text) {
  const [c] = await redis([["GET", "stk:study:" + id]]); const rec = json(c); if (!rec) throw new Error("기록이 없어요");
  text = String(text || "").trim().slice(0, 1500); if (!text) throw new Error("빈 질문");
  const sys = `이전 맥락: 이현의 주식 공부 기록 "${rec.title}". ${rec.bt ? `백테스트 규칙 ${JSON.stringify(rec.spec)}, 결과 총수익 ${rec.bt.me.ret}% / 비교 ${rec.bt.bm?.ret}% / 최대 낙폭 ${rec.bt.me.mdd}%.` : ""} 쉬운 한국어 마크다운으로 답해. 새 백테스트가 필요하면 '새로 물어보기 칸에 이렇게 써 보세요: ...' 하고 문장을 제안해.`;
  const msgs = [{ role: "user", content: sys + "\n\n" + rec.msgs[0].content }, ...rec.msgs.slice(1), { role: "user", content: text }];
  const ans = await ask(msgs, 2500);
  rec.msgs.push({ role: "user", content: text }, { role: "assistant", content: ans }); rec.msgs = rec.msgs.slice(0, 41);
  await redis([["SET", "stk:study:" + id, JSON.stringify(rec)]]);
  return rec;
}
export async function studyList() {
  const [ids] = await redis([["LRANGE", "stk:study", 0, 199]]);
  const list = Array.isArray(ids) ? [...new Set(ids)] : [];
  const vals = list.length ? await redis(list.map((i) => ["GET", "stk:study:" + i])) : [];
  return { list: vals.map(json).filter(Boolean) };
}
export async function studyDel(id) { await redis([["DEL", "stk:study:" + id], ["LREM", "stk:study", 0, id]]); return studyList(); }
