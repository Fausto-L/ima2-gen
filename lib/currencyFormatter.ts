import { USD_TO_CNY } from "./costTable.js";
import type { StatsCurrency } from "./statsTypes.js";

const CURRENCY_SYMBOL: Record<StatsCurrency, string> = {
  CNY: "¥",
  USD: "$",
};

export function convertFromUsd(usdAmount: number, currency: StatsCurrency): number {
  return currency === "CNY" ? usdAmount * USD_TO_CNY : usdAmount;
}

export function formatPrice(usdAmount: number, currency: StatsCurrency): string {
  const converted = convertFromUsd(usdAmount, currency);
  const symbol = CURRENCY_SYMBOL[currency];
  const decimals = converted < 1 ? 3 : 2;
  return `${symbol}${converted.toFixed(decimals)}`;
}
