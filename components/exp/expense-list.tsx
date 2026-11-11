"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, PageHeader } from "@/components/feedback/states";
import { NativeSelect } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { DateRangePicker } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/workflow/status-badge";
import { expensesApi } from "@/lib/api/endpoints/cashbank";
import { useFormatters } from "@/lib/api/hooks";
import type { Expense } from "@/lib/api/types/cashbank";
import { AppLink, useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { Can } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { useExpenseCategories } from "./expense-form";

const STATUS_TABS = ["", "DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED"] as const;

/** SCR-21 expense list. */
export function ExpenseListPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const router = useAppRouter();
  const format = useFormatters();
  const companyId = useUiStore((s) => s.companyId);
  const { data: categories } = useExpenseCategories();
  const { filters, setFilters, clear } = useUrlFilters(["status", "category", "mode", "search", "from", "to"] as const);

  const columns: ColumnDef<Expense, unknown>[] = [
    {
      id: "number", header: t("exp.col.number"),
      cell: ({ row }) => <AppLink href={`/expenses/${row.original.id}`} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.number ?? t("gl.journals.draftNo")}</AppLink>,
    },
    { id: "date", header: t("exp.col.date"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.date)}</span> },
    { id: "category", header: t("exp.col.category"), cell: ({ row }) => (locale === "km" ? row.original.category_name_km : row.original.category_name) },
    { id: "description", header: t("exp.col.description"), cell: ({ row }) => <span className="line-clamp-2 min-w-40">{row.original.description}</span> },
    { id: "payee", header: t("exp.col.payee"), cell: ({ row }) => row.original.payee },
    { id: "mode", header: t("exp.col.mode"), cell: ({ row }) => t(`exp.mode.${row.original.payment_mode}`) },
    { id: "amount", header: t("exp.col.amount"), meta: { align: "right", label: t("exp.col.amount") }, cell: ({ row }) => <AmountText value={row.original.amount} currency={row.original.currency} withCode /> },
    { id: "status", header: t("exp.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "preparer", header: t("exp.col.preparer"), cell: ({ row }) => row.original.preparer_name },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("exp.title")}
        description={t("exp.description")}
        actions={<Can permission="exp.create"><Button size="sm" asChild data-testid="new-expense"><AppLink href="/expenses/new"><Plus aria-hidden />{t("exp.new")}</AppLink></Button></Can>}
      />
      <StatusTabs label={t("exp.tabsLabel")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={STATUS_TABS.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("exp.searchPlaceholder")} onClear={() => clear()} canClear={Boolean(filters.category || filters.mode || filters.search || filters.from || filters.to)}>
        <NativeSelect className="w-auto" aria-label={t("exp.col.category")} value={filters.category} onChange={(e) => setFilters({ category: e.target.value })}>
          <option value="">{t("exp.allCategories")}</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{locale === "km" ? c.name_km : c.name}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto" aria-label={t("exp.col.mode")} value={filters.mode} onChange={(e) => setFilters({ mode: e.target.value })}>
          <option value="">{t("exp.allModes")}</option>
          {(["PAID", "UNPAID", "CLAIM"] as const).map((m) => <option key={m} value={m}>{t(`exp.mode.${m}`)}</option>)}
        </NativeSelect>
        <DateRangePicker idPrefix="exp-range" value={{ from: filters.from, to: filters.to }} onChange={(r) => setFilters({ from: r.from, to: r.to })} />
      </FilterBar>
      <DataTable<Expense>
        tableId="expenses"
        caption={t("exp.title")}
        columns={columns}
        queryKey={["expenses", companyId, filters.status, filters.category, filters.mode, filters.search, filters.from, filters.to]}
        fetchPage={({ cursor, limit }, signal) => expensesApi.list({
          cursor, limit, status: filters.status || undefined, category_id: filters.category || undefined, payment_mode: filters.mode || undefined,
          search: filters.search || undefined, date_from: filters.from || undefined, date_to: filters.to || undefined,
        }, signal)}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/expenses/${row.id}`)}
        empty={<EmptyState title={filters.status || filters.search ? t("data.table.noResults") : t("exp.empty")} action={<Can permission="exp.create"><Button size="sm" asChild><AppLink href="/expenses/new">{t("exp.new")}</AppLink></Button></Can>} />}
      />
    </div>
  );
}
