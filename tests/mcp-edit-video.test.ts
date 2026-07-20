// wp5 052: edit_video keyframe 2-step workflow contract tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRunwayActionCall } from "../lib/mcp/adapters/runway.ts";

describe("edit_video 2-step plan construction (052)", () => {
  it("preview plan includes promptText + video.url + optional keyframeTimestampSeconds, no skipPreview", () => {
    const plan = buildRunwayActionCall("edit-video-preview", {
      url: "https://cdn.example.com/video.mp4",
      prompt: "make sneakers red",
      keyframeTimestampSeconds: 2.5,
    });
    assert.equal(plan.toolName, "edit_video");
    assert.equal(plan.args.promptText, "make sneakers red");
    assert.deepEqual(plan.args.video, { url: "https://cdn.example.com/video.mp4" });
    assert.equal(plan.args.keyframeTimestampSeconds, 2.5);
    assert.equal(plan.args.skipPreview, undefined);
    assert.equal(plan.args.keyframeImage, undefined);
  });

  it("submit plan includes keyframeImage.url, no skipPreview (A-gate fix)", () => {
    const plan = buildRunwayActionCall("edit-video-submit", {
      url: "https://cdn.example.com/video.mp4",
      prompt: "make sneakers red",
      keyframeImageUrl: "https://cdn.example.com/preview.png",
      keyframeTimestampSeconds: 2.5,
    });
    assert.equal(plan.toolName, "edit_video");
    assert.deepEqual(plan.args.keyframeImage, { url: "https://cdn.example.com/preview.png" });
    assert.equal(plan.args.skipPreview, undefined);
    assert.equal(plan.args.keyframeTimestampSeconds, 2.5);
  });

  it("submit without keyframeImageUrl throws MCP_ACTION_PREVIEW_REQUIRED", () => {
    assert.throws(
      () => buildRunwayActionCall("edit-video-submit", {
        url: "https://cdn.example.com/video.mp4",
        prompt: "make sneakers red",
      }),
      (error: unknown) => (error as Error).message === "MCP_ACTION_PREVIEW_REQUIRED",
    );
  });

  it("preview without prompt throws MCP_ACTION_PROMPT_REQUIRED", () => {
    assert.throws(
      () => buildRunwayActionCall("edit-video-preview", {
        url: "https://cdn.example.com/video.mp4",
      }),
      (error: unknown) => (error as Error).message === "MCP_ACTION_PROMPT_REQUIRED",
    );
  });

  it("legacy edit-video action still works (textOnly path)", () => {
    const plan = buildRunwayActionCall("edit-video", {
      url: "https://cdn.example.com/video.mp4",
      prompt: "add rain",
    });
    assert.equal(plan.toolName, "edit_video");
    assert.equal(plan.args.promptText, "add rain");
    assert.equal(plan.args.keyframeImage, undefined);
  });
});
