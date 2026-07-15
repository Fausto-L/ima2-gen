import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Express, Request, Response } from "express";
import { createAsset } from "../lib/assetsStore.js";
import { composeSpriteAtlas } from "../lib/spriteAtlasCompose.js";
import { composeContactSheet } from "../lib/spriteAtlasExport.js";
import { exportTransparentGif } from "../lib/spriteGifExport.js";
import { importSpriteAtlas } from "../lib/spriteAtlasImport.js";
import { parseSpriteGenManifest } from "../lib/spriteAtlasManifest.js";
import { readSpriteCuration, writeSpriteCuration } from "../lib/spriteCurationStore.js";
import { resolveSpriteRunDir } from "../lib/spriteRunPath.js";
import { unpackSpriteAtlas } from "../lib/spriteAtlasUnpack.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import type { SpriteCuration } from "../lib/spriteAtlasTypes.js";

function replyError(res: Response, error: unknown) { const value = error as { status?: number; code?: string; message?: string }; res.status(value.status ?? 500).json({ error: value.message ?? "Sprite atlas operation failed", code: value.code ?? "SPRITE_ATLAS_FAILED" }); }
function decodeAtlas(value: unknown): Buffer { if (typeof value !== "string" || !value) { const error = new Error("atlasBase64 is required") as Error & { status: number; code: string }; error.status = 400; error.code = "SPRITE_ATLAS_REQUIRED"; throw error; } return Buffer.from(value.replace(/^data:image\/png;base64,/, ""), "base64"); }

export function registerSpriteAtlasRoutes(app: Express, ctxRaw: RouteRuntimeContext): void {
  const ctx = requireRuntimeContext(ctxRaw); const generatedDir = ctx.config.storage.generatedDir;
  app.post("/api/sprite-atlas/import", async (req: Request, res: Response) => { try { const result = await importSpriteAtlas({ generatedDir, manifest: req.body?.manifest, atlas: decodeAtlas(req.body?.atlasBase64), runId: req.body?.runId }); const filePath = relative(generatedDir, result.atlasPath); const asset = createAsset({ kind: "image", name: req.body?.name || `Sprite atlas ${result.runId}`, filePath, metadata: { spriteRunId: result.runId, manifestPath: relative(generatedDir, result.manifestPath), derivedKind: "sprite-atlas" } }); res.status(201).json({ ...result, filePath, asset }); } catch (error) { replyError(res, error); } });
  app.get("/api/sprite-atlas/:runId", async (req, res) => { try { const dir = resolveSpriteRunDir(generatedDir, req.params.runId); const manifest = parseSpriteGenManifest(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))); const curation = await readSpriteCuration(generatedDir, req.params.runId); res.json({ runId: req.params.runId, manifest, curation, atlasUrl: `/generated/sprite-runs/${encodeURIComponent(req.params.runId)}/${encodeURIComponent(manifest.sprite_sheet_alpha)}` }); } catch (error) { replyError(res, error); } });
  app.put("/api/sprite-atlas/:runId/curation", async (req, res) => { try { await writeSpriteCuration(generatedDir, req.params.runId, req.body as SpriteCuration); res.json({ ok: true }); } catch (error) { replyError(res, error); } });
  app.post("/api/sprite-atlas/:runId/unpack", async (req, res) => { try { const dir = resolveSpriteRunDir(generatedDir, req.params.runId); const manifest = parseSpriteGenManifest(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))); res.json(await unpackSpriteAtlas({ generatedDir, runId: req.params.runId, manifest, atlasPath: join(dir, manifest.sprite_sheet_alpha) })); } catch (error) { replyError(res, error); } });
  app.post("/api/sprite-atlas/:runId/bake", async (req, res) => { try { res.json(await composeSpriteAtlas({ generatedDir, runId: req.params.runId })); } catch (error) { replyError(res, error); } });
  app.post("/api/sprite-atlas/:runId/export/contact-sheet", async (req, res) => { try { const dir = resolveSpriteRunDir(generatedDir, req.params.runId); const manifest = parseSpriteGenManifest(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))); const state = String(req.body?.state ?? ""); const rects = manifest.frame_layout.rows[state]; if (!rects) throw Object.assign(new Error("Unknown sprite state"), { status: 404, code: "SPRITE_STATE_NOT_FOUND" }); const frames = rects.map((_rect, index) => join(dir, "frames", state, `frame-${index}.png`)); const outputPath = join(dir, `${state}-contact-sheet.png`); await composeContactSheet({ frames, outputPath, cellWidth: manifest.frame_layout.cellWidth, cellHeight: manifest.frame_layout.cellHeight, columns: req.body?.columns }); res.json({ filePath: relative(generatedDir, outputPath) }); } catch (error) { replyError(res, error); } });
  app.post("/api/sprite-atlas/:runId/export/gif", async (req, res) => { try { const dir = resolveSpriteRunDir(generatedDir, req.params.runId); const manifest = parseSpriteGenManifest(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))); const state = String(req.body?.state ?? ""); const animation = manifest.animation.rows[state]; if (!animation) throw Object.assign(new Error("Unknown sprite state"), { status: 404, code: "SPRITE_STATE_NOT_FOUND" }); const outputPath = join(dir, `${state}.gif`); const report = await exportTransparentGif({ framePattern: join(dir, "frames", state, "frame-%d.png"), outputPath, fps: Number(req.body?.fps ?? animation.fps), loop: req.body?.loop ?? animation.loop }); res.json({ filePath: relative(generatedDir, outputPath), report }); } catch (error) { replyError(res, error); } });
}
