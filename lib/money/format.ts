import { D, RATE_DECIMALS, currencyDecimals, type AmountLike } from "./decimal";

export type NegativeStyle = "brackets" | "minus";

export interface FormatAmountOptions {
  /** How negative numbers are shown; a per-user preference (SRS §14.1). */
  negative?: NegativeStyle;
  /** Append the currency code, e.g. "1,250.00 USD". */
  withCode?: boolean;
  /** Override the number of decimals (rates use more than the currency's minor unit). */
  decimals?: number;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Format a decimal string without ever converting to a JS number. */
export function formatDecimal(value: AmountLike, decimals: number, negative: NegativeStyle = "brackets"): string {
  const d = D(value);
  const fixed = d.abs().toFixed(decimals);
  const [intPart, fraction] = fixed.split(".");
  const body = groupThousands(intPart) + (fraction ? "." + fraction : "");
  const isNegative = d.isNegative() && !d.toDecimalPlaces(decimals).isZero();
  if (!isNegative) return body;
  return negative === "brackets" ? `(${body})` : `-${body}`;
}

export function formatAmount(value: AmountLike, currency: string, opts: FormatAmountOptions = {}): string {
  const text = formatDecimal(value, opts.decimals ?? currencyDecimals(currency), opts.negative);
  return opts.withCode ? `${text} ${currency}` : text;
}

/** Format an exchange rate: up to RATE_DECIMALS decimals, trailing zeros trimmed to at least 2. */
export function formatRate(rate: AmountLike): string {
  const fixed = D(rate).toFixed(RATE_DECIMALS);
  const trimmed = fixed.replace(/0+$/, "");
  const [intPart, fraction = ""] = trimmed.split(".");
  return groupThousands(intPart) + "." + fraction.padEnd(2, "0");
}
