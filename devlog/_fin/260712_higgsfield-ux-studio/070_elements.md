---
created: 2026-07-12
tags: [ima2-gen, phase, elements, mention]
---

# Phase 070 — @멘션 영속 요소

스펙: `005_reference-assets.md` 전체. 050(저장, `kind: element`) +
060(컴파일 파이프라인, Chip) 의존.

## 범위

1. 요소 CRUD: 갤러리 "요소로 저장" 체이닝 액션 + Assets 내 요소 상세
   (refs 1~6장, notes, kind).
2. `PromptComposer` `@` 자동완성 → 멘션 칩. 생성 시 refs 참조 슬롯 주입 +
   notes 컴파일(060 파이프라인 확장). XMP `elementIds` 기록.
3. 비디오 I2V 참조 경로에 동일 주입.
4. 테스트 시트 버튼(요소 고정 4변형 생성).
5. 미결정: 노드 모드 요소 노드 타입 — 080에서 함께 결정.

## Done 기준

- 멘션 파싱/주입 단위 테스트(프리셋 조합 포함) + 참조 상한 규칙 계약.
- 캐릭터 요소 1개 3사 프로바이더 일관성 수동 검수 → `assets/070/`.

상태: pending (전면 신규 구현 필요)

## 2026-07-15 현재 코드 상태 (sol 탐색 기반)

Phase 070의 기반 골격은 일부 준비되어 있지만, element 전용 로직은 전부 미구현이다.

### 이미 존재하는 기반
- `lib/assetsStore.ts` — `kind: "element"` 타입 허용 (line 6). 생성/목록/필터에서 element를 일반 asset으로 처리
- `lib/db.ts` — DB schema v6, assets 테이블에 nullable `metadata` JSON 컬럼 (element 전용 컬럼 없음)
- `routes/assets.ts` — generic CRUD 존재. element에 filePath 불필요 (서버는 nullable 허용)
- `ui/src/store/storeTypes.ts` — `AssetItem` union에 element 포함 (line 32)
- `ui/src/components/controls/Chip.tsx` — mention chip 용도 선행 주석 존재 (line 15)
- `ui/src/lib/resultChaining.ts` — `saveToAssets` action 존재, `saveAsElement` 추가 가능한 구조

### 알려진 타입 갭
- `ui/src/lib/api-assets.ts` (line 24): `createAsset()` 입력이 `filePath: string` 필수 — element는 파일 없이 생성해야 하므로 nullable로 변경 필요
- `GET /api/assets/:id` 단일 조회 endpoint 없음 — element detail/mention 조회에 필요

### 전부 미구현
- `lib/elementCompiler.ts` — notes/refs→provider 입력 컴파일
- element 전용 validation (name/refs 1-6/notes/elementKind)
- `@` mention 파서, autocomplete menu, mention chip
- ElementDetail + ElementRefGrid UI
- AssetsWorkspace master/detail 레이아웃
- generatePipeline/multimodePipeline/video element injection
- XMP `elementIds` 필드
- element CRUD store actions, selected elementIds 상태

## Diff-Level Implementation Spec

### Server / domain

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `lib/elementCompiler.ts` | element ID를 조회해 notes를 prompt fragment로 컴파일하고 refs를 provider 참조 슬롯으로 변환한다. 중복 제거, 순서, provider별 참조 상한을 강제한다. | +120 |
| MODIFY | `lib/assetsStore.ts` | `kind: element` payload의 name, refs 1–6장, notes를 검증하고 element 필터/검색 및 왕복 저장 계약을 확장한다. | +60 |
| MODIFY | `routes/assets.ts` | element CRUD, 갤러리의 "요소로 저장" promote action, 요소 고정 4변형 테스트 시트 endpoint를 추가한다. | +95 |
| MODIFY | `lib/imageMetadata.ts` | XMP payload에 `elementIds: string[]`를 추가하고 060의 `presetIds`와 함께 왕복시킨다. | +13 |
| MODIFY | `lib/generatePipeline.ts` | preset compile 결과와 결합하기 전에 element notes/refs를 주입하고 provider 참조 상한을 적용한다. | +17 |

### Frontend

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `ui/src/components/ElementMentionMenu.tsx` | caret의 `@query`를 감지해 저장된 요소를 검색·키보드 탐색·선택하는 자동완성 메뉴를 구현한다. | +130 |
| NEW | `ui/src/components/ElementMentionChip.tsx` | 본문 token과 연결되는 element mention pill, 제거, 누락 요소 상태를 구현한다. | +55 |
| NEW | `ui/src/components/assets/ElementDetail.tsx` | 요소 name/notes/refs 1–6장 편집, 저장, 테스트 시트 실행 UI를 구현한다. | +180 |
| MODIFY | `ui/src/components/PromptComposer.tsx` | `@query` 범위를 mention chip으로 치환하고 element ID를 prompt text와 분리해 유지한다. | +55 |
| MODIFY | `ui/src/components/assets/AssetsWorkspace.tsx` | element 목록/상세 master-detail과 갤러리 promote 진입을 연결한다. | +30 |
| MODIFY | `ui/src/store/storeAssetsImpl.ts` | element CRUD, promote, mention 검색용 refresh와 optimistic/error 상태를 추가한다. | +52 |

### Tests

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `tests/element-compiler.test.ts` | mention 파싱, notes/refs 주입, 중복 제거, 순서, provider 참조 상한 및 060 preset 조합을 검증한다. | +180 |
| NEW | `tests/element-metadata.test.ts` | `presetIds`와 `elementIds`의 XMP 공존 왕복, element CRUD/filter/search 및 누락 ID 복원을 검증한다. | +70 |

### Done criteria

- element CRUD round-trip과 compiler의 참조 상한·중복 제거 계약 테스트가 통과한다.
- 060의 `presetIds`와 070의 `elementIds`가 동일 XMP payload에서 공존하는 왕복 테스트가 통과한다.
- 050 `assetsStore`가 `kind: element`를 올바르게 저장·필터·검색하는 확장 계약이 통과한다.
- 동일 캐릭터 요소를 GPT/Gemini/Grok에서 각 1회 생성해 일관성을 수동 검수하고 `assets/070/`에 남긴다.

### Dependencies on prior phases

- 020의 `Chip` 상호작용을 mention pill과 composer 선택 UI에 재사용한다.
- 040의 갤러리 체이닝 액션을 "요소로 저장" 진입점으로 확장한다.
- 050의 Assets CRUD, `kind: element`, refs 저장 계층과 검색 계약에 의존한다.
- 060의 preset compiler/generation context 및 XMP `presetIds` 왕복을 확장한다.
- 노드용 `ElementReferenceNode`는 이 phase 완료 후 080에서 구현한다.

## 구현 파일 명세표

현재 저장소의 실제 Assets/store/pipeline 소유자를 기준으로 한다. 생성된 `.js` 파일은 직접 수정하지 않는다.

| Op | 경로 | 책임 | 예상 LOC |
|---|---|---|---:|
| NEW | `lib/elementCompiler.ts` | notes와 refs를 provider 입력으로 컴파일 | 190 |
| MODIFY | `lib/assetsStore.ts` | `kind: element` 검증/조회/검색 | 75 |
| MODIFY | `routes/assets.ts` | element CRUD와 promote/test-sheet API | 110 |
| MODIFY | `lib/generatePipeline.ts` | image/edit element compile | 35 |
| MODIFY | `lib/multimodePipeline.ts` | variant 공통 element snapshot | 30 |
| MODIFY | `routes/video.ts` | I2V element refs 전달 | 30 |
| MODIFY | `lib/imageMetadataStore.ts` | XMP `elementIds` 왕복 | 24 |
| MODIFY | `ui/src/lib/api-assets.ts` | element CRUD/promote/test-sheet client | 70 |
| NEW | `ui/src/lib/elementMention.ts` | caret query와 token 치환 순수 함수 | 100 |
| NEW | `ui/src/components/ElementMentionMenu.tsx` | autocomplete listbox | 150 |
| NEW | `ui/src/components/ElementMentionChip.tsx` | 선택/누락 element chip | 65 |
| NEW | `ui/src/components/assets/ElementDetail.tsx` | element editor | 210 |
| NEW | `ui/src/components/assets/ElementRefGrid.tsx` | refs 1–6장 관리 | 130 |
| MODIFY | `ui/src/components/PromptComposer.tsx` | mention trigger/chip integration | 80 |
| MODIFY | `ui/src/components/assets/AssetsWorkspace.tsx` | master/detail element view | 55 |
| MODIFY | `ui/src/components/assets/AssetsGrid.tsx` | element badge/promote feedback | 25 |
| MODIFY | `ui/src/components/ResultActions.tsx` | “요소로 저장” action | 30 |
| MODIFY | `ui/src/store/storeAssetsImpl.ts` | element CRUD state/actions | 85 |
| MODIFY | `ui/src/store/storeTypes.ts` | element/selection contracts | 70 |
| MODIFY | `ui/src/store/useAppStore.ts` | actions binding | 25 |
| MODIFY | `ui/src/store/storeGenImpl.ts` | `elementIds` image payload | 30 |
| MODIFY | `ui/src/store/storeVideoImpl.ts` | `elementIds` video payload | 30 |
| MODIFY | `ui/src/types.ts` | request/metadata fields | 25 |
| NEW | `tests/element-compiler.test.ts` | compiler/slot capacity matrix | 240 |
| NEW | `tests/element-metadata.test.ts` | XMP/persistence round-trip | 110 |
| NEW | `tests/element-mention-ui-contract.test.js` | mention a11y/static contracts | 120 |

### 경계 원칙

- element 원본은 Assets 계층이 소유한다.
- composer는 element ID만 소유한다.
- refs 경로는 생성 직전에 조회한다.
- notes는 prompt 원문에 영구 삽입하지 않는다.
- provider capacity는 compiler가 강제한다.
- 노드 표현은 080에서 adapter로 추가한다.
- 삭제된 element ID는 누락 상태로 보존한다.
- test sheet는 별도 element를 자동 생성하지 않는다.

## elementCompiler 설계

### 타입

```ts
export type ElementKind = "character" | "product" | "style" | "scene";
export type ElementProvider = "gpt" | "gemini" | "grok";
export type ElementMode = "image" | "edit" | "video";

export interface ElementDefinition {
  id: string;
  name: string;
  kind: ElementKind;
  refs: string[];
  notes?: string;
  defaultStrength?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExistingReferenceInput {
  source: "composer" | "node" | "continuity";
  path: string;
  strength?: number;
}

export interface ElementReferenceSlot {
  elementId: string;
  elementName: string;
  kind: ElementKind;
  path: string;
  strength?: number;
  priority: number;
}

export interface ElementCapacity {
  maxTotalRefs: number;
  maxRefsPerElement: number;
}

export interface CompileElementsInput {
  elementIds: readonly string[];
  elements: ReadonlyMap<string, ElementDefinition>;
  existingRefs: readonly ExistingReferenceInput[];
  provider: ElementProvider;
  mode: ElementMode;
  capacity: ElementCapacity;
  missingPolicy?: "error" | "collect";
}

export interface CompileElementsOutput {
  elementIds: string[];
  notesFragment: string;
  referenceSlots: ElementReferenceSlot[];
  retainedExistingRefs: ExistingReferenceInput[];
  droppedRefs: Array<{ path: string; reason: string; elementId?: string }>;
  missingElementIds: string[];
}
```

### notes injection

1. element ID 최초 등장 순서를 보존한다.
2. 각 element의 `notes`를 trim한다.
3. 빈 notes는 건너뛴다.
4. notes는 `[Element: name] notes` 형식으로 감싼다.
5. 여러 notes는 newline으로 연결한다.
6. user prompt 뒤에 별도 composer fragment로 붙인다.
7. 같은 notes 문자열이어도 element가 다르면 둘 다 유지한다.
8. 같은 element ID 중복은 제거한다.
9. notes 길이는 element당 800자로 제한한다.
10. 전체 notes fragment는 2400자로 제한한다.

```ts
export function formatElementNote(element: ElementDefinition): string | null {
  const notes = element.notes?.trim();
  if (!notes) return null;
  return `[Element: ${element.name}] ${notes}`;
}
```

### refs → slots 변환

- element 선택 순서가 1차 우선순위다.
- 같은 element 안에서는 refs 배열 순서가 우선순위다.
- path는 canonical absolute asset path로 정규화한다.
- 같은 canonical path는 한 슬롯만 사용한다.
- strength는 element default를 슬롯에 복사한다.
- provider가 strength를 지원하지 않으면 metadata에만 남긴다.
- refs가 0개인 element는 validation 오류다.
- refs가 7개 이상인 element는 저장 boundary에서 거부한다.
- 읽기 시 legacy 초과 refs는 앞 6개만 후보로 삼고 warning한다.

### priority와 dedup

```ts
const SOURCE_PRIORITY = {
  continuity: 0,
  node: 1,
  composer: 2,
  element: 3,
} as const;
```

실제 우선순위는 다음과 같다.

1. 비디오 continuity first-frame은 항상 보존한다.
2. 명시적 node ref를 다음으로 보존한다.
3. composer에 직접 첨부한 ref를 다음으로 보존한다.
4. element ref는 선택 순서대로 남은 슬롯을 채운다.
5. 같은 path가 높은 우선순위 source에 있으면 element 슬롯을 만들지 않는다.
6. 같은 path를 두 element가 공유하면 먼저 선택된 element가 소유한다.
7. dropped ref는 이유와 함께 결과에 기록한다.
8. element 자체는 ref가 모두 drop돼도 `elementIds`에 남는다.
9. UI는 일부 refs가 drop되면 non-blocking warning을 표시한다.
10. continuity가 capacity를 모두 사용하면 element generation을 차단하고 설명한다.

### capacity 기본값

| Provider | image/edit | video I2V | element당 |
|---|---:|---:|---:|
| GPT | 6 | 1 | 6 |
| Gemini | 6 | 3 | 6 |
| Grok | 4 | 1 | 4 |

capacity 값은 compiler에 하드코딩하지 않고 provider capability에서 주입한다. 표는 seed default이며 provider contract 변경 시 capability test와 함께 갱신한다.

### 오류

- unknown element: `UNKNOWN_ELEMENT_ID`.
- refs 없음: `ELEMENT_REFS_EMPTY`.
- refs 6장 초과 저장: `ELEMENT_REF_LIMIT`.
- notes 초과: `ELEMENT_NOTES_TOO_LONG`.
- 전체 slot 없음: `REFERENCE_CAPACITY_EXCEEDED`.
- asset path missing: 해당 ref drop 후 usable ref가 없으면 오류.
- missing 복원은 collect policy로 missing chip을 만든다.
- 생성 요청은 unknown ID를 오류로 취급한다.
- 오류 payload에 로컬 absolute path를 노출하지 않는다.

## @멘션 UI 구현

### caret 감지 타입

```ts
export interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

export interface ComposerMentionToken {
  tokenId: string;
  elementId: string;
  label: string;
  start: number;
  end: number;
}

export function findMentionAtCaret(
  text: string,
  caret: number,
): MentionQuery | null;
```

### 감지 규칙

- caret 왼쪽의 가장 가까운 `@`를 찾는다.
- `@` 앞은 시작, 공백, `(`, `[` 중 하나여야 한다.
- query에는 문자, 숫자, `_`, `-`, 한글을 허용한다.
- newline을 넘어서 검색하지 않는다.
- 이메일의 `@`는 trigger가 아니다.
- 이미 chip으로 확정된 token 내부에서는 열지 않는다.
- IME composition 중에는 검색하지 않는다.
- query 0글자에서 최근 element를 표시한다.
- query 1글자부터 name/tags를 필터한다.
- Escape 후 같은 query에서는 다음 입력까지 닫힘을 유지한다.

### 메뉴 positioning

```ts
export interface MentionMenuPosition {
  left: number;
  top: number;
  placement: "bottom" | "top";
  maxHeight: number;
}
```

- textarea mirror로 caret client rect를 계산한다.
- viewport 아래 공간이 240px 미만이면 위에 연다.
- 좌우 viewport padding은 12px다.
- composer scroll 시 위치를 재계산한다.
- window resize 시 requestAnimationFrame으로 재계산한다.
- mobile에서는 caret popover 대신 composer 하단 sheet를 쓴다.
- menu는 portal로 렌더해 overflow clipping을 피한다.
- anchor가 unmount되면 즉시 닫는다.

### keyboard navigation

| 키 | 동작 |
|---|---|
| ArrowDown | 다음 option |
| ArrowUp | 이전 option |
| Home | 첫 option |
| End | 마지막 option |
| Enter | active option 확정 |
| Tab | active option 확정 후 다음 focus |
| Escape | menu 닫기 |
| Backspace | query 편집 또는 인접 chip 선택 |

menu는 `role=listbox`, item은 `role=option`을 사용한다. 입력은 `aria-controls`, `aria-expanded`, `aria-activedescendant`를 갱신한다.

### chip rendering

```ts
export interface ElementMentionChipProps {
  elementId: string;
  name: string;
  thumbnail?: string;
  missing?: boolean;
  onRemove(elementId: string): void;
  onOpen?(elementId: string): void;
}
```

- chip은 prompt text와 분리된 row에 표시한다.
- 선택 순서를 유지한다.
- thumbnail, name, kind icon을 표시한다.
- remove button은 독립 accessible name을 가진다.
- click은 Assets detail을 열 수 있다.
- missing 상태는 삭제하지 않고 경고 아이콘을 표시한다.
- missing chip은 생성 버튼을 차단한다.
- 삭제하면 text에 `@name` 잔재를 자동 삽입하지 않는다.
- 동일 element 재선택은 기존 chip을 focus한다.

## ElementDetail 컴포넌트

```ts
export interface ElementDraft {
  id?: string;
  name: string;
  kind: ElementKind;
  refs: ElementRefDraft[];
  notes: string;
  defaultStrength: number;
}

export interface ElementRefDraft {
  id: string;
  path: string;
  previewUrl: string;
  alt: string;
}

export interface ElementDetailProps {
  element: ElementDefinition | null;
  saving: boolean;
  testing: boolean;
  onSave(draft: ElementDraft): Promise<void>;
  onDelete?(id: string): Promise<void>;
  onRunTestSheet(id: string): Promise<void>;
}
```

### kind selection

- character, product, style, scene 네 종류를 segmented control로 표시한다.
- kind 변경은 refs를 삭제하지 않는다.
- kind별 설명을 한 줄로 제공한다.
- 기존 element kind 변경은 저장 전 confirmation을 요구하지 않는다.
- test sheet 기본 prompt는 kind별로 달라진다.

### refs 1–6장

- 최소 1장 없이는 저장할 수 없다.
- 최대 6장 이후 add control을 disable한다.
- drag reorder를 지원한다.
- keyboard move up/down 대체 action을 제공한다.
- 첫 ref가 대표 thumbnail이다.
- 중복 path drop은 거부하고 기존 ref를 highlight한다.
- upload 실패 ref는 draft에 넣지 않는다.
- 삭제 직후 undo toast를 제공한다.
- 저장 전 missing path를 다시 검증한다.
- 각 ref에 정면/측면 같은 optional alt label을 둔다.

### notes editor

- 최대 800자다.
- 남은 글자 수를 100자 이하에서 표시한다.
- 외모, 재질, 불변 특징을 쓰라는 helper copy를 둔다.
- provider 문법을 직접 쓰라고 유도하지 않는다.
- newline을 보존한다.
- whitespace-only는 `undefined`로 저장한다.
- notes preview에서 최종 injection 형태를 보여준다.

### strength slider

- 범위 `0–1`, step `0.05`, default `0.75`다.
- 숫자 값을 함께 표시한다.
- Arrow key로 조절 가능하다.
- provider 미지원 시 “참고 강도”로 표기한다.
- 0은 ref 제거가 아니라 최소 영향이다.
- reset action은 kind default로 돌아간다.

### test sheet

- 저장된 element에만 활성화한다.
- 고정 ref/notes로 4변형을 요청한다.
- default provider를 쓰되 실행 전 provider를 표시한다.
- 진행 상태는 기존 inflight/SSE를 재사용한다.
- 결과는 element detail 아래 2×2 grid로 표시한다.
- test 결과를 자동으로 refs에 추가하지 않는다.
- 각 결과에 “ref로 추가” action을 제공한다.
- 6장 상한이면 action을 disable한다.
- 실패한 변형은 개별 retry 가능하다.

## Assets 통합

### 저장 모델

```ts
export interface ElementAssetPayload {
  kind: "element";
  name: string;
  elementKind: ElementKind;
  refs: string[];
  notes?: string;
  defaultStrength?: number;
  tags?: string[];
}
```

- 기존 generic asset의 `kind`는 `element`다.
- 도메인 종류는 `elementKind`로 분리한다.
- 검색은 name, notes, tags를 대상으로 한다.
- refs 대표 이미지를 AssetsGrid thumbnail로 쓴다.
- folder 이동과 tag 기능은 기존 계약을 재사용한다.
- 삭제는 기존 soft-delete 정책을 따른다.

### promote flow

```text
Gallery ResultActions
 -> "요소로 저장"
 -> Assets promote dialog
 -> name + elementKind + notes 입력
 -> 원본 result path를 refs[0]으로 저장
 -> ElementDetail 열기
```

- image 결과에서만 즉시 promote한다.
- video 결과는 먼저 frame 추출을 요구한다.
- 기존 asset이면 원본 provenance를 유지한다.
- 중복 promote는 새 element를 만들 수 있으나 이름 충돌을 경고한다.
- promote 실패 시 gallery selection을 유지한다.
- 성공 시 element ID를 toast action으로 제공한다.

### master/detail workspace

```text
AssetsWorkspace
├── AssetsFolderTree
├── AssetsMasterPane
│   ├── AssetsFilters(kind=element)
│   └── AssetsGrid
└── AssetsDetailPane
    └── ElementDetail
```

- desktop은 3-pane layout을 쓴다.
- tablet은 folder drawer + master/detail이다.
- mobile은 list → detail route transition이다.
- 선택 ID는 hash/query로 deep-link 가능해야 한다.
- 삭제된 detail은 목록으로 안전하게 돌아간다.
- unsaved draft가 있으면 다른 element 이동 전에 확인한다.

## 생성 파이프라인 통합

### 공통 context

```ts
export interface ElementGenerationContext {
  elementIds: string[];
  elementNotesFragment: string;
  elementReferenceSlots: ElementReferenceSlot[];
}
```

### generatePipeline

1. route가 `elementIds`를 검증한다.
2. Assets snapshot에서 elements를 읽는다.
3. preset compiler를 먼저 실행한다.
4. element compiler를 실행한다.
5. prompt + preset fragment + notes fragment를 합친다.
6. 직접 refs와 element slots를 capacity 규칙으로 합친다.
7. provider adapter에 refs와 strength를 전달한다.
8. 결과 metadata에 element IDs를 기록한다.

### multimodePipeline

- batch 시작 시 element snapshot을 한 번 고정한다.
- 모든 variant가 같은 refs 순서를 쓴다.
- provider가 다르면 variant별 capacity를 다시 계산한다.
- 한 variant의 capacity 실패가 전체 batch 정책을 따르도록 한다.
- dropped refs는 variant diagnostic에 기록한다.
- notes fragment는 provider와 무관하게 동일하다.

### video

- T2V에서도 notes는 prompt에 주입할 수 있다.
- I2V에서 continuity frame이 최우선 슬롯이다.
- 남은 capacity에 element refs를 넣는다.
- provider가 1 ref만 받으면 continuity가 element보다 우선한다.
- element ref를 넣지 못하면 명시적으로 사용자에게 알린다.
- video sidecar에도 `elementIds`를 저장한다.

### XMP

```ts
export interface ElementMetadataV1 {
  elementIds: string[];
}
```

- 전체 refs path를 XMP에 넣지 않는다.
- notes 원문도 XMP에 중복 저장하지 않는다.
- `presetIds`와 독립 배열로 공존한다.
- restore 시 Assets lookup을 다시 수행한다.
- missing ID는 missing chip으로 복원한다.
- ID 순서는 유지한다.

## 테스트 시나리오 매트릭스

### compiler

| ID | Provider/Mode | 입력 | 기대 |
|---|---|---|---|
| EC-01 | GPT image | character 1×6 | 6 slots |
| EC-02 | Gemini edit | product+style | ordered slots |
| EC-03 | Grok image | 6 refs | capacity 4, 2 dropped |
| EC-04 | Grok video | continuity+element | continuity 보존 |
| EC-05 | Gemini video | 3 element refs | 3 slots |
| EC-06 | GPT video | notes only | notes injection |
| EC-07 | all | duplicate ID | one element |
| EC-08 | all | duplicate path | one slot |
| EC-09 | all | unknown ID | typed error |
| EC-10 | all | collect missing | missing list |
| EC-11 | all | empty refs | validation error |
| EC-12 | all | direct+element duplicate | direct ref 우선 |
| EC-13 | all | preset+element | fragments 모두 보존 |
| EC-14 | all | notes whitespace | no fragment |
| EC-15 | all | notes > 800 | error |

### mention UI

| ID | 시나리오 | 기대 |
|---|---|---|
| EM-01 | `@` 입력 | recent menu |
| EM-02 | `@ca` | name filter |
| EM-03 | 이메일 입력 | menu 없음 |
| EM-04 | 한글 query | 검색 동작 |
| EM-05 | IME composition | menu 안정 |
| EM-06 | ArrowDown+Enter | chip 확정 |
| EM-07 | Escape | 닫힘 |
| EM-08 | mobile | bottom sheet |
| EM-09 | 삭제된 element | missing chip |
| EM-10 | 같은 element 재선택 | 중복 없음 |
| EM-11 | chip remove | ID 제거 |
| EM-12 | scroll/resize | anchor 재계산 |

### ElementDetail/Assets

| ID | 시나리오 | 기대 |
|---|---|---|
| EA-01 | ref 0장 저장 | 차단 |
| EA-02 | ref 1장 저장 | 성공 |
| EA-03 | ref 6장 저장 | 성공 |
| EA-04 | ref 7장 추가 | 차단 |
| EA-05 | duplicate path | 기존 ref highlight |
| EA-06 | reorder | 대표 thumbnail 변경 |
| EA-07 | notes 801자 | 차단 |
| EA-08 | promote image | refs[0] 설정 |
| EA-09 | promote video | frame 추출 안내 |
| EA-10 | test sheet | 4 inflight items |
| EA-11 | test result add | refs append |
| EA-12 | unsaved navigation | confirm |

### metadata/round-trip

| ID | payload | 기대 |
|---|---|---|
| EX-01 | elementIds 없음 | 빈 복원 |
| EX-02 | 1 ID | 동일 ID |
| EX-03 | 3 IDs | 순서 보존 |
| EX-04 | presetIds 동시 | 두 배열 공존 |
| EX-05 | unknown ID | missing 분리 |
| EX-06 | legacy XMP | 호환 |
| EX-07 | image XMP | round-trip |
| EX-08 | video sidecar | round-trip |
| EX-09 | deleted asset | 원본 metadata 유지 |
| EX-10 | duplicate IDs | restore dedup |

### 수동 provider 검수

- 동일 character element로 GPT/Gemini/Grok 각 1회 생성한다.
- 정면/측면 refs를 섞고 얼굴·복장 drift를 비교한다.
- dropped ref warning이 provider capacity와 일치하는지 확인한다.
- prompt history에 notes가 중복 노출되지 않는지 확인한다.
- test sheet 4개를 `assets/070/`에 provider/element ID와 함께 보존한다.
