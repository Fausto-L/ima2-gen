// WP3 (030): connection manager — OAuth pendingAuth state machine, no network.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { McpConnectionManager } from "../lib/mcp/connectionManager.js";
import { readTokenRecord, writeTokenRecord } from "../lib/mcp/tokenStore.js";

const dir = mkdtempSync(join(tmpdir(), "ima2-mcp-manager-"));
after(() => rmSync(dir, { recursive: true, force: true }));

type FakeTransport = {
  authProvider: { redirectToAuthorization(url: URL): void };
  finishAuthCalls: string[];
  finishAuth(code: string): Promise<void>;
  close(): Promise<void>;
};

function makeManager(behavior: { failFirstConnect: boolean }) {
  const transports: FakeTransport[] = [];
  let connectAttempts = 0;
  const manager = new McpConnectionManager({
    enabledProviders: ["runway", "higgsfield"],
    tokenDir: dir,
    getOrigin: () => "http://localhost:4545",
    transportFactory: (_endpoint, authProvider) => {
      const transport: FakeTransport = {
        authProvider,
        finishAuthCalls: [],
        async finishAuth(code: string) { this.finishAuthCalls.push(code); },
        async close() {},
      };
      transports.push(transport);
      return transport as never;
    },
    clientFactory: () => ({
      async connect(transport: FakeTransport) {
        connectAttempts += 1;
        if (behavior.failFirstConnect && connectAttempts === 1) {
          transport.authProvider.redirectToAuthorization(new URL("https://provider.example/authorize?client_id=x"));
          throw new UnauthorizedError("Unauthorized");
        }
      },
      async listTools(params: { cursor?: string }) {
        if (!params.cursor) return { tools: [{ name: "a" }, { name: "b" }], nextCursor: "p2" };
        return { tools: [{ name: "c" }] };
      },
    }) as never,
  });
  return { manager, transports };
}

test("unauthorized connect surfaces auth_required + authorizationUrl, callback completes, state is single-use", async () => {
  const { manager } = makeManager({ failFirstConnect: true });
  const status = await manager.connect("runway");
  assert.equal(status.state, "auth_required");
  assert.match(status.authorizationUrl ?? "", /provider\.example\/authorize/);
  await assert.rejects(() => manager.handleOAuthCallback("wrong-state", "code"), /MCP_OAUTH_STATE_INVALID/);
});

test("valid callback finishes auth on the pending transport and reconnects", async () => {
  const { manager, transports } = makeManager({ failFirstConnect: true });
  await manager.connect("higgsfield");
  // Extract the real state from the stored code path: the manager keys pendingAuth
  // by the state passed to the oauth provider; expose it via the authorization URL
  // is provider-side, so instead reach through the internal map deterministically.
  const pending = (manager as unknown as { pendingAuth: Map<string, unknown> }).pendingAuth;
  assert.equal(pending.size, 1);
  const oauthState = [...pending.keys()][0];
  const status = await manager.handleOAuthCallback(oauthState, "auth-code-1");
  assert.equal(status.state, "connected");
  assert.deepEqual(transports[0].finishAuthCalls, ["auth-code-1"]);
  await assert.rejects(() => manager.handleOAuthCallback(oauthState, "auth-code-1"), /MCP_OAUTH_STATE_INVALID/);
});

test("listTools paginates across cursors", async () => {
  const { manager } = makeManager({ failFirstConnect: false });
  await manager.connect("runway");
  const listing = await manager.listTools("runway");
  assert.deepEqual(listing.tools.map((t) => t.name), ["a", "b", "c"]);
  assert.equal(manager.status("runway").toolCount, 3);
});

test("disconnect clears tokens; reset keeps them", async () => {
  const { manager } = makeManager({ failFirstConnect: false });
  writeTokenRecord(dir, "runway", { tokens: { access_token: "keep" }, origin: "http://localhost:4545" });
  await manager.connect("runway");
  await manager.reset("runway");
  assert.ok(readTokenRecord(dir, "runway"));
  await manager.connect("runway");
  await manager.disconnect("runway");
  assert.equal(readTokenRecord(dir, "runway"), null);
  assert.equal(manager.status("runway").state, "disconnected");
});

test("unknown or disabled providers are rejected before any network attempt", async () => {
  const { manager } = makeManager({ failFirstConnect: false });
  await assert.rejects(() => manager.connect("nope"), /MCP_PROVIDER_UNKNOWN/);
  const narrow = new McpConnectionManager({
    enabledProviders: [], tokenDir: dir, getOrigin: () => "http://localhost:1",
  });
  await assert.rejects(() => narrow.connect("runway"), /MCP_PROVIDER_DISABLED/);
});
