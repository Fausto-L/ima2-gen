> **SUPERSEDED** — This WebSocket plan was not implemented. The gallery-hang problem was solved via SSE EventBus multiplexing instead (`devlog/_fin/260608_sse-multiplexing/00_architecture.md`). The `feat/websocket` branch is preserved as a reference but will not be merged.

# SSE → WebSocket Migration Plan (v4 — post-audit-3)

## Background

Gallery images occasionally fail to load during video generation. Root cause:
browsers limit concurrent connections per origin to 6 (HTTP/1.1). Video generation
holds an SSE connection for up to 15 minutes, exhausting available slots for static
file serving (gallery images).

Fix: replace per-request SSE streams with a single multiplexed WebSocket connection.
All generation progress events route through one connection, freeing HTTP slots for
gallery images.

## Architecture

### Current (SSE — 1 connection per generation)

```
Browser                          Server
──────                          ──────
POST /api/video/generate  ──→   SSE (15 min hold)     ← connection 1
POST /api/node/generate   ──→   SSE (1-2 min hold)    ← connection 2
POST /api/generate/multi  ──→   SSE (1-2 min hold)    ← connection 3
GET /generated/img1.png   ──→   static file            ← connection 4
GET /generated/img2.png   ──→   static file            ← connection 5
GET /generated/img3.png   ──→   static file            ← connection 6
GET /generated/img4.png   ──→   ❌ BLOCKED (limit hit)
```

### Target (WebSocket — 1 connection for ALL generation)

```
Browser                          Server
──────                          ──────
ws://localhost:PORT/ws     ──→   WebSocket (1 connection, all events)
POST /api/video/generate  ──→   202 Accepted + bg task  ← connection freed immediately
POST /api/node/generate   ──→   202 Accepted + bg task  ← connection freed immediately
POST /api/generate/multi  ──→   202 Accepted + bg task  ← connection freed immediately
GET /generated/img1.png   ──→   static file            ← connection 2
...                              (5 slots free for gallery)
```

## Protocol Design

### WebSocket message format

All messages are JSON with a common envelope:

```typescript
// Server → Client
interface WsServerMessage {
  type: "event";
  requestId: string;          // vid_xxx, mm_xxx, node_xxx
  event: string;              // "phase", "partial", "progress", "done", "error", etc.
  data: Record<string, unknown>;
}

// Client → Server (subscribe is implicit — see flow below)
interface WsClientMessage {
  type: "cancel";
  requestId: string;
}
```

### Request flow (revised — fixes F1, F2)

**Key change from v1**: No explicit subscribe step. Server auto-broadcasts to ALL
connected WS clients. The client-side wsClient filters by requestId locally.
This eliminates the subscribe-before-POST race condition (F2).

1. Client opens single WebSocket at page load (auto-reconnect on disconnect)
2. Client calls API function (e.g., `postVideoGenerate`)
3. API function registers local event handlers keyed by `requestId`
4. API function POSTs to generation endpoint with `requestId` in body
5. Server validates request → if invalid, returns 4xx JSON (no SSE, no WS)
6. Server calls `startJob(requestId)` + `res.status(202).json({ requestId })`
7. Server runs generation as **detached async task** (not awaited by HTTP handler)
8. During generation, server calls `wsBroadcast(requestId, event, data)` → sent to ALL connected WS clients
9. Client wsClient receives message → checks if `requestId` has registered handlers → dispatches or ignores
10. On `done` or `error`, client unregisters handlers for that `requestId`

### Handler restructure pattern (fixes F1)

Current pattern (SSE — handler awaits entire generation):
```typescript
router.post("/api/video/generate", async (req, res) => {
  // validate
  res.setHeader("Content-Type", "text/event-stream"); // holds connection
  // ...await entire generation with sendSse calls...
  res.end(); // connection freed after 15 min
});
```

New pattern (WS — handler returns immediately):
```typescript
router.post("/api/video/generate", async (req, res) => {
  // validate → if fail, res.status(4xx).json({ error })
  const requestId = req.body.requestId;
  startJob({ requestId, kind: "video", ... });
  registerJobAbortController(requestId, controller);
  res.status(202).json({ requestId });
  // Fire-and-forget: generation runs detached
  runVideoGeneration(req.body, ctx, requestId, controller.signal)
    .catch((err) => wsBroadcast(requestId, "error", errInfo(err)))
    .finally(() => finishJob(requestId, { ... }));
});
```

### Event mapping (SSE → WS)

| SSE endpoint | SSE events | WS events (same names, same payloads) |
|---|---|---|
| video/generate | planning, submitted, progress, done, error | same |
| node/generate | phase, partial, done, error | same |
| generate/multimode | phase, partial, image, done, error | same |

Event names and data payloads remain identical. Only the transport changes.
Store callback signatures (onPartial, onPhase, onProgress, etc.) are NOT affected.

### Client type detection (3-way routing for nodes.ts)

All 3 routes need to distinguish client type. Use a 3-way check:

```typescript
// lib/nodeHelpers.ts — add this helper
export function getStreamTransport(req: Request): "sse" | "ws" | "none" {
  const accept = typeof req.headers.accept === "string" ? req.headers.accept : "";
  if (accept.includes("text/event-stream")) return "sse";   // CLI/agent
  if (req.headers["x-stream-transport"] === "websocket") return "ws";  // UI
  return "none";  // JSON sync (tests, plain API)
}
```

| Client | Accept header | X-Stream-Transport | Route |
|--------|--------------|-------------------|-------|
| CLI (`streamSse`) | `text/event-stream` | - | SSE (existing behavior) |
| UI (`wsClient`) | - | `websocket` | 202 + WS broadcast |
| JSON sync (tests, API) | - | - | 200 JSON (existing behavior) |

The UI frontend (`api-generation.ts`, `nodeApi.ts`) adds `X-Stream-Transport: websocket`
header to all generation POST requests. This cleanly separates the 3 paths.

### Cancel flow

- Client cancel → `DELETE /api/inflight/:requestId` (existing HTTP endpoint, unchanged)
- WS `cancel` message type removed from protocol — HTTP cancel is simpler and already works
- Server `abortJob()` aborts the detached generation task
- Server broadcasts `{ event: "error", data: { code: "GENERATION_CANCELED" } }` via WS
- Client AbortSignal on the POST request only cancels the initial POST (not generation)

## File Changes

### NEW files (3)

1. **`lib/wsServer.ts`** (~80 lines)
   - `createWsServer(server: http.Server)` — creates `WebSocket.Server` on `/ws` path
   - `wsBroadcast(requestId, event, data)` — sends to ALL connected clients (no subscribe registry needed)
   - Heartbeat ping/pong (30s interval) to detect dead connections
   - Cleanup on disconnect

2. **`ui/src/lib/wsClient.ts`** (~90 lines)
   - Singleton WebSocket manager
   - Auto-connect on import, auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
   - `onEvent(requestId, handlers: EventHandlerMap): () => void` — registers handlers, returns unsubscribe fn
   - Incoming message dispatch: parse JSON → match `requestId` → call handler → ignore if no handler
   - Dev mode: connect to same-origin `ws://${location.host}/ws` (routed via Vite proxy)

3. **`ui/src/lib/wsTypes.ts`** (~20 lines)
   - `WsServerMessage` interface
   - `EventHandlerMap = Record<string, (data: unknown) => void>`

### MODIFY files (9)

4. **`server.ts`** — attach WS server (~3 lines)
   - After `listenWithPortFallback`, call `createWsServer(server)`
   - Import: `import { createWsServer } from "./lib/wsServer.js"`

5. **`routes/video.ts`** — detach generation + SSE compat (~50 lines changed)
   - Extract generation logic into `runVideoGeneration(body, ctx, requestId, signal)` async function
   - Import `getStreamTransport` from `nodeHelpers.ts`
   - THREE paths via `getStreamTransport(req)`:
     - `"sse"` (CLI): **keep SSE** streaming (current behavior, unchanged)
     - `"ws"` (UI): validate → startJob → 202 → fire-and-forget → events via `wsBroadcast`
     - `"none"`: not applicable for video (video always streams), treat as `"ws"`
   - Validation errors: JSON for all paths (move validation before SSE headers)
   - `finishJob` stays in detached task's `finally` (WS) or handler's `finally` (SSE)

6. **`routes/nodes.ts`** — detach generation + SSE compat (~50 lines changed)
   - Extract into `runNodeGeneration(...)` async function
   - Replace `wantsSse(req)` with `getStreamTransport(req)` for clean 3-way routing:
     - `"sse"` (CLI/agent via `Accept: text/event-stream`): **keep SSE** — current behavior preserved
     - `"ws"` (UI via `X-Stream-Transport: websocket`): 202 → detached task → events via `wsBroadcast`
     - `"none"` (JSON sync — tests, plain API): existing JSON response, unchanged
   - `writeNodeError` → for WS path use `wsBroadcast`, for SSE path use existing `writeSse`

7. **`routes/multimode.ts`** — detach generation + SSE compat (~45 lines changed)
   - Extract into `runMultimodeGeneration(...)` async function
   - Import `getStreamTransport` from `nodeHelpers.ts`
   - THREE paths via `getStreamTransport(req)`:
     - `"sse"` (CLI): **keep SSE** (current behavior)
     - `"ws"` (UI): validate → startJob → 202 → fire-and-forget → events via `wsBroadcast`
     - `"none"`: not applicable for multimode (always streams), treat as `"ws"`
   - Validation errors: JSON for all paths (move validation before SSE headers)

8. **`ui/src/lib/api-generation.ts`** — use WS client (~50 lines changed)
   - `postMultimodeGenerateStream`: POST with `X-Stream-Transport: websocket` header → wsClient.onEvent → Promise
   - `postVideoGenerateStream`: POST with `X-Stream-Transport: websocket` header → wsClient.onEvent → Promise
   - Remove `Accept: text/event-stream` header, SSE parsing, `getReader`/`TextDecoder`
   - Return type and callback signatures unchanged for store callers

9. **`ui/src/lib/nodeApi.ts`** — use WS client (~35 lines changed)
   - `postNodeGenerateStream`: POST with `X-Stream-Transport: websocket` header → wsClient.onEvent → Promise
   - Remove `Accept: text/event-stream` header, local `parseSseBlock`, SSE parsing
   - Keep `postNodeGenerate` (plain JSON, no header change) unchanged

10. **`lib/nodeHelpers.ts`** — add `getStreamTransport` helper (~10 lines)
    - Add `getStreamTransport(req)` function returning `"sse" | "ws" | "none"`
    - Keep existing `wantsSse` for backward compat (used by some tests)

11. **`lib/routeHelpers.ts`** — export broadcast helper (~5 lines)
    - Re-export `wsBroadcast` from `wsServer.ts` for route convenience
    - Keep `writeSse` (used by SSE compat path)

11. **`ui/vite.config.ts`** — add WS proxy for dev mode (~5 lines)
    - Add `/ws` proxy entry with `ws: true` targeting same `apiTarget`

12. **`package.json`** — add `ws` dependency (2 lines)
    - `"ws": "^8.18.0"` in dependencies
    - `"@types/ws": "^8.5.0"` in devDependencies

### CLEANUP (after migration verified)

- `ui/src/lib/api-core.ts` — remove `parseSseBlock` (UI no longer uses SSE)
- `routes/video.ts` — remove `sendSse` local function (replaced by `wsBroadcast` + shared `writeSse`)

NOTE: `lib/nodeHelpers.ts` `wantsSse` is NOT removed — it is now used by all 3 routes
to distinguish CLI/agent (SSE) from UI (WS) clients.

### CLI/Agent SSE consumers (NOT modified — backward compatible)

These files continue to use SSE via `bin/lib/sse.ts` `streamSse()` and are NOT changed:
- `bin/commands/video.ts` — lines 209, 293
- `bin/commands/node.ts` — line 105
- `bin/commands/multimode.ts` — line 122
- `lib/agentQuestionResponder.ts` — lines 94, 122, 130

The server routes preserve the SSE path for `Accept: text/event-stream` clients,
so CLI and agent functionality is unaffected.

### TEST UPDATES required

Tests that reference SSE and need review:

**Must update** (directly test generation SSE responses):
- `tests/videoRoute.test.ts` — parses SSE from HTTP response body (`parseSse`)
- `tests/node-streaming-sse.test.ts` — tests SSE streaming behavior
- `tests/multimode-backend-contract.test.js` — SSE event source assertions
- `tests/api-provider-parity.test.ts` — SSE body assertions (lines 384-404, 440-455)
- `tests/prompt-fidelity.test.ts` — `Accept: text/event-stream` assertion (line 50)
- `tests/node-validation-error-contract.test.ts` — error format assertions
- `tests/node-diagnostics-contract.test.js` — `writeSse` source contract (lines 43-47)
- `tests/cli-video-command-contract.test.js` — CLI SSE response mock (line 120)
- `tests/cli-output-recovery-contract.test.js` — `streamSse` / SSE abort path (lines 83-94)

**Also review** (JSON sync path — may need no changes if "none" routing preserved):
- `tests/node-route-refs.test.ts` — no Accept header, expects `res.json()` → "none" path, should pass unchanged
- `tests/image-model.test.ts` — same pattern, "none" path unchanged

**No update needed**:
- `tests/videoExtendedRoute.test.ts` — uses JSON mocks, no SSE parsing

**Strategy by transport type**:
- `"sse"` tests (CLI contract): tests that set `Accept: text/event-stream` → SSE path preserved, should pass unchanged
- `"ws"` tests (UI integration): tests without Accept header that previously got SSE → need `X-Stream-Transport: websocket` header OR spy on `wsBroadcast` calls
- `"none"` tests (JSON sync): tests without Accept or X-Stream-Transport → JSON path unchanged, pass as-is
- Source contract tests: update `writeSse` assertions to allow `wsBroadcast` alternative

## Implementation Order (single-phase, no dual-emit)

Audit finding F4 noted Phase 2 dual-emit conflicted with MODIFY section.
Resolution: skip dual-emit entirely. Do a clean cutover in one branch.

1. `npm install ws @types/ws`
2. Create `lib/wsServer.ts` + `ui/src/lib/wsTypes.ts` + `ui/src/lib/wsClient.ts`
3. Modify `server.ts` (attach WS)
4. Modify `ui/vite.config.ts` (add WS proxy)
5. Modify `routes/video.ts` (detach + broadcast)
6. Modify `routes/multimode.ts` (detach + broadcast)
7. Modify `routes/nodes.ts` (detach + broadcast)
8. Modify `ui/src/lib/api-generation.ts` (WS client)
9. Modify `ui/src/lib/nodeApi.ts` (WS client)
10. Modify `lib/routeHelpers.ts` (export wsBroadcast)
11. Update tests
12. Cleanup unused SSE helpers
13. `tsc --noEmit` + `node --test` (test runner is node:test, NOT vitest)

## Success Criteria

1. Gallery images load during video generation (browser DevTools: no stalled requests)
2. All 3 generation types work through WebSocket (video, node, multimode)
3. `npx tsc --noEmit` — 0 errors
4. `node --test` via `npm test` — all tests pass
5. No TLS required (plain HTTP WebSocket)
6. No user-facing UX change (same progress indicators, same callbacks)

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| WS disconnect during generation | inflight polling (`/api/inflight`) recovers job status; wsClient auto-reconnects |
| WS reconnect loses in-progress partial images | Acceptable — partials are ephemeral previews, final `done` event has full result |
| CLI/agent SSE compatibility | SSE path preserved for `Accept: text/event-stream` clients — no breaking change |
| Test scope (9 files) | Pattern is mechanical; CLI tests validate SSE compat, UI tests validate WS path |
| AbortSignal on POST only cancels POST | Cancel via `DELETE /api/inflight/:id` unchanged — this is the real cancel path |
| Dual-path code complexity | Each route has 2 paths (SSE/WS) but share the same generation logic — only the event emission differs |
