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
import { buildRunwayActionCall, REFERENCE_TAG_PATTERN, runwayAdapter, type RunwayMediaAction } from "../lib/mcp/adapters/runway.js";
import { uploadLocalMediaToRunway } from "../lib/mcp/adapters/runwayUpload.js";
import { resolveMediaAction, type MediaOperation } from "../lib/mcp/mediaWorkflowRouter.js";
import { loadEffectiveSnapshot } from "../lib/mcp/snapshotStore.js";
import { higgsfieldAdapter } from "../lib/mcp/adapters/higgsfield.js";
import { parseMcpPresetRecord, type McpPresetValue } from "../lib/mcp/modelCapabilities.js";
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

const IMAGE_INPUT_MAX_BYTES = 50 * 1024 * 1024;
const VIDEO_INPUT_MAX_BYTES = 100 * 1024 * 1024;

async function localMediaPath(
  generatedDir: string,
  filename: string,
  options: { label: string; maxBytes: number; extensions: RegExp },
): Promise<string> {
  const resolved = await safeGeneratedFilePath(generatedDir, filename);
  const fileInfo = await stat(resolved);
  if (!fileInfo.isFile()) throw new Error("not a regular file");
  if (fileInfo.size > options.maxBytes) throw new Error(`${options.label} too large`);
  if (!options.extensions.test(resolved)) throw new Error(`${options.label} has an unsupported extension`);
  return resolved;
}

function imageMime(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
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
    const {
      provider, kind, prompt, model, ratio, startFrameUrl, startFrameFilename,
      endFrameFilename, referenceFilenames, references, referenceVideoFilename,
    } = req.body ?? {};
    const adapter = ADAPTERS[String(provider)];
    if (!adapter) return res.status(400).json({ error: { code: "MCP_PROVIDER_UNKNOWN", message: String(provider) } });
    if (kind !== "image" && kind !== "video") return res.status(400).json({ error: { code: "INVALID_KIND", message: "kind must be image|video" } });
    if (!adapter.executable) return res.status(409).json({ error: { code: "MCP_EXECUTION_LOCKED", message: `${adapter.provider} is catalog-only` } });
    if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: { code: "INVALID_PROMPT", message: "prompt is required" } });
    let parameters: Record<string, McpPresetValue>;
    try {
      parameters = parseMcpPresetRecord(req.body?.parameters);
    } catch {
      return res.status(400).json({ error: { code: "INVALID_MCP_PARAMETERS", message: "parameters must be a bounded scalar record" } });
    }

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
        const resolved = await localMediaPath(ctx.config.storage.generatedDir, startFrameFilename, {
          label: "start frame", maxBytes: IMAGE_INPUT_MAX_BYTES, extensions: /\.(png|jpe?g|webp)$/i,
        });
        localStartFramePath = resolved;
        parentFilename = basename(resolved);
      } catch (error) {
        return res.status(400).json({ error: { code: "INVALID_START_FRAME", message: String((error as Error)?.message ?? error).slice(0, 120) } });
      }
    }

    let endFrameParentFilename: string | null = null;
    let localEndFramePath: string | null = null;
    if (typeof endFrameFilename === "string" && endFrameFilename) {
      try {
        localEndFramePath = await localMediaPath(ctx.config.storage.generatedDir, endFrameFilename, {
          label: "end frame", maxBytes: IMAGE_INPUT_MAX_BYTES, extensions: /\.(png|jpe?g|webp)$/i,
        });
        endFrameParentFilename = basename(localEndFramePath);
      } catch (error) {
        return res.status(400).json({ error: { code: "INVALID_END_FRAME", message: String((error as Error)?.message ?? error).slice(0, 120) } });
      }
    }

    // Reference images (@element refs or composer attachments): local gallery
    // files -> containment check -> upload -> provider-hosted URLs. The tool
    // schema caps video references to seedance-2/kling-o3-pro; the adapter
    // enforces the image_references input role before any upload happens.
    // Two accepted shapes: legacy referenceFilenames: string[] and tagged
    // references: [{filename, tag}] (Runway multi-reference @alias syntax).
    const rawReferences: Array<{ filename: string; tag?: string }> = [];
    if (references !== undefined) {
      if (!Array.isArray(references) || references.length > 3 || references.some((entry) =>
        !entry || typeof entry !== "object" || typeof (entry as { filename?: unknown }).filename !== "string" || !(entry as { filename: string }).filename
        || ((entry as { tag?: unknown }).tag !== undefined && typeof (entry as { tag?: unknown }).tag !== "string"))) {
        return res.status(400).json({ error: { code: "INVALID_MCP_REFERENCES", message: "references must be up to 3 {filename, tag?} entries" } });
      }
      const typedReferences = references as Array<{ filename: string; tag?: string }>;
      if (typedReferences.some((entry) => entry.tag !== undefined && !REFERENCE_TAG_PATTERN.test(entry.tag))) {
        return res.status(400).json({ error: { code: "INVALID_MCP_REFERENCE_TAG", message: "reference tags must be 1-32 letters, numbers, underscores, or hyphens" } });
      }
      for (const entry of typedReferences) {
        rawReferences.push({ filename: entry.filename, ...(entry.tag ? { tag: entry.tag } : {}) });
      }
    } else if (referenceFilenames !== undefined) {
      if (!Array.isArray(referenceFilenames) || referenceFilenames.length > 3
        || referenceFilenames.some((name) => typeof name !== "string" || !name)) {
        return res.status(400).json({ error: { code: "INVALID_MCP_REFERENCES", message: "referenceFilenames must be up to 3 generated filenames" } });
      }
      for (const name of referenceFilenames as string[]) rawReferences.push({ filename: name });
    }
    const localReferences: Array<{ path: string; tag?: string }> = [];
    if (rawReferences.length > 0) {
      try {
        for (const entry of rawReferences) {
          const resolved = await localMediaPath(ctx.config.storage.generatedDir, entry.filename, {
            label: "reference", maxBytes: IMAGE_INPUT_MAX_BYTES, extensions: /\.(png|jpe?g|webp)$/i,
          });
          localReferences.push({ path: resolved, ...(entry.tag ? { tag: entry.tag } : {}) });
        }
      } catch (error) {
        return res.status(400).json({ error: { code: "INVALID_MCP_REFERENCES", message: String((error as Error)?.message ?? error).slice(0, 120) } });
      }
    }

    let localReferenceVideoPath: string | null = null;
    if (typeof referenceVideoFilename === "string" && referenceVideoFilename) {
      try {
        localReferenceVideoPath = await localMediaPath(ctx.config.storage.generatedDir, referenceVideoFilename, {
          label: "reference video", maxBytes: VIDEO_INPUT_MAX_BYTES, extensions: /\.(mp4|mov)$/i,
        });
      } catch (error) {
        return res.status(400).json({ error: { code: "INVALID_REFERENCE_VIDEO", message: String((error as Error)?.message ?? error).slice(0, 120) } });
      }
    }

    const requestId = typeof req.body?.requestId === "string" && req.body.requestId
      ? req.body.requestId
      : `mcp_${Date.now()}_${randomBytes(4).toString("hex")}`;
    // Contract validation must reject BEFORE any provider tool call — including
    // the start-frame upload (sol review F2). buildGenerateCall is pure plan
    // construction; the placeholder URL only exercises start-frame combos.
    try {
      adapter.buildGenerateCall({
        kind, prompt,
        ...(typeof model === "string" && model ? { model } : {}),
        ...(typeof ratio === "string" && ratio ? { ratio } : {}),
        ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
        ...(localReferences.length > 0
          ? { referenceImages: localReferences.map((entry, index) => ({ url: `https://placeholder.invalid/reference-${index}`, ...(entry.tag ? { tag: entry.tag } : {}) })) }
          : {}),
        ...(localStartFramePath || (typeof startFrameUrl === "string" && startFrameUrl)
          ? { startFrameUrl: typeof startFrameUrl === "string" && startFrameUrl ? startFrameUrl : "https://placeholder.invalid/start-frame" }
          : {}),
        ...(localEndFramePath ? { endFrameUrl: "https://placeholder.invalid/end-frame" } : {}),
        ...(localReferenceVideoPath ? { referenceVideoUrl: "https://placeholder.invalid/reference-video" } : {}),
      });
    } catch (error) {
      return res.status(400).json({ error: { code: errorCode(error), message: "request violates the model capability contract" } });
    }
    const started = startJob({ requestId, kind: `mcp-${kind}`, prompt, meta: { provider: adapter.provider, model: model ?? null } });
    if (started && isStartJobFailure(started)) {
      return res.status(started.code === "TOO_MANY_JOBS" ? 429 : 409).json({ error: { code: started.code, message: "cannot start job" } });
    }
    res.status(202).json({ ok: true, requestId, provider: adapter.provider, kind });

    const abort = new AbortController();
    registerJobAbortController(requestId, abort);
    void runMcpMediaJob({
      ctx, deps, adapter, requestId, kind, prompt, model, ratio, parameters, startFrameUrl,
      localStartFramePath, localEndFramePath, localReferences, localReferenceVideoPath,
      parentFilename, endFrameParentFilename, signal: abort.signal,
    });
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
  parameters: Record<string, McpPresetValue>;
  startFrameUrl?: string;
  localStartFramePath?: string | null;
  localEndFramePath?: string | null;
  localReferences?: Array<{ path: string; tag?: string }>;
  localReferenceVideoPath?: string | null;
  parentFilename?: string | null;
  endFrameParentFilename?: string | null;
  signal: AbortSignal;
}): Promise<void> {
  const { ctx, deps, adapter, requestId, kind, prompt, signal } = input;
  const manager = ctx.mcpConnectionManager!;
  try {
    publishJobEvent(requestId, "submitted", { provider: adapter.provider, kind });
    const uploadTotal = Number(Boolean(input.localStartFramePath))
      + Number(Boolean(input.localEndFramePath))
      + (input.localReferences?.length ?? 0)
      + Number(Boolean(input.localReferenceVideoPath));
    let uploadCurrent = 0;
    const publishUploading = (): void => {
      uploadCurrent += 1;
      setJobPhase(requestId, "uploading");
      publishJobEvent(requestId, "progress", { phase: "uploading", current: uploadCurrent, total: uploadTotal });
    };
    let startFrameUrl = input.startFrameUrl;
    if (input.localStartFramePath) {
      publishUploading();
      startFrameUrl = await deps.upload(manager, input.localStartFramePath, {
        fileName: basename(input.localStartFramePath), mimeType: imageMime(input.localStartFramePath),
      });
    }
    let endFrameUrl: string | undefined;
    if (input.localEndFramePath) {
      publishUploading();
      endFrameUrl = await deps.upload(manager, input.localEndFramePath, {
        fileName: basename(input.localEndFramePath), mimeType: imageMime(input.localEndFramePath),
      });
    }
    const referenceImages: Array<{ url: string; tag?: string }> = [];
    for (const entry of input.localReferences ?? []) {
      publishUploading();
      const url = await deps.upload(manager, entry.path, { fileName: basename(entry.path), mimeType: imageMime(entry.path) });
      referenceImages.push({ url, ...(entry.tag ? { tag: entry.tag } : {}) });
    }
    let referenceVideoUrl: string | undefined;
    if (input.localReferenceVideoPath) {
      publishUploading();
      const mimeType = extname(input.localReferenceVideoPath).toLowerCase() === ".mov" ? "video/quicktime" : "video/mp4";
      referenceVideoUrl = await deps.upload(manager, input.localReferenceVideoPath, {
        fileName: basename(input.localReferenceVideoPath), mimeType, maxBytes: VIDEO_INPUT_MAX_BYTES,
      });
    }
    const result = await deps.execute(manager, adapter, {
      kind, prompt,
      ...(input.model ? { model: input.model } : {}),
      ...(input.ratio ? { ratio: input.ratio } : {}),
      ...(Object.keys(input.parameters).length > 0 ? { parameters: input.parameters } : {}),
      ...(startFrameUrl ? { startFrameUrl } : {}),
      ...(endFrameUrl ? { endFrameUrl } : {}),
      ...(referenceImages.length > 0 ? { referenceImages } : {}),
      ...(referenceVideoUrl ? { referenceVideoUrl } : {}),
    }, {
      signal,
      onPhase: (phase) => { setJobPhase(requestId, phase); publishJobEvent(requestId, "progress", { phase }); },
    });

    setJobPhase(requestId, "downloading");
    publishJobEvent(requestId, "progress", { phase: "downloading" });
    const download = await deps.download(result.outputUrls[0], { kind });
    const referenceParents = [
      ...(input.localReferences ?? []).map((entry) => ({
        filename: basename(entry.path), role: "image-reference" as const, ...(entry.tag ? { tag: entry.tag } : {}),
      })),
      ...(input.localReferenceVideoPath
        ? [{ filename: basename(input.localReferenceVideoPath), role: "video-reference" as const }]
        : []),
    ];
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
        ...(Object.keys(input.parameters).length > 0 ? { mcpParameters: input.parameters } : {}),
        ...(input.parentFilename ? { parent: { filename: input.parentFilename, mediaType: "image", role: "start-frame" } } : {}),
        ...(input.endFrameParentFilename ? { endFrameParent: { filename: input.endFrameParentFilename, mediaType: "image", role: "end-frame" } } : {}),
        ...(referenceParents.length > 0 ? { referenceParents } : {}),
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
