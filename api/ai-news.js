// AI 백과사전 맨 위 'AI 새 소식'. 정해 둔 사이트들에서 AI 기사를 모아 중요한 것만 골라 종류별로 나눔.
// 한국 시간 0시·12시, 하루 두 번만 새로 모으고 그 사이에는 같은 묶음을 보여줌 (Redis에 12시간 단위로 저장)
// 사이트마다 구글 뉴스 RSS의 site: 검색을 씀 (키 필요 없음, 모양이 같아서 한 번에 읽음)
import { redis, hasRedis } from "./_redis.js";

// 가져오는 사이트: group = 국내 언론 | 해외 언론 | 공식 발표
export const SOURCES = [
  { name: "AI타임스", site: "aitimes.com", group: "국내 언론", lang: "ko" },
  { name: "지디넷코리아", site: "zdnet.co.kr", group: "국내 언론", lang: "ko" },
  { name: "전자신문", site: "etnews.com", group: "국내 언론", lang: "ko" },
  { name: "TechCrunch", site: "techcrunch.com", group: "해외 언론", lang: "en" },
  { name: "The Verge", site: "theverge.com", group: "해외 언론", lang: "en" },
  { name: "VentureBeat", site: "venturebeat.com", group: "해외 언론", lang: "en" },
  { name: "OpenAI", site: "openai.com", group: "공식 발표", lang: "en", official: true },
  { name: "Anthropic", site: "anthropic.com", group: "공식 발표", lang: "en", official: true },
  { name: "Google", site: "blog.google", group: "공식 발표", lang: "en", official: true },
];

// 기사 종류: 제목 낱말로 나눔 (위에 있는 것이 먼저)
const TYPES = [
  ["정책·규제", /규제|법안|정부|정책|과기정통부|소송|저작권|regulat|law\b|lawsuit|policy|congress|senate|\beu\b|white house|copyright|ban\b/i],
  ["새 모델", /출시|공개|선보|launch|release|unveil|introduc|debut|new model|\bgpt-?\d|claude \w+ \d|gemini \d|grok \d|llama \d|deepseek[- ]v\d|qwen\d/i],
  ["기업·투자", /투자|인수|상장|매출|기업가치|유치|파트너십|funding|raises|acquir|valuation|ipo|revenue|deal|partner/i],
  ["기능·서비스", /기능|업데이트|에이전트|앱|도입|서비스|feature|update|agent|app\b|rolls? out|available|launches in/i],
  ["연구·기술", /연구|논문|벤치마크|칩|gpu|반도체|research|paper|benchmark|chip|model card|safety/i],
];
// 중요도를 올리는 이름들
const BIG = /openai|anthropic|claude|gemini|google|deepmind|grok|xai|meta|llama|deepseek|qwen|mistral|nvidia|microsoft|copilot|챗gpt|chatgpt|오픈ai|클로드|제미나이|엔비디아|네이버|하이퍼클로바|엑사원|lg ai|카카오|카나나|업스테이지|솔라|삼성|sk텔레콤/i;
const AIWORD = /\bai\b|인공지능|llm|생성형|모델|에이전트|gpt|chatbot|챗봇/i;

const UA = { "User-Agent": "Mozilla/5.0 (compatible; ai-leehyun/1.0)", "Accept-Language": "ko-KR,ko;q=0.9" };
const unxml = (s) => String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unxml(m[1].trim()) : ""; };

function feedUrl(s) {
  const q = s.official ? `site:${s.site} when:7d` : `site:${s.site} (${s.lang === "ko" ? "AI OR 인공지능 OR 생성형" : "AI OR OpenAI OR Anthropic OR Gemini"}) when:2d`;
  return s.lang === "ko"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

async function fromSource(s) {
  const r = await fetch(feedUrl(s), { headers: UA });
  if (!r.ok) return [];
  return (await r.text()).split("<item>").slice(1, 30).map((it) => {
    let title = tag(it, "title");
    const src = tag(it, "source");
    if (src && title.endsWith(` - ${src}`)) title = title.slice(0, -(src.length + 3));
    const type = (TYPES.find(([, re]) => re.test(title)) || ["기타"])[0];
    const big = BIG.test(title);
    let score = (s.official ? 4 : 0) + (big ? 3 : 0) + (AIWORD.test(title) ? 1 : 0)
      + ({ "새 모델": 3, "정책·규제": 3, "기업·투자": 2, "기능·서비스": 2, "연구·기술": 1 }[type] || 0);
    return { title, url: tag(it, "link"), source: s.name, group: s.group, type, score, at: new Date(tag(it, "pubDate")).toISOString() };
  });
}

// 비슷한 제목(앞 18글자 같음)은 하나만
const keyOf = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 18);

async function crawl() {
  const lists = await Promise.all(SOURCES.map((s) => fromSource(s).catch(() => [])));
  const seen = new Set();
  const now = Date.now();
  return lists.flat()
    .filter((n) => n.title && n.score >= 4 && !seen.has(keyOf(n.title)) && seen.add(keyOf(n.title)))
    .map((n) => ({ ...n, score: n.score + (now - new Date(n.at).getTime() < 24 * 3600e3 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || (a.at < b.at ? 1 : -1))
    .slice(0, 30);
}

function slot(now = Date.now()) {
  const H12 = 12 * 3600e3, KST = 9 * 3600e3;
  const start = Math.floor((now + KST) / H12) * H12 - KST;
  return { start, left: Math.max(60, Math.round((start + H12 - now) / 1000)) };
}

export default async function handler(req, res) {
  const { start, left } = slot();
  const key = `ainews:v2:${start}`;
  let items = null;
  try {
    if (hasRedis()) {
      const [got] = await redis([["GET", key]]);
      if (got) items = JSON.parse(got);
    }
  } catch (e) { console.error(e); }
  if (!items) {
    try { items = await crawl(); } catch (e) { console.error(e); items = []; }
    if (items.length && hasRedis()) {
      try { await redis([["SET", key, JSON.stringify(items), "EX", 60 * 60 * 48]]); } catch (e) { console.error(e); }
    }
  }
  res.setHeader("Cache-Control", `public, s-maxage=${items.length ? left : 120}, stale-while-revalidate=600`);
  return res.status(200).json({
    items,
    sources: SOURCES.map(({ name, group }) => ({ name, group })),
    types: TYPES.map(([t]) => t),
    updatedAt: new Date(start).toISOString(),
    nextAt: new Date(start + 12 * 3600e3).toISOString(),
  });
}
