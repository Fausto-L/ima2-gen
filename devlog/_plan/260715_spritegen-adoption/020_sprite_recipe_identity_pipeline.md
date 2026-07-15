# 020 — Sprite recipe SSoT, identity anchor, row pipeline

상태: diff-level 설계 (WP5 구현 사이클에서 소비)

## 1. 목표와 완료 조건

서버가 정규화된 sprite recipe를 유일한 수치 SSoT로 저장하고, 승인된 idle anchor와 state별 layout guide를 이용해 행 단위 생성 잡을 실행한다. 이 문서는 생성 절반만 다룬다. 프레임 추출, atlas 조립, content score, correction loop는 후속 WP다.

완료 조건:

- recipe CRUD가 SQLite에 영속화되고 모든 잘못된 입력이 `{ error: { code, message } }` envelope로 거절된다.
- 승인 전에는 base asset으로 idle candidate만 생성할 수 있고, 승인 후 일반 행에는 approved anchor가 identity reference로 강제된다.
- 각 state의 guide 크기와 prompt 숫자가 같은 normalized recipe에서 파생된다.
- async 생성은 `202 { requestId }` 후 `/api/events`로 진행되며, sync 생성은 같은 이벤트를 SSE 응답과 event bus에 dual-emit한다.
- 취소된 잡은 성공 `done`을 publish하지 않는다.
- 모든 신규 파일은 500줄 미만, async 함수는 50줄 미만이며 async 경계는 `try/catch`를 가진다.

근거: 원본은 recipe 하나에서 cell/chroma/states/style/fit을 정규화하고 guide와 prompt를 생성한다(`/tmp/sprite-gen/sprite_gen/prepare.py:847-919`). 현재 repo의 SQLite 초기화는 idempotent migration을 사용한다(`lib/db.ts:25-75`, `lib/db.ts:178-202`).

## 2. Recipe 도메인 계약

### 2.1 NEW `lib/spriteRecipeSchema.ts`

```ts
export type SpriteAnchorStatus = "missing" | "candidate" | "approved";

export interface SpriteCell {
  width: number;
  height: number;
  safeMarginX: number;
  safeMarginY: number;
}

export interface SpriteStateRecipe {
  key: string;
  frames: number;
  fps: number;
  loop: boolean;
  action: string;
}

export interface SpriteRecipeDefinition {
  version: 1;
  character: { id: string; description: string; baseAssetId: string | null };
  cell: SpriteCell;
  chromaKey: { name: string; hex: string; rgb: [number, number, number] };
  states: SpriteStateRecipe[];
  style: string;
  fit?: SpriteFit;
}

export function parseSpriteRecipeInput(input: unknown): SpriteRecipeDefinition;
export function normalizeSpriteRecipe(input: unknown): SpriteRecipeDefinition;
```

검증 한계: state 1개 이상과 key 중복 금지, frames `1..12`, fps `1..60`, cell `32..2048`, safe margin은 각 축의 절반 미만, 총 guide pixel은 100MP 이하, hex/RGB 일치, 모든 text trim/길이 제한. Zod는 기존 runtime dependency다(`package.json:78-90`).

Python cell invariant는 width/height 양수와 margin 내부 배치를 강제한다(`/tmp/sprite-gen/sprite_gen/prepare.py:511-530`).

### 2.2 MODIFY `lib/db.ts`

`assets.metadata`는 파일 라이브러리용이고(`lib/assetsStore.ts:11-22`, `lib/assetsStore.ts:233-271`), recipe는 anchor 승인과 row lifecycle을 소유하므로 전용 테이블을 추가한다.

```sql
CREATE TABLE IF NOT EXISTS sprite_recipes (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  recipe            TEXT NOT NULL,
  anchor_asset_id   TEXT,
  anchor_status     TEXT NOT NULL DEFAULT 'missing'
                    CHECK (anchor_status IN ('missing', 'candidate', 'approved')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (anchor_asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sprite_recipe_rows (
  recipe_id         TEXT NOT NULL,
  state_key         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'queued', 'running', 'complete', 'error', 'canceled')),
  request_id        TEXT,
  result_asset_id   TEXT,
  error_code        TEXT,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, state_key),
  FOREIGN KEY (recipe_id) REFERENCES sprite_recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (result_asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sprite_recipes_updated
  ON sprite_recipes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sprite_rows_request
  ON sprite_recipe_rows(request_id);
```

recipe 생성/수정 transaction은 state rows를 upsert하고 삭제된 state의 row를 제거한다. 승인 anchor asset 삭제 시 FK가 null이 되므로 read 시 `anchorStatus`를 `missing`으로 정규화한다.

### 2.3 NEW `lib/spriteRecipeStore.ts`

`nodeTemplateStore`의 interface → validation error → row mapper → SQLite implementation 구조를 따른다(`lib/nodeTemplateStore.ts:6-23`, `lib/nodeTemplateStore.ts:67-110`).

```ts
export interface SpriteRecipeRecord {
  id: string;
  name: string;
  recipe: SpriteRecipeDefinition;
  anchorAssetId: string | null;
  anchorStatus: SpriteAnchorStatus;
  rows: SpriteRecipeRowRecord[];
  createdAt: number;
  updatedAt: number;
}

export interface SpriteRecipeStore {
  list(): Promise<SpriteRecipeRecord[]>;
  get(id: string): Promise<SpriteRecipeRecord | null>;
  create(input: CreateSpriteRecipeInput): Promise<SpriteRecipeRecord>;
  update(id: string, patch: UpdateSpriteRecipeInput): Promise<SpriteRecipeRecord>;
  approveAnchor(id: string, assetId: string): Promise<SpriteRecipeRecord>;
  updateRow(id: string, stateKey: string, patch: SpriteRowPatch): Promise<void>;
  remove(id: string): Promise<void>;
}
```

오류 helper는 `{ status, code }`를 Error에 부착한다. 주요 code: `INVALID_SPRITE_RECIPE`, `SPRITE_RECIPE_NOT_FOUND`, `SPRITE_STATE_NOT_FOUND`, `ANCHOR_ASSET_NOT_FOUND`, `INVALID_ANCHOR_ASSET`, `ANCHOR_NOT_APPROVED`.

## 3. REST 표면

### 3.1 NEW `routes/spriteRecipes.ts`

```text
GET    /api/sprite-recipes
POST   /api/sprite-recipes
GET    /api/sprite-recipes/:id
PATCH  /api/sprite-recipes/:id
DELETE /api/sprite-recipes/:id
POST   /api/sprite-recipes/:id/anchor/approve
```

성공 응답은 list `200 { recipes }`, get/create/update/approve `{ recipe }`(create만 201), delete `200 { ok: true }`다.

오류 envelope는 assets route 규약을 그대로 사용한다(`routes/assets.ts:25-42`, `routes/assets.ts:159-170`).

```json
{
  "error": {
    "code": "INVALID_SPRITE_RECIPE",
    "message": "states must contain at least one state"
  }
}
```

모든 handler는 `try/catch` 후 공통 `sendSpriteError(res, error)`를 호출한다. 500에서는 내부 code를 노출하지 않고 `SPRITE_RECIPE_STORE_ERROR`를 반환한다.

### 3.2 NEW `routes/spriteGeneration.ts`

```text
POST /api/sprite-recipes/:id/anchor/generate
POST /api/sprite-recipes/:id/generate
```

body:

```ts
type SpriteGenerateBody = {
  states?: string[];
  requestId?: string;
  async?: boolean;
  provider?: string;
  model?: string;
  quality?: string;
};
```

`routes/index.ts`에서 두 register 함수를 import하고 asset routes 뒤, generic generate routes 전에 등록한다. 현재 등록 규약은 `routes/index.ts:35-68`이다.

## 4. Anchor identity 정책

### 4.1 NEW `lib/spriteAnchor.ts`

실제 이미지 파일은 기존 `assets(kind='image')`가 소유하고 recipe는 승인 관계만 소유한다. graph session에 저장하지 않는다. Node parent는 이미지 identity source로 provider references 앞에 들어간다(`lib/nodeGeneration.ts:109-124`, `lib/nodeHelpers.ts:74-80`).

```ts
export async function approveSpriteAnchor(
  recipeId: string,
  candidateAssetId: string,
): Promise<ApprovedSpriteAnchor>;

export async function requireApprovedSpriteAnchor(
  recipeId: string,
): Promise<ApprovedSpriteAnchor>;

export function buildSpriteRowReferences(input: {
  recipe: SpriteRecipeRecord;
  anchor: ApprovedSpriteAnchor;
  guide: SpriteLayoutGuide;
  basisRowAsset?: AssetRecord;
}): SpriteReferenceInput[];

export function assertNoBaseReferenceAfterApproval(
  recipe: SpriteRecipeRecord,
  references: SpriteReferenceInput[],
): void;
```

Reference ownership:

| 단계 | 허용 reference | 금지 |
|---|---|---|
| anchor 미승인, idle candidate | `baseAssetId + idle guide` | 일반 state 생성 |
| anchor 승인 | candidate asset을 `anchorAssetId`, status `approved`로 저장 | video/없는 파일/non-image asset 승인 |
| anchor 승인 후 일반 row | `approved anchor + state guide`, 선택적으로 basis row | base asset 재첨부 |

원본 정책도 accepted idle anchor가 identity truth이고 승인 뒤 base를 버린다(`/tmp/sprite-gen/docs/architecture.md:152-177`).

조건부 시나리오: 승인 전 `/generate`는 provider 호출/row mutation 없이 `400 ANCHOR_NOT_APPROVED`; 승인 asset 삭제는 다음 read에서 missing으로 교정; 일반 row에 base가 섞이면 `400 BASE_REFERENCE_FORBIDDEN`; 같은 asset 재승인은 idempotent 200이다.

`lib/nodeGeneration.ts`/`lib/nodeHelpers.ts`는 MVP에서 수정하지 않는다. Node UI에서도 recipe anchor를 직접 선택하는 별도 요구가 생길 때만 `anchorAssetId` 입력을 추가한다.

## 5. Layout guide

### 5.1 NEW `lib/spriteLayoutGuide.ts`

`sharp`는 이미 설치되어 있고(`package.json:78-90`), repo는 `sharp({ create })`로 canvas를 만든다(`lib/grokVideoCanvas.ts:28-39`). guide는 새 dependency 없이 create + SVG composite로 생성한다.

```ts
export interface SpriteLayoutGuide {
  stateKey: string;
  width: number;
  height: number;
  buffer: Buffer;
  relativePath: string;
  mime: "image/png";
}

export function assertSpriteGuideGeometry(cell: SpriteCell, frames: number): void;

export async function renderSpriteLayoutGuide(input: {
  recipeId: string;
  state: SpriteStateRecipe;
  cell: SpriteCell;
  generatedDir: string;
}): Promise<SpriteLayoutGuide>;
```

렌더 계약: canvas는 `frames * cell.width` × `cell.height`; 각 slot에 외곽선/safe rectangle/세로 중심선을 그리고 font는 사용하지 않는다. 출력은 `sprite-recipes/<recipeId>/guides/<stateKey>.png`; state key traversal을 거절하며 mkdir/render/write 실패는 `SPRITE_GUIDE_WRITE_FAILED`다.

Python 원본의 동일 geometry는 `/tmp/sprite-gen/sprite_gen/prepare.py:661-688`이다. `lib/imageMetadata.ts`는 XMP 정규화 전용이므로 guide 합성을 넣지 않는다(`lib/imageMetadata.ts:40-83`).

## 6. Row prompt와 generation pipeline

### 6.1 NEW `lib/spriteRowPrompt.ts`

```ts
export function buildSpriteRowPrompt(input: {
  recipe: SpriteRecipeDefinition;
  state: SpriteStateRecipe;
  anchorMode: "base-idle-candidate" | "approved-anchor";
}): string;
```

prompt는 정확한 frame/slot/cell/safe margin/chroma를 recipe에서 삽입하고 다음을 명시한다: 정확히 N개 pose, slot당 1개, 경계 침범 금지, guide line 출력 금지, anchor는 identity만 소유하고 row는 motion만 소유. 원본 reference contract는 `/tmp/sprite-gen/sprite_gen/prepare.py:691-745`에 있다.

### 6.2 NEW `lib/spriteJobEvents.ts`

```ts
export interface SpriteJobEmitter {
  emit(event: SpriteJobEventName, data: Record<string, unknown>): boolean;
  end(): void;
}

export function createSpriteJobEmitter(
  res: Response,
  requestId: string,
): SpriteJobEmitter;
```

sync 응답이 열려 있으면 HTTP SSE와 event bus 양쪽에 보낸다. async 응답은 202로 끝났으므로 event bus에만 보낸다. `done`은 반드시 `publishJobEvent()`를 거쳐 cancel-done race를 막는다(`lib/ssePublish.ts:4-16`). 현재 multimode dual-emit의 기준 동작은 `lib/multimodePipeline.ts:65-89`, `lib/multimodePipeline.ts:123-128`이다.

### 6.3 NEW `lib/spriteRowPipeline.ts`

`runMultimodePipeline()`을 호출하거나 그 안에 sprite 분기를 추가하지 않는다. Multimode는 한 prompt/reference에서 N개 이미지를 받지만 sprite는 state마다 prompt/reference/guide가 다르다. 기존 파일도 이미 500줄을 넘는다.

```ts
export async function runSpriteAnchorGeneration(
  req: Request,
  res: Response,
  ctx: RuntimeContext,
): Promise<void>;

export async function runSpriteRecipeGeneration(
  req: Request,
  res: Response,
  ctx: RuntimeContext,
): Promise<void>;

async function generateSpriteRow(
  row: SpriteRowContext,
  ctx: RuntimeContext,
  signal: AbortSignal,
  events: SpriteJobEmitter,
): Promise<SpriteRowResult>;
```

실행 순서: body/recipe/state 검증 → anchor policy → `startJob`/AbortController → async 202 또는 sync SSE → state별 running 저장 → guide/prompt/provider → 파일 및 image asset 저장 → row terminal 저장/emit → 전체 done/error → finally `finishJob`.

MVP는 recipe 내부 row를 순차 실행한다. 서로 다른 recipe job은 기존 inflight 한도 안에서 병렬 가능하다.

### 6.4 SSE 이벤트 계약

```text
phase   { requestId, recipeId, phase: "preparing"|"generating", totalStates }
row     { requestId, recipeId, stateKey, rowIndex, totalRows, status }
partial { requestId, recipeId, stateKey, image, index }
image   { requestId, recipeId, stateKey, assetId, filename, url }
error   { requestId, recipeId, stateKey?, status, error: { code, message } }
done    { requestId, recipeId, requested, returned, status, rows }
```

- `partial`은 저장되지 않은 provider preview다.
- `image`는 파일 저장과 asset 등록까지 완료된 결과다.
- `status`는 `complete | partial`; 한 row라도 성공하고 이후 실패하면 partial done을 허용한다.
- 결과 0개면 `error`만 보내고 done을 보내지 않는다.
- cancel 감지 후 row는 canceled, `error { code: 'GENERATION_CANCELED' }`; `publishJobEvent`가 후발 done을 억제한다.
- 중복 requestId는 409, inflight 초과는 429와 `Retry-After`.

이미지 metadata/XMP에는 `kind: 'sprite-row'`, recipe/state/frame/fps/loop, anchor, guide, requestId를 기록한다(`lib/imageMetadata.ts:40-77`).

## 7. 파일 매니페스트

NEW:

```text
lib/spriteRecipeSchema.ts
lib/spriteRecipeStore.ts
lib/spriteAnchor.ts
lib/spriteLayoutGuide.ts
lib/spriteRowPrompt.ts
lib/spriteJobEvents.ts
lib/spriteRowPipeline.ts
routes/spriteRecipes.ts
routes/spriteGeneration.ts
tests/sprite-recipe-schema.test.ts
tests/sprite-recipe-store.test.ts
tests/sprite-recipe-routes.test.ts
tests/sprite-anchor-policy.test.ts
tests/sprite-layout-guide.test.ts
tests/sprite-row-pipeline.test.ts
tests/sprite-sse-contract.test.ts
```

MODIFY:

```text
lib/db.ts
lib/inflight.ts
lib/imageMetadata.ts
routes/index.ts
tests/test-inventory.json
```

조건부 MODIFY:

```text
lib/multimodePipeline.ts       # 공통 image persist helper를 실제로 추출할 때만
lib/nodeGeneration.ts          # Node UI의 recipe anchor 직접 사용 요구가 생길 때만
lib/nodeHelpers.ts             # 위 anchorAssetId request 계약을 활성화할 때만
```

## 8. 테스트 매트릭스

- schema: 기본값 정규화, 중복 state, frame/fps/cell/margin/pixel 한계, chroma 불일치.
- store: CRUD, row upsert/removal transaction, malformed stored JSON 격리, recipe cascade delete.
- route: 201/200/404, 400 envelope, 내부 500 code 비노출.
- anchor: image만 승인, 미승인 일반 row 400, 승인 후 base 금지, anchor 삭제 후 missing 교정.
- guide: PNG signature, 정확한 dimensions, slot/safe-line pixel sample, traversal 거절, pixel cap.
- prompt: recipe 숫자와 state action 포함, approved mode에서 base 문구/참조 없음.
- pipeline: state 순서, state subset, row partial success, 결과 asset metadata, provider failure.
- SSE: sync dual-emit, async 202 + event bus, partial→image→done 순서, zero-result error-only.
- cancel: running row canceled 저장, error emit, cancel 이후 done 억제.
- inflight: duplicate 409, capacity 429 + Retry-After.

검증 명령:

```bash
npm run typecheck
npm run typecheck:tests
node --test tests/sprite-*.test.ts
npm run test:inventory
```

## 9. WP5 구현 순서

1. **스키마:** `spriteRecipeSchema.ts`, `db.ts`, schema tests.
2. **스토어:** `spriteRecipeStore.ts`, CRUD/transaction tests.
3. **가이드·정책:** `spriteAnchor.ts`, `spriteLayoutGuide.ts`, `spriteRowPrompt.ts`와 단위 테스트.
4. **파이프라인:** `spriteJobEvents.ts`, `spriteRowPipeline.ts`, inflight/metadata 변경과 SSE/cancel tests.
5. **라우트:** `spriteRecipes.ts`, `spriteGeneration.ts`, `routes/index.ts`, route contract tests.
6. **게이트:** typecheck, targeted tests, inventory, 전체 `npm test`.
