import type { Express, Request, Response } from "express";
import { errInfo } from "../lib/errInfo.js";
import { approveSpriteAnchor } from "../lib/spriteAnchor.js";
import { spriteRecipeStore } from "../lib/spriteRecipeStore.js";

type IdParams = { id: string };
export function sendSpriteError(res: Response, error: unknown): void { const source = error as { status?: unknown; code?: unknown }; const status = typeof source?.status === "number" ? source.status : 500; const code = status === 500 ? "SPRITE_RECIPE_STORE_ERROR" : typeof source.code === "string" ? source.code : "INVALID_SPRITE_RECIPE"; res.status(status).json({ error: { code, message: status === 500 ? "Sprite recipe storage failed" : errInfo(error).message } }); }
export function registerSpriteRecipeRoutes(app: Express): void {
  app.get("/api/sprite-recipes", async (_req, res) => { try { res.json({ recipes: await spriteRecipeStore.list() }); } catch (error) { sendSpriteError(res, error); } });
  app.post("/api/sprite-recipes", async (req, res) => { try { res.status(201).json({ recipe: await spriteRecipeStore.create(req.body ?? {}) }); } catch (error) { sendSpriteError(res, error); } });
  app.get("/api/sprite-recipes/:id", async (req: Request<IdParams>, res) => { try { const recipe = await spriteRecipeStore.get(req.params.id); if (!recipe) return res.status(404).json({ error: { code: "SPRITE_RECIPE_NOT_FOUND", message: "sprite recipe not found" } }); res.json({ recipe }); } catch (error) { sendSpriteError(res, error); } });
  app.patch("/api/sprite-recipes/:id", async (req: Request<IdParams>, res) => { try { res.json({ recipe: await spriteRecipeStore.update(req.params.id, req.body ?? {}) }); } catch (error) { sendSpriteError(res, error); } });
  app.delete("/api/sprite-recipes/:id", async (req: Request<IdParams>, res) => { try { await spriteRecipeStore.remove(req.params.id); res.json({ ok: true }); } catch (error) { sendSpriteError(res, error); } });
  app.post("/api/sprite-recipes/:id/anchor/approve", async (req: Request<IdParams>, res) => { try { const assetId = typeof req.body?.assetId === "string" ? req.body.assetId : ""; await approveSpriteAnchor(req.params.id, assetId); res.json({ recipe: await spriteRecipeStore.get(req.params.id) }); } catch (error) { sendSpriteError(res, error); } });
}
