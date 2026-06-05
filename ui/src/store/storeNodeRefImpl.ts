import type { ClientNodeId } from "../lib/graph";
import { compressToBase64, isHeic, hasAlphaChannel } from "../lib/compress";
import {
  clearNodeRefs as clearStoredNodeRefs,
  saveNodeRefs,
} from "../lib/nodeRefStorage";
import { t } from "../i18n";
import { MAX_REFERENCE_IMAGES } from "./storeHelpers";
import type { StoreSet, StoreGet } from "./storeTypes";

export async function addNodeReferencesImpl(
  clientId: ClientNodeId,
  files: File[],
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const node = get().graphNodes.find((n) => n.id === clientId);
  if (!node) return;
  const currentRefs = node.data.referenceImages ?? [];
  const allowed = MAX_REFERENCE_IMAGES - currentRefs.length;
  if (allowed <= 0) {
    get().showToast(t("toast.refLimitExceeded"), true);
    return;
  }
  const toAdd = files.slice(0, Math.max(0, allowed));
  const heicSkipped = toAdd.filter(isHeic);
  const usable = toAdd.filter((f) => !isHeic(f));
  const results = await Promise.all(
    usable.map(async (f) => {
      try {
        return await compressToBase64(f, {
          preserveTransparency: hasAlphaChannel(f),
        });
      } catch (err) {
        console.warn("[addNodeReferences] compress failed", err);
        return null;
      }
    }),
  );
  const valid = results.filter((x): x is string => !!x);
  if (valid.length > 0) {
    const sessionId = get().activeSessionId;
    set({
      graphNodes: get().graphNodes.map((n) => {
        if (n.id !== clientId) return n;
        const refs = [
          ...(n.data.referenceImages ?? []),
          ...valid,
        ].slice(0, MAX_REFERENCE_IMAGES);
        saveNodeRefs(sessionId, clientId, refs);
        return {
          ...n,
          data: { ...n.data, referenceImages: refs },
        };
      }),
    });
    get().scheduleGraphSave();
  }
  if (heicSkipped.length > 0) get().showToast(t("toast.refHeicUnsupported"), true);
  if (usable.length - valid.length > 0) get().showToast(t("toast.refTooLarge"), true);
  if (files.length > allowed) get().showToast(t("toast.refLimitExceeded"), true);
}

export function addNodeReferenceDataUrlImpl(
  clientId: ClientNodeId,
  dataUrl: string,
  set: StoreSet,
  get: StoreGet,
): void {
  const node = get().graphNodes.find((n) => n.id === clientId);
  if (!node) return;
  set({
    graphNodes: get().graphNodes.map((n) => {
      if (n.id !== clientId) return n;
      const refs = n.data.referenceImages ?? [];
      if (refs.length >= MAX_REFERENCE_IMAGES) return n;
      const nextRefs = [...refs, dataUrl];
      saveNodeRefs(get().activeSessionId, clientId, nextRefs);
      return { ...n, data: { ...n.data, referenceImages: nextRefs } };
    }),
  });
  get().scheduleGraphSave();
}

export function removeNodeReferenceImpl(
  clientId: ClientNodeId,
  index: number,
  set: StoreSet,
  get: StoreGet,
): void {
  set({
    graphNodes: get().graphNodes.map((n) => {
      if (n.id !== clientId) return n;
      const refs = (n.data.referenceImages ?? []).filter((_, i) => i !== index);
      saveNodeRefs(get().activeSessionId, clientId, refs);
      return { ...n, data: { ...n.data, referenceImages: refs } };
    }),
  });
  get().scheduleGraphSave();
}

export function clearNodeReferencesImpl(
  clientId: ClientNodeId,
  set: StoreSet,
  get: StoreGet,
): void {
  clearStoredNodeRefs(get().activeSessionId, clientId);
  set({
    graphNodes: get().graphNodes.map((n) =>
      n.id === clientId
        ? { ...n, data: { ...n.data, referenceImages: undefined } }
        : n,
    ),
  });
  get().scheduleGraphSave();
}
