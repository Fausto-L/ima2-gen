# 021 — Sprite recipe UI in AssetGen workspace

상태: diff-level 설계 (WP5 구현 사이클에서 소비)

## 1. 목표와 범위

AssetGen 안에 `일반 생성 | 스프라이트` 하위 탭과 recipe 작성 → idle candidate → anchor 승인 → 행 생성 UX를 제공한다. 서버 계약은 `020_sprite_recipe_identity_pipeline.md`를 따른다.

완료 조건:

- 기존 일반 image/video 생성 UX는 `일반 생성` 탭에서 동작과 상태를 그대로 유지한다.
- Sprite 탭은 새로고침 후 서버 recipe와 row 상태를 복원한다.
- anchor 미승인 상태에서는 일반 row 생성 CTA가 비활성화되고 이유가 노출된다.
- async `202` 이후 singleton `/api/events` 구독으로 row 상태와 결과가 갱신된다.
- 모든 사용자 문자열은 en/ko/ja i18n에 존재하고 tab/dialog/alert/progress semantics를 가진다.
- 신규 component/store 파일은 500줄 미만, async action은 `try/catch/finally`로 loading/error를 복구한다.

현재 workspace는 form/results/project rail 구조다(`ui/src/components/assetgen/AssetGenWorkspace.tsx:51-128`, `ui/src/components/assetgen/AssetGenWorkspace.tsx:129-218`). 일반 생성 action은 별도 impl에 두고 store에서 wiring한다(`ui/src/store/storeAssetGenImpl.ts:124-199`, `ui/src/store/useAppStore.ts:193-200`).

## 2. 정보 구조와 진입점

### 2.1 MODIFY `ui/src/components/assetgen/AssetGenWorkspace.tsx`

제목/lede 다음, `ProjectSelect` 앞에 workspace-level tablist를 둔다. Sprite는 단일 media kind가 아니므로 기존 image/video button group(`AssetGenWorkspace.tsx:69-92`)에 추가하지 않는다.

```tsx
<div className="assetgen-workflow-tabs" role="tablist" aria-label={t("sprite.tabs.label")}>
  <button role="tab" aria-selected={workflow === "generate"}>...</button>
  <button role="tab" aria-selected={workflow === "sprite"}>...</button>
</div>
```

렌더 구조:

```tsx
{workflow === "generate" ? (
  <AssetGenStandardWorkspace />
) : (
  <SpriteRecipeWorkspace />
)}
```

기존 JSX를 NEW `AssetGenStandardWorkspace.tsx`로 이동해 coordinator가 500줄 아래를 유지한다. 이동은 동작 변경 없이 selectors, `KeyingPanel`, lightbox, project rail을 그대로 보존한다.

탭 상태는 Zustand에 둬 workspace 재렌더에도 유지하되 localStorage에는 저장하지 않는다. 앱 재시작 기본은 `generate`다.

## 3. 컴포넌트 계약

### 3.1 NEW `ui/src/components/assetgen/SpriteRecipeWorkspace.tsx`

Sprite 탭의 coordinator다. mount 시 recipe 목록을 불러오고 active recipe가 있으면 detail을 불러온다.

```ts
export function SpriteRecipeWorkspace(): JSX.Element;
```

레이아웃:

```text
좌측: ProjectSelect + SpriteRecipeForm + 저장/생성 CTA
중앙: SpriteAnchorGate 또는 SpriteRowList
우측: 현재 project의 recipe 선택 목록/최근 row 결과
```

상태 분기: loading은 `role="status"`와 submit 금지, load error는 alert/retry, recipe 없음은 create empty state, dirty draft는 생성 금지, missing/candidate anchor는 `SpriteAnchorGate`, approved는 `SpriteRowList`다.

### 3.2 NEW `ui/src/components/assetgen/SpriteRecipeForm.tsx`

서버 normalized recipe와 동일한 필드를 편집한다.

```ts
interface SpriteRecipeFormProps {
  draft: SpriteRecipeDraft;
  disabled: boolean;
  errors: SpriteRecipeFieldErrors;
  onChange(patch: Partial<SpriteRecipeDraft>): void;
  onSubmit(): void;
}
```

필드: recipe name, character id/description/style, 현재 project의 base image asset, cell geometry/margins, chroma preset/hex/RGB, state key/frames/fps/loop/action과 추가·삭제·순서 변경.

클라이언트 validation은 즉시 field hint를 제공하지만 서버 오류를 대체하지 않는다. 서버의 `error.code/message`는 form 상단 alert와 해당 필드에 매핑한다.

### 3.3 NEW `ui/src/components/assetgen/SpriteAnchorGate.tsx`

idle candidate 미리보기와 승인 confirmation을 소유한다.

```ts
interface SpriteAnchorGateProps {
  recipe: SpriteRecipeRecord;
  candidate: SpriteAnchorCandidate | null;
  generating: boolean;
  onGenerate(): void;
  onApprove(assetId: string): void;
}
```

상태: missing은 idle 생성, generating은 progress/cancel, candidate는 base 비교와 재생성/승인, approved는 lock badge/preview/명시적 교체 action을 표시한다.

승인은 되돌리기 어려운 reference ownership 전환이므로 confirmation dialog를 사용한다. Dialog shell은 `KeyingPanel`의 overlay/dialog/modal/close 패턴을 따른다. 현재 패턴은 `KeyingPanel.tsx:34-55`, `KeyingPanel.tsx:277-318`이며 load/error/action 구분은 `KeyingPanel.tsx:318-375`에 있다.

confirmation 문구는 “이후 행에는 base 이미지가 다시 첨부되지 않는다”를 명시한다. 승인 API 성공 전 optimistic lock badge를 표시하지 않는다.

### 3.4 NEW `ui/src/components/assetgen/SpriteRowList.tsx`

```ts
interface SpriteRowListProps {
  recipe: SpriteRecipeRecord;
  selected: string[];
  onSelectionChange(keys: string[]): void;
  onGenerate(keys?: string[]): void;
  onCancel(requestId: string): void;
  onPreview(row: SpriteRecipeRowRecord): void;
}
```

각 row는 state 요약, status badge, partial/persisted preview, state-only regenerate, error/retry를 표시한다. 전체/선택 생성은 approved+clean draft에서만 활성화한다. 목록은 `aria-live="polite"`, row error는 alert, progress는 `aria-value*`를 사용하되 partial 이미지는 announce하지 않는다.

## 4. Store slice

### 4.1 NEW `ui/src/store/storeSpriteRecipeImpl.ts`

일반 생성처럼 구현 함수는 slice wiring과 분리한다. `storeAssetGenImpl`은 생성 → history → local items → asset 등록을 순서대로 수행한다(`ui/src/store/storeAssetGenImpl.ts:163-183`); sprite row `image` 이벤트도 동일하게 history/items/assets 동기화를 수행하되 서버가 이미 asset을 등록하므로 중복 `createAsset`은 호출하지 않는다.

```ts
export async function loadSpriteRecipesImpl(set: StoreSet, get: StoreGet): Promise<void>;
export async function selectSpriteRecipeImpl(id: string | null, set: StoreSet, get: StoreGet): Promise<void>;
export async function saveSpriteRecipeImpl(set: StoreSet, get: StoreGet): Promise<string | null>;
export async function generateSpriteAnchorImpl(set: StoreSet, get: StoreGet): Promise<void>;
export async function approveSpriteAnchorImpl(assetId: string, set: StoreSet, get: StoreGet): Promise<void>;
export async function generateSpriteRowsImpl(stateKeys: string[] | undefined, set: StoreSet, get: StoreGet): Promise<void>;
export async function cancelSpriteJobImpl(requestId: string, set: StoreSet, get: StoreGet): Promise<void>;
export function applySpriteJobEventImpl(event: SpriteJobEvent, set: StoreSet, get: StoreGet): void;
```

각 async action은 error 초기화 → flag 설정 → API/subscription → 서버 record replace → catch `handleError`/slice error → finally flag/abort 정리 순서를 지킨다.

`generateSpriteRowsImpl`은 requestId를 먼저 만들고 event subscription을 등록한 뒤 async POST를 보낸다. 202 이후 subscription을 만들면 초기 event를 놓칠 수 있으므로 순서를 바꾸지 않는다. singleton event channel은 기존 `KeyingPanel.tsx:4-5`, `KeyingPanel.tsx:54-60` 패턴을 따른다.

이벤트 reducer는 phase/job, row/status, partial preview, image persisted URL을 replace한다. error/done은 terminal cleanup 후 detail을 재조회하며 unknown recipe/request는 무시한다.

### 4.2 MODIFY `ui/src/store/storeTypes.ts`

```ts
export type AssetGenWorkflow = "generate" | "sprite";

assetGenWorkflow: AssetGenWorkflow;
setAssetGenWorkflow: (value: AssetGenWorkflow) => void;
spriteRecipes: SpriteRecipeSummary[];
activeSpriteRecipeId: string | null;
activeSpriteRecipe: SpriteRecipeRecord | null;
spriteRecipeDraft: SpriteRecipeDraft;
spriteRecipeDirty: boolean;
spriteRecipeLoading: boolean;
spriteRecipeSaving: boolean;
spriteRecipeGenerating: boolean;
spriteRecipeError: string | null;
spriteSelectedStates: string[];
spritePartialPreviews: Record<string, string>;

loadSpriteRecipes: () => Promise<void>;
selectSpriteRecipe: (id: string | null) => Promise<void>;
updateSpriteRecipeDraft: (patch: Partial<SpriteRecipeDraft>) => void;
saveSpriteRecipe: () => Promise<string | null>;
generateSpriteAnchor: () => Promise<void>;
approveSpriteAnchor: (assetId: string) => Promise<void>;
generateSpriteRows: (stateKeys?: string[]) => Promise<void>;
cancelSpriteJob: (requestId: string) => Promise<void>;
```

### 4.3 MODIFY `ui/src/store/useAppStore.ts`

초기값과 action wiring만 둔다. 현재 AssetGen wiring 위치인 `useAppStore.ts:166-200` 옆에 배치한다.

```ts
assetGenWorkflow: "generate",
setAssetGenWorkflow: (value) => set({ assetGenWorkflow: value }),
spriteRecipes: [],
activeSpriteRecipeId: null,
activeSpriteRecipe: null,
spriteRecipeDraft: createEmptySpriteRecipeDraft(),
// flags/errors/selections...
loadSpriteRecipes: () => loadSpriteRecipesImpl(set, get),
// remaining action delegates...
```

## 5. API client

### 5.1 NEW `ui/src/lib/api-sprite-recipes.ts`

```ts
export async function listSpriteRecipes(): Promise<{ recipes: SpriteRecipeRecord[] }>;
export async function getSpriteRecipe(id: string): Promise<{ recipe: SpriteRecipeRecord }>;
export async function createSpriteRecipe(input: SpriteRecipeDraft): Promise<{ recipe: SpriteRecipeRecord }>;
export async function updateSpriteRecipe(id: string, patch: SpriteRecipeDraft): Promise<{ recipe: SpriteRecipeRecord }>;
export async function deleteSpriteRecipe(id: string): Promise<{ ok: true }>;
export async function generateSpriteAnchor(id: string, body: SpriteGenerateOptions): Promise<{ requestId: string }>;
export async function approveSpriteAnchor(id: string, assetId: string): Promise<{ recipe: SpriteRecipeRecord }>;
export async function generateSpriteRows(id: string, body: SpriteGenerateRowsOptions): Promise<{ requestId: string }>;
```

공통 fetch helper의 JSON/error parsing 규약을 재사용한다. 모든 path segment는 `encodeURIComponent`; POST generation body는 항상 `async: true`. AbortSignal을 선택 인자로 받는다.

### 5.2 NEW `ui/src/types/spriteRecipe.ts`

서버 response DTO, draft, row status, SSE union을 정의한다. 서버 normalized DTO와 UI draft를 분리한다.

```ts
export type SpriteJobEvent =
  | { event: "phase"; data: SpritePhaseEvent }
  | { event: "row"; data: SpriteRowEvent }
  | { event: "partial"; data: SpritePartialEvent }
  | { event: "image"; data: SpriteImageEvent }
  | { event: "error"; data: SpriteErrorEvent }
  | { event: "done"; data: SpriteDoneEvent };
```

## 6. i18n

MODIFY:

```text
ui/src/i18n/en.json
ui/src/i18n/ko.json
ui/src/i18n/ja.json
```

추가 key 목록:

```text
sprite.tabs.label
sprite.tabs.generate
sprite.tabs.sprite
sprite.title
sprite.lede
sprite.loading
sprite.loadError
sprite.retry
sprite.empty.title
sprite.empty.body
sprite.empty.create
sprite.recipe.select
sprite.recipe.new
sprite.recipe.name
sprite.recipe.characterId
sprite.recipe.description
sprite.recipe.style
sprite.recipe.baseAsset
sprite.recipe.save
sprite.recipe.saving
sprite.recipe.unsaved
sprite.cell.title
sprite.cell.width
sprite.cell.height
sprite.cell.safeMarginX
sprite.cell.safeMarginY
sprite.chroma.title
sprite.chroma.hex
sprite.states.title
sprite.states.add
sprite.states.remove
sprite.states.key
sprite.states.frames
sprite.states.fps
sprite.states.loop
sprite.states.action
sprite.anchor.title
sprite.anchor.missing
sprite.anchor.generate
sprite.anchor.generating
sprite.anchor.candidate
sprite.anchor.regenerate
sprite.anchor.approve
sprite.anchor.approved
sprite.anchor.replace
sprite.anchor.confirmTitle
sprite.anchor.confirmBody
sprite.anchor.confirm
sprite.anchor.cancel
sprite.rows.title
sprite.rows.generateAll
sprite.rows.generateSelected
sprite.rows.regenerate
sprite.rows.cancel
sprite.rows.preview
sprite.rows.status.pending
sprite.rows.status.queued
sprite.rows.status.running
sprite.rows.status.complete
sprite.rows.status.error
sprite.rows.status.canceled
sprite.rows.anchorRequired
sprite.rows.saveRequired
sprite.error.INVALID_SPRITE_RECIPE
sprite.error.ANCHOR_NOT_APPROVED
sprite.error.BASE_REFERENCE_FORBIDDEN
sprite.error.GENERATION_CANCELED
sprite.error.generic
```

서버 code가 번역 map에 없으면 server message를 그대로 표시하되 `sprite.error.generic` heading을 사용한다.
## 7. CSS 소유와 반응형

### 7.1 MODIFY `ui/src/styles/assetgen-workspace.css`

AssetGen과 KeyingPanel 모두 이 파일이 소유한다(`ui/src/main.tsx:22`, `ui/src/styles/assetgen-workspace.css:3-88`). 새 stylesheet import를 늘리지 않고 다음 namespace를 추가한다.

```text
.assetgen-workflow-tabs*
.sprite-recipe-workspace*
.sprite-recipe-form*
.sprite-anchor-gate*
.sprite-row-list*
.sprite-anchor-dialog*
```

CSS는 기존 variables만 사용한다. Desktop은 form/results/rail, mobile(`assetgen-workspace.css:127-139`)은 overflow 없는 단일 column이다. Anchor compare는 2열→1열, controls는 44px touch target을 지키고 dialog는 KeyingPanel 변수/구조를 sprite namespace로 재현한다.

## 8. 조건부 UX 시나리오

- 저장 전/base 없음/anchor 미승인은 해당 생성 CTA를 disable하고 `saveRequired`/field error/`anchorRequired`를 표시한다.
- 생성 중 탭 전환에도 잡/subscription을 유지하고 복귀 시 상태를 복원한다.
- 승인 실패는 candidate/dialog를 유지하고 alert; 성공은 approved badge와 row CTA로 전환한다.
- row 일부 실패는 성공 preview를 보존하고 실패 row만 retry한다.
- cancel은 CTA를 disable하고 server terminal event로 확정한다.
- missed event/remount는 recipe detail 재조회로 복구한다.
- anchor 삭제는 gate로 되돌리고, 일반 탭 복귀는 기존 일반 생성 상태를 보존한다.

## 9. 파일 매니페스트

NEW:

```text
ui/src/types/spriteRecipe.ts
ui/src/lib/api-sprite-recipes.ts
ui/src/store/storeSpriteRecipeImpl.ts
ui/src/components/assetgen/AssetGenStandardWorkspace.tsx
ui/src/components/assetgen/SpriteRecipeWorkspace.tsx
ui/src/components/assetgen/SpriteRecipeForm.tsx
ui/src/components/assetgen/SpriteAnchorGate.tsx
ui/src/components/assetgen/SpriteRowList.tsx
ui/src/components/assetgen/SpriteAnchorConfirmDialog.tsx
ui/src/components/assetgen/__tests__/SpriteRecipeWorkspace.test.tsx
ui/src/components/assetgen/__tests__/SpriteRecipeForm.test.tsx
ui/src/components/assetgen/__tests__/SpriteAnchorGate.test.tsx
ui/src/components/assetgen/__tests__/SpriteRowList.test.tsx
ui/src/store/__tests__/storeSpriteRecipeImpl.test.ts
ui/src/lib/__tests__/api-sprite-recipes.test.ts
```

MODIFY:

```text
ui/src/components/assetgen/AssetGenWorkspace.tsx
ui/src/store/storeTypes.ts
ui/src/store/useAppStore.ts
ui/src/styles/assetgen-workspace.css
ui/src/i18n/en.json
ui/src/i18n/ko.json
ui/src/i18n/ja.json
```

조건부 NEW/MODIFY:

```text
ui/src/styles/sprite-recipe.css  # assetgen stylesheet가 500줄에 접근할 때
ui/src/main.tsx                  # 위 stylesheet를 분리할 때 import만 추가
```

## 10. 테스트와 구현 순서

테스트:

- Workspace: tab semantics, 일반 생성 state 보존, sprite mount load.
- Form: field validation, state add/remove/order, dirty/save gating.
- AnchorGate: missing/generating/candidate/approved, confirmation, 실패 시 candidate 보존.
- RowList: selection, partial→persisted preview, per-row retry, cancel.
- Store: subscription-before-POST, event reducer, terminal cleanup, remount detail recovery.
- API: encoded paths, async body, error envelope, AbortSignal.
- i18n: en/ko/ja key parity.
- responsive: desktop 3영역과 mobile 단일 column에서 overflow 없음.

WP5 구현 순서:

1. `types/spriteRecipe.ts`와 `api-sprite-recipes.ts`.
2. `storeSpriteRecipeImpl.ts`, `storeTypes.ts`, `useAppStore.ts` 및 store/API tests.
3. `AssetGenStandardWorkspace` 무동작변경 추출 후 workspace tabs.
4. `SpriteRecipeWorkspace`와 `SpriteRecipeForm`.
5. `SpriteAnchorGate`/confirmation dialog와 `SpriteRowList`.
6. i18n, CSS, component tests와 반응형 QA.

검증 명령:

```bash
cd ui && npm run build
npm run typecheck
npm run typecheck:tests
npm test
```
