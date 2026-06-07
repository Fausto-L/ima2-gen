import type { ImageModel, Provider } from "../types";
import { onEvent } from "./wsClient";

export type NodeGenerateRequest = {
  parentNodeId: string | null;
  prompt: string;
  quality: string;
  size: string;
  format: string;
  moderation: "low" | "auto";
  model?: ImageModel;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  provider?: Provider;
  mode?: "auto" | "direct";
  contextMode?: "parent-plus-refs" | "parent-only" | "ancestry";
  searchMode?: "off" | "auto" | "on";
  webSearchEnabled?: boolean;
  references?: string[];
  requestId?: string;
  sessionId?: string | null;
  clientNodeId?: string | null;
  storyboard?: boolean;
};

export type NodeGenerateResponse = {
  nodeId: string;
  parentNodeId: string | null;
  requestId?: string | null;
  image: string;
  filename: string;
  url: string;
  elapsed: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  usage?: { total_tokens?: number } & Record<string, unknown>;
  webSearchCalls: number;
  provider: Provider;
  moderation?: string;
  model?: string | null;
  size?: string | null;
  refsCount?: number;
  contextMode?: "parent-plus-refs" | "parent-only" | "ancestry";
  searchMode?: "off" | "auto" | "on";
  revisedPrompt?: string | null;
  promptMode?: "auto" | "direct";
};

export type NodeErrorResponse = {
  error: { code: string; message: string };
  parentNodeId: string | null;
  status?: number;
};

export async function postNodeGenerate(payload: NodeGenerateRequest): Promise<NodeGenerateResponse> {
  const res = await fetch("/api/node/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as NodeErrorResponse;
    const msg = err?.error?.message ?? `Request failed: ${res.status}`;
    const e = new Error(msg) as Error & { code?: string; status?: number };
    e.code = err?.error?.code;
    e.status = err?.status ?? res.status;
    throw e;
  }
  return data as NodeGenerateResponse;
}

export async function postNodeGenerateStream(
  payload: NodeGenerateRequest,
  handlers: {
    onPartial?: (partial: { image: string; requestId?: string | null; index?: number | null }) => void;
    onPhase?: (phase: { phase?: string; requestId?: string | null }) => void;
  } = {},
): Promise<NodeGenerateResponse> {
  const requestId = payload.requestId ?? `node_${Date.now().toString(36)}`;
  const body = { ...payload, requestId };

  return new Promise<NodeGenerateResponse>((resolve, reject) => {
    const unsub = onEvent(requestId, {
      partial: (d) => handlers.onPartial?.(d as { image: string; requestId?: string | null; index?: number | null }),
      phase: (d) => handlers.onPhase?.(d as { phase?: string; requestId?: string | null }),
      done: (d) => { unsub(); resolve(d as unknown as NodeGenerateResponse); },
      error: (d) => {
        unsub();
        const err = d as { error?: { code?: string; message?: string }; status?: number };
        const msg = err?.error?.message ?? "Node generation failed";
        const e = new Error(msg) as Error & { code?: string; status?: number };
        e.code = err?.error?.code;
        e.status = err?.status;
        reject(e);
      },
    });

    fetch("/api/node/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Stream-Transport": "websocket" },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) return res.json().catch(() => ({})).then((data: Record<string, unknown>) => {
        unsub();
        const err = data as NodeErrorResponse;
        const msg = err?.error?.message ?? `Request failed: ${res.status}`;
        const e = new Error(msg) as Error & { code?: string; status?: number };
        e.code = err?.error?.code;
        e.status = err?.status ?? res.status;
        reject(e);
      });
    }).catch((err) => { unsub(); reject(err); });
  });
}
