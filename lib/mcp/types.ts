// MCP runtime types (030 WP3). Secret-free by construction: nothing in these
// shapes may carry tokens, codes, or account data.

export type McpConnectionState =
  /** No live or pending transport is owned by this process. */
  | "disconnected"
  /** One current-generation connect attempt is in flight. */
  | "connecting"
  /** A current, single-use browser authorization is pending. */
  | "auth_required"
  /** The current-generation client completed MCP initialization. */
  | "connected"
  /** A previously connected transport closed; recovery is owned by WP2. */
  | "offline"
  /** The current attempt failed with a secret-free diagnostic code. */
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
  /** Allowlisted secret-free diagnostic code; never a raw upstream body. */
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
