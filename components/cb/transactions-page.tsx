"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, PageHeader } from "@/components/feedback/states";
import { NativeSelect } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { DateRangePicker } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/workflow/status-badge";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { useFormatters } from "@/lib/api/hooks";
import type { CashTransaction, CashTransactionType } from "@/lib/api/types/cashbank";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { Can } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { useAccountLabel, useCashBankAccounts } from "./use-cash-bank";

export const CASH_TYPES: CashTransactionType[] = ["RECEIPT", "PAYMENT", "TRANSFER", "DEPOSIT", "WITHDRAWAL", "CHARGE"];
const STATUS_TABS = ["", "DRAFT", "SUBMITTED", "POSTED", "CANCELLED"] as const;

/** SCR-27 cash and bank transactions list. */
export function CashTransactionsPage() {
  const t = useTranslations();
  const router = useAppRouter();
  const format = useFormatters();
  const label = useAccountLabel();
  const companyId = useUiStore((s) => s.companyId);
  const { accounts } = useCashBankAccounts();
  const { filters, setFilters, clear } = useUrlFilters(["status", "type", "account", "search", "from", "to"] as const);
  const accountOf = (id: string | null) => accounts.find((a) => a.id === id);

  const columns: ColumnDef<CashTransaction, unknown>[] = [
    {
      id: "number", header: t("cb.tx.col.number"),
      cell: ({ row }) => (
        <AppLink href={`/cash-bank/transactions/${row.original.id}`} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.number ?? t("gl.journals.draftNo")}
        </AppLink>
      ),
    },
    { id: "date", header: t("cb.tx.col.date"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.date)}</span> },
    { id: "type", header: t("cb.tx.col.type"), cell: ({ row }) => t(`cb.type.${row.original.type}`) },
    {
      id: "account", header: t("cb.tx.col.account"),
      cell: ({ row }) => {
        const to = accountOf(row.original.to_account_id);
        return <span className="whitespace-nowrap">{accountOf(row.original.account_id)?.code}{to ? ` → ${to.code}` : ""}</span>;
      },
    },
    { id: "description", header: t("cb.tx.col.description"), cell: ({ row }) => <span className="line-clamp-2 min-w-40">{row.original.description}</span> },
    { id: "payee", header: t("cb.tx.col.payee"), cell: ({ row }) => row.original.payee },
    {
      id: "amount", header: t("cb.tx.col.amount"), meta: { align: "right", label: t("cb.tx.col.amount") },
      cell: ({ row }) => <AmountText value={row.original.amount} currency={row.original.currency} withCode />,
    },
    { id: "status", header: t("cb.tx.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "preparer", header: t("cb.tx.col.preparer"), cell: ({ row }) => row.original.preparer_name },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("cb.tx.title")}
        description={t("cb.tx.description")}
        actions={
          <Can permission="cb.cash.create">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="new-cash-transaction"><Plus aria-hidden />{t("cb.tx.new")}<ChevronDown aria-hidden /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {CASH_TYPES.map((type) => (
                  <DropdownMenuItem key={type} onSelect={() => router.push(`/cash-bank/transactions/new?type=${type}`)} data-testid={`new-${type}`}>
                    {t(`cb.type.${type}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        }
      />
      <StatusTabs label={t("cb.tx.tabsLabel")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={STATUS_TABS.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("cb.tx.searchPlaceholder")} onClear={() => clear()} canClear={Boolean(filters.type || filters.account || filters.search || filters.from || filters.to)}>
        <NativeSelect className="w-auto" aria-label={t("cb.tx.col.type")} value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="">{t("cb.tx.allTypes")}</option>
          {CASH_TYPES.map((x) => <option key={x} value={x}>{t(`cb.type.${x}`)}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto max-w-64" aria-label={t("cb.tx.col.account")} value={filters.account} onChange={(e) => setFilters({ account: e.target.value })}>
          <option value="">{t("cb.tx.allAccounts")}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
        </NativeSelect>
        <DateRangePicker idPrefix="ctx-range" value={{ from: filters.from, to: filters.to }} onChange={(r) => setFilters({ from: r.from, to: r.to })} />
      </FilterBar>
      <DataTable<CashTransaction>
        tableId="cash-transactions"
        caption={t("cb.tx.title")}
        columns={columns}
        queryKey={["cash-transactions", companyId, filters.status, filters.type, filters.account, filters.search, filters.from, filters.to]}
        fetchPage={({ cursor, limit }, signal) =>
          cashBankApi.transactions({
            cursor, limit, status: filters.status || undefined, type: filters.type || undefined, account_id: filters.account || undefined,
            search: filters.search || undefined, date_from: filters.from || undefined, date_to: filters.to || undefined,
          }, signal)
        }
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/cash-bank/transactions/${row.id}`)}
        empty={<EmptyState title={t("cb.tx.empty")} />}
      />
    </div>
  );
}
