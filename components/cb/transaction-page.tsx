"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Info, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, FormSkeleton, PageHeader } from "@/components/feedback/states";
import { useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { HistoryPanel } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { CashTransaction, CashTransactionType } from "@/lib/api/types/cashbank";
import { useCurrentCompany } from "@/lib/auth/session";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { amountInWords } from "@/lib/money/words";
import { usePermission } from "@/lib/rbac/can";
import { CASH_TYPES } from "./transactions-page";
import { CashTransactionForm } from "./transaction-form";
import { useAccountLabel, useCashBankAccounts, useHistoryLabel } from "./use-cash-bank";

/** SCR-27 transaction page: form for drafts, read-only view with posting and the voucher otherwise. */
export function CashTransactionPage({ id }: { id: string }) {
  const t = useTranslations();
  const params = useSearchParams();
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["cash-transaction", id], queryFn: ({ signal }) => cashBankApi.transaction(id, signal), enabled: !isNew });

  if (isNew) {
    const type = (CASH_TYPES as string[]).includes(params.get("type") ?? "") ? (params.get("type") as CashTransactionType) : "PAYMENT";
    return (
      <div>
        <PageHeader title={t("cb.tx.newTitle", { type: t(`cb.type.${type}`) })} />
        <CashTransactionForm key={type} transaction={null} type={type} accountId={params.get("account")} />
      </div>
    );
  }
  if (query.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND"
      ? <EmptyState title={t("cb.tx.notFound")} />
      : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <TransactionView transaction={query.data} />;
}

function TransactionView({ transaction: tx }: { transaction: CashTransaction }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const historyLabel = useHistoryLabel();
  const label = useAccountLabel();
  const company = useCurrentCompany();
  const { accounts } = useCashBankAccounts();
  const canCreate = usePermission("cb.cash.create");
  const canPost = usePermission("cb.cash.post");
  const [posting, setPosting] = useState(false);
  const from = accounts.find((a) => a.id === tx.account_id);
  const to = accounts.find((a) => a.id === tx.to_account_id);
  const typeName = t(`cb.type.${tx.type}`);
  const editable = tx.status === "DRAFT" && canCreate;

  const update = (next: CashTransaction) => {
    queryClient.setQueryData(["cash-transaction", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["cash-transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["cash-accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
  };
  const cancel = useMutation({
    mutationFn: () => cashBankApi.cancelTransaction(tx.id),
    onSuccess: (next) => {
      update(next);
      toast.success(t("cb.tx.toast.cancelled"));
    },
    onError: errorToast,
  });
  const voucherKind = tx.type === "RECEIPT" ? "RECEIPT" : tx.type === "PAYMENT" || tx.type === "CHARGE" ? "PAYMENT" : "OTHER";

  return (
    <div className="space-y-4" data-testid="cash-page" data-status={tx.status}>
      <div data-print="hide">
        <PageHeader
          title={tx.number ? t("cb.tx.titleNo", { type: typeName, number: tx.number }) : t("cb.tx.draftTitle", { type: typeName })}
          badge={<StatusBadge status={tx.status} />}
          description={`${tx.description} · ${t("gl.journal.fields.preparer")}: ${tx.preparer_name}`}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer aria-hidden />{t("cb.tx.actions.print")}</Button>
              {(tx.status === "DRAFT" || tx.status === "SUBMITTED") && canCreate && (
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}><Ban aria-hidden />{t("cb.tx.actions.cancel")}</Button>
              )}
              {(tx.status === "DRAFT" || tx.status === "SUBMITTED") && canPost && (
                <Button size="sm" onClick={() => setPosting(true)} data-testid="cash-post">{t("cb.tx.actions.post")}</Button>
              )}
            </>
          }
        />
        {tx.status === "SUBMITTED" && <Note>{t("cb.tx.banner.submitted")}</Note>}
        {tx.status === "POSTED" && (
          <Note testId="cash-posted">
            {t("cb.tx.banner.posted", { number: tx.number ?? "", journal: tx.journal_no ?? "" })}{" "}
            {tx.journal_id && <AppLink href={`/accounting/journals/${tx.journal_id}`} className="underline">{tx.journal_no}</AppLink>}
          </Note>
        )}
        {tx.status === "CANCELLED" && <Note>{t("cb.tx.banner.cancelled")}</Note>}
        {tx.expense_id && <Note><AppLink href={`/expenses/${tx.expense_id}`} className="underline">{t("cb.tx.banner.expense", { number: tx.reference })}</AppLink></Note>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]" data-print="hide">
        <div className="min-w-0">
          {editable ? (
            <CashTransactionForm key={tx.id} transaction={tx} type={tx.type} onSaved={update} />
          ) : (
            <div className="space-y-4">
              <dl className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
                {[
                  [t("cb.tx.form.date"), format.date(tx.date)],
                  [to ? t("cb.tx.form.fromAccount") : t("cb.tx.form.account"), label(from)],
                  ...(to ? [[t("cb.tx.form.toAccount"), label(to)]] : []),
                  [t("cb.tx.form.amount"), format.amount(tx.amount, tx.currency, { withCode: true })],
                  ...(tx.to_amount && to && to.currency !== tx.currency ? [[t("cb.tx.form.toAmount"), format.amount(tx.to_amount, to.currency, { withCode: true })]] : []),
                  [t("cb.tx.form.reference"), tx.reference || "—"],
                  [t("cb.tx.form.payee"), tx.payee || "—"],
                ].map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
              {tx.lines.length > 0 && (
                <div className="relative overflow-x-auto rounded-lg border bg-card">
                  <table className="w-full min-w-[32rem] text-sm">
                    <caption className="sr-only">{t("cb.tx.form.lines")}</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left">{t("finance.journal.account")}</th>
                        <th scope="col" className="px-3 py-2 text-left">{t("finance.journal.description")}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t("cb.tx.form.amount")} ({tx.currency})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tx.lines.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{l.account_code} {locale === "km" ? l.account_name_km : l.account_name}</td>
                          <td className="px-3 py-2">{l.description}</td>
                          <td className="px-3 py-2"><AmountText value={l.amount} currency={tx.currency} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <aside className="rounded-xl border bg-card p-4">
          <HistoryPanel events={tx.history.map((e) => ({ ...e, action: historyLabel(e.action) }))} />
        </aside>
      </div>

      {/* Printed voucher (SRS §15.4) with the amount in words. */}
      <div className="hidden text-[10pt] text-black print:block" data-testid="cash-voucher">
        <header className="mb-3 flex justify-between border-b border-black pb-2">
          <div><p className="font-semibold">{company?.name}</p><p>{company?.name_km}</p></div>
          <div className="text-right">
            <p className="text-base font-bold">{t(`cb.tx.voucher.${voucherKind}`)}</p>
            <p>{tx.number ?? t("gl.journals.draftNo")}</p>
            <p>{format.date(tx.date)}</p>
          </div>
        </header>
        <dl className="mb-4 grid grid-cols-[10rem_1fr] gap-y-1">
          <dt>{t("cb.tx.form.payee")}</dt><dd>{tx.payee || "—"}</dd>
          <dt>{t("cb.tx.form.description")}</dt><dd>{tx.description}</dd>
          <dt>{t("cb.tx.form.account")}</dt><dd>{label(from)}{to ? ` → ${label(to)}` : ""}</dd>
          <dt>{t("cb.tx.form.amount")}</dt><dd className="font-semibold">{format.amount(tx.amount, tx.currency, { withCode: true })}</dd>
          <dt>{t("finance.words.label")}</dt><dd>{amountInWords(tx.amount, tx.currency, locale)}</dd>
          <dt>{t("cb.tx.form.reference")}</dt><dd>{tx.reference}</dd>
        </dl>
        <div className="mt-12 grid grid-cols-3 gap-6">
          {[[t("gl.journal.voucher.preparedBy"), tx.preparer_name], [t("cb.tx.voucher.approvedBy"), tx.posted_by ?? ""], [voucherKind === "RECEIPT" ? t("cb.tx.voucher.paidBy") : t("cb.tx.voucher.receivedBy"), ""]].map(([k, v]) => (
            <div key={k} className="border-t border-black pt-1"><p className="font-medium">{k}</p><p>{v}</p><p className="mt-6 text-[8pt]">{t("cb.tx.voucher.signature")}</p></div>
          ))}
        </div>
      </div>

      <ConfirmActionDialog
        open={posting}
        onOpenChange={setPosting}
        action="post"
        title={t("cb.tx.post.title", { type: typeName })}
        description={t("cb.tx.post.description")}
        effect={{
          company: company ? (locale === "km" ? company.name_km : company.name) : undefined,
          date: format.date(tx.date), currency: tx.currency, amount: tx.amount,
          accounts: [label(from), ...(to ? [label(to)] : []), ...tx.lines.map((l) => `${l.account_code} ${locale === "km" ? l.account_name_km : l.account_name}`)],
        }}
        showAmountInWords={tx.type === "PAYMENT" || tx.type === "RECEIPT"}
        thresholdAmount={tx.amount}
        onConfirm={async ({ idempotencyKey }) => {
          const posted = await cashBankApi.postTransaction(tx.id, idempotencyKey);
          update(posted);
          return posted.number ?? undefined;
        }}
        onDone={() => void queryClient.invalidateQueries({ queryKey: ["cash-transaction", tx.id] })}
      />
    </div>
  );
}

function Note({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className="mt-2 flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-sm" role="status" data-testid={testId}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
