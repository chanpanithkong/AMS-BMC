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
import { customerInvoicesApi, supplierInvoicesApi } from "@/lib/api/endpoints/arap";
import { useFormatters } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/types/arap";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { Can } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { SIDE, useNameOf, useParties, type DocKind } from "./shared";

const TABS = ["", "DRAFT", "SUBMITTED", "APPROVED", "OPEN", "PARTIALLY_PAID", "OVERDUE", "PAID"] as const;

/** SCR-09 / SCR-11 lists: customer invoices or supplier invoices. */
export function InvoiceListPage({ kind }: { kind: DocKind }) {
  const t = useTranslations();
  const side = SIDE[kind];
  const router = useAppRouter();
  const format = useFormatters();
  const nameOf = useNameOf();
  const companyId = useUiStore((s) => s.companyId);
  const { data: parties } = useParties(kind);
  const { filters, setFilters, clear } = useUrlFilters(["status", "party", "search", "from", "to"] as const);
  const apiOf = kind === "AR" ? customerInvoicesApi : supplierInvoicesApi;
  const href = (row: Invoice) => `${side.invoicePath}/${row.id}`;

  const columns: ColumnDef<Invoice, unknown>[] = [
    {
      id: "number", header: t("arap.invoices.col.number"),
      cell: ({ row }) => (
        <AppLink href={href(row.original)} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.number ?? t("arap.invoices.draftNo")}
        </AppLink>
      ),
    },
    ...(kind === "AP" ? [{ id: "supplierNo", header: t("arap.invoices.col.supplierNo"), cell: ({ row }) => <span className="whitespace-nowrap">{row.original.supplier_invoice_no}</span> } as ColumnDef<Invoice, unknown>] : []),
    { id: "date", header: t("arap.invoices.col.date"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.date)}</span> },
    { id: "party", header: t(`${side.ns}.party`), cell: ({ row }) => <span className="min-w-40 block">{nameOf({ name: row.original.party_name, name_km: row.original.party_name_km })}</span> },
    { id: "due", header: t("arap.invoices.col.due"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.due_date)}</span> },
    { id: "total", header: t("arap.invoices.col.total"), meta: { align: "right", label: t("arap.invoices.col.total") }, cell: ({ row }) => <AmountText value={row.original.total} currency={row.original.currency} withCode /> },
    { id: "outstanding", header: t("arap.invoices.col.outstanding"), meta: { align: "right", label: t("arap.invoices.col.outstanding") }, cell: ({ row }) => row.original.posted ? <AmountText value={row.original.outstanding} currency={row.original.currency} /> : <span className="block text-right text-muted-foreground">—</span> },
    { id: "status", header: t("arap.invoices.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={t(`${side.ns}.invoicesTitle`)}
        description={t(`${side.ns}.invoicesDescription`)}
        actions={<Can permission={`${side.perm}.create`}><Button size="sm" asChild data-testid="new-invoice"><AppLink href={`${side.invoicePath}/new`}><Plus aria-hidden />{t(`${side.ns}.newInvoice`)}</AppLink></Button></Can>}
      />
      <StatusTabs label={t("arap.invoices.tabsLabel")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={TABS.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("arap.invoices.searchPlaceholder")} onClear={() => clear()} canClear={Boolean(filters.party || filters.search || filters.from || filters.to)}>
        <NativeSelect className="w-auto max-w-56" aria-label={t(`${side.ns}.party`)} value={filters.party} onChange={(e) => setFilters({ party: e.target.value })}>
          <option value="">{t(`${side.ns}.allParties`)}</option>
          {parties?.map((p) => <option key={p.id} value={p.id}>{p.code} · {nameOf(p)}</option>)}
        </NativeSelect>
        <DateRangePicker idPrefix={`${kind}-inv-range`} value={{ from: filters.from, to: filters.to }} onChange={(r) => setFilters({ from: r.from, to: r.to })} />
      </FilterBar>
      <DataTable<Invoice>
        tableId={`${kind}-invoices`}
        caption={t(`${side.ns}.invoicesTitle`)}
        columns={columns}
        queryKey={["invoices", kind, companyId, filters.status, filters.party, filters.search, filters.from, filters.to]}
        fetchPage={({ cursor, limit }, signal) => apiOf.list({
          cursor, limit, status: filters.status || undefined, party_id: filters.party || undefined, search: filters.search || undefined,
          date_from: filters.from || undefined, date_to: filters.to || undefined,
        }, signal)}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(href(row))}
        empty={<EmptyState title={filters.status || filters.search || filters.party ? t("data.table.noResults") : t("arap.invoices.empty")} />}
      />
    </div>
  );
}
