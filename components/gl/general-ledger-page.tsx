"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ExportMenu, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { NativeSelect } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountText } from "@/components/finance/amount";
import { DateRangePicker } from "@/components/finance/date-range-picker";
import { ReportHeader } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { accountsApi } from "@/lib/api/endpoints/accounts";
import { reportsApi } from "@/lib/api/endpoints/reports";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { GeneralLedgerParams } from "@/lib/api/types/reports";
import { useCurrentCompany } from "@/lib/auth/session";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { useCurrentPeriodRange, useExport } from "./trial-balance-page";

const FILTERS = ["accounts", "from", "to", "branch", "department", "view"] as const;

/** SCR-07 / RPT-02 General Ledger inquiry with drill-down to the journal. */
export function GeneralLedgerPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const { data: departments } = useDepartments();
  const defaults = useCurrentPeriodRange();
  const runExport = useExport();
  const { filters, setFilters } = useUrlFilters(FILTERS);
  const base = company?.base_currency ?? "USD";
  const accountIds = filters.accounts.split(",").filter(Boolean);
  // Names for the chosen accounts; links from the Trial Balance may also pass header accounts,
  // which the server expands to their posting accounts.
  const allAccounts = useQuery({ queryKey: ["accounts", companyId, "all-lite"], queryFn: ({ signal }) => accountsApi.list({ limit: 200 }, signal), staleTime: 300_000 });
  const accounts = allAccounts.data?.data ?? [];

  const params: GeneralLedgerParams = {
    accounts: accountIds,
    date_from: filters.from || defaults.from,
    date_to: filters.to || defaults.to,
    branch_id: filters.branch || null,
    department_id: filters.department || null,
    currency_view: filters.view === "transaction" ? "transaction" : "base",
  };
  const ready = accountIds.length > 0 && params.date_from <= params.date_to;
  const query = useQuery({
    queryKey: ["reports", "general-ledger", companyId, params],
    queryFn: ({ signal }) => reportsApi.generalLedger(params, signal),
    enabled: ready,
  });
  const branchName = (id: string | null) => {
    const b = company?.branches.find((x) => x.id === id);
    return b ? (locale === "km" ? b.name_km : b.name) : "";
  };
  const deptName = (id: string | null) => {
    const d = departments?.find((x) => x.id === id);
    return d ? (locale === "km" ? d.name_km : d.name) : "";
  };
  const head = "px-2 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground";

  return (
    <div className="min-w-0">
      <div data-print="hide">
        <PageHeader title={t("gl.ledger.title")} description={t("gl.ledger.description")} />
        <div className="mb-4 space-y-3 rounded-xl border bg-card p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t("gl.ledger.accounts")}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {accountIds.map((id) => {
                const a = accounts.find((x) => x.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 text-sm">
                    {a ? `${a.code} ${locale === "km" ? a.name_km : a.name}` : id}
                    <Button size="icon-xs" variant="ghost" onClick={() => setFilters({ accounts: accountIds.filter((x) => x !== id).join(",") })} aria-label={t("gl.ledger.removeAccount", { code: a?.code ?? id })}>
                      <X aria-hidden />
                    </Button>
                  </span>
                );
              })}
              <div className="w-64">
                <AccountPicker
                  value={null}
                  accounts={accounts}
                  onChange={(id) => id && !accountIds.includes(id) && setFilters({ accounts: [...accountIds, id].join(",") })}
                  aria-label={t("gl.ledger.addAccount")}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <DateRangePicker idPrefix="gl-range" value={{ from: params.date_from, to: params.date_to }} onChange={({ from, to }) => setFilters({ from, to })} />
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("shell.branch")}</span>
              <NativeSelect className="w-40" value={filters.branch} onChange={(e) => setFilters({ branch: e.target.value })}>
                <option value="">{t("shell.allBranches")}</option>
                {company?.branches.map((b) => <option key={b.id} value={b.id}>{locale === "km" ? b.name_km : b.name}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("finance.dimension.department")}</span>
              <NativeSelect className="w-40" value={filters.department} onChange={(e) => setFilters({ department: e.target.value })}>
                <option value="">{t("common.all")}</option>
                {departments?.map((d) => <option key={d.id} value={d.id}>{locale === "km" ? d.name_km : d.name}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("gl.ledger.currencyView")}</span>
              <NativeSelect className="w-52" value={params.currency_view} onChange={(e) => setFilters({ view: e.target.value === "transaction" ? "transaction" : null })}>
                <option value="base">{t("gl.ledger.base", { currency: base })}</option>
                <option value="transaction">{t("gl.ledger.transaction")}</option>
              </NativeSelect>
            </label>
          </div>
        </div>
      </div>

      {!ready ? (
        <EmptyState title={t("gl.ledger.pick")} className="rounded-xl border" />
      ) : (
        <>
          <ReportHeader
            reportName={t("gl.ledger.title")}
            period={`${format.date(params.date_from)} – ${format.date(params.date_to)}`}
            currency={params.currency_view === "base" ? base : t("gl.ledger.transaction")}
            branch={filters.branch ? branchName(filters.branch) : t("shell.allBranches")}
            generatedAt={query.data?.generated_at}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => window.print()}><Printer aria-hidden />{t("common.print")}</Button>
                <ExportMenu onExport={(f) => runExport("general-ledger", f, params)} disabled={!query.data} />
              </>
            }
          />
          {query.isPending ? (
            <TableSkeleton columns={9} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <div className="space-y-6">
              {query.data.accounts.map((s) => {
                const cur = params.currency_view === "base" ? base : undefined;
                return (
                  <section key={s.account_id} aria-label={`${s.code} ${s.name}`} data-testid={`gl-account-${s.code}`} data-print="keep">
                    <h2 className="mb-1 font-semibold">{s.code} {locale === "km" ? s.name_km : s.name}</h2>
                    <p className="mb-2 text-xs text-muted-foreground">{t("gl.ledger.balanceSide", { side: t(`finance.account.${s.normal_balance}`) })}</p>
                    <div className="relative overflow-x-auto rounded-lg border bg-card">
                      <table className="w-full min-w-[60rem] border-collapse text-sm">
                        <caption className="sr-only">{s.code} {s.name}</caption>
                        <thead className="bg-muted/50">
                          <tr>
                            {[["date", ""], ["journal", ""], ["source", ""], ["reference", ""], ["description", ""], ["debit", "right"], ["credit", "right"], ["balance", "right"], ["branch", ""], ["department", ""]].map(([k, align]) => (
                              <th key={k} scope="col" className={cn(head, align === "right" ? "text-right" : "text-left")}>
                                {t(`gl.ledger.col.${k}`)}{align === "right" && cur ? ` (${cur})` : ""}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t bg-muted/20 font-medium">
                            <td className="px-2 py-1.5" colSpan={7}>{t("gl.ledger.opening")}</td>
                            <td className="px-2 py-1.5"><AmountText value={s.opening_balance} currency={base} /></td>
                            <td colSpan={2} />
                          </tr>
                          {s.lines.length === 0 && (
                            <tr className="border-t"><td colSpan={10} className="px-2 py-3 text-center text-muted-foreground">{t("gl.ledger.noLines")}</td></tr>
                          )}
                          {s.lines.map((l) => (
                            <Fragment key={l.id}>
                              <tr className="border-t">
                                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{format.date(l.date)}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  <AppLink href={`/accounting/journals/${l.journal_id}`} className="text-primary hover:underline">{l.journal_no}</AppLink>
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{t.has(`gl.type.${l.source}`) ? t(`gl.type.${l.source}`) : l.source}</td>
                                <td className="px-2 py-1.5">{l.reference}</td>
                                <td className="px-2 py-1.5">{l.description}</td>
                                <td className="px-2 py-1.5"><AmountText value={l.debit} currency={l.currency} blankZero withCode={!cur} /></td>
                                <td className="px-2 py-1.5"><AmountText value={l.credit} currency={l.currency} blankZero withCode={!cur} /></td>
                                <td className="px-2 py-1.5"><AmountText value={l.balance} currency={base} /></td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{branchName(l.branch_id)}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">{deptName(l.department_id)}</td>
                              </tr>
                            </Fragment>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 bg-muted/50 font-semibold">
                          <tr>
                            <td className="px-2 py-1.5" colSpan={5}>{t("gl.ledger.totals")} ({base})</td>
                            <td className="px-2 py-1.5"><AmountText value={s.total_debit} currency={base} /></td>
                            <td className="px-2 py-1.5"><AmountText value={s.total_credit} currency={base} /></td>
                            <td colSpan={3} />
                          </tr>
                          <tr data-testid={`gl-closing-${s.code}`}>
                            <td className="px-2 py-1.5" colSpan={7}>{t("gl.ledger.closing")}</td>
                            <td className="px-2 py-1.5"><AmountText value={s.closing_balance} currency={base} /></td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {s.truncated && <p className="mt-1 text-xs text-warning">{t("gl.ledger.truncated")}</p>}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
