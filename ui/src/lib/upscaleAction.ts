// wp5 054: upscale action helpers (pure, contract-tested). Mirrors the server
// rules: image.upscale takes allowlisted parameters; video.upscale takes none.

export type UpscaleKind = "image" | "video";

export interface UpscaleParams {
  scaleFactor?: 2 | 4 | 8 | 16;
  flavor?: "sublime" | "photo" | "photo_denoiser";
  sharpen?: number;
  smartGrain?: number;
  ultraDetail?: number;
}

export function upscaleKindFromFilename(filename: string): UpscaleKind | null {
  if (/\.(png|jpe?g|webp)$/i.test(filename)) return "image";
  if (/\.(mp4|mov)$/i.test(filename)) return "video";
  return null;
}

/** Server-mirroring guard (054): scaleFactor above 2 requires flavor sublime. */
export function upscaleParamsError(kind: UpscaleKind, params: UpscaleParams): string | null {
  if (kind === "video" && Object.values(params).some((v) => v !== undefined)) {
    return "video upscale takes no parameters";
  }
  if (params.scaleFactor !== undefined && ![2, 4, 8, 16].includes(params.scaleFactor)) {
    return "scaleFactor must be 2, 4, 8, or 16";
  }
  if (params.scaleFactor !== undefined && params.scaleFactor > 2
    && params.flavor !== undefined && params.flavor !== "sublime") {
    return "scaleFactor above 2 requires flavor sublime";
  }
  return null;
}

export function buildUpscaleBody(filename: string, params: UpscaleParams): Record<string, unknown> | null {
  const kind = upscaleKindFromFilename(filename);
  if (!kind || upscaleParamsError(kind, params)) return null;
  const action = kind === "image" ? "upscale-image" : "upscale-video";
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  return {
    action,
    files: [filename],
    ...(Object.keys(clean).length > 0 ? { parameters: clean } : {}),
  };
}
