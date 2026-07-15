// WP7 (070): discovery pure functions — envelope, versioning, promotion, bindings.
import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog } from "../lib/contracts/catalog.js";
import {
  buildToolShow,
  catalogVersion,
  errorEnvelope,
  executionBindingFor,
  okEnvelope,
  promoteAvailability,
} from "../lib/contracts/discovery.js";
import { readFileSync } from "node:fs";
import type { SnapshotSource } from "../lib/contracts/types.js";

const runwaySource = JSON.parse(readFileSync("assets/mcp-snapshots/runway.sanitized.json", "utf8")) as SnapshotSource;
const entries = buildCatalog({ snapshots: [runwaySource] });
const meta = { catalogVersion: catalogVersion(entries), cliVersion: "test" };

test("envelopes carry the full versioned contract on success and error", () => {
  const ok = okEnvelope({ x: 1 }, meta);
  assert.equal(ok.ok, true);
  assert.equal(ok.schemaVersion, 1);
  assert.equal(ok.cliVersion, "test");
  assert.match(ok.requestId, /^disc_/);
  const bad = errorEnvelope("auth_required", "connect first", meta);
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "auth_required");
  assert.equal(bad.error.retryable, false);
  assert.equal(bad.schemaVersion, 1);
});

test("catalogVersion is deterministic and changes with the entry set", () => {
  assert.equal(catalogVersion(entries), catalogVersion([...entries]));
  assert.notEqual(catalogVersion(entries), catalogVersion(entries.slice(0, 3)));
});

const mcpEntry = entries.find((e) => e.id === "mcp.runway.generate_image")!;

test("promotion truth table: documented stays without live evidence", () => {
  assert.equal(promoteAvailability(mcpEntry, undefined).state, "documented");
  assert.equal(promoteAvailability(mcpEntry, { state: "auth_required" }).state, "documented");
});

test("connected without post-connect ingest evidence never becomes callable", () => {
  const availability = promoteAvailability(mcpEntry, { state: "connected", connectedAt: "2026-07-16T10:00:00Z" });
  assert.equal(availability.state, "connected");
  const staleIngest = promoteAvailability(mcpEntry, {
    state: "connected", connectedAt: "2026-07-16T10:00:00Z",
    snapshotFetchedAt: "2026-07-16T09:00:00Z", snapshotToolNames: ["generate_image"],
  });
  assert.equal(staleIngest.state, "connected");
});

test("fresh ingest promotes: present->callable, drifted->stale, absent->blocked(entitlement)", () => {
  const base = { state: "connected", connectedAt: "2026-07-16T10:00:00Z", snapshotFetchedAt: "2026-07-16T10:05:00Z" };
  assert.equal(promoteAvailability(mcpEntry, { ...base, snapshotToolNames: ["generate_image"] }).state, "callable");
  assert.equal(promoteAvailability(mcpEntry, { ...base, snapshotToolNames: ["generate_image"], driftedTools: ["generate_image"] }).state, "stale");
  const blocked = promoteAvailability(mcpEntry, { ...base, snapshotToolNames: ["other_tool"] });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.cause, "entitlement");
});

test("execution bindings: generate->mcp-generate, upscale->media-action, others unbound", () => {
  assert.equal(executionBindingFor(mcpEntry)?.binding, "mcp-generate");
  const upscale = entries.find((e) => e.id === "mcp.runway.upscale_video")!;
  assert.equal(executionBindingFor(upscale)?.binding, "mcp-media-action");
  const whoami = entries.find((e) => e.id === "mcp.runway.whoami")!;
  assert.equal(executionBindingFor(whoami), null);
  const builtin = entries.find((e) => e.namespace === "ima2")!;
  assert.equal(executionBindingFor(builtin), null);
});

test("buildToolShow attaches execution + promoted availability", () => {
  const shown = buildToolShow(mcpEntry, { runway: { state: "connected", connectedAt: "2026-07-16T10:00:00Z", snapshotFetchedAt: "2026-07-16T10:05:00Z", snapshotToolNames: ["generate_image"] } });
  assert.equal(shown.availability.state, "callable");
  assert.equal((shown.execution as { binding: string }).binding, "mcp-generate");
  const inputContract = (shown.execution as unknown as { inputContract: { required: string[] } }).inputContract;
  assert.ok(inputContract.required.includes("prompt"));
});
