---
created: 2026-07-17
tags: [ima2-gen, ux, inflight, accessibility, overlay, plan]
---

# 050 — In-flight popup polish (F14–F16)

## Loop spec

- Archetype: spec-satisfaction / popup affordance, progress semantics, overlay ordering.
- Trigger: desktop in-flight dialog에 명시적 close affordance가 없고, indeterminate progress track은 semantic role/label이 없으며, popup과 portaled Select가 같은 `z-index: 220`을 사용한다.
- Goal: 우상단 44px close button, determinate/indeterminate progressbar 계약, `sheet < popup < Select portal`의 결정적 레이어 순서를 고정한다.
- Non-goals: job lifecycle/store 변경, progress 계산 방식 변경, 모바일 inline tray 재설계, mention menu CSS(WT), modal focus trap 도입(현재 popup은 `aria-modal=false`).
- Verifier: `node --test tests/inflight-popup-polish-contract.test.js`, 기존 inflight/mobile tray 계약, `npm run typecheck`, `npm run typecheck:tests`, `npm test`, `cd ui && npm run build`, desktop overlay/render-grounding.
- Stop: close/Escape/outside click/focus return, progress 두 분기, z-order 겹침을 모두 실제로 활성화하고 회귀가 없다.
- Memory: 이 문서, `000_plan.md`, `002_code_friction_inventory.md`, 구현 diff, overlay/progress 스크린샷과 접근성 tree.
- Terminal: DONE / NEEDS_HUMAN(비모달 popup 의미 변경 요구) / BLOCKED(mention WT 레이어와 동시 수정 필요).
- Escalation: popup 안에 interactive Select를 새로 넣는 요구가 생기면 현재 z-order 결정을 재검토하고 별도 unit으로 분리한다.

## 현재 코드 근거 (2026-07-17, HEAD)

### F14 — 닫기 경로는 있으나 보이는 close button이 없다

- `ui/src/components/composer/InFlightPopup.tsx:79-96`은 외부 pointerdown에서 `onRequestClose(false)`, Escape에서 `onRequestClose(true)`를 호출한다.
- `ui/src/components/composer/InFlightPopup.tsx:105-121`의 header에는 제목만 있다.

```tsx
<header className="inflight-popup__header">
  <h2 ref={headingRef} id={titleId} tabIndex={-1}>{t("inflight.title")}</h2>
</header>
<InFlightList variant="popup" panelId={panelId} />
```

- `ui/src/components/composer/InFlightBadge.tsx:76-80`의 `closePopup(restoreFocus)`가 timer/mode/focus를 한 곳에서 정리한다. 새 button은 새 close state를 만들지 않고 `onRequestClose(true)`를 재사용한다.
- `ui/src/i18n/en.json:6`(`common.close`)과 `en.json:78-95`(inflight subtree)/`ko.json` 동일 구조에 필요한 copy가 이미 있으므로 신규 i18n key는 필요 없다.

### F15 — determinate만 progressbar이고 indeterminate track은 장식으로 남는다

- `ui/src/components/InFlightList.tsx:111-125`는 단일 video job에만 `progressPercent`를 부여한다.
- `ui/src/components/InFlightList.tsx:135-146`:

```tsx
<span
  className={`in-flight-progress${progressPercent == null ? " in-flight-progress--indeterminate" : ""}`}
  role={progressPercent == null ? undefined : "progressbar"}
  aria-label={progressPercent == null ? undefined : t("inflight.progressAria", { n: progressPercent })}
  aria-valuenow={progressPercent ?? undefined}
>
```

따라서 002 F15는 **부분 해결 상태**다. determinate의 value semantics는 보존하고, indeterminate에도 `role="progressbar"`와 현재 `phaseLabel`을 accessible name으로 준다. 값을 모르는 progressbar에는 `aria-valuenow/min/max`를 넣지 않는다. 진행 변화마다 별도 `aria-live`를 추가하면 row phase/badge live와 중복 announce될 수 있으므로 추가하지 않는다.

### F16 — popup과 portaled Select가 같은 stacking level이다

- `ui/src/styles/inflight-tray.css:64-67`: `.inflight-popup { position: fixed; z-index: 220; }`.
- 같은 파일 `:55-62`: hover bridge는 `z-index: 221`.
- `ui/src/styles/controls.css:130-134`: `.ctl-select__list--portal { z-index: 220; }`, mobile compose sheet z 180을 넘기 위한 값이다.
- `InFlightPopup.tsx:117-121` 내부에는 header, `InFlightList`, footer만 있고 Select가 없다. 반면 Settings/Generation controls의 Select는 `document.body` portal로 열린다. narrow desktop에서 Select가 열린 채 badge hover popup이 겹칠 수 있으므로 portaled Select가 위에 있어야 조작 가능하다.

결정: `mobile sheet 180 < in-flight popup 210 < hover bridge 211 < Select portal 220`. `controls.css`는 그대로 두고 `inflight-tray.css`만 낮춘다. 동률을 DOM append 순서에 맡기지 않는다.

## 파일 변경 맵

| 상태 | 파일 | 변경 |
|---|---|---|
| MODIFY | `ui/src/components/composer/InFlightPopup.tsx` | header close button `×`, `common.close`, `onRequestClose(true)`. 기존 Escape/outside handler 보존. |
| MODIFY | `ui/src/components/InFlightList.tsx` | `phaseLabel`을 ProgressTrack에 전달; determinate/indeterminate 모두 progressbar, unknown value omission. |
| MODIFY | `ui/src/styles/inflight-tray.css` | popup/bridge z-index 210/211, header grid, close button 44px와 focus/forced-colors 처리. |
| MODIFY | `tests/inflight-badge-popup-contract.test.js` | 기존 popup z-index assertion 220→210; Escape/outside/list 보존 assertions 유지. |
| NEW | `tests/inflight-popup-polish-contract.test.js` | close, progress, z-order, 보존 계약. |

`ui/src/components/composer/InFlightBadge.tsx`와 `ui/src/styles/controls.css`는 READ/VERIFY 전용이며 수정하지 않는다. 전자는 canonical close/focus owner, 후자는 Select portal 220의 기준점이다.

## Before / after diff

### 1. 우상단 close affordance

```diff
--- a/ui/src/components/composer/InFlightPopup.tsx
+++ b/ui/src/components/composer/InFlightPopup.tsx
@@
 <header className="inflight-popup__header">
   <h2 ref={headingRef} id={titleId} tabIndex={-1}>{t("inflight.title")}</h2>
+  <button
+    type="button"
+    className="inflight-popup__close"
+    aria-label={t("common.close")}
+    title={t("common.close")}
+    onClick={() => onRequestClose(true)}
+  >
+    <span aria-hidden="true">×</span>
+  </button>
 </header>
```

Click close는 keyboard Escape와 같은 focus-return 경로를 쓴다. 외부 클릭은 기존처럼 `false`라서 사용자가 클릭한 외부 대상의 focus를 badge로 강제로 빼앗지 않는다.

```diff
--- a/ui/src/styles/inflight-tray.css
+++ b/ui/src/styles/inflight-tray.css
@@
 .inflight-popup__header {
-  padding: 14px 16px 10px;
+  min-height: 52px;
+  padding: 4px 4px 4px 16px;
+  display: grid;
+  grid-template-columns: minmax(0, 1fr) 44px;
+  align-items: center;
 }
+
+.inflight-popup__close {
+  width: 44px;
+  height: 44px;
+  display: grid;
+  place-items: center;
+  border: 0;
+  border-radius: 8px;
+  background: transparent;
+  color: var(--text-dim);
+  font-size: 20px;
+  cursor: pointer;
+}
+.inflight-popup__close:hover { background: var(--control-hover); color: var(--text); }
+.inflight-popup__close:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
```

### 2. ProgressTrack semantic 결정

```diff
--- a/ui/src/components/InFlightList.tsx
+++ b/ui/src/components/InFlightList.tsx
@@
-<ProgressTrack progressPercent={progressPercent} t={t} />
+<ProgressTrack progressPercent={progressPercent} phaseLabel={phaseLabel} t={t} />
@@
-function ProgressTrack({ progressPercent, t }: { progressPercent: number | null; t: Translator }) {
+function ProgressTrack({ progressPercent, phaseLabel, t }: {
+  progressPercent: number | null;
+  phaseLabel: string;
+  t: Translator;
+}) {
@@
-  role={progressPercent == null ? undefined : "progressbar"}
-  aria-label={progressPercent == null ? undefined : t("inflight.progressAria", { n: progressPercent })}
+  role="progressbar"
+  aria-label={progressPercent == null ? phaseLabel : t("inflight.progressAria", { n: progressPercent })}
   aria-valuemin={progressPercent == null ? undefined : 0}
   aria-valuemax={progressPercent == null ? undefined : 100}
   aria-valuenow={progressPercent ?? undefined}
```

결정 근거: ARIA progressbar는 indeterminate일 때 `aria-valuenow`를 생략한다. phase 텍스트는 이미 locale-aware하고 job 상태와 일치하므로 새 key를 만들지 않는다.

### 3. 고정 레이어 순서

```diff
--- a/ui/src/styles/inflight-tray.css
+++ b/ui/src/styles/inflight-tray.css
@@
 .inflight-badge__bridge {
-  z-index: 221;
+  z-index: 211;
@@
 .inflight-popup {
-  z-index: 220;
+  z-index: 210;
```

`ui/src/styles/controls.css:133`의 Select portal 220은 변경하지 않는다. mention layer는 WT 소유라 이 unit의 숫자 체계에 끌어오지 않는다.

### 4. forced-colors 보완

```diff
--- a/ui/src/styles/inflight-tray.css
+++ b/ui/src/styles/inflight-tray.css
@@ @media (forced-colors: active)
 .inflight-badge,
 .inflight-popup,
 .in-flight-placeholder,
- .in-flight-rich-item .in-flight-cancel {
+ .in-flight-rich-item .in-flight-cancel,
+ .inflight-popup__close {
   border-color: ButtonText;
 }
```

## 테스트 계획

신규 파일: `tests/inflight-popup-polish-contract.test.js`.

Assertion 목록:

1. popup header close button이 `type=button`, `common.close`, `onRequestClose(true)`, decorative `×`를 가진다.
2. 기존 document `pointerdown`은 `onRequestClose(false)`, Escape는 `preventDefault()` + `onRequestClose(true)`로 남는다.
3. `InFlightBadge.closePopup`은 timers/mode/focus를 계속 소유하고 popup에 전달된다.
4. close button CSS width/height가 각각 44px이고 hover/focus-visible/forced-colors 규칙이 있다.
5. `ProgressTrack`은 항상 `role="progressbar"`; determinate는 min/max/now + localized percentage label이다.
6. indeterminate는 `phaseLabel`로 이름을 갖고 `aria-valuenow/min/max`가 undefined이며 별도 `aria-live`를 추가하지 않는다.
7. 단일 video만 determinate라는 기존 `videoJobs.length === 1` 계약을 보존한다.
8. popup 210, bridge 211, Select portal 220이며 `180 < 210 < 211 < 220`을 numeric assertion으로 검증한다.
9. mobile max-width 800에서 desktop popup/bridge hidden, inline list 유지 규칙이 남는다.
10. 기존 `tests/inflight-badge-popup-contract.test.js`, `tests/mobile-composer-tray-contract.test.js`가 갱신된 z-index assertion과 함께 통과한다.

실행 순서:

```bash
node --test tests/inflight-popup-polish-contract.test.js
node --test tests/inflight-badge-popup-contract.test.js tests/mobile-composer-tray-contract.test.js
npm run typecheck
npm run typecheck:tests
npm run test:inventory
npm test
cd ui && npm run build
```

> **inventory 게이트 규칙 (000 충돌 정책, A 감사 blocker #1):** 신규 테스트 추가 후 `npm run test:inventory`가 실패하면 `node scripts/classify-tests.mjs`로 `docs/migration/runtime-test-inventory.md`를 **로컬 재생성**해 게이트를 green으로 만든다. 단 재생성본에는 병렬 세션의 미커밋 테스트 파일들이 함께 실리므로 **이 파일은 phase 커밋에 포함하지 않는다**(`git add` 대상에서 제외). 최종 인벤토리 커밋 소유권은 090 이월 원장 참조.

기존 `tests/inflight-badge-popup-contract.test.js:56`의 hardcoded `z-index: 220` assertion은 같은 구현 commit에서 210으로 갱신해야 한다. 새 테스트만 추가하고 기존 계약을 깨진 채 두지 않는다.

## 활성화 시나리오 (C-ACTIVATION-GROUNDING-01)

| 조건부 경로 | 트리거 방법 | 관찰 신호 |
|---|---|---|
| hover popup | desktop fine pointer에서 1개 이상 generation을 지연시키고 badge에 180ms hover | popup이 열리고 header 우상단 `×`가 44px target으로 보인다. pointer가 bridge를 건널 때 닫히지 않는다. |
| pinned + close | badge 클릭으로 pinned mode 후 close button 클릭 | popup 닫힘, badge로 focus 복귀, generation은 계속됨. |
| Escape | keyboard로 badge를 열어 heading focus 후 Escape | 기존 handler가 닫고 badge focus를 복귀한다. |
| outside click | popup pinned 후 canvas/Settings의 다른 control 클릭 | popup은 닫히되 클릭 대상 focus를 badge가 탈취하지 않는다. |
| determinate | 단일 video job에서 SSE `videoProgress` 0.42 주입/실제 응답 | progressbar name에 42%, value now=42/min=0/max=100. |
| indeterminate | image job 또는 video 2건을 동시에 시작 | track은 progressbar로 노출되지만 value now가 없고 accessible name은 현재 phase다. |
| z overlap | 801–900px desktop에서 portaled model Select를 열고 pointer로 badge hover popup을 겹치게 한다 | Select option이 popup 위에 렌더되고 클릭 가능; `elementFromPoint`가 Select option을 반환한다. |
| mobile preservation | 390×844에서 generation 시작 후 compose sheet inline tray 열기 | desktop popup/close는 숨고 기존 inline expand/collapse와 cancel은 정상이다. |

## Render-grounding 계획

- 1280×720과 840×720 desktop에서 hover/pinned/Select-overlap을 각각 캡처한다.
- 390×844에서 mobile inline tray가 desktop CSS 변경의 영향을 받지 않는지 캡처한다.
- Accessibility pane에서 dialog `aria-modal=false`, close name, determinate/indeterminate progressbar 속성을 확인한다.
- keyboard-only Tab 순서가 heading → close → list cancel buttons로 자연스럽고, Escape/close focus return이 같은지 확인한다.
- `prefers-reduced-motion`, forced-colors에서 close focus와 progress track이 식별되는지 확인한다.

## 완료 기준 체크리스트

- [ ] F14 popup에 우상단 `×` close와 44px target이 있고 canonical close handler를 재사용한다.
- [ ] Escape와 외부 클릭의 기존 restore-focus 차이가 보존된다.
- [ ] F15 determinate/indeterminate 모두 이름 있는 progressbar이며 unknown value를 위조하지 않는다.
- [ ] 중복 `aria-live`를 추가하지 않았다.
- [ ] F16 레이어는 sheet 180 < popup 210 < bridge 211 < Select portal 220으로 결정적이다.
- [ ] `controls.css`와 mention WT를 수정하지 않았다.
- [ ] targeted/full tests, typechecks, inventory, UI build, render-grounding이 통과한다.

## Write scope clean 검증

2026-07-17 KST read-only 조회 결과:

| 파일 | 상태 | 활성화 전 정책 |
|---|---|---|
| `ui/src/components/composer/InFlightPopup.tsx` | clean | 구현 직전 재조회; non-empty면 중단. |
| `ui/src/components/composer/InFlightBadge.tsx` | clean | READ/VERIFY only, 수정 금지. |
| `ui/src/components/InFlightList.tsx` | clean | 구현 직전 재조회. |
| `ui/src/styles/inflight-tray.css` | clean | 구현 직전 재조회. |
| `ui/src/styles/controls.css` | clean | READ/VERIFY only, 수정 금지. |
| `tests/inflight-popup-polish-contract.test.js` | absent | NEW로만 생성. |
| `tests/inflight-badge-popup-contract.test.js` | clean | 기존 z-index assertion의 최소 갱신만 허용. |

허용 조회:

```bash
git status --short -- ui/src/components/composer/InFlightPopup.tsx ui/src/components/composer/InFlightBadge.tsx ui/src/components/InFlightList.tsx ui/src/styles/inflight-tray.css ui/src/styles/controls.css tests/inflight-popup-polish-contract.test.js tests/inflight-badge-popup-contract.test.js
git diff HEAD -- ui/src/components/composer/InFlightPopup.tsx ui/src/components/InFlightList.tsx ui/src/styles/inflight-tray.css tests/inflight-badge-popup-contract.test.js
```

다른 worker diff가 생기면 덮어쓰지 않는다. 조회 외 git 명령은 이 검증 범위에 없다.
