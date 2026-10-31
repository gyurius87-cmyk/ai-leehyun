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
function gate() { $("gate").hidden = false; $("tabs").hidden = true; ["dash", "chart", "macro", "masters", "famous", "yt", "soc", "acct", "review", "db", "study"].forEach((t) => ($(t).hidden = true)); }
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
  if (id === "zero") return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="var(--soft)"/><path d="M18 100c2-14 14-20 32-20s30 6 32 20z" fill="#1c2027"/><path d="M50 14v8" stroke="#f2b632" stroke-width="3"/><circle cx="50" cy="12" r="4" fill="#f2b632"/><rect x="24" y="24" width="52" height="50" rx="14" fill="#2b313c"/><rect x="30" y="34" width="40" height="22" rx="8" fill="#0f1217"/><circle cx="41" cy="45" r="5" fill="#f2b632"/><circle cx="59" cy="45" r="5" fill="#f2b632"/><path d="M40 64q10 5 20 0" stroke="#f2b632" stroke-width="2.6" fill="none" stroke-linecap="round"/><rect x="18" y="42" width="6" height="14" rx="3" fill="#2b313c"/><rect x="76" y="42" width="6" height="14" rx="3" fill="#2b313c"/><text x="50" y="94" text-anchor="middle" font-size="10" font-family="monospace" fill="#f2b632">0</text></svg>`;
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
function showTab(t) { ls.set("stk-tab", t); $$("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tab === t)); ["dash", "chart", "macro", "masters", "famous", "yt", "soc", "acct", "review", "db", "study"].forEach((x) => ($(x).hidden = x !== t)); if (t === "db") loadDb(); if (t === "study") loadStudy(); if (t === "chart") window.openChartTab?.(); if (t === "macro") loadWorld(); if (t === "masters") loadMasters(); if (t === "famous") loadFam(); if (t === "yt") loadYt(); if (t === "soc") loadSoc(); if (t === "acct") renderAcct(); if (t === "review") { renderTrades(); renderKwRv(); } }
$("tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); };

let SNAP = null, NEWS = null, BRIEF = null, BT = null, INFO = [], ACCT = { hold: [], cash: 0, cashUsd: 0 }, TRADES = [], Q = {}, FX = 1400;
async function boot() {
  if (!adminKey) return gate();
  $("gate").hidden = true; $("tabs").hidden = false;
  showTab(ls.get("stk-tab", "dash"));
  api("op=snap").then((j) => { SNAP = j; renderSnap(); }).catch(() => ($("idx").innerHTML = `<p class="msg no">시세를 못 불러왔어요.</p>`));
  api("op=news").then((j) => { NEWS = j; renderNews(); }).catch(() => {});
  loadBrief();
  api("op=acct").then((j) => { ACCT = { cash: 0, cashUsd: 0, ...j.acct }; TRADES = j.trades || []; if (!$("acct").hidden) renderAcct(); if (!$("review").hidden) { renderTrades(); renderKwRv(); } }).catch(() => {});
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
let MV = ls.get("stk-mview", "all");
function renderMNav() {
  $("mNav").innerHTML = `<button type="button" class="dash" data-mv="all" aria-pressed="${MV === "all"}">대가 대시보드</button>` + INFO.map((m) => { const r = BT.masters[m.id]?.ret; return `<button type="button" data-mv="${m.id}" aria-pressed="${MV === m.id}">${face(m.id)}${esc(m.name)} <b class="num ${MV === m.id ? "" : ud(r)}">${pct(r)}</b></button>`; }).join("");
  $("mAll").hidden = MV !== "all"; $("mOne").hidden = MV === "all";
}
function setMV(v) { MV = v; ls.set("stk-mview", v); renderMNav(); if (v === "all") renderAll(); else { renderMaster(v); scrollTo({ top: $("masters").offsetTop - 10, behavior: "smooth" }); } }
document.addEventListener("click", (e) => { const b = e.target.closest("[data-mv]"); if (b) setMV(b.dataset.mv); });
function renderMasters() {
  const sel = MV, list = INFO.map((m) => ({ ...m, ...BT.masters[m.id] })).sort((a, b) => b.ret - a.ret);
  $("btInfo").textContent = `${BT.start} ~ ${BT.upto} · 각자 1억 원 · 종가 체결 · 수수료·세금 0.2%`;
  $("msRank").innerHTML = list.map((m, k) => `<button type="button" class="mcard" data-mm="${m.id}" aria-pressed="${m.id === sel}">${face(m.id)}<span class="nm">${k + 1}위 ${esc(m.name)}</span><span class="rt"><b class="${ud(m.ret)}">${pct(m.ret)}</b> · ${eok(m.value)} · 최대낙폭 ${pct(m.mdd)}</span><span class="say note" style="margin:0">${esc(m.style)}</span></button>`).join("");
  $("bench").textContent = "같은 기간 그냥 들고 있었다면: " + Object.entries(BT.bench || {}).map(([k, v]) => `${k} ${pct(v)}`).join(" · ");
  renderMNav(); if (MV === "all" || !BT.masters[MV]) { MV = "all"; renderMNav(); renderAll(); } else renderMaster(MV);
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-mm]"); if (b) setMV(b.dataset.mm); });
const hPl = (h) => (h.pl != null && h.pl > -100 ? Math.round(h.won - h.won / (1 + h.pl / 100)) : null);
function mAcctBox(m) {
  const stock = m.hold.reduce((a, h) => a + (h.won || 0), 0), unreal = m.hold.reduce((a, h) => a + (hPl(h) || 0), 0), real = m.realized ?? m.trades.reduce((a, t) => a + (t.pl || 0), 0), tot = m.value || stock + (m.cash || 0), gain = tot - 1e8;
  const c = (k, v, sub, cls = "") => `<div class="card" style="flex:1 1 150px"><div class="k">${k}</div><div class="v ${cls}">${v}</div>${sub ? `<div class="c">${sub}</div>` : ""}</div>`;
  return `<div class="row" style="gap:8px;align-items:stretch">${c("총 평가액", won(tot) + "원", `총 손익 <span class="${ud(gain)}">${gain >= 0 ? "+" : ""}${won(gain)}원 (${pct(m.ret)})</span>`)}${c("보유 주식", won(stock) + "원", `${m.hold.length}종목 · 비중 ${tot ? fmt((stock / tot) * 100, 1) : 0}%`)}${c("보유 평가손익", (unreal >= 0 ? "+" : "") + won(unreal) + "원", stock - unreal ? pct((unreal / (stock - unreal)) * 100) + " (산 값 대비)" : "", ud(unreal))}${c("실현 손익", (real >= 0 ? "+" : "") + won(real) + "원", "판 종목에서 확정된 돈", ud(real))}${c("현금", won(m.cash) + "원", `비중 ${tot ? fmt(((m.cash || 0) / tot) * 100, 1) : 0}%`)}</div>`;
}
function renderMaster(id) {
  const info = INFO.find((m) => m.id === id), m = BT.masters[id]; if (!info || !m) return;
  const said = (BRIEF?.masters || []).find((x) => x.id === id);
  $("mDetail").innerHTML = `<div class="prof">${face(id)}<div><h2 style="margin:0">${esc(info.name)} <span>${esc(info.style)}</span></h2>
      <div class="row" style="margin-top:4px"><span class="big ${ud(m.ret)}">${pct(m.ret)}</span><span class="num">${won(m.value)}원</span><span class="note">현금 ${won(m.cash)}원 · 매매 ${m.nTrades}번 · 최대낙폭 ${pct(m.mdd)}</span></div>
      <p class="note" style="margin:6px 0 0"><b>매매 원칙</b> ${esc(info.rule)}</p>${said ? `<p style="margin:6px 0 0">💬 <b>오늘</b> <span class="mood ${esc(said.mood)}">${esc(said.mood)}</span> ${esc(said.say)}</p>` : ""}</div></div>
    <div class="chat"><h3 style="margin:0;display:flex;gap:8px;align-items:center">${esc(info.name)}에게 물어보기 <span class="note">AI가 이 대가의 원칙으로 답해요</span><button type="button" class="btn g s" id="mcClear" style="margin-left:auto">대화 지우기</button></h3><div class="msgs" id="mcMsgs"><p class="note">불러오는 중…</p></div><form class="row" id="mcForm"><input id="mcIn" placeholder="예: 지금 반도체 사도 될까요?" style="flex:1 1 200px" autocomplete="off"><button class="btn y s">보내기</button></form></div>
    <div class="chat" style="background:var(--panel);border:1px solid var(--line)"><h3 style="margin:0">겹쳐 보기 <span class="note">계좌·지수·종목을 첫날 0%로 맞춰 비교 · 마우스를 올리면 그날 수익률 · ▲ 산 날 ▼ 판 날 · 이름을 눌러 켜고 끄기</span></h3>
      <div class="row" id="moCtl"></div><div id="moLeg"></div>
      <div style="position:relative"><canvas id="moCv" style="width:100%;height:340px;display:block;touch-action:none"></canvas><div class="tip" id="moTip" hidden></div></div></div>
    <h3 style="margin-top:14px">계좌 상황 <span class="note">시작 1억 원 · ${esc(BT.upto || "")} 종가 기준</span></h3>${mAcctBox(m)}
    <h3 style="margin-top:14px">지금 들고 있는 것</h3><div class="tw"><table><thead><tr><th>종목</th><th class="r">평단</th><th class="r">현재가</th><th class="r">평가액(원)</th><th class="r">손익(원)</th><th class="r">손익</th><th class="r">비중</th><th>산 날</th></tr></thead><tbody>${m.hold.map((h) => `<tr><td>${esc(h.n)}</td><td class="r">${fmt(h.b)}</td><td class="r">${fmt(h.p)}</td><td class="r">${won(h.won)}</td><td class="r ${ud(h.pl)}">${won(hPl(h))}</td><td class="r ${ud(h.pl)}">${pct(h.pl)}</td><td class="r">${m.value ? fmt((h.won / m.value) * 100, 1) + "%" : "-"}</td><td class="num">${h.since}</td></tr>`).join("") || `<tr><td colspan="8" class="note">전부 현금이에요.</td></tr>`}</tbody></table></div>
    <h3 style="margin-top:14px">매매 일지 <span class="note">${esc(info.name)}에 빙의해서 쓴 이유 · 최근 순</span></h3><div class="tw"><table><thead><tr><th>날짜</th><th>종목</th><th></th><th class="r">가격</th><th class="r">금액(원)</th><th class="r">손익(원)</th><th>이유</th></tr></thead><tbody>${m.trades.map((t) => `<tr><td class="num">${t.d}</td><td>${esc(t.n)}</td><td><span class="chip ${t.side}">${t.side}</span></td><td class="r">${fmt(t.p)}</td><td class="r">${won(t.won)}</td><td class="r ${ud(t.pl)}">${t.pl != null ? won(t.pl) : ""}</td><td style="min-width:240px">${esc(t.why)}</td></tr>`).join("")}</tbody></table></div>`;
  EQD = { days: m.curve.map((c) => c[0]), series: [{ s: id, label: info.name, vals: m.curve.map((c) => c[1]), color: css("--amber") }, { s: "base", label: "시작 1억", vals: m.curve.map(() => 1e8), color: css("--muted"), w: 1, dash: [4, 4], noDot: true, noTip: true }] };

  loadChat(id); MO.id = id; MO.on = null; drawMO();
}




// 모두의 계좌 흐름 + 공통점
const MCOL = { buffett: "#e8590c", lynch: "#2f9e44", oneil: "#1c7ed6", livermore: "#ae3ec9", dalio: "#0ca678", druckenmiller: "#d6336c", kostolany: "#a0522d", zero: "#f2b632" };
let ALLOFF = ls.get("stk-alloff", []), ALLD = null, allR = ls.get("stk-allr", "all"), allIv = ls.get("stk-alliv", "1d");
const ALLR = [["1w", "1주", 7], ["1m", "1달", 31], ["3m", "3달", 92], ["6m", "6달", 183], ["1y", "1년", 366], ["all", "전체", 1e5]];
const mName = (id) => INFO.find((m) => m.id === id)?.name || id;
const whoFaces = (ids) => `<span class="who">${ids.map((id) => `<span title="${esc(mName(id))}">${face(id)}</span>`).join("")}</span>`;
function renderAll() {
  const ids = INFO.map((m) => m.id), days0 = BT.masters[ids[0]]?.curve.map((c) => c[0]) || [];
  const cut = new Date(Date.parse(days0.at(-1) || Date.now()) - (ALLR.find((r) => r[0] === allR)?.[2] || 1e5) * 864e5).toISOString().slice(0, 10);
  // 기간 자르기 → 단위(일·주·월)로 묶기 → 첫날 0%
  const pick = resample(days0.filter((d) => d >= cut).map((d) => ({ d, c: 0 })), allIv).map((p) => p.d);
  const days = pick.length ? [days0[Math.max(0, days0.indexOf(pick[0]) - 1)], ...pick].filter((d, i, a) => a.indexOf(d) === i) : [];
  const ser = ids.filter((id) => BT.masters[id]).map((id) => { const m = new Map(BT.masters[id].curve), base = m.get(days[0]); return { s: id, label: mName(id), color: MCOL[id] || "#888", vals: days.map((d) => (m.has(d) && base ? (m.get(d) / base - 1) * 100 : null)) }; });
  $("allCtl").innerHTML = `<span class="note">기간</span>` + ALLR.map(([k, n]) => `<button type="button" class="pill" data-allr="${k}" aria-pressed="${k === allR}">${n}</button>`).join("") + `<span class="note" style="margin-left:8px">단위</span>` + IVS.map(([v, n]) => `<button type="button" class="pill" data-alliv="${v}" aria-pressed="${v === allIv}">${n}</button>`).join("");
  $("allLeg").innerHTML = ser.map((x) => { const on = !ALLOFF.includes(x.s), r = x.vals.at(-1); return `<span class="leg${on ? "" : " off"}"><button type="button" class="tg" data-allm="${x.s}" aria-pressed="${on}"><i style="background:${on ? x.color : "var(--line)"}"></i>${esc(x.label)} <b class="num ${ud(r)}">${pct(r2c(r ?? 0))}</b></button></span>`; }).sort((a, b) => 0).join("");
  ALLD = { days, series: ser.filter((x) => !ALLOFF.includes(x.s)) };
  requestAnimationFrame(() => paintChart($("allEq"), $("allTip"), ALLD, null, { pct: true }));
  const C = BT.common; if (!C) { $("common").innerHTML = `<p class="note">다음 모의 매매 계산 때 나와요.</p>`; return; }
  const avgExpo = C.now.filter((x) => x.expo != null), inMkt = avgExpo.filter((x) => x.expo >= 50).length;
  $("common").innerHTML = `<p style="margin:0 0 10px">지금 <b>${avgExpo.length}명 중 ${inMkt}명</b>이 주식을 절반 넘게 들고 있어요. ${avgExpo.sort((a, b) => b.expo - a.expo).map((x) => `${esc(mName(x.id))} ${x.expo}%`).join(" · ")}</p>
  <div class="cm3">
    <div><h3>같이 들고 있는 것</h3><ul>${C.hold.map((h) => `<li>${whoFaces(h.who.map((w) => w.id))} <b>${esc(h.n)}</b> <span class="note">${h.who.length}명 · ${h.who.map((w) => `${esc(mName(w.id))} <span class="${ud(w.pl)}">${pct(w.pl)}</span>`).join(", ")}</span></li>`).join("") || `<li class="note">지금 2명 이상 겹치는 종목이 없어요.</li>`}</ul></div>
    <div><h3>같은 주에 같은 행보</h3><ul>${C.moves.slice(0, 15).map((m) => `<li><span class="num note">${m.d.slice(2).replace(/-/g, ".")}</span> ${whoFaces(m.who)} <b>${esc(m.n)}</b> <span class="chip ${m.side}">${m.side}</span> <span class="note">${m.who.length}명 (${m.who.map(mName).join(", ")})</span></li>`).join("") || `<li class="note">아직 없어요.</li>`}</ul></div>
    <div><h3>한꺼번에 이탈 · 진입</h3><ul>${C.shifts.slice(0, 12).map((x) => `<li><span class="num note">${x.d.slice(2).replace(/-/g, ".")}</span> <b class="${x.kind === "이탈" ? "down" : "up"}">${x.who.length}명 ${x.kind}</b> ${whoFaces(x.who.map((w) => w.id))}<br><span class="note">${x.who.map((w) => `${esc(mName(w.id))} 주식 ${w.from}% → ${w.to}%`).join(" · ")}</span></li>`).join("") || `<li class="note">같은 주에 2명 이상이 주식 비중을 20%p 넘게 바꾼 적이 아직 없어요.</li>`}</ul></div>
  </div>`;
}
document.addEventListener("click", (e) => { const r = e.target.closest("[data-allr],[data-alliv]"); if (r) { if (r.dataset.allr) { allR = r.dataset.allr; ls.set("stk-allr", allR); } else { allIv = r.dataset.alliv; ls.set("stk-alliv", allIv); } renderAll(); } });
document.addEventListener("click", (e) => { const b = e.target.closest("[data-allm]"); if (!b) return; const id = b.dataset.allm; ALLOFF = ALLOFF.includes(id) ? ALLOFF.filter((x) => x !== id) : [...ALLOFF, id]; ls.set("stk-alloff", ALLOFF); renderAll(); });
document.addEventListener("pointermove", (e) => { if (e.target.id === "allEq") paintChart(e.target, $("allTip"), ALLD, e.clientX - e.target.getBoundingClientRect().left, { pct: true }); });
document.addEventListener("pointerout", (e) => { if (e.target.id === "allEq") paintChart(e.target, $("allTip"), ALLD, null, { pct: true }); });


// 대가 한 명 겹쳐 보기: 계좌 + 지수 + 들고 있는 종목(+최근 판 종목), 매수·매도 표시
const MO = { id: null, on: null, r: ls.get("stk-mor", "all"), D: null };
const MOR = [["3m", "3달", 92], ["6m", "6달", 183], ["1y", "1년", 366], ["all", "전체", 1e5]];
const MOIDX = [["^KS11", "코스피"], ["^KQ11", "코스닥"], ["^GSPC", "S&P 500"], ["^IXIC", "나스닥"], ["^SOX", "필라델피아 반도체"], ["^DJI", "다우"]];
async function drawMO() {
  const id = MO.id, m = BT.masters[id]; if (!m || !$("moCv")) return;
  const held = m.hold.map((h) => [h.s, h.n]), sold = [...new Map(m.trades.filter((t) => !m.hold.some((h) => h.s === t.s)).map((t) => [t.s, t.n])).entries()].slice(0, 12);
  const items = [["acct", "계좌", true, "a"], ...MOIDX.map(([s, n]) => [s, n, s === "^GSPC" || s === "^KS11", "i"]), ...held.map(([s, n]) => [s, n, true, "h"]), ...sold.map(([s, n]) => [s, n, false, "s"])];
  MO.items = items;
  if (!MO.on) MO.on = new Set(items.filter((x) => x[2]).map((x) => x[0]));
  const cols = ["#f2b632", "#868e96", "#495057", "#adb5bd", ...PAL.filter((c) => c !== "#f2b632")];
  const colOf = (s) => cols[items.findIndex((x) => x[0] === s) % cols.length];
  $("moCtl").innerHTML = `<span class="note">기간</span>` + MOR.map(([k, n]) => `<button type="button" class="pill" data-mor="${k}" aria-pressed="${k === MO.r}">${n}</button>`).join("");
  const chip = ([s, n]) => { const on = MO.on.has(s); return `<span class="leg${on ? "" : " off"}"><button type="button" class="tg" data-mo="${esc(s)}" aria-pressed="${on}"><i style="background:${on ? colOf(s) : "var(--line)"}"></i>${esc(n)} <b class="num" data-mov="${esc(s)}"></b></button></span>`; };
  const GR = [["a", "계좌"], ["i", "지수"], ["h", "지금 들고 있는 종목 (산 것)"], ["s", "팔았던 종목"]];
  $("moLeg").innerHTML = `<div class="mog-all"><button type="button" class="btn g s" data-mog="*" data-on="1">다 넣기</button><button type="button" class="btn g s" data-mog="*" data-on="0">다 빼기</button></div>` + GR.map(([g, t]) => { const its = items.filter((x) => x[3] === g); if (!its.length) return ""; const all = its.every((x) => MO.on.has(x[0])); return `<div class="mog"><div class="mogh"><b>${t}</b>${g === "a" ? "" : `<button type="button" class="pill" data-mog="${g}" data-on="${all ? 0 : 1}">${all ? "다 빼기" : g === "i" ? "지수 다 넣기" : "종목 다 넣기"}</button>`}</div><div class="row">${its.map(chip).join("")}</div></div>`; }).join("");
  const want = items.filter((x) => MO.on.has(x[0]) && x[0] !== "acct").map((x) => x[0]);
  const got = await Promise.all(want.map((s) => { const k = s + "|2y|1d"; if (!CHC[k]) CHC[k] = api(`op=chart&s=${encodeURIComponent(s)}&r=2y&i=1d`).then((g) => g.rows).catch(() => null); return CHC[k]; }));
  if (MO.id !== id) return;
  const last = m.curve.at(-1)[0], cut = new Date(Date.parse(last) - (MOR.find((r) => r[0] === MO.r)?.[2] || 1e5) * 864e5).toISOString().slice(0, 10), from = cut > BT.start ? cut : BT.start;
  const src = { acct: m.curve.map(([d, v]) => ({ d, c: v })) }; want.forEach((s, i) => (src[s] = got[i] || []));
  const days = [...new Set(Object.values(src).flatMap((rs) => rs.map((p) => p.d)))].filter((d) => d >= from && d <= last).sort();
  const series = Object.entries(src).filter(([s]) => MO.on.has(s)).map(([s, rs]) => { const mp = new Map(rs.map((p) => [p.d, p.c])); let lastV = null, base = null; const vals = days.map((d) => { if (mp.has(d)) lastV = mp.get(d); if (lastV == null) return null; base ??= lastV; return (lastV / base - 1) * 100; }); return { s, label: items.find((x) => x[0] === s)[1], vals, color: colOf(s), w: s === "acct" ? 3 : 1.8 }; });
  const marks = m.trades.filter((t) => t.d >= from && MO.on.has(t.s)).map((t) => ({ s: t.s, d: t.d, side: t.side, label: t.n }));
  MO.D = { days, series, marks }; paintChart($("moCv"), $("moTip"), MO.D, null, { pct: true, cross: true });
  series.forEach((x) => { const el = document.querySelector(`[data-mov="${CSS.escape(x.s)}"]`), v = x.vals.at(-1); if (el) { el.textContent = pct(v); el.className = "num " + ud(v); } });
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-mo],[data-mor],[data-mog]"); if (!b) return; if (b.dataset.mog) { const g = b.dataset.mog, on = b.dataset.on === "1"; (MO.items || []).filter((x) => g === "*" ? x[3] !== "a" : x[3] === g).forEach((x) => on ? MO.on.add(x[0]) : MO.on.delete(x[0])); } else if (b.dataset.mor) { MO.r = b.dataset.mor; ls.set("stk-mor", MO.r); } else { const s = b.dataset.mo; MO.on.has(s) ? MO.on.delete(s) : MO.on.add(s); } drawMO(); });
document.addEventListener("pointermove", (e) => { if (e.target.id === "moCv") paintChart(e.target, $("moTip"), MO.D, e.clientX - e.target.getBoundingClientRect().left, { pct: true, cross: true }); });
document.addEventListener("pointerout", (e) => { if (e.target.id === "moCv") paintChart(e.target, $("moTip"), MO.D, null, { pct: true, cross: true }); });

// 대가 채팅방
let MC = { id: null, hist: [] };
const mdText = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
function renderChat(pending) {
  const box = $("mcMsgs"); if (!box) return;
  box.innerHTML = MC.hist.map((m) => `<div class="bub ${m.role === "user" ? "me" : "them"}">${mdText(m.content)}</div>`).join("") + (pending ? `<div class="bub them note">생각하는 중…</div>` : "") || `<p class="note">궁금한 걸 물어보세요. 오늘 시장 정리, 이 대가의 모의 계좌, 내 보유 종목을 알고 답해요.</p>`;
  box.scrollTop = box.scrollHeight;
}
async function loadChat(id) { MC = { id, hist: [] }; try { const j = await api("op=mchat&id=" + id); if (MC.id === id) { MC.hist = j.hist; renderChat(); } } catch { renderChat(); } }
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "mcForm") return; e.preventDefault();
  const inp = $("mcIn"), t = inp.value.trim(), id = MC.id; if (!t || !id) return;
  inp.value = ""; MC.hist.push({ role: "user", content: t }); renderChat(true); inp.disabled = true;
  try { const j = await api("", { op: "mchat", id, text: t }); if (MC.id === id) { MC.hist = j.hist; renderChat(); } }
  catch { MC.hist.push({ role: "assistant", content: "(답을 못 받았어요. 다시 보내 주세요.)" }); renderChat(); }
  inp.disabled = false; inp.focus();
});
document.addEventListener("click", async (e) => { if (e.target.id !== "mcClear") return; if (e.target.dataset.sure !== "1") { e.target.dataset.sure = "1"; e.target.textContent = "한 번 더 누르면 지워요"; return; } await api("", { op: "mchat", id: MC.id, clear: 1 }).catch(() => {}); MC.hist = []; renderChat(); e.target.dataset.sure = ""; e.target.textContent = "대화 지우기"; });

// 대가 계좌 흐름 차트 (날짜·금액 축, 십자선)
let EQD = null;
const eqFmt = (v) => (v / 1e8).toFixed(Math.abs(v) >= 1e9 ? 1 : 2) + "억";
const paintEq = (hover) => paintChart($("eq"), $("eqTip"), EQD, hover, { fmt: eqFmt, cross: true, tipFmt: (v) => won(v) + "원 (" + pct((v / 1e8 - 1) * 100) + ")" });
document.addEventListener("pointermove", (e) => { if (e.target.id === "eq") paintEq(e.clientX - e.target.getBoundingClientRect().left); });
document.addEventListener("pointerout", (e) => { if (e.target.id === "eq") paintEq(); });

// ── 매크로: 세계 지수 표 + 겹쳐 보기
const PAL = ["#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f2b632", "#0ca678", "#d6336c", "#495057", "#5c7cfa", "#a9e34b"];
let WD = null, wReg = ls.get("stk-wreg", "전체"), wSort = null, STAR = ls.get("stk-star", []), MINE = ls.get("stk-mine", []);
// 겹쳐 보기 목록: CMPL = 목록(켜고 끌 수 있음), CMP = 지금 켜진 것
const REC = { "^KS11": "코스피", "^KQ11": "코스닥", "^GSPC": "S&P 500", "^IXIC": "나스닥", "^SOX": "필라델피아 반도체", "^DJI": "다우", "^N225": "닛케이 225", "^HSI": "홍콩 항셍", "000001.SS": "상해종합", "^GDAXI": "독일 DAX", "^TNX": "미국 10년물 금리", "DX-Y.NYB": "달러 인덱스", "KRW=X": "원/달러 환율", "^VIX": "VIX 공포지수", "GC=F": "금", "CL=F": "WTI 유가", "HG=F": "구리", "BTC-USD": "비트코인", "005930.KS": "삼성전자", "000660.KS": "SK하이닉스", "NVDA": "엔비디아", "AAPL": "애플", "MSFT": "마이크로소프트", "TSLA": "테슬라" };
const PRESETS = [
  ["한·미 대표 지수", ["^KS11", "^GSPC", "^IXIC"]], ["세계 증시 한판", ["^GSPC", "^KS11", "^N225", "^HSI", "^GDAXI"]], ["반도체 사이클", ["^SOX", "NVDA", "005930.KS", "000660.KS"]],
  ["금리 vs 성장주", ["^TNX", "^IXIC"]], ["달러 vs 한국 증시", ["DX-Y.NYB", "KRW=X", "^KS11"]], ["안전자산 vs 위험자산", ["GC=F", "BTC-USD", "^GSPC"]],
  ["공포와 주가", ["^VIX", "^GSPC"]], ["경기 신호 (구리·유가)", ["HG=F", "CL=F", "^GSPC"]], ["빅테크", ["AAPL", "MSFT", "NVDA", "TSLA"]],
];
let CMP = ls.get("stk-cmp", ["^KS11", "^GSPC", "^IXIC", "^N225"]), cmpR = ls.get("stk-cmpr", "1y"), IV = ls.get("stk-iv", "1d");
let CMPL = ls.get("stk-cmpl", null) || [...new Set([...CMP, "^SOX", "^TNX", "DX-Y.NYB", "KRW=X", "^VIX", "GC=F", "BTC-USD", "005930.KS", "NVDA"])];
const saveCmp = () => { ls.set("stk-cmp", CMP); ls.set("stk-cmpl", CMPL); };
const colorOf = (s) => PAL[Math.max(0, CMPL.indexOf(s)) % PAL.length];
const IVS = [["1d", "일"], ["1wk", "주"], ["1mo", "월"]];
const ivPills = (k) => `<span class="note" style="margin-left:8px">단위</span>` + IVS.map(([v, n]) => `<button type="button" class="pill" data-iv="${v}" aria-pressed="${v === IV}">${n}</button>`).join("");
const CHC = {}; // 차트 캐시 sym|range|단위 → rows
const REGS = ["전체", "★ 관심", "미국", "한국", "아시아", "유럽", "기타", "매크로"];
async function loadWorld(force) {
  renderCmpCtl(); drawCmp();
  if (!SNAP) { try { SNAP = await api("op=snap"); } catch {} }
  if (!$("big").children.length) renderBig();
  if (WD && !force) return renderWorld();
  try {
    const [w, sn] = await Promise.all([api("op=world&x=" + encodeURIComponent(MINE.join(",")) + (force ? "&force=1" : "")), SNAP ? Promise.resolve(SNAP) : api("op=snap")]);
    WD = { rows: [...w.mine, ...w.rows], macro: (sn.macro || []).map((m) => ({ ...m, r: "매크로" })), at: w.at };
    $("wAt").textContent = new Date(w.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) + " 기준";
    renderWorld(); renderCmpCtl(); drawCmp();
  } catch { $("wBody").innerHTML = `<tr><td colspan="12" class="note">못 불러왔어요. 잠시 뒤 다시 열어 주세요.</td></tr>`; }
}
const nameOf = (sym) => [...(WD?.rows || []), ...(WD?.macro || [])].find((r) => r.s === sym)?.n || REC[sym] || sym;
function renderWorld() {
  $("wReg").innerHTML = REGS.map((r) => `<button type="button" class="pill" data-wreg="${r}" aria-pressed="${r === wReg}">${r}</button>`).join("");
  const all = [...WD.rows, ...WD.macro];
  let list = wReg === "전체" ? all : wReg === "★ 관심" ? all.filter((r) => STAR.includes(r.s) || r.r === "내 관심") : all.filter((r) => r.r === wReg);
  const secs = wSort ? [["", [...list].sort((a, b) => wSort.k === "n" ? a.n.localeCompare(b.n) * wSort.d : ((b[wSort.k] ?? -1e9) - (a[wSort.k] ?? -1e9)) * wSort.d)]]
    : [...new Set(list.map((r) => (STAR.includes(r.s) ? "★ 관심" : r.r)))].sort((a, b) => (a === "★ 관심" ? -1 : b === "★ 관심" ? 1 : 0)).map((g) => [g, list.filter((r) => (STAR.includes(r.s) ? "★ 관심" : r.r) === g)]);
  const c = (v, abs) => `<td class="r ${ud(v)}">${pct(v, abs)}</td>`;
  $("wBody").innerHTML = secs.map(([g, rs]) => (g ? `<tr class="sec"><td colspan="12">${esc(g)}</td></tr>` : "") + rs.map((r) => {
    const can = !r.abs; // FRED 지표는 겹쳐 보기 불가
    return `<tr><td>${can ? `<button type="button" class="ic" data-cmp="${esc(r.s)}" aria-pressed="${CMP.includes(r.s)}" aria-label="겹쳐 보기">${CMP.includes(r.s) ? "☑" : "☐"}</button>` : ""}</td><td><button type="button" class="ic" data-star="${esc(r.s)}" aria-pressed="${STAR.includes(r.s)}" aria-label="관심">${STAR.includes(r.s) ? "★" : "☆"}</button></td>
      <td><b>${esc(r.n)}</b>${r.r === "내 관심" ? ` <button type="button" class="ic" data-mdel="${esc(r.s)}" aria-label="빼기">✕</button>` : ""}<br><span class="note num">${esc(r.s)}${r.d ? " · " + r.d.slice(5) : ""}</span></td>
      ${r.err ? `<td colspan="9" class="note">못 불러왔어요</td>` : `<td class="r">${fmt(r.v, r.v > 1000 ? 0 : 2)}${r.u && r.u !== "$" ? esc(r.u) : ""}</td>${c(r.d1, r.abs)}${c(r.w1)}${c(r.m1)}${c(r.m3)}${c(r.ytd)}${c(r.y1)}${c(r.fromHi)}<td><canvas data-wsp="${esc(r.s)}"></canvas></td>`}</tr>`;
  }).join("")).join("") || `<tr><td colspan="12" class="note">여기엔 아직 없어요. ☆을 눌러 관심에 넣어 보세요.</td></tr>`;
  $$("th[data-ws]").forEach((th) => { th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (wSort?.k === th.dataset.ws ? (wSort.d > 0 ? " ▼" : " ▲") : ""); });
  requestAnimationFrame(() => $$("[data-wsp]").forEach((cv) => { const r = all.find((x) => x.s === cv.dataset.wsp); if (r?.sp) line(cv, r.sp, { color: r.sp.at(-1) >= r.sp[0] ? css("--up") : css("--down") }); }));
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-wreg],[data-star],[data-cdel],[data-cmp],[data-mdel],th[data-ws],[data-cmpr],[data-preset],[data-iv]"); if (!t) return;
  if (t.dataset.wreg) { wReg = t.dataset.wreg; ls.set("stk-wreg", wReg); renderWorld(); }
  else if (t.dataset.star) { const s = t.dataset.star; STAR = STAR.includes(s) ? STAR.filter((x) => x !== s) : [...STAR, s]; ls.set("stk-star", STAR); renderWorld(); }
  else if (t.dataset.cmp) { const s = t.dataset.cmp; if (CMP.includes(s)) CMP = CMP.filter((x) => x !== s); else { CMP = [...CMP, s].slice(-10); if (!CMPL.includes(s)) CMPL.push(s); } saveCmp(); if (WD) renderWorld(); renderCmpCtl(); drawCmp(); }
  else if (t.dataset.cdel) { const s = t.dataset.cdel; CMPL = CMPL.filter((x) => x !== s); CMP = CMP.filter((x) => x !== s); saveCmp(); if (WD) renderWorld(); renderCmpCtl(); drawCmp(); }
  else if (t.dataset.mdel) { MINE = MINE.filter((x) => x !== t.dataset.mdel); ls.set("stk-mine", MINE); WD.rows = WD.rows.filter((r) => r.s !== t.dataset.mdel); renderWorld(); }
  else if (t.dataset.ws) { const k = t.dataset.ws; wSort = wSort?.k === k ? (wSort.d > 0 ? { k, d: -1 } : null) : { k, d: 1 }; renderWorld(); }
  else if (t.dataset.cmpr) { cmpR = t.dataset.cmpr; ls.set("stk-cmpr", cmpR); renderCmpCtl(); drawCmp(); }
  else if (t.dataset.preset) { const [, list] = PRESETS[+t.dataset.preset]; list.forEach((x) => { if (!CMPL.includes(x)) CMPL.push(x); }); CMP = [...list]; saveCmp(); if (WD) renderWorld(); renderCmpCtl(); drawCmp(); }
  else if (t.dataset.iv) { IV = t.dataset.iv; ls.set("stk-iv", IV); renderCmpCtl(); drawCmp(); renderBig(); }
});
$("wAdd").onsubmit = async (e) => {
  e.preventDefault(); const raw = $("wSym").value.trim(); if (!raw) return; $("wMsg").textContent = "찾는 중…";
  try { const r = await api("op=sym&s=" + encodeURIComponent(raw)); if (!MINE.includes(r.sym)) MINE.push(r.sym); ls.set("stk-mine", MINE); if (!STAR.includes(r.sym)) { STAR.push(r.sym); ls.set("stk-star", STAR); } $("wSym").value = ""; $("wMsg").textContent = `${r.name || r.sym} 더했어요.`; WD = null; loadWorld(); }
  catch { $("wMsg").textContent = "그 코드를 못 찾았어요. 야후 파이낸스 코드로 적어 주세요."; }
};
const RANGES = [["1mo", "1달"], ["3mo", "3달"], ["6mo", "6달"], ["1y", "1년"], ["2y", "2년"], ["5y", "5년"], ["10y", "10년"], ["max", "전체"]];
function renderCmpCtl() {
  $("cmpRange").innerHTML = RANGES.map(([k, n]) => `<button type="button" class="pill" data-cmpr="${k}" aria-pressed="${k === cmpR}">${n}</button>`).join("") + ivPills();
  $("cmpPre").innerHTML = `<span class="note">추천 묶음</span>` + PRESETS.map(([n], i) => `<button type="button" class="pill" data-preset="${i}">${esc(n)}</button>`).join("");
  $("cmpLeg").innerHTML = CMPL.map((s) => { const on = CMP.includes(s); return `<span class="leg${on ? "" : " off"}"><button type="button" class="tg" data-cmp="${esc(s)}" aria-pressed="${on}" title="켜기/끄기"><i style="background:${on ? colorOf(s) : "var(--line)"}"></i>${esc(nameOf(s))} <b class="num" data-lv="${esc(s)}"></b></button><button type="button" data-cdel="${esc(s)}" aria-label="목록에서 빼기">✕</button></span>`; }).join("") || `<span class="note">추천 묶음을 누르거나 아래 표에서 ☐를 눌러 더하세요.</span>`;
  const rest = Object.keys(REC).filter((s) => !CMPL.includes(s));
  $("cmpAdd").innerHTML = `<option value="">+ 추천 차트 더하기</option>` + rest.map((s) => `<option value="${esc(s)}">${esc(REC[s])}</option>`).join("");
}
let CMPD = null, EVT = null, EVTL = false;
// 차트에 찍을 큰 사건 (AI 정리 + 일별 DB)
let EVON = ls.get("stk-cmpev", true);
async function loadEvents(n = 0) { if (EVTL && !n) return; EVTL = true; try { const j = await api("op=events"); EVT = j.list || []; if (CMPD) { CMPD = { ...CMPD, events: EVON ? EVT : null }; paintCmp(); } evBtn(j.missing); if (j.missing && n < 3) loadEvents(n + 1); } catch { EVTL = false; } }
function evBtn(miss) { const b = $("cmpEv"); if (!b) return; b.setAttribute("aria-pressed", EVON); b.innerHTML = `<b style="color:var(--up)">●</b><b style="color:var(--down)">●</b> 큰 사건 ${EVON ? "켜짐" : "꺼짐"}${EVT ? ` <span class="note">${EVT.length}개${miss ? " · 더 만드는 중…" : ""}</span>` : ""}`; }
document.addEventListener("click", (e) => { if (!e.target.closest("#cmpEv")) return; EVON = !EVON; ls.set("stk-cmpev", EVON); evBtn(); if (CMPD) { CMPD = { ...CMPD, events: EVON ? EVT : null }; paintCmp(); } });
$("cmpAdd").onchange = (e) => { const s = e.target.value; if (!s) return; if (!CMPL.includes(s)) CMPL.push(s); if (!CMP.includes(s)) CMP = [...CMP, s].slice(-10); saveCmp(); renderCmpCtl(); drawCmp(); };
async function drawCmp() {
  const want = [...CMP], r = cmpR, iv = IV;
  const got = await Promise.all(want.map(async (s) => { const k = s + "|" + r + "|" + iv; if (!CHC[k]) CHC[k] = api(`op=chart&s=${encodeURIComponent(s)}&r=${r}&i=${iv}`).then((g) => g.rows).catch(() => null); return CHC[k]; }));
  if (r !== cmpR || iv !== IV || want.join() !== CMP.join()) return; // 그새 바뀜
  const days = [...new Set(got.flatMap((g) => (g || []).map((p) => p.d)))].sort();
  const series = got.map((g, i) => {
    if (!g?.length) return null; const m = new Map(g.map((p) => [p.d, p.c])); let last = null, base = null;
    const vals = days.map((d) => { if (m.has(d)) last = m.get(d); if (last == null) return null; if (base == null) base = last; return (last / base - 1) * 100; });
    return { s: want[i], vals, color: colorOf(want[i]) };
  }).filter(Boolean);
  CMPD = { days, series, events: EVON ? EVT : null }; paintCmp(); if (!EVT) loadEvents(); evBtn();
  series.forEach((x) => { const el = document.querySelector(`[data-lv="${CSS.escape(x.s)}"]`); const v = x.vals.at(-1); if (el) { el.textContent = pct(v); el.className = "num " + ud(v); } });
}
// 큰 차트 그리기 (D = {days, series:[{s, vals, color}]}, opt.pct면 % 축)
// 모든 큰 차트 공통: 휠 = 확대/축소, 끌기 = 옆으로 이동, 더블클릭 = 처음대로 (키움처럼)
function paintChart(cnv, tip, D, hover, opt = {}) {
  if (!cnv || !D) return;
  if (cnv._D !== D) { const same = cnv._D && cnv._D.days.length === D.days.length && cnv._D.days[0] === D.days[0]; cnv._D = D; if (!same) cnv._vw = null; }
  cnv._tip = tip; cnv._opt = opt;
  if (!cnv._zoomOn) zoomable(cnv);
  const n = D.days.length, v = cnv._vw || { a: 0, b: n - 1 };
  const a = Math.max(0, Math.min(v.a, n - 2)), b = Math.min(n - 1, Math.max(v.b, a + 1));
  const V = a === 0 && b === n - 1 ? D : { ...D, days: D.days.slice(a, b + 1), series: D.series.map((s) => ({ ...s, vals: s.vals.slice(a, b + 1) })), marks: (D.marks || []).filter((m) => m.d >= D.days[a] && m.d <= D.days[b]) };
  paintCore(cnv, tip, V, hover, opt, hover != null ? cnv._hy : null);
  if (cnv._hint) cnv._hint.hidden = a === 0 && b === n - 1;
}
function zoomable(cnv) {
  cnv._zoomOn = true; cnv.style.cursor = "crosshair"; cnv.style.touchAction = "pan-y";
  const W = () => cnv.getBoundingClientRect().width, redraw = (hx) => paintChart(cnv, cnv._tip, cnv._D, hx, cnv._opt);
  const view = () => cnv._vw || { a: 0, b: cnv._D.days.length - 1 };
  const hint = document.createElement("button"); hint.type = "button"; hint.className = "zreset"; hint.textContent = "전체 보기"; hint.hidden = true; hint.onclick = () => { cnv._vw = null; redraw(); };
  if (cnv.parentElement && getComputedStyle(cnv.parentElement).position === "static") cnv.parentElement.style.position = "relative";
  cnv.parentElement?.appendChild(hint); cnv._hint = hint;
  cnv.addEventListener("wheel", (e) => { if (!cnv._D) return; e.preventDefault(); const n = cnv._D.days.length, v = view(), span = v.b - v.a, f = (e.offsetX - 6) / Math.max(1, W() - 50), c = v.a + span * Math.max(0, Math.min(1, f)); let ns = Math.round(span * (e.deltaY > 0 ? 1.2 : 1 / 1.2)); if (ns === span) ns += e.deltaY > 0 ? 1 : -1; ns = Math.max(5, Math.min(n - 1, ns)); let na = Math.round(c - ns * f); na = Math.max(0, Math.min(n - 1 - ns, na)); cnv._vw = { a: na, b: na + ns }; redraw(e.offsetX); }, { passive: false });
  let drag = null;
  cnv.addEventListener("pointerdown", (e) => { if (!cnv._D || e.pointerType === "touch") return; drag = { x: e.clientX, v: view() }; cnv.setPointerCapture(e.pointerId); cnv.style.cursor = "grabbing"; });
  cnv.addEventListener("pointermove", (e) => { cnv._hy = e.offsetY; if (drag) { const n = cnv._D.days.length, span = drag.v.b - drag.v.a, sh = Math.round(((drag.x - e.clientX) / Math.max(1, W() - 50)) * span); const na = Math.max(0, Math.min(n - 1 - span, drag.v.a + sh)); cnv._vw = { a: na, b: na + span }; } redraw(e.offsetX); });
  const up = () => { drag = null; cnv.style.cursor = "crosshair"; };
  cnv.addEventListener("pointerup", up); cnv.addEventListener("pointercancel", up);
  cnv.addEventListener("pointerleave", () => { cnv._hy = null; if (!drag) redraw(); });
  cnv.addEventListener("dblclick", () => { cnv._vw = null; redraw(); });
}
function paintCore(cnv, tip, D, hover, opt = {}, hy = null) {
  if (!D || !cnv.offsetWidth) return;
  const r = cnv.getBoundingClientRect(), dpr = devicePixelRatio || 1, W = r.width, H = r.height; cnv.width = W * dpr; cnv.height = H * dpr;
  const x = cnv.getContext("2d"); x.scale(dpr, dpr); x.clearRect(0, 0, W, H);
  const all = D.series.flatMap((s) => s.vals.filter((v) => v != null)); if (!all.length) return;
  let lo = Math.min(...all, ...(opt.pct ? [0] : [])), hi = Math.max(...all, ...(opt.pct ? [0] : [])); const pd = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1; lo -= pd; hi += pd;
  const fy = opt.fmt || ((v) => (opt.pct ? (v > 0 ? "+" : "") + v + "%" : fmt(v, Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 1 : 2)));
  x.font = "11px " + css("--mono"); const R = Math.max(40, x.measureText(fy(hi)).width + 12), L = 6, T = 10, B = 22, n = D.days.length;
  const X = (i) => L + (i / Math.max(1, n - 1)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  x.fillStyle = css("--muted"); x.strokeStyle = css("--line"); x.lineWidth = 1;
  const raw = (hi - lo) / 5, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) { const v = +g.toPrecision(10), y = Y(v); x.setLineDash(opt.pct && v === 0 ? [] : [3, 3]); x.globalAlpha = opt.pct && v === 0 ? 1 : 0.6; x.beginPath(); x.moveTo(L, y); x.lineTo(W - R, y); x.stroke(); x.globalAlpha = 1; x.fillText(fy(v), W - R + 6, y + 4); }
  x.setLineDash([]);
  [0, Math.floor(n / 2), n - 1].forEach((i, k) => { const d = D.days[i]; if (!d) return; const tx = d.slice(2).replace(/-/g, "."), w = x.measureText(tx).width; x.fillText(tx, k === 0 ? L : k === 2 ? W - R - w : X(i) - w / 2, H - 6); });
  D.series.forEach((s) => { x.strokeStyle = s.color; x.lineWidth = s.w || 2; if (s.dash) x.setLineDash(s.dash); x.beginPath(); let on = false; s.vals.forEach((v, i) => { if (v == null) return; on ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); on = true; }); x.stroke(); x.setLineDash([]); });
  // 매수▲·매도▼ 표시
  if (D.marks?.length) { const di = new Map(D.days.map((d, i) => [d, i])); D.marks.forEach((m) => { const se = D.series.find((z) => z.s === m.s), i = di.get(m.d); if (!se || i == null || se.vals[i] == null) return; const px_ = X(i), py = Y(se.vals[i]); x.fillStyle = m.side === "매수" ? css("--up") : css("--down"); x.strokeStyle = css("--panel"); x.lineWidth = 1.5; x.beginPath(); if (m.side === "매수") { x.moveTo(px_, py + 4); x.lineTo(px_ - 6, py + 14); x.lineTo(px_ + 6, py + 14); } else { x.moveTo(px_, py - 4); x.lineTo(px_ - 6, py - 14); x.lineTo(px_ + 6, py - 14); } x.closePath(); x.fill(); x.stroke(); }); }
  // 큰 사건 동그라미: 좋음 빨강, 나쁨 파랑
  const EV = [];
  if (D.events?.length && n > 1) { const s0 = D.series.find((z) => z.vals.some((v) => v != null)); D.events.forEach((e) => { if (e.d < D.days[0] || e.d > D.days[n - 1]) return; let k = D.days.findIndex((d) => d >= e.d); if (k < 0) return; let v = s0?.vals[k]; for (let j = k; v == null && j >= 0; j--) v = s0?.vals[j]; const ex = X(k), ey = v != null ? Y(v) : T + 8; EV.push({ ...e, k, ex, ey }); });
    EV.forEach((e) => { x.fillStyle = e.g === "좋음" ? css("--up") : css("--down"); x.strokeStyle = css("--panel"); x.lineWidth = 2; x.beginPath(); x.arc(e.ex, e.ey, 6, 0, 7); x.fill(); x.stroke(); }); }
  if (hover == null) { if (tip) tip.hidden = true; return; }
  let i = Math.max(0, Math.min(n - 1, Math.round(((hover - L) / (W - L - R)) * (n - 1))));
  const near = EV.filter((e) => Math.abs(e.ex - hover) <= 7 && (hy == null || Math.abs(e.ey - hy) <= 14)); if (near.length) i = near[0].k;
  // 키움식 십자선: 세로는 그 날짜, 가로는 마우스 높이. 오른쪽에 그 값, 아래에 날짜
  const yy = hy != null && hy >= T && hy <= H - B ? hy : opt.cross && D.series[0].vals[i] != null ? Y(D.series[0].vals[i]) : null;
  x.strokeStyle = css("--muted"); x.lineWidth = 1; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(X(i), T); x.lineTo(X(i), H - B); x.stroke();
  if (yy != null) { x.beginPath(); x.moveTo(L, yy); x.lineTo(W - R, yy); x.stroke(); }
  x.setLineDash([]);
  if (yy != null) { const v = lo + (1 - (yy - T) / (H - T - B)) * (hi - lo), lb = fy(opt.pct ? Math.round(v * 100) / 100 : +v.toPrecision(6)), lw = x.measureText(lb).width + 8; x.fillStyle = css("--board"); x.fillRect(W - R + 2, yy - 9, lw, 18); x.fillStyle = css("--on-board"); x.fillText(lb, W - R + 6, yy + 4); }
  { const dl = D.days[i] + (hy != null ? " (" + "일월화수목금토"[new Date(D.days[i] + "T00:00:00Z").getUTCDay()] + ")" : ""), dw = x.measureText(dl).width + 8, dx = Math.min(W - R - dw, Math.max(L, X(i) - dw / 2)); x.fillStyle = css("--board"); x.fillRect(dx, H - B + 3, dw, 17); x.fillStyle = css("--on-board"); x.fillText(dl, dx + 4, H - 7); }
  D.series.forEach((s) => { const v = s.vals[i]; if (v == null || s.noDot) return; x.fillStyle = s.color; x.beginPath(); x.arc(X(i), Y(v), 3.5, 0, 7); x.fill(); });
  if (!tip) return;
  const evs = (D.marks || []).filter((m) => m.d === D.days[i] && D.series.some((z) => z.s === m.s));
  const evN = EV.filter((e) => e.k === i);
  tip.innerHTML = `<div>${D.days[i]}</div>` + evN.map((e) => `<div class="evt ${e.g === "좋음" ? "up" : "down"}"><b>${e.g === "좋음" ? "●" : "●"} ${esc(e.d.slice(2).replace(/-/g, "."))} ${esc(e.t)}</b><br><span>${esc(e.w)}</span></div>`).join("") + evs.map((m) => `<div><b class="${m.side === "매수" ? "up" : "down"}">${m.side === "매수" ? "▲" : "▼"} ${esc(m.label)} ${m.side}</b></div>`).join("") + D.series.filter((s) => !s.noTip).map((s) => [s, s.vals[i]]).sort((a, b) => (b[1] ?? -1e9) - (a[1] ?? -1e9)).map(([s, v]) => `<div><span style="color:${s.color}">●</span> ${esc(s.label || nameOf(s.s))} <span class="${opt.pct ? ud(v) : ""}">${opt.pct ? pct(v) : (opt.tipFmt || fy)(v)}</span></div>`).join("");
  tip.hidden = false; const tw = tip.offsetWidth; tip.style.left = Math.max(0, X(i) + 12 + tw > W ? X(i) - tw - 12 : X(i) + 12) + "px";
}
const paintCmp = (hover) => paintChart($("cmp"), $("cmpTip"), CMPD, hover, { pct: true });
$("cmp").addEventListener("pointermove", (e) => paintCmp(e.clientX - $("cmp").getBoundingClientRect().left));
$("cmp").addEventListener("pointerleave", () => paintCmp());
addEventListener("resize", () => { if (!$("macro").hidden) paintCmp(); });


// ── 대시보드 지표 크게 보기
let bigR = ls.get("stk-bigr", "1y"); const BIGD = {};
const FROM = { "3mo": 92, "6mo": 183, "1y": 366, "2y": 731, "5y": 1827, "10y": 3653, "max": 36500 };
// 주·월 단위로 묶기 (그 주·달의 마지막 값)
const resample = (rows, iv) => { if (iv === "1d") return rows; const key = (d) => (iv === "1mo" ? d.slice(0, 7) : (() => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); })()); const m = new Map(); rows.forEach((p) => m.set(key(p.d), p)); return [...m.values()]; };
async function rowsOf(m, r, iv) {
  const k = m.s + "|" + r + "|" + (m.abs ? "f" : iv);
  if (!CHC[k]) CHC[k] = (m.abs ? api(`op=fred&id=${encodeURIComponent(m.s)}&from=${new Date(Date.now() - (Math.min(FROM[r], 9000) + (m.yoy ? 400 : 0)) * 864e5).toISOString().slice(0, 10)}${m.yoy ? "&yoy=1" : ""}`) : api(`op=chart&s=${encodeURIComponent(m.s)}&r=${r}&i=${iv}`)).then((g) => g.rows).catch(() => null);
  const rows = await CHC[k]; return rows && m.abs ? resample(rows, iv) : rows;
}
function renderBig() {
  if (!SNAP) return;
  $("bigRange").innerHTML = RANGES.filter(([k]) => FROM[k]).map(([k, n]) => `<button type="button" class="pill" data-bigr="${k}" aria-pressed="${k === bigR}">${n}</button>`).join("") + ivPills();
  const items = [...SNAP.indices, ...SNAP.macro];
  $("big").innerHTML = items.map((m, i) => `<div class="card bigc"><div class="k"><b style="color:var(--ink)">${esc(m.n)}</b><span class="num" data-bigv="${i}"></span></div>${m.why ? `<div class="why">${esc(m.why)}</div>` : ""}<div style="position:relative"><canvas data-big="${i}"></canvas><div class="tip" data-bigtip="${i}" hidden></div></div></div>`).join("");
  items.forEach(async (m, i) => {
    const r = bigR, iv = IV, rows = await rowsOf(m, r, iv); if (r !== bigR || iv !== IV) return;
    const cv = document.querySelector(`[data-big="${i}"]`); if (!cv) return;
    if (!rows?.length) { cv.parentElement.innerHTML = `<p class="note">못 불러왔어요</p>`; return; }
    const cut = new Date(Date.now() - FROM[r] * 864e5).toISOString().slice(0, 10), rs = rows.filter((p) => p.d >= cut);
    const vals = rs.map((p) => p.c), ma = (n) => vals.map((_, k) => (k + 1 >= n ? vals.slice(k + 1 - n, k + 1).reduce((a, b) => a + b, 0) / n : null));
    const up = vals.at(-1) >= vals[0], series = [{ s: m.s, label: m.n, vals, color: up ? css("--up") : css("--down") }];
    const [mn, ml] = iv === "1mo" ? [12, "12달 평균"] : iv === "1wk" ? [13, "13주 평균"] : [60, "60일 평균"];
    if (!m.abs && vals.length > mn + 20) series.push({ s: "ma", label: ml, vals: ma(mn), color: css("--muted"), w: 1.2, dash: [4, 3], noDot: true });
    BIGD[i] = { days: rs.map((p) => p.d), series, u: m.u };
    const ch = m.abs ? vals.at(-1) - vals[0] : (vals.at(-1) / vals[0] - 1) * 100, hi = Math.max(...vals), lo = Math.min(...vals);
    const el = document.querySelector(`[data-bigv="${i}"]`); if (el) el.innerHTML = `${fmt(vals.at(-1), vals.at(-1) > 1000 ? 0 : 2)} <span class="${ud(ch)}">${pct(r2c(ch), m.abs)}${m.abs ? (m.u || "") : ""}</span> <span class="note">고 ${fmt(hi, hi > 1000 ? 0 : 2)} · 저 ${fmt(lo, lo > 1000 ? 0 : 2)}</span>`;
    paintChart(cv, null, BIGD[i]);
  });
}
const r2c = (v) => Math.round(v * 100) / 100;
document.addEventListener("click", (e) => { const b = e.target.closest("[data-bigr]"); if (!b) return; bigR = b.dataset.bigr; ls.set("stk-bigr", bigR); renderBig(); });
document.addEventListener("pointermove", (e) => { const cv = e.target.closest?.("[data-big]"); if (!cv) return; const i = cv.dataset.big; paintChart(cv, document.querySelector(`[data-bigtip="${i}"]`), BIGD[i], e.clientX - cv.getBoundingClientRect().left); });
document.addEventListener("pointerout", (e) => { const cv = e.target.closest?.("[data-big]"); if (!cv) return; const i = cv.dataset.big; paintChart(cv, document.querySelector(`[data-bigtip="${i}"]`), BIGD[i]); });
addEventListener("resize", () => { if (!$("macro").hidden) Object.keys(BIGD).forEach((i) => { const cv = document.querySelector(`[data-big="${i}"]`); if (cv) paintChart(cv, null, BIGD[i]); }); });


// ── 유명인 포폴
let FAM = null, fSel = ls.get("stk-fam", "buffett");
const usd = (v) => (v == null ? "-" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v).toLocaleString("en-US"));
const chgTag = (c) => (c === "new" ? `<span class="chg new">새로 삼</span>` : c == null || c === 0 ? "" : `<span class="chg ${c > 0 ? "add" : "cut"}">${c > 0 ? "+" : ""}${c}%</span>`);
async function loadFam(refresh) {
  if (FAM && !refresh) return renderFam();
  $("fRe").disabled = true; if (refresh) $("fAt").textContent = "확인하는 중… (30초쯤)";
  try { FAM = await api("op=fam" + (refresh ? "&refresh=1" : "")); renderFam(); } catch { $("fList").innerHTML = `<p class="msg no">못 불러왔어요. 잠시 뒤 '새 공시 확인'을 눌러 주세요.</p>`; }
  $("fRe").disabled = false;
}
$("fRe").onclick = () => loadFam(true);
function renderFam() {
  $("fAt").textContent = FAM.at ? new Date(FAM.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 확인" : "";
  $("fList").innerHTML = FAM.list.map((f) => { const d = f.data, news = d ? d.rows.filter((r) => r.ch === "new").length : 0;
    return `<button type="button" class="mcard" data-fam="${f.id}" aria-pressed="${f.id === fSel}">${LOOK[f.id] ? face(f.id) : `<span class="ini">${esc(f.who.slice(0, 1))}</span>`}<div class="nm">${esc(f.who)}${news ? `<span class="chg new">새로 ${news}</span>` : ""}</div><div class="note" style="margin:0">${esc(f.fund)}</div><div class="say">${d ? `<span class="note">${d.kind === "ark" ? d.day + " 기준" : d.period + " 분기 · " + d.filed + " 공시"}</span><br>${d.rows.slice(0, 3).map((r) => esc(kn(r))).join(" · ")}` : `<span class="note">아직 못 받았어요</span>`}</div></button>`; }).join("");
  renderFamDetail();
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-fam]"); if (!b) return; fSel = b.dataset.fam; ls.set("stk-fam", fSel); renderFam(); if (innerWidth < 860) $("fDetail").scrollIntoView({ behavior: "smooth" }); });
const kn = (r) => r.ko || r.t || r.n; // 한글 이름 우선
let FQ = {}; // 지난 분기 { id: data }
async function famPick(id, acc) { const f = FAM.list.find((x) => x.id === id); if (!f) return; if (!acc || acc === f.data?.acc) { delete FQ[id]; return renderFamDetail(); } $("fDetail").querySelector(".qsel")?.setAttribute("aria-busy", "true"); try { FQ[id] = await api(`op=famq&id=${encodeURIComponent(id)}&acc=${encodeURIComponent(acc)}`); } catch { FQ[id] = null; } renderFamDetail(); }
document.addEventListener("click", (e) => { const b = e.target.closest("[data-famq]"); if (b) famPick(fSel, b.dataset.famq); });
function renderFamDetail() {
  const f = FAM.list.find((x) => x.id === fSel), box = $("fDetail"); if (!f) return; const d = FQ[f.id] || f?.data;
  if (!d) { box.innerHTML = `<h2>${esc(f.who)}</h2><p class="note">아직 데이터를 못 받았어요. '새 공시 확인'을 눌러 보세요.</p>`; return; }
  const ark = d.kind === "ark", max = d.rows[0]?.val || 1;
  const adds = d.rows.filter((r) => r.ch === "new" || r.ch > 0).slice(0, 8), cuts = d.rows.filter((r) => typeof r.ch === "number" && r.ch < 0).slice(0, 8);
  box.innerHTML = `<div class="prof">${LOOK[f.id] ? face(f.id) : `<span class="ini" style="width:96px;height:96px;font-size:30px">${esc(f.who.slice(0, 1))}</span>`}<div><h2 style="margin:0">${esc(f.who)} <span>${esc(f.fund)}</span></h2><p class="note" style="margin:2px 0">${esc(f.note)}</p>
    ${f.data?.hist?.length ? `<div class="row qsel" style="gap:4px;margin:6px 0"><span class="note">분기 고르기</span>${f.data.hist.map((h, i) => `<button type="button" class="pill" data-famq="${esc(h.acc)}" aria-pressed="${h.acc === d.acc}">${esc(h.period.slice(2, 7).replace("-", "."))}${i === 0 ? " 최신" : ""}</button>`).join("")}</div>` : ""}
    ${d.past ? `<p class="msg" style="margin:4px 0">지난 분기를 보고 있어요: <b>${esc(d.period)} 분기말 기준</b> (${esc(d.filed)} 공시)</p>` : ""}
    <div class="big">${usd(d.total)}</div><p class="note" style="margin:0">${d.count}종목 · ${ark ? `${d.day} 기준${d.prevDay ? ` (비교: ${d.prevDay})` : ""}` : `${d.period} 분기말 기준 · ${d.filed} 공시${d.prevPeriod ? ` · 비교: ${d.prevPeriod} 분기` : ""}`}</p></div></div>
    ${d.prevPeriod || d.prevDay ? `<div class="two" style="margin-top:12px"><div><h3 class="up">산 것 · 늘린 것</h3>${adds.map((r) => `<div>${esc(kn(r))} ${chgTag(r.ch)}</div>`).join("") || `<p class="note">없어요</p>`}</div><div><h3 class="down">줄인 것 · 다 판 것</h3>${cuts.map((r) => `<div>${esc(kn(r))} ${chgTag(r.ch)}</div>`).join("")}${d.sold.slice(0, 8).map((r) => `<div>${esc(kn(r))} <span class="chg cut">다 팖</span></div>`).join("")}${!cuts.length && !d.sold.length ? `<p class="note">없어요</p>` : ""}</div></div>` : ""}
    <h3 style="margin-top:14px">보유 종목 <span class="note">금액 순 · 상위 ${Math.min(d.rows.length, 60)}개</span></h3>
    <div class="tw"><table><thead><tr><th>종목</th><th class="r">비중</th><th style="width:28%"></th><th class="r">금액</th><th class="r">주식 수</th><th>변화</th></tr></thead><tbody>${d.rows.slice(0, 60).map((r) => `<tr><td><b>${esc(kn(r))}</b>${r.pc ? ` <span class="note">${esc(r.pc)}</span>` : r.cls && !/^COM/i.test(r.cls) ? ` <span class="note">${esc(r.cls)}</span>` : ""}<br><span class="note">${esc([r.t, r.n].filter(Boolean).join(" · "))}</span></td><td class="r">${fmt(ark ? r.w : (r.val / d.total) * 100, 1)}%</td><td style="vertical-align:middle"><div class="bar" style="width:${Math.max(2, (r.val / max) * 100)}%"></div></td><td class="r">${usd(r.val)}</td><td class="r">${Math.round(r.sh).toLocaleString("en-US")}</td><td>${chgTag(r.ch)}</td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:8px">${ark ? "출처: ARK Invest 매일 공개 보유 내역" : "출처: 미국 SEC EDGAR 13F-HR. 미국 상장 주식·옵션만 신고돼서 현금·채권·해외 주식은 빠져요. 분기말 기준이라 지금은 이미 바뀌었을 수 있어요."}</p>`;
}


// ── 유튜버
let YT = null, yCh = ls.get("stk-ych", "");
const ago = (iso) => { const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };
async function loadYt(force) {
  if (YT && !force) return renderYt();
  $("yRe").disabled = true; if (force) $("yAt").textContent = "새 영상 받고 요약하는 중… (1분쯤)";
  try { YT = force ? await api("", { op: "ytsync" }) : await api("op=yt"); renderYt(); } catch { $("yList").innerHTML = `<p class="msg no">못 불러왔어요. '새 영상 확인'을 눌러 주세요.</p>`; }
  $("yRe").disabled = false;
}
$("yRe").onclick = () => loadYt(true);
function renderYt() {
  $("yAt").textContent = YT.at ? new Date(YT.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 확인" : "";
  $("yCh").innerHTML = `<button type="button" class="pill" data-ych="" aria-pressed="${!yCh}">전체</button>` + YT.ch.map((c) => `<span class="leg"><button type="button" class="tg" data-ych="${esc(c.id)}" aria-pressed="${c.id === yCh}" style="${c.id === yCh ? "font-weight:700" : ""}">${esc(c.name)}</button><button type="button" data-ydel="${esc(c.id)}" aria-label="채널 빼기">✕</button></span>`).join("");
  const list = YT.feed.filter((v) => !yCh || v.ch === yCh);
  // 요일별: 최근 14일, 올라온 수 / 본 수
  const SEEN = new Set(YT.seen || []), kd = (t) => new Date(Date.parse(t) + 9 * 3600e3).toISOString().slice(0, 10), today = kd(new Date().toISOString());
  const dayList = [...Array(14)].map((_, k) => kd(new Date(Date.now() - (13 - k) * 864e5).toISOString()));
  const cnt = Object.fromEntries(dayList.map((d) => [d, { up: 0, w: 0 }])); list.forEach((v) => { const c = cnt[kd(v.at)]; if (c) { c.up++; if (SEEN.has(v.id)) c.w++; } });
  const mx = Math.max(1, ...Object.values(cnt).map((c) => c.up)), tot = Object.values(cnt).reduce((a, c) => [a[0] + c.up, a[1] + c.w], [0, 0]);
  $("yWeek").innerHTML = dayList.map((d) => { const c = cnt[d], wd = "일월화수목금토"[new Date(d + "T00:00:00Z").getUTCDay()]; return `<div class="d${d === today ? " today" : ""}"><b>${wd}</b><span class="note num">${d.slice(5).replace("-", ".")}</span><div class="bars"><i style="height:${(c.up / mx) * 100}%" title="올라온 ${c.up}"></i><i class="w" style="height:${(c.w / mx) * 100}%" title="본 ${c.w}"></i></div><span class="num">${c.w}/${c.up}</span></div>`; }).join("") + `<p class="note" style="grid-column:1/-1;margin:4px 0 0">2주 동안 올라온 ${tot[0]}개 중 <b>${tot[1]}개</b> 봤어요 · 회색 막대 = 올라온 영상, 노란 막대 = 본 영상</p>`;
  $("yList").innerHTML = (YT.gem === false ? `<p class="msg no">GEMINI_API_KEY가 서버에 안 보여요. Vercel에 넣은 뒤 Deployments에서 Redeploy를 눌러야 적용돼요.</p>` : "") + list.map((v) => { const s = v.s, url = `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`;
    const seen = SEEN.has(v.id);
    return `<article class="yv${seen ? " seen" : ""}"><a href="${url}" target="_blank" rel="noopener" data-yopen="${esc(v.id)}"><img loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg" alt=""></a><div>
      <h3><a href="${url}" target="_blank" rel="noopener" data-yopen="${esc(v.id)}">${esc(v.title)}</a> <button type="button" class="pill seenb" data-yseen="${esc(v.id)}" aria-pressed="${seen}">${seen ? "✓ 봤어요" : "봤어요"}</button></h3>
      <p class="note" style="margin:2px 0 0">${esc(v.chName)} · ${ago(v.at)}${v.short ? " · 쇼츠" : ""}${s ? ` · <span class="tone ${esc(s.tone)}">${esc(s.tone)}</span> <span class="note">${esc(s.basis)} 기준 요약</span>` : ""}</p>
      ${s ? `<ul>${s.sum.map((x) => `<li><b>${esc(x)}</b></li>`).join("")}${s.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>${s.stocks.length ? `<div style="margin-top:4px">${s.stocks.map((x) => `<span class="stk">${esc(x)}</span>`).join("")}</div>` : ""}`
        : `<div class="row" style="margin-top:6px"><button type="button" class="btn g s" data-ysum="${esc(v.id)}">AI 요약 만들기</button>${v.e ? `<span class="note no">요약 실패: ${esc(v.e)}</span>` : ""}</div>`}
    </div></article>`; }).join("") || `<p class="note">아직 영상이 없어요. '새 영상 확인'을 눌러 보세요.</p>`;
}
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-ych],[data-ydel],[data-ysum]"); if (!t) return;
  if (t.dataset.ych != null && !t.dataset.ydel && !t.dataset.ysum) { yCh = t.dataset.ych; ls.set("stk-ych", yCh); renderYt(); return; }
  if (t.dataset.ydel) { if (t.dataset.sure !== "1") { t.dataset.sure = "1"; t.textContent = "빼기?"; return; } YT = await api("", { op: "ytdel", id: t.dataset.ydel }); if (yCh === t.dataset.ydel) yCh = ""; renderYt(); return; }
  if (t.dataset.ysum) { t.disabled = true; t.textContent = "영상 보는 중… (1분쯤)"; try { const s = await api("", { op: "ytsum", id: t.dataset.ysum }); const v = YT.feed.find((x) => x.id === t.dataset.ysum); if (v) v.s = s; renderYt(); } catch (err) { t.disabled = false; t.textContent = "다시 시도"; const n = t.nextElementSibling?.classList.contains("no") ? t.nextElementSibling : t.insertAdjacentElement("afterend", Object.assign(document.createElement("span"), { className: "note no" })); n.textContent = "요약 실패: " + (err?.message || ""); } }
});
async function markSeen(id, on) { const S = new Set(YT.seen || []); on ? S.add(id) : S.delete(id); YT.seen = [...S]; renderYt(); api("", { op: "ytseen", id, on }).catch(() => {}); }
document.addEventListener("click", (e) => { const o = e.target.closest("[data-yopen]"); if (o && !(YT.seen || []).includes(o.dataset.yopen)) markSeen(o.dataset.yopen, true); const b = e.target.closest("[data-yseen]"); if (b) markSeen(b.dataset.yseen, b.getAttribute("aria-pressed") !== "true"); });
document.addEventListener("change", (e) => { const c = e.target.closest("[data-sseen]"); if (!c) return; const id = c.dataset.sseen, S = new Set(SOC.seen || []); c.checked ? S.add(id) : S.delete(id); SOC.seen = [...S]; c.closest(".it")?.classList.toggle("seen", c.checked); api("", { op: "socseen", id, on: c.checked }).catch(() => {}); });
$("yAdd").onsubmit = async (e) => {
  e.preventDefault(); const u = $("yUrl").value.trim(); if (!u) return; $("yMsg").textContent = "채널 찾는 중…";
  try { const j = await api("", { op: "ytadd", url: u }); YT = j; $("yUrl").value = ""; $("yMsg").textContent = `${j.added.name} 더했어요.`; renderYt(); }
  catch { $("yMsg").textContent = "그 채널을 못 찾았어요. 채널 주소를 그대로 붙여 넣어 보세요."; }
};


// ── SNS 발언
let SOC = null;
async function loadSoc(force) {
  if (SOC && !force) return renderSoc();
  $("sRe").disabled = true; if (force) $("sAt").textContent = "받고 해석하는 중… (40초쯤)";
  try { SOC = await api("op=soc" + (force ? "&force=1" : "")); renderSoc(); } catch { $("sPeople").innerHTML = `<p class="msg no">못 불러왔어요. '새로 받기'를 눌러 주세요.</p>`; }
  $("sRe").disabled = false;
}
$("sRe").onclick = () => loadSoc(true);
function renderSoc() {
  $("sAt").textContent = new Date(SOC.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 기준";
  const E = SOC.errs || {}, en = Object.keys(E); $("sErr").hidden = !en.length;
  $("sErr").textContent = en.length ? "못 받은 곳: " + en.map((k) => ({ truth: "트루스소셜", reddit: "레딧", ai: "AI 해석" })[k] || k).join(", ") : "";
  const when = (t) => (t ? ago(new Date(t).toISOString()) : "");
  $("sPeople").innerHTML = SOC.people.map((p) => `<article class="sp"><h3 style="margin:0">${esc(p.who)}</h3>${p.mood ? `<p class="note" style="margin:0">${esc(p.mood)}</p>` : ""}
    ${p.picks.map((x) => `<div class="it ${esc(x.impact)}${(SOC.seen || []).includes(x.link) ? " seen" : ""}"><div><label class="sck" title="봤어요"><input type="checkbox" data-sseen="${esc(x.link)}"${(SOC.seen || []).includes(x.link) ? " checked" : ""}></label> <span class="imp ${esc(x.impact)}">${esc(x.impact)}</span> <b>${esc(x.take)}</b></div><div class="note">${x.post ? "💬 본인 게시글 · " : ""}<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.t.slice(0, 140))}</a> · ${esc(x.src)} · ${when(x.at)}</div>${x.stocks.length ? `<div>${x.stocks.map((k) => `<span class="stk">${esc(k)}</span>`).join("")}</div>` : ""}</div>`).join("") || `<p class="note" style="margin:0">최근 시장에 의미 있는 발언이 없어요.</p>`}
    ${p.raw.length ? `<details><summary>원문 헤드라인 ${p.raw.length}개</summary><ul style="margin:4px 0 0;padding-left:18px">${p.raw.map((x) => `<li class="note"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.t.slice(0, 160))}</a> · ${when(x.at)}</li>`).join("")}</ul></details>` : ""}</article>`).join("");
  const R = SOC.reddit; if (!R) { $("sWsb").innerHTML = `<p class="note">레딧에서 못 받았어요.</p>`; return; }
  const max = R.top[0]?.v || 1;
  $("sWsb").innerHTML = `<div class="two"><div>${R.top.map((t) => `<div class="row" style="gap:8px;margin:3px 0"><b class="num" style="width:56px">${esc(t.s)}</b><div class="bar" style="width:${Math.max(4, (t.v / max) * 70)}%"></div><span class="note num">${t.v}</span></div>`).join("") || `<p class="note">없어요</p>`}</div><div><h3>인기 글</h3><ul style="margin:0;padding-left:18px">${R.posts.map((p) => `<li><a href="${esc(p.link)}" target="_blank" rel="noopener" style="color:inherit">${esc(p.t)}</a> <span class="note">▲${p.score}</span></li>`).join("")}</ul></div></div>`;
}

// ── 내 계좌
let KW = null;
async function renderKw() {
  if (!KW) KW = await api("op=kw").catch(() => ({}));
  const on = KW.key && KW.proxy, at = ACCT.kwAt ? new Date(ACCT.kwAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  $("kwBox").innerHTML = on ? `<span class="note" style="margin:0">키움 연결됨${at ? ` · 마지막 ${at}` : ""} · 매일 아침 자동으로 받아요</span><button type="button" class="btn y s" data-kw="7">키움에서 지금 받기</button><button type="button" class="btn g s" data-kw="90">최근 90일 체결 한 번에</button><button type="button" class="btn g s" data-kwip="1">나가는 IP 확인</button>`
    : `<span class="note" style="margin:0">키움 자동 연결 준비 중: Vercel에 ${[!KW.key && "KIWOOM_APPKEY · KIWOOM_SECRETKEY", !KW.proxy && "OUTBOUND_PROXY_URL"].filter(Boolean).join(", ")} 를 넣으면 켜져요.</span>${KW.proxy ? `<button type="button" class="btn g s" data-kwip="1">나가는 IP 확인</button>` : ""}`;
}
// 복기 탭 위쪽: 키움 체결을 바로 받아 오기 (연결 전이면 엑셀 올리기를 펼쳐 둠)
async function renderKwRv() {
  if (!KW) KW = await api("op=kw").catch(() => ({}));
  const on = KW.key && KW.proxy, at = ACCT.kwAt ? new Date(ACCT.kwAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  $("kwRv").innerHTML = on ? `<span class="note" style="margin:0">키움 체결 자동 연동${at ? ` · 마지막 ${at}` : ""} · 매일 아침 자동</span><button type="button" class="btn y s" data-kw="7">최근 1주 받기</button><button type="button" class="btn g s" data-kw="30">1달</button><button type="button" class="btn g s" data-kw="90">3달</button>`
    : `<span class="note" style="margin:0">키움 연결 전이에요. 내 계좌 탭의 안내대로 키를 넣으면 여기서 바로 받아져요.</span>`;
  $("xlsWrap").open = !on;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-kw],[data-kwip]"); if (!b) return;
  const m = b.closest("#kwRv") ? $("kwRvMsg") : $("acctMsg"); b.disabled = true;
  if (b.dataset.kwip) { try { const j = await api("op=kwip"); m.textContent = `사이트가 키움으로 나가는 IP: ${j.ip} (키움에 등록한 IP와 같아야 해요)`; } catch { m.textContent = "프록시로 나가지 못했어요. OUTBOUND_PROXY_URL 값을 확인해 주세요."; } b.disabled = false; return; }
  m.textContent = `키움에서 받는 중… (${+b.dataset.kw >= 30 ? "1분쯤" : "10초쯤"})`;
  try { const j = await api("", { op: "kwsync", days: +b.dataset.kw }); const a = await api("op=acct"); ACCT = { cash: 0, cashUsd: 0, ...a.acct }; TRADES = a.trades || []; m.textContent = `받았어요. 보유 ${j.hold}종목, 새 체결 ${j.added}건.`; renderAcct(); renderTrades(); renderKwRv(); }
  catch (err) { m.textContent = "키움에서 못 받았어요. IP 등록(키움)과 프록시 허용 목록(api.kiwoom.com)을 확인해 주세요."; }
  b.disabled = false;
});
// ── 스승님들의 훈수 (내 계좌 아래)
let ADV = null;
function renderAdv() {
  const NM = { buffett: "워런 버핏", lynch: "피터 린치", oneil: "윌리엄 오닐", livermore: "제시 리버모어", dalio: "레이 달리오", druckenmiller: "스탠리 드러켄밀러", kostolany: "앙드레 코스톨라니", zero: "제로 (AI)" };
  const a = ADV, nm = (id) => INFO.find((m) => m.id === id)?.name || NM[id] || id;
  $("advGo").textContent = a?.list?.length ? "다시 받기" : "훈수 받기";
  if (!a?.list?.length) { $("advAt").textContent = ""; $("advSum").innerHTML = ""; $("advList").innerHTML = `<p class="note">'훈수 받기'를 누르면 30초쯤 걸려요.</p>`; return; }
  const d = new Date(a.at), stale = ACCT.at && a.acctAt && ACCT.at > a.acctAt;
  $("advAt").textContent = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 기준${stale ? " · 그 뒤 계좌가 바뀌었어요" : ""}`;
  $("advSum").innerHTML = a.common || a.split ? `<div class="advs">${a.common ? `<b>공통으로 짚은 것</b> ${esc(a.common)}` : ""}${a.split ? `<br><b>의견이 갈린 것</b> ${esc(a.split)}` : ""}</div>` : "";
  const cls = { 칭찬: "g", 격려: "g", 경고: "w", 걱정: "w" };
  $("advList").innerHTML = a.list.map((x) => `<div class="advc"><div class="hd">${face(x.id)}<div><b>${esc(nm(x.id))}</b> <span class="md ${cls[x.mood] || ""}">${esc(x.mood || "")}</span><div style="font-weight:600">${esc(x.head || "")}</div></div></div><p>${esc(x.text || "")}</p>${x.todo?.length ? `<ul>${x.todo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}<div><button type="button" class="btn g s" data-advchat="${esc(x.id)}">더 여쭤보기</button></div></div>`).join("");
}
async function loadAdv() { if (!PUB) return; try { ADV = await api("op=advice"); } catch {} renderAdv(); }
document.addEventListener("click", async (e) => {
  const c = e.target.closest("[data-advchat]"); if (c) { showTab("masters"); setMV(c.dataset.advchat); return; }
  if (e.target.id !== "advGo") return; const b = e.target; b.disabled = true; b.textContent = "스승님들이 계좌를 보는 중…";
  try { ADV = await api("", { op: "advice" }); renderAdv(); } catch (er) { const m = String(er?.message || ""); $("advList").innerHTML = `<p class="msg no">훈수를 못 받았어요 (${esc(m === "empty" ? "저장된 계좌가 비어 있어요. '저장'을 먼저 눌러 주세요" : m === "ai" ? "AI 답을 못 받았어요. 잠시 뒤 다시 눌러 주세요" : m || "연결 오류")}).</p>`; b.textContent = "다시 받기"; }
  b.disabled = false;
});
async function renderAcct() {
  if (!PUB) { $("hold").innerHTML = ""; $("acctSum").innerHTML = ""; $("kwBox").innerHTML = ""; $("advList").innerHTML = $("advSum").innerHTML = ""; $("cash").value = $("cashUsd").value = ""; return; }
  if (!ADV) loadAdv(); // 비공개면 아예 그리지 않음
  renderKw();
  $("cash").value = ACCT.cash || ""; $("cashUsd").value = ACCT.cashUsd || "";
  const syms = ACCT.hold.map((h) => h.sym);
  if (syms.length) try { const j = await api("op=quote&s=" + encodeURIComponent(syms.join(","))); Q = j.q; FX = j.fx || FX;
    // 코스닥 종목이 .KS로 들어와 있으면 .KQ로 고쳐서 저장
    let fixed = 0; ACCT.hold.forEach((h) => { const f = Q[h.sym]?.sym; if (f && f !== h.sym) { Q[f] = Q[h.sym]; h.sym = f; fixed++; } }); if (fixed) api("", { op: "acct", acct: ACCT }).then((r) => (ACCT = r.acct)).catch(() => {});
  } catch {}
  let tot = (+ACCT.cash || 0) + (+ACCT.cashUsd || 0) * FX, buy = 0, today = 0;
  const rows = ACCT.hold.map((h, i) => { const q = Q[h.sym], k = h.cur === "USD" ? FX : 1, p = q?.p, v = p != null ? p * h.qty * k : null, cost = h.avg * h.qty * k; if (v != null) { tot += v; today += (p - (q.prev || p)) * h.qty * k; } buy += cost; return { h, i, p, v, cost, pl: v != null && cost ? (v / cost - 1) * 100 : null }; });
  const stockV = rows.reduce((t, r) => t + (r.v || 0), 0);
  $("hold").innerHTML = rows.map(({ h, i, p, v, pl }) => `<tr><td><b>${esc(h.name || h.sym)}</b><br><span class="note num">${esc(h.sym)}</span></td><td class="r"><span class="mz">${fmt(h.qty, h.qty % 1 ? 4 : 0)}</span></td><td class="r"><span class="mz">${fmt(h.avg, h.cur === "USD" ? 2 : 0)}</span></td><td class="r">${p != null ? fmt(p, h.cur === "USD" ? 2 : 0) : "-"}</td><td class="r"><span class="mz">${won(v)}</span></td><td class="r ${ud(pl)}">${pct(pl)}</td><td class="r">${v && tot ? fmt((v / tot) * 100, 1) + "%" : "-"}</td><td><button type="button" class="btn g s" data-hdel="${i}" aria-label="빼기">✕</button></td></tr>`).join("") || `<tr><td colspan="8" class="note">아래에서 보유 종목을 더해 주세요.</td></tr>`;
  const plAll = buy ? (stockV / buy - 1) * 100 : null;
  $("acctSum").innerHTML = `<div class="card" style="flex:1 1 180px"><div class="k">총 자산</div><div class="v mz">${won(tot)}원</div></div><div class="card" style="flex:1 1 180px"><div class="k">주식 손익</div><div class="v ${ud(plAll)}"><span class="mz">${won(stockV - buy)}원</span></div><div class="c"><span class="${ud(plAll)}">${pct(plAll)}</span></div></div><div class="card" style="flex:1 1 180px"><div class="k">오늘 변동</div><div class="v ${ud(today)}"><span class="mz">${won(today)}원</span> <small>${tot ? pct((today / tot) * 100) : ""}</small></div><div class="c"><span>환율 ${fmt(FX, 1)}원</span></div></div>`;
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
  $("trades").innerHTML = TRADES.map((t) => `<tr class="trow${t.id === selT ? " sel" : ""}" data-tid="${t.id}"><td class="num">${t.date}</td><td>${esc(t.name || t.sym)}${t.src === "kiwoom" ? ` <span class="note" title="키움에서 자동으로 받은 체결">키움</span>` : ""}</td><td><span class="chip ${t.side}">${t.side}</span></td><td class="r">${fmt(t.price, t.price % 1 ? 2 : 0)}</td><td class="r">${fmt(t.qty, t.qty % 1 ? 4 : 0)}</td><td class="r">${t.rv ? `<b>${esc(t.rv.grade)}</b>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="note">위의 '최근 1주 받기'를 누르면 키움 체결이 들어와요.</td></tr>`;
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
    const p0 = g.rows[k]?.c; $("tAfter").textContent = `${g.src === "kiwoom" ? "키움 차트 · " : ""}앞뒤 60거래일 · 점이 매매한 날 · 그 뒤 ` + [5, 20, 60].map((n) => (g.rows[k + n] ? `${n}일 ${pct((g.rows[k + n].c / p0 - 1) * 100)}` : `${n}일 -`)).join(" · ");
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

// 내 계좌 공개/비공개: 열 때마다 비공개로 시작, 비밀번호를 넣어야 공개 (이 탭을 닫으면 다시 비공개)
var PUB = false; try { PUB = sessionStorage.getItem("stk-acct-pub") === "1"; } catch {}
function setPv(on) { PUB = on; try { sessionStorage.setItem("stk-acct-pub", on ? "1" : "0"); } catch {} $("acct").classList.toggle("priv", !on); $("pvPriv").setAttribute("aria-pressed", !on); $("pvPub").setAttribute("aria-pressed", on); if (on) $("pvForm").hidden = true; renderAcct(); }
setPv(PUB);
$("pvPriv").onclick = () => { setPv(false); $("pvForm").hidden = true; };
$("pvPub").onclick = async () => { if (PUB) return; $("pvForm").hidden = false; $("pvNew").hidden = true; $("pvMsg").textContent = ""; $("pvPin").value = ""; $("pvPin").focus();
  try { const j = await api("", { op: "acctpin", check: true }); if (!j.set) { $("pvGo").textContent = "이 비밀번호로 정하고 공개"; $("pvMsg").textContent = "처음이에요. 쓸 비밀번호(4자 이상)를 정해 주세요."; } else $("pvGo").textContent = "공개로 전환"; } catch {} };
$("pvChg").onclick = () => { $("pvNew").hidden = !$("pvNew").hidden; $("pvGo").textContent = $("pvNew").hidden ? "공개로 전환" : "비밀번호 바꾸기"; $("pvMsg").textContent = $("pvNew").hidden ? "" : "지금 비밀번호와 새 비밀번호를 넣어 주세요."; };
$("pvForm").onsubmit = async (e) => { e.preventDefault(); const pin = $("pvPin").value, nw = $("pvNew").hidden ? "" : $("pvNew").value;
  try { const j = await api("", { op: "acctpin", pin, newPin: nw || undefined }); $("pvPin").value = $("pvNew").value = ""; $("pvNew").hidden = true; setPv(true); $("pvMsg").textContent = j.changed ? "비밀번호를 바꿨어요." : ""; }
  catch (err) { $("pvMsg").textContent = err?.message === "wrong" ? "비밀번호가 달라요." : err?.message === "short" ? "4자 이상으로 넣어 주세요." : "확인하지 못했어요."; } };

// 일별 DB: 날짜 × 항목 엑셀 표
let DB = null, DBFILL = false;
const DBC = [["us", "미국 증시"], ["kr", "한국 증시"], ["macro", "금리·환율·유가"], ["semi", "반도체·AI"], ["news", "뉴스 많았던 얘기"], ["policy", "연준·정책·관세"], ["talk", "유명인 발언"], ["yt", "유튜버"], ["crowd", "개미 분위기"], ["masters", "대가·포폴"]];
const kday = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
async function loadDb() {
  try { DB = await api("op=db"); renderDb(); } catch { $("dbMsg").textContent = "못 불러왔어요."; return; }
  const have = new Set((DB.list || []).filter((r) => r.cells).map((r) => r.day)), miss = [1, 2, 3, 4, 5, 6, 7].map((i) => kday(Date.now() - i * 864e5)).filter((d) => !have.has(d));
  if (miss.length && !DBFILL) { DBFILL = true; $("dbMsg").textContent = `지난 7일 중 ${miss.length}일치를 만드는 중이에요… (1~2분)`; try { await api("", { op: "dbfill", n: 7 }); DB = await api("op=db"); $("dbMsg").textContent = ""; renderDb(); } catch (e) { $("dbMsg").textContent = "일부를 못 만들었어요. 다시 열면 이어서 만들어요."; DBFILL = false; } }
}
function renderDb() {
  const L = DB?.list || [], today = kday(Date.now());
  $("dbMake").textContent = L.some((r) => r.day === today && r.cells) ? "오늘 것 다시 만들기" : "오늘 것 지금 만들기";
  const G = { 좋음: "gd", 나쁨: "bd", 중립: "nt" };
  const cell = (c) => (c?.t ? `<td class="${G[c.g] || ""}">${c.g === "좋음" ? "▲ " : c.g === "나쁨" ? "▼ " : ""}${esc(c.t)}</td>` : `<td class="em">-</td>`);
  const rows = L.map((r) => `<tr><th class="num">${r.day.slice(5).replace("-", ".")} <small>${"일월화수목금토"[new Date(r.day + "T00:00:00Z").getUTCDay()]}</small>${r.day === today ? "<small> (진행 중)</small>" : ""}<button type="button" class="redo" data-dbre="${esc(r.day)}" title="이 날 다시 만들기">↻</button></th>
    <td class="one">${r.mood ? `<span class="mood ${esc(r.mood)}">${esc(r.mood)}</span>` : ""}${esc(r.line || "")}</td>${r.cells ? DBC.map(([k]) => cell(r.cells[k])).join("") : `<td colspan="${DBC.length}" class="em">예전 형식이에요. ↻를 누르면 표로 다시 만들어요.</td>`}
    <td class="kw2">${(r.keys || []).map((k) => `#${esc(k)}`).join(" ")}${(r.hot || []).length ? `<br><b>${(r.hot || []).map(esc).join(", ")}</b>` : ""}</td></tr>`).join("");
  $("dbList").innerHTML = L.length ? `<div class="dbt"><table><thead><tr><th>날짜</th><th>한 줄</th>${DBC.map(([, n]) => `<th>${n}</th>`).join("")}<th>키워드 · 많이 나온 종목</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">▲ 좋음(빨강) · ▼ 나쁨(파랑) · 미국 칸은 그 날짜 미국장 기준이에요.</p>` : `<p class="note">아직 기록이 없어요.</p>`;
}
async function makeDb(d, btn) { btn.disabled = true; const o = btn.textContent; btn.textContent = "…"; $("dbMsg").textContent = "만드는 중… (30초쯤)"; try { await api("", { op: "dbmake", d }); DB = await api("op=db"); $("dbMsg").textContent = ""; } catch (e) { $("dbMsg").textContent = "못 만들었어요: " + (e?.message || ""); } btn.disabled = false; btn.textContent = o; renderDb(); }
$("dbMake").onclick = (e) => makeDb("", e.currentTarget);
document.addEventListener("click", (e) => { const b = e.target.closest("[data-dbre]"); if (b) makeDb(b.dataset.dbre, b); });

// ── 공부: 질문·백테스트 기록
let ST = null, stOpen = ls.get("stk-stopen", "");
const EXQ = ["코스피가 200일선 위에 있을 때만 들고 있었다면 10년 동안 어땠을까?", "삼성전자를 RSI 30 아래에서 사고 70 위에서 팔았다면?", "QQQ 매달 적립식 vs 한 번에 사서 보유, 2015년부터 비교", "VIX가 40 넘었을 때 S&P500을 샀다면 1년 뒤 수익은?", "금리 인하가 시작되면 보통 어떤 업종이 올라?"];
function mdh(t) { // 아주 간단한 마크다운 → HTML (제목·굵게·목록·표·줄바꿈)
  const L = esc(t || "").split("\n"), out = []; let ul = false, tb = false;
  const inl = (x) => x.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  L.forEach((l) => { const m = l.match(/^(#{1,4})\s+(.*)/), li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/), row = /^\s*\|.*\|\s*$/.test(l);
    if (!li && ul) { out.push("</ul>"); ul = false; } if (!row && tb) { out.push("</table></div>"); tb = false; }
    if (m) out.push(`<h4>${inl(m[2])}</h4>`); else if (li) { if (!ul) { out.push("<ul>"); ul = true; } out.push(`<li>${inl(li[1])}</li>`); }
    else if (row) { if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) return; if (!tb) { out.push('<div class="tw"><table>'); tb = true; } out.push("<tr>" + l.trim().slice(1, -1).split("|").map((c) => `<td>${inl(c.trim())}</td>`).join("") + "</tr>"); }
    else if (l.trim()) out.push(`<p style="margin:4px 0">${inl(l)}</p>`); });
  if (ul) out.push("</ul>"); if (tb) out.push("</table></div>"); return out.join("");
}
async function loadStudy() {
  $("stEx").innerHTML = EXQ.map((q) => `<button type="button" class="pill" data-stex="${esc(q)}">${esc(q.length > 26 ? q.slice(0, 26) + "…" : q)}</button>`).join("");
  try { ST = await api("op=study"); renderStudy(); } catch { $("stList").innerHTML = `<p class="msg no">기록을 못 불러왔어요.</p>`; }
}
function renderStudy() {
  const q = $("stQ").value.trim(), L = (ST?.list || []).filter((r) => !q || (r.q + r.title + (r.answer || "")).includes(q));
  $("stCnt").textContent = `기록 ${ST?.list?.length || 0}개`;
  $("stList").innerHTML = L.map((r) => { const b = r.bt, d = new Date(r.at);
    return `<details class="stc" data-stid="${esc(r.id)}"${r.id === stOpen ? " open" : ""}><summary><span class="k ${r.kind}">${r.kind === "bt" ? "백테스트" : "질문"}</span><span class="t">${esc(r.title)}</span><span class="note">${d.toLocaleDateString("ko-KR")} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>${b ? `<span class="num ${b.me.ret > (b.bm?.ret ?? 0) ? "up" : "down"}">${b.me.ret > 0 ? "+" : ""}${b.me.ret}% <span class="note">vs ${esc(b.bench)} ${b.bm?.ret}%</span></span>` : ""}</summary>
      <div class="qq">${esc(r.q)}</div>
      ${r.plain ? `<p class="note" style="margin:6px 0">이렇게 해석해서 계산했어요: ${esc(r.plain)}</p>` : ""}
      ${b ? `<div class="st"><div>총수익<b class="${b.me.ret >= 0 ? "up" : "down"}">${b.me.ret}%</b></div><div>연평균<b>${b.me.cagr}%</b></div><div>최대 낙폭<b class="down">${b.me.mdd}%</b></div><div>거래<b>${b.nTrades}번</b></div><div>비교 ${esc(b.bench)}<b>${b.bm?.ret}%</b><span class="note">연 ${b.bm?.cagr}% · 낙폭 ${b.bm?.mdd}%</span></div><div>기간<b style="font-size:13px">${b.start} ~ ${b.end}</b></div></div>
        <div style="position:relative"><canvas class="stcv" data-stcv="${esc(r.id)}" style="width:100%;height:260px;display:block"></canvas><div class="tip" data-sttip="${esc(r.id)}" hidden></div></div>` : ""}
      ${r.msgs.slice(1).map((m, i) => (m.role === "user" ? `<div class="qq">${esc(m.content)}</div>` : `<div class="md">${mdh(m.content)}</div>`)).join("")}
      ${b?.trades?.length ? `<details style="margin-top:8px"><summary class="note">최근 매매 ${b.trades.length}개 보기</summary><div class="tw"><table><tbody>${b.trades.map((t) => `<tr><td class="num">${t.d}</td><td>${esc(t.s)}</td><td><span class="chip ${t.side}">${t.side}</span></td><td class="num r">${t.p ?? ""}</td><td class="num r ${t.pl > 0 ? "up" : t.pl < 0 ? "down" : ""}">${t.pl != null ? t.pl + "%" : ""}</td><td class="note">${esc(t.why)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      <form class="row stf" data-stf="${esc(r.id)}" style="gap:6px;margin-top:10px"><input placeholder="이어서 물어보기 (예: 손절 -10%를 넣으면?)" style="flex:1 1 240px"><button class="btn s">보내기</button><button type="button" class="btn g s" data-stdel="${esc(r.id)}">기록 지우기</button></form></details>`; }).join("") || `<p class="note">아직 기록이 없어요. 위에 물어보세요.</p>`;
  requestAnimationFrame(() => document.querySelectorAll("details.stc[open] canvas.stcv").forEach(drawSt));
}
function drawSt(cv) { const r = ST.list.find((x) => x.id === cv.dataset.stcv), b = r?.bt; if (!b) return; const D = { days: b.curve.map((x) => x[0]), series: [{ s: "me", label: "이 전략", vals: b.curve.map((x) => (x[1] / 1e8 - 1) * 100), color: css("--amber") || "#f2b632", w: 2.4 }, { s: "bm", label: b.bench + " 그냥 보유", vals: b.bcurve.map((x) => (x[1] == null ? null : (x[1] / 1e8 - 1) * 100)), color: css("--muted"), w: 1.4 }] }; paintChart(cv, document.querySelector(`[data-sttip="${CSS.escape(r.id)}"]`), D, null, { pct: true }); }
document.addEventListener("toggle", (e) => { const d = e.target; if (!d.matches?.("details.stc")) return; if (d.open) { stOpen = d.dataset.stid; ls.set("stk-stopen", stOpen); const cv = d.querySelector("canvas.stcv"); if (cv) requestAnimationFrame(() => drawSt(cv)); } }, true);
document.addEventListener("click", async (e) => {
  const ex = e.target.closest("[data-stex]"); if (ex) { $("stIn").value = ex.dataset.stex; $("stIn").focus(); return; }
  const del = e.target.closest("[data-stdel]"); if (del) { if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "정말 지울까요?"; return; } ST = await api("", { op: "study", del: del.dataset.stdel }); renderStudy(); }
});
$("stQ").oninput = () => renderStudy();
$("stForm").onsubmit = async (e) => { e.preventDefault(); const t = $("stIn").value.trim(); if (!t) return; $("stGo").disabled = true; $("stMsg").textContent = "생각하는 중… 백테스트면 1분쯤 걸려요";
  try { const r = await api("", { op: "study", text: t }); ST.list.unshift(r); stOpen = r.id; $("stIn").value = ""; $("stMsg").textContent = ""; renderStudy(); } catch (err) { $("stMsg").textContent = "못 했어요: " + (err?.message || ""); } $("stGo").disabled = false; };
document.addEventListener("submit", async (e) => { const f = e.target.closest("[data-stf]"); if (!f) return; e.preventDefault(); const inp = f.querySelector("input"), t = inp.value.trim(); if (!t) return; const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "생각 중…";
  try { const r = await api("", { op: "study", id: f.dataset.stf, text: t }); const i = ST.list.findIndex((x) => x.id === r.id); if (i >= 0) ST.list[i] = r; stOpen = r.id; renderStudy(); } catch (err) { btn.disabled = false; btn.textContent = "다시"; } });
