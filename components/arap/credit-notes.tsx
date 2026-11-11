"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Ban, Loader2, Save, Send, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useHistoryLabel } from "@/components/cb/use-cash-bank";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, FormSkeleton, PageHeader } from "@/components/feedback/states";
import { FormField, useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { TotalsPanel } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalTimeline, HistoryPanel, SoDIndicator, UnsavedChangesGuard } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { creditNotesApi, customerInvoicesApi } from "@/lib/api/endpoints/arap";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { CreditNote, Invoice, InvoiceLine } from "@/lib/api/types/arap";
import { useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { Explained, Note } from "./invoice-page";
import { InvoiceLinesEditor, useDocumentAmounts, useTaxCodes } from "./shared";

const TABS = ["", "DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED"] as const;

export function CreditNoteListPage() {
  const t = useTranslations();
  const router = useAppRouter();
  const format = useFormatters();
  const companyId = useUiStore((s) => s.companyId);
  const { filters, setFilters, clear } = useUrlFilters(["status", "search"] as const);
  const columns: ColumnDef<CreditNote, unknown>[] = [
    { id: "number", header: t("arap.invoices.col.number"), cell: ({ row }) => <AppLink href={`/sales/credit-notes/${row.original.id}`} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.number ?? t("arap.invoices.draftNo")}</AppLink> },
    { id: "date", header: t("arap.invoices.col.date"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.date)}</span> },
    { id: "invoice", header: t("arap.credit.invoice"), cell: ({ row }) => <AppLink href={`/sales/invoices/${row.original.invoice_id}`} className="whitespace-nowrap hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.invoice_number}</AppLink> },
    { id: "party", header: t("arap.ar.party"), cell: ({ row }) => row.original.party_name },
    { id: "reason", header: t("arap.credit.reason"), cell: ({ row }) => <span className="line-clamp-2 min-w-40">{row.original.reason}</span> },
    { id: "total", header: t("arap.invoices.col.total"), meta: { align: "right", label: t("arap.invoices.col.total") }, cell: ({ row }) => <AmountText value={row.original.total} currency={row.original.currency} withCode /> },
    { id: "status", header: t("arap.invoices.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];
  return (
    <div className="min-w-0">
      <PageHeader title={t("arap.credit.listTitle")} description={t("arap.credit.listDescription")} />
      <StatusTabs label={t("arap.invoices.tabsLabel")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={TABS.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("arap.invoices.searchPlaceholder")} onClear={() => clear()} canClear={Boolean(filters.search)} />
      <DataTable<CreditNote>
        tableId="credit-notes" caption={t("arap.credit.listTitle")} columns={columns}
        queryKey={["credit-notes", companyId, filters.status, filters.search]}
        fetchPage={({ cursor, limit }, signal) => creditNotesApi.list({ cursor, limit, status: filters.status || undefined, search: filters.search || undefined }, signal)}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/sales/credit-notes/${row.id}`)}
        empty={<EmptyState title={t("arap.credit.empty")} description={t("arap.credit.emptyHint")} />}
      />
    </div>
  );
}

export function CreditNotePage({ id }: { id: string }) {
  const t = useTranslations();
  const isNew = id === "new";
  const [invoiceId] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invoice") ?? "" : ""));
  const query = useQuery({ queryKey: ["credit-note", id], queryFn: ({ signal }) => creditNotesApi.get(id, signal), enabled: !isNew });
  const invoice = useQuery({
    queryKey: ["invoice", "AR", isNew ? invoiceId : query.data?.invoice_id],
    queryFn: ({ signal }) => customerInvoicesApi.get(isNew ? invoiceId : query.data!.invoice_id, signal),
    enabled: isNew ? Boolean(invoiceId) : Boolean(query.data),
  });
  if (isNew && !invoiceId) return <EmptyState title={t("arap.credit.pickInvoice")} action={<Button size="sm" asChild><AppLink href="/sales/invoices?status=OPEN">{t("arap.ar.invoicesTitle")}</AppLink></Button>} />;
  if ((!isNew && query.isPending) || invoice.isPending) return <FormSkeleton fields={6} />;
  if (query.isError) return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("arap.credit.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (invoice.isError) return <ErrorState error={invoice.error} onRetry={() => invoice.refetch()} />;
  if (isNew) return <div><PageHeader title={t("arap.credit.newTitle", { number: invoice.data.number ?? "" })} /><CreditNoteForm invoice={invoice.data} note={null} /></div>;
  return <CreditNoteView note={query.data!} invoice={invoice.data} />;
}

function CreditNoteForm({ invoice, note, onSaved }: { invoice: Invoice; note: CreditNote | null; onSaved?: (c: CreditNote) => void }) {
  const t = useTranslations();
  const router = useAppRouter();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const canSubmit = usePermission("ar.credit_note.submit");
  const format = useFormatters();
  const { data: codes } = useTaxCodes("AR");
  const [date, setDate] = useState(note?.date ?? todayBusinessDate());
  const [reason, setReason] = useState(note?.reason ?? "");
  const [lines, setLines] = useState<InvoiceLine[]>(() => note?.lines ?? invoice.lines.map((l) => ({ ...l, id: undefined, account_id: "acc-4900", quantity: l.quantity, discount: "" })));
  const [dirty, setDirty] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const saved = useRef(note ? { id: note.id, version: note.version } : null);
  const { totals } = useDocumentAmounts(lines, codes, invoice.date, invoice.currency);
  const over = totals.total.gt(invoice.outstanding);
  const dp = invoice.currency === "KHR" ? 0 : 2;
  const mutation = useMutation({
    mutationFn: async (mode: "save" | "submit") => {
      setFailure(null);
      const input = { date, reason, lines };
      let result = saved.current ? await creditNotesApi.update(saved.current.id, input, saved.current.version) : await creditNotesApi.create({ invoice_id: invoice.id, ...input });
      saved.current = { id: result.id, version: result.version };
      setDirty(false);
      if (mode === "submit") result = await creditNotesApi.submit(result.id);
      return { result, mode };
    },
    onSuccess: ({ result, mode }) => {
      queryClient.setQueryData(["credit-note", result.id], result);
      void queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success(mode === "save" ? t("arap.toast.saved") : t("arap.toast.submitted"));
      if (!note) {
        // Next keeps the /new page alive in the background: start it blank for the next visit.
        saved.current = null;
        setReason("");
        router.replace(`/sales/credit-notes/${result.id}`);
      }
      else onSaved?.(result);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
      const detail = isApiError(error) ? error.details[0] : undefined;
      setFailure(isApiError(error) && error.code === "VALIDATION_ERROR" && detail?.message ? detail.message : describe(error).message);
    },
  });
  return (
    <div className="space-y-4" data-testid="credit-note-form">
      <UnsavedChangesGuard dirty={dirty && !mutation.isPending} />
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="text-sm"><p className="text-xs text-muted-foreground">{t("arap.credit.invoice")}</p><p className="font-medium">{invoice.number} · {invoice.party_name}</p><p className="text-xs">{t("arap.credit.outstanding", { amount: format.amount(invoice.outstanding, invoice.currency, { withCode: true }) })}</p></div>
        <FormField id="cn-date" label={t("arap.form.date")} required><DateInput id="cn-date" value={date} onValueChange={(v) => { setDate(v); setDirty(true); }} /></FormField>
        <FormField id="cn-reason" label={t("arap.credit.reason")} required><Textarea id="cn-reason" rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setDirty(true); }} /></FormField>
      </section>
      <p className="text-sm text-muted-foreground">{t("arap.credit.linesHint")}</p>
      <InvoiceLinesEditor kind="AR" lines={lines} onChange={(l) => { setLines(l); setDirty(true); }} currency={invoice.currency} date={invoice.date} idPrefix="cn-line" />
      <TotalsPanel currency={invoice.currency} preview rows={[
        { label: t("arap.totals.subtotal"), value: totals.net.toFixed(dp) }, { label: t("arap.totals.tax"), value: totals.tax.toFixed(dp) },
        { label: t("arap.credit.total"), value: totals.total.toFixed(dp), emphasis: true },
      ]} />
      {over && <p className="flex items-center gap-2 text-sm text-destructive" role="alert"><AlertTriangle className="size-4" aria-hidden />{t("arap.credit.over")}</p>}
      {failure && <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="credit-error"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{failure}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => mutation.mutate("save")} disabled={mutation.isPending}>{mutation.isPending && mutation.variables === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{t("arap.actions.saveDraft")}</Button>
        {canSubmit && <Button onClick={() => mutation.mutate("submit")} disabled={mutation.isPending || over || !reason.trim()} data-testid="credit-submit">{mutation.isPending && mutation.variables === "submit" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}{t("arap.actions.submit")}</Button>}
      </div>
    </div>
  );
}

function CreditNoteView({ note: c, invoice }: { note: CreditNote; invoice: Invoice }) {
  const t = useTranslations();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const historyLabel = useHistoryLabel();
  const userId = useSession((s) => s.user?.id);
  const canApprove = usePermission("ar.credit_note.approve");
  const canPost = usePermission("ar.credit_note.post");
  const canEdit = usePermission("ar.credit_note.create");
  const [dialog, setDialog] = useState<"approve" | "reject" | "post" | null>(null);
  const update = (next: CreditNote) => {
    queryClient.setQueryData(["credit-note", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice", "AR", next.invoice_id] });
    void queryClient.invalidateQueries({ queryKey: ["invoices", "AR"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const cancel = useMutation({ mutationFn: () => creditNotesApi.cancel(c.id), onSuccess: update });
  const sodReason = c.preparer_id === userId ? t("workflow.sod.violation") : null;
  const title = c.number ? t("arap.credit.titleNo", { number: c.number }) : t("arap.credit.draftTitle");
  const effect = { date: format.date(c.date), currency: c.currency, amount: c.total, accounts: [t("arap.credit.effect", { invoice: c.invoice_number })] };
  const dp = c.currency === "KHR" ? 0 : 2;
  return (
    <div className="space-y-4" data-testid="credit-note-page" data-status={c.status}>
      <PageHeader title={title} badge={<StatusBadge status={c.status} />} description={`${c.party_name} · ${t("arap.credit.invoice")}: ${c.invoice_number} · ${t("gl.journal.fields.preparer")}: ${c.preparer_name}`}
        actions={<>
          {["DRAFT", "REJECTED", "APPROVED"].includes(c.status) && canEdit && <Button size="sm" variant="ghost" onClick={() => cancel.mutate()}><Ban aria-hidden />{t("arap.actions.cancel")}</Button>}
          {c.status === "SUBMITTED" && canApprove && <>
            <Explained reason={sodReason}><Button size="sm" variant="destructive" disabled={Boolean(sodReason)} onClick={() => setDialog("reject")}><XCircle aria-hidden />{t("arap.actions.reject")}</Button></Explained>
            <Explained reason={sodReason}><Button size="sm" disabled={Boolean(sodReason)} onClick={() => setDialog("approve")} data-testid="credit-approve">{t("arap.actions.approve")}</Button></Explained>
          </>}
          {c.status === "APPROVED" && canPost && <Button size="sm" onClick={() => setDialog("post")} data-testid="credit-post">{t("arap.actions.post")}</Button>}
        </>}
      />
      {c.status === "SUBMITTED" && <Note>{t("arap.banner.creditSubmitted")}</Note>}
      {c.status === "REJECTED" && c.rejection_comment && <Note tone="danger">{t("arap.banner.rejected", { comment: c.rejection_comment })}</Note>}
      {c.status === "POSTED" && <Note testId="credit-posted">{t("arap.banner.creditPosted", { number: c.number ?? "", invoice: c.invoice_number })} {c.journal_id && <AppLink href={`/accounting/journals/${c.journal_id}`} className="underline">{c.journal_no}</AppLink>}</Note>}
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {(c.status === "DRAFT" || c.status === "REJECTED") && canEdit ? <CreditNoteForm key={c.version} invoice={invoice} note={c} onSaved={update} /> : (
            <>
              <p className="rounded-xl border bg-card p-4 text-sm"><span className="text-muted-foreground">{t("arap.credit.reason")}: </span>{c.reason}</p>
              <InvoiceLinesEditor kind="AR" lines={c.lines} currency={c.currency} date={invoice.date} readOnly />
              <TotalsPanel currency={c.currency} rows={[{ label: t("arap.totals.subtotal"), value: D(c.subtotal).toFixed(dp) }, { label: t("arap.totals.tax"), value: c.tax }, { label: t("arap.credit.total"), value: c.total, emphasis: true }]} />
            </>
          )}
        </div>
        <aside className="space-y-4">
          {c.status === "SUBMITTED" && canApprove && <SoDIndicator preparerId={c.preparer_id} preparerName={c.preparer_name} />}
          {c.approval_steps.length > 0 && <div className="rounded-xl border bg-card p-4"><ApprovalTimeline steps={c.approval_steps} /></div>}
          <div className="rounded-xl border bg-card p-4"><HistoryPanel events={c.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
        </aside>
      </div>
      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("arap.dialogs.approve", { title })} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const next = await creditNotesApi.decide(c.id, "approve", "", idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("arap.dialogs.reject", { title })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await creditNotesApi.decide(c.id, "reject", reason, idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "post"} onOpenChange={(o) => !o && setDialog(null)} action="post" title={t("arap.dialogs.post", { title })} effect={effect} thresholdAmount={c.total}
        onConfirm={async ({ idempotencyKey }) => { const next = await creditNotesApi.post(c.id, idempotencyKey); update(next); return next.number ?? undefined; }} />
    </div>
  );
}
