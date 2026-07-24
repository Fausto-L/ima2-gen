import { useAppStore } from "../store/useAppStore";
import { useI18n } from "../i18n";
import { SUPPORTED_CURRENCIES, type Currency } from "../lib/currency";

const LABEL: Record<Currency, string> = { CNY: "¥ CNY", USD: "$ USD" };

export function CurrencyToggle() {
  const { t } = useI18n();
  const currency = useAppStore((s) => s.currency);
  const setCurrency = useAppStore((s) => s.setCurrency);

  return (
    <div className="lang-toggle" role="group" aria-label={t("settings.currency.aria")}>
      {SUPPORTED_CURRENCIES.map((c) => (
        <button
          key={c}
          type="button"
          className={`lang-toggle__btn ${currency === c ? "is-active" : ""}`}
          onClick={() => setCurrency(c)}
          aria-pressed={currency === c}
          title={c === "CNY" ? "人民币" : "US Dollar"}
        >
          <span className="lang-toggle__label">{LABEL[c]}</span>
        </button>
      ))}
    </div>
  );
}
