# SSE 멀티플렉싱 프론트엔드 리스크 감사 (2026-06-08)

## 범위

- `ui/src/lib/eventChannel.ts` — singleton EventSource, subscribe, reconnect, resync
- `ui/src/lib/api-inflight.ts` — inflight REST
- `ui/src/store/storeInflightImpl.ts` — polling + reconcile
- `ui/src/store/storeGenImpl.ts` — classic / multimode generation
- `ui/src/store/storeNodeGenImpl.ts` — node generation
- `ui/src/lib/nodeApi.ts` — node async stream client
- `ui/src/lib/api-generation.ts` — multimode / video async stream clients
- 초기 멀티플렉싱 설계: `devlog/_fin/260608_sse-multiplexing/00_architecture.md`

## Execution Log

```
2026-06-08 니지카: 프론트엔드 SSE 이벤트 채널 전수 리스크 분석 + 문서화 + 패치
- ui/src/lib/sseStreamError.ts: flat/nested error payload 정규화 (abortJob ↔ writeNodeError)
- ui/src/lib/eventChannel.ts: exponential reconnect backoff, dev dispatch warnings
- ui/src/lib/nodeApi.ts, api-generation.ts: parseSseErrorPayload 적용
- ui/src/store/storeNodeGenImpl.ts, storeVideoImpl.ts: GENERATION_CANCELED 무시 (error UI 방지)
- tests/frontend-sse-risk-contract.test.js: 계약 테스트 추가
- verify: cd ui && npm run build
```

---

## 상세 리스크 항목

### F-RECON-01 — 재연결 고정 2s backoff (thundering herd / proxy 부하)

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `ui/src/lib/eventChannel.ts:40-44` (패치 전) |
| **현상** | `onerror`마다 정확히 2s 후 reconnect. 짧은 네트워크 플랩 시 reconnect storm 가능. |
| **재현** | Wi-Fi 토글 → EventSource 연속 onerror → 2s 간격 무한 재시도. |
| **패치** | exponential backoff `2000ms × 1.5^n`, cap `30000ms`; `onopen` 시 attempt reset. **적용됨**. |

---

### F-RECON-02 — 재연결 구간 terminal 이벤트 유실 (ring eviction)

| | |
|---|---|
| **등급** | HIGH (완화됨) |
| **위치** | `ui/src/lib/eventChannel.ts:21-24,47-48`, `lib/eventBus.ts:48-51` |
| **현상** | disconnect 중 publish된 `done`/`error`가 ring eviction되면 `lastEventId` replay로 복구 불가 → stream Promise 30분 hang. |
| **재현** | 2000+ cross-job burst → reconnect → job `done` evicted → UI spinner 고착. |
| **패치** | 서버 `RING_SIZE=2000` 완화 + 클라 `onResync → reconcileInflight()` (`App.tsx:88-89`). **기존 완화**. 모니터링. |

---

### F-RECON-03 — subscribe-before-fetch race (초기 멀티플렉싱 핵심)

| | |
|---|---|
| **등급** | CRITICAL (패치 완료) |
| **위치** | `ui/src/lib/api-generation.ts:40-84`, `ui/src/lib/nodeApi.ts:92-135` |
| **현상** | POST 202 이전 ultra-fast `done` publish 시 handler 미등록 → Promise 영구 pending. |
| **재현** | cached upstream → subscribe-after-fetch → gallery-hang 유사 hang (inflight 카운터 고착). |
| **패치** | subscribe-before-fetch + `tests/async-stream-subscribe-order.test.js`. **적용됨**. |

---

### F-STATE-01 — Node error payload 형식 불일치 (abortJob flat vs writeNodeError nested)

| | |
|---|---|
| **등급** | HIGH |
| **위치** | `ui/src/lib/nodeApi.ts:100-106`, `lib/inflight.ts:125-130` |
| **현상** | `abortJob`은 `{ error: "string", code, status }` flat. nodeApi는 `error.message` nested만 파싱 → cancel 시 `"Node generation failed"`, `code` 누락. |
| **재현** | node 생성 중 `cancelInflight` → SSE error → 잘못된 toast / `isCanceledGenerationError` code 경로 미동작. |
| **패치** | `parseSseErrorPayload()` 공통 헬퍼. **적용됨** (`ui/src/lib/sseStreamError.ts`). |

---

### F-STATE-02 — Node/Video cancel 시 error UI 노출

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `ui/src/store/storeNodeGenImpl.ts:205-228`, `ui/src/store/storeVideoImpl.ts:141-152` |
| **현상** | multimode는 `isCanceledGenerationError` 처리하나 node/video catch는 무조건 `status: "error"` + toast. |
| **재현** | inflight 패널에서 job cancel → node 빨간 error 배지. |
| **패치** | catch에서 `isCanceledGenerationError` 분기 — silent cleanup + pending 필드 reset. **적용됨**. |

---

### F-STATE-03 — inflight polling silent catch

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `ui/src/store/storeInflightImpl.ts:109,152` |
| **현상** | `fetchInflightScopes` / `getHistory` 실패 시 빈 `catch {}` — SSE+reconcile 모두 실패하면 stale inflight 고착. |
| **재현** | 서버 일시 down → polling 묵음 → reload 전까지 phantom spinner. |
| **패치 제안** | dev `console.warn` + 연속 실패 N회 시 toast (후속). 현재는 resync/reconcile 2중 안전망으로 **완화**. |

---

### F-STATE-04 — phase 이벤트 순서 역전 (replay + live)

| | |
|---|---|
| **등급** | LOW |
| **위치** | `ui/src/store/storeNodeGenImpl.ts:153-168`, `ui/src/store/storeVideoImpl.ts:106-108` |
| **현상** | 단일 SSE 채널은 FIFO이나 reconnect replay가 live와 interleave 시 이론상 stale phase 덮어쓰기 가능. |
| **재현** | 극히 드묾 — reconnect 직후 `queued` replay가 `partial` live 뒤 도착. |
| **패치 제안** | phase monotonic guard (후속). 현재 LOW 수용. |

---

### F-MEM-01 — EventSource listener 누적

| | |
|---|---|
| **등급** | LOW |
| **위치** | `ui/src/lib/eventChannel.ts:26-44` |
| **현상** | reconnect 시 이전 `source.close()` 후 새 인스턴스 — listener는 GC 대상. 누적 없음. |
| **패치** | N/A — **정상**. |

---

### F-MEM-02 — subscribe 해제 후 singleton 연결 유지

| | |
|---|---|
| **등급** | LOW (설계) |
| **위치** | `ui/src/lib/eventChannel.ts:60-68` |
| **현상** | `subs` 비어도 EventSource 유지 — App 전역 singleton 의도. |
| **패치** | `disconnect()`는 테스트 전용 (`eventChannel.ts:80-87`). **의도적**. |

---

### F-UX-01 — gallery-hang (HTTP 연결 한도) 회귀

| | |
|---|---|
| **등급** | CRITICAL (패치 완료) |
| **위치** | `devlog/_fin/260608_sse-multiplexing/00_architecture.md:16-17` |
| **현상** | 기존 POST SSE ×N + GET 이미지 → 브라우저 6-connection hang. |
| **재현** | 동시 생성 7건 + 갤러리 썸네일 로드 → white screen / spinner. |
| **패치** | 단일 `GET /api/events` + async POST 202. **아키텍처 전환 완료**. `tests/gallery-hang-regression-contract.test.ts` 별도 UI hang 가드. |

---

### F-UX-02 — 동시 생성 진행률 혼란 (단일 채널 직렬화)

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `ui/src/lib/eventChannel.ts:47-57`, `ui/src/store/storeGenImpl.ts:75-82` |
| **현상** | 대형 `partial` JSON이 단일 SSE에서 순차 전송 → 다른 job의 phase/progress 지연. |
| **재현** | multimode×3 + video×2 동시 → video progress bar stutter. |
| **패치** | 설계 trade-off. inflight polling(1.5s)이 phase 보조 동기화. **수용**. |

---

### F-UX-03 — stream timeout 30분 고착

| | |
|---|---|
| **등급** | MEDIUM (완화됨) |
| **위치** | `ui/src/lib/eventChannel.ts:10`, `nodeApi.ts:109-114` |
| **현상** | `done`/`error` 미수신 시 30분 후 reject + `cancelInflight`. |
| **재현** | 이벤트 유실 + reconcile miss → 30분 spinner. |
| **패치** | `armStreamTimeout` + `reconcileInflight` on reconnect. **기존 완화**. |

---

### F-ERR-01 — SSE 연결 실패 silent (사용자 피드백 없음)

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `ui/src/lib/eventChannel.ts:40-44` |
| **현상** | EventSource `onerror`는 reconnect만 수행 — toast/banner 없음. |
| **재현** | 서버 미기동 → 무한 reconnect → 생성 클릭 시 30분 timeout까지 묵음. |
| **패치 제안** | `onConnectionStateChange` hook + App toast (후속). reconnect backoff **적용됨**. |

---

### F-ERR-02 — JSON parse 실패 silent drop

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `ui/src/lib/eventChannel.ts:49-50` |
| **현상** | malformed `data:` → `catch { return }` — 해당 이벤트 영구 유실. |
| **재현** | 서버 버그로 invalid JSON publish → job hang until timeout. |
| **패치** | dev mode `console.warn` on parse/jobId miss. **적용됨**. |

---

### F-BROWSER-01 — EventSource 6-connection 한도 의존 해소

| | |
|---|---|
| **등급** | CRITICAL (패치 완료) |
| **위치** | `ui/src/lib/eventChannel.ts:12-13` |
| **현상** | 멀티플렉싱 전: job마다 POST SSE → 6 cap. |
| **재현** | 7+ 동시 stream → 새 GET block. |
| **패치** | singleton 1 connection. HTTP/2 multiplexing **불필요** (연결 1개). **해결**. |

---

### F-BROWSER-02 — 다중 탭 각각 EventSource

| | |
|---|---|
| **등급** | LOW |
| **위치** | `ui/src/App.tsx:88` |
| **현상** | 탭마다 독립 singleton — 2탭 = 2 SSE (한도 내). |
| **패치** | N/A. |

---

### F-TYPE-01 — done/error payload 런타임 검증 부재

| | |
|---|---|
| **등급** | MEDIUM |
| **위치** | `ui/src/lib/nodeApi.ts:99`, `ui/src/lib/api-generation.ts:49,232` |
| **현상** | `data as unknown as NodeGenerateResponse` — 필드 누락 시 런타임 undefined 접근. |
| **재현** | 서버 스키마 변경 → `res.nodeId` undefined → graph corrupt. |
| **패치 제안** | minimal assert on `done` (후속 zod). error 경로 `parseSseErrorPayload` **적용됨**. |

---

### F-TYPE-02 — multimode vs node error 스키마 분기

| | |
|---|---|
| **등급** | LOW |
| **위치** | `ui/src/lib/api-generation.ts:51-55` vs `ui/src/lib/nodeApi.ts:100-106` |
| **현상** | multimode `error: string`, node `error: {code,message}` — 통합 전 파싱 불일치. |
| **패치** | `parseSseErrorPayload` 단일화. **적용됨**. |

---

## 리스크 매트릭스 요약

| ID | 관점 | 등급 | 상태 | 파일:줄 |
|----|------|------|------|---------|
| F-RECON-01 | 재연결 | MEDIUM | **패치됨** | `eventChannel.ts:40-48` |
| F-RECON-02 | 재연결 | HIGH | 완화(ring+resync) | `eventChannel.ts:21-24`, `App.tsx:88-89` |
| F-RECON-03 | 재연결 | CRITICAL | **패치됨** | `api-generation.ts:40`, `nodeApi.ts:92` |
| F-STATE-01 | 상태불일치 | HIGH | **패치됨** | `nodeApi.ts:100`, `sseStreamError.ts` |
| F-STATE-02 | 상태불일치 | MEDIUM | **패치됨** | `storeNodeGenImpl.ts:205`, `storeVideoImpl.ts:141` |
| F-STATE-03 | 상태불일치 | MEDIUM | 모니터링 | `storeInflightImpl.ts:109,152` |
| F-STATE-04 | 상태불일치 | LOW | 수용 | `storeNodeGenImpl.ts:153` |
| F-MEM-01 | 메모리 | LOW | OK | `eventChannel.ts:26-44` |
| F-MEM-02 | 메모리 | LOW | 설계 | `eventChannel.ts:60-68` |
| F-UX-01 | UX hang | CRITICAL | **해결** | 아키텍처 전환 |
| F-UX-02 | UX hang | MEDIUM | 수용 | `eventChannel.ts:47` |
| F-UX-03 | UX hang | MEDIUM | 완화 | `eventChannel.ts:10` |
| F-ERR-01 | 에러처리 | MEDIUM | 부분(후속 toast) | `eventChannel.ts:40` |
| F-ERR-02 | 에러처리 | MEDIUM | **패치됨** | `eventChannel.ts:49-55` |
| F-BROWSER-01 | 브라우저 | CRITICAL | **해결** | `eventChannel.ts:12` |
| F-BROWSER-02 | 브라우저 | LOW | OK | `App.tsx:88` |
| F-TYPE-01 | 타입안전 | MEDIUM | 부분 | `nodeApi.ts:99` |
| F-TYPE-02 | 타입안전 | LOW | **패치됨** | `sseStreamError.ts` |

---

## 초기 멀티플렉싱 설계 대비 프론트 회귀 체크

| 설계 항목 | 프론트 상태 |
|-----------|-------------|
| singleton EventSource | OK (`eventChannel.ts`) |
| subscribe by requestId | OK |
| subscribe before async POST | OK (D1) |
| lastEventId reconnect | OK (C1) |
| resync → reconcileInflight | OK (`App.tsx`) |
| armStreamTimeout 30m | OK |
| cancelInflight on abort/timeout | OK |
| gallery-hang 회귀 방지 | OK (1 SSE conn) |

---

## 검증

```bash
cd /Users/jun/Developer/new/700_projects/ima2-gen
node --test tests/async-stream-subscribe-order.test.js tests/frontend-sse-risk-contract.test.js
cd ui && npm run build
```
