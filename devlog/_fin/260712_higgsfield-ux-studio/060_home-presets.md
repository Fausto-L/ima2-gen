---
created: 2026-07-12
tags: [ima2-gen, phase, home, presets]
---

# Phase 060 — 홈 진입면 + 프리셋 시스템

스펙: `003_home-presets.md` 전체. 020의 `Chip`/`ChipRow`와 050의 저장
계층 위에 얹는다. 이 레인의 체감 정점.

## 범위

1. `lib/presetCompiler.ts` — 프리셋 → 프로바이더별 프롬프트 조각/파라미터
   컴파일(순수 함수).
2. 시드 프리셋: 카메라 모션 ~20 / 스타일 ~15 / 조명 ~10 (JSON 시드).
   미리보기 썸네일·영상은 ima2 자체 생성으로 제작.
3. 컴포저 프리셋 칩(020 Chip 재사용) — 본문과 분리 저장, 생성 시 컴파일,
   XMP에 `presetIds` 기록.
4. `#home` 워크스페이스(레일 슬롯 활성화): 프롬프트 박스 + 프리셋 그리드 +
   최근 이어가기 스트립.
5. 미결정: 홈을 기본 진입 모드로 할지(현행 classic 유지 vs 홈) — 090 원장.

## Done 기준

- 컴파일러 프리셋×프로바이더 스냅샷 테스트 + 칩 저장/복원 계약.
- 동일 프리셋 Grok/Gemini 실생성 비교 수동 검수 1회 → `assets/060/`.

상태: 구현 완료 — closeout 잔여 (generatePipeline presetIds→XMP meta 전달)

## 2026-07-15 현재 코드 상태 (sol 탐색 기반)

Phase 060의 거의 모든 계획이 이미 구현되어 있다.

### 구현 완료 항목
- `lib/presetCompiler.ts` — catalog/mode/provider 컴파일, provider별 fragments/params, applied IDs 지원
- `presets/camera-motion.json`, `presets/style.json`, `presets/lighting.json` — seed JSON 3종 존재
- `ui/src/lib/presets.ts` — 브라우저용 catalog 조회 (계획명 `presetCatalog.ts` → 실제 `presets.ts`)
- `ui/src/store/storePresetImpl.ts` — Zustand 슬라이스 존재, 선택 CRUD/restore 동작
- `ui/src/store/storePersistence.ts` — preset ID 영속화, catalog 대조 검증/중복 제거
- `ui/src/components/home/HomeWorkspace.tsx` — `#home` 워크스페이스 lazy-loaded
- `ui/src/components/PromptComposer.tsx` — selectedPresetIds 읽기, Chip/ChipRow 렌더 통합
- `ui/src/components/NavRail.tsx` — `#home` hash 및 Home rail item 존재
- `ui/src/App.tsx` — `uiMode === "home"` 렌더 분기 존재
- `ui/src/store/storeGenImpl.ts` — 생성 시 preset 컴파일 + appliedPresetIds 전송 (계획명 `storeGenerateImpl.ts` → 실제 `storeGenImpl.ts`)
- `lib/imageMetadata.ts` — XMP payload에 `presetIds` 필드 및 stringArray 정규화 존재

### 미완: XMP 전파 갭 1건
- `lib/generatePipeline.ts` (line ~345): meta 객체 구성 시 `presetIds`를 포함하지 않음. XMP 스키마는 준비되어 있으나 파이프라인이 값을 전달하지 않는다. WP-1에서 수정.

## Diff-Level Implementation Spec

### Server / domain

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `lib/presetCompiler.ts` | `compilePresets()` 순수 함수. 선택 순서를 유지해 fragment를 결합하고, provider override와 params를 충돌 규칙에 따라 병합한다. | +160 |
| NEW | `presets/camera-motion.json` | dolly/orbit/crane/fpv 등을 포함한 카메라 모션 시드 약 20개와 provider별 fragment/배타 그룹을 정의한다. | +350 |
| NEW | `presets/style.json` | 스타일 시드 약 15개와 미리보기 자산 메타데이터를 정의한다. | +260 |
| NEW | `presets/lighting.json` | 조명 시드 약 10개와 provider별 prompt fragment를 정의한다. | +180 |
| MODIFY | `routes/generate.ts` | 요청의 `presetIds`를 정규화하고 generation context로 전달한다. 알 수 없는 ID와 중복 ID 처리 계약을 고정한다. | +15 |
| MODIFY | `routes/video.ts` | 비디오 생성 context/sidecar에 `presetIds`를 전달·저장한다. | +20 |
| MODIFY | `lib/imageMetadata.ts` | 이미지 XMP 직렬화/복원 payload에 순서가 보존된 `presetIds`를 추가한다. | +14 |

### Frontend

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `ui/src/lib/presets.ts` | 브라우저용 프리셋 catalog와 `getPresetById`, `getPresetsByCategory` 조회 함수를 제공한다. | +60 |
| NEW | `ui/src/store/storePresetImpl.ts` | 선택 순서 보존, ID 중복 방지, mode별 defaults 저장/복원을 담당한다. | +75 |
| NEW | `ui/src/components/home/HomeWorkspace.tsx` | prompt-first composer, 프리셋 grid, 최근 이어가기 strip을 조합하는 `#home` 워크스페이스를 구현한다. | +130 |
| NEW | `ui/src/components/home/PresetGrid.tsx` | category/mode별 프리셋 grid, 선택 상태, hover preview video를 구현한다. | +160 |
| NEW | `ui/src/components/home/HomePromptComposer.tsx` | 홈 전용 대형 textarea와 Generate 진입 동작을 구현한다. | +75 |
| NEW | `ui/src/styles/home-workspace.css` | 반응형 grid, hover video, embedded recent strip과 홈 composer 레이아웃을 정의한다. | +270 |
| MODIFY | `ui/src/components/PromptComposer.tsx` | 020의 `ChipRow`를 재사용해 본문과 분리된 프리셋 chip row와 제거 동작을 추가한다. | +45 |
| MODIFY | `ui/src/components/VideoControlsPanel.tsx` | 비디오에서 사용할 프리셋 선택 상태를 노출하고 컴파일 입력으로 연결한다. 모션 전용 UX는 080에서 확장한다. | +25 |
| MODIFY | `ui/src/store/storeGenerateImpl.ts` | 생성 직전에 선택된 프리셋을 컴파일하고 `presetIds`와 병합 params를 요청에 싣는다. | +45 |
| MODIFY | `ui/src/store/storeVideoImpl.ts` | video mode용 프리셋 컴파일 결과와 `presetIds`를 비디오 요청에 전달한다. | +45 |
| MODIFY | `ui/src/App.tsx` | `HomeWorkspace`를 lazy-load하고 `uiMode === "home"` 렌더 분기를 추가한다. | +25 |
| MODIFY | `ui/src/components/NavRail.tsx` | `#home` hash와 Home rail item을 추가하되 기본 진입 모드 결정은 090까지 보류한다. | +25 |
| MODIFY | `ui/src/types.ts` | preset catalog, 선택 상태, generation/video request의 `presetIds` 타입을 추가한다. | +25 |

### Tests

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `tests/preset-compiler.test.ts` | 프리셋×provider snapshot, 선택 순서, override/params 병합, 중복·미등록 ID 계약을 검증한다. | +220 |
| NEW | `tests/preset-restore-contract.test.ts` | chip 저장/복원과 XMP `presetIds` 왕복, image/video sidecar 보존을 검증한다. | +120 |

### Done criteria

- 프리셋×provider 컴파일러 snapshot과 chip 저장/복원 계약 테스트가 통과한다.
- 동일 프리셋으로 Grok/Gemini 실생성을 각 1회 비교 검수하고 결과를 `assets/060/`에 남긴다.
- 홈을 기본 진입 모드로 할지는 구현에서 확정하지 않고 090 미결정 원장에 유지한다.

### Dependencies on prior phases

- 020의 `Chip`/`ChipRow`와 통일 컨트롤 계약을 재사용한다.
- 030의 NavRail/hash routing 슬롯 위에 `#home`을 추가한다.
- 040의 최근 결과 체이닝 데이터를 홈의 이어가기 strip에서 소비한다.
- 050의 Assets 저장 계층과 metadata/sidecar 왕복 계약을 사용한다.

## 구현 파일 명세표

아래 표는 현재 저장소의 실제 소유 파일을 기준으로 한다. `.js` 파일은 TypeScript 빌드 산출물이므로 직접 편집하지 않는다.

| Op | 경로 | 책임 | 예상 LOC |
|---|---|---|---:|
| NEW | `lib/presetCompiler.ts` | catalog 조회, provider override, fragment/params 컴파일 | 190 |
| NEW | `presets/camera-motion.json` | 카메라 모션 seed와 배타 그룹 | 360 |
| NEW | `presets/style.json` | 스타일 seed와 preview metadata | 270 |
| NEW | `presets/lighting.json` | 조명 seed와 provider override | 190 |
| NEW | `ui/src/lib/presetCatalog.ts` | seed 조회, category/mode filter | 90 |
| NEW | `ui/src/store/storePresetImpl.ts` | 선택/복원 action 구현 | 120 |
| NEW | `ui/src/components/home/HomeWorkspace.tsx` | home 조합 root | 160 |
| NEW | `ui/src/components/home/HomePromptComposer.tsx` | prompt-first 입력과 생성 진입 | 100 |
| NEW | `ui/src/components/home/PresetGrid.tsx` | 접근 가능한 preset grid | 190 |
| NEW | `ui/src/components/home/PresetCard.tsx` | thumbnail/video preview 카드 | 120 |
| NEW | `ui/src/styles/home-workspace.css` | home 전용 responsive layout | 260 |
| MODIFY | `routes/generate.ts` | `presetIds` 입력 정규화 | 20 |
| MODIFY | `routes/video.ts` | video request에 preset context 전달 | 24 |
| MODIFY | `lib/generatePipeline.ts` | 서버 최종 컴파일과 metadata 전달 | 35 |
| MODIFY | `lib/multimodePipeline.ts` | variant별 동일 catalog snapshot 적용 | 30 |
| MODIFY | `lib/imageMetadataStore.ts` | XMP `presetIds` 왕복 | 24 |
| MODIFY | `ui/src/components/PromptComposer.tsx` | preset chip row와 제거 action | 55 |
| MODIFY | `ui/src/components/VideoControlsPanel.tsx` | motion category 진입점 | 25 |
| MODIFY | `ui/src/components/NavRail.tsx` | `#home` rail item | 24 |
| MODIFY | `ui/src/App.tsx` | lazy home workspace route | 28 |
| MODIFY | `ui/src/types.ts` | request/metadata preset types | 35 |
| MODIFY | `ui/src/store/storeTypes.ts` | preset state/action contract | 50 |
| MODIFY | `ui/src/store/useAppStore.ts` | slice action binding | 24 |
| MODIFY | `ui/src/store/storePersistence.ts` | 선택 ID persistence | 32 |
| MODIFY | `ui/src/store/persistenceRegistry.ts` | versioned persisted key 등록 | 12 |
| MODIFY | `ui/src/store/storeGenImpl.ts` | image generation payload 연결 | 30 |
| MODIFY | `ui/src/store/storeGenerateEntryImpl.ts` | 진입 시 snapshot 고정 | 22 |
| MODIFY | `ui/src/store/storeVideoImpl.ts` | video payload 연결 | 32 |
| NEW | `tests/preset-compiler.test.ts` | compiler matrix | 260 |
| NEW | `tests/preset-restore-contract.test.ts` | persistence/XMP round-trip | 160 |
| NEW | `tests/home-presets-ui-contract.test.js` | lazy route와 a11y 정적 계약 | 110 |

### 파일 경계 원칙

- catalog JSON은 데이터만 가진다.
- 컴파일 규칙은 `lib/presetCompiler.ts`만 소유한다.
- 브라우저는 선택 ID만 영속화한다.
- 요청 시점의 catalog 해석은 서버가 최종 권위자다.
- UI catalog는 표시용이며 보안 경계가 아니다.
- `prompt` 원문은 사용자 입력만 보존한다.
- `composerPrompt`는 생성 직전 합성 결과다.
- seed asset 생성물은 source JSON과 분리한다.
- 알 수 없는 ID는 조용히 버리지 않는다.
- 기본 home 진입 여부는 이 phase에서 바꾸지 않는다.

## presetCompiler 상세 설계

### 공개 타입

```ts
export type PresetCategory =
  | "camera-motion"
  | "style"
  | "vfx"
  | "lighting";

export type PresetMode = "image" | "video" | "edit";

export type PresetProvider = "gpt" | "gemini" | "grok";

export type PresetParamValue = string | number | boolean;

export type PresetParams = Record<string, PresetParamValue>;

export interface PresetProviderOverride {
  fragment?: string;
  params?: PresetParams;
}

export interface PresetDefinition {
  id: string;
  name: string;
  category: PresetCategory;
  thumb: string;
  previewVideo?: string;
  promptFragment: string;
  perProvider?: Partial<Record<PresetProvider, PresetProviderOverride>>;
  modes: PresetMode[];
  exclusiveGroup?: string;
  tags?: string[];
  version: 1;
}

export interface PresetCatalog {
  version: 1;
  presets: PresetDefinition[];
}

export interface CompilePresetsInput {
  presetIds: readonly string[];
  provider: PresetProvider;
  mode: PresetMode;
  catalog: ReadonlyMap<string, PresetDefinition>;
  baseParams?: Readonly<PresetParams>;
  unknownIdPolicy?: "error" | "collect";
}

export interface CompiledPresetFragment {
  presetId: string;
  category: PresetCategory;
  text: string;
  source: "default" | "provider-override";
}

export interface CompilePresetsOutput {
  presetIds: string[];
  fragments: CompiledPresetFragment[];
  promptFragment: string;
  params: PresetParams;
  unknownIds: string[];
}

export class UnknownPresetIdError extends Error {
  readonly code = "UNKNOWN_PRESET_ID";
  constructor(readonly presetIds: string[]) {
    super(`Unknown preset ids: ${presetIds.join(", ")}`);
  }
}

export function compilePresets(
  input: CompilePresetsInput,
): CompilePresetsOutput;
```

### 컴파일 불변식

1. 입력 ID의 최초 등장 순서를 보존한다.
2. 같은 ID의 두 번째 등장은 제거한다.
3. mode가 맞지 않는 preset은 오류로 처리한다.
4. provider fragment가 있으면 기본 fragment를 대체한다.
5. provider fragment가 없으면 기본 fragment를 사용한다.
6. 빈 fragment는 결과 목록에 넣지 않는다.
7. fragment 앞뒤 공백을 trim한다.
8. fragment 사이는 `, `로 연결한다.
9. UI가 전달한 임의 fragment는 신뢰하지 않는다.
10. params는 catalog 정의에서만 유도한다.
11. `baseParams`보다 preset params가 우선한다.
12. 뒤에서 선택된 preset params가 앞 preset을 덮는다.
13. 덮어쓰기는 primitive key 단위 shallow merge다.
14. `undefined`는 param 삭제 의미로 쓰지 않는다.
15. 결과는 입력 객체와 catalog를 변경하지 않는다.

### 알고리즘

```ts
export function compilePresets(input: CompilePresetsInput): CompilePresetsOutput {
  const orderedIds = [...new Set(input.presetIds)];
  const unknownIds: string[] = [];
  const fragments: CompiledPresetFragment[] = [];
  const params: PresetParams = { ...(input.baseParams ?? {}) };

  for (const presetId of orderedIds) {
    const preset = input.catalog.get(presetId);
    if (!preset) {
      unknownIds.push(presetId);
      continue;
    }
    if (!preset.modes.includes(input.mode)) {
      throw new PresetModeMismatchError(presetId, input.mode);
    }
    const override = preset.perProvider?.[input.provider];
    const text = (override?.fragment ?? preset.promptFragment).trim();
    if (text) {
      fragments.push({
        presetId,
        category: preset.category,
        text,
        source: override?.fragment ? "provider-override" : "default",
      });
    }
    Object.assign(params, override?.params ?? {});
  }

  if (unknownIds.length && input.unknownIdPolicy !== "collect") {
    throw new UnknownPresetIdError(unknownIds);
  }

  return {
    presetIds: orderedIds.filter((id) => !unknownIds.includes(id)),
    fragments,
    promptFragment: fragments.map((item) => item.text).join(", "),
    params,
    unknownIds,
  };
}
```

### params 충돌 정책

| 상황 | 결과 |
|---|---|
| base `duration=5`, preset `duration=10` | `10` |
| A `camera=orbit`, B `camera=dolly` | B의 `dolly` |
| provider override 없음 | base 유지 |
| 중복 preset ID | 최초 1회만 적용 |
| 알 수 없는 param key | compiler는 보존, provider adapter가 검증 |
| mode 불일치 | `PRESET_MODE_MISMATCH` 오류 |

### 오류 경계

- route 입력이 배열이 아니면 `400 INVALID_PRESET_IDS`다.
- 배열 원소가 문자열이 아니면 `400 INVALID_PRESET_ID`다.
- ID는 trim 후 빈 문자열을 거부한다.
- ID 개수 상한은 12개다.
- catalog에 없는 ID는 `409 UNKNOWN_PRESET_ID`다.
- catalog 버전 불일치는 서버 시작 시 fail-fast한다.
- preview asset 누락은 compile 실패가 아니라 catalog audit 실패다.
- 수동 복원에서는 `collect`로 누락 ID를 UI에 노출한다.
- 생성 요청에서는 항상 `error` 정책을 사용한다.
- 오류 payload에 사용자 prompt나 provider secret을 포함하지 않는다.

## 시드 프리셋 스키마

### JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ima2.local/schemas/preset-catalog.schema.json",
  "type": "object",
  "required": ["version", "presets"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "presets": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/preset" }
    }
  },
  "$defs": {
    "params": {
      "type": "object",
      "additionalProperties": {
        "type": ["string", "number", "boolean"]
      }
    },
    "override": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "fragment": { "type": "string", "minLength": 1 },
        "params": { "$ref": "#/$defs/params" }
      }
    },
    "preset": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "name",
        "category",
        "thumb",
        "promptFragment",
        "modes",
        "version"
      ],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
        "name": { "type": "string", "minLength": 1, "maxLength": 60 },
        "category": {
          "enum": ["camera-motion", "style", "vfx", "lighting"]
        },
        "thumb": { "type": "string", "pattern": "^/presets/.+\\.(avif|webp)$" },
        "previewVideo": { "type": "string", "pattern": "^/presets/.+\\.(mp4|webm)$" },
        "promptFragment": { "type": "string", "minLength": 1, "maxLength": 500 },
        "perProvider": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "gpt": { "$ref": "#/$defs/override" },
            "gemini": { "$ref": "#/$defs/override" },
            "grok": { "$ref": "#/$defs/override" }
          }
        },
        "modes": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "enum": ["image", "video", "edit"] }
        },
        "exclusiveGroup": { "type": "string" },
        "tags": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string" }
        },
        "version": { "const": 1 }
      }
    }
  }
}
```

### camera-motion 예시

```json
{
  "id": "camera-crash-zoom-in",
  "name": "Crash Zoom In",
  "category": "camera-motion",
  "thumb": "/presets/camera/crash-zoom-in.webp",
  "previewVideo": "/presets/camera/crash-zoom-in.webm",
  "promptFragment": "a rapid crash zoom toward the primary subject",
  "perProvider": {
    "grok": {
      "fragment": "fast crash zoom in, subject remains centered",
      "params": { "motionIntensity": 0.85 }
    },
    "gemini": {
      "fragment": "rapid optical zoom toward the subject with stable framing"
    }
  },
  "modes": ["video"],
  "exclusiveGroup": "zoom-direction",
  "tags": ["zoom", "fast", "dramatic"],
  "version": 1
}
```

### style 예시

```json
{
  "id": "style-editorial-film",
  "name": "Editorial Film",
  "category": "style",
  "thumb": "/presets/style/editorial-film.avif",
  "promptFragment": "refined editorial film photography, tactile grain, restrained color palette",
  "perProvider": {
    "gpt": { "fragment": "high-end editorial film photograph with subtle grain" },
    "gemini": { "params": { "guidanceScale": 6.5 } }
  },
  "modes": ["image", "edit", "video"],
  "tags": ["editorial", "film", "grain"],
  "version": 1
}
```

### lighting 예시

```json
{
  "id": "lighting-window-rembrandt",
  "name": "Window Rembrandt",
  "category": "lighting",
  "thumb": "/presets/lighting/window-rembrandt.webp",
  "promptFragment": "soft directional window light creating a restrained Rembrandt triangle",
  "perProvider": {
    "grok": { "fragment": "single soft window key light, deep natural falloff" }
  },
  "modes": ["image", "edit", "video"],
  "tags": ["portrait", "window", "dramatic"],
  "version": 1
}
```

### seed 품질 게이트

- ID는 전체 catalog에서 유일하다.
- category별 name도 유일하다.
- thumbnail은 4:3 또는 1:1 비율이다.
- hover video는 3초 이하, muted loop다.
- preview의 첫 frame은 thumbnail과 시각적으로 일치한다.
- 모든 asset은 저장소 내 생성 provenance를 가진다.
- provider fragment는 실제 지원 문법만 사용한다.
- mode별 최소 seed 수를 audit한다.
- 카메라 20, 스타일 15, 조명 10을 하한으로 둔다.
- VFX는 이 phase의 필수 seed 하한에서 제외한다.

## HomeWorkspace 컴포넌트 구조

```text
HomeWorkspace
├── HomeHero
│   ├── HomePromptComposer
│   ├── SelectedPresetRow
│   └── HomeGenerateButton
├── HomePresetSection
│   ├── PresetCategoryTabs
│   ├── PresetModeFilter
│   └── PresetGrid
│       └── PresetCard × N
└── HomeRecentSection
    ├── SectionHeading
    └── HistoryStrip
```

```ts
export interface HomeWorkspaceProps {
  provider: PresetProvider;
  mode: PresetMode;
  prompt: string;
  selectedPresetIds: readonly string[];
  onPromptChange(value: string): void;
  onModeChange(mode: PresetMode): void;
  onPresetToggle(presetId: string): void;
  onGenerate(): Promise<void>;
  disabled?: boolean;
}

export interface HomePromptComposerProps {
  value: string;
  selectedPresets: readonly PresetDefinition[];
  isGenerating: boolean;
  onChange(value: string): void;
  onRemovePreset(presetId: string): void;
  onSubmit(): void;
}

export interface HomePresetSectionProps {
  presets: readonly PresetDefinition[];
  category: PresetCategory | "all";
  mode: PresetMode;
  selectedIds: ReadonlySet<string>;
  onCategoryChange(category: PresetCategory | "all"): void;
  onToggle(presetId: string): void;
}
```

### 레이아웃

- 최대 콘텐츠 폭은 `1440px`이다.
- hero는 중앙 정렬, 최대 폭 `920px`이다.
- composer 최소 높이는 desktop `168px`다.
- preset section은 hero 아래 `48px` 간격이다.
- recent section은 grid 아래 `56px` 간격이다.
- NavRail이 있는 desktop에서는 남은 폭만 사용한다.
- HistoryStrip은 기존 horizontal 변형을 재사용한다.
- 중복 제목이나 별도 카드 chrome을 추가하지 않는다.
- loading 중 grid interaction은 유지하고 generate만 잠근다.
- error는 composer 아래 inline alert로 표시한다.

### 반응형 breakpoint

| 폭 | grid | composer | recent |
|---|---:|---|---|
| `>= 1280px` | 5열 | 920px | horizontal 6개 |
| `960–1279px` | 4열 | fluid | horizontal 5개 |
| `720–959px` | 3열 | fluid | horizontal 4개 |
| `480–719px` | 2열 | full | horizontal 2.5개 |
| `< 480px` | 2열 | full | horizontal scroll |

### 접근성

- workspace landmark는 `main`이다.
- category는 `tablist`/`tab` 패턴을 쓴다.
- 선택된 preset은 `aria-pressed=true`다.
- Generate는 명확한 accessible name을 가진다.
- preview video는 decorative로 screen reader에서 숨긴다.
- reduced-motion에서는 hover video를 재생하지 않는다.
- focus 이동 없이 preset chip이 추가된다.
- 오류 발생 시 `role=alert`로 한 번만 알린다.

## PresetGrid 구현

```ts
export interface PresetGridProps {
  presets: readonly PresetDefinition[];
  selectedIds: ReadonlySet<string>;
  activeId: string | null;
  columns: number;
  onActiveIdChange(id: string | null): void;
  onToggle(id: string): void;
}

export interface PresetCardProps {
  preset: PresetDefinition;
  selected: boolean;
  tabIndex: 0 | -1;
  onFocus(): void;
  onToggle(): void;
}
```

### 렌더링 규칙

1. mode filter를 먼저 적용한다.
2. category filter를 다음에 적용한다.
3. catalog 정의 순서를 유지한다.
4. ID를 React key로 사용한다.
5. 카드 전체는 `button`이다.
6. 카드 내부에 중첩 button을 두지 않는다.
7. selected overlay와 check icon을 함께 표시한다.
8. 빈 결과에는 필터 초기화 action을 제공한다.
9. 100개 미만에서는 virtualization을 사용하지 않는다.
10. 목록 교체 시 active ID를 첫 카드로 보정한다.

### thumbnail loading

- 첫 viewport의 첫 10개는 eager load한다.
- 나머지는 `loading="lazy"`다.
- width/height attribute로 layout shift를 방지한다.
- `object-fit: cover`를 사용한다.
- decode 실패 시 category fallback art를 표시한다.
- broken asset URL은 무한 retry하지 않는다.
- image decode 후에만 opacity transition을 시작한다.
- thumbnail alt는 preset name + category다.

### hover video preview

- `pointerenter` 후 180ms dwell에서 로드한다.
- `pointerleave` 시 pause하고 `currentTime=0`으로 돌린다.
- 동일 카드 재진입 시 이미 로드된 source를 재사용한다.
- 동시에 재생하는 preview는 하나뿐이다.
- `muted`, `loop`, `playsInline`을 강제한다.
- autoplay reject는 조용히 thumbnail fallback한다.
- keyboard focus에서는 Space를 누르기 전 자동재생하지 않는다.
- reduced data 환경에서는 video source를 붙이지 않는다.
- visibility hidden 시 모든 preview를 pause한다.

### keyboard navigation

| 키 | 동작 |
|---|---|
| ArrowRight | 다음 카드 |
| ArrowLeft | 이전 카드 |
| ArrowDown | 다음 행 같은 열 |
| ArrowUp | 이전 행 같은 열 |
| Home | 첫 카드 |
| End | 마지막 카드 |
| Enter | 선택 toggle |
| Space | 선택 toggle |
| Escape | hover/focus preview 중지 |

Roving tabindex를 사용한다. 행 이동은 실제 계산된 column 수를 사용하고 범위를 clamp한다. 필터 변경 후 사라진 active ID를 참조하지 않는다.

## Zustand 슬라이스 설계

```ts
export interface PresetSelectionState {
  selectedPresetIds: string[];
  restoredMissingPresetIds: string[];
  presetHydrated: boolean;
}

export interface PresetSelectionActions {
  addPreset(id: string): void;
  removePreset(id: string): void;
  togglePreset(id: string): void;
  clearPresets(): void;
  restorePresets(ids: readonly string[], catalogIds: ReadonlySet<string>): void;
  markPresetHydrated(): void;
}

export type PresetSlice = PresetSelectionState & PresetSelectionActions;
```

### action 계약

- `addPreset`: 중복이면 no-op다.
- `addPreset`: 뒤에 추가해 선택 순서를 보존한다.
- `removePreset`: 존재하지 않으면 no-op다.
- `togglePreset`: 존재하면 제거, 없으면 추가한다.
- `clearPresets`: 선택과 missing 목록을 모두 비운다.
- `restorePresets`: 알려진 ID와 누락 ID를 분리한다.
- `restorePresets`: 알려진 ID의 원래 순서를 보존한다.
- `restorePresets`: 중복을 제거한다.
- `markPresetHydrated`: 최초 persistence read 후 호출한다.
- action은 catalog 객체를 state에 저장하지 않는다.

```ts
export function restorePresetsImpl(
  ids: readonly string[],
  catalogIds: ReadonlySet<string>,
  set: StoreSet,
): void {
  const uniqueIds = [...new Set(ids)];
  set({
    selectedPresetIds: uniqueIds.filter((id) => catalogIds.has(id)),
    restoredMissingPresetIds: uniqueIds.filter((id) => !catalogIds.has(id)),
    presetHydrated: true,
  });
}
```

### persistence 통합

- key는 `ima2.preset-selection.v1`이다.
- payload는 `{ version: 1, ids: string[] }`다.
- prompt 문자열과 같은 blob에 합치지 않는다.
- mode별 선택을 분리하지 않고 공통 selection으로 시작한다.
- mode 전환 시 비지원 preset은 숨기되 즉시 삭제하지 않는다.
- 생성 시 mode 불일치가 있으면 사용자에게 제거 안내를 한다.
- JSON parse 실패는 기본 빈 배열로 복구한다.
- 구버전 migration 실패는 warning 후 key를 보존한다.
- storage write 실패는 generation을 막지 않는다.
- logout/auth 전환과 무관한 로컬 studio 상태로 취급한다.

## 생성 파이프라인 통합

### 데이터 흐름

```text
PromptComposer prompt
  + Zustand selectedPresetIds
  -> generation entry snapshot
  -> POST body { prompt, presetIds, ... }
  -> route validation
  -> compilePresets(provider, mode)
  -> composerPrompt = join(prompt, compiled.promptFragment)
  -> provider adapter(composerPrompt, compiled.params)
  -> result metadata { prompt, composerPrompt, presetIds }
```

### prompt 분리

```ts
export interface GenerationPromptContext {
  prompt: string;
  composerPrompt: string;
  presetIds: string[];
  presetFragment: string;
}
```

- `prompt`는 사용자가 작성한 원문이다.
- `composerPrompt`는 provider 호출에 쓰는 합성문이다.
- history 기본 표시는 `prompt`다.
- 디버그 detail에서만 `composerPrompt`를 펼친다.
- regenerate는 원래 `presetIds`로 다시 컴파일한다.
- catalog 변경 후 완전 동일 재현은 metadata의 catalog version으로 경고한다.
- preset fragment를 prompt text에 영구 삽입하지 않는다.
- user prompt가 빈 경우 fragment만으로 생성 가능하다.
- 둘 다 빈 경우 기존 empty prompt validation을 유지한다.

### provider 적용 순서

1. route가 provider와 mode를 확정한다.
2. catalog snapshot을 읽는다.
3. preset ID를 컴파일한다.
4. prompt + fragment를 합성한다.
5. preset params를 UI params 위에 병합한다.
6. provider adapter가 지원 param을 재검증한다.
7. 실제 요청 payload를 만든다.
8. 결과 저장 시 원문과 합성문을 함께 기록한다.
9. XMP에는 ID와 catalog version만 기록한다.
10. preview asset 경로는 XMP에 넣지 않는다.

### XMP payload

```ts
export interface PresetMetadataV1 {
  presetIds: string[];
  presetCatalogVersion: 1;
}

export interface GenerationMetadataVNext {
  prompt: string;
  composerPrompt?: string;
  provider: string;
  presetIds?: string[];
  presetCatalogVersion?: number;
}
```

- ID 순서는 유지한다.
- 빈 배열은 생략 가능하다.
- restore는 `presetIds`가 없으면 빈 배열이다.
- 중복 ID는 restore boundary에서 제거한다.
- 알 수 없는 ID는 missing chip으로 보여준다.
- 기존 metadata reader는 새 필드를 무시할 수 있어야 한다.
- XMP 크기 제한 때문에 preset 전체 정의는 넣지 않는다.

## 테스트 시나리오 매트릭스

### compiler provider × category × mode

| ID | Provider | Category | Mode | 기대 |
|---|---|---|---|---|
| PC-01 | GPT | camera-motion | video | GPT override 또는 default |
| PC-02 | Gemini | camera-motion | video | Gemini override |
| PC-03 | Grok | camera-motion | video | fragment + params |
| PC-04 | GPT | style | image | style fragment |
| PC-05 | Gemini | style | image | params merge |
| PC-06 | Grok | style | image | default fallback |
| PC-07 | GPT | lighting | image | lighting fragment |
| PC-08 | Gemini | lighting | edit | mode 허용 |
| PC-09 | Grok | lighting | video | video 허용 |
| PC-10 | GPT | camera-motion | image | mode mismatch 오류 |
| PC-11 | Gemini | style | video | stable order |
| PC-12 | Grok | style+lighting | image | comma concat |
| PC-13 | GPT | style+lighting | edit | 두 fragment 순서 |
| PC-14 | Gemini | camera+style | video | provider별 개별 override |
| PC-15 | Grok | camera+lighting | video | params last-write-wins |

### compiler edge cases

| ID | 입력 | 기대 |
|---|---|---|
| PE-01 | 빈 IDs | 빈 fragment/params |
| PE-02 | 같은 ID 두 번 | 1회 적용 |
| PE-03 | unknown 1개 | typed error |
| PE-04 | unknown 여러 개 | 전체 ID를 error에 포함 |
| PE-05 | collect policy | unknownIds 반환 |
| PE-06 | 빈 override fragment | default fallback 규칙 고정 |
| PE-07 | 공백 fragment | trim |
| PE-08 | base params | preset이 override |
| PE-09 | catalog mutation 감시 | 입력 불변 |
| PE-10 | 13 IDs | route 상한 오류 |

### Zustand/restore

| ID | 시나리오 | 기대 |
|---|---|---|
| PR-01 | add A,B | `[A,B]` |
| PR-02 | add A,A | `[A]` |
| PR-03 | remove missing | no-op |
| PR-04 | toggle selected | 제거 |
| PR-05 | toggle absent | 뒤에 추가 |
| PR-06 | clear | selection/missing 빈 배열 |
| PR-07 | restore known | 순서 보존 |
| PR-08 | restore unknown | missing 분리 |
| PR-09 | corrupt JSON | 빈 상태 복구 |
| PR-10 | storage write fail | UI state 유지 |
| PR-11 | hydration 전 render | skeleton, 선택 flash 없음 |
| PR-12 | mode 전환 | ID 보존, grid 필터 |

### XMP round-trip

| ID | payload | 기대 |
|---|---|---|
| PX-01 | presetIds 없음 | 빈 selection |
| PX-02 | 1개 ID | 동일 ID 복원 |
| PX-03 | 3개 ID | 순서 보존 |
| PX-04 | 중복 ID | restore에서 dedup |
| PX-05 | unknown ID | missing chip |
| PX-06 | unicode prompt | 원문 보존 |
| PX-07 | composerPrompt | debug field 보존 |
| PX-08 | legacy XMP | reader 호환 |
| PX-09 | image result | IDs 보존 |
| PX-10 | video sidecar | IDs 보존 |

### Home UI

| ID | 조작 | 기대 |
|---|---|---|
| HU-01 | `#home` 진입 | lazy chunk 로드 |
| HU-02 | category tab | grid filter |
| HU-03 | card click | chip 추가 |
| HU-04 | selected card click | chip 제거 |
| HU-05 | ArrowRight | focus 이동 |
| HU-06 | ArrowDown | 다음 행 이동 |
| HU-07 | hover dwell | preview 재생 |
| HU-08 | reduced motion | preview 비활성 |
| HU-09 | broken thumb | fallback 표시 |
| HU-10 | Generate | snapshot ID 전달 |
| HU-11 | recent click | 기존 resume flow |
| HU-12 | mobile 375px | 2열, overflow 없음 |

### 수동 검수

- Grok과 Gemini에서 같은 camera preset을 생성한다.
- seed thumbnail과 실제 motion 의미가 일치하는지 본다.
- prompt 원문이 history에서 오염되지 않았는지 확인한다.
- XMP 복원 후 chip 순서가 같은지 확인한다.
- keyboard-only로 category부터 generate까지 완료한다.
- 375px, 768px, 1440px에서 layout을 캡처한다.
- 증거는 `assets/060/`에 provider와 preset ID를 파일명으로 남긴다.
