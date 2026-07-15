import { ZodError } from "zod";
import { spriteGenManifestSchema, type SpriteGenManifest } from "./spriteAtlasTypes.js";

export class SpriteManifestError extends Error {
  readonly code = "SPRITE_MANIFEST_INVALID";
  readonly status = 400;
}

export function parseSpriteGenManifest(input: unknown): SpriteGenManifest {
  try { return spriteGenManifestSchema.parse(input); }
  catch (error) {
    const detail = error instanceof ZodError ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") : "invalid JSON";
    throw new SpriteManifestError(`Invalid sprite-gen manifest: ${detail}`);
  }
}

export function serializeSpriteGenManifest(manifest: SpriteGenManifest): string {
  return JSON.stringify(parseSpriteGenManifest(manifest), null, 2);
}

export function validateFrameLayout(manifest: SpriteGenManifest, atlas: { width: number; height: number }): string[] {
  const errors: string[] = [];
  const layout = manifest.frame_layout;
  if (layout.sheetWidth <= 0 || layout.sheetHeight <= 0 || layout.cellWidth <= 0 || layout.cellHeight <= 0) errors.push("frame_layout dimensions must be positive");
  if (layout.sheetWidth !== atlas.width || layout.sheetHeight !== atlas.height) errors.push("frame_layout sheet size does not match atlas");
  for (const [state, rects] of Object.entries(layout.rows)) {
    rects.forEach((rect, index) => {
      if (rect.w <= 0 || rect.h <= 0) errors.push(`${state}[${index}] has non-positive size`);
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > atlas.width || rect.y + rect.h > atlas.height) errors.push(`${state}[${index}] is outside atlas bounds`);
    });
    const animation = manifest.animation.rows[state];
    if (animation && animation.frames !== rects.length) errors.push(`${state} animation frames (${animation.frames}) do not match rect count (${rects.length})`);
  }
  return errors;
}
