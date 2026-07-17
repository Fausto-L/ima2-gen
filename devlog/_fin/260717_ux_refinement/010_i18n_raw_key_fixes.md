---
created: 2026-07-17
tags: [ima2-gen, ux, i18n, plan]
---

# 010 — i18n raw key fixes (F1–F3)

## Loop spec

- Archetype: spec-satisfaction / localized-copy contract repair.
- Trigger: 홈 rail과 Assets toolbar에서 `nav.home`, `assets.clearAll` raw key가 노출되고 Assets 상세 표면에 영어 하드코딩 2곳이 남아 있다.
- Goal: F1–F3를 nested dictionary 규칙으로 고치고 en/ko parity 및 모든 정적·동적 `t()` 참조의 사전 존재 계약을 자동 검증한다.
- Non-goals: 번역 문구 전면 윤문, i18n 런타임 교체, `NavRail.tsx`의 병렬 asset-gen 변경, sprite 기능/카피 변경, Assets CRUD/상세 dialog 개선(060 소유).
- Verifier: `npm run typecheck:tests`, `node --test --import tsx tests/i18n-dictionary-contract.test.ts`, `npm run test:inventory`, `npm test`, `cd ui && npm run build`, en/ko 브라우저 render-grounding.
- Stop: F1–F3 assertion과 en/ko parity가 통과하고 Home/Assets 표면에 raw key 및 하드코드 영어가 보이지 않는다.
- Memory: 이 문서, `000_plan.md`, `002_code_friction_inventory.md`, 구현 diff 및 브라우저 관찰 기록.
- Terminal: DONE / NEEDS_HUMAN(번역 의미 결정) / BLOCKED(en/ko 병렬 diff와 같은 key 충돌).
- Escalation: en/ko에서 동일 key를 병렬 작업이 다른 의미로 추가했거나 dictionary 전체 재정렬이 필요하면 즉시 중단하고 소유자와 병합 순서를 정한다.

## 현재 코드 근거 (2026-07-17, HEAD 기준 설계)

### F1 — `nav.home` 참조는 있으나 dictionary leaf가 없음

- 현재 WT `ui/src/components/NavRail.tsx:120-127`은 병렬 asset-gen 변경으로 modified 상태이며, `:121`에서 아래 key를 참조한다. 이 phase는 해당 파일을 수정하지 않는다.

```tsx
const RAIL_ITEMS: RailItem[] = [
  { id: "home", mode: "home", icon: IconHome, labelKey: "nav.home", enabled: true },
  // ...
];
```

- `ui/src/i18n/en.json:1569-1577`, `ui/src/i18n/ko.json:1569-1577`의 현재 `nav` 객체에는 `ariaLabel`, `create`, `node`, `agent`, `assets`, `assetGen`, `settings`만 있고 `home`이 없다.

### F2 — dotted root key와 nested resolver가 불일치

- `ui/src/i18n/index.ts:12-17`은 `.`을 namespace separator로 해석한다.

```ts
function getPath(obj: AnyRec, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => {
    if (o == null) return undefined;
    return (o as AnyRec)[k];
  }, obj);
}
```

- 현재 WT `ui/src/i18n/en.json:1720-1766`, `ko.json:1720-1766`에서 `assets` 객체는 `:1763`에 닫히고, `"assets.clearAll"`/`"assets.clearConfirm"`는 `:1764-1765`의 root leaf다. 따라서 `t("assets.clearAll")`은 `dictionary.assets.clearAll`을 찾다가 실패한다.
- `ui/src/components/assets/AssetsWorkspace.tsx:77`은 올바른 nested 경로 형태로 두 key를 호출하고 있으므로 호출부가 아니라 dictionary shape가 결함이다.
- 파일 끝 `sprite`(`en/ko.json:1766`)는 점이 없는 정상 top-level namespace이며 내부가 이미 nested object다. **이 phase에서 이동·재포맷하지 않는다.** dotted root key만 금지한다.

### F3 — Assets 표면의 하드코드 영어

- `ui/src/components/assets/AssetsWorkspace.tsx:70`: `showToast("Element test sheets are not available yet.", true)`.
- `ui/src/components/assets/AssetsWorkspace.tsx:97`: `aria-label={`${selectedAsset.name} details`}`.
- 컴포넌트는 이미 `:19`에서 `useI18n()`을 사용하므로 새 번역 abstraction 없이 `t()`를 재사용할 수 있다.

### 기존 계약 테스트 조사

- `tests/slash-command-menu-contract.test.ts:13-18,88-99`에는 특정 slash-command key의 nested 존재 검증만 있다.
- `tests/mcp-provider-ui-contract.test.js:221`에는 `mcp` subtree leaf parity만 있다.
- `tests/composer-tray-ui-contract.test.js:67-71` 등은 기능별 key 몇 개만 확인한다.
- `tests/` 전체 `rg` 결과, **en/ko 전체 leaf parity + UI의 모든 `t()` 참조 검증은 없다.** 따라서 신규 전역 계약 파일이 필요하다.

## 파일 변경 맵

| 상태 | 파일 | 변경 |
|---|---|---|
| MODIFY | `ui/src/i18n/en.json` | `nav.home`; `assets.clearAll`, `clearConfirm`, `testSheetsUnavailable`, `detailAria` **nested 추가만**(dotted-root 잔존 허용). 기존 병렬 key 보존. |
| MODIFY | `ui/src/i18n/ko.json` | en과 동일 leaf shape 및 한국어 카피. 기존 병렬 key 보존. |
| MODIFY | `ui/src/components/assets/AssetsWorkspace.tsx` | 하드코드 2곳을 `t()`로 교체. |
| NEW | `tests/i18n-dictionary-contract.test.ts` | 전체 parity, 신규 dotted-root 유입 금지(legacy 2개 frozen), 모든 `t()` 참조 key 존재 계약. |

`NavRail.tsx`와 `i18n/index.ts`는 근거 파일일 뿐 MODIFY 대상이 아니다.

## Before / after diff

### 1. F1: `nav.home`을 양쪽 nested object에 추가

```diff
--- a/ui/src/i18n/en.json
+++ b/ui/src/i18n/en.json
@@
   "nav": {
     "ariaLabel": "Main navigation",
+    "home": "Home",
     "create": "Create",
```

```diff
--- a/ui/src/i18n/ko.json
+++ b/ui/src/i18n/ko.json
@@
   "nav": {
     "ariaLabel": "기본 내비게이션",
+    "home": "홈",
     "create": "생성",
```

### 2. F2/F3: Assets key를 기존 `assets` 객체에 병합 (additive-only — A 감사 blocker #2 반영)

병렬 작업이 추가한 `favoriteFailed`, `starAsset`, `unstarAsset` 등 주변 key는 그대로 둔다. 객체 전체 교체/정렬/포맷은 금지하고 아래 leaf만 surgical edit한다.

**dotted-root 삭제 금지.** en/ko json은 병렬 세션이 수정 중이므로 000 충돌 정책상 이 phase는 **키 추가만** 한다. nested `assets.clearAll`이 추가되면 `getPath()`가 nested 경로를 우선 해석하므로 파일 끝 dotted-root `"assets.clearAll"`/`"assets.clearConfirm"`은 무해한 dead data로 남는다(런타임 도달 불가 — `getPath`는 `.` split이라 dotted-root leaf를 절대 반환하지 않음). 제거는 JSON 병렬 diff 정리 후 후속 클린업(090 이월).

```diff
--- a/ui/src/i18n/en.json
+++ b/ui/src/i18n/en.json
@@
   "assets": {
     "title": "Assets",
+    "clearAll": "Clear all",
+    "clearConfirm": "Delete all saved assets? This cannot be undone.",
+    "testSheetsUnavailable": "Element test sheets are not available yet.",
+    "detailAria": "{name} details",
     "searchPlaceholder": "Search assets…",
```

```diff
--- a/ui/src/i18n/ko.json
+++ b/ui/src/i18n/ko.json
@@
   "assets": {
     "title": "보관함",
+    "clearAll": "전체 삭제",
+    "clearConfirm": "저장된 자산을 모두 삭제할까요? 되돌릴 수 없습니다.",
+    "testSheetsUnavailable": "요소 테스트 시트는 아직 사용할 수 없습니다.",
+    "detailAria": "{name} 상세",
     "searchPlaceholder": "보관함 검색…",
```

`sprite`의 한 줄 JSON은 이 diff에서 context로만 보이며 byte-for-byte 유지한다.

### 3. F3: AssetsWorkspace 하드코드 제거

```diff
--- a/ui/src/components/assets/AssetsWorkspace.tsx
+++ b/ui/src/components/assets/AssetsWorkspace.tsx
@@
-  const runTestSheet = async () => showToast("Element test sheets are not available yet.", true);
+  const runTestSheet = async () => showToast(t("assets.testSheetsUnavailable"), true);
@@
-    {selectedAsset && <aside className="assets-workspace__detail" aria-label={`${selectedAsset.name} details`}>
+    {selectedAsset && <aside className="assets-workspace__detail" aria-label={t("assets.detailAria", { name: selectedAsset.name })}>
```

### 4. 전역 i18n 계약의 핵심 shape

```diff
--- /dev/null
+++ b/tests/i18n-dictionary-contract.test.ts
@@
+import assert from "node:assert/strict";
+import { readFileSync, readdirSync } from "node:fs";
+import test from "node:test";
+import ts from "typescript";
+
+// flattenLeafPaths(): object leaf를 dot path Set으로 변환한다.
+// collectTranslationCalls(): ui/src의 TS/TSX AST에서 callee가 t인 호출을 모두 수집한다.
+// resolveTranslationExpression(): string literal, no-substitution template,
+// conditional branch, finite template domain을 실제 key Set으로 확장한다.
+// DYNAMIC_T_DOMAINS: language.*, sheet.tabs.*, assets.kind*, status 계열 등
+// 현재 rg로 확인된 동적 호출을 파일+expression signature별 유한 domain으로 선언한다.
+// 새로 해석 불가능한 t(expr)가 생기면 allow가 아니라 unresolved failure가 된다.
+
+test("English and Korean dictionaries have identical leaf paths", () => {
+  assert.deepEqual([...flattenLeafPaths(en)].sort(), [...flattenLeafPaths(ko)].sort());
+});
+
+// LEGACY_DOTTED_ROOTS: 병렬 diff 정리 전까지 잔존이 허용된 dead dotted-root key.
+// 이 Set은 절대 늘어나면 안 된다 — 새 dotted-root 유입만 차단한다 (000 additive-only 정책).
+const LEGACY_DOTTED_ROOTS = new Set(["assets.clearAll", "assets.clearConfirm"]);
+
+test("root dotted keys are exactly the frozen legacy set", () => {
+  for (const dictionary of [en, ko]) {
+    const dotted = Object.keys(dictionary).filter((key) => key.includes(".")).sort();
+    assert.deepEqual(dotted, [...LEGACY_DOTTED_ROOTS].sort());
+  }
+});
+
+test("legacy dotted roots are shadowed by nested keys", () => {
+  for (const key of LEGACY_DOTTED_ROOTS) {
+    assert.equal(typeof getPath(en, key), "string", `nested ${key} must resolve in en`);
+    assert.equal(typeof getPath(ko, key), "string", `nested ${key} must resolve in ko`);
+  }
+});
+
+test("every t() reference resolves in both dictionaries", () => {
+  const { keys, unresolved } = collectTranslationCalls("ui/src");
+  assert.deepEqual(unresolved, [], "every dynamic t(expr) needs an explicit finite resolver");
+  for (const key of keys) {
+    assert.equal(typeof getPath(en, key), "string", `en missing ${key}`);
+    assert.equal(typeof getPath(ko, key), "string", `ko missing ${key}`);
+  }
+});
```

`DYNAMIC_T_DOMAINS`는 prefix 존재만 확인하는 allowlist가 아니다. 예를 들어 `SHEET_TABS`, asset `kinds`, status union처럼 소스에 선언된 유한 값을 key로 확장해 각각 `getPath()`를 통과시킨다. identifier 기반 key source(`labelKey`, `toastKey`)도 해당 source array/union에서 후보 문자열을 추출한다. 추출 불가능한 새 표현은 `unresolved`로 실패시켜 “literal만 검사하고 통과”하는 구멍을 막는다.

## 테스트 계획

신규 파일: `tests/i18n-dictionary-contract.test.ts`.

검증 assertion:

1. en/ko 전체 leaf path Set이 동일하다.
2. root object의 dotted key가 `LEGACY_DOTTED_ROOTS` 2개(frozen)뿐이며 새 dotted-root 유입은 실패한다. 잔존 2개는 nested 키가 shadow함을 별도 assert(후속 클린업에서 제거되면 Set을 비우고 0개 계약으로 강화).
3. `nav.home`, `assets.clearAll`, `assets.clearConfirm`, `assets.testSheetsUnavailable`, `assets.detailAria`가 양쪽에서 non-empty string이다.
4. `translate("en"|"ko", key)`가 위 key들에 대해 key 자체를 fallback으로 반환하지 않는다.
5. UI TS/TSX AST의 모든 `t()` 호출이 literal/conditional/finite dynamic domain으로 해석되고 en/ko 모두 string leaf를 갖는다.
6. 해석되지 않은 동적 `t(expr)`는 명시적 실패한다. 무제한 allowlist는 두지 않는다.
7. `sprite`는 top-level object로 남고 `sprite.tabs.label` 등 기존 leaf가 parity에 포함된다.

실행 순서:

```bash
npm run typecheck:tests
node --test --import tsx tests/i18n-dictionary-contract.test.ts
npm run test:inventory
npm test
cd ui && npm run build
```

> **inventory 게이트 규칙 (000 충돌 정책, A 감사 blocker #1):** 신규 테스트 추가 후 `npm run test:inventory`가 실패하면 `node scripts/classify-tests.mjs`로 `docs/migration/runtime-test-inventory.md`를 **로컬 재생성**해 게이트를 green으로 만든다. 단 재생성본에는 병렬 세션의 미커밋 테스트 파일들이 함께 실리므로 **이 파일은 phase 커밋에 포함하지 않는다**(`git add` 대상에서 제외). 최종 인벤토리 커밋 소유권은 090 이월 원장 참조.

## 활성화 시나리오 (C-ACTIVATION-GROUNDING-01)

1. **F1 / locale 양분기**: 앱을 `#home`으로 열고 locale을 en→ko로 전환한다. 좌측 rail tooltip/accessible name이 각각 `Home`/`홈`이며 `nav.home`이 보이지 않는지 관찰한다.
2. **F2 / Assets 존재 분기**: 저장 asset이 1개 이상인 상태로 `#assets`를 연다. Clear 버튼이 en `Clear all`, ko `전체 삭제`로 보이는지 확인한다.
3. **F2 / destructive confirm 분기**: Clear 버튼을 누르고 실제 삭제는 취소한다. confirm 문구가 locale별 번역이며 `assets.clearConfirm` raw key가 아닌지 확인한다.
4. **F3 / test-sheet 분기**: Element 상세에서 test-sheet action을 실행한다. 기존 error toast owner를 통해 locale별 unavailable 문구가 표시되는지 관찰한다.
5. **F3 / detail label 분기**: asset 상세를 열고 접근성 트리에서 aside 이름이 `<asset name> details` / `<asset name> 상세`인지 확인한다.
6. **Fallback negative**: DevTools에서 `translate(locale, "assets.__missing__")`는 여전히 key 자체를 반환함을 확인해, 테스트가 실제 missing-key fallback을 구분하는지 검증한다.

## Render-grounding 계획

- Chrome responsive mode가 아닌 desktop에서 `http://localhost:<port>/#home`, `/#assets`를 연다.
- locale toggle로 en/ko를 각각 캡처하고 rail tooltip, Assets toolbar, confirm, toast를 관찰한다.
- Elements/Accessibility pane에서 Home button accessible name과 asset detail aside label을 확인한다.
- Console에서 raw key 문자열이 DOM text에 남는지 `document.body.innerText.match(/(?:nav|assets)\.[A-Za-z]/g)`로 보조 확인한다. 이 결과만으로 완료 판정하지 않고 위 실제 상태별 관찰과 함께 기록한다.

## 완료 기준 체크리스트

- [ ] `nav.home`이 en/ko `nav` 객체에 있고 `NavRail.tsx`는 수정하지 않았다.
- [ ] `assets.clearAll`/`clearConfirm`가 nested `assets` 객체에 추가되어 런타임 해석이 nested로 통한다. dotted-root leaf 2개는 잔존 허용(additive-only 정책, 후속 클린업 090 이월) — 삭제하지 않았다.
- [ ] top-level `sprite` 객체는 이동·재포맷·내용 변경이 없다.
- [ ] AssetsWorkspace 하드코드 영어 2곳이 locale key로 대체됐다.
- [ ] en/ko 전체 leaf parity 및 모든 `t()` 참조 계약이 통과한다.
- [ ] 병렬 en/ko key diff를 보존했으며 이 phase key 외 주변 줄을 건드리지 않았다.
- [ ] typecheck/tests/inventory/UI build와 en/ko render-grounding이 통과했다.

## Write scope clean 검증

2026-07-17 10:17 KST, 허용된 read-only `git status --short -- <file>` 결과:

| 계획 파일 | 상태 | 구현 정책 |
|---|---|---|
| `ui/src/i18n/en.json` | `M` | 병렬 수정 중. 위 5개 leaf의 nested 추가만 허용(삭제/이동 금지); 기존 diff 보존. |
| `ui/src/i18n/ko.json` | `M` | 병렬 수정 중. en과 같은 leaf shape만 surgical edit; 기존 diff 보존. |
| `ui/src/components/assets/AssetsWorkspace.tsx` | clean | 이 문서의 하드코드 2곳만 수정. |
| `tests/i18n-dictionary-contract.test.ts` | absent | NEW로만 생성. |

따라서 000의 “clean 파일만” 정책에 대한 유일한 예외는 이미 승인된 en/ko key-add(additive-only)다. 구현 직전 같은 명령을 다시 실행하고, en/ko에 같은 key가 생겼다면 덮어쓰지 말고 BLOCKED/재계획한다.
