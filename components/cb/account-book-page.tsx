"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Printer, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { AmountText } from "@/components/finance/amount";
import { DateRangePicker } from "@/components/finance/date-range-picker";
import { ReportHeader } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { useFormatters } from "@/lib/api/hooks";
import { useCurrentCompany } from "@/lib/auth/session";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { Can } from "@/lib/rbac/can";
import { useCurrentPeriodRange } from "@/components/gl/trial-balance-page";
import { useCashBankAccounts } from "./use-cash-bank";

/** Cashbook or bankbook of one account (FR-CB-007, RPT-11, RPT-12). */
export function AccountBookPage({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const base = company?.base_currency ?? "USD";
  const defaults = useCurrentPeriodRange();
  const { filters, setFilters } = useUrlFilters(["from", "to"] as const);
  const { accounts, isPending: accountsPending } = useCashBankAccounts();
  const account = accounts.find((a) => a.id === id);
  const from = filters.from || defaults.from;
  const to = filters.to || defaults.to;
  const query = useQuery({
    queryKey: ["book", id, from, to],
    queryFn: ({ signal }) => cashBankApi.book(account!.kind, id, from, to, signal),
    enabled: Boolean(account) && from <= to,
  });

  if (accountsPending) return <TableSkeleton columns={7} />;
  if (!account) return <EmptyState title={t("cb.tx.notFound")} />;
  const name = locale === "km" ? account.name_km : account.name;
  const title = account.kind === "CASH" ? t("cb.book.cashbook", { name }) : t("cb.book.bankbook", { name });
  const cur = account.currency;
  const head = "px-2 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground";

  return (
    <div className="min-w-0">
      <div data-print="hide">
        <PageHeader
          title={title}
          description={[account.bank_name, account.account_number, cur].filter(Boolean).join(" · ")}
          actions={
            <>
              {account.kind === "BANK" && (
                <Can permission="cb.reconcile">
                  <Button size="sm" variant="outline" asChild><AppLink href={`/cash-bank/reconciliations?account=${account.id}`}><Scale aria-hidden />{t("cb.book.reconcile")}</AppLink></Button>
                </Can>
              )}
              <Can permission="cb.cash.create">
                <Button size="sm" asChild><AppLink href={`/cash-bank/transactions/new?type=PAYMENT&account=${account.id}`}><Plus aria-hidden />{t("cb.book.newTransaction")}</AppLink></Button>
              </Can>
            </>
          }
        />
        <div className="mb-4 rounded-xl border bg-card p-3">
          <DateRangePicker idPrefix="book-range" value={{ from, to }} onChange={(r) => setFilters({ from: r.from, to: r.to })} />
        </div>
      </div>
      <ReportHeader
        reportName={title}
        period={`${format.date(from)} – ${format.date(to)}`}
        currency={cur}
        generatedAt={new Date().toISOString()}
        actions={<Button size="sm" variant="outline" onClick={() => window.print()}><Printer aria-hidden />{t("common.print")}</Button>}
      />
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        {query.isPending ? (
          <TableSkeleton columns={7} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <table className="w-full min-w-[56rem] border-collapse text-sm" data-testid="account-book">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-muted/50">
              <tr>
                {(["date", "journal", "source", "reference", "description"] as const).map((c) => <th key={c} scope="col" className={`${head} text-left`}>{t(`cb.book.col.${c}`)}</th>)}
                <th scope="col" className={`${head} text-right`}>{t("cb.book.col.receipt")} ({cur})</th>
                <th scope="col" className={`${head} text-right`}>{t("cb.book.col.payment")} ({cur})</th>
                <th scope="col" className={`${head} text-right`}>{t("cb.book.col.balance")} ({cur})</th>
                {cur !== base && <th scope="col" className={`${head} text-right`}>{t("cb.book.col.balanceBase", { currency: base })}</th>}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t bg-muted/20 font-medium">
                <td className="px-2 py-1.5" colSpan={7}>{t("cb.book.opening")}</td>
                <td className="px-2 py-1.5"><AmountText value={query.data.opening} currency={cur} /></td>
                {cur !== base && <td className="px-2 py-1.5"><AmountText value={query.data.opening_base} currency={base} /></td>}
              </tr>
              {query.data.lines.length === 0 && (
                <tr className="border-t"><td colSpan={9} className="px-2 py-3 text-center text-muted-foreground">{t("cb.book.empty")}</td></tr>
              )}
              {query.data.lines.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{format.date(l.date)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap"><AppLink href={`/accounting/journals/${l.journal_id}`} className="text-primary hover:underline">{l.journal_no}</AppLink></td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{t.has(`gl.type.${l.source}`) ? t(`gl.type.${l.source}`) : l.source}</td>
                  <td className="px-2 py-1.5">{l.reference}</td>
                  <td className="px-2 py-1.5">{l.description}</td>
                  <td className="px-2 py-1.5"><AmountText value={l.receipt} currency={cur} blankZero /></td>
                  <td className="px-2 py-1.5"><AmountText value={l.payment} currency={cur} blankZero /></td>
                  <td className="px-2 py-1.5"><AmountText value={l.balance} currency={cur} /></td>
                  {cur !== base && <td className="px-2 py-1.5"><AmountText value={l.balance_base} currency={base} /></td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/50 font-semibold">
              <tr>
                <td className="px-2 py-1.5" colSpan={5}>{t("cb.book.totals")}</td>
                <td className="px-2 py-1.5"><AmountText value={query.data.total_receipts} currency={cur} /></td>
                <td className="px-2 py-1.5"><AmountText value={query.data.total_payments} currency={cur} /></td>
                <td colSpan={cur !== base ? 2 : 1} />
              </tr>
              <tr data-testid="book-closing">
                <td className="px-2 py-1.5" colSpan={7}>{t("cb.book.closing")}</td>
                <td className="px-2 py-1.5"><AmountText value={query.data.closing} currency={cur} /></td>
                {cur !== base && <td className="px-2 py-1.5"><AmountText value={query.data.closing_base} currency={base} /></td>}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
