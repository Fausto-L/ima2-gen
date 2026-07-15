// WP6 (060): media-action route — containment, dispatch, lineage sidecar.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ima2-mcp-action-"));
process.env.IMA2_CONFIG_DIR = dir;
process.env.IMA2_DB_PATH = join(dir, "db.sqlite");
process.env.IMA2_GENERATED_DIR = join(dir, "generated");
mkdirSync(join(dir, "generated"), { recursive: true });
mkdirSync(join(dir, "snapshots"), { recursive: true });

const db = await import("../lib/db.ts");
const { subscribe } = await import("../lib/eventBus.ts");
const { registerMcpMediaRoutes } = await import("../routes/mcpMedia.ts");
after(() => { db.closeDb(); rmSync(dir, { recursive: true, force: true }); });

// Local snapshot so the router sees live runway tools.
writeFileSync(join(dir, "snapshots", "runway.json"), JSON.stringify({
  provenance: { provider: "runway", endpoint: "https://mcp.runwayml.com/mcp", fetchedAt: "t", entitlementTag: "u", originalHash: "sha256:0", sanitizedHash: "sha256:0" },
  tools: [{ name: "upscale_image" }, { name: "upscale_video" }, { name: "edit_video" }],
}));

// Seed gallery files.
writeFileSync(join(dir, "generated", "src-image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
writeFileSync(join(dir, "generated", "clip-a.mp4"), Buffer.from("a"));
writeFileSync(join(dir, "generated", "clip-b.mp4"), Buffer.from("b"));

const fakeManager = { status: () => ({ provider: "runway", state: "connected", snapshotDiff: { drifted: [], missing: [], added: [] } }) };

const tempOut = join(dir, "action-result.bin");
const deps = {
  upload: async () => "https://runway.example/datasets/abc.png",
  executePlan: async (_m: unknown, _a: unknown, plan: { toolName: string }) => {
    assert.equal(plan.toolName, "upscale_image");
    return { taskId: "task-act-1", outputUrls: ["https://cdn.example.com/up.png"] };
  },
  download: async () => {
    writeFileSync(tempOut, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    return { tempPath: tempOut, contentType: "image/png", bytes: 4, sanitizedUrl: "https://cdn.example.com/up.png", cleanup: async () => {} };
  },
  concat: async (_inputs: string[], outputPath: string) => { copyFileSync(join(dir, "generated", "clip-a.mp4"), outputPath); },
};

async function withApp(run: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerMcpMediaRoutes(app, {
    config: {
      storage: { generatedDir: join(dir, "generated"), packageRoot: dir },
      ids: { generatedHexBytes: 4 },
      mcp: { enabledProviders: ["runway"], tokenDir: dir, snapshotDir: join(dir, "snapshots") },
    },
    mcpConnectionManager: fakeManager,
  } as never, deps as never);
  const server = await new Promise<import("node:http").Server>((resolve) => { const v = app.listen(0, "127.0.0.1", () => resolve(v)); });
  try {
    const address = server.address() as import("node:net").AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

function waitForEvent(requestId: string, name: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error(`timeout waiting ${name}`)); }, timeoutMs);
    const stop = subscribe((ev) => { if (ev.jobId === requestId && ev.event === name) { clearTimeout(timer); stop(); resolve(ev.data); } });
  });
}

test("path traversal in files[] is rejected before any work", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/mcp/media-action`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "upscale-image", files: ["../../etc/passwd"] }),
  });
  assert.equal(response.status, 400);
}));

test("native upscale-image dispatches plan, records parent lineage in sidecar", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/mcp/media-action`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "upscale-image", files: ["src-image.png"], requestId: "act-1" }),
  });
  assert.equal(response.status, 202);
  const body = await response.json() as { mode: string; plan: string };
  assert.equal(body.mode, "native");
  assert.equal(body.plan, "upscale_image");
  const done = await waitForEvent("act-1", "done");
  const sidecar = JSON.parse(readFileSync(join(dir, "generated", String(done.filename) + ".json"), "utf8"));
  assert.deepEqual(sidecar.parent, { filename: "src-image.png", mediaType: "image", role: "source" });
  assert.equal(sidecar.workflow, "image.upscale");
}));

test("stitch falls back to local concat with fallback metadata (native call 0)", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/mcp/media-action`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "stitch", files: ["clip-a.mp4", "clip-b.mp4"], requestId: "act-2" }),
  });
  assert.equal((await response.json() as { mode: string }).mode, "fallback");
  const done = await waitForEvent("act-2", "done");
  const sidecar = JSON.parse(readFileSync(join(dir, "generated", String(done.filename) + ".json"), "utf8"));
  assert.equal(sidecar.fallback, true);
  assert.equal(sidecar.provider, "local-ffmpeg");
  assert.deepEqual(sidecar.inputs, ["clip-a.mp4", "clip-b.mp4"]);
}));

test("reframe is unavailable (higgsfield locked) with typed 409", async () => withApp(async (base) => {
  const response = await fetch(`${base}/api/mcp/media-action`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "reframe", files: ["clip-a.mp4"] }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "MEDIA_ACTION_UNAVAILABLE");
}));
