import type { TrayItem } from "../../lib/referenceTray";
import { useI18n } from "../../i18n";

type ReferenceTrayProps = {
  items: readonly TrayItem[];
  limit: number;
  onRemove: (tokenId: string) => void;
  onAdd: () => void;
};

function generatedThumbnail(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/generated/")) return path;
  return `/generated/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function trayThumbnail(item: TrayItem): string | undefined {
  if (item.kind === "attachment") return item.source.dataUrl;
  return item.source.thumbnailUrl
    ?? generatedThumbnail(item.source.referenceFilenames[0]);
}

export function ReferenceTray({ items, limit, onRemove, onAdd }: ReferenceTrayProps) {
  const { t } = useI18n();
  const overLimit = items.length > limit;
  const full = items.length >= limit;

  return (
    <div className="composer__tray-wrap">
      <div
        className="composer__tray"
        role="list"
        aria-label={t("prompt.trayAria", { count: items.length, max: limit })}
      >
        {items.map((item, index) => {
          const thumbnail = trayThumbnail(item);
          return (
            <div
              key={item.tokenId}
              className="composer__tray-slot"
              role="listitem"
              aria-label={`@${item.tag}, ${index + 1}/${limit}`}
            >
              <span className="composer__tray-thumbnail">
                {thumbnail ? (
                  <img src={thumbnail} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="composer__tray-thumbnail-empty" aria-hidden="true">@</span>
                )}
                <button
                  type="button"
                  className="composer__tray-remove"
                  onClick={() => onRemove(item.tokenId)}
                  aria-label={`${t("prompt.refRemoveAria", { n: index + 1 })}: @${item.tag}`}
                >
                  ×
                </button>
              </span>
              <span className="composer__tray-tag" title={`@${item.tag}`}>@{item.tag}</span>
            </div>
          );
        })}
        <button
          type="button"
          className="composer__tray-slot composer__tray-slot--add"
          onClick={onAdd}
          disabled={full}
          aria-label={t("prompt.attachTitle")}
          title={t("prompt.attachTitle")}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {overLimit ? (
        <p className="composer__ref-warning" role="alert">
          {t("prompt.refOverProviderLimit", { max: limit, excess: items.length - limit })}
        </p>
      ) : null}
    </div>
  );
}
