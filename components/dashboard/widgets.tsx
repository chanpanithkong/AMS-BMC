"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock, Landmark, TableIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CardSkeleton, ErrorState } from "@/components/feedback/states";
import { NativeSelect } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { dashboardApi } from "@/lib/api/endpoints/statements";
import { useFormatters } from "@/lib/api/hooks";
import type { DashboardKpis } from "@/lib/api/types/statements";
import { useCurrentCompany } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { D } from "@/lib/money/decimal";
import { addDays } from "@/lib/money/invoice";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/workflow/status-badge";
import type { AnyStatus } from "@/lib/api/types/common";

type Preset = "month" | "last_month" | "quarter" | "year";

function rangeOf(preset: Preset, today: string): { date_from: string; date_to: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  if (preset === "last_month") {
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return { date_from: first(py, pm), date_to: addDays(first(y, m), -1) };
  }
  if (preset === "quarter") return { date_from: first(y, Math.floor((m - 1) / 3) * 3 + 1), date_to: today };
  if (preset === "year") return { date_from: `${y}-01-01`, date_to: today };
  return { date_from: first(y, m), date_to: today };
}

/** One widget: title, its own skeleton, error with retry and empty text (SCR-02 states). */
function Widget<T>({ title, query, children, className, badge, testId, action }: {
  title: string; query: UseQueryResult<T>; children: (data: T) => ReactNode; className?: string; badge?: ReactNode; testId?: string; action?: ReactNode;
}) {
  if (query.isPending) return <CardSkeleton className={className} />;
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card p-4", className)} aria-label={title} data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">{title}{badge}</h2>
        {action}
      </div>
      {query.isError ? <ErrorState compact error={query.error} onRetry={() => query.refetch()} /> : children(query.data as T)}
    </section>
  );
}

const KPI_LINKS: Record<string, (k: DashboardKpis) => string> = {
  revenue: (k) => `/reports/income-statement?from=${k.date_from}&to=${k.date_to}`,
  expenses: (k) => `/reports/expenses-by-category?from=${k.date_from}&to=${k.date_to}`,
  net_profit: (k) => `/reports/income-statement?from=${k.date_from}&to=${k.date_to}`,
  cash: () => "/cash-bank/accounts",
  bank: () => "/cash-bank/accounts",
  ar: () => "/sales/aging",
  ap: () => "/purchases/aging",
  overdue_ar: () => "/sales/invoices?status=OVERDUE",
  upcoming_ap: () => "/purchases/invoices?status=OPEN",
};

/** SCR-02 widgets: KPI cards, 12-month trend, cash, reconciliations, pending items, budget use and recent transactions. */
export function DashboardWidgets() {
  const t = useTranslations("dashboard");
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const today = todayBusinessDate();
  const [preset, setPreset] = useState<Preset>("month");
  const [branch, setBranch] = useState("");
  const range = { ...rangeOf(preset, today), branch_id: branch || null };
  const can = { is: usePermission("rpt.income_statement"), kpi: usePermission("rpt.kpi"), cash: usePermission("cb.cash.view"), bank: usePermission("cb.bank.view"), rec: usePermission("cb.reconcile") };
  const seeProfit = can.is || can.kpi;
  const seeCash = can.cash || can.bank;
  // The cashier sees own cash only; bank reconciliation status is for bank users (FR-DASH-001).
  const seeRec = (can.rec || can.bank) && !(can.cash && !can.bank);
  const kpis = useQuery({ queryKey: ["dash", "kpis", companyId, range], queryFn: ({ signal }) => dashboardApi.kpis(range, signal) });
  const trend = useQuery({ queryKey: ["dash", "trend", companyId, range.date_to, branch], queryFn: ({ signal }) => dashboardApi.trend(range, signal), enabled: seeProfit });
  const cash = useQuery({ queryKey: ["dash", "cash", companyId, range.date_to], queryFn: ({ signal }) => dashboardApi.cash(range, signal), enabled: seeCash });
  const recs = useQuery({ queryKey: ["dash", "recs", companyId], queryFn: ({ signal }) => dashboardApi.reconciliations(signal), enabled: seeRec, retry: false });
  const pending = useQuery({ queryKey: ["dash", "pending", companyId], queryFn: ({ signal }) => dashboardApi.pending(signal) });
  const recent = useQuery({ queryKey: ["dash", "recent", companyId], queryFn: ({ signal }) => dashboardApi.recent(signal) });
  const budget = useQuery({ queryKey: ["dash", "budget", companyId], queryFn: ({ signal }) => dashboardApi.budget(signal), enabled: seeProfit });
  const [table, setTable] = useState(false);

  const kpiKeys = ["revenue", "expenses", "net_profit", "cash", "bank", "ar", "ap", "overdue_ar", "upcoming_ap"] as const;
  const head = "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

  return (
    <div className="mb-6 space-y-4" data-testid="dashboard-widgets">
      <form className="flex flex-wrap items-end gap-3" aria-label={t("filters")} onSubmit={(e) => e.preventDefault()}>
        <label className="space-y-1 text-sm">
          <span className="block font-medium">{t("period")}</span>
          <NativeSelect value={preset} onChange={(e) => setPreset(e.target.value as Preset)} data-testid="dash-period" className="w-auto">
            {(["month", "last_month", "quarter", "year"] as const).map((p) => <option key={p} value={p}>{t(`presets.${p}`)}</option>)}
          </NativeSelect>
        </label>
        {company && company.branches.length > 1 && (
          <label className="space-y-1 text-sm">
            <span className="block font-medium">{t("branch")}</span>
            <NativeSelect value={branch} onChange={(e) => setBranch(e.target.value)} className="w-auto">
              <option value="">{t("allBranches")}</option>
              {company.branches.map((b) => <option key={b.id} value={b.id}>{locale === "km" ? b.name_km : b.name}</option>)}
            </NativeSelect>
          </label>
        )}
        <p className="pb-1.5 text-sm text-muted-foreground tabular-nums">{format.date(range.date_from)} – {format.date(range.date_to)} · {t("postedOnly")}</p>
      </form>

      {kpis.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <CardSkeleton key={i} />)}</div>
      ) : kpis.isError ? (
        <section className="rounded-xl border bg-card"><ErrorState compact error={kpis.error} onRetry={() => kpis.refetch()} /></section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label={t("kpis")}>
          {kpiKeys.filter((k) => kpis.data[k] !== null).map((k) => {
            const value = kpis.data[k]!;
            const negative = D(value).isNegative();
            return (
              <li key={k}>
                <AppLink href={KPI_LINKS[k](kpis.data)} className="group block h-full rounded-xl border bg-card p-4 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" data-testid={`kpi-${k}`}>
                  <span className="flex items-center justify-between text-xs text-muted-foreground">
                    {t(`kpi.${k}`, { days: kpis.data.upcoming_days })}
                    <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </span>
                  <span className={cn("mt-1 block text-xl font-semibold tabular-nums", negative && "text-destructive", k === "overdue_ar" && D(value).gt(0) && "text-destructive")} data-value={value}>
                    {format.amount(value, "USD")} <span className="text-xs font-normal text-muted-foreground">USD</span>
                  </span>
                  {["cash", "bank", "ar", "ap"].includes(k) && <span className="text-xs text-muted-foreground">{t("atDate", { date: format.date(kpis.data.date_to) })}</span>}
                </AppLink>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {seeProfit && (
          <Widget title={t("trend")} query={trend} className="xl:col-span-2" testId="trend-widget"
            action={<Button size="sm" variant="ghost" onClick={() => setTable((v) => !v)} aria-pressed={table}><TableIcon aria-hidden />{table ? t("showChart") : t("showTable")}</Button>}>
            {(data) => table ? (
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("trend")}</caption>
                  <thead><tr><th scope="col" className={head}>{t("month")}</th><th scope="col" className={`${head} text-right`}>{t("kpi.revenue")}</th><th scope="col" className={`${head} text-right`}>{t("kpi.expenses")}</th><th scope="col" className={`${head} text-right`}>{t("kpi.net_profit")}</th></tr></thead>
                  <tbody>{data.data.map((p) => <tr key={p.period} className="border-t"><td className="px-2 py-1">{locale === "km" ? p.label_km : p.label}</td><td className="px-2 py-1"><AmountText value={p.revenue} currency="USD" /></td><td className="px-2 py-1"><AmountText value={p.expenses} currency="USD" /></td><td className="px-2 py-1"><AmountText value={p.profit} currency="USD" /></td></tr>)}</tbody>
                </table>
              </div>
            ) : (
              <div className="h-64" role="img" aria-label={t("trendLabel")}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.data.map((p) => ({ label: locale === "km" ? p.label_km : p.label, revenue: Number(p.revenue), expenses: Number(p.expenses), profit: Number(p.profit) }))} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={44} />
                    {/* Chart values are display-only; every figure is also in the table view as an exact decimal. */}
                    <Tooltip formatter={(v) => format.amount(String(v), "USD")} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name={t("kpi.revenue")} fill="var(--primary)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expenses" name={t("kpi.expenses")} fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} />
                    <Line dataKey="profit" name={t("kpi.net_profit")} stroke="var(--success)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Widget>
        )}

        <Widget title={t("pending.title")} query={pending} testId="pending-widget" badge={<span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 text-xs text-warning"><Clock className="size-3" aria-hidden />{t("pending.badge")}</span>}>
          {(data) => (
            <div className="space-y-2 text-sm">
              <AppLink href="/approvals" className="flex items-center justify-between rounded-lg border p-2 hover:bg-muted/40" data-testid="pending-approvals">
                <span>{t("pending.approvals")}</span><span className="text-lg font-semibold tabular-nums">{data.approvals}</span>
              </AppLink>
              {data.approved_unposted.length === 0 ? <p className="text-muted-foreground">{t("pending.none")}</p> : (
                <ul className="space-y-1">
                  {data.approved_unposted.map((p) => (
                    <li key={p.type} className="flex justify-between gap-2" data-testid={`pending-${p.type}`}>
                      <span>{t(`pending.types.${p.type}`, { count: p.count })}</span>
                      <AmountText value={p.total} currency="USD" withCode />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{t("pending.note")}</p>
            </div>
          )}
        </Widget>

        {seeCash && (
          <Widget title={t("cash")} query={cash} testId="cash-widget">
            {(data) => data.data.length === 0 ? <p className="text-sm text-muted-foreground">{t("noAccounts")}</p> : (
              <ul className="divide-y text-sm">
                {data.data.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                    <AppLink href={`/cash-bank/accounts/${a.id}`} className="min-w-0 truncate hover:underline">{a.code} · {locale === "km" ? a.name_km : a.name}</AppLink>
                    <AmountText value={a.balance} currency={a.currency} withCode className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        )}

        {seeRec && (
          <Widget title={t("reconciliations")} query={recs} testId="rec-widget">
            {(data) => (
              <ul className="space-y-2 text-sm">
                {data.data.map((r) => (
                  <li key={r.bank_account_id} className="flex items-start gap-2">
                    {r.unreconciled_items === 0 ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="min-w-0">
                      <AppLink href={r.in_progress_id ? `/cash-bank/reconciliations/${r.in_progress_id}` : "/cash-bank/reconciliations"} className="font-medium hover:underline">{r.code}</AppLink>
                      <span className="block text-xs text-muted-foreground">
                        {r.last_completed ? t("lastReconciled", { date: format.date(r.last_completed) }) : t("neverReconciled")} · {t("unreconciled", { count: r.unreconciled_items })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        )}

        {seeProfit && (
          <Widget title={t("budget.title")} query={budget} testId="budget-widget">
            {(data) => data.available ? null : <p className="text-sm text-muted-foreground">{t("budget.none")}</p>}
          </Widget>
        )}

        <Widget title={t("recent.title")} query={recent} className="xl:col-span-3" testId="recent-widget">
          {(data) => data.data.length === 0 ? <p className="text-sm text-muted-foreground">{t("recent.empty")}</p> : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">{t("recent.title")}</caption>
                <thead><tr>
                  {["date", "number", "type", "description"].map((c) => <th key={c} scope="col" className={head}>{t(`recent.${c}`)}</th>)}
                  <th scope="col" className={`${head} text-right`}>{t("recent.amount")} (USD)</th><th scope="col" className={head}>{t("recent.status")}</th>
                </tr></thead>
                <tbody>
                  {data.data.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{format.date(r.date)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.href ? <AppLink href={r.href} className="font-medium text-primary hover:underline">{r.number}</AppLink> : r.number}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{t.has(`recent.types.${r.type}`) ? t(`recent.types.${r.type}`) : r.type}</td>
                      <td className="px-2 py-1.5"><span className="line-clamp-1">{r.description}</span></td>
                      <td className="px-2 py-1.5"><AmountText value={r.amount} currency={r.currency} /></td>
                      <td className="px-2 py-1.5"><StatusBadge status={r.status as AnyStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Widget>
      </div>
    </div>
  );
}
