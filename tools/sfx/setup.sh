#!/usr/bin/env bash
# 효과음 도구 세 개를 이 컴퓨터(또는 클라우드 세션)에 준비해요. 여러 번 실행해도 괜찮아요.
#   1) 오픈버스: 공개 효과음 검색·다운로드 (tools/sfx/openverse.py, 설치 없음)
#   2) 리얼 SFX: .claude/skills/real-sfx 스킬 (저장소에 들어 있음) + 소리 폴더 ~/sounds 연결
#   3) 이어샷: ~/earshot 에 설치. 코드로 효과음 만들기(sfx/kit)는 바로 되고,
#      소리를 '듣고 판단'하는 기능은 FULL=1 로 torch 를 깔고 huggingface.co 접속이 열려 있어야 돼요.
# 사용: bash tools/sfx/setup.sh          (가벼운 설치)
#       FULL=1 bash tools/sfx/setup.sh   (듣기 기능까지, torch 약 540MB + 모델 약 1.1GB)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOUNDS="${SOUNDS:-$HOME/sounds}"
EARSHOT="${EARSHOT_DIR:-$HOME/earshot}"
EARSHOT_REV=591fa3e028032e6dce56620a20e932e35667e8d8

command -v ffmpeg >/dev/null || { echo "ffmpeg 이 없어요. 먼저 설치해 주세요."; exit 1; }
mkdir -p "$SOUNDS"

echo "== 리얼 SFX 소리 폴더 연결 ($SOUNDS)"
( cd "$ROOT/.claude/skills/real-sfx" && python3 scripts/setup.py init --library main="$SOUNDS" --uisfx --index >/dev/null && python3 scripts/setup.py check | sed 's/^/   /' )

echo "== 이어샷 ($EARSHOT)"
if [ ! -d "$EARSHOT/.git" ]; then git clone -q https://github.com/Leonxlnx/earshot "$EARSHOT"; fi
git -C "$EARSHOT" fetch -q origin && git -C "$EARSHOT" checkout -q "$EARSHOT_REV"
[ -x "$EARSHOT/.venv/bin/python" ] || python3 -m venv "$EARSHOT/.venv"
PIP="$EARSHOT/.venv/bin/python -m pip install -q --disable-pip-version-check"
$PIP numpy scipy soundfile soxr librosa pyloudnorm scikit-learn pillow matplotlib "mcp>=2" "requests>=2.31"
if [ "${FULL:-0}" = 1 ]; then
  $PIP torch --index-url https://download.pytorch.org/whl/cpu 2>/dev/null || $PIP torch
  $PIP transformers
fi
$PIP --no-deps -e "$EARSHOT"
"$EARSHOT/.venv/bin/earshot" sfx render whoosh_fast/whip -o /tmp/earshot-test.wav | tail -1
echo
echo "준비 끝. 이어샷 명령: $EARSHOT/.venv/bin/earshot sfx list | sfx render <이름> -o 파일.wav"
