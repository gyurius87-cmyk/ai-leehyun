// 프로그램마다 따로 '앱'으로 홈 화면에 올릴 수 있게 하는 매니페스트 (/a/<id>/app.webmanifest)
import { programs } from '../../../lib/data.js';
import { appList, CAT_BG } from '../../../lib/progIcons.js';

export function getStaticPaths() {
  return appList(programs).map((a) => ({ params: { id: a.id }, props: { a } }));
}
export function GET({ props: { a } }) {
  const bg = a.id === 'fav' ? '#15171a' : CAT_BG[a.cat] || '#15171a';
  const base = `/a/${a.id}/`;
  return new Response(JSON.stringify({
    id: base, name: a.name, short_name: a.short, lang: 'ko',
    start_url: `${base}?go=1`, scope: base, display: 'standalone',
    background_color: bg, theme_color: bg,
    icons: [
      { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }), { headers: { 'content-type': 'application/manifest+json' } });
}
