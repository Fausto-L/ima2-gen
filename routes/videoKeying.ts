import type { Express, Request, Response } from "express";
import { existsSync } from "fs";
import { stat } from "fs/promises";
import { basename } from "path";
import { config } from "../config.js";
import { errInfo } from "../lib/errInfo.js";
import { logEvent, logError } from "../lib/logger.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import { assertRegularGeneratedPath, resolveInGenerated } from "../lib/assetLifecycle.js";
import { createAsset } from "../lib/assetsStore.js";
import { safeWriteSidecar } from "../lib/atomicWrite.js";
import { invalidateHistoryIndex } from "../lib/historyIndex.js";
import { publish } from "../lib/eventBus.js";
import { mapClientParamsToFfmpeg, keyVideoToWebm, sampleVideoKeyColor, type ClientKeyParams } from "../lib/videoChromaKey.js";

function httpError(status: number, code: string, message: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

function parseClientKeyParams(raw: unknown): ClientKeyParams {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const tolerance = Number(obj.tolerance);
  const softness = Number(obj.softness);
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100) {
    throw httpError(400, "KEYING_PARAMS_INVALID", "keyParams.tolerance must be 0-100");
  }
  if (!Number.isFinite(softness) || softness < 0 || softness > 50) {
    throw httpError(400, "KEYING_PARAMS_INVALID", "keyParams.softness must be 0-50");
  }
  let keyColor: { r: number; g: number; b: number } | undefined;
  if (obj.keyColor && typeof obj.keyColor === "object") {
    const c = obj.keyColor as Record<string, unknown>;
    const r = Number(c.r), g = Number(c.g), b = Number(c.b);
    if (![r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) {
      throw httpError(400, "KEYING_PARAMS_INVALID", "keyParams.keyColor must be {r,g,b} 0-255");
    }
    keyColor = { r, g, b };
  }
  return { tolerance, softness, keyColor };
}

export function registerVideoKeyingRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  requireRuntimeContext(ctxRaw);

  app.post("/api/video/keying", async (req: Request, res: Response) => {
    try {
      const sourceRel = typeof req.body?.source === "string" ? req.body.source.trim() : "";
      if (!sourceRel || !sourceRel.toLowerCase().endsWith(".mp4")) {
        throw httpError(400, "KEYING_SOURCE_INVALID", "source must be a .mp4 in generated storage");
      }
      const sourceAbs = resolveInGenerated(config.storage.generatedDir, sourceRel);
      if (!existsSync(sourceAbs)) throw httpError(400, "KEYING_SOURCE_MISSING", "source does not exist in generated storage");
      await assertRegularGeneratedPath(sourceAbs);
      const clientParams = parseClientKeyParams(req.body?.keyParams);
      if (!clientParams.keyColor) {
        // No client-sampled key color: sample from the source's first frame
        // corners so the default keys the real background, not pure 0x00ff00.
        clientParams.keyColor = await sampleVideoKeyColor(sourceAbs);
      }
      const ffmpegParams = mapClientParamsToFfmpeg(clientParams);
      const projectId = typeof req.body?.projectId === "string" && req.body.projectId ? req.body.projectId : undefined;
      const name = typeof req.body?.name === "string" && req.body.name ? req.body.name.slice(0, 80) : undefined;
      const requestId = typeof req.body?.requestId === "string" && req.body.requestId
        ? req.body.requestId
        : `vkey_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const stem = basename(sourceRel).replace(/\.mp4$/i, "");
      const outName = `${stem}-keyed-${Date.now()}.webm`;
      const outAbs = resolveInGenerated(config.storage.generatedDir, outName);

      res.status(202).json({ requestId, filePath: outName });

      void (async () => {
        try {
          publish(requestId, "keying-start", { requestId, source: sourceRel });
          const srcStat = await stat(sourceAbs);
          void srcStat;
          await keyVideoToWebm(sourceAbs, outAbs, ffmpegParams, (outTimeMs) => {
            publish(requestId, "keying-progress", { requestId, outTimeMs });
          });
          await safeWriteSidecar(`${outAbs}.json`, {
            kind: "keyed-webm",
            derivedFrom: sourceRel,
            keyParams: { client: clientParams, ffmpeg: ffmpegParams },
            createdAt: Date.now(),
          });
          const asset = createAsset({
            kind: "video",
            name: name || outName,
            filePath: outName,
            folderId: projectId,
            notes: undefined,
            metadata: { derivedFrom: sourceRel, derivedKind: "keyed-webm", keyParams: clientParams, thumbnailFrom: sourceRel },
            tags: [],
          });
          invalidateHistoryIndex();
          logEvent("video", "keying:done", { requestId, out: outName, assetId: asset.id });
          publish(requestId, "keying-done", { requestId, filePath: outName, asset });
        } catch (e) {
          const err = errInfo(e);
          logError("video", "keying:error", e);
          publish(requestId, "keying-error", { requestId, error: err.message, code: err.code || "KEYING_FAILED" });
        }
      })();
    } catch (e) {
      const err = errInfo(e);
      res.status(err.status || 500).json({ error: err.message, code: err.code || "KEYING_FAILED" });
    }
  });
}
