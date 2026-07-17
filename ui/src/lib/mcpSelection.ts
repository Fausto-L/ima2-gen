// Pure MCP selection helpers (010, devlog/_fin/260716_mcp-model-surface-ui).
// This module must stay free of browser globals so plain Node test harnesses
// can import it directly (see tests/mcp-media-kind-behavior.test.ts).
import type {
  McpGenerateInput,
  McpModelCapabilities,
  McpModelParameter,
  McpPresetValue,
} from "./mcpProviders";

export type McpMediaKind = "image" | "video";

export type McpReferenceItem = {
  filename: string;
  tag?: string;
  /** Client-only source. The store replaces this with a temp gallery filename before generation. */
  dataUrl?: string;
  displayName?: string;
};
export type McpReferenceSelection = {
  startFrameFilename: string | null;
  endFrameFilename: string | null;
  references: McpReferenceItem[];
  referenceVideoFilename: string | null;
};

export function emptyMcpReferenceSelection(): McpReferenceSelection {
  return {
    startFrameFilename: null,
    endFrameFilename: null,
    references: [],
    referenceVideoFilename: null,
  };
}

const VIDEO_VALUE_PREFIX = "vid:";
const IMAGE_VALUE_PREFIX = "img:";
const MCP_REFERENCE_TAG_PATTERN = /^[\p{L}\p{N}_-]{1,32}$/u;

export function isValidMcpReferenceTag(tag: string): boolean {
  return MCP_REFERENCE_TAG_PATTERN.test(tag);
}

export function hasInvalidMcpReferenceTags(selection: McpReferenceSelection): boolean {
  return selection.references.some((reference) => (
    reference.tag !== undefined && !isValidMcpReferenceTag(reference.tag)
  ));
}

/** Legacy/unknown persisted values normalize to "image". */
export function resolveMcpMediaKind(value: unknown): McpMediaKind {
  return value === "video" ? "video" : "image";
}

export function normalizeMcpRatio(value: unknown): string | null {
  return typeof value === "string" && /^\d{1,3}:\d{1,3}$/.test(value) ? value : null;
}

function isPresetValue(value: unknown): value is McpPresetValue {
  return typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (typeof value === "string" && value.length <= 128);
}

export function normalizeMcpParameters(value: unknown): Record<string, McpPresetValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 24);
  return Object.fromEntries(entries.filter(([name, candidate]) => (
    /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name) && isPresetValue(candidate)
  ))) as Record<string, McpPresetValue>;
}

function parameterAllows(parameter: McpModelParameter, value: McpPresetValue): boolean {
  if (parameter.type === "number" && typeof value !== "number") return false;
  if (parameter.type === "boolean" && typeof value !== "boolean") return false;
  if (parameter.type === "string" && typeof value !== "string") return false;
  if (parameter.type === "string_array") return false;
  if (parameter.options && !parameter.options.includes(value)) return false;
  if (typeof value === "number" && parameter.min !== undefined && value < parameter.min) return false;
  if (typeof value === "number" && parameter.max !== undefined && value > parameter.max) return false;
  return true;
}

export type McpPresetSelection = { ratio: string | null; parameters: Record<string, McpPresetValue> };

export function reconcileMcpPresetSelection(
  capabilities: McpModelCapabilities,
  ratio: unknown,
  parameters: unknown,
): McpPresetSelection {
  const normalizedRatio = normalizeMcpRatio(ratio);
  const previous = normalizeMcpParameters(parameters);
  const next: Record<string, McpPresetValue> = {};
  for (const parameter of capabilities.parameters) {
    const candidate = previous[parameter.name];
    if (candidate !== undefined && parameterAllows(parameter, candidate)) next[parameter.name] = candidate;
    else if (parameter.default !== undefined && parameterAllows(parameter, parameter.default)) next[parameter.name] = parameter.default;
  }
  return {
    ratio: normalizedRatio && capabilities.aspectRatios.includes(normalizedRatio) ? normalizedRatio : null,
    parameters: next,
  };
}

export function defaultMcpPresetSelection(capabilities?: McpModelCapabilities): McpPresetSelection {
  return capabilities ? reconcileMcpPresetSelection(capabilities, null, {}) : { ratio: null, parameters: {} };
}

export function sameMcpPresetSelection(a: McpPresetSelection, b: McpPresetSelection): boolean {
  return a.ratio === b.ratio && JSON.stringify(a.parameters) === JSON.stringify(b.parameters);
}

function normalizeMcpReferenceItem(value: unknown): McpReferenceItem | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { filename?: unknown; tag?: unknown; dataUrl?: unknown; displayName?: unknown };
  if (typeof candidate.filename !== "string" || candidate.filename.length === 0) return null;
  const tag = typeof candidate.tag === "string" ? candidate.tag.slice(0, 128) : "";
  const dataUrl = typeof candidate.dataUrl === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(candidate.dataUrl)
    ? candidate.dataUrl
    : null;
  const displayName = typeof candidate.displayName === "string" && candidate.displayName
    ? candidate.displayName.slice(0, 180)
    : null;
  return {
    filename: candidate.filename,
    ...(tag ? { tag } : {}),
    ...(dataUrl ? { dataUrl } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

export function normalizeMcpReferenceSelection(value: unknown): McpReferenceSelection {
  if (!value || typeof value !== "object") return emptyMcpReferenceSelection();
  const candidate = value as Partial<McpReferenceSelection>;
  const references = Array.isArray(candidate.references)
    ? candidate.references.map(normalizeMcpReferenceItem).filter((item): item is McpReferenceItem => Boolean(item))
    : [];
  return {
    startFrameFilename: typeof candidate.startFrameFilename === "string" && candidate.startFrameFilename
      ? candidate.startFrameFilename
      : null,
    endFrameFilename: typeof candidate.endFrameFilename === "string" && candidate.endFrameFilename
      ? candidate.endFrameFilename
      : null,
    references: references.filter((item, index) => (
      references.findIndex((candidateItem) => candidateItem.filename === item.filename) === index
    )).slice(0, 3),
    referenceVideoFilename: typeof candidate.referenceVideoFilename === "string" && candidate.referenceVideoFilename
      ? candidate.referenceVideoFilename
      : null,
  };
}

export function reconcileMcpReferenceSelection(
  inputRoles: readonly string[],
  value: unknown,
): McpReferenceSelection {
  const selection = normalizeMcpReferenceSelection(value);
  const startFrameFilename = inputRoles.includes("start_image") ? selection.startFrameFilename : null;
  return {
    startFrameFilename,
    endFrameFilename: inputRoles.includes("end_image") && startFrameFilename
      ? selection.endFrameFilename
      : null,
    references: inputRoles.includes("image_references") ? selection.references : [],
    referenceVideoFilename: inputRoles.includes("video_references")
      ? selection.referenceVideoFilename
      : null,
  };
}

export function sameMcpReferenceSelection(a: McpReferenceSelection, b: McpReferenceSelection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type McpSelection = {
  provider: string | null;
  model: string | null;
  kind: McpMediaKind;
  ratio: string | null;
  parameters: Record<string, McpPresetValue>;
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
  mcpParameters?: unknown;
}): McpSelection {
  return {
    provider: typeof defaults.mcpProvider === "string" ? defaults.mcpProvider : null,
    model: typeof defaults.mcpModel === "string" ? defaults.mcpModel : null,
    kind: resolveMcpMediaKind(defaults.mcpMediaKind),
    ratio: normalizeMcpRatio(defaults.mcpRatio),
    parameters: normalizeMcpParameters(defaults.mcpParameters),
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
  mcpParameters?: Record<string, McpPresetValue>;
  /** Filename of the currently viewed image, used as the video start frame. */
  currentImageFilename?: string | null;
  /** Declared roles for the selected model; omitted only for legacy callers. */
  mcpInputRoles?: readonly string[];
  /** Explicit gallery/history attachments selected in the MCP slots. */
  mcpReferenceSelection?: McpReferenceSelection;
  /** Tagged references from @element mentions; tag = @alias in the prompt. */
  elementReferences?: Array<{ filename: string; tag?: string }>;
};

/** Sanitizes an element name into a Runway-style @tag alias. */
export function mcpReferenceTag(name: string): string | null {
  const tag = name.normalize("NFKC").replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 32);
  return tag.length > 0 ? tag : null;
}

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
  const parameters = normalizeMcpParameters(state.mcpParameters);
  const hasExplicitSelection = state.mcpReferenceSelection !== undefined;
  const inputRoles = state.mcpInputRoles;
  const allows = (role: string) => inputRoles === undefined || inputRoles.includes(role);
  const selected = normalizeMcpReferenceSelection(state.mcpReferenceSelection);
  const startFrameFilename = hasExplicitSelection
    ? (allows("start_image") ? selected.startFrameFilename : null)
    : (kind === "video" ? state.currentImageFilename ?? null : null);
  const selectedReferences = hasExplicitSelection && allows("image_references") ? selected.references : [];
  const elementReferences = allows("image_references") ? state.elementReferences ?? [] : [];
  const references = [...selectedReferences, ...elementReferences]
    .map(normalizeMcpReferenceItem)
    .filter((entry): entry is McpReferenceItem => Boolean(entry))
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.filename === entry.filename) === index)
    .slice(0, 3);
  if (references.some((entry) => entry.dataUrl || (entry.tag !== undefined && !isValidMcpReferenceTag(entry.tag)))) {
    return null;
  }
  const endFrameFilename = hasExplicitSelection && allows("end_image") && startFrameFilename
    ? selected.endFrameFilename
    : null;
  const referenceVideoFilename = hasExplicitSelection && allows("video_references")
    ? selected.referenceVideoFilename
    : null;
  return {
    provider,
    kind,
    prompt,
    model: state.mcpModel ?? undefined,
    // 030: MCP-specific ratio; Auto (null) omits the key entirely so the
    // upstream model applies its own default.
    ...(ratio ? { ratio } : {}),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    startFrameFilename: startFrameFilename ?? undefined,
    ...(endFrameFilename ? { endFrameFilename } : {}),
    ...(references.length > 0 ? { references: references.map(({ filename, tag }) => ({ filename, ...(tag ? { tag } : {}) })) } : {}),
    ...(referenceVideoFilename ? { referenceVideoFilename } : {}),
    ...(requestId ? { requestId } : {}),
  };
}
