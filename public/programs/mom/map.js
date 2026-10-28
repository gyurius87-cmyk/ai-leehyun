// 엄마 일기 · 여행 지도. kmap.json(시·군·구 경계 + 시·도 경계 + 지역별 유명한 것 + 전국 명소 핀)을 SVG로 한 번만 그리고,
// 다시 그릴 때는 색만 바꿈. ＋/− 버튼·휠·손가락 벌리기로 확대, 끌어서 이동. 많이 확대하면 동·읍·면 이름(kdong.json)이 보임.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs = {}, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent?.appendChild(el); return el; };
  const SHOW_GU = 1.8, SHOW_DONG = 4, MAX_Z = 24;
  let D, svg, base, vb, gRg, gDong, gLbl, gSpot, rgEl = {}, spotEl = [], dong = null, dongLoading = false, opts = {};

  function init(data, o) {
    D = data; opts = o;
    base = { x: -6, y: -6, w: D.w + 12, h: D.h + 12 }; vb = { ...base };
    const wrap = document.createElement('div'); wrap.className = 'kwrap';
    svg = mk('svg', { class: 'kmap', role: 'img', 'aria-label': '한국 지도' }, wrap);
    gRg = mk('g', {}, svg);
    D.r.forEach((r) => { const p = mk('path', { d: r.d, class: 'rg', 'data-rg': r.c }, gRg); mk('title', {}, p).textContent = full(r.c); rgEl[r.c] = p; });
    gDong = mk('g', { class: 'dong' }, svg);
    mk('g', { class: 'pv' }, svg).innerHTML = D.p.map((p) => `<path d="${p.d}"/>`).join('');
    // 울릉도·독도는 실제보다 서쪽으로 옮기고 독도는 크게 그려 네모 칸에 둠
    const ul = D.r.find((r) => r.c === '37430'), dk = D.r.find((r) => r.c === '37431');
    const bx = Math.min(ul.x, dk.x) - 16, by = Math.min(ul.y, dk.y) - 20;
    mk('rect', { class: 'inset', x: bx, y: by, width: Math.max(ul.x, dk.x) - bx + 16, height: Math.max(ul.y, dk.y) - by + 22, rx: 4 }, svg);
    mk('text', { class: 'li', x: bx + 3, y: by + 6 }, svg).textContent = '울릉도·독도';
    gLbl = mk('g', { class: 'lbs' }, svg);
    gSpot = mk('g', { class: 'spots' }, svg);
    (D.s || []).forEach((s, i) => {
      const g = mk('g', { class: 'spot', 'data-spot': i, transform: `translate(${s.x} ${s.y})` }, gSpot);
      mk('circle', { r: 3 }, g); mk('text', {}, g).textContent = s.n; mk('title', {}, g).textContent = `${s.n} · ${full(s.c)}`;
    });
    const bar = document.createElement('div'); bar.className = 'zbar';
    bar.innerHTML = '<button type="button" data-z="in" aria-label="확대">＋</button><button type="button" data-z="out" aria-label="축소">－</button><button type="button" data-z="home" aria-label="처음 크기">⟲</button>';
    wrap.appendChild(bar);
    bar.addEventListener('click', (e) => { const z = e.target.closest('button')?.dataset.z; if (!z) return; if (z === 'home') set(base); else zoomAt(z === 'in' ? 0.5 : 2, vb.x + vb.w / 2, vb.y + vb.h / 2); });
    gestures();
    set(base);
    return wrap;
  }

  const prov = (c) => D.p.find((p) => p.c === c)?.n || '';
  const reg = (c) => D.r.find((r) => r.c === c);
  // "강원 춘천시" · 예전 기록(시·도 두 자리)이면 "강원"
  function full(c) { const r = reg(c); return r ? `${prov(r.p)} ${r.n}` : prov(c); }

  function set(v) {
    const z0 = base.w / v.w;
    if (z0 < 1) v = { ...base };
    if (z0 > MAX_Z) { const w = base.w / MAX_Z, h = w * base.h / base.w; v = { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h }; }
    // 지도 밖으로 너무 나가지 않게
    v.x = Math.min(Math.max(v.x, base.x - v.w * 0.3), base.x + base.w - v.w * 0.7);
    v.y = Math.min(Math.max(v.y, base.y - v.h * 0.3), base.y + base.h - v.h * 0.7);
    vb = v;
    const z = base.w / vb.w;
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.style.setProperty('--z', z);
    svg.classList.toggle('zoomed', z > 1.05);
    svg.classList.toggle('far', z < SHOW_GU);
    labels();
  }
  function zoomAt(f, cx, cy) { set({ x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w: vb.w * f, h: vb.h * f }); }
  function pt(e) { const r = svg.getBoundingClientRect(); return { x: vb.x + (e.clientX - r.left) / r.width * vb.w, y: vb.y + (e.clientY - r.top) / r.height * vb.h }; }

  // 보이는 칸 안의 이름만 그림 (시·도 → 시·군·구 → 동·읍·면)
  function labels() {
    const z = base.w / vb.w, inV = (x, y) => x > vb.x && x < vb.x + vb.w && y > vb.y && y < vb.y + vb.h;
    let h = '';
    if (z < SHOW_GU) h = D.p.map((p) => `<text class="lp" x="${p.x}" y="${p.y}">${p.n}</text>`).join('');
    else {
      h = D.r.filter((r) => inV(r.x, r.y)).map((r) => `<text class="lr${opts.cnt?.[r.c] ? ' on' : ''}" x="${r.x}" y="${r.y}">${r.n.replace(/^\S+시 /, '')}</text>`).join('');
      if (z >= SHOW_DONG) {
        if (!dong && !dongLoading) { dongLoading = true; fetch('/programs/mom/kdong.json').then((r) => r.json()).then((j) => { dong = j; mk('path', { d: j.d }, gDong); labels(); }).catch(() => { dongLoading = false; }); }
        if (dong) { const l = dong.l.filter((d) => inV(d[1], d[2])); if (l.length < 400) h = l.map((d) => `<text class="ld" x="${d[1]}" y="${d[2] + 4 / z}">${d[0]}</text>`).join('') + h; }
      }
    }
    gLbl.innerHTML = h;
    svg.classList.toggle('dongs', !!dong && z >= SHOW_DONG);
  }

  function gestures() {
    const ps = new Map(); let moved = 0, start = null;
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const p = pt(e); zoomAt(Math.exp(e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      ps.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0;
      start = { vb: { ...vb }, ps: new Map([...ps].map(([k, v]) => [k, { ...v }])) };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!ps.has(e.pointerId)) return;
      ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = svg.getBoundingClientRect(), k = start.vb.w / r.width, pts = [...ps.values()], st = [...start.ps.values()];
      if (pts.length === 1 && st.length === 1) {
        if (!svg.classList.contains('zoomed') && e.pointerType !== 'mouse') return;
        const dx = pts[0].x - st[0].x, dy = pts[0].y - st[0].y; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        // 처음 크기에서 손가락 하나는 페이지 스크롤에 양보. 움직이기 시작할 때만 붙잡아야 누르기(click)가 지역에 감
        if (moved > 4) { if (!svg.hasPointerCapture?.(e.pointerId)) svg.setPointerCapture?.(e.pointerId); set({ ...start.vb, x: start.vb.x - dx * k, y: start.vb.y - dy * k }); }
      } else if (pts.length >= 2 && st.length >= 2) {
        moved = 99; ps.forEach((_, id) => { try { svg.setPointerCapture(id); } catch {} });
        const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), m = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const f = d(st[0], st[1]) / Math.max(d(pts[0], pts[1]), 1), m0 = m(st[0], st[1]), m1 = m(pts[0], pts[1]);
        const cx = start.vb.x + (m0.x - r.left) * k, cy = start.vb.y + (m0.y - r.top) * k, w = start.vb.w * f;
        set({ x: cx - (m1.x - r.left) * k * f, y: cy - (m1.y - r.top) * k * f, w, h: start.vb.h * f });
      }
    });
    const up = (e) => { ps.delete(e.pointerId); if (ps.size) start = { vb: { ...vb }, ps: new Map([...ps].map(([k, v]) => [k, { ...v }])) }; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('click', (e) => {
      if (moved > 4) { moved = 0; return; }
      const s = e.target.closest('[data-spot]'), g = e.target.closest('[data-rg]');
      if (s) opts.onSpot?.(Number(s.dataset.spot)); else if (g) opts.onRegion?.(g.dataset.rg);
    });
    svg.addEventListener('dblclick', (e) => { e.preventDefault(); const p = pt(e); zoomAt(0.5, p.x, p.y); });
  }

  // 색칠: cnt = {지역코드: 다녀온 횟수}, spots = 다녀온 명소 이름 Set, sel = 고른 지역
  function paint(o) {
    Object.assign(opts, o);
    for (const c in rgEl) {
      const n = o.cnt[c] || 0, el = rgEl[c];
      el.classList.toggle('went', n > 0); el.classList.toggle('sel', o.sel === c);
      el.style.setProperty('--lv', Math.min(n, 4));
    }
    spotEl = [...gSpot.children];
    spotEl.forEach((g, i) => g.classList.toggle('went', o.spots.has(D.s[i].n)));
    labels();
  }
  // 지역을 고르면 그쪽으로 확대
  function focus(c) {
    const el = rgEl[c]; if (!el) return;
    const b = el.getBBox(), pad = Math.max(b.width, b.height) * 0.9 + 8;
    const w = Math.max(b.width + pad, base.w / 8), h = w * base.h / base.w;
    set({ x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - h / 2, w, h });
  }
  window.KMap = { use: (data) => (D = data), init, paint, focus, full, reg, prov };
})();
