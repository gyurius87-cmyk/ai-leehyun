// AI이현 사이트 방문·클릭 기록 (쿠키 없음, 무작위 id만 사용). 관리자 브라우저는 기록하지 않음.
(() => {
  let vid = "", me = false;
  try {
    me = localStorage.getItem("ai-admin") === "1";
    vid = localStorage.getItem("ai-vid") || "";
    if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("ai-vid", vid); }
  } catch {}
  if (me) return;
  const path = location.pathname.replace(/\/$/, "") || "/";
  const send = (data) => {
    const body = JSON.stringify({ ...data, vid, path });
    if (!(navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))))
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  };
  send({ t: "view" });
  document.addEventListener("click", (e) => {
    const el = e.target.closest("a, button"); if (!el) return;
    const label = el.getAttribute("aria-label") || el.textContent || el.getAttribute("href") || "";
    send({ t: "click", label });
  }, { capture: true });
})();
