import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { findTrayTagTokens } from "../../lib/referenceTray";

type DeadTagMirrorProps = {
  prompt: string;
  retiredTags: Readonly<Record<string, number>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

const MIRRORED_PROPERTIES = [
  "boxSizing", "width", "height", "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
  "lineHeight", "textTransform", "textIndent", "textAlign", "wordSpacing", "tabSize",
  "whiteSpace", "overflowWrap", "wordBreak",
] as const;

type DeadTagRect = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function DeadTagMirror({ prompt, retiredTags, textareaRef }: DeadTagMirrorProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [rects, setRects] = useState<DeadTagRect[]>([]);
  const deadTokens = useMemo(
    () => findTrayTagTokens(prompt).filter((token) =>
      Object.prototype.hasOwnProperty.call(retiredTags, token.tag)),
    [prompt, retiredTags],
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const textNode = textRef.current?.firstChild;
    if (!textarea || !mirror || !(textNode instanceof Text)) {
      setRects([]);
      return;
    }

    const sync = () => {
      const style = getComputedStyle(textarea);
      MIRRORED_PROPERTIES.forEach((property) => { mirror.style[property] = style[property]; });
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
      const mirrorRect = mirror.getBoundingClientRect();
      const next: DeadTagRect[] = [];
      for (const token of deadTokens) {
        const range = document.createRange();
        range.setStart(textNode, token.start);
        range.setEnd(textNode, token.end);
        Array.from(range.getClientRects()).forEach((rect, index) => {
          next.push({
            key: `${token.start}-${token.end}-${index}`,
            left: rect.left - mirrorRect.left + mirror.scrollLeft,
            top: rect.top - mirrorRect.top + mirror.scrollTop,
            width: rect.width,
            height: rect.height,
          });
        });
      }
      setRects(next);
    };

    sync();
    textarea.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(textarea);
    return () => {
      textarea.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [textareaRef, prompt, deadTokens]);

  return (
    <div ref={mirrorRef} className="composer__prompt-mirror" aria-hidden="true">
      <span ref={textRef}>{prompt}</span>
      {rects.map((rect) => (
        <span key={rect.key} className="dead-tag" style={rect} />
      ))}
    </div>
  );
}
