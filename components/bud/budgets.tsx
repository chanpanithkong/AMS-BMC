"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CopyPlus, Loader2, Plus, Save, Send, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useHistoryLabel } from "@/components/cb/use-cash-bank";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApprovalTimeline, HistoryPanel, UnsavedChangesGuard } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { budgetsApi } from "@/lib/api/endpoints/assets";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFiscalYears, useFormatters } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import type { Budget, BudgetLineInput } from "@/lib/api/types/planning";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D, Decimal } from "@/lib/money/decimal";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
type EditLine = BudgetLineInput & { key: string };
const budgetAccounts = (a: Account) => a.type === "REVENUE" || a.type === "EXPENSE";

/** Spread an annual amount evenly; December takes the rounding (FR-BUD alternative A1). */
function spread(annual: string): string[] {
  const total = D(annual);
  const monthly = total.div(12).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  return MONTHS.map((_, i) => (i === 11 ? total.minus(monthly.times(11)).toFixed(2) : monthly.toFixed(2)));
}

/** SCR-23 budgets: version selector, accounts × months grid, approval status, budget use. */
export function BudgetsPage({ id }: { id?: string } = {}) {
  const t = useTranslations();
  const companyId = useUiStore((s) => s.companyId);
  const { data: years } = useFiscalYears();
  const year = years?.find((y) => y.start_date <= todayBusinessDate() && todayBusinessDate() <= y.end_date) ?? years?.[0];
  const versions = useQuery({ queryKey: ["budgets", companyId, year?.id], queryFn: ({ signal }) => budgetsApi.list(year?.id, signal), enabled: Boolean(year) });
  const [selected, setSelected] = useState<string | null>(id ?? null);
  const list = versions.data?.data ?? [];
  const current = selected ?? (list.find((b) => ["DRAFT", "SUBMITTED", "REJECTED"].includes(b.status)) ?? list.find((b) => b.status === "APPROVED") ?? list[0])?.id ?? null;
  const budget = useQuery({ queryKey: ["budget", current], queryFn: ({ signal }) => budgetsApi.get(current!, signal), enabled: Boolean(current) });
  return (
    <div className="min-w-0" data-testid="budgets-page">
      <PageHeader title={t("bud.title")} description={t("bud.description")} actions={<Button size="sm" variant="outline" asChild><AppLink href="/reports/budget-vs-actual"><BarChart3 aria-hidden />{t("bud.vsActual")}</AppLink></Button>} />
      <BudgetUsePanel />
      {versions.isPending ? <TableSkeleton rows={6} /> : versions.isError ? <ErrorState error={versions.error} onRetry={() => versions.refetch()} /> : (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <FormField id="bud-version" label={t("bud.version")}>
              <NativeSelect id="bud-version" value={current ?? ""} onChange={(e) => setSelected(e.target.value)} className="w-auto" data-testid="bud-version">
                {list.map((b) => <option key={b.id} value={b.id}>v{b.version} · {b.name} · {t(`status.${b.status}`)}</option>)}
              </NativeSelect>
            </FormField>
            {year && <NewVersion fiscalYearId={year.id} versions={list} onCreated={setSelected} />}
          </div>
          {!current ? <EmptyState title={t("bud.empty")} /> : budget.isPending ? <TableSkeleton rows={8} /> : budget.isError ? <ErrorState error={budget.error} onRetry={() => budget.refetch()} /> : <BudgetView key={`${budget.data.id}-${budget.data.row_version}`} budget={budget.data} />}
        </>
      )}
    </div>
  );
}

function BudgetUsePanel() {
  const t = useTranslations("bud");
  const locale = useAppLocale();
  const format = useFormatters();
  const use = useQuery({ queryKey: ["budget-use", todayBusinessDate()], queryFn: ({ signal }) => budgetsApi.use(todayBusinessDate(), signal) });
  if (!use.data?.data.length) return null;
  return (
    <section className="mb-4 rounded-xl border bg-card p-4" aria-labelledby="use-title" data-testid="budget-use">
      <h2 id="use-title" className="mb-2 text-sm font-semibold">{t("use.title")}</h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {use.data.data.map((u) => {
          const pct = Math.min(100, Number(u.percent ?? "0"));
          return (
            <li key={u.department_id} className="text-sm">
              <div className="flex justify-between"><span>{locale === "km" ? u.name_km : u.name}</span><span className="tabular-nums">{u.percent ?? "—"} %</span></div>
              <div className="mt-1 h-2 rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("use.bar", { name: u.name })}>
                <div className={cn("h-2 rounded", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{t("use.detail", { actual: format.amount(u.actual, "USD"), budget: format.amount(u.budget_year, "USD") })}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t("use.note")}</p>
    </section>
  );
}

function NewVersion({ fiscalYearId, versions, onCreated }: { fiscalYearId: string; versions: Budget[]; onCreated: (id: string) => void }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const canCreate = usePermission("bud.create");
  const [open, setOpen] = useState(false);
  const approved = versions.find((b) => b.status === "APPROVED");
  const [form, setForm] = useState({ name: "", reason: "", copy_from: approved?.id ?? "", percent_change: "" });
  const [error, setError] = useState<string | null>(null);
  const busy = versions.some((b) => ["DRAFT", "SUBMITTED", "REJECTED"].includes(b.status));
  const create = useMutation({
    mutationFn: () => budgetsApi.create({ fiscal_year_id: fiscalYearId, ...form, copy_from: form.copy_from || null }),
    onSuccess: (b) => { void queryClient.invalidateQueries({ queryKey: ["budgets"] }); setOpen(false); onCreated(b.id); toast.success(t("bud.toast.created", { version: b.version })); },
    onError: (e) => setError(isApiError(e) && e.details[0]?.message ? e.details[0].message : describe(e).message),
  });
  if (!canCreate) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={busy} title={busy ? t("bud.busy") : undefined} data-testid="bud-new"><CopyPlus aria-hidden />{t("bud.newVersion")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("bud.newVersion")}</DialogTitle><DialogDescription>{t("bud.newDescription")}</DialogDescription></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
            <FormField id="nv-name" label={t("bud.form.name")}><Input id="nv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
            <FormField id="nv-reason" label={t("bud.form.reason")} required><Input id="nv-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></FormField>
            <FormField id="nv-copy" label={t("bud.form.copyFrom")}>
              <NativeSelect id="nv-copy" value={form.copy_from} onChange={(e) => setForm({ ...form, copy_from: e.target.value })}>
                <option value="">{t("bud.form.blank")}</option>
                {versions.map((b) => <option key={b.id} value={b.id}>v{b.version} · {b.name}</option>)}
              </NativeSelect>
            </FormField>
            {form.copy_from && <FormField id="nv-pct" label={t("bud.form.percent")} hint={t("bud.form.percentHint")}><Input id="nv-pct" inputMode="decimal" value={form.percent_change} onChange={(e) => setForm({ ...form, percent_change: e.target.value })} aria-describedby="nv-pct-hint" /></FormField>}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={create.isPending}>{t("bud.form.create")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BudgetView({ budget: b }: { budget: Budget }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const historyLabel = useHistoryLabel();
  const company = useCurrentCompany();
  const user = useSession((s) => s.user);
  const { data: departments } = useDepartments();
  const can = { edit: usePermission("bud.edit"), create: usePermission("bud.create"), submit: usePermission("bud.submit"), approve: usePermission("bud.approve") };
  const own = user?.roles.includes("DEPTMGR") ? user.department_ids : null;
  const editable = (b.status === "DRAFT" || b.status === "REJECTED") && (can.edit || can.create);
  const [lines, setLines] = useState<EditLine[]>(() => b.lines.map((l) => ({ key: l.id, account_id: l.account_id, department_id: l.department_id, branch_id: l.branch_id, months: [...l.months], comment: l.comment })));
  const [dirty, setDirty] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const set = (key: string, patch: Partial<EditLine>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); setDirty(true); };
  const update = (next: Budget) => {
    queryClient.setQueryData(["budget", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
    void queryClient.invalidateQueries({ queryKey: ["budget-use"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      setFailure(null);
      let next = dirty || !submit ? await budgetsApi.saveLines(b.id, lines.map((l) => ({ account_id: l.account_id, department_id: l.department_id, branch_id: l.branch_id, months: l.months, comment: l.comment })), b.row_version) : b;
      if (submit) next = await budgetsApi.submit(next.id);
      return { next, submit };
    },
    onSuccess: ({ next, submit }) => { setDirty(false); update(next); toast.success(submit ? t("bud.toast.submitted") : t("bud.toast.saved")); },
    onError: (e) => {
      if (isApiError(e) && e.code === "VERSION_CONFLICT") return errorToast(e);
      setFailure(isApiError(e) && e.details[0]?.message ? e.details[0].message : describe(e).message);
    },
  });
  const visible = lines.filter((l) => !deptFilter || l.department_id === deptFilter);
  const monthTotal = (i: number) => visible.reduce((s, l) => s.plus(D(l.months[i])), D("0"));
  const lineTotal = (l: EditLine) => l.months.reduce((s, m) => s.plus(D(m)), D("0"));
  const canEditLine = (l: EditLine) => editable && (!own || (l.department_id !== null && own.includes(l.department_id)));
  const dept = (id: string | null) => departments?.find((d) => d.id === id);
  const effect = { currency: "USD", amount: b.total_expense, accounts: [t("bud.effect", { revenue: format.amount(b.total_revenue, "USD"), expense: format.amount(b.total_expense, "USD") })] };
  const head = "px-1.5 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="space-y-4" data-testid="budget-view" data-status={b.status}>
      <UnsavedChangesGuard dirty={dirty && !save.isPending} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm"><StatusBadge status={b.status} /> {b.reason}{b.approved_by && ` · ${t("bud.approvedBy", { name: b.approved_by })}`}</p>
        <div className="flex flex-wrap gap-2">
          {editable && <Button size="sm" variant="outline" asChild><AppLink href={`/imports?type=BUDGETS&target=${b.id}`}><Upload aria-hidden />{t("bud.import")}</AppLink></Button>}
          {editable && <Button size="sm" variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending} data-testid="bud-save">{save.isPending && save.variables === false ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{t("common.save")}</Button>}
          {editable && (can.submit || can.edit) && <Button size="sm" onClick={() => save.mutate(true)} disabled={save.isPending} data-testid="bud-submit"><Send aria-hidden />{t("arap.actions.submit")}</Button>}
          {b.status === "SUBMITTED" && can.approve && <>
            <Button size="sm" variant="destructive" disabled={b.preparer_id === user?.id} onClick={() => setDialog("reject")}>{t("arap.actions.reject")}</Button>
            <Button size="sm" disabled={b.preparer_id === user?.id} onClick={() => setDialog("approve")} data-testid="bud-approve">{t("arap.actions.approve")}</Button>
          </>}
        </div>
      </div>
      {b.status === "REJECTED" && b.rejection_comment && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="status">{t("arap.banner.rejected", { comment: b.rejection_comment })}</p>}
      {(b.status === "APPROVED" || b.status === "SUPERSEDED") && <p className="rounded-lg border p-3 text-sm" role="status">{t(b.status === "APPROVED" ? "bud.lockedApproved" : "bud.lockedSuperseded")}</p>}
      {own && <p className="text-sm text-muted-foreground">{t("bud.ownOnly")}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="bud-dept" label={t("bud.filterDepartment")}>
          <NativeSelect id="bud-dept" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-auto">
            <option value="">{t("reports.allDepartments")}</option>
            {departments?.filter((d) => !own || own.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{locale === "km" ? d.name_km : d.name}</option>)}
          </NativeSelect>
        </FormField>
        <p className="pb-1.5 text-sm">{t("bud.totals", { revenue: format.amount(b.total_revenue, "USD", { withCode: true }), expense: format.amount(b.total_expense, "USD", { withCode: true }) })}</p>
      </div>
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[96rem] border-collapse text-sm" data-testid="budget-grid">
          <caption className="sr-only">{t("bud.gridCaption")}</caption>
          <thead className="bg-muted/50"><tr>
            <th scope="col" className={`${head} w-60 text-left`}>{t("bud.col.account")}</th>
            <th scope="col" className={`${head} w-36 text-left`}>{t("bud.col.department")}</th>
            <th scope="col" className={`${head} w-28 text-left`}>{t("bud.col.branch")}</th>
            {MONTHS.map((m) => <th key={m} scope="col" className={`${head} w-24 text-right`}>{t(`bud.months.${m}`)}</th>)}
            <th scope="col" className={`${head} w-28 text-right`}>{t("bud.col.total")} (USD)</th>
            {editable && <th scope="col" className={head}><span className="sr-only">{t("arap.lines.actions")}</span></th>}
          </tr></thead>
          <tbody>
            {visible.map((l, row) => {
              const n = row + 1;
              const edit = canEditLine(l);
              return (
                <tr key={l.key} className="border-t" data-testid="budget-line">
                  <td className="p-1"><AccountPicker value={l.account_id || null} onChange={(account_id) => set(l.key, { account_id: account_id ?? "" })} filter={budgetAccounts} disabled={!edit} aria-label={t("bud.aria.account", { n })} /></td>
                  <td className="p-1">
                    <NativeSelect value={l.department_id ?? ""} disabled={!edit} onChange={(e) => set(l.key, { department_id: e.target.value || null })} aria-label={t("bud.aria.department", { n })}>
                      <option value="">—</option>
                      {departments?.filter((d) => !own || own.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{locale === "km" ? d.name_km : d.name}</option>)}
                      {own && l.department_id && !own.includes(l.department_id) && <option value={l.department_id}>{dept(l.department_id)?.name}</option>}
                    </NativeSelect>
                  </td>
                  <td className="p-1">
                    <NativeSelect value={l.branch_id ?? ""} disabled={!edit} onChange={(e) => set(l.key, { branch_id: e.target.value || null })} aria-label={t("bud.aria.branch", { n })}>
                      <option value="">—</option>
                      {company?.branches.map((br) => <option key={br.id} value={br.id}>{br.code}</option>)}
                    </NativeSelect>
                  </td>
                  {MONTHS.map((m, i) => (
                    <td key={m} className="p-1">
                      {edit ? <AmountInput currency="USD" value={l.months[i]} onValueChange={(v) => set(l.key, { months: l.months.map((x, j) => (j === i ? v || "0" : x)) })} aria-label={t("bud.aria.month", { n, month: t(`bud.months.${m}`) })} /> : <AmountText value={l.months[i]} currency="USD" />}
                    </td>
                  ))}
                  <td className="p-1">
                    {edit ? <AmountInput currency="USD" value={lineTotal(l).toFixed(2)} onValueChange={(v) => set(l.key, { months: spread(v || "0") })} aria-label={t("bud.aria.annual", { n })} title={t("bud.spreadHint")} /> : <AmountText value={lineTotal(l)} currency="USD" className="font-medium" />}
                  </td>
                  {editable && <td className="p-1">{edit && <Button variant="ghost" size="icon" onClick={() => { setLines(lines.filter((x) => x.key !== l.key)); setDirty(true); }} aria-label={t("bud.aria.remove", { n })}><Trash2 aria-hidden /></Button>}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr className="border-t-2 font-semibold">
            <td className="px-2 py-2" colSpan={3}>{t("bud.col.net")}</td>
            {MONTHS.map((m, i) => <td key={m} className="px-1.5 py-2"><AmountText value={monthTotal(i)} currency="USD" /></td>)}
            <td className="px-1.5 py-2"><AmountText value={visible.reduce((s, l) => s.plus(lineTotal(l)), D("0"))} currency="USD" /></td>
            {editable && <td />}
          </tr></tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t("bud.gridNote")}</p>
      {editable && <Button size="sm" variant="outline" onClick={() => { setLines([...lines, { key: `new-${Date.now()}`, account_id: "", department_id: own?.[0] ?? (deptFilter || null), branch_id: null, months: MONTHS.map(() => "0.00") }]); setDirty(true); }} data-testid="bud-add-line"><Plus aria-hidden />{t("bud.addLine")}</Button>}
      {failure && <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{failure}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {b.approval_steps.length > 0 && <div className="rounded-xl border bg-card p-4"><ApprovalTimeline steps={b.approval_steps} /></div>}
        <div className="rounded-xl border bg-card p-4"><HistoryPanel events={b.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
      </div>
      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("bud.approveTitle", { version: b.version })} description={t("bud.approveDescription")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const next = await budgetsApi.decide(b.id, "approve", "", idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("bud.rejectTitle", { version: b.version })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await budgetsApi.decide(b.id, "reject", reason, idempotencyKey); update(next); return t(`status.${next.status}`); }} />
    </div>
  );
}
