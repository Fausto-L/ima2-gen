---
created: 2026-07-18
tags: [ima2-gen, phase, video, i2v, orchestration, sse, lineage]
status: ready
---

# Phase 100 — last-frame → I2V orchestration

결정: **OPTION 2+**. `routes/videoExtended.ts`에 self-contained async route를
구현하되, `routes/video.ts`에서 재사용할 것은 MP4+sidecar persistence helper뿐이다.
전체 video generation service 추출은 하지 않는다.

## Loop-spec

- **archetype:** async orchestration + durable lineage + UI terminal-state contract
- **verifier:** `tests/videoExtendedRoute.test.ts`, history/UI focused contracts,
  eventBus terminal-event 관찰, sidecar 직접 검사
- **stop condition:** activation scenario 전부 통과, event order와 rollback/cancel
  불변식 통과, focused + 공통 게이트 green

## 타당성 판정과 앵커 재검증

OPTION 2+는 현재 구조에서 가능하다.

- `routes/videoExtended.ts:191-216`의 `/api/video/extend`는 `prompt`와 `videoUrl`을
  요구하고 `/v1/videos/extensions`를 sync poll한 뒤 200 JSON을 반환한다.
- 같은 파일의 `saveVideoResult()`는 MP4를 먼저 쓰고 sidecar 실패 시 MP4를
  rollback하며(`:70-120`), `requestSignal()`은 response `close`에서 abort한다
  (`:128-135`). 따라서 202를 보낸 뒤 계속 실행할 새 route에는 재사용할 수 없다.
- `lib/videoFrameExtract.ts:16-77`은 generated-root path 검증, MP4 header/size 검증,
  `ffmpeg -sseof -3` last-frame 추출, temp PNG cleanup을 이미 제공한다.
- `routes/video.ts:231-255`는 `continueFromVideo` sidecar를 읽고 last frame을 base64로
  추출한다. `:340-360`은 inflight 중복/용량/AbortController/202, `:396-412`는
  `generateVideoViaGrok()` I2V, `:424-479`는 sidecar 저장 후 history invalidation,
  `:483-498`은 그 뒤 terminal `done` 순서를 보여준다.
- `lib/videoContinuity.ts:21-28`은 prompt continuity의 bounded lineage를 소유한다.
  `lineageId/parentFilename/sourceFrame/최대 4 prompt` 계약이지 durable clip graph의
  `id/parentId/rootId/seriesId/sequenceIndex` 계약은 아니다.
- `lib/inflight.ts`, `lib/eventBus.ts`, `routes/events.ts`, `lib/ssePublish.ts:8-15`로
  async lifecycle, multiplexed replay SSE, cancel 후 done 억제가 이미 가능하다.
- `tests/videoExtendedRoute.test.ts`는 현재 **8건**이다. 실제 구성은 edit 2,
  provider-native extend 2, frame 2, analyze 2다.
- `ResultActions.tsx:312-329`는 Extend 버튼에서 `actionImage.url || actionImage.image`를
  `videoUrl`로 보낸다. 일반값 `/generated/foo.mp4`는
  `safeGeneratedFilePath()`에서 generated root 밖 absolute path로 해석되어 거부된다.
- 로컬 환경의 `ffmpeg`와 `ffprobe`는 모두 8.0.1이다. 새 npm dependency는 없다.

### 정밀 보정

1. 새 I2V 계약은 `POST /api/video/extend`가 소유한다. 기존 provider-native sync
   구현은 `POST /api/video/extend/native`로 옮겨 URL/data URL/file ID 입력을
   보존한다.
2. 새 route는 `requestSignal()`이 아니라 job-owned `AbortController`를
   `registerJobAbortController()`에 등록한다. 202 response close는 정상 종료이며
   취소 신호가 아니다.
3. `videoContinuity`는 prompt planning context로 유지하고, 새 `videoLineage`는
   durable graph identity로 병존시킨다. 둘을 한 타입으로 합치지 않는다.
4. sidecar pair 저장 helper만 `lib/videoArtifactPersistence.ts`로 이동한다.
   provider planning/polling/download을 service로 추출하지 않는다.
5. `lib/videoFrameExtract.ts`는 현재 ffprobe를 호출하지 않는다. 이 phase는 기존
   MP4 header/size validation + ffmpeg extraction을 유지하고, ffmpeg unavailable/
   timeout/cancel을 typed error로 정규화한다. 별도 ffprobe preflight는 추가하지 않는다.

## Scope boundary

| 경계 | 항목 |
|---|---|
| IN | local MP4 last-frame → Grok I2V, async 202/inflight/SSE, prompt·motion inheritance, `videoContinuity` + `videoLineage`, pair rollback/history/UI state, `/extend/native` 격리 |
| OUT | generation-service 추출, remote/data URL ingestion, 새 video provider, series DB/ULID/lineage UI, concat/compare, `agent/*`, subscription-mcp Tier 2, git/release |

## 외부 계약

### Request / accepted response

```ts
type ExtendI2VRequest = {
  sourceVideoId: string;       // generated root의 local .mp4 filename
  requestId?: string;
  prompt?: string;             // 없으면 parent sidecar에서 상속
  provider?: "grok" | "grok-api";
  model?: string;
  motionPresetIds?: string[];  // 없으면 parent metadata에서 상속
  duration?: number;
};

type ExtendAccepted = {
  ok: true;
  requestId: string;
  sourceVideoId: string;
  workflow: "last-frame-i2v";
};
```

`POST /api/video/extend`는 job 등록 성공 후 항상 202를 반환한다. URL, data URL,
`/generated/...`를 source URL로 보내는 계약은 없다. canonical ID는 sidecar와 history가
이미 사용하는 `filename`이다.

### Terminal done

```ts
type VideoLineage = {
  id: string;             // child filename
  parentId: string;       // sourceVideoId
  rootId: string;         // 최초 clip filename
  seriesId: string;       // 최초 clip filename; 별도 ID 발급 없음
  sequenceIndex: number;  // root=0으로 보고 child는 parent + 1
};

type ExtendDone = {
  requestId: string;
  filename: string;
  url: string;
  mediaType: "video";
  video: {
    operation: "extend";
    mode: "image-to-video";
    sourceVideoId: string;
    sourceFrame: "last";
    duration: number | null;
    resolution: string;
    aspectRatio: string;
    xaiVideoRequestId: string;
  };
  videoLineage: VideoLineage;
  videoContinuity: VideoContinuityLineage;
};
```

첫 child는 `rootId = seriesId = parent filename`, `sequenceIndex = 1`이다. child의
child는 parent sidecar의 root/series를 이어받고 index를 1 증가시킨다. 같은 parent의
sibling은 서로 다른 `id`, 같은 `parentId/rootId/seriesId/sequenceIndex`를 가진다.
branch는 `parentId`로 보존한다.

### 오류 계약

| 경계 | code | 전달 |
|---|---|---|
| local source 아님 | `VIDEO_SOURCE_LOCAL_ONLY` | 400 JSON + error event |
| source 없음 | `VIDEO_NOT_FOUND` | 404 JSON + error event |
| MP4 invalid/corrupt | `VIDEO_FRAME_EXTRACT_FAILED` | terminal error |
| ffmpeg 실행 파일 없음 | `VIDEO_FRAME_EXTRACT_UNAVAILABLE` | terminal error |
| ffmpeg timeout | `VIDEO_FRAME_EXTRACT_TIMEOUT` | terminal error, retryable |
| provider/mode unsupported | `VIDEO_EXTEND_UNSUPPORTED` | 400 JSON + error event |
| duplicate request ID | `REQUEST_ID_IN_USE` | 409 JSON + error event |
| capacity | `TOO_MANY_JOBS` | 429 + `Retry-After` |
| cancel | `GENERATION_CANCELED` | terminal error, done 없음 |
| persist/sidecar commit | `VIDEO_PERSIST_FAILED` | terminal error, MP4 rollback, done 없음 |

## Event order

```text
phase:queued
  → phase:extracting-frame
  → planning
  → submitted
  → progress (0..n)
  → phase:persisting
  → done
```

- `startJob()` 직후 `phase { phase: "queued" }`를 publish한다.
- extraction 시작 전에 inflight phase와 SSE phase를 `extracting-frame`으로 바꾼다.
- adapter의 `planning/submitted/progress`를 같은 requestId로 전달한다.
- provider buffer를 받은 뒤 `persisting`을 publish한다.
- `done`은 MP4 write, atomic sidecar rename, history index invalidation이 모두 끝난
  뒤 `publishJobEvent()`로 단 한 번 publish한다.
- cancel이 먼저 terminal 상태를 만들면 `publishJobEvent()`가 늦은 `done`을 억제한다.

## 정확한 파일 맵

| Op | 파일 | 변경 책임 |
|---|---|---|
| NEW | `lib/videoArtifactPersistence.ts` | MP4 write + atomic sidecar commit + sidecar 실패 시 MP4 rollback |
| NEW | `lib/videoLineage.ts` | filename 기반 durable lineage normalize/derive |
| MODIFY | `lib/videoFrameExtract.ts` | AbortSignal/timeout 옵션과 unavailable/timeout/cancel 오류 분류 |
| MODIFY | `routes/video.ts` | local persistence helper 제거 후 새 lib import만 사용 |
| MODIFY | `routes/videoExtended.ts` | 새 `/extend` async I2V route, 기존 구현을 `/extend/native`로 이동, test dependency seam |
| MODIFY | `lib/historyList.ts` | sidecar의 `videoLineage`를 history row에 투영 |
| MODIFY | `ui/src/types.ts` | `VideoLineage`, `GenerateItem.videoLineage` |
| MODIFY | `ui/src/lib/api-history.ts` | `HistoryItem.videoLineage` |
| MODIFY | `ui/src/store/storeHelpers.ts` | history → `GenerateItem` mapping에서 lineage 보존 |
| MODIFY | `ui/src/lib/api-generation.ts` | `postVideoExtendStream()` 202 + SSE client |
| MODIFY | `ui/src/lib/api.ts` | extend client/types export |
| MODIFY | `ui/src/components/ResultActions.tsx` | filename 요청, pending/error/done UI와 history 삽입 |
| MODIFY | `tests/videoExtendedRoute.test.ts` | native 경로 보존 + async I2V route matrix |
| MODIFY | `tests/videoRoute.test.ts` | persistence helper import 경로 변경, rollback 회귀 유지 |
| MODIFY | `tests/history-video-row.test.ts` | `videoLineage` sidecar → history round-trip |
| NEW | `tests/video-extend-ui-contract.test.js` | filename payload, SSE subscription, pending/error/done 정적 계약 |

생성된 `.js`, `ui/dist`는 직접 수정하지 않는다. `routes/videoExtended.ts`의 optional
dependency seam은 테스트에서 extraction/generation/persistence 조건을 결정적으로
활성화하기 위한 것이며 production default는 실제 helper다.

## Diff-level 설계

### 1. persistence helper만 추출

Before — `routes/video.ts`가 pair write를 직접 소유한다.

```ts
export async function saveGeneratedVideoArtifact(ctx, filename, buffer, metadata) {
  const filePath = join(ctx.config.storage.generatedDir, filename);
  await writeFile(filePath, buffer);
  try { await atomicWriteJson(`${filePath}.json`, metadata); }
  catch (error) { await unlink(filePath).catch(() => {}); throw error; }
}
```

After — 경로/쓰기 책임만 lib로 이동한다.

```ts
// lib/videoArtifactPersistence.ts
export async function persistVideoArtifact(generatedDir, filename, buffer, metadata) {
  const filePath = join(generatedDir, filename);
  await writeFile(filePath, buffer);
  try { await atomicWriteJson(`${filePath}.json`, metadata); }
  catch (error) { await unlink(filePath).catch(() => {}); throw error; }
}
```

`routes/video.ts`와 `routes/videoExtended.ts`는 이 함수만 import한다. download,
planner, provider adapter, thumbnail, event emit은 각 route에 남는다. 기존
`saveVideoResult()`도 download 후 이 helper를 호출해 native edit/extend의 sidecar를
atomic rename으로 맞춘다.

### 2. prompt continuity와 durable lineage 분리

Before — child graph ID가 없다.

```ts
type VideoContinuityLineage = { lineageId: string; parentFilename: string | null;
  sourceFrame: "last" | null; entries: VideoContinuityEntry[] /* 최대 4 */ };
```

After — 새 모듈이 sidecar graph만 계산한다.

```ts
// lib/videoLineage.ts
export function deriveChildVideoLineage(childFilename, parentFilename, parentMetadata) {
  const parent = normalizeVideoLineage(parentMetadata?.videoLineage);
  return {
    id: childFilename, parentId: parentFilename,
    rootId: parent?.rootId ?? parentFilename,
    seriesId: parent?.seriesId ?? parentFilename,
    sequenceIndex: (parent?.sequenceIndex ?? 0) + 1,
  };
}
```

normalize는 모든 ID가 non-empty `.mp4` filename인지, index가 0 이상 정수인지
검증한다. parent sidecar에 malformed lineage가 있으면 조용히 새 root를 만들지 않고
`VIDEO_LINEAGE_INVALID`로 fail closed한다.

### 3. extraction을 cancel-aware로 확장

Before:

```ts
extractVideoFrame(input, output, "last");
```

After:

```ts
extractVideoFrame(input, output, "last", { signal: cancelController.signal, timeoutMs: 30_000 });
```

- `execFile`에 `signal`, timeout, platform kill signal을 전달한다.
- `ENOENT`는 `VIDEO_FRAME_EXTRACT_UNAVAILABLE`로 바꾼다.
- timeout/kill은 `VIDEO_FRAME_EXTRACT_TIMEOUT`으로 바꾼다.
- caller signal abort는 `GENERATION_CANCELED`로 보존한다.
- 그 외 ffmpeg decode 실패는 `VIDEO_FRAME_EXTRACT_FAILED`다.
- temp PNG cleanup은 성공/실패/cancel 모두 `finally`에서 수행한다.

### 4. `/api/video/extend`를 async I2V로 교체

Before:

```ts
const { prompt, videoUrl } = req.body;
const apiRes = await fetch("/v1/videos/extensions", ...);
const result = await pollVideoUntilDone(...);
res.json(saved); // 200
```

After orchestration sketch:

```ts
app.post("/api/video/extend", async (req, res) => {
  const requestId = normalizeBodyRequestId(req.body?.requestId, req.id);
  const sourceVideoId = requireLocalSourceVideoId(req.body?.sourceVideoId);
  const parentMeta = await readVideoSidecar(generatedDir, sourceVideoId); // sidecarless면 explicit prompt 필요
  const prompt = resolveExtendPrompt(req.body?.prompt, parentMeta);
  const options = resolveExtendOptions(req.body, parentMeta);
  const started = startJob({ requestId, kind: "video", prompt,
    meta: { workflow: "last-frame-i2v", sourceVideoId } });
  if (isStartJobFailure(started)) return respondStartFailure(...);
  const cancelController = new AbortController();
  registerJobAbortController(requestId, cancelController);
  publishPhase(requestId, "queued");
  res.status(202).json({ ok: true, requestId, sourceVideoId, workflow: "last-frame-i2v" });
  try {
    publishPhase(requestId, "extracting-frame");
    const frameB64 = await extractGeneratedVideoFrameB64(generatedDir, sourceVideoId,
      "last", { signal: cancelController.signal });
    const result = await generateVideoViaGrok(compiledPrompt, ctx, {
      ...options, mode: "image-to-video", sourceImage: frameB64,
      continuityLineage: parentContinuity,
      signal: cancelController.signal, requestId, onEvent: forwardVideoEvent,
    });
    publishPhase(requestId, "persisting");
    await persistVideoArtifact(generatedDir, filename, result.videoBuffer, metadata);
    invalidateHistoryIndex();
    publishJobEvent(requestId, "done", donePayload);
  } catch (error) {
    publishNormalizedError(requestId, error);
  } finally {
    finishJob(requestId, finishState);
  }
});
```

검증·sidecar 조회처럼 202 전에 끝나야 하는 오류는 JSON과 bus error를 함께 보낸다.
202 후 오류는 SSE terminal error만 보낸다. `motionPresetIds`는 명시값 우선,
없으면 parent의 `motionPresetIds`, 그마저 없으면 parent `presetIds` 중 motion catalog
ID만 상속한다. fragment는 Grok용으로 컴파일해 generation prompt에 붙이고 선택 ID는
sidecar에 별도 보존한다.

`provider`는 이 phase에서 `grok|grok-api`만 허용한다. model/duration/resolution/
aspect ratio는 request → parent sidecar → 현재 video default 순서로 resolve한 뒤 기존
normalizer/capability validation을 통과시킨다.

### 5. provider-native legacy 경로 보존

기존 handler body는 `POST /api/video/extend/native`로 옮긴다. 이 경로만
`videoUrl`, remote URL/data URL/file ID, `/v1/videos/extensions`, sync 200을 사용한다.
새 `/extend` route에서는 `/v1/videos/extensions` 호출이 금지된다.

### 6. ResultActions와 SSE client

Before:

```ts
const url = actionImage.url || actionImage.image;
fetch("/api/video/extend", {
  body: JSON.stringify({ videoUrl: url, prompt: actionImage.prompt || "" }),
}).catch(() => {});
```

After:

```ts
const extend = async () => {
  if (!actionImage.filename || extendState === "pending") return;
  setExtendState("pending");
  try {
    const done = await postVideoExtendStream({
      sourceVideoId: actionImage.filename,
      prompt: actionImage.prompt?.trim() || undefined,
      provider: actionImage.provider === "grok-api" ? "grok-api" : "grok",
      model: actionImage.model ?? undefined,
    });
    useAppStore.getState().addHistoryItem(toVideoHistoryItem(done));
    setExtendState("idle"); showToast(t("result.extendDone"));
  } catch (error) {
    setExtendState("error"); showToast(errorMessage(error), true);
  }
};
```

`postVideoExtendStream()`은 submit 전에 requestId를 만들고 singleton event channel을
구독한다. 202 POST와 `phase/planning/submitted/progress/done/error`를 기존 video
client와 같은 timeout/cancel 규칙으로 처리한다. 버튼은 pending 동안 disabled와
진행 label을 보이고, error 후 재시도 가능해야 한다. component unmount/abort 시
`DELETE /api/inflight/:requestId` 경로를 사용한다.

### 7. history round-trip

Before:

```ts
videoContinuity: meta?.videoContinuity || null,
```

After:

```ts
videoContinuity: meta?.videoContinuity || null,
videoLineage: meta?.videoLineage || null,
```

동일 필드를 `HistoryItem`, `GenerateItem`, `mapHistoryItem()`에 관통시킨다. terminal
done으로 즉시 추가한 item과 새로고침 후 `/api/history`에서 복원한 item의
`videoLineage`가 deep-equal이어야 한다.

## 테스트 명세

### `tests/videoExtendedRoute.test.ts`

기존 8건은 유지하되 두 native extension 테스트의 endpoint를
`/api/video/extend/native`로 바꾼다. 새 focused cases는 다음과 같다.

| ID | 활성화 | assertion |
|---|---|---|
| I2V-01 | valid parent + fixed requestId | 202 body가 `ok/requestId/sourceVideoId/workflow`를 정확히 반환 |
| I2V-02 | 같은 active requestId 두 번 | 두 번째 409 `REQUEST_ID_IN_USE`, provider 1회 |
| I2V-03 | real tiny MP4 + proxy capture | `/v1/videos/generations` payload `image.url`이 PNG data URL |
| I2V-04 | proxy URL capture | `/v1/videos/extensions` 호출 0회 |
| I2V-05 | extraction dependency throws | `VIDEO_FRAME_EXTRACT_FAILED`, provider call 0회, temp 없음 |
| I2V-06 | spawn `ENOENT` seam | `VIDEO_FRAME_EXTRACT_UNAVAILABLE` |
| I2V-07 | deterministic timeout seam | `VIDEO_FRAME_EXTRACT_TIMEOUT`, retryable metadata |
| I2V-08 | root parent sidecar | child `id/parentId/rootId/seriesId/index=1` |
| I2V-09 | child를 다시 source로 | grandchild root/series 유지, index=2 |
| I2V-10 | 같은 parent에서 2회 | sibling ID 다름, parent/root/series/index 같음 |
| I2V-11 | request prompt 생략 | parent `userPrompt→prompt→revisedPrompt` 우선순위 상속 |
| I2V-12 | motion 생략 | parent motion IDs와 Grok fragment 상속 |
| I2V-13 | persist seam throws | MP4 rollback, error 1회, done 0회 |
| I2V-14 | extraction/generation 중 `abortJob()` | `GENERATION_CANCELED`, done 0회 |
| I2V-15 | bus event capture | queued→extracting→planning→submitted/progress→persisting→done 순서 |
| I2V-16 | remote/data URL sourceVideoId | 400 `VIDEO_SOURCE_LOCAL_ONLY`, generation 0회 |

### persistence/history/UI

- `tests/videoRoute.test.ts`: helper import를 새 lib로 바꾸고 sidecar commit 실패 시
  known filename MP4가 삭제되는 기존 회귀 테스트를 유지한다.
- `tests/history-video-row.test.ts`: sidecar에 `videoLineage`를 넣고
  `listHistoryRows()` 결과 deep-equal을 검증한다.
- `tests/video-extend-ui-contract.test.js`: `ResultActions`가 `.url`이 아니라
  `.filename`을 `sourceVideoId`로 전달하는지, `postVideoExtendStream`이 singleton SSE를
  구독하는지, pending disabled/error retry/done history 삽입 경로가 있는지 고정한다.
- UI typecheck가 `HistoryItem → mapHistoryItem → GenerateItem`의 lineage 누락을 잡도록
  세 타입을 모두 명시한다.

## ACTIVATION SCENARIOS — C에서 조건부 경로를 켜는 법

조건부 코드는 단순 mock 존재만으로 커버했다고 보지 않는다. C 검증에서 다음처럼
실제 branch를 활성화한다.

### C1 — extraction failure

1. generated root에 MP4 header는 통과하지만 ffmpeg decode가 실패하는 fixture를 둔다.
2. 202를 받은 뒤 bus terminal error를 기다린다.
3. provider proxy의 generations/extensions call counter가 모두 0인지 확인한다.
4. `frame_tmp_*.png`와 child MP4가 남지 않았는지 확인한다.

### C2 — cancel

1. extraction 또는 generation dependency를 signal 대기 promise로 멈춘다.
2. 202와 `extracting-frame` 또는 `submitted`를 관찰한 뒤 `abortJob(requestId)`를 호출한다.
3. dependency가 AbortError/normalized cancel로 빠지는지 확인한다.
4. terminal error는 1회, done은 0회인지 eventBus에서 센다.

### C3 — duplicate requestId

1. 첫 job을 extraction gate에서 멈춰 inflight 상태를 유지한다.
2. 같은 `requestId/sourceVideoId`로 두 번째 POST를 보낸다.
3. 두 번째가 409 `REQUEST_ID_IN_USE`이고 첫 job의 provider call count가 증가하지
   않았는지 확인한다.
4. gate를 해제하거나 cancel해 test-owned inflight를 정리한다.

### C4 — sidecar failure

1. route dependency seam의 `persistVideoArtifact`를 MP4 write 뒤 sidecar commit에서
   throw하는 실제 helper fixture로 교체한다.
2. known child filename을 사용해 MP4가 rollback됐는지 filesystem으로 확인한다.
3. history row가 생기지 않고 error 1회/done 0회인지 확인한다.
4. direct helper 회귀 테스트와 route terminal-event 테스트를 둘 다 통과시킨다.

## 수용 기준

- `/api/video/extend`는 local filename을 받아 즉시 202를 반환하고, response close로
  job이 취소되지 않는다.
- 마지막 프레임이 I2V `image.url`로 주입되고 `/v1/videos/extensions`는 호출되지 않는다.
- event order가 queued → extracting-frame → planning → submitted/progress → persisting
  → done이며 done은 sidecar commit + history invalidation 뒤에만 발생한다.
- extraction 실패는 provider call 0회다.
- duplicate/capacity/cancel이 기존 inflight 계약과 동일한 code/terminal semantics를
  가진다.
- child/child-of-child/sibling의 `videoLineage`가 filename 기반 규칙을 만족한다.
- explicit prompt/motion이 parent inheritance보다 우선하고, 생략 시 sidecar에서
  복원된다.
- sidecar 실패 시 MP4 rollback, history 없음, done 없음이다.
- ResultActions는 `actionImage.filename`을 보내며 pending/error/done을 사용자에게
  보이고 terminal child를 history에 추가한다.
- history reload 후 `videoLineage`가 손실되지 않는다.
- legacy `/api/video/extend/native`의 기존 edit/extension validation 테스트가 green이다.
- `npm run typecheck`, `npm run typecheck:tests`, focused tests, `npm test`,
  `npm run test:inventory`, `cd ui && npm run build`가 모두 green이다.

## 중단 조건

- 기존 adapter가 `image.url` I2V payload를 만들지 못하거나 local frame base64를
  받지 못하면 `BLOCKED: I2V_ADAPTER_CONTRACT`로 기록한다.
- cancel-aware ffmpeg 실행이 현재 Node 20 계약에서 signal을 전달하지 못하면 별도
  child-process wrapper 확장이 필요하다. 이는 `lib/videoFrameExtract.ts` 안에서만
  허용하며 generation service 추출로 범위를 넓히지 않는다.
- 새 provider, remote source ingestion, series DB가 필요해지면 이 phase를 확장하지
  않고 별도 decade 제안으로 반환한다.
