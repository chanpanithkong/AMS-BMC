import type { ApprovalStep, Attachment, HistoryEvent, IsoDate, IsoDateTime, ListParams, Money } from "./common";

/** Tax code with effective-dated rates and a verification status (SRS §6.13, BR-TAX-001/002, V-01). */
export interface TaxRate {
  rate: Money;
  effective_from: IsoDate;
  effective_to: IsoDate | null;
}

export interface TaxCode {
  id: string;
  code: string;
  name: string;
  name_km: string;
  /** OUTPUT on sales, INPUT on purchases, EXEMPT for no tax. */
  kind: "OUTPUT" | "INPUT" | "EXEMPT";
  method: "EXCLUSIVE" | "INCLUSIVE";
  account_id: string | null;
  account_code: string | null;
  /** Confirmed by a qualified tax adviser (V-01). Unverified codes cannot be posted. */
  verification: "VERIFIED" | "UNVERIFIED";
  verified_by: string | null;
  verified_at: IsoDateTime | null;
  verification_note: string;
  is_active: boolean;
  rates: TaxRate[];
  /** Rate in force today. */
  current_rate: Money;
  history: HistoryEvent[];
  version: number;
}

export interface PartyContact {
  name: string;
  role: string;
  phone: string;
  email: string;
}

/** Supplier bank details: numbers are masked unless the user holds ap.supplier.bank.view (BR-SEC-004). */
export interface BankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
  /** A change waiting for approval (BR-AP-005); payments are held meanwhile. */
  pending: { bank_name: string; account_name: string; account_number: string; requested_by: string; requested_at: IsoDateTime } | null;
}

/** Customer or supplier (FR-AR-001, FR-AP-001, SCR-20). */
export interface Party {
  id: string;
  kind: "CUSTOMER" | "SUPPLIER";
  code: string;
  name: string;
  name_km: string;
  tax_id: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  payment_terms_days: number;
  /** Customers only; null = no limit. */
  credit_limit: Money | null;
  /** Customers: ACTIVE / INACTIVE. Suppliers: DRAFT / VERIFIED / BLOCKED. */
  status: "ACTIVE" | "INACTIVE" | "DRAFT" | "VERIFIED" | "BLOCKED";
  contacts: PartyContact[];
  bank: BankDetails | null;
  /** Default revenue (customer) or expense (supplier) account. */
  default_account_id: string | null;
  notes: string;
  /** Outstanding balance in base currency, from posted documents. */
  balance: Money;
  overdue: Money;
  /** Customers: receipts not yet applied to invoices, in base currency (BR-AR-006). */
  unapplied: Money;
  version: number;
}

export interface PartyInput {
  code: string;
  name: string;
  name_km: string;
  tax_id: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  payment_terms_days: number;
  credit_limit: Money | null;
  default_account_id: string | null;
  notes: string;
  contacts: PartyContact[];
}

export interface InvoiceLine {
  id?: string;
  description: string;
  quantity: Money;
  unit_price: Money;
  /** Discount as an amount off the line (≤ quantity × price). */
  discount: Money;
  tax_code_id: string | null;
  account_id: string | null;
  department_id: string | null;
  branch_id: string | null;
  /** Supplier invoices: the line buys a fixed asset (FR-AP-005); the asset register follows in Phase 6. */
  is_asset?: boolean;
  /** Calculated by the server; the rate is kept with the line so posted documents never change (BR-TAX-001). */
  tax_rate?: Money;
  net?: Money;
  tax?: Money;
  total?: Money;
}

export type InvoiceStatus =
  | "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED"
  | "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CREDITED";

export interface Settlement {
  doc_type: "RECEIPT" | "PAYMENT" | "CREDIT_NOTE";
  doc_id: string;
  number: string;
  date: IsoDate;
  amount: Money;
}

/** Customer invoice (kind AR) or supplier invoice (kind AP). SCR-09, SCR-11. */
export interface Invoice {
  id: string;
  kind: "AR" | "AP";
  /** Our number, assigned at posting: INV-YYYY-NNNNNN (sales) or BILL-YYYY-NNNNNN (purchases). */
  number: string | null;
  /** Purchases: the supplier's own invoice number (duplicate check, BR-AP-001). */
  supplier_invoice_no: string | null;
  party_id: string;
  party_code: string;
  party_name: string;
  party_name_km: string;
  status: InvoiceStatus;
  /** True once posted; status then follows payments. */
  posted: boolean;
  date: IsoDate;
  received_date: IsoDate | null;
  due_date: IsoDate;
  terms_days: number;
  currency: string;
  rate: Money;
  lines: InvoiceLine[];
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
  total_base: Money;
  outstanding: Money;
  settlements: Settlement[];
  reference: string;
  notes: string;
  attachments: Attachment[];
  approval_steps: ApprovalStep[];
  rejection_comment: string | null;
  /** Reason given when a possible duplicate was confirmed (BR-AP-001). */
  duplicate_reason: string | null;
  /** True for balances brought forward at go-live. */
  is_opening: boolean;
  /** Customer invoices: the balance would exceed the credit limit, so a Finance Manager override step is added (BR-AR-004). */
  credit_limit_exceeded?: boolean;
  journal_id: string | null;
  journal_no: string | null;
  preparer_id: string;
  preparer_name: string;
  history: HistoryEvent[];
  version: number;
}

export interface InvoiceInput {
  party_id: string;
  supplier_invoice_no?: string | null;
  date: IsoDate;
  received_date?: IsoDate | null;
  terms_days: number;
  due_date?: IsoDate | null;
  currency: string;
  reference: string;
  notes: string;
  lines: InvoiceLine[];
  /** Purchases: reason for keeping a possible duplicate. */
  duplicate_reason?: string | null;
}

export interface InvoiceListParams extends ListParams {
  status?: string;
  party_id?: string;
  date_from?: IsoDate;
  date_to?: IsoDate;
  due_to?: IsoDate;
  overdue?: boolean;
  branch_id?: string;
}

/** Result of the supplier invoice number check on blur (SCR-11). */
export interface DuplicateCheck {
  exact: { id: string; number: string | null; supplier_invoice_no: string; date: IsoDate; status: InvoiceStatus; posted_at: IsoDate | null } | null;
  similar: { id: string; number: string | null; supplier_invoice_no: string; date: IsoDate; total: Money }[];
}

export interface CreditNote {
  id: string;
  number: string | null;
  invoice_id: string;
  invoice_number: string;
  party_id: string;
  party_name: string;
  date: IsoDate;
  reason: string;
  currency: string;
  lines: InvoiceLine[];
  subtotal: Money;
  tax: Money;
  total: Money;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "CANCELLED";
  approval_steps: ApprovalStep[];
  rejection_comment: string | null;
  journal_id: string | null;
  journal_no: string | null;
  preparer_id: string;
  preparer_name: string;
  history: HistoryEvent[];
  version: number;
}

export interface AllocationLine {
  invoice_id: string;
  invoice_number?: string;
  amount: Money;
}

/** Customer receipt (SCR-10) or supplier payment (SCR-12). */
export interface PartyPayment {
  id: string;
  kind: "RECEIPT" | "PAYMENT";
  /** RV-YYYY-NNNNNN (receipts) or SPV-YYYY-NNNNNN (supplier payments). */
  number: string | null;
  party_id: string;
  party_name: string;
  party_name_km: string;
  date: IsoDate;
  /** Cash or bank account (Phase 3). */
  account_id: string;
  method: "CASH" | "BANK_TRANSFER" | "CHEQUE";
  currency: string;
  amount: Money;
  rate: Money;
  reference: string;
  allocations: AllocationLine[];
  /** Receipts: amount held as customer credit (BR-AR-006). */
  unapplied: Money;
  /** Receipts: DRAFT / POSTED. Payments: DRAFT / SUBMITTED / APPROVED / REJECTED / PAID / CANCELLED. */
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "PAID" | "CANCELLED";
  /** Payments: the bank's reference, entered at release. */
  bank_reference: string | null;
  released_by: string | null;
  released_at: IsoDateTime | null;
  /** Payments: the supplier bank details paid to (masked). */
  pay_to: { bank_name: string; account_number: string } | null;
  approval_steps: ApprovalStep[];
  rejection_comment: string | null;
  journal_id: string | null;
  journal_no: string | null;
  preparer_id: string;
  preparer_name: string;
  history: HistoryEvent[];
  version: number;
}

export interface PartyPaymentInput {
  party_id: string;
  date: IsoDate;
  account_id: string;
  method: PartyPayment["method"];
  amount: Money;
  reference: string;
  allocations: AllocationLine[];
}

/** Customer or supplier statement (FR-AR-016, FR-AP-014). */
export interface PartyStatement {
  party: Party;
  date_from: IsoDate;
  date_to: IsoDate;
  currency: string;
  opening: Money;
  lines: { date: IsoDate; type: string; number: string; description: string; debit: Money; credit: Money; balance: Money; doc_id: string; doc_kind: string }[];
  closing: Money;
  aging: AgingBuckets;
}

export interface AgingBuckets {
  current: Money;
  d1_30: Money;
  d31_60: Money;
  d61_90: Money;
  over_90: Money;
  total: Money;
}

/** RPT-07 / RPT-08 aging (buckets of days past due, SRS §15.3). */
export interface AgingReport {
  kind: "AR" | "AP";
  as_of: IsoDate;
  currency: string;
  rows: (AgingBuckets & { party_id: string; code: string; name: string; name_km: string })[];
  totals: AgingBuckets;
  /** Σ party balances vs the control account (AT-AR-05). */
  control: { account_code: string; balance: Money; difference: Money };
}
