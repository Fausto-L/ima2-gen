// wp5 053: multishot plan construction + route validation contracts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMultishotCall } from "../lib/mcp/adapters/runway.ts";

describe("multishot plan construction (053)", () => {
  it("auto mode with storyPrompt and default duration/resolution", () => {
    const plan = buildMultishotCall({ storyPrompt: "A cat explores a garden" });
    assert.equal(plan.toolName, "generate_multishot_video");
    assert.equal(plan.args.mode, "auto");
    assert.equal(plan.args.storyPrompt, "A cat explores a garden");
    assert.equal(plan.args.shots, undefined);
  });

  it("custom mode with 3 shots", () => {
    const plan = buildMultishotCall({ shots: ["shot 1", "shot 2", "shot 3"], duration: 5, resolution: "720p" });
    assert.equal(plan.args.mode, "custom");
    assert.deepEqual(plan.args.shots, [{ prompt: "shot 1" }, { prompt: "shot 2" }, { prompt: "shot 3" }]);
    assert.equal(plan.args.duration, 5);
    assert.equal(plan.args.resolution, "720p");
  });

  it("custom mode with 2 shots throws MCP_REQUEST_INVALID", () => {
    assert.throws(
      () => buildMultishotCall({ shots: ["a", "b"] }),
      (err: unknown) => (err as Error).message.startsWith("MCP_REQUEST_INVALID"),
    );
  });

  it("custom mode with 6 shots throws MCP_REQUEST_INVALID", () => {
    assert.throws(
      () => buildMultishotCall({ shots: ["a", "b", "c", "d", "e", "f"] }),
      (err: unknown) => (err as Error).message.startsWith("MCP_REQUEST_INVALID"),
    );
  });

  it("auto mode without storyPrompt throws MCP_REQUEST_INVALID", () => {
    assert.throws(
      () => buildMultishotCall({}),
      (err: unknown) => (err as Error).message.startsWith("MCP_REQUEST_INVALID"),
    );
  });

  it("includes firstSceneImage when URL provided", () => {
    const plan = buildMultishotCall({ storyPrompt: "A story", firstSceneImageUrl: "https://cdn.example.com/scene.png" });
    assert.deepEqual(plan.args.firstSceneImage, { url: "https://cdn.example.com/scene.png" });
  });
});
