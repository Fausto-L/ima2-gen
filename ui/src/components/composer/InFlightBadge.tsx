import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { InFlightPopup } from "./InFlightPopup";

export const HOVER_OPEN_DELAY_MS = 180;
export const CLOSE_DELAY_MS = 180;

type PopupMode = "closed" | "hover" | "pinned";

export type InFlightBadgeProps = {
  variant?: "popup" | "inline";
  panelId: string;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
};

export function InFlightBadge({
  variant = "popup",
  panelId,
  expanded = false,
  onToggle,
}: InFlightBadgeProps) {
  const count = useAppStore((s) => s.inFlight.length);
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [mode, setMode] = useState<PopupMode>("closed");
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const open = variant === "inline" ? expanded : mode !== "closed";

  const clearTimers = () => {
    if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
  };

  useEffect(() => clearTimers, []);

  useLayoutEffect(() => {
    if (count !== 0) return;
    const activeElement = document.activeElement;
    if (open && activeElement instanceof HTMLElement && activeElement.closest(".inflight-popup")) {
      triggerRef.current?.focus();
    }
    clearTimers();
    setMode("closed");
    setFocusOnOpen(false);
    if (variant === "inline" && expanded) onToggle?.(false);
  }, [count, expanded, onToggle, open, variant]);

  const returningPopupFocus = count === 0 && variant === "popup" && open;
  if ((count === 0 && !returningPopupFocus) || (variant === "popup" && isMobile)) return null;

  const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cancelClose = () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleHoverOpen = () => {
    if (variant !== "popup" || mode === "pinned" || !canHover()) return;
    cancelClose();
    if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = window.setTimeout(() => setMode("hover"), HOVER_OPEN_DELAY_MS);
  };
  const scheduleHoverClose = () => {
    if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
    if (variant !== "popup" || mode !== "hover") return;
    closeTimerRef.current = window.setTimeout(() => setMode("closed"), CLOSE_DELAY_MS);
  };
  const closePopup = (restoreFocus: boolean) => {
    clearTimers();
    setMode("closed");
    setFocusOnOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === "inline") {
      const nextOpen = !expanded;
      onToggle?.(nextOpen);
      return;
    }
    clearTimers();
    if (mode === "pinned") {
      closePopup(false);
      return;
    }
    setFocusOnOpen(event.detail === 0);
    setMode("pinned");
  };
  const handlePointerEnter = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === "mouse") scheduleHoverOpen();
  };

  const accessibleCount = count > 99 ? "99+" : String(count);
  const labelKey = open ? "inflight.badgeClose" : "inflight.badgeOpen";

  return (
    <span
      className={`inflight-badge-wrap inflight-badge-wrap--${variant}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={scheduleHoverClose}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`inflight-badge inflight-badge--${variant}`}
        onClick={handleClick}
        aria-live="polite"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup={variant === "popup" ? "dialog" : undefined}
        aria-label={t(labelKey, { n: count })}
        title={t(labelKey, { n: count })}
      >
        <span className="inflight-badge__spinner" aria-hidden="true" />
        <span className="inflight-badge__count" aria-hidden="true">{accessibleCount}</span>
      </button>
      {variant === "popup" && open ? <span className="inflight-badge__bridge" aria-hidden="true" /> : null}
      {variant === "popup" && open ? (
        <InFlightPopup
          anchorRef={triggerRef}
          panelId={panelId}
          focusOnOpen={focusOnOpen}
          onRequestClose={closePopup}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleHoverClose}
        />
      ) : null}
    </span>
  );
}
