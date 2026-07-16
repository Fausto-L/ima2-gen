// Provider model catalog resolver (040, devlog/_plan/260716_mcp-model-surface-ui).
// Runway models come from the verified contract enums (static adapter data);
// Higgsfield models come from the read-only `models_explore` tool — the ONLY
// upstream tool this module may ever call (READONLY_CATALOG_TOOL). Nothing in
// a request can influence the tool name (audit R1-3). Billing tools stay
// denied at the adapter layer; this module never touches them.
import { runwayAdapter } from "./adapters/runway.js";

export type McpModelEntry = { id: string; label: string; description?: string };
export type McpProviderModels = { image: McpModelEntry[]; video: McpModelEntry[] };

/** Sole upstream tool this resolver is allowed to call. Read-only, no credits. */
export const READONLY_CATALOG_TOOL = "models_explore";

/** Pagination bounds per kind (audit R1-5). */
const MAX_PAGES_PER_KIND = 3;
const MAX_ITEMS_PER_KIND = 300;
const PAGE_LIMIT = 100;
/** Catalog calls are interactive; do not inherit the 120s callTool default (R1-4). */
const CATALOG_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

export type CatalogToolCaller = (
  provider: string,
  name: string,
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) => Promise<Record<string, unknown>>;

/** Projects a models_explore result to catalog entries ({id,label,description}
 *  is a projection — source items carry many more fields). */
export function parseModelsExploreItems(result: Record<string, unknown>): McpModelEntry[] {
  const structured = (result as { structuredContent?: { items?: unknown } }).structuredContent;
  const items = Array.isArray(structured?.items) ? structured.items : [];
  const entries: McpModelEntry[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; name?: unknown; description?: unknown };
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    entries.push({
      id: record.id,
      label: typeof record.name === "string" && record.name ? record.name : record.id,
      ...(typeof record.description === "string" && record.description
        ? { description: record.description }
        : {}),
    });
  }
  return entries;
}

function nextCursor(result: Record<string, unknown>): string | null {
  const structured = (result as {
    structuredContent?: { has_more?: unknown; next_page_token?: unknown };
  }).structuredContent;
  if (!structured || structured.has_more !== true) return null;
  return typeof structured.next_page_token === "string" && structured.next_page_token
    ? structured.next_page_token
    : null;
}

async function listHiggsfieldKind(
  callTool: CatalogToolCaller,
  kind: "image" | "video",
  options: { signal?: AbortSignal; timeoutMs?: number },
): Promise<McpModelEntry[]> {
  const seen = new Set<string>();
  const entries: McpModelEntry[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_KIND; page += 1) {
    const result = await callTool(
      "higgsfield",
      READONLY_CATALOG_TOOL,
      { action: "list", type: kind, limit: PAGE_LIMIT, ...(after ? { after } : {}) },
      { signal: options.signal, timeoutMs: options.timeoutMs ?? CATALOG_TIMEOUT_MS },
    );
    for (const entry of parseModelsExploreItems(result)) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
      if (entries.length >= MAX_ITEMS_PER_KIND) return entries;
    }
    const cursor = nextCursor(result);
    if (!cursor || cursor === after) break; // repeated/absent cursor guard (R1-5)
    after = cursor;
  }
  return entries;
}

const cache = new Map<string, { at: number; models: McpProviderModels }>();

/** Test-only: clears the module cache. */
export function clearModelsCatalogCache(): void {
  cache.clear();
}

function staticEntries(ids: readonly string[]): McpModelEntry[] {
  return ids.map((id) => ({ id, label: id }));
}

export async function getProviderModels(
  provider: string,
  callTool: CatalogToolCaller,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<McpProviderModels> {
  if (provider === "runway") {
    return {
      image: staticEntries(runwayAdapter.models.image),
      video: staticEntries(runwayAdapter.models.video),
    };
  }
  if (provider !== "higgsfield") throw new Error("MCP_PROVIDER_UNKNOWN");
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.models;
  const [image, video] = await Promise.all([
    listHiggsfieldKind(callTool, "image", options),
    listHiggsfieldKind(callTool, "video", options),
  ]);
  const models: McpProviderModels = { image, video };
  cache.set(provider, { at: Date.now(), models }); // successes only; errors threw above
  return models;
}
