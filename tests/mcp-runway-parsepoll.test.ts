// 260718: parsePoll prefers structured fields and real task artifacts over the
// raw text regex, deduped — fixture captured from a live get_task response.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { runwayAdapter } = await import("../lib/mcp/adapters/runway.ts");

const fixture = JSON.parse(readFileSync("tests/fixtures/mcp/runway-get-task.sanitized.json", "utf8"));

test("real get_task payload: succeeded, mp4 artifact first, no previews, no dupes", () => {
  const poll = runwayAdapter.parsePoll(fixture.result);
  assert.equal(poll.status, "succeeded");
  assert.ok(poll.outputUrls.length > 0, "outputUrls present");
  assert.match(poll.outputUrls[0], /\.mp4\?_jwt=/, "first URL is the video artifact");
  const firstMp4 = poll.outputUrls.findIndex((url) => /\.mp4(\?|$)/.test(url));
  const firstPreview = poll.outputUrls.findIndex((url) => url.includes("preview"));
  assert.ok(firstMp4 === 0, "mp4 leads");
  assert.ok(firstPreview === -1 || firstPreview > firstMp4, "previews never lead");
  assert.equal(new Set(poll.outputUrls).size, poll.outputUrls.length, "deduped");
});

test("structuredContent.url wins over text-regex order", () => {
  const poll = runwayAdapter.parsePoll({
    content: [{ type: "text", text: "Task abc succeeded.\n[Download video](https://cdn.example.com/text-first.mp4?_jwt=a)" }],
    structuredContent: { url: "https://cdn.example.com/structured-first.mp4?_jwt=b" },
  });
  assert.equal(poll.status, "succeeded");
  assert.equal(poll.outputUrls[0], "https://cdn.example.com/structured-first.mp4?_jwt=b");
  assert.ok(poll.outputUrls.includes("https://cdn.example.com/text-first.mp4?_jwt=a"));
});

test("artifacts from JSON text block beat generic matches; video beats image preview", () => {
  const taskJson = JSON.stringify({
    task: {
      id: "t1",
      status: "SUCCEEDED",
      artifacts: [
        { url: "https://cdn.example.com/preview.jpg?_jwt=p" },
        { url: "https://cdn.example.com/real.mp4?_jwt=r" },
      ],
    },
  }, null, 2);
  const poll = runwayAdapter.parsePoll({ content: [{ type: "text", text: `Task t1 succeeded.\n${taskJson}` }] });
  assert.equal(poll.status, "succeeded");
  assert.equal(poll.outputUrls[0], "https://cdn.example.com/real.mp4?_jwt=r");
});

test("regex fallback still works with no structured content", () => {
  const poll = runwayAdapter.parsePoll({
    content: [{ type: "text", text: "Task t2 SUCCEEDED\nhttps://cdn.example.com/only.mp4?_jwt=z" }],
  });
  assert.equal(poll.status, "succeeded");
  assert.deepEqual(poll.outputUrls, ["https://cdn.example.com/only.mp4?_jwt=z"]);
});
