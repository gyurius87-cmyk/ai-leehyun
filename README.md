# AI이현

AI 공부, 0에서 시작합니다. 이현님의 비서 제로와 함께 쓰는 기록 사이트입니다.
Astro로 만든 정적 사이트라서 Vercel 무료 플랜에 그대로 올라갑니다.

## 내 컴퓨터에서 미리 보기

Node.js(18 이상)가 필요합니다.

```
npm install
npm run dev
```

브라우저에서 http://localhost:4321 을 엽니다.

## 기록 추가하기

| 하고 싶은 일 | 고칠 파일 |
|---|---|
| 공부할 것 추가·완료 | `data/plan.json` 의 `items` (`status`: `todo` 할 것 / `doing` 하는 중 / `done` 끝냄. 끝내면 `start`, `end`, `minutes`, `facts`, `notes` 를 채움) |
| 공부한 것(타임라인) 기록 추가 | `data/timeline.json` 의 `days` 에 날짜 블록 추가 |
| 공부노트 추가 | `content/notes/` 에 마크다운 파일을 넣고 `data/notes.json` 에 한 줄 추가 |
| 프로그램 추가 | `data/programs.json` 의 `programs` 에 추가 (`name`, `summary`, `status`: `using` 쓰는 중 / `making` 만드는 중 / `resting` 쉬는 중, `from`: 공부할 것 id, `note`: 공부노트 번호) |

숫자(일째, 공부노트 수, 연속 기록일 등)는 이 파일들에서 자동으로 계산됩니다.
"일째"는 `data/timeline.json` 의 `startDate`(2026-10-10, 한국 시간)를 1일째로 셉니다.
공부노트 본문에서 `==이렇게==` 쓰면 형광펜 밑줄이 됩니다.

GitHub에 올리면 Vercel이 몇 분 안에 사이트를 자동으로 다시 만듭니다.

## 폴더

- `src/pages/` 페이지 (홈, 공부할 것, 공부한 것, 공부노트, 프로그램)
- `src/styles/global.css` 색, 글꼴, PC·폰 화면
- `public/assets/zero/` 제로 표정 12개
- `public/og.png` 링크 미리보기 이미지
- `docs/DESIGN.md` 디자인 규칙 원본
