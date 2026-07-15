// WP2 (020): availability state machine truth table.
import test from "node:test";
import assert from "node:assert/strict";
import { deriveAvailability, executionDenialFor, isCallable } from "../lib/contracts/availability.js";

const base = { connected: false, liveToolPresent: false, schemaHashMatch: false };

test("documented snapshot alone is never callable", () => {
  const availability = deriveAvailability({ ...base });
  assert.equal(availability.state, "documented");
  assert.equal(availability.cause, "auth_required");
  assert.equal(isCallable({ ...base }), false);
  assert.equal(executionDenialFor(availability), "auth_required");
});

test("installed transport without session stays non-callable", () => {
  const availability = deriveAvailability({ ...base, installed: true });
  assert.equal(availability.state, "installed");
  assert.equal(executionDenialFor(availability), "auth_required");
});

test("connected but tool absent live -> blocked(entitlement), not drift", () => {
  const availability = deriveAvailability({ ...base, connected: true, schemaHashMatch: true });
  assert.equal(availability.state, "blocked");
  assert.equal(availability.cause, "entitlement");
  assert.equal(executionDenialFor(availability), "unavailable");
});

test("connected + present + hash mismatch -> stale locks execution as schema_changed", () => {
  const availability = deriveAvailability({ ...base, connected: true, liveToolPresent: true });
  assert.equal(availability.state, "stale");
  assert.equal(availability.cause, "schema_drift");
  assert.equal(executionDenialFor(availability), "schema_changed");
});

test("callable requires connected AND live-present AND hash match", () => {
  const input = { connected: true, liveToolPresent: true, schemaHashMatch: true };
  assert.equal(isCallable(input), true);
  const availability = deriveAvailability(input, "live tools/list 2026-07-16");
  assert.equal(availability.state, "callable");
  assert.equal(executionDenialFor(availability), null);
  for (const flag of ["connected", "liveToolPresent", "schemaHashMatch"] as const) {
    assert.equal(isCallable({ ...input, [flag]: false }), false, `${flag}=false must not be callable`);
  }
});

test("typed denial causes map to blocked with matching execution error", () => {
  const revoked = deriveAvailability({ ...base, connected: true, liveToolPresent: true, schemaHashMatch: true, deniedCause: "revoked" });
  assert.equal(revoked.state, "blocked");
  assert.equal(executionDenialFor(revoked), "unavailable");
  const auth = deriveAvailability({ ...base, deniedCause: "auth_required" });
  assert.equal(executionDenialFor(auth), "auth_required");
});
