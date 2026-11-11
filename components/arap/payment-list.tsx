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
import { receiptsApi, supplierPaymentsApi } from "@/lib/api/endpoints/arap";
import { useFormatters } from "@/lib/api/hooks";
import type { PartyPayment } from "@/lib/api/types/arap";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { Can } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { SIDE, useNameOf, useParties, type DocKind } from "./shared";

/** SCR-10 customer receipts and SCR-12 supplier payments. */
export function PaymentListPage({ side }: { side: DocKind }) {
  const t = useTranslations();
  const cfg = SIDE[side];
  const router = useAppRouter();
  const format = useFormatters();
  const nameOf = useNameOf();
  const companyId = useUiStore((s) => s.companyId);
  const { data: parties } = useParties(side);
  const { filters, setFilters, clear } = useUrlFilters(["status", "party", "search", "from", "to"] as const);
  const tabs = side === "AR" ? ["", "DRAFT", "POSTED"] : ["", "DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED"];
  const href = (row: PartyPayment) => `${cfg.paymentPath}/${row.id}`;

  const columns: ColumnDef<PartyPayment, unknown>[] = [
    { id: "number", header: t("arap.invoices.col.number"), cell: ({ row }) => <AppLink href={href(row.original)} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.number ?? t("arap.invoices.draftNo")}</AppLink> },
    { id: "date", header: t("arap.invoices.col.date"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.date)}</span> },
    { id: "party", header: t(`${cfg.ns}.party`), cell: ({ row }) => <span className="block min-w-40">{nameOf({ name: row.original.party_name, name_km: row.original.party_name_km })}</span> },
    { id: "method", header: t("arap.payments.method"), cell: ({ row }) => t(`arap.payments.methods.${row.original.method}`) },
    { id: "reference", header: t("arap.form.reference"), cell: ({ row }) => row.original.bank_reference ?? row.original.reference },
    { id: "amount", header: t("arap.payments.amount"), meta: { align: "right", label: t("arap.payments.amount") }, cell: ({ row }) => <AmountText value={row.original.amount} currency={row.original.currency} withCode /> },
    ...(side === "AR" ? [{ id: "unapplied", header: t("arap.payments.unapplied"), meta: { align: "right", label: t("arap.payments.unapplied") }, cell: ({ row }) => <AmountText value={row.original.unapplied} currency={row.original.currency} blankZero /> } as ColumnDef<PartyPayment, unknown>] : []),
    { id: "status", header: t("arap.invoices.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={t(`${cfg.ns}.paymentsTitle`)}
        description={t(`${cfg.ns}.paymentsDescription`)}
        actions={<Can permission={side === "AR" ? "ar.receipt.create" : "ap.payment.create"}><Button size="sm" asChild data-testid="new-payment"><AppLink href={`${cfg.paymentPath}/new`}><Plus aria-hidden />{t(`${cfg.ns}.newPayment`)}</AppLink></Button></Can>}
      />
      <StatusTabs label={t("arap.payments.tabsLabel")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={tabs.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("arap.payments.searchPlaceholder")} onClear={() => clear()} canClear={Boolean(filters.party || filters.search || filters.from || filters.to)}>
        <NativeSelect className="w-auto max-w-56" aria-label={t(`${cfg.ns}.party`)} value={filters.party} onChange={(e) => setFilters({ party: e.target.value })}>
          <option value="">{t(`${cfg.ns}.allParties`)}</option>
          {parties?.map((p) => <option key={p.id} value={p.id}>{p.code} · {nameOf(p)}</option>)}
        </NativeSelect>
        <DateRangePicker idPrefix={`${side}-pay-range`} value={{ from: filters.from, to: filters.to }} onChange={(r) => setFilters({ from: r.from, to: r.to })} />
      </FilterBar>
      <DataTable<PartyPayment>
        tableId={`${side}-payments`}
        caption={t(`${cfg.ns}.paymentsTitle`)}
        columns={columns}
        queryKey={["payments", side, companyId, filters.status, filters.party, filters.search, filters.from, filters.to]}
        fetchPage={({ cursor, limit }, signal) => (side === "AR" ? receiptsApi : supplierPaymentsApi).list({
          cursor, limit, status: filters.status || undefined, party_id: filters.party || undefined, search: filters.search || undefined,
          date_from: filters.from || undefined, date_to: filters.to || undefined,
        }, signal)}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(href(row))}
        empty={<EmptyState title={filters.status || filters.search || filters.party ? t("data.table.noResults") : t("arap.payments.empty")} />}
      />
    </div>
  );
}
