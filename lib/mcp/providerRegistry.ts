// Static provider registry (030 WP3). Compiled allowlist — ima2 never connects
// to arbitrary user-supplied MCP endpoints through this lane.
import type { McpProviderInfo } from "./types.js";
import { higgsfieldAdapter } from "./adapters/higgsfield.js";
import { runwayAdapter } from "./adapters/runway.js";

export type McpCatalogAccess = "static" | "connected";

export interface McpProviderDescriptor extends McpProviderInfo {
  executable: boolean;
  lockReason?: string;
  catalogAccess: McpCatalogAccess;
  defaults: { image?: string; video?: string };
}

const REGISTRY: Record<string, Omit<McpProviderDescriptor, "id" | "enabled">> = {
  runway: {
    endpoint: "https://mcp.runwayml.com/mcp",
    executable: runwayAdapter.executable,
    catalogAccess: "static",
    defaults: { image: "nano-banana-pro", video: "seedance-2" },
  },
  higgsfield: {
    endpoint: "https://mcp.higgsfield.ai/mcp",
    executable: higgsfieldAdapter.executable,
    lockReason: "catalog-only until paid plan",
    catalogAccess: "connected",
    defaults: {},
  },
};

export function listProviders(enabledIds: string[]): McpProviderDescriptor[] {
  return Object.entries(REGISTRY).map(([id, entry]) => ({
    id,
    ...entry,
    defaults: { ...entry.defaults },
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
