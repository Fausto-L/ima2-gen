// wp5 054: upscale parameter contracts — adapter plan, route validation, UI helpers.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRunwayActionCall } from "../lib/mcp/adapters/runway.ts";
import { buildUpscaleBody, upscaleKindFromFilename, upscaleParamsError } from "../ui/src/lib/upscaleAction.ts";

describe("upscale_image plan parameters (054)", () => {
  it("includes only the provided params", () => {
    const plan = buildRunwayActionCall("upscale-image", {
      url: "https://cdn.example.com/img.png",
      upscale: { scaleFactor: 2, sharpen: 20 },
    });
    assert.equal(plan.toolName, "upscale_image");
    assert.equal(plan.args.scaleFactor, 2);
    assert.equal(plan.args.sharpen, 20);
    assert.equal(plan.args.flavor, undefined);
    assert.equal(plan.args.smartGrain, undefined);
  });

  it("includes the full parameter set when provided", () => {
    const plan = buildRunwayActionCall("upscale-image", {
      url: "https://cdn.example.com/img.png",
      upscale: { scaleFactor: 4, flavor: "sublime", sharpen: 10, smartGrain: 30, ultraDetail: 50 },
    });
    assert.deepEqual(
      { scaleFactor: plan.args.scaleFactor, flavor: plan.args.flavor, sharpen: plan.args.sharpen, smartGrain: plan.args.smartGrain, ultraDetail: plan.args.ultraDetail },
      { scaleFactor: 4, flavor: "sublime", sharpen: 10, smartGrain: 30, ultraDetail: 50 },
    );
  });

  it("throws when scaleFactor > 2 pairs with a non-sublime flavor", () => {
    assert.throws(
      () => buildRunwayActionCall("upscale-image", {
        url: "https://cdn.example.com/img.png",
        upscale: { scaleFactor: 4, flavor: "photo" },
      }),
      (error: unknown) => String((error as Error).message).startsWith("MCP_REQUEST_INVALID"),
    );
  });

  it("throws on an out-of-range scaleFactor", () => {
    assert.throws(
      () => buildRunwayActionCall("upscale-image", {
        url: "https://cdn.example.com/img.png",
        upscale: { scaleFactor: 3 as never },
      }),
      (error: unknown) => String((error as Error).message).startsWith("MCP_REQUEST_INVALID"),
    );
  });

  it("upscale-video ignores parameters entirely (none allowed by schema)", () => {
    const plan = buildRunwayActionCall("upscale-video", { url: "https://cdn.example.com/vid.mp4" });
    assert.equal(plan.toolName, "upscale_video");
    assert.deepEqual(Object.keys(plan.args), ["rationale", "video"]);
  });
});

describe("ui upscaleAction helpers", () => {
  it("detects kind from filename", () => {
    assert.equal(upscaleKindFromFilename("a.png"), "image");
    assert.equal(upscaleKindFromFilename("a.jpeg"), "image");
    assert.equal(upscaleKindFromFilename("a.webp"), "image");
    assert.equal(upscaleKindFromFilename("a.mp4"), "video");
    assert.equal(upscaleKindFromFilename("a.mov"), "video");
    assert.equal(upscaleKindFromFilename("a.txt"), null);
  });

  it("blocks parameters on video and bad flavor pairs", () => {
    assert.ok(upscaleParamsError("video", { scaleFactor: 2 }));
    assert.ok(upscaleParamsError("image", { scaleFactor: 8, flavor: "photo" }));
    assert.equal(upscaleParamsError("image", { scaleFactor: 8, flavor: "sublime" }), null);
    assert.equal(upscaleParamsError("image", { scaleFactor: 2 }), null);
  });

  it("builds the media-action body with only defined params", () => {
    assert.deepEqual(buildUpscaleBody("a.png", { scaleFactor: 2, sharpen: 15 }), {
      action: "upscale-image", files: ["a.png"], parameters: { scaleFactor: 2, sharpen: 15 },
    });
    assert.deepEqual(buildUpscaleBody("a.mp4", {}), { action: "upscale-video", files: ["a.mp4"] });
    assert.equal(buildUpscaleBody("a.txt", {}), null);
    assert.equal(buildUpscaleBody("a.mp4", { scaleFactor: 2 }), null);
  });
});
