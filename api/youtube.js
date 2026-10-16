// 홈의 '유튜브 최신 영상' 한 줄. 이현님 채널의 공개 RSS를 읽어 새 영상부터 돌려줌 (키 필요 없음, 10분 캐시)
import { fetchChannel } from "./_youtube.js";

const CHANNEL_ID = "UCIYCw2XtVtNibEApbO8HeQA"; // 유튜브 @AI이현

export default async function handler(req, res) {
  try {
    const ch = await fetchChannel(CHANNEL_ID);
    if (!ch) return res.status(502).json({ items: [] });
    const items = ch.items
      .sort((a, b) => (a.published < b.published ? 1 : -1))
      .slice(0, 8)
      .map(({ id, title, url, short, published }) => ({ id, title, url, short, published }));
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({ items });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ items: [] });
  }
}
