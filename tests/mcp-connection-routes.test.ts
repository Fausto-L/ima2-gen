// WP3 (030): connection routes — secret-free envelopes over a fake manager.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerMcpConnectionRoutes } from "../routes/mcpConnections.js";

const dir = mkdtempSync(join(tmpdir(), "ima2-mcp-routes-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const fakeManager = {
  status: (id: string) => ({ provider: id, state: "disconnected" }),
  connect: async (id: string) => ({ provider: id, state: "auth_required", authorizationUrl: "https://provider.example/authorize" }),
  handleOAuthCallback: async (state: string) => {
    if (state !== "good-state") throw new Error("MCP_OAUTH_STATE_INVALID");
    return { provider: "runway", state: "connected" };
  },
  reset: async () => undefined,
  disconnect: async (id: string) => ({ provider: id, state: "disconnected" }),
};

async function withApp(run: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  const ctx = {
    config: { mcp: { enabledProviders: ["runway", "higgsfield"], tokenDir: dir } },
    serverActualPort: 4546,
    mcpConnectionManager: fakeManager,
  };
  registerMcpConnectionRoutes(app, ctx as never);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  try {
    const address = server.address() as import("node:net").AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("providers listing includes registry entries with per-provider status", async () => withApp(async (base) => {
  const body = await (await fetch(`${base}/api/mcp/providers`)).json() as { ok: boolean; providers: Array<{ id: string; status: { state: string } }> };
  assert.equal(body.ok, true);
  assert.deepEqual(body.providers.map((p) => p.id).sort(), ["higgsfield", "runway"]);
  assert.equal(body.providers[0].status.state, "disconnected");
}));

test("connect returns 202 with authorizationUrl when auth is required", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/mcp/providers/runway/connect`, { method: "POST" });
  assert.equal(response.status, 202);
  const body = await response.json() as { status: { authorizationUrl: string } };
  assert.match(body.status.authorizationUrl, /provider\.example/);
}));

test("callback validates params and state before any exchange", async () => withApp(async (base) => {
  assert.equal((await fetch(`${base}/api/mcp/oauth/callback`)).status, 400);
  assert.equal((await fetch(`${base}/api/mcp/oauth/callback?state=bad&code=x`)).status, 400);
  const ok = await fetch(`${base}/api/mcp/oauth/callback?state=good-state&code=x`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /연결 완료/);
}));

test("disconnect responds with the non-revocation note and no secrets anywhere", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/mcp/providers/runway/connection`, { method: "DELETE" });
  const text = await response.text();
  assert.match(text, /provider-side grant is not revoked/);
  for (const path of ["/api/mcp/providers", "/api/mcp/providers/runway/status"]) {
    const body = await (await fetch(base + path)).text();
    assert.ok(!/access_token|refresh_token|code_verifier/i.test(body), `${path} leaked a secret field`);
  }
}));
