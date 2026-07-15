// WP7 (070): docs projection determinism + staleness gate.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

const run = promisify(execFile);

test("generated section exists, is current, and regeneration is deterministic", async () => {
  const before = readFileSync("skills/ima2/SKILL.md", "utf8");
  assert.ok(before.includes("<!-- mcp-tools:generated:start -->"));
  await run("node", ["scripts/generate-contract-docs.mjs", "--check"], { timeout: 60_000 });
  await run("node", ["scripts/generate-contract-docs.mjs"], { timeout: 60_000 });
  const after = readFileSync("skills/ima2/SKILL.md", "utf8");
  assert.equal(after, before, "regeneration must be byte-identical for the same catalog");
});

test("non-generated skill content is preserved around the markers", () => {
  const content = readFileSync("skills/ima2/SKILL.md", "utf8");
  assert.ok(content.indexOf("<!-- mcp-tools:generated:start -->") > content.indexOf("# "), "markers live inside the doc");
  assert.ok(content.includes("ima2 tools list --json"), "generated section points agents at the live CLI");
});
