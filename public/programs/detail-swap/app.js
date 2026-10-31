// 쇼핑몰 상페 교체 (psd버전)
// 틀 = PSD 합친 그림(조각 JPG) + '바뀌는 구역'마다 그 구역에 걸친 레이어들(PNG)과 칸(사진·글·반복 사진).
// 바꿀 때는 합친 그림 위에 바뀌는 구역만 레이어 순서대로 다시 그려요. 그래서 바뀌지 않는 곳은 포토샵 효과까지 그대로예요.
const $ = (id) => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = (n = 12) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.round(n / 1024) + "KB");
const cv = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const say = (el, t, cls = "") => { el.textContent = t; el.className = "msg " + cls; };
const COLORS = { img: "var(--img)", text: "var(--txt)", rep: "var(--rep)" };
const KIND = { img: "사진 칸", text: "글 칸", rep: "반복 사진" };

// ── 들어가기: 관리자 키 또는 공유 주소(?k=)
let adminKey = (() => { try { return localStorage.getItem("ai-admin-key") || ""; } catch { return ""; } })();
let shareKey = new URLSearchParams(location.search).get("k") || ls.get("ds-share", "");
if (new URLSearchParams(location.search).get("k")) ls.set("ds-share", shareKey);
let role = "", TPLS = [], FONTS = [], KEYS = [];
const authH = () => (adminKey ? { "x-admin-key": adminKey } : shareKey ? { "x-share-key": shareKey } : {});
async function api(body) {
  const r = await fetch("/api/detail", body ? { method: "POST", headers: { "Content-Type": "application/json", ...authH() }, body: JSON.stringify(body) } : { headers: authH() });
  if (r.status === 401) { gateOpen(); throw new Error("auth"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "fail");
  return j;
}
function gateOpen() { $("gate").hidden = false; $("tabs").hidden = true; ["use", "make", "font", "share"].forEach((t) => ($(t).hidden = true)); }
$("keyForm").onsubmit = async (e) => { e.preventDefault(); adminKey = $("keyIn").value.trim(); try { localStorage.setItem("ai-admin-key", adminKey); } catch {} await boot(); };
async function boot() {
  if (!adminKey && !shareKey) return gateOpen();
  try { const j = await api(); role = j.role; TPLS = j.tpls; FONTS = j.fonts; KEYS = j.keys || []; } catch (e) { if (e.message !== "auth") alertBox("불러오지 못했어요. 새로고침해 주세요."); return; }
  $("gate").hidden = true; $("tabs").hidden = false;
  $$('[data-tab="share"]')[0].hidden = role !== "admin";
  showTab(ls.get("ds-tab", "use"));
  renderTplCards(); renderTplList(); renderFonts(); renderKeys();
  FONTS.forEach(loadFont);
}
function alertBox(t) { const p = document.createElement("p"); p.className = "msg no"; p.textContent = t; document.querySelector("main").prepend(p); }
function showTab(t) {
  if (t === "share" && role !== "admin") t = "use";
  ls.set("ds-tab", t);
  $$("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tab === t));
  ["use", "make", "font", "share"].forEach((x) => ($(x).hidden = x !== t));
}
$$("[data-tab]").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

// ── 파일 저장소: 조각으로 올리고 받기
const CH = 600_000, blobCache = new Map();
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
async function putBlob(blob, type) {
  const id = uid(), u8 = new Uint8Array(await blob.arrayBuffer()), n = Math.max(1, Math.ceil(u8.length / CH));
  for (let i = 0; i < n; i++) await api({ op: "put", id, i, n, type: type || blob.type || "application/octet-stream", size: u8.length, data: b64(u8.subarray(i * CH, (i + 1) * CH)) });
  blobCache.set(id, Promise.resolve(new Blob([u8], { type })));
  return id;
}
function getBlob(id) {
  if (!blobCache.has(id)) blobCache.set(id, (async () => {
    const one = async (i) => { const r = await fetch(`/api/detail?b=${id}&i=${i}`, { headers: authH() }); if (!r.ok) throw new Error("blob"); return r; };
    const r0 = await one(0), n = Number(r0.headers.get("X-Parts")) || 1, type = r0.headers.get("X-Type") || "";
    const parts = [await r0.arrayBuffer(), ...(await Promise.all(Array.from({ length: n - 1 }, (_, i) => one(i + 1).then((r) => r.arrayBuffer()))))];
    return new Blob(parts, { type });
  })().catch((e) => { blobCache.delete(id); throw e; }));
  return blobCache.get(id);
}
const bmpCache = new Map();
const bmp = (id) => { if (!bmpCache.has(id)) bmpCache.set(id, getBlob(id).then((b) => createImageBitmap(b))); return bmpCache.get(id); };
const toBlob = (c, type = "image/png", q) => new Promise((ok) => c.toBlob(ok, type, q));

// ── 글꼴
const fontReady = new Map();
function loadFont(f) {
  if (!fontReady.has(f.id)) fontReady.set(f.id, getBlob(f.blob).then((b) => b.arrayBuffer()).then((buf) => { const ff = new FontFace("ds_" + f.id, buf); document.fonts.add(ff); return ff.load(); }).catch(() => null));
  return fontReady.get(f.id);
}
function fontNames(buf) {
  try { const f = opentype.parse(buf), n = f.names; const g = (x) => x?.en || x?.ko || (x && Object.values(x)[0]) || ""; return { ps: g(n.postScriptName), family: g(n.preferredFamily) || g(n.fontFamily), name: g(n.fullName) }; } catch { return {}; }
}
async function addFonts(files) {
  const m = $("fontMsg"); let ok = 0;
  for (const file of files) {
    if (file.size > 20 * 1048576) { say(m, `${file.name}: 20MB보다 커서 못 올려요.`, "no"); continue; }
    say(m, `${file.name} 올리는 중…`);
    try {
      const buf = await file.arrayBuffer(), nm = fontNames(buf);
      const type = /\.otf$/i.test(file.name) ? "font/otf" : /\.woff2$/i.test(file.name) ? "font/woff2" : /\.woff$/i.test(file.name) ? "font/woff" : "font/ttf";
      const blob = await putBlob(new Blob([buf], { type }), type);
      const { font } = await api({ op: "font", blob, file: file.name, ps: nm.ps || file.name.replace(/\.\w+$/, ""), family: nm.family || "", name: nm.name || file.name.replace(/\.\w+$/, "") });
      FONTS.unshift(font); loadFont(font); ok++;
    } catch { say(m, `${file.name} 올리기에 실패했어요.`, "no"); }
  }
  if (ok) say(m, `글꼴 ${ok}개를 올렸어요.`, "ok");
  renderFonts(); if (cur) renderFields();
}
// PSD에 쓰인 글꼴: 글 칸에 쓰이면 '필요', 칸이 아니면 원래 그림 그대로라 없어도 됨
function psdFonts() {
  const m = new Map();
  P.leaves.forEach((l) => {
    if (!l.text) return;
    const names = [l.text.style?.font?.name, ...(l.text.styleRuns || []).map((r) => r.style?.font?.name)].filter(Boolean);
    const slot = P.slots.get(l.i)?.kind === "text";
    new Set(names).forEach((ps) => { const o = m.get(ps) || { ps, slot: false, n: 0 }; o.n++; o.slot ||= slot; m.set(ps, o); });
  });
  return [...m.values()];
}
function renderNeeds() {
  const el = $("fontNeed"); if (!el) return;
  const m = new Map(), add = (ps, slot, where) => { const o = m.get(ps) || { ps, slot: false, where: new Set() }; o.slot ||= slot; o.where.add(where); m.set(ps, o); };
  if (P) psdFonts().forEach((f) => add(f.ps, f.slot, `지금 연 PSD (${P.name})`));
  TPLS.forEach((t) => (t.fonts || []).forEach((f) => add(f.ps, f.slot, `틀 '${t.name}'`)));
  const rows = [...m.values()].map((o) => ({ ...o, f: autoFont(o.ps) })).sort((a, b) => (a.f ? 2 : a.slot ? 0 : 1) - (b.f ? 2 : b.slot ? 0 : 1) || a.ps.localeCompare(b.ps));
  const need = rows.filter((r) => r.slot && !r.f).length;
  $("fontNeedSum").textContent = rows.length ? `${rows.length}개 · 올림 ${rows.filter((r) => r.f).length} · 필요 ${need}` : "";
  el.innerHTML = rows.length ? rows.map((r) => `<div class="li"><span class="g"><b>${esc(r.ps)}</b><br><span class="note">${esc([...r.where].join(", "))}</span></span>${r.f ? `<span class="chip" style="--c:var(--good)">올림 · ${esc(r.f.name)}</span>` : r.slot ? `<span class="chip" style="--c:var(--bad)">필요 · 글 칸에 쓰여요</span>` : `<span class="chip" style="--c:var(--muted)">없어도 돼요 · 칸이 아니라 원래 그림 그대로</span>`}</div>`).join("")
    : `<p class="note">아직 읽은 PSD가 없어요. ② 틀 만들기에서 PSD를 열면 쓰인 글꼴이 여기 나와요.</p>`;
}
function renderFonts() {
  renderNeeds();
  $("fontList").innerHTML = FONTS.length ? FONTS.map((f) => `<div class="li"><span class="g"><b style="font-family:'ds_${f.id}'">${esc(f.name)} 가나다 ABC 123</b><br><span class="note">포토샵 이름: ${esc(f.ps)} · ${esc(f.file)}</span></span><button type="button" class="btn g s danger" data-delfont="${f.id}">지우기</button></div>`).join("") : `<p class="note">아직 올린 글꼴이 없어요. 없으면 기본 글꼴(Noto Sans KR)로 써요.</p>`;
}
const pickDrop = (drop, input, fn) => {
  input.onchange = () => { fn([...input.files]); input.value = ""; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("on"); };
  drop.ondragleave = () => drop.classList.remove("on");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("on"); fn([...e.dataTransfer.files]); };
};
pickDrop($("fontDrop"), $("fontIn"), addFonts);
document.addEventListener("click", async (e) => {
  const d = e.target.closest("[data-delfont]"); if (!d) return;
  if (d.dataset.sure !== "1") { d.dataset.sure = "1"; d.textContent = "한 번 더 누르면 지워요"; return; }
  await api({ op: "delfont", id: d.dataset.delfont }).catch(() => {}); FONTS = FONTS.filter((f) => f.id !== d.dataset.delfont); renderFonts();
});
// 포토샵 글꼴 이름 → 굵기 짐작 (기본 글꼴로 쓸 때)
const weightOf = (n = "") => /black|heavy|900/i.test(n) ? 900 : /extrabold|xbold|ultrabold|eb\b|800|OTFEB|OTFX/i.test(n) ? 800 : /bold|\bb\b|OTFB|[-_ ]?B$|700|Bd/i.test(n) ? 700 : /semibold|demi|600/i.test(n) ? 600 : /medium|500|[-_ ]?M$/i.test(n) ? 500 : /light|thin|300|[-_ ]?L$/i.test(n) ? 300 : 400;
const autoFont = (ps) => { const n = String(ps || "").toLowerCase(); return FONTS.find((f) => f.ps && f.ps.toLowerCase() === n) || FONTS.find((f) => n && (f.name.toLowerCase().replace(/\s/g, "") === n.replace(/[\s-]/g, "") || f.family.toLowerCase().replace(/\s/g, "") === n.replace(/[\s-]/g, ""))); };

// ── PSD 읽기 (틀 만들기)
let P = null; // { psd, w, h, leaves:[{i,name,path,layer,x,y,w,h,canvas,op,blend,clip,text,hidden,depth}], slots:Map(leafIndex → {kind,label,rep}) }
let selLeaf = -1;
pickDrop($("psdDrop"), $("psdIn"), (fs) => fs[0] && openPsd(fs[0]));
async function openPsd(file) {
  const m = $("psdMsg");
  if (!/\.ps[db]$/i.test(file.name)) return say(m, "PSD 파일을 골라 주세요.", "no");
  say(m, `${file.name} 읽는 중… (큰 파일은 몇십 초 걸려요)`);
  await new Promise((r) => setTimeout(r, 30));
  try {
    const psd = agPsd.readPsd(await file.arrayBuffer(), { skipThumbnail: true });
    const leaves = [], files = [...(psd.linkedFiles || [])]; let soOpen = 0, soKeep = 0;
    // S = 고급 개체 안일 때 { map:{sx,sy,ox,oy}, rect, clipAll, blend } (안쪽 좌표 → 문서 좌표)
    const walk = (list, path, op, hidden, depth, S) => (list || []).forEach((ly) => {
      const h = hidden || ly.hidden, o = op * (ly.opacity ?? 1);
      if (ly.children) { walk(ly.children, [...path, ly.name], o, h, depth + 1, S); return; }
      if (ly.placedLayer) {
        const sub = openSO(ly, files, S);
        if (sub) { soOpen++; walk(sub.psd.children, [...path, "▣ " + (ly.name || "고급 개체")], o, h, depth + 1, sub.S); return; }
        soKeep++;
      }
      let x = ly.left ?? 0, y = ly.top ?? 0, w = (ly.right ?? 0) - x, hh = (ly.bottom ?? 0) - y, canvas = maskedCanvas(ly);
      if (S) { const pc = canvas && placeIn(canvas, x, y, S); const b = mapBox(x, y, w, hh, S); canvas = pc?.canvas || null; ({ x, y, w, h: hh } = pc || b); }
      const blend = blendOf(ly.blendMode);
      leaves.push({ i: leaves.length, name: ly.name || "(이름 없음)", path, layer: ly, x, y, w, h: hh, canvas, op: o, blend: S && blend === "source-over" ? S.blend : blend, clip: S?.clipAll || !!ly.clipping, text: ly.text || null, hidden: h, depth, adj: !ly.canvas && !ly.text, so: !!ly.placedLayer, S });
    });
    walk(psd.children, [], 1, false, 0, null);
    if (!psd.canvas) { psd.canvas = cv(psd.width, psd.height); const ctx = psd.canvas.getContext("2d"); leaves.forEach((l) => { if (!l.hidden && l.canvas) { ctx.globalAlpha = l.op; ctx.drawImage(l.canvas, l.x, l.y); } }); }
    P = { psd, name: file.name, w: psd.width, h: psd.height, leaves, slots: new Map() };
    selLeaf = -1;
    $("tplName").value = file.name.replace(/\.ps[db]$/i, "");
    $("mk").hidden = false;
    const c = $("mkc"); c.width = P.w; c.height = P.h; c.getContext("2d").drawImage(psd.canvas, 0, 0);
    $("mkNote").textContent = `${P.w}×${P.h}px · 레이어 ${leaves.length}개`;
    say(m, `다 읽었어요. 레이어 ${leaves.length}개 (글자 ${leaves.filter((l) => l.text).length}개)${soOpen ? ` · 고급 개체 ${soOpen}개 펼침` : ""}${soKeep ? ` · 고급 개체 ${soKeep}개는 통째로 (사진이거나 기울어져 있어서)` : ""}.${psd.canvas ? "" : " 합친 그림이 없어 레이어로 다시 그렸어요."}`, "ok");
    const auto = autoSlots();
    m.textContent += ` 글 칸 ${auto.ti}개, 사진 칸 ${auto.ii}개를 알아서 정했어요. 필요 없는 칸은 눌러서 '칸 아님'으로 빼 주세요.`;
    renderLayers(); renderOverlay(); renderSlotSet();
  } catch (e) { console.error(e); say(m, "PSD를 읽지 못했어요. 포토샵에서 '호환성 최대화'를 켜고 다시 저장해 보세요.", "no"); }
}
const BLEND = { normal: "source-over", multiply: "multiply", screen: "screen", overlay: "overlay", darken: "darken", lighten: "lighten", "color dodge": "color-dodge", "color burn": "color-burn", "hard light": "hard-light", "soft light": "soft-light", difference: "difference", exclusion: "exclusion", hue: "hue", saturation: "saturation", color: "color", luminosity: "luminosity", "linear dodge": "lighter" };
const blendOf = (b) => BLEND[b] || "source-over";
// 레이어 마스크를 적용한 그림 (마스크는 밝기 → 투명도)
function maskedCanvas(ly) {
  if (!ly.canvas) return null;
  const m = ly.mask;
  if (!m || !m.canvas || m.disabled) return ly.canvas;
  const x = ly.left ?? 0, y = ly.top ?? 0, c = cv(ly.canvas.width, ly.canvas.height), ctx = c.getContext("2d");
  const a = cv(c.width, c.height), actx = a.getContext("2d");
  actx.fillStyle = `rgba(0,0,0,${(m.defaultColor ?? 0) / 255})`; actx.fillRect(0, 0, a.width, a.height);
  const mc = cv(m.canvas.width, m.canvas.height), mctx = mc.getContext("2d"); mctx.drawImage(m.canvas, 0, 0);
  const d = mctx.getImageData(0, 0, mc.width, mc.height); for (let i = 0; i < d.data.length; i += 4) { d.data[i + 3] = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 0; } mctx.putImageData(d, 0, 0);
  actx.clearRect((m.left ?? 0) - x, (m.top ?? 0) - y, mc.width, mc.height); actx.drawImage(mc, (m.left ?? 0) - x, (m.top ?? 0) - y);
  ctx.drawImage(ly.canvas, 0, 0); ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(a, 0, 0);
  return c;
}
// 고급 개체: 안에 든 PSD를 꺼내 레이어를 하나씩 펼침 (반듯하게 놓인 것만. 기울이기·뒤틀기는 통째로)
function openSO(ly, files, S) {
  const pl = ly.placedLayer, f = files.find((x) => x.id === pl.id), d = f?.data;
  if (!d || d.length < 26 || String.fromCharCode(d[0], d[1], d[2], d[3]) !== "8BPS") return null;
  const t = pl.transform || [], near = (a, b) => Math.abs(a - b) < 0.6;
  if (t.length < 8 || !near(t[1], t[3]) || !near(t[5], t[7]) || !near(t[0], t[6]) || !near(t[2], t[4]) || t[2] <= t[0] || t[7] <= t[1]) return null;
  if (!flatWarp(pl.warp)) return null;
  if (pl.nonAffineTransform && pl.nonAffineTransform.some((v, k) => !near(v, t[k]))) return null;
  let psd; try { psd = agPsd.readPsd(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength), { skipThumbnail: true, skipCompositeImageData: true }); } catch (e) { console.warn("고급 개체를 못 열었어요", ly.name, e); return null; }
  if (!psd.width || !psd.height || !psd.children?.length) return null;
  (psd.linkedFiles || []).forEach((x) => files.push(x));
  const m = { sx: (t[2] - t[0]) / psd.width, sy: (t[7] - t[1]) / psd.height, ox: t[0], oy: t[1] };
  const M = S ? { sx: m.sx * S.map.sx, sy: m.sy * S.map.sy, ox: S.map.ox + m.ox * S.map.sx, oy: S.map.oy + m.oy * S.map.sy } : m;
  const r = { x: Math.round(M.ox), y: Math.round(M.oy), w: Math.round(psd.width * M.sx), h: Math.round(psd.height * M.sy) };
  const R = S ? (() => { const x0 = Math.max(r.x, S.rect.x), y0 = Math.max(r.y, S.rect.y); return { x: x0, y: y0, w: Math.max(0, Math.min(r.x + r.w, S.rect.x + S.rect.w) - x0), h: Math.max(0, Math.min(r.y + r.h, S.rect.y + S.rect.h) - y0) }; })() : r;
  const b = blendOf(ly.blendMode);
  return { psd, S: { map: M, rect: R, clipAll: S?.clipAll || !!ly.clipping, blend: b !== "source-over" ? b : S?.blend || "source-over" } };
}
// 뒤틀기가 없거나, 있어도 반듯한 그대로인지
function flatWarp(w) {
  if (!w || !w.style || /none/i.test(w.style)) return true;
  if (w.style !== "custom") return !w.value;
  const pts = w.customEnvelopeWarp?.meshPoints, u = w.uOrder || 4, v = w.vOrder || 4, bd = w.bounds;
  if (!pts || pts.length !== u * v || !bd) return false;
  const L = bd.left?.value ?? 0, T = bd.top?.value ?? 0, R = bd.right?.value ?? 0, B = bd.bottom?.value ?? 0, tol = Math.max(1, (R - L + B - T) / 400);
  return pts.every((p, k) => Math.abs(p.x - (L + (R - L) * (k % u) / (u - 1))) < tol && Math.abs(p.y - (T + (B - T) * Math.floor(k / u) / (v - 1))) < tol);
}
function mapBox(x, y, w, h, S) { const M = S.map; return { x: Math.round(M.ox + x * M.sx), y: Math.round(M.oy + y * M.sy), w: Math.round(w * M.sx), h: Math.round(h * M.sy) }; }
// 안쪽 그림을 문서 크기·자리로 옮기고 고급 개체 테두리 밖은 자름
function placeIn(src, left, top, S) {
  const M = S.map, R = S.rect, x = M.ox + left * M.sx, y = M.oy + top * M.sy, w = src.width * M.sx, h = src.height * M.sy;
  const x0 = Math.max(Math.floor(x), R.x), y0 = Math.max(Math.floor(y), R.y), x1 = Math.min(Math.ceil(x + w), R.x + R.w), y1 = Math.min(Math.ceil(y + h), R.y + R.h);
  if (x1 <= x0 || y1 <= y0) return null;
  const c = cv(x1 - x0, y1 - y0), ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, x - x0, y - y0, w, h);
  return { canvas: c, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// 레이어 자체 마스크 모양 (사진 칸 테두리용)
function ownMaskOf(l) {
  const ly = l.layer, lw = (ly.right ?? 0) - (ly.left ?? 0), lh = (ly.bottom ?? 0) - (ly.top ?? 0);
  const full = cv(Math.max(1, lw), Math.max(1, lh)); full.getContext("2d").fillRect(0, 0, full.width, full.height);
  const mk = maskedCanvas({ ...ly, canvas: full });
  if (!l.S) return { c: mk, x: l.x, y: l.y };
  const p = placeIn(mk, ly.left ?? 0, ly.top ?? 0, l.S); return p ? { c: p.canvas, x: p.x, y: p.y } : null;
}
const baseOf = (l) => { if (!l.clip) return null; for (let j = l.i - 1; j >= 0; j--) { const b = P.leaves[j]; if (!b.clip) return b; } return null; };
// 사진 칸이 채워질 자리: 클리핑이면 바닥 레이어 모양, 마스크가 있으면 그 범위, 아니면 레이어 크기
function areaOf(l) {
  const b = baseOf(l);
  if (b) return { x: b.x, y: b.y, w: b.w, h: b.h, mask: "base" };
  return { x: l.x, y: l.y, w: l.w, h: l.h, mask: l.layer.mask && !l.layer.mask.disabled ? "own" : "" };
}
function textInfo(l) {
  const T = l.text, M = l.S?.map;
  const tr = T.transform ? (M ? [T.transform[0] * M.sx, T.transform[1] * M.sy, T.transform[2] * M.sx, T.transform[3] * M.sy, M.ox + T.transform[4] * M.sx, M.oy + T.transform[5] * M.sy] : T.transform) : [1, 0, 0, 1, l.x, l.y];
  const sc = Math.hypot(tr[2], tr[3]) || 1;
  const st = T.style || {}, ps = T.paragraphStyle || {};
  const lines = String(T.text || "").replace(/\r\n|\r/g, "\n").replace(/\n$/, "").split("\n");
  const size = (st.fontSize || Math.max(8, l.h / Math.max(1, lines.length) / 1.2)) * sc;
  const col = st.fillColor && "r" in st.fillColor ? `rgb(${Math.round(st.fillColor.r)},${Math.round(st.fillColor.g)},${Math.round(st.fillColor.b)})` : "#222";
  const lead = st.autoLeading === false && st.leading ? st.leading * sc : size * 1.2;
  const just = ["center", "right"].includes(ps.justification) ? ps.justification : "left";
  const o = { text: lines.join("\n"), lines: lines.length, ps: st.font?.name || "", size: +size.toFixed(2), color: col, lead: +lead.toFixed(2), just, track: st.tracking ? +(st.tracking / 1000 * size).toFixed(2) : 0, ax: tr[4], ay: tr[5] };
  if (T.shapeType === "box" && T.boxBounds) { const [bl, bt, br] = T.boxBounds; o.box = { x: tr[4] + bl * sc, y: tr[5] + bt * sc, w: (br - bl) * sc }; }
  if (T.styleRuns?.length > 1) o.mixed = true;
  return o;
}

function renderLayers() {
  if (!P) return;
  renderNeeds();
  const q = $("layerQ").value.trim().toLowerCase();
  const rows = [...P.leaves].reverse().filter((l) => !q || (l.name + " " + l.path.join(" ")).toLowerCase().includes(q));
  $("layerList").innerHTML = rows.map((l) => {
    const s = P.slots.get(l.i), k = s?.kind;
    return `<div class="ly${l.i === selLeaf ? " sel" : ""}" data-leaf="${l.i}" style="padding-left:${8 + l.depth * 12}px${l.hidden ? ";opacity:.45" : ""}"><span class="ic">${l.text ? "T" : l.adj ? "◐" : "▣"}</span><span class="nm">${l.clip ? "↳ " : ""}${esc(l.name)}${l.path.length ? ` <span class="gp">· ${esc(l.path[l.path.length - 1])}</span>` : ""}</span>${k ? `<span class="chip" style="--c:${COLORS[k]}">${esc(s.label || KIND[k])}</span>` : ""}</div>`;
  }).join("") || `<p class="note" style="padding:8px">맞는 레이어가 없어요.</p>`;
}
$("layerQ").oninput = renderLayers;
$("layerList").onclick = (e) => { const r = e.target.closest("[data-leaf]"); if (!r) return; selLeaf = +r.dataset.leaf; renderLayers(); renderOverlay(); renderSlotSet(); };
// 미리보기를 누르면 그 자리 맨 위 레이어
$("mkWrap").onclick = (e) => {
  if (!P) return;
  const c = $("mkc"), r = c.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * P.w, y = ((e.clientY - r.top) / r.height) * P.h;
  for (let j = P.leaves.length - 1; j >= 0; j--) {
    const l = P.leaves[j]; if (l.hidden || !l.canvas || x < l.x || y < l.y || x >= l.x + l.w || y >= l.y + l.h) continue;
    try { if (l.canvas.getContext("2d").getImageData(Math.floor(x - l.x), Math.floor(y - l.y), 1, 1).data[3] < 10) continue; } catch {}
    if (l.w >= P.w * 0.98 && l.h >= P.h * 0.5) continue; // 배경 레이어는 건너뜀
    selLeaf = j; renderLayers(); renderOverlay(); renderSlotSet();
    $$(`#layerList [data-leaf="${j}"]`)[0]?.scrollIntoView({ block: "nearest" });
    return;
  }
};
function renderOverlay() {
  $$("#mkWrap .ov").forEach((o) => o.remove());
  if (!P) return;
  const add = (l, s, sel) => {
    const a = s && s.kind !== "text" ? areaOf(l) : l, d = document.createElement("div");
    d.className = "ov" + (sel ? " sel" : ""); d.style.setProperty("--c", s ? COLORS[s.kind] : "var(--yellow)");
    Object.assign(d.style, { left: (a.x / P.w) * 100 + "%", top: (a.y / P.h) * 100 + "%", width: (a.w / P.w) * 100 + "%", height: (a.h / P.h) * 100 + "%" });
    d.innerHTML = `<b>${esc(s ? s.label || KIND[s.kind] : l.name)}</b>`; $("mkWrap").appendChild(d);
  };
  P.slots.forEach((s, i) => add(P.leaves[i], s, i === selLeaf));
  if (selLeaf >= 0 && !P.slots.has(selLeaf)) add(P.leaves[selLeaf], null, true);
}
function renderSlotSet() {
  const box = $("slotSet");
  if (!P || selLeaf < 0) { box.hidden = true; return; }
  const l = P.leaves[selLeaf], s = P.slots.get(selLeaf), k = s?.kind || "";
  const reps = [...new Set([...P.slots.values()].filter((x) => x.kind === "rep").map((x) => x.rep))];
  const kinds = l.text ? [["", "칸 아님"], ["text", "글 칸"], ["img", "사진 칸"]] : [["", "칸 아님"], ["img", "사진 칸"], ["rep", "반복 사진"]];
  box.hidden = false;
  box.innerHTML = `<div><b>${esc(l.name)}</b> <span class="note">${l.w}×${l.h}px${l.clip ? " · 아래 레이어 모양에 맞춰 들어가요" : ""}${l.text ? " · 글자 레이어" : ""}</span></div>
    <div class="seg" role="group" aria-label="칸 종류">${kinds.map(([v, n]) => `<button type="button" data-kind="${v}" aria-pressed="${k === v}">${n}</button>`).join("")}</div>
    ${k ? `<label class="note" style="margin:0">칸 이름 (교체 화면 질문)<input type="text" id="slotLabel" value="${esc(s.label)}" placeholder="${k === "text" ? "예: 상품명, 사이즈표" : "예: 메인 사진"}" style="width:100%;margin-top:4px"></label>` : ""}
    ${k === "rep" ? `<label class="note" style="margin:0">반복 묶음 이름 (같은 이름끼리 한 묶음)<input type="text" id="slotRep" value="${esc(s.rep)}" list="repNames" style="width:100%;margin-top:4px"></label><datalist id="repNames">${reps.map((r) => `<option value="${esc(r)}">`).join("")}</datalist><p class="note" style="margin:0">같은 묶음에 사진 칸을 여러 개(한 줄 또는 여러 줄) 넣어 두면, 사진을 더 올릴 때 줄이 아래로 늘어나고 덜 올리면 줄어요.</p>` : ""}
    ${k === "text" ? (() => { const t = textInfo(l), f = autoFont(t.ps); return `<p class="note" style="margin:0">글꼴: ${esc(t.ps || "알 수 없음")} ${f ? `→ 올린 글꼴 <b>${esc(f.name)}</b>` : "→ 올린 글꼴 없음 (③ 글꼴에서 올리면 저절로 맞춰져요)"} · ${Math.round(t.size)}px${t.mixed ? " · 한 칸에 여러 글꼴·색이 섞여 있어서 첫 글자 모양으로 써요" : ""}</p>`; })() : ""}`;
}
$("slotSet").onclick = (e) => {
  const b = e.target.closest("[data-kind]"); if (!b) return;
  const l = P.leaves[selLeaf], k = b.dataset.kind;
  if (!k) P.slots.delete(selLeaf);
  else { const old = P.slots.get(selLeaf); const n = [...P.slots.values()].filter((x) => x.kind === k).length + 1; P.slots.set(selLeaf, { kind: k, label: old?.kind === k ? old.label : k === "text" ? (l.text?.text || l.name).replace(/\s+/g, " ").slice(0, 16) : k === "rep" ? `반복 사진` : `사진 ${n}`, rep: old?.rep || (k === "rep" ? "반복1" : "") }); }
  renderLayers(); renderOverlay(); renderSlotSet();
};
$("slotSet").oninput = (e) => {
  const s = P.slots.get(selLeaf); if (!s) return;
  if (e.target.id === "slotLabel") s.label = e.target.value; if (e.target.id === "slotRep") s.rep = e.target.value.trim() || "반복1";
  renderLayers(); renderOverlay();
};
// PSD를 열면 알아서: 글자는 글 칸, 사진은 사진 칸 (같은 크기 사진이 같은 그룹에 여럿이면 반복 사진). 빼는 건 이현님이.
const txtLabel = (l) => (l.text.text || l.name).replace(/\s+/g, " ").trim().slice(0, 16) || l.name;
function flatColor(c) { // 한 가지 색으로 칠한 도형이면 true
  try { const w = 16, h = 16, t = cv(w, h), x = t.getContext("2d"); x.drawImage(c, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data; let n = 0, s = [0, 0, 0], q = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; n++; for (let k = 0; k < 3; k++) { s[k] += d[i + k]; q[k] += d[i + k] ** 2; } }
    if (n < 8) return true; return s.every((v, k) => q[k] / n - (v / n) ** 2 < 60); } catch { return false; }
}
function autoSlots() {
  P.slots = new Map(); let ti = 0, ii = 0;
  const isBase = (l) => P.leaves[l.i + 1]?.clip && !l.clip;
  const pics = [];
  for (const l of P.leaves) {
    if (l.hidden) continue;
    if (l.text) { P.slots.set(l.i, { kind: "text", label: txtLabel(l), rep: "" }); ti++; continue; }
    if (!l.canvas || l.adj || l.w < 60 || l.h < 60) continue;
    if (l.w >= P.w * 0.98 && l.h >= P.h * 0.5) continue; // 배경
    if (!l.clip && (isBase(l) || l.layer.vectorFill || flatColor(l.canvas))) continue; // 틀·도형
    if (l.clip && flatColor(l.canvas)) continue; // 색 덮개
    pics.push(l);
  }
  // 같은 그룹 안에 크기가 같은 사진 칸이 2개 이상이면 반복 사진
  const key = (l) => { const a = areaOf(l); return l.path.join("/") + "|" + Math.round(a.w / 4) + "x" + Math.round(a.h / 4); };
  const cnt = {}; pics.forEach((l) => (cnt[key(l)] = (cnt[key(l)] || 0) + 1));
  const repName = {}; let rn = 0;
  pics.forEach((l) => {
    const k = key(l);
    if (cnt[k] >= 2) { repName[k] ||= (l.path[l.path.length - 1] || "반복") + (rn++ ? rn : ""); P.slots.set(l.i, { kind: "rep", label: "반복 사진", rep: repName[k] }); }
    else P.slots.set(l.i, { kind: "img", label: l.name.slice(0, 16) || `사진 ${ii + 1}`, rep: "" });
    ii++;
  });
  return { ti, ii };
}
$("autoSlots").onclick = () => { if (!P) return; const r = autoSlots(); say($("psdMsg"), `다시 정했어요. 글 칸 ${r.ti}개, 사진 칸 ${r.ii}개.`, "ok"); renderLayers(); renderOverlay(); renderSlotSet(); };
$("noSlots").onclick = () => { if (!P) return; P.slots = new Map(); renderLayers(); renderOverlay(); renderSlotSet(); };

// ── 틀 저장: 합친 그림 조각 + 바뀌는 구역별 레이어 더미
const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function regionsOf(rects, W, H) {
  let rs = rects.map((r) => { const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y)); return { x, y, w: Math.min(W, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y, ids: [...r.ids] }; }).filter((r) => r.w > 0 && r.h > 0);
  for (let again = true; again;) {
    again = false;
    outer: for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (inter(rs[i], rs[j])) {
      const a = rs[i], b = rs[j], x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      rs[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, ids: [...a.ids, ...b.ids] }; rs.splice(j, 1); again = true; break outer;
    }
  }
  return rs;
}
function cropTo(src, sx, sy, r) { // src 를 (sx,sy)에 놓았을 때 r 영역만
  const x0 = Math.max(r.x, sx), y0 = Math.max(r.y, sy), x1 = Math.min(r.x + r.w, sx + src.width), y1 = Math.min(r.y + r.h, sy + src.height);
  if (x1 <= x0 || y1 <= y0) return null;
  const c = cv(x1 - x0, y1 - y0), ctx = c.getContext("2d"); ctx.drawImage(src, sx - x0, sy - y0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data; let any = false; for (let i = 3; i < d.length; i += 64) if (d[i]) { any = true; break; }
  if (!any) { for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; } }
  return any ? { c, x: x0, y: y0 } : null;
}
$("saveTpl").onclick = async () => {
  if (!P) return;
  const m = $("saveMsg"), bar = $("saveBar"), name = $("tplName").value.trim() || P.name;
  if (!P.slots.size) return say(m, "바꿀 칸을 하나 이상 정해 주세요.", "no");
  $("saveTpl").disabled = true; bar.hidden = false;
  try {
    const jobs = [], put = (c, type = "image/png", q) => { const job = toBlob(c, type, q).then((b) => putBlob(b, type)); jobs.push(job); return job; };
    let done = 0; const prog = () => { bar.firstElementChild.style.width = Math.round((done / Math.max(1, jobs.length)) * 100) + "%"; };
    const track = (p) => p.then((v) => { done++; prog(); return v; });
    say(m, "틀을 만드는 중…");
    const W = P.w, H = P.h, slots = [], rects = [];
    // 칸 정보
    for (const [i, s] of [...P.slots].sort((a, b) => a[0] - b[0])) {
      const l = P.leaves[i], id = "s" + i;
      if (s.kind === "text") {
        const t = textInfo(l), pad = Math.max(12, t.size * 0.6);
        const box = { x: l.x - pad * 2, y: l.y - pad, w: l.w + pad * 4, h: l.h + pad * 2 };
        slots.push({ id, kind: "text", label: s.label || "글", leaf: i, x: l.x, y: l.y, w: l.w, h: l.h, t, orig: l.canvas ? track(put(l.canvas)) : null });
        rects.push({ ...box, ids: [id] });
      } else {
        const a = areaOf(l), sl = { id, kind: s.kind, label: s.label || "사진", rep: s.kind === "rep" ? s.rep || "반복1" : "", leaf: i, x: a.x, y: a.y, w: a.w, h: a.h, ox: l.x, oy: l.y, orig: l.canvas ? track(put(l.canvas)) : null };
        if (a.mask === "base") { const bl = baseOf(l); if (bl?.canvas) { sl.mask = track(put(bl.canvas)); sl.mx = bl.x; sl.my = bl.y; } }
        else if (a.mask === "own" && l.layer.mask?.canvas) { const mk = ownMaskOf(l); if (mk) { sl.mask = track(put(mk.c)); sl.mx = mk.x; sl.my = mk.y; } }
        slots.push(sl); rects.push({ x: a.x, y: a.y, w: a.w, h: a.h, ids: [id] });
      }
    }
    // 구역별 레이어 더미
    const slotOfLeaf = new Map(slots.map((s) => [s.leaf, s.id]));
    const regions = regionsOf(rects, W, H).map((r) => {
      const stack = [];
      for (const l of P.leaves) {
        if (l.hidden) { if (!l.clip) stack.push({ t: "skip" }); continue; }
        if (slotOfLeaf.has(l.i)) { stack.push({ t: "slot", id: slotOfLeaf.get(l.i), clip: l.clip, blend: l.blend, op: +l.op.toFixed(3) }); continue; }
        const cr = l.canvas && inter(r, l) ? cropTo(l.canvas, l.x, l.y, r) : null;
        if (!cr) { if (!l.clip) stack.push({ t: "skip" }); continue; }
        stack.push({ t: "px", img: track(put(cr.c)), x: cr.x, y: cr.y, clip: l.clip, blend: l.blend, op: +l.op.toFixed(3) });
      }
      while (stack.length && stack[0].t === "skip") stack.shift();
      return { x: r.x, y: r.y, w: r.w, h: r.h, stack: stack.filter((e, k) => !(e.t === "skip" && stack[k + 1]?.t === "skip")) };
    });
    // 합친 그림 조각 (JPG)
    const comp = P.psd.canvas, tiles = [];
    for (let y = 0; y < H; y += 2000) {
      const h = Math.min(2000, H - y), c = cv(W, h), ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, h); ctx.drawImage(comp, 0, -y);
      tiles.push({ y, h, img: track(put(c, "image/jpeg", 0.92)) });
    }
    const th = cv(320, Math.min(Math.round(H * 320 / W), 480)); { const ctx = th.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, th.width, th.height); ctx.drawImage(comp, 0, 0, 320, Math.round(H * 320 / W)); }
    const thumb = track(put(th, "image/jpeg", 0.8));
    prog(); say(m, `그림 ${jobs.length}개 올리는 중…`);
    const deep = async (o) => { if (o instanceof Promise) return await o; if (Array.isArray(o)) return Promise.all(o.map(deep)); if (o && typeof o === "object") { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = await deep(v); return r; } return o; };
    const tpl = await deep({ id: uid(), name, w: W, h: H, src: P.name, tiles, regions, slots, thumb, fonts: psdFonts().map(({ ps, slot }) => ({ ps, slot })), v: 1 });
    await api({ op: "tpl", tpl });
    const j = await api(); TPLS = j.tpls;
    say(m, `'${name}' 틀을 저장했어요. ① 교체하기에서 골라 쓰면 돼요.`, "ok");
    renderTplCards(); renderTplList();
  } catch (e) { console.error(e); say(m, "저장에 실패했어요. 다시 눌러 주세요.", "no"); }
  finally { $("saveTpl").disabled = false; setTimeout(() => (bar.hidden = true), 800); }
};
function renderTplList() {
  renderNeeds();
  $("tplList").innerHTML = TPLS.length ? TPLS.map((t) => `<div class="li"><span class="g"><b>${esc(t.name)}</b> <span class="note">${t.w}×${t.h}px · 칸 ${t.slots}개 · ${new Date(t.at).toLocaleDateString("ko-KR")}</span></span><button type="button" class="btn g s danger" data-deltpl="${t.id}">지우기</button></div>`).join("") : `<p class="note">아직 저장한 틀이 없어요.</p>`;
}
document.addEventListener("click", async (e) => {
  const d = e.target.closest("[data-deltpl]"); if (!d) return;
  if (d.dataset.sure !== "1") { d.dataset.sure = "1"; d.textContent = "한 번 더 누르면 지워요"; return; }
  await api({ op: "deltpl", id: d.dataset.deltpl }).catch(() => {}); TPLS = TPLS.filter((t) => t.id !== d.dataset.deltpl);
  if (cur?.id === d.dataset.deltpl) { cur = null; $("useMain").hidden = true; }
  renderTplList(); renderTplCards();
});

// ── ① 교체하기
let cur = null, S = null; // S = { vals, fonts, photos:{id:{bmp,url,z,ox,oy}}, reps:{name:[{bmp,url,z,ox,oy}]} }
function renderTplCards() {
  $("tplCards").innerHTML = TPLS.length ? TPLS.map((t) => `<div class="cw"><button type="button" class="card" data-tpl="${t.id}" aria-pressed="${cur?.id === t.id}"><span class="th" data-th="${t.thumb}"></span><span class="tt"><b>${esc(t.name)}</b>${t.w}×${t.h}px · 칸 ${t.slots}개</span></button><button type="button" class="btn g s danger" data-deltpl="${t.id}">틀 지우기</button></div>`).join("") : `<p class="note">아직 틀이 없어요. ② 틀 만들기에서 PSD를 올려 주세요.</p>`;
  $$("[data-th]").forEach(async (el) => { if (!el.dataset.th) return; try { el.style.backgroundImage = `url(${URL.createObjectURL(await getBlob(el.dataset.th))})`; } catch {} });
}
$("tplCards").onclick = async (e) => {
  const c = e.target.closest("[data-tpl]"); if (!c) return;
  $("useTitle").textContent = "불러오는 중…"; $("useMain").hidden = false;
  try {
    const r = await fetch(`/api/detail?tpl=${c.dataset.tpl}`, { headers: authH() }); if (!r.ok) throw new Error("tpl"); const { tpl } = await r.json();
    cur = tpl;
    const saved = ls.get("ds-work-" + tpl.id, {});
    S = { vals: saved.vals || {}, fonts: saved.fonts || {}, ans: saved.ans || {}, photos: {}, reps: {} }; qsEdit = false;
    $("useTitle").textContent = `바꿀 내용 · ${tpl.name}`;
    renderTplCards(); renderFields(); renderQs(); draw();
    if (!tpl.qs && textSlots().length) makeQs();
  } catch (err) { console.error(err); $("useTitle").textContent = "틀을 불러오지 못했어요."; }
};
const saveWork = () => cur && ls.set("ds-work-" + cur.id, { vals: S.vals, fonts: S.fonts, ans: S.ans });
const repGroups = () => { const g = {}; cur.slots.filter((s) => s.kind === "rep").forEach((s) => (g[s.rep] ||= []).push(s)); return g; };
function renderFields() {
  if (!cur) return;
  const items = [];
  cur.slots.filter((s) => s.kind !== "rep").forEach((s) => items.push({ y: s.y, x: s.x, s }));
  Object.entries(repGroups()).forEach(([name, list]) => items.push({ y: Math.min(...list.map((s) => s.y)), x: 0, rep: name, list }));
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const fontOpts = (sel) => `<option value="">기본 (Noto Sans KR)</option>${FONTS.map((f) => `<option value="${f.id}" ${f.id === sel ? "selected" : ""}>${esc(f.name)}</option>`).join("")}`;
  const adj = (key, p) => `<div class="adj"><span>확대</span><input type="range" min="100" max="300" value="${p?.z ?? 100}" data-adj="${key}:z"><span>좌우</span><input type="range" min="-100" max="100" value="${p?.ox ?? 0}" data-adj="${key}:ox"><span>위아래</span><input type="range" min="-100" max="100" value="${p?.oy ?? 0}" data-adj="${key}:oy"></div>`;
  $("fields").innerHTML = items.map((it) => {
    if (it.rep) {
      const ph = S.reps[it.rep] || [], cols = rowsOf(it.list)[0].length, rows = rowsOf(it.list).length;
      return `<div class="fd" style="--c:${COLORS.rep}"><div class="h">${esc(it.rep)} <small>반복 사진 · 칸 ${it.list.length}개 (한 줄 ${cols}칸 × ${rows}줄) · 올린 ${ph.length}장</small></div>
        <label class="drop" data-repdrop="${esc(it.rep)}" style="padding:12px">사진 여러 장을 끌어 놓거나 눌러서 고르세요<input type="file" accept="image/*" multiple hidden data-repin="${esc(it.rep)}"></label>
        <div class="thumbs">${ph.map((p, k) => `<div class="tb"><img src="${p.url}" alt="${k + 1}번 사진"><div class="a"><button type="button" data-rmove="${esc(it.rep)}:${k}:-1" aria-label="앞으로">◀</button><button type="button" data-rdel="${esc(it.rep)}:${k}" aria-label="빼기">✕</button><button type="button" data-rmove="${esc(it.rep)}:${k}:1" aria-label="뒤로">▶</button></div></div>`).join("")}</div>
        ${ph.length ? `<p class="note" style="margin:0">${ph.length > it.list.length ? `칸보다 많아서 줄을 ${Math.ceil(ph.length / cols) - rows}줄 늘려요.` : Math.ceil(ph.length / cols) < rows ? `칸보다 적어서 줄을 ${rows - Math.ceil(ph.length / cols)}줄 줄여요.` : "칸에 맞게 들어가요."}</p>` : ""}</div>`;
    }
    const s = it.s;
    if (s.kind === "text") {
      const v = S.vals[s.id] ?? s.t.text, fsel = S.fonts[s.id] ?? (autoFont(s.t.ps)?.id || "");
      return `<div class="fd" style="--c:${COLORS.text}"><div class="h">${esc(s.label)} <small>글 칸 · ${esc(s.t.ps || "글꼴 모름")}</small></div>
        <textarea rows="${Math.min(8, Math.max(1, s.t.lines))}" data-val="${s.id}">${esc(v)}</textarea>
        <div class="row"><label class="pick note" style="margin:0">글꼴 <select data-font="${s.id}">${fontOpts(fsel)}</select></label>${v !== s.t.text ? `<button type="button" class="btn g s" data-reset="${s.id}">원래 글로</button>` : ""}</div></div>`;
    }
    const p = S.photos[s.id];
    return `<div class="fd" style="--c:${COLORS.img}"><div class="h">${esc(s.label)} <small>사진 칸 · ${s.w}×${s.h}px</small></div>
      <div class="row" style="align-items:flex-start"><label class="drop" data-pdrop="${s.id}" style="padding:10px;flex:1 1 160px">${p ? "다른 사진으로 바꾸기" : "사진을 끌어 놓거나 눌러서 고르세요"}<input type="file" accept="image/*" hidden data-pin="${s.id}"></label>${p ? `<div class="tb"><img src="${p.url}" alt=""><div class="a"><span></span><button type="button" data-pdel="${s.id}" aria-label="원래 사진으로">✕</button><span></span></div></div>` : ""}</div>
      ${p ? adj("p:" + s.id, p) : ""}</div>`;
  }).join("");
}
async function photoOf(file) { const bm = await createImageBitmap(file); return { bmp: bm, url: URL.createObjectURL(file), z: 100, ox: 0, oy: 0 }; }
$("fields").addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.pin) { if (t.files[0]) { S.photos[t.dataset.pin] = await photoOf(t.files[0]); renderFields(); draw(); } }
  else if (t.dataset.repin) { const add = await Promise.all([...t.files].filter((f) => f.type.startsWith("image/")).map(photoOf)); (S.reps[t.dataset.repin] ||= []).push(...add); renderFields(); draw(); }
  else if (t.dataset.font != null) { S.fonts[t.dataset.font] = t.value; if (t.value) await loadFont(FONTS.find((f) => f.id === t.value)); saveWork(); draw(); }
});
$("fields").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.val) { S.vals[t.dataset.val] = t.value; saveWork(); draw(); }
  if (t.dataset.adj) { const [kind, id, k] = t.dataset.adj.split(":"); const p = kind === "p" ? S.photos[id] : null; if (p) { p[k] = +t.value; draw(); } }
});
$("fields").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.reset) { delete S.vals[b.dataset.reset]; saveWork(); renderFields(); draw(); }
  if (b.dataset.pdel) { delete S.photos[b.dataset.pdel]; renderFields(); draw(); }
  if (b.dataset.rdel) { const [r, k] = b.dataset.rdel.split(":"); S.reps[r].splice(+k, 1); renderFields(); draw(); }
  if (b.dataset.rmove) { const [r, k, d] = b.dataset.rmove.split(":"), a = S.reps[r], j = +k + +d; if (a[j]) { [a[k], a[j]] = [a[j], a[k]]; renderFields(); draw(); } }
});
["dragover", "dragleave", "drop"].forEach((ev) => $("fields").addEventListener(ev, async (e) => {
  const d = e.target.closest("[data-pdrop],[data-repdrop]"); if (!d) return;
  e.preventDefault(); d.classList.toggle("on", ev === "dragover");
  if (ev !== "drop") return;
  const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")); if (!files.length) return;
  if (d.dataset.pdrop) S.photos[d.dataset.pdrop] = await photoOf(files[0]);
  else (S.reps[d.dataset.repdrop] ||= []).push(...(await Promise.all(files.map(photoOf))));
  renderFields(); draw();
}));

// ── 그리기
function rowsOf(list) { const rows = []; [...list].sort((a, b) => a.y - b.y || a.x - b.x).forEach((s) => { const r = rows.find((r) => Math.abs(r[0].y - s.y) < Math.max(8, s.h * 0.25)); r ? r.push(s) : rows.push([s]); }); rows.forEach((r) => r.sort((a, b) => a.x - b.x)); return rows; }
function coverDraw(ctx, img, a, p) { // a = 칸 (그릴 캔버스 기준 좌표)
  const s = Math.max(a.w / img.width, a.h / img.height) * ((p.z || 100) / 100), w = img.width * s, h = img.height * s;
  const x = a.x + (a.w - w) / 2 + ((p.ox || 0) / 100) * (w - a.w) / 2 * -1, y = a.y + (a.h - h) / 2 + ((p.oy || 0) / 100) * (h - a.h) / 2 * -1;
  ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore();
}
async function slotCanvas(s, photo) { // 칸 하나의 그림 (절대 좌표 기준 {c,x,y})
  if (s.kind === "text") return textCanvas(s);
  if (!photo) return s.orig ? { c: await bmp(s.orig), x: s.ox, y: s.oy } : null;
  const c = cv(s.w, s.h), ctx = c.getContext("2d");
  coverDraw(ctx, photo.bmp, { x: 0, y: 0, w: s.w, h: s.h }, photo);
  if (s.mask) { ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(await bmp(s.mask), s.mx - s.x, s.my - s.y); }
  return { c, x: s.x, y: s.y };
}
async function textCanvas(s) {
  const t = s.t, v = S.vals[s.id] ?? t.text, fid = S.fonts[s.id] ?? (autoFont(t.ps)?.id || "");
  if (v === t.text && !S.fonts[s.id] && s.orig) return { c: await bmp(s.orig), x: s.x, y: s.y }; // 그대로면 포토샵 그림 그대로
  const f = fid && FONTS.find((x) => x.id === fid);
  if (f) await loadFont(f);
  const fam = f ? `"ds_${f.id}"` : `"Noto Sans KR"`, wt = f ? 400 : weightOf(t.ps);
  if (!f) await document.fonts.load(`${wt} ${t.size}px "Noto Sans KR"`).catch(() => {});
  const pad = t.size * 2, lines0 = v.split("\n");
  const c = cv(Math.max(s.w, t.box?.w || 0) + pad * 8 + t.size * 20, (lines0.length + 4) * t.lead + pad * 2), ctx = c.getContext("2d");
  ctx.font = `${wt} ${t.size}px ${fam}`; ctx.fillStyle = t.color; ctx.textAlign = t.just; ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx && t.track) ctx.letterSpacing = t.track + "px";
  let lines = lines0;
  if (t.box) { lines = []; lines0.forEach((ln) => { let cur2 = ""; for (const ch of ln) { if (ctx.measureText(cur2 + ch).width > t.box.w && cur2) { lines.push(cur2); cur2 = ch; } else cur2 += ch; } lines.push(cur2); }); }
  // 원점: 포인트 글자는 기준점(ax, ay = 첫 줄 글자 바닥선), 상자 글자는 상자 위 + 글자 크기
  const ox = c.width / 2, oy = pad;
  const ax = t.box ? (t.just === "center" ? t.box.x + t.box.w / 2 : t.just === "right" ? t.box.x + t.box.w : t.box.x) : t.ax;
  const ay = t.box ? t.box.y + t.size * 0.88 : t.ay;
  lines.forEach((ln, i) => ctx.fillText(ln, ox, oy + i * t.lead + t.size));
  return { c, x: ax - ox, y: ay - oy - t.size };
}
let drawT = null, drawing = false, drawAgain = false;
function draw() { clearTimeout(drawT); drawT = setTimeout(doDraw, 250); }
async function doDraw() {
  if (!cur) return;
  if (drawing) { drawAgain = true; return; }
  drawing = true; drawAgain = false;
  try { const c = await renderPage(); const pv = $("pvc"); pv.width = c.width; pv.height = c.height; pv.getContext("2d").drawImage(c, 0, 0); $("pvNote").textContent = `${c.width}×${c.height}px`; $("outInfo").textContent = ""; }
  catch (e) { console.error(e); $("pvNote").textContent = "그리다 문제가 생겼어요"; }
  drawing = false; if (drawAgain) doDraw();
}
async function renderPage() {
  const T = cur, c = cv(T.w, T.h), ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, T.w, T.h);
  for (const t of T.tiles) ctx.drawImage(await bmp(t.img), 0, t.y);
  // 반복 사진: 칸마다 넣을 사진 (줄 늘리기는 맨 끝에)
  const repPhoto = {}, groups = repGroups();
  Object.entries(groups).forEach(([name, list]) => { const ph = S.reps[name] || []; rowsOf(list).flat().forEach((s, k) => (repPhoto[s.id] = ph[k] || null)); });
  const byId = Object.fromEntries(T.slots.map((s) => [s.id, s]));
  for (const r of T.regions) {
    const rc = cv(r.w, r.h), rx = rc.getContext("2d");
    let g = null, gb = "source-over", go = 1;
    const flush = () => { if (!g) return; rx.globalAlpha = go; rx.globalCompositeOperation = gb; rx.drawImage(g, 0, 0); rx.globalAlpha = 1; rx.globalCompositeOperation = "source-over"; g = null; };
    for (const e of r.stack) {
      if (e.t === "skip") { flush(); continue; }
      let piece = null;
      if (e.t === "px") piece = { c: await bmp(e.img), x: e.x, y: e.y };
      else { const s = byId[e.id]; piece = s && (await slotCanvas(s, s.kind === "img" ? S.photos[s.id] : s.kind === "rep" ? repPhoto[s.id] : null)); }
      if (!e.clip) { flush(); g = cv(r.w, r.h); gb = e.blend || "source-over"; go = e.op ?? 1; if (piece) g.getContext("2d").drawImage(piece.c, piece.x - r.x, piece.y - r.y); }
      else if (g && piece) { const gx = g.getContext("2d"); gx.globalCompositeOperation = "source-atop"; gx.globalAlpha = e.op ?? 1; gx.drawImage(piece.c, piece.x - r.x, piece.y - r.y); gx.globalAlpha = 1; gx.globalCompositeOperation = "source-over"; }
    }
    flush();
    ctx.fillStyle = "#fff"; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.drawImage(rc, r.x, r.y);
  }
  // 반복 사진 줄 늘리기·줄이기 (아래 묶음부터)
  let out = c;
  const gl = Object.entries(groups).map(([name, list]) => ({ name, rows: rowsOf(list) })).sort((a, b) => b.rows.at(-1)[0].y - a.rows.at(-1)[0].y);
  for (const { name, rows } of gl) {
    const ph = S.reps[name] || []; if (!ph.length) continue;
    const cols = rows[0].length, need = Math.ceil(ph.length / cols), have = rows.length;
    if (need === have) continue;
    const last = rows.at(-1), fh = Math.max(...last.map((s) => s.h)), bottom = last[0].y + fh;
    const step = have > 1 ? last[0].y - rows.at(-2)[0].y : fh + Math.round(fh * 0.06);
    if (need > have) {
      const add = need - have, n = cv(out.width, out.height + add * step), nx = n.getContext("2d");
      nx.drawImage(out, 0, 0, out.width, bottom, 0, 0, out.width, bottom);
      for (let k = 0; k < add; k++) nx.drawImage(out, 0, bottom - step, out.width, step, 0, bottom + k * step, out.width, step);
      nx.drawImage(out, 0, bottom, out.width, out.height - bottom, 0, bottom + add * step, out.width, out.height - bottom);
      for (let k = 0; k < add; k++) for (let j = 0; j < cols; j++) {
        const p = ph[(have + k) * cols + j], s = last[j]; if (!s) continue;
        const dy = (k + 1) * step;
        if (!p) continue;
        const piece = await slotCanvas(s, p); nx.drawImage(piece.c, piece.x, piece.y + dy);
      }
      out = n;
    } else {
      const cut = (have - need) * step, n = cv(out.width, out.height - cut), nx = n.getContext("2d");
      nx.drawImage(out, 0, 0, out.width, bottom - cut, 0, 0, out.width, bottom - cut);
      nx.drawImage(out, 0, bottom, out.width, out.height - bottom, 0, bottom - cut, out.width, out.height - bottom);
      out = n;
    }
  }
  return out;
}
$("dl").onclick = async () => {
  if (!cur) return;
  $("dl").disabled = true; $("outInfo").textContent = "만드는 중…";
  try {
    const c = await renderPage(), b = await toBlob(c, "image/jpeg", +$("q").value);
    const a = document.createElement("a"), d = new Date();
    a.href = URL.createObjectURL(b); a.download = `${cur.name}_${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
    $("outInfo").textContent = `${c.width}×${c.height}px · ${kb(b.size)}`;
  } catch (e) { console.error(e); $("outInfo").textContent = "만들지 못했어요"; }
  $("dl").disabled = false;
};

// ── AI 글 채우기
// 상품 정보 질문칸 (틀마다 AI가 만들고, 고치거나 더할 수 있음)
const textSlots = () => cur.slots.filter((s) => s.kind === "text").sort((a, b) => a.y - b.y || a.x - b.x);
let qsEdit = false;
function renderQs() {
  if (!cur) return;
  const qs = cur.qs || [], A = S.ans ||= {};
  $("qs").innerHTML = qs.length ? qs.map((q) => `<label class="q"><span class="ql">${esc(q.label)}<small>${esc(q.hint || "")}${q.fill ? " · 적으면 바로 들어가요" : ""}</small>${qsEdit ? `<button type="button" data-qdel="${q.id}" aria-label="질문 빼기">✕</button>` : ""}</span>${q.long ? `<textarea rows="3" data-q="${q.id}" placeholder="${esc(q.ex ? "예) " + q.ex : "")}">${esc(A[q.id] || "")}</textarea>` : `<input type="text" data-q="${q.id}" value="${esc(A[q.id] || "")}" placeholder="${esc(q.ex ? "예) " + q.ex : "")}">`}</label>`).join("")
    : `<p class="note" style="margin:0">${textSlots().length ? "아직 질문칸이 없어요. AI가 이 상세페이지 글을 읽고 만들어요." : "이 틀에는 글 칸이 없어요. ② 틀 만들기에서 글 칸을 정하면 질문칸이 생겨요."}</p>`;
  $("qsTools").innerHTML = !textSlots().length ? "" : qs.length
    ? `<button type="button" class="btn g s" id="qsEditBtn">${qsEdit ? "다 고쳤어요" : "질문칸 고치기"}</button>${qsEdit ? `<form class="row" id="qAdd" style="flex:1 1 220px"><input type="text" id="qAddIn" placeholder="더할 질문 (예: 모델 착용 사이즈)" style="flex:1"><button class="btn g s">더하기</button></form><button type="button" class="btn g s" id="qsMake">AI로 다시 만들기</button>` : ""}`
    : `<button type="button" class="btn s" id="qsMake">AI가 질문칸 만들기</button>`;
}
async function saveQs(qs) {
  const j = await api({ op: "tplqs", id: cur.id, qs }); cur.qs = j.qs; renderQs();
}
async function makeQs() {
  const m = $("aiMsg"), b = $("qsMake"); if (b) b.disabled = true;
  m.textContent = "AI가 상세페이지를 읽고 질문칸을 만드는 중… (10~20초)";
  try { const j = await api({ op: "qs", slots: textSlots().map((s) => ({ id: s.id, label: s.label, orig: s.t.text })) }); await saveQs(j.qs || []); m.textContent = `질문칸 ${cur.qs.length}개를 만들었어요. 필요 없으면 '질문칸 고치기'에서 빼 주세요.`; }
  catch (e) { m.textContent = e.message === "busy" ? "지금 AI가 바빠요. 잠시 뒤 다시 눌러 주세요." : "질문칸을 만들지 못했어요. 다시 눌러 주세요."; renderQs(); }
}
$("aiBox").addEventListener("input", (e) => {
  const id = e.target.dataset.q; if (!id) return;
  const q = cur.qs.find((x) => x.id === id), v = e.target.value; S.ans[id] = v;
  if (q?.fill) { if (v.trim()) S.vals[q.fill] = v; else delete S.vals[q.fill]; draw(); clearTimeout(renderQs.t); renderQs.t = setTimeout(renderFields, 600); }
  saveWork();
});
$("aiBox").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.id === "qsMake") return makeQs();
  if (t.id === "qsEditBtn") { qsEdit = !qsEdit; return renderQs(); }
  if (t.dataset.qdel) { e.preventDefault(); return saveQs(cur.qs.filter((q) => q.id !== t.dataset.qdel)).catch(() => {}); }
});
$("aiBox").addEventListener("submit", (e) => {
  if (e.target.id !== "qAdd") return; e.preventDefault();
  const label = $("qAddIn").value.trim(); if (!label) return;
  let n = 1; while (cur.qs.some((q) => q.id === "q" + n)) n++;
  saveQs([...cur.qs, { id: "q" + n, label, hint: "", ex: "", long: false, fill: "" }]).catch(() => {});
});
$("aiBtn").onclick = async () => {
  if (!cur) return;
  const m = $("aiMsg"), A = S.ans || {};
  const facts = (cur.qs || []).filter((q) => (A[q.id] || "").trim()).map((q) => `${q.label}: ${A[q.id].trim()}`);
  const memo = [...facts, $("aiMemo").value.trim()].filter(Boolean).join("\n");
  if (!memo) { m.textContent = "상품 정보를 먼저 적어 주세요."; return; }
  const slots = textSlots().map((s) => ({ id: s.id, label: s.label, orig: s.t.text, lines: s.t.lines }));
  if (!slots.length) { m.textContent = "이 틀에는 글 칸이 없어요."; return; }
  $("aiBtn").disabled = true; m.textContent = "AI가 쓰는 중… (10~20초)";
  try { const j = await api({ op: "ai", memo, slots }); let n = 0; for (const [k, v] of Object.entries(j.values || {})) if (v !== (S.vals[k] ?? cur.slots.find((s) => s.id === k)?.t.text)) { S.vals[k] = v; n++; } saveWork(); renderFields(); draw(); m.textContent = `${n}칸을 바꿨어요. 확인하고 고쳐 주세요.`; }
  catch (e) { m.textContent = e.message === "busy" ? "지금 AI가 바빠요. 잠시 뒤 다시 눌러 주세요." : "AI 채우기에 실패했어요."; }
  $("aiBtn").disabled = false;
};

// ── 공유 주소 (이현님만)
function renderKeys() {
  if (role !== "admin") return;
  $("keyList").innerHTML = KEYS.length ? KEYS.map((k) => { const url = `${location.origin}/programs/detail-swap/?k=${k.k}`; return `<div class="li"><span class="g"><b>${esc(k.name)}</b><br><code class="k">${esc(url)}</code></span><button type="button" class="btn g s" data-copy="${esc(url)}">주소 복사</button><button type="button" class="btn g s danger" data-keydel="${k.k}">끊기</button></div>`; }).join("") : `<p class="note">아직 만든 공유 주소가 없어요.</p>`;
}
$("keyAdd").onsubmit = async (e) => { e.preventDefault(); const name = $("keyName").value.trim() || "공유"; const j = await api({ op: "keyadd", name }).catch(() => null); if (!j) return; KEYS.push({ k: j.k, name, at: Date.now() }); $("keyName").value = ""; renderKeys(); };
document.addEventListener("click", async (e) => {
  const c = e.target.closest("[data-copy]");
  if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = "복사했어요"; } catch { c.textContent = "직접 복사해 주세요"; } return; }
  const d = e.target.closest("[data-keydel]"); if (!d) return;
  if (d.dataset.sure !== "1") { d.dataset.sure = "1"; d.textContent = "한 번 더 누르면 끊겨요"; return; }
  await api({ op: "keydel", k: d.dataset.keydel }).catch(() => {}); KEYS = KEYS.filter((k) => k.k !== d.dataset.keydel); renderKeys();
});

boot();
