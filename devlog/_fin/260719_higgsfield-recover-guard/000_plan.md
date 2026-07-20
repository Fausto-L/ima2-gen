# 000 — higgsfield-recover-guard: Plan

## Audit result (2026-07-19, after the 260718 Runway loss hardening)

Question: does Higgsfield have the same "remote succeeded, locally lost"
problem? Answer: **No — and it cannot occur today.** The higgsfield adapter is
catalog-only: `buildGenerateCall`/`parseTaskId`/`buildPollCall`/`parsePoll`
all throw `MCP_EXECUTION_LOCKED` (lib/mcp/adapters/higgsfield.ts). No code path
can submit or poll a higgsfield job, so there is nothing to lose. The shared
download path (downloadMediaResult: retry + IPv4 fallback) and poll path
(executeMediaPlan: 5s+jitter, 2-error tolerance) were hardened on 260718 and
cover higgsfield automatically the day it is unlocked.

Gaps found while auditing:

- G1: `POST /api/mcp/tasks/:taskId/recover` (routes/mcpRecover.ts, added
  260718) lacks the `!adapter.executable -> 409 MCP_EXECUTION_LOCKED` guard
  that `/api/mcp/generate` has. Today higgsfield is disconnected so the
  connected-check fires first, but a connected-but-locked higgsfield would go
  async and die inside the job with a confusing error instead of a clean 409.
- G2 (documentation): the higgsfield snapshot shows the real poll contract is
  `job_status(jobId)` with server-driven `poll_after_seconds` and a `sync`
  option (~25s server-side wait). The shared executeMediaPlan interval is
  client-fixed and does not read `poll_after_seconds`. Unlocking higgsfield
  without honoring this violates the provider's polling contract. Recorded as
  unlock preconditions in the adapter header — no behavior change while locked.

## Objective

Close G1 with the same 409 contract as /api/mcp/generate, record G2 as
executable-unlock preconditions, and cover both with tests.

## Loop-spec

- Loop archetype: verifier-defined (spec-satisfaction repair).
- Write scope: `routes/mcpRecover.ts`, `lib/mcp/adapters/higgsfield.ts`
  (comment only), `tests/mcp-recover-route.test.ts`, `docs/API.md`.
- Out-of-scope: unlocking higgsfield execution, higgsfield parsePoll
  implementation (needs a live paid-plan fixture), UI changes, push.
- Budget / bounds: one work-phase, no live provider calls at all
  (higgsfield disconnected; all verification is offline unit/route tests).

## Work-phase map (one phase = one full PABCD cycle)

| WP | Doc | Slice | Depends on |
|----|-----|-------|------------|
| 1 | 010_phase1.md | G1 guard + G2 unlock-precondition docs + tests |

## Accept criteria

- (mirror into the goalplan criteria[])
