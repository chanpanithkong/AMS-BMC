"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FileMinus, Info, Printer, Undo2, Wallet, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useHistoryLabel } from "@/components/cb/use-cash-bank";
import { EmptyState, ErrorState, FormSkeleton, PageHeader } from "@/components/feedback/states";
import { AttachmentPanel } from "@/components/files/attachments";
import { useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { TotalsPanel } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApprovalTimeline, HistoryPanel, SoDIndicator } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { customerInvoicesApi, customersApi, supplierInvoicesApi } from "@/lib/api/endpoints/arap";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { Invoice } from "@/lib/api/types/arap";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { D } from "@/lib/money/decimal";
import { usePermission } from "@/lib/rbac/can";
import type { Permission } from "@/lib/rbac/permissions";
import { useUiStore } from "@/lib/stores/ui";
import { CreditPanel, InvoiceForm } from "./invoice-form";
import { InvoiceDocument, InvoiceLinesEditor, SIDE, useNameOf, useTaxCodes, type DocKind } from "./shared";

type Dialog = "approve" | "reject" | "post" | "cancel" | null;

export function InvoicePage({ kind, id }: { kind: DocKind; id: string }) {
  const t = useTranslations();
  const isNew = id === "new";
  const apiOf = kind === "AR" ? customerInvoicesApi : supplierInvoicesApi;
  const query = useQuery({ queryKey: ["invoice", kind, id], queryFn: ({ signal }) => apiOf.get(id, signal), enabled: !isNew });
  if (isNew) return <div><PageHeader title={t(`${SIDE[kind].ns}.newInvoice`)} /><InvoiceForm kind={kind} invoice={null} /></div>;
  if (query.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("arap.invoices.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <InvoiceView kind={kind} invoice={query.data} />;
}

export function Explained({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} aria-label={reason}>{children}</span></TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export function Note({ children, tone = "info", testId }: { children: ReactNode; tone?: "info" | "danger" | "warning"; testId?: string }) {
  const styles = { info: "border-info/30 bg-info/5", danger: "border-destructive/30 bg-destructive/5 text-destructive", warning: "border-warning/40 bg-warning/10" };
  return (
    <p className={`mt-2 flex items-start gap-2 rounded-lg border p-3 text-sm ${styles[tone]}`} role="status" data-testid={testId} data-print="hide">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{children}</span>
    </p>
  );
}

function InvoiceView({ kind, invoice: inv }: { kind: DocKind; invoice: Invoice }) {
  const t = useTranslations();
  const side = SIDE[kind];
  const locale = useAppLocale();
  const format = useFormatters();
  const nameOf = useNameOf();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const historyLabel = useHistoryLabel();
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const userId = useSession((s) => s.user?.id);
  const { data: codes } = useTaxCodes(kind);
  const apiOf = kind === "AR" ? customerInvoicesApi : supplierInvoicesApi;
  const can = {
    edit: usePermission(`${side.perm}.edit` as Permission), submit: usePermission(`${side.perm}.submit` as Permission),
    approve: usePermission(`${side.perm}.approve` as Permission), post: usePermission(`${side.perm}.post` as Permission),
    credit: usePermission("ar.credit_note.create"), receipt: usePermission("ar.receipt.create"), pay: usePermission("ap.payment.create"),
  };
  const customer = useQuery({
    queryKey: ["party", "AR", inv.party_id, companyId], queryFn: ({ signal }) => customersApi.get(inv.party_id, signal),
    enabled: kind === "AR" && inv.status === "SUBMITTED",
  });
  const [dialog, setDialog] = useState<Dialog>(null);
  const mine = inv.preparer_id === userId;
  const sodReason = mine ? t("workflow.sod.violation") : null;
  const editable = (inv.status === "DRAFT" || inv.status === "REJECTED") && can.edit;
  const update = (next: Invoice) => {
    queryClient.setQueryData(["invoice", kind, next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["invoices", kind] });
    void queryClient.invalidateQueries({ queryKey: ["parties", kind] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const recall = useMutation({ mutationFn: () => apiOf.recall(inv.id), onSuccess: (next) => { update(next); toast.success(t("arap.toast.recalled")); }, onError: errorToast });
  const attach = useMutation({
    mutationFn: async (files: File[]) => { let last = inv; for (const f of files) last = await apiOf.addAttachment(inv.id, f); return last; },
    onSuccess: update, onError: errorToast,
  });
  const detach = useMutation({ mutationFn: (attId: string) => apiOf.removeAttachment(inv.id, attId), onSuccess: update, onError: errorToast });
  const party = nameOf({ name: inv.party_name, name_km: inv.party_name_km });
  const effect = {
    company: company ? (locale === "km" ? company.name_km : company.name) : undefined, date: format.date(inv.date), currency: inv.currency, amount: inv.total,
    accounts: [kind === "AR" ? t("arap.effect.ar", { party }) : t("arap.effect.ap", { party })],
  };
  const dp = inv.currency === "KHR" ? 0 : 2;
  const open = inv.posted && D(inv.outstanding).gt(0);
  const title = inv.number ? t(`${side.ns}.titleNo`, { number: inv.number }) : t(`${side.ns}.draftTitle`);

  return (
    <div className="space-y-4" data-testid="invoice-page" data-status={inv.status}>
      <div data-print="hide">
        <PageHeader
          title={title}
          badge={<StatusBadge status={inv.status} />}
          description={`${party}${inv.supplier_invoice_no ? ` · ${t("arap.form.supplierNo")}: ${inv.supplier_invoice_no}` : ""} · ${t("gl.journal.fields.preparer")}: ${inv.preparer_name}`}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer aria-hidden />{t("arap.actions.print")}</Button>
              {["DRAFT", "REJECTED", "APPROVED"].includes(inv.status) && can.edit && (
                <Button size="sm" variant="ghost" onClick={() => setDialog("cancel")}><Ban aria-hidden />{t("arap.actions.cancel")}</Button>
              )}
              {inv.status === "SUBMITTED" && mine && can.submit && (
                <Button size="sm" variant="outline" onClick={() => recall.mutate()} disabled={recall.isPending}><Undo2 aria-hidden />{t("arap.actions.recall")}</Button>
              )}
              {inv.status === "SUBMITTED" && can.approve && (
                <>
                  <Explained reason={sodReason}><Button size="sm" variant="destructive" disabled={Boolean(sodReason)} onClick={() => setDialog("reject")}><XCircle aria-hidden />{t("arap.actions.reject")}</Button></Explained>
                  <Explained reason={sodReason}><Button size="sm" disabled={Boolean(sodReason)} onClick={() => setDialog("approve")} data-testid="invoice-approve">{t("arap.actions.approve")}</Button></Explained>
                </>
              )}
              {inv.status === "APPROVED" && can.post && <Button size="sm" onClick={() => setDialog("post")} data-testid="invoice-post">{t("arap.actions.post")}</Button>}
              {kind === "AR" && open && can.credit && (
                <Button size="sm" variant="outline" asChild data-testid="create-credit-note"><AppLink href={`/sales/credit-notes/new?invoice=${inv.id}`}><FileMinus aria-hidden />{t("arap.actions.creditNote")}</AppLink></Button>
              )}
              {open && (kind === "AR" ? can.receipt : can.pay) && (
                <Button size="sm" variant="outline" asChild><AppLink href={`${side.paymentPath}/new?party=${inv.party_id}`}><Wallet aria-hidden />{t(`${side.ns}.recordPayment`)}</AppLink></Button>
              )}
            </>
          }
        />
        {inv.status === "SUBMITTED" && <Note>{inv.credit_limit_exceeded ? t("arap.banner.creditOverride") : t("arap.banner.submitted")}</Note>}
        {inv.status === "APPROVED" && <Note>{t("arap.banner.approved")}</Note>}
        {inv.status === "REJECTED" && inv.rejection_comment && <Note tone="danger" testId="invoice-rejected">{t("arap.banner.rejected", { comment: inv.rejection_comment })}</Note>}
        {inv.status === "CANCELLED" && <Note>{t("arap.banner.cancelled")}</Note>}
        {inv.duplicate_reason && <Note tone="warning">{t("arap.banner.duplicateReason", { reason: inv.duplicate_reason })}</Note>}
        {inv.posted && (
          <Note testId="invoice-posted">
            {inv.is_opening ? t("arap.banner.opening") : t("arap.banner.posted", { number: inv.number ?? "" })}{" "}
            {inv.journal_id && <AppLink href={`/accounting/journals/${inv.journal_id}`} className="underline">{inv.journal_no}</AppLink>}
          </Note>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]" data-print="hide">
        <div className="min-w-0 space-y-4">
          {editable ? (
            <InvoiceForm key={`${inv.id}-${inv.version}`} kind={kind} invoice={inv} onSaved={update} />
          ) : (
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">{t("arap.tabs.details")}</TabsTrigger>
                <TabsTrigger value="preview" data-testid="preview-tab">{t("arap.tabs.preview")}</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4">
                <dl className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
                  {[
                    [t(`${side.ns}.party`), `${inv.party_code} · ${party}`], [t("arap.form.date"), format.date(inv.date)],
                    [t("arap.form.dueDate"), `${format.date(inv.due_date)} (${t("arap.document.terms", { days: inv.terms_days })})`],
                    [t("arap.form.currency"), inv.currency === "USD" ? "USD" : `${inv.currency} @ ${inv.rate}`],
                    [t("arap.form.reference"), inv.reference || "—"], ...(inv.received_date ? [[t("arap.form.receivedDate"), format.date(inv.received_date)]] : []),
                  ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
                </dl>
                <InvoiceLinesEditor kind={kind} lines={inv.lines} currency={inv.currency} date={inv.date} readOnly />
                <TotalsPanel
                  currency={inv.currency}
                  rows={[
                    { label: t("arap.totals.subtotal"), value: inv.subtotal },
                    { label: t("arap.totals.discount"), value: D(inv.discount).negated().toFixed(dp) },
                    { label: t("arap.totals.tax"), value: inv.tax },
                    { label: t("arap.totals.total"), value: inv.total, emphasis: true },
                    ...(inv.posted ? [{ label: t("arap.totals.outstanding"), value: inv.outstanding }] : []),
                  ]}
                  baseEquivalent={{ value: inv.total_base, currency: "USD" }}
                />
              </TabsContent>
              <TabsContent value="preview">
                <InvoiceDocument invoice={inv} kind={kind} codes={codes} />
              </TabsContent>
            </Tabs>
          )}
        </div>
        <aside className="space-y-4">
          {inv.status === "SUBMITTED" && can.approve && <SoDIndicator preparerId={inv.preparer_id} preparerName={inv.preparer_name} />}
          {kind === "AR" && customer.data && <CreditPanel party={customer.data} invoiceTotalBase={inv.total_base} />}
          {inv.approval_steps.length > 0 && <div className="rounded-xl border bg-card p-4"><ApprovalTimeline steps={inv.approval_steps} /></div>}
          {inv.settlements.length > 0 && (
            <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="settle-title" data-testid="settlements">
              <h2 id="settle-title" className="mb-2 font-semibold">{t("arap.settlements.title")}</h2>
              <ul className="space-y-1">
                {inv.settlements.map((s) => (
                  <li key={`${s.doc_id}-${s.date}-${s.amount}`} className="flex justify-between gap-2">
                    <AppLink href={s.doc_type === "CREDIT_NOTE" ? `/sales/credit-notes/${s.doc_id}` : `${side.paymentPath}/${s.doc_id}`} className="text-primary hover:underline">
                      {t(`arap.settlements.${s.doc_type}`)} {s.number}
                    </AppLink>
                    <span className="flex gap-2 text-muted-foreground"><span className="tabular-nums">{format.date(s.date)}</span><AmountText value={s.amount} currency={inv.currency} /></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="rounded-xl border bg-card p-4">
            <AttachmentPanel attachments={inv.attachments} readOnly={inv.posted || inv.status === "CANCELLED" || !can.edit} onUpload={(files) => attach.mutate(files)} onRemove={(a) => detach.mutate(a.id)} />
          </div>
          <div className="rounded-xl border bg-card p-4"><HistoryPanel events={inv.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
        </aside>
      </div>

      <div className="hidden print:block"><InvoiceDocument invoice={inv} kind={kind} codes={codes} className="border-0 p-0" /></div>

      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("arap.dialogs.approve", { title })} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const next = await apiOf.decide(inv.id, "approve", "", idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("arap.dialogs.reject", { title })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await apiOf.decide(inv.id, "reject", reason, idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "post"} onOpenChange={(o) => !o && setDialog(null)} action="post" title={t("arap.dialogs.post", { title })} effect={effect} thresholdAmount={inv.total_base}
        onConfirm={async ({ idempotencyKey }) => { const next = await apiOf.post(inv.id, idempotencyKey); update(next); return next.number ?? undefined; }} />
      <ConfirmActionDialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)} action="reject" requireReason title={t("arap.dialogs.cancel", { title })} description={t("arap.dialogs.cancelDescription")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason }) => { const next = await apiOf.cancel(inv.id, reason); update(next); return t(`status.${next.status}`); }} />
    </div>
  );
}
