export type Currency = "CNY" | "USD";

export const SUPPORTED_CURRENCIES: readonly Currency[] = ["CNY", "USD"];

export const CURRENCY_STORAGE_KEY = "ima2.currency";

// Approximate exchange rate (USD → CNY). Updated periodically.
const USD_TO_CNY = 7.2;

const CURRENCY_SYMBOL: Record<Currency, string> = {
  CNY: "¥",
  USD: "$",
};

export function loadCurrency(): Currency {
  try {
    const raw = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (raw === "CNY" || raw === "USD") return raw;
  } catch {
    /* storage disabled */
  }
  // Default to CNY for zh locale, USD otherwise
  try {
    const locale = localStorage.getItem("ima2.locale");
    if (locale === "zh") return "CNY";
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined") {
    const nav = navigator.language || "";
    if (nav.toLowerCase().startsWith("zh")) return "CNY";
  }
  return "CNY";
}

export function saveCurrency(currency: Currency): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    /* storage disabled */
  }
}

/** Convert a USD amount to the target currency. */
export function convertFromUsd(usdAmount: number, currency: Currency): number {
  return currency === "CNY" ? usdAmount * USD_TO_CNY : usdAmount;
}

/** Format a USD-base price in the target currency with appropriate symbol and decimals. */
export function formatPrice(usdAmount: number, currency: Currency): string {
  const converted = convertFromUsd(usdAmount, currency);
  const symbol = CURRENCY_SYMBOL[currency];
  if (currency === "CNY") {
    // Chinese convention: symbol before number, 2-3 decimals for small amounts
    const decimals = converted < 1 ? 3 : converted < 10 ? 2 : 2;
    return `${symbol}${converted.toFixed(decimals)}`;
  }
  const decimals = converted < 1 ? 3 : converted < 10 ? 3 : 2;
  return `${symbol}${converted.toFixed(decimals)}`;
}
