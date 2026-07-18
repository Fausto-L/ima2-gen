# 030 — Condensed inflight badge + right-expanding popup

> **감사 R1 반영 (Darwin FAIL → 수정):**
>
> **C1. 패널 ID 계약 통일.** 패널 DOM id는 `InFlightList`가 받는 명시적 prop(`panelId`)으로 단일화 — 데스크톱 팝업/모바일 인라인이 각자 id를 넘기고 badge `aria-controls`는 항상 그 값을 가리킨다. 하드코딩 `inflight-panel`/`mobile-inflight-panel` 이중화 금지. 040 재사용 명칭은 `InFlightList variant="inline"` + disclosure 셸(별도 InFlightPanel 컴포넌트 없음).
>
> **C2. 앵커 규칙.** 트리거 badge가 `.sidebar` 내부일 때만 사이드바 우측 에지 스냅, 그 외(ClassicWorkspace 하단 독)는 `badgeRect.right + gap` 기준. 뷰포트 클램프 공통.
>
> **C3. 진행률 정직성.** videoProgress는 전역 스칼라(storeVideoImpl.ts:145) — determinate %는 video job 정확히 1건일 때만, 2건 이상이면 phase 텍스트만(per-job progress는 후속).
>
> **C4. AssetGen 회귀 계약.** AssetGenWorkspace.tsx:134의 default `<InFlightList />` 렌더가 variant 도입 후에도 동일함을 계약 테스트로 고정.

상위 결정: `000_roadmap.md` D3'. 목업 기준은 `C-inflight-popup.png`와 `D-mobile-sheet.png`다. 이 단계는 생성 lifecycle을 바꾸지 않고, 이미 reconcile된 `inFlight`를 desktop popup/mobile inline 두 표현으로 재배치한다.

## 목표와 고정 결정

- classic Generate 옆에 spinner + 건수 badge를 둔다. 건수와 목록은 모두 `inFlight.length`를 사용한다.
- desktop(`>800px`): badge hover 또는 click으로 sidebar 오른쪽 canvas/gallery 위에 portaled fixed popup을 연다.
- mobile(`<=800px`): badge tap으로 compose sheet Prompt panel 안의 inline `INFLIGHT (n)` stack을 토글한다. 오른쪽 popup/portal은 만들지 않는다.
- 0건 badge는 **완전히 숨긴다**. 열 수 있는 내용이 없는데 idle icon을 남기면 readiness `?`와 경쟁하고 disabled/상태 아이콘인지 의미가 모호하다. 새 job이 생길 때만 `aria-live` 상태와 함께 나타난다.
- popup/inline을 닫아도 job, SSE, polling, cancel 상태는 그대로다. footer copy는 `You can close this panel — generations will continue.`의 ko/en 번역을 쓴다.

## 상태·데이터 계약

### 단일 진실원

- badge count, hidden 여부, `aria-label`, heading count는 `useAppStore((s) => s.inFlight.length)`에서 파생한다. 기존 `activeGenerations`를 별도 badge source로 쓰지 않는다.
- store boot의 `inFlight: []` → mount `reconcileInflight()` 계약을 보존해 stale persisted badge가 먼저 번쩍이지 않게 한다.
- `startInFlightPolling()`의 1.5s tick, terminal/TTL 제거, `cancelInFlightJob()`의 `canceling` 전이는 수정하지 않는다.
- job이 0건이 되면 desktop hover/pin과 mobile expanded를 즉시 false로 만든다. focus가 사라질 panel 안에 있으면 badge trigger로 먼저 복귀시킨다.

### row metadata

- `PersistedInFlight`에 backward-compatible `model?: string | null`을 추가한다. local classic/multimode는 `imageModel`, video는 `videoModelSelected`를 job 생성 시 snapshot한다.
- `toPersistedInFlightJob()`는 server `meta.model`을 문자열/null로 정규화한다. classic/multimode/video/MCP server job은 이미 model meta를 싣는다.
- polling의 existing-job merge와 change comparison에도 `model`을 포함한다. reload reconcile의 spread merge는 기존 local prompt를 우선하면서 server model을 복원한다.
- model이 없는 node/legacy job은 localized kind label(`Image`, `Video`, `Node`, `MCP`)로 fallback한다. model을 추측하거나 현재 selector 값으로 과거 job을 덮지 않는다.
- row title은 model/fallback label, secondary text는 기존 truncated prompt이며 native `title`과 row accessible name에는 full prompt를 유지한다.
- 실제 thumbnail은 아직 없으므로 요청된 neutral image/video placeholder SVG만 `aria-hidden`으로 렌더한다. 완료 history thumbnail을 inflight처럼 가장하지 않는다.
- `videoProgress`가 `0..1`인 video row만 percent와 determinate `role="progressbar"`를 표시한다. image/MCP job에는 가짜 %를 만들지 않고 phase text + indeterminate track만 표시한다. 현재 global `videoProgress`를 per-job 값처럼 확장하지 않는다.

## 컴포넌트 diff

### NEW `ui/src/components/InFlightBadge.tsx`

- semantic `<button type="button">`; visible spinner(`aria-hidden`) + count(`99+` cap, accessible label은 실제 수).
- props: `mode: "popup" | "inline"`, controlled inline `expanded?`, `onExpandedChange?`.
- 공통 id `inflight-panel`; `aria-expanded`, `aria-controls`, `aria-haspopup="dialog"`(desktop만), localized label을 연결한다.
- popup mode는 `useIsMobile()`이 true면 render하지 않는다. hover capability는 `(hover: hover) and (pointer: fine)`에서만 활성화하고 touch/pen은 click만 쓴다.
- desktop interaction state는 `closed | hover | pinned`이다.
  - pointer enter: 140ms hover-intent 후 `hover`; leave: trigger/panel 공용 180ms close delay. popup으로 건너가는 gap은 delay와 invisible hover bridge로 보호한다.
  - click/Enter/Space: `pinned`로 열고, pinned badge를 다시 click하면 닫는다. hover-open 상태를 click하면 pin한다.
  - popup 위 pointer enter는 close timer를 취소한다. pointer leave는 hover-open만 닫고 pinned는 유지한다.
- count 변화 자체가 popup을 자동으로 열지는 않는다. 새 생성 시작이 사용자의 pointer/focus를 낚아채지 않게 한다.

### NEW `ui/src/components/InFlightPopup.tsx`

- `createPortal(..., document.body)` + `position: fixed`; panel id/heading, `<InFlightList variant="popup" />`, footer hint를 소유한다.
- non-modal `role="dialog" aria-modal="false" aria-labelledby=...`; focus trap이나 body scroll lock은 두지 않는다.
- keyboard pin으로 열었을 때만 `tabIndex={-1}` panel heading으로 focus를 옮긴다. pointer/hover open은 focus를 훔치지 않는다.
- Escape는 어떤 open mode든 닫고 badge로 focus 복귀. document capture `pointerdown`이 trigger/panel 밖이면 닫는다. cancel button click은 inside로 판정한다.
- popup unmount가 generation cancel을 호출하지 않는다는 계약을 component test에 고정한다.

### CHANGED `ui/src/components/InFlightList.tsx`

- `variant?: "compact" | "popup" | "inline"`(default `compact`)를 받는다. store selectors와 phase label/cancel action은 이 파일에 계속 단일 소유시킨다.
- popup/inline row는 placeholder, model/fallback title, truncated/full prompt, phase, optional %, progress track, 44px cancel X를 렌더한다.
- compact variant는 node mode의 현재 prompt/phase/cancel/spinner 밀도를 보존한다. `in-flight-cancel` class와 `cancelInFlightJob(f.id)` 계약도 유지한다.
- list 자체는 0건이면 null. popup header/footer와 mobile disclosure shell은 각 parent가 소유한다.

### CHANGED `ui/src/components/GenerateButton.tsx`

- 기존 button 내부 `generate-btn__count`를 제거하고 sibling `<InFlightBadge>`로 교체한다.
- props: `inflightMode?: "popup" | "inline"`(default `popup`), inline controlled state/callback. Generate action과 readiness `?`는 보존한다.
- markup은 `generate-btn` + `generate-row__aux`(badge, readiness)로 나눠 badge 0건 시 빈 grid column이 남지 않게 한다.
- active visual도 `inFlight.length > 0`에서 파생해 count/list와 어긋나는 이중 표현을 없앤다.

### CHANGED placement owners

- `ui/src/components/Sidebar.tsx`: classic 두 분기의 sibling `<InFlightList />`를 제거한다. prompt-studio desktop도 `ClassicWorkspace`의 existing `GenerateButton`이 badge를 소유하므로 sidebar duplicate를 없앤다. Generate가 없는 node branch의 compact `<InFlightList />`는 유지한다.
- `ui/src/components/MobileComposeSheet.tsx`: local `inflightExpanded`를 소유하고 `GenerateButton inflightMode="inline"`에 제어 props를 전달한다. prompt panel에서 Generate row 바로 아래에 `section#mobile-inflight-panel` + header `INFLIGHT (n)` + `<InFlightList variant="inline" />` + footer를 조건 렌더한다.
- mobile inline header에도 collapse button을 두되 같은 controlled state를 사용한다. sheet close, Prompt tab 이탈, 0건 전환 시 collapse한다. compose sheet body가 스크롤을 소유하며 list에 중첩 스크롤을 추가하지 않는다.
- `ui/src/components/classic/ClassicWorkspace.tsx`와 `ui/src/App.tsx`는 변경하지 않는다. 기존 `GenerateButton` consumer가 default popup을 자동 수용한다.

## Desktop positioning math

상수: `GAP=10`, `VIEWPORT_MARGIN=12`, CSS width `min(420px, calc(100vw - 24px))`, max-height `min(70dvh, 560px)`.

```text
badge = badgeRef.getBoundingClientRect()
sidebar = document.querySelector(".sidebar")?.getBoundingClientRect()
panel = panelRef.getBoundingClientRect()
anchorRight = sidebar?.right ?? badge.right
left = clamp(anchorRight + GAP, VIEWPORT_MARGIN,
             innerWidth - panel.width - VIEWPORT_MARGIN)
top = clamp(badge.bottom - panel.height, VIEWPORT_MARGIN,
            innerHeight - panel.height - VIEWPORT_MARGIN)
caretTop = clamp(badge.top + badge.height / 2 - top,
                 16, panel.height - 16)
```

- bottom-align을 우선해 sidebar 하단 Generate badge에서 panel이 위로 펼쳐지고, left는 sidebar right edge + gap에서 시작한다. 좁은 split viewport에서는 마지막 clamp만큼 canvas 쪽에서 이동하되 viewport 밖으로 잘리지 않는다.
- open 직후 `useLayoutEffect`에서 panel을 측정한다. window resize, capture-phase scroll(sidebar 포함), badge/panel `ResizeObserver`에 RAF-throttled recompute를 연결하고 cleanup한다.
- panel arrow는 computed `caretTop` CSS variable을 쓴다. popup은 gallery/canvas를 밀지 않고 겹친다.

## CSS diff

- **NEW `ui/src/styles/inflight-tray.css`**: badge/spinner/count, hover bridge, fixed popup, arrow, header/footer, rich/compact rows, placeholder, progress track, inline stack, focus-visible, `prefers-reduced-motion`, forced-colors를 소유한다. popup layer는 060 A1 convention과 같은 `z-index: 220`이다.
- `ui/src/index.css`: `form-controls.css` 뒤에 `inflight-tray.css` import. portal 스타일은 responsive 파일보다 먼저 와도 explicit layer 220으로 sheet 180을 이긴다.
- `ui/src/styles/form-controls.css`: `.generate-row`를 `minmax(0,1fr) auto`, `.generate-row__aux`를 auto-flow 44px controls로 변경하고 obsolete `.generate-btn__count` 제거.
- `ui/src/styles/node-workspace.css`: global `.in-flight-*` block을 새 전용 CSS로 이동해 node 파일의 우연한 전역 소유권을 제거한다.
- `ui/src/styles/responsive-layout.css`: `<=800px`에서 popup/bridge 강제 `display:none`; inline section spacing, 44px cancel/toggle, safe-area-compatible width를 정의한다. sheet z-index 180은 그대로다.
- `ui/src/styles/progress-composer.css`에는 추가하지 않는다. 현재 528줄로 repo의 `<500` 기준을 이미 넘으므로 새 기능을 dedicated file로 격리한다.
- spinner/indeterminate animation은 transform만 쓰고 `prefers-reduced-motion: reduce`에서 정지된 ring/track으로 바꾼다. hover/focus가 layout 크기를 바꾸지 않게 border 공간을 선점한다.

## Store/i18n 정확한 변경 파일

- `ui/src/store/storeTypes.ts`: optional `PersistedInFlight.model`.
- `ui/src/store/storeHelpers.ts`: server `meta.model` normalization/persistence.
- `ui/src/store/storeInflightImpl.ts`: polling merge/change detection에 model 포함; reconcile/start polling lifecycle 자체는 보존.
- `ui/src/store/storeGenImpl.ts`, `ui/src/store/storeVideoImpl.ts`: local job 생성 시 선택 model snapshot. 병행 중인 element/reference 변경 위에 최소 diff로 얹고 되돌리지 않는다.
- `ui/src/i18n/en.json`, `ui/src/i18n/ko.json`: title, badge expand/collapse/count, kind fallback, progress, footer hint 키를 `inflight` 아래 ko/en parity로 추가. 기존 phase/cancel/noPrompt 키 재사용.

## 테스트 영향과 추가 계약

### 기존 테스트

- **수정 필요/기존 DOM 제거 시 break:** `tests/inflight-list-tooltip-contract.test.js`의 visible `{truncate(f.prompt)}` 단언을 rich row의 model title + secondary prompt/full tooltip 계약으로 갱신한다. locale 신규 키 parity도 여기서 확장한다.
- **확장하되 기존 단언은 green 유지:** `tests/mobile-generate-entry-contract.test.js`에 controlled inline toggle, `aria-expanded/controls`, Prompt panel 내부 배치, mobile portal 부재를 추가한다.
- **확장:** `tests/prompt-studio-ui-contract.test.js`에 classic sidebar duplicate list 부재와 existing `ClassicWorkspace` GenerateButton badge 소유를 추가한다.
- **그대로 통과해야 함:** `tests/inflight-cancel-contract.test.js`(real cancel action/class), `inflight-reload-race.test.js`, `inflight-reload-reconcile-contract.test.js`(boot/reconcile/polling). 이 셋의 실패는 UI refactor가 lifecycle 계약을 깨뜨린 회귀다.

### 신규

- **NEW `tests/inflight-tray-contract.test.js`**:
  - 0건 hidden, `inFlight.length` 단일 count, old `generate-btn__count` 제거.
  - badge ARIA + hover delay/click pin/Escape/outside click/focus return.
  - `createPortal`, fixed position, sidebar-right math/clamp/recompute, z-index 220; mobile inline/no popup.
  - row placeholder/model/phase/video percent/progressbar/cancel/footer 및 no fake image percent.
  - optional model local snapshot + server reconcile/polling preservation.
- `docs/migration/runtime-test-inventory.md`: 신규 test 추가 후 `node scripts/classify-tests.mjs`로 재생성한다(수동 편집 금지).

## 검증 게이트

1. `node --test tests/inflight-tray-contract.test.js tests/inflight-list-tooltip-contract.test.js tests/inflight-cancel-contract.test.js tests/inflight-reload-race.test.js tests/inflight-reload-reconcile-contract.test.js tests/mobile-generate-entry-contract.test.js tests/prompt-studio-ui-contract.test.js`
2. `npm run typecheck && npm run typecheck:tests && npm run test:inventory`
3. `cd ui && npm run build`
4. browser QA: desktop 1440, split 1024/801, touch-emulated 801(click only), mobile 390/320. 0/1/12 jobs, hover→panel bridge, click pin, outside/Escape, Tab/cancel, last-job removal, resize/sidebar scroll clamp, long ko prompt/model, reduced motion을 확인한다.
5. screenshots: desktop popup over gallery/canvas, bottom-composer popup, mobile collapsed/expanded inline. popup은 z220, mobile sheet는 z180이며 mobile에 right popup이 없어야 한다.

## Out of scope

- backend generation/SSE/inflight/cancel API, polling interval, persistence schema migration.
- per-job image progress 또는 per-job video progress backend, real inflight thumbnails, ETA, retry/reorder/history actions.
- node/card-news/agent/asset-gen queue UX 재설계; node의 기존 compact list는 유지한다.
- readiness popup 제거, composer-tray 010/020 참조·dead-tag 구현, 새 icon library/dependency 추가.
