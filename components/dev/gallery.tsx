"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useState, type ReactNode } from "react";
import { DataTable } from "@/components/data/data-table";
import { ExportMenu, FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, PageHeader } from "@/components/feedback/states";
import { AttachmentPanel } from "@/components/files/attachments";
import { AccountPicker } from "@/components/finance/account-picker";
import { AllocationGrid } from "@/components/finance/allocation-grid";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { DateRangePicker, type DateRange } from "@/components/finance/date-range-picker";
import { JournalLineGrid } from "@/components/finance/journal-line-grid";
import { CurrencySelect, DimensionPicker, PeriodPicker, RateInput } from "@/components/finance/pickers";
import { ReportHeader, TotalsPanel } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { ApprovalTimeline, HistoryPanel, SoDIndicator, UnsavedChangesGuard } from "@/components/workflow/approval";
import { ConfirmActionDialog, type CriticalAction } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { accountsApi } from "@/lib/api/endpoints/accounts";
import { ApiError } from "@/lib/api/errors";
import { useDepartments } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import type { AnyStatus, Attachment } from "@/lib/api/types/common";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { useAppLocale } from "@/lib/i18n/navigation";
import type { Allocations, OpenInvoice } from "@/lib/money/allocation";
import { emptyJournalLine, type JournalLineDraft } from "@/lib/money/journal";
import { amountInWords } from "@/lib/money/words";

// Developer page: a living catalogue of the reusable components with demo data.
// Its headings are English only on purpose; it is not part of the product UI.

const STATUSES: AnyStatus[] = [
  "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "POSTED", "REVERSED", "CANCELLED", "OPEN", "PARTIALLY_PAID", "PAID",
  "OVERDUE", "CREDITED", "IN_PROGRESS", "COMPLETED", "SOFT_CLOSED", "CLOSED", "REOPENED", "VERIFIED", "UNVERIFIED",
];

const INVOICES: OpenInvoice[] = [
  { id: "i1", number: "INV-2027-000125", date: "2027-02-10", due_date: "2027-03-12", currency: "USD", outstanding: "300.00" },
  { id: "i2", number: "INV-2027-000131", date: "2027-03-02", due_date: "2027-04-01", currency: "USD", outstanding: "500.00" },
  { id: "i3", number: "INV-2027-000140", date: "2027-03-20", due_date: "2027-04-19", currency: "USD", outstanding: "1250.00" },
];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border bg-card p-4" data-testid={`gallery-${title.toLowerCase().replace(/\W+/g, "-")}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}

export function ComponentGallery() {
  const locale = useAppLocale();
  const company = useCurrentCompany();
  const user = useSession((s) => s.user);
  const base = company?.base_currency ?? "USD";
  const { data: departments } = useDepartments();

  const [usd, setUsd] = useState("1250.50");
  const [khr, setKhr] = useState("4100000");
  const [account, setAccount] = useState<string | null>(null);
  const [currency, setCurrency] = useState("KHR");
  const [rate, setRate] = useState("0.00024390");
  const [department, setDepartment] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | null>("per-2027-04");
  const [range, setRange] = useState<DateRange>({ from: "2027-04-01", to: "2027-04-30" });
  const [lines, setLines] = useState<JournalLineDraft[]>(() => [
    emptyJournalLine("USD", { key: "demo-1", account_id: "acc-6200", description: "Accrued electricity March 2027", debit: "250.00" }),
    emptyJournalLine("USD", { key: "demo-2", account_id: "acc-2150", description: "Accrued electricity March 2027", credit: "249.00" }),
  ]);
  const [receipt, setReceipt] = useState("800.00");
  const [allocations, setAllocations] = useState<Allocations>({});
  const [dialog, setDialog] = useState<CriticalAction | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dirty, setDirty] = useState(false);
  const { filters, setFilters, clear, active } = useUrlFilters(["search", "type", "sort"] as const);

  const columns: ColumnDef<Account, unknown>[] = [
    { id: "code", header: "Code", accessorKey: "code", meta: { sortKey: "code" } },
    { id: "name", header: "Name", cell: ({ row }) => (locale === "km" ? row.original.name_km : row.original.name) },
    { id: "type", header: "Type", accessorKey: "type" },
    { id: "normal", header: "Normal balance", accessorKey: "normal_balance" },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.is_active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  // Demo action: fails once with a network error (same key is reused on retry), then succeeds.
  const confirmDemo = async ({ idempotencyKey }: { idempotencyKey: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    setAttempts((n) => n + 1);
    if (dialog === "release" && attempts === 0) throw new ApiError({ status: 0, code: "NETWORK_ERROR" });
    return dialog === "post" ? "JV-2027-000312" : dialog === "release" ? `PV-2027-000087 · key ${idempotencyKey.slice(0, 8)}` : undefined;
  };

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Component gallery" description="Reusable finance, data, workflow and file components (developer page)." />
      <UnsavedChangesGuard dirty={dirty} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Amounts" note="Decimal strings only. USD has 2 decimals, KHR has 0. Try pasting “$1,250.00” or “(300)”.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="AmountInput (USD)"><AmountInput value={usd} onValueChange={setUsd} currency="USD" aria-label="USD amount" /></Label>
            <Label text="AmountInput (KHR)"><AmountInput value={khr} onValueChange={setKhr} currency="KHR" aria-label="KHR amount" /></Label>
            <Label text="AmountText"><AmountText value={usd} currency="USD" withCode /></Label>
            <Label text="Negative (user preference)"><AmountText value="-1250" currency="USD" withCode /></Label>
            <div className="sm:col-span-2">
              <Label text="Amount in words"><p className="text-sm" data-testid="words">{amountInWords(usd, "USD", locale)}</p></Label>
            </div>
          </div>
        </Section>

        <Section title="Pickers" note="Header accounts never appear; sensitive accounts are hidden for roles without access.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="AccountPicker"><AccountPicker value={account} onChange={setAccount} aria-label="Account" /></Label>
            <Label text="CurrencySelect"><CurrencySelect value={currency} onChange={setCurrency} /></Label>
            <Label text="RateInput (illustrative rate)"><RateInput id="demo-rate" value={rate} onChange={setRate} currency={currency} baseCurrency={base} /></Label>
            <Label text="DimensionPicker"><DimensionPicker label="Department" options={departments ?? []} value={department} onChange={setDepartment} /></Label>
            <Label text="PeriodPicker"><PeriodPicker value={period} onChange={setPeriod} /></Label>
            <div className="sm:col-span-2"><DateRangePicker value={range} onChange={setRange} idPrefix="demo-range" /></div>
          </div>
        </Section>
      </div>

      <Section title="JournalLineGrid" note="Starts unbalanced by 1.00. Enter: next row · Ctrl+Enter: add line · Ctrl+Delete: remove line.">
        <JournalLineGrid lines={lines} onChange={(next) => { setLines(next); setDirty(true); }} showIssues />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="AllocationGrid" note="Auto-allocate takes the oldest invoice first and never exceeds an invoice or the receipt.">
          <div className="mb-3 max-w-40">
            <Label text="Receipt amount (USD)"><AmountInput value={receipt} onValueChange={setReceipt} currency="USD" aria-label="Receipt amount" /></Label>
          </div>
          <AllocationGrid invoices={INVOICES} amount={receipt || "0"} currency="USD" allocations={allocations} onChange={setAllocations} />
        </Section>

        <div className="min-w-0 space-y-4">
          <Section title="TotalsPanel">
            <TotalsPanel
              currency="KHR"
              rows={[
                { label: "Subtotal", value: "4100000" }, { label: "Tax", value: "410000" },
                { label: "Total", value: "4510000", emphasis: true },
              ]}
              baseEquivalent={{ value: "1100.00", currency: "USD" }}
              preview
            />
          </Section>
          <Section title="Status badges" note="Always text plus icon plus colour.">
            <div className="flex flex-wrap gap-1.5">{STATUSES.map((s) => <StatusBadge key={s} status={s} />)}</div>
          </Section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Critical actions" note="Post asks for “I confirm” above the threshold. Release fails once (network) and reuses its key on retry. Reverse needs a reason.">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { setAttempts(0); setDialog("post"); }} data-testid="demo-post">Post journal</Button>
            <Button size="sm" variant="outline" onClick={() => { setAttempts(0); setDialog("release"); }} data-testid="demo-release">Release payment</Button>
            <Button size="sm" variant="destructive" onClick={() => setDialog("reverse")} data-testid="demo-reverse">Reverse</Button>
          </div>
          {dialog && (
            <ConfirmActionDialog
              open
              onOpenChange={(open) => !open && setDialog(null)}
              action={dialog}
              effect={
                dialog === "release"
                  ? { company: company?.name, date: "05/04/2027", currency: "USD", amount: "1250.50", accounts: ["2100 Accounts payable – trade", "1110 Bank – current account USD"] }
                  : { company: company?.name, period: "March 2027", date: "31/03/2027", currency: base, debitTotal: "12500.00", creditTotal: "12500.00", accounts: ["6200 Utilities expense", "2150 Accrued liabilities"] }
              }
              showAmountInWords={dialog === "release"}
              onConfirm={confirmDemo}
            />
          )}
        </Section>
        <Section title="Approval">
          <div className="space-y-3">
            <SoDIndicator preparerId="usr-acct" preparerName="Ly Sreymom" />
            <SoDIndicator preparerId={user?.id ?? ""} preparerName={user?.full_name ?? ""} />
            <ApprovalTimeline
              steps={[
                { step: 1, role: "DEPTMGR", approver_name: "Pich Samnang", status: "APPROVED", acted_at: "2027-04-02T03:15:22Z", comment: "Within budget" },
                { step: 2, role: "FINMGR", status: "PENDING" },
              ]}
            />
          </div>
        </Section>
        <Section title="History and attachments">
          <div className="space-y-4">
            <HistoryPanel
              events={[
                { id: "h1", at: "2027-04-01T02:10:00Z", user_name: "Ly Sreymom", action: "Created draft" },
                { id: "h2", at: "2027-04-01T02:25:00Z", user_name: "Ly Sreymom", action: "Submitted for approval" },
              ]}
            />
            <AttachmentPanel
              attachments={files}
              onUpload={(added) =>
                setFiles((current) => [
                  ...current,
                  ...added.map((f, i) => ({
                    id: `${Date.now()}-${i}`, file_name: f.name, content_type: f.type, size: f.size,
                    uploaded_at: new Date().toISOString(), uploaded_by: user?.full_name ?? "", url: URL.createObjectURL(f),
                  })),
                ])
              }
              onRemove={(file) => setFiles((current) => current.filter((f) => f.id !== file.id))}
            />
          </div>
        </Section>
      </div>

      <Section title="DataTable, FilterBar, StatusTabs, ExportMenu" note="Server-side cursor pagination and sorting; filters live in the URL; column choice is remembered per user.">
        <ReportHeader reportName="Chart of Accounts (demo list)" period="As of 05/04/2027" />
        <StatusTabs
          label="Account type"
          value={filters.type}
          onChange={(type) => setFilters({ type })}
          tabs={[{ value: "", label: "All" }, { value: "ASSET", label: "Assets" }, { value: "LIABILITY", label: "Liabilities" }, { value: "EXPENSE", label: "Expenses" }]}
        />
        <FilterBar
          search={filters.search}
          onSearch={(search) => setFilters({ search })}
          onClear={clear}
          canClear={active}
          actions={<ExportMenu onExport={() => undefined} />}
        />
        <DataTable<Account>
          tableId="gallery-accounts"
          caption="Accounts"
          columns={columns}
          queryKey={["gallery-accounts", company?.id, filters.search, filters.type]}
          fetchPage={({ cursor, limit, sort }, signal) =>
            accountsApi.list({ cursor, limit, sort, search: filters.search || undefined, type: (filters.type || undefined) as Account["type"] | undefined }, signal)
          }
          getRowId={(row) => row.id}
          sort={filters.sort}
          onSortChange={(sort) => setFilters({ sort })}
          pageSize={10}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="EmptyState">
          <EmptyState description="Import a chart or create your first account" action={<Button size="sm">Create account</Button>} />
        </Section>
        <Section title="ErrorState (with correlation ID)">
          <ErrorState error={new ApiError({ status: 500, code: "INTERNAL_ERROR", correlationId: "4f0d9a7e-5f8c-4c62-9a8e-1f6b2a3c4d5e" })} onRetry={() => undefined} />
        </Section>
      </div>
    </div>
  );
}
