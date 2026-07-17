import type { AssetItem } from "../store/storeTypes";
import { getAssets, type AssetsPage, type GetAssetsParams } from "./api-assets";

const ELEMENT_SOURCE_TAG_PREFIX = "element-source:";
const ELEMENT_PAGE_LIMIT = 500;

type ElementPageLoader = (input: GetAssetsParams) => Promise<AssetsPage>;

export function elementSourceTag(sourceAssetId: string): string {
  return `${ELEMENT_SOURCE_TAG_PREFIX}${sourceAssetId}`;
}

export function findElementForSource(
  elements: readonly AssetItem[],
  sourceAssetId: string,
): AssetItem | null {
  const tag = elementSourceTag(sourceAssetId);
  return elements.find((element) =>
    element.kind === "element" &&
    (element.metadata?.sourceAssetId === sourceAssetId || element.tags.includes(tag))) ?? null;
}

export function elementPreviewPath(element: AssetItem): string | null {
  const refs = element.metadata?.refs;
  if (!Array.isArray(refs)) return null;
  return refs.find((ref): ref is string => typeof ref === "string" && ref.length > 0) ?? null;
}

export async function loadAllElementAssets(
  loadPage: ElementPageLoader = getAssets,
): Promise<AssetItem[]> {
  const elements: AssetItem[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  try {
    do {
      const page = await loadPage({
        kind: "element",
        folderId: null,
        tag: null,
        q: "",
        cursor,
        limit: ELEMENT_PAGE_LIMIT,
      });
      for (const element of page.assets) {
        if (!seenIds.has(element.id)) {
          seenIds.add(element.id);
          elements.push(element);
        }
      }
      cursor = page.nextCursor;
      if (cursor && seenCursors.has(cursor)) {
        throw new Error("element pagination returned a repeated cursor");
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return elements;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
