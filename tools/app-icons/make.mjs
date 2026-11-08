// 폰 홈 화면 아이콘 PNG 만들기: data/programs.json 의 프로그램마다 public/a/<id>/icon-192.png, icon-512.png
// 새 프로그램을 추가하면 한 번 돌려요:  node tools/app-icons/make.mjs   (없는 것만 만듦, --all 이면 다시)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { appList, CAT_BG } = await import(path.join(root, 'src/lib/progIcons.js'));
const programs = JSON.parse(fs.readFileSync(path.join(root, 'data/programs.json'), 'utf8')).programs;
const all = process.argv.includes('--all');
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 512, height: 512 } });
let n = 0;
for (const a of appList(programs)) {
  const dir = path.join(root, 'public/a', a.id);
  if (!all && fs.existsSync(path.join(dir, 'icon-512.png'))) continue;
  fs.mkdirSync(dir, { recursive: true });
  const bg = a.id === 'fav' ? '#15171a' : CAT_BG[a.cat] || '#15171a';
  // 마스커블(가장자리 잘림) 대비로 이모지는 가운데 60% 안에
  await pg.setContent(`<body style="margin:0"><div style="width:512px;height:512px;background:${bg};display:grid;place-items:center"><span style="font:250px 'Noto Color Emoji';line-height:1">${a.icon}</span></div></body>`);
  await pg.screenshot({ path: path.join(dir, 'icon-512.png') });
  await pg.setViewportSize({ width: 192, height: 192 });
  await pg.setContent(`<body style="margin:0"><div style="width:192px;height:192px;background:${bg};display:grid;place-items:center"><span style="font:94px 'Noto Color Emoji';line-height:1">${a.icon}</span></div></body>`);
  await pg.screenshot({ path: path.join(dir, 'icon-192.png') });
  await pg.setViewportSize({ width: 512, height: 512 });
  n++;
}
await b.close();
console.log('icons made:', n);
