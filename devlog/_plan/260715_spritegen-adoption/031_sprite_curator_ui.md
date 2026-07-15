# 031 — Sprite curator UI

상태: diff-level 설계 (WP6 구현 사이클에서 소비)

## 목표와 경계

`030_atlas_manifest_curator_ux.md`의 manifest/run/curation API 위에 React 큐레이터를
구현한다. 상태별 sequence와 candidate pool을 편집하고, sprite-gen과 같은 affine으로
프리뷰하며, 비파괴 curation 저장과 서버 bake/export를 호출한다.

- 포함: editor modal, atlas frame preview, rail DnD/selection, playback, transform controls,
  Lightbox 진입점, store target, API client, i18n/CSS/a11y.
- 제외: manifest parsing, curation normalization, image compose, GIF encode는 030 소유다.
- 제외: Python curator UI의 DOM/CSS 직접 이식.

## 소유 위치 결정

`SpriteCuratorPanel`은 `KeyingPanel`의 형제 modal로 둔다.

근거:

- `ui/src/components/assetgen/KeyingPanel.tsx:34-55` — 전역 target과 canvas/rAF,
  저장 상태를 소유하는 독립 editor 패턴.
- `ui/src/components/assetgen/KeyingPanel.tsx:69-149` — offscreen image load와 rAF cleanup.
- `ui/src/components/assetgen/KeyingPanel.tsx:184-260` — 저장/오류/파생 asset 반영.
- `ui/src/components/assetgen/AssetMediaLightbox.tsx:30-44` — Lightbox가 editor를 여는 gateway.
- `ui/src/components/assetgen/AssetMediaLightbox.tsx:57-133` — 단일 media viewer이며 장기
  편집 상태의 소유자가 아님.
- `ui/src/components/assetgen/AssetGenWorkspace.tsx:159-217` — tile, Lightbox,
  KeyingPanel의 실제 mount 지점.
- `ui/src/store/storeTypes.ts:234-240`, `ui/src/store/useAppStore.ts:176-185` — editor는
  target만 store에 두고 세부 편집 state는 panel에 둔 기존 규약.

## 고정 UX/데이터 계약

sprite-gen 근거:

- `/tmp/sprite-gen/sprite_gen/curation.py:15-53` — `selected`, `deleted`, `order`,
  `transforms`, `pixel_perfect` 의미.
- `/tmp/sprite-gen/sprite_gen/curation.py:103-128` — transform 기본값과 identity 판정.
- `/tmp/sprite-gen/sprite_gen/curation.py:149-166` — 정확한 forward matrix 순서.
- `/tmp/sprite-gen/sprite_gen/curation.py:169-212` — bake는 `selected`를 읽고
  `order`를 무시함.
- `/tmp/sprite-gen/scripts/curator/curator.js:147-176` — sequence/candidate 2단 구조.
- `/tmp/sprite-gen/scripts/curator/curator.js:332-360` — 이동과 reorder.
- `/tmp/sprite-gen/scripts/curator/curator.js:717-830` — canvas+rAF playback.

필수 의미 분리:

- `selected`: bake/play 순서. sequence rail에 있는 frame index 배열.
- `order`: sequence 다음 candidate pool까지 포함한 전체 표시 순서. reload 복원용.
- `deleted`: 두 rail 모두에서 숨기고 bake에서도 제외하지만 원본 PNG는 삭제하지 않음.
- candidate pool: 탈락 후보 보존 영역이며 `order`에는 포함되고 `selected`에는 포함되지 않음.
- `selected: []`: sprite-gen에서 전체 non-deleted 선택을 뜻하므로 UI가 “빈 sequence”를
  저장하지 않는다. 마지막 selected 제거는 막거나 명시 확인 후 deleted 정책으로 전환한다.

## 031-1 — Types, API client, editor target

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `ui/src/types/spriteAtlas.ts` | 030 wire DTO와 UI draft 타입 |
| NEW | `ui/src/lib/api-sprite-atlas.ts` | get/save/bake/unpack/export client |
| MODIFY | `ui/src/store/storeTypes.ts` | `spriteCuratorTarget`와 setter |
| MODIFY | `ui/src/store/useAppStore.ts` | target 초기값/전환 action |

```ts
export type SpriteCuratorTarget = {
  runId: string;
  atlasFile: string;
  manifestFile: string;
  projectId?: string | null;
};
export type SpriteCuratorDraft = {
  activeState: string;
  curation: SpriteCuration;
  dirty: boolean;
};

export function getSpriteAtlasRun(runId: string): Promise<SpriteAtlasRunDto>;
export function saveSpriteCuration(runId: string, curation: SpriteCuration): Promise<void>;
export function bakeSpriteAtlas(runId: string): Promise<SpriteBakeResult>;
export function exportSpriteContactSheet(runId: string, state: string): Promise<SpriteExportResult>;
export function exportSpriteGif(runId: string, state: string): Promise<SpriteExportResult>;
```

store에는 `spriteCuratorTarget: SpriteCuratorTarget | null`과
`setSpriteCuratorTarget(target)`만 추가한다. active state, playback, rail ordering,
transform draft, saving/error는 panel/hook local state다.

## 031-2 — SpriteCuratorPanel

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `ui/src/components/assetgen/SpriteCuratorPanel.tsx` | modal shell, load/save/bake/export orchestration |
| NEW | `ui/src/components/assetgen/useSpriteCurator.ts` | draft reducer, dirty state, API lifecycle |
| MODIFY | `ui/src/components/assetgen/AssetGenWorkspace.tsx` | panel 형제 mount |
| MODIFY | `ui/src/components/assets/AssetsWorkspace.tsx` | Assets 화면에서도 같은 panel mount/refresh |

```ts
export function SpriteCuratorPanel(): JSX.Element | null;
export function useSpriteCurator(target: SpriteCuratorTarget | null): {
  run: SpriteAtlasRunDto | null;
  draft: SpriteCuratorDraft | null;
  status: "idle" | "loading" | "ready" | "saving" | "baking" | "error";
  error: string | null;
  dispatch(action: SpriteCuratorAction): void;
  save(): Promise<void>;
  bake(): Promise<void>;
};
```

Panel layout:

1. header: run/character 이름, state picker, dirty/save status, close.
2. stage: `SpriteSequencePreview`, grid toggle, play/pause, step, speed 0.25–4x.
3. transform inspector: selected frame의 rotate/scale/dx/dy/shx/shy/flipX.
4. sequence rail: 실제 play/bake 순서.
5. candidate rail: 보존된 비선택 frame.
6. footer: save curation, bake atlas, contact sheet/GIF export.

닫기/Escape/backdrop 시 dirty이면 discard 확인을 거친다. 저장 실패는 modal을 닫지 않고
server error를 유지한다. save 성공과 bake 성공을 구분하며, save만으로 원본/atlas가
변경되었다고 표시하지 않는다.

## 031-3 — Sequence preview와 playback

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `ui/src/components/assetgen/SpriteSequencePreview.tsx` | atlas rect crop, transform, grid canvas render |
| NEW | `ui/src/components/assetgen/useSpritePlayback.ts` | rAF clock와 frame index |
| NEW | `tests/asset-gen-sprite-playback-contract.test.js` | lifecycle/속도/loop source contract |

```ts
export function SpriteSequencePreview(props: {
  atlasUrl: string;
  frames: Array<{ frameIndex: number; rect: SpriteFrameRect }>;
  cell: { width: number; height: number };
  transforms: Record<string, Partial<SpriteFrameTransform>>;
  currentFrame: number;
  showGrid: boolean;
}): JSX.Element;

export function useSpritePlayback(input: {
  frameCount: number;
  fps: number;
  loop: boolean;
  speed: number;
  playing: boolean;
}): { frame: number; seek(index: number): void; step(delta: -1 | 1): void };
```

rAF 규칙:

- timestamp와 accumulator는 ref에 저장한다.
- 매 rAF tick마다 React state를 갱신하지 않는다.
- `accumulator >= 1000 / (fps * speed)`이고 계산된 frame index가 현재와 다를 때만
  `setFrame(next)`를 호출한다.
- 긴 background gap은 elapsed를 clamp하고 한 tick에서 무제한 catch-up하지 않는다.
- `playing`, state, frameCount 변경 및 unmount 시 이전 rAF를 취소한다.
- `loop: false`는 마지막 frame에서 정지하고 playing 상태를 false로 전환한다.

Canvas는 atlas를 한 번 decode/cache하고 `drawImage(atlas, sx, sy, sw, sh, ...)`로
명시 rect만 샘플링한다. alpha/grid 추론은 하지 않는다.

## 031-4 — Rail과 curation 편집

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `ui/src/components/assetgen/SpriteFrameRail.tsx` | sequence/candidate 렌더, keyboard/DnD reorder |
| NEW | `tests/asset-gen-sprite-rail-contract.test.js` | order/selected/deleted 의미와 a11y |

```ts
export function SpriteFrameRail(props: {
  kind: "sequence" | "candidates";
  frames: SpriteFrameView[];
  activeFrameIndex: number | null;
  onActivate(frameIndex: number): void;
  onReorder(frameIndex: number, beforeFrameIndex: number | null): void;
  onMove(frameIndex: number, destination: "sequence" | "candidates"): void;
  onDelete(frameIndex: number): void;
}): JSX.Element;
```

Reducer invariant:

```ts
selected = sequence.map((frame) => frame.index);
order = [...sequence, ...candidates].map((frame) => frame.index);
```

- sequence 내부 reorder는 `selected`와 `order`의 sequence prefix를 함께 변경한다.
- candidate 내부 reorder는 `order`만 변경한다.
- rail 간 이동은 selected membership과 order를 함께 변경한다.
- delete는 `deleted`에 추가하고 양 rail에서 제거한다. 복원은 원본 frame index로 가능하다.
- pointer DnD 외에 키보드 Move left/right, Move to sequence/candidates action을 제공한다.

## 031-5 — Transform parity와 drift 방지

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| NEW | `ui/src/lib/spriteTransform.ts` | sprite-gen forward matrix 단일 구현 |
| NEW | `tests/sprite-transform-contract.test.ts` | Python golden matrix/point parity |

```ts
export function normalizeSpriteTransform(input: Partial<SpriteFrameTransform>): SpriteFrameTransform;
export function spriteTransformMatrix(t: SpriteFrameTransform): {
  m00: number; m01: number; m10: number; m11: number;
};
export function toCanvasTransform(
  t: SpriteFrameTransform,
  source: { width: number; height: number },
  cell: { width: number; height: number },
): DOMMatrix;
```

행렬 계약은 `/tmp/sprite-gen/sprite_gen/curation.py:149-166`을 그대로 따른다.

```text
M = Rotate · Shear · Scale · FlipX
m00 = s * (cos(r) + sin(r) * shy)
m01 = s * (cos(r) * shx + sin(r))
m10 = s * (-sin(r) + cos(r) * shy)
m11 = s * (cos(r) - sin(r) * shx)
flipX이면 m00, m10의 부호를 반전
```

- 화면 좌표는 y-down이다. 양의 `rotate`는 sprite-gen 정의상 시각적으로 반시계 방향이
  되도록 위 식의 `m10` 부호를 유지한다.
- transform 중심은 source center, 출력 중심은 `cell center + (dx,dy)`다
  (`/tmp/sprite-gen/sprite_gen/curation.py:232-245`).
- CSS transform 문자열을 별도로 조합하지 않는다. preview canvas와 thumbnail overlay는
  모두 `spriteTransformMatrix` 결과를 소비한다.
- 서버 bake도 같은 순서와 중심 계약을 golden fixture로 검증한다. UI 눈대중 허용오차로
  drift를 승인하지 않는다.
- Python golden transforms(identity, rotate, shear, scale, flipX, combined)에 대해 matrix
  계수와 기준점 변환을 epsilon 내 비교한다.

## 031-6 — Lightbox 진입, i18n, CSS

### 파일 diff

| 작업 | 경로 | 책임 |
|---|---|---|
| MODIFY | `ui/src/components/assetgen/AssetMediaLightbox.tsx` | sprite run이면 Curate action 노출 |
| MODIFY | `ui/src/components/assetgen/AssetGenWorkspace.tsx` | tile 진입 및 panel mount |
| MODIFY | `ui/src/components/assets/AssetsWorkspace.tsx` | library asset 진입 및 저장 후 refresh |
| MODIFY | `ui/src/store/storeTypes.ts` | target 타입/action |
| MODIFY | `ui/src/store/useAppStore.ts` | target state/action |
| MODIFY | `ui/src/i18n/en.json` | curator 영문 문구 |
| MODIFY | `ui/src/i18n/ko.json` | curator 한국어 문구 |
| MODIFY | `ui/src/styles/assetgen-workspace.css` | modal/stage/rails/반응형 |
| NEW | `tests/asset-gen-sprite-curator-contract.test.js` | mount/Lightbox/save/bake source contract |
| MODIFY | `tests/asset-gen-media-lightbox-contract.test.js` | Curate 진입 회귀 |

Lightbox는 asset metadata의 `spriteRunId`와 `manifestPath`가 모두 있을 때만 Curate를
표시한다. 클릭 시 `setSpriteCuratorTarget(...)` 후 Lightbox를 닫는다. 일반 이미지와
기존 keying action은 변하지 않는다.

CSS/a11y 계약:

- 기존 assetgen modal z-index/backdrop/focus-trap 관례를 재사용한다.
- desktop은 stage+inspector와 rails, 좁은 화면은 단일 column과 horizontal rail scroll.
- canvas는 nearest-neighbor 표시(`image-rendering: pixelated`)를 지원하되 원본 bake에 영향 없음.
- 모든 transform input은 label, 현재값, keyboard 조작을 제공한다.
- frame tile은 선택/rail 위치를 시각 정보뿐 아니라 `aria-selected`와 label로 전달한다.
- `prefers-reduced-motion`에서도 수동 step은 가능하고 autoplay 기본값은 off로 둔다.

## 전체 변경 목록

NEW:

- `ui/src/types/spriteAtlas.ts`
- `ui/src/lib/api-sprite-atlas.ts`
- `ui/src/lib/spriteTransform.ts`
- `ui/src/components/assetgen/SpriteCuratorPanel.tsx`
- `ui/src/components/assetgen/SpriteSequencePreview.tsx`
- `ui/src/components/assetgen/SpriteFrameRail.tsx`
- `ui/src/components/assetgen/useSpritePlayback.ts`
- `ui/src/components/assetgen/useSpriteCurator.ts`
- `tests/asset-gen-sprite-curator-contract.test.js`
- `tests/asset-gen-sprite-playback-contract.test.js`
- `tests/asset-gen-sprite-rail-contract.test.js`
- `tests/sprite-transform-contract.test.ts`

MODIFY:

- `ui/src/components/assetgen/AssetMediaLightbox.tsx`
- `ui/src/components/assetgen/AssetGenWorkspace.tsx`
- `ui/src/components/assets/AssetsWorkspace.tsx`
- `ui/src/store/storeTypes.ts`
- `ui/src/store/useAppStore.ts`
- `ui/src/i18n/en.json`
- `ui/src/i18n/ko.json`
- `ui/src/styles/assetgen-workspace.css`
- `tests/asset-gen-media-lightbox-contract.test.js`
- `docs/migration/runtime-test-inventory.md` (`npm run test:inventory` 생성물)

DELETE: 없음.

## 구현 순서와 완료 게이트

1. DTO/API/store target.
2. `spriteTransform` Python golden parity.
3. playback hook와 canvas preview.
4. sequence/candidate rails와 reducer invariant.
5. panel save/bake/export orchestration.
6. Lightbox/Assets 진입, i18n, CSS/a11y.

검증 명령:

```bash
npm run typecheck:tests
npm run ui:build
node --test tests/sprite-transform-contract.test.ts
node --test tests/asset-gen-sprite-playback-contract.test.js tests/asset-gen-sprite-rail-contract.test.js
node --test tests/asset-gen-sprite-curator-contract.test.js tests/asset-gen-media-lightbox-contract.test.js
npm run test:inventory
```

완료 조건은 Python golden transform parity, rAF state-update 제한, `order`/`selected`
왕복 분리, dirty-close 보호, Lightbox 조건부 진입, keyboard rail 조작, production UI build 통과다.
