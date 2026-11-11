"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { revaluationsApi } from "@/lib/api/endpoints/assets";
import { isApiError } from "@/lib/api/errors";
import { useFiscalYears, useFormatters } from "@/lib/api/hooks";
import type { FxRevaluation } from "@/lib/api/types/planning";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";

/** Period-end FX revaluation (FR-FX-010, BR-FX-004): preview, post with automatic reversal, once per period. */
export function RevaluationsPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const describe = useDescribeError();
  const queryClient = useQueryClient();
  const companyId = useUiStore((s) => s.companyId);
  const canRun = usePermission("fx.revalue");
  const { data: years } = useFiscalYears();
  const ended = (years ?? []).flatMap((y) => y.periods).filter((p) => p.end_date <= todayBusinessDate());
  const [period, setPeriod] = useState("");
  const [current, setCurrent] = useState<FxRevaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const runs = useQuery({ queryKey: ["fx-revaluations", companyId], queryFn: ({ signal }) => revaluationsApi.list(signal) });
  const preview = useMutation({
    mutationFn: () => revaluationsApi.preview(period || ended.at(-1)!.id),
    onSuccess: (r) => { setCurrent(r); void queryClient.invalidateQueries({ queryKey: ["fx-revaluations"] }); },
    onError: (e) => {
      setCurrent(null);
      const chosen = ended.find((p) => p.id === (period || ended.at(-1)?.id));
      if (isApiError(e) && e.code === "ALREADY_POSTED" && chosen) return setError(t("fxr.alreadyPosted", { period: locale === "km" ? chosen.name_km : chosen.name }));
      setError(isApiError(e) && e.code === "VALIDATION_ERROR" && e.details[0]?.message ? e.details[0].message : describe(e).message);
    },
  });
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  const shown = current ?? null;
  return (
    <div className="min-w-0 space-y-4" data-testid="revaluations-page">
      <PageHeader title={t("fxr.title")} description={t("fxr.description")} />
      {canRun && (
        <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" onSubmit={(e) => { e.preventDefault(); setError(null); preview.mutate(); }}>
          <FormField id="fxr-period" label={t("fxr.period")}>
            <NativeSelect id="fxr-period" value={period || ended.at(-1)?.id || ""} onChange={(e) => setPeriod(e.target.value)} className="w-auto">
              {ended.map((p) => <option key={p.id} value={p.id}>{locale === "km" ? p.name_km : p.name} · {t(`status.${p.status}`)}</option>)}
            </NativeSelect>
          </FormField>
          <Button type="submit" size="sm" disabled={preview.isPending || !ended.length} data-testid="fxr-preview"><Play aria-hidden />{t("fxr.preview")}</Button>
          {error && <p className="basis-full text-sm text-destructive" role="alert" data-testid="fxr-error">{error}</p>}
        </form>
      )}
      {shown && (
        <section className="space-y-2 rounded-xl border bg-card p-4" aria-labelledby="fxr-preview-title" data-testid="fxr-result" data-status={shown.status}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="fxr-preview-title" className="flex items-center gap-2 font-semibold">{t("fxr.resultTitle", { period: shown.period_code })} <StatusBadge status={shown.status} /></h2>
            {shown.status === "DRAFT" && canRun && <Button size="sm" onClick={() => setConfirm(true)} data-testid="fxr-post">{t("arap.actions.post")}</Button>}
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t("fxr.resultTitle", { period: shown.period_code })}</caption>
              <thead><tr>
                <th scope="col" className={head}>{t("fxr.col.account")}</th><th scope="col" className={`${head} text-right`}>{t("fxr.col.balance")}</th>
                <th scope="col" className={`${head} text-right`}>{t("fxr.col.rate")}</th><th scope="col" className={`${head} text-right`}>{t("fxr.col.booked")} (USD)</th>
                <th scope="col" className={`${head} text-right`}>{t("fxr.col.revalued")} (USD)</th><th scope="col" className={`${head} text-right`}>{t("fxr.col.difference")} (USD)</th>
              </tr></thead>
              <tbody>
                {shown.lines.map((l) => (
                  <tr key={l.account_id} className="border-t">
                    <td className="px-2 py-1.5">{l.account_code} {locale === "km" ? l.account_name_km : l.account_name}</td>
                    <td className="px-2 py-1.5"><AmountText value={l.foreign_balance} currency={l.currency} withCode /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.closing_rate}</td>
                    <td className="px-2 py-1.5"><AmountText value={l.booked_base} currency="USD" /></td>
                    <td className="px-2 py-1.5"><AmountText value={l.revalued_base} currency="USD" /></td>
                    <td className="px-2 py-1.5"><AmountText value={l.difference} currency="USD" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 font-semibold"><td className="px-2 py-2" colSpan={5}>{t(D(shown.net_difference).gte(0) ? "fxr.netGain" : "fxr.netLoss")}</td><td className="px-2 py-2" data-testid="fxr-net"><AmountText value={shown.net_difference} currency="USD" /></td></tr></tfoot>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">{t("fxr.reversal", { date: format.date(shown.reversal_date) })}</p>
          {shown.status === "POSTED" && (
            <p className="text-sm" data-testid="fxr-journals">
              {t("fxr.posted")} {shown.journal_id && <AppLink href={`/accounting/journals/${shown.journal_id}`} className="underline">{shown.journal_no}</AppLink>} · {shown.reversal_journal_id && <AppLink href={`/accounting/journals/${shown.reversal_journal_id}`} className="underline">{shown.reversal_journal_no}</AppLink>}
            </p>
          )}
          {shown.not_revalued.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("fxr.notRevalued", { items: shown.not_revalued.map((n) => `${locale === "km" ? n.label_km : n.label} (${n.currency}, ${format.amount(n.amount, "USD")} USD)`).join("; ") })}
            </p>
          )}
        </section>
      )}
      <section aria-labelledby="fxr-history">
        <h2 id="fxr-history" className="mb-2 text-sm font-semibold">{t("fxr.history")}</h2>
        {runs.isPending ? <TableSkeleton rows={3} /> : runs.isError ? <ErrorState error={runs.error} onRetry={() => runs.refetch()} /> : runs.data.data.length === 0 ? <EmptyState title={t("fxr.empty")} className="rounded-lg border py-8" /> : (
          <ul className="divide-y rounded-lg border text-sm">
            {runs.data.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setCurrent(r)}>{r.period_code}</button>
                <span className="flex items-center gap-3"><AmountText value={r.net_difference} currency="USD" withCode /><StatusBadge status={r.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {shown && (
        <ConfirmActionDialog open={confirm} onOpenChange={setConfirm} action="post" title={t("fxr.postTitle", { period: shown.period_code })} description={t("fxr.postDescription", { date: format.date(shown.reversal_date) })}
          effect={{ date: format.date(shown.period_end), currency: "USD", amount: D(shown.net_difference).abs().toFixed(2), accounts: shown.lines.map((l) => l.account_code).concat(D(shown.net_difference).gte(0) ? ["7400"] : ["8410"]) }} thresholdAmount="0"
          onConfirm={async ({ idempotencyKey }) => { const next = await revaluationsApi.post(shown.id, idempotencyKey); setCurrent(next); void queryClient.invalidateQueries({ queryKey: ["fx-revaluations"] }); return next.journal_no ?? undefined; }}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ["fx-revaluations"] })} />
      )}
    </div>
  );
}
