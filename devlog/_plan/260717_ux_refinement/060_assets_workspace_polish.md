---
created: 2026-07-17
tags: [ima2-gen, ux, assets, mobile, accessibility, plan]
---

# 060 — Assets workspace polish (F17–F21)

## Loop spec

- Archetype: spec-satisfaction / mobile CRUD, dialog, navigation and empty-state polish.
- Trigger: 390px Assets에서 folder create/rename/delete 진입점이 CSS로 사라지고, rename Enter+blur가 중복 제출될 수 있으며, mobile detail이 modal semantics/focus/backdrop 없이 bottom sheet처럼 보인다.
- Goal: F17–F21을 기존 store/API action 재사용으로 닫고, desktop folder tree/aside는 보존하면서 mobile만 touch/dialog 계약을 강화한다.
- Non-goals: Assets storage/API/schema 변경, star/favorite WT, drag-and-drop folder move, `storeUIImpl.ts`/`storeTypes.ts`/`useAppStore.ts` 수정, 새 asset-gen mode 계약, Element promotion workflow 재설계.
- Verifier: `node --test --import tsx tests/assets-workspace-polish-contract.test.ts`, 기존 Assets 계약, `npm run typecheck`, `npm run typecheck:tests`, `npm test`, `cd ui && npm run build`, 1470px/390px render-grounding.
- Stop: mobile folder CRUD, duplicate-submit negative, detail open/close/focus/backdrop, current navigation, Element empty Generate CTA를 모두 활성화하고 network/AX/visual 신호가 일치한다.
- Memory: 이 문서, `000_plan.md`, `001_benchmark_qa_evidence.md`, `002_code_friction_inventory.md`, 구현 diff, desktop/mobile screenshots.
- Terminal: DONE / NEEDS_HUMAN(CTA 목적지 의미 충돌) / BLOCKED(010 또는 parallel Assets diff와 충돌).
- Escalation: 구현 직전 `AssetsWorkspace.tsx`가 010 외 다른 diff를 가지면 자동 병합하지 않고 소유자를 확인한다.

## 현재 코드 근거 (2026-07-17, HEAD)

### F17 — mobile CSS가 folder CRUD 진입점을 명시적으로 숨긴다

- `ui/src/styles/assets-workspace.css:79-89`:

```css
@media (max-width: 800px) {
  .assets-folders__heading { display: none; }
  .assets-folders__rows { display: flex; gap: 6px; }
  .assets-folder-row { padding-left: 0; flex: none; }
  .assets-folder-row__actions { display: none !important; }
}
```

- `ui/src/components/assets/AssetsFolderTree.tsx:79-98`에는 이미 `+` create, rename, two-step delete action과 create input이 있다. 새 CRUD API를 만들 필요 없이 mobile visibility/touch layout만 복원하면 된다.
- 벤치마크 근거: `001_benchmark_qa_evidence.md:21`은 Higgsfield Assets가 “좌측 폴더 트리(All/Favorites 고정 + 사용자 폴더+추가 버튼)”과 Generate CTA를 함께 제공한다고 기록한다. ima2는 mobile horizontal tree를 유지하되 추가/행 action을 숨기지 않는다.

### F18 — asset rename Enter와 blur가 같은 async commit을 경쟁 호출한다

- `ui/src/components/assets/AssetsWorkspace.tsx:115-139`:

```tsx
async function commitRename() {
  // ...
  if (!await onRename(next)) setName(asset.name);
  setEditing(false);
}
// ...
onBlur={() => void commitRename()}
onKeyDown={(event) => {
  if (event.key === "Enter") void commitRename();
}}
```

Enter의 async 호출이 끝나기 전 focus 이동으로 blur가 발생하면 PATCH가 두 번 나갈 수 있다. `renamePendingRef`를 함수 진입 즉시 세우고 `finally`에서 해제한다. store의 기존 실패 toast(`AssetsWorkspace.tsx:64-67`)를 재사용하며 WT `storeUIImpl.ts:167-170`의 toast owner는 수정하지 않는다.

### F19 — mobile detail은 fixed sheet이지만 dialog/focus/backdrop이 없다

- `ui/src/components/assets/AssetsWorkspace.tsx:97`은 모든 viewport에서 단순 `<aside>`를 렌더하고 close button만 둔다.
- `ui/src/styles/assets-workspace.css:81-82`는 mobile에서 fixed bottom sheet로 바꾸지만 backdrop이 없다.
- 기존 `AssetMediaLightbox.tsx:83-107`은 backdrop + `role="dialog"` + `aria-modal="true"` + close-first focus를 사용하는 인접 패턴이다.

결정: desktop은 기존 non-modal aside를 유지한다. `useIsMobile()`이 true일 때만 backdrop, `role="dialog"`, `aria-modal="true"`, Escape/Tab containment, close button initial focus, opener focus 복귀를 활성화한다. 010이 추가하는 `assets.detailAria`와 기존 `assets.detailClose`를 사용한다.

### F20 — active style만 있고 current-view semantics가 없다

- `ui/src/components/assets/AssetsFolderTree.tsx:42-48,83-91`의 All/Element/custom folder button은 `.is-active`만 가진다.
- 이 버튼들은 선택 토글이 아니라 workspace view navigation이므로 `aria-current="page"`가 `aria-pressed`보다 의미에 맞다. active인 정확히 한 view에만 설정한다.

### F21 — CTA는 이미 있으나 목적지가 HEAD contract 밖 mode다

- `ui/src/components/assets/AssetsWorkspace.tsx:51-56`은 Element root empty branch를 generic filtered branch보다 먼저 결정한다.
- 같은 파일 `:87-93`에는 Element root와 generic root empty에서 CTA가 이미 존재한다.

```tsx
{elementRootView || (!filtered && !filters.folderId) ? (
  <button onClick={() => setUIMode("asset-gen")}>{t("assets.emptyCta")}</button>
) : null}
```

- 기존 store action은 `AssetsWorkspace.tsx:26`의 `setUIMode`; HEAD 구현은 `ui/src/store/storeUIImpl.ts:152-160`에서 mode를 persist/set한다.
- HEAD `ui/src/types.ts:1`의 `UIMode`에는 `classic|node|card-news|agent|assets|home`만 있어 `asset-gen`은 WT 확장에 의존한다. 이 phase는 WT mode에 기대지 않고 CTA를 HEAD-valid Create mode인 `classic`으로 전환하며 기존 `nav.create` locale key를 사용한다.
- 이는 Higgsfield의 empty-state Generate CTA(`001...:21`)와 일치하며, 새 store action이나 i18n key가 필요 없다.

## 충돌 주의 및 구현 순서 (STRICT)

`AssetsWorkspace.tsx`는 010 문서도 하드코드 영어 2곳(`runTestSheet`, detail aria label)을 수정할 계획이다.

1. **010이 먼저 랜딩되어야 한다.**
2. 060 구현 직전 `git diff HEAD -- ui/src/components/assets/AssetsWorkspace.tsx`와 현재 파일을 다시 읽는다.
3. **010이 먼저 랜딩되면 라인 시프트 재검증** 후 `assets.detailAria`를 재사용하고 010의 카피 변경을 보존한다.
4. 010 외 변경이 있거나 같은 JSX block을 다른 의미로 바꿨으면 자동 병합하지 않고 BLOCKED로 반환한다.

## 파일 변경 맵

| 상태 | 파일 | 변경 |
|---|---|---|
| MODIFY | `ui/src/components/assets/AssetsWorkspace.tsx` | mobile 여부, detail modal focus/backdrop, stable close, rename pending ref, CTA를 existing `setUIMode("classic")`로 전환. 010 `detailAria` 소비. |
| MODIFY | `ui/src/components/assets/AssetsFolderTree.tsx` | All/Element/custom active view에 `aria-current="page"`. 기존 CRUD action 재사용. |
| MODIFY | `ui/src/styles/assets-workspace.css` | mobile heading/actions 표시, horizontal rows 자체 scroll, 44px touch targets, detail backdrop/sheet layer. |
| MODIFY | `tests/assets-element-library-contract.test.ts` | 기존 CTA 목적지 assertion을 `classic` + `nav.create`로 갱신. 구현 직전 clean 재검증. |
| NEW | `tests/assets-workspace-polish-contract.test.ts` | F17–F21 및 desktop/mobile 분기 계약. |

`ui/src/store/storeUIImpl.ts`, `storeTypes.ts`, `useAppStore.ts`, API/assets store, en/ko dictionary는 수정하지 않는다. 010의 `assets.detailAria`와 기존 `nav.create`, `assets.detailClose`를 소비한다.

## Before / after diff

### 1. Mobile folder CRUD와 44px target

```diff
--- a/ui/src/styles/assets-workspace.css
+++ b/ui/src/styles/assets-workspace.css
@@ @media (max-width: 800px)
-  .assets-folders { padding: 8px 12px; overflow-x: auto; overflow-y: hidden; }
-  .assets-folders__heading { display: none; }
-  .assets-folders__rows { display: flex; gap: 6px; }
+  .assets-folders { padding: 8px 12px; overflow: hidden; }
+  .assets-folders__heading { display: flex; padding: 0 0 6px; }
+  .assets-folders__heading button { width: 44px; height: 44px; }
+  .assets-folders__rows {
+    display: flex;
+    gap: 6px;
+    overflow-x: auto;
+    overscroll-behavior-inline: contain;
+    padding-bottom: 4px;
+  }
   .assets-folder-all, .assets-folder-row__name {
     width: auto;
     flex: none;
+    min-height: 44px;
   }
-  .assets-folder-row__actions { display: none !important; }
+  .assets-folder-row__actions {
+    position: static;
+    display: flex;
+    background: transparent;
+  }
+  .assets-folder-row__actions button { min-width: 44px; height: 44px; }
```

custom folder는 `name + rename + delete` compound row로 가로 스크롤되고, All/Element는 action 없는 단일 44px chip이다. delete armed text는 기존 auto-width 규칙을 유지한다.

### 2. Rename single-flight guard

```diff
--- a/ui/src/components/assets/AssetsWorkspace.tsx
+++ b/ui/src/components/assets/AssetsWorkspace.tsx
@@ function AssetMetaDetail
 const [editing, setEditing] = useState(false);
 const [name, setName] = useState(asset.name);
+const renamePendingRef = useRef(false);
@@
 async function commitRename() {
+  if (renamePendingRef.current) return;
   const next = name.trim();
   if (!next || next === asset.name) { ... return; }
-  if (!await onRename(next)) setName(asset.name);
-  setEditing(false);
+  renamePendingRef.current = true;
+  try {
+    if (!await onRename(next)) setName(asset.name);
+  } finally {
+    renamePendingRef.current = false;
+    setEditing(false);
+  }
 }
```

Enter/blur 두 handler는 유지해 keyboard와 pointer 동작을 보존하되 두 번째 진입은 pending ref에서 즉시 return한다. Escape는 pending 전 편집에만 적용하며 진행 중 request를 취소하는 의미를 추가하지 않는다.

### 3. Mobile-only dialog, focus 이동/복귀, backdrop

```diff
--- a/ui/src/components/assets/AssetsWorkspace.tsx
+++ b/ui/src/components/assets/AssetsWorkspace.tsx
@@
+import { useIsMobile } from "../../hooks/useIsMobile";
@@
+const ASSET_DETAIL_FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
+
+function useMobileAssetDetailDialog(open: boolean, onClose: () => void) {
+  const panelRef = useRef<HTMLElement>(null);
+  const restoreRef = useRef<HTMLElement | null>(null);
+  useEffect(() => {
+    if (!open) return;
+    restoreRef.current = document.activeElement as HTMLElement | null;
+    const focusTimer = window.setTimeout(() => {
+      panelRef.current?.querySelector<HTMLElement>(ASSET_DETAIL_FOCUSABLE)?.focus();
+    }, 0);
+    const onKeyDown = (event: KeyboardEvent) => {
+      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
+      if (event.key !== "Tab") return;
+      const nodes = Array.from(
+        panelRef.current?.querySelectorAll<HTMLElement>(ASSET_DETAIL_FOCUSABLE) ?? [],
+      ).filter((node) => !node.hasAttribute("disabled") && node.getClientRects().length > 0);
+      if (nodes.length === 0) return;
+      const first = nodes[0];
+      const last = nodes[nodes.length - 1];
+      if (event.shiftKey && document.activeElement === first) {
+        event.preventDefault();
+        last.focus();
+      } else if (!event.shiftKey && document.activeElement === last) {
+        event.preventDefault();
+        first.focus();
+      }
+    };
+    document.addEventListener("keydown", onKeyDown);
+    return () => {
+      window.clearTimeout(focusTimer);
+      document.removeEventListener("keydown", onKeyDown);
+      restoreRef.current?.focus();
+    };
+  }, [onClose, open]);
+  return panelRef;
+}
@@ function AssetsWorkspace
+const isMobile = useIsMobile();
-const closeDetail = () => setSelectedAssetId(null);
+const closeDetail = useCallback(() => setSelectedAssetId(null), []);
+const detailRef = useMobileAssetDetailDialog(Boolean(selectedAsset && isMobile), closeDetail);
@@
-{selectedAsset && <aside className="assets-workspace__detail" aria-label={...}>
+{selectedAsset && isMobile ? (
+  <button type="button" className="assets-workspace__detail-backdrop"
+    aria-label={t("assets.detailClose")} onClick={closeDetail} />
+): null}
+{selectedAsset && <aside
+  ref={detailRef}
+  className="assets-workspace__detail"
+  role={isMobile ? "dialog" : undefined}
+  aria-modal={isMobile ? true : undefined}
+  aria-label={t("assets.detailAria", { name: selectedAsset.name })}
+>
```

Tab wrap은 focusable 0개면 no-op, 1개면 같은 control에 머무르며 hidden/disabled node를 필터한다. desktop에서는 hook `open=false`, backdrop/role/aria-modal이 없고 기존 aside layout을 유지한다.

```diff
--- a/ui/src/styles/assets-workspace.css
+++ b/ui/src/styles/assets-workspace.css
@@
+.assets-workspace__detail-backdrop { display: none; }
@@ @media (max-width: 800px)
+  .assets-workspace__detail-backdrop {
+    position: fixed;
+    z-index: 29;
+    inset: 0;
+    display: block;
+    border: 0;
+    background: color-mix(in srgb, var(--bg) 55%, transparent);
+  }
   .assets-workspace__detail {
     position: fixed;
     z-index: 30;
```

### 4. Current-view semantics

```diff
--- a/ui/src/components/assets/AssetsFolderTree.tsx
+++ b/ui/src/components/assets/AssetsFolderTree.tsx
@@
 <button
   className={`assets-folder-row__name${activeId === folder.id ? " is-active" : ""}`}
+  aria-current={activeId === folder.id ? "page" : undefined}
@@
 <button className={`assets-folder-all${allActive ? " is-active" : ""}`}
+  aria-current={allActive ? "page" : undefined}
@@
 <button className={`assets-folder-all assets-folder-elements${elementActive ? " is-active" : ""}`}
+  aria-current={elementActive ? "page" : undefined}
```

구현 시 `allActive`/`elementActive` local boolean을 선언해 class와 `aria-current`가 같은 expression을 공유하도록 한다.

### 5. Element empty Generate CTA → existing Create mode

```diff
--- a/ui/src/components/assets/AssetsWorkspace.tsx
+++ b/ui/src/components/assets/AssetsWorkspace.tsx
@@
-{elementRootView || (!filtered && !filters.folderId) ? (
-  <button type="button" className="assets-empty__cta" onClick={() => setUIMode("asset-gen")}>{t("assets.emptyCta")}</button>
+{elementRootView || (!filtered && !filters.folderId) ? (
+  <button type="button" className="assets-empty__cta" onClick={() => setUIMode("classic")}>{t("nav.create")}</button>
 ) : null}
```

이는 `storeUIImpl.ts`의 기존 `setUIModeImpl`을 그대로 사용한다. toast/store/API/i18n 확장은 없다. 검색/폴더 empty에는 CTA가 생기지 않는 기존 조건을 보존한다.

## 테스트 계획

신규 파일: `tests/assets-workspace-polish-contract.test.ts`.

Assertion 목록:

1. mobile CSS에서 heading/action의 `display:none`이 사라지고 heading add, folder name, rename/delete가 최소 44px target이다.
2. horizontal rows가 자체 overflow-x/overscroll을 소유하고 workspace main이 밀리지 않는다.
3. `AssetMetaDetail`에 `renamePendingRef`가 있으며 await 전에 true, `finally`에서 false가 되고 Enter+blur 두 진입이 단일 `onRename` 호출로 직렬화된다.
4. mobile detail만 backdrop, `role=dialog`, `aria-modal=true`; desktop은 non-modal aside다.
5. dialog open은 첫 control(close)에 focus, Tab/Shift+Tab wrap, Escape/backdrop close, unmount 시 opener focus 복귀를 가진다.
6. All/Element/custom folder의 class active와 `aria-current="page"`가 같은 boolean을 사용하고 동시에 하나만 current다.
7. Element root empty가 generic filtered branch보다 우선하며 CTA는 existing `setUIMode("classic")` + `nav.create`를 사용한다.
8. filtered-empty/folder-empty에는 Generate CTA가 나타나지 않는다.
9. 010의 `assets.detailAria`/하드코드 제거가 보존되고 en/ko dictionary를 060에서 수정하지 않는다.
10. `storeUIImpl.ts`, `storeTypes.ts`, `useAppStore.ts`, API files에 diff가 없다.

기존 계약 회귀:

- 기존 `tests/assets-element-library-contract.test.ts`는 현재 `asset-gen` hardcoded assertion을 가지므로 같은 060 implementation commit에서 `classic`/`nav.create`로 최소 갱신한다. 구현 직전 clean이 아니면 수정하지 않고 재계획한다.
- `tests/assets-star-rename-contract.test.ts`는 현재 병렬 `M` 상태이므로 절대 수정하지 않는다. blur/Enter/Escape 기존 assertion이 pending guard 추가 후에도 통과하는지만 실행한다.

실행 순서:

```bash
node --test --import tsx tests/assets-workspace-polish-contract.test.ts
node --test --import tsx tests/assets-element-library-contract.test.ts tests/assets-star-rename-contract.test.ts
npm run typecheck
npm run typecheck:tests
npm run test:inventory
npm test
cd ui && npm run build
```

> **inventory 게이트 규칙 (000 충돌 정책, A 감사 blocker #1):** 신규 테스트 추가 후 `npm run test:inventory`가 실패하면 `node scripts/classify-tests.mjs`로 `docs/migration/runtime-test-inventory.md`를 **로컬 재생성**해 게이트를 green으로 만든다. 단 재생성본에는 병렬 세션의 미커밋 테스트 파일들이 함께 실리므로 **이 파일은 phase 커밋에 포함하지 않는다**(`git add` 대상에서 제외). 최종 인벤토리 커밋 소유권은 090 이월 원장 참조.

## 활성화 시나리오 (C-ACTIVATION-GROUNDING-01)

| 조건부 경로 | 트리거 방법 | 관찰 신호 |
|---|---|---|
| mobile create | 390×844 `#assets`에서 folder heading `+` 클릭, 이름 입력 후 Enter | input/새 folder chip 표시, POST 1회, 44px target, horizontal scroll 유지. |
| mobile rename/delete | custom folder의 rename 클릭→Enter; delete 클릭→armed→confirm | PATCH/DELETE 각 1회, action이 화면 밖/hover 전용이 아니며 실패 시 기존 toast. |
| duplicate rename negative | asset detail rename PATCH를 2초 지연, 이름 입력 후 Enter 직후 blur 발생 | Network에 PATCH 정확히 1회; pending 중 두 번째 commit no-op; 완료 후 편집 종료. |
| mobile detail keyboard | tile button에 focus한 채 Enter로 상세 열기 | backdrop + dialog/modal, close로 initial focus, Tab containment, Escape 후 원 tile focus 복귀. |
| mobile detail pointer | tile tap 후 backdrop tap | sheet 닫힘, backdrop 제거, trigger가 DOM에 있으면 focus 복귀. |
| desktop preservation | 1470px에서 tile 선택 | 3-column aside 유지, backdrop/`aria-modal` 없음, main interaction 차단 없음. |
| current view | All → Element Library → custom folder 순서로 선택 | 접근성 tree에서 매번 정확히 하나만 `aria-current=page`, visual active와 일치. |
| Element root empty CTA | element asset 0개, query/tag/folder 없이 Element Library 진입 후 CTA 클릭 | title/body 뒤 Generate/Create CTA 표시, click 후 `uiMode=classic`/Create 화면. |
| empty negatives | 검색 결과 0개 또는 빈 custom folder | 해당 empty copy만 보이고 Generate CTA는 없음. |

## Render-grounding 계획

- 390×844: All/Element/custom folder/action/create-input을 한 화면에서 확인하고, horizontal overflow 시 action이 잘리지 않는지 캡처한다.
- 390×844: detail backdrop/open, rename pending, delete armed, empty Element CTA를 각각 캡처한다.
- 1470px: 기존 left tree + grid + right aside 3-column을 캡처해 mobile CSS가 desktop을 바꾸지 않았음을 증명한다.
- Accessibility pane에서 current item, dialog/modal/name, initial close focus를 확인한다. keyboard recording으로 Tab wrap/Escape/focus return을 기록한다.
- Network panel에서 Enter+blur rename PATCH count=1, create/rename/delete 각 request count와 status를 기록한다.
- Higgsfield 관찰(`001:21`)과 비교해 “폴더 구조 + 추가 진입점 + empty Generate CTA” 세 요소가 모두 노출되는지 확인한다. 외형 복제는 하지 않고 기존 ima2 토큰/밀도를 유지한다.

## 완료 기준 체크리스트

- [ ] F17 mobile에서 folder create/rename/delete가 보이고 각 touch target이 44px 이상이다.
- [ ] F18 Enter+blur rename은 request 1회이며 실패 toast/편집 종료가 보존된다.
- [ ] F19 mobile detail만 modal dialog/backdrop/focus 이동·trap·복귀를 갖고 desktop aside는 비모달이다.
- [ ] F20 active view 하나에만 `aria-current="page"`가 있다.
- [ ] F21 Element root empty CTA가 existing `setUIMode("classic")`로 Create 화면을 연다.
- [ ] 010 `assets.detailAria`와 하드코드 제거를 보존했고, 010 랜딩 후 라인 시프트를 재검증했다.
- [ ] store/API/i18n/WT 파일을 수정하지 않았다.
- [ ] targeted/full tests, typechecks, inventory, UI build, desktop/mobile render-grounding이 통과한다.

## Write scope clean 검증

2026-07-17 KST read-only 조회 결과:

| 파일 | 상태 | 활성화 전 정책 |
|---|---|---|
| `ui/src/components/assets/AssetsWorkspace.tsx` | clean (현재) | **010 랜딩 후 line shift 재검증 필수**. 010 diff만 있으면 그 결과 위에 060 적용; 다른 diff면 중단. |
| `ui/src/components/assets/AssetsFolderTree.tsx` | clean | 구현 직전 재조회; non-empty면 중단. |
| `ui/src/styles/assets-workspace.css` | clean | 구현 직전 재조회; non-empty면 중단. |
| `tests/assets-workspace-polish-contract.test.ts` | absent | NEW로만 생성. |
| `tests/assets-element-library-contract.test.ts` | clean | CTA assertion만 최소 갱신; 구현 직전 non-empty면 중단. |
| `tests/assets-star-rename-contract.test.ts` | `M` | 병렬 worker 소유, READ/EXECUTE only, 수정 금지. |
| `ui/src/store/storeUIImpl.ts` | `M` | WT 소유, READ-only. 수정 금지. |
| `ui/src/store/storeTypes.ts` | `M` | WT 소유, 수정 금지. |

허용 조회:

```bash
git status --short -- ui/src/components/assets/AssetsWorkspace.tsx ui/src/components/assets/AssetsFolderTree.tsx ui/src/styles/assets-workspace.css tests/assets-workspace-polish-contract.test.ts tests/assets-element-library-contract.test.ts tests/assets-star-rename-contract.test.ts ui/src/store/storeUIImpl.ts ui/src/store/storeTypes.ts
git diff HEAD -- ui/src/components/assets/AssetsWorkspace.tsx ui/src/components/assets/AssetsFolderTree.tsx ui/src/styles/assets-workspace.css tests/assets-element-library-contract.test.ts
```

010이 먼저 랜딩되면 첫 diff에 010의 두 카피 변경이 보이는 것이 정상이다. 해당 줄을 되돌리거나 문서의 옛 line number로 덮지 않는다. add/commit/checkout/stash/restore는 금지한다.
