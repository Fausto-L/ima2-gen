// Snapshot sanitizer + canonical hashing (040 WP4).
// Hash domain rule: hashes are computed over canonical (recursively key-sorted)
// JSON of the sanitized tool data ONLY — volatile provenance (fetchedAt, ...) is
// never part of any hash input.
import { createHash } from "node:crypto";

/** Data-driven secret patterns (kept in sync with scripts/lib/spikeSanitize.mjs). */
export const MCP_SECRET_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9_-]{40,}/g, // long opaque tokens
  /[\w.+-]+@[\w-]+\.[\w.]+/g, // emails
  /(sig|signature|token|key|secret)=[^&\s"']+/gi, // signed query params
];

export function scrubValue<T>(value: T): T {
  if (typeof value === "string") {
    let out: string = value;
    for (const pattern of MCP_SECRET_PATTERNS) out = out.replace(pattern, "[REDACTED]");
    return out as unknown as T;
  }
  if (Array.isArray(value)) return value.map((item) => scrubValue(item)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubValue(v)]),
    ) as unknown as T;
  }
  return value;
}

/** Deterministic serialization: recursively sorts object keys. */
export function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function canonicalHash(value: unknown): string {
  return "sha256:" + createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

/** Per-tool schema hash: canonical hash of the schema pair only. */
export function toolSchemaHash(tool: { inputSchema?: unknown; outputSchema?: unknown }): string {
  return canonicalHash({ inputSchema: tool.inputSchema ?? null, outputSchema: tool.outputSchema ?? null });
}
