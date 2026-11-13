// 프로그램마다 쓰는 이모지 아이콘 (즐겨찾기 화면 + 폰 홈 화면 아이콘 /a/<id>/ 이 같이 씀)
export const ICON = {
  'detail-page': '🖼️', bottleneck: '🧩', mindmap: '🗺️', analytics: '📊', sns: '📱', daily: '🗞️', office: '🏢',
  'biz-office': '🏬', stock: '📈', money: '💰', studio: '🎬', downloader: '⬇️', realestate: '🏠', monetize: '💡',
  'idea-steal': '🕵️', habit: '✅', mom: '📔', golf: '⛳', 'video-lab': '🔬', 'motivation-visual': '🎨', wiki: '📚',
  capture: '📸', 'detail-swap': '🧾', 'memo-todo': '📝', 'prog-recs': '🎁', subs: '💳', 'hf-image': '🎨', 'product-strengths': '🔎', 'github-finds': '💎',
  japanese: '🇯🇵', motivation: '🔥', 'zero-upgrade': '🚀', conti: '✏️', 'threads-factory': '🏭', fav: '⭐', worktime: '⏱️', 'kakao-analyzer': '💬', 'hook-maker': '🪝',
};
// 클로드로 만든 내 사이트들 (프로그램 목록엔 안 나오고 즐겨찾기·폰 아이콘에만)
export const SITE_CAT = '내 사이트';
export const SITES = [
  { id: 'site-home', name: 'AI이현', summary: 'AI 공부를 기록하는 이 사이트의 첫 화면이에요.', href: '/', cat: SITE_CAT, icon: '🏠' },
  { id: 'site-bureading', name: '부리딩', summary: '송도 재테크 모임 사이트예요.', href: 'https://bureading.vercel.app/', cat: SITE_CAT, icon: '📗' },
];
export const CAT_ICON = { '내 사이트': '🌐', '업무·운영': '🗂️', 'SNS·콘텐츠': '🎥', '돈·투자': '💰', '공부·생각': '📖' };
export const CAT_BG = { '내 사이트': '#0f8a8a', '업무·운영': '#2f6fdc', 'SNS·콘텐츠': '#e2533b', '돈·투자': '#1f9d63', '공부·생각': '#7a4fd6' };
export const iconOf = (p) => p.icon || ICON[p.id] || CAT_ICON[p.cat] || '🔹';
// 홈 화면 아이콘 밑 이름: 12자 넘으면 띄어쓰기 단위로 자름
const shortName = (n) => { n = n.replace(/\s*\(.*\)$/, ''); if (n.length <= 12) return n; let o = ''; for (const w of n.split(' ')) { if ((o + ' ' + w).trim().length > 12) break; o = (o + ' ' + w).trim(); } return o || n.slice(0, 12); };
// 홈 화면에 올릴 수 있는 것들: 링크 있는 프로그램 전부 (즐겨찾기 자신 포함)
export const appList = (programs) => [...programs, ...SITES].filter((p) => p.href).map((p) => ({
  id: p.id, name: p.name, cat: p.cat || '', href: p.href, icon: iconOf(p),
  short: shortName(p.name),
}));
