# 030 — 공통 MCP runtime·OAuth·connection manager

> **Post-interview canonical (2026-07-16).** WP3. ima2-owned execution은 인터뷰 Round 2에서 확정됐다. tool 계약의 정의·availability는 020 catalog가 소유하고, 이 phase는 transport/OAuth/token/connection lifecycle만 소유한다. `toolCatalog.ts`의 sanitize/hash/drift 책임은 040으로 이관됐다 — 여기서는 live tools/list의 획득과 connection 상태 전달까지만 담당한다.

## 목적

원격 MCP를 ima2-gen 내부 provider로 안전하게 호출하는 공통 runtime을 만든다. provider adapter는 transport/token 저장을 직접 구현하지 않는다.

이 runtime은 오픈소스 local MCP client boundary다. ima2 운영자가 provider credential을 받는 hosted broker는 만들지 않으며, official MCP가 없는 provider를 REST adapter로 우회 지원하지 않는다.

## 구조

```text
routes/mcpConnections.ts
        |
        v
lib/mcp/connectionManager.ts
  ├─ oauthProvider.ts
  ├─ tokenStore.ts
  ├─ toolCatalog.ts
  └─ capabilityRegistry.ts
        |
        v
@modelcontextprotocol/sdk Client + StreamableHTTPClientTransport
```

## File change map

| Op | Path | 변경 |
|---|---|---|
| NEW | `lib/mcp/types.ts` | `McpProviderId`, connection state, sanitized tool, capability, normalized call/result/error 타입. |
| NEW | `lib/mcp/providerRegistry.ts` | endpoint/auth mode/allowed capabilities를 가진 정적 provider registry. secrets 없음. |
| NEW | `lib/mcp/tokenStore.ts` | `${configDir}/mcp/<provider>.json` atomic 0600 read/write/delete, permission 검사. |
| NEW | `lib/mcp/oauthProvider.ts` | SDK OAuth provider 구현, PKCE/state, callback handoff, refresh와 revoke-local. |
| NEW | `lib/mcp/connectionManager.ts` | provider별 client lifecycle, connect/reconnect/close, timeout, single-flight refresh. |
| NEW | `lib/mcp/toolCatalog.ts` | paginated tools/list, sanitize/hash/cache, schema drift diagnostic. |
| NEW | `lib/mcp/capabilityRegistry.ts` | tool catalog와 adapter matcher를 합쳐 ima2 capability를 계산. |
| NEW | `routes/mcpConnections.ts` | list/status/connect/callback/disconnect/refresh/capabilities read API. generation route는 아님. |
| MODIFY | `config.ts` | MCP timeout, callback host/port, enabled provider allowlist, token/cache path. endpoint override는 dev-only. |
| MODIFY | `lib/runtimeContext.ts` | `mcpConnectionManager`를 strict RuntimeContext에 주입; route fixture default를 보존. |
| MODIFY | `routes/index.ts` | connection route 등록. |
| MODIFY | `lib/configKeys.ts` | MCP token/config secret key redaction. |
| MODIFY | `package.json` | exact SDK dependency와 필요한 scripts. |
| NEW | `tests/mcp-token-store.test.ts` | atomicity/0600/path traversal/corrupt recovery/no-secret-log. |
| NEW | `tests/mcp-oauth-flow.test.ts` | state/PKCE/callback/refresh/401 single retry/revoke-local. |
| NEW | `tests/mcp-tool-catalog.test.ts` | pagination/schema hash/drift/unavailable capability. |
| NEW | `tests/mcp-connection-routes.test.ts` | route status와 secret-free response. |

## Before → after

- Before: GPT/Grok OAuth와 API keys가 provider별 route/runtime 필드로 분리되어 있고 generic remote OAuth client가 없다.
- After: MCP transport/auth/catalog는 한 subsystem이 소유하고, 외부 route와 adapter는 token을 직접 보지 않는다.

## Public server contract

```text
GET    /api/mcp/providers
GET    /api/mcp/providers/:id/status
POST   /api/mcp/providers/:id/connect
GET    /api/mcp/oauth/callback
POST   /api/mcp/providers/:id/refresh
DELETE /api/mcp/providers/:id/connection
GET    /api/mcp/providers/:id/capabilities
```

응답은 `connected|auth_required|connecting|schema_changed|offline|error`와 secret-free diagnostic만 포함한다.

## Conditional activation scenarios

- 401: mock server가 첫 tools/list에 401, refresh 뒤 200을 반환할 때 정확히 한 번만 retry한다.
- Refresh race: 동시 10요청에서 refresh endpoint 호출이 1회인지 확인한다.
- Corrupt token: malformed file을 읽으면 원본을 덮지 않고 `auth_required`가 되며 token text가 log에 없음을 확인한다.
- Schema drift: 이전 hash와 새 hash가 다르면 generation capability가 잠기고 refresh 후에만 풀린다.
- SSRF guard: registry 밖 endpoint 또는 non-HTTPS endpoint 요청이 network call 전에 거부되는지 확인한다.

## Acceptance criteria

- route 응답·logs·diagnostics 어디에도 token이 없다.
- 모든 token file은 final path에서도 0600이다.
- provider disconnect는 local token/client/cache를 정리하되 provider account revoke를 했다고 거짓 표시하지 않는다.
- server restart 후 refresh token으로 재연결하거나 명시적으로 auth_required가 된다.
- MCP connection failure가 기존 GPT/Grok provider readiness를 망가뜨리지 않는다.

## Verification

```bash
npm run typecheck
npm run typecheck:tests
node --test --import tsx tests/mcp-token-store.test.ts tests/mcp-oauth-flow.test.ts tests/mcp-tool-catalog.test.ts tests/mcp-connection-routes.test.ts
npm run test:inventory
```
