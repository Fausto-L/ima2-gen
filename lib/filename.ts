/**
 * Slugify a user prompt into a filesystem-safe string ≤20 chars.
 * CJK characters are preserved as-is.
 */
export function slugifyPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  const cleaned = trimmed.replace(/[/\\:*?"<>|]/g, "");
  const spaced = cleaned.replace(/\s+/g, "-");
  const collapsed = spaced.replace(/-+/g, "-");
  const hyphenTrimmed = collapsed.replace(/^-+|-+$/g, "");
  const truncated = hyphenTrimmed.slice(0, 20);
  const final = truncated.replace(/-+$/g, "");
  return final || "untitled";
}
