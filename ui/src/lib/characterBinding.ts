// Character provider binding helpers (wp4 045) — front mirror of
// lib/characterBindings.ts. Dual-implementation note: if the drift rule
// changes, change BOTH sides and keep the test matrices identical.

export type CharacterProviderBinding = {
  provider: "runway" | "higgsfield";
  mode: "stateless-refs" | "trained-id";
  externalId?: string;
  tag?: string;
  status?: "ready" | "training" | "failed";
  trainedAt?: string;
  trainedFromRefs?: string[];
};

/** Character slot is only offered when the selected MCP model declares the
 *  image_references input role (capabilities contract gate, 041 decision 4). */
export function characterSlotEligible(inputRoles: readonly string[] | undefined): boolean {
  return Array.isArray(inputRoles) && inputRoles.includes("image_references");
}

/** Client-side mirror of the server 409 rule (043): element mentions and a
 *  character binding never mix in one request. */
export function resolveCharacterConflict(args: {
  mentionElementIds: readonly string[];
  characterElementId?: string | null;
}): "ok" | "conflict" {
  return args.mentionElementIds.length > 0 && args.characterElementId ? "conflict" : "ok";
}

/** Same rule as the server's bindingDrift — trained-id bindings drift when
 *  current refs differ from the train-time snapshot. */
export function bindingDrift(refs: readonly string[], binding: CharacterProviderBinding): boolean {
  if (binding.mode !== "trained-id" || !Array.isArray(binding.trainedFromRefs)) return false;
  if (binding.trainedFromRefs.length !== refs.length) return true;
  return binding.trainedFromRefs.some((ref, index) => refs[index] !== ref);
}

/** Runway cap warning: bindings expand refs per generation, and more than 3
 *  refs is a hard server error (never trimmed — 041 invariant 3). */
export function bindingRefsCapExceeded(refs: readonly string[]): boolean {
  return refs.length > 3;
}
