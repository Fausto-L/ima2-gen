import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { aggregateStats, invalidateStatsCache } from "../lib/statsAggregator.ts";

let _tmpDir: string;

async function makeTmpDir() {
  _tmpDir = join(process.cwd(), ".test-tmp-stats-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6));
  await mkdir(_tmpDir, { recursive: true });
  return _tmpDir;
}

async function makeImage(dir: string, name: string, meta: Record<string, unknown>) {
  const imgPath = join(dir, name);
  await writeFile(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // minimal PNG header
  await writeFile(`${imgPath}.json`, JSON.stringify(meta));
}

test("returns empty stats when no images exist", async () => {
  const dir = await makeTmpDir();
  try {
    invalidateStatsCache();
    const result = await aggregateStats(dir, "all", "CNY");
    assert.equal(result.totalImages, 0);
    assert.equal(result.totalVideos, 0);
    assert.equal(result.totalTokens, 0);
    assert.equal(result.totalCostUsd, 0);
    assert.equal(result.dailyBreakdown.length, 0);
    assert.equal(result.modelDistribution.length, 0);
    assert.equal(result.promptWordCloud.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("counts images and computes cost correctly", async () => {
  const dir = await makeTmpDir();
  try {
    invalidateStatsCache();
    await makeImage(dir, "img1.png", {
      prompt: "a beautiful sunset over mountains",
      quality: "high",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "api",
      createdAt: Date.now(),
    });
    await makeImage(dir, "img2.png", {
      prompt: " serene forest landscape",
      quality: "medium",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "api",
      createdAt: Date.now(),
    });

    const result = await aggregateStats(dir, "all", "USD");
    assert.equal(result.totalImages, 2);
    assert.equal(result.totalVideos, 0);
    assert.ok(result.totalCostUsd > 0, "cost should be greater than 0");
    assert.equal(result.modelDistribution.length, 1);
    assert.equal(result.modelDistribution[0].key, "gpt-image-1");
    assert.equal(result.modelDistribution[0].count, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("filter by today range excludes old images", async () => {
  const dir = await makeTmpDir();
  try {
    invalidateStatsCache();
    const oldTime = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days ago
    await makeImage(dir, "old.png", {
      prompt: "old image",
      quality: "low",
      size: "1024x1024",
      model: "gemini-2.5-flash-image",
      provider: "google-genai",
      createdAt: oldTime,
    });
    await makeImage(dir, "new.png", {
      prompt: "recent image",
      quality: "low",
      size: "1024x1024",
      model: "gemini-2.5-flash-image",
      provider: "google-genai",
      createdAt: Date.now(),
    });

    const result = await aggregateStats(dir, "today", "USD");
    assert.equal(result.totalImages, 1, "only today's image should be counted");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("word cloud extracts English and Chinese tokens", async () => {
  const dir = await makeTmpDir();
  try {
    invalidateStatsCache();
    await makeImage(dir, "en.png", {
      prompt: "beautiful sunset mountain landscape sunset",
      quality: "low",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "api",
      createdAt: Date.now(),
    });
    await makeImage(dir, "cn.png", {
      prompt: "山水画 风景画 山水画",
      quality: "low",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "api",
      createdAt: Date.now(),
    });

    const result = await aggregateStats(dir, "all", "USD");
    const words = result.promptWordCloud.map((w) => w.word);
    assert.ok(words.includes("sunset"), "should include 'sunset'");
    assert.ok(words.includes("beautiful"), "should include 'beautiful'");
    assert.ok(words.includes("山水"), "should include '山水' bigram");
    assert.ok(words.includes("风景"), "should include '风景' bigram");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cost display is formatted with currency", async () => {
  const dir = await makeTmpDir();
  try {
    invalidateStatsCache();
    await makeImage(dir, "img.png", {
      prompt: "test",
      quality: "high",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "oauth",
      createdAt: Date.now(),
    });

    const cnyResult = await aggregateStats(dir, "all", "CNY");
    assert.ok(cnyResult.totalCostDisplay.includes("¥") || cnyResult.totalCostDisplay.includes("CNY"),
      `expected CNY symbol in "${cnyResult.totalCostDisplay}"`);

    invalidateStatsCache();
    const usdResult = await aggregateStats(dir, "all", "USD");
    assert.ok(usdResult.totalCostDisplay.includes("$") || usdResult.totalCostDisplay.includes("USD"),
      `expected USD symbol in "${usdResult.totalCostDisplay}"`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache returns same result within TTL", async () => {
  const dir = await makeTmpDir();
  try {
    invalidateStatsCache();
    await makeImage(dir, "img.png", {
      prompt: "cache test",
      quality: "medium",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "oauth",
      createdAt: Date.now(),
    });

    const first = await aggregateStats(dir, "all", "USD");
    // Add another image but cache should still return old result
    await makeImage(dir, "img2.png", {
      prompt: "second image",
      quality: "medium",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "oauth",
      createdAt: Date.now(),
    });

    const cached = await aggregateStats(dir, "all", "USD");
    assert.equal(cached.totalImages, first.totalImages, "cache should return old result");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider distribution aggregates by provider", async () => {
  const dir = await makeTmpDir();
  try {
    invalidateStatsCache();
    await makeImage(dir, "img1.png", {
      prompt: "test",
      quality: "low",
      size: "1024x1024",
      model: "gpt-image-1",
      provider: "oauth",
      createdAt: Date.now(),
    });
    await makeImage(dir, "img2.png", {
      prompt: "test",
      quality: "low",
      size: "1024x1024",
      model: "gemini-2.5-flash-image",
      provider: "google-genai",
      createdAt: Date.now(),
    });

    const result = await aggregateStats(dir, "all", "USD");
    assert.equal(result.providerDistribution.length, 2);
    const oauth = result.providerDistribution.find((p) => p.key === "oauth");
    const google = result.providerDistribution.find((p) => p.key === "google-genai");
    assert.ok(oauth, "should have oauth provider");
    assert.ok(google, "should have google-genai provider");
    assert.equal(oauth.count, 1);
    assert.equal(google?.count, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
