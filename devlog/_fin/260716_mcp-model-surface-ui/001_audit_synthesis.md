# 001 — WP0 로드맵 감사 synthesis (round 1)

리뷰어: sol/high (agent 019f6840), verdict **FAIL**, 증거: `.codexclaw/evidence/260716-mcp-model-surface-ui-plan-audit.md`

| # | Blocker | 판정 | 반영 |
|---|---------|------|------|
| 1 | "video enum이 절대 로드 안 됨"은 과장 — 코어 `videoModelSelected` 잔존 상태가 MCP kind로 누출됨 | 수용 | 000 근본원인 문구 수정: "in-lane 제어 부재 + 코어 상태 누출" |
| 2 | 상태 체인 불완전 (useAppStore 초기화/액션 바인딩, GenerationDefaults 파싱 누락) | 수용 | 010 파일 목록·diff에 `useAppStore.ts`, `loadGenerationDefaults` 파싱 추가 |
| 3 | `.catch(() => [])`가 abort·비404 오류를 삼키고 stale race 허용 | 수용 | 010 §4 오류 의미론 재정의 (abort 무시, 오류는 error 상태로 노출) |
| 4 | 그룹 셀렉터가 기존 unknown-model/unavailable-provider 보존 계약을 떨어뜨림 | 수용 | 010 §5 + 020 §2에 detached option/disabled entry 보존 명시 |
| 5 | `controls/Select`는 absolute 포지션이라 사이드바 overflow에 잘림 — ImageModelSelect는 portal 사용 | 수용 | 020 §1에 optional portal 모드 추가 (ImageModelSelect menuPos 패턴 이식) |
| 6 | MCP 활성 시 ProviderSelect가 코어 프로바이더를 동시 활성으로 표시 | 수용 | 030 §2에 MCP 활성 시 코어 탭 비활성 styling 명시 |
| 7 | Grok/video ratio 목록 재사용 시 모델-무효 ratio 전송 가능 (계약에 ratio enum 없음 — 스키마 확인 완료) | 수용(완화) | 030 §3: 기본 Auto(ratio 미전송) + 보수적 프리셋 3종. 업스트림 거부 시 현행 UI는 오류 code를 무시하고 일반 `mcp.generateFailed` 토스트만 표시(`storeSettingsImpl.ts:40`) — code별 사유 노출은 잔여 |
| — | 테스트 하네스: 소스 정규식 계약 방식이라 mock 렌더 테스트 불가 | 수용 | 010 §6: 순수 헬퍼 `ui/src/lib/mcpSelection.ts` 분리 + tsx 직접 import 단위 테스트, 나머지는 소스 계약 방식 유지 |

거부/완화 근거: #7은 계약 스키마에 ratio enum이 없어 UI에서 완전 검증이 불가능(리뷰어도 확인). "무효 ratio를 안 보낼 수 있는" 유일한 안전 기본값은 ratio 생략이므로 Auto 기본 + 최소 프리셋으로 완화하고, 모델별 ratio 표는 향후 실측 후 확장.

## Round 2 (verdict FAIL, 증거: `.codexclaw/evidence/260716-mcp-model-surface-ui-plan-audit-round2.md`)

| # | Blocker | 판정 | 반영 |
|---|---------|------|------|
| R2-1 | 030이 `mcpRatio`/`runMcpGenerate` 변경을 선언하면서 store 파일들을 manifest에서 누락 | 수용 | 030 파일 목록에 storeTypes/useAppStore/storeSettingsImpl 추가 + mcpRatio 전체 수명(초기화·영속·클리어) 명세 |
| R2-2 | portal 모드에서 outside-click이 rootRef 기준이라 포탈 메뉴 클릭 전에 unmount | 수용 | 020 §1에 menuRef containment guard + 위치/포커스 cleanup (ImageModelSelect 102-121 패턴) 명시 |
| R2-3 | 행동-critical 케이스가 regex 계약에만 의존 | 수용 | 010 §6을 TS 행동 테스트(fake localStorage/fetch)로 확장: 영속 마이그레이션, 카탈로그 404/500/abort, 생성 payload kind, Auto ratio 생략. 030 §5의 "mock catalog" 문구 제거 |
| R2-4 | `persistedKind="image"` 기본값이 live 3-인자 호출에서 kind를 image로 리셋 — "kind 유지" 주장과 모순 | 수용 | 010 §3 규칙 확정: persistedKind 생략 시 `get().mcpMediaKind`에서 해석(라이브 전환 = kind 유지), hydrate만 저장값 전달 |

Minor 반영: typed-toast 표현 정정(현행은 code 무시 + 일반 `mcp.generateFailed` 토스트 — 030에서 code별 사유 노출은 비범위, 잔여로 기록), 000의 SelectMenu 잔존 문구 정정, 020 클래스 네임스페이스 `.ctl-select__*` 정합, `useMcpProviders()` 다중 인스턴스 폴러 중복 방지(030에서 부모 1회 호출 후 props 전달).

## Round 3 (verdict FAIL, 증거: `.codexclaw/evidence/260716-mcp-model-surface-ui-plan-audit-round3.md`)

| # | Blocker | 판정 | 반영 |
|---|---------|------|------|
| R3-1 | `mcpRatio` 영속 수명 불완전 (GenerationDefaults 타입 누락, 초기화 출처, clear 시 저장값 잔존, whitelist 파싱 부재) | 수용 | 030 §3 완결: GenerationDefaults 타입 추가, `stored ?? null` 초기화, clearMcpLane이 저장값도 null 패치, whitelist(16:9/9:16/1:1) 정규화, restore/clear 테스트 |
| R3-2 | 행동 테스트가 실행 불가 — `runMcpGenerate`→`startMcpGeneration` 경로가 EventSource 요구 (Node에 없음, 실측 확인) | 수용 | 010에 순수 `buildMcpGenerationInput(state)` seam 신설, payload 테스트는 순수 함수로; 카탈로그는 fetch-only라 fake fetch 유지; `tests/mcp-media-kind-behavior.test.ts`를 010 manifest에 등재하고 030 확장 명시 |

Minor: 030 ProviderStatusStrip 데이터 소스 문구를 props 수신으로 통일, 본 문서 #7의 "typed 오류 토스트" 표현 정정.

## Round 4 (verdict NEAR-PASS / GO-WITH-FIXES, 증거: `.codexclaw/evidence/260716-mcp-model-surface-ui-plan-audit-round4.md`)

| # | Blocker | 판정 | 반영 |
|---|---------|------|------|
| R4-1 | 010/030 간 payload 조립 소유권 불일치 — 030이 ratio 대체를 runMcpGenerate에 배정 + manifest에 mcpSelection.ts/behavior 테스트 누락 | 수용(즉시 반영) | 030 manifest에 두 파일 추가, ratio 대체를 buildMcpGenerationInput 내부로 이동(runMcpGenerate는 forwarder 유지), 초기화 문구 `stored ?? null`로 통일 |

최종 상태: 로드맵 v5, NEAR-PASS 잔여 즉시 반영 완료 → 구현 착수 가능 판정.
