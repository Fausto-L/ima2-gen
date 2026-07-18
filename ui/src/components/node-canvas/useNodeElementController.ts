import { useCallback, type DragEvent, type RefObject } from "react";
import { getAssetById } from "../../lib/api-assets";
import {
  buildElementReferenceNode,
  commitGraphSnapshot,
  NODE_ELEMENT_MIME,
  parseElementDropPayload,
} from "../../lib/nodeStudioGraph";
import type { AssetItem, GraphEdge, GraphNode } from "../../store/useAppStore";
import { useI18n } from "../../i18n";

type Options = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  wrapperRef: RefObject<HTMLElement | null>;
  screenToFlowPosition(point: { x: number; y: number }): { x: number; y: number };
  showToast(message: string, error?: boolean): void;
};

export function useNodeElementController(options: Options) {
  const { t } = useI18n();
  const addElementAt = useCallback(async (elementId: string, position: { x: number; y: number }) => {
    try {
      const latest = await getAssetById(elementId);
      const node = buildElementReferenceNode(latest.asset, position);
      if (!node) { options.showToast(t("nodeStudio.elementController.onlyElements"), true); return; }
      const next = { nodes: [...options.nodes, node], edges: options.edges };
      if (!commitGraphSnapshot({ ...next, reason: "element-drop" })) options.showToast(t("nodeStudio.elementController.invalid"), true);
    } catch { options.showToast(t("nodeStudio.elementController.addError"), true); }
  }, [options, t]);
  const addElement = useCallback(async (asset: AssetItem) => {
    const rect = options.wrapperRef.current?.getBoundingClientRect();
    const point = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 320, y: 240 };
    try { await addElementAt(asset.id, options.screenToFlowPosition(point)); }
    catch { options.showToast(t("nodeStudio.elementController.addError"), true); }
  }, [addElementAt, options, t]);
  const onDropElement = useCallback(async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const payload = parseElementDropPayload(event.dataTransfer.getData(NODE_ELEMENT_MIME));
    if (!payload) return;
    try { await addElementAt(payload.elementId, options.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }
    catch { options.showToast(t("nodeStudio.elementController.addError"), true); }
  }, [addElementAt, options, t]);
  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(NODE_ELEMENT_MIME)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "copy";
  }, []);
  return { addElement, onDropElement, onDragOver };
}
