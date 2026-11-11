"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, PageHeader } from "@/components/feedback/states";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/workflow/status-badge";
import { customersApi, suppliersApi } from "@/lib/api/endpoints/arap";
import type { Party } from "@/lib/api/types/arap";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { Can } from "@/lib/rbac/can";
import type { Permission } from "@/lib/rbac/permissions";
import { useUiStore } from "@/lib/stores/ui";
import { SIDE, useNameOf, type DocKind } from "./shared";

/** SCR-20 customer and supplier lists. */
export function PartyListPage({ kind }: { kind: DocKind }) {
  const t = useTranslations();
  const side = SIDE[kind];
  const router = useAppRouter();
  const nameOf = useNameOf();
  const companyId = useUiStore((s) => s.companyId);
  const { filters, setFilters, clear } = useUrlFilters(["status", "search", "owing"] as const);
  const apiOf = kind === "AR" ? customersApi : suppliersApi;
  const tabs = kind === "AR" ? ["", "ACTIVE", "INACTIVE"] : ["", "VERIFIED", "DRAFT", "BLOCKED"];

  const columns: ColumnDef<Party, unknown>[] = [
    {
      id: "code", header: t("arap.parties.col.code"),
      cell: ({ row }) => <AppLink href={`${side.partyPath}/${row.original.id}`} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.code}</AppLink>,
    },
    { id: "name", header: t("arap.parties.col.name"), cell: ({ row }) => <span className="block min-w-44">{nameOf(row.original)}</span> },
    { id: "phone", header: t("arap.parties.col.phone"), cell: ({ row }) => <span className="whitespace-nowrap">{row.original.phone}</span> },
    { id: "terms", header: t("arap.parties.col.terms"), cell: ({ row }) => t("arap.parties.days", { days: row.original.payment_terms_days }) },
    { id: "currency", header: t("arap.parties.col.currency"), cell: ({ row }) => row.original.currency },
    ...(kind === "AR" ? [{
      id: "limit", header: t("arap.parties.col.creditLimit"), meta: { align: "right", label: t("arap.parties.col.creditLimit") },
      cell: ({ row }) => row.original.credit_limit === null ? <span className="block text-right text-muted-foreground">{t("arap.credit.noLimit")}</span> : <AmountText value={row.original.credit_limit} currency="USD" />,
    } as ColumnDef<Party, unknown>] : []),
    { id: "balance", header: t("arap.parties.col.balance"), meta: { align: "right", label: t("arap.parties.col.balance") }, cell: ({ row }) => <AmountText value={row.original.balance} currency="USD" blankZero /> },
    { id: "overdue", header: t("arap.parties.col.overdue"), meta: { align: "right", label: t("arap.parties.col.overdue") }, cell: ({ row }) => <AmountText value={row.original.overdue} currency="USD" blankZero className={row.original.overdue !== "0.00" ? "text-destructive" : undefined} /> },
    { id: "status", header: t("arap.parties.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={t(`${side.ns}.partiesTitle`)}
        description={t(`${side.ns}.partiesDescription`)}
        actions={<Can permission={`${side.partyPerm}.manage` as Permission}><Button size="sm" asChild data-testid="new-party"><AppLink href={`${side.partyPath}/new`}><Plus aria-hidden />{t(`${side.ns}.newParty`)}</AppLink></Button></Can>}
      />
      <StatusTabs label={t("arap.parties.tabsLabel")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={tabs.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("arap.parties.searchPlaceholder")} onClear={() => clear()} canClear={Boolean(filters.search || filters.owing)}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={filters.owing === "1"} onChange={(e) => setFilters({ owing: e.target.checked ? "1" : "" })} />
          {t("arap.parties.withBalance")}
        </label>
      </FilterBar>
      <DataTable<Party>
        tableId={`${kind}-parties`}
        caption={t(`${side.ns}.partiesTitle`)}
        columns={columns}
        queryKey={["party-list", kind, companyId, filters.status, filters.search, filters.owing]}
        fetchPage={({ cursor, limit }, signal) => apiOf.list({ cursor, limit, status: filters.status || undefined, search: filters.search || undefined, with_balance: filters.owing === "1" || undefined }, signal)}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`${side.partyPath}/${row.id}`)}
        empty={<EmptyState title={filters.search ? t("data.table.noResults") : t("arap.parties.empty")} />}
      />
    </div>
  );
}
