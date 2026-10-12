// 방문·클릭 기록. 개인정보 없이 브라우저마다 무작위 id만 받아 '방문자 수'를 셈.
import { redis, hasRedis, kstDay, expire } from "./_redis.js";

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
  } else if (b.t === "click") {
    const label = clip(b.label, 40); if (!label) return res.status(204).end();
    cmds.push(["HINCRBY", `c:${day}`, `${path} › ${label}`, 1], expire(`c:${day}`));
  } else return res.status(400).end();
  try { await redis(cmds); } catch (e) { console.error(e); }
  return res.status(204).end();
}
