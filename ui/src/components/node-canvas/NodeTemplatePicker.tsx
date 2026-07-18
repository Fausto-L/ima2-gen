import { useMemo, useState } from "react";

export type NodeTemplateSource = "seed" | "user";

export interface NodeTemplateSummary {
  id: string;
  name: string;
  description: string;
  source: NodeTemplateSource;
  tags: readonly string[];
  nodeCount: number;
  terminalCount: number;
  preview?: readonly { id: string; x: number; y: number; label?: string }[];
}

export interface NodeTemplatePickerProps {
  templates: readonly NodeTemplateSummary[];
  loading?: boolean;
  error?: string | null;
  onCopy(template: NodeTemplateSummary): void | Promise<void>;
  onClose(): void;
  onRename?(template: NodeTemplateSummary): void;
  onDelete?(template: NodeTemplateSummary): void;
}

function matches(template: NodeTemplateSummary, query: string) {
  const value = query.toLocaleLowerCase();
  return [template.name, ...template.tags].some((part) => part.toLocaleLowerCase().includes(value));
}

function MiniGraph({ template }: { template: NodeTemplateSummary }) {
  const nodes = template.preview ?? [];
  return (
    <div className="node-template-picker__preview" aria-label={`${template.name} graph preview`}>
      {nodes.length ? nodes.map((node) => (
        <span key={node.id} className="node-template-picker__preview-node" style={{ left: `${node.x}%`, top: `${node.y}%` }}>
          {node.label}
        </span>
      )) : <span className="node-template-picker__preview-empty">{template.nodeCount} nodes</span>}
    </div>
  );
}

function TemplateCard({ template, selected, onSelect, onRename, onDelete }: {
  template: NodeTemplateSummary;
  selected: boolean;
  onSelect(): void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className={`node-template-picker__card${selected ? " is-selected" : ""}`}>
      <button type="button" className="node-template-picker__card-main" onClick={onSelect} onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); onSelect(); }
      }} aria-pressed={selected}>
        <MiniGraph template={template} />
        <span className="node-template-picker__card-copy">
          <strong>{template.name}</strong>
          <span>{template.description}</span>
          <small>{template.nodeCount} nodes · {template.terminalCount} outputs</small>
        </span>
      </button>
      <div className="node-template-picker__tags">{template.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      {template.source === "user" && (onRename || onDelete) ? <div className="node-template-picker__card-actions">
        {onRename ? <button type="button" onClick={onRename}>Rename</button> : null}
        {onDelete ? <button type="button" onClick={onDelete}>Delete</button> : null}
      </div> : null}
    </article>
  );
}

export function NodeTemplatePicker({ templates, loading = false, error = null, onCopy, onClose, onRename, onDelete }: NodeTemplatePickerProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = useMemo(() => templates.filter((template) => matches(template, query)), [query, templates]);
  const selected = filtered.find((template) => template.id === selectedId) ?? null;
  const seed = filtered.filter((template) => template.source === "seed");
  const user = filtered.filter((template) => template.source === "user");

  const confirmCopy = () => { if (selected) void onCopy(selected); };
  const remove = (template: NodeTemplateSummary) => {
    if (window.confirm(`Delete template “${template.name}”? This cannot be undone.`)) onDelete?.(template);
  };

  return <section className="node-template-picker" role="dialog" aria-modal="true" aria-labelledby="node-template-picker-title">
    <header><div><p className="node-template-picker__eyebrow">Node studio</p><h2 id="node-template-picker-title">Choose a template</h2></div><button type="button" aria-label="Close templates" onClick={onClose}>×</button></header>
    <label className="node-template-picker__search"><span>Search templates</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or tag" /></label>
    {loading ? <p className="node-template-picker__state" role="status">Loading templates…</p> : null}
    {error ? <p className="node-template-picker__state is-error" role="alert">{error}</p> : null}
    {!loading && !error && filtered.length === 0 ? <p className="node-template-picker__state">No templates match “{query}”.</p> : null}
    {!loading && !error ? <div className="node-template-picker__sections">
      {seed.length ? <section><h3>Starter templates</h3><div className="node-template-picker__grid">{seed.map((template) => <TemplateCard key={template.id} template={template} selected={template.id === selectedId} onSelect={() => setSelectedId(template.id)} />)}</div></section> : null}
      {user.length ? <section><h3>Your templates</h3><div className="node-template-picker__grid">{user.map((template) => <TemplateCard key={template.id} template={template} selected={template.id === selectedId} onSelect={() => setSelectedId(template.id)} onRename={onRename ? () => onRename(template) : undefined} onDelete={onDelete ? () => remove(template) : undefined} />)}</div></section> : null}
    </div> : null}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="node-template-picker__copy" disabled={!selected} onClick={confirmCopy}>Make a copy</button></footer>
  </section>;
}
