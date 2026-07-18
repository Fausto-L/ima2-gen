/**
 * Background presets for asset generation (asset-gen mode / --bg flag).
 *
 * The prompt suffix keeps generated backgrounds uniform enough for a
 * deterministic color key. Prompt assembly is server-owned so the UI, CLI,
 * and integrations share one contract (devlog/_plan/260715_asset_gen_mode/020).
 */

export const BACKGROUND_PRESETS = ["chroma-green", "white", "black"] as const;
export type BackgroundPreset = (typeof BACKGROUND_PRESETS)[number];

export type BackgroundPresetParse =
  | { preset: BackgroundPreset | null }
  | { error: string; code: "INVALID_BACKGROUND_PRESET" };

export function parseBackgroundPreset(raw: unknown): BackgroundPresetParse {
  if (raw === undefined || raw === null || raw === "") return { preset: null };
  if (typeof raw === "string" && (BACKGROUND_PRESETS as readonly string[]).includes(raw)) {
    return { preset: raw as BackgroundPreset };
  }
  return {
    error: `backgroundPreset must be one of: ${BACKGROUND_PRESETS.join(", ")}`,
    code: "INVALID_BACKGROUND_PRESET",
  };
}

const SUFFIX_BY_PRESET: Record<BackgroundPreset, string> = {
  "chroma-green":
    "The entire background must be a completely uniform solid chroma key green, perfectly flat like a professional green screen, with even studio lighting and no shadows, gradients, or texture on the background. The subject must have absolutely no green color cast, no green rim lighting, no green reflections, and no green spill from the background.",
  white:
    "The entire background must be a pure seamless white studio background, perfectly uniform, with even lighting and no shadows, gradients, or texture on the background.",
  black:
    "The entire background must be a pure seamless black studio background, perfectly uniform, with even lighting and no gradients or texture on the background.",
};

export function backgroundPromptSuffix(preset: BackgroundPreset, kind: "image" | "video"): string {
  const base = SUFFIX_BY_PRESET[preset];
  return kind === "video"
    ? `${base} The background must remain static, uniform, and identical in every frame of the video.`
    : base;
}

export function backgroundPlannerConstraint(preset: BackgroundPreset): string {
  const color = preset === "chroma-green" ? "chroma key green" : preset;
  return `Hard constraint: the final prompt MUST explicitly require a completely uniform solid ${color} background with even lighting and no shadows, gradients, or texture on the background.${preset === "chroma-green" ? " The subject must have no green color cast, green rim lighting, green reflections, or green spill from the background." : ""} Never drop, weaken, or reinterpret this requirement.`;
}
