// 웹페이지 전체 캡처. 주소를 받아 서버의 크롬으로 페이지 끝까지 찍고 JPG로 돌려줌.
// 이현님만(ADMIN_KEY) 쓸 수 있어요. 무료 서버 시간을 아끼고 남이 마구 쓰지 못하게 하려고요.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { lookup } from "node:dns/promises";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";

// 서버 크롬에는 한글 글꼴이 없어서 저장소 fonts/ 의 Noto Sans KR(OFL)을 크롬 글꼴 폴더(/tmp/fonts)에 넣어 둠
function koFonts() {
  const dir = "/tmp/fonts";
  if (existsSync(`${dir}/ko-400.ttf`)) return;
  mkdirSync(dir, { recursive: true });
  for (const f of ["ko-400.ttf", "ko-700.ttf"]) { const src = join(process.cwd(), "fonts", f); if (existsSync(src)) copyFileSync(src, `${dir}/${f}`); }
}

// 사설망·내부 주소는 막음
const privateIp = (ip) => {
  if (net.isIPv6(ip)) return /^(::1|::|f[cd]|fe80|::ffff:(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip);
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};

const MAX_H = 16000, LIMIT = 4.2 * 1024 * 1024;

export default async function handler(req, res) {
  const admin = process.env.ADMIN_KEY && req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  if (!admin) return res.status(401).json({ error: "auth" });
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  let u;
  try { u = new URL(String(b.url || "").trim()); } catch { return res.status(400).json({ error: "url" }); }
  if (!/^https?:$/.test(u.protocol)) return res.status(400).json({ error: "url" });
  try { const ips = await lookup(u.hostname, { all: true }); if (!ips.length || ips.some((x) => privateIp(x.address))) return res.status(400).json({ error: "url" }); }
  catch { return res.status(400).json({ error: "dns" }); }
  const mobile = b.device === "mobile", width = mobile ? 390 : 1280;

  let browser;
  try {
    koFonts();
    browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width, height: 900, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile } });
    const page = await browser.newPage();
    if (mobile) await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    await page.setExtraHTTPHeaders({ "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" });
    await page.goto(u.href, { waitUntil: "networkidle2", timeout: 25000 }).catch(() => {});
    // 끝까지 천천히 내려서 늦게 뜨는 이미지까지 불러옴
    await page.evaluate(async (maxH) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxH); y += 700) { window.scrollTo(0, y); await sleep(120); }
      window.scrollTo(0, 0); await sleep(400);
    }, MAX_H).catch(() => {});
    await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })))).catch(() => {});
    const h = Math.min(await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)).catch(() => 900), MAX_H);
    let img, q;
    for (q of [76, 66, 56, 46, 38]) {
      img = await page.screenshot({ type: "jpeg", quality: q, clip: { x: 0, y: 0, width, height: h }, captureBeyondViewport: true });
      if (img.length < LIMIT) break;
    }
    if (img.length >= LIMIT) return res.status(413).json({ error: "too_big" });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Size", `${width}x${h}`);
    res.setHeader("X-Quality", String(q));
    res.setHeader("X-Cut", h >= MAX_H ? "1" : "0");
    return res.send(Buffer.from(img));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "shot", detail: String(e?.message || e).slice(0, 200) });
  } finally {
    await browser?.close().catch(() => {});
  }
}
