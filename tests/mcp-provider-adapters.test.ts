// WP5 (050): adapter mappings verified against the sanitized fixture schemas.
import test from "node:test";
import assert from "node:assert/strict";
import { runwayAdapter } from "../lib/mcp/adapters/runway.js";
import { higgsfieldAdapter, HIGGSFIELD_BILLING_DENYLIST } from "../lib/mcp/adapters/higgsfield.js";

test("runway image request maps to generate_image with rationale and count=1", () => {
  const plan = runwayAdapter.buildGenerateCall({ kind: "image", prompt: "a red fox", model: "gen-4", ratio: "16:9" });
  assert.equal(plan.toolName, "generate_image");
  assert.equal(plan.args.promptText, "a red fox");
  assert.equal(plan.args.model, "gen-4");
  assert.equal(plan.args.count, 1);
  assert.ok(typeof plan.args.rationale === "string" && (plan.args.rationale as string).length > 0);
});

test("runway video request maps startFrame for image-to-video", () => {
  const plan = runwayAdapter.buildGenerateCall({ kind: "video", prompt: "camera pans", startFrameUrl: "https://x.example/a.png" });
  assert.equal(plan.toolName, "generate_video");
  assert.deepEqual(plan.args.startFrame, { url: "https://x.example/a.png" });
});

test("runway forwards only model-declared video presets", () => {
  const plan = runwayAdapter.buildGenerateCall({
    kind: "video", prompt: "camera pans", model: "seedance-2", ratio: "9:16",
    parameters: { duration: 12, resolution: "1080p", generateAudio: false },
  });
  assert.equal(plan.args.duration, 12);
  assert.equal(plan.args.resolution, "1080p");
  assert.equal(plan.args.generateAudio, false);
});

test("runway rejects unsupported ratios, keys, and ranges before a tool plan", () => {
  assert.throws(() => runwayAdapter.buildGenerateCall({ kind: "image", prompt: "x", model: "gpt-image-2", ratio: "7:5" }), /MCP_PARAMETER_INVALID/);
  assert.throws(() => runwayAdapter.buildGenerateCall({ kind: "video", prompt: "x", model: "gen-4-turbo", parameters: { resolution: "1080p" } }), /MCP_PARAMETER_UNSUPPORTED/);
  assert.throws(() => runwayAdapter.buildGenerateCall({ kind: "video", prompt: "x", model: "seedance-2", parameters: { duration: 99 } }), /MCP_PARAMETER_INVALID/);
});

test("runway normalizes dependent combos to the nearest supported contract", () => {
  // Veo 3.1 at 1080p only supports 8s output: coerce instead of self-reject.
  const veo = runwayAdapter.buildGenerateCall({ kind: "video", prompt: "x", model: "veo-3.1", parameters: { resolution: "1080p", duration: 6 } });
  assert.equal(veo.args.duration, 8);
  assert.equal(veo.args.resolution, "1080p");
  // Gen-4.5 image-to-video does not accept generateAudio: drop the default
  // instead of rejecting the stock UI state (sol review F3).
  const gen45 = runwayAdapter.buildGenerateCall({
    kind: "video", prompt: "x", model: "gen-4.5",
    parameters: { duration: 10, generateAudio: true },
    startFrameUrl: "https://example.com/frame.png",
  });
  assert.equal("generateAudio" in gen45.args, false);
  assert.deepEqual(gen45.args.startFrame, { url: "https://example.com/frame.png" });
});

test("runway omits Auto presets instead of inventing provider arguments", () => {
  const plan = runwayAdapter.buildGenerateCall({ kind: "video", prompt: "x", model: "veo-3.1", parameters: {} });
  assert.equal("duration" in plan.args, false);
  assert.equal("resolution" in plan.args, false);
  assert.equal("generateAudio" in plan.args, false);
});

test("reference images ride the image_references input role only", () => {
  // seedance-2 declares image_references: URLs forward as {url} objects.
  const seedance = runwayAdapter.buildGenerateCall({
    kind: "video", prompt: "x", model: "seedance-2",
    referenceImageUrls: ["https://cdn.example.com/a.png", "http://insecure.example.com/b.png"],
  });
  assert.deepEqual(seedance.args.referenceImages, [{ url: "https://cdn.example.com/a.png" }]);
  // gen-4-turbo declares only start_image: references reject before any call.
  assert.throws(() => runwayAdapter.buildGenerateCall({
    kind: "video", prompt: "x", model: "gen-4-turbo",
    referenceImageUrls: ["https://cdn.example.com/a.png"],
  }), /MCP_PARAMETER_UNSUPPORTED:gen-4-turbo:referenceImages/);
  // image models with image_references accept them too.
  const image = runwayAdapter.buildGenerateCall({
    kind: "image", prompt: "x", model: "gen-4",
    referenceImageUrls: ["https://cdn.example.com/a.png"],
  });
  assert.deepEqual(image.args.referenceImages, [{ url: "https://cdn.example.com/a.png" }]);
});

test("unsupported model ids are rejected before any call", () => {
  assert.throws(() => runwayAdapter.buildGenerateCall({ kind: "image", prompt: "x", model: "dall-e-9" }), /MCP_MODEL_UNSUPPORTED/);
  assert.throws(() => runwayAdapter.buildGenerateCall({ kind: "video", prompt: "x", model: "sora-99" }), /MCP_MODEL_UNSUPPORTED/);
});

test("task id parses from structuredContent or text", () => {
  assert.equal(runwayAdapter.parseTaskId({ structuredContent: { taskId: "abc-1" } }), "abc-1");
  assert.equal(
    runwayAdapter.parseTaskId({ content: [{ type: "text", text: "Task created: 123e4567-e89b-12d3-a456-426614174000. Poll get_task." }] }),
    "123e4567-e89b-12d3-a456-426614174000",
  );
  assert.equal(runwayAdapter.parseTaskId({ content: [{ type: "text", text: "no id here" }] }), null);
});

test("poll parsing distinguishes succeeded/failed/running and extracts media urls", () => {
  const done = runwayAdapter.parsePoll({ content: [{ type: "text", text: "status: SUCCEEDED output: https://dnznrvs05pmza.cloudfront.net/abc.mp4?_jwt=secret" }] });
  assert.equal(done.status, "succeeded");
  assert.match(done.outputUrls[0], /cloudfront/);
  const failed = runwayAdapter.parsePoll({ content: [{ type: "text", text: "status: FAILED reason: safety" }] });
  assert.equal(failed.status, "failed");
  assert.match(failed.detail ?? "", /safety/);
  assert.equal(runwayAdapter.parsePoll({ content: [{ type: "text", text: "RUNNING 42%" }] }).status, "running");
});

test("higgsfield adapter is catalog-only: execution locked, billing tools denylisted", () => {
  assert.equal(higgsfieldAdapter.executable, false);
  assert.throws(() => higgsfieldAdapter.buildGenerateCall({ kind: "image", prompt: "x" }), /MCP_EXECUTION_LOCKED/);
  assert.deepEqual([...HIGGSFIELD_BILLING_DENYLIST], ["confirm_billing_purchase", "cancel_trial_auto_renewal", "confirm_trial_cancel"]);
  assert.deepEqual(higgsfieldAdapter.models, { image: [], video: [] });
});
