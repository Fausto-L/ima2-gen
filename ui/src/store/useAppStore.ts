// All localStorage keys this store touches MUST be listed in
// ./persistenceRegistry.ts. The contract test
// tests/settings-persistence-contract.test.js enforces this invariant.
// Legacy generation-controls contract: GENERATION_DEFAULTS_STORAGE_KEY = "ima2.generationDefaults".
import { create } from "zustand";
import type { VideoResolutionUI } from "../types";
import {
  cancelInflight,
  getBrowserId,
} from "../lib/api";
import {
  isGrokImageModel,
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
import {
  deriveParentServerNodeIds,
} from "../lib/nodeGraph";
import {
  applyComponentSelection,
  applySelectedNodeIds,
} from "../lib/nodeSelection";
import { t, loadLocale, saveLocale } from "../i18n";
import { ENABLE_AGENT_MODE, ENABLE_CARD_NEWS_MODE, ENABLE_NODE_MODE } from "../lib/devMode";
import {
  getVisibleGalleryItems,
  resolveVisibleShortcutCurrent,
} from "../lib/galleryShortcuts";
import {
  loadRightPanelOpen,
  loadUIMode,
  loadThemePreference,
  loadThemeFamily,
  loadHistoryStripLayout,
  loadGalleryScope,
  loadCanvasExportBackground,
  persistCanvasExportBackground,
  loadImageModel,
  loadReasoningEffort,
  loadWebSearchEnabled,
  loadVideoDefaults,
  saveVideoDefaults,
  resolveThemePreference,
  loadSelectedFilename,
  loadGenerationDefaults,
} from "./storePersistence";
import {
  loadInFlight,
  HISTORY_LIMIT,
  MAX_REFERENCE_IMAGES,
  retainHistoryItems,
  saveInFlight,
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
import {
  setProviderImpl, setQualityImpl, setSizePresetImpl, setCustomSizeImpl,
  setGrokAspectRatioImpl, setGrokResolutionImpl, setFormatImpl, setModerationImpl,
  setImageModelImpl, selectVideoModelImpl, activeVideoRefCountImpl,
  setReasoningEffortImpl, setWebSearchEnabledImpl, setCountImpl,
  setMultimodeImpl, setMultimodeMaxImagesImpl, setPromptModeImpl, setPromptImpl,
  getResolvedSizeImpl,
} from "./storeSettingsImpl";
import {
  insertPromptToComposerImpl, removeInsertedPromptFromComposerImpl,
  moveInsertedPromptInComposerImpl, clearInsertedPromptsImpl,
  loadPromptLibraryImpl, savePromptToLibraryImpl, deletePromptFromLibraryImpl,
  togglePromptFavoriteImpl, importPromptsToLibraryImpl, toggleGalleryFavoriteImpl,
} from "./storePromptImpl";
import {
  generateImpl, cancelMultimodeImpl, confirmCustomSizeAdjustmentImpl,
  generateNodeImpl, generateNodeInPlaceImpl, generateNodeVariationImpl,
  runGenerateNodeImpl,
} from "./storeGenerateEntryImpl";

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

  generateNode: (clientId) => generateNodeImpl(clientId, set, get),

  generateNodeInPlace: (clientId) => generateNodeInPlaceImpl(clientId, set, get),

  generateNodeVariation: (clientId, sizeOverride) => generateNodeVariationImpl(clientId, sizeOverride, set, get),

  runGenerateNode: (clientId, sizeOverride) => runGenerateNodeImpl(clientId, sizeOverride, set, get),

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
  setProvider: (provider) => setProviderImpl(provider, set, get),
  setQuality: (quality) => setQualityImpl(quality, set),
  setSizePreset: (sizePreset) => setSizePresetImpl(sizePreset, set),
  setCustomSize: (w, h) => setCustomSizeImpl(w, h, set, get),
  setGrokAspectRatio: (grokAspectRatio) => setGrokAspectRatioImpl(grokAspectRatio, set),
  setGrokResolution: (grokResolution) => setGrokResolutionImpl(grokResolution, set),
  setFormat: (format) => setFormatImpl(format, set),
  setModeration: (moderation) => setModerationImpl(moderation, set),
  setImageModel: (imageModel) => setImageModelImpl(imageModel, set, get),
  videoModelSelected: storedVideoDefaults.model,
  videoDuration: storedVideoDefaults.duration,
  videoResolution: storedVideoDefaults.resolution as VideoResolutionUI,
  videoAspectRatio: storedVideoDefaults.aspectRatio,
  videoTopic: "",
  videoContinuityLineage: null,
  videoProgress: null,
  selectVideoModel: (model) => selectVideoModelImpl(model, set, get),
  setVideoDuration: (videoDuration) => { set({ videoDuration }); saveVideoDefaults({ duration: videoDuration }); },
  setVideoResolution: (videoResolution) => { set({ videoResolution }); saveVideoDefaults({ resolution: videoResolution }); },
  setVideoAspectRatio: (videoAspectRatio) => { set({ videoAspectRatio }); saveVideoDefaults({ aspectRatio: videoAspectRatio }); },
  setVideoTopic: (videoTopic) => set({ videoTopic }),
  setVideoContinuityLineage: (videoContinuityLineage) => set({ videoContinuityLineage }),
  activeVideoRefCount: () => activeVideoRefCountImpl(get),
  runVideoGenerate: async (nodeId) => {
    await runVideoGenerateImpl(nodeId, set, get);
  },
  animateImage: async (filename, prompt) => {
    await animateImageImpl(filename, prompt, set, get);
  },
  setReasoningEffort: (reasoningEffort) => setReasoningEffortImpl(reasoningEffort, set),
  setWebSearchEnabled: (webSearchEnabled) => setWebSearchEnabledImpl(webSearchEnabled, set),
  setCount: (count) => setCountImpl(count, set),
  setMultimode: (enabled) => setMultimodeImpl(enabled, set, get),
  setMultimodeMaxImages: (count) => setMultimodeMaxImagesImpl(count, set),
  setPromptMode: (promptMode) => setPromptModeImpl(promptMode, set),
  setPrompt: (prompt) => setPromptImpl(prompt, set),
  insertPromptToComposer: (prompt) => insertPromptToComposerImpl(prompt, set),
  removeInsertedPromptFromComposer: (id) => removeInsertedPromptFromComposerImpl(id, set),
  moveInsertedPromptInComposer: (id, direction) => moveInsertedPromptInComposerImpl(id, direction, set),
  clearInsertedPrompts: () => clearInsertedPromptsImpl(set),

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

  getResolvedSize: () => getResolvedSizeImpl(get),

  generate: () => generateImpl(set, get),

  async generateMultimode(sizeOverride) {
    await generateMultimodeImpl(sizeOverride, set, get);
  },

  cancelMultimode: () => cancelMultimodeImpl(set, get),

  async runGenerate(sizeOverride) {
    await runGenerateImpl(sizeOverride, set, get);
  },

  confirmCustomSizeAdjustment: () => confirmCustomSizeAdjustmentImpl(set, get),

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

  loadPromptLibrary: () => loadPromptLibraryImpl(set),

  savePromptToLibrary: (payload) => savePromptToLibraryImpl(payload, set, get),

  deletePromptFromLibrary: (id) => deletePromptFromLibraryImpl(id, set, get),

  togglePromptFavorite: (id) => togglePromptFavoriteImpl(id, set, get),

  importPromptsToLibrary: (files) => importPromptsToLibraryImpl(files, set, get),

  toggleGalleryFavorite: (filename) => toggleGalleryFavoriteImpl(filename, set, get),

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

