// Runway adapter (050 WP5) — mappings verified against the authenticated
// tools/list snapshot (tests/fixtures/mcp/runway-tools.sanitized.json).
import {
  collectResultText,
  extractHttpsUrls,
  type MediaJobRequest,
  type MediaProviderAdapter,
  type MediaTaskPoll,
  type ToolCallPlan,
} from "../providerAdapter.js";

const IMAGE_MODELS = ["nano-banana-pro", "gpt-image-2", "gen-4"] as const;
const VIDEO_MODELS = ["seedance-2", "kling-o3-pro", "kling-3-pro", "gen-4.5", "veo-3.1", "gen-4-turbo"] as const;
const DEFAULT_RATIONALE = "ima2 local studio: user-initiated generation via the ima2 pipeline.";
const TASK_ID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function buildGenerateCall(request: MediaJobRequest): ToolCallPlan {
  const rationale = request.rationale ?? DEFAULT_RATIONALE;
  if (request.kind === "image") {
    if (request.model && !IMAGE_MODELS.includes(request.model as (typeof IMAGE_MODELS)[number])) {
      throw new Error(`MCP_MODEL_UNSUPPORTED:${request.model}`);
    }
    return {
      toolName: "generate_image",
      args: {
        rationale,
        promptText: request.prompt,
        ...(request.model ? { model: request.model } : {}),
        ...(request.ratio ? { ratio: request.ratio } : {}),
        count: 1,
      },
    };
  }
  if (request.model && !VIDEO_MODELS.includes(request.model as (typeof VIDEO_MODELS)[number])) {
    throw new Error(`MCP_MODEL_UNSUPPORTED:${request.model}`);
  }
  return {
    toolName: "generate_video",
    args: {
      rationale,
      promptText: request.prompt,
      ...(request.model ? { model: request.model } : {}),
      ...(request.ratio ? { ratio: request.ratio } : {}),
      ...(request.startFrameUrl ? { startFrame: { url: request.startFrameUrl } } : {}),
    },
  };
}

function parseTaskId(result: Record<string, unknown>): string | null {
  const structured = result.structuredContent as Record<string, unknown> | undefined;
  for (const key of ["taskId", "id"]) {
    const value = structured?.[key];
    if (typeof value === "string" && value) return value;
  }
  const tasks = structured?.tasks;
  if (Array.isArray(tasks) && tasks[0] && typeof (tasks[0] as { id?: unknown }).id === "string") {
    return (tasks[0] as { id: string }).id;
  }
  const match = collectResultText(result).match(TASK_ID_PATTERN);
  return match ? match[0] : null;
}

function parsePoll(result: Record<string, unknown>): MediaTaskPoll {
  const text = collectResultText(result);
  const statusMatch = text.match(/\b(SUCCEEDED|FAILED|CANCELED|CANCELLED|RUNNING|PENDING|THROTTLED|QUEUED)\b/i);
  const rawStatus = (statusMatch?.[1] ?? "").toUpperCase();
  const status: MediaTaskPoll["status"] =
    rawStatus === "SUCCEEDED" ? "succeeded"
    : rawStatus === "FAILED" ? "failed"
    : rawStatus === "CANCELED" || rawStatus === "CANCELLED" ? "canceled"
    : rawStatus === "RUNNING" ? "running"
    : rawStatus === "PENDING" || rawStatus === "QUEUED" || rawStatus === "THROTTLED" ? "pending"
    : "unknown";
  const outputUrls = extractHttpsUrls(text).filter((url) =>
    /\.(png|jpe?g|webp|mp4|mov|webm)(\?|$)/i.test(url) || /\/datasets?\//i.test(url) || /cloudfront|runway/i.test(url),
  );
  const failureDetail = status === "failed" ? text.slice(0, 300) : undefined;
  return { status, outputUrls, ...(failureDetail ? { detail: failureDetail } : {}) };
}

export const runwayAdapter: MediaProviderAdapter = {
  provider: "runway",
  models: { image: IMAGE_MODELS, video: VIDEO_MODELS },
  executable: true,
  buildGenerateCall,
  parseTaskId,
  buildPollCall: (taskId: string) => ({
    toolName: "get_task",
    args: { rationale: DEFAULT_RATIONALE, id: taskId },
  }),
  parsePoll,
};
