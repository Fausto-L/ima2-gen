import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  canConnectPortTypes,
  type NodePortType,
  type PortDescriptor,
} from "../../lib/nodeCompatibility";
import { useI18n } from "../../i18n";

export type NodeCommandCategory = "input" | "generate" | "transform" | "reference" | "output";
export type NodePortDefinition = { id: string; type: NodePortType };

export interface NodeCommandDescriptor {
  type: string;
  label: string;
  description: string;
  category: NodeCommandCategory;
  keywords: readonly string[];
  inputPorts: readonly NodePortDefinition[];
  outputPorts: readonly NodePortDefinition[];
  createData(): Record<string, unknown>;
}

export interface NodeCommandPaletteProps {
  open: boolean;
  anchor: { clientX: number; clientY: number };
  sourcePort?: PortDescriptor;
  commands: readonly NodeCommandDescriptor[];
  recentCommandTypes?: readonly string[];
  onInsert(command: NodeCommandDescriptor): void;
  onClose(): void;
}

const CATEGORY_LABEL_KEYS: Record<NodeCommandCategory, string> = { input: "nodeStudio.palette.categories.input", generate: "nodeStudio.palette.categories.generate", transform: "nodeStudio.palette.categories.transform", reference: "nodeStudio.palette.categories.reference", output: "nodeStudio.palette.categories.output" };
const CATEGORY_ORDER: readonly NodeCommandCategory[] = ["input", "generate", "transform", "reference", "output"];

type Translate = ReturnType<typeof useI18n>["t"];

function commandText(t: Translate, command: NodeCommandDescriptor, field: "label" | "description") {
  const key = `nodeStudio.commands.${command.type}.${field}`;
  const translated = t(key);
  return translated === key ? command[field] : translated;
}

function portTypeLabel(t: Translate, type: NodePortType) {
  const key = `nodeStudio.portTypes.${type}`;
  const translated = t(key);
  return translated === key ? type : translated;
}

function score(command: NodeCommandDescriptor, query: string, t: Translate) {
  const value = query.toLocaleLowerCase();
  const label = commandText(t, command, "label").toLocaleLowerCase();
  if (label.startsWith(value)) return 0;
  if (label.includes(value)) return 1;
  if (command.keywords.some((word) => word.toLocaleLowerCase().includes(value))) return 2;
  return commandText(t, command, "description").toLocaleLowerCase().includes(value) ? 3 : -1;
}

function acceptsPort(command: NodeCommandDescriptor, sourcePort?: PortDescriptor) {
  if (!sourcePort) return true;
  return sourcePort.direction === "output" && command.inputPorts.some(
    (port) => canConnectPortTypes(sourcePort.type, port.type),
  );
}

export function NodeCommandPalette({ open, anchor, sourcePort, commands, recentCommandTypes = [], onInsert, onClose }: NodeCommandPaletteProps) {
  const { t } = useI18n();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => commands.filter((command) => acceptsPort(command, sourcePort)).map((command) => ({ command, score: score(command, query, t) })).filter((item) => !query || item.score >= 0).sort((a, b) => a.score - b.score || commandText(t, a.command, "label").localeCompare(commandText(t, b.command, "label"))).map((item) => item.command), [commands, query, sourcePort, t]);
  const visible = query ? filtered : [...recentCommandTypes.map((type) => filtered.find((command) => command.type === type)).filter((command): command is NodeCommandDescriptor => Boolean(command)).slice(0, 5), ...filtered.filter((command) => !recentCommandTypes.includes(command.type))];
  const ordered = useMemo(
    () => CATEGORY_ORDER.flatMap((category) => visible.filter((command) => command.category === category)),
    [visible],
  );

  useEffect(() => { if (open) { setQuery(""); setActiveIndex(0); requestAnimationFrame(() => inputRef.current?.focus()); } }, [open]);
  useEffect(() => { setActiveIndex((index) => Math.min(index, Math.max(0, ordered.length - 1))); }, [ordered.length]);
  if (!open) return null;

  const insertActive = () => { const command = ordered[activeIndex]; if (command) onInsert(command); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => (index + 1) % Math.max(1, ordered.length)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => (index - 1 + ordered.length) % Math.max(1, ordered.length)); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === "End") { event.preventDefault(); setActiveIndex(Math.max(0, ordered.length - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); insertActive(); }
    else if (event.key === "Tab") { event.preventDefault(); const current = ordered[activeIndex]?.category; const offset = CATEGORY_ORDER.indexOf(current ?? "input"); const next = CATEGORY_ORDER.slice(offset + 1).concat(CATEGORY_ORDER.slice(0, offset)).find((category) => category !== current && ordered.some((command) => command.category === category)); if (next) setActiveIndex(ordered.findIndex((command) => command.category === next)); }
    else if ((event.metaKey || event.ctrlKey) && event.key === "Backspace") { event.preventDefault(); setQuery(""); }
  };
  const sourcePortLabel = sourcePort ? portTypeLabel(t, sourcePort.type) : null;
  return <section className="node-command-palette" style={{ left: anchor.clientX, top: anchor.clientY }} aria-label={t("nodeStudio.palette.ariaLabel")}>
    <input ref={inputRef} className="node-command-palette__search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder={sourcePortLabel ? t("nodeStudio.palette.compatiblePlaceholder", { portType: sourcePortLabel }) : t("nodeStudio.palette.searchPlaceholder")} aria-controls={listId} aria-activedescendant={ordered[activeIndex] ? `${listId}-${ordered[activeIndex].type}` : undefined} />
    {sourcePortLabel ? <p className="node-command-palette__filter">{t("nodeStudio.palette.filter", { portType: sourcePortLabel })}</p> : null}
    {ordered.length === 0 ? <p className="node-command-palette__empty">{sourcePortLabel ? t("nodeStudio.palette.emptyCompatible", { portType: sourcePortLabel }) : t("nodeStudio.palette.emptySearch")}</p> : <div className="node-command-palette__list" id={listId} role="listbox" aria-label={t("nodeStudio.palette.commandsAria")}>{CATEGORY_ORDER.map((category) => { const group = ordered.filter((command) => command.category === category); if (!group.length) return null; return <section key={category}><h3>{t(CATEGORY_LABEL_KEYS[category])}</h3>{group.map((command) => { const commandIndex = ordered.indexOf(command); return <button key={command.type} id={`${listId}-${command.type}`} type="button" role="option" aria-selected={commandIndex === activeIndex} className={commandIndex === activeIndex ? "is-active" : ""} onPointerEnter={() => setActiveIndex(commandIndex)} onClick={() => onInsert(command)}><span>{commandText(t, command, "label")}</span><small>{commandText(t, command, "description")}</small></button>; })}</section>; })}</div>}
  </section>;
}
