import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { isVideoItem, extractLastFrame } from "../lib/videoMedia";
import type { VideoReferenceDragPayload } from "../lib/videoContinuity";
import { getPresetById } from "../lib/presets";
import { findMentionAtCaret, type MentionQuery } from "../lib/elementMention";
import { Chip, ChipRow } from "./controls";
import { ElementMentionMenu } from "./ElementMentionMenu";
import type { ElementMentionKind } from "./ElementMentionChip";
import { ReferenceTray } from "./composer/ReferenceTray";
import { DeadTagMirror } from "./composer/DeadTagMirror";
import { PromptComposerToolbar } from "./composer/PromptComposerToolbar";
import { usePromptPaste } from "./composer/usePromptPaste";
import { elementPreviewPath, loadAllElementAssets } from "../lib/elementMembership";
import type { AssetItem } from "../store/storeTypes";

type PromptComposerProps = {
  variant?: "sidebar" | "bottom";
};

// Element selection is supplied by the element-store slice, which is composed
// into AppState independently of this UI surface.
type ElementSelectionState = {
  addElementId?: (id: string) => void;
};

type InternalRefDragItem = VideoReferenceDragPayload;

// Mention-menu ids for tray attachments; selecting one only reinserts the
// @tag text (tray membership is never mutated from the mention menu).
const TRAY_MENTION_PREFIX = "tray:";

function parseCssPixelValue(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function PromptComposer({ variant = "sidebar" }: PromptComposerProps) {
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const insertedPrompts = useAppStore((s) => s.insertedPrompts);
  const removeInsertedPrompt = useAppStore((s) => s.removeInsertedPromptFromComposer);
  const moveInsertedPrompt = useAppStore((s) => s.moveInsertedPromptInComposer);
  const generate = useAppStore((s) => s.generate);
  const selectedPresetIds = useAppStore((s) => s.selectedPresetIds);
  const removePreset = useAppStore((s) => s.removePreset);
  const elementSelection = useAppStore((s) => s as typeof s & ElementSelectionState);
  const addElementId = elementSelection.addElementId;
  const [elements, setElements] = useState<AssetItem[]>([]);
  // Assets and Create are exclusive workspaces. Always hydrate the complete
  // Element list on Create mount instead of inheriting the last Assets filter.
  useEffect(() => {
    let cancelled = false;
    void loadAllElementAssets()
      .then((items) => { if (!cancelled) setElements(items); })
      .catch((error) => console.error("[ElementMention] load failed", error));
    return () => { cancelled = true; };
  }, []);
  const { t } = useI18n();

  const trayItems = useAppStore((s) => s.trayItems);
  const retiredTags = useAppStore((s) => s.retiredTags);
  const removeTrayItem = useAppStore((s) => s.removeTrayItem);
  // Provider/mode-aware cap (grok family image 3, grok video 7, MCP lane 0).
  const maxRefs = useAppStore((s) => s.activeReferenceLimit());
  const providerUrlReference = useAppStore((s) => s.providerUrlReference);
  const setProviderUrlReference = useAppStore((s) => s.setProviderUrlReference);
  const addReferences = useAppStore((s) => s.addReferences);
  const addReferenceDataUrl = useAppStore((s) => s.addReferenceDataUrl);
  const useImageAsReference = useAppStore((s) => s.useImageAsReference);
  const readDroppedImageMetadata = useAppStore((s) => s.readDroppedImageMetadata);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentCaretRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const promptMode = useAppStore((s) => s.promptMode);
  const multimode = useAppStore((s) => s.multimode);
  const multimodeMaxImages = useAppStore((s) => s.multimodeMaxImages);
  const isDirectMode = promptMode === "direct";
  const beforePrompts = insertedPrompts.filter((item) => item.placement !== "after");
  const afterPrompts = insertedPrompts.filter((item) => item.placement === "after");
  const visualPromptIds = [
    ...beforePrompts.map((item) => item.id),
    "__main_prompt__",
    ...afterPrompts.map((item) => item.id),
  ];

  const canAddMore = trayItems.length < maxRefs;
  const placeholder = multimode
    ? trayItems.length > 0
      ? t("multimode.promptPlaceholderWithRefs")
      : t("multimode.promptPlaceholder")
    : trayItems.length > 0
      ? t("prompt.placeholderWithRefs")
      : t("prompt.placeholder");

  const captureAttachmentCaret = (): number => {
    const textarea = textareaRef.current;
    return textarea?.selectionStart ?? useAppStore.getState().prompt.length;
  };

  const insertAttachmentTags = (knownTokenIds: ReadonlySet<string>, caret: number): number => {
    const added = useAppStore.getState().trayItems.filter(
      (item) => item.kind === "attachment" && !knownTokenIds.has(item.tokenId),
    );
    if (added.length === 0) return 0;
    const currentPrompt = useAppStore.getState().prompt;
    const insertionPoint = Math.max(0, Math.min(caret, currentPrompt.length));
    const mentionText = added.map((item) => `@${item.tag} `).join("");
    setPrompt(`${currentPrompt.slice(0, insertionPoint)}${mentionText}${currentPrompt.slice(insertionPoint)}`);
    const nextCaret = insertionPoint + mentionText.length;
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(nextCaret, nextCaret));
    return added.length;
  };

  const insertTagAtMention = (tag: string, mention: MentionQuery) => {
    const replacement = `@${tag} `;
    const currentPrompt = useAppStore.getState().prompt;
    const next = `${currentPrompt.slice(0, mention.start)}${replacement}${currentPrompt.slice(mention.end)}`;
    const caret = mention.start + replacement.length;
    setPrompt(next);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(caret, caret));
  };

  const addFilesAtCaret = async (files: File[], caret: number, inspectMetadata: boolean): Promise<number> => {
    if (files.length === 0) return 0;
    const knownTokenIds = new Set(useAppStore.getState().trayItems.map((item) => item.tokenId));
    try {
      if (inspectMetadata && files.length === 1) {
        const handled = await readDroppedImageMetadata(files[0]);
        if (handled) return 0;
      }
      await addReferences(files);
      return insertAttachmentTags(knownTokenIds, caret);
    } catch {
      return 0; // attachment errors surface through the existing store toasts
    }
  };

  const handleImageFiles = async (files: File[]) => {
    const caret = attachmentCaretRef.current ?? captureAttachmentCaret();
    attachmentCaretRef.current = null;
    await addFilesAtCaret(files, caret, true);
  };

  const openFilePicker = () => {
    if (!canAddMore) return;
    attachmentCaretRef.current = captureAttachmentCaret();
    fileInput.current?.click();
  };

  const attachInternalReference = async (item: InternalRefDragItem, caret: number): Promise<void> => {
    // Images go through useImageAsReference (fetch → compress → base64), while
    // videos contribute their last frame. The resulting tray tag is inserted at
    // the caret snapshot owned by this drag operation.
    const knownTokenIds = new Set(useAppStore.getState().trayItems.map((trayItem) => trayItem.tokenId));
    try {
      const src = item.url || item.image;
      if (!src) return;
      const refItem = { image: src, url: item.url, filename: item.filename };
      if (isVideoItem(refItem)) {
        const frame = await extractLastFrame(src);
        if (frame) addReferenceDataUrl(frame);
      } else {
        await useImageAsReference(refItem as Parameters<typeof useImageAsReference>[0]);
      }
      insertAttachmentTags(knownTokenIds, caret);
    } catch { /* non-fatal for drag-drop */ }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    // Internal gallery drag — add as reference only (no prompt injection)
    const refData = e.dataTransfer.getData("application/ima2-ref");
    if (refData) {
      try {
        const item = JSON.parse(refData) as InternalRefDragItem;
        void attachInternalReference(item, captureAttachmentCaret());
      } catch { /* ignore malformed */ }
      return;
    }
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) void handleImageFiles(files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const onPaste = usePromptPaste({
    maxRefs,
    trayItemCount: trayItems.length,
    captureAttachmentCaret,
    addFilesAtCaret,
  });

  const maxHeightRef = useRef<number | null>(null);
  const lastVariantRef = useRef(variant);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (maxHeightRef.current === null || lastVariantRef.current !== variant) {
      maxHeightRef.current =
        parseCssPixelValue(window.getComputedStyle(el).maxHeight) ?? 0;
      lastVariantRef.current = variant;
    }
    el.style.height = "auto";
    const maxHeight = maxHeightRef.current;
    const nextHeight = maxHeight ? Math.min(el.scrollHeight, maxHeight) : el.scrollHeight;
    el.style.height = `${nextHeight}px`;
  }, [prompt, variant]);

  const canMovePromptBlock = (id: string, direction: "up" | "down"): boolean => {
    const index = visualPromptIds.indexOf(id);
    if (index < 0) return false;
    return direction === "up" ? index > 0 : index < visualPromptIds.length - 1;
  };

  const renderPromptChip = (item: typeof insertedPrompts[number]) => (
    <div key={item.id} className="composer__prompt-chip" title={item.name}>
      <span className="composer__prompt-chip-plus" aria-hidden="true">
        +
      </span>
      <span className="composer__prompt-chip-title">{item.name}</span>
      <div className="composer__prompt-chip-actions">
        <button
          type="button"
          className="composer__prompt-chip-move"
          onClick={() => moveInsertedPrompt(item.id, "up")}
          disabled={!canMovePromptBlock(item.id, "up")}
          aria-label={t("prompt.moveBlockUp", { name: item.name })}
          title={t("prompt.moveBlockUp", { name: item.name })}
        >
          ^
        </button>
        <button
          type="button"
          className="composer__prompt-chip-move"
          onClick={() => moveInsertedPrompt(item.id, "down")}
          disabled={!canMovePromptBlock(item.id, "down")}
          aria-label={t("prompt.moveBlockDown", { name: item.name })}
          title={t("prompt.moveBlockDown", { name: item.name })}
        >
          v
        </button>
        <button
          type="button"
          className="composer__prompt-chip-remove"
          onClick={() => removeInsertedPrompt(item.id)}
          aria-label={t("promptLibrary.removeInserted", { name: item.name })}
        >
          x
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`composer composer--${variant}${dragOver ? " composer--drag" : ""}${isDirectMode ? " composer--direct" : ""}${multimode ? " composer--multimode" : ""}${isDirectMode && multimode ? " composer--combined-modes" : ""}`}
      role="group"
      aria-label={
        multimode
          ? t("multimode.composerAriaLabel", { count: multimodeMaxImages })
          : t("prompt.label")
      }
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onPaste={onPaste}
    >
      <div className="composer__header">
        <span className="section-title composer__label">{t("prompt.label")}</span>
        <div className="composer__header-meta">
          {multimode && (
            <span className="composer__mode-badge">
              {t("multimode.composerBadge", { count: multimodeMaxImages })}
            </span>
          )}
          {isDirectMode && (
            <span className="composer__direct-badge">
              {t("prompt.directModeActive")}
            </span>
          )}
          {providerUrlReference && (
            <button
              type="button"
              className="composer__url-ref-badge"
              onClick={() => setProviderUrlReference(null)}
              title={t("prompt.urlRefActiveTitle")}
              aria-label={t("prompt.urlRefClear")}
            >
              <span className="composer__url-ref-dot" aria-hidden="true" />
              {t("prompt.urlRefActive")}
            </button>
          )}
          {trayItems.length > 0 && (
            <span className="composer__count">
              {t("prompt.refCount", { count: trayItems.length, max: maxRefs })}
            </span>
          )}
        </div>
      </div>

      <ReferenceTray
        items={trayItems}
        limit={maxRefs}
        onRemove={removeTrayItem}
        onAdd={openFilePicker}
      />

      {beforePrompts.length > 0 && (
        <div className="composer__prompt-chips">
          {beforePrompts.map(renderPromptChip)}
        </div>
      )}

      {selectedPresetIds.length > 0 && (
        <ChipRow ariaLabel="Selected presets">
          {selectedPresetIds.map((id) => {
            const preset = getPresetById(id);
            if (!preset) return null;
            return (
              <Chip key={id} onRemove={() => removePreset(id)}>
                {preset.name}
              </Chip>
            );
          })}
        </ChipRow>
      )}

      <div className="composer__prompt-stack">
        <DeadTagMirror prompt={prompt} retiredTags={retiredTags} textareaRef={textareaRef} />
        <textarea
          ref={textareaRef}
          className="prompt-area composer__textarea"
          value={prompt}
          placeholder={placeholder}
          onChange={(e) => {
            setPrompt(e.target.value);
            setMentionQuery(findMentionAtCaret(e.target.value, e.target.selectionStart));
          }}
          onClick={(e) => setMentionQuery(findMentionAtCaret(e.currentTarget.value, e.currentTarget.selectionStart))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void generate();
            }
          }}
        />
      </div>
      <ElementMentionMenu
        open={mentionQuery !== null}
        textareaRef={textareaRef}
        caret={mentionQuery?.end ?? 0}
        query={mentionQuery?.query ?? ""}
        elements={[
          // Tray attachments come first so a deleted @Image_N tag can be
          // re-mentioned; selecting one reinserts the tag without mutating
          // the tray (the tray stays the single source of truth).
          ...trayItems
            .filter((item): item is Extract<typeof item, { kind: "attachment" }> => item.kind === "attachment")
            .map((item) => ({
              id: `${TRAY_MENTION_PREFIX}${item.tokenId}`,
              name: item.tag,
              kind: "reference" as ElementMentionKind,
              thumbnail: item.source.dataUrl,
            })),
          ...elements.map((asset) => {
            const previewPath = elementPreviewPath(asset);
            return {
              id: asset.id,
              name: asset.name,
              kind: (typeof asset.metadata?.elementKind === "string" ? asset.metadata.elementKind : "character") as ElementMentionKind,
              thumbnail: previewPath ? `/generated/${previewPath.split("/").map(encodeURIComponent).join("/")}` : undefined,
              tags: asset.tags,
            };
          }),
        ]}
        onSelect={(element) => {
          if (element.id.startsWith(TRAY_MENTION_PREFIX)) {
            const tokenId = element.id.slice(TRAY_MENTION_PREFIX.length);
            const trayItem = useAppStore.getState().trayItems.find((item) => item.tokenId === tokenId);
            if (trayItem && mentionQuery) {
              insertTagAtMention(trayItem.tag, mentionQuery);
            }
            setMentionQuery(null);
            return;
          }
          addElementId?.(element.id);
          if (mentionQuery) {
            const trayElement = useAppStore.getState().trayItems.find(
              (item) => item.kind === "element" && item.source.elementId === element.id,
            );
            if (trayElement) {
              insertTagAtMention(trayElement.tag, mentionQuery);
            }
          }
          setMentionQuery(null);
        }}
        onClose={() => setMentionQuery(null)}
      />

      {afterPrompts.length > 0 && (
        <div className="composer__prompt-chips composer__prompt-chips--after">
          <span className="composer__prompt-chips-label">{t("prompt.afterBlocks")}</span>
          {afterPrompts.map(renderPromptChip)}
        </div>
      )}

      <PromptComposerToolbar canAddMore={canAddMore} onAttach={openFilePicker} />

      {dragOver && (
        <div className="composer__dropzone" aria-hidden="true">
          {t("prompt.dropHere", { max: maxRefs })}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleImageFiles(files);
          else attachmentCaretRef.current = null;
          e.target.value = "";
        }}
      />
    </div>
  );
}
