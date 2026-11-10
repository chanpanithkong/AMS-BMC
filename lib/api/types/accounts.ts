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
}

export interface AccountListParams extends ListParams {
  type?: AccountType;
  active?: boolean;
  /** true = posting accounts only (pickers); false = headers only. */
  posting?: boolean;
  control?: boolean;
}
