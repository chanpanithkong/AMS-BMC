"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useHistoryLabel } from "@/components/cb/use-cash-bank";
import { EmptyState, ErrorState, FormSkeleton, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { ApprovalTimeline, HistoryPanel, SoDIndicator } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { assetsApi } from "@/lib/api/endpoints/assets";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFiscalYears, useFormatters } from "@/lib/api/hooks";
import type { DepreciationRun } from "@/lib/api/types/assets";
import { useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";

/** SCR-14 depreciation runs: choose a period, preview, approve, post (FR-FA-005). */
export function DepreciationRunsPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const router = useAppRouter();
  const describe = useDescribeError();
  const queryClient = useQueryClient();
  const companyId = useUiStore((s) => s.companyId);
  const canCreate = usePermission("fa.create");
  const { data: years } = useFiscalYears();
  const today = todayBusinessDate();
  const periods = (years ?? []).flatMap((y) => y.periods).filter((p) => p.start_date <= today);
  const [period, setPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const runs = useQuery({ queryKey: ["dep-runs", companyId], queryFn: ({ signal }) => assetsApi.runs(signal) });
  const create = useMutation({
    mutationFn: () => assetsApi.createRun(period || periods.at(-1)!.id),
    onSuccess: (run) => { void queryClient.invalidateQueries({ queryKey: ["dep-runs"] }); router.push(`/fixed-assets/depreciation-runs/${run.id}`); },
    onError: (e) => {
      const chosen = periods.find((p) => p.id === (period || periods.at(-1)?.id));
      if (isApiError(e) && e.code === "ALREADY_POSTED" && chosen) return setError(t("fa.runs.alreadyPosted", { period: locale === "km" ? chosen.name_km : chosen.name }));
      setError(isApiError(e) && e.code === "VALIDATION_ERROR" && e.details[0]?.message ? e.details[0].message : describe(e).message);
    },
  });
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="min-w-0">
      <PageHeader title={t("fa.runs.title")} description={t("fa.runs.description")} actions={<Button size="sm" variant="outline" asChild><AppLink href="/fixed-assets">{t("fa.title")}</AppLink></Button>} />
      {canCreate && (
        <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
          <FormField id="run-period" label={t("fa.runs.period")}>
            <NativeSelect id="run-period" value={period || periods.at(-1)?.id || ""} onChange={(e) => setPeriod(e.target.value)} className="w-auto">
              {periods.map((p) => <option key={p.id} value={p.id}>{locale === "km" ? p.name_km : p.name} · {t(`status.${p.status}`)}</option>)}
            </NativeSelect>
          </FormField>
          <Button type="submit" size="sm" disabled={create.isPending || !periods.length} data-testid="run-preview"><Play aria-hidden />{t("fa.runs.preview")}</Button>
          {error && <p className="basis-full text-sm text-destructive" role="alert" data-testid="run-error">{error}</p>}
        </form>
      )}
      {runs.isPending ? <TableSkeleton rows={4} /> : runs.isError ? <ErrorState error={runs.error} onRetry={() => runs.refetch()} /> : runs.data.data.length === 0 ? <EmptyState title={t("fa.runs.empty")} /> : (
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">{t("fa.runs.title")}</caption>
            <thead className="bg-muted/50"><tr>
              <th scope="col" className={head}>{t("fa.runs.period")}</th><th scope="col" className={head}>{t("fa.runs.number")}</th><th scope="col" className={head}>{t("fa.runs.assets")}</th>
              <th scope="col" className={`${head} text-right`}>{t("fa.runs.total")} (USD)</th><th scope="col" className={head}>{t("fa.col.status")}</th><th scope="col" className={head}>{t("fa.runs.journal")}</th>
            </tr></thead>
            <tbody>
              {runs.data.data.map((r) => (
                <tr key={r.id} className="border-t" data-testid={`run-row-${r.period_code}`}>
                  <td className="px-2 py-1.5"><AppLink href={`/fixed-assets/depreciation-runs/${r.id}`} className="font-medium text-primary hover:underline">{r.period_code}</AppLink></td>
                  <td className="px-2 py-1.5">{r.number ?? "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.lines.length}</td>
                  <td className="px-2 py-1.5"><AmountText value={r.total} currency="USD" /></td>
                  <td className="px-2 py-1.5"><StatusBadge status={r.status} /></td>
                  <td className="px-2 py-1.5">{r.journal_id ? <AppLink href={`/accounting/journals/${r.journal_id}`} className="hover:underline">{r.journal_no}</AppLink> : "—"} <span className="text-xs text-muted-foreground">{format.date(r.period_end)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DepreciationRunPage({ id }: { id: string }) {
  const t = useTranslations();
  const query = useQuery({ queryKey: ["dep-run", id], queryFn: ({ signal }) => assetsApi.run(id, signal) });
  if (query.isPending) return <FormSkeleton fields={4} />;
  if (query.isError) return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("fa.runs.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <RunView run={query.data} />;
}

function RunView({ run: r }: { run: DepreciationRun }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const historyLabel = useHistoryLabel();
  const userId = useSession((s) => s.user?.id);
  const { data: departments } = useDepartments();
  const can = { approve: usePermission("fa.approve"), post: usePermission("fa.post"), create: usePermission("fa.create") };
  const [dialog, setDialog] = useState<"approve" | "reject" | "post" | null>(null);
  const update = (next: DepreciationRun) => {
    queryClient.setQueryData(["dep-run", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["dep-runs"] });
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const cancel = useMutation({ mutationFn: () => assetsApi.cancelRun(r.id), onSuccess: update, onError: errorToast });
  const effect = { date: format.date(r.period_end), currency: "USD", amount: r.total, accounts: ["6600 / 1590"] };
  const mine = r.preparer_id === userId;
  const dept = (id: string | null) => departments?.find((d) => d.id === id);
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="space-y-4" data-testid="run-page" data-status={r.status}>
      <PageHeader title={t("fa.runs.runTitle", { period: r.period_code })} badge={<StatusBadge status={r.status} />} description={`${r.number ?? t("fa.runs.previewLabel")} · ${t("gl.journal.fields.preparer")}: ${r.preparer_name}`}
        actions={<>
          {(r.status === "DRAFT" || r.status === "APPROVED") && can.create && <Button size="sm" variant="ghost" onClick={() => cancel.mutate()}><Ban aria-hidden />{t("arap.actions.cancel")}</Button>}
          {r.status === "DRAFT" && can.approve && <>
            <Button size="sm" variant="destructive" disabled={mine} onClick={() => setDialog("reject")}>{t("arap.actions.reject")}</Button>
            <Button size="sm" disabled={mine} onClick={() => setDialog("approve")} data-testid="run-approve">{t("arap.actions.approve")}</Button>
          </>}
          {r.status === "APPROVED" && can.post && <Button size="sm" onClick={() => setDialog("post")} data-testid="run-post">{t("arap.actions.post")}</Button>}
        </>} />
      {r.status === "DRAFT" && <p className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm" role="status">{t("fa.runs.draftNote")}</p>}
      {r.status === "POSTED" && r.journal_id && <p className="rounded-lg border p-3 text-sm" role="status" data-testid="run-posted">{t("fa.runs.postedNote", { number: r.number ?? "" })} <AppLink href={`/accounting/journals/${r.journal_id}`} className="underline">{r.journal_no}</AppLink></p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-3">
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-sm" data-testid="run-lines">
              <caption className="sr-only">{t("fa.runs.runTitle", { period: r.period_code })}</caption>
              <thead className="bg-muted/50"><tr>
                <th scope="col" className={head}>{t("fa.col.tag")}</th><th scope="col" className={head}>{t("fa.col.name")}</th><th scope="col" className={head}>{t("fa.col.department")}</th>
                <th scope="col" className={`${head} text-right`}>{t("fa.runs.amount")} (USD)</th><th scope="col" className={`${head} text-right`}>{t("fa.col.accumulated")} (USD)</th><th scope="col" className={`${head} text-right`}>{t("fa.col.nbv")} (USD)</th>
              </tr></thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.asset_id} className="border-t">
                    <td className="px-2 py-1.5"><AppLink href={`/fixed-assets/${l.asset_id}`} className="text-primary hover:underline">{l.tag}</AppLink></td>
                    <td className="px-2 py-1.5">{l.name}</td>
                    <td className="px-2 py-1.5">{(locale === "km" ? dept(l.department_id)?.name_km : dept(l.department_id)?.name) ?? "—"}</td>
                    <td className="px-2 py-1.5"><AmountText value={l.amount} currency="USD" /></td>
                    <td className="px-2 py-1.5"><AmountText value={l.accumulated_after} currency="USD" /></td>
                    <td className="px-2 py-1.5"><AmountText value={l.nbv_after} currency="USD" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 font-semibold"><td className="px-2 py-2" colSpan={3}>{t("common.total")}</td><td className="px-2 py-2" data-testid="run-total"><AmountText value={r.total} currency="USD" /></td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
          {r.skipped.length > 0 && <p className="text-sm text-muted-foreground" role="note">{t("fa.runs.skipped", { tags: r.skipped.map((s) => s.tag).join(", ") })}</p>}
        </div>
        <aside className="space-y-4">
          {r.status === "DRAFT" && can.approve && <SoDIndicator preparerId={r.preparer_id} preparerName={r.preparer_name} />}
          <div className="rounded-xl border bg-card p-4"><ApprovalTimeline steps={r.approval_steps} /></div>
          <div className="rounded-xl border bg-card p-4"><HistoryPanel events={r.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
        </aside>
      </div>
      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("fa.runs.approveTitle", { period: r.period_code })} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const next = await assetsApi.decideRun(r.id, "approve", "", idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("fa.runs.rejectTitle", { period: r.period_code })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await assetsApi.decideRun(r.id, "reject", reason, idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "post"} onOpenChange={(o) => !o && setDialog(null)} action="post" title={t("fa.runs.postTitle", { period: r.period_code })} effect={effect} thresholdAmount={r.total}
        onConfirm={async ({ idempotencyKey }) => { const next = await assetsApi.postRun(r.id, idempotencyKey); update(next); return next.number ?? undefined; }} />
    </div>
  );
}
