// MCP runtime types (030 WP3). Secret-free by construction: nothing in these
// shapes may carry tokens, codes, or account data.

export type McpConnectionState =
  | "disconnected"
  | "connecting"
  | "auth_required"
  | "connected"
  | "offline"
  | "error";

export interface McpProviderInfo {
  id: string;
  endpoint: string;
  enabled: boolean;
}

export interface McpConnectionStatus {
  provider: string;
  state: McpConnectionState;
  /** Present only while an OAuth authorization is pending. */
  authorizationUrl?: string;
  /** Secret-free diagnostic message. */
  detail?: string;
  toolCount?: number;
  connectedAt?: string;
  /** Attached after a successful connect/refresh ingest (040): tool-name lists only. */
  snapshotDiff?: { drifted: string[]; missing: string[]; added: string[] };
}

export interface McpToolListing {
  provider: string;
  fetchedAt: string;
  tools: Array<Record<string, unknown>>;
  /** Negotiated live-session metadata for snapshot provenance (040). */
  serverInfo?: Record<string, unknown> | null;
  protocolVersion?: string;
}
