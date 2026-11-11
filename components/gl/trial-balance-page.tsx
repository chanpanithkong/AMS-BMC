"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, Info, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExportMenu, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { NativeSelect, useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { DateRangePicker } from "@/components/finance/date-range-picker";
import { ReportHeader } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { downloadExport, reportsApi, type ExportFormat } from "@/lib/api/endpoints/reports";
import { useFiscalYears, useFormatters } from "@/lib/api/hooks";
import type { TrialBalanceParams } from "@/lib/api/types/reports";
import { useCurrentCompany } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

const FILTERS = ["from", "to", "branch", "zero", "level"] as const;

/** Default range: the current fiscal period. */
export function useCurrentPeriodRange() {
  const { data } = useFiscalYears();
  const today = todayBusinessDate();
  const period = data?.flatMap((y) => y.periods).find((p) => p.start_date <= today && today <= p.end_date);
  return period ? { from: period.start_date, to: period.end_date } : { from: today.slice(0, 8) + "01", to: today };
}

/** Run a server export and download it, or tell the user it was queued (SRS §12.7). */
export function useExport() {
  const t = useTranslations();
  const errorToast = useErrorToast();
  return async (reportId: string, format: ExportFormat, parameters: object) => {
    try {
      const result = await reportsApi.export(reportId, format, parameters);
      if (result.status === "QUEUED") return void toast.info(t("gl.export.queued"));
      await downloadExport(result);
      toast.success(t("gl.export.done", { file: result.file_name ?? "" }));
    } catch (error) {
      errorToast(error);
    }
  };
}

/** SCR-08 / RPT-01 Trial Balance. */
export function TrialBalancePage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const headerBranch = useUiStore((s) => s.branchId);
  const seesAll = usePermission("coa.sensitive.view");
  const runExport = useExport();
  const defaults = useCurrentPeriodRange();
  const { filters, setFilters } = useUrlFilters(FILTERS);
  const base = company?.base_currency ?? "USD";
  const branch = filters.branch === "all" ? null : filters.branch || headerBranch;

  const params: TrialBalanceParams = {
    date_from: filters.from || defaults.from,
    date_to: filters.to || defaults.to,
    branch_id: branch,
    include_zero: filters.zero === "true",
    level: filters.level ? Number(filters.level) : undefined,
  };
  const query = useQuery({
    queryKey: ["reports", "trial-balance", companyId, params],
    queryFn: ({ signal }) => reportsApi.trialBalance(params, signal),
    enabled: params.date_from <= params.date_to,
  });
  const report = query.data;
  const branchName = branch ? company?.branches.find((b) => b.id === branch) : null;
  const pair = (debit: string, credit: string) => (
    <>
      <td className="px-2 py-1.5"><AmountText value={debit} currency={base} blankZero /></td>
      <td className="px-2 py-1.5"><AmountText value={credit} currency={base} blankZero /></td>
    </>
  );
  const head = "px-2 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground";

  return (
    <div className="min-w-0">
      <div data-print="hide">
        <PageHeader title={t("gl.tb.title")} description={t("gl.tb.description")} />
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
          <DateRangePicker idPrefix="tb-range" value={{ from: params.date_from, to: params.date_to }} onChange={({ from, to }) => setFilters({ from, to })} />
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">{t("shell.branch")}</span>
            <NativeSelect className="w-44" value={branch ?? "all"} onChange={(e) => setFilters({ branch: e.target.value })}>
              <option value="all">{t("shell.allBranches")}</option>
              {company?.branches.map((b) => <option key={b.id} value={b.id}>{locale === "km" ? b.name_km : b.name}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">{t("gl.tb.level")}</span>
            <NativeSelect className="w-36" value={filters.level} onChange={(e) => setFilters({ level: e.target.value })}>
              <option value="">{t("gl.tb.allLevels")}</option>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{t("gl.tb.levelN", { level: n })}</option>)}
            </NativeSelect>
          </label>
          <label className="flex h-8 items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={params.include_zero} onChange={(e) => setFilters({ zero: e.target.checked ? "true" : null })} />
            {t("gl.tb.includeZero")}
          </label>
        </div>
      </div>

      <ReportHeader
        reportName={t("gl.tb.title")}
        period={`${format.date(params.date_from)} – ${format.date(params.date_to)}`}
        currency={base}
        branch={branchName ? (locale === "km" ? branchName.name_km : branchName.name) : t("shell.allBranches")}
        generatedAt={report?.generated_at}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer aria-hidden />{t("common.print")}</Button>
            <ExportMenu onExport={(f) => runExport("trial-balance", f, params)} disabled={!report} />
          </>
        }
      />

      {report && (
        <div className="mb-3 space-y-2">
          {report.validation.balanced ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-success" data-testid="tb-check" data-balanced="true">
              <CheckCircle2 className="size-4" aria-hidden />{t("gl.tb.balanced")}
            </p>
          ) : seesAll ? (
            // Critical: should never happen (BR-GL-002).
            <div className="flex items-start gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert" data-testid="tb-check" data-balanced="false">
              <AlertOctagon className="mt-0.5 size-5 shrink-0" aria-hidden />{t("gl.tb.unbalanced")}
            </div>
          ) : null}
          {!seesAll && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="size-3.5" aria-hidden />{t("gl.tb.restricted")}</p>
          )}
        </div>
      )}

      <div className="relative overflow-x-auto rounded-lg border bg-card">
        {query.isPending ? (
          <TableSkeleton columns={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : !report || report.rows.length === 0 ? (
          <EmptyState title={t("gl.tb.empty")} />
        ) : (
          <table className="w-full min-w-[56rem] border-collapse text-sm" data-testid="tb-table">
            <caption className="sr-only">{t("gl.tb.title")}</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" rowSpan={2} className={cn(head, "text-left")}>{t("gl.tb.col.code")}</th>
                <th scope="col" rowSpan={2} className={cn(head, "text-left")}>{t("gl.tb.col.account")}</th>
                <th scope="colgroup" colSpan={2} className={cn(head, "border-l text-center")}>{t("gl.tb.col.opening")}</th>
                <th scope="colgroup" colSpan={2} className={cn(head, "border-l text-center")}>{t("gl.tb.col.period")}</th>
                <th scope="colgroup" colSpan={2} className={cn(head, "border-l text-center")}>{t("gl.tb.col.closing")}</th>
              </tr>
              <tr>
                {["opening", "period", "closing"].flatMap((g) => [
                  <th key={`${g}-d`} scope="col" className={cn(head, "border-l text-right")}>{t("gl.tb.col.debit")} ({base})</th>,
                  <th key={`${g}-c`} scope="col" className={cn(head, "text-right")}>{t("gl.tb.col.credit")} ({base})</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.account_id} className={cn("border-t", !r.is_posting && "bg-muted/20 font-medium")} data-testid={`tb-row-${r.code}`}>
                  <td className="px-2 py-1.5 tabular-nums">
                    <AppLink
                      href={`/accounting/general-ledger?accounts=${r.account_id}&from=${params.date_from}&to=${params.date_to}`}
                      className="text-primary hover:underline"
                      aria-label={t("gl.tb.drill", { code: r.code })}
                    >
                      {r.code}
                    </AppLink>
                  </td>
                  <td className="px-2 py-1.5" style={{ paddingLeft: 8 + (r.level - 1) * 14 }}>{locale === "km" ? r.name_km : r.name}</td>
                  {pair(r.opening_debit, r.opening_credit)}
                  {pair(r.period_debit, r.period_credit)}
                  {pair(r.closing_debit, r.closing_credit)}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/50 font-semibold">
              <tr data-testid="tb-totals">
                <td className="px-2 py-2" colSpan={2}>{t("gl.tb.total")}</td>
                {pair(report.totals.opening_debit, report.totals.opening_credit)}
                {pair(report.totals.period_debit, report.totals.period_credit)}
                {pair(report.totals.closing_debit, report.totals.closing_credit)}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
