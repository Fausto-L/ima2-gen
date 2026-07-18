import { useRef, useState } from "react";
import type { BranchVariant } from "../../lib/nodeBranching";

type VariantDraft = {
  id: string;
  label: string;
  provider: string;
  model: string;
  size: string;
};

export interface NodeBranchDialogProps {
  sourceLabel: string;
  onApply(variants: BranchVariant[]): void;
  onClose(): void;
}

const providers = ["oauth", "api", "grok", "gemini-api"] as const;

function createDraft(index: number): VariantDraft {
  return { id: `variant-${index + 1}`, label: `Variant ${index + 1}`, provider: providers[index % providers.length], model: "", size: "" };
}

function toVariant(draft: VariantDraft): BranchVariant {
  return {
    id: draft.id,
    label: draft.label.trim(),
    provider: draft.provider,
    settingsPatch: {
      ...(draft.model.trim() ? { model: draft.model.trim() } : {}),
      ...(draft.size.trim() ? { size: draft.size.trim() } : {}),
    },
  };
}

export function NodeBranchDialog({ sourceLabel, onApply, onClose }: NodeBranchDialogProps) {
  const [drafts, setDrafts] = useState<VariantDraft[]>([createDraft(0), createDraft(1)]);
  const nextVariant = useRef(2);
  const update = (index: number, patch: Partial<VariantDraft>) => {
    setDrafts((current) => current.map((draft, itemIndex) => itemIndex === index ? { ...draft, ...patch } : draft));
  };
  const remove = (index: number) => setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const add = () => setDrafts((current) => {
    if (current.length >= 4) return current;
    const draft = createDraft(nextVariant.current++);
    return [...current, draft];
  });
  const apply = () => onApply(drafts.map(toVariant));

  return <section className="node-template-picker" role="document">
    <header><div><p className="node-template-picker__eyebrow">Branch workflow</p><h2 id="node-branch-dialog-title">Create variants</h2><p>{sourceLabel}</p></div><button type="button" aria-label="Close branch dialog" onClick={onClose}>×</button></header>
    <div className="node-template-picker__sections">
      {drafts.map((draft, index) => <fieldset key={draft.id} className="node-template-picker__card">
        <legend>Variant {index + 1}</legend>
        <label className="node-template-picker__search"><span>Label</span><input autoFocus={index === 0} value={draft.label} onChange={(event) => update(index, { label: event.target.value })} /></label>
        <label className="node-template-picker__search"><span>Provider</span><select value={draft.provider} onChange={(event) => update(index, { provider: event.target.value })}>{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
        <label className="node-template-picker__search"><span>Model override</span><input value={draft.model} onChange={(event) => update(index, { model: event.target.value })} placeholder="Use current model" /></label>
        <label className="node-template-picker__search"><span>Size override</span><input value={draft.size} onChange={(event) => update(index, { size: event.target.value })} placeholder="Use current size" /></label>
        <button type="button" disabled={drafts.length <= 2} onClick={() => remove(index)}>Remove</button>
      </fieldset>)}
    </div>
    <footer><button type="button" disabled={drafts.length >= 4} onClick={add}>Add variant</button><span /><button type="button" onClick={onClose}>Cancel</button><button type="button" className="node-template-picker__copy" disabled={drafts.some((draft) => !draft.label.trim())} onClick={apply}>Create branches</button></footer>
  </section>;
}
