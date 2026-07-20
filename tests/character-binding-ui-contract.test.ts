// wp4 045: character binding UI helpers + MCP payload contract.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bindingDrift,
  bindingRefsCapExceeded,
  characterSlotEligible,
  resolveCharacterConflict,
} from "../ui/src/lib/characterBinding.ts";
import { buildMcpGenerationInput } from "../ui/src/lib/mcpSelection.ts";

describe("character slot eligibility (capabilities gate)", () => {
  it("is eligible only when image_references is declared", () => {
    assert.equal(characterSlotEligible(["start_image", "image_references"]), true);
    assert.equal(characterSlotEligible(["start_image"]), false);
    assert.equal(characterSlotEligible([]), false);
    assert.equal(characterSlotEligible(undefined), false);
  });
});

describe("character/mention conflict rule (server 409 mirror)", () => {
  it("conflicts only when both mentions and a character binding are present", () => {
    assert.equal(resolveCharacterConflict({ mentionElementIds: ["e1"], characterElementId: "c1" }), "conflict");
    assert.equal(resolveCharacterConflict({ mentionElementIds: ["e1"] }), "ok");
    assert.equal(resolveCharacterConflict({ mentionElementIds: [], characterElementId: "c1" }), "ok");
    assert.equal(resolveCharacterConflict({ mentionElementIds: [] }), "ok");
  });
});

describe("bindingDrift front mirror (same matrix as server 042 test 6)", () => {
  const trained = {
    provider: "higgsfield" as const,
    mode: "trained-id" as const,
    externalId: "soul_1",
    trainedFromRefs: ["ref1.png", "ref2.png"],
  };
  it("fires only for trained-id bindings whose snapshot differs", () => {
    assert.equal(bindingDrift(["ref1.png", "ref3.png"], trained), true);
    assert.equal(bindingDrift(["ref1.png"], trained), true);
    assert.equal(bindingDrift(["ref1.png", "ref2.png"], trained), false);
    assert.equal(bindingDrift(["ref1.png"], { provider: "runway", mode: "stateless-refs" }), false);
  });
});

describe("runway refs cap warning", () => {
  it("warns above 3 refs", () => {
    assert.equal(bindingRefsCapExceeded(["a", "b", "c", "d"]), true);
    assert.equal(bindingRefsCapExceeded(["a", "b", "c"]), false);
  });
});

describe("buildMcpGenerationInput characterElementId passthrough", () => {
  const base = {
    mcpProvider: "runway",
    mcpModel: "gen4_turbo",
    mcpMediaKind: "image" as const,
    mcpInputRoles: ["image_references"],
  };
  it("includes characterElementId when set", () => {
    const input = buildMcpGenerationInput({ ...base, mcpCharacterElementId: "a_char1" }, "hero walking");
    assert.equal(input?.characterElementId, "a_char1");
  });
  it("omits characterElementId when null", () => {
    const input = buildMcpGenerationInput({ ...base, mcpCharacterElementId: null }, "hero walking");
    assert.equal(input && "characterElementId" in input, false);
  });
});
