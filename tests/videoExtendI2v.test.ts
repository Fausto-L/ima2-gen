import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../config.js";
import { registerVideoExtendedRoutes, type VideoExtendedDependencies } from "../routes/videoExtended.ts";
import { subscribe, type BusEvent } from "../lib/eventBus.ts";
import { abortJob } from "../lib/inflight.ts";

const execFileAsync = promisify(execFile);
let ffmpegAvailable: Promise<boolean> | null = null;

function listen(server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

function close(server): Promise<void> {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

function fakeMp4(): Buffer {
  return Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
}

async function makeParent(dir: string, filename = "root.mp4", metadata: Record<string, unknown> = {}): Promise<void> {
  await writeFile(join(dir, filename), fakeMp4());
  await writeFile(join(dir, `${filename}.json`), JSON.stringify({
    kind: "video", mediaType: "video", provider: "grok", model: "grok-imagine-video",
    userPrompt: "parent user prompt", prompt: "parent prompt", revisedPrompt: "parent revised prompt",
    video: { duration: 5, resolution: "480p", aspectRatio: "auto" }, createdAt: 1, ...metadata,
  }));
}

function result(overrides: Record<string, unknown> = {}): any {
  return {
    videoBuffer: fakeMp4(), contentType: "video/mp4", url: "https://provider.example/child.mp4",
    duration: 5, resolution: "480p", aspectRatio: "auto", mode: "image-to-video", usage: { grok_cost_usd_ticks: 1 },
    revisedPrompt: "planned continuation", xaiVideoRequestId: "xai-child", webSearchCalls: 1,
    requestedModel: "grok-imagine-video", effectiveModel: "grok-imagine-video", modelFallback: null, ...overrides,
  };
}

function successfulGenerator(capture?: (prompt: string, options: any) => void) {
  return async (prompt: string, _ctx: any, options: any) => {
    capture?.(prompt, options);
    options.onEvent?.({ phase: "planning" });
    options.onEvent?.({ phase: "submitted", xaiVideoRequestId: "xai-child", requestedModel: "grok-imagine-video", effectiveModel: "grok-imagine-video", modelFallback: null });
    options.onEvent?.({ phase: "progress", progress: 50 });
    return result();
  };
}

async function makeApp(dir: string, dependencies: VideoExtendedDependencies = {}, proxyPort = 18645) {
  const app = express();
  app.use(express.json());
  registerVideoExtendedRoutes(app, {
    rootDir: process.cwd(), packageVersion: "test",
    config: {
      ...config, ids: { ...config.ids, generatedHexBytes: 2 }, storage: { ...config.storage, generatedDir: dir },
      grokProvider: { ...config.grokProvider, proxyHost: "127.0.0.1", proxyPort, videoPollIntervalMs: 1, videoStartTimeoutMs: 5000, videoTimeoutMs: 30000, videoDownloadTimeoutMs: 5000, plannerTimeoutMs: 5000 },
    },
  }, dependencies);
  const server = createServer(app);
  return { server, url: await listen(server) };
}

function watchTerminal(requestId: string) {
  const events: BusEvent[] = [];
  let stop = () => {};
  const terminal = new Promise<BusEvent>((resolve) => {
    stop = subscribe((event) => {
      if (event.jobId !== requestId) return;
      events.push(event);
      if (event.event === "done" || event.event === "error") resolve(event);
    });
  });
  return { events, terminal, stop: () => stop() };
}

async function postExtend(url: string, body: Record<string, unknown>) {
  return fetch(`${url}/api/video/extend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("extend returns 202, injects the extracted frame, and emits the ordered terminal contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ima2-extend-contract-"));
  const requestId = "i2v-contract";
  let sourceImage = "";
  await makeParent(dir);
  const watcher = watchTerminal(requestId);
  const { server, url } = await makeApp(dir, {
    extractFrame: async () => "png-base64",
    generateVideo: successfulGenerator((_prompt, options) => { sourceImage = options.sourceImage; }),
    createFilename: () => "child.mp4",
  });
  try {
    const response = await postExtend(url, { sourceVideoId: "root.mp4", requestId, prompt: "continue" });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true, requestId, sourceVideoId: "root.mp4", workflow: "last-frame-i2v" });
    const terminal = await watcher.terminal;
    assert.equal(terminal.event, "done");
    assert.equal(sourceImage, "png-base64");
    const order = watcher.events.map((event) => event.event === "phase" ? `phase:${event.data.phase}` : event.event);
    assert.deepEqual(order, ["phase:queued", "phase:extracting-frame", "planning", "submitted", "progress", "phase:persisting", "done"]);
    const sidecar = JSON.parse(await readFile(join(dir, "child.mp4.json"), "utf8"));
    assert.deepEqual(sidecar.videoLineage, { id: "child.mp4", parentId: "root.mp4", rootId: "root.mp4", seriesId: "root.mp4", sequenceIndex: 1 });
  } finally {
    watcher.stop();
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("duplicate active requestId returns 409 and starts the provider once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ima2-extend-duplicate-"));
  await makeParent(dir);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let providerCalls = 0;
  const requestId = "i2v-duplicate";
  const generate = successfulGenerator();
  const { server, url } = await makeApp(dir, {
    extractFrame: async () => { await gate; return "png"; },
    generateVideo: async (prompt, ctx, options) => { providerCalls += 1; return generate(prompt, ctx, options); },
  });
  try {
    assert.equal((await postExtend(url, { sourceVideoId: "root.mp4", requestId, prompt: "continue" })).status, 202);
    const duplicate = await postExtend(url, { sourceVideoId: "root.mp4", requestId, prompt: "continue" });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, "REQUEST_ID_IN_USE");
    const done = new Promise<void>((resolve) => {
      const stop = subscribe((event) => { if (event.jobId === requestId && event.event === "done") { stop(); resolve(); } });
    });
    release();
    await done;
    assert.equal(providerCalls, 1);
  } finally {
    release();
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("extraction failures are typed and never call the provider", async (t) => {
  const cases = [
    { name: "decode", error: new Error("decode failed"), code: "VIDEO_FRAME_EXTRACT_FAILED", retryable: undefined },
    { name: "unavailable", error: Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" }), code: "VIDEO_FRAME_EXTRACT_UNAVAILABLE", retryable: undefined },
    { name: "timeout", error: Object.assign(new Error("timed out"), { killed: true, signal: "SIGKILL" }), code: "VIDEO_FRAME_EXTRACT_TIMEOUT", retryable: true },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const dir = await mkdtemp(join(tmpdir(), `ima2-extend-${item.name}-`));
    await makeParent(dir);
    const requestId = `i2v-${item.name}`;
    let providerCalls = 0;
    const watcher = watchTerminal(requestId);
    const { server, url } = await makeApp(dir, {
      extractFrame: async () => { throw item.error; },
      generateVideo: async () => { providerCalls += 1; return result(); },
    });
    try {
      assert.equal((await postExtend(url, { sourceVideoId: "root.mp4", requestId, prompt: "continue" })).status, 202);
      const terminal = await watcher.terminal;
      assert.equal(terminal.data.code, item.code);
      assert.equal(terminal.data.retryable, item.retryable);
      assert.equal(providerCalls, 0);
    } finally {
      watcher.stop();
      await close(server);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test("child-of-child and siblings preserve durable branches and inherit prompt and motion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ima2-extend-lineage-"));
  await makeParent(dir, "root.mp4", { motionPresetIds: ["motion-handheld"] });
  const filenames = ["child.mp4", "grandchild.mp4", "sibling.mp4"];
  const prompts: string[] = [];
  const { server, url } = await makeApp(dir, {
    extractFrame: async () => "png",
    generateVideo: successfulGenerator((prompt) => prompts.push(prompt)),
    createFilename: () => filenames.shift()!,
  });
  async function extend(sourceVideoId: string, requestId: string) {
    const watcher = watchTerminal(requestId);
    const response = await postExtend(url, { sourceVideoId, requestId });
    assert.equal(response.status, 202);
    const terminal = await watcher.terminal;
    watcher.stop();
    return terminal.data;
  }
  try {
    const child = await extend("root.mp4", "i2v-child");
    const grandchild = await extend("child.mp4", "i2v-grandchild");
    const sibling = await extend("root.mp4", "i2v-sibling");
    const childLineage = child.videoLineage as Record<string, unknown>;
    const grandchildLineage = grandchild.videoLineage as Record<string, unknown>;
    const siblingLineage = sibling.videoLineage as Record<string, unknown>;
    assert.deepEqual(grandchildLineage, { id: "grandchild.mp4", parentId: "child.mp4", rootId: "root.mp4", seriesId: "root.mp4", sequenceIndex: 2 });
    assert.notEqual(childLineage.id, siblingLineage.id);
    assert.deepEqual({ ...siblingLineage, id: childLineage.id }, childLineage);
    assert.equal(child.prompt, "parent user prompt");
    assert.match(prompts[0], /Camera motion: natural handheld/);
  } finally {
    await close(server);
    await rm(dir, { recursive: true, force: true });
  }
});

test("sidecar failure rolls back the MP4 and cancel suppresses done", async (t) => {
  await t.test("rollback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ima2-extend-rollback-"));
    await makeParent(dir);
    await mkdir(join(dir, "broken.mp4.json"));
    const requestId = "i2v-rollback";
    const watcher = watchTerminal(requestId);
    const { server, url } = await makeApp(dir, { extractFrame: async () => "png", generateVideo: successfulGenerator(), createFilename: () => "broken.mp4" });
    try {
      assert.equal((await postExtend(url, { sourceVideoId: "root.mp4", requestId, prompt: "continue" })).status, 202);
      assert.equal((await watcher.terminal).data.code, "VIDEO_PERSIST_FAILED");
      assert.equal(watcher.events.filter((event) => event.event === "done").length, 0);
      await assert.rejects(access(join(dir, "broken.mp4")), (error: any) => error?.code === "ENOENT");
    } finally { watcher.stop(); await close(server); await rm(dir, { recursive: true, force: true }); }
  });
  await t.test("cancel", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ima2-extend-cancel-"));
    await makeParent(dir);
    const requestId = "i2v-cancel";
    const watcher = watchTerminal(requestId);
    const { server, url } = await makeApp(dir, {
      extractFrame: async (_dir, _file, _position, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true })),
      generateVideo: successfulGenerator(),
    });
    try {
      assert.equal((await postExtend(url, { sourceVideoId: "root.mp4", requestId, prompt: "continue" })).status, 202);
      abortJob(requestId);
      assert.equal((await watcher.terminal).data.code, "GENERATION_CANCELED");
      assert.equal(watcher.events.filter((event) => event.event === "done").length, 0);
    } finally { watcher.stop(); await close(server); await rm(dir, { recursive: true, force: true }); }
  });
});

test("remote sourceVideoId fails before extraction", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ima2-extend-remote-"));
  let extracts = 0;
  const { server, url } = await makeApp(dir, { extractFrame: async () => { extracts += 1; return "png"; } });
  try {
    const response = await postExtend(url, { sourceVideoId: "https://example.com/root.mp4", requestId: "i2v-remote", prompt: "continue" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "VIDEO_SOURCE_LOCAL_ONLY");
    assert.equal(extracts, 0);
  } finally { await close(server); await rm(dir, { recursive: true, force: true }); }
});

function hasFfmpeg(): Promise<boolean> {
  ffmpegAvailable ??= execFileAsync("ffmpeg", ["-version"], { timeout: 5000 }).then(() => true, () => false);
  return ffmpegAvailable;
}

test("real last-frame path sends PNG image.url to generations and never calls extensions", async (t) => {
  if (!(await hasFfmpeg())) return t.skip("ffmpeg is not installed");
  const dir = await mkdtemp(join(tmpdir(), "ima2-extend-real-"));
  await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1", "-pix_fmt", "yuv420p", join(dir, "root.mp4")]);
  await writeFile(join(dir, "root.mp4.json"), JSON.stringify({ userPrompt: "continue", provider: "grok", model: "grok-imagine-video", video: { duration: 1, resolution: "480p", aspectRatio: "auto" } }));
  const paths: string[] = [];
  let generationBody: any = null;
  const proxy = createServer((req, res) => {
    const path = req.url || "";
    paths.push(path);
    const json = (body: unknown) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (path.includes("/v1/responses")) return json({ output: [{ type: "message", content: [{ type: "text", text: "brief" }] }] });
    if (path.includes("/v1/chat/completions")) return json({ choices: [{ message: { tool_calls: [{ type: "function", function: { name: "generate_video", arguments: JSON.stringify({ prompt: "planned" }) } }] } }] });
    if (path.includes("/v1/videos/generations")) {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      return req.on("end", () => { generationBody = JSON.parse(raw); json({ request_id: "real-child" }); });
    }
    if (path.includes("/v1/videos/real-child")) return json({ status: "done", video: { url: `http://127.0.0.1:${(proxy.address() as any).port}/download.mp4`, duration: 1, respect_moderation: true } });
    if (path.includes("/download.mp4")) { res.writeHead(200, { "Content-Type": "video/mp4" }); return res.end(fakeMp4()); }
    res.writeHead(404); res.end();
  });
  const proxyUrl = await listen(proxy);
  const requestId = "i2v-real";
  const watcher = watchTerminal(requestId);
  const { server, url } = await makeApp(dir, {}, Number(new URL(proxyUrl).port));
  try {
    assert.equal((await postExtend(url, { sourceVideoId: "root.mp4", requestId })).status, 202);
    assert.equal((await watcher.terminal).event, "done");
    assert.match(generationBody?.image?.url ?? "", /^data:image\/png;base64,/);
    assert.equal(paths.some((path) => path.includes("/v1/videos/extensions")), false);
  } finally {
    watcher.stop();
    await close(server);
    await close(proxy);
    await rm(dir, { recursive: true, force: true });
  }
});
