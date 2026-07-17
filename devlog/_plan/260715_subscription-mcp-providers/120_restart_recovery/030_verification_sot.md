# Phase 030 — verification, source-of-truth sync, and closeout

Consumes: completed Phases 010 and 020
Work phase: WP3

## Scope

Run the full regression/security matrix, synchronize current architecture and public API documents, perform fresh adversarial review, and archive this recovery unit. Production behavior changes are limited to blocker fixes discovered by the verifier.

## File change map

Apply docs in this order after the final code/test names are known: architecture ownership → server/runtime behavior → operations → public API → parent implementation/verification plans → devlog map/status.

### MODIFY `structure/01-file-function-map.md`

- Before: MCP backend lifecycle owners are absent; only a UI selector reference exists.
- After: add rows for token-store inspection/invalidation, OAuth provider binding/invalidation, manager connect/refresh/restore/shutdown/connection identity, connection routes, and their owning tests using the final exported names from WP1/WP2.
- Activation check: every new exported MCP lifecycle function appears exactly once in the map and every path exists.

### MODIFY `structure/03-server-api.md`

- Before: the route/runtime tables omit MCP connection startup and shutdown semantics.
- After: add the six MCP connection endpoints, the post-listen restore sequence, state→HTTP mapping, memory-only pending OAuth limitation, one bounded terminal reconnect, and shutdown ownership.
- Activation check: route names match `routes/mcpConnections.ts`; stale text cannot claim callback success for non-connected states.

### MODIFY `structure/06-infra-operations.md`

- Before: local storage/config/port sections do not identify MCP credential records or fallback-origin behavior.
- After: document `${configDir}/mcp`, 0600 versioned binding metadata, same-binding automatic restore, passive mismatch preservation plus user-initiated re-registration, pending-flow restart behavior, timeout/retry bounds, shutdown, safe diagnostic fields, and multi-process token-dir non-support.
- Activation check: operations doc names both configured and actual port ordering and contains no token example/value.

### MODIFY `docs/API.md`

- Before: MCP section documents manual connect/refresh and stored tokens but not automatic startup restore or truthful error/offline response mapping.
- After: document automatic same-binding restore, detailed connection states, optional degraded diagnostic, connect/refresh/callback status codes, mismatch reauthorization, memory-only pending browser flow, and local-only Disconnect.
- Activation check: endpoint table and examples agree with route tests; grep confirms no promise that every callback returns completion HTML.

### MODIFY `devlog/_plan/260715_subscription-mcp-providers/030_mcp_runtime_auth.md`

- Before: restart recovery, single-flight refresh, and security suites are acceptance claims without matching implementation evidence.
- After: link this recovery unit, identify implemented WP1/WP2 contracts and test receipts, and mark broader unimplemented provider/golden work honestly.
- Activation check: every completed claim links to a command/test artifact; no absent test path is marked done.

### MODIFY `devlog/_plan/260715_subscription-mcp-providers/090_verification_rollout.md`

- Before: planned restart/security/provider-smoke suites are listed as future files without status separation.
- After: map covered recovery cases to the existing extended MCP test files; keep long-job, clean-install golden, and paid provider smoke explicitly pending/out of this recovery unit.
- Activation check: all referenced test paths exist and provider smoke remains approval-gated.

### MODIFY `structure/07-devlog-map.md`

- Before: active devlog map omits the MCP recovery follow-up.
- After: add `260715_subscription-mcp-providers/120_restart_recovery` with its dependency chain, terminal outcome, verification receipt, and parent-unit relationship.
- Activation check: map path resolves and status matches `000_plan.md`.

### MODIFY `devlog/_plan/260715_subscription-mcp-providers/120_restart_recovery/000_plan.md`

- Before: status is WP0 docs-only and criteria have no final receipts.
- After: record terminal outcome, scoped commits, command/test counts, adversarial verdict, pre-existing unrelated failures, and `Status: completed` only after all goal criteria are met.
- No move: keep the nested recovery folder under the active parent MCP unit. Exact `_fin` movement is deferred until the parent `260715_subscription-mcp-providers` unit itself closes; editing the already-dirty `.gitignore` or splitting a nested child into a new ignored archive is forbidden.
- Activation check: 000 status, goalplan, ledger, and `structure/07-devlog-map.md` agree.

## Verification matrix

```bash
npm run typecheck
npm run typecheck:tests
node --test --import tsx tests/mcp-token-store.test.ts tests/mcp-connection-manager.test.ts tests/mcp-connection-routes.test.ts tests/mcp-sanitizer.test.ts tests/runtime-ports.test.ts tests/runtime-context-normalize.test.ts
npm run test:inventory
npm test
```

Additional checks:

- `git diff --check -- <explicit recovery path manifest>` because repository-wide diff currently contains unrelated failures.
- Targeted secret scan over recovery diffs and outputs for access/refresh token, authorization code, verifier, cookie, account, and raw Authorization header patterns.
- Start a temporary server with an isolated config directory and fake MCP transport; observe post-listen restore and shutdown. Do not use the real provider token file.
- Optional real Runway status/connect proof is non-billed and may run at most twice only if it can avoid exposing or rewriting credentials. It is not required when isolated activation proof is complete.
- Fresh independent reviewer receives exact diff and ends with `VERDICT: PASS | GO-WITH-FIXES | FAIL`.
- Documentation contract scan: verify every exported lifecycle function, endpoint, state, retry bound, and pending-flow limitation appears consistently across `01`, `03`, `06`, `docs/API.md`, and the parent 030/090 plans.
- Stale-claim scan: fail if docs say startup always reconnects without binding checks, callback always succeeds, pending OAuth survives restart, or mutating `callTool` is replayed.

## Security assertions

- No raw upstream OAuth/MCP error reaches public status.
- No stale generation persists tokens or changes status.
- No disabled/mismatched provider receives a Bearer request.
- No automatic retry replays mutating or billed tools.
- No shutdown/delete race recreates credentials.
- Token files remain 0600 and no temporary residue remains.
- Callback state remains single-use and expiry closes its transport.

## Completion evidence

Record exact commands, exit codes, test counts, activation observations, reviewer verdict, scoped commit IDs, and any pre-existing failures. Do not mark a criterion met from memory or a prior run.

## Exit criteria

- Every goalplan criterion has non-empty captured evidence.
- Full relevant gates are green or a clearly pre-existing unrelated failure is isolated with path evidence and does not affect recovery files.
- No unresolved High/Critical reviewer finding remains.
- No uncommitted recovery file remains and no unrelated file is staged.
- Terminal outcome is recorded; no push occurs without explicit approval.
