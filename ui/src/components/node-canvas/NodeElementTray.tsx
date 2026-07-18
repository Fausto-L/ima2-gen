import { useEffect, useState, type DragEvent } from "react";
import { elementPreviewPath, loadAllElementAssets } from "../../lib/elementMembership";
import { NODE_ELEMENT_MIME, type ElementDropPayload } from "../../lib/nodeStudioGraph";
import type { AssetItem } from "../../store/storeTypes";

export interface NodeElementTrayProps {
  disabled?: boolean;
  onAdd(element: AssetItem): void | Promise<void>;
}

function payloadFor(elementId: string): ElementDropPayload {
  return { version: 1, assetKind: "element", elementId };
}

function onDragStart(event: DragEvent<HTMLElement>, element: AssetItem): void {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(NODE_ELEMENT_MIME, JSON.stringify(payloadFor(element.id)));
}

export function NodeElementTray({ disabled = false, onAdd }: NodeElementTrayProps) {
  const [elements, setElements] = useState<AssetItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await loadAllElementAssets();
        if (active) { setElements(loaded); setState("ready"); }
      } catch {
        if (active) setState("error");
      }
    })();
    return () => { active = false; };
  }, []);

  return <aside className="node-element-tray" aria-label="Element nodes">
    <header><strong>Elements</strong><span>Drag or add</span></header>
    {state === "loading" ? <p role="status">Loading elements…</p> : null}
    {state === "error" ? <p role="alert">Elements could not be loaded.</p> : null}
    {state === "ready" && elements.length === 0 ? <p>No saved elements yet.</p> : null}
    <div className="node-element-tray__list">
      {elements.map((element) => {
        const preview = elementPreviewPath(element);
        return <article key={element.id} className="node-element-tray__item" draggable={!disabled} onDragStart={(event) => onDragStart(event, element)}>
          {preview ? <img src={`/generated/${preview.split("/").map(encodeURIComponent).join("/")}`} alt="" /> : <span className="node-element-tray__placeholder" aria-hidden="true" />}
          <span title={element.name}>{element.name}</span>
          <button type="button" disabled={disabled} onClick={() => void onAdd(element)}>Add to canvas</button>
        </article>;
      })}
    </div>
  </aside>;
}
