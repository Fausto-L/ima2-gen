// MCP media generation route (050 WP5). SINGLE persistence owner for MCP
// results: temp download -> generatedDir move -> STRICT sidecar (atomicWriteJson;
// media rolled back on failure) -> thumbnail -> history invalidate -> done.
import { randomBytes } from "node:crypto";
import { copyFile, rm, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Express, Request, Response } from "express";
import { atomicWriteJson } from "../lib/atomicWrite.js";
import { generateImageThumbnail } from "../lib/imageThumb.js";
import { generateVideoThumbnail } from "../lib/videoThumb.js";
import { invalidateHistoryIndex } from "../lib/historyIndex.js";
import { finishJob, isStartJobFailure, registerJobAbortController, setJobPhase, startJob } from "../lib/inflight.js";
import { publishJobEvent } from "../lib/ssePublish.js";
import { safeGeneratedFilePath } from "../lib/videoFrameExtract.js";
import { concatVideos } from "../lib/videoConcat.js";
import { executeMediaJob, executeMediaPlan } from "../lib/mcp/executeMediaJob.js";
import { downloadMediaResult } from "../lib/mcp/downloadMediaResult.js";
import { buildRunwayActionCall, runwayAdapter, type RunwayMediaAction } from "../lib/mcp/adapters/runway.js";
import { uploadLocalMediaToRunway } from "../lib/mcp/adapters/runwayUpload.js";
import { resolveMediaAction, type MediaOperation } from "../lib/mcp/mediaWorkflowRouter.js";
import { loadEffectiveSnapshot } from "../lib/mcp/snapshotStore.js";
import { higgsfieldAdapter } from "../lib/mcp/adapters/higgsfield.js";
import type { MediaProviderAdapter } from "../lib/mcp/providerAdapter.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

/** Test seams (production uses the real implementations). */
export interface McpMediaDeps {
  execute: typeof executeMediaJob;
  executePlan: typeof executeMediaPlan;
  download: typeof downloadMediaResult;
  writeSidecar: typeof atomicWriteJson;
  upload: typeof uploadLocalMediaToRunway;
  concat: typeof concatVideos;
}

const ADAPTERS: Record<string, MediaProviderAdapter> = {
  runway: runwayAdapter,
  higgsfield: higgsfieldAdapter,
};

function errorCode(error: unknown): string {
  return String((error as Error)?.message ?? error).split(":")[0] || "MCP_MEDIA_FAILED";
}

const ACTION_TO_OPERATION: Record<string, MediaOperation> = {
  "stitch": "video.stitch",
  "extend": "video.extend",
  "upscale-video": "video.upscale",
  "upscale-image": "image.upscale",
  "edit-video": "video.edit",
  "reframe": "video.reframe",
};

async function handleMediaAction(
  ctx: ReturnType<typeof requireRuntimeContext>,
  deps: McpMediaDeps,
  req: Request,
  res: Response,
): Promise<void> {
  const { action, prompt } = req.body ?? {};
  const provider = typeof req.body?.provider === "string" ? req.body.provider : "runway";
  const files: string[] = Array.isArray(req.body?.files) ? req.body.files.map(String) : [];
  const operation = ACTION_TO_OPERATION[String(action)];
  if (!operation) { res.status(400).json({ error: { code: "INVALID_ACTION", message: `unknown action: ${String(action)}` } }); return; }
  if (files.length === 0) { res.status(400).json({ error: { code: "INVALID_FILES", message: "files[] is required" } }); return; }

  // Containment-validate every input before any work (audit blocker 2).
  const resolvedFiles: string[] = [];
  try {
    const requireMp4 = operation !== "image.upscale";
    for (const file of files) resolvedFiles.push(await safeGeneratedFilePath(ctx.config.storage.generatedDir, file, { requireMp4 }));
  } catch (error) {
    res.status((error as { status?: number }).status ?? 400).json({ error: { code: "INVALID_FILES", message: String((error as Error).message).slice(0, 120) } });
    return;
  }

  const snapshot = loadEffectiveSnapshot({ snapshotDir: ctx.config.mcp.snapshotDir, packageRoot: ctx.config.storage.packageRoot, provider });
  const drifted = new Set(ctx.mcpConnectionManager?.status(provider).snapshotDiff?.drifted ?? []);
  const decision = resolveMediaAction({
    operation, provider,
    liveTools: (snapshot?.tools ?? []).map((t) => ({ name: t.name, schemaMatch: !drifted.has(t.name) })),
  });
  if (decision.mode === "unavailable") { res.status(409).json({ error: { code: "MEDIA_ACTION_UNAVAILABLE", message: decision.reason } }); return; }
  if (decision.mode === "native" && (!ctx.mcpConnectionManager || ctx.mcpConnectionManager.status(provider).state !== "connected")) {
    res.status(409).json({ error: { code: "MCP_NOT_CONNECTED", message: `connect ${provider} first` } });
    return;
  }

  const requestId = typeof req.body?.requestId === "string" && req.body.requestId
    ? req.body.requestId
    : `mcpact_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const started = startJob({ requestId, kind: `mcp-action-${String(action)}`, prompt: typeof prompt === "string" ? prompt : "", meta: { provider, mode: decision.mode } });
  if (started && isStartJobFailure(started)) {
    res.status(started.code === "TOO_MANY_JOBS" ? 429 : 409).json({ error: { code: started.code, message: "cannot start job" } });
    return;
  }
  res.status(202).json({ ok: true, requestId, action, mode: decision.mode, plan: decision.plan });

  const abort = new AbortController();
  registerJobAbortController(requestId, abort);
  void runMediaAction({ ctx, deps, requestId, operation, decision: decision.plan!, mode: decision.mode, provider, resolvedFiles, prompt: typeof prompt === "string" ? prompt : undefined, signal: abort.signal });
}

async function runMediaAction(input: {
  ctx: ReturnType<typeof requireRuntimeContext>;
  deps: McpMediaDeps;
  requestId: string;
  operation: MediaOperation;
  decision: string;
  mode: "native" | "fallback";
  provider: string;
  resolvedFiles: string[];
  prompt?: string;
  signal: AbortSignal;
}): Promise<void> {
  const { ctx, deps, requestId } = input;
  try {
    publishJobEvent(requestId, "submitted", { action: input.operation, mode: input.mode });
    if (input.mode === "fallback" && input.decision === "local-ffmpeg-concat") {
      setJobPhase(requestId, "media-processing");
      publishJobEvent(requestId, "progress", { phase: "media-processing" });
      const tempOut = join(ctx.config.storage.generatedDir, `.tmp-concat-${requestId}.mp4`);
      await deps.concat(input.resolvedFiles, tempOut, { signal: input.signal });
      await commitMediaResult({
        ctx, deps, requestId, kind: "video",
        tempPath: tempOut, cleanup: () => rm(tempOut, { force: true }),
        ext: "mp4",
        meta: {
          requestId, mediaType: "video", provider: "local-ffmpeg", workflow: "stitch",
          fallback: true, inputs: input.resolvedFiles.map((f) => basename(f)), kind: "mcp-action-stitch",
        },
        doneExtra: { workflow: "stitch", mode: "fallback" },
      });
      return;
    }
    // Native runway action: upload source -> action plan -> poll -> commit.
    const manager = ctx.mcpConnectionManager!;
    const source = input.resolvedFiles[0];
    setJobPhase(requestId, "uploading");
    publishJobEvent(requestId, "progress", { phase: "uploading" });
    const ext = extname(source).toLowerCase();
    const mime = input.operation === "image.upscale"
      ? (ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg")
      : "video/mp4";
    const sourceUrl = await deps.upload(manager, source, { fileName: basename(source), mimeType: mime });
    const plan = buildRunwayActionCall(actionForOperation(input.operation), { url: sourceUrl, ...(input.prompt ? { prompt: input.prompt } : {}) });
    const result = await deps.executePlan(manager, runwayAdapter, plan, {
      signal: input.signal,
      onPhase: (phase) => { setJobPhase(requestId, phase); publishJobEvent(requestId, "progress", { phase }); },
    });
    setJobPhase(requestId, "downloading");
    publishJobEvent(requestId, "progress", { phase: "downloading" });
    const kind = input.operation === "image.upscale" ? "image" as const : "video" as const;
    const download = await deps.download(result.outputUrls[0], { kind });
    await commitMediaResult({
      ctx, deps, requestId, kind,
      tempPath: download.tempPath, cleanup: download.cleanup,
      ext: extensionFor(kind, download.contentType, result.outputUrls[0]),
      meta: {
        requestId, mediaType: kind, provider: input.provider, providerTransport: "mcp-streamable-http",
        providerTaskId: result.taskId, providerUrl: download.sanitizedUrl,
        workflow: input.operation, kind: `mcp-action`,
        parent: { filename: basename(source), mediaType: kind === "image" ? "image" : "video", role: "source" },
      },
      doneExtra: { workflow: input.operation, mode: "native", provider: input.provider },
    });
  } catch (error) {
    const code = errorCode(error);
    finishJob(requestId, { status: "error", errorCode: code });
    publishJobEvent(requestId, "error", { code, message: "media action failed" });
  }
}

function actionForOperation(operation: MediaOperation): RunwayMediaAction {
  if (operation === "video.upscale") return "upscale-video";
  if (operation === "image.upscale") return "upscale-image";
  return "edit-video";
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
    executePlan: depsPartial.executePlan ?? executeMediaPlan,
    download: depsPartial.download ?? downloadMediaResult,
    writeSidecar: depsPartial.writeSidecar ?? atomicWriteJson,
    upload: depsPartial.upload ?? uploadLocalMediaToRunway,
    concat: depsPartial.concat ?? concatVideos,
  };

  app.post("/api/mcp/generate", async (req: Request, res: Response) => {
    const { provider, kind, prompt, model, ratio, startFrameUrl, startFrameFilename } = req.body ?? {};
    const adapter = ADAPTERS[String(provider)];
    if (!adapter) return res.status(400).json({ error: { code: "MCP_PROVIDER_UNKNOWN", message: String(provider) } });
    if (kind !== "image" && kind !== "video") return res.status(400).json({ error: { code: "INVALID_KIND", message: "kind must be image|video" } });
    if (!adapter.executable) return res.status(409).json({ error: { code: "MCP_EXECUTION_LOCKED", message: `${adapter.provider} is catalog-only` } });
    if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: { code: "INVALID_PROMPT", message: "prompt is required" } });

    const manager = ctx.mcpConnectionManager;
    if (!manager || manager.status(adapter.provider).state !== "connected") {
      return res.status(409).json({ error: { code: "MCP_NOT_CONNECTED", message: `connect ${adapter.provider} first` } });
    }

    // Mixed-chain start frame (060): local gallery image -> containment check ->
    // upload -> provider-hosted URL. Recorded as generic parent lineage.
    let parentFilename: string | null = null;
    let localStartFramePath: string | null = null;
    if (typeof startFrameFilename === "string" && startFrameFilename) {
      try {
        const resolved = await safeGeneratedFilePath(ctx.config.storage.generatedDir, startFrameFilename);
        const fileInfo = await stat(resolved);
        if (!fileInfo.isFile()) throw new Error("not a regular file");
        if (fileInfo.size > 50 * 1024 * 1024) throw new Error("start frame too large");
        if (!/\.(png|jpe?g|webp)$/i.test(resolved)) throw new Error("start frame must be an image");
        localStartFramePath = resolved;
        parentFilename = basename(resolved);
      } catch (error) {
        return res.status(400).json({ error: { code: "INVALID_START_FRAME", message: String((error as Error)?.message ?? error).slice(0, 120) } });
      }
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
    void runMcpMediaJob({ ctx, deps, adapter, requestId, kind, prompt, model, ratio, startFrameUrl, localStartFramePath, parentFilename, signal: abort.signal });
  });

  app.post("/api/mcp/media-action", (req: Request, res: Response) => handleMediaAction(ctx, deps, req, res));
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
  localStartFramePath?: string | null;
  parentFilename?: string | null;
  signal: AbortSignal;
}): Promise<void> {
  const { ctx, deps, adapter, requestId, kind, prompt, signal } = input;
  const manager = ctx.mcpConnectionManager!;
  try {
    publishJobEvent(requestId, "submitted", { provider: adapter.provider, kind });
    let startFrameUrl = input.startFrameUrl;
    if (input.localStartFramePath) {
      setJobPhase(requestId, "uploading");
      publishJobEvent(requestId, "progress", { phase: "uploading" });
      const ext = extname(input.localStartFramePath).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      startFrameUrl = await deps.upload(manager, input.localStartFramePath, {
        fileName: basename(input.localStartFramePath), mimeType: mime,
      });
    }
    const result = await deps.execute(manager, adapter, {
      kind, prompt,
      ...(input.model ? { model: input.model } : {}),
      ...(input.ratio ? { ratio: input.ratio } : {}),
      ...(startFrameUrl ? { startFrameUrl } : {}),
    }, {
      signal,
      onPhase: (phase) => { setJobPhase(requestId, phase); publishJobEvent(requestId, "progress", { phase }); },
    });

    setJobPhase(requestId, "downloading");
    publishJobEvent(requestId, "progress", { phase: "downloading" });
    const download = await deps.download(result.outputUrls[0], { kind });
    await commitMediaResult({
      ctx, deps, requestId, kind,
      tempPath: download.tempPath,
      cleanup: download.cleanup,
      ext: extensionFor(kind, download.contentType, result.outputUrls[0]),
      meta: {
        requestId, prompt, userPrompt: prompt, mediaType: kind,
        provider: adapter.provider, providerTransport: "mcp-streamable-http",
        model: input.model ?? null, providerTaskId: result.taskId,
        providerUrl: download.sanitizedUrl,
        ...(input.parentFilename ? { parent: { filename: input.parentFilename, mediaType: "image", role: "start-frame" } } : {}),
        kind: `mcp-${kind}`,
      },
      doneExtra: { provider: adapter.provider, model: input.model ?? null },
    });
  } catch (error) {
    const code = errorCode(error);
    finishJob(requestId, { status: "error", errorCode: code });
    publishJobEvent(requestId, "error", { code, message: "MCP media generation failed" });
  }
}

/** Single atomic persistence path (050 contract): media -> STRICT sidecar
 *  (rollback on failure) -> thumbnail -> history -> done after commit. */
async function commitMediaResult(input: {
  ctx: ReturnType<typeof requireRuntimeContext>;
  deps: McpMediaDeps;
  requestId: string;
  kind: "image" | "video";
  tempPath: string;
  cleanup: () => Promise<void>;
  ext: string;
  meta: Record<string, unknown>;
  doneExtra: Record<string, unknown>;
}): Promise<string> {
  const { ctx, deps, requestId, kind } = input;
  const filename = `${Date.now()}_${randomBytes(ctx.config.ids.generatedHexBytes).toString("hex")}_mcp.${input.ext}`;
  const filePath = join(ctx.config.storage.generatedDir, filename);
  const createdAt = Date.now();
  try {
    await copyFile(input.tempPath, filePath);
    await deps.writeSidecar(filePath + ".json", { ...input.meta, createdAt });
  } catch (commitError) {
    await rm(filePath, { force: true });
    throw commitError;
  } finally {
    await input.cleanup();
  }
  if (kind === "video") await generateVideoThumbnail(filePath).catch(() => undefined);
  else await generateImageThumbnail(filePath).catch(() => undefined);
  invalidateHistoryIndex();
  finishJob(requestId, { status: "done", meta: { filename } });
  publishJobEvent(requestId, "done", {
    requestId, filename,
    url: `/generated/${encodeURIComponent(filename)}`,
    mediaType: kind, createdAt, ...input.doneExtra,
  });
  return filename;
}
