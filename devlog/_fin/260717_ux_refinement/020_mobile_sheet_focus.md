---
created: 2026-07-17
tags: [ima2-gen, ux, mobile, accessibility, plan]
---

# 020 — mobile compose sheet focus and tab contract (F4–F5)

## Loop spec

- Archetype: accessibility state-machine repair.
- Trigger: 닫힌 mobile compose sheet가 transform으로만 화면 밖에 있고 focusable descendants가 남으며, tab/backdrop/opener 계약이 불완전하다.
- Goal: closed `inert` + delayed `visibility`, native backdrop activation, WAI-ARIA tab linkage/roving, 정확한 MobileAppBar opener focus 복귀를 구현한다.
- Non-goals: 완전한 modal focus trap 라이브러리 도입, sheet visual redesign, desktop RightPanel 변경, store/App 타입 확장, `App.tsx` 수정, swipe-to-close gesture.
- Verifier: `npm run typecheck`, `npm run typecheck:tests`, `node --test tests/mobile-compose-sheet-accessibility-contract.test.js`, `npm test`, `cd ui && npm run build`, 390px 키보드/접근성 render-grounding.
- Stop: F4/F5 계약 assertion과 closed/open/close/3-tab 활성화 시나리오가 모두 통과한다.
- Memory: 이 문서, `000_plan.md`, `002_code_friction_inventory.md`, MobileAppBar↔focus-owner↔sheet의 3-file 계약.
- Terminal: DONE / NEEDS_HUMAN(브라우저 접근성 정책 충돌) / BLOCKED(구현 직전 planned clean 파일이 병렬 modified).
- Escalation: `MobileAppBar.tsx`가 병렬 변경되거나 정확한 opener 복귀에 `App.tsx`/store 수정이 필요해지면 write scope를 넓히지 말고 중단한다.

## 현재 코드 근거 (2026-07-17, HEAD = WT for planned existing files)

### F4 — closed DOM이 focus tree에 남음

- `ui/src/components/MobileComposeSheet.tsx:76-83`은 section을 항상 mount하고 `aria-hidden={!open}`만 바꾼다.

```tsx
<section
  id="mobile-generate-sheet"
  className={`compose-sheet${open ? " compose-sheet--open" : ""}`}
  role="dialog"
  aria-modal={open ? "true" : "false"}
  aria-label={t("sheet.generate")}
  aria-hidden={!open}
>
```

- `ui/src/styles/responsive-layout.css:117-142`은 base에서 `transform: translateY(calc(100% + 20px))`, open에서 `translateY(0)`만 적용한다. `visibility`, `pointer-events`, focus exclusion은 없다.
- React 지원 확인: `ui/package.json:18,25`는 React `^19.2.4`, `@types/react` `^19.2.14`; 설치된 `ui/node_modules/@types/react/index.d.ts:2854`에 `inert?: boolean | undefined`가 있다. 따라서 string cast나 `@ts-ignore` 없이 `<section inert={!open}>`을 사용한다.

### F5 — tab, backdrop, opener 계약

- `ui/src/components/MobileComposeSheet.tsx:90-102`의 `role="tab"`에는 `id`, `aria-controls`, `tabIndex`, Arrow/Home/End key handling이 없다.
- panel은 `:104-159`에서 active panel만 조건부 render하고 `id`/`aria-labelledby`가 없어 tab과 연결되지 않는다. inactive tab의 `aria-controls`도 항상 실재하는 target을 가져야 하므로 구현 후에는 세 panel shell을 유지하되 inactive panel의 무거운 content만 unmount한다.
- backdrop은 `:68-75`의 `<div role="button">`이며 `tabIndex`와 key handler가 없다.
- Escape close는 `:41-51`에 있으나 opener 복귀는 없다. 기존 `:53-62` focus 복귀는 “마지막 inflight job 완료 시 generate button”이라는 별도 내부 계약이다.
- `ui/src/components/MobileAppBar.tsx:34-69`의 library, controls, generate(FAB) 버튼 3개가 모두 sheet opener다. 현재는 각각 `openComposeSheet(tab)`만 호출하며 ref가 없다.
- `ui/src/App.tsx:137,168`에서 AppBar와 Sheet는 sibling이므로 direct prop ref를 연결하려면 병렬 충돌 구역인 `App.tsx`를 수정해야 한다. 이를 피하기 위해 ephemeral focus owner만 담당하는 작은 module을 공유한다.

## 필수 scope expansion (000 phase map 정정 사항)

`000_plan.md:39`는 `MobileComposeSheet.tsx` + CSS + test만 적었지만, “MobileAppBar의 실제 opener로 focus 복귀”는 opener owner 수정 없이 보장할 수 없다. 이 phase 구현 scope에 다음 clean 파일을 추가한다.

- MODIFY `ui/src/components/MobileAppBar.tsx`
- NEW `ui/src/lib/mobileComposeSheetFocus.ts`

이 선택은 `App.tsx`, `useAppStore.ts`, `storeTypes.ts`를 건드리지 않으며 focus DOM reference를 영속 store state에 넣지 않는다.

## 파일 변경 맵

| 상태 | 파일 | 변경 |
|---|---|---|
| NEW | `ui/src/lib/mobileComposeSheetFocus.ts` | 마지막 실제 opener element를 기억/복귀/clear하는 ephemeral owner. |
| MODIFY | `ui/src/components/MobileAppBar.tsx` | 세 opener ref 등록; 특히 generate FAB ref를 focus owner에 연결. |
| MODIFY | `ui/src/components/MobileComposeSheet.tsx` | inert, tab ids/roving, native backdrop, panel linkage, open/close focus lifecycle. |
| MODIFY | `ui/src/styles/responsive-layout.css` | delayed visibility transition과 native backdrop button reset. |
| NEW | `tests/mobile-compose-sheet-accessibility-contract.test.js` | source contract regression test. |

## Before / after diff

### 1. Focus owner를 App/store 밖에 격리

```diff
--- /dev/null
+++ b/ui/src/lib/mobileComposeSheetFocus.ts
@@
+let composeSheetOpener: HTMLButtonElement | null = null;
+
+export function rememberMobileComposeSheetOpener(opener: HTMLButtonElement): void {
+  composeSheetOpener = opener;
+}
+
+export function restoreMobileComposeSheetOpener(): void {
+  const opener = composeSheetOpener;
+  composeSheetOpener = null;
+  if (opener?.isConnected) opener.focus();
+}
+
+export function clearMobileComposeSheetOpener(): void {
+  composeSheetOpener = null;
+}
```

`clear`는 non-classic/settings 전환처럼 opener가 더 이상 유효하지 않은 unmount 경로에서 stale reference를 제거하는 용도다. module은 focus 외 상태를 소유하지 않는다.

### 2. MobileAppBar의 세 opener ref(특히 FAB) 연결

```diff
--- a/ui/src/components/MobileAppBar.tsx
+++ b/ui/src/components/MobileAppBar.tsx
@@
+import { useRef, type RefObject } from "react";
 import { useAppStore } from "../store/useAppStore";
+import { rememberMobileComposeSheetOpener } from "../lib/mobileComposeSheetFocus";
@@
   const isMobile = useIsMobile();
+  const libraryOpenerRef = useRef<HTMLButtonElement>(null);
+  const controlsOpenerRef = useRef<HTMLButtonElement>(null);
+  const composeFabRef = useRef<HTMLButtonElement>(null);
+  const openFrom = (tab: "prompt" | "controls" | "library", ref: RefObject<HTMLButtonElement | null>) => {
+    if (ref.current) rememberMobileComposeSheetOpener(ref.current);
+    openComposeSheet(tab);
+  };
@@
         <button
+          ref={libraryOpenerRef}
           type="button"
-          onClick={() => openComposeSheet("library")}
+          onClick={() => openFrom("library", libraryOpenerRef)}
@@
         <button
+          ref={controlsOpenerRef}
-          onClick={() => openComposeSheet("controls")}
+          onClick={() => openFrom("controls", controlsOpenerRef)}
@@
         <button
+          ref={composeFabRef}
           className="mobile-app-bar__generate"
-          onClick={() => openComposeSheet("prompt")}
+          onClick={() => openFrom("prompt", composeFabRef)}
```

세 버튼 중 무엇으로 열었는지 정확히 기억하므로 “항상 FAB로 복귀”하지 않는다. generate path에서는 요구된 `composeFabRef`로 되돌아간다.

### 3. Tabs: stable ids, aria-controls, roving

```diff
--- a/ui/src/components/MobileComposeSheet.tsx
+++ b/ui/src/components/MobileComposeSheet.tsx
@@
+import {
+  clearMobileComposeSheetOpener,
+  restoreMobileComposeSheetOpener,
+} from "../lib/mobileComposeSheetFocus";
@@
 const SHEET_TABS: ComposeSheetTab[] = ["prompt", "controls", "library"];
+const tabId = (tab: ComposeSheetTab) => `mobile-sheet-tab-${tab}`;
+const panelId = (tab: ComposeSheetTab) => `mobile-sheet-panel-${tab}`;
@@
+  const tabRefs = useRef<Partial<Record<ComposeSheetTab, HTMLButtonElement | null>>>({});
+  const wasOpenRef = useRef(false);
+
+  const focusTab = (tab: ComposeSheetTab) => {
+    setActiveTab(tab);
+    requestAnimationFrame(() => tabRefs.current[tab]?.focus());
+  };
+  const onTabKeyDown = (event: React.KeyboardEvent, current: ComposeSheetTab) => {
+    const index = SHEET_TABS.indexOf(current);
+    const target =
+      event.key === "ArrowRight" ? SHEET_TABS[(index + 1) % SHEET_TABS.length] :
+      event.key === "ArrowLeft" ? SHEET_TABS[(index - 1 + SHEET_TABS.length) % SHEET_TABS.length] :
+      event.key === "Home" ? SHEET_TABS[0] :
+      event.key === "End" ? SHEET_TABS[SHEET_TABS.length - 1] : null;
+    if (!target) return;
+    event.preventDefault();
+    focusTab(target);
+  };
@@
             <button
+              ref={(node) => { tabRefs.current[tab] = node; }}
+              id={tabId(tab)}
               role="tab"
               aria-selected={activeTab === tab}
+              aria-controls={panelId(tab)}
+              tabIndex={activeTab === tab ? 0 : -1}
               onClick={() => setActiveTab(tab)}
+              onKeyDown={(event) => onTabKeyDown(event, tab)}
```

세 panel shell 모두에 같은 linkage를 적용한다.

```diff
-{activeTab === "prompt" ? (
-  <div className="compose-sheet__panel compose-sheet__panel--prompt" role="tabpanel">
-    {/* prompt content */}
-  </div>
-) : activeTab === "controls" ? (
-  /* controls panel */
-) : (
-  /* library panel */
-)}
+<div
+  id={panelId("prompt")}
+  className="compose-sheet__panel compose-sheet__panel--prompt"
+  role="tabpanel"
+  aria-labelledby={tabId("prompt")}
+  hidden={activeTab !== "prompt"}
+>
+  {activeTab === "prompt" ? <>{/* existing prompt content, unchanged */}</> : null}
+</div>
+<div
+  id={panelId("controls")}
+  className="compose-sheet__panel compose-sheet__panel--controls"
+  role="tabpanel"
+  aria-labelledby={tabId("controls")}
+  hidden={activeTab !== "controls"}
+>
+  {activeTab === "controls" ? <GenerationControlsPanel /> : null}
+</div>
+<div
+  id={panelId("library")}
+  className="compose-sheet__panel compose-sheet__panel--library"
+  role="tabpanel"
+  aria-labelledby={tabId("library")}
+  hidden={activeTab !== "library"}
+>
+  {activeTab === "library" ? <Suspense>{/* existing library content */}</Suspense> : null}
+</div>
```

세 shell은 항상 존재해 모든 `aria-controls`가 유효하다. inactive shell은 native `hidden`이고, 기존처럼 내부 content는 unmount되어 focusable descendant와 lazy panel 비용을 남기지 않는다.

### 4. Close/open focus lifecycle + inert

> **A 감사 blocker #4 반영:** `MobileComposeSheet`는 `!isMobile || settingsOpen || uiMode !== "classic"`에서 **`return null`만 하고 컴포넌트는 mount 상태로 남는다**(`MobileComposeSheet.tsx:64`). 따라서 `useEffect(() => () => clear(), [])` unmount cleanup은 mode 전환에서 실행되지 않는다. stale-opener 정리는 unmount cleanup이 아니라 **rendered-state effect**로 처리하고, **surface 이탈 시 열린 sheet도 함께 닫는다**(round 2 blocker #4): `rendered`가 false로 떨어지는 전환에서 `composeSheetOpen`이 true면 기존 `close()` store 액션을 호출하고 opener ref를 clear한다. 이 정의로 재진입 계약이 단순해진다 — classic으로 돌아오면 sheet는 항상 closed에서 시작하므로 자동 재오픈/미실행 focus effect/고아 opener 문제가 구조적으로 사라진다(focus 강제 이동은 하지 않음 — surface가 바뀌어 복귀 대상이 사라진 상태가 정상).

```diff
--- a/ui/src/components/MobileComposeSheet.tsx
+++ b/ui/src/components/MobileComposeSheet.tsx
@@
+  useLayoutEffect(() => {
+    if (open) {
+      wasOpenRef.current = true;
+      const frame = requestAnimationFrame(() => tabRefs.current[activeTab]?.focus());
+      return () => cancelAnimationFrame(frame);
+    }
+    if (wasOpenRef.current) {
+      wasOpenRef.current = false;
+      restoreMobileComposeSheetOpener();
+    }
+  }, [open, activeTab]);
+
+  const rendered = isMobile && !settingsOpen && uiMode === "classic";
+  useEffect(() => {
+    if (!rendered) {
+      wasOpenRef.current = false;
+      if (useAppStore.getState().composeSheetOpen) close(); // 이탈 시 sheet도 닫음 — 재진입은 항상 closed
+      clearMobileComposeSheetOpener(); // focus 복귀 없이 stale ref만 정리
+    }
+  }, [rendered]);
+
+  useEffect(() => () => clearMobileComposeSheetOpener(), []); // 실제 unmount 보강
@@
-      {open ? (
-        <div className="compose-sheet-backdrop" role="button" aria-label={t("sheet.close")} onClick={close} />
+      {open ? (
+        <button type="button" className="compose-sheet-backdrop" aria-label={t("sheet.close")} onClick={close} />
       ) : null}
@@
       <section
         id="mobile-generate-sheet"
+        inert={!open}
         className={`compose-sheet${open ? " compose-sheet--open" : ""}`}
```

Backdrop은 native `<button>`이므로 Enter/Space activation을 별도 key handler로 재구현하지 않는다. open 시 active tab으로 초기 focus를 옮기고, backdrop/Escape/handle 어느 close path든 `open: true → false` edge에서 정확한 opener로 한 번만 복귀한다.

### 5. Transform animation을 유지하면서 closed visibility 차단

```diff
--- a/ui/src/styles/responsive-layout.css
+++ b/ui/src/styles/responsive-layout.css
@@
   .compose-sheet-backdrop {
     position: fixed;
     inset: 0;
+    padding: 0;
+    border: 0;
     z-index: 170;
     display: block;
     background: var(--scrim);
+    cursor: pointer;
   }
@@
   .compose-sheet {
     transform: translateY(calc(100% + 20px));
-    transition: transform 180ms ease;
+    visibility: hidden;
+    pointer-events: none;
+    transition: transform 180ms ease, visibility 0s linear 180ms;
   }
   .compose-sheet.compose-sheet--open {
     transform: translateY(0);
+    visibility: visible;
+    pointer-events: auto;
+    transition-delay: 0s;
   }
+  .compose-sheet__panel[hidden] {
+    display: none;
+  }
@@
+  @media (prefers-reduced-motion: reduce) {
+    .compose-sheet {
+      transition: none;
+    }
+  }
```

닫기 시작 즉시 `inert`가 focus를 차단하고, `visibility:hidden`은 180ms 뒤 적용되어 slide-out은 보존한다. reduced-motion 기존 정책이 있다면 동일 owner에서 delay를 0으로 맞춘다.

## 테스트 계획

신규 파일: `tests/mobile-compose-sheet-accessibility-contract.test.js`.

검증 assertion:

1. installed React types가 `inert?: boolean`을 포함하고 sheet source가 `inert={!open}`을 사용한다.
2. closed CSS에 `visibility:hidden`, `pointer-events:none`, `visibility ... 180ms`가 있고 open CSS가 visible/auto로 되돌리며 inactive `[hidden]` panel이 `display:none`이다.
3. backdrop이 native `button type="button"`이며 close label/action을 갖고 legacy `div role="button"`이 없다.
4. 세 tab마다 `id`, `aria-controls`, active-only `tabIndex=0`; 항상 존재하는 세 panel shell마다 `id`, `aria-labelledby`, inactive `hidden`이 연결된다.
5. ArrowLeft/ArrowRight wrap, Home/End 이동이 `preventDefault`와 focus를 실행한다.
6. MobileAppBar의 library/controls/`composeFabRef`가 모두 focus owner에 등록된다.
7. close edge가 `restoreMobileComposeSheetOpener()`를 1회 호출하고 disconnected opener는 focus하지 않는다.
8. 기존 Escape close, inflight completion focus, touch target contract가 보존된다.
9. rendered-state effect가 존재한다: `rendered` false 전환에서 `close()` 호출 + opener clear (source assertion).
10. CSS에 `@media (prefers-reduced-motion: reduce)`에서 `.compose-sheet` transition 무효화 규칙이 있다.

기존 `tests/mobile-generate-entry-contract.test.js`, `tests/mobile-composer-tray-contract.test.js`도 함께 실행해 generation entry와 inflight focus 회귀를 막는다.

```bash
node --test tests/mobile-compose-sheet-accessibility-contract.test.js tests/mobile-generate-entry-contract.test.js tests/mobile-composer-tray-contract.test.js
npm run typecheck
npm run typecheck:tests
npm run test:inventory
npm test
cd ui && npm run build
```

> **inventory 게이트 규칙 (000 충돌 정책, A 감사 blocker #1):** 신규 테스트 추가 후 `npm run test:inventory`가 실패하면 `node scripts/classify-tests.mjs`로 `docs/migration/runtime-test-inventory.md`를 **로컬 재생성**해 게이트를 green으로 만든다. 단 재생성본에는 병렬 세션의 미커밋 테스트 파일들이 함께 실리므로 **이 파일은 phase 커밋에 포함하지 않는다**(`git add` 대상에서 제외). 최종 인벤토리 커밋 소유권은 090 이월 원장 참조.

## 활성화 시나리오 (C-ACTIVATION-GROUNDING-01)

1. **Closed leakage**: 390px viewport, sheet closed에서 Tab을 반복한다. sheet handle/tabs/textarea/toolbar가 focus 순서에 나타나지 않고 section이 접근성 트리에서 inert/hidden인지 관찰한다.
2. **FAB opener**: generate FAB에 keyboard focus → Enter. prompt tab이 선택/focus되고 dialog/tablist linkage가 보인다. Escape로 닫으면 동일 FAB로 focus가 돌아온다.
3. **Library opener**: bookmark button으로 열어 library tab/panel을 확인하고 backdrop을 keyboard Tab으로 찾아 Space로 닫는다. bookmark button으로 focus가 복귀한다.
4. **Controls opener**: controls icon으로 열고 handle click으로 닫는다. controls icon으로 focus가 복귀한다.
5. **Roving**: prompt tab에서 ArrowRight 두 번 → controls → library, 한 번 더 → prompt wrap. ArrowLeft wrap, Home/End도 확인한다. 매 단계 DOM focus, `aria-selected`, `tabIndex`, panel content가 같은 tab을 가리켜야 한다.
6. **Close animation**: open→close 시 180ms slide-out이 보이되 닫기 시작 직후 DevTools에서 `inert=true`, keyboard focus 진입 불가를 확인한다.
7. **Surface 이탈**: sheet open 중 classic을 떠난다(설정 열기 또는 mode 전환). sheet가 store 차원에서 닫히고 opener ref가 clear됨을 확인한다. classic 재진입 시 sheet는 closed로 시작하고, FAB로 다시 열면 정상 focus 이동이 재현된다. 임의 body focus 강제는 없어야 한다.

## Render-grounding 계획

- `http://localhost:<port>/#create`를 Chrome 390×844로 열고 실제 hardware keyboard 또는 DevTools focus emulation을 사용한다.
- Accessibility pane에서 dialog name, tab/tablist/tabpanel 관계, selected state, closed inert 상태를 확인한다.
- `document.activeElement`를 각 open/roving/close 단계에서 기록한다. 기대 순서: opener → active tab → roved tab → 같은 opener.
- normal motion과 `prefers-reduced-motion: reduce` 두 조건에서 hidden timing/ghost click 여부를 관찰한다.
- 시각적으로 backdrop native button reset 때문에 기본 border/padding이 생기지 않고 전체 viewport를 덮는지 확인한다.

## 완료 기준 체크리스트

- [ ] React 19 type 지원에 맞는 boolean `inert`를 cast 없이 사용한다.
- [ ] closed sheet는 transition 중에도 즉시 focus 불가이며 종료 후 visibility hidden이다.
- [ ] backdrop은 mouse/touch/Enter/Space로 동일 close action을 활성화한다.
- [ ] tabs와 panels가 id/aria-controls/aria-labelledby로 1:1 연결된다.
- [ ] Arrow/Home/End roving과 active-only tab stop이 동작한다.
- [ ] FAB/library/controls 각각 자기 opener로 focus가 복귀한다.
- [ ] App/store/타입 파일은 수정하지 않는다.
- [ ] 기존 Escape 및 inflight focus 계약이 회귀하지 않는다.
- [ ] tests/typecheck/UI build/render-grounding이 통과한다.

## Write scope clean 검증

2026-07-17 10:17 KST, 허용된 read-only `git status --short -- <file>` 결과:

| 계획 파일 | 상태 |
|---|---|
| `ui/src/components/MobileComposeSheet.tsx` | clean |
| `ui/src/components/MobileAppBar.tsx` | clean (000 대비 required scope expansion) |
| `ui/src/styles/responsive-layout.css` | clean |
| `ui/src/lib/mobileComposeSheetFocus.ts` | absent (planned NEW) |
| `tests/mobile-compose-sheet-accessibility-contract.test.js` | absent (planned NEW) |

en/ko JSON은 현재 modified지만 이 020 phase는 해당 파일을 수정하지 않는다. 구현 직전 위 planned files를 다시 조회하며 하나라도 modified이면 병렬 소유물로 간주하고 BLOCKED/재계획한다.
