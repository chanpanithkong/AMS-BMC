import { HttpResponse } from "msw";
import type { AccessScope, AdminUser, AdminUserInput, AuditEvent, AuditIntegrity, Role, UserSession } from "@/lib/api/types/admin";
import type { ApprovalItem } from "@/lib/api/types/journals";
import { hasPermission, PERMISSIONS, type RoleCode } from "@/lib/rbac/permissions";
import { db } from "../db";
import { auditHash, isSensitivePermission, sodConflicts } from "../db/admin";
import { DEMO_PASSWORD, type MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, versionConflict, type Ctx } from "../http";
import { asOutcome } from "./cashbank";

// SRS §6.1 (users), §6.2 (roles, FR-RBAC-001..011), §6.18 (audit trail, FR-AUD-001..007), SCR-16, SCR-18.

const now = () => new Date().toISOString();
let counter = 0;
const invalid = (details: { field: string; issue: string; message: string; value?: string }[]) => fail(422, "VALIDATION_ERROR", details[0].message, details);
const selfChange = () => fail(403, "SELF_PERMISSION_CHANGE", "You cannot change your own permissions");
const isOwner = (u: MockUser) => u.roles.includes("OWNER");

const roleOf = (code: string) => db().roles.find((r) => r.code === code);
/** Effective permissions and base roles of a set of assigned roles. */
function resolve(codes: string[]) {
  const roles = codes.map(roleOf).filter((r): r is Role => Boolean(r && r.is_active));
  return {
    permissions: [...new Set(roles.flatMap((r) => r.permissions))].sort(),
    base: [...new Set(roles.map((r) => r.base_role))] as RoleCode[],
  };
}

function refreshCounts() {
  for (const r of db().roles) r.user_count = db().users.filter((u) => u.assigned_roles.includes(r.code)).length;
}

function applyAccess(u: MockUser, scope: AccessScope) {
  const { permissions, base } = resolve(scope.roles);
  Object.assign(u, {
    assigned_roles: [...scope.roles], roles: base, permissions, company_ids: scope.company_ids.length ? scope.company_ids : u.company_ids, branch_ids: scope.branch_ids,
    department_ids: scope.department_ids, cash_account_ids: scope.cash_account_ids, approval_limit: scope.approval_limit,
  });
}

const scopeOf = (u: MockUser): AccessScope => ({
  roles: u.assigned_roles, company_ids: u.company_ids, branch_ids: u.branch_ids, department_ids: u.department_ids, cash_account_ids: u.cash_account_ids, approval_limit: u.approval_limit,
});

export function userView(u: MockUser): AdminUser {
  return {
    id: u.id, username: u.username, email: u.email, full_name: u.full_name, full_name_km: u.full_name_km, phone: u.phone, locale: u.locale,
    status: u.status === "ACTIVE" && u.locked_until && u.locked_until > Date.now() ? "LOCKED" : u.status, mfa_enabled: u.mfa_enabled, last_login_at: u.last_login_at,
    ...scopeOf(u), permissions: u.permissions, sod_conflicts: sodConflicts(u.permissions), pending: u.pending_access, history: u.access_history, version: u.access_version,
  };
}

function logUser(u: MockUser, by: MockUser, action: string, comment?: string | null) {
  u.access_history.push({ id: `${u.id}-a${u.access_history.length + 1}`, at: now(), user_name: by.full_name, action, comment: comment ?? null });
  u.access_version += 1;
}
function logRole(r: Role, by: MockUser, action: string, comment?: string | null) {
  r.history.push({ id: `${r.code}-h${r.history.length + 1}`, at: now(), user_name: by.full_name, action, comment: comment ?? null });
  r.version += 1;
}

const findUser = (ctx: Ctx) => db().users.find((u) => u.id === ctx.params.id) ?? fail(404, "NOT_FOUND", "User not found.");
const findRole = (ctx: Ctx) => db().roles.find((r) => r.code === ctx.params.code) ?? fail(404, "NOT_FOUND", "Role not found.");

function validateScope(scope: AccessScope): Response | null {
  const details: { field: string; issue: string; message: string }[] = [];
  if (!scope.roles?.length) details.push({ field: "roles", issue: "required", message: "Choose at least one role" });
  for (const code of scope.roles ?? []) if (!roleOf(code)?.is_active) details.push({ field: "roles", issue: "invalid", message: `Role ${code} does not exist or is inactive` });
  if (scope.approval_limit !== null && scope.approval_limit !== undefined && !/^\d+(\.\d+)?$/.test(scope.approval_limit)) details.push({ field: "approval_limit", issue: "positive", message: "The limit must be zero or more" });
  return details.length ? invalid(details) : null;
}

/** FR-RBAC-010: adding sensitive permissions or raising a limit waits for the Owner; other changes apply at once. */
function needsApproval(u: MockUser, next: AccessScope): boolean {
  const added = resolve(next.roles).permissions.filter((p) => !u.permissions.includes(p));
  const raised = next.approval_limit === null ? u.approval_limit !== null : u.approval_limit !== null && Number(next.approval_limit) > Number(u.approval_limit);
  return added.some(isSensitivePermission) || raised;
}

export function pendingAdminApprovals(user: MockUser): ApprovalItem[] {
  if (!hasPermission(user.permissions, "roles.approve")) return [];
  const items: ApprovalItem[] = [];
  for (const u of db().users.filter((x) => x.pending_access)) {
    items.push({
      id: `apr-acc-${u.id}`, document_type: "USER_ACCESS", document_id: u.id, number: u.username, date: u.pending_access!.requested_at.slice(0, 10),
      description: `${u.full_name}: ${u.pending_access!.roles.join(", ")}`, total: u.pending_access!.approval_limit ?? "0", currency: "USD",
      preparer_id: u.pending_access!.requested_by_id, preparer_name: u.pending_access!.requested_by, submitted_at: u.pending_access!.requested_at, step: 1, step_role: "OWNER",
    });
  }
  for (const r of db().roles.filter((x) => x.pending)) {
    items.push({
      id: `apr-role-${r.code}`, document_type: "ROLE_CHANGE", document_id: r.code, number: r.code, date: r.pending!.requested_at.slice(0, 10),
      description: `${r.name}: ${r.pending!.permissions.filter((p) => !r.permissions.includes(p)).length} permissions added`, total: "0", currency: "USD",
      preparer_id: r.pending!.requested_by_id, preparer_name: r.pending!.requested_by, submitted_at: r.pending!.requested_at, step: 1, step_role: "OWNER",
    });
  }
  return items;
}

/** FR-AUD-007: recompute every hash; the first mismatch breaks the chain. */
export function verifyChain(): AuditIntegrity {
  const log = db().auditLogs;
  let broken: number | null = null;
  for (let i = 0; i < log.length; i += 1) {
    const e = log[i];
    const { hash, ...rest } = e;
    const expectedPrevious = i === 0 ? "0".repeat(64) : log[i - 1].hash;
    if (e.previous_hash !== expectedPrevious || auditHash(rest) !== hash) {
      broken = e.sequence;
      break;
    }
  }
  return { ok: broken === null, checked_at: now(), events: log.length, broken_at: broken };
}

function filterAudit(url: URL): AuditEvent[] {
  const q = url.searchParams;
  const search = (q.get("search") ?? "").toLowerCase();
  return [...db().auditLogs].reverse().filter((e) =>
    (!q.get("date_from") || e.at.slice(0, 10) >= q.get("date_from")!) && (!q.get("date_to") || e.at.slice(0, 10) <= q.get("date_to")!)
    && (!q.get("user_id") || e.user_id === q.get("user_id")) && (!q.get("event_type") || e.event_type.startsWith(q.get("event_type")!))
    && (!q.get("entity_type") || e.entity_type === q.get("entity_type")) && (!q.get("entity_id") || e.entity_id === q.get("entity_id"))
    && (!q.get("outcome") || e.outcome === q.get("outcome"))
    && (!search || `${e.event_type} ${e.entity_id ?? ""} ${e.user_name} ${e.reason ?? ""}`.toLowerCase().includes(search)));
}

const csvCell = (v: string | number | null) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const adminHandlers = [
  // ------------------------------------------------------------ users (SCR-16)
  route("get", "/users", "users.view", ({ url }) => {
    const q = url.searchParams;
    const search = (q.get("search") ?? "").toLowerCase();
    const rows = db().users.map(userView)
      .filter((u) => (!q.get("status") || u.status === q.get("status")) && (!q.get("role") || u.roles.includes(q.get("role")!)))
      .filter((u) => !search || `${u.username} ${u.full_name} ${u.full_name_km} ${u.email}`.toLowerCase().includes(search));
    return paginate(rows, url);
  }),

  route<AdminUserInput & AccessScope>("post", "/users", "users.manage", (ctx) => {
    const b = ctx.body;
    const details: { field: string; issue: string; message: string }[] = [];
    if (!/^[a-z0-9._-]{3,30}$/.test(b?.username ?? "")) details.push({ field: "username", issue: "format", message: "Username: 3–30 lowercase letters, digits, dots, dashes or underscores" });
    else if (db().users.some((u) => u.username === b.username)) details.push({ field: "username", issue: "duplicate", message: "This username is already used" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b?.email ?? "")) details.push({ field: "email", issue: "format", message: "Enter a valid email" });
    else if (db().users.some((u) => u.email === b.email)) details.push({ field: "email", issue: "duplicate", message: "This email is already used" });
    if (!b?.full_name?.trim()) details.push({ field: "full_name", issue: "required", message: "Enter the name" });
    if (details.length) return invalid(details);
    const bad = validateScope(b);
    if (bad) return bad;
    const u: MockUser = {
      id: `usr-${b.username}`, username: b.username, email: b.email, full_name: b.full_name.trim(), full_name_km: b.full_name_km?.trim() ?? "", phone: b.phone ?? "",
      roles: [], assigned_roles: [], permissions: [], locale: b.locale ?? "en", date_format: "DD/MM/YYYY", negative_style: "brackets", mfa_enabled: Boolean(b.mfa_enabled),
      default_company_id: ctx.company.id, department_ids: [], cash_account_ids: [], branch_ids: [], company_ids: [ctx.company.id], password: DEMO_PASSWORD,
      failed_attempts: 0, locked_until: null, approval_limit: "0", status: "ACTIVE", last_login_at: null, pending_access: null, access_history: [], access_version: 0,
    };
    // A new user starts with no access; sensitive roles then follow the approval rule.
    if (needsApproval(u, b)) u.pending_access = { ...b, requested_by: ctx.user.full_name, requested_by_id: ctx.user.id, requested_at: now() };
    else applyAccess(u, b);
    logUser(u, ctx.user, "CREATED", u.pending_access ? "Access waiting for approval" : null);
    db().users.push(u);
    refreshCounts();
    return HttpResponse.json(userView(u), { status: 201 });
  }),

  route("get", "/users/:id", "users.view", (ctx) => {
    const u = findUser(ctx);
    return u instanceof Response ? u : HttpResponse.json(userView(u));
  }),

  route<AdminUserInput>("patch", "/users/:id", "users.manage", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    const stale = versionConflict(ctx, u.access_version);
    if (stale) return stale;
    const b = ctx.body;
    if (b.email && b.email !== u.email && db().users.some((x) => x.email === b.email)) return invalid([{ field: "email", issue: "duplicate", message: "This email is already used" }]);
    Object.assign(u, { full_name: b.full_name?.trim() || u.full_name, full_name_km: b.full_name_km ?? u.full_name_km, email: b.email || u.email, phone: b.phone ?? u.phone, locale: b.locale ?? u.locale, mfa_enabled: b.mfa_enabled ?? u.mfa_enabled });
    logUser(u, ctx.user, "EDITED");
    return HttpResponse.json(userView(u));
  }),

  // Roles, scopes and limits (FR-RBAC-010); nobody changes their own (SCR-16).
  route<AccessScope>("put", "/users/:id/access", "users.manage", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    if (u.id === ctx.user.id) return selfChange();
    const stale = versionConflict(ctx, u.access_version);
    if (stale) return stale;
    const bad = validateScope(ctx.body);
    if (bad) return bad;
    const conflicts = sodConflicts(resolve(ctx.body.roles).permissions);
    if (conflicts.length && !db().reducedSod) {
      return fail(422, "SOD_CONFLICT", `This combination creates an SoD conflict: ${conflicts[0].description}`, conflicts.map((c) => ({ field: "roles", issue: c.code, value: c.description })));
    }
    if (needsApproval(u, ctx.body)) {
      u.pending_access = { ...ctx.body, requested_by: ctx.user.full_name, requested_by_id: ctx.user.id, requested_at: now() };
      logUser(u, ctx.user, "ACCESS_REQUESTED", ctx.body.roles.join(", "));
    } else {
      applyAccess(u, ctx.body);
      logUser(u, ctx.user, "ACCESS_CHANGED", ctx.body.roles.join(", "));
    }
    refreshCounts();
    return HttpResponse.json(userView(u));
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/users/:id/access/decision", "roles.approve", (ctx) =>
    idempotent(ctx, () => {
      const u = findUser(ctx);
      if (u instanceof Response) return asOutcome(u);
      if (!u.pending_access) return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "No access change is waiting."));
      if (u.id === ctx.user.id) return asOutcome(selfChange());
      if (u.pending_access.requested_by_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You requested this change and cannot approve it"));
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) return asOutcome(invalid([{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        u.pending_access = null;
        logUser(u, ctx.user, "ACCESS_REJECTED", ctx.body.comment.trim());
      } else {
        applyAccess(u, u.pending_access);
        u.pending_access = null;
        logUser(u, ctx.user, "ACCESS_APPROVED");
      }
      refreshCounts();
      return { status: 200, body: userView(u) };
    }),
  ),

  // FR-AUTH-005: deactivation revokes every session at once.
  route<{ status: "ACTIVE" | "INACTIVE"; reason: string }>("post", "/users/:id/status", "users.manage", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    if (u.id === ctx.user.id) return selfChange();
    if (!ctx.body?.reason?.trim()) return fail(422, "REASON_REQUIRED", "A reason is required", [{ field: "reason", issue: "required" }]);
    u.status = ctx.body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    if (u.status === "INACTIVE") db().sessions = db().sessions.filter((s) => s.user_id !== u.id);
    logUser(u, ctx.user, u.status === "INACTIVE" ? "DEACTIVATED" : "ACTIVATED", ctx.body.reason.trim());
    return HttpResponse.json(userView(u));
  }),

  // FR-AUTH-010: unlock and MFA reset record the reason.
  route<{ reason: string }>("post", "/users/:id/unlock", "users.manage", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    if (!ctx.body?.reason?.trim()) return fail(422, "REASON_REQUIRED", "A reason is required", [{ field: "reason", issue: "required" }]);
    u.locked_until = null;
    u.failed_attempts = 0;
    logUser(u, ctx.user, "UNLOCKED", ctx.body.reason.trim());
    return HttpResponse.json(userView(u));
  }),
  route<{ reason: string }>("post", "/users/:id/reset-mfa", "users.manage", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    if (u.id === ctx.user.id) return selfChange();
    if (!ctx.body?.reason?.trim()) return fail(422, "REASON_REQUIRED", "A reason is required", [{ field: "reason", issue: "required" }]);
    logUser(u, ctx.user, "MFA_RESET", ctx.body.reason.trim());
    return HttpResponse.json(userView(u));
  }),

  route("get", "/users/:id/sessions", "users.view", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    const current = /^Bearer mock\.[^.]+\.([^.]+)\./.exec(ctx.request.headers.get("Authorization") ?? "")?.[1];
    const data: UserSession[] = db().sessions.filter((s) => s.user_id === u.id).map((s) => ({ ...s, current: s.id === current }));
    return HttpResponse.json({ data });
  }),
  route("delete", "/users/:id/sessions/:sessionId", "users.manage", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    db().sessions = db().sessions.filter((s) => !(s.user_id === u.id && s.id === ctx.params.sessionId));
    logUser(u, ctx.user, "SESSION_REVOKED", ctx.params.sessionId);
    return HttpResponse.json({ data: db().sessions.filter((s) => s.user_id === u.id) });
  }),
  route("get", "/users/:id/activity", "users.view", (ctx) => {
    const u = findUser(ctx);
    if (u instanceof Response) return u;
    return paginate([...db().auditLogs].reverse().filter((e) => e.user_id === u.id || (e.entity_type === "users" && e.entity_id === u.id) || (e.entity_type === "auth" && e.entity_id === u.id)), ctx.url);
  }),

  // ------------------------------------------------------------ roles (SCR-16)
  route("get", "/roles", "users.view", ({ url }) => {
    refreshCounts();
    return paginate(db().roles, url);
  }),
  route("get", "/permissions", "users.view", () => HttpResponse.json({ data: PERMISSIONS, sensitive: PERMISSIONS.filter(isSensitivePermission) })),
  route("get", "/roles/:code", "users.view", (ctx) => {
    const r = findRole(ctx);
    return r instanceof Response ? r : HttpResponse.json(r);
  }),

  // FR-RBAC-002: custom roles copy a role and follow its menu visibility.
  route<{ code: string; name: string; name_km: string; description: string; copy_from: string }>("post", "/roles", "roles.manage", (ctx) => {
    const b = ctx.body;
    const source = roleOf(b?.copy_from ?? "");
    const code = (b?.code ?? "").trim().toUpperCase();
    const details: { field: string; issue: string; message: string }[] = [];
    if (!/^[A-Z][A-Z0-9_]{2,19}$/.test(code)) details.push({ field: "code", issue: "format", message: "Code: 3–20 capital letters, digits or underscores" });
    else if (roleOf(code)) details.push({ field: "code", issue: "duplicate", message: "This role code is already used" });
    if (!b?.name?.trim()) details.push({ field: "name", issue: "required", message: "Enter the name" });
    if (!source) details.push({ field: "copy_from", issue: "required", message: "Choose the role to copy" });
    if (details.length) return invalid(details);
    const role: Role = {
      code, name: b.name.trim(), name_km: b.name_km?.trim() || b.name.trim(), description: b.description ?? "", is_default: false, base_role: source!.base_role,
      permissions: [...source!.permissions], is_active: true, pending: null, user_count: 0, history: [], version: 0,
    };
    logRole(role, ctx.user, "CREATED", `Copied from ${source!.code}`);
    db().roles.push(role);
    return HttpResponse.json(role, { status: 201 });
  }),

  route<{ permissions: string[]; name?: string; name_km?: string; description?: string; is_active?: boolean }>("put", "/roles/:code", "roles.manage", (ctx) => {
    const r = findRole(ctx);
    if (r instanceof Response) return r;
    if (ctx.user.assigned_roles.includes(r.code)) return selfChange();
    const stale = versionConflict(ctx, r.version);
    if (stale) return stale;
    const unknown = (ctx.body.permissions ?? []).filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
    if (unknown.length) return invalid([{ field: "permissions", issue: "unknown", message: `Unknown permission ${unknown[0]}` }]);
    const next = [...new Set(ctx.body.permissions ?? r.permissions)].sort();
    const conflicts = sodConflicts(next);
    if (conflicts.length && !db().reducedSod) {
      return fail(422, "SOD_CONFLICT", `This combination creates an SoD conflict: ${conflicts[0].description}`, conflicts.map((c) => ({ field: "permissions", issue: c.code, value: c.description })));
    }
    Object.assign(r, { name: ctx.body.name?.trim() || r.name, name_km: ctx.body.name_km ?? r.name_km, description: ctx.body.description ?? r.description, is_active: ctx.body.is_active ?? r.is_active });
    const added = next.filter((p) => !r.permissions.includes(p));
    if (added.some(isSensitivePermission)) {
      r.pending = { permissions: next, requested_by: ctx.user.full_name, requested_by_id: ctx.user.id, requested_at: now() };
      logRole(r, ctx.user, "CHANGE_REQUESTED", `${added.length} added`);
    } else {
      r.permissions = next;
      for (const u of db().users.filter((x) => x.assigned_roles.includes(r.code))) applyAccess(u, scopeOf(u));
      logRole(r, ctx.user, "EDITED");
    }
    return HttpResponse.json(r);
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/roles/:code/decision", "roles.approve", (ctx) =>
    idempotent(ctx, () => {
      const r = findRole(ctx);
      if (r instanceof Response) return asOutcome(r);
      if (!r.pending) return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "No role change is waiting."));
      if (r.pending.requested_by_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You requested this change and cannot approve it"));
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) return asOutcome(invalid([{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        r.pending = null;
        logRole(r, ctx.user, "CHANGE_REJECTED", ctx.body.comment.trim());
      } else {
        r.permissions = r.pending.permissions;
        r.pending = null;
        for (const u of db().users.filter((x) => x.assigned_roles.includes(r.code))) applyAccess(u, scopeOf(u));
        logRole(r, ctx.user, "CHANGE_APPROVED");
      }
      return { status: 200, body: r };
    }),
  ),

  // ------------------------------------------------------------ audit trail (SCR-18)
  route("get", "/audit-logs", "aud.view", ({ url }) => paginate(filterAudit(url), url)),
  route("get", "/audit-logs/integrity", "aud.view", () => HttpResponse.json(verifyChain())),
  route("get", "/audit-logs/:id", "aud.view", (ctx) => {
    const e = db().auditLogs.find((x) => x.id === ctx.params.id);
    return e ? HttpResponse.json(e) : fail(404, "NOT_FOUND", "Event not found.");
  }),
  // FR-AUD-006: exports are themselves audited.
  route("post", "/audit-logs/export", "aud.export", (ctx) => {
    const rows = filterAudit(ctx.url);
    const header = ["sequence", "time_utc", "user", "event", "entity", "entity_id", "company", "branch", "ip", "outcome", "reason", "changes", "hash"];
    const body = [header, ...rows.map((e) => [e.sequence, e.at, e.user_name, e.event_type, e.entity_type, e.entity_id, e.company_id, e.branch_id, e.ip, e.outcome, e.reason, e.changes.filter((c) => c.before !== c.after).map((c) => `${c.field}: ${c.before ?? ""} → ${c.after ?? ""}`).join("; "), e.hash])]
      .map((r) => r.map(csvCell).join(",")).join("\r\n");
    // The request itself is recorded as "audit-logs.export" by the audit layer (mocks/http.ts).
    return new HttpResponse(`﻿${body}\r\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-trail.csv"` } });
  }),
];
