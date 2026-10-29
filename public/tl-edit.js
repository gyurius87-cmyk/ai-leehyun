// 공부한 것 고치기. /api/timeline 의 수정본을 화면에 덮어씌우고, 관리 키가 있는 이현님에게만 ✏️ 수정 모드를 보여줌.
(() => {
  const CATS = ['사이트', '프로그램', '자동화', '브랜드', '공부노트', '사업', '재테크모임'];
  const label = (c) => (c === '사업' ? '사업 운영실' : c);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmtMin = (n) => { const h = Math.floor(n / 60), m = n % 60; return (h ? `${h}시간` : '') + (m ? `${h ? ' ' : ''}${m}분` : ''); };
  let key = ''; try { key = localStorage.getItem('ai-admin-key') || ''; } catch {}
  const page = document.getElementById('days');
  let editing = false; try { editing = !!page && !!key && sessionStorage.getItem('tl-editing') === '1'; } catch {}
  let edits = {};

  const css = document.createElement('style');
  css.textContent = `
  .tl-edit-btn{min-height:40px;padding:0 14px;border:1.5px solid var(--charcoal);border-radius:999px;background:var(--white);color:var(--ink);font:600 14px var(--sans);cursor:pointer;flex:none}
  .tl-edit-btn[aria-pressed=true]{background:var(--charcoal);color:var(--white)}
  .tl-mini{border:1px solid var(--line);background:var(--white);color:var(--ink);border-radius:8px;padding:2px 8px;font:500 13px var(--sans);cursor:pointer;margin-left:6px;vertical-align:middle}
  .tl-mini.warn{color:#c0392b}
  .day-items li.tl-gone{opacity:.45}.day-items li.tl-gone .tx{text-decoration:line-through}
  .day-items li .tl-tag{font-size:12px;color:var(--muted);margin-left:6px}
  .tl-form{display:grid;gap:8px;grid-column:1/-1;background:var(--white);border:1.5px solid var(--charcoal);border-radius:12px;padding:12px}
  .tl-form .row{display:flex;gap:8px;flex-wrap:wrap}
  .tl-form input,.tl-form select,.tl-form textarea{font:15px var(--sans);padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--white);color:var(--ink);min-width:0}
  .tl-form textarea{min-height:76px;resize:vertical;width:100%;box-sizing:border-box}
  .tl-form input[name=link]{flex:1}
  .tl-form .btns{display:flex;gap:8px;flex-wrap:wrap}
  .tl-form .btns button{min-height:38px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--white);color:var(--ink);font:600 14px var(--sans);cursor:pointer}
  .tl-form .btns .ok{background:var(--charcoal);color:var(--white);border-color:var(--charcoal)}
  .tl-form .btns .del{color:#c0392b;margin-left:auto}
  .tl-add{margin-top:8px}
  .tl-key{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
  .tl-key input{font:15px var(--sans);padding:8px 10px;border:1px solid var(--line);border-radius:8px}`;
  document.head.appendChild(css);

  async function save(body) {
    const r = await fetch('/api/timeline', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: JSON.stringify(body) });
    if (r.status === 401) { alertBox('관리 키가 맞지 않아요.'); return false; }
    if (!r.ok) { alertBox('저장하지 못했어요. 잠시 뒤 다시 해 주세요.'); return false; }
    location.reload(); return true;
  }
  function alertBox(msg) { const b = document.querySelector('.tl-msg') || Object.assign(document.createElement('p'), { className: 'tl-msg' }); b.textContent = msg; b.style.color = '#c0392b'; page?.before(b); }

  function liHtml(o) {
    return `<time>${esc(o.time)}</time><span><b class="cat" data-c="${esc(o.cat)}">${esc(label(o.cat))}</b> <span class="tx">${esc(o.text)}</span>${o.link ? ` <a href="${esc(o.link)}">보러가기 →</a>` : ''}</span>`;
  }
  function setLi(li, o) { li.dataset.cat = o.cat; li.dataset.link = o.link || ''; li.innerHTML = liHtml(o); }
  const read = (li) => ({ time: li.querySelector('time')?.textContent || '', cat: li.dataset.cat || '사이트', text: li.querySelector('.tx')?.textContent || '', link: li.dataset.link || '' });
  function sortDay(ul) { [...ul.children].sort((a, b) => (a.querySelector('time')?.textContent < b.querySelector('time')?.textContent ? 1 : -1)).forEach((li) => ul.appendChild(li)); }

  function apply() {
    document.querySelectorAll('.day-items li[data-k]').forEach((li) => {
      const e = edits[li.dataset.k]; if (!e) return;
      li.dataset.edited = '1';
      if (e.del) { if (editing) li.classList.add('tl-gone'); else li.remove(); return; }
      setLi(li, e);
    });
    Object.entries(edits).forEach(([k, e]) => {
      if (!k.startsWith('add|')) return;
      const ul = document.querySelector(`.day-block[data-date="${e.date}"] .day-items`); if (!ul) return;
      const li = document.createElement('li'); li.dataset.k = k; li.dataset.added = '1'; setLi(li, e); ul.appendChild(li); sortDay(ul);
    });
    Object.entries(edits).forEach(([k, e]) => {
      if (!k.startsWith('min|')) return;
      const day = document.querySelector(`.day-block[data-date="${k.slice(4)}"]`); if (!day) return;
      day.dataset.min = e.minutes;
      const s = day.querySelector('.studied'); if (s) { s.textContent = e.minutes ? `${fmtMin(e.minutes)} 공부` : ''; s.hidden = !e.minutes; }
    });
    // 공부한 것 페이지의 총 공부 시간도 다시 계산
    const tot = document.querySelector('.stat.total .num');
    if (page && tot && Object.keys(edits).some((k) => k.startsWith('min|'))) {
      const t = [...document.querySelectorAll('#days .day-block')].reduce((s, d) => s + Number(d.dataset.min || 0), 0);
      tot.innerHTML = `${Math.floor(t / 60)}<small>시간</small>${t % 60 ? `<span class="mm">${t % 60}</span><small>분</small>` : ''}`;
    }
  }

  function form(o, { onSave, onDel, onUndo }) {
    const f = document.createElement('form'); f.className = 'tl-form';
    f.innerHTML = `<div class="row"><input name="time" type="time" value="${esc(o.time)}" required><select name="cat">${CATS.map((c) => `<option value="${c}"${c === o.cat ? ' selected' : ''}>${label(c)}</option>`).join('')}</select><input name="link" placeholder="링크 (없으면 비워 두기)" value="${esc(o.link)}"></div>
      <textarea name="text" required placeholder="무엇을 했는지 한 줄로">${esc(o.text)}</textarea>
      <div class="btns"><button class="ok" type="submit">저장</button><button type="button" data-x="cancel">취소</button>${onUndo ? '<button type="button" data-x="undo">원래대로</button>' : ''}${onDel ? '<button type="button" class="del" data-x="del">삭제</button>' : ''}</div>`;
    f.addEventListener('submit', (ev) => { ev.preventDefault(); const v = Object.fromEntries(new FormData(f)); onSave({ ...v, text: v.text.trim() }); });
    f.addEventListener('click', (ev) => {
      const x = ev.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'cancel') location.reload();
      if (x === 'undo') onUndo();
      if (x === 'del') { const b = ev.target; if (b.dataset.sure) onDel(); else { b.dataset.sure = '1'; b.textContent = '정말 삭제할까요?'; setTimeout(() => { delete b.dataset.sure; b.textContent = '삭제'; }, 3000); } }
    });
    return f;
  }

  function editUi() {
    document.querySelectorAll('#days .day-items li[data-k]').forEach((li) => {
      const k = li.dataset.k, added = li.dataset.added, gone = li.classList.contains('tl-gone');
      const span = li.querySelector(':scope > span'); if (!span) return;
      if (gone) { span.insertAdjacentHTML('beforeend', '<span class="tl-tag">삭제함</span><button type="button" class="tl-mini" data-undo>되돌리기</button>'); }
      else span.insertAdjacentHTML('beforeend', `${li.dataset.edited && !added ? '<span class="tl-tag">고침</span>' : ''}<button type="button" class="tl-mini" data-ed>✏️ 수정</button>`);
      li.querySelector('[data-undo]')?.addEventListener('click', () => save({ op: 'undo', k }));
      li.querySelector('[data-ed]')?.addEventListener('click', () => {
        const o = read(li);
        li.replaceChildren(form(o, {
          onSave: (v) => save(added ? { op: 'add', k, date: k.split('|')[1], ...v } : { op: 'edit', k, ...v }),
          onDel: () => save(added ? { op: 'undo', k } : { op: 'del', k }),
          onUndo: li.dataset.edited && !added ? () => save({ op: 'undo', k }) : null,
        }));
      });
    });
    document.querySelectorAll('#days .day-block').forEach((day) => {
      const date = day.dataset.date, lab = day.querySelector('.day-label');
      lab.insertAdjacentHTML('beforeend', `<div><button type="button" class="tl-mini" data-min style="margin:8px 0 0">⏱ 시간 ${day.dataset.min || 0}분</button></div>`);
      lab.querySelector('[data-min]').addEventListener('click', (ev) => {
        const b = ev.currentTarget, box = document.createElement('div'); box.className = 'tl-key';
        box.innerHTML = `<input type="number" min="0" max="1440" step="5" value="${day.dataset.min || 0}" style="width:90px"> 분 <button type="button" class="tl-mini">저장</button>`;
        b.replaceWith(box);
        box.querySelector('button').addEventListener('click', () => save({ op: 'min', date, minutes: box.querySelector('input').value }));
      });
      const ul = day.querySelector('.day-items');
      const add = document.createElement('button'); add.type = 'button'; add.className = 'tl-mini tl-add'; add.textContent = '＋ 이 날에 추가';
      ul.after(add);
      add.addEventListener('click', () => {
        const li = document.createElement('li'); ul.prepend(li); add.remove();
        const now = new Date(); const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        li.append(form({ time: t, cat: '프로그램', text: '', link: '' }, { onSave: (v) => save({ op: 'add', date, ...v }) }));
      });
    });
  }

  function toolbarBtn() {
    const bar = document.querySelector('.toolbar'); if (!bar) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tl-edit-btn';
    b.setAttribute('aria-pressed', String(editing)); b.textContent = editing ? '수정 끝내기' : '✏️ 수정';
    b.addEventListener('click', () => { try { editing ? sessionStorage.removeItem('tl-editing') : sessionStorage.setItem('tl-editing', '1'); } catch {} location.reload(); });
    bar.appendChild(b);
  }
  // 관리 키가 이 브라우저에 없으면 주소 뒤에 ?edit 를 붙여 들어와서 한 번 넣으면 됨
  function keyBox() {
    const box = document.createElement('div'); box.className = 'tl-key';
    box.innerHTML = '<input type="password" placeholder="관리 키" autocomplete="off"><button type="button" class="tl-mini">수정 모드 켜기</button>';
    page.before(box);
    box.querySelector('button').addEventListener('click', () => { const v = box.querySelector('input').value.trim(); if (!v) return; try { localStorage.setItem('ai-admin-key', v); sessionStorage.setItem('tl-editing', '1'); } catch {} location.replace(location.pathname); });
  }

  fetch('/api/timeline').then((r) => (r.ok ? r.json() : { edits: {} })).catch(() => ({ edits: {} })).then((j) => {
    edits = j.edits || {};
    apply();
    if (page && key) { toolbarBtn(); if (editing) editUi(); }
    else if (page && /[?&]edit\b/.test(location.search)) keyBox();
  });
})();
