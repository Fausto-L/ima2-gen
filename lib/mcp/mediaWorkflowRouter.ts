// Media workflow router (060 WP6): pure decision table. Callable is judged per
// TOOL (live snapshot presence + schema hash match), never per provider.
// 011 judgments: extend/stitch have NO native tool on either pilot provider.
export type MediaOperation =
  | "video.extend"
  | "video.stitch"
  | "video.upscale"
  | "image.upscale"
  | "video.edit"
  | "video.reframe"
  | "video.edit.preview"
  | "video.edit.submit";

export type MediaActionMode = "native" | "fallback" | "unavailable";

export interface LiveToolInfo {
  name: string;
  /** True when the live schemaHash matches the stored snapshot (no drift). */
  schemaMatch: boolean;
}

export interface MediaActionDecision {
  mode: MediaActionMode;
  /** Native tool name (mode=native) or fallback strategy id (mode=fallback). */
  plan: string | null;
  reason: string;
}

const NATIVE_TOOL: Partial<Record<MediaOperation, Record<string, string>>> = {
  "video.upscale": { runway: "upscale_video" },
  "image.upscale": { runway: "upscale_image" },
  "video.edit": { runway: "edit_video" },
  "video.edit.preview": { runway: "edit_video" },
  "video.edit.submit": { runway: "edit_video" },
};

const FALLBACK: Partial<Record<MediaOperation, string>> = {
  "video.extend": "last-frame-i2v",
  "video.stitch": "local-ffmpeg-concat",
};

export function resolveMediaAction(input: {
  operation: MediaOperation;
  provider: string;
  liveTools: LiveToolInfo[];
}): MediaActionDecision {
  const nativeName = NATIVE_TOOL[input.operation]?.[input.provider];
  if (nativeName) {
    const live = input.liveTools.find((t) => t.name === nativeName);
    if (live?.schemaMatch) {
      return { mode: "native", plan: nativeName, reason: `live tool ${nativeName} present with matching schema` };
    }
    if (live && !live.schemaMatch) {
      return { mode: "unavailable", plan: null, reason: `tool ${nativeName} schema drifted — execution locked` };
    }
    // Native tool absent live -> fall through to fallback when one exists.
  }
  const fallback = FALLBACK[input.operation];
  if (fallback) return { mode: "fallback", plan: fallback, reason: `no native tool for ${input.operation} on ${input.provider} (011 판정)` };
  if (nativeName) return { mode: "unavailable", plan: null, reason: `tool ${nativeName} not present in live tools/list (entitlement)` };
  return { mode: "unavailable", plan: null, reason: `no mapping for ${input.operation} on ${input.provider}` };
}
