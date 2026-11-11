import type { IsoDate, IsoDateTime, Money } from "./common";

// Report documents for SCR-15. Every report in the catalogue comes back in this one shape, so the
// viewer, print and CSV export all render the same figures (FR-RPT-016, AT-RPT-03).

export type ReportColumnKind = "text" | "amount" | "number" | "percent" | "date";

export interface ReportColumn {
  key: string;
  label: string;
  label_km: string;
  kind: ReportColumnKind;
  /** Currency of an amount column; every amount column header carries it. */
  currency?: string;
}

/** Where a row leads when clicked (drill-down, SCR-15). */
export interface ReportDrill {
  type: "account" | "journal" | "customer_invoice" | "supplier_invoice" | "customer" | "supplier" | "cash_account" | "reconciliation" | "report" | "asset";
  id: string;
  /** For "account": the date range to open the GL inquiry with. */
  date_from?: IsoDate;
  date_to?: IsoDate;
}

export interface ReportRow {
  id: string;
  /** Rows with a parent are inside an expandable group. */
  parent_id: string | null;
  kind: "section" | "line" | "subtotal" | "total" | "note";
  label: string;
  label_km: string;
  /** Account or document code shown before the label. */
  code?: string;
  values: Record<string, string | null>;
  drill?: ReportDrill;
  /** Shows the formula, e.g. on ratios (RPT-29). */
  formula?: string;
  formula_km?: string;
}

export interface ReportCheck {
  ok: boolean;
  message: string;
  message_km: string;
}

export interface ReportDocument {
  /** Catalogue id, e.g. "RPT-04". */
  report_id: string;
  slug: string;
  title: string;
  title_km: string;
  /** Period text, e.g. "01/01/2027 – 31/03/2027" or "As of 31/03/2027", built by the client from these. */
  date_from: IsoDate | null;
  date_to: IsoDate;
  basis: "ACCRUAL";
  currency: string;
  branch_id: string | null;
  department_id: string | null;
  generated_at: IsoDateTime;
  generated_by: string;
  /** BR-RPT-001: true only when the user asked for unposted documents; the viewer shows a banner. */
  includes_unposted: boolean;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** BR-RPT-003 validations, e.g. "Assets equal liabilities plus equity". */
  checks: ReportCheck[];
  notes: { message: string; message_km: string }[];
}

export interface ReportParams {
  date_from?: IsoDate;
  date_to?: IsoDate;
  as_of?: IsoDate;
  branch_id?: string;
  department_id?: string;
  /** Comparative column: prior period of the same length, or the same period last year (FR-RPT-015). */
  compare?: "" | "prior_period" | "prior_year";
  include_unposted?: boolean;
  /** RPT-14 grouping. */
  group?: "month" | "quarter";
  /** RPT-22 filter. */
  status?: string;
}

// SCR-02 dashboard widgets (SRS §6.19). Each comes from its own call so that each has its own
// loading, error and retry state.

export interface DashboardKpis {
  date_from: IsoDate;
  date_to: IsoDate;
  /** Null when the user may not see the figure (FR-DASH-001). */
  revenue: Money | null;
  expenses: Money | null;
  net_profit: Money | null;
  cash: Money | null;
  bank: Money | null;
  ar: Money | null;
  ap: Money | null;
  overdue_ar: Money | null;
  /** Supplier invoices due in the next `upcoming_days` days. */
  upcoming_ap: Money | null;
  upcoming_days: number;
  currency: string;
}

export interface DashboardTrendPoint {
  period: string;
  label: string;
  label_km: string;
  revenue: Money;
  expenses: Money;
  profit: Money;
}

export interface DashboardCashAccount {
  id: string;
  code: string;
  name: string;
  name_km: string;
  kind: "CASH" | "BANK";
  currency: string;
  balance: Money;
  balance_base: Money;
}

export interface DashboardReconciliation {
  bank_account_id: string;
  code: string;
  name: string;
  name_km: string;
  last_completed: IsoDate | null;
  in_progress_id: string | null;
  /** Posted book lines after the last completed statement date, not yet reconciled. */
  unreconciled_items: number;
}

export interface DashboardRecent {
  id: string;
  date: IsoDate;
  number: string;
  type: string;
  description: string;
  amount: Money;
  currency: string;
  status: string;
  /** Link to open, or null. */
  href: string | null;
}

/** FR-DASH-009: pending items are counted separately and never added to the posted KPIs. */
export interface DashboardPending {
  approvals: number;
  /** Approved documents not yet posted, by type, with their total in base currency. */
  approved_unposted: { type: string; count: number; total: Money }[];
}

export interface DashboardBudgetUse {
  /** Budgets arrive in Phase 6; until then the widget explains that none is approved. */
  available: boolean;
  rows: { department_id: string; name: string; name_km: string; actual: Money; budget: Money; percent: Money }[];
}
