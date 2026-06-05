// All localStorage keys this store touches MUST be listed in
// ./persistenceRegistry.ts. The contract test
// tests/settings-persistence-contract.test.js enforces this invariant.
// Legacy generation-controls contract: GENERATION_DEFAULTS_STORAGE_KEY = "ima2.generationDefaults".
import { create } from "zustand";
import type { CanvasExportBackground, HexColor } from "../types/canvas";
import type {
  Count,
  ComposerInsertedPromptSnapshot,
  Format,
  GenerateItem,
  GenerateResponse,
  HistoryStripLayout,
  EmbeddedGenerationMetadata,
  ImageModel,
  Moderation,
  MultimodeGenerateResponse,
  MultimodeSequenceStatus,
  Provider,
  Quality,
  ResolvedTheme,
  SettingsSection,
  SizePreset,
  ThemeFamily,
  ThemePreference,
  UIMode,
  VideoResolutionUI,
  VideoContinuityLineage,
} from "../types";
import { THEME_FAMILIES } from "../types";
import { isMultiResponse } from "../types";
import {
  postGenerate,
  postMultimodeGenerateStream,
  getHistory,
  getInflight,
  cancelInflight,
  postNodeGenerateStream,
  postVideoGenerateStream,
  listSessions as apiListSessions,
  createSession as apiCreateSession,
  getSession as apiGetSession,
  renameSession as apiRenameSession,
  deleteSession as apiDeleteSession,
  saveSessionGraph,
  readImageMetadata,
  getBrowserId,
  deleteHistoryItem,
  restoreHistoryItem,
  permanentlyDeleteHistoryItem,
  getPromptLibrary,
  createPrompt,
  deletePrompt,
  togglePromptFavorite,
  toggleGalleryFavorite,
  importPromptLibrary,
  importLocalImage,
  type HistoryCursor,
  type SessionSummary,
  type SessionFull,
  type SessionGraphEdge,
} from "../lib/api";
import { compressImage, readFileAsDataURL } from "../lib/image";
import { compressToBase64, isHeic, hasAlphaChannel } from "../lib/compress";
import {
  normalizeCustomSizePairDetailed,
  parseRequestedCustomSide,
  type CustomSizeAdjustmentReason,
} from "../lib/size";
import {
  DEFAULT_IMAGE_MODEL,
  isGrokImageModel,
  isGeminiImageModel,
  isImageModel,
  deriveVideoModeUI,
  clampVideoDurationUI,
} from "../lib/imageModels";
import {
  DEFAULT_REASONING_EFFORT,
  isReasoningEffort,
  type ReasoningEffort,
} from "../lib/reasoning";
import {
  DEFAULT_WEB_SEARCH_ENABLED,
} from "../lib/webSearch";
import {
  ACTIVE_SESSION_ID_STORAGE_KEY,
  CANVAS_EXPORT_BG_KEY,
  GALLERY_DEFAULT_SCOPE_STORAGE_KEY,
  GALLERY_SCOPE_STORAGE_KEY,
  GENERATION_DEFAULTS_STORAGE_KEY,
  GRAPH_TAB_ID_KEY,
  HISTORY_STRIP_LAYOUT_STORAGE_KEY,
  IMAGE_MODEL_STORAGE_KEY,
  IN_FLIGHT_STORAGE_KEY,
  REASONING_EFFORT_STORAGE_KEY,
  RIGHT_PANEL_OPEN_STORAGE_KEY,
  SELECTED_FILENAME_STORAGE_KEY,
  THEME_FAMILY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  UI_MODE_STORAGE_KEY,
  VIDEO_DEFAULTS_STORAGE_KEY,
  WEB_SEARCH_STORAGE_KEY,
} from "./persistenceRegistry";
import { newClientNodeId, type ClientNodeId } from "../lib/graph";
import {
  deriveParentServerNodeIds,
  wouldCreateMultipleIncomingEdge,
} from "../lib/nodeGraph";
import { getNextChildPosition, getNextRootPosition } from "../lib/nodeLayout";
import {
  clearNodeRefs as clearStoredNodeRefs,
  loadNodeRefs,
  pruneNodeRefs,
  saveNodeRefs,
} from "../lib/nodeRefStorage";
import {
  applyComponentSelection,
  applySelectedNodeIds,
  getSelectedNodeIds,
} from "../lib/nodeSelection";
import {
  getDirectUnselectedChildren,
  getUnselectedDownstreamIds,
  nodeHasImage,
  topologicalSortSelected,
  validateBatchDependencies,
  type NodeBatchMode,
} from "../lib/nodeBatch";
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react";
import { t, loadLocale, saveLocale, type Locale } from "../i18n";
import type { ImaErrorCode } from "../lib/errorCodes";
import { handleError } from "../lib/errorHandler";
import { ENABLE_AGENT_MODE, ENABLE_CARD_NEWS_MODE, ENABLE_NODE_MODE } from "../lib/devMode";
import {
  getNeighborAfterRemoval,
  getShortcutTarget,
  getVisibleGalleryItems,
  resolveVisibleShortcutCurrent,
  type GalleryShortcutAction,
} from "../lib/galleryShortcuts";
import { compareSequenceItems, getSidebarHistoryShortcutTarget } from "../lib/history/sidebarHistory";
import { resolveWorkspaceSettings } from "../lib/workspaceProfile";
import { isVideoUrl, isVideoItem, extractLastFrame } from "../lib/videoMedia";
import { releaseOrphanedPreview } from "../lib/multimodeSequences";
import { ACTIVE_VIDEO_PROMPT_GUIDANCE, buildVideoContinuityFromItem } from "../lib/videoContinuity";
import {
  type InsertedPrompt,
  composePrompt,
  normalizeInsertedPrompt,
  normalizeInsertedPromptArray,
  cloneInsertedPrompts,
  getHistoryComposerPatch,
  loadRightPanelOpen,
  loadUIMode,
  loadThemePreference,
  loadThemeFamily,
  loadHistoryStripLayout,
  loadGalleryScope,
  loadCanvasExportBackground,
  persistCanvasExportBackground,
  loadImageModel,
  saveImageModel,
  loadReasoningEffort,
  saveReasoningEffort,
  loadWebSearchEnabled,
  saveWebSearchEnabled,
  type VideoDefaults,
  loadVideoDefaults,
  saveVideoDefaults,
  resolveThemePreference,
  loadSelectedFilename,
  saveSelectedFilename,
  loadActiveSessionId,
  saveActiveSessionId,
  formatSize,
  normalizeCount,
  SIZE_PRESET_VALUES,
  parseMetadataSize,
  isQuality,
  isFormat,
  isModeration,
  isProvider,
  isPromptMode,
  isSizePreset,
  type GenerationDefaults,
  loadGenerationDefaults,
  saveGenerationDefaultsPatch,
} from "./storePersistence";
import {
  type PersistedInFlight,
  INFLIGHT_TTL_MS,
  type ServerInFlightJob,
  type ServerTerminalJob,
  type InflightQueryScope,
  getInflightQueryScopes,
  matchesInflightScope,
  fetchInflightScopes,
  toPersistedInFlightJob,
  terminalJobError,
  isCanceledGenerationError,
  multimodeImageKey,
  mergeMultimodeImages,
  loadInFlight,
  HISTORY_LIMIT,
  MAX_REFERENCE_IMAGES,
  type GraphSaveReason,
  type GraphSaveResult,
  narrowGenerateKind,
  mapHistoryItem,
  historyKey,
  withoutHistoryDuplicate,
  findHistoryDuplicate,
  preserveHistoryMetadata,
  mergeHistoryItems,
  retainHistoryItems,
  stripDataUrlPrefix,
  compressReferenceSource,
  type MultimodeSequenceState,
  removeImageFromMultimodeSequences,
} from "./storeHelpers";

export type { GalleryScope, ComposeSheetTab, ImageNodeStatus, ImageNodeData, GraphNode, GraphEdge, MultimodeSequenceState } from "./storeTypes";
import type { AppState, ToastEntry, ToastState, ErrorCardEntry, TrashPendingState, CustomSizeConfirmState, MetadataRestoreState, ComposeSheetTab } from "./storeTypes";

const nodeGenerationLocks = new Set<string>();

function saveInFlight(list: PersistedInFlight[]): void {
  try {
    localStorage.setItem(IN_FLIGHT_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // Quota exceeded or storage disabled. Notify the user once per tab.
    const w = window as unknown as { __ima2QuotaWarned?: boolean };
    if (!w.__ima2QuotaWarned) {
      w.__ima2QuotaWarned = true;
      console.warn("[ima2] localStorage write failed:", err);
      try {
        useAppStore.getState().showToast(t("toast.localStorageFull"), true);
      } catch {}
    }
  }
}



import type { ImageNodeStatus, ImageNodeData, GraphNode, GraphEdge } from "./storeTypes";

const DEFAULT_CHILD_SOURCE_HANDLE = "source-right";
const DEFAULT_CHILD_TARGET_HANDLE = "target-left";

function newGraphEdgeId(
  sourceClientId: ClientNodeId,
  targetClientId: ClientNodeId,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): string {
  const sourceAnchor = sourceHandle ?? "auto";
  const targetAnchor = targetHandle ?? "auto";
  return `${sourceClientId}:${sourceAnchor}->${targetClientId}:${targetAnchor}`;
}

function normalizeNodeHandleId(
  handleId: string | null | undefined,
  type: "source" | "target",
): string | null {
  if (!handleId) return null;
  return handleId.startsWith(`${type}-`) ? handleId : null;
}

function getOppositeTargetHandle(sourceHandle?: string | null): string | null {
  switch (sourceHandle) {
    case "source-top":
      return "target-bottom";
    case "source-right":
      return "target-left";
    case "source-bottom":
      return "target-top";
    case "source-left":
      return "target-right";
    default:
      return null;
  }
}

function mapSessionToGraph(session: SessionFull): {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  graphVersion: number;
} {
  const graphNodes: GraphNode[] = session.nodes.map((n) => {
    const d = (n.data ?? {}) as Partial<ImageNodeData>;
    const explicitImageUrl =
      typeof d.imageUrl === "string" && d.imageUrl.length > 0 ? d.imageUrl : null;
    const fallbackImageUrl =
      typeof d.serverNodeId === "string" && d.serverNodeId.length > 0
        ? `/generated/${d.serverNodeId}.png`
        : null;
    const imageUrl = explicitImageUrl ?? fallbackImageUrl;
    const data: ImageNodeData = {
      clientId: n.id as ClientNodeId,
      serverNodeId: (d.serverNodeId ?? null) as string | null,
      parentServerNodeId: (d.parentServerNodeId ?? null) as string | null,
      prompt: typeof d.prompt === "string" ? d.prompt : "",
      imageUrl,
      status: (d.status ?? (imageUrl ? "ready" : "empty")) as ImageNodeStatus,
      pendingRequestId: (d.pendingRequestId ?? null) as string | null,
      recoveryRequestId: (d.recoveryRequestId ?? null) as string | null,
      pendingPhase: (d.pendingPhase ?? null) as string | null,
      pendingStartedAt:
        typeof d.pendingStartedAt === "number" ? d.pendingStartedAt : null,
      partialImageUrl: null,
      error: d.error as string | undefined,
      elapsed: d.elapsed as number | undefined,
      reasoningEffort: d.reasoningEffort as ImageNodeData["reasoningEffort"] | undefined,
      webSearchCalls: d.webSearchCalls as number | undefined,
      model: (d.model ?? null) as string | null,
      size: (d.size ?? null) as string | null,
      referenceImages: loadNodeRefs(session.id, n.id),
      video: (d.video ?? null) as ImageNodeData["video"],
    };
    return {
      id: n.id,
      type: "imageNode",
      position: { x: n.x, y: n.y },
      data,
    };
  });
  const graphEdges: GraphEdge[] = session.edges.map((e) => {
    const data = (e.data ?? {}) as Record<string, unknown>;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: typeof data.sourceHandle === "string" ? data.sourceHandle : null,
      targetHandle: typeof data.targetHandle === "string" ? data.targetHandle : null,
    };
  });
  return {
    graphNodes: deriveParentServerNodeIds(graphNodes, graphEdges),
    graphEdges,
    graphVersion: session.graphVersion,
  };
}

function getActiveSidebarSequenceId(
  state: Pick<AppState, "multimodePreviewFlightId" | "multimodeSequences">,
): string | null {
  const id = state.multimodePreviewFlightId;
  if (!id) return null;
  if (id.startsWith("history:")) return id.slice("history:".length);
  return state.multimodeSequences[id]?.sequenceId ?? null;
}


function applyMetadataToState(
  state: AppState,
  metadata: EmbeddedGenerationMetadata,
): Partial<AppState> {
  const patch: Partial<AppState> = {};
  const prompt = metadata.userPrompt || metadata.prompt;
  if (typeof prompt === "string") patch.prompt = prompt;
  if (isQuality(metadata.quality)) patch.quality = metadata.quality;
  if (isFormat(metadata.format)) patch.format = metadata.format;
  if (isModeration(metadata.moderation)) patch.moderation = metadata.moderation;
  if (metadata.promptMode === "auto" || metadata.promptMode === "direct") {
    patch.promptMode = metadata.promptMode;
  }
  if (metadata.model && isImageModel(metadata.model)) {
    patch.imageModel = metadata.model;
  }
  const size = parseMetadataSize(metadata.size);
  if (size.preset) patch.sizePreset = size.preset;
  if (size.preset === "custom" && size.w && size.h) {
    patch.customW = parseRequestedCustomSide(size.w, state.customW);
    patch.customH = parseRequestedCustomSide(size.h, state.customH);
  }
  return patch;
}

function getCustomSizeConfirmation(
  state: AppState,
  continuation: NonNullable<CustomSizeConfirmState>["continuation"],
): CustomSizeConfirmState {
  // GPT-image pixel limits don't apply to Grok/Gemini — they have their own size systems.
  if (state.provider === "grok" || state.provider === "grok-api" || state.provider === "agy" || state.provider === "gemini-api") return null;
  if (state.sizePreset !== "custom") return null;
  const result = normalizeCustomSizePairDetailed(
    state.customW,
    state.customH,
    state.customW,
    state.customH,
  );
  if (!result.adjusted) return null;
  return {
    requestedW: result.requestedW,
    requestedH: result.requestedH,
    adjustedW: result.w,
    adjustedH: result.h,
    reasons: result.reasons,
    continuation,
  };
}

const storedGenerationDefaults = loadGenerationDefaults();
const storedImageModel = loadImageModel();
const storedVideoDefaults = loadVideoDefaults();
const initialProvider =
  storedVideoDefaults.model ? "grok" :
  isGrokImageModel(storedImageModel) ? "grok" : (storedGenerationDefaults.provider ?? "oauth") === "grok" ? "oauth" : (storedGenerationDefaults.provider ?? "oauth");

export const useAppStore = create<AppState>((set, get) => ({
  provider: initialProvider,
  quality: storedGenerationDefaults.quality ?? "medium",
  sizePreset: storedGenerationDefaults.sizePreset ?? "1024x1024",
  customW: storedGenerationDefaults.customW ?? 1920,
  customH: storedGenerationDefaults.customH ?? 1088,
  grokAspectRatio: (storedGenerationDefaults as any).grokAspectRatio ?? "1:1",
  grokResolution: (storedGenerationDefaults as any).grokResolution ?? "1k",
  format: storedGenerationDefaults.format ?? "png",
  moderation: storedGenerationDefaults.moderation ?? "low",
  count: storedGenerationDefaults.count ?? 1,
  multimode: storedGenerationDefaults.multimode ?? false,
  multimodeMaxImages: storedGenerationDefaults.multimodeMaxImages ?? 4,
  multimodeSequences: {},
  multimodeAbortControllers: {},
  multimodePreviewFlightId: null,
  promptMode: storedGenerationDefaults.promptMode ?? "auto",
  prompt: storedGenerationDefaults.prompt ?? "",
  insertedPrompts: storedGenerationDefaults.insertedPrompts ?? [],
  referenceImages: [],
  canvasReferenceImage: null,

  // Workspace Profile
  workspaceProfile: ((): import("../lib/workspaceProfile").WorkspaceProfile => {
    try { const v = localStorage.getItem("ima2.workspaceProfile"); return v === "prompt-studio" ? "prompt-studio" : "default"; } catch { return "default"; }
  })(),

  // Prompt Builder panel
  promptBuilderOpen: false,
  storyboardActive: false,

  // Prompt Library state (0.23)
  promptLibraryOpen: false,
  promptLibrary: { prompts: [], folders: [] },
  promptLibraryLoading: false,
  galleryFavorites: new Set(),
  browserId: getBrowserId(),

  // Canvas Mode state (0.24)
  canvasOpen: false,
  canvasZoom: 1,
  canvasPanX: 0,
  canvasPanY: 0,
  canvasExportBackground: loadCanvasExportBackground().mode,
  canvasExportMatteColor: loadCanvasExportBackground().matteColor,

  addReferences: async (files) => {
    const allowed = MAX_REFERENCE_IMAGES - get().referenceImages.length;
    const toAdd = files.slice(0, Math.max(0, allowed));
    const heicSkipped = toAdd.filter(isHeic);
    const usable = toAdd.filter((f) => !isHeic(f));
    const results = await Promise.all(
      usable.map(async (f) => {
        try {
          return await compressToBase64(f, {
            preserveTransparency: hasAlphaChannel(f),
          });
        } catch (err) {
          console.warn("[addReferences] compress failed", err);
          return null;
        }
      }),
    );
    const valid = results.filter((x): x is string => !!x);
    set((s) => ({
      referenceImages: [...s.referenceImages, ...valid].slice(0, MAX_REFERENCE_IMAGES),
    }));
    if (heicSkipped.length > 0) {
      get().showToast(t("toast.refHeicUnsupported"), true);
    }
    const failedCount = usable.length - valid.length;
    if (failedCount > 0) {
      get().showToast(t("toast.refTooLarge"), true);
    }
    if (files.length > allowed) {
      get().showToast(t("toast.refLimitExceeded"), true);
    }
  },
  addReferenceDataUrl: (dataUrl) => {
    set((s) =>
      s.referenceImages.length >= MAX_REFERENCE_IMAGES
        ? s
        : { referenceImages: [...s.referenceImages, dataUrl] },
    );
  },
  metadataRestore: null,
  readDroppedImageMetadata: async (file, targetNodeId = null) => {
    if (!file.type.startsWith("image/")) return false;
    let dataUrl = "";
    try {
      dataUrl = await readFileAsDataURL(file);
      const result = await readImageMetadata({ filename: file.name, dataUrl });
      if (!result.metadata) return false;
      set({
        metadataRestore: {
          filename: file.name,
          image: dataUrl,
          metadata: result.metadata,
          source: result.source ?? "xmp",
          targetNodeId,
        },
      });
      return true;
    } catch {
      get().showToast(t("metadata.readFailed"), true);
      return false;
    }
  },
  applyMetadataRestore: () => {
    const pending = get().metadataRestore;
    if (!pending) return;
    const patch = applyMetadataToState(get(), pending.metadata);
    if (patch.imageModel) saveImageModel(patch.imageModel);
    if (pending.targetNodeId && typeof patch.prompt === "string") {
      const prompt = patch.prompt;
      set({
        ...patch,
        metadataRestore: null,
        graphNodes: get().graphNodes.map((n) =>
          n.id === pending.targetNodeId
            ? { ...n, data: { ...n.data, prompt } }
            : n,
        ),
      });
      get().scheduleGraphSave();
    } else {
      set({ ...patch, metadataRestore: null });
    }
    get().showToast(t("metadata.applied"));
  },
  cancelMetadataRestore: () => set({ metadataRestore: null }),
  addMetadataRestoreAsReference: () => {
    const pending = get().metadataRestore;
    if (!pending) return;
    if (pending.targetNodeId) {
      get().addNodeReferenceDataUrl(pending.targetNodeId, pending.image);
    } else {
      get().addReferenceDataUrl(pending.image);
    }
    set({ metadataRestore: null });
  },
  removeReference: (index) => {
    set((s) => {
      const referenceImages = s.referenceImages.filter((_, i) => i !== index);
      const clearContinuity = referenceImages.length === 0;
      const insertedPrompts = clearContinuity
        ? s.insertedPrompts.filter((prompt) => !prompt.id.startsWith("video-continuity:"))
        : s.insertedPrompts;
      if (insertedPrompts.length !== s.insertedPrompts.length) {
        saveGenerationDefaultsPatch({ insertedPrompts });
      }
      return {
        referenceImages,
        insertedPrompts,
        videoContinuityLineage: clearContinuity ? null : s.videoContinuityLineage,
        canvasReferenceImage:
          s.referenceImages[index] === s.canvasReferenceImage ? null : s.canvasReferenceImage,
      };
    });
  },
  clearReferences: () => {
    const insertedPrompts = get().insertedPrompts.filter((prompt) => !prompt.id.startsWith("video-continuity:"));
    if (insertedPrompts.length !== get().insertedPrompts.length) {
      saveGenerationDefaultsPatch({ insertedPrompts });
    }
    set({ referenceImages: [], canvasReferenceImage: null, videoContinuityLineage: null, insertedPrompts });
  },
  attachCanvasVersionReference: async (item) => {
    let dataUrl: string;
    try {
      dataUrl = await compressReferenceSource(
        item.image,
        item.filename || "canvas-version-reference.png",
      );
    } catch {
      get().showToast(t("toast.currentImageLoadFailed"), true);
      throw new Error("canvas_reference_attach_failed");
    }
    set((s) => {
      const withoutPrevious = s.canvasReferenceImage
        ? s.referenceImages.filter((ref) => ref !== s.canvasReferenceImage)
        : s.referenceImages;
      const withoutDuplicate = withoutPrevious.filter((ref) => ref !== dataUrl);
      return {
        canvasReferenceImage: dataUrl,
        referenceImages: [dataUrl, ...withoutDuplicate].slice(0, MAX_REFERENCE_IMAGES),
      };
    });
    get().showToast(t("canvas.version.usingAsReference"));
  },
  useCurrentAsReference: async () => {
    const cur = get().currentImage;
    if (!cur) {
      get().showToast(t("toast.noCurrentImageForRef"), true);
      return;
    }
    if (get().referenceImages.length >= MAX_REFERENCE_IMAGES) {
      get().showToast(t("toast.refSlotFull"), true);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await compressReferenceSource(cur.image, cur.filename || "current-reference.png");
    } catch {
      get().showToast(t("toast.currentImageLoadFailed"), true);
      return;
    }
    set((s) => ({
      referenceImages: [...s.referenceImages, dataUrl].slice(0, MAX_REFERENCE_IMAGES),
    }));
    get().showToast(t("toast.addedCurrentAsRef"));
  },
  useImageAsReference: async (item) => {
    if (get().referenceImages.length >= MAX_REFERENCE_IMAGES) {
      get().showToast(t("toast.refSlotFull"), true);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await compressReferenceSource(item.image, item.filename || "canvas-reference.png");
    } catch {
      get().showToast(t("toast.currentImageLoadFailed"), true);
      return;
    }
    set((s) => ({
      referenceImages: [...s.referenceImages, dataUrl].slice(0, MAX_REFERENCE_IMAGES),
    }));
    get().showToast(t("toast.addedCurrentAsRef"));
  },
  activeGenerations: 0,
  unseenGeneratedCount: 0,
  inFlight: [],
  cancelInFlightJob: async (requestId) => {
    if (!requestId) return;
    set((s) => {
      const next = s.inFlight.map((job) =>
        job.id === requestId ? { ...job, phase: "canceling" } : job,
      );
      saveInFlight(next);
      return { inFlight: next };
    });
    try {
      await cancelInflight(requestId);
      get().startInFlightPolling();
    } catch {
      get().showToast(t("toast.cancelFailed"), true);
    }
  },
  startInFlightPolling: () => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __ima2InflightTimer?: number };
    if (w.__ima2InflightTimer) return;
    const tick = async () => {
      const cur = get().inFlight;
      // Polling backoff: when there are no local jobs to track AND no active
      // generations counter, stop the interval entirely. Polling is restarted
      // from generation entry points (startGeneration / reconcileInflight).
      const shouldStop = cur.length === 0 && get().activeGenerations === 0;
      if (shouldStop) {
        if (w.__ima2InflightTimer) {
          clearInterval(w.__ima2InflightTimer);
          w.__ima2InflightTimer = undefined;
        }
        // Fall through to run one final history fetch so newly completed
        // items are picked up without requiring a manual F5 refresh (#93).
      }
      let scopedActiveServerIds = new Set<string>();
      // Merge server-side phase info so the spinner label reflects real progress.
      // Skip when doing a final grace tick — no jobs to query.
      if (!shouldStop) try {
        const scopes = getInflightQueryScopes(get());
        const { jobs, terminalJobs = [] } = await fetchInflightScopes(scopes);
        scopedActiveServerIds = new Set(jobs.map((j) => j.requestId));
        const byId = new Map(jobs.map((j) => [j.requestId, j] as const));
        const terminalById = new Map((terminalJobs as ServerTerminalJob[]).map((j) => [j.requestId, j] as const));
        const terminalErrors: Array<Error & { code?: string; status?: number }> = [];
        let changed = false;
        const now0 = Date.now();
        const GRACE_MS = 5000;
        const nextInflight: typeof cur = [];
        for (const f of get().inFlight) {
          // Out-of-scope entries (different kind/session) must not be dropped
          // based on this tick's byId — the server wasn't asked about them.
          if (!matchesInflightScope(f, scopes)) {
            nextInflight.push(f);
            continue;
          }
          const terminal = terminalById.get(f.id);
          if (terminal) {
            changed = true;
            if (terminal.status === "error") {
              terminalErrors.push(terminalJobError(terminal));
            }
            continue;
          }
          // If server no longer knows this job and enough time has passed,
          // drop it locally so the spinner does not linger after completion.
          if (!byId.has(f.id) && now0 - f.startedAt > GRACE_MS) {
            changed = true;
            continue;
          }
          const p = byId.get(f.id);
          if (p) {
            const serverJob = toPersistedInFlightJob(p);
            const nextJob = {
              ...f,
              phase: serverJob.phase,
              sessionId: serverJob.sessionId,
              parentNodeId: serverJob.parentNodeId,
              clientNodeId: serverJob.clientNodeId,
              kind: serverJob.kind,
            };
            if (
              nextJob.phase !== f.phase ||
              nextJob.sessionId !== f.sessionId ||
              nextJob.parentNodeId !== f.parentNodeId ||
              nextJob.clientNodeId !== f.clientNodeId ||
              nextJob.kind !== f.kind
            ) {
              changed = true;
            }
            nextInflight.push(nextJob);
          } else {
            nextInflight.push(f);
          }
        }
        // Re-add active jobs that only the server knows about. This covers
        // reload/abort races where localStorage lost requestIds while the
        // backend kept streaming.
        const nextIds = new Set(nextInflight.map((f) => f.id));
        for (const j of jobs) {
          if (!nextIds.has(j.requestId)) {
            nextInflight.push(toPersistedInFlightJob(j));
            changed = true;
          }
        }
        if (changed) {
          saveInFlight(nextInflight);
          set({ inFlight: nextInflight, activeGenerations: nextInflight.length });
        }
        for (const err of terminalErrors) {
          handleError(err, get());
        }
      } catch {}
      try {
        const lastKnown = get().history.reduce(
          (max, it) => (it.createdAt && it.createdAt > max ? it.createdAt : max),
          0,
        );
        const { items } = await getHistory({ limit: HISTORY_LIMIT, since: lastKnown });
        const arr: GenerateItem[] = items.map(mapHistoryItem);
        if (arr.length > 0) {
          set((s) => {
            const seen = new Set(s.history.map(historyKey));
            const fresh = arr.filter((item) => {
              const key = historyKey(item);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            if (fresh.length === 0) return {};
            const nextCurrent = s.currentImage ?? fresh[0];
            if (!s.currentImage && fresh[0]?.filename) {
              saveSelectedFilename(fresh[0].filename);
            }
            return {
              history: retainHistoryItems(
                [...fresh, ...s.history],
                Math.max(HISTORY_LIMIT, s.history.length + fresh.length),
              ),
              currentImage: nextCurrent,
              loadedHistoryRetainLimit: Math.max(
                s.loadedHistoryRetainLimit,
                s.history.length + fresh.length,
              ),
            };
          });
        }
        // Prune strategy: TTL-based only. Do not attempt to correlate
        // history items with inFlight entries — backend ordering may differ
        // from local generation order under concurrency. Matching by prompt
        // is also unreliable when the same prompt is queued twice.
        const now = Date.now();
        const remaining = get().inFlight.filter(
          (f) => scopedActiveServerIds.has(f.id) || now - f.startedAt < INFLIGHT_TTL_MS,
        );
        if (remaining.length !== get().inFlight.length) {
          saveInFlight(remaining);
          set({ inFlight: remaining, activeGenerations: remaining.length });
        }
      } catch {}
    };
    w.__ima2InflightTimer = window.setInterval(tick, 1500) as unknown as number;
  },
  reconcileInflight: async () => {
    try {
      const scopes = getInflightQueryScopes(get());
      const { jobs, terminalJobs = [] } = await fetchInflightScopes(scopes);
      const serverById = new Map(jobs.map((j) => [j.requestId, j] as const));
      const terminalById = new Map((terminalJobs as ServerTerminalJob[]).map((j) => [j.requestId, j] as const));
      const terminalErrors: Array<Error & { code?: string; status?: number }> = [];
      const now = Date.now();
      const currentLocal = get().inFlight;
      const local = currentLocal.length > 0 ? currentLocal : loadInFlight();
      // Keep local entries that are either still known to the server,
      // or started very recently (<10s — request may be in-flight before
      // /api/inflight registered). Keep out-of-scope entries because this
      // request only asked the server about the current mode/session.
      const merged = local.flatMap((f) => {
        const serverJob = serverById.get(f.id);
        if (serverJob) {
          const restored = toPersistedInFlightJob(serverJob);
          return [{ ...f, ...restored, prompt: f.prompt || restored.prompt, phase: f.phase || restored.phase }];
        }
        if (!matchesInflightScope(f, scopes)) return [f];
        const terminal = terminalById.get(f.id);
        if (terminal) {
          if (terminal.status === "error") {
            terminalErrors.push(terminalJobError(terminal));
          }
          return [];
        }
        return now - f.startedAt < 10_000 ? [f] : [];
      });
      // Bring in server-only jobs (started from another tab / process)
      const localIds = new Set(merged.map((f) => f.id));
      for (const j of jobs) {
        if (!localIds.has(j.requestId)) {
          merged.push(toPersistedInFlightJob(j));
        }
      }
      saveInFlight(merged);
      set({ inFlight: merged, activeGenerations: merged.length });
      for (const err of terminalErrors) {
        handleError(err, get());
      }
      if (merged.length > 0) get().startInFlightPolling();
    } catch {
      // Silent — endpoint may not exist on older servers.
    }
  },
  syncFromStorage: () => {
    const nextInflight = loadInFlight();
    const nextSelected = loadSelectedFilename();
    const nextImageModel = loadImageModel();
    const nextVideo = loadVideoDefaults();
    set((s) => {
      const matched = nextSelected
        ? s.history.find((h) => h.filename === nextSelected) ?? null
        : null;
      const normalized = matched
        ? resolveVisibleShortcutCurrent(s.history, matched)
        : null;
      const visibleFallback = getVisibleGalleryItems(s.history)[0] ?? null;
      const currentImage = s.currentImage?.canvasVersion
        ? resolveVisibleShortcutCurrent(s.history, s.currentImage) ?? visibleFallback
        : s.currentImage;
      return {
        inFlight: nextInflight,
        activeGenerations: nextInflight.length,
        imageModel: nextImageModel,
        videoModelSelected: nextVideo.model,
        videoDuration: nextVideo.duration,
        videoResolution: nextVideo.resolution as VideoResolutionUI,
        videoAspectRatio: nextVideo.aspectRatio,
        currentImage:
          nextSelected && currentImage?.filename !== nextSelected
            ? normalized ?? currentImage
            : currentImage,
      };
    });
    if (nextInflight.length > 0) get().startInFlightPolling();
  },
  currentImage: null,
  applyMergedCanvasImage: (item) => {
    set((s) => ({
      history: item.filename
        ? s.history.some((h) => h.filename === item.filename)
          ? s.history.map((h) => (h.filename === item.filename ? item : h))
          : retainHistoryItems([item, ...s.history], s.loadedHistoryRetainLimit + 1)
        : s.history,
      loadedHistoryRetainLimit: Math.max(
        s.loadedHistoryRetainLimit,
        Math.min(s.history.length + 1, s.loadedHistoryRetainLimit + 1),
      ),
    }));
  },
  addGeneratedHistoryItem: async (item) => {
    await addHistory(item, set, get);
  },
  history: [],
  historyNextCursor: null,
  historyLoadingOlder: false,
  favoriteHistoryNextCursor: null,
  favoriteHistoryLoadingOlder: false,
  loadedHistoryRetainLimit: HISTORY_LIMIT,
  loadOlderHistory: async () => {
    const cursor = get().historyNextCursor;
    if (!cursor || get().historyLoadingOlder) return;
    set({ historyLoadingOlder: true });
    try {
      const res = await getHistory({ limit: HISTORY_LIMIT, cursor });
      const incoming = res.items.map(mapHistoryItem);
      set((s) => {
        const seen = new Set(s.history.map((item) => item.filename ?? item.image));
        const appended = incoming.filter((item) => {
          const key = item.filename ?? item.image;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return {
          history: [...s.history, ...appended],
          historyNextCursor: res.nextCursor,
          historyLoadingOlder: false,
          loadedHistoryRetainLimit: Math.max(
            s.loadedHistoryRetainLimit,
            s.history.length + appended.length,
          ),
        };
      });
    } catch {
      set({ historyLoadingOlder: false });
      get().showToast(t("gallery.loadOlderFailed"), true);
    }
  },
  loadFavoriteHistory: async () => {
    try {
      const res = await getHistory({ limit: HISTORY_LIMIT, favoritesOnly: true });
      const incoming = res.items.map(mapHistoryItem);
      set((s) => {
        const history = mergeHistoryItems(s.history, incoming);
        return {
          history,
          favoriteHistoryNextCursor: res.nextCursor,
          loadedHistoryRetainLimit: Math.max(s.loadedHistoryRetainLimit, history.length),
          galleryFavorites: new Set([
            ...Array.from(s.galleryFavorites),
            ...incoming.filter((item) => item.filename).map((item) => item.filename!),
          ]),
        };
      });
    } catch {
      get().showToast(t("gallery.loadOlderFailed"), true);
    }
  },
  loadOlderFavoriteHistory: async () => {
    const cursor = get().favoriteHistoryNextCursor;
    if (!cursor || get().favoriteHistoryLoadingOlder) return;
    set({ favoriteHistoryLoadingOlder: true });
    try {
      const res = await getHistory({ limit: HISTORY_LIMIT, cursor, favoritesOnly: true });
      const incoming = res.items.map(mapHistoryItem);
      set((s) => {
        const history = mergeHistoryItems(s.history, incoming);
        return {
          history,
          favoriteHistoryNextCursor: res.nextCursor,
          favoriteHistoryLoadingOlder: false,
          loadedHistoryRetainLimit: Math.max(s.loadedHistoryRetainLimit, history.length),
          galleryFavorites: new Set([
            ...Array.from(s.galleryFavorites),
            ...incoming.filter((item) => item.filename).map((item) => item.filename!),
          ]),
        };
      });
    } catch {
      set({ favoriteHistoryLoadingOlder: false });
      get().showToast(t("gallery.loadOlderFailed"), true);
    }
  },
  trashPending: null,
  toast: null,
  toastLog: [],
  customSizeConfirm: null,
  errorCard: null,
  errorCardLog: [],
  rightPanelOpen: loadRightPanelOpen(),
  toggleRightPanel: () =>
    set((s) => {
      const next = !s.rightPanelOpen;
      try {
        localStorage.setItem(RIGHT_PANEL_OPEN_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return { rightPanelOpen: next };
    }),
  composeSheetOpen: false,
  composeSheetTab: "prompt",
  openComposeSheet: (tab = "prompt") => set({ composeSheetOpen: true, composeSheetTab: tab }),
  setComposeSheetTab: (tab) => set({ composeSheetTab: tab }),
  closeComposeSheet: () => set({ composeSheetOpen: false }),
  galleryOpen: false,
  openGallery: () =>
    set((s) => ({ galleryOpen: true, galleryScope: s.galleryDefaultScope })),
  closeGallery: () => set({ galleryOpen: false }),
  galleryScope: loadGalleryScope(GALLERY_SCOPE_STORAGE_KEY),
  galleryDefaultScope: loadGalleryScope(GALLERY_DEFAULT_SCOPE_STORAGE_KEY),
  setGalleryScope: (scope) => {
    try {
      localStorage.setItem(GALLERY_SCOPE_STORAGE_KEY, scope);
    } catch {}
    set({ galleryScope: scope });
  },
  setGalleryDefaultScope: (scope) => {
    try {
      localStorage.setItem(GALLERY_DEFAULT_SCOPE_STORAGE_KEY, scope);
      localStorage.setItem(GALLERY_SCOPE_STORAGE_KEY, scope);
    } catch {}
    set({ galleryDefaultScope: scope, galleryScope: scope });
  },

  imageModel: storedImageModel,
  reasoningEffort: loadReasoningEffort(),
  webSearchEnabled: loadWebSearchEnabled(),

  settingsOpen: false,
  activeSettingsSection: "account",
  readinessPopupOpen: false,
  openSettings: (section = "account") =>
    set({ settingsOpen: true, activeSettingsSection: section }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () =>
    set((s) => ({
      settingsOpen: !s.settingsOpen,
      activeSettingsSection: s.settingsOpen ? s.activeSettingsSection : "account",
    })),
  setActiveSettingsSection: (section) => set({ activeSettingsSection: section }),
  openReadinessPopup: () => set({ readinessPopupOpen: true }),
  closeReadinessPopup: () => set({ readinessPopupOpen: false }),

  uiMode: loadUIMode(),
  setUIMode: (m) => {
    const next =
      m === "agent" && !ENABLE_AGENT_MODE ? "classic" :
        m === "card-news" && !ENABLE_CARD_NEWS_MODE ? "classic" :
        m === "node" && !ENABLE_NODE_MODE ? "classic" :
          m;
    try { localStorage.setItem(UI_MODE_STORAGE_KEY, next); } catch {}
    set({ uiMode: next });
  },

  theme: loadThemePreference(),
  resolvedTheme: resolveThemePreference(loadThemePreference()),
  themeFamily: loadThemeFamily(),
  historyStripLayout: loadHistoryStripLayout(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
    set({ theme, resolvedTheme: resolveThemePreference(theme) });
  },
  setThemeFamily: (family) => {
    try {
      localStorage.setItem(THEME_FAMILY_STORAGE_KEY, family);
    } catch {}
    set({ themeFamily: family });
  },
  setHistoryStripLayout: (layout) => {
    try {
      localStorage.setItem(HISTORY_STRIP_LAYOUT_STORAGE_KEY, layout);
    } catch {}
    set({ historyStripLayout: layout });
  },
  syncThemeFromStorage: () => {
    const theme = loadThemePreference();
    set({ theme, resolvedTheme: resolveThemePreference(theme) });
  },
  syncThemeFamilyFromStorage: () => {
    set({ themeFamily: loadThemeFamily() });
  },
  refreshResolvedTheme: () => {
    set((s) => ({ resolvedTheme: resolveThemePreference(s.theme) }));
  },

  locale: loadLocale(),
  setLocale: (l) => {
    saveLocale(l);
    set({ locale: l });
  },

  graphNodes: [],
  graphEdges: [],
  setGraphNodes: (graphNodes) => {
    set({ graphNodes: deriveParentServerNodeIds(graphNodes, get().graphEdges) });
    get().scheduleGraphSave();
  },
  setGraphEdges: (graphEdges) => {
    set({ graphEdges, graphNodes: deriveParentServerNodeIds(get().graphNodes, graphEdges) });
    get().scheduleGraphSave();
  },
  disconnectEdge: (edgeId) => {
    get().disconnectEdges([edgeId]);
  },
  disconnectEdges: (edgeIds) => {
    const edgeIdSet = new Set(edgeIds);
    if (edgeIdSet.size === 0) return;
    const removedEdges = get().graphEdges.filter((edge) => edgeIdSet.has(edge.id));
    if (removedEdges.length === 0) return;
    const nextEdges = get().graphEdges.filter((edge) => !edgeIdSet.has(edge.id));
    const removedTargets = new Set(removedEdges.map((edge) => edge.target));
    const nextNodes = get().graphNodes.map((node) => {
      if (!removedTargets.has(node.id)) return node;
      const remainingIncoming = nextEdges.find((edge) => edge.target === node.id);
      const remainingParent = remainingIncoming
        ? get().graphNodes.find((candidate) => candidate.id === remainingIncoming.source)
        : null;
      return {
        ...node,
        data: {
          ...node.data,
          parentServerNodeId: remainingParent?.data.serverNodeId ?? null,
        },
      };
    });
    set({ graphNodes: deriveParentServerNodeIds(nextNodes, nextEdges), graphEdges: nextEdges });
    get().scheduleGraphSave();
    void get().flushGraphSave("edge-disconnect");
    get().showToast(t("edge.disconnected"));
  },
  nodeSelectionMode: false,
  nodeBatchRunning: false,
  nodeBatchStopping: false,
  toggleNodeSelectionMode: () => {
    const next = !get().nodeSelectionMode;
    set({
      nodeSelectionMode: next,
      ...(next ? {} : { graphNodes: applySelectedNodeIds(get().graphNodes, []) }),
    });
  },
  selectAllGraphNodes: () => {
    set({ graphNodes: applySelectedNodeIds(get().graphNodes, get().graphNodes.map((n) => n.id)) });
  },
  selectNodeGraph: (clientId, additive) => {
    set({
      graphNodes: applyComponentSelection(get().graphNodes, get().graphEdges, clientId, additive),
    });
  },
  clearNodeSelection: () => {
    set({ graphNodes: applySelectedNodeIds(get().graphNodes, []) });
  },
  cancelNodeBatch: () => {
    if (!get().nodeBatchRunning) return;
    set({ nodeBatchStopping: true });
    get().showToast(t("nodeBatch.stopQueued"));
  },

  sessions: [],
  activeSessionId: null,
  activeSessionGraphVersion: null,
  sessionLoading: false,

  async loadSessions() {
    try {
      const { sessions } = await apiListSessions();
      set({ sessions });
      const current = get().activeSessionId;
      if (!current) {
        const savedId = loadActiveSessionId();
        const savedExists = savedId ? sessions.some((s) => s.id === savedId) : false;
        if (savedId && savedExists) {
          await get().switchSession(savedId);
        } else {
          await get().createAndSwitchSession(t("session.firstGraph"));
        }
      }
    } catch (err) {
      console.warn("[sessions] load failed:", err);
    }
  },

  async switchSession(id) {
    set({ sessionLoading: true });
    await get().flushGraphSave("switch-session");
    try {
      const { session } = await apiGetSession(id);
      const { graphNodes, graphEdges, graphVersion } = mapSessionToGraph(session);
      set({
        activeSessionId: id,
        activeSessionGraphVersion: graphVersion,
        graphNodes,
        graphEdges,
        sessionLoading: false,
      });
      saveActiveSessionId(id);
      // Serialize reconcile and recovery so the two async writers don't race.
      // reconcileGraphPending already calls recoverGraphNodesFromHistory at the
      // end, but we await it explicitly here so any subsequent tick sees the
      // recovered state.
      await get().reconcileGraphPending().catch(() => {});
    } catch (err) {
      console.warn("[sessions] switch failed:", err);
      set({ sessionLoading: false });
      get().showToast(t("toast.sessionLoadFailed"), true);
    }
  },

  async reconcileGraphPending() {
    const sid = get().activeSessionId;
    if (!sid) return;
    const pendingNodes = get().graphNodes.filter(
      (n) => n.data?.pendingRequestId && (n.data.status === "pending" || n.data.status === "reconciling"),
    );
    if (pendingNodes.length > 0) {
      let jobs: Array<{ requestId: string; phase?: string }> = [];
      try {
        const res = await getInflight({ kind: "node", sessionId: sid });
        jobs = res.jobs;
      } catch {
        // If inflight cannot be queried, skip pending transition but still
        // attempt orphan recovery below.
        jobs = [];
      }
      const byId = new Map(jobs.map((j) => [j.requestId, j.phase] as const));
      const now = Date.now();
      const GRACE_MS = 10_000;
      const next = get().graphNodes.map((n) => {
        const reqId = n.data?.pendingRequestId;
        if (!reqId) return n;
        if (n.data.status !== "pending" && n.data.status !== "reconciling") return n;
        if (byId.has(reqId)) {
          const phase = byId.get(reqId) ?? null;
          return {
            ...n,
            data: { ...n.data, status: "reconciling" as const, pendingPhase: phase },
          };
        }
        // Not in-flight anymore. Apply B grace window if we know when it started —
        // the server may have just finished and the response is still en route.
        const startedAt = n.data.pendingStartedAt ?? 0;
        if (startedAt && now - startedAt < GRACE_MS) {
          return {
            ...n,
            data: { ...n.data, status: "reconciling" as const },
          };
        }
        // Image may have landed, or job was lost.
        const hasAsset = !!n.data.imageUrl || !!n.data.serverNodeId;
        return {
          ...n,
          data: {
            ...n.data,
            pendingRequestId: null,
            pendingPhase: null,
            pendingStartedAt: null,
            partialImageUrl: null,
            status: hasAsset ? ("ready" as const) : ("stale" as const),
            error: hasAsset ? undefined : t("session.assetAbortedError"),
          },
        };
      });
      set({ graphNodes: next });
    }
    // Always attempt orphan recovery: covers A-sanitized empty nodes and
    // cross-session completions that never landed in this graph.
    await recoverGraphNodesFromHistory(get, set).catch(() => {});
  },

  async createAndSwitchSession(title?: string) {
    if (title == null) title = t("session.untitled");
    try {
      const { session } = await apiCreateSession(title);
      set({
        sessions: [session as SessionSummary, ...get().sessions],
        activeSessionId: session.id,
        activeSessionGraphVersion: session.graphVersion,
        graphNodes: [],
        graphEdges: [],
      });
      saveActiveSessionId(session.id);
    } catch (err) {
      console.warn("[sessions] create failed:", err);
      get().showToast(t("toast.sessionCreateFailed"), true);
    }
  },

  async renameCurrentSession(title) {
    const id = get().activeSessionId;
    if (!id) return;
    try {
      await apiRenameSession(id, title);
      set({
        sessions: get().sessions.map((s) =>
          s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
        ),
      });
    } catch (err) {
      get().showToast(t("toast.sessionRenameFailed"), true);
    }
  },

  async deleteSessionById(id) {
    try {
      await apiDeleteSession(id);
      const remaining = get().sessions.filter((s) => s.id !== id);
      set({ sessions: remaining });
      if (get().activeSessionId === id) {
        set({
          activeSessionId: null,
          activeSessionGraphVersion: null,
          graphNodes: [],
          graphEdges: [],
        });
        saveActiveSessionId(null);
        if (remaining.length > 0) {
          await get().switchSession(remaining[0].id);
        } else {
          await get().createAndSwitchSession(t("session.firstGraph"));
        }
      }
    } catch (err) {
      get().showToast(t("toast.sessionDeleteFailed"), true);
    }
  },

  scheduleGraphSave() {
    scheduleGraphSaveImpl(get, set);
  },

  async flushGraphSave(reason = "manual") {
    await flushGraphSaveImpl(get, set, reason);
  },

  addRootNode: () => {
    const clientId = newClientNodeId();
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: getNextRootPosition(get().graphNodes),
        data: {
          clientId,
          serverNodeId: null,
          parentServerNodeId: null,
          prompt: "",
          imageUrl: null,
          status: "empty",
          pendingRequestId: null,
          pendingPhase: null,
        },
      };
    set({ graphNodes: [...get().graphNodes, node] });
    get().scheduleGraphSave();
    return clientId;
  },

  createRootNodeFromHistoryItem: (item) => {
    const clientId = newClientNodeId();
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: getNextRootPosition(get().graphNodes),
      data: {
        clientId,
        serverNodeId: item.nodeId ?? null,
        parentServerNodeId: null,
        prompt: item.prompt ?? "",
        imageUrl: item.image,
        status: "ready",
        pendingRequestId: null,
        pendingPhase: null,
        model: item.model ?? null,
        size: item.size ?? null,
        elapsed: item.elapsed ?? undefined,
        video: (item as any).video ?? null,
      },
    };
    set({
      uiMode: "node",
      graphNodes: [...get().graphNodes, node],
    });
    get().scheduleGraphSave();
    return clientId;
  },

  addChildNode: (parentClientId) => {
    const parent = get().graphNodes.find((n) => n.id === parentClientId);
    if (!parent) return parentClientId;
    const clientId = newClientNodeId();
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: getNextChildPosition(parent, get().graphNodes, get().graphEdges),
        data: {
          clientId,
          serverNodeId: null,
          parentServerNodeId: parent.data.serverNodeId,
          prompt: isVideoUrl(parent.data.imageUrl) ? (parent.data.prompt || "") : "",
          imageUrl: null,
          status: "empty",
          pendingRequestId: null,
          pendingPhase: null,
        },
    };
    const edge: GraphEdge = {
      id: newGraphEdgeId(parentClientId, clientId, DEFAULT_CHILD_SOURCE_HANDLE, DEFAULT_CHILD_TARGET_HANDLE),
      source: parentClientId,
      target: clientId,
      sourceHandle: DEFAULT_CHILD_SOURCE_HANDLE,
      targetHandle: DEFAULT_CHILD_TARGET_HANDLE,
    };
    set({
      graphNodes: [...get().graphNodes, node],
      graphEdges: [...get().graphEdges, edge],
    });
    get().scheduleGraphSave();

    // If parent is a video node, extract last frame as child reference + load topic
    if (parent.data.imageUrl && isVideoUrl(parent.data.imageUrl)) {
      const videoSrc = parent.data.imageUrl;
      if (parent.data.video && parent.data.video.topic) {
        get().setVideoTopic(parent.data.video.topic);
      }
      void (async () => {
        try {
          const frameDataUrl = await extractLastFrame(videoSrc);
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? { ...n, data: { ...n.data, referenceImages: [frameDataUrl] } }
                : n,
            ),
          });
          get().scheduleGraphSave();
        } catch { /* non-fatal */ }
      })();
    }

    return clientId;
  },

  addSiblingNode: (sourceClientId) => {
    const source = get().graphNodes.find((n) => n.id === sourceClientId);
    if (!source) return sourceClientId;

    const incomingEdge = get().graphEdges.find((e) => e.target === sourceClientId);
    if (!incomingEdge) {
      const clientId = newClientNodeId();
      const node: GraphNode = {
        id: clientId,
        type: "imageNode",
        position: getNextRootPosition(get().graphNodes),
        data: {
          clientId,
          serverNodeId: null,
          parentServerNodeId: null,
          prompt: source.data.prompt,
          imageUrl: null,
          status: "empty",
          pendingRequestId: null,
          pendingPhase: null,
        },
      };
      set({ graphNodes: [...get().graphNodes, node] });
      get().scheduleGraphSave();
      return clientId;
    }

    const parentClientId = incomingEdge.source;
    const parent = get().graphNodes.find((n) => n.id === parentClientId);
    if (!parent) return sourceClientId;

    const clientId = newClientNodeId();
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: getNextChildPosition(parent, get().graphNodes, get().graphEdges),
      data: {
        clientId,
        serverNodeId: null,
        parentServerNodeId: source.data.parentServerNodeId,
        prompt: source.data.prompt,
        imageUrl: null,
        status: "empty",
        pendingRequestId: null,
        pendingPhase: null,
      },
    };
    const edge: GraphEdge = {
      id: newGraphEdgeId(parentClientId, clientId, DEFAULT_CHILD_SOURCE_HANDLE, DEFAULT_CHILD_TARGET_HANDLE),
      source: parentClientId,
      target: clientId,
      sourceHandle: DEFAULT_CHILD_SOURCE_HANDLE,
      targetHandle: DEFAULT_CHILD_TARGET_HANDLE,
    };
    set({
      graphNodes: [...get().graphNodes, node],
      graphEdges: [...get().graphEdges, edge],
    });
    get().scheduleGraphSave();
    return clientId;
  },

  updateNodePrompt: (clientId, prompt) => {
    set({
      graphNodes: get().graphNodes.map((n) =>
        n.id === clientId ? { ...n, data: { ...n.data, prompt } } : n,
      ),
    });
    get().scheduleGraphSave();
  },

  addNodeReferences: async (clientId, files) => {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    const currentRefs = node.data.referenceImages ?? [];
    const allowed = MAX_REFERENCE_IMAGES - currentRefs.length;
    if (allowed <= 0) {
      get().showToast(t("toast.refLimitExceeded"), true);
      return;
    }
    const toAdd = files.slice(0, Math.max(0, allowed));
    const heicSkipped = toAdd.filter(isHeic);
    const usable = toAdd.filter((f) => !isHeic(f));
    const results = await Promise.all(
      usable.map(async (f) => {
        try {
          return await compressToBase64(f, {
            preserveTransparency: hasAlphaChannel(f),
          });
        } catch (err) {
          console.warn("[addNodeReferences] compress failed", err);
          return null;
        }
      }),
    );
    const valid = results.filter((x): x is string => !!x);
    if (valid.length > 0) {
      const sessionId = get().activeSessionId;
      set({
        graphNodes: get().graphNodes.map((n) =>
          {
            if (n.id !== clientId) return n;
            const refs = [
              ...(n.data.referenceImages ?? []),
              ...valid,
            ].slice(0, MAX_REFERENCE_IMAGES);
            saveNodeRefs(sessionId, clientId, refs);
            return {
                ...n,
                data: {
                  ...n.data,
                  referenceImages: refs,
                },
              };
          },
        ),
      });
      get().scheduleGraphSave();
    }
    if (heicSkipped.length > 0) {
      get().showToast(t("toast.refHeicUnsupported"), true);
    }
    const failedCount = usable.length - valid.length;
    if (failedCount > 0) {
      get().showToast(t("toast.refTooLarge"), true);
    }
    if (files.length > allowed) {
      get().showToast(t("toast.refLimitExceeded"), true);
    }
  },

  addNodeReferenceDataUrl: (clientId, dataUrl) => {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    set({
      graphNodes: get().graphNodes.map((n) => {
        if (n.id !== clientId) return n;
        const refs = n.data.referenceImages ?? [];
        if (refs.length >= MAX_REFERENCE_IMAGES) return n;
        const nextRefs = [...refs, dataUrl];
        saveNodeRefs(get().activeSessionId, clientId, nextRefs);
        return {
          ...n,
          data: {
            ...n.data,
            referenceImages: nextRefs,
          },
        };
      }),
    });
    get().scheduleGraphSave();
  },

  removeNodeReference: (clientId, index) => {
    set({
      graphNodes: get().graphNodes.map((n) => {
        if (n.id !== clientId) return n;
        const refs = (n.data.referenceImages ?? []).filter((_, i) => i !== index);
        saveNodeRefs(get().activeSessionId, clientId, refs);
        return {
              ...n,
              data: {
                ...n.data,
                referenceImages: refs,
              },
            };
      }),
    });
    get().scheduleGraphSave();
  },

  clearNodeReferences: (clientId) => {
    clearStoredNodeRefs(get().activeSessionId, clientId);
    set({
      graphNodes: get().graphNodes.map((n) =>
        n.id === clientId
          ? {
              ...n,
              data: {
                ...n.data,
                referenceImages: undefined,
              },
            }
          : n,
      ),
    });
    get().scheduleGraphSave();
  },

  duplicateBranchRoot: (sourceClientId) => {
    const source = get().graphNodes.find((n) => n.id === sourceClientId);
    if (!source) return sourceClientId;
    const clientId = newClientNodeId();
    const rootSiblings = get().graphNodes.filter((n) => !n.data.parentServerNodeId).length;
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position: { x: source.position.x + 420, y: source.position.y + 40 },
      data: {
        clientId,
        serverNodeId: null,
        parentServerNodeId: null,
        prompt: source.data.prompt,
        imageUrl: null,
        status: "empty",
        pendingRequestId: null,
        pendingPhase: null,
      },
    };
    // no parent edge — becomes a new branch root at root layer
    void rootSiblings;
    set({ graphNodes: [...get().graphNodes, node] });
    get().scheduleGraphSave();

    // Pre-seed the source image as a node-local draft reference. Keeping this
    // local prevents hidden classic references from influencing node mode.
    if (source.data.imageUrl) {
      const sourceUrl = source.data.imageUrl;
      (async () => {
        try {
          const dataUrl = await compressReferenceSource(sourceUrl, "node-reference.png");
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      referenceImages: [dataUrl],
                    },
                  }
                : n,
            ),
          });
        } catch {
          // non-fatal
        }
      })();
    }
    return clientId;
  },

  async generateNode(clientId) {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    const { prompt } = node.data;
    if (!prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      return;
    }
    if (get().videoModelSelected) return get().runVideoGenerate(clientId);
    const pending = getCustomSizeConfirmation(get(), { kind: "node", clientId });
    if (pending) {
      set({ customSizeConfirm: pending });
      return;
    }
    await get().runGenerateNode(clientId);
  },

  async generateNodeInPlace(clientId) {
    const node = get().graphNodes.find((n) => n.id === clientId);
    if (!node) return;
    if (!node.data.prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      return;
    }
    if (get().videoModelSelected) return get().runVideoGenerate(clientId);
    const pending = getCustomSizeConfirmation(get(), { kind: "node-in-place", clientId });
    if (pending) {
      set({ customSizeConfirm: pending });
      return;
    }
    await get().runGenerateNodeInPlace(clientId);
  },

  async generateNodeVariation(clientId, sizeOverride) {
    const source = get().graphNodes.find((n) => n.id === clientId);
    if (!source) return;
    if (!source.data.prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      return;
    }
    if (get().videoModelSelected) {
      const targetClientId = get().addSiblingNode(clientId);
      return get().runVideoGenerate(targetClientId);
    }
    if (!sizeOverride) {
      const pending = getCustomSizeConfirmation(get(), { kind: "node-variation", clientId });
      if (pending) {
        set({ customSizeConfirm: pending });
        return;
      }
    }
    const targetClientId = get().addSiblingNode(clientId);
    await get().runGenerateNodeInPlace(targetClientId, { sizeOverride });
  },

  async runGenerateNode(clientId, sizeOverride) {
    const requestedNode = get().graphNodes.find((n) => n.id === clientId);
    const targetClientId = requestedNode?.data.status === "ready"
      ? get().addSiblingNode(clientId)
      : clientId;
    await get().runGenerateNodeInPlace(targetClientId, { sizeOverride });
  },

  async runGenerateNodeInPlace(clientId, options = {}) {
    if (nodeGenerationLocks.has(clientId)) return null;
    nodeGenerationLocks.add(clientId);
    const beforeRepair = get().graphNodes;
    const repairedNodes = deriveParentServerNodeIds(beforeRepair, get().graphEdges);
    if (repairedNodes.some((n, i) => n.data.parentServerNodeId !== beforeRepair[i]?.data.parentServerNodeId)) {
      set({ graphNodes: repairedNodes });
    }
    const node = repairedNodes.find((n) => n.id === clientId);
    if (!node) {
      nodeGenerationLocks.delete(clientId);
      return null;
    }
    const { prompt, parentServerNodeId } = node.data;
    if (!prompt.trim()) {
      get().showToast(t("toast.promptRequired"), true);
      nodeGenerationLocks.delete(clientId);
      return null;
    }
    const nodeRefs = node.data.referenceImages ?? [];
    const s = get();
    const size = options.sizeOverride ?? s.getResolvedSize();
    const effectiveParentServerNodeId =
      options.parentServerNodeIdOverride !== undefined
        ? options.parentServerNodeIdOverride
        : parentServerNodeId;
    const incoming = get().graphEdges.find((edge) => edge.target === clientId);
    if (incoming && !effectiveParentServerNodeId) {
      get().showToast(t("node.parentImageRequired"), true);
      nodeGenerationLocks.delete(clientId);
      return null;
    }

    // Capture request session so a later session switch does not corrupt graph B.
    const requestSessionId = s.activeSessionId;
    // mark pending — request-unique flightId so retries on the same node don't collide.
    const startedAt = Date.now();
    const randSuffix = Math.random().toString(36).slice(2, 6);
    const flightId = `fn_${clientId}_${startedAt}_${randSuffix}`;
    const nextInFlight: PersistedInFlight[] = [
      ...s.inFlight,
      {
        id: flightId,
        prompt,
        startedAt,
        kind: "node",
        sessionId: requestSessionId,
        clientNodeId: clientId,
      },
    ];
    saveInFlight(nextInFlight);
    set({
      graphNodes: get().graphNodes.map((n) =>
        n.id === clientId
          ? {
              ...n,
              data: {
                ...n.data,
                status: "pending",
                pendingRequestId: flightId,
                recoveryRequestId: flightId,
                pendingPhase: "queued",
                pendingStartedAt: startedAt,
                partialImageUrl: null,
                error: undefined,
                size,
              },
            }
          : n,
      ),
      activeGenerations: s.activeGenerations + 1,
      inFlight: nextInFlight,
    });
    get().startInFlightPolling();

    let graphMutated = true; // pending set above already mutated the graph if same-session

    try {
      const res = await postNodeGenerateStream({
        parentNodeId: effectiveParentServerNodeId,
        prompt,
        quality: s.quality,
        size,
        format: s.format,
        moderation: s.moderation,
        provider: s.provider,
        model: s.imageModel,
        reasoningEffort: s.reasoningEffort,
        storyboard: s.storyboardActive || undefined,
        requestId: flightId,
        sessionId: requestSessionId,
        clientNodeId: clientId,
        contextMode: "parent-plus-refs",
        searchMode: s.webSearchEnabled ? "on" : "off",
        webSearchEnabled: s.webSearchEnabled,
        ...(nodeRefs.length
          ? { references: nodeRefs.map(stripDataUrlPrefix) }
          : {}),
      }, {
        onPartial: (partial) => {
          if (get().activeSessionId !== requestSessionId) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: "pending",
                      partialImageUrl: partial.image,
                      pendingPhase: "partial",
                    },
                  }
                : n,
            ),
          });
        },
        onPhase: (phase) => {
          if (get().activeSessionId !== requestSessionId) return;
          if (!phase.phase) return;
          set({
            graphNodes: get().graphNodes.map((n) =>
              n.id === clientId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      pendingPhase: phase.phase ?? n.data.pendingPhase,
                    },
                  }
                : n,
            ),
          });
        },
      });
      if (get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) => {
            if (n.id !== clientId) return n;
            const nextData = { ...n.data };
            delete nextData.partialImageUrl;
            return {
              ...n,
              data: {
                ...nextData,
                serverNodeId: res.nodeId,
                imageUrl: res.url,
                status: "ready",
                pendingRequestId: null,
                recoveryRequestId: null,
                pendingPhase: null,
                pendingStartedAt: null,
                elapsed: res.elapsed,
                reasoningEffort: res.reasoningEffort,
                webSearchCalls: res.webSearchCalls,
                model: res.model ?? null,
                size: res.size ?? null,
              },
            };
          }),
        });
        graphMutated = true;
        if (!options.suppressToast) {
          get().showToast(t("toast.nodeCreated", { id: res.nodeId.slice(0, 8), elapsed: res.elapsed }));
        }
      }
      return res.nodeId;
      // cross-session: result will be restored via recoverGraphNodesFromHistory
      // when the user returns to the originating session.
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast.nodeCreateFailed");
      if (get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) =>
            n.id === clientId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: "error",
                    pendingRequestId: null,
                    pendingPhase: null,
                    pendingStartedAt: null,
                    partialImageUrl: null,
                    error: msg,
                  },
                }
              : n,
          ),
        });
        graphMutated = true;
        handleError(err, get());
      }
      // cross-session: silent — user is on a different graph
      return null;
    } finally {
      // Global state cleanup must always run regardless of active session,
      // otherwise the spinner/counter leaks.
      nodeGenerationLocks.delete(clientId);
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set({
        activeGenerations: Math.max(0, get().activeGenerations - 1),
        inFlight: remaining,
      });
      // Persist the graph only if we actually mutated it AND we are still on
      // the originating session.
      if (get().activeSessionId === requestSessionId && graphMutated) {
        get().scheduleGraphSave();
        void get().flushGraphSave("node-complete");
      }
    }
  },

  async runNodeBatch(mode) {
    if (get().nodeBatchRunning) return;
    const selectedIds = getSelectedNodeIds(get().graphNodes);
    if (selectedIds.length === 0) {
      get().showToast(t("nodeBatch.noneSelected"), true);
      return;
    }
    const blocked = validateBatchDependencies(get().graphNodes, get().graphEdges, selectedIds);
    if (blocked.length > 0) {
      get().showToast(t("nodeBatch.parentRequired", { count: blocked.length }), true);
      return;
    }
    const orderedIds = topologicalSortSelected(get().graphNodes, get().graphEdges, selectedIds);
    const selectedSet = new Set(selectedIds);
    const candidates = orderedIds.filter((id) => {
      if (mode === "regenerate-all") return true;
      const node = get().graphNodes.find((n) => n.id === id);
      return node ? !nodeHasImage(node) : false;
    });
    if (candidates.length === 0) {
      get().showToast(t("nodeBatch.nothingToRun"));
      return;
    }

    set({ nodeBatchRunning: true, nodeBatchStopping: false });
    const latestServerNodeIdByClientId = new Map<string, string>();
    let completed = 0;
    try {
      for (const clientId of candidates) {
        if (get().nodeBatchStopping) break;
        const incoming = get().graphEdges.find((e) => e.target === clientId);
        const parentOverride = incoming
          ? latestServerNodeIdByClientId.get(incoming.source)
            ?? get().graphNodes.find((n) => n.id === clientId)?.data.parentServerNodeId
            ?? null
          : null;
        const nodeId = get().videoModelSelected
          ? await get().runVideoGenerate(clientId as ClientNodeId).then(() => {
              const n = get().graphNodes.find((nd) => nd.id === clientId);
              return n?.data.serverNodeId ?? null;
            })
          : await get().runGenerateNodeInPlace(clientId as ClientNodeId, {
              parentServerNodeIdOverride: parentOverride,
              suppressToast: true,
            });
        if (!nodeId) {
          get().showToast(t("nodeBatch.failed", { done: completed, total: candidates.length }), true);
          break;
        }
        completed += 1;
        latestServerNodeIdByClientId.set(clientId, nodeId);
        const directChildren = getDirectUnselectedChildren(get().graphEdges, clientId, selectedSet);
        const downstream = new Set(getUnselectedDownstreamIds(get().graphEdges, selectedSet));
        set({
          graphNodes: get().graphNodes.map((n) => {
            if (!downstream.has(n.id)) return n;
            return {
              ...n,
              data: {
                ...n.data,
                status: "stale",
                parentServerNodeId: directChildren.includes(n.id)
                  ? nodeId
                  : n.data.parentServerNodeId,
                error: t("nodeBatch.staleBecauseParentChanged"),
              },
            };
          }),
        });
      }
      get().showToast(t("nodeBatch.finished", { done: completed, total: candidates.length }));
      get().scheduleGraphSave();
    } finally {
      set({ nodeBatchRunning: false, nodeBatchStopping: false });
    }
  },

  deleteNode: (clientId) => {
    const doomed = get().graphNodes.find((n) => n.id === clientId);
    const reqId = doomed?.data?.pendingRequestId;
    if (reqId) void cancelInflight(reqId);
    clearStoredNodeRefs(get().activeSessionId, clientId);
    const graphNodes = get().graphNodes.filter((n) => n.id !== clientId);
    const graphEdges = get().graphEdges.filter((e) => e.source !== clientId && e.target !== clientId);
    set({
      graphNodes: deriveParentServerNodeIds(graphNodes, graphEdges),
      graphEdges,
    });
    get().scheduleGraphSave();
  },

  deleteNodes: (clientIds) => {
    const set_ = new Set(clientIds);
    for (const clientId of set_) clearStoredNodeRefs(get().activeSessionId, clientId);
    for (const n of get().graphNodes) {
      if (set_.has(n.id) && n.data?.pendingRequestId) {
        void cancelInflight(n.data.pendingRequestId);
      }
    }
    const graphNodes = get().graphNodes.filter((n) => !set_.has(n.id));
    const graphEdges = get().graphEdges.filter((e) => !set_.has(e.source) && !set_.has(e.target));
    set({
      graphNodes: deriveParentServerNodeIds(graphNodes, graphEdges),
      graphEdges,
    });
    get().scheduleGraphSave();
  },

  addChildNodeAt: (parentClientId, position, sourceHandle = DEFAULT_CHILD_SOURCE_HANDLE) => {
    const parent = get().graphNodes.find((n) => n.id === parentClientId);
    if (!parent) return parentClientId;
    const clientId = newClientNodeId();
    const normalizedSourceHandle =
      normalizeNodeHandleId(sourceHandle, "source") ?? DEFAULT_CHILD_SOURCE_HANDLE;
    const targetHandle = getOppositeTargetHandle(normalizedSourceHandle) ?? DEFAULT_CHILD_TARGET_HANDLE;
    const node: GraphNode = {
      id: clientId,
      type: "imageNode",
      position,
      data: {
        clientId,
        serverNodeId: null,
        parentServerNodeId: parent.data.serverNodeId,
        prompt: "",
        imageUrl: null,
        status: "empty",
        pendingRequestId: null,
        pendingPhase: null,
      },
    };
    const edge: GraphEdge = {
      id: newGraphEdgeId(parentClientId, clientId, normalizedSourceHandle, targetHandle),
      source: parentClientId,
      target: clientId,
      sourceHandle: normalizedSourceHandle,
      targetHandle,
    };
    set({
      graphNodes: [...get().graphNodes, node],
      graphEdges: [...get().graphEdges, edge],
    });
    get().scheduleGraphSave();
    return clientId;
  },

  connectNodes: (sourceClientId, targetClientId, sourceHandle = null, targetHandle = null) => {
    if (sourceClientId === targetClientId) return;
    const existing = get().graphEdges.find(
      (e) => e.source === sourceClientId && e.target === targetClientId,
    );
    if (existing) return;
    if (wouldCreateMultipleIncomingEdge(get().graphEdges, sourceClientId, targetClientId)) {
      get().showToast(t("edge.parentConflict"), true);
      return;
    }
    const source = get().graphNodes.find((n) => n.id === sourceClientId);
    if (!source) return;
    const graphEdges = [
      ...get().graphEdges,
      {
        id: newGraphEdgeId(sourceClientId, targetClientId, sourceHandle, targetHandle),
        source: sourceClientId,
        target: targetClientId,
        sourceHandle,
        targetHandle,
      },
    ];
    set({
      graphNodes: deriveParentServerNodeIds(get().graphNodes, graphEdges),
      graphEdges,
    });
    get().scheduleGraphSave();
  },

  setProvider: (provider) => {
    saveGenerationDefaultsPatch({ provider });
    const currentModel = get().imageModel;
    const supportsVideo = provider === "grok" || provider === "grok-api";
    if (!supportsVideo && get().videoModelSelected) {
      set({ videoModelSelected: false });
      saveVideoDefaults({ model: false });
    }
    if ((provider === "grok" || provider === "grok-api") && !isGrokImageModel(currentModel)) {
      const grokModel = "grok-imagine-image";
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
  },
  setQuality: (quality) => {
    saveGenerationDefaultsPatch({ quality });
    set({ quality });
  },
  setSizePreset: (sizePreset) => {
    saveGenerationDefaultsPatch({ sizePreset });
    set({ sizePreset });
  },
  setCustomSize: (w, h) =>
    set((state) => {
      const customW = parseRequestedCustomSide(w, state.customW);
      const customH = parseRequestedCustomSide(h, state.customH);
      saveGenerationDefaultsPatch({ customW, customH });
      return { customW, customH };
    }),
  setGrokAspectRatio: (grokAspectRatio) => {
    saveGenerationDefaultsPatch({ grokAspectRatio } as any);
    set({ grokAspectRatio });
  },
  setGrokResolution: (grokResolution) => {
    saveGenerationDefaultsPatch({ grokResolution } as any);
    set({ grokResolution });
  },
  setFormat: (format) => {
    saveGenerationDefaultsPatch({ format });
    set({ format });
  },
  setModeration: (moderation) => {
    saveGenerationDefaultsPatch({ moderation });
    set({ moderation });
  },
  setImageModel: (imageModel) => {
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
  },
  videoModelSelected: storedVideoDefaults.model,
  videoDuration: storedVideoDefaults.duration,
  videoResolution: storedVideoDefaults.resolution as VideoResolutionUI,
  videoAspectRatio: storedVideoDefaults.aspectRatio,
  videoTopic: "",
  videoContinuityLineage: null,
  videoProgress: null,
  selectVideoModel: (model) => {
    const m = model || "grok-imagine-video";
    set({ videoModelSelected: m });
    saveVideoDefaults({ model: m });
    if (get().provider !== "grok") get().setProvider("grok");
  },
  setVideoDuration: (videoDuration) => { set({ videoDuration }); saveVideoDefaults({ duration: videoDuration }); },
  setVideoResolution: (videoResolution) => { set({ videoResolution }); saveVideoDefaults({ resolution: videoResolution }); },
  setVideoAspectRatio: (videoAspectRatio) => { set({ videoAspectRatio }); saveVideoDefaults({ aspectRatio: videoAspectRatio }); },
  setVideoTopic: (videoTopic) => set({ videoTopic }),
  setVideoContinuityLineage: (videoContinuityLineage) => set({ videoContinuityLineage }),
  activeVideoRefCount: () => {
    const s = get();
    if (s.uiMode === "node") {
      const id = getSelectedNodeIds(s.graphNodes)[0];
      const node = s.graphNodes.find((n) => n.id === id);
      return node?.data.referenceImages?.length ?? 0;
    }
    return s.referenceImages.length;
  },
  runVideoGenerate: async (nodeId) => {
    const node = nodeId ? get().graphNodes.find((n) => n.id === nodeId) : null;
    const refs = node ? (node.data.referenceImages ?? []) : get().referenceImages;
    const mode = deriveVideoModeUI(refs.length);
    const prompt = node ? node.data.prompt.trim() : composePrompt(get().prompt, get().insertedPrompts);
    if (!prompt.trim()) {
      get().showToast(ACTIVE_VIDEO_PROMPT_GUIDANCE, true);
      return;
    }

    // For node mode: use parent node's image as sourceImage if no explicit refs
    let parentSourceFilename: string | undefined;
    let parentVideoFrameRef: string | undefined;
    let parentVideoContinuity: VideoContinuityLineage | null = node ? node.data.videoContinuity ?? null : get().videoContinuityLineage;
    let continueFromVideo: string | undefined;
    if (node && refs.length === 0 && node.data.parentServerNodeId) {
      const parentNode = get().graphNodes.find(
        (n) => n.data.serverNodeId === node.data.parentServerNodeId,
      );
      if (parentNode?.data.imageUrl) {
        if (isVideoUrl(parentNode.data.imageUrl)) {
          // V2V: extract last frame from parent video
          try {
            parentVideoFrameRef = await extractLastFrame(parentNode.data.imageUrl);
            parentVideoContinuity = parentNode.data.videoContinuity ?? buildVideoContinuityFromItem({
              filename: parentNode.data.imageUrl.replace(/^\/generated\//, ""),
              prompt: parentNode.data.prompt,
              userPrompt: parentNode.data.prompt,
              revisedPrompt: parentNode.data.prompt,
              createdAt: Date.now(),
              videoContinuity: null,
            });
            continueFromVideo = parentNode.data.imageUrl.replace(/^\/generated\//, "");
          } catch { /* fallback to T2V */ }
        } else {
          parentSourceFilename = parentNode.data.imageUrl.replace(/^\/generated\//, "");
        }
      }
    }

    const startedAt = Date.now();
    const flightId = `vid_${startedAt}_${Math.random().toString(36).slice(2, 6)}`;
    const requestSessionId = get().activeSessionId;
    const nextInFlight: PersistedInFlight[] = [
      ...get().inFlight,
      { id: flightId, prompt, startedAt, kind: "video" as const, sessionId: requestSessionId, clientNodeId: nodeId ?? null },
    ];
    saveInFlight(nextInFlight);

    // Mark node as pending if in node mode
    if (node) {
      set({
        graphNodes: get().graphNodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, status: "pending" as const, pendingRequestId: flightId, pendingPhase: "queued", pendingStartedAt: startedAt, partialImageUrl: null, error: undefined } }
            : n,
        ),
      });
    }

    set({ inFlight: nextInFlight, activeGenerations: nextInFlight.length, videoProgress: 0 });
    get().startInFlightPolling();
    try {
      const result = await postVideoGenerateStream(
        {
          prompt,
          requestId: flightId,
          model: (typeof get().videoModelSelected === "string" && get().videoModelSelected) || undefined,
          referenceImages: refs.length >= 2 ? refs : undefined,
          sourceImage: refs.length === 1 ? refs[0] : parentVideoFrameRef,
          sourceFilename: refs.length === 0 && !parentVideoFrameRef ? parentSourceFilename : undefined,
          continueFromVideo,
          continuityLineage: parentVideoContinuity,
          duration: clampVideoDurationUI(get().videoDuration, mode),
          resolution: get().videoResolution,
          aspectRatio: get().videoAspectRatio,
          topic: get().videoTopic || undefined,
          storyboard: get().storyboardActive || undefined,
          sessionId: requestSessionId,
          clientNodeId: nodeId ?? null,
        },
        {
          onPlanning: () => set({ inFlight: get().inFlight.map((f) => f.id === flightId ? { ...f, phase: "planning" } : f) }),
          onSubmitted: () => set({ inFlight: get().inFlight.map((f) => f.id === flightId ? { ...f, phase: "streaming" } : f) }),
          onProgress: ({ progress }) => set({ videoProgress: progress ?? null }),
        },
      );

      // Update node with video result
      if (node && result && get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    serverNodeId: result.filename.replace(/\.[^.]+$/, ""),
                    imageUrl: result.url,
                    status: "ready" as const,
                    pendingRequestId: null,
                    pendingPhase: null,
                    pendingStartedAt: null,
                    elapsed: result.elapsed ?? undefined,
                    model: null,
                    videoContinuity: result.videoContinuity ?? parentVideoContinuity,
                    video: {
                      ...(result.video as Record<string, unknown> ?? {}),
                      ...(result.videoSeries?.topic ? { topic: result.videoSeries.topic } : {}),
                    } as ImageNodeData["video"],
                  },
                }
              : n,
          ),
        });
        get().scheduleGraphSave();
        void get().flushGraphSave("video-node-complete");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video generation failed";
      if (node && get().activeSessionId === requestSessionId) {
        set({
          graphNodes: get().graphNodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, status: "error" as const, pendingRequestId: null, pendingPhase: null, pendingStartedAt: null, error: message } }
              : n,
          ),
        });
      }
      get().showToast(message, true);
    } finally {
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set({ inFlight: remaining, activeGenerations: remaining.length, videoProgress: null });
      get().startInFlightPolling();
    }
  },
  animateImage: async (filename, prompt) => {
    const p = prompt?.trim();
    if (!p) {
      get().showToast(ACTIVE_VIDEO_PROMPT_GUIDANCE, true);
      throw new Error(ACTIVE_VIDEO_PROMPT_GUIDANCE);
    }
    const startedAt = Date.now();
    const flightId = `vid_${startedAt}_${Math.random().toString(36).slice(2, 6)}`;
    const nextInFlight: PersistedInFlight[] = [
      ...get().inFlight,
      { id: flightId, prompt: p, startedAt, kind: "video" as const, sessionId: get().activeSessionId, clientNodeId: null },
    ];
    saveInFlight(nextInFlight);
    set({ inFlight: nextInFlight, activeGenerations: nextInFlight.length, videoProgress: 0 });
    get().startInFlightPolling();
    try {
      await postVideoGenerateStream(
        { prompt: p, requestId: flightId, mode: "image-to-video", sourceFilename: filename, duration: 5, resolution: "480p", aspectRatio: "auto" },
        {
          onPlanning: () => set({ inFlight: get().inFlight.map((f) => f.id === flightId ? { ...f, phase: "planning" } : f) }),
          onSubmitted: () => set({ inFlight: get().inFlight.map((f) => f.id === flightId ? { ...f, phase: "streaming" } : f) }),
          onProgress: ({ progress }) => set({ videoProgress: progress ?? null }),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video generation failed";
      get().showToast(message, true);
    } finally {
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set({ inFlight: remaining, activeGenerations: remaining.length, videoProgress: null });
      get().startInFlightPolling();
    }
  },
  setReasoningEffort: (reasoningEffort) => {
    saveReasoningEffort(reasoningEffort);
    set({ reasoningEffort });
  },
  setWebSearchEnabled: (webSearchEnabled) => {
    saveWebSearchEnabled(webSearchEnabled);
    set({ webSearchEnabled });
  },
  setCount: (count) => {
    const next = normalizeCount(count);
    saveGenerationDefaultsPatch({ count: next });
    set({ count: next });
  },
  setMultimode: (enabled) => {
    if (enabled && get().uiMode !== "classic") return;
    saveGenerationDefaultsPatch({ multimode: enabled });
    const s = get();
    set({
      multimode: enabled,
      multimodeSequences: enabled ? s.multimodeSequences : {},
      multimodePreviewFlightId: enabled ? s.multimodePreviewFlightId : null,
    });
  },
  setMultimodeMaxImages: (count) => {
    const next = normalizeCount(count);
    saveGenerationDefaultsPatch({ multimodeMaxImages: next });
    set({ multimodeMaxImages: next });
  },
  setPromptMode: (promptMode) => {
    saveGenerationDefaultsPatch({ promptMode });
    set({ promptMode });
  },
  setPrompt: (prompt) => {
    saveGenerationDefaultsPatch({ prompt });
    set({ prompt });
  },
  insertPromptToComposer: (prompt) =>
    set((state) => {
      const exists = state.insertedPrompts.some((item) => item.id === prompt.id);
      const nextPrompt: InsertedPrompt = {
        ...prompt,
        placement: prompt.placement === "after" ? "after" : "before",
      };
      const insertedPrompts = exists
        ? state.insertedPrompts
        : [...state.insertedPrompts, nextPrompt];
      saveGenerationDefaultsPatch({ insertedPrompts });
      return {
        insertedPrompts,
      };
    }),
  removeInsertedPromptFromComposer: (id) =>
    set((state) => {
      const insertedPrompts = state.insertedPrompts.filter((prompt) => prompt.id !== id);
      saveGenerationDefaultsPatch({ insertedPrompts });
      return {
        insertedPrompts,
        videoContinuityLineage: id.startsWith("video-continuity:")
          ? null
          : state.videoContinuityLineage,
      };
    }),
  moveInsertedPromptInComposer: (id, direction) =>
    set((state) => {
      const before = state.insertedPrompts.filter((prompt) => prompt.placement !== "after");
      const after = state.insertedPrompts.filter((prompt) => prompt.placement === "after");
      const visualOrder = [
        ...before.map((prompt) => ({ kind: "prompt" as const, prompt })),
        { kind: "main" as const },
        ...after.map((prompt) => ({ kind: "prompt" as const, prompt })),
      ];
      const sourceIndex = visualOrder.findIndex(
        (item) => item.kind === "prompt" && item.prompt.id === id,
      );
      if (sourceIndex < 0) return {};
      const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
      if (targetIndex < 0 || targetIndex >= visualOrder.length) return {};
      const [moving] = visualOrder.splice(sourceIndex, 1);
      visualOrder.splice(targetIndex, 0, moving);
      const mainIndex = visualOrder.findIndex((item) => item.kind === "main");
      const insertedPrompts = visualOrder
        .filter((item): item is { kind: "prompt"; prompt: InsertedPrompt } => item.kind === "prompt")
        .map((item, index): InsertedPrompt => ({
          ...item.prompt,
          placement: index < mainIndex ? "before" : "after",
        }));
      saveGenerationDefaultsPatch({ insertedPrompts });
      return { insertedPrompts };
    }),
  clearInsertedPrompts: () => {
    saveGenerationDefaultsPatch({ insertedPrompts: [] });
    set({ insertedPrompts: [], videoContinuityLineage: null });
  },

  selectHistory: (item) => {
    const history = get().history;
    const target = item.canvasVersion
      ? resolveVisibleShortcutCurrent(history, item) ?? getVisibleGalleryItems(history)[0] ?? null
      : resolveVisibleShortcutCurrent(history, item) ?? item;
    saveSelectedFilename(target?.filename ?? null);
    const shouldRestoreComposer = resolveWorkspaceSettings(get().workspaceProfile).restoreComposerFromHistory;
    const currentPrompt = get().prompt;
    const currentInserted = get().insertedPrompts;
    const isComposerDirty = currentPrompt.trim() !== "" || currentInserted.length > 0;
    const composerPatch =
      shouldRestoreComposer && target && !isComposerDirty
        ? getHistoryComposerPatch(target)
        : {};
    const previewId = get().multimodePreviewFlightId;
    const activeSeq = previewId ? get().multimodeSequences[previewId] : null;
    const isWithinGrid = activeSeq && target && activeSeq.images.some(
      (img) => img.filename === target.filename,
    );
    set((state) => ({
      currentImage: target,
      unseenGeneratedCount: 0,
      multimodePreviewFlightId: isWithinGrid ? previewId : null,
      // Leaving a browsed-history grid: drop the orphaned "history:" preview so
      // multimodeSequences does not grow across a session (RCA 01 Defect G).
      multimodeSequences: releaseOrphanedPreview(state.multimodeSequences, previewId, Boolean(isWithinGrid)),
      ...composerPatch,
    }));
  },

  showHistorySequence: (sequenceId) => {
    const items = get().history
      .filter((item) => item.sequenceId === sequenceId && !item.canvasVersion)
      .sort(compareSequenceItems);
    if (items.length === 0) return;
    const previewId = `history:${sequenceId}`;
    const requested = Math.max(
      items.length,
      ...items.map((item) => item.sequenceTotalRequested ?? 0),
    );
    const returned = items.length;
    const status: MultimodeSequenceStatus =
      items[0]?.sequenceStatus === "empty"
        ? "empty"
        : returned >= requested
          ? "complete"
          : "partial";
    saveSelectedFilename(null);
    set((state) => ({
      currentImage: null,
      unseenGeneratedCount: 0,
      canvasOpen: false,
      multimodePreviewFlightId: previewId,
      multimodeSequences: {
        // Releasing the previously-previewed history sequence before adding the
        // new one keeps multimodeSequences from accumulating on repeated opens.
        ...releaseOrphanedPreview(state.multimodeSequences, state.multimodePreviewFlightId, false),
        [previewId]: {
          sequenceId,
          requestId: previewId,
          requested,
          returned,
          images: items,
          partials: [],
          status,
        },
      },
    }));
  },

  markGeneratedResultsSeen: () => set({ unseenGeneratedCount: 0 }),

  selectHistoryShortcutTarget: (action) => {
    const state = get();
    const workspaceSettings = resolveWorkspaceSettings(state.workspaceProfile);
    if (state.uiMode === "classic" && workspaceSettings.multimodeHistoryGrouping === "sequence") {
      const target = getSidebarHistoryShortcutTarget(
        state.history,
        state.currentImage,
        action,
        getActiveSidebarSequenceId(state),
      );
      if (!target) return;
      if (target.type === "sequence") {
        get().showHistorySequence(target.sequenceId);
        return;
      }
      get().selectHistory(target.item);
      return;
    }
    const target = getShortcutTarget(state.history, state.currentImage, action);
    if (!target) return;
    get().selectHistory(target);
  },

  trashHistoryItem: async (item) => {
    const target = item.canvasVersion ? resolveVisibleShortcutCurrent(get().history, item) : item;
    if (!target || target.canvasVersion || !target.filename) {
      get().showToast(t("gallery.deleteFailed"), true);
      return;
    }
    const filename = target.filename;
    const current = get().currentImage;
    const visibleCurrent = current ? resolveVisibleShortcutCurrent(get().history, current) ?? current : null;
    const removingCurrent = visibleCurrent?.filename === filename;
    const replacement = removingCurrent
      ? getNeighborAfterRemoval(get().history, filename)
      : current;
    try {
      await deleteHistoryItem(filename);
      set((s) => {
        const multimodeSequences = removeImageFromMultimodeSequences(s.multimodeSequences, filename);
        const multimodePreviewFlightId =
          s.multimodePreviewFlightId && !multimodeSequences[s.multimodePreviewFlightId]
            ? null
            : s.multimodePreviewFlightId;
        return {
          history: s.history.filter((h) => h.filename !== filename),
          currentImage: replacement,
          multimodePreviewFlightId,
          multimodeSequences,
          trashPending: null,
        };
      });
      if (removingCurrent) saveSelectedFilename(replacement?.filename ?? null);
      get().showToast(t("gallery.movedToSystemTrash", { filename }));
    } catch (err) {
      console.error("[history] trash failed", err);
      get().showToast(t("gallery.deleteFailed"), true);
    }
  },

  trashHistorySequence: async (sequenceId) => {
    const targets = get().history.filter((item) =>
      item.sequenceId === sequenceId && !item.canvasVersion && Boolean(item.filename),
    );
    if (targets.length === 0) {
      get().showToast(t("gallery.deleteFailed"), true);
      return;
    }
    const ok = window.confirm(t("history.deleteSequenceConfirm", { count: targets.length }));
    if (!ok) return;
    const filenames = new Set(
      targets.map((item) => item.filename).filter((filename): filename is string => Boolean(filename)),
    );
    const current = get().currentImage;
    const removingCurrent = Boolean(current?.filename && filenames.has(current.filename));
    const removingPreview =
      get().multimodePreviewFlightId === `history:${sequenceId}` ||
      get().multimodePreviewFlightId === sequenceId;
    try {
      for (const filename of filenames) {
        await deleteHistoryItem(filename);
      }
      set((state) => {
        const nextSequences = { ...state.multimodeSequences };
        delete nextSequences[`history:${sequenceId}`];
        delete nextSequences[sequenceId];
        return {
          history: state.history.filter((item) => !item.filename || !filenames.has(item.filename)),
          currentImage: removingCurrent ? null : state.currentImage,
          multimodePreviewFlightId: removingPreview ? null : state.multimodePreviewFlightId,
          multimodeSequences: nextSequences,
          trashPending: null,
        };
      });
      if (removingCurrent) saveSelectedFilename(null);
      get().showToast(t("history.sequenceDeleted", { count: filenames.size }));
    } catch (err) {
      console.error("[history] sequence trash failed", err);
      get().showToast(t("gallery.deleteFailed"), true);
    }
  },

  restorePendingTrash: async () => {
    const pending = get().trashPending;
    if (!pending) return;
    try {
      await restoreHistoryItem(pending.filename, pending.trashId);
      get().addHistoryItem(pending.item);
      set({ trashPending: null });
    } catch (err) {
      console.error("[history] restore failed", err);
      get().showToast(t("gallery.restoreFailed"), true);
    }
  },

  clearPendingTrash: () => set({ trashPending: null }),

  permanentlyDeleteHistoryItemByClick: async (item) => {
    await get().permanentlyDeleteHistoryItemByShortcut(item);
  },

  permanentlyDeleteHistoryItemByShortcut: async (item) => {
    const target = item.canvasVersion ? resolveVisibleShortcutCurrent(get().history, item) : item;
    if (!target || target.canvasVersion || !target.filename) {
      get().showToast(t("gallery.deleteFailed"), true);
      return;
    }
    const filename = target.filename;
    const ok = window.confirm(t("result.permanentDeleteConfirm", { filename }));
    if (!ok) return;
    const current = get().currentImage;
    const visibleCurrent = current ? resolveVisibleShortcutCurrent(get().history, current) ?? current : null;
    const removingCurrent = visibleCurrent?.filename === filename;
    const replacement = removingCurrent
      ? getNeighborAfterRemoval(get().history, filename)
      : current;
    try {
      await permanentlyDeleteHistoryItem(filename);
      set((s) => ({
        history: s.history.filter((h) => h.filename !== filename),
        currentImage: replacement,
        trashPending:
          s.trashPending?.filename === filename ? null : s.trashPending,
      }));
      if (removingCurrent) saveSelectedFilename(replacement?.filename ?? null);
      get().showToast(t("gallery.permanentDeleted", { filename }));
    } catch (err) {
      console.error("[history] permanent delete failed", err);
      get().showToast(t("gallery.deleteFailed"), true);
    }
  },

  removeFromHistory: (filename) => {
    const s = get();
    const history = s.history.filter((h) => h.filename !== filename);
    const stillCurrent =
      s.currentImage && s.currentImage.filename === filename ? null : s.currentImage;
    set({ history, currentImage: stillCurrent });
    if (stillCurrent === null) saveSelectedFilename(null);
  },

  addHistoryItem: (item) => {
    const s = get();
    const withDefaults: GenerateItem = {
      ...item,
      createdAt: item.createdAt || Date.now(),
    };
    const existing = findHistoryDuplicate(s.history, withDefaults);
    const merged = preserveHistoryMetadata(withDefaults, existing);
    const historyWithoutDuplicate = withoutHistoryDuplicate(s.history, merged);
    set({
      history: retainHistoryItems([merged, ...historyWithoutDuplicate], s.loadedHistoryRetainLimit + 1),
      loadedHistoryRetainLimit: Math.max(
        s.loadedHistoryRetainLimit,
        Math.min(s.history.length + 1, s.loadedHistoryRetainLimit + 1),
      ),
    });
  },

  importLocalImageToHistory: async (file) => {
    if (!file.type || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      get().showToast(t("toast.localImportInvalid"), true);
      return null;
    }
    try {
      const item = await importLocalImage(file);
      get().addHistoryItem(item);
      set({ currentImage: item, unseenGeneratedCount: 0 });
      if (item.filename) saveSelectedFilename(item.filename);
      get().showToast(t("toast.localImportSuccess"));
      return item;
    } catch {
      get().showToast(t("toast.localImportFailed"), true);
      return null;
    }
  },

  getResolvedSize: () => {
    const { provider, sizePreset, customW, customH, grokAspectRatio, grokResolution } = get();
    if (provider === "grok" || provider === "grok-api") {
      return `grok:${grokAspectRatio}:${grokResolution}`;
    }
    return sizePreset === "custom" ? `${customW}x${customH}` : sizePreset;
  },

  async generate() {
    const s = get();
    const prompt = composePrompt(s.prompt, s.insertedPrompts);
    if (!prompt) return;
    if (s.videoModelSelected) return get().runVideoGenerate();
    const useMultimode = s.uiMode === "classic" && s.multimode;
    const pending = getCustomSizeConfirmation(s, { kind: useMultimode ? "multimode" : "classic" });
    if (pending) {
      set({ customSizeConfirm: pending });
      return;
    }
    if (useMultimode) {
      await get().generateMultimode();
      return;
    }
    await get().runGenerate();
  },

  async generateMultimode(sizeOverride) {
    const s = get();
    if (s.uiMode !== "classic") return;
    const prompt = composePrompt(s.prompt, s.insertedPrompts);
    if (!prompt) return;
    const composerPrompt = s.prompt;
    const composerInsertedPrompts = cloneInsertedPrompts(s.insertedPrompts);
    const size = sizeOverride ?? s.getResolvedSize();
    const flightId = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const controller = new AbortController();
    const startedAt = Date.now();
    const requested = normalizeCount(s.multimodeMaxImages);
    const nextInFlight: PersistedInFlight[] = [
      ...s.inFlight,
      {
        id: flightId,
        prompt,
        startedAt,
        kind: "multimode",
        composerPrompt,
        composerInsertedPrompts,
      },
    ];
    const initialSequence: MultimodeSequenceState = {
      sequenceId: flightId,
      requestId: flightId,
      requested,
      returned: 0,
      images: [],
      partials: [],
      status: "pending",
    };
    saveInFlight(nextInFlight);
    set({
      activeGenerations: s.activeGenerations + 1,
      inFlight: nextInFlight,
      multimodeAbortControllers: { ...s.multimodeAbortControllers, [flightId]: controller },
      multimodeSequences: { ...s.multimodeSequences, [flightId]: initialSequence },
      multimodePreviewFlightId: flightId,
    });
    get().startInFlightPolling();

    try {
      const res: MultimodeGenerateResponse = await postMultimodeGenerateStream(
        {
          prompt,
          quality: s.quality,
          size,
          format: s.format,
          moderation: s.moderation,
          provider: s.provider,
          maxImages: requested,
          model: s.imageModel,
          reasoningEffort: s.reasoningEffort,
          webSearchEnabled: s.webSearchEnabled,
          requestId: flightId,
          mode: s.promptMode,
          composerPrompt,
          composerInsertedPrompts,
          ...(s.referenceImages.length
            ? { references: s.referenceImages.map(stripDataUrlPrefix) }
            : {}),
        },
        {
          onPartial: (partial) => {
            set((state) => {
              const current = state.multimodeSequences[flightId];
              if (!current) return {};
              return {
                multimodeSequences: {
                  ...state.multimodeSequences,
                  [flightId]: {
                    ...current,
                    partials: [
                      ...current.partials,
                      { image: partial.image, index: partial.index ?? null },
                    ].slice(-requested),
                  },
                },
              };
            });
          },
          onImage: (image) => {
            set((state) => {
              const current = state.multimodeSequences[flightId];
              if (!current) return {};
              const images = mergeMultimodeImages(current.images, [image]);
              if (images.length === current.images.length) return {};
              return {
                multimodeSequences: {
                  ...state.multimodeSequences,
                  [flightId]: {
                    ...current,
                    sequenceId: image.sequenceId ?? current.sequenceId,
                    returned: images.length,
                    images,
                    status: "partial",
                  },
                },
              };
            });
          },
        },
        { signal: controller.signal },
      );

      const items = res.images.map((image) => ({
        ...image,
        prompt,
        elapsed: Number.parseFloat(res.elapsed),
        provider: res.provider,
        usage: res.usage,
        requestId: image.requestId ?? res.requestId ?? flightId,
        composerPrompt,
        composerInsertedPrompts,
        quality: res.quality,
        size: res.size,
        model: res.model ?? null,
      }));
      for (const item of items) {
        await addHistory(item, set, get);
      }
      set((state) => ({
        multimodeSequences: {
          ...state.multimodeSequences,
          [flightId]: (() => {
            const current = state.multimodeSequences[flightId];
            const images = mergeMultimodeImages(current?.images ?? [], items);
            return {
              sequenceId: res.sequenceId,
              requestId: flightId,
              requested: res.requested,
              returned: images.length,
              images,
              partials: [],
              status: res.status,
              elapsed: res.elapsed,
            };
          })(),
        },
      }));
      const toastKey = res.status === "complete" ? "multimode.complete" : "multimode.partial";
      get().showToast(t(toastKey, { returned: res.returned, requested: res.requested, elapsed: res.elapsed }));
    } catch (err) {
      if ((err as Error).name === "AbortError" || isCanceledGenerationError(err)) {
        set((state) => {
          const current = state.multimodeSequences[flightId];
          if (!current) return {};
          return {
            multimodeSequences: {
              ...state.multimodeSequences,
              [flightId]: {
                ...current,
                status: "canceled",
              },
            },
          };
        });
      } else {
        set((state) => {
          const current = state.multimodeSequences[flightId];
          if (!current) return {};
          return {
            multimodeSequences: {
              ...state.multimodeSequences,
              [flightId]: { ...current, status: "error", error: (err as Error).message },
            },
          };
        });
        handleError(err, get());
      }
    } finally {
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set((state) => {
        const nextControllers = { ...state.multimodeAbortControllers };
        delete nextControllers[flightId];
        let nextPreview = state.multimodePreviewFlightId;
        const finalStatus = state.multimodeSequences[flightId]?.status;
        const isCleanFinish = finalStatus === "complete" || finalStatus === "partial";
        if (nextPreview === flightId && !isCleanFinish) {
          const fallbackIds = Object.keys(nextControllers);
          nextPreview = fallbackIds.length > 0
            ? fallbackIds[fallbackIds.length - 1]
            : null;
        }
        const nextSequences = { ...state.multimodeSequences };
        if (isCleanFinish && nextPreview !== flightId) {
          delete nextSequences[flightId];
        }
        return {
          activeGenerations: Math.max(0, state.activeGenerations - 1),
          inFlight: remaining,
          multimodeAbortControllers: nextControllers,
          multimodePreviewFlightId: nextPreview,
          multimodeSequences: nextSequences,
        };
      });
    }
  },

  cancelMultimode: () => {
    const flightId = get().multimodePreviewFlightId;
    if (!flightId) return;
    get().multimodeAbortControllers[flightId]?.abort();
    void get().cancelInFlightJob(flightId);
    set((state) => {
      const current = state.multimodeSequences[flightId];
      if (!current) return {};
      return {
        multimodeSequences: {
          ...state.multimodeSequences,
          [flightId]: {
            ...current,
            status: "canceled",
          },
        },
      };
    });
  },

  async runGenerate(sizeOverride) {
    const s = get();
    const prompt = composePrompt(s.prompt, s.insertedPrompts);
    if (!prompt) return;
    const composerPrompt = s.prompt;
    const composerInsertedPrompts = cloneInsertedPrompts(s.insertedPrompts);

    const size = sizeOverride ?? s.getResolvedSize();

    const flightId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = Date.now();
    const nextInFlight: PersistedInFlight[] = [
      ...s.inFlight,
      { id: flightId, prompt, startedAt, composerPrompt, composerInsertedPrompts },
    ];
    saveInFlight(nextInFlight);
    set({
      activeGenerations: s.activeGenerations + 1,
      inFlight: nextInFlight,
    });
    get().startInFlightPolling();

    try {
      const payload = {
        prompt,
        quality: s.quality,
        size,
        format: s.format,
        moderation: s.moderation,
        provider: s.provider,
        n: s.count,
        model: s.imageModel,
        reasoningEffort: s.reasoningEffort,
        storyboard: s.storyboardActive || undefined,
        webSearchEnabled: s.webSearchEnabled,
        requestId: flightId,
        mode: s.promptMode,
        composerPrompt,
        composerInsertedPrompts,
        ...(s.referenceImages.length
          ? { references: s.referenceImages.map(stripDataUrlPrefix) }
          : {}),
      };

      const res: GenerateResponse = await postGenerate(payload);

      if (isMultiResponse(res) && res.images.length > 1) {
        for (const img of res.images) {
          const item: GenerateItem = {
            image: img.image,
            filename: img.filename,
            reasoningEffort: res.reasoningEffort,
            prompt,
            composerPrompt,
            composerInsertedPrompts,
            elapsed: res.elapsed,
            provider: res.provider,
            usage: res.usage,
            requestId: res.requestId ?? flightId,
            quality: res.quality,
            size: res.size,
            model: res.model ?? null,
          };
          await addHistory(item, set, get);
        }
        get().showToast(t("toast.generatedBatch", { count: res.images.length, elapsed: res.elapsed }));
      } else {
        let item: GenerateItem;
        if (isMultiResponse(res)) {
          const first = res.images[0];
          item = {
            image: first.image,
            filename: first.filename,
            reasoningEffort: res.reasoningEffort,
            prompt,
            composerPrompt,
            composerInsertedPrompts,
            elapsed: res.elapsed,
            provider: res.provider,
            usage: res.usage,
            requestId: res.requestId ?? flightId,
            quality: res.quality,
            size: res.size,
            model: res.model ?? null,
          };
        } else {
          item = {
            image: res.image,
            filename: res.filename,
            reasoningEffort: res.reasoningEffort,
            prompt,
            composerPrompt,
            composerInsertedPrompts,
            elapsed: res.elapsed,
            provider: res.provider,
            usage: res.usage,
            requestId: res.requestId ?? flightId,
            quality: res.quality,
            size: res.size,
            model: res.model ?? null,
          };
        }
        await addHistory(item, set, get);
        get().showToast(t("toast.generatedSingle", { elapsed: res.elapsed }));
      }
    } catch (err) {
      if (!isCanceledGenerationError(err)) handleError(err, get());
    } finally {
      const remaining = get().inFlight.filter((f) => f.id !== flightId);
      saveInFlight(remaining);
      set({
        activeGenerations: Math.max(0, get().activeGenerations - 1),
        inFlight: remaining,
      });
    }
  },

  async confirmCustomSizeAdjustment() {
    const pending = get().customSizeConfirm;
    if (!pending) return;
    const adjustedSize = formatSize(pending.adjustedW, pending.adjustedH);
    set({
      customW: pending.adjustedW,
      customH: pending.adjustedH,
      customSizeConfirm: null,
    });
    if (pending.continuation.kind === "classic") {
      await get().runGenerate(adjustedSize);
      return;
    }
    if (pending.continuation.kind === "multimode") {
      await get().generateMultimode(adjustedSize);
      return;
    }
    if (pending.continuation.kind === "node-in-place") {
      await get().runGenerateNodeInPlace(pending.continuation.clientId, {
        sizeOverride: adjustedSize,
      });
      return;
    }
    if (pending.continuation.kind === "node-variation") {
      await get().generateNodeVariation(pending.continuation.clientId, adjustedSize);
      return;
    }
    await get().runGenerateNode(pending.continuation.clientId, adjustedSize);
  },

  cancelCustomSizeAdjustment: () => set({ customSizeConfirm: null }),

  hydrateHistory() {
    void (async () => {
      try {
        const res = await getHistory({ limit: HISTORY_LIMIT });
        const history: GenerateItem[] = res.items.map(mapHistoryItem);
        set({ historyNextCursor: res.nextCursor, loadedHistoryRetainLimit: HISTORY_LIMIT });
        if (history.length > 0) {
          const selected = loadSelectedFilename();
          const matched = selected
            ? history.find((it) => it.filename === selected)
            : null;
          const visibleHistory = getVisibleGalleryItems(history);
          const currentImage =
            (matched ? resolveVisibleShortcutCurrent(history, matched) : null) ??
            visibleHistory[0] ??
            null;
          set({
            history,
            currentImage,
            historyNextCursor: res.nextCursor,
            loadedHistoryRetainLimit: Math.max(HISTORY_LIMIT, history.length),
          });
          if (currentImage?.filename !== selected) {
            saveSelectedFilename(currentImage?.filename ?? null);
          }
        }
      } catch (err) {
        console.warn("[history] load failed:", err);
      }
    })();
  },

  showToast(message, error = false) {
    const createdAt = Date.now();
    const entry = { message, error, id: createdAt + Math.random(), createdAt };
    set((s) => ({ toast: entry, toastLog: [...s.toastLog, entry].slice(-50) }));
  },
  dismissToast(id) {
    set((s) => {
      const toastLog = s.toastLog.filter((toast) => toast.id !== id);
      return {
        toastLog,
        toast: s.toast?.id === id ? toastLog[toastLog.length - 1] ?? null : s.toast,
      };
    });
  },
  showErrorCard(code, params) {
    const createdAt = Date.now();
    const entry = { code, fallbackMessage: params?.fallbackMessage, id: createdAt + Math.random(), createdAt };
    set((s) => ({ errorCard: entry, errorCardLog: [...s.errorCardLog, entry] }));
  },
  dismissErrorCard(id) {
    set((s) => {
      if (id == null) return { errorCard: null, errorCardLog: [] };
      const errorCardLog = s.errorCardLog.filter((card) => card.id !== id);
      return {
        errorCardLog,
        errorCard: s.errorCard?.id === id ? errorCardLog[errorCardLog.length - 1] ?? null : s.errorCard,
      };
    });
  },

  // ── Workspace Profile actions ──
  setWorkspaceProfile(profile) {
    set({ workspaceProfile: profile });
    try { localStorage.setItem("ima2.workspaceProfile", profile); } catch { /* non-critical */ }
  },
  togglePromptBuilder() {
    set((s) => ({ promptBuilderOpen: !s.promptBuilderOpen }));
  },
  toggleStoryboard() {
    set((s) => ({ storyboardActive: !s.storyboardActive }));
  },

  // ── Prompt Library actions (0.23) ──
  setPromptLibraryOpen(open) {
    set({ promptLibraryOpen: open });
  },
  togglePromptLibrary() {
    set((s) => ({ promptLibraryOpen: !s.promptLibraryOpen }));
  },

  async loadPromptLibrary() {
    set({ promptLibraryLoading: true });
    try {
      const data = await getPromptLibrary();
      set({ promptLibrary: { prompts: data.prompts, folders: data.folders }, promptLibraryLoading: false });
    } catch (err) {
      console.error("[PromptLibrary] load failed", err);
      set({ promptLibraryLoading: false });
    }
  },

  async savePromptToLibrary(payload) {
    try {
      await createPrompt(payload);
      await get().loadPromptLibrary();
      get().showToast(t("promptLibrary.saved"));
    } catch (err) {
      console.error("[PromptLibrary] save failed", err);
      get().showToast(t("promptLibrary.saveFailed"), true);
    }
  },

  async deletePromptFromLibrary(id) {
    try {
      await deletePrompt(id);
      await get().loadPromptLibrary();
    } catch (err) {
      console.error("[PromptLibrary] delete failed", err);
    }
  },

  async togglePromptFavorite(id) {
    try {
      await togglePromptFavorite(id);
      await get().loadPromptLibrary();
    } catch (err) {
      console.error("[PromptLibrary] favorite toggle failed", err);
    }
  },

  async importPromptsToLibrary(files) {
    try {
      const prompts: Array<{ name: string; text: string; tags: string[] }> = [];
      for (const file of files) {
        if (!/\.(txt|md|markdown)$/i.test(file.name)) continue;
        const text = await file.text();
        if (!text.trim()) continue;
        const name = file.name.replace(/\.(txt|md|markdown)$/i, "");
        prompts.push({ name: name.trim() || t("promptLibrary.untitled"), text: text.trim(), tags: [] });
      }
      if (prompts.length === 0) {
        get().showToast(t("promptLibrary.importNoValidFiles"), true);
        return;
      }
      const result = await importPromptLibrary({ prompts });
      await get().loadPromptLibrary();
      get().showToast(t("promptLibrary.imported", { count: result.promptsImported }));
    } catch (err) {
      console.error("[PromptLibrary] import failed", err);
      get().showToast(t("promptLibrary.importFailed"), true);
    }
  },

  async toggleGalleryFavorite(filename) {
    try {
      const result = await toggleGalleryFavorite(filename);
      set((s) => {
        const next = new Set(s.galleryFavorites);
        if (result.isFavorite) next.add(filename);
        else next.delete(filename);
        return { galleryFavorites: next };
      });
      // Also update history items in place
      set((s) => ({
        history: s.history.map((h) =>
          h.filename === filename ? { ...h, isFavorite: result.isFavorite } : h,
        ),
      }));
    } catch (err) {
      console.error("[GalleryFavorite] toggle failed", err);
    }
  },

  // Canvas Mode actions (0.24)
  openCanvas: () => set({ canvasOpen: true, canvasZoom: 1, canvasPanX: 0, canvasPanY: 0 }),
  closeCanvas: () => set({ canvasOpen: false }),
  setCanvasZoom: (zoom) => set({ canvasZoom: Math.max(0.5, Math.min(3, zoom)) }),
  resetCanvasZoom: () => set({ canvasZoom: 1, canvasPanX: 0, canvasPanY: 0 }),
  setCanvasPan: (x, y) => {
    const cap = 4000;
    set({
      canvasPanX: Math.max(-cap, Math.min(cap, x)),
      canvasPanY: Math.max(-cap, Math.min(cap, y)),
    });
  },
  resetCanvasPan: () => set({ canvasPanX: 0, canvasPanY: 0 }),
  setCanvasExportBackground: (mode) => {
    set({ canvasExportBackground: mode });
    persistCanvasExportBackground(mode, get().canvasExportMatteColor);
  },
  setCanvasExportMatteColor: (color) => {
    set({ canvasExportMatteColor: color });
    persistCanvasExportBackground(get().canvasExportBackground, color);
  },
}));

// ── Graph autosave (module-level debounce) ──
const SAVE_DEBOUNCE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isSavingGraph = false;
let needsGraphSave = false;
let activeGraphSavePromise: Promise<void> | null = null;
let graphSaveSeq = 0;

function getGraphTabId(): string {
  try {
    const existing = sessionStorage.getItem(GRAPH_TAB_ID_KEY);
    if (existing) return existing;
    const next = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(GRAPH_TAB_ID_KEY, next);
    return next;
  } catch {
    return "tab_unavailable";
  }
}

// Sanitize a node's data for PUT /api/sessions/:id/graph payload.
// pending / reconciling states are *transient* — persisting them to disk
// makes reloaded graphs look like aborted work and trips reconcileGraphPending.
// This function is payload-only: the in-memory `graphNodes` is NOT touched.
function sanitizeForSave(d: ImageNodeData): Record<string, unknown> {
  const safe = { ...(d as unknown as Record<string, unknown>) };
  delete safe.referenceImages;
  delete safe.partialImageUrl;
  const shouldSanitize = d.status === "pending" || d.status === "reconciling";
  if (!shouldSanitize) return safe;
  return {
    ...safe,
    status: "empty",
    pendingRequestId: null,
    recoveryRequestId: d.pendingRequestId ?? d.recoveryRequestId ?? null,
    pendingPhase: null,
    pendingStartedAt: null,
    error: undefined,
  };
}

function serializeGraphEdgesForSave(graphEdges: GraphEdge[]): SessionGraphEdge[] {
  return graphEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: {
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    },
  }));
}

// Recover nodes whose asset lives on disk (via /api/history) but whose
// client-side state was lost (A sanitize, reload, HMR, conflict reload).
// Candidate = node with neither imageUrl nor serverNodeId. Match requestId
// first, then fall back to (sessionId, clientNodeId, createdAt) so stale
// retry assets do not overwrite a newer pending node.
async function recoverGraphNodesFromHistory(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
): Promise<void> {
  const sid = get().activeSessionId;
  if (!sid) return;
  const candidates = get().graphNodes.filter(
    (n) => !n.data.imageUrl && !n.data.serverNodeId,
  );
  if (candidates.length === 0) return;

  let items: Array<{
    url: string;
    createdAt: number;
    size?: string | null;
    elapsed?: number | null;
    reasoningEffort?: string | null;
    sessionId?: string | null;
    nodeId?: string | null;
    clientNodeId?: string | null;
    requestId?: string | null;
  }> = [];
  try {
    const res = await getHistory({ sessionId: sid, limit: HISTORY_LIMIT });
    items = res.items;
  } catch {
    // History fetch failure is non-fatal — leave nodes as they are.
    return;
  }

  let changed = false;
  const next = get().graphNodes.map((n) => {
    if (n.data.imageUrl || n.data.serverNodeId) return n;
    const startedAt = n.data.pendingStartedAt ?? 0;
    const requestKey = n.data.pendingRequestId ?? n.data.recoveryRequestId ?? null;
    const byRequest = requestKey
      ? items.find(
          (h) =>
            (h.sessionId ?? null) === sid &&
            (h.requestId ?? null) === requestKey,
        )
      : null;
    const recovered = byRequest ?? items.find(
      (h) =>
        (h.sessionId ?? null) === sid &&
        (h.clientNodeId ?? null) === n.id &&
        (!startedAt || (h.createdAt ?? 0) >= startedAt),
    );
    if (!recovered) return n;
    changed = true;
    return {
      ...n,
      data: {
        ...n.data,
        status: "ready" as const,
        imageUrl: recovered.url, // canonical — jpeg/webp all covered
        serverNodeId: recovered.nodeId ?? n.data.serverNodeId,
        size: recovered.size ?? n.data.size ?? null,
        elapsed: recovered.elapsed ?? n.data.elapsed,
        reasoningEffort: (recovered.reasoningEffort as ImageNodeData["reasoningEffort"]) ?? n.data.reasoningEffort,
        video: (recovered as any).video ?? n.data.video ?? null,
        pendingRequestId: null,
        recoveryRequestId: null,
        pendingPhase: null,
        pendingStartedAt: null,
        partialImageUrl: null,
        error: undefined,
      },
    };
  });

  if (!changed) return;
  set({ graphNodes: next });
  // Persist the recovered imageUrl so future reloads don't need to re-recover.
  scheduleGraphSaveImpl(get, set, "recovery");
}

async function reloadSessionAfterConflict(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
): Promise<void> {
  const id = get().activeSessionId;
  if (!id) return;
  const { session } = await apiGetSession(id);
  const { graphNodes, graphEdges, graphVersion } = mapSessionToGraph(session);
  set({
    graphNodes,
    graphEdges,
    activeSessionGraphVersion: graphVersion,
  });
  get().showToast(t("toast.sessionReloadedElsewhere"), true);
  // A graph version conflict only proves the client saved against an older
  // version. Reload first, then repair node assets from requestId history.
  await recoverGraphNodesFromHistory(get, set).catch(() => {});
}

async function doSave(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason,
): Promise<GraphSaveResult> {
  const id = get().activeSessionId;
  const graphVersion = get().activeSessionGraphVersion;
  if (!id) return "skipped";
  if (graphVersion == null) return "skipped";
  const { graphNodes, graphEdges, sessionLoading } = get();
  if (sessionLoading) return "skipped";
  if (graphNodes.length === 0 && graphVersion > 0) return "skipped";
  const nodes = graphNodes.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    data: sanitizeForSave(n.data),
  }));
  const edges = serializeGraphEdgesForSave(graphEdges);
  const saveId = `gs_${Date.now().toString(36)}_${++graphSaveSeq}`;
  try {
    const res = await saveSessionGraph(id, graphVersion, nodes, edges, {
      saveId,
      saveReason: reason,
      tabId: getGraphTabId(),
    });
    if (get().activeSessionId !== id) return "skipped";
    pruneNodeRefs(id, get().graphNodes.map((n) => n.id));
    set({ activeSessionGraphVersion: res.graphVersion });
    return "saved";
  } catch (err) {
    if ((err as { status?: number }).status === 409) {
      await reloadSessionAfterConflict(get, set);
      return "conflict";
    }
    console.warn("[sessions] save failed:", err);
    return "failed";
  }
}

async function runGraphSaveQueue(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason,
): Promise<void> {
  if (isSavingGraph) {
    needsGraphSave = true;
    if (activeGraphSavePromise) await activeGraphSavePromise;
    return;
  }

  isSavingGraph = true;
  activeGraphSavePromise = (async () => {
    let nextReason = reason;
    do {
      needsGraphSave = false;
      const result = await doSave(get, set, nextReason);
      if (result === "conflict" || result === "failed") break;
      nextReason = "queued";
    } while (needsGraphSave);
  })().finally(() => {
    isSavingGraph = false;
    activeGraphSavePromise = null;
  });

  await activeGraphSavePromise;
}

function scheduleGraphSaveImpl(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason = "debounced",
) {
  const s = get();
  if (!s.activeSessionId) return;
  if (s.sessionLoading) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void runGraphSaveQueue(get, set, reason);
  }, SAVE_DEBOUNCE_MS);
}

async function flushGraphSaveImpl(
  get: () => AppState,
  set: (patch: Partial<AppState>) => void,
  reason: GraphSaveReason = "manual",
) {
  let shouldSaveNow = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    shouldSaveNow = true;
  }
  if (isSavingGraph) {
    needsGraphSave = true;
    if (activeGraphSavePromise) await activeGraphSavePromise;
    return;
  }
  if (shouldSaveNow) {
    await runGraphSaveQueue(get, set, reason);
  }
}

// Synchronous-ish save on page unload via sendBeacon
// (fetch in beforeunload is not reliable in modern browsers).
export function flushGraphSaveBeacon(get: () => AppState): void {
  const s = get();
  if (!s.activeSessionId) return;
  if (s.activeSessionGraphVersion == null) return;
  if (s.sessionLoading) return;
  if (s.graphNodes.length === 0 && s.activeSessionGraphVersion > 0) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const nodes = s.graphNodes.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    data: sanitizeForSave(n.data),
  }));
  const edges = serializeGraphEdgesForSave(s.graphEdges);
  const url = `/api/sessions/${encodeURIComponent(s.activeSessionId)}/graph`;
  const body = JSON.stringify({ nodes, edges });
  try {
    void fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": String(s.activeSessionGraphVersion),
        "X-Ima2-Graph-Save-Id": `gs_${Date.now().toString(36)}_${++graphSaveSeq}`,
        "X-Ima2-Graph-Save-Reason": "beforeunload",
        "X-Ima2-Tab-Id": getGraphTabId(),
      },
      body,
      keepalive: true,
    });
  } catch {}
}

async function addHistory(
  item: GenerateItem,
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
): Promise<void> {
  // Videos must not get an <img>-based thumb: compressImage loads the mp4 into
  // an <img>, fails, and resolves to the raw url, which then both bypasses the
  // <video> placeholder and fires a broken lazy <img src=*.mp4> (RCA 01 Defect
  // E nuance). Leave thumb undefined so the UI renders the static placeholder
  // until the server backfills a real thumbnail.
  const thumb = isVideoItem(item)
    ? undefined
    : await compressImage(item.image).catch(() => item.image);
  const url = item.filename ? `/generated/${item.filename}` : item.image;
  const withThumb: GenerateItem = {
    ...item,
    thumb,
    url,
    createdAt: item.createdAt || Date.now(),
  };
  const state = get();
  const existing = findHistoryDuplicate(state.history, withThumb);
  const merged = preserveHistoryMetadata(withThumb, existing);
  const historyWithoutDuplicate = withoutHistoryDuplicate(state.history, merged);
  const history = retainHistoryItems(
    [merged, ...historyWithoutDuplicate],
    state.loadedHistoryRetainLimit + 1,
  );
  saveSelectedFilename(merged.filename ?? null);
  set({
    history,
    currentImage: merged,
    loadedHistoryRetainLimit: Math.max(
      state.loadedHistoryRetainLimit,
      Math.min(state.history.length + 1, state.loadedHistoryRetainLimit + 1),
    ),
    unseenGeneratedCount: get().unseenGeneratedCount + 1,
  });
}

export function selectCurrentSessionId(state: AppState): string | null {
  for (const item of state.history) {
    if (item.sessionId) return item.sessionId;
  }
  return null;
}
