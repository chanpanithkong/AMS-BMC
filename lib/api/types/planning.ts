import type { ApprovalStep, HistoryEvent, IsoDate, IsoDateTime, Money } from "./common";

// Phase 6: budgets (SRS §6.14), FX revaluation (§6.16), inventory integration (§6.11) and imports (§6.21).

export type BudgetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "SUPERSEDED";

export interface BudgetLine {
  id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_name_km: string;
  department_id: string | null;
  branch_id: string | null;
  /** Twelve monthly amounts in base currency, January to December of the fiscal year. */
  months: Money[];
  total: Money;
  comment: string;
}

export interface Budget {
  id: string;
  fiscal_year_id: string;
  fiscal_year_name: string;
  version: number;
  name: string;
  status: BudgetStatus;
  /** Why this version was opened (revisions, FR-BUD-005). */
  reason: string;
  lines: BudgetLine[];
  total_revenue: Money;
  total_expense: Money;
  approval_steps: ApprovalStep[];
  rejection_comment: string | null;
  preparer_id: string;
  preparer_name: string;
  approved_by: string | null;
  approved_at: IsoDateTime | null;
  history: HistoryEvent[];
  /** Optimistic-lock version of the record (not the budget version number). */
  row_version: number;
}

export interface BudgetLineInput {
  account_id: string;
  department_id: string | null;
  branch_id: string | null;
  months: Money[];
  comment?: string;
}

/** Department budget use for the dashboard and alerts (FR-DASH-006, FR-BUD-009). */
export interface BudgetUse {
  department_id: string;
  name: string;
  name_km: string;
  budget_ytd: Money;
  budget_year: Money;
  actual: Money;
  percent: Money | null;
}

export interface FxRevaluationLine {
  account_id: string;
  account_code: string;
  account_name: string;
  account_name_km: string;
  currency: string;
  /** Balance in the account's currency at period end. */
  foreign_balance: Money;
  closing_rate: Money;
  booked_base: Money;
  revalued_base: Money;
  /** revalued − booked; positive is a gain on an asset account. */
  difference: Money;
}

/** Period-end revaluation (FR-FX-010, BR-FX-004): preview, then post with automatic reversal. */
export interface FxRevaluation {
  id: string;
  number: string | null;
  period_id: string;
  period_code: string;
  period_end: IsoDate;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  lines: FxRevaluationLine[];
  net_difference: Money;
  journal_id: string | null;
  journal_no: string | null;
  reversal_journal_id: string | null;
  reversal_journal_no: string | null;
  reversal_date: IsoDate;
  /** Balances not revalued in this release, listed for information (receivables and payables, D-12). */
  not_revalued: { label: string; label_km: string; currency: string; amount: Money }[];
  preparer_name: string;
  posted_by: string | null;
  history: HistoryEvent[];
}

export type InventoryEventType = "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "WRITE_OFF" | "RETURN";

export interface InventoryEvent {
  id: string;
  /** Unique id from the inventory system: an event is posted once (FR-INV-006, AT-INV-01). */
  source_event_id: string;
  type: InventoryEventType;
  date: IsoDate;
  item: string;
  quantity: Money;
  value: Money;
  reason: string;
  journal_id: string | null;
  journal_no: string | null;
  received_at: IsoDateTime;
}

export interface InventoryValuation {
  id: string;
  date: IsoDate;
  method: "WEIGHTED_AVERAGE" | "FIFO";
  source: string;
  categories: { name: string; name_km: string; value: Money }[];
  total: Money;
}

export interface InventoryReconciliation {
  date: IsoDate;
  valuation_total: Money | null;
  control_balance: Money;
  difference: Money | null;
  valuation_id: string | null;
}

export type ImportType = "CUSTOMERS" | "SUPPLIERS" | "ACCOUNTS" | "OPENING_BALANCES" | "JOURNALS" | "BUDGETS";

export interface ImportError {
  row: number;
  column: string;
  value: string;
  message: string;
}

/** Import batch (FR-IMP-007, FR-IMP-008): validated, then committed in one go, or rejected. */
export interface ImportBatch {
  id: string;
  type: ImportType;
  file_name: string;
  /** SHA-256 of the file as uploaded. */
  file_hash: string;
  status: "VALIDATED" | "FAILED" | "COMMITTED" | "ROLLED_BACK";
  total_rows: number;
  valid_rows: number;
  errors: ImportError[];
  warnings: string[];
  /** First rows as they will be imported. */
  preview: Record<string, string>[];
  /** Records created on commit, with links. */
  created: { type: string; id: string; label: string }[];
  /** Budget imports: the draft budget to load into. */
  target_id: string | null;
  can_rollback: boolean;
  created_by: string;
  created_at: IsoDateTime;
  committed_at: IsoDateTime | null;
}
