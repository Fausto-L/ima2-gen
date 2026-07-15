// Per-provider MCP connection lifecycle (030 WP3).
// Owns: connect / OAuth pendingAuth correlation / callback finish / disconnect /
// paginated tools/list. Does NOT own sanitize/hash/drift (040) or adapters (050).
import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { resolveProviderEndpoint } from "./providerRegistry.js";
import { createServerOAuthProvider, type ServerOAuthProvider } from "./oauthProvider.js";
import { deleteTokenRecord } from "./tokenStore.js";
import type { McpConnectionStatus, McpToolListing } from "./types.js";

const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

interface ProviderSession {
  state: McpConnectionStatus["state"];
  client?: Client;
  transport?: StreamableHTTPClientTransport;
  authorizationUrl?: string;
  detail?: string;
  connectedAt?: string;
  toolCount?: number;
  snapshotDiff?: { drifted: string[]; missing: string[]; added: string[] };
}

interface PendingAuth {
  provider: string;
  transport: StreamableHTTPClientTransport;
  expiresAt: number;
}

export interface McpConnectionManagerOptions {
  enabledProviders: string[];
  tokenDir: string;
  /** Live server origin, resolved AFTER listen (audit round 1 blocker 1). */
  getOrigin: () => string;
  /** Test seams. */
  transportFactory?: (endpoint: string, authProvider: ServerOAuthProvider) => StreamableHTTPClientTransport;
  clientFactory?: () => Client;
}

export class McpConnectionManager {
  private readonly options: McpConnectionManagerOptions;
  private readonly sessions = new Map<string, ProviderSession>();
  private readonly pendingAuth = new Map<string, PendingAuth>();

  constructor(options: McpConnectionManagerOptions) {
    this.options = options;
  }

  private makeTransport(endpoint: string, authProvider: ServerOAuthProvider): StreamableHTTPClientTransport {
    if (this.options.transportFactory) return this.options.transportFactory(endpoint, authProvider);
    return new StreamableHTTPClientTransport(new URL(endpoint), { authProvider: authProvider as never });
  }

  private makeClient(): Client {
    if (this.options.clientFactory) return this.options.clientFactory();
    return new Client({ name: "ima2-gen", version: "2.x" }, { capabilities: {} });
  }

  private session(provider: string): ProviderSession {
    let session = this.sessions.get(provider);
    if (!session) { session = { state: "disconnected" }; this.sessions.set(provider, session); }
    return session;
  }

  status(provider: string): McpConnectionStatus {
    const s = this.session(provider);
    return {
      provider,
      state: s.state,
      ...(s.authorizationUrl ? { authorizationUrl: s.authorizationUrl } : {}),
      ...(s.detail ? { detail: s.detail } : {}),
      ...(s.toolCount !== undefined ? { toolCount: s.toolCount } : {}),
      ...(s.connectedAt ? { connectedAt: s.connectedAt } : {}),
      ...(s.snapshotDiff ? { snapshotDiff: s.snapshotDiff } : {}),
    };
  }

  async connect(provider: string): Promise<McpConnectionStatus> {
    const endpoint = resolveProviderEndpoint(provider, this.options.enabledProviders);
    const session = this.session(provider);
    if (session.state === "connected") return this.status(provider);
    session.state = "connecting";
    session.authorizationUrl = undefined;
    const oauthState = randomBytes(24).toString("base64url");
    const authProvider = createServerOAuthProvider({
      provider, tokenDir: this.options.tokenDir, origin: this.options.getOrigin(), oauthState,
    });
    const transport = this.makeTransport(endpoint, authProvider);
    const client = this.makeClient();
    try {
      await client.connect(transport as never);
      session.state = "connected";
      session.client = client;
      session.transport = transport;
      session.connectedAt = new Date().toISOString();
      session.detail = undefined;
      return this.status(provider);
    } catch (error) {
      if (error instanceof UnauthorizedError || /unauthorized/i.test(String((error as Error)?.message))) {
        this.pendingAuth.set(oauthState, { provider, transport, expiresAt: Date.now() + PENDING_AUTH_TTL_MS });
        session.state = "auth_required";
        session.authorizationUrl = authProvider.lastAuthorizationUrl ?? undefined;
        return this.status(provider);
      }
      session.state = "error";
      session.detail = String((error as Error)?.message ?? error).slice(0, 300);
      return this.status(provider);
    }
  }

  /** Consume-before-exchange: state is removed before finishAuth (single use). */
  async handleOAuthCallback(state: string, code: string): Promise<McpConnectionStatus> {
    const pending = this.pendingAuth.get(state);
    if (pending) this.pendingAuth.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new Error("MCP_OAUTH_STATE_INVALID");
    await pending.transport.finishAuth(code);
    await pending.transport.close().catch(() => undefined);
    this.sessions.delete(pending.provider);
    return this.connect(pending.provider);
  }

  async listTools(provider: string): Promise<McpToolListing> {
    const session = this.session(provider);
    if (session.state !== "connected" || !session.client) throw new Error("MCP_NOT_CONNECTED");
    const tools: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    do {
      const page = await session.client.listTools(cursor ? { cursor } : {});
      tools.push(...(page.tools as Array<Record<string, unknown>>));
      cursor = page.nextCursor;
    } while (cursor);
    session.toolCount = tools.length;
    const client = session.client as unknown as {
      getServerVersion?: () => Record<string, unknown> | undefined;
    };
    const transport = session.transport as unknown as { protocolVersion?: string } | undefined;
    return {
      provider,
      fetchedAt: new Date().toISOString(),
      tools,
      serverInfo: client.getServerVersion?.() ?? null,
      ...(transport?.protocolVersion ? { protocolVersion: transport.protocolVersion } : {}),
    };
  }

  /** Attach an ingest diff to the provider status (called by routes after ingest). */
  attachSnapshotDiff(provider: string, diff: { drifted: string[]; missing: string[]; added: string[] }): void {
    this.session(provider).snapshotDiff = diff;
  }

  /** Close the live session but KEEP stored tokens (refresh path). */
  async reset(provider: string): Promise<void> {
    const session = this.session(provider);
    await session.transport?.close().catch(() => undefined);
    this.sessions.set(provider, { state: "disconnected" });
  }

  /** Local-only cleanup: closes the session and deletes stored tokens. Does not
   *  revoke the provider-side grant (and never claims to). */
  async disconnect(provider: string): Promise<McpConnectionStatus> {
    const session = this.session(provider);
    await session.transport?.close().catch(() => undefined);
    this.sessions.set(provider, { state: "disconnected" });
    deleteTokenRecord(this.options.tokenDir, provider);
    return this.status(provider);
  }
}
