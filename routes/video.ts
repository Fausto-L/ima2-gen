import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { atomicWriteJson } from "../lib/atomicWrite.js";
import { join } from "path";
import { randomBytes } from "crypto";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
import type { Express, Request, Response } from "express";
import { startJob, finishJob, registerJobAbortController, isJobCanceled, setJobPhase } from "../lib/inflight.js";
import { isGenerationCanceledError, makeGenerationCanceledError } from "../lib/generationCancel.js";
import { logEvent, logError } from "../lib/logger.js";
import { invalidateHistoryIndex } from "../lib/historyIndex.js";
import { generateVideoViaGrok, type GrokVideoEvent } from "../lib/grokVideoAdapter.js";
import { getVideoSeriesChain } from "../lib/videoSeriesChain.js";
import {
  ACTIVE_VIDEO_PROMPT_GUIDANCE,
  appendVideoContinuityEntry,
  lineageFromVideoMetadata,
  normalizeVideoContinuityLineage,
  readVideoSidecar,
  requireActiveVideoPrompt,
  safeGeneratedVideoFilename,
  type VideoContinuityLineage,
} from "../lib/videoContinuity.js";
import { extractGeneratedVideoFrameB64 } from "../lib/videoFrameExtract.js";
import {
  normalizeGrokVideoModel,
  normalizeVideoResolution,
  normalizeVideoAspectRatio,
  normalizeVideoDuration,
  deriveVideoMode,
  clampVideoDuration,
  MAX_REF2V_REFERENCES,
  type VideoMode,
} from "../lib/imageModels.js";
import { errInfo } from "../lib/errInfo.js";
import { requireRuntimeContext, type RouteRuntimeContext, type RuntimeContext } from "../lib/runtimeContext.js";
import { generateVideoThumbnail } from "../lib/videoThumb.js";
import { getStreamTransport } from "../lib/nodeHelpers.js";
import { wsBroadcast } from "../lib/wsServer.js";

function sendSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

type NormalizeError = { error: string; code: string; status: number };

function isNormalizeError(x: unknown): x is NormalizeError {
  return typeof x === "object" && x !== null && typeof (x as { error?: unknown }).error === "string";
}

export async function saveGeneratedVideoArtifact(ctx: RuntimeContext, filename: string, buffer: Buffer, metadata: unknown): Promise<void> {
  const filePath = join(ctx.config.storage.generatedDir, filename);
  await writeFile(filePath, buffer);
  try {
    await atomicWriteJson(`${filePath}.json`, metadata);
  } catch (err) {
    await unlink(filePath).catch(() => {});
    throw err;
  }
}

async function resolveSourceImage(
  ctx: RuntimeContext,
  sourceImage: unknown,
  sourceFilename: unknown,
): Promise<{ b64: string | null; filename: string | null }> {
  if (typeof sourceFilename === "string" && sourceFilename) {
    const safe = sourceFilename.replace(/^\/+/, "");
    if (safe.includes("..") || safe.includes("/") || safe.includes("\\")) {
      throw { status: 400, code: "GROK_VIDEO_INVALID_MODE", message: "invalid source filename" };
    }
    if (/\.mp4$/i.test(safe)) throw { status: 400, code: "GROK_VIDEO_INVALID_MODE", message: "use continueFromVideo for generated video continuation" };
    const buf = await readFile(join(ctx.config.storage.generatedDir, safe));
    return { b64: buf.toString("base64"), filename: safe };
  }
  if (typeof sourceImage === "string" && sourceImage) {
    return { b64: sourceImage, filename: null };
  }
  return { b64: null, filename: null };
}

const STORYBOARD_TRIM_SECONDS = "1.0";

async function trimStoryboardLeadIn(buffer: Buffer, requestId: string): Promise<Buffer> {
  const tmpIn = join(tmpdir(), `ima2_sb_trim_in_${requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`);
  const tmpOut = join(tmpdir(), `ima2_sb_trim_out_${requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`);
  try {
    await writeFile(tmpIn, buffer);
    logEvent("video", "storyboard:trim-start", { requestId, inputBytes: buffer.length, trimSeconds: STORYBOARD_TRIM_SECONDS });
    await execFileAsync("ffmpeg", [
      "-y", "-ss", STORYBOARD_TRIM_SECONDS, "-i", tmpIn,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18",
      "-c:a", "aac", "-b:a", "128k",
      "-avoid_negative_ts", "make_zero", tmpOut,
    ], { timeout: 60_000 });
    const trimmed = await readFile(tmpOut);
    logEvent("video", "storyboard:trimmed", { requestId, originalBytes: buffer.length, trimmedBytes: trimmed.length, trimSeconds: STORYBOARD_TRIM_SECONDS });
    return trimmed;
  } catch (trimError: any) {
    logEvent("video", "storyboard:trim-exec-error", { requestId, error: trimError.message, stderr: trimError.stderr?.slice?.(0, 500) });
    throw trimError;
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}

async function runVideoGeneration(
  ctx: RuntimeContext,
  body: Record<string, unknown>,
  requestId: string,
  cancelController: AbortController,
  emit: (event: string, data: Record<string, unknown>) => void,
) {
  let finishStatus = "completed";
  let finishHttpStatus = 200;
  let finishErrorCode: string | undefined;
  let finishMeta: Record<string, unknown> = {};
  let finishCanceled = false;

  const fail = (status: number | undefined, code: string, error: string, extra: Record<string, unknown> = {}) => {
    const httpStatus = status ?? 500;
    finishStatus = "error";
    finishHttpStatus = httpStatus;
    finishErrorCode = code;
    emit("error", { error, code, status: httpStatus, requestId, ...extra });
  };

  try {
    const { prompt, provider = "grok", model: rawModel } = body;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const clientNodeId = typeof body.clientNodeId === "string" ? body.clientNodeId : null;
    const topic = typeof body.topic === "string" ? (body.topic as string).trim() : "";

    if (provider !== "grok" && provider !== "grok-api") { fail(400, provider === "agy" ? "AGY_VIDEO_UNSUPPORTED" : "VIDEO_PROVIDER_UNSUPPORTED", provider === "agy" ? "Gemini (agy) does not support video generation" : "video generation requires provider 'grok' or 'grok-api'"); return; }
    const storyboardActive = body.storyboard === true;
    const storyboardPrefix = storyboardActive
      ? [
        "[STORYBOARD MODE — Sequential Video Clip]",
        "This clip is part of a multi-shot video storyboard sequence.",
        "The prompt and all injected instructions MUST be in English. Exception: dialogue lines keep original language.",
        "",
        "CHARACTER LOCK:",
        "- Identify each character by 2-3 VISUAL identifiers (clothing + physique + position/props). Never by name alone.",
        "- Copy character descriptions VERBATIM from prior clip context. Do NOT rephrase or drift.",
        "",
        "CONTINUITY:",
        "- Continue from the previous frame's exact composition, pose, and spatial arrangement.",
        "- Lock lighting direction, color palette, environment, and style.",
        "- Describe ONLY what changes: action, camera movement, dialogue, sound.",
        "",
        "STORYBOARD IMAGE SOURCE RULE (HIGHEST PRIORITY — OVERRIDES ALL OTHER RULES):",
        "- The source image is a 3x3 storyboard grid. Panel 1 (top-left) is a BLACK LEAD-IN FRAME — it contains no scene content.",
        "- The video starts from black (Panel 1), then transitions into the action scene from Panel 2.",
        "- Panels 2-9 contain the action sequence. Describe and animate only Panels 2-9.",
        "- Start your rewritten prompt with: 'Fading in from black into the full-screen scene of [Panel 2 description],' — the server auto-trims the black lead-in.",
        "- The storyboard grid must NEVER appear as a visible grid in any frame. The output is a single continuous cinematic clip.",
        "- Do NOT reference Panel 1 in the action description — it is only a technical black frame.",
        "",
        "PROMPT STRUCTURE (layered caption format):",
        "- Shot foundation: type + camera motion (dolly, pan, tracking, crane, static).",
        "- Subject: action with intensity modifiers (crashes violently, drifts gently).",
        "- Environment: setting details inherited from prior shots.",
        "- Dialogue: who speaks (by appearance), exact line (original language), timing.",
        "- Audio: music style/no-music, sound effects, room tone.",
        "- Ending frame: final pose, camera state, last audio cue — must be stable for next shot.",
        "",
      ].join("\n") + "\n"
      : "";
    const activePrompt = requireActiveVideoPrompt(prompt);
    if (!activePrompt) { fail(400, "PROMPT_REQUIRED", "Prompt is required", { guidance: ACTIVE_VIDEO_PROMPT_GUIDANCE }); return; }

    const modelCheck = normalizeGrokVideoModel(rawModel);
    if (isNormalizeError(modelCheck)) { fail(modelCheck.status, modelCheck.code, modelCheck.error); return; }
    const durationCheck = normalizeVideoDuration(body.duration);
    if (isNormalizeError(durationCheck)) { fail(durationCheck.status, durationCheck.code, durationCheck.error); return; }
    const resolutionCheck = normalizeVideoResolution(body.resolution);
    if (isNormalizeError(resolutionCheck)) { fail(resolutionCheck.status, resolutionCheck.code, resolutionCheck.error); return; }
    const aspectCheck = normalizeVideoAspectRatio(body.aspectRatio);
    if (isNormalizeError(aspectCheck)) { fail(aspectCheck.status, aspectCheck.code, aspectCheck.error); return; }

    let parentLineage: VideoContinuityLineage | null = null;
    let continueFromVideoFilename: string | null = null;
    if (typeof body.continueFromVideo === "string" && (body.continueFromVideo as string).trim()) {
      try {
        continueFromVideoFilename = safeGeneratedVideoFilename(body.continueFromVideo as string);
        const parentMeta = await readVideoSidecar(ctx.config.storage.generatedDir, continueFromVideoFilename);
        parentLineage = lineageFromVideoMetadata(continueFromVideoFilename, parentMeta);
      } catch (e: any) {
        fail(e?.status || 400, "GROK_VIDEO_INVALID_MODE", e?.message || "invalid continuation video"); return;
      }
    } else {
      parentLineage = normalizeVideoContinuityLineage(body.continuityLineage);
    }

    const refInputs: Array<{ image?: unknown; filename?: unknown }> = [
      ...toArray(body.referenceImages).map((image) => ({ image })),
      ...toArray(body.referenceFilenames).map((filename) => ({ filename })),
      ...(body.sourceImage || body.sourceFilename
        ? [{ image: body.sourceImage, filename: body.sourceFilename }]
        : []),
    ];
    if (continueFromVideoFilename && !body.sourceImage && !body.sourceFilename) {
      try {
        refInputs.push({ image: await extractGeneratedVideoFrameB64(ctx.config.storage.generatedDir, continueFromVideoFilename) });
      } catch (e: any) {
        fail(e?.status || 500, "GROK_VIDEO_FRAME_FAILED", e?.message || "failed to extract continuation frame"); return;
      }
    }
    let resolved: Array<{ b64: string; filename: string | null }>;
    try {
      const all = await Promise.all(refInputs.map((r) => resolveSourceImage(ctx, r.image, r.filename)));
      resolved = all.filter((r): r is { b64: string; filename: string | null } => Boolean(r.b64));
    } catch (e: any) {
      fail(e?.status || 400, e?.code || "GROK_VIDEO_INVALID_MODE", e?.message || "invalid reference image"); return;
    }
    if (resolved.length > MAX_REF2V_REFERENCES) { fail(400, "GROK_VIDEO_REF_TOO_MANY", `at most ${MAX_REF2V_REFERENCES} reference images`); return; }
    const mode: VideoMode = deriveVideoMode(resolved.length);
    const duration = clampVideoDuration(durationCheck.duration, mode);
    const referenceImages = mode === "reference-to-video" ? resolved.map((r) => r.b64) : undefined;
    const sourceB64 = mode === "image-to-video" ? resolved[0]?.b64 : undefined;
    const sourceFilename = resolved[0]?.filename ?? null;

    startJob({
      requestId,
      kind: "video",
      prompt: activePrompt,
      meta: { kind: "video", sessionId, clientNodeId, model: modelCheck.model, mode, duration, resolution: resolutionCheck.resolution },
    });
    registerJobAbortController(requestId, cancelController);
    await mkdir(ctx.config.storage.generatedDir, { recursive: true });

    logEvent("video", "request", { requestId, mode, duration, resolution: resolutionCheck.resolution, aspectRatio: aspectCheck.aspectRatio });
    const startTime = Date.now();

    const onEvent = (ev: GrokVideoEvent) => {
      if (ev.phase === "submitted") {
        setJobPhase(requestId, "streaming");
        emit("submitted", {
          requestId,
          xaiVideoRequestId: ev.xaiVideoRequestId,
          requestedModel: ev.requestedModel,
          effectiveModel: ev.effectiveModel,
          modelFallback: ev.modelFallback ?? null,
        });
      } else if (ev.phase === "progress") {
        emit("progress", { requestId, progress: typeof ev.progress === "number" ? ev.progress / 100 : null, stalled: Boolean(ev.stalled) });
      } else {
        setJobPhase(requestId, "planning");
        emit("planning", { requestId });
      }
    };

    const chain = !parentLineage && topic ? await getVideoSeriesChain(ctx.config.storage.generatedDir, topic) : [];
    const basePrompt = chain.length > 0
      ? `[Series topic: ${topic}]\n[Previous prompts in series:\n${chain.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n]\n\n${activePrompt}`
      : activePrompt;
    const effectivePrompt = storyboardPrefix + basePrompt;

    const plannerModel = typeof body.plannerModel === "string" ? (body.plannerModel as string).trim() : undefined;
    const directApiKey = provider === "grok-api" ? ctx.xaiApiKey : undefined;

    const result = await generateVideoViaGrok(effectivePrompt, ctx, {
      model: modelCheck.model,
      mode,
      duration,
      resolution: resolutionCheck.resolution,
      aspectRatio: aspectCheck.aspectRatio,
      sourceImage: sourceB64,
      referenceImages,
      signal: cancelController.signal,
      requestId,
      continuityLineage: parentLineage,
      plannerModel: plannerModel || undefined,
      directApiKey,
      onEvent,
      storyboardActive,
    });

    const rand = randomBytes(ctx.config.ids.generatedHexBytes).toString("hex");
    const filename = `${Date.now()}_${rand}.mp4`;
    const elapsed = +((Date.now() - startTime) / 1000).toFixed(1);
    const videoContinuity = appendVideoContinuityEntry(parentLineage, {
      filename,
      userPrompt: activePrompt,
      revisedPrompt: result.revisedPrompt,
      createdAt: Date.now(),
    });
    const meta = {
      kind: "video",
      mediaType: "video",
      requestId,
      sessionId,
      clientNodeId,
      prompt: activePrompt,
      userPrompt: activePrompt,
      revisedPrompt: result.revisedPrompt,
      provider,
      model: result.effectiveModel,
      requestedModel: result.requestedModel,
      effectiveModel: result.effectiveModel,
      modelFallback: result.modelFallback,
      createdAt: Date.now(),
      elapsed,
      usage: result.usage,
      webSearchCalls: result.webSearchCalls,
      video: {
        duration: result.duration,
        resolution: result.resolution,
        aspectRatio: result.aspectRatio,
        sourceImageFilename: sourceFilename,
        xaiVideoRequestId: result.xaiVideoRequestId,
        requestedModel: result.requestedModel,
        effectiveModel: result.effectiveModel,
        modelFallback: result.modelFallback,
      },
      videoContinuity,
      ...(topic ? { videoSeries: { topic, chainIndex: chain.length } } : {}),
      ...(storyboardActive ? { storyboard: true } : {}),
    };
    let finalBuffer = result.videoBuffer;
    if (storyboardActive) {
      try {
        finalBuffer = await trimStoryboardLeadIn(result.videoBuffer, requestId);
      } catch (trimErr: any) {
        logEvent("video", "storyboard:trim-failed", { requestId, error: trimErr.message });
      }
    }
    await saveGeneratedVideoArtifact(ctx, filename, finalBuffer, meta);
    generateVideoThumbnail(join(ctx.config.storage.generatedDir, filename)).catch(() => {});
    invalidateHistoryIndex();

    finishMeta = { filename, xaiVideoRequestId: result.xaiVideoRequestId };
    logEvent("video", "saved", { requestId, filename, bytes: result.videoBuffer.length, elapsedMs: Date.now() - startTime });
    emit("done", {
      requestId,
      filename,
      url: `/generated/${encodeURIComponent(filename)}`,
      mediaType: "video",
      revisedPrompt: result.revisedPrompt,
      elapsed,
      usage: result.usage,
      requestedModel: result.requestedModel,
      effectiveModel: result.effectiveModel,
      modelFallback: result.modelFallback,
      video: meta.video,
      videoContinuity,
      ...(meta.videoSeries ? { videoSeries: meta.videoSeries } : {}),
    });
  } catch (e) {
    const err = errInfo(e);
    if (isGenerationCanceledError(err.raw) || isJobCanceled(requestId)) {
      const canceled = makeGenerationCanceledError();
      finishCanceled = true;
      finishHttpStatus = canceled.status;
      finishErrorCode = canceled.code;
      emit("error", { error: canceled.message, code: canceled.code, status: canceled.status, requestId });
    } else {
      finishStatus = "error";
      finishHttpStatus = err.status || 500;
      finishErrorCode = err.code || "GROK_VIDEO_FAILED";
      logError("video", "error", err.raw, { requestId, code: finishErrorCode });
      emit("error", { error: err.message, code: finishErrorCode, status: finishHttpStatus, requestId });
    }
  } finally {
    finishJob(requestId, { canceled: finishCanceled, status: finishStatus, httpStatus: finishHttpStatus, errorCode: finishErrorCode, meta: finishMeta });
  }
}

export function registerVideoRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.post("/api/video/generate", async (req: Request, res: Response) => {
    const requestId =
      typeof req.body?.requestId === "string"
        ? req.body.requestId
        : typeof req.body?.clientRequestId === "string"
          ? req.body.clientRequestId
          : req.id;
    const cancelController = new AbortController();
    const transport = getStreamTransport(req);

    if (transport === "sse") {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const emit = (event: string, data: Record<string, unknown>) => sendSse(res, event, data);
      await runVideoGeneration(ctx, req.body || {}, requestId, cancelController, emit);
      res.end();
    } else {
      const emit = (event: string, data: Record<string, unknown>) => wsBroadcast(requestId, event, data);
      res.status(202).json({ requestId });
      runVideoGeneration(ctx, req.body || {}, requestId, cancelController, emit)
        .catch(() => {});
    }
  });
}
