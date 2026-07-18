import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import type { Provider } from "../../types";

const CHOICES: { value: Provider; labelKey: string }[] = [
  { value: "oauth", labelKey: "assetGen.modelGpt" },
  { value: "grok", labelKey: "assetGen.modelGrok" },
];

export function AssetGenModelPicker() {
  const { t } = useI18n();
  const provider = useAppStore((s) => s.assetGenProvider);
  const setProvider = useAppStore((s) => s.setAssetGenProvider);
  const normalized: Provider = provider === "grok" || provider === "grok-api" ? "grok" : "oauth";
  return (
    <div className="assetgen-field">
      <span className="assetgen-field__label" id="assetgen-model-label">{t("assetGen.model")}</span>
      <div className="assetgen-bg-picker" role="group" aria-labelledby="assetgen-model-label">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            className={normalized === c.value ? "is-active" : ""}
            aria-pressed={normalized === c.value}
            onClick={() => setProvider(c.value)}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
