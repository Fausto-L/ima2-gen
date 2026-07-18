// 260718: download retry — transient completion-moment failures must not drop
// a remote-succeeded asset.
import { test } from "node:test";
import assert from "node:assert/strict";

const { downloadMediaResult } = await import("../lib/mcp/downloadMediaResult.ts");

function fakeResponse(body = "mp4-bytes") {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "video/mp4" } });
}

function withFetch(sequence: Array<() => Response | never>, run: () => Promise<void>) {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    return sequence[Math.min(call - 1, sequence.length - 1)]();
  }) as typeof fetch;
  return run().finally(() => { globalThis.fetch = original; });
}

// IP-literal host: skips DNS lookup inside assertPublicHttps, stays offline.
const URL = "https://93.184.216.34/out.mp4?_jwt=x";
const FAST = { kind: "video" as const, attempts: 5, baseDelayMs: 1, v4Fallback: false };

test("retry: network failure then 403 then success commits on attempt 3", async () => {
  let calls = 0;
  await withFetch([
    () => { calls += 1; throw new TypeError("fetch failed"); },
    () => { calls += 1; return new Response("nope", { status: 403 }); },
    () => { calls += 1; return fakeResponse(); },
  ], async () => {
    const result = await downloadMediaResult(URL, FAST);
    assert.equal(result.contentType, "video/mp4");
    assert.equal(result.bytes, 9);
    await result.cleanup();
  });
  assert.equal(calls, 3);
});

test("retry: exhaustion surfaces the last error", async () => {
  await withFetch([
    () => { throw new TypeError("fetch failed"); },
  ], async () => {
    await assert.rejects(
      downloadMediaResult(URL, { kind: "video", attempts: 3, baseDelayMs: 1, v4Fallback: false }),
      /fetch failed/,
    );
  });
});

test("no retry on permanent client error (400)", async () => {
  let calls = 0;
  await withFetch([
    () => { calls += 1; return new Response("bad", { status: 400 }); },
  ], async () => {
    await assert.rejects(downloadMediaResult(URL, FAST), /MCP_DOWNLOAD_FAILED:400/);
  });
  assert.equal(calls, 1);
});

test("no retry on content-type mismatch", async () => {
  let calls = 0;
  await withFetch([
    () => { calls += 1; return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }); },
  ], async () => {
    await assert.rejects(downloadMediaResult(URL, FAST), /MCP_RESULT_TYPE_MISMATCH/);
  });
  assert.equal(calls, 1);
});

test("default is single attempt (back-compat)", async () => {
  let calls = 0;
  await withFetch([
    () => { calls += 1; throw new TypeError("fetch failed"); },
  ], async () => {
    await assert.rejects(downloadMediaResult(URL, { kind: "video", v4Fallback: false }), /fetch failed/);
  });
  assert.equal(calls, 1);
});
