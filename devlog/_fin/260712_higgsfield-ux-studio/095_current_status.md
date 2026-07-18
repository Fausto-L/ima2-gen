---
created: 2026-07-18
tags: [ima2-gen, phase, higgsfield, current-status, resume]
---

# Higgsfield UX Studio — 현재 상태 + 재개 가이드

기준 시점: 2026-07-18 closeout-sweep 감사. 이 레인은 010~050을 완료했고,
060은 closeout 보류, 070/080은 WIP 체크포인트를 가진 active 상태다.

## 한눈에 보는 현재 상태

| Phase | 상태 | 증거 / 남은 범위 |
|---|---|---|
| 010 | **done** | `assets/010/` 4면 스크린샷, 090 원장 기록 |
| 020 | **done** | `6d2e236`, `assets/020/`, worker evidence |
| 025 | **done** | `assets/025/`, worker evidence |
| 026 | **done** | `assets/026/`, WCAG 매트릭스 |
| 030 | **done** | `assets/030/`, sol 11항목 감사 |
| 040 | **done** | result chaining, gallery overlay, virtualization |
| 050 | **done** | `050_assets-library.md:169` done, SQLite 스파이크 결정 |
| 060 | **partial** | 구현은 커밋됨. Grok/Gemini 실생성 비교와 `generatePipeline`의 `presetIds`→XMP meta 전달이 남음 (`060_home-presets.md:23-28`, `:47-48`). |
| 070 | **WIP committed** | `ddf2686`: `elementCompiler`, `ElementMentionMenu`, `ElementRefGrid`, `saveAsElement` 체이닝, `elementIds` 전파. `tests/element-mention-ui-contract.test.js`와 3-provider 수동 생성 증거가 없음. |
| 080 | **WIP committed** | `ddf2686`: node template/store/seeds, canvas, branching/compatibility, motion presets. `f312cab`: video motion selection, ResultActions extend 버튼. last-frame→I2V orchestration, `tests/node-studio-ui-contract.test.js`, 100+ node 프로파일이 남음. |

마지막 검증(2026-07-18): `npm run typecheck`, `npm run typecheck:tests`는
exit 0, `npm test`는 1665/1665 pass, `cd ui && npm run build`는 green이다.
집중 계약 테스트도 green이다: element compiler 15, element metadata 8,
node template 15, node compatibility 15, video motion presets 15, preset XMP 5,
videoExtendedRoute 8.

## 남은 작업 — 의존 순서

### 1. last-frame → I2V child orchestration 구현 (080)

먼저 `080_node-video-ux.md:113-135`의 구현/완료 기준과
`:624-693`의 extraction, injection, lineage 실패 계약을 읽는다.
현재 `routes/videoExtended.ts:191-216`은 `/api/video/extend` 요청에서 upstream
extension을 동기 poll한 뒤 JSON을 반환할 뿐이다. 마지막 프레임 추출→I2V
first-frame 주입, async 202/SSE lifecycle, child `parentId`/root/series lineage는
구현되어 있지 않다.

`lib/videoFrameExtract.ts`, `lib/videoSeriesChain.ts`, `routes/videoExtended.ts`와
`tests/videoExtendedRoute.test.ts`를 함께 갱신한다. 추출 실패 시 provider 요청을
시작하지 않고, child 저장·lineage 기록 뒤에만 terminal SSE를 publish하는 계약을
유지한다.

### 2. 누락 UI 계약 테스트 2종 추가 (070/080)

1. `tests/element-mention-ui-contract.test.js` — 070의 @멘션 UI와 element
   reference 렌더/연결 계약을 고정한다.
2. `tests/node-studio-ui-contract.test.js` — 080의 node canvas, template,
   compatibility/branching 및 video extend UI 진입 계약을 고정한다.

두 파일은 현재 존재하지 않는다. 1번 orchestration의 API 계약을 먼저 고정한 뒤
080 UI 계약에서 extend action의 request/state를 검증한다.

### 3. 수동 QA 증거 보강 (070/080)

계약 테스트가 green인 빌드에서 다음 증거를 남긴다.

- 070: 캐릭터 element 하나를 GPT/Gemini/Grok 3-provider로 생성해 일관성을
  검수하고 `assets/070/`에 결과와 비교 근거를 저장한다.
- 080: 100 node/140 edge graph에서 pan/zoom 평균 FPS와 p95 frame time,
  palette search latency를 기록하고 `assets/080/`에 JSON·스크린샷·필요한
  동영상을 저장한다. p95 frame time 목표는 33ms 이하, palette local search
  p95 목표는 50ms 이하이다 (`080_node-video-ux.md:859-878`).

### 4. 060 잔여 closeout

070/080의 증거와 독립적으로 마무리할 수 있다. 동일 preset의 Grok/Gemini
실생성 비교를 `assets/060/`에 남기고, `lib/generatePipeline.ts`의 metadata
구성에 `presetIds`를 전달해 XMP 왕복을 완성한다. 범위와 갭은
`060_home-presets.md:23-28`, `:47-48`을 기준으로 한다.

## 재개 절차

1. `090_closeout.md`의 phase 원장과 공통 검증 게이트를 먼저 읽고, 이어서
   `080_node-video-ux.md`의 Extend 스펙과 `060_home-presets.md`의 closeout
   갭을 읽는다.
2. 작업 우선순위는 위 1 → 2 → 3이며, 060 closeout은 독립 lane으로 병행할 수
   있으나 최종 종료 판정 전에 완료한다.
3. 각 구현 단위에서는 관련 focused contract test를 실행한다. Extend는
   `videoExtendedRoute`, 070은 element compiler/metadata, 080은 node
   template/compatibility/motion preset 및 새 UI 계약 테스트를 포함한다.
4. `090_closeout.md:8-15`의 공통 게이트로 종료한다: `npm run typecheck`,
   `npm run typecheck:tests`, `npm test`, `npm run test:inventory`,
   `cd ui && npm run build`가 모두 green이어야 한다. phase별 다크/라이트 ×
   데스크톱/모바일 스크린샷도 `assets/<phase>/`에 남긴다.
5. 060~080의 모든 잔여 항목과 증거가 닫힌 뒤에만 090의 `_fin` 이동 기준을
   다시 판정한다.

## 주의사항

- `260711_production-hardening` 레인 소유인 `ui/src/components/agent/*`는
  이 레인에서 불가침이다.
- 모든 변경은 파일 500줄, 함수 50줄 컨벤션을 지킨다. 한계를 넘기면 책임별
  모듈로 분리하고, 생성 산출물 파일을 직접 편집하지 않는다.
- 070/080의 WIP 커밋은 완료 증명이 아니다. 누락 계약 테스트, 수동 QA 증거,
  080 Extend orchestration까지 닫혀야 phase 상태를 done으로 바꿀 수 있다.
