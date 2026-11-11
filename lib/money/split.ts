import { D, Decimal, currencyDecimals, type AmountLike } from "./decimal";

/**
 * Split a total by percentages. Each line is rounded to the currency's minor unit and the last line
 * takes the rounding remainder, so the lines always sum exactly to the total (FR-EXP-005, AT-EXP-02).
 * Returns null when the percentages do not add up to 100.
 */
export function splitByPercent(total: AmountLike, percents: AmountLike[], currency: string): string[] | null {
  if (!percents.length) return null;
  const sumPercent = percents.reduce<Decimal>((s, p) => s.plus(D(p)), new Decimal(0));
  if (!sumPercent.eq(100)) return null;
  const dp = currencyDecimals(currency);
  const amount = D(total);
  const out: string[] = [];
  let used = new Decimal(0);
  percents.forEach((p, i) => {
    const share = i === percents.length - 1 ? amount.minus(used) : amount.times(D(p)).div(100).toDecimalPlaces(dp);
    used = used.plus(share);
    out.push(share.toFixed(dp));
  });
  return out;
}

/** Sum of amounts as a Decimal. */
export function total(values: AmountLike[]): Decimal {
  return values.reduce<Decimal>((s, v) => s.plus(D(v)), new Decimal(0));
}
