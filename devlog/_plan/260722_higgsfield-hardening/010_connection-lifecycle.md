# 010 — MCP 연결/수명주기 하드닝 (WP-1)

대상 파일: `lib/mcp/connectionManager.ts`, `lib/mcp/connectionRuntime.ts`,
테스트 `tests/mcp-connection-manager.test.ts`.

## 010-A: sticky DEGRADED detail 해소 (F1)
문제: `handleRuntimeError`(cM.ts:161-165)가 non-terminal 오류에서
`session.detail = "MCP_TRANSPORT_DEGRADED"`를 세팅한 뒤, 이후 성공한 RPC가 detail을
지우지 않는다. 라이브 증거: higgsfield connected + models 정상인데 status.detail=DEGRADED 잔류.

diff 계획 (connectionManager.ts):
- `callTool` 성공 경로(try 블록 return raw 직전)와 `listTools` 성공 경로(페이지네이션 완료 후)에서
  현재 identity가 동일하고 `session.detail === "MCP_TRANSPORT_DEGRADED"`이면 `session.detail = undefined`.
- 헬퍼 `private clearDegraded(provider, identity)` 추가 (≤6줄):
  ```ts
  private clearDegraded(provider: string, identity: McpConnectionIdentity | null): void {
    const session = this.sessions.get(provider);
    if (!session || !sameConnection(session.identity, identity)) return;
    if (session.detail === "MCP_TRANSPORT_DEGRADED") session.detail = undefined;
  }
  ```
- 호출 위치: callTool 성공 반환 직전 1곳, listTools tools 수집 완료 후 1곳.

테스트:
- 기존 445행 테스트 확장 or 신규: transient onerror → detail=DEGRADED 확인 후,
  성공 callTool 1회 → status.detail 부재 확인. (fake client callTool 성공 stub)

## 010-B: 재연결 소진 확장 (F4)
문제: `markOffline`이 `reconnectUsed` 단일 플래그로 identity당 1회만 자동 재연결.
장시간(24h) 세션에서 두 번째 drop이면 offline 영구 잔류.

diff 계획:
- `ProviderSession.reconnectUsed?: boolean` → `reconnectAttempts?: number` 로 교체
  (connectionRuntime.ts interface + connectionManager.ts 사용처 2곳).
- `markOffline`: `const attempts = session.reconnectAttempts ?? 0;`
  `if (attempts >= MAX_AUTO_RECONNECTS || this.shuttingDown) return;`
  `session.reconnectAttempts = attempts + 1;`
  딜레이 = `(this.options.reconnectDelayMs ?? 250) * 2 ** attempts` (250/500/1000ms).
- `MAX_AUTO_RECONNECTS = 3` 상수 (connectionManager.ts 최상단).
- 성공 connect 시(performConnect connected Object.assign)에 `reconnectUsed: false` →
  `reconnectAttempts: 0` 으로 교체 — 새 identity마다 예산 리셋.
- refresh()가 bumpGeneration을 하므로 재연결 타이머 콜백의 sameConnection 가드는 그대로 유효.
  주의: 재연결은 refresh() 경유이므로 새 identity가 되고 attempts는 새 세션 0에서 시작 —
  카운터는 **offline을 유발한 직전 세션들에 걸쳐** 이어져야 무한 핑퐁을 막는다.
  → 카운터를 session이 아니라 manager-level `reconnectBudget = new Map<string, number>()`에 두고,
  성공적으로 connected 상태가 되면 0으로 리셋, markOffline마다 +1, 상한 3.
  (session 필드 대신 Map 사용으로 확정; interface 변경 불필요)

테스트:
- reconnectDelayMs:0 harness에서 연속 drop 4회 시나리오: 3회까지는 refresh 재시도 발생,
  4회째는 offline 잔류 + 타이머 미등록 확인.
- 성공 연결 후 budget 리셋 확인: drop→재연결 성공→drop 시 다시 재연결 시도.

## 검증
`npm run typecheck`, `node --import tsx --test tests/mcp-connection-manager.test.ts`, 이후 C에서 전량.
