// 260722 hardening 020-A: provider-side rate limiting in the poll loop must
// back off and keep polling instead of consuming the 3-strike pollErrors
// budget. Submit-stage rate limits still fail immediately.
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeMediaJob } from "../lib/mcp/executeMediaJob.js";
import type { McpConnectionManager } from "../lib/mcp/connectionManager.js";
import type { MediaProviderAdapter } from "../lib/mcp/providerAdapter.js";

const RATE_LIMIT_ERROR = new Error("MCP_TOOL_ERROR:job_status:429 Too Many Requests");
const GENERIC_ERROR = new Error("MCP_TOOL_ERROR:job_status:upstream hiccup");

function makeAdapter(): MediaProviderAdapter {
  return {
    provider: "higgsfield",
    models: { image: ["soul_2"], video: ["cinematic_studio_3_0"] },
    executable: true,
    buildGenerateCall: (request) => ({ toolName: request.kind === "image" ? "generate_image" : "generate_video", args: { params: {} } }),
    parseTaskId: (result) => (result.taskId as string) ?? null,
    buildPollCall: (taskId) => ({ toolName: "job_status", args: { jobId: taskId } }),
    parsePoll: (result) => result.poll as never,
  };
}

function makeManager(behaviors: Array<() => Promise<Record<string, unknown>>>): McpConnectionManager {
  let call = 0;
  return {
    callTool: async () => {
      const behavior = behaviors[Math.min(call, behaviors.length - 1)];
      call += 1;
      return behavior();
    },
  } as unknown as McpConnectionManager;
}

const request = { kind: "image", prompt: "p" } as const;
const fast = { pollIntervalMs: 1, timeoutMs: 30_000 };
const succeeded = { poll: { status: "succeeded", outputUrls: ["https://cdn.example/out.png"] } };

test("rate-limited polls back off and do not consume the 3-strike budget", async () => {
  const manager = makeManager([
    async () => ({ taskId: "11111111-2222-3333-4444-555555555555" }),
    async () => { throw RATE_LIMIT_ERROR; },
    async () => { throw RATE_LIMIT_ERROR; },
    async () => { throw RATE_LIMIT_ERROR; },
    async () => { throw RATE_LIMIT_ERROR; },
    async () => succeeded,
  ]);
  const result = await executeMediaJob(manager, makeAdapter(), request, fast);
  assert.deepEqual(result.outputUrls, ["https://cdn.example/out.png"]);
});

test("mixed rate-limit and generic errors: only generic errors count toward 3 strikes", async () => {
  const manager = makeManager([
    async () => ({ taskId: "11111111-2222-3333-4444-555555555555" }),
    async () => { throw GENERIC_ERROR; },
    async () => { throw RATE_LIMIT_ERROR; },
    async () => { throw GENERIC_ERROR; },
    async () => { throw RATE_LIMIT_ERROR; },
    async () => succeeded,
  ]);
  const result = await executeMediaJob(manager, makeAdapter(), request, fast);
  assert.deepEqual(result.outputUrls, ["https://cdn.example/out.png"]);
});

test("three consecutive generic poll errors still fail the job (regression)", async () => {
  const manager = makeManager([
    async () => ({ taskId: "11111111-2222-3333-4444-555555555555" }),
    async () => { throw GENERIC_ERROR; },
  ]);
  await assert.rejects(
    () => executeMediaJob(manager, makeAdapter(), request, fast),
    /upstream hiccup/,
  );
});

test("sustained rate limiting eventually hits the overall deadline", async () => {
  const manager = makeManager([
    async () => ({ taskId: "11111111-2222-3333-4444-555555555555" }),
    async () => { throw RATE_LIMIT_ERROR; },
  ]);
  await assert.rejects(
    () => executeMediaJob(manager, makeAdapter(), request, { pollIntervalMs: 1, timeoutMs: 50 }),
    /MCP_JOB_TIMEOUT/,
  );
});

test("abort during rate-limited polling surfaces MCP_JOB_ABORTED", async () => {
  const abort = new AbortController();
  const manager = makeManager([
    async () => ({ taskId: "11111111-2222-3333-4444-555555555555" }),
    async () => { abort.abort(); throw RATE_LIMIT_ERROR; },
  ]);
  await assert.rejects(
    () => executeMediaJob(manager, makeAdapter(), request, { ...fast, signal: abort.signal }),
    /MCP_JOB_ABORTED/,
  );
});

test("rate-limited submit still fails immediately (submit is not the poll loop)", async () => {
  const manager = makeManager([
    async () => { throw new Error("MCP_TOOL_ERROR:generate_image:429 Too Many Requests"); },
  ]);
  await assert.rejects(
    () => executeMediaJob(manager, makeAdapter(), request, fast),
    /429 Too Many Requests/,
  );
});
