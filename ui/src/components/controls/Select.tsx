import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type SelectItem<V extends string> = {
  value: V;
  label: ReactNode;
  sub?: ReactNode;
  disabled?: boolean;
};

export type SelectGroup<V extends string> = {
  label?: ReactNode;
  items: ReadonlyArray<SelectItem<V>>;
};

type Props<V extends string> = {
  items?: ReadonlyArray<SelectItem<V>>;
  /** Grouped options with header rows; takes precedence over `items`. */
  groups?: ReadonlyArray<SelectGroup<V>>;
  value: V;
  onChange: (v: V) => void;
  ariaLabel?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  /**
   * Renders the open list into document.body with fixed positioning so it
   * escapes overflow-clipped containers (sidebar). Closes on scroll/resize
   * so the fixed panel never detaches from its trigger (020, audit R2-2).
   */
  portal?: boolean;
  /** Short label shown on the closed trigger instead of the selected label. */
  triggerLabel?: ReactNode;
  /** Secondary trigger text (e.g. current reasoning effort). */
  triggerSub?: ReactNode;
  /** Trigger label when nothing is selected. */
  placeholder?: ReactNode;
  title?: string;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

const flattenGroups = <V extends string>(
  groups: ReadonlyArray<SelectGroup<V>> | undefined,
  items: ReadonlyArray<SelectItem<V>> | undefined,
): { flat: SelectItem<V>[]; rendered: ReadonlyArray<SelectGroup<V>> } => {
  if (groups && groups.length > 0) {
    const visible = groups.filter((group) => group.items.length > 0);
    return { flat: visible.flatMap((group) => [...group.items]), rendered: visible };
  }
  const fallback = items ?? [];
  return { flat: [...fallback], rendered: [{ items: fallback }] };
};

/**
 * Select — glass dropdown listbox (Phase 020 kit). Replaces native <select>
 * where item metadata (sub text) matters. Full keyboard support:
 * Enter/Space/ArrowDown open, Arrow keys move, Enter selects, Escape closes.
 * Supports grouped options and portal rendering for clipped containers (020).
 */
export function Select<V extends string>({
  items,
  groups,
  value,
  onChange,
  ariaLabel,
  className,
  id,
  disabled,
  portal = false,
  triggerLabel,
  triggerSub,
  placeholder,
  title,
}: Props<V>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos>({ top: 0, left: 0, width: 200, maxHeight: 260 });
  const { flat, rendered } = flattenGroups(groups, items);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, flat.findIndex((it) => it.value === value)),
  );

  const selected = flat.find((it) => it.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      // A portaled list lives outside rootRef; keep it clickable (audit R2-2).
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  useLayoutEffect(() => {
    if (!portal || !open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const gutter = 12;
      const width = Math.min(300, Math.max(190, rect.width, 190));
      const left = Math.min(Math.max(gutter, rect.left), window.innerWidth - width - gutter);
      const below = window.innerHeight - rect.bottom - gutter;
      setMenuPos({
        top: rect.bottom + 4,
        left,
        width,
        maxHeight: Math.max(160, Math.min(420, below)),
      });
    }
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [portal, open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const openList = () => {
    setActiveIndex(Math.max(0, flat.findIndex((it) => it.value === value)));
    setOpen(true);
  };

  const move = (step: number) => {
    let next = activeIndex;
    for (let i = 0; i < flat.length; i += 1) {
      next = (next + step + flat.length) % flat.length;
      if (!flat[next]?.disabled) break;
    }
    setActiveIndex(next);
  };

  const commit = (index: number) => {
    const item = flat[index];
    if (!item || item.disabled) return;
    onChange(item.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flat.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  let flatIndex = -1;
  const list = open ? (
    <ul
      className={`ctl-select__list${portal ? " ctl-select__list--portal" : ""}`}
      role="listbox"
      id={listId}
      ref={listRef}
      style={portal ? {
        position: "fixed",
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        maxHeight: menuPos.maxHeight,
      } : undefined}
    >
      {rendered.map((group, groupIdx) => (
        <li key={`g-${groupIdx}`} role="presentation" className="ctl-select__group">
          {group.label ? <div className="ctl-select__group-label">{group.label}</div> : null}
          <ul
            role="group"
            aria-label={typeof group.label === "string" ? group.label : undefined}
            className="ctl-select__group-items"
          >
            {group.items.map((it) => {
              flatIndex += 1;
              const index = flatIndex;
              return (
                <li
                  key={it.value}
                  role="option"
                  data-index={index}
                  aria-selected={it.value === value}
                  aria-disabled={it.disabled || undefined}
                  className={`ctl-select__item${it.value === value ? " is-selected" : ""}${
                    index === activeIndex ? " is-active" : ""
                  }${it.disabled ? " is-disabled" : ""}`}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => commit(index)}
                >
                  <span className="ctl-select__item-label">{it.label}</span>
                  {it.sub ? <span className="ctl-select__item-sub">{it.sub}</span> : null}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className={`ctl-select${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`ctl-select__trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        title={title}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="ctl-select__value">
          {triggerLabel ?? selected?.label ?? placeholder ?? ""}
        </span>
        {(triggerSub ?? selected?.sub)
          ? <span className="ctl-select__value-sub">{triggerSub ?? selected?.sub}</span>
          : null}
        <svg
          className="ctl-select__caret"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
        >
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {list ? (portal ? createPortal(list, document.body) : list) : null}
    </div>
  );
}
