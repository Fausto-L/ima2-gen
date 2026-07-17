---
created: 2026-06-08
tags: [risk-summary, sse, multiplexing, eventbus, audit]
---

# SSE 멀티플렉싱 통합 리스크 보고서

## 1. 문서 목적

2026-06-08 수행된 SSE 멀티플렉싱 3건 감사(서버·프론트·E2E)의 리스크 항목을 **단일 매트릭스**로 통합한다.

| 감사 문서 | 범위 | ID 접두 |
|-----------|------|---------|
| `devlog/_fin/260608_sse-multiplexing/03_server-side-risk-audit.md` | eventBus, routes, inflight | R-* |
| `devlog/_fin/260608_sse-multiplexing/02_frontend-risk-audit.md` | eventChannel, stores, API clients | F-* |
| `devlog/_fin/260608_sse-multiplexing/01_client-audit.md` | E2E 패치·회귀 | D* |

아키텍처 개요: `devlog/_fin/260608_sse-multiplexing/00_architecture.md`

### 상태 정의

| 상태 | 의미 |
|------|------|
| **PATCHED** | 코드 패치 적용·계약 테스트로 고정 |
| **MITIGATED** | 완전 제거는 아니나 다중 안전망으로 실사용 영향 최소화 |
| **MONITORING** | 완화됐으나 극단 부하·엣지 케이스 관찰 필요 |
| **ACCEPTED** | 설계 trade-off로 의도적 수용 |
| **OPEN** | 미구현·후속 작업 필요 |

---

## 2. 통합 리스크 매트릭스

### 2.1 CRITICAL / HIGH — 패치 완료

| ID | 등급 | 관점 | 설명 | 상태 | 근거 |
|----|------|------|------|------|------|
| D1 / R-RACE-01 / F-RECON-03 | CRITICAL | E2E 레이스 | POST 202 이전 `publish()` → handler 미등록 → Promise hang | **PATCHED** | subscribe-before-fetch; `tests/async-stream-subscribe-order.test.js` |
| F-UX-01 / F-BROWSER-01 | CRITICAL | UX | POST SSE ×N + GET 이미지 → 브라우저 6-connection hang | **PATCHED** | 단일 `GET /api/events` + async 202 |
| R-RACE-02 / R8 | HIGH | 서버 | Node `asyncMode`에서 phase/partial 미발행 | **PATCHED** | `emitProgress = streamResponse \|\| asyncMode` (`routes/nodes.ts:208-220`) |
| R-MEM-01 | HIGH | 서버 | SSE cleanup 시 `res.end()` 미호출 → zombie conn | **PATCHED** | `routes/events.ts:65-77` |
| F-STATE-01 | HIGH | 프론트 | abortJob flat vs writeNodeError nested error 파싱 불일치 | **PATCHED** | `ui/src/lib/sseStreamError.ts` |
| F-RECON-02 | HIGH | E2E | reconnect 중 terminal `done`/`error` ring eviction | **MITIGATED** | RING 2000 + `replay-gap` + `reconcileInflight()` |

### 2.2 MEDIUM — 패치·완화·모니터링

| ID | 등급 | 관점 | 설명 | 상태 | 근거 |
|----|------|------|------|------|------|
| D3 / R-MEM-02 / R1 | MEDIUM | 메모리 | 전역 ring 2000 초과 시 oldest eviction → cross-job replay gap | **MONITORING** | `lib/eventBus.ts:11,37-38`; `hasReplayGap()` |
| D5 / R-MEM-03 / R2 | MEDIUM | 메모리 | reconnect replay에서 대형 image base64 생략 | **ACCEPTED** | `_imageOmitted: true`; live는 full payload |
| R-RACE-03 / R3 / D4 | MEDIUM | 레이스 | requestId 충돌·inflight row 덮어쓰기 | **PATCHED** | `crypto.randomUUID()` + 서버 409 `REQUEST_ID_IN_USE` guard + PK constraint catch |
| R-ERR-03 / D6 | MEDIUM | 에러 | cancel 시 route catch 대기 없이 클라 알림 | **PATCHED** | `lib/inflight.ts:124-131` |
| F-STATE-02 | MEDIUM | 프론트 | node/video cancel 시 error UI 노출 | **PATCHED** | `storeNodeGenImpl.ts`, `storeVideoImpl.ts` |
| F-RECON-01 | MEDIUM | 프론트 | 고정 2s reconnect → reconnect storm | **PATCHED** | exponential `2000×1.5^n`, cap 30s (`eventChannel.ts:12-13,45-53`) |
| F-STATE-03 | MEDIUM | 프론트 | inflight polling silent catch | **PATCHED** | dev `console.warn` (`storeInflightImpl.ts:109,152,202`) + resync 2중 안전망 |
| F-UX-02 / R7 | MEDIUM | UX | 단일 SSE 채널 대형 JSON 직렬화 지연 | **ACCEPTED** | Decision #4; inflight polling 보조 |
| F-UX-03 / R6 | MEDIUM | UX | 30분 stream timeout hang | **MITIGATED** | `JOB_STREAM_TIMEOUT_MS` + resync |
| F-ERR-01 | MEDIUM | UX | EventSource 연결 실패 시 사용자 피드백 없음 | **PATCHED** | `onConnectionStateChange` hook + App `console.warn` on failed; toast 후속 |
| F-ERR-02 | MEDIUM | 에러 | malformed JSON silent drop | **PATCHED** | dev `console.warn` (`eventChannel.ts:63-72`) |
| F-TYPE-01 | MEDIUM | 타입 | `done` payload 런타임 검증 부재 | **OPEN** | error 경로만 `parseSseErrorPayload` |
| R-CONC-01 | MEDIUM | 동시성 | 서버 동시 inflight 상한 | **PATCHED** | `MAX_CONCURRENT_JOBS=12` + 429 `TOO_MANY_JOBS` + `Retry-After: 5` |
| R-SEC-01 | MEDIUM | 보안 | `/api/events` 무인증 global fan-out | **OPEN** | localhost single-user 가정 |

### 2.3 LOW — 수용·범위外·OK

| ID | 등급 | 관점 | 설명 | 상태 | 근거 |
|----|------|------|------|------|------|
| R-CONN-01 / R4 | LOW | 연결 | SSE 512 cap | **PATCHED** | `MAX_SSE_LISTENERS=512` |
| R-CONN-02 | LOW | 연결 | Heartbeat + proxy buffering | **PATCHED** | 15s ping; `X-Accel-Buffering: no` |
| R-EXPR-01 | LOW | Express | response buffering | **PATCHED** | `Cache-Control: no-transform` |
| R-ERR-01 | LOW | 범위 | classic `/api/generate` eventBus 미연동 | **ACCEPTED** | sync JSON only — 멀티플렉싱 대상 아님 |
| R-ERR-02 | LOW | 코드 | multimode partial dual path | **ACCEPTED** | async에서 publish만 실행, 동작 OK |
| R-ERR-04 | LOW | 에러 | writeNodeError async 경로 | **ACCEPTED** | `res.writableEnded` guard |
| R-CONC-02 | LOW | 클라 | activeFlightIds | **ACCEPTED** | UI single-thread |
| R-SEC-02 | LOW | 보안 | `/api/inflight` 무인증 | **ACCEPTED** | 로컬 single-user |
| R-EXPR-02 | LOW | 배포 | proxy/tunnel SSE checklist | **OPEN** | deploy doc 후속 |
| F-STATE-04 | LOW | 상태 | phase 순서 역전 (replay+live) | **ACCEPTED** | 극히 드묾 |
| F-MEM-01 | LOW | 메모리 | EventSource listener 누적 | **ACCEPTED** | reconnect 시 GC |
| F-MEM-02 | LOW | 설계 | subs 비어도 singleton 유지 | **ACCEPTED** | App 전역 의도 |
| F-BROWSER-02 | LOW | 브라우저 | 다중 탭 각각 EventSource | **ACCEPTED** | 2탭 = 2 conn, 한도 내 |
| F-TYPE-02 | LOW | 타입 | multimode vs node error 스키마 | **PATCHED** | `parseSseErrorPayload` |
| R5 | — | 복구 | process restart inflight | **MITIGATED** | SQLite + reconcile |
| C1 | CRITICAL | E2E | lastEventId reconnect replay | **PATCHED** | `eventChannel.ts` + `routes/events.ts` |
| D5 | CRITICAL | E2E | ring stripped terminal metadata | **PATCHED** | `toRingEntry()` |

---

## 3. 미해결 항목 우선순위

| 순위 | ID | 상태 | 영향 | 권장 조치 |
|------|-----|------|------|-----------|
| P1 | R-SEC-01 | OPEN | 로컬 multi-tab·multi-profile에서 job 이벤트(base64) 노출 | `/api/events` session token + publish filter, 또는 loopback bind 검증 |
| P2 | F-TYPE-01 | OPEN | 서버 스키마 변경 시 `done` undefined 접근 | minimal zod assert on `done` payload |
| P3 | R-MEM-02 / R1 / F-RECON-02 | MONITORING | 2000+ cross-job burst 후 terminal replay miss | per-job terminal snapshot ring 또는 ring high-water metric |
| P4 | R-EXPR-02 | OPEN | Cloudflare Tunnel/nginx 배포 시 SSE stall | deploy doc SSE proxy checklist |
| P5 | R-ERR-02 | ACCEPTED | multimode partial inline dualEmit | `dualEmitMultimode` 통일(가독성) |
| ~~P2~~ | ~~R-CONC-01~~ | ~~PATCHED~~ | ~~동시 inflight 상한~~ | `MAX_CONCURRENT_JOBS=12` + 429 `TOO_MANY_JOBS` |
| ~~P3~~ | ~~F-ERR-01~~ | ~~PATCHED~~ | ~~SSE 연결 상태 피드백~~ | `onConnectionStateChange` + App wiring |
| ~~P4~~ | ~~R-RACE-03~~ | ~~PATCHED~~ | ~~requestId 충돌~~ | 서버 409 guard + PK catch |
| ~~P7~~ | ~~F-STATE-03~~ | ~~PATCHED~~ | ~~polling silent catch~~ | dev `console.warn` |

---

## 4. 초기 설계 vs 최종 구현 차이

근거: `devlog/_fin/260608_sse-multiplexing/04_eventbus-implementation.md` (v2 설계안)

| 설계 항목 | 초기 설계 (v2) | 최종 구현 | 차이 이유 |
|-----------|----------------|-----------|-----------|
| `RING_SIZE` | 500 | **2000** | 7+ 동시 job headroom (D3, R-MEM-02) |
| `maxListeners` / SSE cap | 100 | **512** | phantom conn·다중 탭 여유 (R-CONN-01) |
| Ring large image | partial 제외 | `partial`/`image`/`done` → `_imageOmitted` 메타 저장 (D5) | reconnect 시 terminal 메타 복구 가능 |
| Ring non-image large events | N/A | 기타 대형 image 이벤트 ring 미저장 | 메모리 보호 (`toRingEntry` null) |
| Replay gap detection | 없음 | `hasReplayGap()` + `replay-gap` event | 클라 `reconcileInflight` 트리거 |
| SSE cleanup | unsub + clearInterval | + **`res.end()`** (R-MEM-01) | zombie connection 방지 |
| Proxy headers | 없음 | `X-Accel-Buffering: no` | nginx buffering 방지 |
| Client reconnect | 고정 2s | **exponential** 2s×1.5^n, cap 30s (F-RECON-01) | reconnect storm 완화 |
| Node async progress | 설계에 명시 없음 | **`emitProgress = streamResponse \|\| asyncMode`** (R-RACE-02) | 감사에서 발견된 회귀 패치 |
| subscribe order | 설계에 암시 | **subscribe-before-fetch** 계약 테스트 (D1) | ultra-fast done race 제거 |
| requestId fallback | `Date.now().toString(36)` | **`crypto.randomUUID()`** (D4) | 충돌 확률 감소 |
| Cancel publish | route catch 의존 | **`abortJob` 즉시 publish** (D6) | cancel UX latency |
| Error payload | 단일 스키마 가정 | **`parseSseErrorPayload`** flat/nested 통합 (F-STATE-01) | abortJob vs writeNodeError 불일치 |
| Cancel UI | multimode만 분기 | node/video도 `isCanceledGenerationError` (F-STATE-02) | 일관된 cancel UX |
| `multimodeAbortControllers` → `activeFlightIds` | 설계 Decision #3 | Zustand `Set` + `cancelInflight` | 구현 완료 |
| Dual-emit closure requestId | Decision #5 | nodes/multimode/video OK | 설계 준수 |
| Validation 4xx vs runtime channel | Decision #1 | multimode/video/nodes OK | 설계 준수 |
| Single channel serialization delay | Decision #4 — 수용 | 수용 + inflight polling | 설계 준수 |

### 잔여 설계 미반영

- **동시 inflight semaphore** — 설계안에 없었으나 R-CONC-01로 감사에서 신규 식별
- **SSE 인증** — 로컬 앱 가정으로 설계·구현 모두 미포함 (R-SEC-01 OPEN)
- **Connection state UI** — eventChannel은 silent reconnect; 사용자 피드백은 후속 (F-ERR-01)

---

## 5. 검증 명령

```bash
cd /Users/jun/Developer/new/700_projects/ima2-gen
npm run build:server
node --test tests/event-bus.test.ts tests/events-channel-contract.test.ts \
  tests/async-stream-subscribe-order.test.js \
  tests/frontend-sse-risk-contract.test.js \
  tests/node-async-eventbus-contract.test.js
cd ui && npm run build
```

---

## 6. 관련 파일

| 역할 | 절대 경로 |
|------|-----------|
| 아키텍처 | `devlog/_fin/260608_sse-multiplexing/00_architecture.md` |
| 서버 감사 | `devlog/_fin/260608_sse-multiplexing/03_server-side-risk-audit.md` |
| 프론트 감사 | `devlog/_fin/260608_sse-multiplexing/02_frontend-risk-audit.md` |
| E2E 감사 | `devlog/_fin/260608_sse-multiplexing/01_client-audit.md` |
| 초기 설계 | `devlog/_fin/260608_sse-multiplexing/04_eventbus-implementation.md` |
| Server API | `/Users/jun/Developer/new/700_projects/ima2-gen/structure/03-server-api.md` (§ Events Multiplexing) |
