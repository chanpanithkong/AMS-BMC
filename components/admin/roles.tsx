"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Save, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useHistoryLabel } from "@/components/cb/use-cash-bank";
import { EmptyState, ErrorState, FormSkeleton, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { HistoryPanel } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { adminApi } from "@/lib/api/endpoints/admin";
import { isApiError } from "@/lib/api/errors";
import type { Role } from "@/lib/api/types/admin";
import { useSession } from "@/lib/auth/session";
import { AppLink, useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { Can, usePermission } from "@/lib/rbac/can";
import { sodConflictsOf } from "./sod";
import { useRoles } from "./users";

/** SCR-16 role list with a copy-to-new-role form. */
export function RolesPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const router = useAppRouter();
  const describe = useDescribeError();
  const queryClient = useQueryClient();
  const roles = useRoles();
  const [form, setForm] = useState({ code: "", name: "", name_km: "", description: "", copy_from: "ACCT" });
  const [failure, setFailure] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.createRole(form),
    onSuccess: (r) => { void queryClient.invalidateQueries({ queryKey: ["roles"] }); toast.success(t("admin.roles.created", { code: r.code })); setForm({ code: "", name: "", name_km: "", description: "", copy_from: "ACCT" }); router.push(`/admin/roles/${r.code}`); },
    onError: (e) => setFailure(isApiError(e) && e.details[0]?.message ? e.details[0].message : describe(e).message),
  });
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title={t("admin.roles.title")} description={t("admin.roles.description")} />
      {roles.isPending ? <TableSkeleton rows={6} /> : roles.isError ? <ErrorState error={roles.error} onRetry={() => roles.refetch()} /> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" data-testid="roles-table">
            <caption className="sr-only">{t("admin.roles.title")}</caption>
            <thead className="bg-muted/50 text-left">
              <tr><th scope="col" className="px-3 py-2">{t("admin.roles.col.code")}</th><th scope="col" className="px-3 py-2">{t("admin.roles.col.name")}</th><th scope="col" className="px-3 py-2">{t("admin.roles.col.type")}</th><th scope="col" className="px-3 py-2 text-right">{t("admin.roles.col.permissions")}</th><th scope="col" className="px-3 py-2 text-right">{t("admin.roles.col.users")}</th><th scope="col" className="px-3 py-2">{t("admin.users.col.status")}</th></tr>
            </thead>
            <tbody>
              {roles.data.map((r) => (
                <tr key={r.code} className="border-t">
                  <td className="px-3 py-2"><AppLink href={`/admin/roles/${r.code}`} className="font-medium text-primary hover:underline">{r.code}</AppLink></td>
                  <td className="px-3 py-2">{locale === "km" ? r.name_km || r.name : r.name}{r.pending && <span className="ml-1 rounded border border-warning/40 px-1 text-xs text-warning">{t("admin.pendingBadge")}</span>}</td>
                  <td className="px-3 py-2">{r.is_default ? t("admin.roles.default") : t("admin.roles.custom", { base: r.base_role })}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.permissions.length}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.user_count}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.is_active ? "ACTIVE" : "INACTIVE"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Can permission="roles.manage">
        <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); setFailure(null); create.mutate(); }} aria-labelledby="new-role-title" data-testid="new-role-form">
          <h2 id="new-role-title" className="flex items-center gap-1.5 font-semibold"><Copy className="size-4" aria-hidden />{t("admin.roles.new")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField id="role-copy" label={t("admin.roles.copyFrom")}>
              <NativeSelect id="role-copy" value={form.copy_from} onChange={(e) => setForm({ ...form, copy_from: e.target.value })}>
                {roles.data?.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
              </NativeSelect>
            </FormField>
            <FormField id="role-code" label={t("admin.roles.col.code")} required hint={t("admin.roles.codeHint")}><Input id="role-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} aria-describedby="role-code-hint" /></FormField>
            <FormField id="role-name" label={t("admin.roles.col.name")} required><Input id="role-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
            <FormField id="role-name-km" label={t("admin.users.form.nameKm")}><Input id="role-name-km" value={form.name_km} onChange={(e) => setForm({ ...form, name_km: e.target.value })} /></FormField>
          </div>
          {failure && <p className="text-sm text-destructive" role="alert">{failure}</p>}
          <div className="flex justify-end"><Button type="submit" disabled={create.isPending}><Save aria-hidden />{t("admin.roles.create")}</Button></div>
        </form>
      </Can>
    </div>
  );
}

export function RolePage({ code }: { code: string }) {
  const t = useTranslations();
  const query = useQuery({ queryKey: ["role", code], queryFn: ({ signal }) => adminApi.role(code, signal) });
  const permissions = useQuery({ queryKey: ["permissions"], queryFn: ({ signal }) => adminApi.permissions(signal), staleTime: Infinity });
  if (query.isPending || permissions.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("admin.roles.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (permissions.isError) return <ErrorState error={permissions.error} onRetry={() => permissions.refetch()} />;
  return <RoleView key={query.data.version} role={query.data} all={permissions.data.data} sensitive={permissions.data.sensitive} />;
}

/** Permission codes grouped as module × action (gl.journal.post → module "gl", action "journal.post"). */
function matrix(all: string[]) {
  const modules = new Map<string, string[]>();
  for (const p of all) {
    const [module] = p.split(".");
    modules.set(module, [...(modules.get(module) ?? []), p]);
  }
  return [...modules.entries()];
}

function RoleView({ role, all, sensitive }: { role: Role; all: string[]; sensitive: string[] }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const historyLabel = useHistoryLabel();
  const me = useSession((s) => s.user?.id);
  const myRoles = useSession((s) => s.user?.roles ?? []);
  const can = { manage: usePermission("roles.manage"), approve: usePermission("roles.approve") };
  const [selected, setSelected] = useState<string[]>(role.permissions);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const own = myRoles.includes(role.code);
  const editable = can.manage && !role.pending && !own;
  const conflicts = sodConflictsOf(selected);
  const added = selected.filter((p) => !role.permissions.includes(p));
  const update = (next: Role) => { queryClient.setQueryData(["role", next.code], next); void queryClient.invalidateQueries({ queryKey: ["roles"] }); void queryClient.invalidateQueries({ queryKey: ["approvals"] }); };
  const save = useMutation({
    mutationFn: () => adminApi.updateRole(role.code, { permissions: selected }, role.version),
    onSuccess: (n) => { update(n); toast.success(n.pending ? t("admin.access.sentForApproval") : t("admin.saved")); },
    onError: errorToast,
  });
  const toggle = (p: string) => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const effect = { currency: "USD", accounts: [role.code] };
  return (
    <div className="space-y-4" data-testid="role-page">
      <PageHeader title={`${role.code} · ${locale === "km" ? role.name_km || role.name : role.name}`} description={role.is_default ? t("admin.roles.default") : t("admin.roles.custom", { base: role.base_role })} badge={<StatusBadge status={role.is_active ? "ACTIVE" : "INACTIVE"} />} />
      {own && <p className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm" role="status">{t("admin.users.selfNote")}</p>}
      {role.pending && (
        <section className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status" data-testid="role-pending">
          <p>{t("admin.roles.pending", { by: role.pending.requested_by, count: role.pending.permissions.filter((p) => !role.permissions.includes(p)).length })}</p>
          <p className="mt-1 font-mono text-xs">{role.pending.permissions.filter((p) => !role.permissions.includes(p)).join(" · ")}</p>
          {can.approve && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" disabled={role.pending.requested_by_id === me} onClick={() => setDialog("reject")}>{t("arap.actions.reject")}</Button>
              <Button size="sm" disabled={role.pending.requested_by_id === me} onClick={() => setDialog("approve")} data-testid="role-approve">{t("arap.actions.approve")}</Button>
            </div>
          )}
        </section>
      )}
      <section className="rounded-xl border bg-card p-4" aria-labelledby="matrix-title">
        <h2 id="matrix-title" className="mb-1 font-semibold">{t("admin.roles.matrix")}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t("admin.roles.sensitiveHint")}</p>
        <div className="space-y-3">
          {matrix(all).map(([module, perms]) => (
            <fieldset key={module} className="rounded-lg border p-3" disabled={!editable}>
              <legend className="px-1 text-sm font-medium">{t.has(`admin.modules.${module}`) ? t(`admin.modules.${module}`) : module}</legend>
              <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {perms.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={selected.includes(p)} onCheckedChange={() => toggle(p)} data-testid={`perm-${p}`} />
                    <span className="font-mono text-xs">{p.slice(module.length + 1)}</span>
                    {sensitive.includes(p) && <ShieldAlert className="size-3.5 text-warning" aria-label={t("admin.roles.sensitive")} />}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </section>
      <section className={`rounded-lg border p-3 text-sm ${conflicts.length ? "border-warning/40 bg-warning/10" : ""}`} aria-labelledby="role-sod" data-testid="sod-panel">
        <h3 id="role-sod" className="mb-1 font-semibold">{t("admin.sod.title")}</h3>
        {conflicts.length === 0 ? <p className="text-muted-foreground">{t("admin.sod.none")}</p> : <ul className="list-disc pl-5">{conflicts.map((c) => <li key={c.code}>{t("admin.sod.conflict", { description: locale === "km" ? c.description_km : c.description })}</li>)}</ul>}
      </section>
      {editable && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {added.some((p) => sensitive.includes(p)) && <span className="text-xs text-warning">{t("admin.roles.willNeedApproval")}</span>}
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="role-save"><Save aria-hidden />{t("admin.roles.save")}</Button>
        </div>
      )}
      <div className="rounded-xl border bg-card p-4"><HistoryPanel events={role.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("admin.roles.approveTitle", { code: role.code })} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const n = await adminApi.decideRole(role.code, "approve", "", idempotencyKey); update(n); return t("status.APPROVED"); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("admin.roles.rejectTitle", { code: role.code })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const n = await adminApi.decideRole(role.code, "reject", reason, idempotencyKey); update(n); return t("status.REJECTED"); }} />
    </div>
  );
}
