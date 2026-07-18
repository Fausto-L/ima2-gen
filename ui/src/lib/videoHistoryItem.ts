import type {
  GenerateItem,
  VideoContinuityLineage,
  VideoLineage,
} from "../types";

export type VideoExtendDone = {
  requestId: string;
  filename: string;
  url: string;
  providerUrl: string | null;
  mediaType: "video";
  prompt: string;
  userPrompt: string;
  revisedPrompt: string | null;
  provider: "grok" | "grok-api";
  model: string;
  usage: GenerateItem["usage"] | null;
  elapsed: number;
  webSearchCalls: number;
  video: Record<string, unknown>;
  videoContinuity: VideoContinuityLineage | null;
  videoLineage: VideoLineage;
  createdAt: number;
};

export function toVideoHistoryItem(
  done: VideoExtendDone,
  _actionImage: GenerateItem,
): GenerateItem {
  return {
    image: done.url,
    url: done.url,
    providerUrl: done.providerUrl,
    filename: done.filename,
    mediaType: "video",
    prompt: done.prompt,
    userPrompt: done.userPrompt,
    revisedPrompt: done.revisedPrompt,
    provider: done.provider,
    model: done.model,
    format: "mp4",
    elapsed: done.elapsed,
    usage: done.usage ?? undefined,
    webSearchCalls: done.webSearchCalls,
    video: done.video,
    videoSeries: null,
    videoContinuity: done.videoContinuity,
    videoLineage: done.videoLineage,
    requestId: done.requestId,
    createdAt: done.createdAt,
    sessionId: null,
  };
}
