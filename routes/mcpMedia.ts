// MCP media generation route (050 WP5). SINGLE persistence owner for MCP
// results: temp download -> generatedDir move -> STRICT sidecar (atomicWriteJson;
// media rolled back on failure) -> thumbnail -> history invalidate -> done.
import { randomBytes } from "node:crypto";
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Express, Request, Response } from "express";
import { atomicWriteJson } from "../lib/atomicWrite.js";
import { generateImageThumbnail } from "../lib/imageThumb.js";
import { generateVideoThumbnail } from "../lib/videoThumb.js";
import { invalidateHistoryIndex } from "../lib/historyIndex.js";
import { finishJob, isStartJobFailure, registerJobAbortController, setJobPhase, startJob } from "../lib/inflight.js";
import { publishJobEvent } from "../lib/ssePublish.js";
import { executeMediaJob } from "../lib/mcp/executeMediaJob.js";
import { downloadMediaResult } from "../lib/mcp/downloadMediaResult.js";
import { runwayAdapter } from "../lib/mcp/adapters/runway.js";
import { higgsfieldAdapter } from "../lib/mcp/adapters/higgsfield.js";
import type { MediaProviderAdapter } from "../lib/mcp/providerAdapter.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

/** Test seams (production uses the real implementations). */
export interface McpMediaDeps {
  execute: typeof executeMediaJob;
  download: typeof downloadMediaResult;
  writeSidecar: typeof atomicWriteJson;
}

const ADAPTERS: Record<string, MediaProviderAdapter> = {
  runway: runwayAdapter,
  higgsfield: higgsfieldAdapter,
};

function errorCode(error: unknown): string {
  return String((error as Error)?.message ?? error).split(":")[0] || "MCP_MEDIA_FAILED";
}

function extensionFor(kind: "image" | "video", contentType: string, url: string): string {
  const fromUrl = url.match(/\.(png|jpe?g|webp|mp4|mov|webm)(?:\?|$)/i)?.[1]?.toLowerCase();
  if (fromUrl) return fromUrl === "jpeg" ? "jpg" : fromUrl;
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("webm")) return "webm";
  return kind === "video" ? "mp4" : "png";
}

export function registerMcpMediaRoutes(app: Express, ctxRaw: RouteRuntimeContext, depsPartial: Partial<McpMediaDeps> = {}) {
  const ctx = requireRuntimeContext(ctxRaw);
  const deps: McpMediaDeps = {
    execute: depsPartial.execute ?? executeMediaJob,
    download: depsPartial.download ?? downloadMediaResult,
    writeSidecar: depsPartial.writeSidecar ?? atomicWriteJson,
  };

  app.post("/api/mcp/generate", async (req: Request, res: Response) => {
    const { provider, kind, prompt, model, ratio, startFrameUrl } = req.body ?? {};
    const adapter = ADAPTERS[String(provider)];
    if (!adapter) return res.status(400).json({ error: { code: "MCP_PROVIDER_UNKNOWN", message: String(provider) } });
    if (kind !== "image" && kind !== "video") return res.status(400).json({ error: { code: "INVALID_KIND", message: "kind must be image|video" } });
    if (!adapter.executable) return res.status(409).json({ error: { code: "MCP_EXECUTION_LOCKED", message: `${adapter.provider} is catalog-only` } });
    if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: { code: "INVALID_PROMPT", message: "prompt is required" } });

    const manager = ctx.mcpConnectionManager;
    if (!manager || manager.status(adapter.provider).state !== "connected") {
      return res.status(409).json({ error: { code: "MCP_NOT_CONNECTED", message: `connect ${adapter.provider} first` } });
    }

    const requestId = typeof req.body?.requestId === "string" && req.body.requestId
      ? req.body.requestId
      : `mcp_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const started = startJob({ requestId, kind: `mcp-${kind}`, prompt, meta: { provider: adapter.provider, model: model ?? null } });
    if (started && isStartJobFailure(started)) {
      return res.status(started.code === "TOO_MANY_JOBS" ? 429 : 409).json({ error: { code: started.code, message: "cannot start job" } });
    }
    res.status(202).json({ ok: true, requestId, provider: adapter.provider, kind });

    const abort = new AbortController();
    registerJobAbortController(requestId, abort);
    void runMcpMediaJob({ ctx, deps, adapter, requestId, kind, prompt, model, ratio, startFrameUrl, signal: abort.signal });
  });
}

async function runMcpMediaJob(input: {
  ctx: ReturnType<typeof requireRuntimeContext>;
  deps: McpMediaDeps;
  adapter: MediaProviderAdapter;
  requestId: string;
  kind: "image" | "video";
  prompt: string;
  model?: string;
  ratio?: string;
  startFrameUrl?: string;
  signal: AbortSignal;
}): Promise<void> {
  const { ctx, deps, adapter, requestId, kind, prompt, signal } = input;
  const manager = ctx.mcpConnectionManager!;
  try {
    publishJobEvent(requestId, "submitted", { provider: adapter.provider, kind });
    const result = await deps.execute(manager, adapter, {
      kind, prompt,
      ...(input.model ? { model: input.model } : {}),
      ...(input.ratio ? { ratio: input.ratio } : {}),
      ...(input.startFrameUrl ? { startFrameUrl: input.startFrameUrl } : {}),
    }, {
      signal,
      onPhase: (phase) => { setJobPhase(requestId, phase); publishJobEvent(requestId, "progress", { phase }); },
    });

    setJobPhase(requestId, "downloading");
    publishJobEvent(requestId, "progress", { phase: "downloading" });
    const download = await deps.download(result.outputUrls[0], { kind });

    const filename = `${Date.now()}_${randomBytes(ctx.config.ids.generatedHexBytes).toString("hex")}_mcp.${extensionFor(kind, download.contentType, result.outputUrls[0])}`;
    const filePath = join(ctx.config.storage.generatedDir, filename);
    const createdAt = Date.now();
    const meta = {
      requestId,
      prompt,
      userPrompt: prompt,
      mediaType: kind,
      provider: adapter.provider,
      providerTransport: "mcp-streamable-http",
      model: input.model ?? null,
      providerTaskId: result.taskId,
      providerUrl: download.sanitizedUrl,
      createdAt,
      kind: `mcp-${kind}`,
    };
    try {
      await copyFile(download.tempPath, filePath);
      // STRICT sidecar: throws on failure -> roll the media file back.
      await deps.writeSidecar(filePath + ".json", meta);
    } catch (commitError) {
      await rm(filePath, { force: true });
      throw commitError;
    } finally {
      await download.cleanup();
    }
    if (kind === "video") await generateVideoThumbnail(filePath).catch(() => undefined);
    else await generateImageThumbnail(filePath).catch(() => undefined);
    invalidateHistoryIndex();

    finishJob(requestId, { status: "done", meta: { filename } });
    publishJobEvent(requestId, "done", {
      requestId, filename,
      url: `/generated/${encodeURIComponent(filename)}`,
      mediaType: kind, provider: adapter.provider, model: input.model ?? null, createdAt,
    });
  } catch (error) {
    const code = errorCode(error);
    finishJob(requestId, { status: "error", errorCode: code });
    publishJobEvent(requestId, "error", { code, message: "MCP media generation failed" });
  }
}
