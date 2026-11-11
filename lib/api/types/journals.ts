import type { ApprovalStep, Attachment, DocumentStatus, HistoryEvent, IsoDate, IsoDateTime, ListParams, Money } from "./common";

/** SRS §6.5: Manual, Adjusting (period-end), System (from a subledger), plus reversal and opening journals. */
export type JournalType = "MANUAL" | "ADJUSTING" | "SYSTEM" | "REVERSAL" | "OPENING";

export interface JournalLine {
  id: string;
  line_no: number;
  account_id: string;
  account_code: string;
  account_name: string;
  account_name_km: string;
  description: string;
  /** Transaction-currency amounts; exactly one side is greater than zero (BR-GL-008). */
  debit: Money;
  credit: Money;
  currency: string;
  /** Base units per one unit of `currency` (SRS §6.16). */
  rate: Money;
  debit_base: Money;
  credit_base: Money;
  branch_id: string | null;
  department_id: string | null;
  dimensions: Record<string, string | null>;
}

export interface JournalTotalsDto {
  debit_base: Money;
  credit_base: Money;
  difference: Money;
}

/** Journal header for lists (SCR-04 list columns). */
export interface JournalSummary {
  id: string;
  /** Assigned at posting (FR-GL-008); null before. */
  journal_no: string | null;
  status: DocumentStatus;
  type: JournalType;
  posting_date: IsoDate;
  document_date: IsoDate;
  description: string;
  reference: string;
  currency: string;
  /** Period code such as "2027-03". */
  period: string | null;
  totals: JournalTotalsDto;
  preparer_id: string;
  preparer_name: string;
  approver_name: string | null;
  submitted_at: IsoDateTime | null;
  posted_at: IsoDateTime | null;
  /** Subledger source of a system journal, e.g. "CB-2027-000012". */
  source_type: string | null;
  source_no: string | null;
  version: number;
}

export interface JournalEntry extends JournalSummary {
  lines: JournalLine[];
  history: HistoryEvent[];
  approval_steps: ApprovalStep[];
  attachments: Attachment[];
  /** Links between an original and its reversal (BR-GL-004). */
  reversed_by: { id: string; journal_no: string } | null;
  reverses: { id: string; journal_no: string } | null;
  reversal_reason: string | null;
  rejection_comment: string | null;
}

export interface JournalLineInput {
  account_id: string | null;
  description: string;
  debit: Money;
  credit: Money;
  currency: string;
  rate: Money;
  branch_id: string | null;
  department_id: string | null;
  dimensions: Record<string, string | null>;
}

export interface JournalInput {
  posting_date: IsoDate;
  document_date: IsoDate;
  description: string;
  reference: string;
  currency: string;
  type: "MANUAL" | "ADJUSTING";
  lines: JournalLineInput[];
}

export interface JournalListParams extends ListParams {
  /** One status, or several separated by commas. */
  status?: string;
  type?: JournalType;
  date_from?: IsoDate;
  date_to?: IsoDate;
  account_id?: string;
  amount_min?: Money;
  amount_max?: Money;
  preparer_id?: string;
  source?: string;
}

export interface ApprovalDecision {
  action: "approve" | "reject";
  /** Required when rejecting (SCR-05). */
  comment?: string;
}

export interface ReverseRequest {
  reversal_date: IsoDate;
  reason: string;
}

/** One row of the approvals inbox (SCR-05, SCR-26). */
export interface ApprovalItem {
  id: string;
  document_type: "JOURNAL" | "EXPENSE" | "AR_INVOICE" | "AP_INVOICE" | "CREDIT_NOTE" | "SUPPLIER_PAYMENT" | "SUPPLIER_BANK" | "DEPRECIATION_RUN" | "ASSET_DISPOSAL" | "BUDGET"
    | "USER_ACCESS" | "ROLE_CHANGE" | "SETTING_CHANGE";
  document_id: string;
  number: string;
  date: IsoDate;
  description: string;
  total: Money;
  currency: string;
  preparer_id: string;
  preparer_name: string;
  submitted_at: IsoDateTime;
  step: number;
  step_role: string;
  /** Hours since submission and whether it passed the escalation time (FR-WFL-005). */
  age_hours?: number;
  escalated?: boolean;
}

export interface UserRef {
  id: string;
  full_name: string;
  full_name_km: string;
  roles: string[];
}
