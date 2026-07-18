import type { GenerateItem } from "../types";

type FavoriteHistoryItem = Pick<GenerateItem, "filename" | "isFavorite">;

export function resolveResultFavorite(
  filename: string | undefined,
  history: FavoriteHistoryItem[],
  favorites: ReadonlySet<string>,
  selectedFavorite?: boolean,
): boolean {
  if (!filename) return false;
  const liveItem = history.find((item) => item.filename === filename);
  if (liveItem) return Boolean(liveItem.isFavorite);
  if (selectedFavorite !== undefined) return selectedFavorite;
  return favorites.has(filename);
}

export function toggleStarredTag(tags: readonly string[], currentlyStarred: boolean): string[] {
  if (currentlyStarred) return tags.filter((tag) => tag !== "starred");
  return Array.from(new Set([...tags, "starred"]));
}
