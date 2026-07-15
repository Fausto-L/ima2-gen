// WP3 (030): MCP token store — atomic 0600 writes, corrupt recovery, id guard.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteTokenRecord, readTokenRecord, writeTokenRecord } from "../lib/mcp/tokenStore.js";

const dir = mkdtempSync(join(tmpdir(), "ima2-mcp-tokens-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("write/read roundtrip preserves the record", () => {
  writeTokenRecord(dir, "runway", { tokens: { access_token: "secret" }, origin: "http://localhost:3333" });
  const record = readTokenRecord(dir, "runway");
  assert.equal((record?.tokens as Record<string, unknown>).access_token, "secret");
  assert.equal(record?.origin, "http://localhost:3333");
});

test("token files land with 0600 permissions and no tmp residue", () => {
  writeTokenRecord(dir, "higgsfield", { codeVerifier: "v" });
  const mode = statSync(join(dir, "higgsfield.json")).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.equal(readdirSync(dir).filter((f) => f.includes(".tmp-")).length, 0);
});

test("corrupt file reads as null and is not overwritten by the read", () => {
  writeFileSync(join(dir, "corrupt.json"), "{not json");
  assert.equal(readTokenRecord(dir, "corrupt"), null);
  assert.equal(readdirSync(dir).includes("corrupt.json"), true);
});

test("path-traversal provider ids are rejected", () => {
  assert.throws(() => readTokenRecord(dir, "../evil"), /MCP_PROVIDER_ID_INVALID/);
  assert.throws(() => writeTokenRecord(dir, "a/b", {}), /MCP_PROVIDER_ID_INVALID/);
});

test("delete is idempotent", () => {
  writeTokenRecord(dir, "gone", {});
  deleteTokenRecord(dir, "gone");
  deleteTokenRecord(dir, "gone");
  assert.equal(readTokenRecord(dir, "gone"), null);
});
