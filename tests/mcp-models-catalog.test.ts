// 040 — provider model catalog resolver: fixture projection, pagination,
// read-only single-tool guard, cache, and abort/timeout threading.
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearModelsCatalogCache,
  getProviderModels,
  parseModelsExploreItems,
  READONLY_CATALOG_TOOL,
  type CatalogToolCaller,
} from "../lib/mcp/modelsCatalog.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/mcp/higgsfield-models.sanitized.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

type Call = { provider: string; name: string; args: Record<string, unknown>; options?: { signal?: AbortSignal; timeoutMs?: number } };

function page(items: Array<{ id: string; name?: string }>, next?: string): Record<string, unknown> {
  return {
    structuredContent: {
      items,
      has_more: Boolean(next),
      ...(next ? { next_page_token: next } : {}),
    },
  };
}

function makeCaller(pages: Record<string, Record<string, unknown>[]>): { caller: CatalogToolCaller; calls: Call[] } {
  const calls: Call[] = [];
  const cursors: Record<string, number> = {};
  const caller: CatalogToolCaller = async (provider, name, args, options) => {
    calls.push({ provider, name, args, options });
    const kind = String(args.type);
    const index = cursors[kind] ?? 0;
    cursors[kind] = index + 1;
    const kindPages = pages[kind] ?? [page([])];
    return kindPages[Math.min(index, kindPages.length - 1)];
  };
  return { caller, calls };
}

beforeEach(() => clearModelsCatalogCache());

describe("parseModelsExploreItems", () => {
  it("projects the captured fixture into {id,label,description} entries", () => {
    const entries = parseModelsExploreItems(fixture);
    assert.equal(entries.length, 20);
    const nano = entries.find((entry) => entry.id === "nano_banana_pro");
    assert.deepEqual(nano, {
      id: "nano_banana_pro",
      label: "Nano Banana Pro",
      description: "Ultimate quality, text and diagrams",
    });
  });

  it("skips malformed items and falls back to id as label", () => {
    const entries = parseModelsExploreItems(page([
      { id: "soul_2" },
      { id: "" },
      { name: "no-id" } as never,
    ]));
    assert.deepEqual(entries, [{ id: "soul_2", label: "soul_2" }]);
  });
});

describe("getProviderModels", () => {
  it("returns runway static contract enums without any tool call", async () => {
    const { caller, calls } = makeCaller({});
    const models = await getProviderModels("runway", caller);
    assert.equal(calls.length, 0);
    assert.deepEqual(models.video.map((entry) => entry.id), [
      "seedance-2", "kling-o3-pro", "kling-3-pro", "gen-4.5", "veo-3.1", "gen-4-turbo",
    ]);
    assert.deepEqual(models.image.map((entry) => entry.id), [
      "nano-banana-pro", "gpt-image-2", "gen-4",
    ]);
  });

  it("rejects unknown providers with the canonical code", async () => {
    const { caller } = makeCaller({});
    await assert.rejects(getProviderModels("krea", caller), /MCP_PROVIDER_UNKNOWN/);
  });

  it("calls only models_explore with kind filters and paginates with the cursor", async () => {
    const { caller, calls } = makeCaller({
      image: [
        page([{ id: "soul_2", name: "Soul 2" }, { id: "nano_banana_pro" }], "20"),
        page([{ id: "soul_2" }, { id: "gpt_image_2" }]),
      ],
      video: [page([{ id: "kling_3" }])],
    });
    const models = await getProviderModels("higgsfield", caller);
    // Every upstream call is the read-only catalog tool with list action.
    for (const call of calls) {
      assert.equal(call.provider, "higgsfield");
      assert.equal(call.name, READONLY_CATALOG_TOOL);
      assert.equal(call.args.action, "list");
      assert.equal(call.options?.timeoutMs, 20_000);
    }
    // Pagination: image fetched twice (cursor "20" passed), deduped by id.
    const imageCalls = calls.filter((call) => call.args.type === "image");
    assert.equal(imageCalls.length, 2);
    assert.equal(imageCalls[1].args.after, "20");
    assert.deepEqual(models.image.map((entry) => entry.id), ["soul_2", "nano_banana_pro", "gpt_image_2"]);
    assert.deepEqual(models.video.map((entry) => entry.id), ["kling_3"]);
  });

  it("stops on a repeated cursor instead of looping", async () => {
    const stuck = page([{ id: "soul_2" }], "same-token");
    const { caller, calls } = makeCaller({ image: [stuck, stuck, stuck, stuck], video: [page([])] });
    await getProviderModels("higgsfield", caller);
    const imageCalls = calls.filter((call) => call.args.type === "image");
    assert.equal(imageCalls.length, 2); // first page + one cursor retry, then guard stops
  });

  it("caches successful catalogs and never caches failures", async () => {
    const good = makeCaller({ image: [page([{ id: "soul_2" }])], video: [page([])] });
    await getProviderModels("higgsfield", good.caller);
    await getProviderModels("higgsfield", good.caller);
    assert.equal(good.calls.length, 2); // second call served from cache

    clearModelsCatalogCache();
    const failing: CatalogToolCaller = async () => { throw new Error("MCP_NOT_CONNECTED"); };
    await assert.rejects(getProviderModels("higgsfield", failing), /MCP_NOT_CONNECTED/);
    await assert.rejects(getProviderModels("higgsfield", failing), /MCP_NOT_CONNECTED/);
  });

  it("threads the abort signal into every call", async () => {
    const controller = new AbortController();
    const { caller, calls } = makeCaller({ image: [page([])], video: [page([])] });
    await getProviderModels("higgsfield", caller, { signal: controller.signal });
    assert.ok(calls.length >= 2);
    for (const call of calls) assert.equal(call.options?.signal, controller.signal);
  });
});
