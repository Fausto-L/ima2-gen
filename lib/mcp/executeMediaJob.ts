// Media job executor (050 WP5): tools/call + task polling. Pure execution —
// returns normalized results; persistence belongs to routes/mcpMedia.ts.
import type { McpConnectionManager } from "./connectionManager.js";
import type { MediaJobRequest, MediaProviderAdapter, MediaTaskPoll } from "./providerAdapter.js";

export interface ExecuteMediaJobOptions {
  signal?: AbortSignal;
  /** Overall deadline. Defaults: image 5min, video 12min. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  onPhase?: (phase: "provider-queued" | "provider-running") => void;
}

export interface MediaJobResult {
  taskId: string;
  outputUrls: string[];
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("MCP_JOB_ABORTED")); }, { once: true });
  });

export async function executeMediaJob(
  manager: McpConnectionManager,
  adapter: MediaProviderAdapter,
  request: MediaJobRequest,
  options: ExecuteMediaJobOptions = {},
): Promise<MediaJobResult> {
  if (!adapter.executable) throw new Error(`MCP_EXECUTION_LOCKED:${adapter.provider}`);
  const deadline = Date.now() + (options.timeoutMs ?? (request.kind === "video" ? 12 * 60_000 : 5 * 60_000));
  const plan = adapter.buildGenerateCall(request);
  const submitResult = await manager.callTool(adapter.provider, plan.toolName, plan.args, { signal: options.signal });
  const taskId = adapter.parseTaskId(submitResult);
  if (!taskId) throw new Error(`MCP_TASK_ID_MISSING:${adapter.provider}:${plan.toolName}`);
  options.onPhase?.("provider-queued");

  let interval = options.pollIntervalMs ?? 3_000;
  let sawRunning = false;
  for (;;) {
    if (options.signal?.aborted) throw new Error("MCP_JOB_ABORTED");
    if (Date.now() > deadline) throw new Error(`MCP_JOB_TIMEOUT:${taskId}`);
    await sleep(interval, options.signal);
    interval = Math.min(interval * 1.5, 12_000);
    const pollPlan = adapter.buildPollCall(taskId);
    const pollResult = await manager.callTool(adapter.provider, pollPlan.toolName, pollPlan.args, { signal: options.signal });
    const poll: MediaTaskPoll = adapter.parsePoll(pollResult);
    if (poll.status === "running" && !sawRunning) { sawRunning = true; options.onPhase?.("provider-running"); }
    if (poll.status === "succeeded") {
      if (poll.outputUrls.length === 0) throw new Error(`MCP_RESULT_URL_MISSING:${taskId}`);
      return { taskId, outputUrls: poll.outputUrls };
    }
    if (poll.status === "failed") throw new Error(`MCP_TASK_FAILED:${taskId}:${poll.detail ?? ""}`);
    if (poll.status === "canceled") throw new Error(`MCP_TASK_CANCELED:${taskId}`);
  }
}
