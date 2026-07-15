import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { ulid } from "ulid";
import { atomicWriteJson } from "./atomicWrite.js";
import { parseSpriteGenManifest, validateFrameLayout } from "./spriteAtlasManifest.js";
import { resolveSpriteRunDir } from "./spriteRunPath.js";
import { unpackSpriteAtlas } from "./spriteAtlasUnpack.js";

export type SpriteAtlasImportInput = { generatedDir: string; manifest: unknown; atlas: Buffer; runId?: string; unpack?: boolean };
export type SpriteAtlasImportResult = { runId: string; runDir: string; manifestPath: string; atlasPath: string; frameCount: number };

export async function importSpriteAtlas(input: SpriteAtlasImportInput): Promise<SpriteAtlasImportResult> {
  if (!input.manifest) { const error = new Error("manifest is required") as Error & { status: number; code: string }; error.status = 400; error.code = "SPRITE_MANIFEST_REQUIRED"; throw error; }
  const manifest = parseSpriteGenManifest(input.manifest); const metadata = await sharp(input.atlas).metadata();
  if (metadata.format !== "png") { const error = new Error("atlas must be PNG") as Error & { status: number; code: string }; error.status = 400; error.code = "SPRITE_ATLAS_NOT_PNG"; throw error; }
  const layoutErrors = validateFrameLayout(manifest, { width: metadata.width ?? 0, height: metadata.height ?? 0 });
  if (layoutErrors.length) { const error = new Error(layoutErrors.join("; ")) as Error & { status: number; code: string }; error.status = 400; error.code = "SPRITE_LAYOUT_INVALID"; throw error; }
  const runId = input.runId ?? ulid(); const finalDir = resolveSpriteRunDir(input.generatedDir, runId); const tempDir = resolveSpriteRunDir(input.generatedDir, `.tmp-${runId}`.replace(/^\./, "tmp-"));
  const atlasName = basename(manifest.sprite_sheet_alpha || "sprite-sheet-alpha.png");
  let finalized = false;
  try { await mkdir(join(input.generatedDir, "sprite-runs"), { recursive: true }); await mkdir(tempDir); const atlasPath = join(tempDir, atlasName); await writeFile(atlasPath, input.atlas); await atomicWriteJson(join(tempDir, "manifest.json"), manifest); await rename(tempDir, finalDir); finalized = true; let frameCount = 0; if (input.unpack !== false) frameCount = (await unpackSpriteAtlas({ generatedDir: input.generatedDir, runId, manifest, atlasPath: join(finalDir, atlasName) })).frameCount; return { runId, runDir: finalDir, manifestPath: join(finalDir, "manifest.json"), atlasPath: join(finalDir, atlasName), frameCount }; }
  catch (error) { await rm(finalized ? finalDir : tempDir, { recursive: true, force: true }).catch(() => undefined); throw error; }
}
