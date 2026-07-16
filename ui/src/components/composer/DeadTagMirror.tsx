import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useI18n } from "../../i18n";
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
] as const;

type PromptSegment = { text: string; dead: boolean };

function segmentPrompt(prompt: string, retiredTags: Readonly<Record<string, number>>): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let cursor = 0;
  for (const token of findTrayTagTokens(prompt)) {
    if (token.start > cursor) segments.push({ text: prompt.slice(cursor, token.start), dead: false });
    segments.push({
      text: prompt.slice(token.start, token.end),
      dead: Object.prototype.hasOwnProperty.call(retiredTags, token.tag),
    });
    cursor = token.end;
  }
  if (cursor < prompt.length) segments.push({ text: prompt.slice(cursor), dead: false });
  return segments;
}

export function DeadTagMirror({ prompt, retiredTags, textareaRef }: DeadTagMirrorProps) {
  const { t } = useI18n();
  const mirrorRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => segmentPrompt(prompt, retiredTags), [prompt, retiredTags]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    const sync = () => {
      const style = getComputedStyle(textarea);
      MIRRORED_PROPERTIES.forEach((property) => { mirror.style[property] = style[property]; });
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    };
    sync();
    textarea.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(textarea);
    return () => {
      textarea.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [textareaRef, prompt]);

  return (
    <div ref={mirrorRef} className="composer__prompt-mirror" aria-hidden="true">
      {segments.map((segment, index) => segment.dead ? (
        <span key={index} className="dead-tag" title={t("prompt.deadTagHint")}>{segment.text}</span>
      ) : segment.text)}
    </div>
  );
}
