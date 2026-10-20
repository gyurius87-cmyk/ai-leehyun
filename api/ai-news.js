// AI 백과사전의 'AI 새 소식'. 구글 뉴스 RSS(키 필요 없음)에서 최근 AI 기사를 모아 돌려줌 (30분 캐시)
const UA = { "User-Agent": "Mozilla/5.0 (compatible; ai-leehyun/1.0)", "Accept-Language": "ko-KR,ko;q=0.9" };
const QUERIES = {
  ko: "https://news.google.com/rss/search?q=%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5+OR+%EC%83%9D%EC%84%B1%ED%98%95AI+when:3d&hl=ko&gl=KR&ceid=KR:ko",
  en: "https://news.google.com/rss/search?q=%22generative+AI%22+OR+OpenAI+OR+Anthropic+OR+%22Google+Gemini%22+when:3d&hl=en-US&gl=US&ceid=US:en",
};
const unxml = (s) => String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unxml(m[1].trim()) : ""; };

async function load(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) return [];
  return (await r.text()).split("<item>").slice(1).map((it) => {
    const source = tag(it, "source");
    let title = tag(it, "title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { title, url: tag(it, "link"), source, at: new Date(tag(it, "pubDate")).toISOString() };
  });
}

export default async function handler(req, res) {
  const lang = req.query?.lang === "en" ? "en" : "ko";
  let items = [];
  try { items = await load(QUERIES[lang]); } catch (e) { console.error(e); }
  const seen = new Set();
  items = items
    .filter((n) => n.title && !seen.has(n.title) && seen.add(n.title))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 30);
  res.setHeader("Cache-Control", `public, s-maxage=${items.length ? 1800 : 120}, stale-while-revalidate=7200`);
  return res.status(200).json({ items, lang, from: "google-news" });
}
