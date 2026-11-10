/** List envelope (SRS §13.1): `total` is optional for expensive queries. */
export interface Page<T> {
  data: T[];
  page: { next_cursor: string | null; limit: number; total?: number };
}

export interface ListParams {
  cursor?: string | null;
  limit?: number;
  sort?: string;
  search?: string;
}

/** Decimal string on the wire, e.g. "1250.00" (SRS §13.1). Never a JS number. */
export type Money = string;
/** Business date, "YYYY-MM-DD". */
export type IsoDate = string;
/** UTC timestamp, ISO 8601. */
export type IsoDateTime = string;

/** Document workflow statuses (SRS §14.1, prompt §5). */
export type DocumentStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "REVERSED" | "CANCELLED";
export type InvoiceStatus = DocumentStatus | "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CREDITED";
export type ReconciliationStatus = "IN_PROGRESS" | "COMPLETED";
export type PeriodStatus = "OPEN" | "SOFT_CLOSED" | "CLOSED" | "REOPENED";
export type VerificationStatus = "VERIFIED" | "UNVERIFIED";
export type AnyStatus = InvoiceStatus | ReconciliationStatus | PeriodStatus | VerificationStatus | "ACTIVE" | "INACTIVE" | "PENDING";

export interface HistoryEvent {
  id: string;
  at: IsoDateTime;
  user_name: string;
  action: string;
  comment?: string | null;
}

export interface ApprovalStep {
  step: number;
  role: string;
  approver_name?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  acted_at?: IsoDateTime | null;
  comment?: string | null;
}

export interface Attachment {
  id: string;
  file_name: string;
  content_type: string;
  size: number;
  uploaded_at: IsoDateTime;
  uploaded_by: string;
  url?: string;
}
