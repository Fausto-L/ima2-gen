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
import {
  isParameterValueAllowed,
  type McpModelEntry,
  type McpModelParameter,
  type McpPresetValue,
} from "../modelCapabilities.js";

const ratioCapabilities = (aspectRatios: string[], inputRoles: string[]) => ({
  source: "verified-contract" as const,
  aspectRatios,
  parameters: [] as McpModelParameter[],
  inputRoles,
});

const durationOptions = (options: number[], defaultValue: number): McpModelParameter => ({
  name: "duration", type: "number", description: "Output duration in seconds.",
  options, default: defaultValue,
});

const durationRange = (min: number, max: number, defaultValue: number): McpModelParameter => ({
  name: "duration", type: "number", description: "Output duration in seconds.",
  min, max, default: defaultValue,
});

const resolutionOptions = (options: string[]): McpModelParameter => ({
  name: "resolution", type: "string", description: "Output resolution override.", options,
});

const audioParameter = (): McpModelParameter => ({
  name: "generateAudio", type: "boolean", description: "Generate native audio.", default: true,
});

export const RUNWAY_MODEL_CATALOG: Record<"image" | "video", McpModelEntry[]> = {
  image: [
    { id: "nano-banana-pro", label: "Nano Banana Pro", capabilities: ratioCapabilities(["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], ["text", "image_references"]) },
    { id: "gpt-image-2", label: "GPT Image 2", capabilities: ratioCapabilities(["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"], ["text", "image_references"]) },
    { id: "gen-4", label: "Gen-4 Image", capabilities: ratioCapabilities(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], ["text", "image_references"]) },
  ],
  video: [
    { id: "seedance-2", label: "Seedance 2", capabilities: { ...ratioCapabilities(["16:9", "9:16", "1:1"], ["text", "start_image", "end_image", "image_references", "video_references", "audio_references"]), parameters: [durationRange(4, 15, 10), resolutionOptions(["480p", "720p", "1080p"]), audioParameter()] } },
    { id: "kling-o3-pro", label: "Kling O3 Pro", capabilities: { ...ratioCapabilities(["16:9", "9:16", "1:1"], ["text", "start_image", "end_image", "image_references", "video_references"]), parameters: [durationOptions([5, 10, 15], 10), audioParameter()] } },
    { id: "kling-3-pro", label: "Kling 3 Pro", capabilities: { ...ratioCapabilities(["16:9", "9:16", "1:1"], ["text", "start_image", "end_image"]), parameters: [durationOptions([5, 10, 15], 10), audioParameter()] } },
    { id: "gen-4.5", label: "Gen-4.5", capabilities: { ...ratioCapabilities(["16:9", "9:16", "1:1"], ["text", "start_image"]), parameters: [durationRange(2, 10, 10), audioParameter()] } },
    { id: "veo-3.1", label: "Veo 3.1", capabilities: { ...ratioCapabilities(["16:9", "9:16", "1:1"], ["text", "start_image", "end_image"]), parameters: [durationOptions([4, 6, 8], 8), resolutionOptions(["720p", "1080p"]), audioParameter()] } },
    { id: "gen-4-turbo", label: "Gen-4 Turbo", capabilities: { ...ratioCapabilities(["16:9", "9:16", "1:1"], ["start_image"]), parameters: [durationOptions([5, 10], 10)] } },
  ],
};

const IMAGE_MODELS = RUNWAY_MODEL_CATALOG.image.map((entry) => entry.id);
const VIDEO_MODELS = RUNWAY_MODEL_CATALOG.video.map((entry) => entry.id);
const DEFAULT_MODEL = { image: "nano-banana-pro", video: "seedance-2" } as const;
const DEFAULT_RATIONALE = "ima2 local studio: user-initiated generation via the ima2 pipeline.";
const TASK_ID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function modelEntry(request: MediaJobRequest): McpModelEntry {
  const model = request.model ?? DEFAULT_MODEL[request.kind];
  const entry = RUNWAY_MODEL_CATALOG[request.kind].find((candidate) => candidate.id === model);
  if (!entry) throw new Error(`MCP_MODEL_UNSUPPORTED:${model}`);
  return entry;
}

function validatedParameters(request: MediaJobRequest, entry: McpModelEntry): Record<string, McpPresetValue> {
  const selected = { ...(request.parameters ?? {}) };
  for (const [name, value] of Object.entries(selected)) {
    const parameter = entry.capabilities.parameters.find((candidate) => candidate.name === name);
    if (!parameter) throw new Error(`MCP_PARAMETER_UNSUPPORTED:${entry.id}:${name}`);
    if (!isParameterValueAllowed(parameter, value)) {
      throw new Error(`MCP_PARAMETER_INVALID:${entry.id}:${name}`);
    }
  }
  // Cross-field combos are normalized to the nearest supported contract so a
  // default preset selection never self-rejects (sol review F3/F4). Individual
  // out-of-contract values above still reject before any tool call.
  if (entry.id === "veo-3.1" && selected.resolution === "1080p" && selected.duration !== undefined && selected.duration !== 8) {
    selected.duration = 8;
  }
  if (entry.id === "gen-4.5" && request.startFrameUrl && selected.generateAudio !== undefined) {
    delete selected.generateAudio;
  }
  return selected;
}

function validateRequest(request: MediaJobRequest): Record<string, McpPresetValue> {
  const entry = modelEntry(request);
  if (request.ratio && !entry.capabilities.aspectRatios.includes(request.ratio)) {
    throw new Error(`MCP_PARAMETER_INVALID:${entry.id}:ratio`);
  }
  return validatedParameters(request, entry);
}

function buildGenerateCall(request: MediaJobRequest): ToolCallPlan {
  const rationale = request.rationale ?? DEFAULT_RATIONALE;
  const parameters = validateRequest(request);
  if (request.kind === "image") {
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
  return {
    toolName: "generate_video",
    args: {
      rationale,
      promptText: request.prompt,
      ...(request.model ? { model: request.model } : {}),
      ...(request.ratio ? { ratio: request.ratio } : {}),
      ...(parameters.duration !== undefined ? { duration: parameters.duration } : {}),
      ...(parameters.resolution !== undefined ? { resolution: parameters.resolution } : {}),
      ...(parameters.generateAudio !== undefined ? { generateAudio: parameters.generateAudio } : {}),
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

export type RunwayMediaAction = "upscale-video" | "upscale-image" | "edit-video";

/** Native media-action plans (060 WP6). Inputs must be runway-hosted or public HTTPS URLs. */
export function buildRunwayActionCall(action: RunwayMediaAction, inputs: { url: string; prompt?: string }): ToolCallPlan {
  const rationale = DEFAULT_RATIONALE;
  switch (action) {
    case "upscale-video":
      return { toolName: "upscale_video", args: { rationale, video: { url: inputs.url } } };
    case "upscale-image":
      return { toolName: "upscale_image", args: { rationale, image: { url: inputs.url } } };
    case "edit-video": {
      if (!inputs.prompt) throw new Error("MCP_ACTION_PROMPT_REQUIRED");
      return { toolName: "edit_video", args: { rationale, promptText: inputs.prompt, video: { url: inputs.url } } };
    }
  }
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
