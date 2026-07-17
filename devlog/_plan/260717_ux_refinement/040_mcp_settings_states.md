---
created: 2026-07-17
tags: [ima2-gen, ux, mcp, settings, accessibility, plan]
---

# 040 — MCP settings states (F10–F13)

## Loop spec

- Archetype: spec-satisfaction / async-state and accessibility contract repair.
- Trigger: MCP catalog fetch가 loading/error/retry를 구분하지 않아 로딩 중 provider-defaults 카피가 보이고, 빈 `Select`가 유령 active option을 가리킬 수 있으며, 선택형 버튼과 Refresh의 상태가 접근성 트리에 충분히 노출되지 않는다.
- Goal: F10–F13을 컴포넌트 로컬 상태로 닫고, catalog `idle → loading → ready|error → retry`와 빈 목록, pressed, busy 계약을 테스트로 고정한다.
- Non-goals: `ui/src/lib/mcpProviders.ts` 수정, provider transport/polling 재설계, schema-drift action lock, 모델 카탈로그 API 변경, 새로운 provider 추가.
- Verifier: `node --test --import tsx tests/mcp-settings-states-contract.test.ts`, 기존 MCP/duration 계약 테스트, `npm run typecheck`, `npm run typecheck:tests`, `npm test`, `cd ui && npm run build`, 상태별 브라우저 render-grounding.
- Stop: loading/error/retry/empty/pressed/busy의 모든 조건부 경로가 활성화되고, retry 성공 후 정상 presets가 복원되며, 빈 `Select`가 listbox/`aria-activedescendant`를 만들지 않는다.
- Memory: 이 문서, `000_plan.md`, `002_code_friction_inventory.md`, 구현 diff, 상태별 네트워크/접근성 관찰 기록.
- Terminal: DONE / NEEDS_HUMAN(카피 의미 결정) / BLOCKED(`mcpProviders.ts`를 수정해야만 해결되는 transport 결함).
- Escalation: 구현 중 provider hook 내부 상태가 필수라는 결론이 나오면 이 phase에서 우회하지 않고 090 D04로 되돌린다.

## 현재 코드 근거 (2026-07-17, HEAD)

### F10 — catalog에는 실패 boolean만 있고 loading/retry 상태가 없다

- `ui/src/components/settings/McpGenerationControls.tsx:37-63`은 `catalogFailed`만 관리한다.

```tsx
const [catalog, setCatalog] = useState<McpModelCatalog>(EMPTY_CATALOG);
const [catalogFailed, setCatalogFailed] = useState(false);
// ...
setCatalogFailed(false);
void getMcpModelCatalog(mcpProvider, controller.signal)
  .then((next) => {
    if (!controller.signal.aborted) setCatalog(next);
  })
  .catch(() => {
    setCatalog(EMPTY_CATALOG);
    setCatalogFailed(true);
  });
```

- `ui/src/components/settings/McpGenerationControls.tsx:111-131`(실패 카피 `modelsLoadFailed`는 `:113`)은 fetch 진행 중에도 빈 catalog를 정상 결과처럼 읽어 `providerDefaultsHelp` 또는 `chooseModelForPresets`를 표시한다. 실패 카피는 있지만 재시도 버튼은 없다.
- `ui/src/i18n/en.json:672-686`의 `mcp` 객체에는 `loadingModels`, `modelsLoadFailed`가 이미 nested leaf로 존재한다. 신규 카피는 `mcp.retryModels`, `mcp.noModels`, `mcp.refreshingConnection` 세 leaf만 en/ko에 key-add-only로 추가한다.

### F11 — 빈 Select가 열리고 존재하지 않는 option id를 참조할 수 있다

- `ui/src/components/controls/Select.tsx:172-183`:

```tsx
const openList = () => {
  setActiveIndex(Math.max(0, flat.findIndex((it) => it.value === value)));
  setOpen(true);
};
```

- `ui/src/components/controls/Select.tsx:285-297`은 `open`만 참이면 `${listId}-opt-0`을 `aria-activedescendant`로 설정한다. `flat.length === 0`이면 해당 DOM option은 없다.
- 같은 파일 `:235-283`은 빈 `rendered` group으로 빈 listbox를 렌더할 수 있다. empty 데이터는 선택 UI가 아니라 호출부의 상태 카피로 설명하고, 공유 `Select`는 아예 열리지 않게 한다.

### F12 — visual `.active`와 semantic pressed 상태가 분리돼 있다

- MCP image/video: `ui/src/components/settings/McpGenerationControls.tsx:93-108`.
- optional/enum preset: `ui/src/components/settings/McpModelPresetControls.tsx:89-106`.
- aspect ratio: 같은 파일 `:141-146`.
- duration Auto: `ui/src/components/controls/DurationSlider.tsx:42-50`.

모두 `className={... " active"}`만 있고 `aria-pressed`가 없다. 이들은 일회성 action이 아니라 현재 선택값을 토글/세그먼트 형태로 표현하므로 `aria-pressed`가 맞다. native range는 이미 `aria-valuetext`를 가지므로 변경하지 않는다.

### F13 — action Refresh는 부분 busy가 있으나 list Refresh의 동기 local lock이 없다

- `ui/src/components/settings/McpProviderConnections.tsx:25-45`에는 `busyProvider`가 있어 provider별 connect/reconnect/disconnect 반복 클릭은 이미 막는다.
- 반면 상단 status Refresh는 `:55-57`에서 hook의 `loading`만 사용한다.

```tsx
<button onClick={() => void refresh()} disabled={loading}>
  {loading ? t("mcp.loadingProviders") : t("mcp.refreshList")}
</button>
```

`refresh()` 호출 직후 hook 상태가 반영되기 전의 클릭 창을 컴포넌트 로컬 `listRefreshBusy`로 닫고, provider action도 `busyAction`으로 action 종류를 보존해 Reconnect의 busy label/`aria-busy`를 정확히 표시한다. `ui/src/lib/mcpProviders.ts`는 WT(`M`)이므로 읽거나 수정해 해결하지 않는다.

## 파일 변경 맵

| 상태 | 파일 | 변경 |
|---|---|---|
| MODIFY | `ui/src/components/settings/McpGenerationControls.tsx` | catalog status union, retry token, stale/abort-safe transition, loading/error/retry/empty render 분기, mode `aria-pressed`. |
| MODIFY | `ui/src/components/settings/McpModelPresetControls.tsx` | Auto/ratio/enum/boolean preset 버튼 `aria-pressed`. |
| MODIFY | `ui/src/components/settings/McpProviderConnections.tsx` | list Refresh local busy(실패 표시는 hook `error` SoT — alert 조건 분리), provider `busyAction`, busy label/`aria-busy`. |
| MODIFY | `ui/src/components/controls/Select.tsx` | empty-list open guard, empty 전환 시 close/index reset, 존재하는 option에만 `aria-activedescendant`, empty trigger disabled. |
| MODIFY | `ui/src/components/controls/DurationSlider.tsx` | Auto 버튼 `aria-pressed={isAuto}`. |
| MODIFY | `ui/src/styles/settings-controls.css` | inline retry row와 busy button의 기존 토큰 기반 배치; 새 색/overlay 없음. |
| MODIFY (KEY-ADD-ONLY) | `ui/src/i18n/en.json`, `ui/src/i18n/ko.json` | `mcp.retryModels`, `mcp.noModels`, `mcp.refreshingConnection`만 추가. 010의 dictionary shape/parity 계약을 보존. |
| NEW | `tests/mcp-settings-states-contract.test.ts` | F10–F13 정적/상태 계약 테스트. |

`ui/src/styles/controls.css`는 F11에 CSS 변경이 필요 없으므로 이 phase에서 수정하지 않는다. `ui/src/lib/mcpProviders.ts`, `storeTypes.ts`, `useAppStore.ts`는 명시적 불가침이다.

## Before / after diff

### 1. Catalog state machine + retry

```diff
--- a/ui/src/components/settings/McpGenerationControls.tsx
+++ b/ui/src/components/settings/McpGenerationControls.tsx
@@
-  const [catalogFailed, setCatalogFailed] = useState(false);
+  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");
+  const [catalogRetryToken, setCatalogRetryToken] = useState(0);
@@
   if (!mcpProvider || !connected) {
     setCatalog(EMPTY_CATALOG);
+    setCatalogState("idle");
     return;
   }
   const controller = new AbortController();
-  setCatalogFailed(false);
+  setCatalogState("loading");
   void getMcpModelCatalog(mcpProvider, controller.signal)
     .then((next) => {
-      if (!controller.signal.aborted) setCatalog(next);
+      if (controller.signal.aborted) return;
+      setCatalog(next);
+      setCatalogState("ready");
     })
@@
       if (!controller.signal.aborted) {
         setCatalog(EMPTY_CATALOG);
-        setCatalogFailed(true);
+        setCatalogState("error");
       }
     });
   return () => controller.abort();
-}, [mcpProvider, connected]);
+}, [mcpProvider, connected, catalogRetryToken]);
@@
-{catalogFailed ? <p className="option-help">{t("mcp.modelsLoadFailed")}</p> : null}
+{catalogState === "loading" ? (
+  <p className="option-help" role="status">{t("mcp.loadingModels")}</p>
+): catalogState === "error" ? (
+  <div className="mcp-catalog-state" role="alert">
+    <span>{t("mcp.modelsLoadFailed")}</span>
+    <button type="button" onClick={() => setCatalogRetryToken((value) => value + 1)}>
+      {t("mcp.retryModels")}
+    </button>
+  </div>
+): catalogState === "ready" && models.length === 0 ? (
+  <p className="option-help">{t("mcp.noModels")}</p>
+): selectedEntry ? (
   // existing selected-model + presets branch
```

`loading` 동안 이전 provider catalog를 상호 노출하지 않도록 provider/kind 변경 시 catalog를 비우고, AbortError는 error로 전환하지 않는다. retry는 같은 provider/connection 조건에서 effect만 재실행한다.

### 2. Empty Select guard와 active descendant 정리

```diff
--- a/ui/src/components/controls/Select.tsx
+++ b/ui/src/components/controls/Select.tsx
@@
 const { flat, rendered } = flattenGroups(groups, items);
+const isEmpty = flat.length === 0;
@@
 const openList = () => {
+  if (isEmpty) return;
   setActiveIndex(Math.max(0, flat.findIndex((it) => it.value === value)));
   setOpen(true);
 };
+useEffect(() => {
+  if (!isEmpty) return;
+  setOpen(false);
+  setActiveIndex(0);
+}, [isEmpty]);
@@
-aria-controls={listId}
-aria-activedescendant={open ? optionId(activeIndex) : undefined}
+aria-controls={open ? listId : undefined}
+aria-activedescendant={open && flat[activeIndex] ? optionId(activeIndex) : undefined}
@@
-disabled={disabled}
+disabled={disabled || isEmpty}
```

Enter/Space/Arrow/Pointer 모두 `openList()`를 경유하므로 빈 목록은 listbox를 만들지 않는다. 비어 있지 않지만 모든 item이 disabled인 목록은 이유를 읽을 수 있도록 열 수 있으며 기존 `aria-disabled` 계약을 보존한다.

### 3. 선택형 버튼의 pressed semantics

```diff
--- a/ui/src/components/settings/McpGenerationControls.tsx
+++ b/ui/src/components/settings/McpGenerationControls.tsx
@@
 <button
   type="button"
   className={`option-btn${mcpMediaKind === "image" ? " active" : ""}`}
+  aria-pressed={mcpMediaKind === "image"}
```

```diff
--- a/ui/src/components/settings/McpModelPresetControls.tsx
+++ b/ui/src/components/settings/McpModelPresetControls.tsx
@@
 <button type="button"
   className={`option-btn${value === undefined ? " active" : ""}`}
+  aria-pressed={value === undefined}
@@
 <button
   className={`option-btn${value === option ? " active" : ""}`}
+  aria-pressed={value === option}
@@
 <button className={`option-btn${ratio === value ? " active" : ""}`}
+  aria-pressed={ratio === value}
```

```diff
--- a/ui/src/components/controls/DurationSlider.tsx
+++ b/ui/src/components/controls/DurationSlider.tsx
@@
 <button
   className={`option-btn ctl-duration__auto${isAuto ? " active" : ""}`}
+  aria-pressed={isAuto}
```

모든 sibling option에 true/false를 명시한다. `.active`는 시각 상태, `aria-pressed`는 동일 state expression의 semantic mirror다.

### 4. Refresh local busy

> **A 감사 blocker #3 반영:** `useMcpProviders().refresh()`는 오류를 내부 `setError()`로 소비하고 **항상 resolve**한다(`ui/src/lib/mcpProviders.ts:287-296`). 따라서 `catch`로 실패를 잡는 설계는 도달 불가다. 실패 표시는 **hook의 `error` 상태를 단일 source-of-truth**로 쓴다 — 로컬 `listRefreshFailed` state를 만들지 않는다. hook 계약 개선(rejection/result 반환)은 `mcpProviders.ts`가 WT라 090 이월.

```diff
--- a/ui/src/components/settings/McpProviderConnections.tsx
+++ b/ui/src/components/settings/McpProviderConnections.tsx
@@
-const [busyProvider, setBusyProvider] = useState<string | null>(null);
+const [busyAction, setBusyAction] = useState<{ provider: string; action: "connect" | "refresh" | "disconnect" } | null>(null);
+const [listRefreshBusy, setListRefreshBusy] = useState(false);
+const runListRefresh = async () => {
+  if (listRefreshBusy) return;
+  setListRefreshBusy(true);
+  try { await refresh(); } // refresh는 reject하지 않는다 — 실패는 hook `error`로 표면화됨
+  finally { setListRefreshBusy(false); }
+};
@@
-<button onClick={() => void refresh()} disabled={loading}>
-  {loading ? t("mcp.loadingProviders") : t("mcp.refreshList")}
+<button onClick={() => void runListRefresh()} disabled={loading || listRefreshBusy}
+  aria-busy={loading || listRefreshBusy}>
+  {loading || listRefreshBusy ? t("mcp.loadingProviders") : t("mcp.refreshList")}
 </button>
@@
-const busy = busyProvider === provider.id;
+const activeAction = busyAction?.provider === provider.id ? busyAction.action : null;
+const busy = activeAction !== null;
@@
 <button
   onClick={() => void runAction(provider, "refresh")}
   disabled={busy}
+  aria-busy={activeAction === "refresh"}
 >
-  {t("mcp.refreshConnection")}
+  {activeAction === "refresh" ? t("mcp.refreshingConnection") : t("mcp.refreshConnection")}
```

`runAction`의 기존 `try/catch/finally`는 유지하고 `setBusyAction({ provider, action })` / `setBusyAction(null)`로만 교체한다.

**alert 조건 분리 (round 2 blocker #2):** 현재 alert는 `error && providers.length === 0`일 때만 렌더된다(`McpProviderConnections.tsx:61`) — 이전 provider 목록이 남은 상태에서 Refresh가 실패하면 hook `error`는 설정되지만 화면에 아무 표시가 없다. `error` alert를 provider 존재 여부와 분리한다:

```diff
--- a/ui/src/components/settings/McpProviderConnections.tsx
+++ b/ui/src/components/settings/McpProviderConnections.tsx
@@
-      {error && providers.length === 0 ? (
+      {error ? (
         <p role="alert" className="settings-row__microcopy">{t("mcp.providersLoadFailed")}</p>
       ) : null}
```

성공한 `refresh()`는 `setError(null)`을 호출하므로(`mcpProviders.ts:290-292`) alert는 다음 성공 시 자동으로 사라진다. stale 목록이 함께 보이는 것은 의도된 동작(캐시 유지)이며 alert가 "목록이 오래됐을 수 있음"을 전달한다.

### 5. key-add-only

```diff
--- a/ui/src/i18n/en.json
+++ b/ui/src/i18n/en.json
@@ "mcp"
+"retryModels": "Retry",
+"noModels": "No models are available for this mode.",
+"refreshingConnection": "Refreshing…",
```

```diff
--- a/ui/src/i18n/ko.json
+++ b/ui/src/i18n/ko.json
@@ "mcp"
+"retryModels": "다시 시도",
+"noModels": "이 모드에서 사용할 수 있는 모델이 없습니다.",
+"refreshingConnection": "새로고침 중…",
```

## 테스트 계획

신규 파일: `tests/mcp-settings-states-contract.test.ts`.

Assertion 목록:

1. `McpGenerationControls`가 `idle|loading|ready|error`, retry token, AbortError 무시, abort cleanup을 가진다.
2. loading은 `role="status"` + `mcp.loadingModels`, error는 `role="alert"` + retry button, ready-empty는 `mcp.noModels`를 렌더한다.
3. loading/error/ready-empty에서 `providerDefaultsHelp` 분기가 먼저 노출되지 않는다.
4. `Select.openList()`는 empty에서 return하고 empty 전환 시 닫히며, `aria-activedescendant`는 실제 `flat[activeIndex]`가 있을 때만 존재한다.
5. empty Select trigger는 disabled이고 listbox가 렌더되지 않는다. non-empty/all-disabled 목록의 기존 disabled-option 표시는 보존한다.
6. MCP media, aspect ratio, Auto, enum/boolean, duration Auto의 모든 선택 버튼이 동일 state expression으로 `aria-pressed`를 설정한다.
7. list Refresh는 synchronous local guard + `try/finally`(refresh는 reject하지 않음), disabled, `aria-busy`를 가진다. `error` alert가 provider 존재 여부와 무관하게 렌더된다.
8. provider Reconnect는 `busyAction.action === "refresh"` 동안 busy label과 `aria-busy=true`; 다른 provider action도 중복 실행되지 않는다.
9. `ui/src/lib/mcpProviders.ts` diff가 없고, 신규 i18n leaf가 en/ko 동일 shape/non-empty string이다.
10. 기존 `tests/mcp-provider-ui-contract.test.js`, `tests/duration-slider-contract.test.js` assertions가 계속 통과한다.

실행 순서:

```bash
node --test --import tsx tests/mcp-settings-states-contract.test.ts
node --test tests/mcp-provider-ui-contract.test.js tests/duration-slider-contract.test.js
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
| catalog loading | 연결된 MCP provider를 선택하고 DevTools에서 `/api/mcp/providers/:id/models`를 Slow 3G 또는 2초 지연 | Model section에 loading status만 보이며 defaults/empty/error 문구가 보이지 않는다. |
| catalog error | 위 endpoint를 500/네트워크 offline으로 1회 실패 | alert + Retry가 표시되고 stale model/preset이 사라진다. |
| retry success | error 상태에서 네트워크를 복구하고 Retry 클릭 | 요청이 정확히 1회 재발행되고 loading을 거쳐 모델/preset이 복원된다. |
| catalog empty | mock 응답을 `{ image: [], video: [] }`로 제공하고 각 mode 전환 | mode별 `mcp.noModels`; 빈 Select trigger는 disabled이고 listbox/active descendant가 없다. |
| abort/stale response | provider A 요청을 지연한 채 provider B로 전환 후 B를 먼저 응답 | A 결과가 B 화면을 덮지 않으며 console unhandled rejection이 없다. |
| pressed semantics | image/video, ratio, optional Auto, enum, duration Auto를 각각 클릭 | 접근성 트리에서 선택 1개만 pressed=true; visual active와 일치한다. |
| list Refresh busy | Settings MCP connections에서 Refresh를 더블클릭하고 요청을 지연 | 첫 요청만 발생, 버튼 disabled + busy, 완료 후 원래 label/상태 복귀. |
| provider Reconnect busy/error | connected provider의 Reconnect를 지연/실패 | 해당 provider 버튼만 busy label/disabled; 실패 시 기존 alert, finally 후 재시도 가능. |

## Render-grounding 계획

- 1280×720 desktop과 390×844 mobile에서 Settings → MCP connections와 우측 generation controls를 캡처한다.
- 각 viewport에서 loading, error+Retry, ready-empty, ready-with-presets 네 장을 동일 provider/mode로 기록한다.
- Accessibility pane에서 `role=status`, `role=alert`, `aria-pressed`, `aria-busy`, 빈 Select의 `aria-expanded=false`/`aria-activedescendant` 부재를 확인한다.
- keyboard-only로 빈 Select에 Tab→Enter/Space/ArrowDown을 보내 listbox가 생기지 않는지, non-empty Select의 기존 typeahead/Escape/focus return이 유지되는지 확인한다.
- 새 상태 행은 `settings-controls.css`의 기존 border/text/accent 토큰만 사용하며 layout shift, horizontal overflow, 새 hue가 없는지 확인한다.

## 완료 기준 체크리스트

- [ ] F10 catalog state가 idle/loading/ready/error/retry로 분리되고 stale/abort response가 차단된다.
- [ ] loading 동안 provider-defaults 오탐이 없고 error/empty가 서로 다른 카피를 가진다.
- [ ] F11 empty Select는 pointer/keyboard 어느 경로로도 listbox를 열지 않고 유령 active descendant가 없다.
- [ ] F12 모든 선택형 button의 visual active와 `aria-pressed`가 동일 expression이다.
- [ ] F13 list/provider Refresh가 컴포넌트 로컬 busy lock, disabled, busy label을 갖는다.
- [ ] `mcpProviders.ts`와 WT store 파일은 수정하지 않았다.
- [ ] en/ko는 지정한 3개 key만 추가했고 010 parity 계약을 통과한다.
- [ ] targeted tests, typechecks, inventory, full tests, UI build, render-grounding이 통과한다.

## Write scope clean 검증

2026-07-17 KST read-only `git status --short -- <files>` 기준:

| 파일 | 상태 | 활성화 전 정책 |
|---|---|---|
| `ui/src/components/settings/McpGenerationControls.tsx` | clean | 구현 직전 재조회; non-empty면 중단. |
| `ui/src/components/settings/McpModelPresetControls.tsx` | clean | 동일. |
| `ui/src/components/settings/McpProviderConnections.tsx` | clean | 동일. |
| `ui/src/components/controls/Select.tsx` | clean | 동일. |
| `ui/src/components/controls/DurationSlider.tsx` | clean | 동일. |
| `ui/src/styles/settings-controls.css` | clean | 동일. |
| `ui/src/i18n/en.json`, `ko.json` | `M` | 000에서 승인한 key-add-only 예외. 010 랜딩 뒤 동일 key 존재/shape를 먼저 확인하고 주변 diff를 보존. |
| `tests/mcp-settings-states-contract.test.ts` | absent | NEW로만 생성. |
| `ui/src/lib/mcpProviders.ts` | `M` | WT 소유, 불가침. |

허용 조회:

```bash
git status --short -- ui/src/components/settings/McpGenerationControls.tsx ui/src/components/settings/McpModelPresetControls.tsx ui/src/components/settings/McpProviderConnections.tsx ui/src/components/controls/Select.tsx ui/src/components/controls/DurationSlider.tsx ui/src/styles/settings-controls.css ui/src/i18n/en.json ui/src/i18n/ko.json tests/mcp-settings-states-contract.test.ts ui/src/lib/mcpProviders.ts
git diff HEAD -- ui/src/components/settings/McpGenerationControls.tsx ui/src/components/settings/McpModelPresetControls.tsx ui/src/components/settings/McpProviderConnections.tsx ui/src/components/controls/Select.tsx ui/src/components/controls/DurationSlider.tsx ui/src/styles/settings-controls.css
```

첫 명령에서 clean 대상이 바뀌거나 test가 이미 생겼으면 덮어쓰지 않고 BLOCKED로 반환한다. `git add/commit/checkout/stash/restore`는 이 검증 절차에 포함하지 않는다.
