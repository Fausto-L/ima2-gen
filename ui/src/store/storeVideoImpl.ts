import type { VideoContinuityLineage } from "../types";
import { postVideoGenerateStream } from "../lib/api";
import {
  deriveVideoModeUI,
  clampVideoDurationUI,
} from "../lib/imageModels";
import { isVideoUrl, extractLastFrame } from "../lib/videoMedia";
import {
  ACTIVE_VIDEO_PROMPT_GUIDANCE,
  buildVideoContinuityFromItem,
} from "../lib/videoContinuity";
import { composePrompt } from "./storePersistence";
import {
  type PersistedInFlight,
  saveInFlight,
} from "./storeHelpers";
import type { AppState, ImageNodeData } from "./storeTypes";
import type { ClientNodeId } from "../lib/graph";

type StoreSet = (p: Partial<AppState>) => void;
type StoreGet = () => AppState;

export async function runVideoGenerateImpl(
  nodeId: ClientNodeId | undefined,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const node = nodeId ? get().graphNodes.find((n) => n.id === nodeId) : null;
  const refs = node ? (node.data.referenceImages ?? []) : get().referenceImages;
  const mode = deriveVideoModeUI(refs.length);
  const prompt = node ? node.data.prompt.trim() : composePrompt(get().prompt, get().insertedPrompts);
  if (!prompt.trim()) {
    get().showToast(ACTIVE_VIDEO_PROMPT_GUIDANCE, true);
    return;
  }

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
}

export async function animateImageImpl(
  filename: string,
  prompt: string | undefined,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
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
}
