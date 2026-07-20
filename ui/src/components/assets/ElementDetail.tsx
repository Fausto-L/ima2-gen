import { useEffect, useMemo, useState } from "react";
import { Segmented } from "../controls/Segmented";
import { ElementRefGrid, type ElementRefDraft } from "./ElementRefGrid";
import { CharacterBindingsCard } from "./CharacterBindingsCard";
import type { CharacterProviderBinding } from "../../lib/characterBinding";
import "../../styles/element-detail.css";

export type ElementKind = "character" | "product" | "style" | "scene";

export interface ElementDefinition {
  id: string;
  name: string;
  kind: ElementKind;
  refs: string[];
  notes?: string;
  defaultStrength?: number;
  characterBindings?: CharacterProviderBinding[];
}

export interface ElementDraft {
  id?: string;
  name: string;
  kind: ElementKind;
  refs: ElementRefDraft[];
  notes: string;
  defaultStrength: number;
}

type Props = {
  element: ElementDefinition | null;
  saving: boolean;
  testing: boolean;
  onSave: (draft: ElementDraft) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onRunTestSheet: (id: string) => Promise<void>;
  onSaveBindings?: (id: string, bindings: CharacterProviderBinding[]) => Promise<boolean>;
};

const KIND_HELP: Record<ElementKind, string> = { character: "A person or recurring subject.", product: "A product with consistent design details.", style: "A visual language, material, or treatment.", scene: "A place, setting, or recurring environment." };
const KIND_ITEMS = (Object.keys(KIND_HELP) as ElementKind[]).map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));

function toDraft(element: ElementDefinition | null): ElementDraft {
  return { id: element?.id, name: element?.name ?? "", kind: element?.kind ?? "character", refs: (element?.refs ?? []).filter((p) => typeof p === "string" && p.length > 0).map((path, index) => ({ id: `${element?.id ?? "new"}-${index}-${path}`, path, previewUrl: `/generated/${path.split("/").map(encodeURIComponent).join("/")}`, alt: "" })), notes: element?.notes ?? "", defaultStrength: element?.defaultStrength ?? 0.75 };
}

export function ElementDetail({ element, saving, testing, onSave, onDelete, onRunTestSheet, onSaveBindings }: Props) {
  const [draft, setDraft] = useState<ElementDraft>(() => toDraft(element));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(toDraft(element)); setError(null); }, [element]);
  const remaining = 800 - draft.notes.length;
  const notePreview = useMemo(() => draft.notes.trim() ? `[Element: ${draft.name.trim() || "Untitled"}] ${draft.notes.trim()}` : null, [draft.name, draft.notes]);
  const update = <K extends keyof ElementDraft>(key: K, value: ElementDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!draft.name.trim()) return setError("Name your element before saving.");
    if (!draft.refs.length) return setError("Add at least one reference image before saving.");
    setError(null);
    await onSave({ ...draft, name: draft.name.trim(), notes: draft.notes.trim() ? draft.notes : "" });
  };

  return <aside className="element-detail" aria-label="Element details">
    <header className="element-detail__header"><div><span>Element</span><h2>{element ? "Edit element" : "New element"}</h2></div>{element ? <span className="element-detail__status">Saved</span> : null}</header>
    <label className="element-detail__field">Name<input value={draft.name} maxLength={120} placeholder="e.g. Walnut chair" onChange={(event) => update("name", event.target.value)} /></label>
    <Segmented<ElementKind> title="Kind" items={KIND_ITEMS} value={draft.kind} onChange={(kind) => update("kind", kind)} />
    <p className="element-detail__kind-help">{KIND_HELP[draft.kind]}</p>
    <ElementRefGrid refs={draft.refs} onChange={(refs) => update("refs", refs)} maxRefs={6} />
    {element && draft.kind === "character" && onSaveBindings ? (
      <CharacterBindingsCard
        bindings={element.characterBindings ?? []}
        refs={element.refs}
        onSave={(bindings) => onSaveBindings(element.id, bindings)}
      />
    ) : null}
    <section className="element-detail__section"><div className="element-detail__section-heading"><div><h3>Notes</h3><p>Describe appearance, materials, and details that should stay consistent.</p></div>{remaining <= 100 ? <span>{remaining} remaining</span> : null}</div><textarea value={draft.notes} maxLength={800} rows={6} placeholder="Warm walnut grain, rounded edges, woven cane seat…" onChange={(event) => update("notes", event.target.value)} />{notePreview ? <p className="element-detail__note-preview">{notePreview}</p> : null}</section>
    <section className="element-detail__section"><div className="element-detail__section-heading"><div><h3>Reference strength</h3><p>How strongly generated work should follow these references.</p></div><output>{draft.defaultStrength.toFixed(2)}</output></div><input className="element-detail__strength" type="range" min="0" max="1" step="0.05" value={draft.defaultStrength} onChange={(event) => update("defaultStrength", Number(event.target.value))} /><button type="button" className="element-detail__reset" onClick={() => update("defaultStrength", 0.75)}>Reset to default</button></section>
    {error ? <p className="element-detail__error" role="alert">{error}</p> : null}
    <footer className="element-detail__actions"><button type="button" className="element-detail__save" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save element"}</button><button type="button" disabled={!element || testing} onClick={() => element && void onRunTestSheet(element.id)}>{testing ? "Generating test sheet…" : "Run test sheet"}</button>{element && onDelete ? <button type="button" className="is-danger" onClick={() => void onDelete(element.id)}>Delete</button> : null}</footer>
  </aside>;
}
