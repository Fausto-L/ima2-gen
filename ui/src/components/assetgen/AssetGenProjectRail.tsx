import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import { getAssets } from "../../lib/api-assets";
import { assetMediaUrl, assetToPreviewItem } from "../../lib/assetPreview";
import type { AssetItem } from "../../store/storeTypes";
import type { GenerateItem } from "../../types";

const RAIL_LIMIT = 48;

type Props = {
  selectedAssetId: string | null;
  onPreview: (item: GenerateItem, assetId: string) => void;
};

/** Vertical gallery column showing the selected project's saved assets. */
export function AssetGenProjectRail({ selectedAssetId, onPreview }: Props) {
  const { t } = useI18n();
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const itemCount = useAppStore((s) => s.assetGenItems.length);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stale = false;
    getAssets({ kind: null, folderId: selectedProjectId, tag: null, q: "", limit: RAIL_LIMIT })
      .then((page) => {
        if (stale) return;
        setAssets(page.assets.filter((asset) => asset.filePath && (asset.kind === "image" || asset.kind === "video")));
        setFailed(false);
      })
      .catch(() => { if (!stale) setFailed(true); });
    return () => { stale = true; };
  }, [selectedProjectId, itemCount]);

  return (
    <aside className="assetgen-rail" aria-label={t("assetGen.railTitle")}>
      <h2 className="assetgen-rail__title">{t("assetGen.railTitle")}</h2>
      {failed ? (
        <p className="assetgen-rail__empty">{t("assetGen.railError")}</p>
      ) : assets.length === 0 ? (
        <p className="assetgen-rail__empty">{t("assetGen.railEmpty")}</p>
      ) : (
        <div className="assetgen-rail__list" role="listbox" aria-label={t("assetGen.railTitle")}>
          {assets.map((asset) => {
            const url = asset.filePath ? assetMediaUrl(asset.filePath) : null;
            if (!url) return null;
            const selected = selectedAssetId === asset.id;
            return (
              <button
                key={asset.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`assetgen-rail__tile${selected ? " is-selected" : ""}`}
                title={asset.name}
                onClick={() => onPreview(assetToPreviewItem(asset), asset.id)}
              >
                {asset.kind === "video" ? (
                  <video src={url} muted playsInline preload="metadata" aria-hidden="true" />
                ) : (
                  <img src={url} alt="" loading="lazy" decoding="async" />
                )}
                <span className="assetgen-rail__name">{asset.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
