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

/**
 * Derive an aspect ratio label from a size string.
 * "2368x1728" → "4x3", "1024x1024" → "1x1".
 * Supports both "x" and "*" separators.
 * Returns "1x1" if the size string can't be parsed.
 */
export function deriveAspect(size: string): string {
  const match = /^(\d+)[x*](\d+)$/i.exec(size.trim());
  if (!match) return "1x1";
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  if (!w || !h) return "1x1";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  return `${w / d}x${h / d}`;
}

export interface FilenameOptions {
  model: string;
  size: string;
  createdAt: number;
  prompt: string;
  ext: string;
  index?: number;
}

/**
 * Build a structured filename from generation metadata.
 * Format: {model}_{aspect}_{date}_{slug}_{index?}.{ext}
 */
export function buildFilename(opts: FilenameOptions): string {
  const { model, size, createdAt, prompt, ext, index } = opts;
  const aspect = deriveAspect(size);
  const date = new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, "");
  const slug = slugifyPrompt(prompt);
  const indexSuffix = index !== undefined ? `_${index}` : "";
  return `${model}_${aspect}_${date}_${slug}${indexSuffix}.${ext}`;
}
