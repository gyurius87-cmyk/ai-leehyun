// 방문·클릭 기록. 개인정보 없이 브라우저마다 무작위 id만 받아 '방문자 수'를 셈.
import { redis, hasRedis, kstDay, expire } from "./_redis.js";

// 유입 경로: 릴스용 링크 표시(?r=) > 앱(인스타·카톡) > 검색 > 기타 사이트 > 직접
function source(ref, ua, tag, host) {
  if (tag) return `링크: ${tag}`;
  ua = ua || ""; let h = "";
  try { h = ref ? new URL(ref).hostname.replace(/^www\./, "") : ""; } catch {}
  if (h && host && h === host) return null; // 사이트 안에서 이동
  if (/instagram/i.test(ua) || /instagram\.com$/.test(h)) return "인스타그램";
  if (/KAKAOTALK/i.test(ua) || /kakao\.com$|kakaocdn/.test(h)) return "카카오톡";
  if (/threads\.(net|com)$/.test(h)) return "스레드";
  if (/naver\.com$/.test(h)) return "네이버";
  if (/google\./.test(h)) return "구글";
  if (/daum\.net$/.test(h)) return "다음";
  if (/youtube\.com$|youtu\.be$/.test(h)) return "유튜브";
  if (/facebook\.com$/.test(h)) return "페이스북";
  if (/claude\.ai$/.test(h)) return "Claude";
  if (h) return h.slice(0, 40);
  return "직접·알 수 없음";
}

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!hasRedis()) return res.status(204).end();
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const day = kstDay(), vid = clip(b.vid, 40), path = clip(b.path, 80) || "/";
  const cmds = [];
  if (b.t === "view") {
    cmds.push(["INCR", `v:${day}`], expire(`v:${day}`), ["HINCRBY", `p:${day}`, path, 1], expire(`p:${day}`));
    if (vid) cmds.push(["PFADD", `u:${day}`, vid], expire(`u:${day}`), ["PFADD", "u:all", vid]);
    if ("ref" in b) {
      const src = source(clip(b.ref, 300), req.headers["user-agent"], clip(b.tag, 30), String(req.headers.host || "").replace(/^www\./, ""));
      if (src) cmds.push(["HINCRBY", `s:${day}`, src, 1], expire(`s:${day}`));
    }
  } else if (b.t === "click") {
    const label = clip(b.label, 40); if (!label) return res.status(204).end();
    cmds.push(["HINCRBY", `c:${day}`, `${path} › ${label}`, 1], expire(`c:${day}`));
  } else return res.status(400).end();
  try { await redis(cmds); } catch (e) { console.error(e); }
  return res.status(204).end();
}
