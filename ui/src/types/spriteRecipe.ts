export type SpriteAnchorStatus = "missing" | "generating" | "candidate" | "approved";
export type SpriteRowStatus = "pending" | "queued" | "running" | "complete" | "error" | "canceled";

export interface SpriteStateDraft { key: string; frames: number; fps: number; loop: boolean; action: string }
export interface SpriteRecipeDraft {
  name: string; characterId: string; description: string; style: string; baseAssetId: string;
  cell: { width: number; height: number; safeMarginX: number; safeMarginY: number };
  chroma: { preset: string; hex: string };
  states: SpriteStateDraft[];
}
export type SpriteRecipeFieldErrors = Partial<Record<"name" | "characterId" | "description" | "baseAssetId" | "states", string>>;
export interface SpriteAnchorCandidate { assetId: string; url: string; baseUrl?: string | null }
export interface SpriteRecipeRowRecord { stateKey: string; status: SpriteRowStatus; requestId?: string | null; progress?: number; previewUrl?: string | null; imageUrl?: string | null; error?: string | null }
export interface SpriteRecipeRecord extends SpriteRecipeDraft { id: string; projectId?: string | null; anchorStatus: SpriteAnchorStatus; anchorAssetId?: string | null; anchorUrl?: string | null; candidate?: SpriteAnchorCandidate | null; rows: SpriteRecipeRowRecord[]; updatedAt?: number }
export type SpriteRecipeSummary = Pick<SpriteRecipeRecord, "id" | "name" | "anchorStatus" | "updatedAt">;
export interface SpriteGenerateOptions { requestId?: string; async?: true }
export interface SpriteGenerateRowsOptions extends SpriteGenerateOptions { stateKeys?: string[] }
export type SpriteJobEvent = { event: "phase" | "row" | "partial" | "image" | "error" | "done"; data: Record<string, unknown> & { requestId?: string; stateKey?: string } };

export function createEmptySpriteRecipeDraft(): SpriteRecipeDraft {
  return { name: "", characterId: "", description: "", style: "", baseAssetId: "", cell: { width: 256, height: 256, safeMarginX: 8, safeMarginY: 8 }, chroma: { preset: "green", hex: "#00ff00" }, states: [{ key: "idle", frames: 4, fps: 8, loop: true, action: "idle" }] };
}
