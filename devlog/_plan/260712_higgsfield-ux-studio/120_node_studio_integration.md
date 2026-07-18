---
created: 2026-07-18
tags: [ima2-gen, phase, node-studio, integration, ui-contract]
status: planned
---

# 120 — Node Studio UI 통합 + 계약 테스트

## Loop spec

- Archetype: spec-satisfaction integration repair.
- Trigger: 080에서 만든 empty state/template picker/command palette/compatibility/branching/ElementReferenceNode가 단위 테스트만 통과하고 실제 `NodeCanvas` 소비 경로에는 연결되지 않았다.
- Goal: 기존 Node Studio 부품을 한 사용자 흐름으로 연결하고, 캔버스 경계의 타입 호환·원자적 graph commit·요소 missing 실행 차단을 `tests/node-studio-ui-contract.test.js`로 고정한다.
- Non-goals: I2V/Extend 서버 lifecycle과 `ResultActions` 상태 복구(100 문서), 100+ node 성능/프로파일링(130 문서), 새 React Flow node renderer 제품군, 범용 undo/redo 스택, agent surface.
- Verifier: focused UI contract + 기존 node template/compatibility tests, server/UI typecheck, UI build, 전체 test inventory, 로컬 브라우저 keyboard/drag/render 관찰.
- Stop: NT/NC/NB/EN 통합 계약과 아래 활성화 시나리오가 모두 통과하고 `NodeCanvas.tsx`가 500줄 미만을 유지한다.
- Memory: 이 문서, `080_node-video-ux.md:12-18`, `:489-503`, `:752-857`, `095_current_status.md:22-30`.
- Terminal: DONE / NEEDS_HUMAN(템플릿 교체·분기 의미 충돌) / BLOCKED(동일 소유 파일 충돌) / UNSAFE(부분 graph commit 가능성).
- Escalation: 같은 integration 계약이 두 번 실패하면 wrapper/hook 경계를 재설계하고, 세 번째에도 실패하면 P로 되돌린다.
- Resources: 로컬 repo와 로컬 브라우저만 사용한다. 외부 API/유료 생성은 필요 없다.

## Scope

### IN

1. 빈 그래프 3택, template picker의 두 진입점과 서버-backed copy/CRUD.
2. `/`, 빈 캔버스 Space, port-drag command palette와 focus 복원.
3. `canConnectPorts`를 실제 canvas connection 경계에서 강제하고 typed reason을 toast/status로 노출.
4. 선택 source의 2–4 variant branch를 `createBranchGraph`로 만들고 한 번에 commit.
5. `elementReferenceNode` 등록, Node sidebar의 실제 drag source, drop 생성, 최신 element resolve, missing 실행 차단.
6. `node-canvas-extras.css` 활성화와 `tests/node-studio-ui-contract.test.js`.

### OUT

- I2V last-frame injection, Extend async 202/SSE/lineage, `ResultActions.tsx` fire-and-forget 교체는 100 문서 소유다.
- `resultChaining.ts`의 Extend catalog 추가도 100 문서 소유다. 120은 기존 chaining action들이 사라지지 않았다는 subset guard만 둔다.
- 100 node/140 edge FPS, palette p95, template instantiate latency 측정은 130 문서 소유다.
- 범용 undo/redo 엔진은 만들지 않는다. 현재 graph undo owner가 없으므로 rollback 계약은 “검증 후 단일 store `set({ graphNodes, graphEdges })`”이다.
- 080 seed의 `prompt/generator/result`를 각각 별도 renderer로 승격하지 않는다. 이번 단계에서는 모두 기존 `imageNode` renderer로 normalize한다.

## 재검증된 현재 상태와 앵커 보정

| 표면 | 2026-07-18 실상 | 통합에 미치는 영향 |
|---|---|---|
| `ui/src/components/NodeCanvas.tsx:45` | `nodeTypes`는 `imageNode` 하나다. 파일은 181줄이다. | inline 확장 대신 controller/overlay를 분리하면 500줄 제한에 충분한 여유가 있다. |
| `NodeCanvas.tsx:67-74` | `onConnect`가 handle 의미를 해석하지 않고 `connectNodes`를 바로 호출한다. | canvas boundary에서 descriptor resolve → `canConnectPorts` → reason surface 순서를 강제한다. |
| `NodeCanvas.tsx:76-90` | 빈 공간 port drop은 즉시 generic child를 만든다. | filtered palette open으로 교체한다. |
| `NodeCanvas.tsx:111-114` | empty graph는 legacy plus button만 보이며 ReactFlow 자체도 렌더하지 않는다. | ReactFlow는 항상 mount하고 empty state를 overlay로 렌더해야 Space/palette/fitView가 같은 좌표계를 쓴다. |
| `NodeCanvasEmptyState.tsx:31-32` | 31은 DOM-order 주석, 실제 component 선언은 32다. 3택 순서는 이미 정확하다. | component 수정 없이 consumer wiring을 우선한다. |
| `NodeTemplatePicker.tsx:72` | seed/user/search/card/copy/rename/delete UI는 있지만 data owner가 없다. | 서버 summary API와 callback만 주입한다. |
| `NodeCommandPalette.tsx:31,40,61` | 31은 ranking, 40은 exact type equality filter, 61은 active insertion이다. | filter만 shared matrix로 교체하고 기존 keyboard/ranking을 보존한다. |
| `nodeCompatibility.ts:32,57` | matrix와 `canConnectPorts`가 존재하며 이유 union도 typed다. | type-only helper를 추가해 palette와 canvas가 같은 matrix를 사용하게 한다. |
| `nodeBranching.ts:78` | `createBranchGraph`는 additions를 계산하지만 UI/store consumer가 없다. | dialog → pure transform → one-shot graph commit을 추가한다. |
| `ElementReferenceNode.tsx:18` | renderer/refs/notes/missing UI는 있으나 등록·생성·실행 consumer가 없다. | node registry, drag/drop, reload resolve, run preflight를 함께 연결한다. |
| `ui/src/styles/node-canvas-extras.css:1` | 필요한 empty/picker/palette/element CSS가 존재한다. | `index.css` import와 branch/tray/overlay 보강만 한다. |
| `ui/src/index.css:139-160` | import 목록 전체에 extras가 없다. 148은 `gallery-modal.css`다. | 명시적 import 계약을 추가한다. |
| `lib/nodeTemplateStore.ts:81-83,86-107` | instantiate가 node/edge fresh ID를 만들고 store가 seed+SQLite user CRUD를 소유한다. | client-side seed bundle은 금지하고 REST facade를 만든다. |
| `lib/nodeTemplateSeeds.ts:37-81` | seed는 5개다. | API list가 이 5개와 user templates를 함께 노출한다. |
| `routes/nodes.ts:7-26` | generation/fetch만 있고 template route가 없다. | 별도 `routes/nodeTemplates.ts`로 책임을 분리한다. |
| `storeTypes.ts:147` / `storeGraphSave.ts:69-74` | `GraphNode` data는 image 전용이고 reload 시 type을 무조건 `imageNode`로 만든다. | element discriminator와 persistence normalization이 필요하다. |
| `storeUIImpl.ts:204-212` | node/edge setter가 각각 save를 예약한다. | multi-part op에 별도 atomic commit action이 필요하다. |
| graph undo 검색 결과 | `TrashUndoToast`와 element-ref local undo만 있고 graph undo stack은 없다. | 120에서 범용 undo를 사칭하지 않는다. branch/template/drop 실패는 commit 전 rollback한다. |
| `tests/node-compatibility.test.ts:16-42` | compatibility와 branching pure tests가 한 파일에 함께 있다. 별도 branching test는 없다. | 새 test는 matrix 전수/branch clone 수를 반복하지 않고 consumer wiring을 검증한다. |
| `resultChaining.ts:11` / `ResultActions.tsx:312-329` | catalog에 Extend가 없고 ResultActions만 fire-and-forget fetch를 한다. | 100 소유를 침범하지 않고 기존 action subset만 guard한다. |

## 데이터 경로 결정 — REST facade를 사용한다

결정: `NEW routes/nodeTemplates.ts` + `NEW ui/src/lib/api-node-templates.ts`를 사용한다.

클라이언트에 seed를 번들하고 user template를 session/local storage에 따로 두는 안은 기각한다. 서버 store가 이미 `assets.kind=template` SQLite row와 seed를 한 목록으로 합치고, strip/read-only/fresh-ID 정책을 소유한다. client bundle은 seed version drift, user template 이중 저장, `instantiate()` 우회라는 세 개의 거짓 경로를 만든다.

API 계약:

```text
GET    /api/node-templates                 -> { templates: NodeTemplateSummary[] }
POST   /api/node-templates                 -> { template: NodeTemplateSummary }       // current graph 저장
POST   /api/node-templates/:id/instantiate -> { graph: NodeTemplateGraph }             // fresh IDs
PATCH  /api/node-templates/:id             -> { template: NodeTemplateSummary }        // user only
DELETE /api/node-templates/:id             -> { ok: true }                             // user only
```

`/api/node/templates`는 사용하지 않는다. 현재 `GET /api/node/:nodeId`가 `templates`를 node ID로 먼저 잡을 수 있어 route order에 의미가 생기기 때문이다. list 응답은 graph 전체 대신 picker용 `nodeCount`, `terminalCount`, normalized mini-graph preview만 보낸다. instantiate 응답만 full graph를 반환한다. 모든 async route는 `try/catch`와 `{ error: { code, message } }` envelope를 지킨다.

## 원자성 및 상태 소유 결정

`NEW ui/src/lib/nodeStudioGraph.ts`가 graph normalize/validation/patch build를 소유하고, store에는 아래 한 action만 추가한다.

```ts
type GraphCommitReason = "template" | "palette" | "branch" | "element-drop";

commitGraphSnapshot(input: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  reason: GraphCommitReason;
}): boolean;
```

action은 dangling edge, duplicate node/edge ID, element discriminator 누락을 먼저 검사한다. 성공 시 `deriveParentServerNodeIds` 후 단 한 번의 `set({ graphNodes, graphEdges })`, 단 한 번의 `scheduleGraphSave()`를 수행한다. 실패 시 `set`을 호출하지 않는다. 이것이 현재 undo 부재 환경의 branch rollback 경계다.

## File change map

| Op | Path | Diff-level change |
|---|---|---|
| NEW | `routes/nodeTemplates.ts` | 위 5개 REST endpoint, summary mapper, typed error envelope. |
| MODIFY | `routes/index.ts` | `registerNodeTemplateRoutes` import/register. |
| GENERATED | `routes/nodeTemplates.js`, `routes/index.js` | `npm run build:server` 산출물. 직접 편집하지 않는다. |
| NEW | `ui/src/lib/api-node-templates.ts` | summary/graph DTO와 list/create/instantiate/update/delete client. |
| NEW | `ui/src/lib/nodeStudioCatalog.ts` | command IDs, React Flow node type, port definitions, handle→descriptor resolve, compatibility reason→i18n key. |
| NEW | `ui/src/lib/nodeStudioGraph.ts` | template normalize, atomic snapshot validation/build, palette insert, element drop node build, upstream missing-element 탐색. |
| NEW | `ui/src/lib/nodeElementInputs.ts` | 실행 직전 연결된 element를 최신 Assets record로 resolve하고 refs/notes/revision snapshot을 materialize. |
| NEW | `ui/src/components/node-canvas/useNodeStudioController.ts` | picker/palette/branch state, focus restoration, keyboard guards, REST load/copy, connect/drop handlers, fitView scheduling. |
| NEW | `ui/src/components/node-canvas/NodeStudioOverlays.tsx` | template modal, command palette, canvas toolbar를 조합한다. |
| NEW | `ui/src/components/node-canvas/NodeBranchDialog.tsx` | selected source용 2–4 provider/settings variant editor와 apply/cancel states. |
| NEW | `ui/src/components/node-canvas/NodeElementTray.tsx` | Node mode sidebar 안의 실제 element drag source. ID-only versioned payload를 쓴다. |
| MODIFY | `ui/src/components/NodeCanvas.tsx` | ReactFlow 상시 mount, empty state/overlays 소비, element node 등록, controller handlers 연결. |
| MODIFY | `ui/src/components/node-canvas/NodeCommandPalette.tsx` | exact equality를 shared compatibility matrix 호출로 교체. 기존 ranking/key handling 보존. |
| MODIFY | `ui/src/components/node-canvas/NodeTemplatePicker.tsx` | async copy/rename/delete busy/error와 Escape close를 parent callback 계약에 맞춘다. |
| MODIFY | `ui/src/components/NodeBatchBar.tsx` | exactly-one selected source일 때 Branch action을 노출하고 controller dialog를 연다. element node는 generation count에서 제외한다. |
| MODIFY | `ui/src/components/Sidebar.tsx` | node mode에서 `NodeElementTray`를 mount해 canvas와 동시에 보이는 drag source를 제공한다. |
| MODIFY | `ui/src/components/node-canvas/ElementReferenceNode.tsx` | shared `ElementReferenceNodeData` type을 사용하고 resolved revision/missing status를 표현한다. |
| MODIFY | `ui/src/lib/nodeCompatibility.ts` | `canConnectPortTypes(outputType, inputType)` export; `canConnectPorts`도 이를 사용해 matrix 정본을 하나로 유지. |
| MODIFY | `ui/src/lib/nodeBranching.ts` | provider/settings override type을 실제 `ImageNodeData`와 맞추고 invalid output diagnostic을 보존한다. |
| MODIFY | `ui/src/store/storeTypes.ts` | image data의 optional node discriminator/element snapshot/provider override, `commitGraphSnapshot` action 추가. |
| MODIFY | `ui/src/store/storeUIImpl.ts`, `ui/src/store/useAppStore.ts` | atomic graph commit implementation/wiring. |
| MODIFY | `ui/src/store/storeGraphSave.ts` | element discriminator/type와 provider override를 save→reload에서 보존; generic image seed를 required data shape로 normalize. |
| MODIFY | `ui/src/store/storeNodeGenImpl.ts` | per-branch provider/settings override 소비, element preflight/materialized refs+notes 사용, missing이면 network call 전 차단. |
| MODIFY | `ui/src/lib/nodeApi.ts`, `lib/nodeHelpers.ts`, `lib/nodeGeneration.ts` | resolved `elementIds`/revision snapshot을 request와 node sidecar metadata에 기록. refs/notes bytes는 기존 references/prompt 경로를 사용한다. |
| MODIFY | `ui/src/i18n/en.json`, `ui/src/i18n/ko.json` | compatibility reason, template/branch/element missing 및 busy/error copy. |
| MODIFY | `ui/src/styles/node-canvas-extras.css` | overlay backdrop, toolbar, branch dialog, element tray, typed status; 기존 empty/picker/palette CSS 재사용. |
| MODIFY | `ui/src/index.css` | `@import "./styles/node-canvas-extras.css";`. |
| NEW | `tests/node-studio-ui-contract.test.js` | NT/NC/NB/EN source-contract + representative helper hybrid. |
| GENERATED | `docs/migration/runtime-test-inventory.md` | `npm run test:inventory` 정책에 따라 갱신 여부 확인. 수동 편집 금지. |

## Diff unit 1 — Canvas shell과 empty state

`NodeCanvas.tsx`는 wiring shell만 남긴다. controller가 handler/state를 반환하고 JSX는 260줄 안팎을 목표로 한다.

```diff
-const nodeTypes = useMemo(() => ({ imageNode: ImageNode }), []);
+const nodeTypes = useMemo(() => ({
+  imageNode: ImageNode,
+  elementReferenceNode: ElementReferenceNode,
+}), []);

-{nodes.length === 0 ? <button className="node-canvas__plus">...</button> : <ReactFlow ... />}
+<ReactFlow
+  ...
+  onConnect={studio.onConnect}
+  onConnectEnd={studio.onConnectEnd}
+  onDragOver={studio.onDragOver}
+  onDrop={studio.onDropElement}
+>
+  {nodes.length === 0 ? (
+    <NodeCanvasEmptyState
+      hasRecentGraph={studio.hasRecentGraph}
+      onStartBlank={addRootNode}
+      onOpenTemplates={studio.openTemplates}
+      onResumeRecent={studio.resumeRecent}
+    />
+  ) : null}
+  <NodeStudioOverlays {...studio.overlayProps} />
+</ReactFlow>
```

- wrapper `main`은 `tabIndex={0}`과 `onKeyDown`을 가진다.
- recent는 `sessions` 중 현재 session을 제외하고 `nodeCount > 0`인 최신 `updatedAt` 하나다. 없으면 세 번째 choice는 disabled다.
- loading 중에는 empty choice/toolbar mutation을 막는다.
- controller가 `wrapperRef.current?.focus()`를 picker/palette/dialog Escape/close 뒤 한 곳에서 수행한다.

## Diff unit 2 — Template picker와 graph copy

empty state와 populated canvas toolbar의 “Templates”가 같은 `openTemplates()`를 호출한다. populated graph에서 copy를 확정할 때는 교체 confirmation을 거친다. silent append나 silent data loss는 금지한다.

```diff
-<NodeTemplatePicker templates={[]} ... />
+const templates = await listNodeTemplates();
+<NodeTemplatePicker
+  templates={templates}
+  loading={templateState === "loading"}
+  error={templateError}
+  onCopy={copyTemplate}
+  onRename={renameUserTemplate}
+  onDelete={deleteUserTemplate}
+  onClose={closeAndRestoreCanvasFocus}
+/>

+const graph = await instantiateNodeTemplate(template.id);
+const next = normalizeTemplateGraph(graph);
+if (!commitGraphSnapshot({ ...next, reason: "template" })) return;
+requestAnimationFrame(() => void fitView({ padding: 0.16, duration: 180 }));
```

- toolbar의 “Save template”은 현재 graph snapshot을 `POST /api/node-templates`로 보낸다. 빈 graph에서는 disabled다.
- copy는 `instantiate` 응답만 사용하므로 seed/user 모두 fresh IDs다.
- copy 후 자동 generate를 호출하지 않는다.
- rename/delete는 `source === "user"`에서만 callback이 존재한다. server의 seed 403도 그대로 표시한다.

## Diff unit 3 — Command palette와 compatibility boundary

`NodeCommandPalette`의 direction vocabulary를 `nodeCompatibility.PortDescriptor`의 `input/output`으로 통일한다.

```diff
-return command.inputPorts.some((port) => port.type === sourcePort.type);
+return sourcePort.direction === "output" && command.inputPorts.some(
+  (port) => canConnectPortTypes(sourcePort.type, port.type),
+);
```

Canvas keyboard contract:

- `/`: event target이 canvas wrapper/background일 때만 open하고 `preventDefault()`한다.
- `Space`: graph가 비었고 canvas background가 focus일 때만 open한다.
- `input`, `textarea`, `select`, `[contenteditable=true]`, palette/dialog 내부에서는 `/`와 Space를 문자/기본 동작으로 남긴다.
- `Escape`: palette가 닫히고 canvas focus가 복원된다.
- port를 빈 공간에 놓으면 `onConnectEnd`가 generic child를 만들지 않고 source `PortDescriptor`와 pointer anchor로 filtered palette를 연다.
- insert는 screen→flow 좌표 변환, node build, optional edge build를 한 snapshot으로 commit한다. compatible input이 1개면 자동 연결하고, 2개 이상이면 명시적 port choice를 요구한다.

Canvas direct connection contract:

```diff
-connectNodes(params.source, params.target, params.sourceHandle, params.targetHandle);
+const source = resolveOutputPort(params.source, params.sourceHandle, nodes);
+const target = resolveInputPort(params.target, params.targetHandle, nodes);
+const verdict = canConnectPorts(source, target, { nodes, edges });
+if (!verdict.allowed) {
+  showToast(t(compatibilityReasonKey(verdict.reason)), true);
+  return;
+}
+connectNodes(...);
```

descriptor resolve 실패도 `UNKNOWN_PORT` UI reason으로 fail closed한다. `canConnectPorts`의 기존 typed reason union은 변경하지 않고 UI mapping에서 unknown을 별도로 처리한다.

## Diff unit 4 — Branch action과 rollback

`NodeBatchBar`는 selected image node가 정확히 하나이고 downstream generator가 있을 때 Branch를 활성화한다. dialog는 2개 row로 시작하고 4개까지만 추가한다. 각 row는 label + core provider + 선택적 quality/model/size override를 가진다. 실행 시 `storeNodeGenImpl`은 node override를 global store 값보다 우선하므로 branch가 장식용 clone에 그치지 않는다.

```diff
+const output = createBranchGraph({
+  graph: { nodes, edges },
+  sourceNodeId,
+  variants,
+  axis: "horizontal",
+});
+const candidate = appendBranchOutput({ nodes, edges }, output);
+if (!candidate.ok) {
+  showToast(t("nodeStudio.branch.rollback"), true);
+  return; // store set 없음
+}
+commitGraphSnapshot({ ...candidate.graph, reason: "branch" });
```

- 1/5 variants, duplicate variant ID, missing source/downstream, dangling output edge는 commit 전에 실패한다.
- 현재 graph undo stack이 없으므로 “Undo” 버튼을 새로 만들지 않는다. rollback은 pre-commit validation + one store set으로 정의한다.
- 성공 시 2–4 branch 전체가 한 save debounce unit이다. 중간 nodes-only/edges-only frame은 존재하지 않는다.

## Diff unit 5 — ElementReferenceNode drop과 실행 preflight

Assets workspace와 NodeCanvas는 동시에 보이지 않으므로 `AssetsGrid`만 draggable로 만드는 것은 활성화 불가능한 경로다. 실제 진입점은 Node mode `Sidebar` 안의 `NodeElementTray`다. tray는 `loadAllElementAssets()`를 사용하고 아래 ID-only payload를 쓴다.

```json
{"version":1,"assetKind":"element","elementId":"element_..."}
```

drop 순서:

1. MIME `application/ima2-node-element`와 version/kind/id를 검증한다. non-element/malformed payload는 무시하고 graph를 바꾸지 않는다.
2. `screenToFlowPosition`으로 drop point를 변환한다.
3. `getAssetById(elementId)`로 최신 element snapshot을 조회한다. 404/other kind는 typed toast 후 종료한다.
4. base image fields를 안전한 empty 값으로 채우고 `nodeType: "element-reference"`, name/refCount/notes/thumbnail/revision을 넣는다.
5. optional compatible hover target edge와 node를 `reason: "element-drop"` 한 번으로 commit한다.
6. reload 시 `storeGraphSave`가 discriminator를 보고 `elementReferenceNode` type을 복원한다.

실행은 stale UI snapshot을 신뢰하지 않는다. `nodeElementInputs.ts`가 target generator의 upstream element IDs를 따라가 실행 직전 `getAssetById`를 다시 호출한다. missing이면 `postNodeGenerateStream` 전에 `ELEMENT_REFERENCE_MISSING` toast로 차단한다. 유효하면 refs를 기존 node refs 뒤, provider capacity 안에서 materialize하고 notes를 request prompt suffix로만 합친다. 원본 node prompt는 변경하지 않는다. `elementIds`와 `{id: updatedAt}` revision snapshot은 node sidecar에 남긴다.

## Diff unit 6 — CSS/i18n

```diff
 @import "./styles/node-polish.css";
+@import "./styles/node-canvas-extras.css";
```

- picker/branch dialog는 backdrop + focus-visible + mobile single-column을 갖는다.
- element tray item은 mouse drag와 keyboard “Add to canvas” 둘 다 제공한다. drag-only 기능으로 남기지 않는다.
- connection reject는 toast뿐 아니라 `aria-live=polite` canvas status에도 마지막 typed reason을 짧게 남긴다.
- 기존 component의 하드코드 영어는 이번에 추가되는 상태/오류부터 en/ko key로 옮긴다. 전면 copy 번역 리라이트는 하지 않는다.

## `tests/node-studio-ui-contract.test.js` 설계

house style은 `composer-mention-parity-contract.test.js`의 source read/ordering assertion과 `star-surface-controls-contract.test.ts`의 source-contract + pure helper 조합을 따른다. line number나 전체 JSX 문자열은 고정하지 않는다. test 대부분은 consumer wiring이며, pure helper 호출은 matrix 정본을 공유한다는 대표 1–2개 sanity check만 둔다.

```diff
+const canvas = read("ui/src/components/NodeCanvas.tsx");
+const controller = read("ui/src/components/node-canvas/useNodeStudioController.ts");
+const store = read("ui/src/store/storeUIImpl.ts");
+const nodeRun = read("ui/src/store/storeNodeGenImpl.ts");
+
+describe("NT — template UI integration", () => { /* render/order/API/atomic copy */ });
+describe("NC — palette and canvas compatibility boundary", () => { /* keys/matrix/reason */ });
+describe("NB — atomic branch consumer", () => { /* 2–4/apply/rollback/overrides */ });
+describe("EN — element node lifecycle", () => { /* registry/drop/missing/run block/CSS */ });
+describe("chaining non-regression", () => { /* existing IDs are a subset */ });
```

### NT group

- NT-11: `NodeCanvas`가 legacy plus 대신 `NodeCanvasEmptyState`를 렌더하고 blank→template→recent DOM order를 보존한다.
- NT-07/08/12 integration: 두 진입점이 같은 picker owner를 열고, copy가 `instantiateNodeTemplate` → `normalizeTemplateGraph` → `commitGraphSnapshot(reason=template)` → `fitView` 순서이며 generate call이 없다.
- route wiring: `routes/index.ts`가 `registerNodeTemplateRoutes`를 등록하고 client API가 list/create/instantiate/patch/delete를 모두 가진다.
- populated graph copy에는 replace confirmation guard가 존재한다.

### NC group

- NC-01/02: canvas-only `/`, empty-canvas-only Space, editable target guard를 source contract로 고정한다.
- NC-03: palette가 `canConnectPortTypes`를 import/call하고 exact `port.type === sourcePort.type` 비교가 사라진다.
- NC-05~10 boundary: `NodeCanvas` controller가 `canConnectPorts` verdict 전에 `connectNodes`를 호출하지 않으며 typed reason을 surface한다.
- NC-11/12: palette insertion이 좌표 변환 후 `commitGraphSnapshot(reason=palette)` 한 번으로 node+edge를 적용한다.
- Escape close 뒤 wrapper focus 복원을 assertion한다.

### NB group

- NB-01/02: dialog min/max가 2/4이고 selected source ID를 `createBranchGraph`에 넘긴다.
- NB-09: invalid candidate에서 commit 호출이 없고 이전 snapshot을 그대로 반환한다.
- NB-10 대체 계약: graph undo owner 부재를 전제로 branch additions가 `commitGraphSnapshot(reason=branch)` 한 번으로만 적용됨을 고정한다.
- per-branch provider/settings override가 `storeNodeGenImpl`의 effective request 값에 반영되는 source path를 assertion한다.

### EN group

- EN-01/02: node registry에 `elementReferenceNode`가 있고 tray payload parser가 element만 받아 drop point에 typed node를 만든다.
- EN-03~06: element handles와 canvas/palette 모두 shared matrix를 사용한다.
- EN-07/08: execution preflight가 최신 asset resolve 실패/missing을 `postNodeGenerateStream` 전에 차단한다.
- EN-09: request metadata에 latest `updatedAt` revision snapshot이 들어간다.
- EN-10 대체 계약: element drop node+optional edge가 `commitGraphSnapshot(reason=element-drop)` 한 번이다.
- CSS: `index.css`가 `node-canvas-extras.css`를 import한다.

### Chaining non-regression guard

`CHAINING_ACTIONS`에서 현재 `animate`, `edit`, `useAsRef`, `rebake`, `saveToAssets`, `saveAsElement`가 모두 존재하는지만 subset으로 검사한다. `extend`의 존재/부재나 `ResultActions` fetch shape를 assertion하지 않아 100 구현과 충돌하지 않는다.

## 조건부 경로 활성화 시나리오

| Scenario | Trigger | Observable proof |
|---|---|---|
| Empty order | 빈 새 session으로 Node 진입 | blank/template/recent 3택이 같은 시각·DOM·tab 순서; recent 없으면 세 번째만 disabled. |
| Recent | 다른 non-empty session이 있는 빈 session | Resume recent가 최신 graph를 열며 template/blank mutation은 없다. |
| Template copy | empty state 또는 toolbar에서 같은 seed 선택 후 Make a copy | server fresh IDs, 한 graph commit, picker close, fitView, 자동 생성 없음. 두 번 copy하면 ID set이 다르다. |
| Existing graph replace | populated canvas toolbar에서 template copy | confirmation 거절 시 graph 불변; 승인 시 old→copy가 한 commit으로 교체. |
| Incompatible connect | image output을 video-only input에 drop | edge가 생기지 않고 `TYPE_MISMATCH`의 번역 reason이 toast + live status에 보인다. |
| Cardinality | occupied single input에 두 번째 edge | edge 불변, `CARDINALITY` reason 표시. replace는 별도 승인 없이는 하지 않는다. |
| Palette canvas focus | canvas background focus 후 `/` | palette open, 검색 input focus. Escape 후 canvas focus 복귀. |
| Literal slash | ImageNode textarea/template search/branch input에서 `/` | 문자가 입력되고 palette는 열리지 않는다. |
| Empty Space | node 0개인 canvas background에서 Space | palette open. button/input focus 또는 node가 있는 canvas에서는 기본 동작 유지. |
| Port palette | image output을 빈 공간에 release | image-compatible command만 보이고 선택 시 node+edge가 한 commit으로 생성. |
| Branch success | source 하나 선택 → 2–4 provider/settings rows → Apply | branch graph 전체가 한 commit으로 생기고 각 generation request가 node override를 사용. |
| Branch rollback | invalid source/duplicate variant/dangling candidate를 test fixture로 주입 | commit count 0, nodes/edges reference와 serialized value 모두 이전 snapshot과 동일. |
| Element drop | Node sidebar element를 canvas로 drag 또는 keyboard add | drop point에 `elementReferenceNode`, name/ref count/thumbnail 표시, optional edge도 같은 commit. |
| Missing element | graph 저장 후 해당 element 삭제, reload 또는 Run | node는 warning row로 남고 generation network call은 0; missing reason 표시. |
| Element update | element notes/refs 수정 후 같은 graph Run | 실행 직전 최신 updatedAt/refs/notes를 사용하고 sidecar revision snapshot이 최신값. |
| CSS | dark desktop + 390px mobile에서 empty/picker/palette/branch/element tray 열기 | unstyled DOM이 없고 dialog overflow/focus ring/stacking이 정상. |

## Acceptance criteria

- [ ] `NodeCanvas`가 `NodeCanvasEmptyState`, `NodeTemplatePicker`, `NodeCommandPalette`, `ElementReferenceNode`, branch action의 실제 consumer다.
- [ ] template list/user CRUD/copy는 server REST를 통하고 copy마다 fresh IDs이며 자동 실행하지 않는다.
- [ ] `/`와 Space는 canvas focus 조건에서만 열리고 editable surface의 literal 입력을 침범하지 않는다.
- [ ] palette filter와 direct connect가 같은 compatibility matrix를 사용한다.
- [ ] 모든 incompatible connect는 edge mutation 없이 typed reason을 사용자에게 표시한다.
- [ ] template/palette/branch/element drop은 nodes와 edges를 분리 setter로 적용하지 않고 atomic commit action 하나를 사용한다.
- [ ] branch UI는 2–4 variants만 허용하고 실제 request가 per-node provider/settings override를 소비한다.
- [ ] element drop은 실제 Node mode tray에서 활성화 가능하며 non-element payload는 fail closed한다.
- [ ] deleted/missing element는 node를 지우지 않지만 single/batch execution을 network call 전에 차단한다.
- [ ] element execution은 최신 asset revision을 resolve하고 sidecar에 element IDs/revision snapshot을 기록한다.
- [ ] `index.css`가 `node-canvas-extras.css`를 import한다.
- [ ] `tests/node-studio-ui-contract.test.js`가 NT/NC/NB/EN groups와 chaining subset guard를 포함하고 기존 pure-helper matrix 전수를 복제하지 않는다.
- [ ] `NodeCanvas.tsx` < 500 lines, 모든 신규 함수 < 50 lines, 모든 async path에 try/catch가 있다.
- [ ] 100/130 소유 파일·계약을 구현하지 않는다.

## 구현 순서

1. REST facade + client DTO를 먼저 만든다.
2. graph discriminator/persistence/atomic commit을 만든다. 이후 UI는 분리 setter를 쓰지 않는다.
3. shared catalog/compatibility descriptor와 controller를 만든다.
4. NodeCanvas empty/template/palette/direct connect를 연결한다.
5. branch dialog + per-node effective request를 연결한다.
6. element tray/drop/latest resolve/missing preflight를 연결한다.
7. CSS/i18n import를 연결하고 contract test를 작성한다.
8. focused gates → full gates → browser activation scenarios 순으로 검증한다.

## Verification plan

```bash
node --test --import tsx tests/node-studio-ui-contract.test.js tests/node-template-contract.test.ts tests/node-compatibility.test.ts
npm run typecheck
npm run typecheck:tests
npm run build:server
cd ui && npm run build
cd .. && npm run test:inventory
npm test
```

Render grounding:

1. local served app의 Node mode에서 empty→template copy→fitView를 keyboard-only로 완료한다.
2. textarea literal `/`, canvas `/`, empty Space, Escape focus 복귀를 DOM activeElement와 함께 관찰한다.
3. compatible/incompatible/cardinality connection을 각각 실행해 edge count와 live reason을 확인한다.
4. 2-branch 성공과 invalid fixture rollback을 확인한다.
5. Node sidebar element drag/keyboard add, element 삭제 후 reload/run 차단을 확인한다.
6. desktop과 390px에서 picker/palette/branch/tray screenshot을 읽어 overflow, stacking, focus ring을 확인한다.

성능 수치는 이 단계의 완료 증거가 아니다. 130에서 별도 fixture와 profile artifact로 측정한다.
