// 차트 탭: 트레이딩뷰처럼 크게 보고 그림 그리기 (lightweight-charts + 위에 겹친 그림판)
// app.js의 $, api, ls, esc, css, EVT/loadEvents 를 같이 씀
(() => {
  const QUICK = [["^IXIC", "나스닥"], ["^SOX", "필라델피아 반도체"], ["^GSPC", "S&P 500"], ["^KS11", "코스피"], ["^KQ11", "코스닥"], ["^DJI", "다우"], ["^N225", "니케이"], ["005930.KS", "삼성전자"], ["000660.KS", "SK하이닉스"], ["NVDA", "엔비디아"], ["AAPL", "애플"], ["TSLA", "테슬라"], ["^TNX", "미 10년물 금리"], ["KRW=X", "원/달러"], ["GC=F", "금"], ["CL=F", "WTI 유가"], ["BTC-USD", "비트코인"]];
  const RANGES = [["6mo", "6달"], ["1y", "1년"], ["2y", "2년"], ["5y", "5년"], ["10y", "10년"], ["max", "전체"]];
  const IVS = [["1d", "일"], ["1wk", "주"], ["1mo", "월"]];
  const MAS = [[5, "#f2b632"], [20, "#e8590c"], [60, "#2f9e44"], [120, "#7048e8"]];
  const TOOLS = [["cur", "↖ 보기"], ["line", "╱ 추세선"], ["ray", "→ 연장선"], ["hline", "─ 수평선"], ["box", "▭ 박스"], ["text", "T 글자"], ["del", "⌫ 지우기"]];
  const CMPC = ["#1971c2", "#e8590c", "#2f9e44", "#7048e8", "#c2255c", "#0c8599"];
  let cmpS = [];
  const S = { cmp: ls.get("stk-ccmp", []), sym: ls.get("stk-cs", "^IXIC"), name: ls.get("stk-cn", "나스닥"), r: ls.get("stk-cr", "1y"), iv: ls.get("stk-ci", "1d"), type: ls.get("stk-ct", "candle"), ma: ls.get("stk-cma", [20, 60]), ev: ls.get("stk-cev", true), tool: "cur", color: "#e03131", draws: [], rows: [] };
  let chart = null, main = null, vol = null, maS = {}, cv = null, pend = null, hoverPt = null, booted = false;

  const ui = () => {
    $("cSym").innerHTML = QUICK.map(([s, n]) => `<option value="${esc(s)}"${s === S.sym ? " selected" : ""}>${esc(n)}</option>`).join("") + (QUICK.some((q) => q[0] === S.sym) ? "" : `<option value="${esc(S.sym)}" selected>${esc(S.name || S.sym)}</option>`);
    $("cRange").innerHTML = RANGES.map(([k, n]) => `<button type="button" class="pill" data-cr="${k}" aria-pressed="${k === S.r}">${n}</button>`).join("") + `<span class="sep"></span>` + IVS.map(([k, n]) => `<button type="button" class="pill" data-ci="${k}" aria-pressed="${k === S.iv}">${n}</button>`).join("") + `<span class="sep"></span>` + `<button type="button" class="pill" data-ct="candle" aria-pressed="${S.type === "candle"}">캔들</button><button type="button" class="pill" data-ct="line" aria-pressed="${S.type === "line"}">선</button>`;
    $("cOpt").innerHTML = MAS.map(([n, c]) => `<button type="button" class="pill" data-cma="${n}" aria-pressed="${S.ma.includes(n)}"><i style="background:${c}"></i>${n}선</button>`).join("") + `<button type="button" class="pill" data-cev="1" aria-pressed="${S.ev}"><i style="background:var(--up)"></i><i style="background:var(--down)"></i>큰 사건</button>`;
    $("cTools").innerHTML = TOOLS.map(([k, n]) => `<button type="button" class="pill" data-tool="${k}" aria-pressed="${k === S.tool}">${n}</button>`).join("") + ["#e03131", "#1971c2", "#f2b632", "#2f9e44", "#868e96"].map((c) => `<button type="button" class="cdot" data-ccol="${c}" aria-pressed="${c === S.color}" style="background:${c}" aria-label="색"></button>`).join("") + `<button type="button" class="pill" data-cclear="1">그림 모두 지우기</button>`;
  };

  function make() {
    if (chart) return;
    const el = $("cBox"), dark = matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light";
    chart = LightweightCharts.createChart(el, {
      autoSize: true, layout: { background: { color: "transparent" }, textColor: css("--muted") || (dark ? "#aaa" : "#555"), fontFamily: css("--mono") || "monospace" },
      grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } },
      crosshair: { mode: 0 }, rightPriceScale: { borderColor: css("--line") }, timeScale: { borderColor: css("--line"), rightOffset: 6 },
      localization: { locale: "ko-KR", dateFormat: "yyyy-MM-dd" },
    });
    cv = document.createElement("canvas"); cv.className = "cdraw"; el.appendChild(cv);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(paint));
    chart.subscribeCrosshairMove((p) => { $("cInfo").innerHTML = info(p); if (pend) { hoverPt = toPt(p.point); paint(); } });
    new ResizeObserver(() => requestAnimationFrame(paint)).observe(el);
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", (e) => { if (pend) { hoverPt = toPt({ x: e.offsetX, y: e.offsetY }); paint(); } });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && pend) { pend = null; paint(); } });
  }
  const up = () => css("--up") || "#e03131", dn = () => css("--down") || "#1971c2";
  const fmtN = (v) => (v == null ? "-" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("ko-KR") : (+v.toFixed(2)).toLocaleString("ko-KR"));
  function info(p) {
    const r = p?.time ? S.rows.find((x) => x.d === p.time) : S.rows.at(-1); if (!r) return "";
    const i = S.rows.indexOf(r), pr = S.rows[i - 1], ch = pr ? (r.c / pr.c - 1) * 100 : null;
    return `<b>${esc(S.name)}</b> <span class="num">${r.d}</span> 시 <b class="num">${fmtN(r.o)}</b> 고 <b class="num">${fmtN(r.h)}</b> 저 <b class="num">${fmtN(r.l)}</b> 종 <b class="num">${fmtN(r.c)}</b> <span class="num ${ch > 0 ? "up" : ch < 0 ? "down" : ""}">${ch == null ? "" : (ch > 0 ? "+" : "") + ch.toFixed(2) + "%"}</span>${r.v ? ` <span class="note num">거래량 ${fmtN(r.v)}</span>` : ""}`;
  }

  async function load() {
    make(); $("cMsg").textContent = "불러오는 중…";
    let g; try { g = await api(`op=chart&s=${encodeURIComponent(S.sym)}&r=${S.r}&i=${S.iv}`); } catch { $("cMsg").textContent = "차트를 못 불러왔어요."; return; }
    S.rows = (g.rows || []).filter((r) => r.c != null); S.name = S.name || g.name || S.sym; $("cMsg").textContent = g.src === "kiwoom" ? "키움 차트" : "";
    [main, vol, ...Object.values(maS), ...cmpS].forEach((s) => s && chart.removeSeries(s)); maS = {}; cmpS = [];
    main = S.type === "candle" ? chart.addCandlestickSeries({ upColor: up(), downColor: dn(), borderUpColor: up(), borderDownColor: dn(), wickUpColor: up(), wickDownColor: dn() }) : chart.addLineSeries({ color: css("--ink") || "#333", lineWidth: 2 });
    main.setData(S.type === "candle" ? S.rows.map((r) => ({ time: r.d, open: r.o ?? r.c, high: r.h ?? r.c, low: r.l ?? r.c, close: r.c })) : S.rows.map((r) => ({ time: r.d, value: r.c })));
    if (S.rows.some((r) => r.v)) { vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false }); chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); vol.setData(S.rows.map((r, i) => ({ time: r.d, value: r.v || 0, color: (r.c >= (S.rows[i - 1]?.c ?? r.c) ? up() : dn()) + "66" }))); } else vol = null;
    main.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: vol ? 0.22 : 0.06 } });
    MAS.forEach(([n, c]) => { if (!S.ma.includes(n) || S.cmp.some((x) => x.s !== S.sym)) return; const s = chart.addLineSeries({ color: c, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }); const out = []; let sum = 0; S.rows.forEach((r, i) => { sum += r.c; if (i >= n) sum -= S.rows[i - n].c; if (i >= n - 1) out.push({ time: r.d, value: sum / n }); }); s.setData(out); maS[n] = s; });
    marks(); chart.timeScale().fitContent();
    // 겹쳐 보기: 다른 종목을 같은 차트에. 있으면 오른쪽 축을 %로 (각자 화면 첫날 기준)
    const cmps = S.cmp.filter((c) => c.s !== S.sym);
    chart.priceScale("right").applyOptions({ mode: cmps.length ? 2 : 0 });
    if (cmps.length) { const gs = await Promise.all(cmps.map((c) => api(`op=chart&s=${encodeURIComponent(c.s)}&r=${S.r}&i=${S.iv}`).catch(() => null))); const d0 = S.rows[0]?.d;
      cmps.forEach((c, i) => { const rows = (gs[i]?.rows || []).filter((r) => r.c != null && (!d0 || r.d >= d0)); if (!rows.length) return; const se = chart.addLineSeries({ color: CMPC[i % CMPC.length], lineWidth: 2, priceLineVisible: false, title: c.n }); se.setData(rows.map((r) => ({ time: r.d, value: r.c }))); cmpS.push(se); }); }
    renderCmp();
    try { S.draws = (await api("op=draw&s=" + encodeURIComponent(S.sym))).list || []; } catch { S.draws = []; }
    $("cInfo").innerHTML = info(null); paint();
  }
  function marks() {
    if (!main) return;
    if (!S.ev) return main.setMarkers([]);
    if (typeof EVT === "undefined" || !EVT) { if (typeof loadEvents === "function") loadEvents(); clearTimeout(marks.t); marks.t = setTimeout(marks, 2000); return; }
    const d0 = S.rows[0]?.d, d1 = S.rows.at(-1)?.d; if (!d0) return;
    const ds = S.rows.map((r) => r.d);
    main.setMarkers(EVT.filter((e) => e.d >= d0 && e.d <= d1).map((e) => { const t = ds.find((d) => d >= e.d); return { time: t, position: e.g === "좋음" ? "belowBar" : "aboveBar", color: e.g === "좋음" ? up() : dn(), shape: "circle", text: e.t }; }).filter((m) => m.time).sort((a, b) => a.time.localeCompare(b.time)));
  }

  // ── 그림: 점 = {t: 날짜, p: 가격}. 차트를 움직여도 같은 자리에 남아요.
  const toPt = (pt) => { if (!pt || !main) return null; const ts = chart.timeScale(); let t = ts.coordinateToTime(pt.x); if (t == null) { const lg = ts.coordinateToLogical(pt.x); const i = Math.max(0, Math.min(S.rows.length - 1, Math.round(lg ?? 0))); t = S.rows[i]?.d; } const p = main.coordinateToPrice(pt.y); return t && p != null ? { t: typeof t === "string" ? t : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`, p } : null; };
  const toXY = (q) => { const ts = chart.timeScale(); let x = ts.timeToCoordinate(q.t); if (x == null) { const i = S.rows.findIndex((r) => r.d >= q.t); const lg = i < 0 ? S.rows.length - 1 + 1 : i; x = ts.logicalToCoordinate(lg); } const y = main.priceToCoordinate(q.p); return x == null || y == null ? null : { x, y }; };
  function paint() {
    if (!cv || !main) return;
    const box = $("cBox"), W = box.clientWidth, H = box.clientHeight, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    const x = cv.getContext("2d"); x.scale(dpr, dpr); x.clearRect(0, 0, W, H);
    const pw = W - (chart.priceScale("right").width() || 60);
    x.save(); x.beginPath(); x.rect(0, 0, pw, H); x.clip();
    const all = [...S.draws, ...(pend && hoverPt ? [{ ...pend, b: hoverPt, ghost: true }] : [])];
    all.forEach((d) => { const A = toXY(d.a), B = d.b ? toXY(d.b) : null; if (!A) return; x.strokeStyle = x.fillStyle = d.c; x.lineWidth = 1.6; x.globalAlpha = d.ghost ? 0.6 : 1; x.setLineDash([]);
      if (d.k === "hline") { x.beginPath(); x.moveTo(0, A.y); x.lineTo(pw, A.y); x.stroke(); x.font = "11px " + (css("--mono") || "monospace"); x.fillText(fmtN(d.a.p), 4, A.y - 4); }
      else if (d.k === "text") { x.font = "bold 13px system-ui, sans-serif"; x.fillText(d.s || "", A.x, A.y); }
      else if (B && d.k === "line") { x.beginPath(); x.moveTo(A.x, A.y); x.lineTo(B.x, B.y); x.stroke(); [A, B].forEach((P) => { x.beginPath(); x.arc(P.x, P.y, 3, 0, 7); x.fill(); }); }
      else if (B && d.k === "ray") { const dx = B.x - A.x, dy = B.y - A.y, k = dx ? (pw * 2) / Math.abs(dx) : 0; x.beginPath(); x.moveTo(A.x, A.y); x.lineTo(A.x + dx * Math.max(1, k), A.y + dy * Math.max(1, k)); x.stroke(); x.beginPath(); x.arc(A.x, A.y, 3, 0, 7); x.fill(); }
      else if (B && d.k === "box") { x.globalAlpha = (d.ghost ? 0.6 : 1) * 0.15; x.fillRect(A.x, A.y, B.x - A.x, B.y - A.y); x.globalAlpha = d.ghost ? 0.6 : 1; x.strokeRect(A.x, A.y, B.x - A.x, B.y - A.y); const ch = (d.b.p / d.a.p - 1) * 100; x.font = "11px " + (css("--mono") || "monospace"); x.fillText(`${ch > 0 ? "+" : ""}${ch.toFixed(2)}%`, Math.min(A.x, B.x) + 4, Math.min(A.y, B.y) + 13); }
    });
    x.restore();
  }
  const save = () => api("", { op: "draw", s: S.sym, list: S.draws }).catch(() => ($("cMsg").textContent = "그림을 저장하지 못했어요."));
  function hit(pt) { // 지우기: 가까운 그림 찾기
    let best = -1, bd = 10;
    S.draws.forEach((d, i) => { const A = toXY(d.a), B = d.b ? toXY(d.b) : null; if (!A) return; let dist;
      if (d.k === "hline") dist = Math.abs(pt.y - A.y); else if (d.k === "text") dist = Math.hypot(pt.x - A.x - 20, pt.y - A.y + 5) - 15;
      else if (d.k === "box" && B) { const inX = pt.x >= Math.min(A.x, B.x) - 6 && pt.x <= Math.max(A.x, B.x) + 6, inY = pt.y >= Math.min(A.y, B.y) - 6 && pt.y <= Math.max(A.y, B.y) + 6; dist = inX && inY ? Math.min(Math.abs(pt.x - A.x), Math.abs(pt.x - B.x), Math.abs(pt.y - A.y), Math.abs(pt.y - B.y)) : 99; }
      else if (B) { const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1; let u = ((pt.x - A.x) * dx + (pt.y - A.y) * dy) / L2; u = d.k === "ray" ? Math.max(0, u) : Math.max(0, Math.min(1, u)); dist = Math.hypot(pt.x - A.x - u * dx, pt.y - A.y - u * dy); }
      if (dist < bd) { bd = dist; best = i; } });
    return best;
  }
  function onDown(e) {
    const P = { x: e.offsetX, y: e.offsetY }, q = toPt(P); if (!q) return;
    if (S.tool === "del") { const i = hit(P); if (i >= 0) { S.draws.splice(i, 1); save(); paint(); } return; }
    if (S.tool === "hline") { S.draws.push({ k: "hline", a: q, c: S.color }); save(); paint(); return; }
    if (S.tool === "text") { const box = $("cText"); box.hidden = false; box.style.left = P.x + "px"; box.style.top = P.y - 14 + "px"; box.value = ""; box.focus(); box.onkeydown = (ev) => { if (ev.key === "Enter" && box.value.trim()) { S.draws.push({ k: "text", a: q, s: box.value.trim().slice(0, 60), c: S.color }); box.hidden = true; save(); paint(); } if (ev.key === "Escape") box.hidden = true; }; box.onblur = () => (box.hidden = true); return; }
    if (!pend) { pend = { k: S.tool, a: q, c: S.color }; hoverPt = q; return; }
    S.draws.push({ k: pend.k, a: pend.a, b: q, c: pend.c }); pend = null; save(); paint();
  }
  function setTool(t) { S.tool = t; pend = null; cv.style.pointerEvents = t === "cur" ? "none" : "auto"; cv.style.cursor = t === "del" ? "not-allowed" : "crosshair"; $("cHelp").textContent = { cur: "휠로 확대·축소, 끌어서 이동, 축을 끌면 늘이기", line: "두 점을 차례로 클릭 (Esc 취소)", ray: "시작점과 방향을 클릭하면 오른쪽 끝까지 이어져요", hline: "가격 높이를 한 번 클릭", box: "두 모서리를 클릭 (안에 상승·하락률 표시)", text: "클릭하고 글자를 쓴 뒤 Enter", del: "지울 그림을 클릭" }[t]; ui(); paint(); }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cr],[data-ci],[data-ct],[data-cma],[data-cev],[data-tool],[data-ccol],[data-cclear]"); if (!b || !$("chart") || $("chart").hidden) return;
    if (b.dataset.cr) { S.r = b.dataset.cr; ls.set("stk-cr", S.r); ui(); return load(); }
    if (b.dataset.ci) { S.iv = b.dataset.ci; ls.set("stk-ci", S.iv); ui(); return load(); }
    if (b.dataset.ct) { S.type = b.dataset.ct; ls.set("stk-ct", S.type); ui(); return load(); }
    if (b.dataset.cma) { const n = +b.dataset.cma; S.ma = S.ma.includes(n) ? S.ma.filter((x) => x !== n) : [...S.ma, n]; ls.set("stk-cma", S.ma); ui(); return load(); }
    if (b.dataset.cev) { S.ev = !S.ev; ls.set("stk-cev", S.ev); ui(); return marks(); }
    if (b.dataset.tool) return setTool(b.dataset.tool);
    if (b.dataset.ccol) { S.color = b.dataset.ccol; return ui(); }
    if (b.dataset.cclear) { if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "정말 모두 지울까요?"; return; } S.draws = []; save(); ui(); paint(); }
  });
  // 이름·코드·티커로 찾기 (한글 종목명 가능)
  async function find(enter, cmp) {
    const qi = $(cmp ? "cCmpQ" : "cQ"), box = $(cmp ? "cCmpPick" : "cPick"), v = qi.value.trim(); if (!v) { box.hidden = true; return; }
    if (!enter && v.length < 2) return;
    $("cMsg").textContent = "찾는 중…";
    try { const { list } = await api("op=find&q=" + encodeURIComponent(v)); if (qi.value.trim() !== v) return; $("cMsg").textContent = list.length ? "" : "못 찾았어요. 다른 이름이나 코드로 넣어 보세요.";
      if (enter && list.length === 1) { box.hidden = true; qi.value = ""; return cmp ? addCmp(list[0].s, list[0].n) : go(list[0].s, list[0].n); }
      box.innerHTML = list.map((x) => `<button type="button" data-cpick="${esc(x.s)}" data-cn="${esc(x.n)}"${cmp ? ' data-cmp="1"' : ""}><b>${esc(x.n)}</b> <span class="note">${esc(x.s)}${x.k ? " · " + esc(x.k) : ""}</span></button>`).join(""); box.hidden = !list.length;
    } catch { $("cMsg").textContent = "찾지 못했어요."; }
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-cpick]"); if (b) { const cmp = !!b.dataset.cmp; $(cmp ? "cCmpPick" : "cPick").hidden = true; $(cmp ? "cCmpQ" : "cQ").value = ""; return cmp ? addCmp(b.dataset.cpick, b.dataset.cn) : go(b.dataset.cpick, b.dataset.cn); }
    if (!e.target.closest("#cFind")) { const p = $("cPick"); if (p) p.hidden = true; } if (!e.target.closest("#cCmpF")) { const p = $("cCmpPick"); if (p) p.hidden = true; }
    const x = e.target.closest("[data-cmpdel]"); if (x) { S.cmp = S.cmp.filter((c) => c.s !== x.dataset.cmpdel); ls.set("stk-ccmp", S.cmp); load(); }
    const q = e.target.closest("[data-cmpq]"); if (q) addCmp(q.dataset.cmpq, q.textContent); });
  function addCmp(s, n) { if (s === S.sym || S.cmp.some((c) => c.s === s)) return; S.cmp = [...S.cmp, { s, n }].slice(0, 6); ls.set("stk-ccmp", S.cmp); load(); }
  function renderCmp() {
    const box = $("cCmp"); if (!box) return; const cm = S.cmp.filter((c) => c.s !== S.sym);
    box.innerHTML = `<span class="note">겹쳐 보기</span>` + cm.map((c, i) => `<span class="leg"><i style="background:${CMPC[i % CMPC.length]}"></i>${esc(c.n)}<button type="button" data-cmpdel="${esc(c.s)}" aria-label="빼기">✕</button></span>`).join("") +
      `<form id="cCmpF" class="row" style="gap:4px;margin:0;position:relative"><input id="cCmpQ" placeholder="+ 겹칠 종목 이름·코드" style="width:180px" autocomplete="off"><div id="cCmpPick" class="cpick" hidden></div></form>` +
      (cm.length ? `<span class="note">축이 %로 바뀌었어요 (화면 첫날 0%)</span>` : QUICK.filter((q) => q[0] !== S.sym).slice(0, 5).map(([s, n]) => `<button type="button" class="pill" data-cmpq="${esc(s)}">${esc(n)}</button>`).join(""));
    $("cCmpF").onsubmit = (e) => { e.preventDefault(); find(true, true); }; $("cCmpQ").oninput = () => { clearTimeout(find.c); find.c = setTimeout(() => find(false, true), 350); };
  }
  function go(sym, name) { S.sym = sym; S.name = name; ls.set("stk-cs", sym); ls.set("stk-cn", name); pend = null; ui(); load(); }
  window.openChartTab = () => { if (typeof LightweightCharts === "undefined") { $("cMsg").textContent = "차트 도구를 불러오는 중…"; return setTimeout(window.openChartTab, 400); } if (!booted) { booted = true; ui(); $("cSym").onchange = () => go($("cSym").value, $("cSym").selectedOptions[0].textContent); $("cFind").onsubmit = (e) => { e.preventDefault(); find(true); }; $("cQ").oninput = () => { clearTimeout(find.t); find.t = setTimeout(() => find(false), 350); }; load(); setTool("cur"); } else requestAnimationFrame(paint); };
  // 다른 탭의 차트에서 "차트 탭에서 크게" 로 열 때
  window.chartOpen = (sym, name) => { S.sym = sym; S.name = name || sym; ls.set("stk-cs", sym); ls.set("stk-cn", S.name); if (booted) { ui(); load(); } };
})();
if ($("chart") && !$("chart").hidden) window.openChartTab();
