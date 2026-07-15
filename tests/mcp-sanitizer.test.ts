// WP4 (040): sanitizer truth table + canonical hashing invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { canonicalHash, canonicalStringify, scrubValue, toolSchemaHash } from "../lib/mcp/sanitizer.js";

test("scrubValue removes tokens, emails, and signed query params", () => {
  const scrubbed = scrubValue({
    a: `bearer ${"x1Y2z3W4v5U6t7S8r9Q0".repeat(3)}`,
    b: "mail me at ops@example.com",
    c: "https://cdn.example.com/out.mp4?signature=abc&x=1",
    nested: [{ d: "token=deadbeefcafe" }],
  });
  const text = JSON.stringify(scrubbed);
  assert.ok(!text.includes("ops@example.com"));
  assert.ok(!text.includes("signature=abc"));
  assert.ok(!text.includes("token=deadbeefcafe"));
  assert.match(text, /\[REDACTED\]/);
});

test("canonicalStringify is key-order invariant and drops undefined", () => {
  const a = { z: 1, a: { c: [1, 2], b: "x" }, skip: undefined };
  const b = { a: { b: "x", c: [1, 2] }, z: 1 };
  assert.equal(canonicalStringify(a), canonicalStringify(b));
  assert.equal(canonicalHash(a), canonicalHash(b));
});

test("toolSchemaHash covers only the schema pair and is order-invariant", () => {
  const base = { inputSchema: { type: "object", properties: { p: { type: "string" } } } };
  const reordered = { inputSchema: { properties: { p: { type: "string" } }, type: "object" } };
  assert.equal(toolSchemaHash(base), toolSchemaHash(reordered));
  assert.notEqual(toolSchemaHash(base), toolSchemaHash({ inputSchema: { type: "object" } }));
  // description changes must NOT affect the schema hash
  assert.equal(toolSchemaHash({ ...base, description: "x" } as never), toolSchemaHash(base));
});
