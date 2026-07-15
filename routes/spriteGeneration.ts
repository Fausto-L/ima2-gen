import type { Express } from "express";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import { runSpriteAnchorGeneration, runSpriteRecipeGeneration } from "../lib/spriteRowPipeline.js";
export function registerSpriteGenerationRoutes(app: Express, ctxRaw: RouteRuntimeContext): void { const ctx = requireRuntimeContext(ctxRaw); app.post("/api/sprite-recipes/:id/anchor/generate", (req, res) => runSpriteAnchorGeneration(req, res, ctx)); app.post("/api/sprite-recipes/:id/generate", (req, res) => runSpriteRecipeGeneration(req, res, ctx)); }
