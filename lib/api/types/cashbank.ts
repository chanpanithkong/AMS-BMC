import type { ApprovalStep, Attachment, HistoryEvent, IsoDate, IsoDateTime, ListParams, Money } from "./common";

/** A cash box, petty cash float or bank account linked to a GL account (FR-CB-001, FR-CB-002). */
export interface CashBankAccount {
  id: string;
  kind: "CASH" | "BANK";
  code: string;
  name: string;
  name_km: string;
  bank_name: string | null;
  /** Always masked ("•••• 4417") unless the user holds cb.bank.unmask (BR-SEC-004). */
  account_number: string | null;
  currency: string;
  gl_account_id: string;
  gl_account_code: string;
  branch_id: string;
  custodian_name: string | null;
  /** Alert threshold (FR-CB-014), account currency. */
  min_balance: Money;
  /** Cash accounts may not go negative unless allowed (BR-CB-004). */
  allow_negative: boolean;
  status: "ACTIVE" | "INACTIVE";
  /** Posted balance in account currency and in base currency. */
  balance: Money;
  balance_base: Money;
  /** Date of the last completed reconciliation, bank accounts only. */
  last_reconciled: IsoDate | null;
}

export type CashTransactionType = "RECEIPT" | "PAYMENT" | "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "CHARGE";
export type CashTransactionStatus = "DRAFT" | "SUBMITTED" | "POSTED" | "CANCELLED";

/** Counter-account line of a receipt, payment or charge. */
export interface CashLine {
  account_id: string;
  account_code?: string;
  account_name?: string;
  account_name_km?: string;
  description: string;
  amount: Money;
  department_id: string | null;
  branch_id: string | null;
}

export interface CashTransaction {
  id: string;
  /** Assigned at posting, e.g. CR-2027-000012. */
  number: string | null;
  type: CashTransactionType;
  status: CashTransactionStatus;
  date: IsoDate;
  /** Receipts, payments and charges: the cash or bank account. Transfers: the sending account. */
  account_id: string;
  /** Transfers, deposits and withdrawals: the receiving account. */
  to_account_id: string | null;
  currency: string;
  /** Total in the account's currency. */
  amount: Money;
  /** Transfers between currencies: the amount received, in the receiving account's currency. */
  to_amount: Money | null;
  rate: Money;
  reference: string;
  description: string;
  payee: string;
  lines: CashLine[];
  journal_id: string | null;
  journal_no: string | null;
  /** Set when this payment settles an expense (FR-EXP-010). */
  expense_id: string | null;
  preparer_id: string;
  preparer_name: string;
  posted_by: string | null;
  posted_at: IsoDateTime | null;
  history: HistoryEvent[];
  attachments: Attachment[];
  version: number;
}

export interface CashTransactionInput {
  type: CashTransactionType;
  date: IsoDate;
  account_id: string;
  to_account_id: string | null;
  amount: Money;
  to_amount: Money | null;
  reference: string;
  description: string;
  payee: string;
  lines: CashLine[];
}

export interface CashTransactionListParams extends ListParams {
  type?: string;
  status?: string;
  account_id?: string;
  date_from?: IsoDate;
  date_to?: IsoDate;
}

/** Cashbook or bankbook (FR-CB-007, RPT-11, RPT-12). */
export interface AccountBook {
  account: CashBankAccount;
  date_from: IsoDate;
  date_to: IsoDate;
  opening: Money;
  opening_base: Money;
  lines: {
    id: string;
    date: IsoDate;
    journal_id: string;
    journal_no: string;
    source: string;
    reference: string;
    description: string;
    receipt: Money;
    payment: Money;
    balance: Money;
    balance_base: Money;
  }[];
  total_receipts: Money;
  total_payments: Money;
  closing: Money;
  closing_base: Money;
}

/** One bank statement line (FR-CB-008). Amounts are signed: + money in, − money out. */
export interface StatementLine {
  id: string;
  bank_account_id: string;
  import_id: string;
  date: IsoDate;
  description: string;
  reference: string;
  amount: Money;
  balance: Money | null;
  /** Set while matched in a reconciliation. */
  match_id: string | null;
}

/** A posted ledger line on the bank's GL account, seen from the bank: + deposit, − payment. */
export interface BookLine {
  id: string;
  date: IsoDate;
  journal_id: string;
  journal_no: string;
  description: string;
  reference: string;
  amount: Money;
  match_id: string | null;
}

export interface ReconciliationMatch {
  id: string;
  statement_line_ids: string[];
  book_line_ids: string[];
  auto: boolean;
  matched_by: string;
  matched_at: IsoDateTime;
}

export interface ReconciliationSummary {
  statement_opening: Money;
  statement_closing: Money;
  /** Opening plus the statement lines; should equal the closing balance. */
  statement_lines_total: Money;
  statement_consistent: boolean;
  book_balance: Money;
  outstanding_deposits: Money;
  unpresented_payments: Money;
  adjusted_bank_balance: Money;
  /** Statement lines with no book entry yet (charges, interest): they need an adjustment. */
  unrecorded_items: Money;
  /** Adjusted bank balance − book balance. Must be zero, or explained, to complete (BR-CB-002). */
  difference: Money;
}

export interface Reconciliation {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  currency: string;
  statement_date: IsoDate;
  previous_date: IsoDate | null;
  status: "IN_PROGRESS" | "COMPLETED";
  statement_lines: StatementLine[];
  book_lines: BookLine[];
  matches: ReconciliationMatch[];
  /** Pairs the server proposes; auto-match applies them (FR-CB-009). */
  suggestions: { statement_line_ids: string[]; book_line_ids: string[]; reason: "amount_date_reference" | "amount_date" }[];
  summary: ReconciliationSummary;
  explanation: { reason: string; amount: Money; approved_by: string } | null;
  prepared_by: string;
  completed_by: string | null;
  completed_at: IsoDateTime | null;
  history: HistoryEvent[];
  version: number;
}

export interface ReconciliationListItem {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  currency: string;
  statement_date: IsoDate;
  statement_closing: Money;
  difference: Money;
  status: "IN_PROGRESS" | "COMPLETED";
  completed_by: string | null;
  completed_at: IsoDateTime | null;
}

/** Column mapping for statement files, saved per bank account (FR-CB-008). */
export interface StatementMapping {
  date: string;
  description: string;
  reference: string | null;
  /** Either one signed amount column, or separate debit (money out) and credit (money in) columns. */
  amount: string | null;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  date_format: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";
}

export interface StatementImportRow {
  row_no: number;
  date: IsoDate | null;
  description: string;
  reference: string;
  amount: Money | null;
  balance: Money | null;
  status: "VALID" | "ERROR" | "DUPLICATE";
  errors: string[];
}

export interface StatementImport {
  id: string;
  bank_account_id: string;
  file_name: string;
  status: "PREVIEW" | "COMMITTED";
  rows: StatementImportRow[];
  counts: { valid: number; errors: number; duplicates: number };
  imported_by: string;
  created_at: IsoDateTime;
  committed_at: IsoDateTime | null;
  /** Lines created by the commit. */
  created_lines: number;
}

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  name_km: string;
  account_id: string;
  /** Attachment always required, or required above `attachment_threshold` (FR-EXP-007). */
  requires_attachment: boolean;
  attachment_threshold: Money | null;
}

export type ExpensePaymentMode = "PAID" | "UNPAID" | "CLAIM";
export type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "CANCELLED";

export interface ExpenseAllocation {
  department_id: string | null;
  branch_id: string | null;
  /** Percent mode: share of the total; amount mode: null. */
  percent: Money | null;
  amount: Money;
}

export interface Expense {
  id: string;
  number: string | null;
  status: ExpenseStatus;
  date: IsoDate;
  category_id: string;
  category_name: string;
  category_name_km: string;
  description: string;
  payee: string;
  payment_mode: ExpensePaymentMode;
  /** Cash or bank account when paid immediately. */
  paid_from_id: string | null;
  currency: string;
  rate: Money;
  amount: Money;
  amount_base: Money;
  allocation_mode: "PERCENT" | "AMOUNT";
  allocations: ExpenseAllocation[];
  attachments: Attachment[];
  preparer_id: string;
  preparer_name: string;
  approval_steps: ApprovalStep[];
  rejection_comment: string | null;
  journal_id: string | null;
  journal_no: string | null;
  /** Unpaid and claim expenses: the payment that settled them. */
  settlement: { transaction_id: string; number: string; date: IsoDate } | null;
  history: HistoryEvent[];
  version: number;
}

export interface ExpenseInput {
  date: IsoDate;
  category_id: string;
  description: string;
  payee: string;
  payment_mode: ExpensePaymentMode;
  paid_from_id: string | null;
  currency: string;
  amount: Money;
  allocation_mode: "PERCENT" | "AMOUNT";
  allocations: ExpenseAllocation[];
}

export interface ExpenseListParams extends ListParams {
  status?: string;
  category_id?: string;
  payment_mode?: string;
  date_from?: IsoDate;
  date_to?: IsoDate;
  preparer_id?: string;
}

/** What has been spent on an account and department this year (FR-EXP-011). Budgets arrive in Phase 6. */
export interface SpendingCheck {
  account_code: string;
  department_id: string | null;
  year_to_date: Money;
  budget: Money | null;
  remaining: Money | null;
}
