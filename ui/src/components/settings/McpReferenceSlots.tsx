import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useI18n } from "../../i18n";
import {
  emptyMcpReferenceSelection,
  isValidMcpReferenceTag,
  type McpReferenceItem,
  type McpReferenceSelection,
} from "../../lib/mcpSelection";
import { readFileAsDataURL } from "../../lib/image";
import { isVideoItem } from "../../lib/videoMedia";
import { setMcpReferenceSelectionImpl } from "../../store/storeSettingsImpl";
import { useAppStore } from "../../store/useAppStore";
import type { AssetItem } from "../../store/storeTypes";
import type { GenerateItem } from "../../types";
import { Select, type SelectItem } from "../controls/Select";

const EMPTY_VALUE = "";
const IMAGE_REFERENCE_LIMIT = 3;

type Props = {
  inputRoles: readonly string[];
  disabled?: boolean;
};

type MediaCandidate = {
  filename: string;
  current: boolean;
  label?: string;
  source?: "asset" | "element" | "local";
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function mediaCandidates(
  history: GenerateItem[],
  currentImage: GenerateItem | null,
  assets: AssetItem[],
  video: boolean,
): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const seen = new Set<string>();
  for (const item of [currentImage, ...history]) {
    if (!item?.filename || seen.has(item.filename) || isVideoItem(item) !== video) continue;
    if (video && !/\.(?:mp4|mov)$/i.test(item.filename)) continue;
    seen.add(item.filename);
    candidates.push({ filename: item.filename, current: item === currentImage });
  }
  for (const asset of assets) {
    const filename = asset.filePath;
    const kindMatches = video ? asset.kind === "video" : asset.kind === "image" || asset.kind === "element";
    const extensionMatches = video ? /\.(?:mp4|mov)$/i.test(filename ?? "") : /\.(?:png|jpe?g|webp)$/i.test(filename ?? "");
    if (!filename || !kindMatches || !extensionMatches || seen.has(filename)) continue;
    seen.add(filename);
    candidates.push({
      filename,
      current: false,
      label: asset.name || filename,
      source: asset.kind === "element" ? "element" : "asset",
    });
  }
  return candidates;
}

function referenceAt(references: McpReferenceItem[], index: number): McpReferenceItem | null {
  return references[index] ?? null;
}

function mediaOptions(candidates: MediaCandidate[], selected: string, t: Translate): SelectItem<string>[] {
  const selectedKnown = !selected || candidates.some((candidate) => candidate.filename === selected);
  return [
    { value: EMPTY_VALUE, label: t("mcp.referenceNone") },
    ...(!selectedKnown ? [{ value: selected, label: selected, sub: t("mcp.referenceMissing") }] : []),
    ...candidates.map((candidate) => ({
      value: candidate.filename,
      label: candidate.label ?? candidate.filename,
      sub: candidate.current
        ? t("mcp.referenceCurrent")
        : candidate.source ? t(`mcp.referenceSource.${candidate.source}`) : undefined,
    })),
  ];
}

function FrameSlot({ id, label, value, candidates, disabled, title, help, onChange, t }: {
  id: string;
  label: string;
  value: string | null;
  candidates: MediaCandidate[];
  disabled?: boolean;
  title?: string;
  help?: string;
  onChange: (filename: string) => void;
  t: Translate;
}) {
  return (
    <div className="mcp-reference-slot">
      <label className="mcp-reference-slot__label" htmlFor={id}>{label}</label>
      <Select id={id} items={mediaOptions(candidates, value ?? "", t)} value={value ?? ""}
        onChange={onChange} ariaLabel={label} placeholder={t("mcp.referenceSelect")}
        disabled={disabled} title={title} portal />
      {help ? <p className="option-help">{help}</p> : null}
    </div>
  );
}

function ImageReferenceRow({ index, images, selection, disabled, onChange, t }: {
  index: number;
  images: MediaCandidate[];
  selection: McpReferenceSelection;
  disabled?: boolean;
  onChange: (next: McpReferenceSelection) => void;
  t: Translate;
}) {
  const reference = referenceAt(selection.references, index);
  const used = new Set(selection.references.filter((_item, itemIndex) => itemIndex !== index).map((item) => item.filename));
  const localCandidate: MediaCandidate | null = reference?.dataUrl ? {
    filename: reference.filename,
    current: false,
    label: reference.displayName ?? t("mcp.referenceLocalFallback"),
    source: "local",
  } : null;
  const available = [...(localCandidate ? [localCandidate] : []), ...images.filter((candidate) => !used.has(candidate.filename))];
  const updateFilename = (filename: string) => {
    const references = [...selection.references];
    if (!filename) references.splice(index, 1);
    else references[index] = { filename, ...(reference?.tag ? { tag: reference.tag } : {}) };
    onChange({ ...selection, references });
  };
  const updateTag = (tag: string) => {
    if (!reference) return;
    const references = [...selection.references];
    const { tag: _previousTag, ...rest } = reference;
    references[index] = { ...rest, ...(tag ? { tag } : {}) };
    onChange({ ...selection, references });
  };
  const invalidTag = Boolean(reference?.tag && !isValidMcpReferenceTag(reference.tag));
  const errorId = `mcp-reference-tag-error-${index}`;
  return (
    <div className="mcp-reference-slot__reference">
      <Select items={mediaOptions(available, reference?.filename ?? "", t)} value={reference?.filename ?? ""}
        onChange={updateFilename} ariaLabel={t("mcp.imageReferenceAria", { index: index + 1 })}
        placeholder={t("mcp.referenceSelect")} disabled={disabled} portal />
      <div>
        <input type="text" value={reference?.tag ?? ""} onChange={(event) => updateTag(event.target.value)}
          aria-label={t("mcp.referenceTagAria", { index: index + 1 })} placeholder={t("mcp.referenceTagPlaceholder")}
          aria-invalid={invalidTag} aria-describedby={invalidTag ? errorId : undefined}
          maxLength={32} disabled={disabled || !reference} />
        {invalidTag ? <p id={errorId} className="settings-row__microcopy" role="alert">{t("mcp.referenceTagInvalid")}</p> : null}
      </div>
    </div>
  );
}

function LocalReferenceUpload({ selection, disabled, onChange, t }: {
  selection: McpReferenceSelection;
  disabled?: boolean;
  onChange: (next: McpReferenceSelection) => void;
  t: Translate;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const full = selection.references.length >= IMAGE_REFERENCE_LIMIT;
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
      setError(t("mcp.referenceLocalInvalidType"));
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const localId = `local:${globalThis.crypto.randomUUID()}`;
      onChange({
        ...selection,
        references: [...selection.references, { filename: localId, displayName: file.name, dataUrl }],
      });
      setError(null);
    } catch {
      setError(t("mcp.referenceLocalReadFailed"));
    }
  };
  return (
    <div>
      <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void onFile(event)} disabled={disabled || full} />
      <button type="button" className="option-btn" onClick={() => inputRef.current?.click()} disabled={disabled || full}>
        {t("mcp.referenceAttachLocal")}
      </button>
      <p className="option-help">{t("mcp.referenceAttachHelp")}</p>
      {error ? <p className="settings-row__microcopy" role="alert">{error}</p> : null}
    </div>
  );
}

function ImageReferenceSlots({ images, selection, disabled, onChange, t }: {
  images: MediaCandidate[];
  selection: McpReferenceSelection;
  disabled?: boolean;
  onChange: (next: McpReferenceSelection) => void;
  t: Translate;
}) {
  return (
    <div className="mcp-reference-slot">
      <div className="mcp-reference-slot__label">{t("mcp.imageReferencesLabel")}</div>
      {Array.from({ length: IMAGE_REFERENCE_LIMIT }, (_, index) => (
        <ImageReferenceRow key={index} index={index} images={images} selection={selection}
          disabled={disabled} onChange={onChange} t={t} />
      ))}
      <LocalReferenceUpload selection={selection} disabled={disabled} onChange={onChange} t={t} />
    </div>
  );
}

export function McpReferenceSlots({ inputRoles, disabled }: Props) {
  const { t } = useI18n();
  const history = useAppStore((state) => state.history);
  const currentImage = useAppStore((state) => state.currentImage);
  const assets = useAppStore((state) => state.assets);
  const selection = useAppStore((state) => state.mcpReferenceSelection) ?? emptyMcpReferenceSelection();
  const images = useMemo(() => mediaCandidates(history, currentImage, assets, false), [history, currentImage, assets]);
  const videos = useMemo(() => mediaCandidates(history, currentImage, assets, true), [history, currentImage, assets]);
  const update = (next: McpReferenceSelection) => setMcpReferenceSelectionImpl(next, useAppStore.setState, useAppStore.getState);
  const endHelp = !selection.startFrameFilename ? t("mcp.endFrameNeedsStart") : undefined;
  return (
    <div className="mcp-reference-slots">
      {inputRoles.includes("start_image") ? <FrameSlot id="mcp-start-frame" label={t("mcp.startFrameLabel")}
        value={selection.startFrameFilename} candidates={images} disabled={disabled} t={t}
        onChange={(filename) => update({ ...selection, startFrameFilename: filename || null, ...(!filename ? { endFrameFilename: null } : {}) })} /> : null}
      {inputRoles.includes("end_image") ? <FrameSlot id="mcp-end-frame" label={t("mcp.endFrameLabel")}
        value={selection.endFrameFilename} candidates={images} disabled={disabled || !selection.startFrameFilename}
        title={endHelp} help={endHelp} t={t} onChange={(filename) => update({ ...selection, endFrameFilename: filename || null })} /> : null}
      {inputRoles.includes("image_references") ? <ImageReferenceSlots images={images} selection={selection}
        disabled={disabled} onChange={update} t={t} /> : null}
      {inputRoles.includes("video_references") ? <FrameSlot id="mcp-video-reference" label={t("mcp.videoReferenceLabel")}
        value={selection.referenceVideoFilename} candidates={videos} disabled={disabled} t={t}
        help={t("mcp.videoReferenceCostNote")} onChange={(filename) => update({ ...selection, referenceVideoFilename: filename || null })} /> : null}
    </div>
  );
}
