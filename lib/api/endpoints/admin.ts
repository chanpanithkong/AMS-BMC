import { api, apiFetch } from "../client";
import type { AccessScope, AdminUser, AdminUserInput, AuditEvent, AuditIntegrity, AuditListParams, Role, SettingsGroup, SettingsGroupId, UserListParams, UserSession } from "../types/admin";
import type { Page } from "../types/common";

const key = (idempotencyKey: string) => ({ idempotencyKey });
type Decision = "approve" | "reject";

// SRS §13.3 /users, /roles (+ ASSUMPTION: /users/{id}/access, /status, /unlock, /reset-mfa, /sessions, /activity).
export const adminApi = {
  users: (params: UserListParams = {}, signal?: AbortSignal) => api.get<Page<AdminUser>>("/users", { ...params }, signal),
  user: (id: string, signal?: AbortSignal) => api.get<AdminUser>(`/users/${id}`, undefined, signal),
  createUser: (input: AdminUserInput & AccessScope) => api.post<AdminUser>("/users", input),
  updateUser: (id: string, input: AdminUserInput, version: number) => api.patch<AdminUser>(`/users/${id}`, input, version),
  setAccess: (id: string, scope: AccessScope, version: number) => api.put<AdminUser>(`/users/${id}/access`, {
    roles: scope.roles, company_ids: scope.company_ids, branch_ids: scope.branch_ids, department_ids: scope.department_ids, cash_account_ids: scope.cash_account_ids, approval_limit: scope.approval_limit,
  }, version),
  decideAccess: (id: string, action: Decision, comment: string, k: string) => api.post<AdminUser>(`/users/${id}/access/decision`, { action, comment }, key(k)),
  setStatus: (id: string, status: "ACTIVE" | "INACTIVE", reason: string) => api.post<AdminUser>(`/users/${id}/status`, { status, reason }),
  unlock: (id: string, reason: string) => api.post<AdminUser>(`/users/${id}/unlock`, { reason }),
  resetMfa: (id: string, reason: string) => api.post<AdminUser>(`/users/${id}/reset-mfa`, { reason }),
  sessions: (id: string, signal?: AbortSignal) => api.get<{ data: UserSession[] }>(`/users/${id}/sessions`, undefined, signal),
  revokeSession: (id: string, sessionId: string) => api.delete<{ data: UserSession[] }>(`/users/${id}/sessions/${sessionId}`),
  activity: (id: string, params: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignal) => api.get<Page<AuditEvent>>(`/users/${id}/activity`, { ...params }, signal),
  roles: (signal?: AbortSignal) => api.get<Page<Role>>("/roles", { limit: 200 }, signal),
  role: (code: string, signal?: AbortSignal) => api.get<Role>(`/roles/${code}`, undefined, signal),
  permissions: (signal?: AbortSignal) => api.get<{ data: string[]; sensitive: string[] }>("/permissions", undefined, signal),
  createRole: (input: { code: string; name: string; name_km: string; description: string; copy_from: string }) => api.post<Role>("/roles", input),
  updateRole: (code: string, input: { permissions?: string[]; name?: string; name_km?: string; description?: string; is_active?: boolean }, version: number) =>
    api.put<Role>(`/roles/${code}`, input, version),
  decideRole: (code: string, action: Decision, comment: string, k: string) => api.post<Role>(`/roles/${code}/decision`, { action, comment }, key(k)),
};

// SRS §13.3 /audit-logs (+ ASSUMPTION: /integrity, POST /export).
export const auditApi = {
  list: (params: AuditListParams = {}, signal?: AbortSignal) => api.get<Page<AuditEvent>>("/audit-logs", { ...params }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<AuditEvent>(`/audit-logs/${id}`, undefined, signal),
  integrity: (signal?: AbortSignal) => api.get<AuditIntegrity>("/audit-logs/integrity", undefined, signal),
  export: (params: AuditListParams) => apiFetch<Blob>("/audit-logs/export", { method: "POST", responseType: "blob", query: { ...params } as Record<string, string> }),
};

// SRS §13.3 /settings (+ ASSUMPTION: per group, /decision, /fiscal-years/next).
export const settingsApi = {
  groups: (signal?: AbortSignal) => api.get<{ data: { group: SettingsGroupId; version: number; pending: boolean; read_only: boolean; critical_fields: string[] }[] }>("/settings", undefined, signal),
  get: <T = unknown>(group: SettingsGroupId, signal?: AbortSignal) => api.get<SettingsGroup<T>>(`/settings/${group}`, undefined, signal),
  save: <T = unknown>(group: SettingsGroupId, value: T, version: number, reason?: string) => api.put<SettingsGroup<T>>(`/settings/${group}`, { value, reason }, version),
  decide: <T = unknown>(group: SettingsGroupId, action: Decision, comment: string, k: string) => api.post<SettingsGroup<T>>(`/settings/${group}/decision`, { action, comment }, key(k)),
  nextFiscalYear: () => api.post<SettingsGroup>("/settings/fiscal-years/next"),
};
