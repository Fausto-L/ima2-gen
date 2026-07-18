import { memo, useCallback, type CSSProperties } from "react";
import { Handle, Position, type Node as FlowNode, type NodeProps } from "@xyflow/react";
import { useI18n } from "../../i18n";

export type ElementReferenceNodeData = Record<string, unknown> & {
  nodeType: "element-reference";
  elementId: string | null;
  elementName?: string;
  thumbnailUrl?: string | null;
  refCount: number;
  notesPreview?: string;
  missing: boolean;
  compact?: boolean;
  onOpenAssets?(elementId: string): void;
};

type ElementReferenceFlowNode = FlowNode<ElementReferenceNodeData, "elementReferenceNode">;

function ElementReferenceNodeImpl({ data, selected }: NodeProps<ElementReferenceFlowNode>) {
  const { t } = useI18n();
  const openAssets = useCallback(() => {
    if (!data.elementId) return;
    if (data.onOpenAssets) data.onOpenAssets(data.elementId);
    else window.dispatchEvent(new CustomEvent("ima2:open-assets-detail", { detail: { assetId: data.elementId } }));
  }, [data]);
  const title = data.elementName ?? t("nodeStudio.elementNode.untitled");
  return <div className={`element-reference-node${selected ? " is-selected" : ""}${data.missing ? " is-missing" : ""}${data.compact ? " is-compact" : ""}`} onDoubleClick={openAssets} style={{ "--element-thumb": data.thumbnailUrl ? `url(${JSON.stringify(data.thumbnailUrl)})` : "none" } as CSSProperties}>
    <Handle type="source" id="refs" position={Position.Right} className="element-reference-node__handle element-reference-node__handle--refs" aria-label={t("nodeStudio.elementNode.referencesOutput")} />
    <Handle type="source" id="notes" position={Position.Bottom} className="element-reference-node__handle element-reference-node__handle--notes" aria-label={t("nodeStudio.elementNode.notesOutput")} />
    <div className="element-reference-node__header"><span className="element-reference-node__kind">{t("nodeStudio.elementNode.kind")}</span><strong>{title}</strong></div>
    <div className="element-reference-node__body"><div className="element-reference-node__thumbnail" aria-hidden="true" />{!data.compact ? <div><span className="element-reference-node__ref-count">{t(data.refCount === 1 ? "nodeStudio.elementNode.referenceCountOne" : "nodeStudio.elementNode.referenceCount", { count: data.refCount })}</span>{data.notesPreview ? <p>{data.notesPreview}</p> : null}</div> : null}</div>
    {data.missing ? <p className="element-reference-node__warning" role="alert">{t("nodeStudio.elementNode.missing")}</p> : null}
  </div>;
}

export const ElementReferenceNode = memo(ElementReferenceNodeImpl);
