import type { Provider, Quality, SizePreset, Format, Moderation, ImageModel, Count } from "../types";
import type { ReasoningEffort } from "../lib/reasoning";
import { DEFAULT_IMAGE_MODEL, GROK_VIDEO_MODEL_15, isGrokImageModel, isGeminiImageModel, normalizeVideoModelValue } from "../lib/imageModels";
import { parseRequestedCustomSide } from "../lib/size";
import { getEffectiveVideoSourceCount } from "../lib/videoSourceCount";
import {
  composePrompt,
  loadMcpSelection,
  saveImageModel,
  saveMcpSelection,
  saveReasoningEffort,
  saveWebSearchEnabled,
  saveVideoDefaults,
  saveGenerationDefaultsPatch,
  normalizeCount,
} from "./storePersistence";
import type { StoreSet, StoreGet } from "./storeTypes";
import { startMcpGeneration, type McpModelCapabilities, type McpPresetValue } from "../lib/mcpProviders";
import {
  buildMcpGenerationInput,
  defaultMcpPresetSelection,
  mcpReferenceTag,
  reconcileMcpPresetSelection,
  sameMcpPresetSelection,
  type McpMediaKind,
} from "../lib/mcpSelection";
import { t } from "../i18n";

let coreGenerateAction: ReturnType<StoreGet>["generate"] | null = null;

async function runMcpGenerate(get: StoreGet): Promise<void> {
  const state = get();
  // Higgsfield generation stays locked on the free plan (040): pre-block in the
  // client so no request is sent; the server adapter also rejects (double guard).
  if (state.mcpProvider === "higgsfield") {
    get().showToast(t("mcp.higgsfieldLocked"), true);
    return;
  }
  const prompt = composePrompt(state.prompt, state.insertedPrompts);
  // @element mentions: map selected element assets to tagged references
  // (Runway multi-reference syntax). tag = sanitized element name, so the
  // prompt can address each image as @tag; the server uploads the files and
  // forwards provider-hosted URLs via the model's image_references role.
  const selectedIds: string[] = (state as unknown as { selectedElementIds?: string[] }).selectedElementIds ?? [];
  const elementReferences = selectedIds
    .map((id) => state.assets.find((asset) => asset.id === id))
    .flatMap((asset) => {
      const refs = (asset?.metadata as { refs?: unknown } | undefined)?.refs;
      if (!Array.isArray(refs)) return [];
      const tag = asset?.name ? mcpReferenceTag(asset.name) : null;
      return refs
        .filter((ref): ref is string => typeof ref === "string")
        .map((filename) => ({ filename, ...(tag ? { tag } : {}) }));
    })
    .slice(0, 3);
  const input = buildMcpGenerationInput(
    {
      mcpProvider: state.mcpProvider,
      mcpModel: state.mcpModel,
      mcpMediaKind: state.mcpMediaKind,
      mcpRatio: state.mcpRatio,
      mcpParameters: state.mcpParameters,
      currentImageFilename: state.currentImage?.filename ?? null,
      ...(elementReferences.length > 0 ? { elementReferences } : {}),
    },
    prompt,
    `mcp_ui_${Date.now()}`,
  );
  if (!input) return;
  try {
    await startMcpGeneration(input, {
      onDone: () => get().hydrateHistory(),
      onError: () => get().showToast(t("mcp.generateFailed"), true),
    });
    await get().reconcileInflight();
    get().startInFlightPolling();
  } catch (error) {
    const code = (error as { code?: string }).code;
    get().showToast(
      code === "MCP_NOT_CONNECTED" || code === "MCP_PROVIDER_UNKNOWN"
        ? t("mcp.selectionUnavailable")
        : t("mcp.generateFailed"),
      true,
    );
  }
}

function clearMcpLane(set: StoreSet): void {
  saveMcpSelection(null, null, "image");
  // Persisted clear-to-Auto: an in-memory reset alone would leave a stale
  // stored ratio behind (audit R3-1).
  saveGenerationDefaultsPatch({ mcpRatio: null, mcpParameters: {} });
  set({
    mcpProvider: null,
    mcpModel: null,
    mcpMediaKind: "image",
    mcpRatio: null,
    mcpParameters: {},
    ...(coreGenerateAction ? { generate: coreGenerateAction } : {}),
  });
}

export function setMcpProviderImpl(
  mcpProvider: string | null,
  set: StoreSet,
  get: StoreGet,
  persistedModel: string | null = null,
  persistedKind?: McpMediaKind,
): void {
  if (!mcpProvider) {
    clearMcpLane(set);
    return;
  }
  if (!coreGenerateAction) coreGenerateAction = get().generate;
  const mcpModel = get().mcpProvider === mcpProvider
    ? get().mcpModel ?? persistedModel
    : persistedModel;
  // Live provider switches (persistedKind omitted) preserve the current kind;
  // only hydration passes the stored value explicitly (audit R2-4).
  const mcpMediaKind: McpMediaKind = persistedKind ?? get().mcpMediaKind ?? "image";
  const switchingProvider = get().mcpProvider !== mcpProvider;
  saveMcpSelection(mcpProvider, mcpModel, mcpMediaKind);
  saveGenerationDefaultsPatch({
    count: 1,
    multimode: false,
    ...(switchingProvider ? { mcpRatio: null, mcpParameters: {} } : {}),
  });
  set({
    mcpProvider,
    mcpModel,
    mcpMediaKind,
    ...(switchingProvider ? { mcpRatio: null, mcpParameters: {} } : {}),
    count: 1,
    multimode: false,
    generate: () => runMcpGenerate(get),
  });
}

export function setMcpModelImpl(mcpModel: string | null, set: StoreSet, get: StoreGet): void {
  saveMcpSelection(get().mcpProvider ?? null, mcpModel, get().mcpMediaKind ?? "image");
  saveGenerationDefaultsPatch({ mcpRatio: null, mcpParameters: {} });
  set({ mcpModel, mcpRatio: null, mcpParameters: {} });
}

export function setMcpModelWithKindImpl(
  mcpModel: string,
  kind: McpMediaKind,
  set: StoreSet,
  get: StoreGet,
  capabilities?: McpModelCapabilities,
): void {
  const presets = defaultMcpPresetSelection(capabilities);
  saveMcpSelection(get().mcpProvider ?? null, mcpModel, kind);
  saveGenerationDefaultsPatch({ mcpRatio: presets.ratio, mcpParameters: presets.parameters });
  set({ mcpModel, mcpMediaKind: kind, mcpRatio: presets.ratio, mcpParameters: presets.parameters });
}

export function setMcpMediaKindImpl(kind: McpMediaKind, set: StoreSet, get: StoreGet): void {
  if ((get().mcpMediaKind ?? "image") === kind) return;
  // Switching kind invalidates the previous kind's model selection.
  saveMcpSelection(get().mcpProvider ?? null, null, kind);
  saveGenerationDefaultsPatch({ mcpRatio: null, mcpParameters: {} });
  set({ mcpMediaKind: kind, mcpModel: null, mcpRatio: null, mcpParameters: {} });
}

export function setMcpRatioImpl(ratio: string | null, set: StoreSet): void {
  saveGenerationDefaultsPatch({ mcpRatio: ratio });
  set({ mcpRatio: ratio });
}

export function setMcpParameterImpl(
  name: string,
  value: McpPresetValue | null,
  set: StoreSet,
  get: StoreGet,
): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)) return;
  const parameters = { ...(get().mcpParameters ?? {}) };
  if (value === null) delete parameters[name];
  else parameters[name] = value;
  saveGenerationDefaultsPatch({ mcpParameters: parameters });
  set({ mcpParameters: parameters });
}

/** Called once by the sidebar catalog completion event. It is deliberately not
 * a state-watching effect, and writes only when persisted values are stale. */
export function reconcileMcpPresetStateImpl(
  capabilities: McpModelCapabilities,
  set: StoreSet,
  get: StoreGet,
): void {
  const current = { ratio: get().mcpRatio ?? null, parameters: get().mcpParameters ?? {} };
  const next = reconcileMcpPresetSelection(capabilities, current.ratio, current.parameters);
  if (sameMcpPresetSelection(current, next)) return;
  saveGenerationDefaultsPatch({ mcpRatio: next.ratio, mcpParameters: next.parameters });
  set({ mcpRatio: next.ratio, mcpParameters: next.parameters });
}

export function hydrateMcpSelectionImpl(set: StoreSet, get: StoreGet): void {
  const selection = loadMcpSelection();
  if (selection.provider) {
    setMcpProviderImpl(selection.provider, set, get, selection.model, selection.kind);
    saveGenerationDefaultsPatch({ mcpRatio: selection.ratio, mcpParameters: selection.parameters });
    set({ mcpRatio: selection.ratio, mcpParameters: selection.parameters });
  }
}

export function setProviderImpl(provider: Provider, set: StoreSet, get: StoreGet): void {
  clearMcpLane(set);
  saveGenerationDefaultsPatch({ provider });
  const currentModel = get().imageModel;
  const supportsVideo = provider === "grok" || provider === "grok-api";
  if (!supportsVideo && get().videoModelSelected) {
    set({ videoModelSelected: false });
    saveVideoDefaults({ model: false });
  }
  if ((provider === "grok" || provider === "grok-api") && !isGrokImageModel(currentModel)) {
    const grokModel = "grok-imagine-image-quality";
    saveImageModel(grokModel);
    set({ provider, imageModel: grokModel });
  } else if ((provider === "agy" || provider === "gemini-api") && !isGeminiImageModel(currentModel)) {
    const geminiModel = provider === "gemini-api" ? "nano-banana-pro" : "nano-banana-2";
    saveImageModel(geminiModel);
    set({ provider, imageModel: geminiModel });
  } else if (provider !== "grok" && provider !== "grok-api" && provider !== "agy" && provider !== "gemini-api" && (isGrokImageModel(currentModel) || isGeminiImageModel(currentModel))) {
    set({ provider, imageModel: DEFAULT_IMAGE_MODEL });
    saveImageModel(DEFAULT_IMAGE_MODEL);
  } else {
    set({ provider });
  }
}

export function setQualityImpl(quality: Quality, set: StoreSet): void {
  saveGenerationDefaultsPatch({ quality });
  set({ quality });
}

export function setSizePresetImpl(sizePreset: SizePreset, set: StoreSet): void {
  saveGenerationDefaultsPatch({ sizePreset });
  set({ sizePreset });
}

export function setCustomSizeImpl(w: number, h: number, set: StoreSet, get: StoreGet): void {
  const customW = parseRequestedCustomSide(w, get().customW);
  const customH = parseRequestedCustomSide(h, get().customH);
  saveGenerationDefaultsPatch({ customW, customH });
  set({ customW, customH });
}

export function setGrokAspectRatioImpl(grokAspectRatio: string, set: StoreSet): void {
  saveGenerationDefaultsPatch({ grokAspectRatio } as any);
  set({ grokAspectRatio });
}

export function setGrokResolutionImpl(grokResolution: "1k" | "2k", set: StoreSet): void {
  saveGenerationDefaultsPatch({ grokResolution } as any);
  set({ grokResolution });
}

export function setFormatImpl(format: Format, set: StoreSet): void {
  saveGenerationDefaultsPatch({ format });
  set({ format });
}

export function setModerationImpl(moderation: Moderation, set: StoreSet): void {
  saveGenerationDefaultsPatch({ moderation });
  set({ moderation });
}

export function setImageModelImpl(imageModel: ImageModel, set: StoreSet, get: StoreGet): void {
  clearMcpLane(set);
  saveImageModel(imageModel);
  set({ videoModelSelected: false });
  saveVideoDefaults({ model: false });
  if (isGrokImageModel(imageModel)) {
    saveGenerationDefaultsPatch({ provider: "grok" });
    set({ provider: "grok", imageModel });
    return;
  }
  if (isGeminiImageModel(imageModel)) {
    const current = get().provider;
    if (current !== "agy" && current !== "gemini-api") {
      saveGenerationDefaultsPatch({ provider: "agy" });
      set({ provider: "agy", imageModel });
    } else {
      set({ imageModel });
    }
    return;
  }
  if (get().provider === "grok" || get().provider === "agy" || get().provider === "gemini-api") {
    saveGenerationDefaultsPatch({ provider: "oauth" });
    set({ provider: "oauth", imageModel });
    return;
  }
  set({ imageModel });
}

export function selectVideoModelImpl(model: string | undefined, set: StoreSet, get: StoreGet): void {
  clearMcpLane(set);
  const m = normalizeVideoModelValue(model) || GROK_VIDEO_MODEL_15;
  set({ videoModelSelected: m });
  saveVideoDefaults({ model: m });
  if (get().provider !== "grok") get().setProvider("grok");
}

export function activeVideoRefCountImpl(get: StoreGet): number {
  return getEffectiveVideoSourceCount(get());
}

export function setReasoningEffortImpl(reasoningEffort: ReasoningEffort, set: StoreSet): void {
  saveReasoningEffort(reasoningEffort);
  set({ reasoningEffort });
}

export function setWebSearchEnabledImpl(webSearchEnabled: boolean, set: StoreSet): void {
  saveWebSearchEnabled(webSearchEnabled);
  set({ webSearchEnabled });
}

export function setCountImpl(count: Count, set: StoreSet): void {
  const next = normalizeCount(count);
  saveGenerationDefaultsPatch({ count: next });
  set({ count: next });
}

export function setMultimodeImpl(enabled: boolean, set: StoreSet, get: StoreGet): void {
  if (enabled && get().uiMode !== "classic") return;
  saveGenerationDefaultsPatch({ multimode: enabled });
  const s = get();
  set({
    multimode: enabled,
    multimodeSequences: enabled ? s.multimodeSequences : {},
    multimodePreviewFlightId: enabled ? s.multimodePreviewFlightId : null,
  });
}

export function setMultimodeMaxImagesImpl(count: Count, set: StoreSet): void {
  const next = normalizeCount(count);
  saveGenerationDefaultsPatch({ multimodeMaxImages: next });
  set({ multimodeMaxImages: next });
}

export function setPromptModeImpl(promptMode: "auto" | "direct", set: StoreSet): void {
  saveGenerationDefaultsPatch({ promptMode });
  set({ promptMode });
}

export function setPromptImpl(prompt: string, set: StoreSet): void {
  saveGenerationDefaultsPatch({ prompt });
  set({ prompt });
}

export function getResolvedSizeImpl(get: StoreGet): string {
  const { provider, sizePreset, customW, customH, grokAspectRatio, grokResolution } = get();
  if (provider === "grok" || provider === "grok-api") {
    return `grok:${grokAspectRatio}:${grokResolution}`;
  }
  return sizePreset === "custom" ? `${customW}x${customH}` : sizePreset;
}
