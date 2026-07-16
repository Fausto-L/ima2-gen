import type { Express, Request, Response } from "express";
import { errInfo } from "../lib/errInfo.js";
import {
  createMcpTempReferenceBatch,
  deleteMcpTempReferenceBatch,
} from "../lib/mcpTempReferenceStore.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

function sendRouteError(res: Response, error: unknown): void {
  const info = errInfo(error);
  const status = info.status === 400 ? 400 : 500;
  res.status(status).json({
    ok: false,
    error: {
      code: status === 400 ? (info.code ?? "INVALID_MCP_TEMP_REFERENCES") : "MCP_TEMP_REFERENCES_FAILED",
      message: status === 400 ? info.message : "Temporary references could not be processed",
    },
  });
}

export function registerMcpTempReferenceRoutes(app: Express, ctxRaw: RouteRuntimeContext): void {
  const ctx = requireRuntimeContext(ctxRaw);

  app.post("/api/mcp/temp-references", async (req: Request, res: Response) => {
    try {
      const result = await createMcpTempReferenceBatch(ctx.config.storage.generatedDir, req.body);
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.delete("/api/mcp/temp-references/:batchId", async (req: Request, res: Response) => {
    try {
      const batchId = String(req.params.batchId ?? "");
      const deleted = await deleteMcpTempReferenceBatch(ctx.config.storage.generatedDir, batchId);
      res.status(200).json({ ok: true, batchId, deleted });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
