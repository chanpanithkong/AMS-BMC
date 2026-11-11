import type { ListParams, Money } from "./common";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type NormalBalance = "DEBIT" | "CREDIT";
export type ControlModule = "AR" | "AP" | "BANK" | "FIXED_ASSETS" | "INVENTORY" | "TAX";

/** Chart of Accounts entry (SRS §11.4.3, SCR-03). */
export interface Account {
  id: string;
  code: string;
  name: string;
  name_km: string;
  type: AccountType;
  category: string;
  parent_id: string | null;
  normal_balance: NormalBalance;
  /** false = header account; cannot be posted to (BR-COA-001). */
  is_posting: boolean;
  is_control: boolean;
  control_module: ControlModule | null;
  is_contra: boolean;
  /** Hidden from roles without coa.sensitive.view (FR-RBAC-005). */
  is_sensitive: boolean;
  /** Currency restriction, or null for any currency. */
  currency: string | null;
  cash_flow_class: "CASH" | "OPERATING" | "INVESTING" | "FINANCING" | null;
  is_active: boolean;
  version: number;
  /** Present only when requested and permitted. */
  balance?: Money;
  description?: string;
  /** Statement line the account maps to (FR-COA-006). */
  statement_mapping?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  /** True once the account has journal lines: it can then be deactivated but not deleted (BR-COA-004). */
  in_use?: boolean;
  /** A change waiting for approval (changes to used accounts, SRS §13.3). */
  pending_change?: { requested_by_name: string; requested_at: string; fields: Partial<AccountInput> } | null;
}

export interface AccountInput {
  code: string;
  name: string;
  name_km: string;
  description: string;
  type: AccountType;
  category: string;
  parent_id: string | null;
  normal_balance: NormalBalance;
  is_posting: boolean;
  is_control: boolean;
  control_module: ControlModule | null;
  is_sensitive: boolean;
  currency: string | null;
  cash_flow_class: Account["cash_flow_class"];
  statement_mapping: string | null;
  effective_from: string | null;
  effective_to: string | null;
}

export interface AccountListParams extends ListParams {
  type?: AccountType;
  active?: boolean;
  /** true = posting accounts only (pickers); false = headers only. */
  posting?: boolean;
  control?: boolean;
  /** Add each account's balance in base currency (needs a report permission). */
  include_balance?: boolean;
}
