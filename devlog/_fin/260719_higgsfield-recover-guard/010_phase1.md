# 010 — Phase 1: recover-route executable guard + higgsfield unlock preconditions

## MODIFY / NEW / DELETE map

### MODIFY `routes/mcpRecover.ts`

Add the same guard `/api/mcp/generate` has (mcpMedia.ts:231), placed right
after the provider lookup, BEFORE the connected check (locked beats
disconnected — same ordering as generate):

```ts
if (!adapter.executable) return res.status(409).json({ error: { code: "MCP_EXECUTION_LOCKED", message: `${adapter.provider} is catalog-only` } });
```

### MODIFY `lib/mcp/adapters/higgsfield.ts` (comment only, no behavior change)

Extend the header comment with unlock preconditions captured from the live
73-tool snapshot (`~/.ima2/mcp/snapshots/higgsfield.json`):

- Poll tool is `job_status({ jobId })` (uuid), NOT `get_task`.
- Non-terminal responses carry `poll_after_seconds` — the shared
  executeMediaPlan interval is client-fixed (5s+jitter) and must learn to
  honor a server-provided delay before higgsfield is unlocked.
- `job_status` has `sync: true` option (~25s server-side wait) — candidate
  for lowering poll churn.
- `generate_video` requires `medias[].value` as media_id/job_id via
  `media_import_url` / `media_upload_widget`, never raw URLs — the
  start-frame/reference upload path differs from Runway's init_upload.

### MODIFY `docs/API.md`

In the `/api/mcp/tasks/:taskId/recover` section add: catalog-only providers
(higgsfield) return `409 MCP_EXECUTION_LOCKED`.

## TESTS

`tests/mcp-recover-route.test.ts` — one new case:

- `recover: 409 MCP_EXECUTION_LOCKED for catalog-only provider` — body
  `{ provider: "higgsfield" }` with a fake manager that reports higgsfield as
  CONNECTED (to prove the executable guard fires before/regardless of
  connection state). Assert 409 + code.

## Verification (C)

- `npm run typecheck` — 0 errors.
- `npx node --test tests/mcp-recover-route.test.ts` — all pass (5 cases).
- `npm test` — full suite; only pre-existing concurrent-work failures
  (element-mention) may remain, each verified out-of-scope by file owner.
