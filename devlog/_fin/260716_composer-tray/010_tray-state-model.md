# 010 — Unified Reference Tray 상태 모델

> **감사 R1 반영 (Darwin FAIL → 수정):** 아래 6개 절이 원문 위에 우선한다.
>
> **A1. 마이그레이션 매니페스트 (완전 목록, R2 정정).** 쓰기 경로: 기존 액션명(addReferences, addReferenceDataUrl, removeReference, addElementId, removeElementId 등)은 시그니처 유지 래퍼로 tray 뮤테이션 호출. 읽기 경로: `referenceImages`·`selectedElementIds`는 **실제 state 필드로 유지하되 tray 뮤테이션이 매번 재계산해 동기 기록하는 materialized 파생 필드**로 한다(셀렉터 함수가 아니라 필드 — `s.referenceImages`를 직접 읽는 기존 소비자가 무변경으로 동작하는 유일한 방법). 단일 쓰기 지점은 tray 뮤테이션 헬퍼 하나로 강제하고, 두 필드를 직접 set하는 코드는 계약 테스트로 금지한다. 소비자 목록: Sidebar.tsx:20(parked refs), continueFromItem.ts:28, resultChaining.ts:64, GalleryImageTile.tsx:81, storeUIImpl.ts:110(metadata restore), HomePromptComposer, 각 source-contract 테스트. 테스트 원장에 `tests/generation-limit-unlock-contract.test.js`(현재도 stale 1건) 추가 — 이 슬라이스에서 함께 갱신.
>
> **A2. 태그 tombstone.** 트레이 스토어에 `retiredTags: Map<tag, {retiredAt}>`를 추가한다. 항목 제거 시 tag가 tombstone으로 이동하며, 죽은 태그 판정은 `retiredTags.has(tag)`로만 한다(임의의 미등록 @word는 절대 dead 처리하지 않음 — 이메일/핸들 오탐 차단). tombstone은 같은 tag 재삽입 시 제거, 프롬프트 clear 시 전체 소거. 020의 "tokenId 맵" 표현은 오기: 조인 키는 **tag**다. 테스트: 이메일(a@b.com), 핸들(@runwayml), CJK 태그(@지피), 구두점 인접, 진짜 제거된 태그.
>
> **A3. @Image_N 자동 삽입 규격 (R2 정정 — 삽입 주체 분리).** 태그 배정은 스토어(tray 뮤테이션), **프롬프트 토큰 삽입은 컴포저 소유**: PromptComposer가 첨부 시작 시 캐럿 스냅샷을 잡고, tray 추가 완료 콜백에서 `@Image_N `을 그 위치에 삽입한다(캐럿 스냅샷 무효/부재 시 프롬프트 끝, 공백 보정). 스토어 액션 시그니처는 불변(A1) — 컴포저 외 호출자(gallery drag, canvas 등)는 토큰을 프롬프트 끝에 append하는 공용 헬퍼 `appendTrayToken(tag)`를 명시 호출하거나 삽입 생략을 선택한다(표면별 표에 명시). 배치 추가는 완료 순서 순차 삽입, 압축 실패 항목은 태그 미배정·미삽입, 중복 첨부는 새 ordinal, ordinal 경합은 zustand 함수형 업데이트로 직렬화.
>
> **A4. 물리 소스 카운트 셀렉터.** `physicalVideoSourceCount()` 셀렉터 신설: attachment=1, element=refs.length(삽입 시점 스냅샷 `source.refsCount`)로 합산. Grok video mode 유도(getEffectiveVideoSourceCount 대체)와 MAX_REF2V_DURATION_UI 클램프(VideoControlsPanel.tsx:47)는 이 물리 카운트를 쓴다. 논리 N+M 카운트는 트레이 표시/한도 전용. `providerUrlReference` 상호배제는 유지: 첨부 추가 시 클리어하는 기존 규칙(storeReferenceImpl.ts:69)을 tray add 액션이 승계.
>
> **A5. temp-upload 소유권.** 업로드는 배치 토큰 단위: `POST /api/mcp/temp-references` (multipart 또는 data URL 배열) → `{batchId, files:[{filename,tag}]}`. 부분 실패 시 서버가 배치 전체 롤백(성공분 삭제). 클라이언트 abort/이탈 대비 `DELETE /api/mcp/temp-references/:batchId` + 서버측 TTL 청소(60분, 시작 시·주기). 생성 요청이 batchId를 소비하면 소유권이 생성 job으로 이전. 파싱/매직바이트는 routes/imageImport.ts:15와 lib/localImportStore.ts:13의 기존 로직을 추출·재사용(중복 구현 금지). LAN 보호는 server.ts:208 기존 미들웨어를 그대로 통과.
>
> **A6. (문서 원장)** 이 문서의 테스트 계획에 A1-A5 각각의 계약 테스트를 추가한다.

## 목표와 불변식

- 컴포저의 직접 첨부 `N`개와 `@element` 멘션 `M`개를 `trayItems` 한 배열로 관리하고, `N + M <= activeReferenceLimit()`를 모든 추가 경로에서 원자적으로 검사한다.
- `tokenId`가 UI identity, `tag`가 prompt token/provider alias identity다. `tag`는 선행 `@` 없이 저장하고 UI/prompt에서 `@${tag}`로 표시한다.
- attachment는 삽입 순간 `Image_1`, `Image_2`, ...를 배정한다. 삭제/재정렬 후에도 이름을 바꾸지 않고 ordinal을 재사용하지 않는다.
- element는 삽입 순간 `mcpReferenceTag(element.name)` 결과를 고정한다. 이후 asset rename은 tag를 바꾸지 않는다.
- 모든 tag는 tray 안에서 유일해야 한다. attachment는 사용 중인 번호를 건너뛰고, element 충돌은 32자 안에서 `_2`, `_3` suffix를 붙인다.
- prompt의 유효한 `@tag` token은 `Map<tag, TrayItem>`과 join한다. item이 있으면 live, 없으면 dead다. 별도 tag 배열이나 DOM-local mapping은 만들지 않는다.
- tray item 제거는 prompt 문자열을 수정하지 않는다. dead-tag 시각화는 020 문서의 mirror overlay가 담당한다.
- core API wire format과 서버 element compiler는 변경하지 않는다. MCP만 attachment를 임시 generated-storage 파일로 바꿔 기존 `references: [{ filename, tag }]`에 합류시킨다.

## TypeScript 타입 스케치

새 타입은 `ui/src/lib/referenceTray.ts`에 두고 `storeTypes.ts`가 import한다.

```ts
type TrayItemBase = {
  tokenId: string;          // crypto.randomUUID(); React key/removal key
  tag: string;              // bare alias, e.g. Image_1 or 한글_캐릭터
  insertedAt: number;
};

export type TrayItem =
  | (TrayItemBase & {
      kind: "attachment";
      source: {
        dataUrl: string;
        mimeType: "image/png" | "image/jpeg" | "image/webp";
        originalName?: string;
        byteSize?: number;
        origin: "file" | "paste" | "drop" | "gallery" | "canvas" | "metadata";
      };
    })
  | (TrayItemBase & {
      kind: "element";
      source: {
        elementId: string;
        nameAtInsertion: string;
        referenceFilenames: string[]; // insertion snapshot; MCP uses [0]
        thumbnailUrl?: string;
      };
    });

export type ReferenceTraySlice = {
  trayItems: TrayItem[];
  nextAttachmentOrdinal: number;
  activeReferenceLimit: () => number;
  addTrayAttachments: (inputs: AttachmentInput[]) => Promise<TrayItem[]>;
  addTrayAttachmentDataUrl: (dataUrl: string, origin: AttachmentOrigin) => TrayItem | null;
  addTrayElement: (elementId: string) => TrayItem | null;
  removeTrayItem: (tokenId: string) => void;
  clearTray: () => void;
};
```

`referenceTray.ts`의 pure API:

```ts
selectAttachmentItems(state): Extract<TrayItem, { kind: "attachment" }>[];
selectElementItems(state): Extract<TrayItem, { kind: "element" }>[];
selectReferenceImages(state): string[];
selectSelectedElementIds(state): string[];
serializeCoreTray(items): { referenceImages: string[]; elementIds: string[] };
indexTrayTags(items): Map<string, TrayItem>;
findTrayTagTokens(prompt): Array<{ tag: string; start: number; end: number }>;
```

## 기존 상태 마이그레이션 결정

`referenceImages`와 `selectedElementIds`는 **저장 상태에서 제거하고 selector로 교체**한다. 호환용 derived field/getter도 AppState에 두지 않는다.

이유:

1. 두 배열을 유지하면 tray mutation마다 3개 표현을 dual-write해야 하며 tag/순서/한도 drift가 다시 생긴다.
2. frozen tag, insertion order, attachment origin, element ref snapshot은 기존 배열로 복원할 수 없다.
3. Zustand에서 derived 배열을 state로 저장해 effect로 동기화하는 것은 불필요한 렌더와 중간 불일치 상태를 만든다.

마이그레이션은 한 diff에서 원자적으로 수행한다.

- `useAppStore` 초기값을 `trayItems: []`, `nextAttachmentOrdinal: 1`로 바꾸고 `addElementId/removeElementId`를 `addTrayElement/removeTrayItem`로 교체한다.
- `PromptComposer`와 generation call sites는 selector/serializer를 사용한다. index 기반 `removeReference(i)`도 `tokenId` 기반 제거로 바꾼다.
- `canvasReferenceImage`는 `canvasReferenceTokenId`로 바꾼다. 해당 attachment 제거 또는 attachment가 0개가 되면 기존 continuity prompt/lineage 정리를 유지한다.
- `addReferencesImpl`, paste/drop/gallery/canvas/metadata 경로는 모두 동일한 append helper를 호출한다. helper만 ordinal 배정과 N+M limit 검사를 수행한다.
- lane 변경으로 현재 tray가 새 limit를 초과하면 item을 자르지 않는다. 경고를 표시하고 generation preflight를 막아 사용자가 명시적으로 제거하게 한다.
- element asset이 rename/delete되어도 item의 tag와 insertion snapshot은 유지한다. core serializer는 `elementId`, MCP serializer는 snapshot의 첫 usable filename을 사용한다. filename이 없으면 생성 전에 명시적 unavailable 오류를 낸다.

## 레인별 serializer 계약

| Lane | attachment item | element item | 최종 payload |
|---|---|---|---|
| Core image (`runGenerateImpl`) | `source.dataUrl`, 기존처럼 prefix 제거 | `source.elementId` | `references: string[]`, `elementIds: string[]` |
| Core multimode | 위와 동일 | 위와 동일 | `references`, `elementIds` 기존 shape |
| Core Grok video | attachment 1개면 `sourceImage`, 2개 이상이면 `referenceImages` | `elementIds` | 기존 `routes/video.ts` shape; mode/physical ref 확장은 서버가 결정 |
| MCP image/video | temp endpoint에 raw upload 후 반환 filename | `referenceFilenames[0]` | tray 순서 그대로 `references: [{ filename, tag }]` |

- MCP `tag`에는 `@`를 넣지 않는다. `runway.ts::referenceImagesArg`의 현재 Unicode tag validation과 최대 3개 전달 계약을 그대로 사용한다.
- element 하나가 여러 source image를 가져도 MCP에서는 첫 usable image 한 장만 보낸다. 그래야 logical item 1개가 provider reference 1개/tag 1개에 대응한다. Core element compiler의 multi-ref expansion은 유지한다.
- `providerUrlReference`와 MCP video `startFrameFilename`은 tray 밖의 기존 특수 source이며 N+M에 포함하지 않는다.
- serializer는 limit 초과 item을 `slice()`로 조용히 버리지 않는다. 공통 preflight가 실패해야 한다.

## Limit matrix

| 활성 lane | `activeReferenceLimit()` | 카운트 단위 |
|---|---:|---|
| OAuth/API image | `serverLimit` (현재 기본 5) | attachment + element |
| Grok/Grok API/Agy/Gemini image | `min(serverLimit, 3)` | attachment + element |
| Grok video | `min(serverLimit, 7)` | attachment + element |
| MCP Runway image/video | `min(serverLimit, 3)` | attachment + element |

`referenceLimits.ts`의 MCP 분기를 `0`에서 `MCP_REFERENCE_LIMIT = 3`으로 바꾼다. logical tray limit은 element compiler 내부의 physical-image capacity를 대체하지 않는다. 서버는 element별 여러 ref를 기존 capacity 규칙에 따라 계속 prune/validate한다.

## MCP temp-reference endpoint

### 계약

- 새 route: `POST /api/mcp/references/temp`.
- UI API `uploadMcpTempReference(source: File | string)`가 File 또는 data URL을 Blob으로 정규화한 뒤 raw bytes로 전송한다. wire에서 base64 JSON을 반복 전송하지 않아 50MB body가 4/3로 팽창하지 않게 한다.
- request `Content-Type`: `image/png`, `image/jpeg`, `image/webp`; optional `X-Ima2-Original-Filename`은 진단용이며 path에는 사용하지 않는다.
- response `201`: `{ ok: true, reference: { filename, mimeType, bytes, expiresAt } }`; `filename`은 `.mcp-temp-refs/<random>.<ext>` generatedDir-relative 경로다.

### 검증/보안

- 빈 body 및 decoded/raw 50MB 초과는 413, 허용하지 않은 MIME은 415, MIME과 PNG/JPEG/WebP magic-byte 불일치는 400으로 거절한다.
- 서버가 random basename과 sniffed extension을 생성하고 exclusive create를 사용한다. 사용자 filename, absolute path, `..`, separator는 저장 경로에 반영하지 않는다.
- temp root와 target을 `resolve/realpath`로 generatedDir containment 검사하고 symlink escape를 거절한다.
- dot-directory는 history/thumbnail/sidecar 대상이 아니며 Express static의 dotfile 차단을 유지한다.

### cleanup

- `mcpMedia.ts`가 `.mcp-temp-refs/` 입력만 temporary로 표시하고, provider upload 성공/실패/abort 후 `finally`에서 삭제한다. element/generated assets는 절대 삭제하지 않는다.
- capability preflight 또는 `startJob`이 실패한 경우에도 소유권을 넘겨받은 temp refs를 즉시 삭제한다.
- crash/orphan 방어로 route 등록 시와 새 upload 시 1시간 TTL 초과 파일을 opportunistic reap한다. 삭제 실패는 생성 결과를 뒤집지 않고 secret-free log만 남긴다.

## Diff manifest

새 파일:

- `ui/src/lib/referenceTray.ts` — 타입, tag reservation, selectors, core/MCP candidate serializer, token scan.
- `lib/mcp/tempReferenceStore.ts` — magic sniff, 50MB write, containment, temp classification/reap/delete.
- `routes/mcpTempReferences.ts` — raw upload endpoint와 HTTP error mapping.
- `tests/reference-tray.test.ts` — pure state/tag/serializer contracts.
- `tests/mcp-temp-references.test.ts` — upload validation/containment/cleanup contracts.

변경 파일:

- `ui/src/store/storeTypes.ts`, `ui/src/store/useAppStore.ts` — `ReferenceTraySlice` 조립, legacy fields/actions 제거, `canvasReferenceTokenId`.
- `ui/src/store/storeReferenceImpl.ts`, `ui/src/store/storeUIImpl.ts` — 모든 attachment/element mutation을 tray helper로 수렴하고 continuity cleanup 유지.
- `ui/src/components/PromptComposer.tsx` — tray selector, tokenId remove, `addTrayElement()`가 반환한 frozen tag를 prompt에 삽입.
- `ui/src/store/storeGenImpl.ts`, `ui/src/store/storeVideoImpl.ts`, `ui/src/lib/videoSourceCount.ts` — core serializer/derived attachment count 사용.
- `ui/src/store/storeSettingsImpl.ts` — MCP serializer, attachment temp upload, element primary ref, 공통 over-limit/unavailable preflight.
- `ui/src/lib/referenceLimits.ts` — MCP limit 3.
- `ui/src/lib/mcpSelection.ts`, `ui/src/lib/mcpProviders.ts` — generic tray `references` build input과 temp upload client.
- `routes/index.ts` — temp route 등록.
- `routes/mcpMedia.ts` — temporary reference 분류/cleanup; 기존 generated reference validation과 provider upload는 유지.
- `tests/reference-limits.test.ts`, `tests/mcp-generation-integration.test.ts`, `tests/video-ui-source-count.test.ts`, `tests/video-continuity-ui-contract.test.js`, `tests/canvas-version-contract.test.js` — 새 state/limit/cleanup contract로 갱신.

변경하지 않는 contract anchor: `lib/generatePipeline.ts`, `routes/video.ts`, `lib/elementCompiler.ts`, `lib/mcp/adapters/runway.ts`, `lib/mcp/providerAdapter.ts`. 이 파일들의 기존 payload/provider mapping을 regression test로 고정한다.

## 테스트 계획

기존 테스트 영향:

- `reference-limits.test.ts`: “MCP sends no composer references = 0” assertion은 반드시 3으로 깨진다.
- `video-ui-source-count.test.ts`: top-level `referenceImages` fixture를 tray attachment fixture로 교체한다. node-local `referenceImages` fixture는 그대로 둔다.
- `video-continuity-ui-contract.test.js`, `canvas-version-contract.test.js`: legacy field/regex가 깨지므로 tokenId와 attachment-derived cleanup을 검사하도록 바꾼다.
- `mcp-generation-integration.test.ts`: 기존 generated element reference tests는 유지하고 mixed temp attachment + element ordering/tag/cleanup assertions를 추가한다.

새 contract:

1. attachment ordinal은 삭제/재삽입/재정렬/element rename 후에도 고정되고 tag collision이 없다.
2. 2 attachments + 1 element는 limit 3에서 허용, 네 번째 item은 모든 add 경로에서 거절된다.
3. core image/video serializers가 기존 wire shape를 만들고 MCP serializer가 정확히 item당 한 `{filename, tag}`를 tray 순서로 만든다.
4. prompt Unicode token scan에서 live/dead를 Map join으로 판정하며 item 제거가 prompt text를 바꾸지 않는다.
5. temp endpoint가 MIME/size/magic/empty/traversal/symlink를 거절하고 random contained path만 반환한다.
6. MCP preflight reject, provider upload failure, success, abort에서 temp만 삭제되고 generated element file은 남는다.

검증 순서: targeted Node tests → `npm run typecheck` → `npm run typecheck:tests` → `npm test` → `cd ui && npm run build`. 과금 생성 호출은 하지 않는다.

## Out of scope

- tray의 실제 시각 배치, thumbnail/chip polish, dead-tag mirror overlay(020).
- inflight badge/popup(030), mobile sheet 재배치와 viewport QA(040).
- node-canvas 내부 `ImageNodeData.referenceImages`; 이는 composer tray와 별도 상태다.
- prompt에서 dead tag 자동 삭제/치환, element rename에 따른 tag 소급 변경.
- provider URL reference/start frame을 tray item으로 통합하는 작업.
- MCP provider의 3-ref 상향, Runway 외 provider-specific tag semantics, core server wire-format 변경.
- tray persistence across reload/session, generated JS 수동 편집, release/publish.
