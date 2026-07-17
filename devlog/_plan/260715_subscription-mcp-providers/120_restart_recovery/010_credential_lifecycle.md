# Phase 010 — credential and lifecycle foundations

Consumes: `000_plan.md`, `001_current_state.md`
Work phase: WP1

## Scope

Implement record binding, SDK invalidation, memory-only PKCE, per-provider generation guards, and single-flight connection ownership. Do not wire server startup restore or automatic reconnect in this phase.

## File change map

### MODIFY `lib/mcp/tokenStore.ts`

Before:

- Record contains optional client information, tokens, verifier, and origin.
- Writes replace the full file atomically with 0600 mode.
- Only read/write/delete operations exist.

After:

- Add versioned non-secret binding metadata: provider ID, normalized endpoint, redirect origin, and token acquisition/update timestamp.
- Add a secret-free inspection result used by startup: `missing|corrupt|pending-only|usable|binding-mismatch` without returning credential values.
- Add atomic field-scoped invalidation for `all|client|tokens|verifier|discovery`.
- `client` invalidation also clears client-bound tokens; `all` preserves no credential fields.
- Preserve 0600 final mode and path guard. Do not create a new storage module.

### MODIFY `lib/mcp/oauthProvider.ts`

Before:

- Implements a local subset of the SDK provider and is cast through `never`.
- Reads a whole record snapshot, persists PKCE verifier, and deletes the whole record immediately on origin mismatch.

After:

- Implement the SDK `OAuthClientProvider` contract directly, including `invalidateCredentials`.
- Accept endpoint and generation-current guards from the manager.
- Keep state and verifier only in the provider closure; successful token save clears legacy persisted verifier material.
- Reject stale-generation persistence with a typed internal error/no-op that cannot recreate a deleted record.
- Never delete during passive construction. Expose a secret-free binding decision to the manager.
- Save current binding metadata only after successful registration/token persistence.

### MODIFY `lib/mcp/connectionManager.ts`

Before:

- `connect()` starts a new client unless state is already `connected`.
- Pending auth entries have provider/transport/expiry only.
- Callback, reset, and disconnect are not generation-aware.

After:

- Add a monotonic generation and one in-flight connect promise per provider.
- Coalesce connect/restore calls for the current generation.
- Store generation in pending auth and allow at most one current pending flow per provider; close superseded/expired transports.
- Disconnect increments generation before closing/deleting so late providers cannot persist or reconnect.
- Callback validates state, expiry, provider generation, and current pending ownership before and after async token exchange.
- Add atomic `refresh(provider)` ownership; keep old `reset()` only if a direct caller still requires it, otherwise route callers migrate in WP2.
- Validate unknown/disabled IDs without creating phantom sessions.
- Public detail uses allowlisted codes/messages, never raw upstream bodies.

### MODIFY `lib/mcp/types.ts`

- Document state meanings and add only optional secret-free lifecycle metadata required by manager tests.
- Do not expose token presence, account identity, authorization code, verifier, or raw upstream error.

### MODIFY `tests/mcp-token-store.test.ts`

Add RED→GREEN activation cases for:

- binding inspection of missing, corrupt, pending-only, usable, same-binding legacy, and mismatch records;
- exact field invalidation for every SDK scope:
  - `tokens` clears only the access/refresh token bundle;
  - `client` clears client information and every client-bound token, while leaving unrelated binding metadata available for diagnostics;
  - `verifier` clears persisted legacy verifier material and the live provider closure rejects a later verifier read;
  - `discovery` is an explicit no-op while discovery state is not persisted; its test prevents accidental clearing of client/tokens and must change if discovery persistence is later added;
  - `all` clears client, tokens, verifier, and any future discovery state in one atomic write;
- legacy verifier removal;
- 0600 and no temp residue after every mutation;
- values never appearing in inspection output.

### MODIFY `tests/mcp-connection-manager.test.ts`

Upgrade the fake transport/client to support deferred connect, close/error callbacks, and persistence guards. Add RED→GREEN cases for:

- ten concurrent connects produce one client/transport;
- older connect completion cannot overwrite newer intent;
- disconnect during connect closes/invalidates the candidate and wins terminal state;
- stale callback after disconnect/new connect is rejected;
- pending auth expiry closes transport;
- SDK token/all invalidation changes the intended record fields;
- SDK client/verifier/discovery invalidation activates the exact semantics above and does not over-clear;
- unknown status does not create a session.

## Conditional-path activation

| Path | Trigger | Observable proof |
|---|---|---|
| stale provider save | Disconnect while deferred connect/callback is pending | token file stays deleted and candidate closes |
| invalid grant | Fake SDK calls `invalidateCredentials('tokens')` | token bundle gone, client registration retained |
| invalid client | Fake SDK calls `invalidateCredentials('all')` | complete credential fields gone |
| client invalidation | Fake SDK calls `invalidateCredentials('client')` | client and client-bound tokens gone; binding diagnostic remains |
| verifier invalidation | Provider saves a verifier, then receives `verifier` | verifier read fails; client/tokens unchanged |
| discovery invalidation | Provider receives `discovery` with no persisted discovery field | explicit no-op; client/tokens byte-equivalent |
| origin/endpoint mismatch | Inspect bound record under changed current binding | status is mismatch; passive read leaves bytes present |
| expired pending state | Advance injected clock past TTL | callback rejected and transport closed |

## Verification

```bash
npm run typecheck
npm run typecheck:tests
node --test --import tsx tests/mcp-token-store.test.ts tests/mcp-connection-manager.test.ts
git diff --check -- lib/mcp/tokenStore.ts lib/mcp/oauthProvider.ts lib/mcp/connectionManager.ts lib/mcp/types.ts tests/mcp-token-store.test.ts tests/mcp-connection-manager.test.ts
```

## Exit criteria

- All activation cases fire and pass.
- No server/route/UI/docs source is modified.
- No credential value appears in output.
- Only WP1 paths are committed locally; no push.
