import type {
  GenerateItem,
  GenerateResponse,
  MultimodeGenerateResponse,
} from "../types";
import { isMultiResponse } from "../types";
import {
  postGenerate,
  postMultimodeGenerateStream,
} from "../lib/api";
import { handleError } from "../lib/errorHandler";
import { t } from "../i18n";
import {
  composePrompt,
  cloneInsertedPrompts,
  normalizeCount,
} from "./storePersistence";
import {
  type PersistedInFlight,
  stripDataUrlPrefix,
  saveInFlight,
  mergeMultimodeImages,
  isCanceledGenerationError,
  type MultimodeSequenceState,
} from "./storeHelpers";
import { addHistory } from "./storeGraphSave";
import type { AppState } from "./storeTypes";

type StoreSet = (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
type StoreGet = () => AppState;

export async function generateMultimodeImpl(
  sizeOverride: string | undefined,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
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
}

export async function runGenerateImpl(
  sizeOverride: string | undefined,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
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
}
