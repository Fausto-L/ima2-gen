import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMcpGenerationInput,
  encodeMcpModelValue,
  parseMcpModelValue,
  resolveMcpMediaKind,
} from "../ui/src/lib/mcpSelection.js";

describe("mcpSelection pure helpers", () => {
  it("round-trips model value encoding for both kinds", () => {
    assert.equal(encodeMcpModelValue("image", "gen-4"), "img:gen-4");
    assert.equal(encodeMcpModelValue("video", "seedance-2"), "vid:seedance-2");
    assert.deepEqual(parseMcpModelValue("img:gen-4"), { kind: "image", model: "gen-4" });
    assert.deepEqual(parseMcpModelValue("vid:seedance-2"), { kind: "video", model: "seedance-2" });
  });

  it("rejects malformed model values", () => {
    assert.equal(parseMcpModelValue(""), null);
    assert.equal(parseMcpModelValue("seedance-2"), null);
    assert.equal(parseMcpModelValue("img:"), null);
    assert.equal(parseMcpModelValue("vid:"), null);
  });

  it("normalizes unknown persisted kind values to image", () => {
    assert.equal(resolveMcpMediaKind("video"), "video");
    assert.equal(resolveMcpMediaKind("image"), "image");
    assert.equal(resolveMcpMediaKind(undefined), "image");
    assert.equal(resolveMcpMediaKind(null), "image");
    assert.equal(resolveMcpMediaKind("VIDEO"), "image");
    assert.equal(resolveMcpMediaKind(42), "image");
  });

  it("builds a video payload with kind-consistent ratio and start frame", () => {
    const input = buildMcpGenerationInput(
      {
        mcpProvider: "runway",
        mcpModel: "seedance-2",
        mcpMediaKind: "video",
        videoAspectRatio: "16:9",
        grokAspectRatio: "1:1",
        currentImageFilename: "frame.png",
      },
      "a fox running",
      "req_1",
    );
    assert.deepEqual(input, {
      provider: "runway",
      kind: "video",
      prompt: "a fox running",
      model: "seedance-2",
      ratio: "16:9",
      startFrameFilename: "frame.png",
      requestId: "req_1",
    });
  });

  it("builds an image payload without video-only fields", () => {
    const input = buildMcpGenerationInput(
      {
        mcpProvider: "runway",
        mcpModel: "gen-4",
        mcpMediaKind: "image",
        videoAspectRatio: "16:9",
        grokAspectRatio: "1:1",
        currentImageFilename: "frame.png",
      },
      "a fox portrait",
    );
    assert.ok(input);
    assert.equal(input.kind, "image");
    assert.equal(input.ratio, "1:1");
    assert.equal(input.startFrameFilename, undefined);
    assert.equal("requestId" in input, false);
  });

  it("returns null without a provider or prompt", () => {
    const base = {
      mcpModel: "gen-4",
      mcpMediaKind: "image" as const,
      videoAspectRatio: "16:9",
      grokAspectRatio: "1:1",
    };
    assert.equal(buildMcpGenerationInput({ ...base, mcpProvider: null }, "prompt"), null);
    assert.equal(buildMcpGenerationInput({ ...base, mcpProvider: "runway" }, ""), null);
  });

  it("defaults a missing kind to image (legacy state)", () => {
    const input = buildMcpGenerationInput(
      {
        mcpProvider: "runway",
        mcpModel: "gen-4",
        videoAspectRatio: "16:9",
        grokAspectRatio: "3:4",
      },
      "prompt",
    );
    assert.equal(input?.kind, "image");
    assert.equal(input?.ratio, "3:4");
  });
});
