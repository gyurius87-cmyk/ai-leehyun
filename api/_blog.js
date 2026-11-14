// 스터디 (블로그): 스터디 발표 글. 블록 = 글(마크다운) | 사진 | 영상 | 제로에게 맡기기(AI가 채우는 칸)
// 저장: stk:blog:<id> {id,title,blocks,at,upd}, 목록 stk:blogs (id), 사진 stk:bimg:<id> (data URL, 화면에서 줄여서 올림)
import { claude, aiWaiting } from "./_ai.js";
import { redis, kstDay } from "./_redis.js";

const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clip = (s, n) => String(s ?? "").slice(0, n);
const cleanBlock = (b) => {
  const t = ["text", "img", "video", "ai", "chart"].includes(b?.t) ? b.t : "text";
  if (t === "chart") return { t, spec: clip(b.spec, 2000), cap: clip(b.cap, 300) };
  if (t === "img") return { t, img: clip(b.img, 40), cap: clip(b.cap, 300) };
  if (t === "video") return { t, url: clip(b.url, 500), cap: clip(b.cap, 300) };
  if (t === "ai") return { t, ask: clip(b.ask, 3000), out: clip(b.out, 30000), at: +b.at || 0 };
  return { t, md: clip(b.md, 30000) };
};

// 제로가 아직 쓰는 중인 칸: 접수함 일 이름 '스터디 글 칸 <id>:<칸 번호>'
const pendOf = (w, id) => w.jobs.filter((j) => j.label.startsWith(`스터디 글 칸 ${id}:`)).map((j) => ({ bi: +j.label.split(":").pop(), at: j.at }));
export async function blogList() {
  const [[ids], w] = await Promise.all([redis([["LRANGE", "stk:blogs", 0, 199]]), aiWaiting()]); if (!ids?.length) return { list: [], seen: w.seen };
  const vals = await redis(ids.map((i) => ["GET", "stk:blog:" + i]));
  return { seen: w.seen, list: vals.map(json).filter(Boolean).map((p) => ({ pend: pendOf(w, p.id).length,  id: p.id, title: p.title, at: p.at, upd: p.upd, n: p.blocks.length, cover: p.blocks.find((b) => b.t === "img")?.img || "", lead: (p.blocks.find((b) => b.t === "text" && b.md)?.md || "").slice(0, 120) })) };
}
export async function blogView(id) { const [p, w] = await Promise.all([blogGet(id), aiWaiting()]); return p ? { ...p, pend: pendOf(w, id), seen: w.seen } : null; }
export async function blogGet(id) { const [c] = await redis([["GET", "stk:blog:" + id]]); return json(c); }
export async function blogSave(p) {
  const id = /^[a-z0-9]{6,20}$/.test(p?.id || "") ? p.id : nid(), old = await blogGet(id);
  const out = { id, title: clip(p?.title, 200) || "제목 없음", blocks: (p?.blocks || []).slice(0, 300).map(cleanBlock), at: old?.at || Date.now(), upd: Date.now() };
  await redis([["SET", "stk:blog:" + id, JSON.stringify(out)], ...(old ? [] : [["LPUSH", "stk:blogs", id]])]);
  return out;
}
export async function blogDel(id) { const p = await blogGet(id); await redis([["DEL", "stk:blog:" + id], ["LREM", "stk:blogs", 0, id], ...(p?.blocks || []).filter((b) => b.t === "img" && b.img).map((b) => ["DEL", "stk:bimg:" + b.img])]); return { ok: true }; }
export async function blogImgPut(data) {
  if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(data || "") || data.length > 950000) return { err: "img" };
  const id = nid(); await redis([["SET", "stk:bimg:" + id, data]]); return { id };
}
export async function blogImgGet(id) { const [d] = await redis([["GET", "stk:bimg:" + id]]); return { data: d || "" }; }

// 제로에게 맡기기: 글 전체를 맥락으로, 그 칸의 부탁을 채움 (구독 접수함)
export async function blogAi(id, bi, deps) {
  const p = await blogGet(id); if (!p) return { err: "none" }; const b = p.blocks[+bi]; if (!b || b.t !== "ai" || !b.ask.trim()) return { err: "block" };
  const ctx = p.blocks.map((x, i) => (i === +bi ? `[▶ 여기를 채워 주세요: ${x.ask}]` : x.t === "text" ? x.md : x.t === "img" ? `[사진${x.cap ? ": " + x.cap : ""}]` : x.t === "video" ? `[영상 ${x.url}${x.cap ? " " + x.cap : ""}]` : x.t === "chart" ? `[차트: ${x.spec}${x.cap ? " " + x.cap : ""}]` : x.out ? `[제로가 쓴 칸: ${x.out.slice(0, 1500)}]` : "")).filter(Boolean).join("\n\n");
  const [br] = await redis([["GET", "stk:brief:" + kstDay()]]); const B = json(br);
  const prompt = `이현이 주식 스터디 발표 글을 블로그처럼 쓰고 있어요. 글 중간의 한 칸을 당신(제로)에게 맡겼어요. 그 칸에 들어갈 내용만 써 주세요.
- 이현의 부탁: ${b.ask}
- 글 제목: ${p.title}
- 쉬운 한국어, 마크다운 (소제목 ##, 목록, 표 가능). 앞뒤 글과 자연스럽게 이어지게. 인사말·설명 없이 칸에 들어갈 내용만.
- 모르는 최신 사실·숫자는 지어내지 말고 "확인 필요"라고 적어요. 투자 권유가 아니라 공부용이에요.
- 시각 자료를 넉넉히 넣어요. 아래 한 줄짜리 명령을 '그 줄에 그것만' 쓰면 화면에서 실제 데이터로 그림이 돼요 (숫자를 몰라도 그림이 실제 값을 보여 줘요):
  [[chart NVDA,SPY 1y]] 주가 또는 여러 종목 수익률 비교 (야후 심볼, 기간 1mo 3mo 6mo 1y 2y 5y 10y)
  [[tv NASDAQ:NVDA]] 트레이딩뷰 차트
  [[bars 제목 | 이름 값, 이름 값]] 막대 (값을 아는 것만)
  [[pie 제목 | 이름 값, 이름 값]] 원그래프 (값을 아는 것만)
  [[f13 CIK]] 그 펀드의 최신 13F 상위 종목 원그래프·표
  [[f13bt CIK,CIK]] 13F 공개일에 따라 산 성과 vs S&P500 곡선과 순위 (최대 5개)
  [[analog 심볼 | 지금 구간 시작일 | 과거 시작일, 과거 시작일 | 거래일 수]] 지금 하락과 과거 구간을 시작=0%로 겹치고 (지금 구간 시작일에 peak 라고 쓰면 최근 1년 최고가 날부터) 닮은 정도·최대 하락 표 (예: [[analog ^IXIC | 2026-10-29 | 2000-03-10, 2022-01-03 | 120]])
  [[whatif 금액 | 시작일 또는 peak:심볼 | 심볼, 심볼, 현금]] 그날 그 금액을 각각 넣었다면 지금 얼마인지 곡선과 순위 (peak:^SOX = 최근 1년 최고가 날, 인버스 ETF SQQQ·SOXS, 채권 TLT, 금 GLD, 달러 UUP 등 가능)
  13F 펀드 CIK: 버크셔 1067983, 퍼싱 스퀘어(애크먼) 1336528, 사이언(버리) 1649339, 브리지워터(달리오) 1350694, 듀케인(드러켄밀러) 1536411, 히말라야(리루) 1709323, 달랄 스트리트(파브라이) 1549575, 아팔루사(테퍼) 1656456, ARK(캐시 우드) 1697748, 소로스 1029160, 국민연금 1608046
  여러 과거와 지금을 연도별로 하나씩 비교할 때는 여러 줄 블록 (닮은 정도 낮은 순서로 자동 정렬, 사건은 차트에 표시):
  [[analogs ^IXIC | peak | 250
  2000-03-10 | 닷컴 버블 붕괴 | 한 줄 설명 | 2000-04-14 급락: 내용; 2001-01-03 반등: 내용
  ]]
  [[f13rank 시작일]] 등록된 13F 펀드 전부의 따라 하기 성적 랭킹존 (전체·최근 3개월·시작일 이후 하락장 방어·최대 낙폭 탭)
- 이현은 글보다 그림으로 보고 비교하는 걸 원해요. 텍스트는 최소로, 꼭 필요한 핵심만 짧게 (소제목 + 한두 줄 + 그림). '그림 읽는 법' 같은 사용 설명은 쓰지 마요. 표·그림을 넉넉히.
- 글 속 펀드·인물 이름(버핏, 애크먼 등)은 화면에서 누르면 소개와 포트폴리오가 떠요.
${B?.headline ? `- 참고: 오늘(${kstDay()}) 시장 정리 한 줄: ${B.headline}` : ""}

[지금까지의 글]
${ctx}`;
  const msg = await claude({ max_tokens: 4000, messages: [{ role: "user", content: prompt }] }, `스터디 글 칸 ${id}:${+bi}`);
  const t = msg.content.filter((x) => x.type === "text").map((x) => x.text).join("").trim();
  const now = await blogGet(id); const nb = now?.blocks?.[+bi]; if (!nb || nb.t !== "ai") return { err: "moved" };
  nb.out = t; nb.at = Date.now(); now.upd = Date.now();
  await redis([["SET", "stk:blog:" + id, JSON.stringify(now)]]);
  return now;
}
