import type { IsoDate, IsoDateTime, Money, PeriodStatus } from "./common";

export interface Department {
  id: string;
  company_id: string;
  code: string;
  name: string;
  name_km: string;
  is_active: boolean;
}

export interface AccountingPeriod {
  id: string;
  fiscal_year_id: string;
  /** e.g. "2027-03" */
  code: string;
  period_no: number;
  name: string;
  name_km: string;
  start_date: IsoDate;
  end_date: IsoDate;
  status: PeriodStatus;
  /** Present while a reopen request is waiting for, or has had, a decision (BR-CLS-003). */
  reopen_request?: import("./reports").ReopenRequest | null;
}

export interface FiscalYear {
  id: string;
  company_id: string;
  name: string;
  start_date: IsoDate;
  end_date: IsoDate;
  status: "OPEN" | "CLOSED";
  periods: AccountingPeriod[];
}

export interface Currency {
  code: string;
  name: string;
  name_km: string;
  symbol: string;
  /** Minor units: USD 2, KHR 0 (SRS BR-FX-005). */
  decimals: number;
  is_active: boolean;
}

export interface ExchangeRate {
  id: string;
  rate_date: IsoDate;
  from_currency: string;
  to_currency: string;
  rate_type: "TRANSACTION" | "CLOSING" | "AVERAGE";
  /** `to_currency` units per one `from_currency` unit, up to 12 decimals (docs/DECISIONS.md D-P2-07). */
  rate: Money;
  source: string;
}

// ASSUMPTION: analysis dimensions beyond branch and department are not specified in SRS §13.3.
export interface Dimension {
  id: string;
  code: string;
  name: string;
  name_km: string;
  values: { id: string; code: string; name: string; name_km: string }[];
}

// ASSUMPTION: notification and search payloads are not specified in SRS §13.3.
export interface AppNotification {
  id: string;
  title: string;
  title_km: string;
  body: string;
  body_km: string;
  created_at: IsoDateTime;
  read: boolean;
  /** Path without locale prefix. */
  link: string | null;
}

export interface SearchResult {
  type: "account" | "customer" | "supplier" | "document";
  id: string;
  label: string;
  sublabel: string;
  /** Path without locale prefix. */
  href: string;
}
