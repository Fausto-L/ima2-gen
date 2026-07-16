import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import type { AssetItem } from "../../store/storeTypes";
import type { GenerateItem } from "../../types";
import { clearAllAssets as apiClearAll } from "../../lib/api-assets";
import { assetToPreviewItem } from "../../lib/assetPreview";
import { Select, type SelectItem } from "../controls/Select";
import { AssetMediaLightbox } from "../assetgen/AssetMediaLightbox";
import { KeyingPanel } from "../assetgen/KeyingPanel";
import { AssetsFolderTree } from "./AssetsFolderTree";
import { AssetsGrid } from "./AssetsGrid";
import { ElementDetail, type ElementDefinition, type ElementDraft } from "./ElementDetail";

const kinds = ["image", "video", "element", "preset", "template"] as const;
type KindValue = "" | typeof kinds[number];

export function AssetsWorkspace() {
  const { t } = useI18n();
  const assets = useAppStore((s) => s.assets);
  const tags = useAppStore((s) => s.assetsTags);
  const filters = useAppStore((s) => s.assetsFilters);
  const loading = useAppStore((s) => s.assetsLoading);
  const loadError = useAppStore((s) => s.assetsLoadError);
  const loadAssets = useAppStore((s) => s.loadAssets);
  const setUIMode = useAppStore((s) => s.setUIMode);
  const setFilters = useAppStore((s) => s.setAssetsFilters);
  const updateAssetItem = useAppStore((s) => s.updateAssetItem);
  const deleteAssetItem = useAppStore((s) => s.deleteAssetItem);
  const showToast = useAppStore((s) => s.showToast);
  const [query, setQuery] = useState(filters.q);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<GenerateItem | null>(null);
  const keyingTarget = useAppStore((s) => s.keyingTarget);
  const hadKeyingRef = useRef(false);
  useEffect(() => {
    if (keyingTarget) { hadKeyingRef.current = true; return; }
    if (hadKeyingRef.current) {
      hadKeyingRef.current = false;
      void loadAssets(true);
    }
  }, [keyingTarget, loadAssets]);
  const kindItems = useMemo<SelectItem<KindValue>[]>(() => [
    { value: "", label: t("assets.kindAll") },
    ...kinds.map((k) => ({ value: k, label: t(`assets.kind${k[0].toUpperCase()}${k.slice(1)}`) })),
  ], [t]);
  useEffect(() => { void loadAssets(true); }, [loadAssets]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters({ q: query }), 300); return () => window.clearTimeout(timer); }, [query, setFilters]);
  const filtered = Boolean(filters.q || filters.kind || filters.tag);
  const empty = assets.length === 0 && !loading;
  // The pinned Element Library view (kind=element, no folder/query/tag) gets its
  // own empty state and must be decided BEFORE the generic `filtered` branch —
  // kind alone makes `filtered` true, which would shadow it with emptySearch.
  const elementRootView = filters.kind === "element" && !filters.folderId && !filters.q && !filters.tag;
  const emptyTitle = elementRootView ? "assets.emptyElementsTitle" : filters.folderId ? "assets.emptyFolderTitle" : filtered ? "assets.emptySearchTitle" : "assets.emptyTitle";
  const emptyBody = elementRootView ? "assets.emptyElementsBody" : filters.folderId ? "assets.emptyFolderBody" : filtered ? "assets.emptySearchBody" : "assets.emptyBody";
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedElement = selectedAsset?.kind === "element" ? toElementDefinition(selectedAsset) : null;
  const closeDetail = () => setSelectedAssetId(null);
  const closePreview = useCallback(() => setPreviewItem(null), []);
  const saveElement = async (draft: ElementDraft) => {
    if (!draft.id || !await updateAssetItem(draft.id, { name: draft.name, notes: draft.notes })) showToast(t("assets.actionFailed"), true);
  };
  const deleteElement = async (id: string) => { if (await deleteAssetItem(id)) closeDetail(); else showToast(t("assets.actionFailed"), true); };
  const runTestSheet = async () => showToast("Element test sheets are not available yet.", true);
  return <section className={`assets-workspace${selectedAsset ? " assets-workspace--detail-open" : ""}`} aria-labelledby="assets-title">
    <AssetsFolderTree />
    <main className="assets-workspace__main">
      <header className="assets-toolbar"><div className="assets-toolbar__title"><h1 id="assets-title">{t("assets.title")}</h1><span>{t("assets.itemCount", { count: assets.length })}</span></div>
        <div className="assets-toolbar__controls"><input type="search" value={query} placeholder={t("assets.searchPlaceholder")} aria-label={t("assets.searchPlaceholder")} onChange={(e) => setQuery(e.target.value)} />
          <Select<KindValue> items={kindItems} value={(filters.kind ?? "") as KindValue} onChange={(v) => setFilters({ kind: v || null })} ariaLabel={t("assets.kindAll")} />
          {assets.length > 0 && <button type="button" className="assets-clear-btn" onClick={async () => { if (confirm(t("assets.clearConfirm"))) { await apiClearAll(); void loadAssets(true); } }}>{t("assets.clearAll")}</button>}
        </div>
        {tags.length > 0 && <div className="assets-tag-filter">{tags.map((tag) => <button type="button" key={tag} className={filters.tag === tag ? "is-active" : ""} onClick={() => setFilters({ tag: filters.tag === tag ? null : tag })}>{tag}</button>)}</div>}
      </header>
      {loadError && assets.length === 0 ? (
        <div className="assets-empty" role="alert">
          <h2>{t("assets.loadErrorTitle")}</h2>
          <p>{t("assets.loadErrorBody")}</p>
          <button type="button" className="assets-empty__cta" onClick={() => void loadAssets(true)}>{t("assets.retry")}</button>
        </div>
      ) : empty ? (
        <div className="assets-empty">
          <h2>{t(emptyTitle)}</h2>
          <p>{t(emptyBody)}</p>
          {elementRootView || (!filtered && !filters.folderId) ? (
            <button type="button" className="assets-empty__cta" onClick={() => setUIMode("asset-gen")}>{t("assets.emptyCta")}</button>
          ) : null}
        </div>
      ) : <AssetsGrid selectedId={selectedAssetId ?? undefined} onSelectAsset={setSelectedAssetId} onPreviewAsset={(asset) => setPreviewItem(assetToPreviewItem(asset))} />}
    </main>
    {selectedAsset && <aside className="assets-workspace__detail" aria-label={`${selectedAsset.name} details`}><button type="button" className="assets-workspace__detail-close" onClick={closeDetail} aria-label={t("assets.detailClose")}>×</button>{selectedElement ? <ElementDetail element={selectedElement} saving={false} testing={false} onSave={saveElement} onDelete={deleteElement} onRunTestSheet={runTestSheet} /> : <AssetMetaDetail asset={selectedAsset} />}</aside>}
    <KeyingPanel />
    {previewItem ? <AssetMediaLightbox item={previewItem} onClose={closePreview} /> : null}
  </section>;
}

function AssetMetaDetail({ asset }: { asset: AssetItem }) {
  const { t } = useI18n();
  const prompt = typeof asset.metadata?.prompt === "string" ? asset.metadata.prompt : null;
  const provider = typeof asset.metadata?.provider === "string" ? asset.metadata.provider : null;
  return (
    <div className="assets-workspace__detail-meta">
      <h2>{asset.name}</h2>
      <dl>
        <dt>{t("assets.detailKind")}</dt>
        <dd>{t(`assets.kind${asset.kind[0].toUpperCase()}${asset.kind.slice(1)}`)}</dd>
        <dt>{t("assets.detailCreated")}</dt>
        <dd>{new Date(asset.createdAt).toLocaleString()}</dd>
        {provider ? (<><dt>{t("assets.detailProvider")}</dt><dd>{provider}</dd></>) : null}
        {prompt ? (<><dt>{t("assets.detailPrompt")}</dt><dd className="assets-workspace__detail-prompt">{prompt}</dd></>) : null}
        {asset.tags.length > 0 ? (<><dt>{t("assets.detailTags")}</dt><dd>{asset.tags.join(", ")}</dd></>) : null}
      </dl>
    </div>
  );
}

function toElementDefinition(asset: AssetItem): ElementDefinition {
  const metadata = asset.metadata ?? {};
  const kind = metadata.elementKind;
  const refs = metadata.refs;
  return { id: asset.id, name: asset.name, kind: kind === "product" || kind === "style" || kind === "scene" ? kind : "character", refs: Array.isArray(refs) ? refs.filter((ref): ref is string => typeof ref === "string") : asset.filePath ? [asset.filePath] : [], notes: asset.notes ?? undefined, defaultStrength: typeof metadata.defaultStrength === "number" ? metadata.defaultStrength : undefined };
}
