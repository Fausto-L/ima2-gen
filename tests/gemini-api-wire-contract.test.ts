import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { generateViaGeminiApi } from "../lib/geminiApiImageAdapter.ts";
import type { RuntimeContext } from "../lib/runtimeContext.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const FINAL_B64 = Buffer.from("final image").toString("base64");

type CapturedCall = { url: string; body: Record<string, unknown> };

function mockGeminiOk(calls: CapturedCall[]) {
  globalThis.fetch = (async (url: unknown, init: RequestInit | undefined) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return Response.json({
      candidates: [{
        content: { parts: [{ inlineData: { data: FINAL_B64, mimeType: "image/png" } }] },
      }],
    });
  }) as typeof fetch;
}

function testCtx(): RuntimeContext {
  return {
    rootDir: process.cwd(),
    config: { storage: { generatedDir: "/tmp" } },
    geminiApiKey: "test-key",
  } as RuntimeContext; // justified: minimal shape for the adapter under test
}

function imageFormat(body: Record<string, unknown>): Record<string, unknown> {
  const config = body.generation_config as Record<string, unknown>;
  const format = config.response_format as Record<string, unknown> | undefined;
  return (format?.image ?? {}) as Record<string, unknown>;
}

describe("gemini-api public v1beta wire contract (070 QA regression)", () => {
  it("1024x1024 maps to v1beta enums, not human strings", async () => {
    const calls: CapturedCall[] = [];
    mockGeminiOk(calls);
    await generateViaGeminiApi("a teapot", testCtx(), { model: "nano-banana-2", size: "1024x1024" });
    assert.equal(imageFormat(calls[0].body).aspect_ratio, "ASPECT_RATIO_ONE_BY_ONE");
    assert.equal(imageFormat(calls[0].body).image_size, "IMAGE_SIZE_ONE_K");
  });

  it("references add inlineData without changing the image config", async () => {
    const calls: CapturedCall[] = [];
    mockGeminiOk(calls);
    await generateViaGeminiApi("same character", testCtx(), {
      model: "nano-banana-2",
      size: "1024x1024",
      references: [{ b64: Buffer.from("ref").toString("base64"), declaredMime: "image/png" }],
    });
    assert.equal(imageFormat(calls[0].body).aspect_ratio, "ASPECT_RATIO_ONE_BY_ONE");
    const contents = calls[0].body.contents as Array<{ parts: Array<Record<string, unknown>> }>;
    assert.ok(contents[0].parts.some((part) => part.inlineData), "reference rides as inlineData");
  });

  it("auto size omits the image config entirely", async () => {
    const calls: CapturedCall[] = [];
    mockGeminiOk(calls);
    await generateViaGeminiApi("free ratio", testCtx(), { model: "nano-banana-2", size: "auto" });
    const config = calls[0].body.generation_config as Record<string, unknown>;
    assert.equal(config.response_format, undefined);
  });

  it("ratio table maps every supported aspect to its enum", async () => {
    const cases: Array<[string, string]> = [
      ["1024x1024", "ASPECT_RATIO_ONE_BY_ONE"],
      ["1024x1536", "ASPECT_RATIO_TWO_BY_THREE"],
      ["1536x1024", "ASPECT_RATIO_THREE_BY_TWO"],
      ["1152x1536", "ASPECT_RATIO_THREE_BY_FOUR"],
      ["1365x1024", "ASPECT_RATIO_FOUR_BY_THREE"],
      ["2048x1152", "ASPECT_RATIO_SIXTEEN_BY_NINE"],
      ["1152x2048", "ASPECT_RATIO_NINE_BY_SIXTEEN"],
    ];
    for (const [size, expected] of cases) {
      const calls: CapturedCall[] = [];
      mockGeminiOk(calls);
      await generateViaGeminiApi("ratio probe", testCtx(), { model: "nano-banana-2", size });
      assert.equal(imageFormat(calls[0].body).aspect_ratio, expected, size);
    }
  });
});
