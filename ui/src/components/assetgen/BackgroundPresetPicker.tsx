import { useI18n } from "../../i18n";
import { useAppStore } from "../../store/useAppStore";
import type { AssetGenBackgroundPreset } from "../../types";

const PRESETS: { value: AssetGenBackgroundPreset; swatch: string; labelKey: string }[] = [
  { value: "chroma-green", swatch: "#00c853", labelKey: "assetGen.bgChroma" },
  { value: "white", swatch: "#ffffff", labelKey: "assetGen.bgWhite" },
  { value: "black", swatch: "#111111", labelKey: "assetGen.bgBlack" },
];

export function BackgroundPresetPicker() {
  const { t } = useI18n();
  const value = useAppStore((s) => s.assetGenBackground);
  const setValue = useAppStore((s) => s.setAssetGenBackground);
  return (
    <div className="assetgen-field">
      <span className="assetgen-field__label" id="assetgen-bg-label">{t("assetGen.background")}</span>
      <div className="assetgen-bg-picker" role="group" aria-labelledby="assetgen-bg-label">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={value === p.value ? "is-active" : ""}
            aria-pressed={value === p.value}
            onClick={() => setValue(p.value)}
          >
            <span className="assetgen-bg-picker__swatch" style={{ background: p.swatch }} aria-hidden="true" />
            {t(p.labelKey)}
          </button>
        ))}
      </div>
      <p className="assetgen-field__hint">{t("assetGen.backgroundHint")}</p>
    </div>
  );
}
