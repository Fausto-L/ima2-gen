# 130 execution results (2026-07-19)

Execution of `130_qa_perf_060.md`. Budget: 6 planned, **8 used** (+2 documented
overruns: oauth element-fix verification, oauth XMP verification after the
Gemini 429).

## A. 070 3-provider element QA

First run (stale pre-120 server) surfaced 3 real defects; all fixed and
re-verified with targeted evidence. Full 3-provider matrix re-run deferred
(budget) — per-defect evidence below.

| defect | evidence of fix |
|---|---|
| element refs silently dropped (refsCount:0) | root cause: compiler absolutized slot paths against process.cwd(). Fixed: generated-dir resolution + droppedRefs/refReadFailures in meta (`374c257`). Live re-run on oauth with 2-ref element: **refsCount:2**, same character (`1784398631031_45675b34_0.png`) |
| gemini-api invalid aspect_ratio (HTTP 400) | root cause: public v1beta requires ASPECT_RATIO_*/IMAGE_SIZE_* enums, adapter sent "1:1"/"1K". Fixed (`7816af4`) + wire contract test `tests/gemini-api-wire-contract.test.ts` 4/4 |
| grok webSearchEnabled:false ignored + webSearchCalls=1 | provider resolution + planner now honor the toggle; calls recorded by actual execution (`7816af4`). Parity test: zero /v1/responses calls when disabled |

First-run evidence: `assets/070/` (Erdos report + results).

## B. Runway MCP smoke

`connect` OK (14 tools, snapshot no-drift), ONE gen-4 image submitted:
`qa_runway_gen4_09` → done in 32s. Result: `assets/runway/gen4-teapot.png`
(real teapot photo), sidecar `gen4-sidecar.json` with providerTaskId +
providerUrl (transport `mcp-streamable-http`).

**Cost/usage: BLOCKED** — the sidecar carries no usage/cost field (known gap,
`routes/mcpMedia.ts:454` does not persist usage). Per the 130/140 contract
this is recorded as BLOCKED, not UNVERIFIED-passed.

Environment note: this worktree hosts a CONCURRENT session editing lib/mcp/*
uncommitted; those files were never touched by this lane.

## C. 100+ node performance

`assets/080/node-profile.json` + `node-profile.png` (Lovelace run):

| gate | result | actual |
|---|---|---|
| initial render | PASS | p95 45.6ms (100 nodes/140 edges) |
| pan/zoom | PASS | frame p95 9.7ms, avg 120 FPS |
| interaction | PASS | p95 9.4ms |
| long frames/tasks | PASS | 0 over 50ms / 0 over 200ms |
| palette search | PASS | p95 5.1ms |
| template instantiate | PASS | 18.1ms REST round-trip, 0 ID overlap across 2 runs |
| fit-view | PASS (re-verified) | Lovelace FAIL was a harness artifact — real UI path verified: instantiate → 9/9 nodes in viewport (`fitview-check.png`) |
| branch transform | BLOCKED | source module not served in prod build; pure-function timing unmeasurable this run |

## D. 060 closeout

- Grok orbit video (`qa060-grok-orbit3`, 4s): frame strip shows real
  perspective/parallax change (`grok-orbit-frames.png`); sidecar
  `presetIds: ["orbit-left"]` (`grok-orbit-sidecar.json`).
- Gemini video: **BLOCKED** — no direct video route for gemini
  (`routes/video.ts:184` rejects non-grok; `routes/models.ts:149` exposes no
  gemini video models).
- Gemini image (partial substitute): **BLOCKED** — HTTP 429 quota.
- presetIds XMP on a real image: `ima2 metadata 1784402537385_18940311_0.png
  --json` → `source: xmp`, `presetIds: ["orbit-left"]`
  (`oauth-orbit-image.png`).
- History raw-prompt: recorded prompt is the user-sent text (fragment sent
  inline by the caller, no double-injection).
