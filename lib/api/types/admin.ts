import type { HistoryEvent, IsoDateTime, ListParams, Money } from "./common";

// Phase 7: users and roles (SRS §6.1, §6.2, SCR-16), audit trail (§6.18, SCR-18) and settings
// (§6.22, SCR-19).

export interface Role {
  code: string;
  name: string;
  name_km: string;
  description: string;
  /** Default roles are seeded from SRS §4.3; custom roles copy one of them and follow its menu visibility. */
  is_default: boolean;
  base_role: string;
  permissions: string[];
  is_active: boolean;
  /** A change adding sensitive permissions waits for the Owner (FR-RBAC-010). */
  pending: { permissions: string[]; requested_by: string; requested_by_id: string; requested_at: IsoDateTime } | null;
  user_count: number;
  history: HistoryEvent[];
  version: number;
}

export interface AccessScope {
  roles: string[];
  company_ids: string[];
  /** Empty = all branches of the companies. */
  branch_ids: string[];
  department_ids: string[];
  cash_account_ids: string[];
  /** Value limit for approve, post and release in base currency; null = no limit (FR-RBAC-006). */
  approval_limit: Money | null;
}

export interface AdminUser extends AccessScope {
  id: string;
  username: string;
  email: string;
  full_name: string;
  full_name_km: string;
  phone: string;
  locale: "en" | "km";
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  mfa_enabled: boolean;
  last_login_at: IsoDateTime | null;
  /** Effective permissions from the roles. */
  permissions: string[];
  /** Separation-of-duties conflicts in the user's combined permissions (SRS §4.4). */
  sod_conflicts: SodConflict[];
  pending: (AccessScope & { requested_by: string; requested_by_id: string; requested_at: IsoDateTime }) | null;
  history: HistoryEvent[];
  version: number;
}

export interface AdminUserInput {
  username: string;
  email: string;
  full_name: string;
  full_name_km: string;
  phone: string;
  locale: "en" | "km";
  mfa_enabled: boolean;
}

export interface SodConflict {
  code: string;
  /** e.g. "create supplier and release payment". */
  description: string;
  description_km: string;
  permissions: [string, string];
}

export interface UserSession {
  id: string;
  user_id: string;
  created_at: IsoDateTime;
  last_activity_at: IsoDateTime;
  device: string;
  ip: string;
  current: boolean;
}

export interface UserListParams extends ListParams {
  status?: string;
  role?: string;
}

/** One audit event (SRS §6.18 validation rules). */
export interface AuditEvent {
  id: string;
  sequence: number;
  at: IsoDateTime;
  user_id: string | null;
  user_name: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  company_id: string | null;
  branch_id: string | null;
  ip: string;
  user_agent: string;
  correlation_id: string;
  reason: string | null;
  /** Previous and new values of the changed fields, secrets masked (FR-AUD-002). */
  changes: { field: string; before: string | null; after: string | null }[];
  outcome: "SUCCESS" | "DENIED" | "FAILED";
  hash: string;
  previous_hash: string;
}

export interface AuditListParams extends ListParams {
  date_from?: string;
  date_to?: string;
  user_id?: string;
  event_type?: string;
  entity_type?: string;
  entity_id?: string;
  outcome?: string;
}

export interface AuditIntegrity {
  ok: boolean;
  checked_at: IsoDateTime;
  events: number;
  /** First event whose hash does not match, when the chain is broken. */
  broken_at: number | null;
}

export type SettingsGroupId =
  | "company" | "branches" | "departments" | "fiscal-years" | "currencies" | "numbering" | "approval-rules"
  | "notifications" | "statement-mapping" | "templates" | "dimensions" | "backup-status";

/** A settings group with its current value, a change waiting for approval, and history (FR-CFG-013). */
export interface SettingsGroup<T = unknown> {
  group: SettingsGroupId;
  value: T;
  version: number;
  /** Fields whose change needs Owner approval. */
  critical_fields: string[];
  read_only: boolean;
  pending: { value: T; fields: string[]; requested_by: string; requested_by_id: string; requested_at: IsoDateTime; reason: string } | null;
  history: (HistoryEvent & { changes: { field: string; before: string | null; after: string | null }[] })[];
}
