// 프로그램마다 쓰는 이모지 아이콘 (즐겨찾기 화면 + 폰 홈 화면 아이콘 /a/<id>/ 이 같이 씀)
export const ICON = {
  'detail-page': '🖼️', bottleneck: '🧩', mindmap: '🗺️', analytics: '📊', sns: '📱', daily: '🗞️', office: '🏢',
  'biz-office': '🏬', stock: '📈', money: '💰', studio: '🎬', downloader: '⬇️', realestate: '🏠', monetize: '💡',
  'idea-steal': '🕵️', habit: '✅', mom: '📔', golf: '⛳', 'video-lab': '🔬', 'motivation-visual': '🎨', wiki: '📚',
  capture: '📸', 'detail-swap': '🧾', 'memo-todo': '📝', 'prog-recs': '🎁', subs: '💳', 'github-finds': '💎',
  japanese: '🇯🇵', motivation: '🔥', 'zero-upgrade': '🚀', conti: '✏️', 'threads-factory': '🏭', fav: '⭐',
};
export const CAT_ICON = { '업무·운영': '🗂️', 'SNS·콘텐츠': '🎥', '돈·투자': '💰', '공부·생각': '📖' };
export const CAT_BG = { '업무·운영': '#2f6fdc', 'SNS·콘텐츠': '#e2533b', '돈·투자': '#1f9d63', '공부·생각': '#7a4fd6' };
export const iconOf = (p) => ICON[p.id] || CAT_ICON[p.cat] || '🔹';
// 홈 화면 아이콘 밑 이름: 12자 넘으면 띄어쓰기 단위로 자름
const shortName = (n) => { n = n.replace(/\s*\(.*\)$/, ''); if (n.length <= 12) return n; let o = ''; for (const w of n.split(' ')) { if ((o + ' ' + w).trim().length > 12) break; o = (o + ' ' + w).trim(); } return o || n.slice(0, 12); };
// 홈 화면에 올릴 수 있는 것들: 링크 있는 프로그램 전부 (즐겨찾기 자신 포함)
export const appList = (programs) => programs.filter((p) => p.href).map((p) => ({
  id: p.id, name: p.name, cat: p.cat || '', href: p.href, icon: iconOf(p),
  short: shortName(p.name),
}));
