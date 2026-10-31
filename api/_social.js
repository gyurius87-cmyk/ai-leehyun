// SNS 발언: 트럼프 트루스소셜(아카이브 RSS) + 유명인 발언 뉴스(구글 뉴스 RSS) + 레딧 월스트리트베츠 언급 종목
// → Claude가 사람별로 한 줄 해석·관련 종목·호재/악재를 붙임. 3시간 캐시, 매일 아침 cron.
import Anthropic from "@anthropic-ai/sdk";
import { redis } from "./_redis.js";
import { recordUsage } from "./_usage.js";

const MODEL = process.env.STOCK_MODEL || "claude-sonnet-5-5";
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const unxml = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const tag = (it, t) => unxml((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);

export const PEOPLE = [
  { id: "trump", who: "도널드 트럼프", q: '"Trump" (tariff OR stocks OR market OR Fed OR "Truth Social") when:2d', truth: true },
  { id: "musk", who: "일론 머스크", q: '"Elon Musk" (said OR posts OR X) (Tesla OR stock OR market OR economy) when:2d' },
  { id: "powell", who: "제롬 파월 (연준)", q: '"Powell" (rates OR inflation OR Fed) when:3d' },
  { id: "huang", who: "젠슨 황 (엔비디아)", q: '"Jensen Huang" when:3d' },
  { id: "buffett", who: "워런 버핏", q: '"Warren Buffett" OR "Berkshire Hathaway" when:5d' },
  { id: "wood", who: "캐시 우드", q: '"Cathie Wood" when:5d' },
  { id: "ackman", who: "빌 애크먼", q: '"Bill Ackman" when:5d' },
  { id: "burry", who: "마이클 버리", q: '"Michael Burry" when:7d' },
  { id: "dimon", who: "제이미 다이먼 (JP모건)", q: '"Jamie Dimon" when:5d' },
  { id: "bessent", who: "스콧 베선트 (재무장관)", q: '"Bessent" (Treasury OR tariff OR market) when:3d' },
];

async function gnews(q) {
  const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { headers: UA }); if (!r.ok) throw new Error("gnews " + r.status);
  const x = await r.text();
  return x.split("<item>").slice(1, 9).map((it) => ({ t: tag(it, "title").replace(/\s+-\s+[^-]+$/, ""), src: tag(it, "source"), link: tag(it, "link"), at: Date.parse(tag(it, "pubDate")) || 0 })).filter((v) => v.t);
}
// 트루스소셜 게시글 아카이브 (trumpstruth.org RSS)
async function truth() {
  const r = await fetch("https://trumpstruth.org/feed", { headers: UA }); if (!r.ok) throw new Error("truth " + r.status);
  const x = await r.text();
  return x.split("<item>").slice(1, 16).map((it) => ({ t: (tag(it, "description") || tag(it, "title")).slice(0, 400), src: "Truth Social", link: tag(it, "link"), at: Date.parse(tag(it, "pubDate")) || 0, post: true })).filter((v) => v.t && !/^RT @/.test(v.t));
}
// 레딧 월스트리트베츠: 인기 글 제목에서 많이 나온 종목 코드
const STOP = new Set("A I AM AN AND ARE AT BE BY CEO DD EOD FOR GDP IPO IS IT ITM OTM IV ME MY NO OF ON OR SO THE TO UP US USA WSB YOLO ATH FD FDS PM AM EPS ETF FED CPI PT IMO LOL WTF OP TL DR".split(" "));
async function wsb() {
  const r = await fetch("https://www.reddit.com/r/wallstreetbets/hot.json?limit=80", { headers: { ...UA, Accept: "application/json" } }); if (!r.ok) throw new Error("reddit " + r.status);
  const posts = ((await r.json())?.data?.children || []).map((c) => c.data).filter((p) => !p.stickied);
  const cnt = new Map();
  posts.forEach((p) => { const seen = new Set(); for (const m of `${p.title} ${p.link_flair_text || ""}`.matchAll(/\$?\b([A-Z]{2,5})\b/g)) { const s = m[1]; if (STOP.has(s) || seen.has(s)) continue; seen.add(s); cnt.set(s, (cnt.get(s) || 0) + 1 + Math.min(3, Math.log10(1 + (p.score || 0)) / 2)); } });
  return { top: [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s, v]) => ({ s, v: Math.round(v * 10) / 10 })), posts: posts.slice(0, 8).map((p) => ({ t: p.title, link: "https://www.reddit.com" + p.permalink, score: p.score, at: (p.created_utc || 0) * 1000 })) };
}

export async function socialSync() {
  const errs = {};
  const lists = await Promise.all(PEOPLE.map(async (p) => {
    const parts = await Promise.all([p.truth ? truth().catch((e) => ((errs.truth = String(e.message)), [])) : [], gnews(p.q).catch((e) => ((errs[p.id] = String(e.message)), []))]);
    const seen = new Set(); return parts.flat().filter((v) => { const k = v.t.slice(0, 50); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.at - a.at).slice(0, 8);
  }));
  const reddit = await wsb().catch((e) => ((errs.reddit = String(e.message)), null));
  // AI 해석: 사람별 최근 항목 → 한 줄 해석·관련 종목·호재/악재
  const inp = PEOPLE.map((p, i) => `## ${p.id} ${p.who}\n` + lists[i].map((v, k) => `${k}. [${v.post ? "본인 게시글" : v.src}] ${v.t}`).join("\n")).join("\n\n");
  let ai = {};
  try {
    const msg = await new Anthropic().messages.create({ model: MODEL, max_tokens: 6000, output_config: { effort: "low" }, messages: [{ role: "user", content: `아래는 유명인별 최근 발언 관련 헤드라인과 게시글이에요. 주식 투자자에게 의미 있는 것만 골라 한국어로 해석해 주세요. 헤드라인에 없는 내용은 지어내지 마세요.
${inp}

JSON 하나만: {"<id>":{"mood":"이 사람의 최근 톤 한 줄","items":[{"k":항목번호,"take":"무슨 말을 했고 시장에 어떤 의미인지 한 줄","stocks":["관련 종목·자산"],"impact":"호재|악재|중립"}]}} — 사람마다 의미 있는 것 최대 4개, 없으면 items 빈 배열.` }] });
    await recordUsage(msg.usage || {}, MODEL);
    const t = msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""); ai = json(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) || {};
  } catch (e) { errs.ai = String(e?.message || e).slice(0, 80); }
  const out = {
    at: Date.now(), errs, reddit,
    people: PEOPLE.map((p, i) => { const a = ai[p.id] || {}; return { id: p.id, who: p.who, mood: a.mood || "", picks: (a.items || []).filter((x) => lists[i][x.k]).map((x) => ({ ...lists[i][x.k], take: x.take, stocks: (x.stocks || []).slice(0, 5), impact: x.impact || "중립" })), raw: lists[i] }; }),
  };
  await redis([["SET", "stk:soc", JSON.stringify(out)]]);
  return out;
}
export async function socialGet(force) {
  if (!force) { const [c] = await redis([["GET", "stk:soc"]]); const j = json(c); if (j && Date.now() - j.at < 3 * 3600e3) return j; }
  return socialSync();
}
