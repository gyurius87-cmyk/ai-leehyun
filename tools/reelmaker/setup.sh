#!/usr/bin/env bash
# 클라우드 작업 공간에서 한 번 실행: 한글 폰트(Pretendard) 받기. ffmpeg·Pillow는 이미 있어요.
set -e
cd "$(dirname "$0")"
mkdir -p fonts
if [ ! -f fonts/Pretendard-Bold.otf ]; then
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack pretendard@1.3.9 >/dev/null 2>&1 && tar xzf pretendard-1.3.9.tgz)
  cp "$tmp"/package/dist/public/static/Pretendard-{Bold,ExtraBold}.otf fonts/
  rm -rf "$tmp"
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg가 필요해요"; exit 1; }
python3 -c "import PIL" || pip install pillow
echo "준비 완료"
