import type { AssetItem } from "../store/storeTypes";
import type { GenerateItem } from "../types";

export function assetMediaUrl(path: string): string {
  return `/generated/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Convert a stored AssetItem into the GenerateItem shape used by preview lightboxes. */
export function assetToPreviewItem(asset: AssetItem): GenerateItem {
  const path = asset.filePath ?? "";
  const url = assetMediaUrl(path);
  const derivedKind = asset.metadata?.derivedKind;
  return {
    image: url,
    url,
    filename: path,
    prompt: asset.name,
    mediaType: asset.kind === "video" ? "video" : "image",
    createdAt: asset.createdAt,
    requestId: `asset:${asset.id}`,
    kind: typeof derivedKind === "string" && derivedKind.startsWith("keyed-") ? "edit" : "imported",
  };
}
