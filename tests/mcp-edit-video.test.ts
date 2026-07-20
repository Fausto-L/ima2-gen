// wp5 052: edit_video keyframe 2-step workflow contract tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRunwayActionCall } from "../lib/mcp/adapters/runway.ts";
import { executeEditVideoPreview, parseKeyframePreview } from "../lib/mcp/editVideoPreview.ts";

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

describe("stage-1 keyframe preview sync response (wp5b2 live-captured shape)", () => {
  const liveCaptured = {
    content: [{ type: "text", text: "Edited keyframe generated (t=0.5s). The video edit has NOT been submitted yet.\n\nKeyframe URL: https://cdn.example.com/kf.png?_jwt=x" }],
    structuredContent: {
      kind: "keyframe_preview",
      prompt: "add snow",
      keyframeTimestampSeconds: 0.5,
      keyframeUrl: "https://cdn.example.com/kf.png?_jwt=x",
      nextTool: "edit_video",
      nextArguments: { video: { url: "https://cdn.example.com/src.mp4" }, keyframeImage: { url: "https://cdn.example.com/kf.png?_jwt=x" } },
    },
  };

  it("parses structuredContent keyframe_preview with nextArguments", () => {
    const preview = parseKeyframePreview(liveCaptured);
    assert.equal(preview?.keyframeUrl, "https://cdn.example.com/kf.png?_jwt=x");
    assert.equal(preview?.keyframeTimestampSeconds, 0.5);
    assert.deepEqual(preview?.nextArguments?.keyframeImage, { url: "https://cdn.example.com/kf.png?_jwt=x" });
  });

  it("falls back to the Keyframe URL text line when structuredContent is absent", () => {
    const preview = parseKeyframePreview({ content: liveCaptured.content });
    assert.equal(preview?.keyframeUrl, "https://cdn.example.com/kf.png?_jwt=x");
  });

  it("returns null for non-preview shapes (task results)", () => {
    assert.equal(parseKeyframePreview({ structuredContent: { taskId: "abc" } }), null);
    assert.equal(parseKeyframePreview({ content: [{ type: "text", text: "Task created." }] }), null);
  });

  it("executeEditVideoPreview retries on Streamable HTTP error and succeeds", async () => {
    let calls = 0;
    const manager = {
      callTool: async () => {
        calls += 1;
        if (calls === 1) throw new Error("Streamable HTTP error: 504 Gateway Timeout");
        return liveCaptured;
      },
    };
    const preview = await executeEditVideoPreview(manager as never, { provider: "runway", executable: true } as never, { toolName: "edit_video", args: {} });
    assert.equal(calls, 2);
    assert.equal(preview.keyframeUrl, "https://cdn.example.com/kf.png?_jwt=x");
  });

  it("executeEditVideoPreview throws MCP_PREVIEW_SHAPE_UNEXPECTED on unknown shape", async () => {
    const manager = { callTool: async () => ({ structuredContent: { taskId: "x" } }) };
    await assert.rejects(
      () => executeEditVideoPreview(manager as never, { provider: "runway", executable: true } as never, { toolName: "edit_video", args: {} }),
      (error: unknown) => String((error as Error).message).startsWith("MCP_PREVIEW_SHAPE_UNEXPECTED"),
    );
  });

  it("does NOT retry non-Streamable errors", async () => {
    let calls = 0;
    const manager = {
      callTool: async () => { calls += 1; throw new Error("MCP_TOOL_ERROR:edit_video:bad request"); },
    };
    await assert.rejects(
      () => executeEditVideoPreview(manager as never, { provider: "runway", executable: true } as never, { toolName: "edit_video", args: {} }),
    );
    assert.equal(calls, 1);
  });
});
