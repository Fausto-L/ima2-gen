# SSE 멀티플렉싱 서버사이드 리스크 감사 (2026-06-08)

## 범위

- `lib/eventBus.ts`, `routes/events.ts`, `lib/inflight.ts`
- `routes/nodes.ts`, `routes/generate.ts`, `routes/multimode.ts`, `routes/video.ts`
- `lib/generationCancel.ts`, `server.ts`
- 초기 멀티플렉싱 설계: `devlog/_fin/260608_sse-multiplexing/04_eventbus-implementation.md`

## Execution Log

```
2026-06-08 료: 서버사이드 SSE 멀티플렉싱 전수 리스크 분석 + 잔여 패치
- routes/nodes.ts: asyncMode phase/partial publish (emitProgress = streamResponse || asyncMode)
- routes/events.ts: cleanup() res.end(), X-Accel-Buffering: no
- verify: npm run build:server && node --test tests/event-bus.test.ts tests/events-channel-contract.test.ts tests/async-stream-subscribe-order.test.js

2026-06-08 봇치: Classic `/api/generate` 10-way 병렬 hang 원인 패치
- live `ima2 serve`에서 terminal inflight job들이 `kind: "classic"`으로 확인됨
- `/api/generate`도 async 202 + `/api/events` publish 경로로 편입
- UI classic generation fetch도 subscribe-before-fetch + async POST로 전환
- verify: npm run typecheck && npm run typecheck:tests && npm test && npm run build:cli && npm run test:inventory
```

---

## 상세 리스크 항목

### R-MEM-01 — SSE cleanup 시 response 미종료 (좀비 커넥션)

| | |
|---|---|
| **등급** | HIGH |
| **위치** | `routes/events.ts:54-60` (패치 전) |
| **현상** | `cleanup()`이 listener/heartbeat만 해제하고 `res.end()`를 호출하지 않음. write 실패·client half-close 시 TCP/socket이 linger할 수 있고 `activeConnections` 카운터와 실제 소켓 상태가 어긋날 여지. |
| **재현** | `/api/events` 연결 후 네트워크 단절 또는 `safeWrite` 연속 실패 → cleanup 호출되나 socket 미종료 → 512 cap 근처에서 phantom slot. |
| **패치** | `cleanup()`末尾에 `res.end()` best-effort 추가. **적용됨** (`routes/events.ts:62-68`). |

---

### R-MEM-02 — Ring buffer eviction (cross-job replay gap)

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `lib/eventBus.ts:37-38`, `lib/eventBus.ts:48-51` |
| **현상** | 전역 ring `RING_SIZE=2000` 초과 시 oldest event drop. reconnect `replaySince(lastEventId)`가 job 무관하게 eviction되면 특정 job의 terminal `done`/`error`를 놓칠 수 있음. |
| **재현** | 2000+ cross-job 이벤트 burst 후 EventSource reconnect → `lastEventId`가 evict된 seq보다 크면 replay 빈 배열. |
| **패치 제안** | per-job terminal snapshot ring 또는 inflight terminal API(`listTerminalJobs`)와 resync 병행(클라 `reconcileInflight` 이미 존재). ring size 모니터링. **완화됨**(500→2000). |

---

### R-MEM-03 — 대형 image 이벤트 ring strip

| | |
|---|---|
| **등급** | MEDIUM (설계 trade-off) |
| **위치** | `lib/eventBus.ts:20-29` |
| **현상** | `partial`/`image`/`done`의 multi-MB base64는 ring에 `_imageOmitted: true`만 저장. reconnect 후 partial preview 복구 불가. |
| **재현** | live SSE 연결 중 partial 수신 → reconnect → replayed partial에 image 없음. |
| **패치** | live subscriber는 full payload 수신(테스트 확인). reconnect 시 `done.url`/`filename`으로 최종 복구. **의도적 설계**. |

---

### R-RACE-01 — subscribe 전 emit (이벤트 유실)

| | |
|---|---|
| **등급** | HIGH (패치 완료) |
| **위치** | `ui/src/lib/api-generation.ts:40-84`, `ui/src/lib/nodeApi.ts:92-135` |
| **현상** | POST 202 이전 `publish()`가 실행되면 클라 handler 미등록 시 이벤트 유실. |
| **재현** | subscribe-after-fetch 순서 → ultra-fast `done` publish → Promise hang. |
| **패치** | subscribe-before-fetch + `tests/async-stream-subscribe-order.test.js`. **적용됨**. ring replay는 보조. |

---

### R-RACE-02 — Node async mode phase/partial 미발행

| | |
|---|---|
| **등급** | HIGH |
| **위치** | `routes/nodes.ts:208-216`, `routes/nodes.ts:294-302` (패치 전) |
| **현상** | `asyncMode=true`일 때 `streamResponse=false` → `phase`/`partial` publish 경로 전부 스킵. UI `postNodeGenerateStream`은 phase/partial handler 기대. |
| **재현** | UI node async generate (OAuth Responses partialImages) → `/api/events`에 `done`만 도착, progress UI freeze. |
| **패치** | `emitProgress = streamResponse \|\| asyncMode`; async에서 `publish(phase)` + partial publish (legacy SSE write는 streamResponse만). **적용됨**. |

---

### R-RACE-03 — requestId 충돌 (INSERT OR REPLACE)

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `lib/inflight.ts:67-94`, `routes/nodes.ts:41`, `routes/multimode.ts:63` |
| **현상** | 동일 `requestId`로 두 job 동시 시작 시 SQLite `INSERT OR REPLACE`로 이전 inflight row 덮어씀. eventBus는 closure jobId로 publish → handler 혼선. |
| **재현** | 클라이언트가 고정 requestId 재사용 + 이전 job 미완료 → 두 번째 job이 첫 job inflight/abortion state 오염. |
| **패치 제안** | `startJob` 시 active row 존재하면 409 `REQUEST_ID_IN_USE` 반환. 클라는 `crypto.randomUUID()` fallback (**적용됨**). |

---

### R-CONN-01 — SSE 연결 cap

| | |
|---|---|
| **등급** | LOW (완화됨) |
| **위치** | `routes/events.ts:23-27`, `lib/eventBus.ts:13-15` |
| **현상** | `MAX_SSE_LISTENERS=512` 초과 시 503 `SSE_CAPACITY`. |
| **재현** | 512+ 독립 EventSource (비정상; UI singleton 1 conn). |
| **패치** | cap + `setMaxListeners` align. **적용됨**. |

---

### R-CONN-02 — Heartbeat keepalive

| | |
|---|---|
| **등급** | LOW |
| **위치** | `routes/events.ts:50-52` |
| **현상** | 15s `: ping\n\n` — reverse proxy idle timeout 방지. |
| **재현** | nginx `proxy_read_timeout` < 15s + buffering on → stale connection. |
| **패치** | `X-Accel-Buffering: no` 추가. **적용됨** (`routes/events.ts:32`). |

---

### R-ERR-01 — Classic generate eventBus 미연동

| | |
|---|---|
| **등급** | CRITICAL |
| **위치** | `routes/generate.ts` 전체 |
| **현상** | `/api/generate`는 sync JSON 응답 완료까지 HTTP 연결을 점유했다. Classic 이미지 10개 병렬 생성 시 브라우저 HTTP/1.1 origin 연결 6개를 채워 설정창 API와 갤러리 `<img>` 로드가 큐에서 대기했다. |
| **재현** | `ima2 serve`에서 Classic 10개 병렬 생성 → `/api/inflight?includeTerminal=1` terminal row가 `kind: "classic"` 위주로 쌓이고 UI 이미지/설정 요청이 지연. |
| **패치** | `/api/generate`에 `async: true` 모드 추가, 완료/에러를 eventBus로 publish, UI classic 호출을 `postGenerateStream()`으로 전환. **적용됨**. |

---

### R-ERR-02 — Multimode partial dual path 불일치

| | |
|---|---|
| **등급** | LOW |
| **위치** | `routes/multimode.ts:358-363` |
| **현상** | Responses `onPartialImage`가 `dualEmitMultimode` 대신 inline `writeSse`+`publish`. asyncMode에서 writeSse는 no-op(res ended) — publish만 실행, 동작 OK. |
| **재현** | async multimode partial — 정상 publish. |
| **패치 제안** | `dualEmitMultimode(res, requestId, "partial", pd)`로 통일(가독성). |

---

### R-ERR-03 — abortJob 즉시 error publish

| | |
|---|---|
| **등급** | MEDIUM (패치 완료) |
| **위치** | `lib/inflight.ts:124-131` |
| **현상** | cancel 시 route catch 대기 없이 `GENERATION_CANCELED` eventBus 방송. |
| **패치** | **적용됨**. |

---

### R-ERR-04 — writeNodeError async 경로

| | |
|---|---|
| **등급** | LOW |
| **위치** | `lib/nodeHelpers.ts:56-57` |
| **현상** | `publish` 후 `res.writableEnded`면 return — 202 async에서 closed res에 SSE write 시도 없음. |
| **재현** | async node runtime error → eventBus `error` + JSON/SSE skip. **정상**. |

---

### R-CONC-01 — 동시 inflight job 상한 없음

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `lib/inflight.ts:57-105`, `server.ts:417-420` |
| **현상** | 서버가 동시 upstream generation 수를 제한하지 않음. 7+ job 시 upstream rate limit·메모리·event loop JSON.stringify 지연. |
| **재현** | multimode×N + video×M 동시 → CPU spike, SSE 단일 채널 직렬화 지연(R7). |
| **패치 제안** | `config.inflight.maxConcurrent` + semaphore at route entry; stale purge(`purgeStaleJobs`)는 TTL만. |

---

### R-CONC-02 — activeFlightIds (클라이언트)

| | |
|---|---|
| **등급** | LOW |
| **위치** | `ui/src/store/storeGenImpl.ts:79`, `ui/src/store/storeTypes.ts:210` |
| **현상** | 서버 thread-safety 이슈 아님. Zustand `Set`은 single-thread UI. cancel은 `cancelInflight` → server `abortJob`. |
| **패치** | N/A (서버 범위外). |

---

### R-SEC-01 — /api/events 무인증 global fan-out

| | |
|---|---|
| **등급** | MEDIUM (로컬 앱) |
| **위치** | `routes/events.ts:22-65` |
| **현상** | localhost 바인딩 가정. 동일 host의 다른 탭/프로세스가 모든 job 이벤트(base64 image 포함) 수신 가능. |
| **재현** | 두 브라우저 프로필 동시 접속 → 상대 requestId만 알면 이미지 data URL sniff 가능. |
| **패치 제안** | session token query on `/api/events` + publish filter; 또는 loopback-only bind 검증. |

---

### R-SEC-02 — /api/inflight 무인증

| | |
|---|---|
| **등급** | LOW |
| **위치** | `routes/health.ts:75-96` |
| **현상** | prompt snippet·sessionId 노출. 로컬 single-user 모델. |

---

### R-EXPR-01 — Express response buffering

| | |
|---|---|
| **등급** | LOW |
| **위치** | `routes/events.ts:29-33`, `server.ts:167-187` |
| **현상** | compression middleware 없음(양호). `flushHeaders()` 사용. `Cache-Control: no-transform` 설정. |
| **패치** | `X-Accel-Buffering: no` **적용됨**. |

---

### R-EXPR-02 — Proxy 환경 SSE

| | |
|---|---|
| **등급** | LOW |
| **위치** | `server.ts:376-382` |
| **현상** | 기본 direct listen. Cloudflare Tunnel/nginx 뒤 배포 시 buffering·timeout 별도 설정 필요. |
| **패치 제안** | deploy doc에 SSE proxy checklist. |

---

## 리스크 매트릭스 요약

| ID | 카테고리 | 등급 | 상태 | 파일:줄 |
|----|----------|------|------|---------|
| R-MEM-01 | 메모리/연결 | HIGH | **패치됨** | `routes/events.ts:54-68` |
| R-MEM-02 | 메모리 | MEDIUM | 완화(2000 ring) | `lib/eventBus.ts:11,37-38` |
| R-MEM-03 | 메모리 | MEDIUM | 설계수용 | `lib/eventBus.ts:20-29` |
| R-RACE-01 | 레이스 | HIGH | **패치됨**(클라) | `ui/.../api-generation.ts:40` |
| R-RACE-02 | 레이스 | HIGH | **패치됨** | `routes/nodes.ts:208-220,296-304` |
| R-RACE-03 | 레이스 | MEDIUM | 모니터링 | `lib/inflight.ts:67-94` |
| R-CONN-01 | 연결 | LOW | **패치됨** | `routes/events.ts:23-27` |
| R-CONN-02 | 연결 | LOW | **패치됨** | `routes/events.ts:32,50-52` |
| R-ERR-01 | 에러전파/연결 | CRITICAL | **패치됨** | `routes/generate.ts`, `ui/src/lib/api-generation.ts` |
| R-ERR-02 | 에러전파 | LOW | OK | `routes/multimode.ts:358-363` |
| R-ERR-03 | 에러전파 | MEDIUM | **패치됨** | `lib/inflight.ts:124-131` |
| R-ERR-04 | 에러전파 | LOW | OK | `lib/nodeHelpers.ts:56-57` |
| R-CONC-01 | 동시성 | MEDIUM | 미구현 | `lib/inflight.ts`, routes |
| R-CONC-02 | 동시성 | LOW | N/A(클라) | `ui/src/store/storeGenImpl.ts` |
| R-SEC-01 | 보안 | MEDIUM | 미구현 | `routes/events.ts` |
| R-SEC-02 | 보안 | LOW | 수용 | `routes/health.ts:75` |
| R-EXPR-01 | Express | LOW | **패치됨** | `routes/events.ts:32` |
| R-EXPR-02 | Express/Proxy | LOW | 문서화 | `server.ts` |

---

## 초기 멀티플렉싱 설계 대비 회귀 체크

| 설계 결정 (`260608_sse-multiplexing-eventbus.md`) | 서버 구현 상태 |
|---------------------------------------------------|----------------|
| Dual-emit (legacy SSE + publish) | nodes/multimode/video OK; classic은 JSON legacy + async publish |
| async 202 + detached publish | nodes/multimode/video/classic OK |
| Validation → 4xx JSON (no bus) | multimode/video OK; nodes pre-startJob validation OK |
| Ring excludes large partials | OK + stripped done metadata |
| Closure requestId in publish | OK (`dualEmit*`, writeNodeError) |
| Node async phase/partial | **본 감사에서 패치** |

---

## 검증

```bash
cd /Users/jun/Developer/new/700_projects/ima2-gen
npm run build:server
node --test tests/event-bus.test.ts tests/events-channel-contract.test.ts tests/async-stream-subscribe-order.test.js
```
