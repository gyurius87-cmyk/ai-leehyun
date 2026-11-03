#!/usr/bin/env python3
"""오픈버스(공개 오디오 500만 개+)에서 효과음을 찾고, 고른 것만 ~/sounds 에 받아요.

  python3 tools/sfx/openverse.py search "whoosh" [--license cc0] [--max-sec 3]
  python3 tools/sfx/openverse.py get <id> [--name 휙]

받은 파일의 라이선스·원작자는 ~/sounds/LICENSES.md 에 한 줄씩 남아요 (CC BY 는 영상 설명에 원작자 표시 필요).
접속: api.openverse.org 와 소리 파일 주소(cdn.freesound.org 등)가 네트워크 허용 목록에 있어야 해요.
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request

API = "https://api.openverse.org/v1/audio/"
SOUNDS = os.path.expanduser(os.environ.get("SOUNDS", "~/sounds"))
HEAD = {"User-Agent": "ai-leehyun-sfx/1.0"}

def call(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEAD), timeout=90) as r:
        return json.load(r)

def search(q, lic, max_sec, n):
    qs = {"q": q, "page_size": max(n * 3, 20), "license": lic}
    if lic == "cc0": qs["source"] = "freesound"
    rows = call(API + "?" + urllib.parse.urlencode(qs)).get("results", [])
    out = []
    for r in rows:
        dur = (r.get("duration") or 0) / 1000
        if max_sec and dur and dur > max_sec: continue
        out.append(r)
        if len(out) >= n: break
    for r in out:
        print(f"{r['id']}  {(r.get('duration') or 0)/1000:5.1f}s  {r.get('license','').upper():6} {r.get('creator') or '?':20.20}  {r.get('title','')[:50]}")
    if not out: print("결과가 없어요. 다른 영어 단어로 찾아 보세요 (whoosh, pop, click, swoosh, ding, impact).")

def get(rid, name):
    r = call(API + rid + "/")
    url = r.get("url")
    if not url: sys.exit("내려받을 주소가 없어요.")
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1] or ".mp3"
    base = re.sub(r"[^\w가-힣.-]+", "_", name or r.get("title") or rid)[:60]
    os.makedirs(SOUNDS, exist_ok=True)
    path = os.path.join(SOUNDS, base + ext)
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEAD), timeout=120) as s, open(path, "wb") as f:
        f.write(s.read())
    with open(os.path.join(SOUNDS, "LICENSES.md"), "a", encoding="utf-8") as f:
        f.write(f"- {os.path.basename(path)} — {r.get('license','').upper()} {r.get('license_version','')} · {r.get('creator','?')} · {r.get('foreign_landing_url') or r.get('url')}\n")
    print("받았어요:", path)
    print("리얼 SFX 목록 새로고침: python3 .claude/skills/real-sfx/scripts/build_index.py")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("search"); s.add_argument("q"); s.add_argument("--license", default="cc0"); s.add_argument("--max-sec", type=float, default=0); s.add_argument("-n", type=int, default=5)
    g = sp.add_parser("get"); g.add_argument("id"); g.add_argument("--name")
    a = ap.parse_args()
    search(a.q, a.license, a.max_sec, a.n) if a.cmd == "search" else get(a.id, a.name)
