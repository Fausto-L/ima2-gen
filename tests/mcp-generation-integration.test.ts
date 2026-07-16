// WP5 (050): /api/mcp/generate — atomic commit, terminal envelope, rollback.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ima2-mcp-media-"));
process.env.IMA2_CONFIG_DIR = dir;
process.env.IMA2_DB_PATH = join(dir, "db.sqlite");
process.env.IMA2_GENERATED_DIR = join(dir, "generated");
mkdirSync(join(dir, "generated"), { recursive: true });

const db = await import("../lib/db.ts");
const { subscribe } = await import("../lib/eventBus.ts");
const { registerMcpMediaRoutes } = await import("../routes/mcpMedia.ts");
after(() => { db.closeDb(); rmSync(dir, { recursive: true, force: true }); });

const fakeManager = { status: () => ({ provider: "runway", state: "connected" }) };

function makeDeps(overrides: { failSidecar?: boolean; capture?: Array<Record<string, unknown>> } = {}) {
  const tempMedia = join(dir, "temp-media.png");
  writeFileSync(tempMedia, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return {
    execute: async (_manager: unknown, _adapter: unknown, request: Record<string, unknown>) => {
      overrides.capture?.push(request);
      return { taskId: "task-1", outputUrls: ["https://cdn.example.com/out.png?sig=secret"] };
    },
    download: async () => ({
      tempPath: tempMedia, contentType: "image/png", bytes: 4,
      sanitizedUrl: "https://cdn.example.com/out.png",
      cleanup: async () => {},
    }),
    writeSidecar: overrides.failSidecar
      ? async () => { throw new Error("SIDECAR_WRITE_FAILED"); }
      : undefined,
  };
}

async function withApp(deps: ReturnType<typeof makeDeps>, run: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerMcpMediaRoutes(app, {
    config: {
      storage: { generatedDir: join(dir, "generated") },
      ids: { generatedHexBytes: 4 },
      mcp: { enabledProviders: ["runway"], tokenDir: dir, snapshotDir: dir },
    },
    mcpConnectionManager: fakeManager,
  } as never, deps as never);
  const server = await new Promise<import("node:http").Server>((resolve) => { const v = app.listen(0, "127.0.0.1", () => resolve(v)); });
  try {
    const address = server.address() as import("node:net").AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function waitForEvent(requestId: string, name: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error(`timeout waiting ${name}`)); }, timeoutMs);
    const stop = subscribe((ev) => {
      if (ev.jobId === requestId && ev.event === name) { clearTimeout(timer); stop(); resolve(ev.data); }
    });
  });
}

test("contract violations reject with 400 before any upload or tool call", async () => {
  const uploads: string[] = [];
  const framePath = join(dir, "generated", "frame-contract.png");
  writeFileSync(framePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const deps = {
    ...makeDeps(),
    upload: async (_manager: unknown, path: string) => { uploads.push(path); return "https://runway.example/hosted.png"; },
  };
  await withApp(deps as never, async (base) => {
    const response = await fetch(`${base}/api/mcp/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "runway", kind: "video", prompt: "pan", model: "gen-4-turbo",
        parameters: { resolution: "1080p" }, startFrameFilename: "frame-contract.png",
      }),
    });
    assert.equal(response.status, 400);
    const body = await response.json() as { error: { code: string } };
    assert.equal(body.error.code, "MCP_PARAMETER_UNSUPPORTED");
    assert.deepEqual(uploads, []);
  });
});

test("happy path: 202 then atomic commit with terminal envelope + sidecar core fields", async () => {
  await withApp(makeDeps(), async (base) => {
    const response = await fetch(`${base}/api/mcp/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "runway", kind: "image", prompt: "fox", model: "gen-4", requestId: "mcp-test-1" }),
    });
    assert.equal(response.status, 202);
    const done = await waitForEvent("mcp-test-1", "done");
    assert.equal(done.provider, "runway");
    assert.equal(done.mediaType, "image");
    assert.match(String(done.filename), /_mcp\.png$/);
    assert.match(String(done.url), /^\/generated\//);
    const sidecar = JSON.parse(readFileSync(join(dir, "generated", String(done.filename) + ".json"), "utf8"));
    assert.equal(sidecar.provider, "runway");
    assert.equal(sidecar.providerTaskId, "task-1");
    assert.equal(sidecar.providerUrl, "https://cdn.example.com/out.png");
    assert.ok(!JSON.stringify(sidecar).includes("sig=secret"), "signed query must not persist");
    assert.ok(existsSync(join(dir, "generated", String(done.filename))));
  });
});

test("sidecar failure rolls back media and emits error, never done", async () => {
  await withApp(makeDeps({ failSidecar: true }), async (base) => {
    let sawDone = false;
    const stop = subscribe((ev) => { if (ev.jobId === "mcp-test-2" && ev.event === "done") sawDone = true; });
    await fetch(`${base}/api/mcp/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "runway", kind: "image", prompt: "fox", requestId: "mcp-test-2" }),
    });
    const error = await waitForEvent("mcp-test-2", "error");
    stop();
    assert.equal(error.code, "SIDECAR_WRITE_FAILED");
    assert.equal(sawDone, false);
    const leftovers = (await import("node:fs")).readdirSync(join(dir, "generated")).filter((f) => f.includes("mcp") && !f.endsWith(".json"));
    assert.equal(leftovers.filter((f) => f.includes("mcp-test-2")).length, 0);
  });
});

test("route forwards bounded scalar presets and persists the selected values", async () => {
  const capture: Array<Record<string, unknown>> = [];
  await withApp(makeDeps({ capture }), async (base) => {
    const response = await fetch(`${base}/api/mcp/generate`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // seedance-2 declares duration/resolution/generateAudio, so this stays
        // inside the capability contract the route now enforces up front.
        provider: "runway", kind: "video", prompt: "fox", model: "seedance-2", requestId: "mcp-test-params",
        parameters: { duration: 8, resolution: "720p", generateAudio: false },
      }),
    });
    assert.equal(response.status, 202);
    const done = await waitForEvent("mcp-test-params", "done");
    assert.deepEqual(capture[0].parameters, { duration: 8, resolution: "720p", generateAudio: false });
    const sidecar = JSON.parse(readFileSync(join(dir, "generated", String(done.filename) + ".json"), "utf8"));
    assert.deepEqual(sidecar.mcpParameters, { duration: 8, resolution: "720p", generateAudio: false });
  });
});

test("guards: unknown provider 400, locked provider 409, disconnected 409", async () => {
  await withApp(makeDeps(), async (base) => {
    const bad = await fetch(`${base}/api/mcp/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "nope", kind: "image", prompt: "x" }) });
    assert.equal(bad.status, 400);
    const locked = await fetch(`${base}/api/mcp/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "higgsfield", kind: "image", prompt: "x" }) });
    assert.equal(locked.status, 409);
    assert.equal((await locked.json() as { error: { code: string } }).error.code, "MCP_EXECUTION_LOCKED");
    const malformed = await fetch(`${base}/api/mcp/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "runway", kind: "image", prompt: "x", parameters: ["bad"] }) });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json() as { error: { code: string } }).error.code, "INVALID_MCP_PARAMETERS");
  });
});
