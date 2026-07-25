import type { Quality } from "../types";
import { convertFromUsd } from "./currency";

// ═══════════════════════════════════════════════════════════════════════════
// PRICING TABLES — All prices stored in USD per image.
// Sources cited per provider. CNY conversion done at display time.
// Last verified: 2026-07-24
// ═══════════════════════════════════════════════════════════════════════════

// ── OpenAI gpt-image-2 ──────────────────────────────────────────────────────
// Source: https://openai.com/api/pricing/
// Quality tiers map to: low=low, medium=medium, high=high
// Prices are per-image, vary by quality and approximate resolution tier.
const GPT_COST: Record<Quality, Record<string, number>> = {
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
// Source: https://ai.google.dev/gemini-api/docs/pricing
// Flash 3.1: $60/1M tok — 512px=747tok, 1K=1120tok, 2K=1680tok, 4K=2520tok
// Pro 3: $120/1M tok — 1K/2K=1120tok, 4K=2000tok
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

export function estimateGeminiApiCost(size: string, model?: string | null): number {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return 0.003;
  const maxDim = Math.max(Number(match[1]), Number(match[2]));
  const tier = geminiResTier(maxDim);
  const isPro = model === "nano-banana-pro";
  const costMap = isPro ? GEMINI_PRO_COST : GEMINI_FLASH_COST;
  return costMap[tier] ?? costMap["1K"] ?? 0.003;
}

// ── DashScope (阿里云百炼) ─────────────────────────────────────────────────
// Source: https://help.aliyun.com/zh/model-studio/model-pricing (verified 2026-07-24)
// All DashScope image models are priced per-image in CNY.
//费用与输出图像的分辨率、宽高比无关 (flat per-image, no resolution scaling).
// Converted to USD at ~7.2 CNY/USD for internal storage.
//
// Official prices (CNY/image):
//   wanx2.1-t2i-turbo:     ¥0.14   →  $0.0194
//   wanx2.1-t2i-plus:      ¥0.20   →  $0.0278
//   wanx2.1-imageedit:     ¥0.14   →  $0.0194
//   qwen-image-2.0:        ¥0.20   →  $0.0278
//   qwen-image-2.0-pro:    ¥0.50   →  $0.0694
//   qwen-image-max:        ¥0.50   →  $0.0694
//   z-image-turbo:         ¥0.10   →  $0.0139  (prompt_extend=false)
//   wan2.7-image-pro:      ¥0.50   →  $0.0694
//
// Note: wanx2.1-imageedit-plus does not appear on official pricing page.
// Using ¥0.20 → $0.028 as fallback estimate.

const DASHSCOPE_PRICING: Record<string, number> = {
  "wanx2.1-t2i-turbo":        0.0194,
  "wanx2.1-t2i-plus":         0.0278,
  "wanx2.1-imageedit":        0.0194,
  "wanx2.1-imageedit-plus":   0.0278,
  "qwen-image-2.0":           0.0278,
  "qwen-image-2.0-pro":       0.0694,
  "qwen-image-max":           0.0694,
  "z-image-turbo":            0.0139,
  "wan2.7-image-pro":         0.0694,
};

function estimateDashscopeCost(_size: string, model?: string | null): number {
  if (!model) return 0.0278;
  return DASHSCOPE_PRICING[model] ?? 0.0278;
}

// ── Grok / xAI ──────────────────────────────────────────────────────────────
// Source: https://docs.x.ai/developers/models (verified 2026-07-24)
// grok-imagine-image:          $0.02/image
// grok-imagine-image-quality:  $0.05/image
// Pricing does NOT vary by resolution/size.
const GROK_COST: Record<string, number> = {
  "grok-imagine-image": 0.02,
  "grok-imagine-image-quality": 0.05,
};

// ── Doubao (豆包/火山引擎) ─────────────────────────────────────────────────
// Source: https://www.volcengine.com/docs/6791/price (cited, not independently verified)
// doubao-seedream-3-0-t2i: ¥0.20/image (all sizes)
// doubao-seededit-3-0-i2i: ¥0.20/image
// USD: ¥0.20 ÷ 7.2 ≈ $0.028
const DOUBAO_COST: Record<string, number> = {
  "doubao-seedream-3-0-t2i": 0.028,
  "doubao-seededit-3-0-i2i": 0.028,
  "doubao-seedream-5-0": 0.028,
  "seedream": 0.028,
};

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point — kept backward-compatible with original signature.
// Returns USD.
// ═══════════════════════════════════════════════════════════════════════════

export function estimateCost(quality: Quality, size: string, provider?: string, model?: string | null): number {
  if (!provider) return GPT_COST[quality]?.[size] ?? GPT_COST[quality]?.auto ?? 0;

  switch (provider) {
    case "gemini-api":
      return estimateGeminiApiCost(size, model);

    case "dashscope":
      return estimateDashscopeCost(size, model);

    case "grok":
    case "grok-api": {
      if (!model) return 0.02;
      // Doubao models routed through grok provider
      if (model.startsWith("doubao") || model.startsWith("seed")) {
        return DOUBAO_COST[model] ?? 0.028;
      }
      return GROK_COST[model] ?? 0.02;
    }

    case "oauth":
    case "agy":
      // Free providers (OAuth / Gemini agy)
      return 0;

    case "api":
    default:
      // OpenAI gpt-image-2
      if (model && (model.startsWith("doubao") || model.startsWith("seed"))) {
        return DOUBAO_COST[model] ?? 0.028;
      }
      if (model && model.startsWith("grok-")) {
        return GROK_COST[model] ?? 0.02;
      }
      return GPT_COST[quality]?.[size] ?? GPT_COST[quality]?.auto ?? 0;
  }
}

// ── Pricing metadata for display ───────────────────────────────────────────

export interface ModelPricingInfo {
  model: string;
  provider: string;
  priceUsd: number;
  priceCny: number;
  unit: string;
  notes?: string;
}

export function getModelPricingInfo(model: string, provider: string): ModelPricingInfo | null {
  const priceUsd = estimateCost("medium", "1024x1024", provider, model);
  if (priceUsd === 0) return null;

  return {
    model,
    provider,
    priceUsd,
    priceCny: convertFromUsd(priceUsd, "CNY"),
    unit: "image",
  };
}
