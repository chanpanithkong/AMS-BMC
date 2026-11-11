import { D, Decimal, type AmountLike } from "./decimal";

// Depreciation schedule (SRS §6.12, BR-FA-001, FR-FA-004). Shared by the asset form preview and the
// mock server. Straight-line: (cost − residual) ÷ months, rounded half-up to cents, the last month
// absorbing the rounding so that accumulated depreciation ends exactly at cost − residual.

export interface DepreciationTerms {
  cost: AmountLike;
  residual_value: AmountLike;
  useful_life_months: number;
  method: "STRAIGHT_LINE" | "DECLINING_BALANCE";
  /** Annual percentage for declining balance. */
  declining_rate?: AmountLike;
  convention: "SAME_MONTH" | "NEXT_MONTH";
  in_service_date: string;
}

export interface ScheduleMonth {
  /** "YYYY-MM". */
  period: string;
  amount: Decimal;
  accumulated: Decimal;
  nbv: Decimal;
}

const cents = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function addMonths(period: string, n: number): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/** First month that carries depreciation. */
export function firstPeriod(terms: Pick<DepreciationTerms, "convention" | "in_service_date">): string {
  const month = terms.in_service_date.slice(0, 7);
  return terms.convention === "NEXT_MONTH" ? addMonths(month, 1) : month;
}

export function schedule(terms: DepreciationTerms): ScheduleMonth[] {
  const cost = D(terms.cost);
  const residual = D(terms.residual_value);
  const life = Math.max(0, Math.trunc(terms.useful_life_months));
  const depreciable = cost.minus(residual);
  if (life === 0 || depreciable.lte(0) || !/^\d{4}-\d{2}/.test(terms.in_service_date)) return [];
  const start = firstPeriod(terms);
  const out: ScheduleMonth[] = [];
  let accumulated = new Decimal(0);
  const monthly = cents(depreciable.div(life));
  const monthlyRate = D(terms.declining_rate).div(100).div(12);
  for (let i = 0; i < life; i += 1) {
    const nbv = cost.minus(accumulated);
    let amount: Decimal;
    if (i === life - 1) amount = depreciable.minus(accumulated);
    else if (terms.method === "DECLINING_BALANCE") amount = Decimal.min(cents(nbv.times(monthlyRate)), nbv.minus(residual));
    else amount = Decimal.min(monthly, depreciable.minus(accumulated));
    if (amount.lt(0)) amount = new Decimal(0);
    accumulated = accumulated.plus(amount);
    out.push({ period: addMonths(start, i), amount, accumulated, nbv: cost.minus(accumulated) });
    if (accumulated.gte(depreciable)) break;
  }
  return out;
}

/** Accumulated depreciation by the end of a period ("YYYY-MM"), per the schedule. */
export function accumulatedThrough(terms: DepreciationTerms, period: string): Decimal {
  return schedule(terms).filter((m) => m.period <= period).reduce((s, m) => s.plus(m.amount), new Decimal(0));
}

/** Amount for one period, or zero. */
export function amountFor(terms: DepreciationTerms, period: string): Decimal {
  return schedule(terms).find((m) => m.period === period)?.amount ?? new Decimal(0);
}
