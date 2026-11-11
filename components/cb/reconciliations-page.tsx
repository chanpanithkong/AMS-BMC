"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { describedBy, FormField, NativeSelect } from "@/components/forms/field";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { Can } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { useAccountLabel, useCashBankAccounts } from "./use-cash-bank";

/** SCR-13 list of reconciliations per bank account, and starting a new one. */
export function ReconciliationsPage() {
  const t = useTranslations();
  const format = useFormatters();
  const router = useAppRouter();
  const label = useAccountLabel();
  const companyId = useUiStore((s) => s.companyId);
  const { accounts } = useCashBankAccounts();
  const banks = accounts.filter((a) => a.kind === "BANK");
  const { filters, setFilters } = useUrlFilters(["account"] as const);
  const [starting, setStarting] = useState(false);
  const query = useQuery({
    queryKey: ["reconciliations", companyId, filters.account],
    queryFn: ({ signal }) => cashBankApi.reconciliations(filters.account || undefined, signal),
  });
  const head = "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("cb.rec.title")}
        description={t("cb.rec.description")}
        actions={
          <>
            <Can permission="cb.statement.import">
              <Button size="sm" variant="outline" asChild>
                <AppLink href={`/cash-bank/reconciliations/import${filters.account ? `?account=${filters.account}` : ""}`}><FileUp aria-hidden />{t("cb.rec.import")}</AppLink>
              </Button>
            </Can>
            <Can permission="cb.reconcile">
              <Button size="sm" onClick={() => setStarting(true)} data-testid="start-rec"><Plus aria-hidden />{t("cb.rec.start.button")}</Button>
            </Can>
          </>
        }
      />
      <div className="mb-3" data-print="hide">
        <NativeSelect className="w-auto" aria-label={t("cb.rec.col.account")} value={filters.account} onChange={(e) => setFilters({ account: e.target.value })}>
          <option value="">{t("cb.tx.allAccounts")}</option>
          {banks.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
        </NativeSelect>
      </div>
      <div className="relative overflow-x-auto rounded-lg border bg-card">
        {query.isPending ? (
          <TableSkeleton columns={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.data.length === 0 ? (
          <EmptyState title={t("cb.rec.empty")} />
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">{t("cb.rec.title")}</caption>
            <thead className="bg-muted/50">
              <tr>
                {(["account", "date", "closing", "difference", "status", "completedBy"] as const).map((c) => (
                  <th key={c} scope="col" className={`${head} ${c === "closing" || c === "difference" ? "text-right" : ""}`}>{t(`cb.rec.col.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => router.push(`/cash-bank/reconciliations/${r.id}`)} data-testid={`rec-row-${r.id}`}>
                  <td className="px-3 py-2"><AppLink href={`/cash-bank/reconciliations/${r.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{r.bank_account_name}</AppLink></td>
                  <td className="px-3 py-2 tabular-nums">{format.date(r.statement_date)}</td>
                  <td className="px-3 py-2"><AmountText value={r.statement_closing} currency={r.currency} withCode /></td>
                  <td className="px-3 py-2"><AmountText value={r.difference} currency={r.currency} /></td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2">{r.completed_by ? `${r.completed_by} · ${format.dateTime(r.completed_at)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {starting && <StartDialog defaultAccount={filters.account || banks[0]?.id || ""} onClose={() => setStarting(false)} />}
    </div>
  );
}

function StartDialog({ defaultAccount, onClose }: { defaultAccount: string; onClose: () => void }) {
  const t = useTranslations();
  const router = useAppRouter();
  const label = useAccountLabel();
  const describe = useDescribeError();
  const queryClient = useQueryClient();
  const { accounts } = useCashBankAccounts();
  const banks = accounts.filter((a) => a.kind === "BANK");
  const [value, setValue] = useState({ bank_account_id: defaultAccount, statement_date: "", statement_closing: "" });
  const [error, setError] = useState<string | null>(null);
  const currency = banks.find((b) => b.id === value.bank_account_id)?.currency ?? "USD";
  const start = useMutation({
    mutationFn: () => cashBankApi.startReconciliation(value),
    onSuccess: (rec) => {
      void queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      router.push(`/cash-bank/reconciliations/${rec.id}`);
    },
    onError: (e) => setError(isApiError(e) && e.details[0]?.message ? e.details[0].message : isApiError(e) && e.code === "INVALID_STATE_TRANSITION" ? e.message : describe(e).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cb.rec.start.title")}</DialogTitle>
          <DialogDescription>{t("cb.rec.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormField id="rec-account" label={t("cb.rec.start.account")} required>
            <NativeSelect id="rec-account" value={value.bank_account_id} onChange={(e) => setValue((v) => ({ ...v, bank_account_id: e.target.value }))}>
              {banks.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="rec-date" label={t("cb.rec.start.date")} required>
            <DateInput id="rec-date" value={value.statement_date} onValueChange={(statement_date) => setValue((v) => ({ ...v, statement_date }))} />
          </FormField>
          <FormField id="rec-closing" label={`${t("cb.rec.start.closing")} (${currency})`} required error={error ?? undefined}>
            <AmountInput id="rec-closing" currency={currency} allowNegative value={value.statement_closing} onValueChange={(statement_closing) => setValue((v) => ({ ...v, statement_closing }))} aria-describedby={describedBy("rec-closing", error ?? undefined)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => start.mutate()} disabled={start.isPending || !value.bank_account_id || !value.statement_date || !value.statement_closing}>{t("cb.rec.start.submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
