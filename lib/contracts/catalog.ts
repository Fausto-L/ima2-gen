// Contract catalog (WP2 / 020) — merges built-in ima2 contracts with provider
// MCP snapshot mirrors into one AI-facing catalog. Pure module: callers supply
// snapshot artifacts; filesystem loading is owned by the 040 snapshot store.
import { BUILTIN_TOOL_CONTRACTS } from "./builtins.js";
import type { SnapshotSource, ToolContract } from "./types.js";

/** Project one sanitized snapshot artifact into namespaced contract entries. */
export function snapshotToContracts(source: SnapshotSource): ToolContract[] {
  const provider = source.provenance.provider;
  return source.tools.map((tool) => ({
    id: `mcp.${provider}.${tool.name}`,
    namespace: `mcp.${provider}` as const,
    name: tool.name,
    ...(tool.title !== undefined ? { title: tool.title } : {}),
    description: tool.description ?? "",
    trust: "upstream-untrusted" as const,
    inputSchema: tool.inputSchema ?? { type: "object" },
    ...(tool.outputSchema !== undefined ? { outputSchema: tool.outputSchema } : {}),
    ...(tool.annotations !== undefined ? { annotations: tool.annotations } : {}),
    errorContract: ["auth_required", "unavailable", "schema_changed", "invalid_input", "upstream_error"] as ToolContract["errorContract"],
    executionOwner: "ima2-server" as const,
    availability: {
      state: "documented" as const,
      cause: "auth_required" as const,
      evidence: `snapshot ${source.provenance.sanitizedHash} @ ${source.provenance.fetchedAt}`,
    },
    provenance: source.provenance,
  }));
}

export interface BuildCatalogOptions {
  snapshots?: SnapshotSource[];
}

/** Build the full catalog. Throws on duplicate ids (startup misconfiguration). */
export function buildCatalog({ snapshots = [] }: BuildCatalogOptions = {}): ToolContract[] {
  const entries: ToolContract[] = [...BUILTIN_TOOL_CONTRACTS];
  for (const source of snapshots) entries.push(...snapshotToContracts(source));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) throw new Error(`duplicate tool contract id: ${entry.id}`);
    seen.add(entry.id);
  }
  return entries;
}

/** Additive summary for `ima2 capabilities --json` (WP2 audit blocker 1). */
export function catalogSummary(entries: ToolContract[]): {
  total: number;
  namespaces: Record<string, { total: number; byAvailability: Record<string, number> }>;
} {
  const namespaces: Record<string, { total: number; byAvailability: Record<string, number> }> = {};
  for (const entry of entries) {
    const ns = (namespaces[entry.namespace] ??= { total: 0, byAvailability: {} });
    ns.total += 1;
    ns.byAvailability[entry.availability.state] = (ns.byAvailability[entry.availability.state] ?? 0) + 1;
  }
  return { total: entries.length, namespaces };
}
