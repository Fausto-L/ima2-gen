import { useEffect, type ClipboardEvent } from "react";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";

type AddFilesAtCaret = (files: File[], caret: number, inspectMetadata: boolean) => Promise<number>;

type UsePromptPasteOptions = {
  maxRefs: number;
  trayItemCount: number;
  captureAttachmentCaret: () => number;
  addFilesAtCaret: AddFilesAtCaret;
};

export function extractClipboardImages(items: DataTransferItemList | null): File[] {
  if (!items) return [];
  return Array.from(items).flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}

export function usePromptPaste(options: UsePromptPasteOptions) {
  const { maxRefs, trayItemCount, captureAttachmentCaret, addFilesAtCaret } = options;
  const { t } = useI18n();

  const addPastedFiles = async (files: File[], caret: number): Promise<void> => {
    const room = Math.max(0, maxRefs - trayItemCount);
    if (room === 0) {
      useAppStore.getState().showToast(t("toast.refLimitTrayFull", { max: maxRefs }), true);
      return;
    }
    const accepted = files.slice(0, room);
    const added = await addFilesAtCaret(accepted, caret, false);
    if (files.length > accepted.length) {
      useAppStore.getState().showToast(
        t("toast.refLimitPartial", { added, total: files.length, max: maxRefs }),
        false,
      );
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const files = extractClipboardImages(e.clipboardData?.items ?? null);
    if (files.length === 0) return;
    e.preventDefault();
    void addPastedFiles(files, captureAttachmentCaret());
  };

  useEffect(() => {
    const handler = (e: globalThis.ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (["INPUT", "TEXTAREA"].includes(target?.tagName ?? "") || target?.isContentEditable) return;
      const files = extractClipboardImages(e.clipboardData?.items ?? null);
      if (files.length === 0) return;
      e.preventDefault();
      void addPastedFiles(files, useAppStore.getState().prompt.length);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [addFilesAtCaret, maxRefs, t, trayItemCount]);

  return onPaste;
}
