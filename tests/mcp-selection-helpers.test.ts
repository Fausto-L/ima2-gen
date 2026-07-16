import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMcpGenerationInput,
  defaultMcpPresetSelection,
  encodeMcpModelValue,
  hasInvalidMcpReferenceTags,
  isValidMcpReferenceTag,
  normalizeMcpRatio,
  parseMcpModelValue,
  reconcileMcpPresetSelection,
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

  it("builds a video payload with an explicit preset ratio and start frame", () => {
    const input = buildMcpGenerationInput(
      {
        mcpProvider: "runway",
        mcpModel: "seedance-2",
        mcpMediaKind: "video",
        mcpRatio: "16:9",
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

  it("builds an image payload without video-only fields and omits ratio on Auto", () => {
    const input = buildMcpGenerationInput(
      {
        mcpProvider: "runway",
        mcpModel: "gen-4",
        mcpMediaKind: "image",
        mcpRatio: null,
        currentImageFilename: "frame.png",
      },
      "a fox portrait",
    );
    assert.ok(input);
    assert.equal(input.kind, "image");
    assert.equal("ratio" in input, false);
    assert.equal(input.startFrameFilename, undefined);
    assert.equal("requestId" in input, false);
  });

  it("returns null without a provider or prompt", () => {
    const base = {
      mcpModel: "gen-4",
      mcpMediaKind: "image" as const,
    };
    assert.equal(buildMcpGenerationInput({ ...base, mcpProvider: null }, "prompt"), null);
    assert.equal(buildMcpGenerationInput({ ...base, mcpProvider: "runway" }, ""), null);
  });

  it("validates Runway reference tags without silently dropping invalid input", () => {
    for (const tag of ["hero", "인물_1", "scene-2"]) assert.equal(isValidMcpReferenceTag(tag), true);
    for (const tag of ["", "two words", "bad!", "x".repeat(33)]) assert.equal(isValidMcpReferenceTag(tag), false);
    assert.equal(hasInvalidMcpReferenceTags({
      startFrameFilename: null,
      endFrameFilename: null,
      references: [{ filename: "ref.png", tag: "two words" }],
      referenceVideoFilename: null,
    }), true);
    assert.equal(buildMcpGenerationInput({
      mcpProvider: "runway",
      mcpReferenceSelection: {
        startFrameFilename: null,
        endFrameFilename: null,
        references: [{ filename: "ref.png", tag: "two words" }],
        referenceVideoFilename: null,
      },
    }, "prompt"), null);
  });

  it("requires local references to be resolved to gallery filenames before payload assembly", () => {
    assert.equal(buildMcpGenerationInput({
      mcpProvider: "runway",
      mcpReferenceSelection: {
        startFrameFilename: null,
        endFrameFilename: null,
        references: [{ filename: "local:1", displayName: "portrait.png", dataUrl: "data:image/png;base64,AAAA" }],
        referenceVideoFilename: null,
      },
    }, "prompt"), null);
  });

  it("defaults a missing kind to image (legacy state)", () => {
    const input = buildMcpGenerationInput(
      {
        mcpProvider: "runway",
        mcpModel: "gen-4",
      },
      "prompt",
    );
    assert.equal(input?.kind, "image");
    assert.equal(input && "ratio" in input, false);
  });

  it("keeps syntactically valid ratios for later model-aware reconciliation", () => {
    assert.equal(normalizeMcpRatio("16:9"), "16:9");
    assert.equal(normalizeMcpRatio("9:16"), "9:16");
    assert.equal(normalizeMcpRatio("1:1"), "1:1");
    assert.equal(normalizeMcpRatio("21:9"), "21:9");
    assert.equal(normalizeMcpRatio(""), null);
    assert.equal(normalizeMcpRatio(undefined), null);
    assert.equal(normalizeMcpRatio(169), null);
    // Non-whitelisted persisted ratio never reaches the payload.
    const input = buildMcpGenerationInput(
      { mcpProvider: "runway", mcpModel: "seedance-2", mcpMediaKind: "video", mcpRatio: "banana" },
      "prompt",
    );
    assert.equal(input && "ratio" in input, false);
  });

  it("applies provider defaults and removes stale values when the selected model changes", () => {
    const seedance = {
      source: "verified-contract" as const,
      aspectRatios: ["16:9", "9:16"],
      inputRoles: ["start_image"],
      parameters: [
        { name: "duration", type: "number" as const, min: 4, max: 15, default: 10 },
        { name: "resolution", type: "string" as const, options: ["480p", "720p"] },
      ],
    };
    assert.deepEqual(defaultMcpPresetSelection(seedance), { ratio: null, parameters: { duration: 10 } });
    assert.deepEqual(
      reconcileMcpPresetSelection(seedance, "9:16", { duration: 12, resolution: "720p", genre: "noir" }),
      { ratio: "9:16", parameters: { duration: 12, resolution: "720p" } },
    );
    assert.deepEqual(
      reconcileMcpPresetSelection(seedance, "1:1", { duration: 99, resolution: "4k" }),
      { ratio: null, parameters: { duration: 10 } },
    );
  });

  it("emits bounded scalar presets and omits an empty parameter record", () => {
    const withPresets = buildMcpGenerationInput({
      mcpProvider: "runway", mcpModel: "seedance-2", mcpMediaKind: "video",
      mcpRatio: "16:9", mcpParameters: { duration: 12, resolution: "720p", generateAudio: false },
    }, "prompt");
    assert.deepEqual(withPresets?.parameters, { duration: 12, resolution: "720p", generateAudio: false });
    const withoutPresets = buildMcpGenerationInput({
      mcpProvider: "runway", mcpModel: "seedance-2", mcpMediaKind: "video", mcpParameters: {},
    }, "prompt");
    assert.equal(withoutPresets && "parameters" in withoutPresets, false);
  });
});
