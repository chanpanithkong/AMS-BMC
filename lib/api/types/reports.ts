import type { AccountType, NormalBalance } from "./accounts";
import type { IsoDate, IsoDateTime, Money, PeriodStatus } from "./common";

/** RPT-01 Trial Balance row (SCR-08 columns). */
export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  name_km: string;
  type: AccountType;
  /** Depth in the hierarchy: 1 = top-level header. */
  level: number;
  is_posting: boolean;
  opening_debit: Money;
  opening_credit: Money;
  period_debit: Money;
  period_credit: Money;
  closing_debit: Money;
  closing_credit: Money;
}

export interface TrialBalanceTotals {
  opening_debit: Money;
  opening_credit: Money;
  period_debit: Money;
  period_credit: Money;
  closing_debit: Money;
  closing_credit: Money;
}

export interface TrialBalanceReport {
  currency: string;
  date_from: IsoDate;
  date_to: IsoDate;
  generated_at: IsoDateTime;
  rows: TrialBalanceRow[];
  /** Totals of posting accounts only, so headers are not counted twice. */
  totals: TrialBalanceTotals;
  /** Σ debits = Σ credits for each column pair (BR-GL-002). */
  validation: { balanced: boolean };
  includes_unposted: boolean;
}

export interface TrialBalanceParams {
  date_from: IsoDate;
  date_to: IsoDate;
  branch_id?: string | null;
  include_zero?: boolean;
  /** Deepest hierarchy level to show; omit for all. */
  level?: number;
}

/** RPT-02 General Ledger line (SCR-07 columns). */
export interface LedgerLine {
  id: string;
  date: IsoDate;
  journal_id: string;
  journal_no: string;
  source: string;
  reference: string;
  description: string;
  debit: Money;
  credit: Money;
  /** Running balance, positive on the account's normal side. */
  balance: Money;
  currency: string;
  branch_id: string | null;
  department_id: string | null;
}

export interface LedgerAccountSection {
  account_id: string;
  code: string;
  name: string;
  name_km: string;
  normal_balance: NormalBalance;
  opening_balance: Money;
  total_debit: Money;
  total_credit: Money;
  closing_balance: Money;
  lines: LedgerLine[];
  /** True when more lines exist than were returned; export for the full list. */
  truncated: boolean;
}

export interface GeneralLedgerReport {
  /** Currency of the amounts: the base currency, or "TXN" when each line is in its own currency. */
  currency: string;
  date_from: IsoDate;
  date_to: IsoDate;
  generated_at: IsoDateTime;
  accounts: LedgerAccountSection[];
}

export interface GeneralLedgerParams {
  accounts: string[];
  date_from: IsoDate;
  date_to: IsoDate;
  branch_id?: string | null;
  department_id?: string | null;
  currency_view?: "base" | "transaction";
}

/** Month-end checklist (SCR-17, FR-CLS-003). */
export type ChecklistStatus = "DONE" | "PENDING" | "NOT_APPLICABLE";
export type AutoCheckResult = "PASS" | "FAIL" | "NOT_AVAILABLE";

export interface ChecklistItem {
  id: string;
  task: string;
  task_km: string;
  owner_role: string;
  status: ChecklistStatus;
  evidence: string | null;
  completed_by: string | null;
  /** Result of the system's own check, where one exists. */
  auto_check: { result: AutoCheckResult; message: string; message_km: string } | null;
  /** A failing blocking item prevents closing the period. */
  blocking: boolean;
  /** Manual tasks are ticked by a person; automatic ones follow the check result. */
  manual: boolean;
}

export interface PeriodChecklist {
  period_id: string;
  status: PeriodStatus;
  items: ChecklistItem[];
  /** Messages for items that currently block closing, e.g. "3 approved journals dated in March are not posted". */
  blocking: { message: string; message_km: string }[];
}

export interface ReopenRequest {
  requested_by_id: string;
  requested_by_name: string;
  requested_at: IsoDateTime;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}
