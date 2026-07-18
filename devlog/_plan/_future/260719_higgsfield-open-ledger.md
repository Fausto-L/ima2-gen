---
created: 2026-07-19
tags: [ima2-gen, higgsfield, future, open-ledger]
status: open (deferred from 260712_higgsfield-ux-studio closeout)
---

# higgsfield — closeout 시점 이월 원장 (from 090)

`260712_higgsfield-ux-studio`가 2026-07-19 closeout되면서 `_fin`으로 이동했다.
아래는 lane의 미결정 원장과 이번 closeout에서 새로 생긴 후속 항목이다.

## 2026-07-19 closeout에서 새로 생긴 후속

| 항목 | 출처 | 메모 |
|---|---|---|
| Gemini live element 재실행 | 070 QA | aspect enum 버그는 wire test로 수정됐지만 live 재생성은 429 쿼터로 미실행. 쿼터 회복 후 1회 |
| Runway usage/cost 영속화 | 130 smoke | `routes/mcpMedia.ts:454`가 usage를 sidecar에 기록하지 않음. Tier2 verification(subscription-mcp 090) 소유와 겹침 |
| Gemini direct video route | 060 | `routes/video.ts:184`가 grok만 허용. 지원 시 060의 Gemini 영상 비교 재개 |
| React Flow 내장 a11y 문구(Control Panel/Zoom/MiniMap) 한글화 | 120 i18n | 라이브러리 소유 문자열이라 별도 i18n 레이어 필요 |
| seed 템플릿 이름/설명 영문 locale | 120 i18n | 서버 데이터라 content 번역 정책 결정 필요 |
| branch transform 순수 함수 타이밍 측정 | 130 perf | prod bundle이 소스 모듈을 서빙하지 않아 측정 못함 |

## 090 미결정 원장에서 이월

| 항목 | 메모 |
|---|---|
| 리니지 **뷰**(계보 탭/필터) | `parentId`/`videoLineage`는 100에서 기록됨. 뷰는 미정 |
| Generate 버튼 비용 병기 | — |
| 홈을 기본 진입 모드로 | — |
| Assets 저장 형식 (JSON vs SQLite) 스파이크 | — |
| ffmpeg concat 납품 | — |
| 비디오 동기 컴페어 뷰 | — |
| MCP 서버(`ima2 mcp`) | subscription-mcp 레인과 합류 검토 |
| 립싱크/TTS | 프로바이더 네이티브 지원 시 재검토 |
