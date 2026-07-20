// Character provider bindings (wp4 042): element.meta.characterBindings validation,
// refs preservation guard, and drift detection. Kept out of assetsStore.ts to hold
// the <500-line file convention. Errors carry the same {status, code} shape the
// route layer maps (storeError-compatible).

export const CHARACTER_BINDING_PROVIDERS = ["runway", "higgsfield"] as const;
export type CharacterBindingProvider = (typeof CHARACTER_BINDING_PROVIDERS)[number];
export const CHARACTER_BINDING_MODES = ["stateless-refs", "trained-id"] as const;
export type CharacterBindingMode = (typeof CHARACTER_BINDING_MODES)[number];
export type CharacterBindingStatus = "ready" | "training" | "failed";

export type CharacterProviderBinding = {
  provider: CharacterBindingProvider;
  mode: CharacterBindingMode;
  externalId?: string;
  tag?: string;
  status?: CharacterBindingStatus;
  trainedAt?: string;
  trainedFromRefs?: string[];
};

const CHARACTER_BINDING_TAG_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function bindingError(status: number, code: string, message: string): Error {
  const err = new Error(message) as Error & { status: number; code: string };
  err.status = status;
  err.code = code;
  return err;
}

export function assertCharacterBindings(value: unknown, elementKind: string) {
  if (elementKind !== "character") {
    throw bindingError(400, "INVALID_ELEMENT_METADATA", "characterBindings require elementKind=character");
  }
  if (!Array.isArray(value) || value.length > 2) {
    throw bindingError(400, "INVALID_ELEMENT_METADATA", "characterBindings must be an array of at most 2 entries");
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "characterBindings entries must be objects");
    }
    const binding = entry as Record<string, unknown>;
    if (typeof binding.provider !== "string" || !(CHARACTER_BINDING_PROVIDERS as readonly string[]).includes(binding.provider)) {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", `binding provider must be one of ${CHARACTER_BINDING_PROVIDERS.join("|")}`);
    }
    if (seen.has(binding.provider)) {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", `duplicate binding for provider ${binding.provider}`);
    }
    seen.add(binding.provider);
    if (typeof binding.mode !== "string" || !(CHARACTER_BINDING_MODES as readonly string[]).includes(binding.mode)) {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", `binding mode must be one of ${CHARACTER_BINDING_MODES.join("|")}`);
    }
    if (binding.provider === "runway" && binding.mode !== "stateless-refs") {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "runway bindings must use mode stateless-refs");
    }
    if (binding.provider === "higgsfield" && binding.mode !== "trained-id") {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "higgsfield bindings must use mode trained-id");
    }
    if (binding.externalId !== undefined && typeof binding.externalId !== "string") {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "binding externalId must be a string");
    }
    if (binding.tag !== undefined && (typeof binding.tag !== "string" || !CHARACTER_BINDING_TAG_PATTERN.test(binding.tag))) {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "binding tag must be 1-32 letters, numbers, underscores, or hyphens");
    }
    if (binding.status !== undefined && !["ready", "training", "failed"].includes(binding.status as string)) {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "binding status must be ready|training|failed");
    }
    if (binding.trainedAt !== undefined && typeof binding.trainedAt !== "string") {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "binding trainedAt must be a string");
    }
    if (binding.trainedFromRefs !== undefined
      && (!Array.isArray(binding.trainedFromRefs) || binding.trainedFromRefs.length > 6
        || binding.trainedFromRefs.some((ref) => typeof ref !== "string"))) {
      throw bindingError(400, "INVALID_ELEMENT_METADATA", "binding trainedFromRefs must be an array of up to 6 file paths");
    }
  }
}

/** Character bindings reference the element itself (not individual refs), so while
 *  any binding exists the full refs list is binding-referenced (041 invariant 1). */
export function bindingsOf(metadata: Record<string, unknown> | null): CharacterProviderBinding[] {
  const bindings = metadata?.characterBindings;
  return Array.isArray(bindings) ? (bindings as CharacterProviderBinding[]) : [];
}

/** Drift check (041 invariant 2): trained-id bindings drift when the current refs
 *  differ from the snapshot recorded at train time. Stateless bindings never drift. */
export function bindingDrift(currentRefs: string[], binding: CharacterProviderBinding): boolean {
  if (binding.mode !== "trained-id" || !Array.isArray(binding.trainedFromRefs)) return false;
  if (binding.trainedFromRefs.length !== currentRefs.length) return true;
  return binding.trainedFromRefs.some((ref, index) => currentRefs[index] !== ref);
}

/** Refs preservation guard (041 invariant 1): while any character binding exists,
 *  removing refs is rejected with 409 — removal requires an explicit unlink
 *  (dropping/changing characterBindings in the same patch). Comparison is a raw
 *  string set-difference, so reorders and additions pass while dedupe/rename/
 *  asset-move count as removal. */
export function assertRefsPreservedForBindings(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown> | null,
) {
  if (bindingsOf(previous).length === 0 || bindingsOf(next).length === 0) return;
  const oldRefs = Array.isArray(previous?.refs) ? (previous?.refs as string[]) : [];
  const newRefs = Array.isArray(next?.refs) ? (next?.refs as string[]) : [];
  const removed = oldRefs.filter((ref) => !newRefs.includes(ref));
  if (removed.length > 0) {
    throw bindingError(409, "REFS_BOUND_TO_CHARACTER", "remove the character binding first (unlink)");
  }
}
