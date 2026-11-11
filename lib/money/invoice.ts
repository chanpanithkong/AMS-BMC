import { D, Decimal, currencyDecimals, type AmountLike } from "./decimal";

// Invoice line and document totals (SRS FR-AR-003, FR-AP-004, BR-TAX-001..003, AT-TAX-02).
// Shared by the form (live totals) and the mock server (authoritative figures), so both agree.

export interface TaxTerms {
  /** Percentage, e.g. "10" for 10 %. */
  rate: AmountLike;
  method: "EXCLUSIVE" | "INCLUSIVE";
}

export interface LineInput {
  quantity: AmountLike;
  unit_price: AmountLike;
  discount: AmountLike;
}

export interface LineAmounts {
  /** Quantity × price, before discount. */
  gross: Decimal;
  discount: Decimal;
  /** Amount without tax. */
  net: Decimal;
  tax: Decimal;
  /** Amount the customer pays for the line. */
  total: Decimal;
}

const round = (value: Decimal, currency: string) => value.toDecimalPlaces(currencyDecimals(currency), Decimal.ROUND_HALF_UP);

/**
 * One line: exclusive tax is added on top of the discounted amount; inclusive tax is extracted from
 * it (110 at 10 % inclusive → tax 10, net 100). Rounded half-up per line to the currency's minor unit.
 */
export function lineAmounts(line: LineInput, tax: TaxTerms | null, currency: string): LineAmounts {
  const gross = round(D(line.quantity).times(D(line.unit_price)), currency);
  const discount = round(D(line.discount), currency);
  const amount = gross.minus(discount);
  const rate = D(tax?.rate);
  if (!tax || rate.isZero()) return { gross, discount, net: amount, tax: new Decimal(0), total: amount };
  if (tax.method === "INCLUSIVE") {
    const taxAmount = round(amount.times(rate).div(rate.plus(100)), currency);
    return { gross, discount, net: amount.minus(taxAmount), tax: taxAmount, total: amount };
  }
  const taxAmount = round(amount.times(rate).div(100), currency);
  return { gross, discount, net: amount, tax: taxAmount, total: amount.plus(taxAmount) };
}

export interface DocumentTotals {
  subtotal: Decimal;
  discount: Decimal;
  net: Decimal;
  tax: Decimal;
  total: Decimal;
}

export function documentTotals(lines: LineAmounts[]): DocumentTotals {
  const zero = new Decimal(0);
  return lines.reduce(
    (acc, l) => ({
      subtotal: acc.subtotal.plus(l.gross), discount: acc.discount.plus(l.discount), net: acc.net.plus(l.net),
      tax: acc.tax.plus(l.tax), total: acc.total.plus(l.total),
    }),
    { subtotal: zero, discount: zero, net: zero, tax: zero, total: zero },
  );
}

/** Rate of an effective-dated tax code on a date (BR-TAX-002); null when none is in force. */
export function rateOn<T extends { rate: string; effective_from: string; effective_to: string | null }>(rates: T[], date: string): T | null {
  return rates.find((r) => r.effective_from <= date && (!r.effective_to || date <= r.effective_to)) ?? null;
}

/** Due date = document date + payment terms in days (BR-AP-002). */
export function addDays(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const t = Date.parse(`${date}T00:00:00Z`) + Math.trunc(days || 0) * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "over_90";

/** Aging bucket by days past the due date (SRS §15.3: current, 1–30, 31–60, 61–90, over 90). */
export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const late = daysBetween(dueDate, asOf);
  if (late <= 0) return "current";
  if (late <= 30) return "d1_30";
  if (late <= 60) return "d31_60";
  if (late <= 90) return "d61_90";
  return "over_90";
}

/**
 * Supplier invoice number as compared for duplicates (BR-AP-001): case, spaces and punctuation are
 * ignored and leading zeros dropped from each run of digits, so "inv 001" matches "INV-001".
 */
export function normaliseInvoiceNo(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ""));
}
