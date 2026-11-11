"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, KeyRound, LogOut, Plus, Save, ShieldAlert, Unlock, UserCheck, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useAccountLabel, useCashBankAccounts, useHistoryLabel } from "@/components/cb/use-cash-bank";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, FormSkeleton, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AmountInput } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryPanel } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { adminApi } from "@/lib/api/endpoints/admin";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { AccessScope, AdminUser, AdminUserInput, Role } from "@/lib/api/types/admin";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { AppLink, useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { Can, usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { sodConflictsOf } from "./sod";

export function useRoles() {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({ queryKey: ["roles", companyId], queryFn: ({ signal }) => adminApi.roles(signal), select: (p) => p.data });
}

/** SCR-16 user list. */
export function UsersPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const router = useAppRouter();
  const format = useFormatters();
  const companyId = useUiStore((s) => s.companyId);
  const { data: roles } = useRoles();
  const { filters, setFilters, clear } = useUrlFilters(["status", "role", "search"] as const);
  const roleName = (code: string) => { const r = roles?.find((x) => x.code === code); return r ? (locale === "km" ? r.name_km : r.name) : code; };
  const columns: ColumnDef<AdminUser, unknown>[] = [
    { id: "username", header: t("admin.users.col.username"), cell: ({ row }) => <AppLink href={`/admin/users/${row.original.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.username}</AppLink> },
    { id: "name", header: t("admin.users.col.name"), cell: ({ row }) => (locale === "km" && row.original.full_name_km ? row.original.full_name_km : row.original.full_name) },
    { id: "email", header: t("admin.users.col.email"), cell: ({ row }) => row.original.email },
    { id: "roles", header: t("admin.users.col.roles"), cell: ({ row }) => <span className="block min-w-40">{row.original.roles.map(roleName).join(", ")}{row.original.pending && <span className="ml-1 rounded border border-warning/40 px-1 text-xs text-warning">{t("admin.pendingBadge")}</span>}</span> },
    { id: "mfa", header: t("admin.users.col.mfa"), cell: ({ row }) => (row.original.mfa_enabled ? t("admin.users.mfaOn") : t("admin.users.mfaOff")) },
    { id: "last", header: t("admin.users.col.lastLogin"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{row.original.last_login_at ? format.dateTime(row.original.last_login_at) : "â€”"}</span> },
    { id: "sod", header: t("admin.users.col.sod"), cell: ({ row }) => (row.original.sod_conflicts.length ? <span className="inline-flex items-center gap-1 text-warning"><ShieldAlert className="size-3.5" aria-hidden />{row.original.sod_conflicts.length}</span> : "â€”") },
    { id: "status", header: t("admin.users.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status === "LOCKED" ? "BLOCKED" : row.original.status} /> },
  ];
  return (
    <div className="min-w-0">
      <PageHeader title={t("admin.users.title")} description={t("admin.users.description")}
        actions={<Can permission="users.manage"><Button size="sm" asChild data-testid="new-user"><AppLink href="/admin/users/new"><Plus aria-hidden />{t("admin.users.new")}</AppLink></Button></Can>} />
      <StatusTabs label={t("admin.users.col.status")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={["", "ACTIVE", "INACTIVE", "LOCKED"].map((s) => ({ value: s, label: s ? t(`admin.users.status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("admin.users.search")} onClear={() => clear()} canClear={Boolean(filters.role || filters.search)}>
        <NativeSelect className="w-auto" aria-label={t("admin.users.col.roles")} value={filters.role} onChange={(e) => setFilters({ role: e.target.value })}>
          <option value="">{t("admin.users.allRoles")}</option>
          {roles?.map((r) => <option key={r.code} value={r.code}>{locale === "km" ? r.name_km : r.name}</option>)}
        </NativeSelect>
      </FilterBar>
      <DataTable<AdminUser>
        tableId="users" caption={t("admin.users.title")} columns={columns}
        queryKey={["users", companyId, filters.status, filters.role, filters.search]}
        fetchPage={({ cursor, limit }, signal) => adminApi.users({ cursor, limit, status: filters.status || undefined, role: filters.role || undefined, search: filters.search || undefined }, signal)}
        getRowId={(r) => r.id} onRowClick={(r) => router.push(`/admin/users/${r.id}`)}
        empty={<EmptyState title={t("data.table.noResults")} />}
      />
    </div>
  );
}

export function UserPage({ id }: { id: string }) {
  const t = useTranslations();
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["user", id], queryFn: ({ signal }) => adminApi.user(id, signal), enabled: !isNew });
  if (isNew) return <div><PageHeader title={t("admin.users.new")} /><NewUserForm /></div>;
  if (query.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("admin.users.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <UserView user={query.data} />;
}

const emptyScope = (): AccessScope => ({ roles: [], company_ids: [], branch_ids: [], department_ids: [], cash_account_ids: [], approval_limit: "0" });

/** Roles, branches, departments, cash accounts and value limit, with the live SoD panel. */
function AccessEditor({ value, onChange, disabled, roles }: { value: AccessScope; onChange: (v: AccessScope) => void; disabled?: boolean; roles: Role[] }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const company = useCurrentCompany();
  const label = useAccountLabel();
  const { data: departments } = useDepartments();
  const { accounts } = useCashBankAccounts();
  const conflicts = sodConflictsOf(roles.filter((r) => value.roles.includes(r.code)).flatMap((r) => r.permissions));
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const group = (legend: string, items: { id: string; label: string }[], selected: string[], key: keyof AccessScope, hint?: string) => (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm">
            <Checkbox checked={selected.includes(i.id)} onCheckedChange={() => onChange({ ...value, [key]: toggle(selected, i.id) })} data-testid={`access-${String(key)}-${i.id}`} />{i.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-4">
      {group(t("admin.access.roles"), roles.filter((r) => r.is_active).map((r) => ({ id: r.code, label: locale === "km" ? r.name_km : r.name })), value.roles, "roles")}
      {group(t("admin.access.branches"), (company?.branches ?? []).map((b) => ({ id: b.id, label: locale === "km" ? b.name_km : b.name })), value.branch_ids, "branch_ids", t("admin.access.branchesHint"))}
      {group(t("admin.access.departments"), (departments ?? []).map((d) => ({ id: d.id, label: locale === "km" ? d.name_km : d.name })), value.department_ids, "department_ids", t("admin.access.departmentsHint"))}
      {group(t("admin.access.cash"), accounts.filter((a) => a.kind === "CASH").map((a) => ({ id: a.id, label: label(a) })), value.cash_account_ids, "cash_account_ids", t("admin.access.cashHint"))}
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="acc-limit" label={t("admin.access.limit")} hint={t("admin.access.limitHint")}>
          <AmountInput id="acc-limit" currency="USD" value={value.approval_limit ?? ""} disabled={disabled || value.approval_limit === null} onValueChange={(approval_limit) => onChange({ ...value, approval_limit: approval_limit || "0" })} aria-describedby="acc-limit-hint" className="w-40" />
        </FormField>
        <label className="flex h-8 items-center gap-2 text-sm"><Checkbox checked={value.approval_limit === null} disabled={disabled} onCheckedChange={(v) => onChange({ ...value, approval_limit: v === true ? null : "0" })} />{t("admin.access.noLimit")}</label>
      </div>
      <section className={`rounded-lg border p-3 text-sm ${conflicts.length ? "border-warning/40 bg-warning/10" : ""}`} aria-labelledby="sod-title" data-testid="sod-panel">
        <h3 id="sod-title" className="mb-1 flex items-center gap-1.5 font-semibold"><ShieldAlert className="size-4" aria-hidden />{t("admin.sod.title")}</h3>
        {conflicts.length === 0 ? <p className="text-muted-foreground">{t("admin.sod.none")}</p> : (
          <ul className="list-disc space-y-0.5 pl-5">{conflicts.map((c) => <li key={c.code}>{t("admin.sod.conflict", { description: locale === "km" ? c.description_km : c.description })}</li>)}</ul>
        )}
      </section>
    </div>
  );
}

function NewUserForm() {
  const t = useTranslations();
  const router = useAppRouter();
  const describe = useDescribeError();
  const queryClient = useQueryClient();
  const { data: roles } = useRoles();
  const [profile, setProfile] = useState<AdminUserInput>({ username: "", email: "", full_name: "", full_name_km: "", phone: "", locale: "en", mfa_enabled: false });
  const [scope, setScope] = useState<AccessScope>(emptyScope);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.createUser({ ...profile, ...scope }),
    onSuccess: (u) => { void queryClient.invalidateQueries({ queryKey: ["users"] }); toast.success(t("admin.users.created", { name: u.username })); router.replace(`/admin/users/${u.id}`); },
    onError: (e) => { if (isApiError(e)) setErrors(e.fieldErrors); setFailure(isApiError(e) && e.details[0]?.message ? e.details[0].message : describe(e).message); },
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setFailure(null); create.mutate(); }} data-testid="new-user-form">
      <ProfileFields value={profile} onChange={setProfile} errors={errors} withUsername />
      <section className="rounded-xl border bg-card p-4"><AccessEditor value={scope} onChange={setScope} roles={roles ?? []} /></section>
      <p className="text-xs text-muted-foreground">{t("admin.users.createHint")}</p>
      {failure && <p className="flex items-center gap-2 text-sm text-destructive" role="alert"><AlertTriangle className="size-4" aria-hidden />{failure}</p>}
      <div className="flex justify-end"><Button type="submit" disabled={create.isPending}><Save aria-hidden />{t("admin.users.create")}</Button></div>
    </form>
  );
}

function ProfileFields({ value, onChange, errors, withUsername, disabled }: { value: AdminUserInput; onChange: (v: AdminUserInput) => void; errors: Record<string, string>; withUsername?: boolean; disabled?: boolean }) {
  const t = useTranslations();
  const f = (key: keyof AdminUserInput, label: string, type = "text", required = false) => (
    <FormField id={`u-${key}`} label={label} required={required} error={errors[key]}>
      <Input id={`u-${key}`} type={type} value={String(value[key] ?? "")} disabled={disabled} onChange={(e) => onChange({ ...value, [key]: e.target.value })} aria-invalid={Boolean(errors[key])} aria-describedby={describedBy(`u-${key}`, errors[key])} />
    </FormField>
  );
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      {withUsername && f("username", t("admin.users.col.username"), "text", true)}
      {f("full_name", t("admin.users.form.name"), "text", true)}
      {f("full_name_km", t("admin.users.form.nameKm"))}
      {f("email", t("admin.users.col.email"), "email", true)}
      {f("phone", t("admin.users.form.phone"))}
      <FormField id="u-locale" label={t("admin.users.form.language")}>
        <NativeSelect id="u-locale" value={value.locale} disabled={disabled} onChange={(e) => onChange({ ...value, locale: e.target.value as "en" | "km" })}><option value="en">English</option><option value="km">ážáŸ’áž˜áŸ‚ážš</option></NativeSelect>
      </FormField>
      <label className="flex items-center gap-2 self-end text-sm"><Checkbox checked={value.mfa_enabled} disabled={disabled} onCheckedChange={(v) => onChange({ ...value, mfa_enabled: v === true })} />{t("admin.users.form.mfa")}</label>
    </section>
  );
}

type Dialog = "deactivate" | "activate" | "unlock" | "mfa" | "approve" | "reject" | null;

function UserView({ user: u }: { user: AdminUser }) {
  const t = useTranslations();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const historyLabel = useHistoryLabel();
  const me = useSession((s) => s.user?.id);
  const can = { manage: usePermission("users.manage"), approve: usePermission("roles.approve") };
  const { data: roles } = useRoles();
  const self = u.id === me;
  const [profile, setProfile] = useState<AdminUserInput>({ username: u.username, email: u.email, full_name: u.full_name, full_name_km: u.full_name_km, phone: u.phone, locale: u.locale, mfa_enabled: u.mfa_enabled });
  const [scope, setScope] = useState<AccessScope>({ roles: u.roles, company_ids: u.company_ids, branch_ids: u.branch_ids, department_ids: u.department_ids, cash_account_ids: u.cash_account_ids, approval_limit: u.approval_limit });
  const [failure, setFailure] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const sessions = useQuery({ queryKey: ["user-sessions", u.id], queryFn: ({ signal }) => adminApi.sessions(u.id, signal) });
  const activity = useQuery({ queryKey: ["user-activity", u.id], queryFn: ({ signal }) => adminApi.activity(u.id, { limit: 50 }, signal) });
  const update = (next: AdminUser) => {
    queryClient.setQueryData(["user", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["user-sessions", next.id] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const saveProfile = useMutation({ mutationFn: () => adminApi.updateUser(u.id, profile, u.version), onSuccess: (n) => { update(n); toast.success(t("admin.saved")); }, onError: errorToast });
  const saveAccess = useMutation({
    mutationFn: () => adminApi.setAccess(u.id, scope, u.version),
    onSuccess: (n) => { update(n); toast.success(n.pending ? t("admin.access.sentForApproval") : t("admin.saved")); },
    onError: (e) => setFailure(describe(e).message === t("errors.UNKNOWN_ERROR") && isApiError(e) ? e.message : describe(e).message),
  });
  const revoke = useMutation({ mutationFn: (sid: string) => adminApi.revokeSession(u.id, sid), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["user-sessions", u.id] }), onError: errorToast });
  const effect = { currency: "USD", accounts: [u.username] };
  const reasonAction = async (fn: (reason: string) => Promise<AdminUser>, reason: string) => { const n = await fn(reason); update(n); return t("admin.saved"); };

  return (
    <div className="space-y-4" data-testid="user-page" data-status={u.status}>
      <PageHeader title={`${u.full_name} (${u.username})`} badge={<StatusBadge status={u.status === "LOCKED" ? "BLOCKED" : u.status} />} description={u.email}
        actions={can.manage && !self && <>
          {u.status === "LOCKED" && <Button size="sm" variant="outline" onClick={() => setDialog("unlock")}><Unlock aria-hidden />{t("admin.users.unlock")}</Button>}
          {u.mfa_enabled && <Button size="sm" variant="outline" onClick={() => setDialog("mfa")}><KeyRound aria-hidden />{t("admin.users.resetMfa")}</Button>}
          {u.status !== "INACTIVE" ? <Button size="sm" variant="destructive" onClick={() => setDialog("deactivate")} data-testid="user-deactivate"><UserX aria-hidden />{t("admin.users.deactivate")}</Button>
            : <Button size="sm" onClick={() => setDialog("activate")}><UserCheck aria-hidden />{t("admin.users.activate")}</Button>}
        </>} />
      {self && <p className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm" role="status">{t("admin.users.selfNote")}</p>}
      {u.pending && (
        <section className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status" data-testid="access-pending">
          <p>{t("admin.access.pending", { by: u.pending.requested_by, roles: u.pending.roles.join(", "), limit: u.pending.approval_limit ?? t("admin.access.noLimit") })}</p>
          {can.approve && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" disabled={u.pending.requested_by_id === me} onClick={() => setDialog("reject")}>{t("arap.actions.reject")}</Button>
              <Button size="sm" disabled={u.pending.requested_by_id === me} onClick={() => setDialog("approve")} data-testid="access-approve">{t("arap.actions.approve")}</Button>
            </div>
          )}
        </section>
      )}
      <Tabs defaultValue="access">
        <TabsList className="flex-wrap">
          <TabsTrigger value="access">{t("admin.users.tabs.access")}</TabsTrigger>
          <TabsTrigger value="profile">{t("admin.users.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="sessions">{t("admin.users.tabs.sessions")}</TabsTrigger>
          <TabsTrigger value="activity">{t("admin.users.tabs.activity")}</TabsTrigger>
        </TabsList>
        <TabsContent value="access" className="space-y-3">
          <section className="rounded-xl border bg-card p-4"><AccessEditor value={scope} onChange={setScope} disabled={!can.manage || self || Boolean(u.pending)} roles={roles ?? []} /></section>
          <p className="text-xs text-muted-foreground">{t("admin.access.approvalNote")}</p>
          {failure && <p className="flex items-center gap-2 text-sm text-destructive" role="alert" data-testid="access-error"><AlertTriangle className="size-4" aria-hidden />{failure}</p>}
          {can.manage && !self && !u.pending && <div className="flex justify-end"><Button onClick={() => { setFailure(null); saveAccess.mutate(); }} disabled={saveAccess.isPending} data-testid="access-save"><Save aria-hidden />{t("admin.access.save")}</Button></div>}
          <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="perm-title">
            <h2 id="perm-title" className="mb-1 font-semibold">{t("admin.users.effective", { count: u.permissions.length })}</h2>
            <p className="font-mono text-xs leading-relaxed text-muted-foreground">{u.permissions.join(" Â· ")}</p>
          </section>
        </TabsContent>
        <TabsContent value="profile" className="space-y-3">
          <ProfileFields value={profile} onChange={setProfile} errors={{}} disabled={!can.manage} />
          {can.manage && <div className="flex justify-end"><Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}><Save aria-hidden />{t("common.save")}</Button></div>}
          <div className="rounded-xl border bg-card p-4"><HistoryPanel events={u.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
        </TabsContent>
        <TabsContent value="sessions">
          {sessions.isPending ? <TableSkeleton rows={2} /> : sessions.isError ? <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} /> : sessions.data.data.length === 0 ? <EmptyState title={t("admin.users.noSessions")} className="rounded-lg border py-8" /> : (
            <ul className="divide-y rounded-lg border text-sm" data-testid="sessions">
              {sessions.data.data.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span><span className="block font-medium">{s.device.slice(0, 60)}{s.current && ` (${t("admin.users.thisSession")})`}</span><span className="text-xs text-muted-foreground">{s.ip} Â· {t("admin.users.lastActivity", { at: format.dateTime(s.last_activity_at) })}</span></span>
                  {can.manage && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}><LogOut aria-hidden />{t("admin.users.revoke")}</Button>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="activity">
          {activity.isPending ? <TableSkeleton rows={4} /> : activity.isError ? <ErrorState error={activity.error} onRetry={() => activity.refetch()} /> : (
            <ul className="divide-y rounded-lg border text-sm">
              {activity.data.data.slice(0, 50).map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 px-3 py-1.5"><span>{e.event_type} {e.entity_id && <span className="text-muted-foreground">Â· {e.entity_id}</span>}</span><span className="tabular-nums text-muted-foreground">{format.dateTime(e.at)} Â· {e.outcome}</span></li>)}
              {activity.data.data.length === 0 && <li className="px-3 py-2 text-muted-foreground">{t("admin.users.noActivity")}</li>}
            </ul>
          )}
        </TabsContent>
      </Tabs>
      <ConfirmActionDialog open={dialog === "deactivate"} onOpenChange={(o) => !o && setDialog(null)} action="reject" requireReason title={t("admin.users.deactivateTitle", { name: u.username })} description={t("admin.users.deactivateDescription")} effect={effect} thresholdAmount="0"
        onConfirm={({ reason }) => reasonAction((r) => adminApi.setStatus(u.id, "INACTIVE", r), reason)} />
      <ConfirmActionDialog open={dialog === "activate"} onOpenChange={(o) => !o && setDialog(null)} action="approve" requireReason title={t("admin.users.activateTitle", { name: u.username })} effect={effect} thresholdAmount="0"
        onConfirm={({ reason }) => reasonAction((r) => adminApi.setStatus(u.id, "ACTIVE", r), reason)} />
      <ConfirmActionDialog open={dialog === "unlock"} onOpenChange={(o) => !o && setDialog(null)} action="approve" requireReason title={t("admin.users.unlockTitle", { name: u.username })} effect={effect} thresholdAmount="0"
        onConfirm={({ reason }) => reasonAction((r) => adminApi.unlock(u.id, r), reason)} />
      <ConfirmActionDialog open={dialog === "mfa"} onOpenChange={(o) => !o && setDialog(null)} action="approve" requireReason title={t("admin.users.mfaTitle", { name: u.username })} description={t("admin.users.mfaDescription")} effect={effect} thresholdAmount="0"
        onConfirm={({ reason }) => reasonAction((r) => adminApi.resetMfa(u.id, r), reason)} />
      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("admin.access.approveTitle", { name: u.username })} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const n = await adminApi.decideAccess(u.id, "approve", "", idempotencyKey); update(n); setScope({ roles: n.roles, company_ids: n.company_ids, branch_ids: n.branch_ids, department_ids: n.department_ids, cash_account_ids: n.cash_account_ids, approval_limit: n.approval_limit }); return t("status.APPROVED"); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("admin.access.rejectTitle", { name: u.username })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const n = await adminApi.decideAccess(u.id, "reject", reason, idempotencyKey); update(n); return t("status.REJECTED"); }} />
    </div>
  );
}
