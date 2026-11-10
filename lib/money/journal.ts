import { D, Decimal, toBase } from "./decimal";

/** One editable line of a journal (SRS SCR-04). Amounts are decimal strings; "" means empty. */
export interface JournalLineDraft {
  key: string;
  account_id: string | null;
  description: string;
  debit: string;
  credit: string;
  currency: string;
  /** Base units per one unit of the line currency; "1" when the currency is the base currency. */
  rate: string;
  branch_id: string | null;
  department_id: string | null;
  dimensions: Record<string, string | null>;
}

export interface JournalTotals {
  debit: Decimal;
  credit: Decimal;
  /** debit − credit, in base currency. */
  difference: Decimal;
  balanced: boolean;
  /** Lines that carry an amount. */
  filledLines: number;
}

let lineCounter = 0;

export function emptyJournalLine(currency: string, overrides: Partial<JournalLineDraft> = {}): JournalLineDraft {
  lineCounter += 1;
  return {
    key: `line-${Date.now().toString(36)}-${lineCounter}`,
    account_id: null,
    description: "",
    debit: "",
    credit: "",
    currency,
    rate: "1",
    branch_id: null,
    department_id: null,
    dimensions: {},
    ...overrides,
  };
}

/**
 * Preview totals in base currency. This is a convenience only: the server recalculates and its
 * numbers are authoritative (SRS §13.5).
 */
export function journalTotals(lines: JournalLineDraft[], baseCurrency: string): JournalTotals {
  let debit = new Decimal(0);
  let credit = new Decimal(0);
  let filledLines = 0;
  for (const line of lines) {
    const rate = line.currency === baseCurrency ? "1" : line.rate;
    const d = toBase(line.debit, rate, baseCurrency);
    const c = toBase(line.credit, rate, baseCurrency);
    if (!d.isZero() || !c.isZero()) filledLines += 1;
    debit = debit.plus(d);
    credit = credit.plus(c);
  }
  const difference = debit.minus(credit);
  return { debit, credit, difference, balanced: difference.isZero() && filledLines >= 2, filledLines };
}

export type JournalLineIssue = "both_sides" | "no_account" | "missing_rate";

/** Client-side hints shown next to a line; the server decides (SRS §12.2 Forms). */
export function journalLineIssues(line: JournalLineDraft, baseCurrency: string): JournalLineIssue[] {
  const issues: JournalLineIssue[] = [];
  const hasDebit = !D(line.debit).isZero();
  const hasCredit = !D(line.credit).isZero();
  if (hasDebit && hasCredit) issues.push("both_sides");
  if ((hasDebit || hasCredit) && !line.account_id) issues.push("no_account");
  if ((hasDebit || hasCredit) && line.currency !== baseCurrency && D(line.rate).lte(0)) issues.push("missing_rate");
  return issues;
}
