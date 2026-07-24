// Server-side pricing tables — mirrors ui/src/lib/cost.ts.
// Used by lib/statsAggregator.ts to derive per-image cost from generation metadata.
// If you update pricing here, also update ui/src/lib/cost.ts to keep them in sync.

type Quality = "low" | "medium" | "high" | "auto" | string;

// ── OpenAI gpt-image-2 ──────────────────────────────────────────────────────
// Source: https://openai.com/api/pricing/
const GPT_COST: Record<string, Record<string, number>> = {
  low: {
    "1024x1024": 0.006,
    "1024x1536": 0.005, "1536x1024": 0.005,
    "1024x1360": 0.005, "1360x1024": 0.005,
    "1024x1824": 0.006, "1824x1024": 0.006,
    "2048x2048": 0.012,
    "2048x1152": 0.009, "1152x2048": 0.009,
    "3840x2160": 0.023, "2160x3840": 0.023,
    auto: 0.006, custom: 0.006,
  },
  medium: {
    "1024x1024": 0.053,
    "1024x1536": 0.041, "1536x1024": 0.041,
    "1024x1360": 0.041, "1360x1024": 0.041,
    "1024x1824": 0.05,  "1824x1024": 0.05,
    "2048x2048": 0.106,
    "2048x1152": 0.08,  "1152x2048": 0.08,
    "3840x2160": 0.2,   "2160x3840": 0.2,
    auto: 0.053, custom: 0.053,
  },
  high: {
    "1024x1024": 0.211,
    "1024x1536": 0.165, "1536x1024": 0.165,
    "1024x1360": 0.165, "1360x1024": 0.165,
    "1024x1824": 0.2,   "1824x1024": 0.2,
    "2048x2048": 0.422,
    "2048x1152": 0.32,  "1152x2048": 0.32,
    "3840x2160": 0.8,   "2160x3840": 0.8,
    auto: 0.211, custom: 0.211,
  },
};

// ── Google Gemini / Imagen (nano-banana) ───────────────────────────────────
const GEMINI_FLASH_COST: Record<string, number> = {
  "512": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151,
};
const GEMINI_PRO_COST: Record<string, number> = {
  "512": 0.134, "1K": 0.134, "2K": 0.134, "4K": 0.240,
};

function geminiResTier(maxDim: number): string {
  if (maxDim <= 512) return "512";
  if (maxDim <= 1024) return "1K";
  if (maxDim <= 2048) return "2K";
  return "4K";
}

function estimateGeminiApiCost(size: string, model?: string | null): number {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return 0.003;
  const maxDim = Math.max(Number(match[1]), Number(match[2]));
  const tier = geminiResTier(maxDim);
  const isPro = model === "nano-banana-pro";
  const costMap = isPro ? GEMINI_PRO_COST : GEMINI_FLASH_COST;
  return costMap[tier] ?? costMap["1K"] ?? 0.003;
}

// ── DashScope (阿里云百炼) ─────────────────────────────────────────────────
const DASHSCOPE_PRICING: Record<string, number> = {
  "wanx2.1-t2i-turbo":        0.0194,
  "wanx2.1-t2i-plus":         0.0278,
  "wanx2.1-imageedit":        0.0194,
  "wanx2.1-imageedit-plus":   0.0278,
  "qwen-image-2.0":           0.0278,
  "qwen-image-2.0-pro":       0.0694,
  "qwen-image-max":           0.0694,
  "z-image-turbo":            0.0139,
  "wan2.7-image-pro":          0.0694,
  "wanx-v1.1-t2i-turbo":      0.0194,
};

function estimateDashscopeCost(_size: string, model?: string | null): number {
  if (!model) return 0.0278;
  return DASHSCOPE_PRICING[model] ?? 0.0278;
}

// ── Grok / xAI ──────────────────────────────────────────────────────────────
const GROK_COST: Record<string, number> = {
  "grok-imagine-image": 0.02,
  "grok-imagine-image-quality": 0.05,
};

// ── Doubao (豆包/火山引擎) ─────────────────────────────────────────────────
const DOUBAO_COST: Record<string, number> = {
  "doubao-seedream-3-0-t2i": 0.028,
  "doubao-seededit-3-0-i2i": 0.028,
  "doubao-seedream-5-0": 0.028,
  "seedream": 0.028,
};

export const USD_TO_CNY = 7.2;

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point — returns USD per image.
// ═══════════════════════════════════════════════════════════════════════════

export function estimateCost(
  quality: Quality,
  size: string,
  provider?: string,
  model?: string | null,
): number {
  if (!provider) return GPT_COST[quality]?.[size] ?? GPT_COST[quality]?.auto ?? 0;

  switch (provider) {
    case "gemini-api":
      return estimateGeminiApiCost(size, model);

    case "dashscope":
      return estimateDashscopeCost(size, model);

    case "grok":
    case "grok-api": {
      if (!model) return 0.02;
      if (model.startsWith("doubao") || model.startsWith("seed")) {
        return DOUBAO_COST[model] ?? 0.028;
      }
      return GROK_COST[model] ?? 0.02;
    }

    case "oauth":
    case "agy":
      return 0;

    case "api":
    default: {
      if (model && (model.startsWith("doubao") || model.startsWith("seed"))) {
        return DOUBAO_COST[model] ?? 0.028;
      }
      if (model && model.startsWith("grok-")) {
        return GROK_COST[model] ?? 0.02;
      }
      return GPT_COST[quality]?.[size] ?? GPT_COST[quality]?.auto ?? 0;
    }
  }
}
