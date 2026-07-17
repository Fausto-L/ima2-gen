---
created: 2026-06-08
tags: [architecture, sse, multiplexing, eventbus, async-generation]
---

# SSE 멀티플렉싱 아키텍처

## 1. 개요

### 문제: 브라우저 HTTP 연결 한도

기존 UI는 **생성 작업마다 POST 응답을 SSE(`text/event-stream`)로 유지**했다. multimode·node·video 각각이 15분까지 연결을 점유하고, 갤러리 이미지·히스토리 등 추가 GET까지 합치면 **동일 origin당 브라우저 연결 상한(일반적으로 6)** 에 걸린다.

| 시나리오 | 기존 동작 | 결과 |
|----------|-----------|------|
| 동시 생성 4건 + 갤러리 이미지 로드 | POST SSE ×4 + GET 이미지 | 연결 포화 |
| 동시 생성 7건 이상 | POST SSE ×7+ | **hang** — 새 GET(썸네일·갤러리) 대기 |

근거: `devlog/_fin/260608_sse-multiplexing/04_eventbus-implementation.md` RCA,
`devlog/_fin/260608_sse-multiplexing/01_client-audit.md` E2E 감사.

### 해결: 단일 SSE 채널 + async POST

- **생성 요청**: `async: true` → 즉시 `202 { requestId }` 반환, upstream 생성은 detached.
- **진행 이벤트**: 서버 `eventBus.publish()` → **단일** `GET /api/events` SSE → 클라이언트 `eventChannel`이 `requestId`로 라우팅.
- **갤러리/정적 GET**: POST SSE가 연결 슬롯을 점유하지 않음.

CLI·레거시 클라이언트는 `async`를 보내지 않으면 **기존 per-request SSE** 경로가 그대로 동작한다 (`routes/nodes.ts:38-39`, `routes/multimode.ts:90-95`, `routes/video.ts:137-142`).

---

## 2. 아키텍처 다이어그램 (텍스트)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser (UI)                                                            │
│                                                                         │
│  App.tsx mount                                                          │
│    ensureConnected() ──► EventSource GET /api/events  (singleton, 1 conn)│
│    onResync(() => reconcileInflight())                                │
│                                                                         │
│  postMultimodeGenerateStream / postNodeGenerateStream /                 │
│  postVideoGenerateStream                                                │
│    1. requestId = payload.requestId ?? `req_|nreq_|vreq_${uuid}`        │
│    2. subscribe(requestId, null, handler)   ← POST **이전** 등록 (race 방지)│
│    3. POST /api/.../generate  body: { ...payload, async: true, requestId }│
│    4. 202 { requestId }  → handler가 phase/partial/done/error 수신      │
│    5. done → resolve / error → reject / armStreamTimeout(30min)         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    POST async:true          GET /api/events (persistent)
                                │                      │
                                ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Express Server                                                          │
│                                                                         │
│  routes/{multimode,nodes,video}.ts                                      │
│    asyncMode = body.async === true                                      │
│    if (asyncMode) res.status(202).json({ requestId })  // 즉시 반환   │
│    ... generation loop ...                                              │
│    dualEmit / writeSse + publish(requestId, event, data)              │
│                                                                         │
│  lib/eventBus.ts                                                        │
│    publish(jobId, event, data) → ring buffer + EventEmitter.emit      │
│                                                                         │
│  routes/events.ts  GET /api/events                                      │
│    replaySince(Last-Event-ID) → live subscribe → SSE write              │
│    heartbeat : ping every 15s                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**이벤트 흐름 (multimode 예시)**

1. `POST /api/generate/multimode` + `{ async: true, requestId: "req_abc" }`
2. 서버 `202 { requestId: "req_abc" }` — HTTP 연결 해제
3. 생성 중 `publish("req_abc", "phase", …)` → `/api/events` 구독자 전원 수신
4. 클라이언트 `eventChannel.dispatch()` → `jobId === "req_abc"` 구독 handler 호출
5. `publish("req_abc", "done", payload)` → Promise resolve

---

## 3. 서버 컴포넌트

### 3.1 `lib/eventBus.ts` — pub/sub + ring buffer

| 항목 | 구현 |
|------|------|
| Pub/sub | Node.js `EventEmitter`, 채널명 `"event"` |
| 시퀀스 ID | 전역 `seq` monotonic increment → SSE `id:` 필드·`Last-Event-ID` replay용 |
| Ring buffer | `BusEvent[]`, 상한 `RING_SIZE` |
| Listener cap | `bus.setMaxListeners(MAX_SSE_LISTENERS)` |

```typescript
// lib/eventBus.ts:10-15
export const RING_SIZE = 2000;
export const MAX_SSE_LISTENERS = 512;
```

**`publish(jobId, event, data)`** (`lib/eventBus.ts:32-41`)

1. `seq++`, `{ id, jobId, event, data }` 생성
2. `toRingEntry()`로 ring 저장 여부 결정
3. ring push (초과 시 `shift()`)
4. `bus.emit("event", entry)` — **live 구독자에는 항상 full payload**

**대형 이미지 처리** (`lib/eventBus.ts:20-30`)

- `data.image`가 string이고 `length > 1000`이면 "대형"으로 간주
- `partial` / `image` / `done`: ring에는 `image` 제거 + `_imageOmitted: true`, 나머지 메타 유지
- 그 외 이벤트 타입 + 대형 image: ring **미저장** (`null` 반환)
- live SSE 구독자는 base64 포함 full event 수신 (`tests/event-bus.test.ts:74-81`)

**`replaySince(lastEventId)`** (`lib/eventBus.ts:48-51`)

- `ring.findIndex(e => e.id > lastEventId)` 이후 slice
- unknown id → `[]`

**테스트로 검증된 계약** (`tests/event-bus.test.ts`, `tests/events-channel-contract.test.ts`)

- 다중 job 동시 publish·delivery
- ring cap: `RING_SIZE + 100` publish 후 replay 길이 = `RING_SIZE`, 최소 id = 101
- stripped replay metadata on large images

### 3.2 `routes/events.ts` — SSE endpoint

등록: `routes/index.ts` → `registerEventsRoute(app, ctx)`.

| 동작 | 코드 위치 |
|------|-----------|
| Capacity guard | `activeConnections >= MAX_SSE_LISTENERS` → **503** `SSE_CAPACITY` |
| Headers | `text/event-stream`, `no-cache`, `keep-alive` |
| Replay | `Last-Event-ID` header **또는** `?lastEventId=` query (`routes/events.ts:37-54`) |
| Replay gap | `hasReplayGap(lastId)` → `replay-gap` event (`routes/events.ts:41-49`) |
| Live fan-out | `subscribe()` → `formatSse()` → `safeWrite()` |
| Heartbeat | `setInterval` **15_000** ms, `: ping\n\n` (`routes/events.ts:61-63`) |
| Proxy | `X-Accel-Buffering: no` (`routes/events.ts:32`) |
| Cleanup | `req.close` / `res.close` / `res.error` → unsub + clearInterval + `res.end()` (`routes/events.ts:65-77`) |

**SSE 포맷** (`routes/events.ts:17-18`)

```
id: {seq}
event: {eventName}
data: {JSON.stringify({ ...data, jobId })}
```

`jobId`는 data JSON에 **중복 주입** — 클라이언트가 `data.jobId ?? data.requestId`로 라우팅.

### 3.3 Dual-emit — 기존 per-request SSE 호환 + eventBus

`async: false`(또는 미설정)일 때 응답 본문을 SSE로 유지하면서, 동시에 `publish()`로 멀티플렉스 채널에도 방송.

| Route | Helper | 패턴 |
|-------|--------|------|
| `routes/multimode.ts` | `dualEmitMultimode()` | `writeSse` + `publish` (`:38-41`) |
| `routes/video.ts` | `dualEmitVideo()` | `sendSse` + `publish` (`:48-51`) |
| `routes/nodes.ts` | (inline) | `writeSse` + `publish` (`:214-215`, `:299-300`, `:443-447`) |

`dualEmit*`는 `res.writableEnded` 검사 후 legacy SSE write — async 모드에서는 202 후 `res`가 이미 종료되어 **publish만** 실질적으로 전달된다.

**partial 이중 경로 (multimode)** (`routes/multimode.ts:361-362`)

- 일부 upstream callback에서 `writeSse` + `publish`를 직접 호출 (dualEmitMultimode 미사용 구간 존재)

### 3.4 Async mode — `body.async === true`

공통 패턴 (nodes / multimode / video):

```typescript
const asyncMode = body.async === true;  // 또는 req.body?.async
// ...
registerJobAbortController(requestId, cancelController);
if (asyncMode) res.status(202).json({ requestId });
// ... detached generation continues ...
```

| Route | 202 시점 | requestId 출처 |
|-------|----------|----------------|
| `POST /api/node/generate` | validation·startJob 후 (`nodes.ts:183`) | `body.requestId` ?? `req.id` |
| `POST /api/generate/multimode` | (`multimode.ts:197`) | `body.requestId` ?? `req.id` |
| `POST /api/video/generate` | (`video.ts:260`) | `body.requestId` ?? `body.clientRequestId` ?? `req.id` |

**Node legacy SSE 분기** (`nodes.ts:38-39`)

```typescript
const asyncMode = body.async === true;
const streamResponse = !asyncMode && wantsSse(req);  // Accept: text/event-stream
```

- `asyncMode` → 202 JSON, `publish` only
- `streamResponse` → 200 SSE headers + dual-emit
- 그 외 → 최종 `res.json(payload)`

**에러 경로**

- **Validation (요청 전/초기)**: async면 HTTP 4xx JSON (`multimode.ts:respondMultimodeValidationError`, `video.ts:fail` async 분기)
- **Runtime**: `publish(requestId, "error", …)` + legacy SSE 또는 JSON (`writeNodeError`, `dualEmit* error`)

### 3.5 `lib/nodeHelpers.ts` — `writeNodeError`

```typescript
// lib/nodeHelpers.ts:41-64
export function writeNodeError(res, status, code, message, parentNodeId, details, requestId?) {
  const payload = { error: { code, message }, parentNodeId, status, ...details };
  if (requestId) publish(requestId, "error", payload);  // 멀티플렉스 채널
  if (res.headersSent) { writeSse(res, "error", payload); res.end(); return; }
  res.status(status).json(payload);
}
```

- `requestId`가 있으면 **항상 eventBus error publish** (async UI가 수신)
- legacy SSE: headers 이미 sent면 `writeSse("error")`
- 그 외 JSON error

### 3.6 `lib/inflight.ts` — 취소 시 eventBus 연동

`abortJob()` (`lib/inflight.ts:115-137`): upstream abort + 즉시

```typescript
publish(requestId, "error", {
  error: "Generation canceled",
  code: "GENERATION_CANCELED",
  status: 499,
  requestId,
});
```

route catch 대기 없이 클라이언트에 cancel 알림
(`devlog/_fin/260608_sse-multiplexing/01_client-audit.md` D6).

---

## 4. 클라이언트 컴포넌트

### 4.1 `ui/src/lib/eventChannel.ts` — singleton EventSource

| 상수/상태 | 값 |
|-----------|-----|
| `JOB_STREAM_TIMEOUT_MS` | `30 * 60 * 1000` (30분) |
| reconnect backoff | **2000** ms base × **1.5^n**, cap **30 s** (`RECONNECT_BASE_MS`, `RECONNECT_MAX_MS`) |
| `EVENT_TYPES` | `phase`, `partial`, `image`, `done`, `error`, `submitted`, `progress`, `planning` |
| `lastEventId` | 각 MessageEvent의 `lastEventId` 갱신 → reconnect URL에 포함 |

**연결** (`eventChannel.ts:25-54`)

- `buildEventsUrl()`: `/api/events` 또는 `/api/events?lastEventId={id}`
- `connect()`: singleton `EventSource`, `onerror` → close → exponential backoff reconnect
- `onopen`: attempt reset + 재연결 시(`wasEverConnected`) `resyncCallback()` 호출

**라우팅** (`eventChannel.ts:47-58`)

```typescript
const jobId = (data.jobId ?? data.requestId ?? "") as string;
for (const sub of subs) {
  if (sub.jobId !== jobId) continue;
  if (sub.event !== null && sub.event !== eventType) continue;
  sub.handler(eventType, data);
}
```

**Public API**

| 함수 | 역할 |
|------|------|
| `subscribe(jobId, event, handler)` | job별 handler 등록; 필요 시 connect |
| `ensureConnected()` | App mount·stream API 호출 전 연결 보장 |
| `onResync(cb)` | reconnect 후 inflight reconcile hook |
| `armStreamTimeout(onTimeout, ms?)` | 30분 무응답 시 reject + `cancelInflight` |
| `disconnect()` | teardown (테스트·전역 reset용) |

**App 통합** (`ui/src/App.tsx:86-89`)

```typescript
reconcileInflight();
ensureConnected();
onResync(() => reconcileInflight());
```

### 4.2 API clients — async POST → subscribe → settle

공통 패턴 (`api-generation.ts`, `nodeApi.ts`):

1. `requestId` 생성 (`crypto.randomUUID()` fallback)
2. `ensureConnected()`
3. **`subscribe(requestId, …)` 먼저** — POST 202 이전 이벤트 유실 방지 (감사 D1)
4. `armStreamTimeout` + optional `AbortSignal` → `cancelInflight(requestId)`
5. `fetch(…, { body: JSON.stringify({ …payload, async: true, requestId }) })`
6. `!res.ok` → JSON error parse → reject
7. `done` / `error` SSE event → resolve / reject

| Client | Endpoint | requestId prefix |
|--------|----------|------------------|
| `postMultimodeGenerateStream` | `POST /api/generate/multimode` | `req_` |
| `postNodeGenerateStream` | `POST /api/node/generate` | `nreq_` |
| `postVideoGenerateStream` | `POST /api/video/generate` | `vreq_` |

**Store wiring**

- `storeGenImpl.ts` → `postMultimodeGenerateStream`
- `storeNodeGenImpl.ts` → `postNodeGenerateStream`
- video store → `postVideoGenerateStream`

**Non-stream legacy**

- `postNodeGenerate()` (`nodeApi.ts:54-69`): plain JSON POST, `async` 없음 — 점진적 마이그레이션용 잔존 API

---

## 5. 하위호환

| 클라이언트 | `async` | 서버 응답 | 이벤트 수신 |
|------------|---------|-----------|-------------|
| **CLI / curl** | 미전송 | per-request SSE (`Accept: text/event-stream`) 또는 JSON | 응답 스트림 직접 |
| **UI (신규)** | `true` | `202 { requestId }` | `GET /api/events` |
| **UI (레거시)** | `postNodeGenerate` 등 | JSON final | eventBus 미사용 |

서버 dual-emit 덕분에 **동일 route**가 legacy SSE와 eventBus를 병행 — CLI 변경 불필요.

Node mode 문서(`structure/05-node-mode.md`)의 `Accept: text/event-stream` 설명은 legacy 경로; UI node generation은 `postNodeGenerateStream` + async로 전환됨.

---

## 6. 제한사항 & 알려진 리스크

> 상세 감사 ID(R-MEM-*, F-*, D*) 및 통합 우선순위는
> `devlog/_fin/260608_sse-multiplexing/00_risk-summary.md` 참조.
> 패치 로그: `devlog/_fin/260608_sse-multiplexing/03_server-side-risk-audit.md`,
> `devlog/_fin/260608_sse-multiplexing/02_frontend-risk-audit.md`,
> `devlog/_fin/260608_sse-multiplexing/01_client-audit.md`.

| ID | 리스크 | 설명 | 완화 | 상태 |
|----|--------|------|------|------|
| R8 | **Node async phase/partial gap** | `asyncMode`에서 `streamResponse=false` → phase/partial 미발행 (감사 R-RACE-02) | `emitProgress = streamResponse \|\| asyncMode` (`routes/nodes.ts:208-220,296-304`) | **PATCHED** |
| R1 | **Ring buffer overflow** | `RING_SIZE`(2000) 초과 시 oldest drop → cross-job `replaySince` 불완전 (R-MEM-02, D3, F-RECON-02) | 500→2000 상향; `replay-gap` + `reconcileInflight()`; terminal `done` 메타는 stripped image와 함께 replay | **MONITORING** |
| R2 | **대형 이미지 replay** | reconnect replay에서 `partial`/`image`/`done` base64 생략 (`_imageOmitted: true`) (R-MEM-03, D5) | live 연결 중 full image; reconnect 후 partial preview gap — `done` filename/url로 최종 복구 | **ACCEPTED** |
| R3 | **requestId 충돌** | 동일 `requestId` 재사용 시 inflight row 덮어쓰기·handler 혼선 (R-RACE-03, D4) | `crypto.randomUUID()` fallback + 서버 `startJob` 409 `REQUEST_ID_IN_USE` guard + PK constraint catch | **PATCHED** |
| R4 | **SSE capacity / zombie conn** | 동시 `/api/events` > 512 → 503; cleanup 미종료 시 phantom slot (R-MEM-01, R-CONN-01) | `MAX_SSE_LISTENERS=512`; `cleanup()` → `res.end()`; UI singleton 1 conn | **PATCHED** |
| R5 | **Process restart** | inflight upstream fetch 중단 | SQLite inflight + `reconcileInflight()` polling; upstream 재개 불가 | **MITIGATED** |
| R6 | **Stream timeout** | 30분 무 `done`/`error` (F-UX-03) | `JOB_STREAM_TIMEOUT_MS` + `cancelInflight` + reconnect resync | **MITIGATED** |
| R7 | **단일 채널 직렬화** | 대형 event JSON 순차 전송 → 타 job phase 지연 (F-UX-02, R-CONC-01) | localhost latency; inflight polling 보조; 설계 trade-off (Decision #4) | **ACCEPTED** |
| — | **subscribe-before-fetch race** | POST 202 이전 ultra-fast publish → handler 미등록 (R-RACE-01, F-RECON-03, D1) | subscribe-before-fetch + `tests/async-stream-subscribe-order.test.js` | **PATCHED** |
| — | **Cancel error shape** | `abortJob` flat vs `writeNodeError` nested (F-STATE-01) | `parseSseErrorPayload()` (`ui/src/lib/sseStreamError.ts`) | **PATCHED** |
| — | **Cancel UI noise** | node/video cancel 시 error toast (F-STATE-02) | `isCanceledGenerationError` 분기 (`storeNodeGenImpl`, `storeVideoImpl`) | **PATCHED** |
| — | **/api/events 무인증 fan-out** | localhost 가정; 타 탭이 job 이벤트 수신 가능 (R-SEC-01) | session token filter 미구현 | **OPEN** |
| — | **동시 inflight 상한** | 7+ job 시 upstream·SSE 직렬화 지연 (R-CONC-01) | `MAX_CONCURRENT_JOBS=12` + `startJob` 429 `TOO_MANY_JOBS` + `Retry-After: 5` | **PATCHED** |

---

## 7. 설정값 (코드 상수)

| 상수 | 값 | 파일:줄 | 용도 |
|------|-----|---------|------|
| `RING_SIZE` | **2000** | `lib/eventBus.ts:11` | replay ring buffer 크기 |
| `MAX_SSE_LISTENERS` | **512** | `lib/eventBus.ts:13` | EventEmitter maxListeners + `/api/events` active connection cap |
| Large image threshold | **1000** chars | `lib/eventBus.ts:22` | ring strip 기준 (`partial`/`image`/`done` → `_imageOmitted`) |
| Heartbeat interval | **15 s** | `routes/events.ts:61-63` | SSE keep-alive `: ping` |
| `RECONNECT_BASE_MS` | **2000** | `ui/src/lib/eventChannel.ts:12` | EventSource reconnect base delay |
| `RECONNECT_MAX_MS` | **30 s** | `ui/src/lib/eventChannel.ts:13` | exponential backoff cap (`2000 × 1.5^n`) |
| `JOB_STREAM_TIMEOUT_MS` | **30 min** | `ui/src/lib/eventChannel.ts:10` | async job Promise timeout |
| `MAX_CONCURRENT_JOBS` | **12** | `lib/inflight.ts:55` | 동시 inflight job 상한 (초과 시 429) |
| `INFLIGHT_RETRY_AFTER_SECONDS` | **5** | `lib/inflight.ts:56` | 429 Retry-After 헤더 값 |
| `FAILED_THRESHOLD` | **3** | `ui/src/lib/eventChannel.ts:17` | reconnect 실패 횟수 후 `failed` 상태 전환 |

> **참고**: 초기 설계안(`_plan/260608_sse-multiplexing-eventbus.md`)의 `RING_SIZE=500`, `maxListeners=100`, 고정 2s reconnect는 2026-06-08 감사·패치에서 **2000 / 512 / exponential backoff**로 갱신됨.

---

## 8. 관련 파일 인덱스

| 역할 | 경로 |
|------|------|
| Event bus | `/Users/jun/Developer/new/700_projects/ima2-gen/lib/eventBus.ts` |
| SSE route | `/Users/jun/Developer/new/700_projects/ima2-gen/routes/events.ts` |
| Node generate | `/Users/jun/Developer/new/700_projects/ima2-gen/routes/nodes.ts` |
| Multimode generate | `/Users/jun/Developer/new/700_projects/ima2-gen/routes/multimode.ts` |
| Video generate | `/Users/jun/Developer/new/700_projects/ima2-gen/routes/video.ts` |
| Node error helper | `/Users/jun/Developer/new/700_projects/ima2-gen/lib/nodeHelpers.ts` |
| Inflight + cancel publish | `/Users/jun/Developer/new/700_projects/ima2-gen/lib/inflight.ts` |
| Client EventSource | `/Users/jun/Developer/new/700_projects/ima2-gen/ui/src/lib/eventChannel.ts` |
| SSE error normalize | `/Users/jun/Developer/new/700_projects/ima2-gen/ui/src/lib/sseStreamError.ts` |
| Multimode/video client | `/Users/jun/Developer/new/700_projects/ima2-gen/ui/src/lib/api-generation.ts` |
| Node client | `/Users/jun/Developer/new/700_projects/ima2-gen/ui/src/lib/nodeApi.ts` |
| Tests (eventBus) | `/Users/jun/Developer/new/700_projects/ima2-gen/tests/event-bus.test.ts`, `tests/events-channel-contract.test.ts` |
| Tests (risk contract) | `/Users/jun/Developer/new/700_projects/ima2-gen/tests/frontend-sse-risk-contract.test.js`, `tests/node-async-eventbus-contract.test.js`, `tests/async-stream-subscribe-order.test.js` |
| Tests (inflight guard) | `/Users/jun/Developer/new/700_projects/ima2-gen/tests/inflight-guard-contract.test.ts` |
| Tests (connection state) | `/Users/jun/Developer/new/700_projects/ima2-gen/tests/frontend-connection-state-contract.test.js` |
| 통합 리스크 요약 | `/Users/jun/Developer/new/700_projects/ima2-gen/devlog/_fin/260608_sse-multiplexing/00_risk-summary.md` |
| 감사·패치 로그 | `devlog/_fin/260608_sse-multiplexing/03_server-side-risk-audit.md`, `devlog/_fin/260608_sse-multiplexing/02_frontend-risk-audit.md`, `devlog/_fin/260608_sse-multiplexing/01_client-audit.md` |

---

## 9. 검증

```bash
cd /Users/jun/Developer/new/700_projects/ima2-gen
npm run build:server
node --test tests/event-bus.test.ts tests/events-channel-contract.test.ts \
  tests/async-stream-subscribe-order.test.js \
  tests/frontend-sse-risk-contract.test.js \
  tests/node-async-eventbus-contract.test.js \
  tests/inflight-guard-contract.test.ts \
  tests/frontend-connection-state-contract.test.js
cd ui && npm run build
```

eventBus replay·multi-job·large-image strip·route export contract·subscribe-order·node-async·frontend error-payload contract를 단위 테스트로 고정한다.
