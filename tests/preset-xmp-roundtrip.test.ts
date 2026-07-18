import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  embedImageMetadata,
  readEmbeddedImageMetadata,
} from "../lib/imageMetadataStore.ts";

async function makePng() {
  return sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  }).png().toBuffer();
}

async function roundTrip(metadata: Record<string, unknown>) {
  const embedded = await embedImageMetadata(await makePng(), "png", metadata);
  return readEmbeddedImageMetadata(embedded.buffer);
}

describe("preset XMP metadata round-trip", () => {
  it("preserves presetIds through PNG XMP embedding and reading", async () => {
    const result = await roundTrip({ prompt: "test", presetIds: ["style", "lighting"] });

    assert.equal(result.source, "xmp");
    assert.deepEqual(result.metadata?.presetIds, ["style", "lighting"]);
  });

  it("preserves an empty presetIds array", async () => {
    const result = await roundTrip({ prompt: "test", presetIds: [] });

    assert.deepEqual(result.metadata?.presetIds, []);
  });

  it("leaves presetIds absent when metadata does not provide them", async () => {
    const result = await roundTrip({ prompt: "test" });

    assert.equal("presetIds" in (result.metadata ?? {}), false);
  });

  it("deduplicates duplicate presetIds during the XMP round-trip", async () => {
    const result = await roundTrip({ prompt: "test", presetIds: ["style", "lighting", "style"] });

    assert.deepEqual(result.metadata?.presetIds, ["style", "lighting"]);
  });

  it("preserves presetIds selection order through the XMP round-trip", async () => {
    const result = await roundTrip({ prompt: "test", presetIds: ["lighting", "style", "camera"] });

    assert.deepEqual(result.metadata?.presetIds, ["lighting", "style", "camera"]);
  });
});
