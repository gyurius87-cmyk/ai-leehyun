# 효과음 도구 3개

영상 편집할 때 Claude가 효과음을 찾고, 맞는 프레임에 넣고, 없으면 만들어 쓰게 하는 도구예요.
출처: 게으른 빌더 가이드 "클로드가 넣는 효과음이 별로일 때 설치할 도구 3개" (2026-10-28).

| 도구 | 하는 일 | 어디에 |
|---|---|---|
| 오픈버스 API | 공개 효과음 500만 개+ 검색·다운로드 (CC0 위주) | `tools/sfx/openverse.py` |
| 리얼 SFX (Clipwing, MIT) | 영상을 보고 맞는 프레임에 실제 녹음 효과음을 넣어 새 MP4·효과음 트랙·리포트를 만듦 | `.claude/skills/real-sfx` |
| 이어샷 (Leonxlnx/earshot, MIT) | 코드로 효과음 만들기(소리 252개 묶음), 소리 듣고 판단하기 | `.claude/skills/earshot` + `~/earshot` |

## 준비 (세션마다 한 번)
```
bash tools/sfx/setup.sh          # 가벼운 설치: 리얼 SFX + UI 효과음 78개 + 이어샷 효과음 만들기
FULL=1 bash tools/sfx/setup.sh   # 이어샷 '듣기'까지 (torch ~540MB, 첫 사용 때 모델 ~1.1GB)
```

## 쓰는 법
- 영상을 주고 "이 영상에 효과음 넣어 줘" → 리얼 SFX 스킬이 움직여요.
- `python3 tools/sfx/openverse.py search whoosh --max-sec 2` → 후보 → `get <id>` 로 ~/sounds 에 받기.
- `~/earshot/.venv/bin/earshot sfx list` / `sfx render whoosh_fast/whip -o 휙.wav`.

## 클라우드에서 막혀 있는 것 (프로젝트 설정 → 클라우드 환경 → 허용된 도메인)
- `api.openverse.org`, `cdn.freesound.org`, `freesound.org` → 오픈버스 검색·다운로드
- `huggingface.co`, `cdn-lfs.huggingface.co` (+ `download.pytorch.org`) → 이어샷 듣기 모델

## 라이선스
도구 코드는 모두 MIT. 받은 소리는 파일마다 다르고 `~/sounds/LICENSES.md` 에 적혀요. CC BY 는 영상 설명에 원작자 표시가 필요해요.
