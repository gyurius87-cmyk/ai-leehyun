// 투석 식사 찾아보기: food.json 을 읽어 검색·분류·판정을 보여 줘요.
(function () {
  const box = document.getElementById('foodBox');
  if (!box) return;
  const R = [
    { k: 'ok', t: '괜찮아요', d: '적당량은 편하게' },
    { k: 'some', t: '조금만', d: '양을 줄이거나 데쳐서' },
    { k: 'no', t: '피해요', d: '되도록 안 먹기' },
  ];
  const LV = { L: '적음', M: '보통', H: '많음' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
  let items = [], cats = [], st = { q: '', c: '과일', r: -1 };
  try { const s = JSON.parse(localStorage.getItem('mom-food') || '{}'); if (s.c) st.c = s.c; } catch (e) {}

  box.innerHTML = `<div class="row between"><h2>투석 식사 찾아보기</h2><span class="sub">칼륨·인·나트륨 기준</span></div>
    <div class="fd-note">병원 선생님·영양사가 따로 말씀하신 게 있으면 그게 먼저예요. 피검사 결과에 따라 달라질 수 있어요.</div>
    <input id="fdQ" type="search" placeholder="먹고 싶은 것 찾기 (예: 바나나, 라면, 두부)" autocomplete="off">
    <div class="fd-chips" id="fdC"></div>
    <div class="fd-chips" id="fdR"></div>
    <div id="fdList"><div class="empty">목록을 불러오는 중이에요.</div></div>
    <details class="fd-tips"><summary>먹을 때 기억할 것 4가지</summary><ol>
      <li><b>데치기·담그기:</b> 채소·감자는 잘게 썰어 물에 2시간 담갔다가 많은 물에 데치고 물은 버려요. 칼륨이 줄어요.</li>
      <li><b>국물은 남기기:</b> 국·찌개·라면 국물에 소금과 칼륨이 녹아 있어요.</li>
      <li><b>가공식품 줄이기:</b> 햄·어묵·콜라·가공치즈에는 몸에 잘 흡수되는 인 첨가물이 들어 있어요. 성분표의 '인산', '인산염'을 봐요.</li>
      <li><b>저염 제품 조심:</b> 저염 소금·간장은 소금 대신 칼륨을 넣은 게 많아요. '염화칼륨'이 있으면 피해요.</li>
    </ol></details>`;
  const $q = box.querySelector('#fdQ'), $c = box.querySelector('#fdC'), $r = box.querySelector('#fdR'), $l = box.querySelector('#fdList');

  function save() { try { localStorage.setItem('mom-food', JSON.stringify({ c: st.c })); } catch (e) {} }
  function chips() {
    $c.innerHTML = ['전체'].concat(cats).map((c) => `<button data-c="${esc(c)}" class="${!st.q && st.c === c ? 'on' : ''}">${esc(c)}</button>`).join('');
    $r.innerHTML = [{ k: 'all', t: '모두' }].concat(R).map((x, i) => `<button data-r="${i - 1}" class="fd-r ${x.k} ${st.r === i - 1 ? 'on' : ''}">${x.t}</button>`).join('');
  }
  function list() {
    const q = norm(st.q);
    let rows = items.filter((it) => (q ? norm(it.n + ',' + it.a).includes(q) : st.c === '전체' || it.c === st.c) && (st.r < 0 || it.r === st.r));
    if (q) rows.sort((a, b) => (norm(a.n).startsWith(q) ? 0 : 1) - (norm(b.n).startsWith(q) ? 0 : 1));
    else rows.sort((a, b) => a.r - b.r);
    if (!rows.length) {
      $l.innerHTML = `<div class="empty">${q ? `'${esc(st.q)}'은(는) 아직 목록에 없어요. 비슷한 이름으로 찾아보거나, 이현님께 넣어 달라고 말해 주세요.` : '해당하는 게 없어요.'}</div>`;
      return;
    }
    $l.innerHTML = `<div class="fd-count">${rows.length}개</div><div class="fd-grid">` + rows.map((it) => {
      const r = R[it.r];
      const lv = (lab, v) => `<span class="lv ${v}">${lab} ${LV[v]}</span>`;
      return `<div class="fd-it ${r.k}"><div class="fd-top"><b>${esc(it.n)}</b><span class="fd-badge ${r.k}">${r.t}</span></div>
        ${it.a ? `<div class="fd-a">${esc(it.a.split(',').join(' · '))}</div>` : ''}
        <div class="fd-lv">${lv('칼륨', it.k)}${lv('인', it.p)}${lv('나트륨', it.s)}</div>
        <div class="fd-t">${esc(it.t)}</div>${q ? `<div class="fd-a">${esc(it.c)}</div>` : ''}</div>`;
    }).join('') + '</div>';
  }
  $q.addEventListener('input', () => { st.q = $q.value.trim(); chips(); list(); });
  $c.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; st.c = b.dataset.c; st.q = ''; $q.value = ''; save(); chips(); list(); });
  $r.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; st.r = +b.dataset.r; chips(); list(); });

  fetch('/programs/mom/food.json').then((r) => r.json()).then((d) => {
    items = d.items || [];
    cats = [...new Set(items.map((i) => i.c))];
    if (st.c !== '전체' && !cats.includes(st.c)) st.c = cats[0];
    chips(); list();
  }).catch(() => { $l.innerHTML = '<div class="empty">목록을 불러오지 못했어요. 새로고침해 주세요.</div>'; });
})();
