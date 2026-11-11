import type { ApprovalStep, HistoryEvent, IsoDate, IsoDateTime, ListParams, Money } from "./common";

// SRS §6.12 Fixed Asset Management (FR-FA-001..012, BR-FA-001..003, SCR-14).

export type DepreciationMethod = "STRAIGHT_LINE" | "DECLINING_BALANCE";
/** When depreciation starts (BR-FA-001): the in-service month, or the month after it. */
export type DepreciationConvention = "SAME_MONTH" | "NEXT_MONTH";

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  name_km: string;
  cost_account_id: string;
  accumulated_account_id: string;
  expense_account_id: string;
  gain_account_id: string;
  loss_account_id: string;
  method: DepreciationMethod;
  /** Annual rate in percent for declining balance. */
  declining_rate: Money | null;
  useful_life_months: number;
  convention: DepreciationConvention;
}

export type AssetStatus = "DRAFT" | "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSAL_PENDING" | "DISPOSED";

export interface AssetDisposal {
  date: IsoDate;
  proceeds: Money;
  /** Cash or bank account that received the proceeds (null when nothing was received). */
  account_id: string | null;
  reason: string;
  requested_by: string;
  requested_by_id: string;
  requested_at: IsoDateTime;
  /** Filled when posted: proceeds − net book value; negative is a loss. */
  gain_loss: Money | null;
  journal_id: string | null;
  journal_no: string | null;
}

export interface FixedAsset {
  id: string;
  tag: string;
  name: string;
  name_km: string;
  category_id: string;
  category_name: string;
  category_name_km: string;
  cost: Money;
  residual_value: Money;
  useful_life_months: number;
  method: DepreciationMethod;
  declining_rate: Money | null;
  convention: DepreciationConvention;
  acquisition_date: IsoDate;
  in_service_date: IsoDate;
  supplier_name: string;
  /** Where the cost was recorded: a supplier invoice, a journal posted when the asset was created, or the go-live balance. */
  source: { type: "AP_INVOICE" | "MANUAL" | "OPENING"; id: string | null; number: string | null };
  location: string;
  branch_id: string | null;
  department_id: string | null;
  custodian: string;
  status: AssetStatus;
  /** Accumulated depreciation brought forward at go-live (migrated assets only). */
  accumulated_brought_forward: Money;
  /** Derived from posted depreciation (FR-FA-006). */
  accumulated: Money;
  net_book_value: Money;
  last_depreciated_period: string | null;
  disposal: AssetDisposal | null;
  history: HistoryEvent[];
  version: number;
}

export interface FixedAssetInput {
  name: string;
  name_km: string;
  category_id: string;
  cost: Money;
  residual_value: Money;
  useful_life_months: number;
  method: DepreciationMethod;
  declining_rate: Money | null;
  convention: DepreciationConvention;
  acquisition_date: IsoDate;
  in_service_date: IsoDate;
  supplier_name: string;
  location: string;
  branch_id: string | null;
  department_id: string | null;
  custodian: string;
  /**
   * How the cost reaches the ledger (FR-FA-003): "POST" posts Dr cost / Cr `funding_account_id`;
   * "ALREADY_POSTED" records an asset whose cost is already in the ledger (go-live migration).
   */
  funding: "POST" | "ALREADY_POSTED";
  funding_account_id: string | null;
  accumulated_brought_forward: Money;
}

export interface AssetListParams extends ListParams {
  status?: string;
  category_id?: string;
  branch_id?: string;
  department_id?: string;
}

export interface ScheduleRow {
  period: string;
  opening_nbv: Money;
  depreciation: Money;
  accumulated: Money;
  closing_nbv: Money;
  /** POSTED (a run posted it), BROUGHT_FORWARD (before go-live) or PLANNED. */
  state: "POSTED" | "BROUGHT_FORWARD" | "PLANNED";
  run_id: string | null;
}

export interface DepreciationRunLine {
  asset_id: string;
  tag: string;
  name: string;
  category_id: string;
  amount: Money;
  accumulated_after: Money;
  nbv_after: Money;
  department_id: string | null;
  branch_id: string | null;
}

/** Depreciation run for one period: preview → approve → post (FR-FA-005, BR-FA-002). */
export interface DepreciationRun {
  id: string;
  number: string | null;
  period_id: string;
  period_code: string;
  period_end: IsoDate;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";
  lines: DepreciationRunLine[];
  total: Money;
  /** Assets skipped because this period is already posted for them. */
  skipped: { asset_id: string; tag: string; reason: string }[];
  approval_steps: ApprovalStep[];
  journal_id: string | null;
  journal_no: string | null;
  preparer_id: string;
  preparer_name: string;
  history: HistoryEvent[];
  version: number;
}
