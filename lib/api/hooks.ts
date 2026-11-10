"use client";

import { useMutation, useQuery, type UseMutationOptions } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format/dates";
import { registerCurrencyDecimals, type AmountLike } from "@/lib/money/decimal";
import { formatAmount, type FormatAmountOptions } from "@/lib/money/format";
import { useUiStore } from "@/lib/stores/ui";
import { accountsApi } from "./endpoints/accounts";
import { orgApi } from "./endpoints/org";
import { IdempotencyKeyHolder, runIdempotent } from "./idempotency";

const REFERENCE_STALE = 5 * 60_000;

/** Posting accounts for pickers. Sensitive accounts are already filtered by the server. */
export function usePostingAccounts() {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({
    queryKey: ["accounts", companyId, "posting"],
    queryFn: ({ signal }) => accountsApi.list({ posting: true, active: true, limit: 200 }, signal),
    staleTime: REFERENCE_STALE,
    select: (page) => page.data,
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const page = await orgApi.currencies();
      // Currency precision can be changed in settings: keep the money helpers in step.
      registerCurrencyDecimals(Object.fromEntries(page.data.map((c) => [c.code, c.decimals])));
      return page.data;
    },
    staleTime: REFERENCE_STALE,
  });
}

export function useDepartments() {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({ queryKey: ["departments", companyId], queryFn: orgApi.departments, staleTime: REFERENCE_STALE, select: (p) => p.data });
}

export function useDimensions() {
  return useQuery({ queryKey: ["dimensions"], queryFn: orgApi.dimensions, staleTime: REFERENCE_STALE, select: (p) => p.data });
}

export function useFiscalYears() {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({ queryKey: ["fiscal-years", companyId], queryFn: orgApi.fiscalYears, staleTime: REFERENCE_STALE, select: (p) => p.data });
}

/** Amount and date formatters bound to the signed-in user's preferences (SRS §14.1). */
export function useFormatters() {
  const negative = useSession((s) => s.user?.negative_style ?? "brackets");
  const dateFormat = useSession((s) => s.user?.date_format ?? "DD/MM/YYYY");
  return {
    negative,
    dateFormat,
    amount: (value: AmountLike, currency: string, opts: FormatAmountOptions = {}) =>
      formatAmount(value, currency, { negative, ...opts }),
    date: (iso: string | null | undefined) => formatDate(iso, dateFormat),
    dateTime: (iso: string | null | undefined) => formatDateTime(iso, dateFormat),
  };
}

/**
 * Mutation for idempotent commands (post, reverse, approve, release, …). The Idempotency-Key is
 * created for the user's action and reused if they retry after a network failure (SRS §13.1).
 */
export function useIdempotentMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, unknown, TVariables>, "mutationFn">,
) {
  const [holder] = useState(() => new IdempotencyKeyHolder());
  return useMutation<TData, unknown, TVariables>({
    ...options,
    mutationFn: (variables) => runIdempotent(holder, (key) => mutationFn(variables, key)),
  });
}
