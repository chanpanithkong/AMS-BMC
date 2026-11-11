"use client";

import { AlertTriangle, Landmark, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { AmountText } from "@/components/finance/amount";
import { useFormatters } from "@/lib/api/hooks";
import type { CashBankAccount } from "@/lib/api/types/cashbank";
import { useCurrentCompany } from "@/lib/auth/session";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { D } from "@/lib/money/decimal";
import { cn } from "@/lib/utils";
import { useCashBankAccounts } from "./use-cash-bank";

/** SCR-27 Cash and bank accounts with balances and minimum-balance alerts (FR-CB-001, FR-CB-002, FR-CB-014). */
export function CashBankAccountsPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const base = company?.base_currency ?? "USD";
  const { accounts, isPending, error, refetch } = useCashBankAccounts();
  const branchName = (id: string) => {
    const b = company?.branches.find((x) => x.id === id);
    return b ? (locale === "km" ? b.name_km : b.name) : "";
  };
  const head = "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";

  const table = (kind: "CASH" | "BANK", rows: CashBankAccount[]) => (
    <section className="space-y-2" aria-labelledby={`cb-${kind}`}>
      <h2 id={`cb-${kind}`} className="flex items-center gap-1.5 font-semibold">
        {kind === "CASH" ? <Wallet className="size-4" aria-hidden /> : <Landmark className="size-4" aria-hidden />}
        {kind === "CASH" ? t("cb.accounts.cash") : t("cb.accounts.bank")}
      </h2>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[46rem] border-collapse text-sm" data-testid={`cb-table-${kind}`}>
          <caption className="sr-only">{kind === "CASH" ? t("cb.accounts.cash") : t("cb.accounts.bank")}</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className={head}>{t("cb.accounts.col.code")}</th>
              <th scope="col" className={head}>{t("cb.accounts.col.name")}</th>
              {kind === "BANK" ? <th scope="col" className={head}>{t("cb.accounts.col.number")}</th> : <th scope="col" className={head}>{t("cb.accounts.col.custodian")}</th>}
              <th scope="col" className={head}>{t("cb.accounts.col.gl")}</th>
              <th scope="col" className={cn(head, "text-right")}>{t("cb.accounts.col.balance")}</th>
              <th scope="col" className={cn(head, "text-right")}>{t("cb.accounts.col.balanceBase", { currency: base })}</th>
              {kind === "BANK" && <th scope="col" className={head}>{t("cb.accounts.col.lastReconciled")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const low = D(a.balance).lt(a.min_balance);
              return (
                <tr key={a.id} className="border-t" data-testid={`cb-account-${a.code}`}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    <AppLink href={`/cash-bank/accounts/${a.id}`} className="text-primary hover:underline">{a.code}</AppLink>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block">{locale === "km" ? a.name_km : a.name}</span>
                    <span className="text-xs text-muted-foreground">{[a.bank_name, branchName(a.branch_id)].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{kind === "BANK" ? a.account_number : (a.custodian_name ?? "—")}</td>
                  <td className="px-3 py-2 tabular-nums">{a.gl_account_code}</td>
                  <td className="px-3 py-2">
                    <AmountText value={a.balance} currency={a.currency} withCode />
                    {low && (
                      // Text plus icon, never colour alone.
                      <span className="mt-0.5 flex items-center justify-end gap-1 text-xs text-warning" data-testid="below-min">
                        <AlertTriangle className="size-3" aria-hidden />
                        {t("cb.accounts.belowMin", { amount: format.amount(a.min_balance, a.currency, { withCode: true }) })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2"><AmountText value={a.balance_base} currency={base} /></td>
                  {kind === "BANK" && <td className="px-3 py-2 tabular-nums">{a.last_reconciled ? format.date(a.last_reconciled) : t("cb.accounts.never")}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const cash = accounts.filter((a) => a.kind === "CASH");
  const bank = accounts.filter((a) => a.kind === "BANK");
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title={t("cb.accounts.title")} description={t("cb.accounts.description")} />
      {isPending ? (
        <TableSkeleton columns={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : accounts.length === 0 ? (
        <EmptyState title={t("cb.accounts.empty")} />
      ) : (
        <>
          {cash.length > 0 && table("CASH", cash)}
          {bank.length > 0 && table("BANK", bank)}
          <p className="text-xs text-muted-foreground">{t("cb.accounts.maintainNote")}</p>
        </>
      )}
    </div>
  );
}
