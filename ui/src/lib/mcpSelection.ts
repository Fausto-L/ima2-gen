// Pure MCP selection helpers (010, devlog/_plan/260716_mcp-model-surface-ui).
// This module must stay free of browser globals so plain Node test harnesses
// can import it directly (see tests/mcp-media-kind-behavior.test.ts).
import type { McpGenerateInput } from "./mcpProviders";

export type McpMediaKind = "image" | "video";

const VIDEO_VALUE_PREFIX = "vid:";
const IMAGE_VALUE_PREFIX = "img:";

/** Legacy/unknown persisted values normalize to "image". */
export function resolveMcpMediaKind(value: unknown): McpMediaKind {
  return value === "video" ? "video" : "image";
}

/**
 * Conservative ratio presets (030): the Runway contract exposes no ratio enum
 * ("supported values vary by model"), so the UI offers only widely-accepted
 * presets and defaults to Auto (null = omit the ratio key entirely).
 */
export const MCP_RATIO_PRESETS = ["16:9", "9:16", "1:1"] as const;

export function normalizeMcpRatio(value: unknown): string | null {
  return (MCP_RATIO_PRESETS as readonly string[]).includes(value as string)
    ? (value as string)
    : null;
}

export type McpSelection = {
  provider: string | null;
  model: string | null;
  kind: McpMediaKind;
  ratio: string | null;
};

/**
 * Normalizes persisted generation-default fields into the MCP selection shape.
 * Legacy payloads without mcpMediaKind (pre-010) fall back to "image".
 */
export function normalizeMcpSelection(defaults: {
  mcpProvider?: unknown;
  mcpModel?: unknown;
  mcpMediaKind?: unknown;
  mcpRatio?: unknown;
}): McpSelection {
  return {
    provider: typeof defaults.mcpProvider === "string" ? defaults.mcpProvider : null,
    model: typeof defaults.mcpModel === "string" ? defaults.mcpModel : null,
    kind: resolveMcpMediaKind(defaults.mcpMediaKind),
    ratio: normalizeMcpRatio(defaults.mcpRatio),
  };
}

export function encodeMcpModelValue(kind: McpMediaKind, model: string): string {
  return `${kind === "video" ? VIDEO_VALUE_PREFIX : IMAGE_VALUE_PREFIX}${model}`;
}

export function parseMcpModelValue(value: string): { kind: McpMediaKind; model: string } | null {
  if (value.startsWith(VIDEO_VALUE_PREFIX)) {
    const model = value.slice(VIDEO_VALUE_PREFIX.length);
    return model ? { kind: "video", model } : null;
  }
  if (value.startsWith(IMAGE_VALUE_PREFIX)) {
    const model = value.slice(IMAGE_VALUE_PREFIX.length);
    return model ? { kind: "image", model } : null;
  }
  return null;
}

export type McpGenerationBuildState = {
  mcpProvider?: string | null;
  mcpModel?: string | null;
  mcpMediaKind?: McpMediaKind;
  /** null/undefined = Auto: the ratio key is omitted from the payload (030). */
  mcpRatio?: string | null;
  /** Filename of the currently viewed image, used as the video start frame. */
  currentImageFilename?: string | null;
};

/**
 * Assembles the full MCP generation payload. Owns kind/model/ratio/start-frame
 * logic so it can be unit-tested without executing the EventSource-backed
 * generation orchestration (audit R3-2).
 */
export function buildMcpGenerationInput(
  state: McpGenerationBuildState,
  prompt: string,
  requestId?: string,
): McpGenerateInput | null {
  const provider = state.mcpProvider ?? null;
  if (!provider || !prompt) return null;
  const kind = resolveMcpMediaKind(state.mcpMediaKind);
  const ratio = normalizeMcpRatio(state.mcpRatio);
  return {
    provider,
    kind,
    prompt,
    model: state.mcpModel ?? undefined,
    // 030: MCP-specific ratio; Auto (null) omits the key entirely so the
    // upstream model applies its own default.
    ...(ratio ? { ratio } : {}),
    startFrameFilename: kind === "video" ? state.currentImageFilename ?? undefined : undefined,
    ...(requestId ? { requestId } : {}),
  };
}
