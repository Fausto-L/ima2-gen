---
created: 2026-07-18
tags: [ima2-gen, phase, higgsfield, roadmap, closeout]
status: active
---

# Higgsfield UX Studio — 잔여 로드맵

기준 시점은 `095_current_status.md`의 2026-07-18 closeout-sweep이다. 010~050은
done이고, 060은 closeout 잔여, 070/080은 WIP 체크포인트 상태다. 남은 작업은
아래 decade 문서 단위로만 확장한다.

## Work-phase → decade 문서

| Work-phase | 문서 | 범위 | 종료 증거 |
|---|---|---|---|
| 100 | `100_i2v_orchestration.md` | last-frame → I2V async 202/SSE orchestration, durable `parentId` lineage, `ResultActions` Extend 상태 | route/UI focused tests, child sidecar, event-order 증거 |
| 110 | `110_element_mention_integration.md` | 070 element-mention 통합 누락과 `tests/element-mention-ui-contract.test.js` | mention keyboard/a11y/static contract green |
| 120 | `120_node_studio_integration.md` | 080 node-studio 통합 누락과 `tests/node-studio-ui-contract.test.js`; Extend는 제외 | template/palette/branch/element contract green |
| 130 | `130_qa_perf_060.md` | 070 GPT/Gemini/Grok element QA, Runway gen-4 image smoke, 100+ node 성능, 060 closeout | provider별 bounded 결과, Runway usage 기록, `assets/060·070·080/` 증거 |
| 140 | `140_final_closeout.md` | `build:server` 포함 최종 게이트, `090_closeout.md` 원장 갱신, lane closeout 판정 | source/runtime JS sync + 전 게이트 green 또는 typed blocker |

## 의존 순서

```text
100 I2V orchestration ───────┐
110 element mention ────────┼─→ 130 QA/perf + 060 ─→ 140 final closeout
120 node studio (no Extend) ┘
```

**100/110/120은 서로 독립인 병렬 선행 조건**이다. 130은 세 work-phase가 모두
완료된 뒤 시작하고, 140은 130 완료 뒤 시작한다.

### 이 순서인 이유

1. 100은 ResultActions/I2V 계약만 소유한다. 110의 element mention과 의존 관계가
   없으며, 120의 node-studio 계약은 Extend를 명시적으로 포함하지 않는다.
2. 100/110/120이 모두 닫혀야 070/080의 구현 면이 완성된다.
3. provider 수동 QA와 100+ node 프로파일은 세 구현 work-phase 완료 빌드에서 수행한다.
   미완성 구현을 측정한 결과는 closeout 증거가 아니다.
4. 140은 060~080의 구현·계약·수동 증거가 모두 모인 뒤에만 원장과 `_fin`
   이동 여부를 판정한다.

## Work-phase별 경계

### 100 — last-frame → I2V

- `sourceVideoId`는 generated root 안의 로컬 MP4 filename만 허용한다.
- 마지막 프레임 추출 뒤 provider의 I2V generation 경로를 사용한다.
- async 202, inflight 중복/용량/cancel, multiplexed SSE를 적용한다.
- child filename을 durable ID로 삼아 `parentId/rootId/seriesId/sequenceIndex`를
  sidecar와 terminal `done`에 함께 기록한다.
- 기존 provider-native extension은 `/api/video/extend/native`의 legacy 경로로
  격리한다.

### 110 — element mention

- 070의 이미 구현된 compiler/metadata/Assets 연동을 다시 만들지 않는다.
- `ElementMentionMenu`, composer token/chip, 누락 element, keyboard/listbox 계약을
  `tests/element-mention-ui-contract.test.js`로 고정한다.
- 3-provider 실생성은 130으로 미룬다.

### 120 — node studio

- template/empty state/palette/compatibility/branching/element node 통합을 감사한다.
- `tests/node-studio-ui-contract.test.js`는 node studio만 고정하며 Extend 요청·상태는
  100의 `tests/video-extend-ui-contract.test.js`가 소유한다.
- 성능 측정은 구현 변경이 끝난 뒤 130에서 수행한다.

### 130 — QA와 060 closeout

- 070: 동일 캐릭터 element로 GPT/Gemini/Grok 각 1건 생성 후 refs/notes 반영과
  시각 일관성을 `assets/070/`에 기록한다.
- Runway: 무료 connect/catalog 확인을 먼저 수행한 뒤 **gen-4 image 1건만** submit하고
  response의 usage를 기록한다. video 생성은 하지 않는다. auth 실패 또는 usage/cost를
  기록할 수 없으면 증거와 함께 BLOCKED 처리하고 추가 submit/retry하지 않는다.
- 080: 100 node/140 edge에서 pan/zoom FPS, p95 frame time, palette search latency를
  `assets/080/`에 기록한다.
- 060: 동일 preset의 Grok/Gemini 각 1건 비교와 `presetIds` XMP round-trip을
  `assets/060/` 및 focused test로 닫는다.

### 140 — 최종 게이트와 판정

- `npm run typecheck`
- `npm run typecheck:tests`
- `npm run build:server`
- `npm test`
- `npm run test:inventory`
- `cd ui && npm run build`
- source-of-truth `.ts`와 curated tracked runtime `.js`의 sync 확인. 저장소는 약 13개의
  runtime `.js`만 선별 추적하지만 `build:server` 자체는 server/lib/routes의 emit을
  전부 재생성하므로, 생성된 전체 JS를 곧바로 변경 범위로 간주하지 않는다.
- phase별 요구 스크린샷/수동 QA/성능 artifact 존재 확인
- `090_closeout.md`의 060/070/080 상태와 증거를 실제 결과로 갱신
- blocker가 없고 010~080이 모두 done일 때만 lane `_fin` 이동을 승인

## HOTL 자원 상한

- 유료/실 provider 생성은 각 QA 목적에 명시된 **provider당 1건**으로 제한한다.
  실패했다고 같은 provider를 자동 재시도하지 않는다.
- GPT/Gemini/Grok element QA는 각각 1건, 060 preset 비교의 Grok/Gemini도
  각각 1건이다. 같은 provider에서 목적이 다른 생성은 decade 문서에 예상 비용과
  필요성을 먼저 기록한다.
- Runway는 무료 connect/catalog 확인 후 gen-4 image submit을 최대 1회 허용한다.
  response에서 usage/cost를 기록하면 완료하고, auth 실패나 usage/cost 미기록이면
  `BLOCKED: RUNWAY_USAGE_UNVERIFIED` 증거를 남긴 뒤 재시도하지 않는다.
- 100+ node QA는 로컬 synthetic graph를 사용하며 provider generation을 섞지 않는다.

## Scope boundary

### IN

- 060~080의 명시된 잔여 구현, focused contract test, 수동 QA, 성능 증거
- `090_closeout.md` 원장 정합성 갱신과 lane closeout 판정
- Runway MCP Tier 1 무료 확인 + gen-4 image 최대 1건 submit/usage 기록
- 새 test inventory의 main-session 생성물 `docs/migration/runtime-test-inventory.md`

### OUT

- git push, release, publish, PR 생성
- `ui/src/components/agent/*` 변경
- subscription-mcp Tier 2 구현·가입·결제 흐름
- ffmpeg concat 단일 MP4, 비디오 sync compare view, lineage 전용 뷰
- provider당 반복 생성, Runway video/두 번째 submit, usage 증거 없는 완료 판정

## 생성물 소유권 — test inventory

100/110/120에서 test 파일이 추가되면 `scripts/classify-tests.mjs`가 소유하는
`docs/migration/runtime-test-inventory.md` 갱신이 필요하다. delegated writer는 이
generated artifact를 직접 수정하지 않는다. **main session이 세 work-phase의 test
목록을 합친 뒤 `node scripts/classify-tests.mjs`로 한 번 재생성**한다. 목표 write
scope는 이 단일 generated file에 대해서만 main session에 확장되며, 이후
`npm run test:inventory`로 stale 여부와 JS runtime-test 금지 계약을 확인한다.

## 완료 판정

각 decade 문서는 구현 유무가 아니라 증거로 종료한다. focused test만 green인 상태,
WIP 커밋만 존재하는 상태, 수동 QA artifact가 빠진 상태는 `done`이 아니다. 140에서
모든 증거와 공통 게이트가 닫히지 않으면 lane은 active로 유지하고 원장에 정확한
blocker를 남긴다.
