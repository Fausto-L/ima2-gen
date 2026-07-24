import type { Express } from "express";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";
import { aggregateStats, invalidateStatsCache } from "../lib/statsAggregator.js";
import type { StatsRange, StatsCurrency } from "../lib/statsTypes.js";

export function registerStatsRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);
  app.get("/api/stats", async (req, res) => {
    try {
      const rangeRaw = (req.query.range as string) || "7d";
      const currencyRaw = (req.query.currency as string) || "CNY";

      const validRanges: StatsRange[] = ["today", "7d", "30d", "all"];
      const validCurrencies: StatsCurrency[] = ["CNY", "USD"];

      const range = validRanges.includes(rangeRaw as StatsRange)
        ? (rangeRaw as StatsRange)
        : "7d";
      const currency = validCurrencies.includes(currencyRaw as StatsCurrency)
        ? (currencyRaw as StatsCurrency)
        : "CNY";

      const result = await aggregateStats(
        ctx.config.storage.generatedDir,
        range,
        currency,
      );
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to aggregate stats" });
    }
  });

  // POST /api/stats/cache-invalidate — clears the in-memory cache.
  app.post("/api/stats/cache-invalidate", (_req, res) => {
    invalidateStatsCache();
    res.json({ ok: true });
  });
}
