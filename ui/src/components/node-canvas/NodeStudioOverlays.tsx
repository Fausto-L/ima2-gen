import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Panel } from "@xyflow/react";
import type { useNodeStudioController } from "./useNodeStudioController";
import { NodeBranchDialog } from "./NodeBranchDialog";
import { NodeCommandPalette } from "./NodeCommandPalette";
import { NodeElementTray } from "./NodeElementTray";
import { NodeTemplatePicker } from "./NodeTemplatePicker";

type StudioController = ReturnType<typeof useNodeStudioController>;

export interface NodeStudioOverlaysProps {
  studio: StudioController;
  graphEmpty: boolean;
  disabled: boolean;
  onAddRoot(): void;
}

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")];
}

function DialogFrame({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab" || !ref.current) return;
    const items = focusable(ref.current);
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div ref={ref} className="node-studio-dialog-backdrop" onKeyDown={onKeyDown} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>{children}</div>;
}

export function NodeStudioOverlays({ studio, graphEmpty, disabled, onAddRoot }: NodeStudioOverlaysProps) {
  return <>
    <Panel position="top-right" className="node-studio-toolbar">
      <button type="button" disabled={disabled} onClick={onAddRoot}>Add image</button>
      <button type="button" disabled={disabled} onClick={studio.openTemplates}>Templates</button>
      <button type="button" disabled={disabled || graphEmpty} onClick={studio.saveTemplate}>Save template</button>
      <button type="button" disabled={disabled || !studio.selectedSource} onClick={studio.openBranch}>Branch</button>
    </Panel>
    <Panel position="top-left" className="node-studio-element-panel">
      <NodeElementTray disabled={disabled} onAdd={studio.addElement} />
    </Panel>
    <NodeCommandPalette open={Boolean(studio.palette)} anchor={studio.palette?.anchor ?? { clientX: 0, clientY: 0 }} sourcePort={studio.palette?.sourcePort} commands={studio.commands} onInsert={studio.insertCommand} onClose={studio.closePalette} />
    {studio.templateOpen ? <DialogFrame onClose={studio.closeOverlays}><NodeTemplatePicker templates={studio.templates} loading={studio.templateLoading} error={studio.templateError} onCopy={studio.copyTemplate} onRename={studio.renameTemplate} onDelete={studio.removeTemplate} onClose={studio.closeOverlays} /></DialogFrame> : null}
    {studio.branchOpen && studio.selectedSource ? <DialogFrame onClose={studio.closeOverlays}><div role="dialog" aria-modal="true" aria-labelledby="node-branch-dialog-title"><NodeBranchDialog sourceLabel={studio.selectedSource.data.prompt || studio.selectedSource.id} onApply={studio.applyBranch} onClose={studio.closeOverlays} /></div></DialogFrame> : null}
    <div className="node-studio-status" role="status" aria-live="polite" aria-atomic="true">{studio.status}</div>
  </>;
}
