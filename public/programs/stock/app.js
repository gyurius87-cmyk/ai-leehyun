// 주식 스승실 (이현님 전용, /api/market 사용)
const $ = (id) => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const uid = () => Math.random().toString(36).slice(2, 12);
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "-" : Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const won = (v) => (v == null ? "-" : Math.round(v).toLocaleString("ko-KR"));
const eok = (v) => (v == null ? "-" : (v / 1e8).toFixed(2) + "억");
const pct = (v, abs) => (v == null ? "-" : `${v > 0 ? "+" : ""}${fmt(v, 2)}${abs ? "" : "%"}`);
const ud = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");

let adminKey = (() => { try { return localStorage.getItem("ai-admin-key") || ""; } catch { return ""; } })();
async function api(q, body) {
  const r = await fetch("/api/market" + (q ? "?" + q : ""), body ? { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify(body) } : { headers: { "x-admin-key": adminKey } });
  if (r.status === 401) { gate(); throw new Error("auth"); }
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "fail"); return j;
}
function gate() { $("gate").hidden = false; $("tabs").hidden = true; ["dash", "masters", "acct", "review"].forEach((t) => ($(t).hidden = true)); }
$("keyForm").onsubmit = (e) => { e.preventDefault(); adminKey = $("keyIn").value.trim(); try { localStorage.setItem("ai-admin-key", adminKey); } catch {} boot(); };

// ── 대가 얼굴 (실제 사진 대신 특징을 살린 그림)
const LOOK = {
  buffett: { skin: "#f2c9a8", hair: "#e9e9e9", style: "side", glasses: "big", brow: "#d9d9d9", extra: "tie", tie: "#9b2335" },
  lynch: { skin: "#f4cdb0", hair: "#f1f1f1", style: "mop", glasses: "", brow: "#ddd", extra: "tie", tie: "#2f5d9e" },
  oneil: { skin: "#efc4a0", hair: "#8a8a8a", style: "thin", glasses: "rim", brow: "#666", extra: "tie", tie: "#3b3b3b" },
  livermore: { skin: "#eec3a1", hair: "#2a2a2a", style: "slick", glasses: "", brow: "#2a2a2a", extra: "bow", tie: "#111" },
  dalio: { skin: "#eec4a4", hair: "#b9b9b9", style: "bald", glasses: "", brow: "#999", extra: "open", tie: "" },
  druckenmiller: { skin: "#f0c7a6", hair: "#a7a7a7", style: "short", glasses: "rim", brow: "#888", extra: "open", tie: "" },
  kostolany: { skin: "#ecc09c", hair: "#cfcfcf", style: "bald", glasses: "round", brow: "#bbb", extra: "cigar", tie: "#6b3e26" },
};
function face(id) {
  const L = LOOK[id] || LOOK.buffett;
  const hair = { side: `<path d="M24 40c0-16 10-24 26-24s26 8 26 22c-6-8-14-10-26-10-8 0-18 4-26 12z" fill="${L.hair}"/>`, mop: `<path d="M22 44c-2-20 10-30 28-30s30 10 28 30c-4-10-12-16-28-16S26 34 22 44z" fill="${L.hair}"/><path d="M30 30c8-4 24-6 34 2" stroke="${L.hair}" stroke-width="6" fill="none"/>`, thin: `<path d="M26 40c2-14 12-20 24-20s22 6 24 20c-6-6-14-8-24-8s-18 2-24 8z" fill="${L.hair}"/>`, slick: `<path d="M24 42c0-18 12-26 26-26s26 8 26 26c-4-10-12-14-26-14s-22 4-26 14z" fill="${L.hair}"/><path d="M32 24l26 4" stroke="#555" stroke-width="2"/>`, bald: `<path d="M23 50c0-8 2-12 5-14M77 50c0-8-2-12-5-14" stroke="${L.hair}" stroke-width="6" fill="none" stroke-linecap="round"/>`, short: `<path d="M25 42c0-16 11-24 25-24s25 8 25 24c-5-8-13-11-25-11s-20 3-25 11z" fill="${L.hair}"/>` }[L.style];
  const gl = { big: `<rect x="31" y="45" width="15" height="12" rx="3" fill="none" stroke="#222" stroke-width="2.4"/><rect x="54" y="45" width="15" height="12" rx="3" fill="none" stroke="#222" stroke-width="2.4"/><path d="M46 50h8" stroke="#222" stroke-width="2"/>`, rim: `<rect x="32" y="46" width="14" height="9" rx="2" fill="none" stroke="#444" stroke-width="1.8"/><rect x="54" y="46" width="14" height="9" rx="2" fill="none" stroke="#444" stroke-width="1.8"/><path d="M46 50h8" stroke="#444" stroke-width="1.6"/>`, round: `<circle cx="39" cy="51" r="7" fill="none" stroke="#333" stroke-width="2"/><circle cx="61" cy="51" r="7" fill="none" stroke="#333" stroke-width="2"/><path d="M46 51h8" stroke="#333" stroke-width="1.8"/>`, "": "" }[L.glasses];
  const body = L.extra === "tie" ? `<path d="M18 100c2-14 14-20 32-20s30 6 32 20z" fill="#2d3340"/><path d="M44 80l6 4 6-4-6 18z" fill="${L.tie}"/><path d="M42 80l8 6 8-6" fill="#fff"/>`
    : L.extra === "bow" ? `<path d="M18 100c2-14 14-20 32-20s30 6 32 20z" fill="#1d1d1d"/><path d="M44 80l6 4 6-4-6 14z" fill="#fff"/><path d="M42 82l8 3-8 4zM58 82l-8 3 8 4z" fill="${L.tie}"/>`
    : L.extra === "cigar" ? `<path d="M18 100c2-14 14-20 32-20s30 6 32 20z" fill="#5b4636"/><path d="M44 80l6 4 6-4-6 16z" fill="${L.tie}"/>`
    : `<path d="M18 100c2-14 14-20 32-20s30 6 32 20z" fill="#3c5a78"/><path d="M42 80l8 8 8-8" fill="#fff"/>`;
  const cigar = L.extra === "cigar" ? `<rect x="54" y="66" width="18" height="4" rx="2" fill="#7a4a25" transform="rotate(12 54 66)"/><circle cx="72" cy="71" r="2" fill="#ff8a3d"/>` : "";
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="var(--soft)"/>${body}<rect x="44" y="70" width="12" height="10" fill="${L.skin}"/><ellipse cx="50" cy="50" rx="25" ry="27" fill="${L.skin}"/><ellipse cx="25" cy="52" rx="4" ry="6" fill="${L.skin}"/><ellipse cx="75" cy="52" rx="4" ry="6" fill="${L.skin}"/>${hair}<path d="M33 43q6-3 11 0M56 43q5-3 11 0" stroke="${L.brow}" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="39" cy="51" r="2.2" fill="#2a2a2a"/><circle cx="61" cy="51" r="2.2" fill="#2a2a2a"/>${gl}<path d="M49 54q-3 6 1 8" stroke="#c99a7c" stroke-width="1.6" fill="none"/><path d="M42 66q8 5 16 0" stroke="#8a4f3d" stroke-width="2.2" fill="none" stroke-linecap="round"/>${cigar}</svg>`;
}

// ── 작은 차트
function line(cnv, vals, opt = {}) {
  const r = cnv.getBoundingClientRect(), dpr = devicePixelRatio || 1, W = Math.max(50, r.width), H = r.height || 36;
  cnv.width = W * dpr; cnv.height = H * dpr; const x = cnv.getContext("2d"); x.scale(dpr, dpr); x.clearRect(0, 0, W, H);
  const v = vals.filter((a) => a != null); if (v.length < 2) return;
  const series = opt.multi || [{ vals, color: opt.color }];
  const all = series.flatMap((s) => s.vals.filter((a) => a != null)), lo = Math.min(...all), hi = Math.max(...all), pad = opt.pad || 2;
  const X = (i, n) => pad + (i / (n - 1)) * (W - pad * 2), Y = (a) => H - pad - ((a - lo) / (hi - lo || 1)) * (H - pad * 2);
  if (opt.base != null && opt.base >= lo && opt.base <= hi) { x.strokeStyle = getComputedStyle(document.body).getPropertyValue("--line"); x.setLineDash([3, 3]); x.beginPath(); x.moveTo(0, Y(opt.base)); x.lineTo(W, Y(opt.base)); x.stroke(); x.setLineDash([]); }
  series.forEach((s) => { x.strokeStyle = s.color || "#888"; x.lineWidth = s.w || 1.6; x.beginPath(); s.vals.forEach((a, i) => { if (a == null) return; i ? x.lineTo(X(i, s.vals.length), Y(a)) : x.moveTo(X(i, s.vals.length), Y(a)); }); x.stroke(); });
  if (opt.mark != null) { const i = opt.mark, a = vals[i]; if (a != null) { x.fillStyle = opt.markColor || "#f2b632"; x.beginPath(); x.arc(X(i, vals.length), Y(a), 5, 0, 7); x.fill(); } }
}
const css = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();

// ── 탭
function showTab(t) { ls.set("stk-tab", t); $$("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tab === t)); ["dash", "masters", "acct", "review"].forEach((x) => ($(x).hidden = x !== t)); if (t === "masters") loadMasters(); if (t === "acct") renderAcct(); if (t === "review") renderTrades(); }
$("tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); };

let SNAP = null, NEWS = null, BRIEF = null, BT = null, INFO = [], ACCT = { hold: [], cash: 0, cashUsd: 0 }, TRADES = [], Q = {}, FX = 1400;
async function boot() {
  if (!adminKey) return gate();
  $("gate").hidden = true; $("tabs").hidden = false;
  showTab(ls.get("stk-tab", "dash"));
  api("op=snap").then((j) => { SNAP = j; renderSnap(); }).catch(() => ($("idx").innerHTML = `<p class="msg no">시세를 못 불러왔어요.</p>`));
  api("op=news").then((j) => { NEWS = j; renderNews(); }).catch(() => {});
  loadBrief();
  api("op=acct").then((j) => { ACCT = { cash: 0, cashUsd: 0, ...j.acct }; TRADES = j.trades || []; if (!$("acct").hidden) renderAcct(); if (!$("review").hidden) renderTrades(); }).catch(() => {});
}

// ── 시세
function renderSnap() {
  const s = SNAP; $("snapAt").textContent = `${new Date(s.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준`;
  $("tape").innerHTML = [...s.indices, ...s.macro.filter((m) => ["^TNX", "KRW=X", "^VIX", "CL=F"].includes(m.s))].filter((m) => !m.err).map((m) => `<span><b>${esc(m.n)}</b><span class="num">${fmt(m.v, m.v > 1000 ? 0 : 2)}</span> <span class="${ud(m.d1)}">${pct(m.d1, m.abs)}</span></span>`).join("");
  $("idx").innerHTML = s.indices.map((m, i) => m.err ? `<div class="card"><div class="k">${esc(m.n)}</div><p class="note">못 불러왔어요</p></div>` : `<div class="card"><div class="k"><span>${esc(m.n)}</span><span class="num">${m.d}</span></div><div class="v">${fmt(m.v, 2)}</div><div class="c"><span class="${ud(m.d1)}">하루 ${pct(m.d1)}</span><span class="${ud(m.w1)}">1주 ${pct(m.w1)}</span><span class="${ud(m.m1)}">1달 ${pct(m.m1)}</span><span>고점 ${pct(m.fromHi)}</span></div><canvas data-sp="i${i}"></canvas></div>`).join("");
  const groups = [...new Set(s.macro.map((m) => m.g))];
  $("mac").innerHTML = groups.map((g) => `<div class="grp">${esc(g)}</div><div class="grid mac">${s.macro.map((m, i) => [m, i]).filter(([m]) => m.g === g).map(([m, i]) => m.err ? `<div class="card"><div class="k">${esc(m.n)}</div><p class="note" style="margin:0">못 불러왔어요</p></div>` : `<div class="card"><div class="k"><span>${esc(m.n)}</span><span class="num">${m.d}</span></div><div class="v">${fmt(m.v, m.v > 1000 ? 0 : 2)}${esc(m.u === "$" ? "" : m.u)}</div><div class="c"><span class="${ud(m.d1)}">${m.abs ? "직전 대비" : "하루"} ${pct(m.d1, m.abs)}</span>${m.w1 != null ? `<span class="${ud(m.w1)}">1주 ${pct(m.w1)}</span>` : ""}${m.m1 != null ? `<span class="${ud(m.m1)}">1달 ${pct(m.m1)}</span>` : ""}</div><canvas data-sp="m${i}"></canvas><div class="why">${esc(m.why)}</div></div>`).join("")}</div>`).join("");
  requestAnimationFrame(() => $$("[data-sp]").forEach((c) => { const k = c.dataset.sp, m = k[0] === "i" ? s.indices[+k.slice(1)] : s.macro[+k.slice(1)]; if (m?.sp) line(c, m.sp, { color: (m.sp.at(-1) >= m.sp[0]) ? css("--up") : css("--down") }); }));
}
let NF = "all";
function renderNews() {
  const it = NEWS.items.filter((x) => NF === "all" || x.lang === NF);
  $("newsAt").textContent = `${it.length}건 · ${new Date(NEWS.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 모음`;
  $("news").innerHTML = it.map((x) => `<a href="${esc(x.link)}" target="_blank" rel="noopener"><span class="src">${esc(x.src)}</span><span>${esc(x.title)}</span><span class="t">${x.at ? new Date(x.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span></a>`).join("") || `<p class="note">아직 모은 기사가 없어요.</p>`;
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-nf]"); if (!b) return; NF = b.dataset.nf; $$("[data-nf]").forEach((x) => x.setAttribute("aria-pressed", x === b)); if (NEWS) renderNews(); });

// ── 오늘의 정리
async function loadBrief(d, force) {
  $("brief").innerHTML = `<p class="note">${force ? "AI가 다시 정리하는 중… (30초~1분)" : "불러오는 중… 오늘 첫 정리면 AI가 만드느라 30초~1분 걸려요."}</p>`;
  try { BRIEF = await api(`op=brief${d ? "&d=" + d : ""}${force ? "&force=1" : ""}`); renderBrief(); }
  catch (e) { $("brief").innerHTML = `<p class="msg no">${e.message === "busy" ? "AI가 바빠요. 잠시 뒤 '다시 정리'를 눌러 주세요." : "정리를 못 만들었어요. '다시 정리'를 눌러 주세요."}</p>`; }
}
function renderBrief() {
  const b = BRIEF;
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  $("bPick").innerHTML = [...new Set([today, ...(b.list || [])])].map((d) => `<option ${d === b.day ? "selected" : ""}>${d}</option>`).join("");
  $("bRe").hidden = b.day && b.day !== today;
  if (b.err) { $("brief").innerHTML = `<p class="msg no">${b.err === "no_key" ? "AI 키가 없어 정리를 못 만들어요." : "이 날짜 정리가 없어요."}</p>`; return; }
  $("bDay").textContent = `${b.day} · ${new Date(b.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 정리`;
  const li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join("");
  $("brief").innerHTML = `<div class="hl">${esc(b.headline)}</div>
    <div class="two"><div><h3>🇺🇸 미국</h3><div>${esc(b.us?.move)}</div><ul>${li(b.us?.why)}</ul></div><div><h3>🇰🇷 한국</h3><div>${esc(b.kr?.move)}</div><ul>${li(b.kr?.why)}</ul></div></div>
    <div class="two"><div><h3>매크로 포인트</h3><ul>${li(b.macro)}</ul></div><div><h3>전문가·기관이 한 말 <span class="note">헤드라인 기준</span></h3><ul>${(b.experts || []).map((x) => `<li><b>${esc(x.who)}</b> <span class="note">${esc(x.src)}</span> · ${esc(x.said)}</li>`).join("") || "<li class='note'>오늘 헤드라인에서 찾은 발언이 없어요.</li>"}</ul></div></div>
    <div class="verdict"><div class="row"><b>그래서 오늘은</b> <span class="stance ${esc(b.verdict?.stance)}">${esc(b.verdict?.stance)}</span></div><div style="margin-top:4px">${esc(b.verdict?.summary)}</div>${b.verdict?.watch?.length ? `<div class="note" style="margin-top:6px">지켜볼 것: ${b.verdict.watch.map(esc).join(" · ")}</div>` : ""}<div class="note" style="margin-top:6px;font-size:12px">공부용 정리예요. 투자 판단과 책임은 이현님에게 있어요.</div></div>`;
  renderMsToday();
}
$("bPick").onchange = () => loadBrief($("bPick").value);
$("bRe").onclick = () => loadBrief("", true);
function renderMsToday() {
  const said = Object.fromEntries((BRIEF?.masters || []).map((m) => [m.id, m]));
  const names = { buffett: "워런 버핏", lynch: "피터 린치", oneil: "윌리엄 오닐", livermore: "제시 리버모어", dalio: "레이 달리오", druckenmiller: "스탠리 드러켄밀러", kostolany: "앙드레 코스톨라니" };
  $("msToday").innerHTML = Object.keys(LOOK).map((id) => { const m = said[id]; return `<button type="button" class="mcard" data-goto="${id}">${face(id)}<span class="nm">${names[id]} ${m ? `<span class="mood ${esc(m.mood)}">${esc(m.mood)}</span>` : ""}</span><span class="note" style="margin:0">${m ? esc(m.todo || "") : "정리를 기다려요"}</span><span class="say">${m ? esc(m.say) : ""}</span></button>`; }).join("");
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-goto]"); if (!b) return; ls.set("stk-m", b.dataset.goto); showTab("masters"); });

// ── 대가 모의 매매
async function loadMasters(force) {
  if (BT && !force) return renderMasters();
  $("msRank").innerHTML = `<p class="note">2025년 1월부터 매일 매매를 다시 계산하는 중… (처음엔 20초쯤)</p>`;
  try { const j = await api("op=masters" + (force ? "&force=1" : "")); BT = j; INFO = j.info; renderMasters(); } catch { $("msRank").innerHTML = `<p class="msg no">못 불러왔어요. 새로고침해 주세요.</p>`; }
}
function renderMasters() {
  const sel = ls.get("stk-m", "buffett"), list = INFO.map((m) => ({ ...m, ...BT.masters[m.id] })).sort((a, b) => b.ret - a.ret);
  $("btInfo").textContent = `${BT.start} ~ ${BT.upto} · 각자 1억 원 · 종가 체결 · 수수료·세금 0.2%`;
  $("msRank").innerHTML = list.map((m, k) => `<button type="button" class="mcard" data-mm="${m.id}" aria-pressed="${m.id === sel}">${face(m.id)}<span class="nm">${k + 1}위 ${esc(m.name)}</span><span class="rt"><b class="${ud(m.ret)}">${pct(m.ret)}</b> · ${eok(m.value)} · 최대낙폭 ${pct(m.mdd)}</span><span class="say note" style="margin:0">${esc(m.style)}</span></button>`).join("");
  $("bench").textContent = "같은 기간 그냥 들고 있었다면: " + Object.entries(BT.bench || {}).map(([k, v]) => `${k} ${pct(v)}`).join(" · ");
  renderMaster(sel);
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-mm]"); if (!b) return; ls.set("stk-m", b.dataset.mm); $$("[data-mm]").forEach((x) => x.setAttribute("aria-pressed", x === b)); renderMaster(b.dataset.mm); });
function renderMaster(id) {
  const info = INFO.find((m) => m.id === id), m = BT.masters[id]; if (!info || !m) return;
  const said = (BRIEF?.masters || []).find((x) => x.id === id);
  $("mDetail").innerHTML = `<div class="prof">${face(id)}<div><h2 style="margin:0">${esc(info.name)} <span>${esc(info.style)}</span></h2>
      <div class="row" style="margin-top:4px"><span class="big ${ud(m.ret)}">${pct(m.ret)}</span><span class="num">${won(m.value)}원</span><span class="note">현금 ${won(m.cash)}원 · 매매 ${m.nTrades}번 · 최대낙폭 ${pct(m.mdd)}</span></div>
      <p class="note" style="margin:6px 0 0"><b>매매 원칙</b> ${esc(info.rule)}</p>${said ? `<p style="margin:6px 0 0">💬 <b>오늘</b> <span class="mood ${esc(said.mood)}">${esc(said.mood)}</span> ${esc(said.say)}</p>` : ""}</div></div>
    <h3 style="margin-top:14px">계좌 흐름 <span class="note">회색 점선 = 1억</span></h3><canvas class="eq" id="eq"></canvas>
    <h3 style="margin-top:14px">지금 들고 있는 것</h3><div class="tw"><table><thead><tr><th>종목</th><th class="r">평단</th><th class="r">현재가</th><th class="r">평가액(원)</th><th class="r">손익</th><th>산 날</th></tr></thead><tbody>${m.hold.map((h) => `<tr><td>${esc(h.n)}</td><td class="r">${fmt(h.b)}</td><td class="r">${fmt(h.p)}</td><td class="r">${won(h.won)}</td><td class="r ${ud(h.pl)}">${pct(h.pl)}</td><td class="num">${h.since}</td></tr>`).join("") || `<tr><td colspan="6" class="note">전부 현금이에요.</td></tr>`}</tbody></table></div>
    <h3 style="margin-top:14px">매매 일지 <span class="note">${esc(info.name)}에 빙의해서 쓴 이유 · 최근 순</span></h3><div class="tw"><table><thead><tr><th>날짜</th><th>종목</th><th></th><th class="r">가격</th><th class="r">금액(원)</th><th class="r">손익(원)</th><th>이유</th></tr></thead><tbody>${m.trades.map((t) => `<tr><td class="num">${t.d}</td><td>${esc(t.n)}</td><td><span class="chip ${t.side}">${t.side}</span></td><td class="r">${fmt(t.p)}</td><td class="r">${won(t.won)}</td><td class="r ${ud(t.pl)}">${t.pl != null ? won(t.pl) : ""}</td><td style="min-width:240px">${esc(t.why)}</td></tr>`).join("")}</tbody></table></div>`;
  requestAnimationFrame(() => line($("eq"), m.curve.map((c) => c[1]), { color: css("--amber"), base: 1e8, pad: 6 }));
}

// ── 내 계좌
let KW = null;
async function renderKw() {
  if (!KW) KW = await api("op=kw").catch(() => ({}));
  const on = KW.key && KW.proxy, at = ACCT.kwAt ? new Date(ACCT.kwAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  $("kwBox").innerHTML = on ? `<span class="note" style="margin:0">키움 연결됨${at ? ` · 마지막 ${at}` : ""} · 매일 아침 자동으로 받아요</span><button type="button" class="btn y s" data-kw="7">키움에서 지금 받기</button><button type="button" class="btn g s" data-kw="90">최근 90일 체결 한 번에</button><button type="button" class="btn g s" data-kwip="1">나가는 IP 확인</button>`
    : `<span class="note" style="margin:0">키움 자동 연결 준비 중: Vercel에 ${[!KW.key && "KIWOOM_APPKEY · KIWOOM_SECRETKEY", !KW.proxy && "OUTBOUND_PROXY_URL"].filter(Boolean).join(", ")} 를 넣으면 켜져요.</span>${KW.proxy ? `<button type="button" class="btn g s" data-kwip="1">나가는 IP 확인</button>` : ""}`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-kw],[data-kwip]"); if (!b) return;
  const m = $("acctMsg"); b.disabled = true;
  if (b.dataset.kwip) { try { const j = await api("op=kwip"); m.textContent = `사이트가 키움으로 나가는 IP: ${j.ip} (키움에 등록한 IP와 같아야 해요)`; } catch { m.textContent = "프록시로 나가지 못했어요. OUTBOUND_PROXY_URL 값을 확인해 주세요."; } b.disabled = false; return; }
  m.textContent = `키움에서 받는 중… (${b.dataset.kw === "90" ? "1분쯤" : "10초쯤"})`;
  try { const j = await api("", { op: "kwsync", days: +b.dataset.kw }); const a = await api("op=acct"); ACCT = { cash: 0, cashUsd: 0, ...a.acct }; TRADES = a.trades || []; m.textContent = `받았어요. 보유 ${j.hold}종목, 새 체결 ${j.added}건.`; renderAcct(); }
  catch (err) { m.textContent = "키움에서 못 받았어요. IP 등록(키움)과 프록시 허용 목록(api.kiwoom.com)을 확인해 주세요."; }
  b.disabled = false;
});
async function renderAcct() {
  renderKw();
  $("cash").value = ACCT.cash || ""; $("cashUsd").value = ACCT.cashUsd || "";
  const syms = ACCT.hold.map((h) => h.sym);
  if (syms.length) try { const j = await api("op=quote&s=" + encodeURIComponent(syms.join(","))); Q = j.q; FX = j.fx || FX; } catch {}
  let tot = (+ACCT.cash || 0) + (+ACCT.cashUsd || 0) * FX, buy = 0, today = 0;
  const rows = ACCT.hold.map((h, i) => { const q = Q[h.sym], k = h.cur === "USD" ? FX : 1, p = q?.p, v = p != null ? p * h.qty * k : null, cost = h.avg * h.qty * k; if (v != null) { tot += v; today += (p - (q.prev || p)) * h.qty * k; } buy += cost; return { h, i, p, v, cost, pl: v != null && cost ? (v / cost - 1) * 100 : null }; });
  const stockV = rows.reduce((t, r) => t + (r.v || 0), 0);
  $("hold").innerHTML = rows.map(({ h, i, p, v, pl }) => `<tr><td><b>${esc(h.name || h.sym)}</b><br><span class="note num">${esc(h.sym)}</span></td><td class="r">${fmt(h.qty, h.qty % 1 ? 4 : 0)}</td><td class="r">${fmt(h.avg, h.cur === "USD" ? 2 : 0)}</td><td class="r">${p != null ? fmt(p, h.cur === "USD" ? 2 : 0) : "-"}</td><td class="r">${won(v)}</td><td class="r ${ud(pl)}">${pct(pl)}</td><td class="r">${v && tot ? fmt((v / tot) * 100, 1) + "%" : "-"}</td><td><button type="button" class="btn g s" data-hdel="${i}" aria-label="빼기">✕</button></td></tr>`).join("") || `<tr><td colspan="8" class="note">아래에서 보유 종목을 더해 주세요.</td></tr>`;
  const plAll = buy ? (stockV / buy - 1) * 100 : null;
  $("acctSum").innerHTML = `<div class="card" style="flex:1 1 180px"><div class="k">총 자산</div><div class="v">${won(tot)}원</div></div><div class="card" style="flex:1 1 180px"><div class="k">주식 손익</div><div class="v ${ud(plAll)}">${won(stockV - buy)}원</div><div class="c"><span class="${ud(plAll)}">${pct(plAll)}</span></div></div><div class="card" style="flex:1 1 180px"><div class="k">오늘 변동</div><div class="v ${ud(today)}">${won(today)}원</div><div class="c"><span>환율 ${fmt(FX, 1)}원</span></div></div>`;
}
$("holdAdd").onsubmit = async (e) => {
  e.preventDefault(); const raw = $("hSym").value.trim(); if (!raw) return; $("acctMsg").textContent = "종목 찾는 중…";
  try { const r = await api("op=sym&s=" + encodeURIComponent(raw)); ACCT.hold.push({ sym: r.sym, name: r.name, qty: +$("hQty").value || 0, avg: +$("hAvg").value || 0, cur: r.cur === "KRW" ? "KRW" : "USD" }); $("hSym").value = $("hQty").value = $("hAvg").value = ""; $("acctMsg").textContent = `${r.name || r.sym} 더했어요. '저장'을 눌러 주세요.`; renderAcct(); }
  catch { $("acctMsg").textContent = "그 코드로 종목을 못 찾았어요. 한국은 6자리 숫자, 미국은 AAPL처럼 적어 주세요."; }
};
document.addEventListener("click", (e) => { const b = e.target.closest("[data-hdel]"); if (!b) return; ACCT.hold.splice(+b.dataset.hdel, 1); renderAcct(); $("acctMsg").textContent = "'저장'을 눌러야 반영돼요."; });
$("acctSave").onclick = async () => { ACCT.cash = +$("cash").value || 0; ACCT.cashUsd = +$("cashUsd").value || 0; try { const j = await api("", { op: "acct", acct: ACCT }); ACCT = j.acct; $("acctMsg").textContent = "저장했어요."; renderAcct(); } catch { $("acctMsg").textContent = "저장하지 못했어요."; } };

// ── 복기
const saveTrades = () => api("", { op: "trades", trades: TRADES });
let selT = null;
function renderTrades() {
  TRADES.sort((a, b) => b.date.localeCompare(a.date));
  const n = TRADES.length, rv = TRADES.filter((t) => t.rv).length;
  $("tSum").textContent = n ? `${n}건 · 복기 ${rv}건` : "";
  $("trades").innerHTML = TRADES.map((t) => `<tr class="trow${t.id === selT ? " sel" : ""}" data-tid="${t.id}"><td class="num">${t.date}</td><td>${esc(t.name || t.sym)}</td><td><span class="chip ${t.side}">${t.side}</span></td><td class="r">${fmt(t.price, t.price % 1 ? 2 : 0)}</td><td class="r">${fmt(t.qty, t.qty % 1 ? 4 : 0)}</td><td class="r">${t.rv ? `<b>${esc(t.rv.grade)}</b>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="note">키움 체결내역을 올리거나 직접 적어 주세요.</td></tr>`;
}
$("tAdd").onsubmit = async (e) => {
  e.preventDefault(); const raw = $("tSym").value.trim(); if (!raw || !$("tDate").value) return;
  let r = null; try { r = await api("op=sym&s=" + encodeURIComponent(raw)); } catch {}
  TRADES.push({ id: uid(), date: $("tDate").value, sym: r?.sym || raw, name: r?.name || raw, side: $("tSide").value, price: +$("tPrice").value || 0, qty: +$("tQty").value || 0, memo: "", feel: "" });
  $("tSym").value = $("tPrice").value = $("tQty").value = ""; renderTrades(); saveTrades().catch(() => {});
};
document.addEventListener("click", (e) => { const r = e.target.closest("[data-tid]"); if (!r) return; selT = r.dataset.tid; renderTrades(); renderTrade(); });
async function renderTrade() {
  const t = TRADES.find((x) => x.id === selT); if (!t) return;
  const box = $("tDetail");
  box.innerHTML = `<h2 style="margin:0">${esc(t.name || t.sym)} <span class="chip ${t.side}">${t.side}</span> <span class="num">${t.date}</span></h2>
    <p class="note num" style="margin:4px 0 0">${esc(t.sym)} · ${fmt(t.price, t.price % 1 ? 2 : 0)} × ${fmt(t.qty, t.qty % 1 ? 4 : 0)}</p>
    <canvas class="eq" id="tChart" style="height:200px;margin-top:8px"></canvas><p class="note" id="tAfter" style="margin:4px 0 0"></p>
    <div class="row" style="margin-top:8px"><label class="note">그때 기분 <select id="tFeel"><option value="">-</option>${["확신", "불안", "조급", "욕심", "공포", "덤덤", "충동"].map((f) => `<option ${t.feel === f ? "selected" : ""}>${f}</option>`).join("")}</select></label></div>
    <textarea id="tMemo" rows="3" placeholder="왜 샀는지/팔았는지, 그때 본 뉴스나 차트" style="margin-top:6px">${esc(t.memo)}</textarea>
    <div class="row" style="margin-top:6px"><input id="tSymFix" value="${esc(t.sym)}" style="width:120px" aria-label="종목코드"><button type="button" class="btn y s" id="tRv">AI 복기</button><button type="button" class="btn g s" id="tDel">이 기록 지우기</button><span class="msg" id="tMsg" style="margin:0"></span></div>
    <div id="tRvBox" style="margin-top:10px"></div>`;
  renderRv(t);
  try {
    const g = await api(`op=chart&s=${encodeURIComponent(t.sym)}&r=5y`);
    const k = Math.max(0, g.rows.findIndex((r) => r.d >= t.date)), part = g.rows.slice(Math.max(0, k - 60), k + 61), mi = Math.min(60, k);
    line($("tChart"), part.map((r) => r.c), { color: css("--ink"), mark: mi, markColor: t.side === "매수" ? css("--up") : css("--down"), pad: 8 });
    const p0 = g.rows[k]?.c; $("tAfter").textContent = `앞뒤 60거래일 · 점이 매매한 날 · 그 뒤 ` + [5, 20, 60].map((n) => (g.rows[k + n] ? `${n}일 ${pct((g.rows[k + n].c / p0 - 1) * 100)}` : `${n}일 -`)).join(" · ");
  } catch { $("tAfter").textContent = "차트를 못 불러왔어요. 종목코드를 고쳐 주세요(한국 6자리, 미국 AAPL)."; }
}
function renderRv(t) {
  const r = t.rv; if (!r) { $("tRvBox").innerHTML = ""; return; }
  $("tRvBox").innerHTML = `<div class="row"><span class="grade">${esc(r.grade)}</span><span class="note">${esc(r.after || "")}</span></div><p style="margin:4px 0"><b>잘한 점</b> ${esc(r.good)}</p><p style="margin:4px 0"><b>아쉬운 점</b> ${esc(r.miss)}</p><p style="margin:4px 0"><b>교훈</b> ${esc(r.lesson)}</p>${(r.masters || []).map((m) => `<p style="margin:4px 0">💬 <b>${esc(m.name)}</b> ${esc(m.say)}</p>`).join("")}<p class="note" style="font-size:12px">대가들 말은 AI가 그 원칙으로 풀어본 것이에요.</p>`;
}
$("tDetail").addEventListener("change", (e) => { const t = TRADES.find((x) => x.id === selT); if (!t) return; if (e.target.id === "tMemo") t.memo = e.target.value; if (e.target.id === "tFeel") t.feel = e.target.value; if (e.target.id === "tSymFix" && e.target.value.trim()) { (async () => { try { const r = await api("op=sym&s=" + encodeURIComponent(e.target.value.trim())); t.sym = r.sym; t.name = r.name || t.name; } catch { t.sym = e.target.value.trim(); } saveTrades().catch(() => {}); renderTrades(); renderTrade(); })(); return; } saveTrades().catch(() => {}); });
$("tDetail").addEventListener("click", async (e) => {
  const t = TRADES.find((x) => x.id === selT); if (!t) return;
  if (e.target.id === "tDel") { if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "한 번 더 누르면 지워요"; return; } TRADES = TRADES.filter((x) => x !== t); selT = null; saveTrades().catch(() => {}); renderTrades(); $("tDetail").innerHTML = `<p class="note">지웠어요.</p>`; }
  if (e.target.id === "tRv") { t.memo = $("tMemo").value; t.feel = $("tFeel").value; e.target.disabled = true; $("tMsg").textContent = "AI가 복기하는 중… (20초쯤)"; try { const r = await api("", { op: "review", t }); if (r.err) throw new Error(r.err); t.rv = r; await saveTrades(); $("tMsg").textContent = ""; renderRv(t); renderTrades(); } catch { $("tMsg").textContent = "복기를 못 했어요. 종목코드가 맞는지 보고 다시 눌러 주세요."; } e.target.disabled = false; }
});
// 키움 영웅문 체결내역 엑셀 → 매매 기록
const pickFile = (drop, input, fn) => { input.onchange = () => input.files[0] && fn(input.files[0]); ["dragover", "dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" && e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]); })); };
pickFile($("xlsDrop"), $("xlsIn"), async (file) => {
  const m = $("xlsMsg"); m.className = "msg"; m.textContent = "읽는 중…";
  try {
    if (!window.XLSX) throw new Error("lib");
    const buf = await file.arrayBuffer(); let wb;
    if (/\.csv$/i.test(file.name)) { let txt; try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { txt = new TextDecoder("euc-kr").decode(buf); } wb = XLSX.read(txt.replace(/^\uFEFF/, ""), { type: "string", raw: true }); } // 키움 CSV는 한글 인코딩(EUC-KR)일 때가 많아요
    else wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sh = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: "" });
    const hi = rows.findIndex((r) => r.some((c) => /종목/.test(c)) && r.some((c) => /체결|매매|구분|단가|수량/.test(c))); if (hi < 0) throw new Error("head");
    const H = rows[hi].map((c) => String(c).replace(/\s/g, "")), col = (re) => H.findIndex((c) => re.test(c));
    const cD = col(/체결일|주문일|매매일|일자|날짜/), cN = col(/종목명/), cC = col(/종목코드|코드/), cS = col(/매매구분|구분|매도수|매수도/), cP = col(/체결단가|체결가|단가|평균가/), cQ = col(/체결수량|수량/);
    if (cN < 0 && cC < 0) throw new Error("head");
    const day = (v) => { const s = String(v).replace(/[^\d]/g, ""); return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ""; };
    const num = (v) => +String(v).replace(/[^\d.-]/g, "") || 0;
    let lastD = "", add = 0, skip = 0; const seen = new Set(TRADES.map((t) => [t.date, t.name, t.side, t.price, t.qty].join("|")));
    for (const r of rows.slice(hi + 1)) {
      const d = cD >= 0 ? day(r[cD]) || lastD : lastD; if (d) lastD = d;
      const name = cN >= 0 ? String(r[cN]).trim() : "", code = cC >= 0 ? String(r[cC]).trim().replace(/^A/, "") : "", sideRaw = cS >= 0 ? String(r[cS]) : "";
      const side = /매도/.test(sideRaw) ? "매도" : /매수/.test(sideRaw) ? "매수" : ""; const price = cP >= 0 ? num(r[cP]) : 0, qty = cQ >= 0 ? num(r[cQ]) : 0;
      if (!d || (!name && !code) || !side || !qty) continue;
      const key = [d, name || code, side, price, qty].join("|"); if (seen.has(key)) { skip++; continue; } seen.add(key);
      TRADES.push({ id: uid(), date: d, sym: /^\d{6}$/.test(code) ? code + ".KS" : code || "", name: name || code, side, price, qty, memo: "", feel: "" }); add++;
    }
    await saveTrades(); renderTrades();
    m.textContent = `${add}건을 더했어요${skip ? ` (이미 있는 ${skip}건은 건너뜀)` : ""}. 종목코드가 비어 있으면 매매를 눌러 코드를 적어 주세요.`;
  } catch (e) { m.className = "msg no"; m.textContent = e.message === "head" ? "체결내역 표의 머리줄(종목명·매매구분·체결단가·체결수량)을 못 찾았어요. 영웅문에서 '체결내역'을 엑셀로 저장해 올려 주세요." : "파일을 못 읽었어요."; }
});

boot();
