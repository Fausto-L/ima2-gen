import { publish } from "./eventBus.js";
import { errInfo } from "./errInfo.js";
import { makeGenerationCanceledError } from "./generationCancel.js";
import { setJobPhase } from "./inflight.js";

export function codedVideoError(message: string, status: number, code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

export function extractError(error: unknown, signal: AbortSignal): Error {
  if (signal.aborted) return makeGenerationCanceledError();
  const info = errInfo(error);
  if (info.code === "ENOENT" || info.code === "FFMPEG_UNAVAILABLE") {
    return codedVideoError("ffmpeg is unavailable", 503, "VIDEO_FRAME_EXTRACT_UNAVAILABLE");
  }
  if (info.code === "VIDEO_FRAME_EXTRACT_TIMEOUT") {
    return codedVideoError("ffmpeg frame extraction timed out", 504, "VIDEO_FRAME_EXTRACT_TIMEOUT", { retryable: true });
  }
  if (info.code === "VIDEO_FRAME_EXTRACT_ABORTED") return makeGenerationCanceledError();
  const raw = info.raw as { killed?: unknown; signal?: unknown };
  if (info.code === "ETIMEDOUT" || raw?.killed === true || raw?.signal === "SIGKILL") {
    return codedVideoError("ffmpeg frame extraction timed out", 504, "VIDEO_FRAME_EXTRACT_TIMEOUT", { retryable: true });
  }
  return codedVideoError(info.message || "failed to extract the last video frame", 500, "VIDEO_FRAME_EXTRACT_FAILED");
}

export function emitPhase(requestId: string, phase: string): void {
  setJobPhase(requestId, phase);
  publish(requestId, "phase", { requestId, phase });
}

export function retryableData(error: unknown): { retryable: true } | Record<string, never> {
  return (error as { retryable?: unknown })?.retryable === true ? { retryable: true } : {};
}
