// 홈의 '유튜브 최신 영상' 한 줄. 이현님 채널의 공개 RSS를 읽어 새 영상부터 돌려줌 (키 필요 없음, 10분 캐시)
import { parseFeed } from "./_youtube.js";

const CHANNEL_ID = "UCIYCw2XtVtNibEApbO8HeQA"; // 유튜브 @AI이현

export default async function handler(req, res) {
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-leehyun/1.0)", "Accept-Language": "ko-KR,ko;q=0.9" },
    });
    // 영상이 하나도 없는 채널은 RSS가 404를 줌 → 빈 목록
    if (!r.ok) { res.setHeader("Cache-Control", "public, s-maxage=300"); return res.status(200).json({ items: [], feed: r.status }); }
    const ch = parseFeed(await r.text());
    const items = ch.items
      .sort((a, b) => (a.published < b.published ? 1 : -1))
      .slice(0, 8)
      .map(({ id, title, url, short, published }) => ({ id, title, url, short, published }));
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({ items });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ items: [], error: String(e.message || e) });
  }
}
