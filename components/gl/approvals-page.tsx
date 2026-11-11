"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/data/data-table";
import { EmptyState, PageHeader } from "@/components/feedback/states";
import { AmountText } from "@/components/finance/amount";
import { approvalsApi } from "@/lib/api/endpoints/journals";
import { useFormatters } from "@/lib/api/hooks";
import type { ApprovalItem } from "@/lib/api/types/journals";
import { useSession } from "@/lib/auth/session";
import { useAppRouter } from "@/lib/i18n/navigation";
import { useUiStore } from "@/lib/stores/ui";

/** Where each document type opens for review. */
const DOCUMENT_PATH: Record<ApprovalItem["document_type"], string> = {
  JOURNAL: "/accounting/journals", EXPENSE: "/expenses", AR_INVOICE: "/sales/invoices", AP_INVOICE: "/purchases/invoices",
  CREDIT_NOTE: "/sales/credit-notes", SUPPLIER_PAYMENT: "/purchases/payments", SUPPLIER_BANK: "/purchases/suppliers",
  DEPRECIATION_RUN: "/fixed-assets/depreciation-runs", ASSET_DISPOSAL: "/fixed-assets", BUDGET: "/budgets",
  USER_ACCESS: "/admin/users", ROLE_CHANGE: "/admin/roles", SETTING_CHANGE: "/settings",
};

/**
 * SCR-05 / SCR-26 approvals inbox. Items open one at a time for review; there is no bulk approval.
 * Journals, expenses, invoices, credit notes, supplier payments and supplier bank-details changes.
 */
export function ApprovalsPage() {
  const t = useTranslations();
  const router = useAppRouter();
  const format = useFormatters();
  const userId = useSession((s) => s.user?.id);
  const companyId = useUiStore((s) => s.companyId);

  const columns: ColumnDef<ApprovalItem, unknown>[] = [
    { id: "type", header: t("gl.approvals.col.type"), cell: ({ row }) => t(`gl.approvals.type.${row.original.document_type}`) },
    { id: "number", header: t("gl.approvals.col.number"), cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { id: "date", header: t("gl.approvals.col.date"), cell: ({ row }) => <span className="tabular-nums">{format.date(row.original.date)}</span> },
    { id: "description", header: t("gl.approvals.col.description"), cell: ({ row }) => row.original.description },
    {
      id: "total", header: t("gl.approvals.col.total", { currency: "USD" }), meta: { align: "right", label: t("gl.approvals.col.total", { currency: "USD" }) },
      cell: ({ row }) => <AmountText value={row.original.total} currency={row.original.currency} />,
    },
    {
      id: "preparer", header: t("gl.approvals.col.preparer"),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {row.original.preparer_name}
          {row.original.preparer_id === userId && <span className="rounded border px-1 text-xs text-muted-foreground">{t("gl.approvals.own")}</span>}
        </span>
      ),
    },
    { id: "submitted", header: t("gl.approvals.col.submitted"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.dateTime(row.original.submitted_at)}</span> },
    { id: "step", header: t("gl.approvals.col.step"), cell: ({ row }) => `${row.original.step} · ${t(`roles.${row.original.step_role}`)}` },
  ];

  return (
    <div className="min-w-0">
      <PageHeader title={t("gl.approvals.title")} description={t("gl.approvals.description")} />
      <DataTable<ApprovalItem>
        tableId="approvals"
        caption={t("gl.approvals.title")}
        columns={columns}
        queryKey={["approvals", companyId]}
        fetchPage={({ cursor, limit }, signal) => approvalsApi.inbox({ cursor, limit }, signal)}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`${DOCUMENT_PATH[row.document_type]}/${row.document_id}`)}
        empty={<EmptyState title={t("gl.approvals.empty")} />}
      />
    </div>
  );
}
