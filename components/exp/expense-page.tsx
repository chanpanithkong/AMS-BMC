"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Info, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAccountLabel, useCashBankAccounts, useHistoryLabel } from "@/components/cb/use-cash-bank";
import { EmptyState, ErrorState, FormSkeleton, PageHeader } from "@/components/feedback/states";
import { AttachmentPanel } from "@/components/files/attachments";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApprovalTimeline, HistoryPanel, SoDIndicator } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { expensesApi } from "@/lib/api/endpoints/cashbank";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { Expense } from "@/lib/api/types/cashbank";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { usePermission } from "@/lib/rbac/can";
import { AllocationEditor } from "./allocation-editor";
import { ExpenseForm } from "./expense-form";

type Dialog = "approve" | "reject" | "post" | "settle" | null;

/** SCR-21 expense page: form for drafts; review, approval, posting and settlement otherwise. */
export function ExpensePage({ id }: { id: string }) {
  const t = useTranslations();
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["expense", id], queryFn: ({ signal }) => expensesApi.get(id, signal), enabled: !isNew });
  if (isNew) return <div><PageHeader title={t("exp.newTitle")} /><ExpenseForm expense={null} /></div>;
  if (query.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("exp.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <ExpenseView expense={query.data} />;
}

function Explained({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} aria-label={reason}>{children}</span></TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function ExpenseView({ expense: e }: { expense: Expense }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const historyLabel = useHistoryLabel();
  const label = useAccountLabel();
  const company = useCurrentCompany();
  const userId = useSession((s) => s.user?.id);
  const { accounts } = useCashBankAccounts();
  const can = { create: usePermission("exp.create"), submit: usePermission("exp.submit"), approve: usePermission("exp.approve"), post: usePermission("exp.post") };
  const [dialog, setDialog] = useState<Dialog>(null);
  const [settleFrom, setSettleFrom] = useState("");
  const [settleDate, setSettleDate] = useState(todayBusinessDate());
  const mine = e.preparer_id === userId;
  const sodReason = mine ? t("workflow.sod.violation") : null;
  const editable = (e.status === "DRAFT" || e.status === "REJECTED") && can.create;
  const update = (next: Expense) => {
    queryClient.setQueryData(["expense", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const simple = useMutation({
    mutationFn: (a: "recall" | "cancel") => (a === "recall" ? expensesApi.recall(e.id) : expensesApi.cancel(e.id)),
    onSuccess: (next, a) => { update(next); toast.success(t(a === "recall" ? "exp.toast.recalled" : "exp.toast.cancelled")); },
    onError: errorToast,
  });
  const attach = useMutation({
    mutationFn: async (files: File[]) => { let last = e; for (const f of files) last = await expensesApi.addAttachment(e.id, f); return last; },
    onSuccess: update, onError: errorToast,
  });
  const detach = useMutation({ mutationFn: (attId: string) => expensesApi.removeAttachment(e.id, attId), onSuccess: update, onError: errorToast });
  const effect = {
    company: company ? (locale === "km" ? company.name_km : company.name) : undefined, date: format.date(e.date), currency: e.currency, amount: e.amount,
    accounts: [`${locale === "km" ? e.category_name_km : e.category_name} · ${t(`exp.mode.${e.payment_mode}`)}`],
  };
  const payAccounts = accounts.filter((a) => a.currency === e.currency);
  const note = (text: ReactNode, tone: "info" | "danger" = "info", testId?: string) => (
    <p className={`mt-2 flex items-start gap-2 rounded-lg border p-3 text-sm ${tone === "danger" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-info/30 bg-info/5"}`} role="status" data-testid={testId}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{text}</span>
    </p>
  );

  return (
    <div className="space-y-4" data-testid="expense-page" data-status={e.status}>
      <div>
        <PageHeader
          title={e.number ? t("exp.titleNo", { number: e.number }) : t("exp.draftTitle")}
          badge={<StatusBadge status={e.status} />}
          description={`${e.description} · ${t("gl.journal.fields.preparer")}: ${e.preparer_name}`}
          actions={
            <>
              {editable && <Button size="sm" variant="ghost" onClick={() => simple.mutate("cancel")} disabled={simple.isPending}><Ban aria-hidden />{t("exp.actions.cancel")}</Button>}
              {e.status === "SUBMITTED" && mine && can.submit && <Button size="sm" variant="outline" onClick={() => simple.mutate("recall")} disabled={simple.isPending}><Undo2 aria-hidden />{t("exp.actions.recall")}</Button>}
              {e.status === "SUBMITTED" && can.approve && (
                <>
                  <Explained reason={sodReason}><Button size="sm" variant="destructive" disabled={Boolean(sodReason)} onClick={() => setDialog("reject")}><XCircle aria-hidden />{t("exp.actions.reject")}</Button></Explained>
                  <Explained reason={sodReason}><Button size="sm" disabled={Boolean(sodReason)} onClick={() => setDialog("approve")} data-testid="expense-approve">{t("exp.actions.approve")}</Button></Explained>
                </>
              )}
              {e.status === "APPROVED" && can.post && (
                <Explained reason={sodReason}><Button size="sm" disabled={Boolean(sodReason)} onClick={() => setDialog("post")} data-testid="expense-post">{t("exp.actions.post")}</Button></Explained>
              )}
              {e.status === "POSTED" && e.payment_mode !== "PAID" && !e.settlement && can.post && (
                <Button size="sm" onClick={() => setDialog("settle")} data-testid="expense-settle">{t("exp.actions.settle")}</Button>
              )}
            </>
          }
        />
        {e.status === "SUBMITTED" && note(t("exp.banner.submitted"))}
        {e.status === "APPROVED" && note(t("exp.banner.approved"))}
        {e.status === "REJECTED" && e.rejection_comment && note(t("exp.banner.rejected", { comment: e.rejection_comment }), "danger", "expense-rejected")}
        {e.status === "CANCELLED" && note(t("exp.banner.cancelled"))}
        {e.status === "POSTED" && note(<>{t("exp.banner.posted", { number: e.number ?? "", journal: e.journal_no ?? "" })} {e.journal_id && <AppLink href={`/accounting/journals/${e.journal_id}`} className="underline">{e.journal_no}</AppLink>}</>, "info", "expense-posted")}
        {e.status === "POSTED" && e.payment_mode !== "PAID" && (e.settlement
          ? note(<AppLink href={`/cash-bank/transactions/${e.settlement.transaction_id}`} className="underline">{t("exp.banner.settled", { number: e.settlement.number, date: format.date(e.settlement.date) })}</AppLink>, "info", "expense-settled")
          : note(t("exp.banner.unpaid")))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {editable ? (
            <ExpenseForm key={e.id} expense={e} onSaved={update} />
          ) : (
            <>
              <dl className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
                {[
                  [t("exp.form.date"), format.date(e.date)], [t("exp.form.category"), locale === "km" ? e.category_name_km : e.category_name],
                  [t("exp.form.payee"), e.payee || "—"], [t("exp.form.amount"), format.amount(e.amount, e.currency, { withCode: true })],
                  [t("exp.form.mode"), t(`exp.mode.${e.payment_mode}`)], ...(e.paid_from_id ? [[t("exp.form.paidFrom"), label(accounts.find((a) => a.id === e.paid_from_id)) || e.paid_from_id]] : []),
                ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              </dl>
              <AllocationEditor mode={e.allocation_mode} onModeChange={() => undefined} allocations={e.allocations} onChange={() => undefined} amount={e.amount} currency={e.currency} readOnly />
            </>
          )}
        </div>
        <aside className="space-y-4">
          {e.status === "SUBMITTED" && can.approve && <SoDIndicator preparerId={e.preparer_id} preparerName={e.preparer_name} />}
          {e.approval_steps.length > 0 && <div className="rounded-xl border bg-card p-4"><ApprovalTimeline steps={e.approval_steps} /></div>}
          <div className="rounded-xl border bg-card p-4">
            <AttachmentPanel attachments={e.attachments} readOnly={e.status === "POSTED" || e.status === "CANCELLED" || !can.create} onUpload={(files) => attach.mutate(files)} onRemove={(a) => detach.mutate(a.id)} />
          </div>
          <div className="rounded-xl border bg-card p-4"><HistoryPanel events={e.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
        </aside>
      </div>

      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("exp.approveDialog.title")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const next = await expensesApi.decide(e.id, "approve", "", idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("exp.rejectDialog.title")} description={t("exp.rejectDialog.description")} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await expensesApi.decide(e.id, "reject", reason, idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "post"} onOpenChange={(o) => !o && setDialog(null)} action="post" title={t("exp.post.title")} description={t("exp.post.description")} effect={effect} thresholdAmount={e.amount}
        onConfirm={async ({ idempotencyKey }) => { const next = await expensesApi.post(e.id, idempotencyKey); update(next); return next.number ?? undefined; }} />
      <ConfirmActionDialog open={dialog === "settle"} onOpenChange={(o) => !o && setDialog(null)} action="release" title={t("exp.settle.title", { number: e.number ?? "" })} description={t("exp.settle.description")} effect={effect} showAmountInWords thresholdAmount={e.amount} canConfirm={Boolean(settleFrom && settleDate)}
        onConfirm={async ({ idempotencyKey }) => { const next = await expensesApi.settle(e.id, settleFrom, settleDate, idempotencyKey); update(next); return next.settlement?.number; }}>
        <div className="grid gap-3 sm:grid-cols-2" data-testid="settle-form">
          <FormField id="settle-from" label={t("exp.settle.account")} required>
            <NativeSelect id="settle-from" value={settleFrom} onChange={(ev) => setSettleFrom(ev.target.value)}>
              <option value="">{t("exp.form.select")}</option>
              {payAccounts.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="settle-date" label={t("exp.settle.date")} required>
            <DateInput id="settle-date" value={settleDate} onValueChange={setSettleDate} />
          </FormField>
        </div>
      </ConfirmActionDialog>
    </div>
  );
}
