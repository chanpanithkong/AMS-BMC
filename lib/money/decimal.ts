import Decimal from "decimal.js";

// Money never touches JS floats: amounts are decimal strings on the wire (SRS §13.1)
// and Decimal objects in calculations. Rounding is half-up (SRS BR-FX-005, D-18).
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export type AmountLike = string | Decimal | null | undefined;

/**
 * Decimals kept for exchange rates (base units per one transaction unit). SRS BR-FX-005 proposes 8;
 * 12 is used so that a rate quoted the other way round (4,105 KHR per USD) reads back exactly.
 * See docs/DECISIONS.md D-P2-07.
 */
export const RATE_DECIMALS = 12;

const DEFAULT_DECIMALS: Record<string, number> = { USD: 2, KHR: 0, JPY: 0, VND: 0, EUR: 2, THB: 2, CNY: 2 };
const decimalsOverride: Record<string, number> = {};

/** Register currency precision from the currencies endpoint (settings can override defaults). */
export function registerCurrencyDecimals(map: Record<string, number>) {
  Object.assign(decimalsOverride, map);
}

export function currencyDecimals(currency: string): number {
  return decimalsOverride[currency] ?? DEFAULT_DECIMALS[currency] ?? 2;
}

const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

export function isAmountString(value: unknown): value is string {
  return typeof value === "string" && AMOUNT_RE.test(value);
}

/** Convert to Decimal; empty or invalid input counts as zero. */
export function D(value: AmountLike): Decimal {
  if (value instanceof Decimal) return value;
  if (!value || !isAmountString(value)) return new Decimal(0);
  return new Decimal(value);
}

export function sum(values: AmountLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0));
}

/** Round to the currency's minor unit and return a wire string, e.g. "1250.00" or "4100000". */
export function toWire(value: AmountLike, currency: string): string {
  return D(value).toFixed(currencyDecimals(currency));
}

/**
 * Clean text typed or pasted into an amount field.
 * Accepts thousands separators, spaces, currency symbols and (1,250.00) brackets.
 * Returns a plain decimal string, "" for empty input, or null when the text is not a number.
 */
export function parseAmountInput(raw: string, opts: { allowNegative?: boolean } = {}): string | null {
  let text = raw.trim();
  if (text === "") return "";
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[\s,$៛ ]/g, "").replace(/[A-Za-z]{3}$/, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }
  if (text.startsWith(".")) text = "0" + text;
  if (text.endsWith(".")) text = text.slice(0, -1);
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  if (negative && !opts.allowNegative) return null;
  const normal = new Decimal(text).toFixed();
  return negative && normal !== "0" ? "-" + normal : normal;
}

/**
 * Convert a transaction-currency amount to base currency.
 * The rate is base units per one unit of transaction currency (SRS §6.16).
 */
export function toBase(amount: AmountLike, rate: AmountLike, baseCurrency: string): Decimal {
  return D(amount).times(D(rate)).toDecimalPlaces(currencyDecimals(baseCurrency));
}

/** Inverse of a rate, for display only ("1 USD = 4,100 KHR"). */
export function inverseRate(rate: AmountLike, places = 4): Decimal | null {
  const r = D(rate);
  if (r.isZero()) return null;
  return new Decimal(1).div(r).toDecimalPlaces(places);
}
