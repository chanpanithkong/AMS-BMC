"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Play, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { ExportMenu, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { ReportHeader } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { useExport } from "@/components/gl/trial-balance-page";
import { statementsApi } from "@/lib/api/endpoints/statements";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { ReportColumn, ReportDocument, ReportDrill, ReportParams, ReportRow } from "@/lib/api/types/statements";
import { useCurrentCompany } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { usePermission } from "@/lib/rbac/can";
import { findReport } from "@/lib/reports/catalogue";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

const KEYS = ["from", "to", "as_of", "branch", "department", "compare", "unposted", "group", "status"] as const;

/** Where a drill-down goes (SCR-15 "drill-down"). */
export function drillHref(d: ReportDrill): string {
  switch (d.type) {
    case "account": return `/accounting/general-ledger?accounts=${d.id}&from=${d.date_from ?? ""}&to=${d.date_to ?? ""}`;
    case "journal": return `/accounting/journals/${d.id}`;
    case "customer_invoice": return `/sales/invoices/${d.id}`;
    case "supplier_invoice": return `/purchases/invoices/${d.id}`;
    case "customer": return `/sales/customers/${d.id}`;
    case "supplier": return `/purchases/suppliers/${d.id}`;
    case "cash_account": return `/cash-bank/accounts/${d.id}`;
    case "reconciliation": return `/cash-bank/reconciliations/${d.id}`;
    case "report": return `/reports/${d.id}?from=${d.date_from ?? ""}&to=${d.date_to ?? ""}`;
    case "asset": return `/fixed-assets/${d.id}`;
  }
}

/** SCR-15 report viewer: parameters, header with basis and period, validation banner, expandable body, export and print. */
export function ReportViewer({ slug }: { slug: string }) {
  const t = useTranslations();
  const entry = findReport(slug);
  const allowed = usePermission(entry?.permission ?? "rpt.kpi");
  if (!entry || entry.path || entry.phase) return <EmptyState title={t("reports.notFound")} action={<Button size="sm" asChild><AppLink href="/reports">{t("reports.back")}</AppLink></Button>} />;
  if (!allowed) return <EmptyState title={t("reports.forbidden")} />;
  return <Viewer slug={slug} />;
}

function Viewer({ slug }: { slug: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const entry = findReport(slug)!;
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const { data: departments } = useDepartments();
  const canExport = usePermission("rpt.export");
  const runExport = useExport();
  const today = todayBusinessDate();
  const { filters, setFilters } = useUrlFilters(KEYS);
  const has = (p: (typeof entry.params)[number]) => entry.params.includes(p);

  // The URL holds the parameters the report was run with; the panel edits a draft until "Run".
  const applied: ReportParams = {
    ...(has("range") ? { date_from: filters.from || `${today.slice(0, 4)}-01-01`, date_to: filters.to || today } : {}),
    ...(has("as_of") ? { as_of: filters.as_of || today } : {}),
    ...(has("branch") && filters.branch ? { branch_id: filters.branch } : {}),
    ...(has("department") && filters.department ? { department_id: filters.department } : {}),
    ...(has("compare") && filters.compare ? { compare: filters.compare as ReportParams["compare"] } : {}),
    ...(has("unposted") && filters.unposted === "1" ? { include_unposted: true } : {}),
    ...(has("group") && filters.group ? { group: filters.group as ReportParams["group"] } : {}),
    ...(has("journal_status") && filters.status ? { status: filters.status } : {}),
  };
  const [draft, setDraft] = useState(filters);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const report = useQuery({
    queryKey: ["report", slug, companyId, applied],
    queryFn: ({ signal }) => statementsApi.run(slug, applied, signal),
  });
  const title = t(`reports.list.${slug}.title`);
  const period = applied.date_from
    ? `${format.date(applied.date_from)} – ${format.date(applied.date_to)}`
    : t("reports.asOf", { date: format.date(applied.as_of ?? today) });
  const branchName = applied.branch_id ? company?.branches.find((b) => b.id === applied.branch_id) : null;

  return (
    <div className="min-w-0" data-print="main" data-testid="report-viewer">
      <ReportHeader
        reportName={`${title} (${entry.id})`}
        period={period}
        currency="USD"
        branch={branchName ? (locale === "km" ? branchName.name_km : branchName.name) : t("reports.allBranches")}
        generatedAt={report.data?.generated_at}
        includesUnposted={report.data?.includes_unposted}
        actions={
          <>
            <Button size="sm" variant="ghost" asChild><AppLink href="/reports">{t("reports.back")}</AppLink></Button>
            <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!report.data}><Printer aria-hidden />{t("reports.print")}</Button>
            {canExport && <ExportMenu disabled={!report.data} onExport={(fmt) => runExport(slug, fmt, applied)} />}
          </>
        }
      />

      {entry.params.length > 0 && (
        <form
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3"
          data-print="hide"
          aria-label={t("reports.parameters")}
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(Object.fromEntries(KEYS.map((k) => [k, draft[k] || null])) as Partial<Record<(typeof KEYS)[number], string | null>>);
          }}
        >
          {has("range") && (
            <>
              <FormField id="rp-from" label={t("reports.params.from")}><DateInput id="rp-from" value={draft.from || applied.date_from || ""} onValueChange={(from) => set({ from })} /></FormField>
              <FormField id="rp-to" label={t("reports.params.to")}><DateInput id="rp-to" value={draft.to || applied.date_to || ""} onValueChange={(to) => set({ to })} /></FormField>
            </>
          )}
          {has("as_of") && <FormField id="rp-asof" label={t("reports.params.asOf")}><DateInput id="rp-asof" value={draft.as_of || applied.as_of || ""} onValueChange={(as_of) => set({ as_of })} /></FormField>}
          {has("branch") && (
            <FormField id="rp-branch" label={t("reports.params.branch")}>
              <NativeSelect id="rp-branch" value={draft.branch} onChange={(e) => set({ branch: e.target.value })}>
                <option value="">{t("reports.allBranches")}</option>
                {company?.branches.map((b) => <option key={b.id} value={b.id}>{locale === "km" ? b.name_km : b.name}</option>)}
              </NativeSelect>
            </FormField>
          )}
          {has("department") && (
            <FormField id="rp-dept" label={t("reports.params.department")}>
              <NativeSelect id="rp-dept" value={draft.department} onChange={(e) => set({ department: e.target.value })}>
                <option value="">{t("reports.allDepartments")}</option>
                {departments?.map((d) => <option key={d.id} value={d.id}>{locale === "km" ? d.name_km : d.name}</option>)}
              </NativeSelect>
            </FormField>
          )}
          {has("compare") && (
            <FormField id="rp-compare" label={t("reports.params.compare")}>
              <NativeSelect id="rp-compare" value={draft.compare} onChange={(e) => set({ compare: e.target.value })}>
                <option value="">{t("reports.compare.none")}</option>
                <option value="prior_period">{t("reports.compare.prior_period")}</option>
                <option value="prior_year">{t("reports.compare.prior_year")}</option>
              </NativeSelect>
            </FormField>
          )}
          {has("group") && (
            <FormField id="rp-group" label={t("reports.params.group")}>
              <NativeSelect id="rp-group" value={draft.group || "month"} onChange={(e) => set({ group: e.target.value })}>
                <option value="month">{t("reports.group.month")}</option>
                <option value="quarter">{t("reports.group.quarter")}</option>
              </NativeSelect>
            </FormField>
          )}
          {has("journal_status") && (
            <FormField id="rp-status" label={t("reports.params.status")}>
              <NativeSelect id="rp-status" value={draft.status || "POSTED"} onChange={(e) => set({ status: e.target.value })}>
                {["POSTED", "APPROVED", "SUBMITTED", "DRAFT", "REVERSED"].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </NativeSelect>
            </FormField>
          )}
          {has("unposted") && (
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={draft.unposted === "1"} onChange={(e) => set({ unposted: e.target.checked ? "1" : "" })} data-testid="include-unposted" />
              {t("reports.params.unposted")}
            </label>
          )}
          <Button type="submit" size="sm" data-testid="run-report"><Play aria-hidden />{t("reports.run")}</Button>
        </form>
      )}

      {report.isPending && <TableSkeleton rows={10} />}
      {report.isError && (isApiError(report.error) && report.error.code === "FORBIDDEN" ? <EmptyState title={t("reports.forbidden")} /> : <ErrorState error={report.error} onRetry={() => report.refetch()} />)}
      {report.data && <ReportBody doc={report.data} />}
    </div>
  );
}

function Checks({ doc }: { doc: ReportDocument }) {
  const locale = useAppLocale();
  const t = useTranslations("reports");
  if (!doc.checks.length && !doc.notes.length) return null;
  const failed = doc.checks.filter((c) => !c.ok);
  return (
    <div className="mb-3 space-y-1.5" data-testid="report-checks" data-ok={failed.length === 0}>
      {doc.checks.map((c, i) => (
        <p key={i} className={cn("flex items-start gap-2 rounded-lg border p-2 text-sm", c.ok ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/10")} role={c.ok ? undefined : "status"}>
          {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
          <span><span className="sr-only">{c.ok ? t("checkOk") : t("checkWarn")}: </span>{locale === "km" ? c.message_km : c.message}</span>
        </p>
      ))}
      {doc.notes.map((n, i) => (
        <p key={`n${i}`} className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{locale === "km" ? n.message_km : n.message}</p>
      ))}
    </div>
  );
}

function Cell({ column, value }: { column: ReportColumn; value: string | null | undefined }) {
  const t = useTranslations();
  const format = useFormatters();
  if (value === null || value === undefined || value === "") return <span className="block text-right text-muted-foreground">{column.kind === "text" || column.kind === "date" ? "" : "—"}</span>;
  if (column.kind === "amount") return <AmountText value={value} currency={column.currency ?? "USD"} />;
  if (column.kind === "number" || column.kind === "percent") {
    // Decimal strings keep their own precision: "4100000" (riel, days) or "1250.00".
    return /^-?\d+(\.\d+)?$/.test(value) ? <span className="amount block">{format.amount(value, value.includes(".") ? "USD" : "KHR")}</span> : <span className="block text-right">{value}</span>;
  }
  if (column.kind === "date") return <span className="tabular-nums whitespace-nowrap">{format.date(value)}</span>;
  return <span>{t.has(`status.${value}`) ? t(`status.${value}`) : value}</span>;
}

/** Report body with expandable groups; group rows and totals in bold; drill-down links on lines. */
export function ReportBody({ doc }: { doc: ReportDocument }) {
  const t = useTranslations("reports");
  const locale = useAppLocale();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const children = new Map<string | null, ReportRow[]>();
  for (const r of doc.rows) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r]);
  const toggle = (id: string) => setCollapsed((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const hasFormula = doc.rows.some((r) => r.formula);
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  const render = (row: ReportRow, depth: number): ReactNode[] => {
    const kids = children.get(row.id) ?? [];
    const open = !collapsed.has(row.id);
    const label = locale === "km" ? row.label_km : row.label;
    const formula = locale === "km" ? row.formula_km : row.formula;
    const out: ReactNode[] = [
      <tr key={row.id} className={cn("border-t", row.kind === "section" && depth === 0 && "bg-muted/30", (row.kind === "total" || row.kind === "subtotal") && "font-semibold", row.kind === "total" && "border-t-2", row.kind === "note" && "text-muted-foreground")} data-kind={row.kind}>
        <td className="px-2 py-1.5" style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}>
          <span className="flex items-start gap-1">
            {kids.length > 0 ? (
              <button type="button" onClick={() => toggle(row.id)} aria-expanded={open} className="mt-0.5 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={open ? t("collapse", { label }) : t("expand", { label })}>
                {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
              </button>
            ) : <span className="w-4 shrink-0" aria-hidden />}
            <span className={cn(row.kind === "section" && "font-semibold")}>
              {row.code && <span className="mr-1.5 tabular-nums text-muted-foreground">{row.code}</span>}
              {row.drill ? <AppLink href={drillHref(row.drill)} className="text-primary hover:underline">{label}</AppLink> : label}
            </span>
          </span>
        </td>
        {doc.columns.map((c) => <td key={c.key} className="px-2 py-1.5"><Cell column={c} value={row.values[c.key]} /></td>)}
        {hasFormula && <td className="px-2 py-1.5 text-xs text-muted-foreground">{formula}</td>}
      </tr>,
    ];
    if (open) for (const k of kids) out.push(...render(k, depth + 1));
    return out;
  };
  const top = children.get(null) ?? [];
  return (
    <>
      <Checks doc={doc} />
      {top.length === 0 ? <EmptyState title={t("empty")} className="rounded-lg border py-8" /> : (
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid="report-table">
            <caption className="sr-only">{locale === "km" ? doc.title_km : doc.title}</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className={head}>{t("line")}</th>
                {doc.columns.map((c) => <th key={c.key} scope="col" className={cn(head, c.kind !== "text" && c.kind !== "date" && "text-right")}>{locale === "km" ? c.label_km : c.label}{c.currency ? ` (${c.currency})` : ""}</th>)}
                {hasFormula && <th scope="col" className={head}>{t("formula")}</th>}
              </tr>
            </thead>
            <tbody>{top.flatMap((r) => render(r, 0))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
