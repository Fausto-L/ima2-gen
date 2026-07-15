import { existsSync, lstatSync } from "node:fs";
import { resolve, sep } from "node:path";

export function resolveSpriteRunDir(generatedDir: string, runId: unknown): string {
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) {
    const error = new Error("Invalid sprite run id") as Error & { status: number; code: string };
    error.status = 400; error.code = "SPRITE_RUN_ID_INVALID"; throw error;
  }
  const root = resolve(generatedDir, "sprite-runs");
  const result = resolve(root, runId);
  if (!result.startsWith(root + sep)) throw new Error("Sprite run path escapes generated storage");
  if ((existsSync(root) && lstatSync(root).isSymbolicLink()) || (existsSync(result) && lstatSync(result).isSymbolicLink())) {
    const error = new Error("Sprite run symlinks are not allowed") as Error & { status: number; code: string };
    error.status = 400; error.code = "SPRITE_RUN_SYMLINK_FORBIDDEN"; throw error;
  }
  return result;
}
