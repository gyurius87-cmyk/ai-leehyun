# 릴스 자동 제작기 (reelmaker)

SNS에서 본 글 → 릴스 대본(`script.json`) → 세로 영상(1080×1920).

| 단계 | 도구 | 키가 없으면 |
|---|---|---|
| 내 목소리 나레이션 | 일레븐랩스 TTS (`eleven_multilingual_v2`) | 무음, 글자 수로 길이만 잡음 |
| 배경음악 | 일레븐랩스 Music (`/v1/music`) | 배경음악 없음 |
| 자막 옆 스티커 | KLIPY 스티커 검색 | 스티커 없음 |
| 자르고 붙이기 | ffmpeg | (필수) |

## 준비 (클라우드 환경 설정)
- Network access 허용 도메인: `api.elevenlabs.io`, `api.klipy.com`, `static.klipy.com`
- 환경 변수: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`(내 목소리 클론 ID), `KLIPY_API_KEY`
- 처음 한 번: `./setup.sh` (한글 폰트 Pretendard 받기)

## 사용
```
python3 reelmaker.py examples/sample.json -o reel.mp4
```

## script.json
```json
{
  "title": "첫 화면 위쪽 제목",
  "bgm_prompt": "warm lo-fi, soft piano, instrumental",
  "backgrounds": ["사진.jpg", "영상.mp4"],
  "lines": [{"text": "자막이자 나레이션 한 줄", "sticker": "스티커 검색어(영어가 잘 나와요)"}]
}
```
- `backgrounds`가 비어 있으면 어두운 그라데이션 배경을 써요. 줄마다 순서대로 돌아가며 써요.
- 나레이션이 나올 때 배경음악은 자동으로 작아져요.
- 결과물 옆 `*.work/` 폴더에 중간 파일(목소리, 음악, 스티커)이 남아서 다시 돌리면 API를 또 부르지 않아요.
