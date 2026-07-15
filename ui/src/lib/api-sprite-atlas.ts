import { jsonFetch } from "./api-core";
import type {
  SpriteAtlasRunDto,
  SpriteBakeResult,
  SpriteCuration,
  SpriteExportResult,
  SpriteUnpackResult,
} from "../types/spriteAtlas";

const runPath = (runId: string) => `/api/sprite-atlas/${encodeURIComponent(runId)}`;

export function getSpriteAtlasRun(runId: string): Promise<SpriteAtlasRunDto> {
  return jsonFetch(runPath(runId));
}

export function saveSpriteCuration(runId: string, curation: SpriteCuration): Promise<void> {
  return jsonFetch(`${runPath(runId)}/curation`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(curation),
  });
}

export function bakeSpriteAtlas(runId: string): Promise<SpriteBakeResult> {
  return jsonFetch(`${runPath(runId)}/bake`, { method: "POST" });
}

export function unpackSpriteAtlas(runId: string): Promise<SpriteUnpackResult> {
  return jsonFetch(`${runPath(runId)}/unpack`, { method: "POST" });
}

function exportSprite(runId: string, kind: "contact-sheet" | "gif", state: string): Promise<SpriteExportResult> {
  return jsonFetch(`${runPath(runId)}/export/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

export function exportSpriteContactSheet(runId: string, state: string): Promise<SpriteExportResult> {
  return exportSprite(runId, "contact-sheet", state);
}

export function exportSpriteGif(runId: string, state: string): Promise<SpriteExportResult> {
  return exportSprite(runId, "gif", state);
}
