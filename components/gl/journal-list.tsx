"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, PageHeader } from "@/components/feedback/states";
import { NativeSelect } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { DateRangePicker } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/workflow/status-badge";
import { journalsApi } from "@/lib/api/endpoints/journals";
import { useFormatters } from "@/lib/api/hooks";
import type { JournalSummary, JournalType } from "@/lib/api/types/journals";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { Can } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";

const FILTERS = ["status", "search", "type", "from", "to", "account", "min", "max", "preparer", "source", "sort"] as const;
const STATUS_TABS = ["", "DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REVERSED"] as const;
const TYPES: JournalType[] = ["MANUAL", "ADJUSTING", "SYSTEM", "REVERSAL", "OPENING"];

/** SCR-04 journal list: status tabs, filters in the URL, server-side paging and sorting. */
export function JournalListPage() {
  const t = useTranslations();
  const router = useAppRouter();
  const format = useFormatters();
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const userId = useSession((s) => s.user?.id);
  const base = company?.base_currency ?? "USD";
  const { filters, setFilters, clear } = useUrlFilters(FILTERS);
  const canClear = Boolean(filters.search || filters.type || filters.from || filters.to || filters.account || filters.min || filters.max || filters.preparer || filters.source);

  const columns: ColumnDef<JournalSummary, unknown>[] = [
    {
      id: "number", header: t("gl.journals.col.number"), meta: { sortKey: "journal_no" },
      cell: ({ row }) => (
        <AppLink href={`/accounting/journals/${row.original.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.journal_no ?? t("gl.journals.draftNo")}
        </AppLink>
      ),
    },
    { id: "date", header: t("gl.journals.col.date"), meta: { sortKey: "posting_date" }, cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.posting_date)}</span> },
    { id: "type", header: t("gl.journals.col.type"), cell: ({ row }) => t(`gl.type.${row.original.type}`) },
    { id: "description", header: t("gl.journals.col.description"), cell: ({ row }) => <span className="line-clamp-2 min-w-48">{row.original.description}</span> },
    { id: "reference", header: t("gl.journals.col.reference"), cell: ({ row }) => row.original.source_no ?? row.original.reference },
    {
      id: "total", header: t("gl.journals.col.total", { currency: base }), meta: { align: "right", sortKey: "total", label: t("gl.journals.col.total", { currency: base }) },
      cell: ({ row }) => <AmountText value={row.original.totals.debit_base} currency={base} />,
    },
    { id: "status", header: t("gl.journals.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "preparer", header: t("gl.journals.col.preparer"), cell: ({ row }) => row.original.preparer_name },
    { id: "approver", header: t("gl.journals.col.approver"), cell: ({ row }) => row.original.approver_name ?? "—" },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("gl.journals.title")}
        description={t("gl.journals.description")}
        actions={
          <Can permission="gl.journal.create">
            <Button size="sm" asChild data-testid="new-journal">
              <AppLink href="/accounting/journals/new"><Plus aria-hidden />{t("gl.journals.new")}</AppLink>
            </Button>
          </Can>
        }
      />
      <StatusTabs
        label={t("gl.journals.tabsLabel")}
        value={filters.status}
        onChange={(status) => setFilters({ status })}
        tabs={STATUS_TABS.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))}
      />
      <FilterBar
        search={filters.search}
        onSearch={(search) => setFilters({ search })}
        searchPlaceholder={t("gl.journals.searchPlaceholder")}
        onClear={() => clear()}
        canClear={canClear}
      >
        <NativeSelect className="w-auto" aria-label={t("gl.journals.filters.type")} value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="">{t("gl.journals.filters.type")}: {t("common.all")}</option>
          {TYPES.map((x) => <option key={x} value={x}>{t(`gl.type.${x}`)}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto" aria-label={t("gl.journals.filters.preparer")} value={filters.preparer === userId ? "me" : ""} onChange={(e) => setFilters({ preparer: e.target.value === "me" ? userId ?? null : null })}>
          <option value="">{t("gl.journals.filters.preparer")}: {t("common.all")}</option>
          <option value="me">{t("gl.journals.filters.mine")}</option>
        </NativeSelect>
        <div className="w-60"><AccountPicker value={filters.account || null} onChange={(id) => setFilters({ account: id })} aria-label={t("gl.journals.filters.account")} /></div>
        <AmountInput className="w-28" currency={base} value={filters.min} onValueChange={(min) => setFilters({ min })} placeholder={t("gl.journals.filters.amountMin")} aria-label={t("gl.journals.filters.amountMin")} />
        <AmountInput className="w-28" currency={base} value={filters.max} onValueChange={(max) => setFilters({ max })} placeholder={t("gl.journals.filters.amountMax")} aria-label={t("gl.journals.filters.amountMax")} />
        <DateRangePicker idPrefix="jnl-range" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
      </FilterBar>
      <DataTable<JournalSummary>
        tableId="journals"
        caption={t("gl.journals.title")}
        columns={columns}
        queryKey={["journals", companyId, filters.status, filters.search, filters.type, filters.from, filters.to, filters.account, filters.min, filters.max, filters.preparer, filters.source]}
        fetchPage={({ cursor, limit, sort }, signal) =>
          journalsApi.list({
            cursor, limit, sort,
            status: filters.status || undefined, search: filters.search || undefined, type: (filters.type || undefined) as JournalType | undefined,
            date_from: filters.from || undefined, date_to: filters.to || undefined, account_id: filters.account || undefined,
            amount_min: filters.min || undefined, amount_max: filters.max || undefined, preparer_id: filters.preparer || undefined,
            source: filters.source || undefined,
          }, signal)
        }
        getRowId={(row) => row.id}
        sort={filters.sort || "-posting_date"}
        onSortChange={(sort) => setFilters({ sort })}
        onRowClick={(row) => router.push(`/accounting/journals/${row.id}`)}
        empty={
          <EmptyState
            title={canClear || filters.status ? t("data.table.noResults") : t("gl.journals.empty")}
            action={<Can permission="gl.journal.create"><Button size="sm" asChild><AppLink href="/accounting/journals/new">{t("gl.journals.new")}</AppLink></Button></Can>}
          />
        }
      />
    </div>
  );
}
