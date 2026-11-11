"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import type { CashBankAccount } from "@/lib/api/types/cashbank";
import { useAppLocale } from "@/lib/i18n/navigation";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";

/** Cash and bank accounts the user may see, cash first (a cashier sees only their own cash). */
export function useCashBankAccounts() {
  const companyId = useUiStore((s) => s.companyId);
  const seeCash = usePermission("cb.cash.view");
  const seeBank = usePermission("cb.bank.view");
  const cash = useQuery({ queryKey: ["cash-accounts", companyId], queryFn: ({ signal }) => cashBankApi.cashAccounts(signal), enabled: seeCash });
  const bank = useQuery({ queryKey: ["bank-accounts", companyId], queryFn: ({ signal }) => cashBankApi.bankAccounts(signal), enabled: seeBank });
  const accounts: CashBankAccount[] = [...(cash.data?.data ?? []), ...(bank.data?.data ?? [])];
  return {
    accounts,
    isPending: (seeCash && cash.isPending) || (seeBank && bank.isPending),
    error: cash.error ?? bank.error,
    refetch: () => {
      void cash.refetch();
      void bank.refetch();
    },
  };
}

/** "ABA-USD · ABA current account – USD" in the active language. */
export function useAccountLabel() {
  const locale = useAppLocale();
  return (a: Pick<CashBankAccount, "code" | "name" | "name_km"> | undefined) => (a ? `${a.code} · ${locale === "km" ? a.name_km : a.name}` : "");
}

export function useHistoryLabel() {
  const t = useTranslations("common.history");
  return (action: string) => (t.has(action) ? t(action) : action);
}
