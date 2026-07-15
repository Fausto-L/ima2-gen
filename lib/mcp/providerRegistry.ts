// Static provider registry (030 WP3). Compiled allowlist — ima2 never connects
// to arbitrary user-supplied MCP endpoints through this lane.
import type { McpProviderInfo } from "./types.js";

const REGISTRY: Record<string, { endpoint: string }> = {
  runway: { endpoint: "https://mcp.runwayml.com/mcp" },
  higgsfield: { endpoint: "https://mcp.higgsfield.ai/mcp" },
};

export function listProviders(enabledIds: string[]): McpProviderInfo[] {
  return Object.entries(REGISTRY).map(([id, entry]) => ({
    id,
    endpoint: entry.endpoint,
    enabled: enabledIds.includes(id),
  }));
}

/** Returns the HTTPS endpoint for an enabled provider, or throws a typed error. */
export function resolveProviderEndpoint(id: string, enabledIds: string[]): string {
  const entry = REGISTRY[id];
  if (!entry) throw new Error(`MCP_PROVIDER_UNKNOWN:${id}`);
  if (!enabledIds.includes(id)) throw new Error(`MCP_PROVIDER_DISABLED:${id}`);
  const url = new URL(entry.endpoint);
  if (url.protocol !== "https:") throw new Error(`MCP_PROVIDER_INSECURE:${id}`);
  return entry.endpoint;
}
