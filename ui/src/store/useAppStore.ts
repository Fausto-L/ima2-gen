// All localStorage keys this store touches MUST be listed in
// ./persistenceRegistry.ts. The contract test
// tests/settings-persistence-contract.test.js enforces this invariant.
// Legacy generation-controls contract: GENERATION_DEFAULTS_STORAGE_KEY = "ima2.generationDefaults".
import { create } from "zustand";
import type {
  GenerateItem,
  MultimodeSequenceStatus,
  VideoResolutionUI,
} from "../types";
import {
  cancelInflight,
  getBrowserId,
  getPromptLibrary,
  createPrompt,
  deletePrompt,
  togglePromptFavorite,
  toggleGalleryFavorite,
  importPromptLibrary,
} from "../lib/api";
import { parseRequestedCustomSide } from "../lib/size";
import {
  DEFAULT_IMAGE_MODEL,
  isGrokImageModel,
  isGeminiImageModel,
} from "../lib/imageModels";
import {
  GALLERY_DEFAULT_SCOPE_STORAGE_KEY,
  GALLERY_SCOPE_STORAGE_KEY,
  HISTORY_STRIP_LAYOUT_STORAGE_KEY,
  RIGHT_PANEL_OPEN_STORAGE_KEY,
  THEME_FAMILY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  UI_MODE_STORAGE_KEY,
} from "./persistenceRegistry";
import type { ClientNodeId } from "../lib/graph";
import {
  deriveParentServerNodeIds,
} from "../lib/nodeGraph";
import {
  applyComponentSelection,
  applySelectedNodeIds,
  getSelectedNodeIds,
} from "../lib/nodeSelection";
import { t, loadLocale, saveLocale } from "../i18n";
import { ENABLE_AGENT_MODE, ENABLE_CARD_NEWS_MODE, ENABLE_NODE_MODE } from "../lib/devMode";
import {
  getVisibleGalleryItems,
  resolveVisibleShortcutCurrent,
} from "../lib/galleryShortcuts";
import {
  type InsertedPrompt,
  composePrompt,
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
  loadVideoDefaults,
  saveVideoDefaults,
  resolveThemePreference,
  loadSelectedFilename,
  saveSelectedFilename,
  formatSize,
  normalizeCount,
  loadGenerationDefaults,
  saveGenerationDefaultsPatch,
} from "./storePersistence";
import {
  loadInFlight,
  HISTORY_LIMIT,
  MAX_REFERENCE_IMAGES,
  retainHistoryItems,
  saveInFlight,
  getCustomSizeConfirmation,
} from "./storeHelpers";
import {
  scheduleGraphSaveImpl,
  flushGraphSaveImpl,
  addHistory,
} from "./storeGraphSave";
import {
  runGenerateNodeInPlaceImpl,
  runNodeBatchImpl,
} from "./storeNodeGenImpl";
import {
  generateMultimodeImpl,
  runGenerateImpl,
} from "./storeGenImpl";
import {
  runVideoGenerateImpl,
  animateImageImpl,
} from "./storeVideoImpl";
import {
  startInFlightPollingImpl,
  reconcileInflightImpl,
} from "./storeInflightImpl";
import {
  addRootNodeImpl,
  createRootNodeFromHistoryItemImpl,
  addChildNodeImpl,
  addSiblingNodeImpl,
  addChildNodeAtImpl,
  duplicateBranchRootImpl,
  updateNodePromptImpl,
  addNodeReferencesImpl,
  addNodeReferenceDataUrlImpl,
  removeNodeReferenceImpl,
  clearNodeReferencesImpl,
  deleteNodeImpl,
  deleteNodesImpl,
  disconnectEdgesImpl,
  connectNodesImpl,
} from "./storeGraphNodeImpl";
import {
  loadOlderHistoryImpl,
  loadFavoriteHistoryImpl,
  loadOlderFavoriteHistoryImpl,
  selectHistoryImpl,
  showHistorySequenceImpl,
  selectHistoryShortcutTargetImpl,
  trashHistoryItemImpl,
  trashHistorySequenceImpl,
  restorePendingTrashImpl,
  permanentlyDeleteHistoryItemImpl,
  removeFromHistoryImpl,
  addHistoryItemImpl,
  importLocalImageToHistoryImpl,
  hydrateHistoryImpl,
} from "./storeHistoryImpl";
import {
  loadSessionsImpl,
  switchSessionImpl,
  reconcileGraphPendingImpl,
  createAndSwitchSessionImpl,
  renameCurrentSessionImpl,
  deleteSessionByIdImpl,
} from "./storeSessionImpl";
import {
  addReferencesImpl,
  readDroppedImageMetadataImpl,
  applyMetadataRestoreImpl,
  removeReferenceImpl,
  clearReferencesImpl,
  attachCanvasVersionReferenceImpl,
  useCurrentAsReferenceImpl,
  useImageAsReferenceImpl,
} from "./storeReferenceImpl";

export type { GalleryScope, ComposeSheetTab, ImageNodeStatus, ImageNodeData, GraphNode, GraphEdge, MultimodeSequenceState } from "./storeTypes";
export { flushGraphSaveBeacon, selectCurrentSessionId } from "./storeGraphSave";
import type { AppState, GraphNode, GraphEdge } from "./storeTypes";
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

  addReferences: (files) => addReferencesImpl(files, set, get),
  addReferenceDataUrl: (dataUrl) => {
    set((s) =>
      s.referenceImages.length >= MAX_REFERENCE_IMAGES
        ? s
        : { referenceImages: [...s.referenceImages, dataUrl] },
    );
  },
  metadataRestore: null,
  readDroppedImageMetadata: (file, targetNodeId = null) => readDroppedImageMetadataImpl(file, targetNodeId, set, get),
  applyMetadataRestore: () => applyMetadataRestoreImpl(set, get),
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
  removeReference: (index) => removeReferenceImpl(index, set, get),
  clearReferences: () => clearReferencesImpl(set, get),
  attachCanvasVersionReference: (item) => attachCanvasVersionReferenceImpl(item, set, get),
  useCurrentAsReference: () => useCurrentAsReferenceImpl(set, get),
  useImageAsReference: (item) => useImageAsReferenceImpl(item, set, get),
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
    startInFlightPollingImpl(set, get);
  },
  reconcileInflight: async () => {
    await reconcileInflightImpl(set, get);
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
  loadOlderHistory: async () => loadOlderHistoryImpl(set, get),
loadFavoriteHistory: async () => loadFavoriteHistoryImpl(set, get),
loadOlderFavoriteHistory: async () => loadOlderFavoriteHistoryImpl(set, get),
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
  disconnectEdges: (edgeIds) => disconnectEdgesImpl(edgeIds, set, get),
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

  async loadSessions() { await loadSessionsImpl(set, get); },
async switchSession(id) { await switchSessionImpl(id, set, get); },
async reconcileGraphPending() { await reconcileGraphPendingImpl(set, get); },
async createAndSwitchSession(title?: string) { await createAndSwitchSessionImpl(title, set, get); },
async renameCurrentSession(title) { await renameCurrentSessionImpl(title, set, get); },
async deleteSessionById(id) { await deleteSessionByIdImpl(id, set, get); },
scheduleGraphSave() {
    scheduleGraphSaveImpl(get, set);
  },

  async flushGraphSave(reason = "manual") {
    await flushGraphSaveImpl(get, set, reason);
  },

  addRootNode: () => addRootNodeImpl(set, get),
createRootNodeFromHistoryItem: (item) => createRootNodeFromHistoryItemImpl(item, set, get),
addChildNode: (parentClientId) => addChildNodeImpl(parentClientId, set, get),

  addSiblingNode: (sourceClientId) => addSiblingNodeImpl(sourceClientId, set, get),

  updateNodePrompt: (clientId, prompt) => updateNodePromptImpl(clientId, prompt, set, get),
addNodeReferences: async (clientId, files) => addNodeReferencesImpl(clientId, files, set, get),
addNodeReferenceDataUrl: (clientId, dataUrl) => addNodeReferenceDataUrlImpl(clientId, dataUrl, set, get),
removeNodeReference: (clientId, index) => removeNodeReferenceImpl(clientId, index, set, get),
clearNodeReferences: (clientId) => clearNodeReferencesImpl(clientId, set, get),
duplicateBranchRoot: (sourceClientId) => duplicateBranchRootImpl(sourceClientId, set, get),

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
    return runGenerateNodeInPlaceImpl(clientId, options, set, get, saveInFlight);
  },

  async runNodeBatch(mode) {
    await runNodeBatchImpl(mode, set, get);
  },

  deleteNode: (clientId) => deleteNodeImpl(clientId, set, get),
deleteNodes: (clientIds) => deleteNodesImpl(clientIds, set, get),
addChildNodeAt: (parentClientId, position, sourceHandle) => addChildNodeAtImpl(parentClientId, position, sourceHandle, set, get),

  connectNodes: (sourceClientId, targetClientId, sourceHandle, targetHandle) => connectNodesImpl(sourceClientId, targetClientId, sourceHandle, targetHandle, set, get),
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
    await runVideoGenerateImpl(nodeId, set, get);
  },
  animateImage: async (filename, prompt) => {
    await animateImageImpl(filename, prompt, set, get);
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

  selectHistory: (item) => selectHistoryImpl(item, set, get),
showHistorySequence: (sequenceId) => showHistorySequenceImpl(sequenceId, set, get),
markGeneratedResultsSeen: () => set({ unseenGeneratedCount: 0 }),

  selectHistoryShortcutTarget: (action) => selectHistoryShortcutTargetImpl(action, set, get),
trashHistoryItem: async (item) => trashHistoryItemImpl(item, set, get),
trashHistorySequence: async (sequenceId) => trashHistorySequenceImpl(sequenceId, set, get),
restorePendingTrash: async () => restorePendingTrashImpl(set, get),
clearPendingTrash: () => set({ trashPending: null }),

  permanentlyDeleteHistoryItemByClick: async (item) => {
    await get().permanentlyDeleteHistoryItemByShortcut(item);
  },

  permanentlyDeleteHistoryItemByShortcut: async (item) => permanentlyDeleteHistoryItemImpl(item, set, get),
removeFromHistory: (filename) => removeFromHistoryImpl(filename, set, get),
addHistoryItem: (item) => addHistoryItemImpl(item, set, get),
importLocalImageToHistory: async (file) => importLocalImageToHistoryImpl(file, set, get),

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
    await generateMultimodeImpl(sizeOverride, set, get);
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
    await runGenerateImpl(sizeOverride, set, get);
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
    hydrateHistoryImpl(set, get);
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

