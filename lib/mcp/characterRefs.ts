// Character provider binding resolution for /api/mcp/generate (wp4 043):
// loads the character element, validates its provider binding, and expands
// the binding refs into upload-ready {filename, tag} entries. Never trims
// refs (041 invariant 3) — caps are hard errors.
import { getElementById } from "../assetsStore.js";
import { bindingsOf } from "../characterBindings.js";

export type CharacterRefsResolution =
  | { ok: true; refs: Array<{ filename: string; tag?: string }> }
  | { ok: false; status: number; code: string; message: string; fix?: string[] };

export function resolveCharacterBindingRefs(characterElementId: string, provider: string): CharacterRefsResolution {
  const element = getElementById(characterElementId);
  const elementMeta = element?.metadata ?? null;
  if (!element || (elementMeta as { elementKind?: unknown } | null)?.elementKind !== "character") {
    return { ok: false, status: 400, code: "CHARACTER_ELEMENT_NOT_FOUND", message: "character element not found" };
  }
  const binding = bindingsOf(elementMeta).find((entry) => entry.provider === provider);
  if (!binding) {
    return { ok: false, status: 400, code: "CHARACTER_BINDING_MISSING",
      message: `no ${provider} binding on the character element`,
      fix: ["add a provider binding in the assets workspace element detail"] };
  }
  if (binding.mode === "trained-id" && (binding.status === "training" || binding.status === "failed")) {
    return { ok: false, status: 409, code: "BINDING_NOT_READY",
      message: `character binding is ${binding.status}`,
      fix: ["wait for training to finish or retrain"] };
  }
  const bindingRefs = Array.isArray((elementMeta as { refs?: unknown } | null)?.refs)
    ? (elementMeta as { refs: string[] }).refs : [];
  if (bindingRefs.length > 3) {
    return { ok: false, status: 400, code: "CHARACTER_REFS_EXCEED_PROVIDER_CAP",
      message: "character binding refs exceed the 3-reference provider cap",
      fix: ["reduce the character element refs to 3 or fewer"] };
  }
  return {
    ok: true,
    refs: bindingRefs.map((ref) => ({ filename: ref, ...(binding.tag ? { tag: binding.tag } : {}) })),
  };
}
