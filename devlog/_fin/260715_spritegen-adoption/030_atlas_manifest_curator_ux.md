# 030 — Atlas manifest, storage, compose, import/export

상태: diff-level 설계 (WP6 구현 사이클에서 소비)

## 목표와 경계

sprite-gen의 `manifest.json`, `curation.json`, run-directory 규약을 Express/TypeScript
서버에 이식한다. ima2-gen에서 만든 run을 sprite-gen이 다시 읽고, sprite-gen run을
ima2-gen이 손실 없이 import/unpack할 수 있어야 한다.

- 포함: manifest 타입/검증/왕복, run storage, 비파괴 curation, atlas/contact sheet
  compose, 투명 GIF, manifest 기반 import/unpack, 대표 asset 등록.
- 제외: React 큐레이터와 playback UX는 `031_sprite_curator_ui.md`가 소유한다.
- 제외: manifest 없는 atlas의 grid/alpha 자동감지. 첫 구현은 명시 manifest를 필수로 한다.
- 제외: Python curator 서버와 신규 GIF npm encoder.

## 고정 호환 계약

근거:

- `/tmp/sprite-gen/sprite_gen/compose_atlas.py:81-95` — `frame_layout`과
  `animation`의 sheet/cell/column/row 필드.
- `/tmp/sprite-gen/sprite_gen/compose_atlas.py:99-130` — 상태별 절대 rect
  `{x,y,w,h}`와 `{row,frames,fps,loop}`.
- `/tmp/sprite-gen/sprite_gen/compose_atlas.py:154-168` — 최종 manifest 필드.
- `/tmp/sprite-gen/sprite_gen/unpack_atlas.py:158-212` — explicit `frame_layout` 우선,
  animation/grid fallback 소비 규약.
- `/tmp/sprite-gen/sprite_gen/curation.py:15-53` — curation schema와 누락값 의미.
- `/tmp/sprite-gen/sprite_gen/curation.py:64-67` — `curation.json`, version 1,
  transform identity.
- `/tmp/sprite-gen/sprite_gen/curation.py:169-212` — `selected/deleted/transforms`가
  bake 입력이며 `order`는 bake에서 무시됨.

필수 원칙:

1. JSON wire field의 snake_case/camelCase를 바꾸지 않는다.
2. `frame_layout.rows`는 `Record<string, Rect[]>`로 유지하고 grid를 재추론하지 않는다.
3. Zod object는 `.passthrough()`로 선언하여 알 수 없는 top-level/nested provenance를
   parse→serialize 왕복에서 보존한다.
4. `cell`, `chroma_key`, `frame_variant`는 미래 확장을 거부하는 폐쇄 enum으로 만들지 않는다.
5. manifest writer는 key 정규화나 unknown-field 제거를 하지 않는다.
6. curation writer는 원본 frame PNG를 수정하지 않는다.

## 030-1 — Manifest 타입과 왕복

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `lib/spriteAtlasTypes.ts` | wire types와 Zod schemas |
| NEW | `lib/spriteAtlasManifest.ts` | parse, validate, serialize |
| NEW | `tests/sprite-atlas-manifest.test.ts` | fixture 왕복 및 rect 검증 |
| NEW | `tests/fixtures/sprite-gen/manifest.json` | sprite-gen 실제 manifest fixture |

### 타입/함수 계약

```ts
export type SpriteFrameRect = { x: number; y: number; w: number; h: number };
export type SpriteFrameLayout = {
  sheetWidth: number;
  sheetHeight: number;
  cellWidth: number;
  cellHeight: number;
  rows: Record<string, SpriteFrameRect[]>;
  [key: string]: unknown;
};
export type SpriteAnimationRow = {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  [key: string]: unknown;
};
export type SpriteGenManifest = {
  characterId: string;
  engine: string;
  game_input: string;
  degraded_static_fallback: boolean;
  curation_applied: boolean;
  frame_variant: string;
  sprite_sheet_alpha: string;
  sprite_sheet_alpha_report: string;
  base_image: string | null;
  cell: Record<string, unknown>;
  chroma_key: Record<string, unknown>;
  animation: {
    cellWidth: number;
    cellHeight: number;
    columns: number;
    rows: Record<string, SpriteAnimationRow>;
    [key: string]: unknown;
  };
  frame_layout: SpriteFrameLayout;
  [key: string]: unknown;
};

export function parseSpriteGenManifest(input: unknown): SpriteGenManifest;
export function serializeSpriteGenManifest(manifest: SpriteGenManifest): string;
export function validateFrameLayout(
  manifest: SpriteGenManifest,
  atlas: { width: number; height: number },
): string[];
```

`validateFrameLayout`은 양수 크기, sheet bounds, animation frame count와 rect count의
불일치를 보고하되 상태 key를 재작성하지 않는다. parse 실패는 code가 있는 400 오류로
상위 route가 변환할 수 있게 한다.

### 수용 테스트

- fixture parse→serialize→parse deep equality. unknown top-level, `cell`, `chroma_key`,
  animation-row 필드가 보존된다.
- 상태 순서와 각 rect 배열 순서가 보존된다.
- sheet 밖 rect, 0/음수 크기, animation/rect count 불일치가 검출된다.
- `frame_variant: "plain"` 외 미래 문자열도 읽을 수 있다.

## 030-2 — Run path와 비파괴 curation storage

기존 다중 산출물의 directory manifest 패턴은
`lib/cardNewsManifestStore.ts:42-50`에 있고, generated 상대경로 정규화는
`lib/assetsStore.ts:97-124`에 있다. JSON 원자 쓰기는 `lib/atomicWrite.ts:3-7`을
재사용한다. `safeWriteSidecar`는 오류를 삼키므로 사용자 curation 저장에는 사용하지 않는다
(`lib/atomicWrite.ts:9-14`).

### 저장 구조

```text
generated/sprite-runs/<runId>/
├── sprite-request.json
├── manifest.json
├── curation.json
├── sprite-sheet-alpha.png
├── sprite-sheet-alpha.report.json
└── frames/<state>/frame-N.png
                    frame-N.plain.png
```

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `lib/spriteRunPath.ts` | runId/path 검증, generatedDir 탈출 차단 |
| NEW | `lib/spriteCurationStore.ts` | curation parse/read/atomic write/state plan |
| NEW | `tests/sprite-run-path.test.ts` | traversal/symlink/정상 상대경로 |
| NEW | `tests/sprite-curation-store.test.ts` | defaults, 왕복, 원본 불변 |

### 타입/함수 계약

```ts
export type SpriteFrameTransform = {
  rotate: number; scale: number; dx: number; dy: number;
  shx: number; shy: number; flipX: 0 | 1;
};
export type SpriteCurationState = {
  selected?: number[];
  deleted?: number[];
  order?: number[];
  transforms?: Record<string, Partial<SpriteFrameTransform>>;
};
export type SpriteCuration = {
  version: 1;
  kind: "sprite-gen-curation";
  pixel_perfect?: boolean;
  states: Record<string, SpriteCurationState>;
};

export function resolveSpriteRunDir(generatedDir: string, runId: unknown): string;
export function normalizeSpriteTransform(input: unknown): SpriteFrameTransform;
export function resolveSpriteStatePlan(
  curation: SpriteCuration | null,
  state: string,
  defaultCount: number,
): { ordered: number[]; transforms: Map<number, SpriteFrameTransform> };
export function readSpriteCuration(generatedDir: string, runId: string): Promise<SpriteCuration | null>;
export function writeSpriteCuration(
  generatedDir: string,
  runId: string,
  input: SpriteCuration,
): Promise<void>;
```

`writeSpriteCuration`은 validate 후 `atomicWriteJson(<run>/curation.json, input)`을 await한다.
실패 시 5xx로 전파하며 성공 응답이나 best-effort warning으로 바꾸지 않는다.

### 수용 테스트

- 저장 전/후 모든 `frames/**/*.png` SHA-256가 동일하다.
- curation write→read deep equality 및 atomic temp file 잔존 없음.
- 누락 sidecar/state/selected/deleted/transform의 기본값이 sprite-gen과 동일하다.
- 중복·범위 밖·deleted index는 sprite-gen `state_plan`과 같은 결과를 낸다.
- `selected: []`는 빈 animation이 아니라 non-deleted 전체 선택으로 해석한다.

## 030-3 — Atlas와 contact sheet compose

`sharp`는 이미 필수 의존성이다(`package.json:78-100`). 기존 정적 처리 관례는
`lib/imageThumb.ts:17-33`, generated PNG+sidecar 저장은
`lib/canvasVersionStore.ts:117-125`를 따른다.

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `lib/spriteAtlasCompose.ts` | fixed-cell affine 적용과 atlas composite |
| NEW | `lib/spriteAtlasExport.ts` | contact sheet/report 저장 |
| NEW | `tests/sprite-atlas-compose.test.ts` | geometry, alpha, provenance, 원본 불변 |
| NEW | `tests/sprite-atlas-export.test.ts` | contact sheet 크기/셀 배치 |

```ts
export async function composeSpriteAtlas(input: SpriteAtlasComposeInput): Promise<{
  manifest: SpriteGenManifest;
  report: SpriteAtlasReport;
}>;
export async function composeContactSheet(input: ContactSheetInput): Promise<void>;
```

- transparent RGBA sheet를 만들고 선택된 state/frame 순서대로 `sharp.composite()`한다.
- transform은 원본에 쓰지 않고 셀 크기 buffer로 렌더한 뒤 합성한다.
- output은 temp file에 완성 후 rename한다. manifest/report는 이미지 성공 후 기록한다.
- `frame_layout`은 실제 composite 좌표에서 생성하며 alpha/grid 추론으로 보정하지 않는다.

## 030-4 — Import/unpack API

현재 `/api/assets/derived`는 raw PNG 하나, 기존 source, `keyed-png`만 허용한다
(`routes/assetDerived.ts:14-16`, `routes/assetDerived.ts:37-69`). 클라이언트도 kind를
고정한다(`ui/src/lib/api-assets.ts:68-89`). 따라서 storage/asset 등록 관례만 재사용하고
atlas API는 분리한다.

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `lib/spriteAtlasImport.ts` | atlas+manifest 검증 및 run 생성 |
| NEW | `lib/spriteAtlasUnpack.ts` | explicit rect crop과 frame tree 생성 |
| NEW | `routes/spriteAtlas.ts` | read/save/bake/import/unpack/export routes |
| MODIFY | `routes/index.ts` | `registerSpriteAtlasRoutes(app, ctx)` 등록 |
| NEW | `tests/sprite-atlas-import.test.ts` | import 성공/거부/cleanup |
| NEW | `tests/sprite-atlas-unpack.test.ts` | rect 우선 crop과 metadata 복원 |

### API 표면

| Method | Path | 입력 | 결과 |
|---|---|---|---|
| POST | `/api/sprite-atlas/import` | manifest JSON + atlas PNG | run 생성, 대표 image asset 등록 |
| GET | `/api/sprite-atlas/:runId` | runId | manifest, curation, file URLs |
| PUT | `/api/sprite-atlas/:runId/curation` | `SpriteCuration` | atomic 저장 |
| POST | `/api/sprite-atlas/:runId/unpack` | 없음 | `frames/<state>/` 복원 |
| POST | `/api/sprite-atlas/:runId/bake` | 없음 | atlas/manifest/report 재생성 |
| POST | `/api/sprite-atlas/:runId/export/contact-sheet` | state/options | PNG path |
| POST | `/api/sprite-atlas/:runId/export/gif` | state/options | GIF path + QA report |

```ts
export function registerSpriteAtlasRoutes(app: Express, ctx: RouteRuntimeContext): void;
export function importSpriteAtlas(input: SpriteAtlasImportInput): Promise<SpriteAtlasImportResult>;
export function unpackSpriteAtlas(input: SpriteAtlasUnpackInput): Promise<SpriteAtlasUnpackResult>;
```

Import는 manifest와 atlas를 모두 검증한 뒤 temp run을 최종 runId로 rename한다. 중간 실패는
temp run만 삭제하고 기존 run을 건드리지 않는다. 대표 atlas는 `kind: "image"` asset으로
등록하고 metadata에 `spriteRunId`, `manifestPath`, `derivedKind: "sprite-atlas"`를 둔다.

## 030-5 — 투명 GIF와 재검증

복잡한 미디어 파생은 ffmpeg `execFile`, timeout, ENOENT, abort 패턴을 이미 사용한다
(`lib/videoChromaKey.ts:79-130`). npm GIF encoder는 추가하지 않는다.

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `lib/spriteGifExport.ts` | ffmpeg encode, disposal 2, decode QA |
| NEW | `tests/sprite-gif-export.test.ts` | args, ENOENT, alpha/disposal 검증 |

```ts
export function buildTransparentGifArgs(input: SpriteGifInput): string[];
export async function exportTransparentGif(
  input: SpriteGifInput,
  options?: { signal?: AbortSignal; execFileImpl?: typeof execFile },
): Promise<SpriteGifValidationReport>;
```

- frame PNG sequence를 ffmpeg palette/filter 경로로 encode한다.
- loop/fps를 state manifest에서 상속하되 요청 override를 report에 기록한다.
- disposal method 2와 frame transparency를 출력 metadata/decoded frames로 재검증한다.
- checkerboard preview는 QA 산출물일 뿐 alpha 원본에 bake하지 않는다.
- 검증 실패 시 GIF를 성공 산출물로 등록하지 않고 오류와 report를 반환한다.

## 조건부 경로 활성화 시나리오

| 조건 | 기대 동작 | 반드시 남길 증거 |
|---|---|---|
| ffmpeg 부재 | GIF route 503/명시 code, atlas/contact sheet는 정상 | ENOENT 주입 테스트가 오류 code와 미등록을 관찰 |
| manifest 없는 import | 400 `SPRITE_MANIFEST_REQUIRED`, auto-detect 금지 | atlas-only request가 temp/output/DB row를 만들지 않음 |
| `pixel_perfect: false`인데 `.plain.png` 부재 | bake 409/명시 code, pixel frame으로 fallback 금지 | missing fixture가 compose 진입 후 실패하고 기존 atlas가 불변 |
| GIF disposal/alpha 재검증 실패 | export 실패, asset 미등록 | decode verifier fault injection과 report assertion |
| rect가 sheet bounds 밖 | import/unpack 거부 | path 생성 전 validation error assertion |

## 전체 변경 목록

NEW:

- `lib/spriteAtlasTypes.ts`
- `lib/spriteAtlasManifest.ts`
- `lib/spriteRunPath.ts`
- `lib/spriteCurationStore.ts`
- `lib/spriteAtlasCompose.ts`
- `lib/spriteAtlasExport.ts`
- `lib/spriteAtlasImport.ts`
- `lib/spriteAtlasUnpack.ts`
- `lib/spriteGifExport.ts`
- `routes/spriteAtlas.ts`
- `tests/fixtures/sprite-gen/manifest.json`
- `tests/sprite-atlas-manifest.test.ts`
- `tests/sprite-run-path.test.ts`
- `tests/sprite-curation-store.test.ts`
- `tests/sprite-atlas-compose.test.ts`
- `tests/sprite-atlas-export.test.ts`
- `tests/sprite-atlas-import.test.ts`
- `tests/sprite-atlas-unpack.test.ts`
- `tests/sprite-gif-export.test.ts`

MODIFY:

- `routes/index.ts`
- `docs/migration/runtime-test-inventory.md` (`npm run test:inventory` 생성물)

DELETE: 없음.

## 구현 순서와 완료 게이트

1. 스키마 왕복: fixture 및 unknown-field 불변을 먼저 잠근다.
2. 스토리지: run path, atomic curation, frame byte 불변을 잠근다.
3. Compose: sharp atlas/contact sheet와 manifest geometry를 잠근다.
4. API: temp-run import, explicit-rect unpack, route/asset 등록을 연결한다.
5. GIF: ffmpeg encode와 decode 재검증을 마지막으로 추가한다.

검증 명령:

```bash
npm run typecheck
npm run typecheck:tests
node --test tests/sprite-atlas-manifest.test.ts tests/sprite-run-path.test.ts tests/sprite-curation-store.test.ts
node --test tests/sprite-atlas-compose.test.ts tests/sprite-atlas-export.test.ts
node --test tests/sprite-atlas-import.test.ts tests/sprite-atlas-unpack.test.ts tests/sprite-gif-export.test.ts
npm run test:inventory
```

완료 조건은 manifest/curation 왕복 불변, frame SHA-256 불변, explicit rect 소비,
세 조건부 경로의 실제 활성화 증거, 전체 타입체크와 inventory 통과다.
