import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { listProviders, resolveProviderEndpoint } from "./providerRegistry.js";
import { createServerOAuthProvider, type ServerOAuthProvider } from "./oauthProvider.js";
import { tombstoneTokenRecord } from "./tokenStore.js";
import type { McpConnectionStatus, McpToolListing } from "./types.js";

const DEFAULT_PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

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
  generation: number;
  transport: StreamableHTTPClientTransport;
  expiresAt: number;
}

export interface McpConnectionManagerOptions {
  enabledProviders: string[];
  tokenDir: string;
  getOrigin: () => string;
  now?: () => number;
  pendingAuthTtlMs?: number;
  transportFactory?: (endpoint: string, authProvider: ServerOAuthProvider) => StreamableHTTPClientTransport;
  clientFactory?: () => Client;
}

export class McpConnectionManager {
  private readonly sessions = new Map<string, ProviderSession>();
  private readonly pendingAuth = new Map<string, PendingAuth>();
  private readonly activeCallbacks = new Map<string, PendingAuth>();
  private readonly generations = new Map<string, number>();
  private readonly candidates = new Map<string, Set<StreamableHTTPClientTransport>>();
  private readonly connectFlights = new Map<string, { generation: number; promise: Promise<McpConnectionStatus> }>();
  private readonly resetFlights = new Map<string, Promise<void>>();
  private readonly refreshFlights = new Map<string, Promise<McpConnectionStatus>>();
  private readonly callbackFlights = new Map<string, { generation: number; promise: Promise<McpConnectionStatus> }>();
  private readonly disconnectFlights = new Map<string, Promise<McpConnectionStatus>>();
  private readonly disconnectIntents = new Set<string>();

  constructor(private readonly options: McpConnectionManagerOptions) {}

  private now(): number { return this.options.now?.() ?? Date.now(); }
  private generation(provider: string): number { return this.generations.get(provider) ?? 0; }
  private bumpGeneration(provider: string): number {
    const next = this.generation(provider) + 1;
    this.generations.set(provider, next);
    return next;
  }

  private makeTransport(endpoint: string, authProvider: ServerOAuthProvider): StreamableHTTPClientTransport {
    if (this.options.transportFactory) return this.options.transportFactory(endpoint, authProvider);
    return new StreamableHTTPClientTransport(new URL(endpoint), { authProvider });
  }

  private makeClient(): Client {
    if (this.options.clientFactory) return this.options.clientFactory();
    return new Client({ name: "ima2-gen", version: "2.x" }, { capabilities: {} });
  }

  private knownProvider(provider: string): { enabled: boolean } {
    const descriptor = listProviders(this.options.enabledProviders).find((entry) => entry.id === provider);
    if (!descriptor) throw new Error(`MCP_PROVIDER_UNKNOWN:${provider}`);
    return descriptor;
  }

  private mutableSession(provider: string): ProviderSession {
    let session = this.sessions.get(provider);
    if (!session) { session = { state: "disconnected" }; this.sessions.set(provider, session); }
    return session;
  }

  private disconnectedStatus(provider: string): McpConnectionStatus {
    return { provider, state: "disconnected" };
  }

  status(provider: string): McpConnectionStatus {
    const descriptor = this.knownProvider(provider);
    if (!descriptor.enabled) return this.disconnectedStatus(provider);
    const session = this.sessions.get(provider);
    if (!session) return this.disconnectedStatus(provider);
    return {
      provider,
      state: session.state,
      ...(session.authorizationUrl ? { authorizationUrl: session.authorizationUrl } : {}),
      ...(session.detail ? { detail: session.detail } : {}),
      ...(session.toolCount !== undefined ? { toolCount: session.toolCount } : {}),
      ...(session.connectedAt ? { connectedAt: session.connectedAt } : {}),
      ...(session.snapshotDiff ? { snapshotDiff: session.snapshotDiff } : {}),
    };
  }

  private addCandidate(provider: string, transport: StreamableHTTPClientTransport): void {
    const set = this.candidates.get(provider) ?? new Set<StreamableHTTPClientTransport>();
    set.add(transport);
    this.candidates.set(provider, set);
  }

  private removeCandidate(provider: string, transport: StreamableHTTPClientTransport): void {
    const set = this.candidates.get(provider);
    set?.delete(transport);
    if (set?.size === 0) this.candidates.delete(provider);
  }

  private isCurrent(provider: string, generation: number): boolean {
    return this.generation(provider) === generation && !this.disconnectIntents.has(provider);
  }

  async connect(provider: string): Promise<McpConnectionStatus> {
    const endpoint = resolveProviderEndpoint(provider, this.options.enabledProviders);
    const disconnect = this.disconnectFlights.get(provider);
    if (disconnect || this.disconnectIntents.has(provider)) return disconnect ?? this.disconnectedStatus(provider);
    const reset = this.resetFlights.get(provider);
    if (reset) { await reset; return this.status(provider); }
    const refresh = this.refreshFlights.get(provider);
    if (refresh) return refresh;
    const callback = this.callbackFlights.get(provider);
    if (callback?.generation === this.generation(provider)) return callback.promise;
    if (callback) this.callbackFlights.delete(provider);
    return this.connectAtGeneration(provider, endpoint, this.generation(provider));
  }

  private connectAtGeneration(provider: string, endpoint: string, generation: number): Promise<McpConnectionStatus> {
    if (!this.isCurrent(provider, generation)) return Promise.resolve(this.status(provider));
    const session = this.sessions.get(provider);
    if (session?.state === "connected") return Promise.resolve(this.status(provider));
    const current = this.connectFlights.get(provider);
    if (current?.generation === generation) return current.promise;
    const promise = this.performConnect(provider, endpoint, generation);
    this.connectFlights.set(provider, { generation, promise });
    void promise.finally(() => {
      if (this.connectFlights.get(provider)?.promise === promise) this.connectFlights.delete(provider);
    }).catch(() => undefined);
    return promise;
  }

  private async performConnect(provider: string, endpoint: string, generation: number): Promise<McpConnectionStatus> {
    const session = this.mutableSession(provider);
    session.state = "connecting";
    session.authorizationUrl = undefined;
    session.detail = undefined;
    const oauthState = randomBytes(24).toString("base64url");
    const authProvider = createServerOAuthProvider({
      provider,
      tokenDir: this.options.tokenDir,
      origin: this.options.getOrigin(),
      endpoint,
      oauthState,
      isCurrent: () => this.isCurrent(provider, generation),
    });
    const transport = this.makeTransport(endpoint, authProvider);
    const client = this.makeClient();
    this.addCandidate(provider, transport);
    try {
      await client.connect(transport);
      if (!this.isCurrent(provider, generation)) return this.closeStale(provider, transport);
      this.removeCandidate(provider, transport);
      Object.assign(session, {
        state: "connected",
        client,
        transport,
        connectedAt: new Date(this.now()).toISOString(),
        detail: undefined,
      });
      return this.status(provider);
    } catch (error) {
      if (!this.isCurrent(provider, generation)) return this.closeStale(provider, transport);
      if (error instanceof UnauthorizedError || /unauthorized/i.test(String((error as Error)?.message))) {
        const retained = await this.replacePending(provider, oauthState, generation, transport);
        if (!retained || !this.isCurrent(provider, generation)) return this.closeStale(provider, transport);
        session.state = "auth_required";
        session.authorizationUrl = authProvider.lastAuthorizationUrl ?? undefined;
        return this.status(provider);
      }
      this.removeCandidate(provider, transport);
      await transport.close().catch(() => undefined);
      if (!this.isCurrent(provider, generation)) return this.status(provider);
      session.state = "error";
      session.detail = "MCP_CONNECT_FAILED";
      return this.status(provider);
    }
  }

  private async closeStale(provider: string, transport: StreamableHTTPClientTransport): Promise<McpConnectionStatus> {
    this.removeCandidate(provider, transport);
    await transport.close().catch(() => undefined);
    return this.status(provider);
  }

  private async replacePending(
    provider: string,
    state: string,
    generation: number,
    transport: StreamableHTTPClientTransport,
  ): Promise<boolean> {
    const old = [...this.pendingAuth.entries()].find(([, value]) => value.provider === provider);
    if (old) {
      this.pendingAuth.delete(old[0]);
      this.removeCandidate(provider, old[1].transport);
      await old[1].transport.close().catch(() => undefined);
    }
    if (!this.isCurrent(provider, generation)) return false;
    this.pendingAuth.set(state, {
      provider,
      generation,
      transport,
      expiresAt: this.now() + (this.options.pendingAuthTtlMs ?? DEFAULT_PENDING_AUTH_TTL_MS),
    });
    return true;
  }

  handleOAuthCallback(state: string, code: string): Promise<McpConnectionStatus> {
    const pending = this.pendingAuth.get(state);
    this.pendingAuth.delete(state);
    if (!pending || pending.expiresAt < this.now() || !this.isCurrent(pending.provider, pending.generation)) {
      return this.rejectInvalidCallback(pending);
    }
    if (this.callbackFlights.get(pending.provider)?.generation === pending.generation) {
      return this.rejectInvalidCallback(pending);
    }
    this.activeCallbacks.set(state, pending);
    const promise = this.performOAuthCallback(state, code, pending);
    const flight = { generation: pending.generation, promise };
    this.callbackFlights.set(pending.provider, flight);
    void promise.finally(() => {
      if (this.activeCallbacks.get(state) === pending) this.activeCallbacks.delete(state);
      if (this.callbackFlights.get(pending.provider) === flight) this.callbackFlights.delete(pending.provider);
    }).catch(() => undefined);
    return promise;
  }

  private async rejectInvalidCallback(pending?: PendingAuth): Promise<never> {
    if (pending) {
      this.removeCandidate(pending.provider, pending.transport);
      await pending.transport.close().catch(() => undefined);
      if (this.isCurrent(pending.provider, pending.generation)) this.markDisconnected(pending.provider);
    }
    throw new Error("MCP_OAUTH_STATE_INVALID");
  }

  private async performOAuthCallback(
    state: string,
    code: string,
    pending: PendingAuth,
  ): Promise<McpConnectionStatus> {
    try {
      await pending.transport.finishAuth(code);
      if (this.activeCallbacks.get(state) !== pending || !this.isCurrent(pending.provider, pending.generation)) {
        throw new Error("MCP_OAUTH_GENERATION_STALE");
      }
      await pending.transport.close().catch(() => undefined);
      if (this.activeCallbacks.get(state) !== pending || !this.isCurrent(pending.provider, pending.generation)) {
        throw new Error("MCP_OAUTH_GENERATION_STALE");
      }
      this.removeCandidate(pending.provider, pending.transport);
      this.sessions.set(pending.provider, { state: "disconnected" });
      const endpoint = resolveProviderEndpoint(pending.provider, this.options.enabledProviders);
      return this.connectAtGeneration(pending.provider, endpoint, pending.generation);
    } catch (error) {
      await pending.transport.close().catch(() => undefined);
      this.removeCandidate(pending.provider, pending.transport);
      const codeOnly = String((error as Error)?.message ?? error).split(":")[0];
      if (codeOnly === "MCP_OAUTH_GENERATION_STALE" || codeOnly === "MCP_TOKEN_REVISION_STALE") {
        throw new Error("MCP_OAUTH_GENERATION_STALE");
      }
      throw new Error("MCP_OAUTH_CALLBACK_FAILED");
    }
  }

  private async closeProviderWork(provider: string): Promise<void> {
    const transports = new Set<StreamableHTTPClientTransport>(this.candidates.get(provider) ?? []);
    const session = this.sessions.get(provider);
    if (session?.transport) transports.add(session.transport);
    for (const [state, pending] of this.pendingAuth) {
      if (pending.provider === provider) { this.pendingAuth.delete(state); transports.add(pending.transport); }
    }
    for (const [state, pending] of this.activeCallbacks) {
      if (pending.provider === provider) { this.activeCallbacks.delete(state); transports.add(pending.transport); }
    }
    this.candidates.delete(provider);
    await Promise.all([...transports].map((transport) => transport.close().catch(() => undefined)));
    const current = this.sessions.get(provider);
    if (current && current === session) {
      delete current.client;
      delete current.transport;
      delete current.connectedAt;
      delete current.toolCount;
    }
  }

  private markDisconnected(provider: string): void {
    const session = this.sessions.get(provider);
    if (!session) { this.sessions.set(provider, { state: "disconnected" }); return; }
    session.state = "disconnected";
    session.authorizationUrl = undefined;
    session.detail = undefined;
    session.snapshotDiff = undefined;
  }

  reset(provider: string): Promise<void> {
    resolveProviderEndpoint(provider, this.options.enabledProviders);
    const disconnect = this.disconnectFlights.get(provider);
    if (disconnect || this.disconnectIntents.has(provider)) return disconnect?.then(() => undefined) ?? Promise.resolve();
    const existing = this.resetFlights.get(provider);
    if (existing) return existing;
    this.bumpGeneration(provider);
    this.markDisconnected(provider);
    const promise = this.closeProviderWork(provider);
    this.resetFlights.set(provider, promise);
    void promise.finally(() => {
      if (this.resetFlights.get(provider) === promise) this.resetFlights.delete(provider);
    }).catch(() => undefined);
    return promise;
  }

  refresh(provider: string): Promise<McpConnectionStatus> {
    const endpoint = resolveProviderEndpoint(provider, this.options.enabledProviders);
    const disconnect = this.disconnectFlights.get(provider);
    if (disconnect || this.disconnectIntents.has(provider)) return disconnect ?? Promise.resolve(this.disconnectedStatus(provider));
    const reset = this.resetFlights.get(provider);
    if (reset) return reset.then(() => this.status(provider));
    const existing = this.refreshFlights.get(provider);
    if (existing) return existing;
    const generation = this.bumpGeneration(provider);
    this.markDisconnected(provider);
    const promise = this.performRefresh(provider, endpoint, generation);
    this.refreshFlights.set(provider, promise);
    void promise.finally(() => {
      if (this.refreshFlights.get(provider) === promise) this.refreshFlights.delete(provider);
    }).catch(() => undefined);
    return promise;
  }

  private async performRefresh(provider: string, endpoint: string, generation: number): Promise<McpConnectionStatus> {
    await this.closeProviderWork(provider);
    if (!this.isCurrent(provider, generation)) return this.status(provider);
    return this.connectAtGeneration(provider, endpoint, generation);
  }

  disconnect(provider: string): Promise<McpConnectionStatus> {
    const endpoint = resolveProviderEndpoint(provider, this.options.enabledProviders);
    const existing = this.disconnectFlights.get(provider);
    if (existing) return existing;
    this.disconnectIntents.add(provider);
    this.bumpGeneration(provider);
    this.markDisconnected(provider);
    const promise = this.performDisconnect(provider, endpoint);
    this.disconnectFlights.set(provider, promise);
    void promise.finally(() => {
      if (this.disconnectFlights.get(provider) === promise) this.disconnectFlights.delete(provider);
      this.disconnectIntents.delete(provider);
    }).catch(() => undefined);
    return promise;
  }

  private async performDisconnect(provider: string, endpoint: string): Promise<McpConnectionStatus> {
    let storeError: unknown;
    try {
      tombstoneTokenRecord(this.options.tokenDir, provider, {
        provider,
        endpoint,
        redirectOrigin: this.options.getOrigin(),
      });
    } catch (error) { storeError = error; }
    await this.closeProviderWork(provider);
    if (storeError) throw storeError;
    return this.status(provider);
  }

  async listTools(provider: string): Promise<McpToolListing> {
    const session = this.sessions.get(provider);
    if (session?.state !== "connected" || !session.client) throw new Error("MCP_NOT_CONNECTED");
    const tools: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    do {
      const page = await session.client.listTools(cursor ? { cursor } : {});
      tools.push(...(page.tools as Array<Record<string, unknown>>));
      cursor = page.nextCursor;
    } while (cursor);
    session.toolCount = tools.length;
    const client = session.client as unknown as { getServerVersion?: () => Record<string, unknown> | undefined };
    const transport = session.transport as unknown as { protocolVersion?: string } | undefined;
    return {
      provider,
      fetchedAt: new Date(this.now()).toISOString(),
      tools,
      serverInfo: client.getServerVersion?.() ?? null,
      ...(transport?.protocolVersion ? { protocolVersion: transport.protocolVersion } : {}),
    };
  }

  attachSnapshotDiff(provider: string, diff: { drifted: string[]; missing: string[]; added: string[] }): void {
    const session = this.sessions.get(provider);
    if (!session || session.state !== "connected") throw new Error("MCP_NOT_CONNECTED");
    session.snapshotDiff = diff;
  }

  async callTool(
    provider: string,
    name: string,
    args: Record<string, unknown>,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<Record<string, unknown>> {
    const session = this.sessions.get(provider);
    if (session?.state !== "connected" || !session.client) throw new Error("MCP_NOT_CONNECTED");
    const raw = await (session.client.callTool as unknown as (
      params: { name: string; arguments: Record<string, unknown> },
      schema?: undefined,
      opts?: { signal?: AbortSignal; timeout?: number },
    ) => Promise<Record<string, unknown>>)(
      { name, arguments: args },
      undefined,
      { ...(options.signal ? { signal: options.signal } : {}), timeout: options.timeoutMs ?? 120_000 },
    );
    if ((raw as { isError?: boolean }).isError) throw new Error(`MCP_TOOL_ERROR:${name}`);
    return raw;
  }
}
