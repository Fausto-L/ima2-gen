import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEventHandler, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n";
import { InFlightList } from "../InFlightList";

const GAP = 10;
const VIEWPORT_MARGIN = 12;

type PopupPosition = { left: number; top: number; caretTop: number };

type InFlightPopupProps = {
  anchorRef: RefObject<HTMLButtonElement | null>;
  panelId: string;
  focusOnOpen: boolean;
  onRequestClose: (restoreFocus: boolean) => void;
  onPointerEnter: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
};

export function InFlightPopup({
  anchorRef,
  panelId,
  focusOnOpen,
  onRequestClose,
  onPointerEnter,
  onPointerLeave,
}: InFlightPopupProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const frameRef = useRef<number | null>(null);
  const [position, setPosition] = useState<PopupPosition>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
    caretTop: 24,
  });
  const [positioned, setPositioned] = useState(false);

  useLayoutEffect(() => {
    const updatePosition = () => {
      const badge = anchorRef.current;
      const panel = panelRef.current;
      if (!badge || !panel) return;
      const badgeRect = badge.getBoundingClientRect();
      const sidebarRect = badge.closest(".sidebar")?.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const anchorRight = sidebarRect ? sidebarRect.right : badgeRect.right;
      const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - panelRect.width - VIEWPORT_MARGIN);
      const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - panelRect.height - VIEWPORT_MARGIN);
      const left = Math.min(Math.max(anchorRight + GAP, VIEWPORT_MARGIN), maxLeft);
      const top = Math.min(Math.max(badgeRect.bottom - panelRect.height, VIEWPORT_MARGIN), maxTop);
      const caretTop = Math.min(Math.max(badgeRect.top + badgeRect.height / 2 - top, 16), panelRect.height - 16);
      setPosition({ left, top, caretTop });
      setPositioned(true);
    };
    const schedulePosition = () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    const observer = new ResizeObserver(schedulePosition);
    if (anchorRef.current) observer.observe(anchorRef.current);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
      observer.disconnect();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (focusOnOpen) headingRef.current?.focus();
  }, [focusOnOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (anchorRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      onRequestClose(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onRequestClose(true);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onRequestClose]);

  const titleId = `${panelId}-title`;
  const style = {
    left: position.left,
    top: position.top,
    "--inflight-caret-top": `${position.caretTop}px`,
  } as CSSProperties;

  return createPortal(
    <div
      ref={panelRef}
      className="inflight-popup"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-positioned={positioned}
      style={style}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <header className="inflight-popup__header">
        <h2 ref={headingRef} id={titleId} tabIndex={-1}>{t("inflight.title")}</h2>
        <button
          type="button"
          className="inflight-popup__close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={() => onRequestClose(true)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <InFlightList variant="popup" panelId={panelId} />
      <footer className="inflight-popup__footer">{t("inflight.footerHint")}</footer>
    </div>,
    document.body,
  );
}
