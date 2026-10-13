// 유튜브 채널의 최근 영상 가져오기. 공개 RSS(키 필요 없음)를 씀: 최근 15개, 제목·날짜·조회수.
const UA = { "User-Agent": "Mozilla/5.0 (compatible; ai-leehyun/1.0)", "Accept-Language": "ko-KR,ko;q=0.9" };
const unxml = (s) => String(s ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unxml(m[1].trim()) : ""; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`)); return m ? unxml(m[1]) : ""; };

// 주소 → 채널 ID (UC…). /channel/UC… 은 바로, @핸들·/c/·/user/·영상 주소는 페이지에서 찾음
export async function resolveChannelId(input) {
  const s = String(input || "").trim();
  const direct = s.match(/(UC[\w-]{22})/);
  if (direct && !/watch|shorts|youtu\.be/.test(s)) return direct[1];
  let url = s;
  if (/^@[\w.\-가-힣]+$/.test(s)) url = `https://www.youtube.com/${s}`;
  if (!/^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) return null;
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/"externalId":"(UC[\w-]{22})"/) || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) || html.match(/"channelId":"(UC[\w-]{22})"/);
  return m ? m[1] : null;
}

export function parseFeed(xml) {
  const name = tag(xml.split("<entry>")[0], "title");
  const items = xml.split("<entry>").slice(1).map((e) => {
    const id = tag(e, "yt:videoId");
    const link = attr(e, "link", "href") || `https://www.youtube.com/watch?v=${id}`;
    return {
      id, title: tag(e, "title"), url: link, short: /\/shorts\//.test(link),
      published: tag(e, "published"), views: Number(attr(e, "media:statistics", "views")) || 0,
      likes: Number(attr(e, "media:starRating", "count")) || 0,
      desc: tag(e, "media:description").slice(0, 160),
    };
  }).filter((x) => x.id);
  return { name, items };
}

export async function fetchChannel(input) {
  const ytId = await resolveChannelId(input);
  if (!ytId) return null;
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ytId}`, { headers: UA });
  if (!res.ok) return null;
  return { ytId, ...parseFeed(await res.text()) };
}
