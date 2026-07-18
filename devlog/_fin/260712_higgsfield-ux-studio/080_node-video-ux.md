---
created: 2026-07-12
tags: [ima2-gen, phase, node-canvas, video]
---

# Phase 080 — 노드 템플릿/팔레트 + 비디오 모션 칩/extend

스펙: `006_node-canvas-ux.md` + `007_video-ux.md`. 성격이 같은 "기존
워크스페이스에 스튜디오 어휘 입히기" 작업 두 벌을 한 phase로 묶는다.
상호 독립이라 내부에서 병렬 가능.

## 노드 (006)

1. 빈 상태 3택(빈 캔버스/템플릿/최근) + 시드 템플릿 4~6개.
2. 템플릿 저장/복원(미디어 strip 직렬화, 050 `kind: template`).
3. `/` 커맨드 팔레트 + 포트 드래그 호환 필터 삽입 + 미니맵.
4. 분기 비교 액션(프로바이더/설정 병렬 분기).
5. 070에서 미룬 요소 노드 타입 결정 포함.

## 비디오 (007)

1. `VideoControlsPanel` 카메라 모션 칩(060 컴파일러 + 배타 그룹 규칙).
2. Extend: 마지막 프레임 → 다음 I2V 첫 프레임 "이어가기"(갤러리 타일에도).
   `parentId` 기록.
3. 미결정: ffmpeg concat 단일 mp4 내보내기, 동기 컴페어 뷰 — 090 원장.

## Done 기준

- 템플릿 라운드트립 + 호환 필터 매트릭스 + 모션 칩 배타 규칙 테스트.
- extend 프레임 추출→주입 계약 테스트.
- 100+ 노드 팬/줌 프로파일 수치 → `assets/080/`.

상태: pending (비디오 foundation 존재, 노드 전면 신규)

## 2026-07-15 현재 코드 상태 (sol 탐색 기반)

### Sub-track A — Node: 전면 신규
- `lib/nodeTemplateStore.ts` — 미존재
- `ui/src/components/NodeCanvas.tsx` — React Flow 캔버스. 등록된 node type은 `imageNode` 하나뿐 (line 45). empty state는 "add first" 버튼만 (line 111-114)
- `ui/src/store/storeGraphNodeImpl.ts` — 모든 생성 노드가 `type: "imageNode"` (line 54-68). template/typed-node 지원 없음
- `lib/nodeValidation.ts` — prompt/ref/moderation 검증만. port type 정의나 compatibility 로직 없음
- 서버 graph persistence: `lib/sessionStore.ts` → client `storeGraphSave.ts` 경로. `lib/nodeStore.ts`는 생성 결과 바이트 + sidecar 저장용

### Sub-track B — Video motion: 부분 존재
- `lib/videoMotionPresets.ts` — 미존재 (신규 구현 필요)
- `ui/src/components/VideoControlsPanel.tsx` (line 123-131) — camera-motion preset 칩이 이미 렌더됨. 060 preset 시스템 기반. 전용 motion catalog/exclusive group 로직은 없음

### Sub-track C — Video extend: foundation 존재 (계획된 async-202 흐름은 아직)
- `routes/videoExtended.ts` (line 191) — `POST /api/video/extend` 존재. 단, 현재는 동기 provider 호출 후 JSON 반환이며, 계획된 async-202 + 로컬 프레임 추출→I2V 주입 오케스트레이션은 미구현
- `lib/videoFrameExtract.ts` (line 56-60) — last-frame 추출 존재 (`-sseof -3` FFmpeg). 안전한 base64 helper도 있음 (line 68-77). 이 foundation 위에 extend 오케스트레이션을 구축
- `lib/videoContinuity.ts` (line 124) — continuity lineage 존재. extend 저장 시 사용됨 (videoExtended.ts line 83). 참고: `lib/videoSeriesChain.ts`는 구형 topic-chain 리더로, 실제 continuity owner는 `videoContinuity.ts`
- `ui/src/components/ResultActions.tsx` — "Animate" action은 non-video item에만 존재 (line 51). video 전용 "Extend" action은 미노출

### 테스트: 1187 pass / 0 fail (2026-07-15 기준)

## Diff-Level Implementation Spec

Node templates/palette/branching과 video motion/extend는 독립 sub-track으로 진행할 수 있다. 단, `ElementReferenceNode`만 070 완료를 선행 조건으로 둔다.

### Sub-track A — Node templates + palette

#### Server / domain

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `lib/nodeTemplateStore.ts` | template CRUD, seed 4–6개, media strip 직렬화와 실행 결과 제거 규칙을 구현한다. 050의 `kind: template` 저장 계약을 사용한다. | +180 |

#### Frontend

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `ui/src/components/node-canvas/NodeCanvasEmptyState.tsx` | 빈 캔버스/템플릿/최근의 3택 empty state를 구현한다. | +140 |
| NEW | `ui/src/components/node-canvas/NodeTemplatePicker.tsx` | seed와 사용자 저장 template 목록, preview, restore 진입을 구현한다. | +130 |
| NEW | `ui/src/components/node-canvas/NodeCommandPalette.tsx` | `/` 검색, 키보드 탐색, node type 삽입을 구현한다. | +170 |
| NEW | `ui/src/lib/nodeCompatibility.ts` | source/target port type 호환 매트릭스와 드래그 중 삽입 후보 필터를 제공한다. | +90 |
| NEW | `ui/src/lib/nodeBranching.ts` | 선택 node를 provider/설정별 2–4개 병렬 branch로 변환하고 edge를 보존한다. | +100 |
| NEW | `ui/src/components/node-canvas/ElementReferenceNode.tsx` | 070의 영속 element를 refs/notes 입력으로 공급하는 node type을 구현한다. | +110 |

#### Tests

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `tests/node-template-contract.test.ts` | template save→restore round-trip, seed load, strip 직렬화 및 media/results 제거를 검증한다. | +170 |
| NEW | `tests/node-compatibility.test.ts` | 모든 port type 조합, 비호환 drag 차단, 유효 삽입 후보와 branching edge 보존을 검증한다. | +130 |

### Sub-track B — Video motion

#### Server / domain

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `lib/videoMotionPresets.ts` | camera motion catalog, provider별 prompt fragment, 선택 상한과 배타 그룹을 정의한다. | +100 |

#### Frontend

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `ui/src/lib/videoMotionSelection.ts` | motion chip toggle, 선택 상한, 배타 그룹 충돌 차단을 순수 함수로 구현한다. | +70 |
| MODIFY | `ui/src/components/VideoControlsPanel.tsx` | 060 preset UI를 확장한 camera motion chip row와 충돌/상한 피드백을 추가한다. | +55 |

#### Tests

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| NEW | `tests/video-motion-presets.test.ts` | provider fragment snapshot, 선택 상한, 배타 그룹, toggle 순서 계약을 검증한다. | +120 |

### Sub-track C — Video extend

#### Server / domain

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| MODIFY | `lib/videoFrameExtract.ts` | 생성 비디오의 마지막 프레임을 안전하게 추출해 다음 I2V 입력으로 반환하는 계약을 확장한다. | +45 |
| MODIFY | `lib/videoSeriesChain.ts` | extend 결과의 `parentId` lineage와 series 순서/조회 계약을 추가한다. | +55 |
| MODIFY | `routes/videoExtended.ts` | last-frame extraction → I2V injection → child 저장을 orchestration하고 실패 경계를 명시한다. | +70 |

#### Frontend

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| MODIFY | `ui/src/components/ResultActions.tsx` | 비디오 결과와 갤러리 tile에 "이어가기" action을 추가하고 extend 요청 상태를 표시한다. | +30 |

#### Tests

| Op | File | 구현 내용 | 예상 증감 |
|----|------|-----------|-----------|
| MODIFY | `tests/videoExtendedRoute.test.ts` | 마지막 프레임 추출→I2V 주입, `parentId` lineage, 추출 실패 응답 계약을 확장한다. | +90 |

### Done criteria

- node template save→restore round-trip이 통과하고 직렬화 결과에서 media/results가 제거된다.
- port compatibility 매트릭스 전수 테스트와 비호환 drag 필터 계약이 통과한다.
- video motion chip 선택 상한·배타 그룹 계약 테스트가 통과한다.
- video extend의 last-frame extraction→I2V injection과 `parentId` lineage 계약이 통과한다.
- 100개 이상 node 그래프의 pan/zoom 프로파일이 허용 기준을 충족하고 증거를 `assets/080/`에 남긴다.
- ffmpeg concat 단일 MP4와 동기 compare view는 구현하지 않고 090 미결정 원장에 유지한다.

### Dependencies on prior phases

- 020의 `Chip`/`ChipRow`를 video motion 선택 UI에 재사용한다.
- 040의 갤러리 체이닝/ResultActions 패턴을 video extend 진입점에 확장한다.
- 050의 `kind: template` 저장 계층과 media strip 직렬화 계약에 의존한다.
- 060의 preset compiler/provider fragment 규칙을 video motion compiler에 재사용한다.
- 070 완료 후에만 `ElementReferenceNode`를 활성화한다. 나머지 node/video sub-track은 병렬 진행 가능하다.

## 구현 파일 명세표

현재 저장소의 `NodeCanvas.tsx`, `nodeStore.ts`, `nodeValidation.ts`, video continuity 모듈을 실제 소유자로 삼는다. `.js` 산출물은 빌드로 갱신한다.

| Op | 경로 | 책임 | 예상 LOC |
|---|---|---|---:|
| NEW | `lib/nodeTemplateStore.ts` | seed/user template CRUD와 strip | 220 |
| NEW | `lib/nodeTemplateSeeds.ts` | 4–6개 seed graph 정의 | 180 |
| MODIFY | `lib/nodeStore.ts` | graph clone/template persistence 연결 | 45 |
| MODIFY | `routes/nodes.ts` | template CRUD/copy endpoint | 75 |
| MODIFY | `lib/nodeValidation.ts` | 새 node/edge validation | 35 |
| NEW | `ui/src/components/node-canvas/NodeCanvasEmptyState.tsx` | 3-choice 진입 | 150 |
| NEW | `ui/src/components/node-canvas/NodeTemplatePicker.tsx` | template 검색/preview/copy | 160 |
| NEW | `ui/src/components/node-canvas/NodeCommandPalette.tsx` | `/`/Space insertion palette | 190 |
| NEW | `ui/src/components/node-canvas/NodeBranchDialog.tsx` | 2–4 branch 설정 | 140 |
| NEW | `ui/src/components/node-canvas/ElementReferenceNode.tsx` | element refs/notes node | 130 |
| NEW | `ui/src/lib/nodeCompatibility.ts` | port matrix와 후보 filter | 120 |
| NEW | `ui/src/lib/nodeBranching.ts` | pure graph transform | 140 |
| NEW | `ui/src/lib/nodeTemplateClient.ts` | template API client | 70 |
| MODIFY | `ui/src/components/NodeCanvas.tsx` | empty/palette/branch/element 통합 | 100 |
| MODIFY | `ui/src/store/storeGraphNodeImpl.ts` | compatible insertion/branch apply | 55 |
| MODIFY | `ui/src/store/storeTypes.ts` | node template/palette types | 60 |
| MODIFY | `ui/src/store/useAppStore.ts` | node actions binding | 25 |
| NEW | `lib/videoMotionPresets.ts` | motion catalog/provider fragments | 130 |
| NEW | `ui/src/lib/videoMotionSelection.ts` | exclusive toggle reducer | 90 |
| MODIFY | `ui/src/components/VideoControlsPanel.tsx` | motion chip row | 75 |
| MODIFY | `lib/videoFrameExtract.ts` | robust last-frame extraction | 55 |
| MODIFY | `lib/videoSeriesChain.ts` | parent/series lineage | 70 |
| MODIFY | `routes/videoExtended.ts` | continuation orchestration | 100 |
| MODIFY | `ui/src/components/ResultActions.tsx` | Extend entry/status | 35 |
| MODIFY | `ui/src/store/storeVideoImpl.ts` | extend request/SSE state | 50 |
| MODIFY | `ui/src/types.ts` | motion/lineage fields | 35 |
| NEW | `tests/node-template-contract.test.ts` | strip/copy/CRUD | 220 |
| NEW | `tests/node-compatibility.test.ts` | matrix/branch transform | 210 |
| NEW | `tests/video-motion-presets.test.ts` | fragment/toggle matrix | 150 |
| MODIFY | `tests/videoExtendedRoute.test.ts` | extraction/I2V/lineage failures | 110 |
| NEW | `tests/node-studio-ui-contract.test.js` | empty/palette/element contracts | 120 |

## 노드 템플릿 시스템

### 저장 타입

```ts
export interface NodeTemplateRecord {
  id: string;
  name: string;
  description: string;
  source: "seed" | "user";
  graph: NodeTemplateGraph;
  thumbnail?: string;
  tags: string[];
  version: 1;
  createdAt: number;
  updatedAt: number;
}

export interface NodeTemplateGraph {
  nodes: SerializedTemplateNode[];
  edges: SerializedTemplateEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface StripTemplateOptions {
  preservePrompt: boolean;
  preserveProvider: boolean;
}

export interface NodeTemplateStore {
  list(): Promise<NodeTemplateRecord[]>;
  get(id: string): Promise<NodeTemplateRecord | null>;
  create(input: CreateNodeTemplateInput): Promise<NodeTemplateRecord>;
  update(id: string, patch: UpdateNodeTemplateInput): Promise<NodeTemplateRecord>;
  remove(id: string): Promise<void>;
  instantiate(id: string): Promise<NodeTemplateGraph>;
}
```

### strip 알고리즘

```ts
export function stripGraphForTemplate(
  graph: SessionGraph,
  options: StripTemplateOptions,
): NodeTemplateGraph;
```

1. graph를 structured clone한다.
2. node ID를 template-local ID로 안정적으로 재매핑한다.
3. edge source/target을 새 ID로 재매핑한다.
4. 생성 결과 URL과 로컬 output path를 제거한다.
5. upload/reference media path를 placeholder slot으로 바꾼다.
6. thumbnail, progress, error, requestId를 제거한다.
7. inflight/pending status를 `idle`로 바꾼다.
8. sessionId, parentId, lineage ID를 제거한다.
9. provider는 option이 true일 때만 보존한다.
10. prompt는 option이 true일 때만 보존한다.
11. secret/API key/authorization 필드는 key 이름 기반으로 거부한다.
12. node position과 dimensions는 보존한다.
13. edge label과 port handle은 보존한다.
14. dangling edge는 제거하고 diagnostic에 기록한다.
15. 결과를 schema validation한 뒤 저장한다.

### instantiate 알고리즘

- template 원본을 변경하지 않는다.
- 모든 node ID를 새 client ID로 바꾼다.
- edge ID도 새로 만든다.
- media placeholder는 unresolved 상태로 표시한다.
- viewport는 fit-to-view를 기본으로 한다.
- seed의 provider가 unavailable이면 default provider로 치환하고 경고한다.
- copy 결과는 즉시 일반 session graph로 저장한다.
- template ID는 provenance에만 남긴다.
- template을 열었다고 자동 실행하지 않는다.

### seed templates

| ID | 이름 | graph |
|---|---|---|
| `seed-four-variations` | 이미지 4변형 비교 | prompt → 4 generator → 4 result |
| `seed-reference-edit-i2v` | 참조→편집→I2V | reference → edit → video |
| `seed-style-ab` | 스타일 A/B | prompt → 2 style branch → result |
| `seed-character-sheet` | 캐릭터 시트 | element → 4 angle prompts → result |
| `seed-provider-compare` | 프로바이더 비교 | shared input → GPT/Gemini/Grok |

각 seed는 최소 node 수, required placeholder, expected terminal result 수를 manifest에 기록한다. startup audit가 실제 graph와 manifest를 비교한다.

### CRUD 규칙

- seed는 수정/삭제할 수 없다.
- seed rename은 locale label layer에서만 한다.
- user template 이름은 1–80자다.
- duplicate name은 허용하되 생성 시 suffix를 제안한다.
- delete는 현재 session graph에 영향이 없다.
- update는 template version timestamp를 갱신한다.
- instantiate는 사본만 반환한다.
- corrupted template은 목록에서 error badge로 보인다.
- import/export는 이 phase의 non-goal이다.

### 빈 상태 3-choice

```ts
export interface NodeCanvasEmptyStateProps {
  hasRecentGraph: boolean;
  onStartBlank(): void;
  onOpenTemplates(): void;
  onResumeRecent(): Promise<void>;
}
```

- “빈 캔버스로 시작”은 기본 prompt node 하나를 만든다.
- “템플릿에서 시작”은 picker를 연다.
- “최근 그래프 이어가기”는 최신 유효 graph를 연다.
- recent가 없으면 세 번째 카드는 disabled다.
- modal tutorial을 먼저 띄우지 않는다.
- keyboard tab 순서는 세 선택의 시각 순서다.
- mobile은 세 카드를 세로로 쌓는다.
- 선택 후 empty state는 history에 남지 않는다.

### template picker

- seed와 user 섹션을 분리한다.
- name/tags 검색을 제공한다.
- card에 결과물 이름, node 수, terminal 수를 표시한다.
- preview는 정적 mini graph다.
- Enter는 선택, 별도 “사본 만들기”로 확정한다.
- user template에는 rename/delete menu가 있다.
- delete 전 confirmation을 요구한다.
- loading/error/empty 상태를 각각 구현한다.
- picker 닫기 후 canvas focus를 복원한다.

## 커맨드 팔레트

### trigger

- canvas focus 상태에서 `/`를 누르면 연다.
- text input/textarea/contenteditable 안에서는 열지 않는다.
- Space도 빈 canvas에서 열 수 있다.
- port drag가 진행 중이면 release 시 filtered palette를 연다.
- Escape는 닫고 canvas focus를 복원한다.
- palette가 열려 있을 때 shortcut event propagation을 막는다.

```ts
export interface NodeCommandDescriptor {
  type: string;
  label: string;
  description: string;
  category: "input" | "generate" | "transform" | "reference" | "output";
  keywords: string[];
  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];
  createData(): ImageNodeData;
}

export interface NodeCommandPaletteProps {
  open: boolean;
  anchor: { clientX: number; clientY: number };
  sourcePort?: PortDescriptor;
  commands: readonly NodeCommandDescriptor[];
  onInsert(command: NodeCommandDescriptor): void;
  onClose(): void;
}
```

### search

1. 빈 query는 최근 사용 5개 + category 목록을 보인다.
2. exact label prefix를 최우선한다.
3. label substring을 다음으로 둔다.
4. keywords substring을 다음으로 둔다.
5. description match를 마지막으로 둔다.
6. 호환되지 않는 command는 검색 전에 제거한다.
7. 결과가 0개면 source port type을 설명한다.
8. query는 locale lowercase로 정규화한다.
9. debounce는 필요 없고 메모리 filter를 쓴다.
10. 최근 사용 기록은 node type ID만 저장한다.

### canvas coordinate insertion

```ts
export interface InsertNodeAtCanvasPointInput {
  screenPoint: { x: number; y: number };
  viewport: { x: number; y: number; zoom: number };
  command: NodeCommandDescriptor;
  sourcePort?: PortDescriptor;
}
```

- screen coordinate를 React Flow project 좌표로 변환한다.
- 새 node 중심이 pointer에 오도록 크기 절반을 보정한다.
- viewport 밖이면 visible bounds로 clamp한다.
- source port가 있으면 compatible input port에 edge를 자동 생성한다.
- compatible input이 여러 개면 명시적 port picker를 연다.
- insertion과 edge 생성은 하나의 undo transaction이다.
- 실패 시 node와 edge를 모두 rollback한다.
- 성공 후 새 node를 선택하고 focus한다.

### keyboard

| 키 | 동작 |
|---|---|
| ArrowDown/Up | 결과 이동 |
| Home/End | 첫/끝 결과 |
| Enter | 삽입 |
| Tab | category 이동 |
| Escape | 닫기 |
| Ctrl/Cmd+Backspace | query clear |

## 포트 호환 매트릭스

### 타입

```ts
export type NodePortType =
  | "prompt"
  | "image"
  | "images"
  | "video"
  | "mask"
  | "element-refs"
  | "element-notes"
  | "settings"
  | "any-media";

export interface PortDescriptor {
  nodeId: string;
  handleId: string;
  direction: "input" | "output";
  type: NodePortType;
  acceptsMany?: boolean;
}

export interface CompatibilityResult {
  allowed: boolean;
  reason?: "SAME_DIRECTION" | "TYPE_MISMATCH" | "CARDINALITY" | "SELF_EDGE" | "DUPLICATE_EDGE";
}

export function canConnectPorts(
  source: PortDescriptor,
  target: PortDescriptor,
  graph: GraphSnapshot,
): CompatibilityResult;
```

### type matrix

`✓`는 허용, `—`는 거부다. 행은 output, 열은 input이다.

| out \\ in | prompt | image | images | video | mask | element-refs | element-notes | settings | any-media |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| prompt | ✓ | — | — | — | — | — | ✓ | — | — |
| image | — | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ |
| images | — | — | ✓ | — | — | ✓ | — | — | ✓ |
| video | — | — | — | ✓ | — | — | — | — | ✓ |
| mask | — | — | — | — | ✓ | — | — | — | ✓ |
| element-refs | — | ✓ | ✓ | — | — | ✓ | — | — | ✓ |
| element-notes | ✓ | — | — | — | — | — | ✓ | — | — |
| settings | — | — | — | — | — | — | — | ✓ | — |
| any-media | — | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |

### 추가 규칙

- output→input 방향만 허용한다.
- 같은 node self-edge는 거부한다.
- 같은 handles의 duplicate edge는 거부한다.
- single input에 기존 edge가 있으면 replace confirmation이 필요하다.
- `acceptsMany` input은 복수 edge를 허용한다.
- cycle 허용 여부는 기존 graph policy를 따른다.
- matrix 허용 후 node-specific validation을 수행한다.
- element refs를 video input에 직접 연결하지 않는다.
- element notes는 prompt-compatible input에만 연결한다.
- rejected reason을 drag tooltip에 표시한다.

### filtered insertion

source output type과 하나 이상의 compatible input을 가진 command만 보인다. command 생성 후 compatible input이 하나면 자동 연결하고, 둘 이상이면 port picker를 표시한다.

## 분기(Branching) 구현

### 입력/출력

```ts
export interface BranchVariant {
  id: string;
  label: string;
  provider?: string;
  settingsPatch: Partial<ImageNodeData>;
}

export interface BranchGraphInput {
  graph: GraphSnapshot;
  sourceNodeId: string;
  variants: readonly BranchVariant[];
  axis: "horizontal" | "vertical";
}

export interface BranchGraphOutput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdNodeIds: string[];
  createdEdgeIds: string[];
}
```

### graph transform

1. variant 수가 2–4인지 검증한다.
2. source node를 조회한다.
3. source의 downstream generator를 template로 선택한다.
4. generator data를 variant별 deep clone한다.
5. provider/settings patch만 적용한다.
6. 새 node ID를 발급한다.
7. source→generator shared input edge를 각 branch에 만든다.
8. 기존 result node가 있으면 branch별 result를 clone한다.
9. branch 간 수평 또는 수직 간격을 일정하게 배치한다.
10. 기존 graph와 충돌하지 않도록 bounds offset을 계산한다.
11. 원본 branch 보존 여부를 dialog option으로 받는다.
12. 모든 변경을 하나의 undo transaction으로 적용한다.
13. validation 실패 시 graph 전체를 원상 복구한다.

### shared input

- prompt/reference/settings source는 clone하지 않는다.
- generator와 terminal result만 branch별로 만든다.
- shared node 수정은 모든 branch에 반영된다.
- provider-specific unsupported input은 branch diagnostic으로 표시한다.
- shared input edge label은 유지한다.

### provider variation

- provider 선택은 available capabilities로 제한한다.
- 같은 provider를 settings 차이로 여러 번 선택할 수 있다.
- label default는 provider + 핵심 setting이다.
- 각 branch는 독립 requestId를 가진다.
- 실행은 기존 최대 12 병렬 큐를 사용한다.
- 4 branch × multi-count가 12를 넘으면 실행 전에 경고한다.
- 한 branch 실패가 나머지를 cancel하지 않는다.
- 결과 compare 진입을 위해 branch group ID를 기록한다.

## 비디오 모션 칩

### preset 타입

```ts
export interface VideoMotionPreset {
  id: string;
  label: string;
  fragment: string;
  perProvider?: Partial<Record<PresetProvider, string>>;
  exclusiveGroup?: string;
  intensity?: "subtle" | "medium" | "strong";
  maxWith?: number;
}

export interface MotionSelectionState {
  ids: string[];
  rejected?: { id: string; reason: "LIMIT" | "EXCLUSIVE" };
}
```

### seed definitions

| ID | group | default fragment |
|---|---|---|
| `motion-dolly-in` | dolly-direction | slow dolly toward the subject |
| `motion-dolly-out` | dolly-direction | dolly away revealing the scene |
| `motion-orbit-left` | orbit-direction | orbit left around the subject |
| `motion-orbit-right` | orbit-direction | orbit right around the subject |
| `motion-crane-up` | crane-direction | crane upward into a wide reveal |
| `motion-crane-down` | crane-direction | crane downward toward the subject |
| `motion-whip-pan` | pan-style | rapid whip pan transition |
| `motion-fpv` | camera-rig | dynamic FPV flight path |
| `motion-handheld` | camera-rig | natural handheld camera movement |
| `motion-bullet-time` | temporal-style | dramatic bullet-time orbit |
| `motion-hyperlapse` | temporal-style | accelerated hyperlapse movement |
| `motion-static` | camera-rig | locked-off static camera |

### provider fragments

- GPT는 자연어 camera sentence를 사용한다.
- Gemini는 optical movement와 framing을 명시한다.
- Grok은 짧은 motion phrase와 intensity param을 함께 쓸 수 있다.
- override가 없으면 default fragment를 사용한다.
- catalog는 060 preset compiler 형식을 재사용한다.
- 별도 이중 catalog를 만들 경우 ID collision audit를 둔다.

### exclusive groups

- 같은 group에서 최대 1개다.
- `motion-static`은 모든 camera-rig/movement와 배타다.
- temporal-style은 camera movement와 조합 가능하다.
- 전체 선택 상한은 기본 3개다.
- provider capability가 더 낮으면 동적으로 줄인다.
- 충돌 chip 선택 시 기존 것을 교체하지 않고 거부한다.
- tooltip에 충돌한 chip label을 표시한다.

### toggle reducer

```ts
export function toggleMotionPreset(
  state: MotionSelectionState,
  id: string,
  catalog: ReadonlyMap<string, VideoMotionPreset>,
  limit: number,
): MotionSelectionState;
```

1. 이미 선택된 ID면 제거한다.
2. unknown ID면 개발 오류를 throw한다.
3. limit에 도달하면 기존 state + rejected를 반환한다.
4. exclusiveGroup 충돌이면 rejected를 반환한다.
5. 충돌이 없으면 맨 뒤에 추가한다.
6. 성공 시 이전 rejected를 지운다.
7. 입력 state 배열을 mutate하지 않는다.
8. 선택 순서는 compiler fragment 순서다.

## 비디오 Extend

### 요청 타입

```ts
export interface ExtendVideoRequest {
  sourceVideoId: string;
  prompt?: string;
  provider?: string;
  motionPresetIds?: string[];
  duration?: number;
}

export interface VideoLineage {
  id: string;
  parentId?: string;
  rootId: string;
  seriesId: string;
  sequenceIndex: number;
  continuationFramePath?: string;
}
```

### last-frame extraction

1. source video record를 조회한다.
2. local path가 허용 root 안인지 검증한다.
3. ffprobe로 duration/stream을 확인한다.
4. 마지막 timestamp보다 1 frame 앞을 계산한다.
5. 기존 `videoFrameExtract.ts` helper로 PNG를 추출한다.
6. 추출 결과가 non-empty image인지 확인한다.
7. temp file을 job-owned artifact로 등록한다.
8. 실패 시 I2V 요청을 시작하지 않는다.
9. 오류에는 source ID만 노출한다.
10. job 종료 시 retention policy에 따라 temp를 정리한다.

### I2V injection

- 추출 frame은 first-frame source로 강제한다.
- 사용자가 별도 first frame을 동시에 넣을 수 없다.
- parent prompt는 새 prompt가 비면 재사용한다.
- motion preset은 새 선택을 우선하고 없으면 parent 것을 복원한다.
- provider가 I2V를 지원하지 않으면 시작 전에 거부한다.
- resolution/aspect는 parent와 호환 가능한 default를 쓴다.
- white-canvas shim 등 기존 provider adapter를 그대로 통과한다.
- continuation frame은 element ref보다 slot 우선순위가 높다.

### continuation orchestration

```text
POST /api/video/:id/extend
 -> validate source + capability
 -> start inflight job
 -> extract last frame
 -> build I2V request
 -> publish queued/running SSE
 -> provider generate
 -> persist child video
 -> append series lineage
 -> publish done
```

- POST는 기존 async 202 패턴을 따른다.
- requestId 중복은 기존 inflight 정책으로 거부한다.
- cancel은 extraction 또는 provider generation을 중단한다.
- extraction artifact만 생긴 실패도 cleanup한다.
- child 저장과 lineage append는 논리적으로 원자적이어야 한다.
- lineage 실패 시 orphan child를 diagnostic으로 표시하고 repair 가능하게 한다.
- SSE done은 저장 완료 뒤 한 번만 publish한다.

### parentId lineage

- child `parentId`는 직접 source ID다.
- rootId는 최초 clip ID다.
- seriesId는 첫 extend에서 생성해 후손이 공유한다.
- sequenceIndex는 parent + 1이다.
- 같은 parent에서 여러 extend는 sibling이다.
- sibling도 동일 series에 들어가되 branch 정보를 보존한다.
- cycle은 저장 validation에서 거부한다.
- parent 삭제 후 child lineage는 tombstone ID를 유지한다.
- metadata restore에서 lineage를 재구성할 수 있어야 한다.

### 실패 계약

| 실패 | HTTP/SSE code | retry |
|---|---|---|
| source 없음 | `VIDEO_NOT_FOUND` | no |
| unsupported provider | `VIDEO_EXTEND_UNSUPPORTED` | no |
| corrupt source | `VIDEO_FRAME_EXTRACT_FAILED` | source 교체 |
| timeout | `VIDEO_FRAME_EXTRACT_TIMEOUT` | yes |
| provider failure | 기존 normalized code | yes |
| lineage write failure | `VIDEO_LINEAGE_WRITE_FAILED` | repair |
| canceled | `CANCELED` | user choice |

## ElementReferenceNode

### node data

```ts
export interface ElementReferenceNodeData {
  nodeType: "element-reference";
  elementId: string | null;
  elementName?: string;
  refCount: number;
  notesPreview?: string;
  missing: boolean;
}
```

### ports

| Handle | Direction | Type | Cardinality |
|---|---|---|---|
| `refs` | output | `element-refs` | many consumers |
| `notes` | output | `element-notes` | many consumers |
| `element` | internal selector | n/a | one element |

### drag-from-assets

1. AssetsGrid drag payload에 `assetKind=element`, `elementId`를 넣는다.
2. NodeCanvas drop zone이 payload를 검증한다.
3. drop screen point를 canvas point로 변환한다.
4. element snapshot을 조회한다.
5. `ElementReferenceNode`를 생성한다.
6. ref count/name/thumbnail을 표시한다.
7. drag 중 호환 target 위면 자동 연결 preview를 표시한다.
8. drop 생성과 edge 연결을 하나의 undo transaction으로 묶는다.
9. 070 미완료면 payload type을 등록하지 않는다.

### connection rules

- `refs` → image/images/element-refs input 허용.
- `notes` → prompt/element-notes input 허용.
- refs를 settings 또는 video port에 직접 연결하지 않는다.
- notes를 image port에 연결하지 않는다.
- 하나의 element node는 여러 generator가 공유할 수 있다.
- 삭제된 element는 node를 삭제하지 않고 missing 상태로 둔다.
- missing node는 실행 validation을 차단한다.
- element 변경은 다음 실행에 최신 refs를 사용한다.
- 재현성을 위해 실행 snapshot에는 resolved element revision을 기록한다.

### 렌더링

- 대표 thumbnail과 kind badge를 표시한다.
- ref count를 `6 refs` 형태로 표시한다.
- notes가 있으면 2줄 preview를 표시한다.
- double click은 Assets detail을 연다.
- missing은 red chrome 대신 명확한 warning row를 쓴다.
- compact zoom에서는 thumbnail + name만 남긴다.
- keyboard Delete는 기존 node deletion flow를 따른다.

## 테스트 시나리오 매트릭스

### template

| ID | 시나리오 | 기대 |
|---|---|---|
| NT-01 | save graph | user template 생성 |
| NT-02 | output URL 포함 | strip 제거 |
| NT-03 | upload path 포함 | placeholder 변환 |
| NT-04 | pending node | idle 복원 |
| NT-05 | dangling edge | 제거 + diagnostic |
| NT-06 | secret-like key | 저장 거부 |
| NT-07 | instantiate | 새 IDs |
| NT-08 | instantiate twice | 서로 다른 copies |
| NT-09 | seed update/delete | 거부 |
| NT-10 | corrupt template | error badge |
| NT-11 | recent 없음 | third choice disabled |
| NT-12 | template open | 자동 실행 없음 |

### palette/compatibility

| ID | 시나리오 | 기대 |
|---|---|---|
| NC-01 | `/` canvas | palette open |
| NC-02 | `/` textarea | 문자 입력 |
| NC-03 | port drag image | image-compatible만 |
| NC-04 | prompt→prompt | 허용 |
| NC-05 | image→video | 거부 |
| NC-06 | video→any-media | 허용 |
| NC-07 | same direction | 거부 |
| NC-08 | self edge | 거부 |
| NC-09 | duplicate edge | 거부 |
| NC-10 | single occupied | replace 안내 |
| NC-11 | insertion | canvas coordinate 정확 |
| NC-12 | undo | node+edge 함께 제거 |
| NC-13 | search Korean | label filter |
| NC-14 | no candidates | type 설명 |

### branching

| ID | 입력 | 기대 |
|---|---|---|
| NB-01 | 2 variants | 2 branches |
| NB-02 | 4 variants | 4 branches |
| NB-03 | 1 variant | validation error |
| NB-04 | 5 variants | validation error |
| NB-05 | provider compare | shared prompt 유지 |
| NB-06 | settings compare | provider 동일 허용 |
| NB-07 | existing result | result clone |
| NB-08 | graph collision | offset placement |
| NB-09 | invalid patch | full rollback |
| NB-10 | undo | transaction 전체 제거 |
| NB-11 | one branch failure | others continue |
| NB-12 | queue > 12 | warning |

### motion chips

| ID | 시나리오 | 기대 |
|---|---|---|
| VM-01 | dolly-in toggle | add |
| VM-02 | same toggle | remove |
| VM-03 | dolly-in + out | exclusive reject |
| VM-04 | orbit + hyperlapse | allowed |
| VM-05 | static + handheld | reject |
| VM-06 | 3 selected | limit reached |
| VM-07 | unknown ID | dev error |
| VM-08 | GPT compile | GPT fragment |
| VM-09 | Gemini compile | override fragment |
| VM-10 | Grok compile | fragment + params |
| VM-11 | restore order | stable |
| VM-12 | provider lower limit | dynamic rejection |

### Extend

| ID | 시나리오 | 기대 |
|---|---|---|
| VE-01 | valid source | 202 + child |
| VE-02 | missing source | 404 typed error |
| VE-03 | corrupt source | extraction failure |
| VE-04 | extraction timeout | retryable error |
| VE-05 | unsupported provider | preflight reject |
| VE-06 | prompt omitted | parent prompt reuse |
| VE-07 | motion omitted | parent motion reuse |
| VE-08 | cancel extracting | no provider call |
| VE-09 | cancel generating | no done event |
| VE-10 | child success | parentId exact |
| VE-11 | second extend | root/series preserved |
| VE-12 | sibling extends | same parent, distinct IDs |
| VE-13 | lineage cycle | reject |
| VE-14 | element refs full | continuity wins |
| VE-15 | SSE reconnect | terminal replay once |

### ElementReferenceNode

| ID | 시나리오 | 기대 |
|---|---|---|
| EN-01 | drag element | node at drop point |
| EN-02 | drag non-element | ignore |
| EN-03 | refs→image | connect |
| EN-04 | refs→video | reject |
| EN-05 | notes→prompt | connect |
| EN-06 | notes→image | reject |
| EN-07 | deleted element | missing state |
| EN-08 | missing execute | blocked |
| EN-09 | element updated | latest revision |
| EN-10 | undo drop | node+edge removed |

### 성능/수동 검수

- seed를 반복 복제해 100 node/140 edge graph를 만든다.
- idle pan/zoom 평균 FPS와 p95 frame time을 기록한다.
- palette search open latency를 기록한다.
- fit-to-view 후 모든 node bounds가 보이는지 확인한다.
- 4-provider/settings branch 실행에서 큐가 12 상한을 지키는지 확인한다.
- 10초 clip Extend의 첫 frame 연속성을 눈검수한다.
- parent/child sidecar lineage를 직접 비교한다.
- keyboard-only로 empty state→template→palette insertion을 완료한다.
- 증거 JSON, screenshots, videos를 `assets/080/`에 남긴다.

### 완료 수치 기준

- 100 node graph pan/zoom p95 frame time은 33ms 이하를 목표로 한다.
- palette local search p95는 50ms 이하를 목표로 한다.
- template instantiate는 500ms 이하를 목표로 한다.
- branch transform pure function은 10ms 이하를 목표로 한다.
- Extend extraction timeout은 config owner의 기존 timeout 정책을 따른다.
- 수치 미달 시 phase를 완료 처리하지 않고 profile artifact를 남긴다.
