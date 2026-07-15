import { jsonFetch } from "./api-core";
import type { SpriteGenerateOptions, SpriteGenerateRowsOptions, SpriteRecipeDraft, SpriteRecipeRecord } from "../types/spriteRecipe";

const json = (body: unknown, method = "POST", signal?: AbortSignal): RequestInit => ({ method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const listSpriteRecipes = (signal?: AbortSignal) => jsonFetch<{ recipes: SpriteRecipeRecord[] }>("/api/sprite-recipes", { signal });
export const getSpriteRecipe = (id: string, signal?: AbortSignal) => jsonFetch<{ recipe: SpriteRecipeRecord }>(`/api/sprite-recipes/${encodeURIComponent(id)}`, { signal });
export const createSpriteRecipe = (input: SpriteRecipeDraft, signal?: AbortSignal) => jsonFetch<{ recipe: SpriteRecipeRecord }>("/api/sprite-recipes", json(input, "POST", signal));
export const updateSpriteRecipe = (id: string, patch: SpriteRecipeDraft, signal?: AbortSignal) => jsonFetch<{ recipe: SpriteRecipeRecord }>(`/api/sprite-recipes/${encodeURIComponent(id)}`, json(patch, "PATCH", signal));
export const deleteSpriteRecipe = (id: string, signal?: AbortSignal) => jsonFetch<{ ok: true }>(`/api/sprite-recipes/${encodeURIComponent(id)}`, { method: "DELETE", signal });
export const generateSpriteAnchor = (id: string, body: SpriteGenerateOptions = {}, signal?: AbortSignal) => jsonFetch<{ requestId: string }>(`/api/sprite-recipes/${encodeURIComponent(id)}/generate`, json({ ...body, async: true }, "POST", signal));
export const approveSpriteAnchor = (id: string, assetId: string, signal?: AbortSignal) => jsonFetch<{ recipe: SpriteRecipeRecord }>(`/api/sprite-recipes/${encodeURIComponent(id)}/anchor/approve`, json({ assetId }, "POST", signal));
export const generateSpriteRows = (id: string, body: SpriteGenerateRowsOptions = {}, signal?: AbortSignal) => jsonFetch<{ requestId: string }>(`/api/sprite-recipes/${encodeURIComponent(id)}/generate`, json({ ...body, async: true }, "POST", signal));
