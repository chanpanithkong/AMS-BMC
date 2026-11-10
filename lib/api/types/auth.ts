import type { RoleCode } from "@/lib/rbac/permissions";
import type { DateFormat } from "@/lib/format/dates";
import type { NegativeStyle } from "@/lib/money/format";

export interface BranchRef {
  id: string;
  code: string;
  name: string;
  name_km: string;
}

export interface CompanyRef {
  id: string;
  code: string;
  name: string;
  name_km: string;
  base_currency: string;
  branches: BranchRef[];
}

// ASSUMPTION: SRS §13.3 says login returns "access token, user, companies" without a payload shape.
export interface SessionUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  full_name_km: string;
  roles: RoleCode[];
  /** Effective permission codes; the server stays authoritative on every request (FR-RBAC-009). */
  permissions: string[];
  locale: "en" | "km";
  date_format: DateFormat;
  negative_style: NegativeStyle;
  mfa_enabled: boolean;
  default_company_id: string;
  /** Scope hints for the UI (own department, own cash accounts). */
  department_ids: string[];
  cash_account_ids: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
  /** TOTP code; sent on the second step when the server answers MFA_REQUIRED. */
  otp?: string;
}

export interface SessionResponse {
  access_token: string;
  /** Lifetime in seconds (15 minutes per FR-AUTH-001). */
  expires_in: number;
  user: SessionUser;
  companies: CompanyRef[];
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}
