// WP2 (020): contract catalog SoT — projection regression + snapshot mapping.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENT_TOOL_MANIFEST, formatToolManifestForPrompt } from "../lib/agentToolManifest.js";
import { buildCatalog, catalogSummary, snapshotToContracts } from "../lib/contracts/catalog.js";
import { BUILTIN_TOOL_CONTRACTS } from "../lib/contracts/builtins.js";
import type { SnapshotSource } from "../lib/contracts/types.js";

const manifestSnapshot = JSON.parse(readFileSync("tests/fixtures/contracts/agent-manifest.snapshot.json", "utf8")) as {
  manifest: unknown;
  prompt: string;
};
const runwaySource = JSON.parse(readFileSync("tests/fixtures/mcp/runway-tools.sanitized.json", "utf8")) as SnapshotSource;

test("AGENT_TOOL_MANIFEST projection is byte-identical to the pre-migration snapshot", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(AGENT_TOOL_MANIFEST)), manifestSnapshot.manifest);
  assert.equal(formatToolManifestForPrompt(), manifestSnapshot.prompt);
});

test("builtin contracts carry catalog invariants", () => {
  for (const contract of BUILTIN_TOOL_CONTRACTS) {
    assert.equal(contract.namespace, "ima2");
    assert.equal(contract.trust, "builtin");
    assert.equal(contract.executionOwner, "ima2-server");
    assert.equal(contract.id, contract.name);
  }
});

test("snapshotToContracts mirrors the runway fixture into mcp.runway.*", () => {
  const contracts = snapshotToContracts(runwaySource);
  assert.equal(contracts.length, 14);
  for (const contract of contracts) {
    assert.match(contract.id, /^mcp\.runway\./);
    assert.equal(contract.namespace, "mcp.runway");
    assert.equal(contract.trust, "upstream-untrusted");
    assert.equal(contract.availability.state, "documented");
    assert.equal(contract.provenance?.provider, "runway");
    assert.ok(contract.inputSchema);
  }
  const names = contracts.map((c) => c.name);
  for (const expected of ["generate_image", "generate_video", "edit_video", "upscale_video", "get_task"]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

test("buildCatalog merges builtins + snapshots and rejects duplicate ids", () => {
  const catalog = buildCatalog({ snapshots: [runwaySource] });
  assert.equal(catalog.length, BUILTIN_TOOL_CONTRACTS.length + 14);
  assert.throws(() => buildCatalog({ snapshots: [runwaySource, runwaySource] }), /duplicate tool contract id/);
});

test("catalogSummary reports namespace/availability distribution", () => {
  const summary = catalogSummary(buildCatalog({ snapshots: [runwaySource] }));
  assert.equal(summary.total, BUILTIN_TOOL_CONTRACTS.length + 14);
  assert.equal(summary.namespaces["ima2"].byAvailability["callable"], BUILTIN_TOOL_CONTRACTS.length);
  assert.equal(summary.namespaces["mcp.runway"].byAvailability["documented"], 14);
});
