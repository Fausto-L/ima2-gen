import type {
  GenerateRequest,
  GenerateResponse,
  MultimodeGenerateRequest,
  MultimodeGenerateResponse,
  GenerateItem,
} from "../types";
import { jsonFetch, parseSseBlock } from "./api-core";

export function postGenerate(payload: GenerateRequest): Promise<GenerateResponse> {
  return jsonFetch<GenerateResponse>("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
export async function postMultimodeGenerateStream(
  payload: MultimodeGenerateRequest,
  handlers: {
    onPartial?: (partial: { image: string; requestId?: string | null; sequenceId?: string | null; index?: number | null }) => void;
    onImage?: (image: GenerateItem) => void;
    onPhase?: (phase: { phase?: string; requestId?: string | null; sequenceId?: string | null; maxImages?: number }) => void;
  } = {},
  options: { signal?: AbortSignal } = {},
): Promise<MultimodeGenerateResponse> {
  const res = await fetch("/api/generate/multimode", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data as { error?: string; code?: string; status?: number };
      const e = new Error(err.error ?? `Request failed: ${res.status}`) as Error & { code?: string; status?: number };
      e.code = err.code;
      e.status = err.status ?? res.status;
      throw e;
    }
    return data as MultimodeGenerateResponse;
  }

  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: MultimodeGenerateResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseBlock(block);
      if (parsed) {
        if (parsed.event === "partial") {
          handlers.onPartial?.(parsed.data as { image: string; requestId?: string | null; sequenceId?: string | null; index?: number | null });
        } else if (parsed.event === "image") {
          handlers.onImage?.(parsed.data as GenerateItem);
        } else if (parsed.event === "phase") {
          handlers.onPhase?.(parsed.data as { phase?: string; requestId?: string | null; sequenceId?: string | null; maxImages?: number });
        } else if (parsed.event === "done") {
          finalPayload = parsed.data as MultimodeGenerateResponse;
        } else if (parsed.event === "error") {
          const err = parsed.data as { error?: string; code?: string; status?: number };
          const e = new Error(err.error ?? "Multimode generation failed") as Error & { code?: string; status?: number };
          e.code = err.code;
          e.status = err.status;
          throw e;
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (!finalPayload) {
    const e = new Error("No image data returned from the multimode stream") as Error & { code?: string; status?: number };
    e.code = "EMPTY_RESPONSE";
    e.status = 422;
    throw e;
  }
  if (!Array.isArray(finalPayload.images) || finalPayload.images.length === 0) {
    const e = new Error("No image data returned from the multimode stream") as Error & { code?: string; status?: number };
    e.code = "EMPTY_RESPONSE";
    e.status = 422;
    throw e;
  }
  return finalPayload;
}

export function postEdit(payload: GenerateRequest & { mask?: string }): Promise<GenerateResponse> {
  return jsonFetch<GenerateResponse>("/api/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
export async function importLocalImage(file: File): Promise<GenerateItem> {
  const buffer = await file.arrayBuffer();
  const res = await fetch("/api/history/import-local", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "image/png",
      "X-Ima2-Original-Filename": encodeURIComponent(file.name),
    },
    body: buffer,
  });
  if (!res.ok) {
    let detail: { error?: string; code?: string } = {};
    try {
      detail = await res.json();
    } catch {
      /* ignore */
    }
    const err = new Error(detail.error || `Import failed (${res.status})`);
    (err as Error & { code?: string }).code = detail.code || "IMPORT_FAILED";
    throw err;
  }
  const json = (await res.json()) as { item: GenerateItem };
  return json.item;
}

export type PromptBuilderChatRequest = {
  model?: string;
  messages: Array<{
    role: string;
    content: string;
    attachments?: Array<{
      kind: "image" | "text" | "file";
      name: string;
      mimeType: string;
      size: number;
      dataUrl?: string;
      text?: string;
    }>;
  }>;
  context?: {
    currentPrompt?: string;
    insertedPrompts?: Array<{ name?: string; text?: string }>;
    settings?: Record<string, unknown>;
    currentResultPrompt?: string | null;
  };
};

export type PromptBuilderChatResponse = {
  provider: string;
  model: string;
  message: { role: "assistant"; content: string };
  usage: Record<string, unknown> | null;
};

export function postPromptBuilderChat(
  body: PromptBuilderChatRequest,
): Promise<PromptBuilderChatResponse> {
  return jsonFetch<PromptBuilderChatResponse>("/api/prompt-builder/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type VideoGenerateRequest = {
  prompt: string;
  provider?: "grok";
  model?: string;
  mode?: "text-to-video" | "image-to-video" | "reference-to-video";
  sourceImage?: string;
  sourceFilename?: string;
  referenceImages?: string[];
  referenceFilenames?: string[];
  continueFromVideo?: string;
  continuityLineage?: import("../types").VideoContinuityLineage | null;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  topic?: string;
  sessionId?: string | null;
  clientNodeId?: string | null;
  clientRequestId?: string;
  requestId?: string;
  storyboard?: boolean;
};

export type VideoGenerateDone = {
  requestId: string;
  filename: string;
  url: string;
  mediaType: "video";
  revisedPrompt?: string | null;
  elapsed?: number;
  video?: Record<string, unknown>;
  videoSeries?: { topic?: string; chainIndex?: number } | null;
  videoContinuity?: import("../types").VideoContinuityLineage | null;
};

export async function postVideoGenerateStream(
  payload: VideoGenerateRequest,
  handlers: {
    onPlanning?: () => void;
    onSubmitted?: (d: { xaiVideoRequestId?: string }) => void;
    onProgress?: (d: { progress?: number | null; stalled?: boolean }) => void;
  } = {},
  options: { signal?: AbortSignal } = {},
): Promise<VideoGenerateDone> {
  const res = await fetch("/api/video/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ provider: "grok", ...payload }),
    signal: options.signal,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const data = await res.json().catch(() => ({}));
    const err = data as { error?: string; code?: string; status?: number };
    const e = new Error(err.error ?? `Request failed: ${res.status}`) as Error & { code?: string; status?: number };
    e.code = err.code;
    e.status = err.status ?? res.status;
    throw e;
  }
  if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: VideoGenerateDone | null = null;

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseBlock(block);
      if (parsed) {
        if (parsed.event === "planning") handlers.onPlanning?.();
        else if (parsed.event === "submitted") handlers.onSubmitted?.(parsed.data as { xaiVideoRequestId?: string });
        else if (parsed.event === "progress") handlers.onProgress?.(parsed.data as { progress?: number | null; stalled?: boolean });
        else if (parsed.event === "done") done = parsed.data as VideoGenerateDone;
        else if (parsed.event === "error") {
          const err = parsed.data as { error?: string; code?: string; status?: number };
          const e = new Error(err.error ?? "Video generation failed") as Error & { code?: string; status?: number };
          e.code = err.code;
          e.status = err.status;
          throw e;
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (!done) {
    const e = new Error("No video returned from the stream") as Error & { code?: string; status?: number };
    e.code = "EMPTY_RESPONSE";
    e.status = 422;
    throw e;
  }
  return done;
}
