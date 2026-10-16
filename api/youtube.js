// 홈의 '유튜브 최신 영상' 한 줄. 이현님 채널 영상을 새것부터 돌려줌 (키 필요 없음, 10분 캐시)
// 1순위 공개 RSS, RSS가 막히면(404 등) 채널 업로드 재생목록 페이지에서 읽음
import { parseFeed } from "./_youtube.js";

const CHANNEL_ID = "UCIYCw2XtVtNibEApbO8HeQA"; // 유튜브 @AI이현
const UPLOADS = "UU" + CHANNEL_ID.slice(2); // 업로드 재생목록 = 새 영상이 맨 앞
const HEAD = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

async function fromFeed() {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: HEAD });
  if (!r.ok) return null;
  return parseFeed(await r.text()).items
    .sort((a, b) => (a.published < b.published ? 1 : -1))
    .map(({ id, title, url, short, published }) => ({ id, title, url, short, published }));
}

const unjson = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
async function fromPlaylist() {
  const r = await fetch(`https://www.youtube.com/playlist?list=${UPLOADS}&hl=ko`, { headers: HEAD });
  if (!r.ok) return null;
  const html = await r.text();
  const out = [], seen = new Set();
  const re = /"playlistVideoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,4000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  for (let m; (m = re.exec(html)); ) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], title: unjson(m[2]), url: `https://www.youtube.com/watch?v=${m[1]}`, short: false, published: "" });
  }
  return out;
}

export default async function handler(req, res) {
  let items = null, from = "";
  try { items = await fromFeed(); from = "feed"; } catch (e) { console.error(e); }
  if (!items || !items.length) {
    try { items = await fromPlaylist(); from = "playlist"; } catch (e) { console.error(e); }
  }
  res.setHeader("Cache-Control", `public, s-maxage=${items && items.length ? 600 : 120}, stale-while-revalidate=3600`);
  return res.status(200).json({ items: (items || []).slice(0, 8), from, playlist: UPLOADS });
}
