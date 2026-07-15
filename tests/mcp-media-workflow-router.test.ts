// WP6 (060): router decision-table truth table — tool-level callable.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveMediaAction } from "../lib/mcp/mediaWorkflowRouter.js";

const liveRunway = [
  { name: "upscale_video", schemaMatch: true },
  { name: "upscale_image", schemaMatch: true },
  { name: "edit_video", schemaMatch: true },
];

test("extend and stitch always fall back (011: no native tool on either provider)", () => {
  for (const operation of ["video.extend", "video.stitch"] as const) {
    const decision = resolveMediaAction({ operation, provider: "runway", liveTools: liveRunway });
    assert.equal(decision.mode, "fallback");
  }
  assert.equal(resolveMediaAction({ operation: "video.extend", provider: "runway", liveTools: liveRunway }).plan, "last-frame-i2v");
  assert.equal(resolveMediaAction({ operation: "video.stitch", provider: "runway", liveTools: liveRunway }).plan, "local-ffmpeg-concat");
});

test("upscale/edit route native when the live tool is present with matching schema", () => {
  assert.deepEqual(
    resolveMediaAction({ operation: "video.upscale", provider: "runway", liveTools: liveRunway }).plan,
    "upscale_video",
  );
  assert.equal(resolveMediaAction({ operation: "video.edit", provider: "runway", liveTools: liveRunway }).mode, "native");
});

test("drifted tool locks native (schema mismatch -> unavailable, not fallback)", () => {
  const drifted = [{ name: "upscale_video", schemaMatch: false }];
  const decision = resolveMediaAction({ operation: "video.upscale", provider: "runway", liveTools: drifted });
  assert.equal(decision.mode, "unavailable");
  assert.match(decision.reason, /drift/);
});

test("missing tool -> entitlement unavailable; unknown provider/op -> unavailable", () => {
  assert.equal(resolveMediaAction({ operation: "video.upscale", provider: "runway", liveTools: [] }).mode, "unavailable");
  assert.equal(resolveMediaAction({ operation: "video.reframe", provider: "runway", liveTools: liveRunway }).mode, "unavailable");
  assert.equal(resolveMediaAction({ operation: "video.upscale", provider: "higgsfield", liveTools: liveRunway }).mode, "unavailable");
});
