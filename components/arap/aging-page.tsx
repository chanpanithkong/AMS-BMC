"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Printer, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState, TableSkeleton } from "@/components/feedback/states";
import { FormField } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { ReportHeader } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { agingApi } from "@/lib/api/endpoints/arap";
import { useFormatters } from "@/lib/api/hooks";
import type { AgingBuckets } from "@/lib/api/types/arap";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink } from "@/lib/i18n/navigation";
import { D } from "@/lib/money/decimal";
import { useUiStore } from "@/lib/stores/ui";
import { SIDE, useNameOf, type DocKind } from "./shared";

const BUCKETS: (keyof AgingBuckets)[] = ["current", "d1_30", "d31_60", "d61_90", "over_90", "total"];

/** RPT-07 AR aging and RPT-08 AP aging, reconciled to the control account (AT-AR-05). */
export function AgingPage({ kind }: { kind: DocKind }) {
  const t = useTranslations();
  const format = useFormatters();
  const nameOf = useNameOf();
  const companyId = useUiStore((s) => s.companyId);
  const [asOf, setAsOf] = useState(todayBusinessDate());
  const report = useQuery({
    queryKey: ["aging", kind, asOf, companyId],
    queryFn: ({ signal }) => (kind === "AR" ? agingApi.ar(asOf, signal) : agingApi.ap(asOf, signal)),
    enabled: Boolean(asOf),
  });
  const r = report.data;
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="min-w-0" data-print="main">
      <ReportHeader
        reportName={t(`${SIDE[kind].ns}.agingTitle`)}
        period={t("arap.aging.asOf", { date: format.date(asOf) })}
        currency="USD"
        actions={<Button size="sm" variant="outline" onClick={() => window.print()}><Printer aria-hidden />{t("arap.actions.print")}</Button>}
      />
      <div className="mb-3 flex flex-wrap items-end gap-3" data-print="hide">
        <FormField id="aging-asof" label={t("arap.aging.asOfLabel")}><DateInput id="aging-asof" value={asOf} onValueChange={setAsOf} /></FormField>
      </div>
      {report.isPending && <TableSkeleton rows={8} />}
      {report.isError && <ErrorState error={report.error} onRetry={() => report.refetch()} />}
      {r && (
        <div className="space-y-3">
          <p className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${D(r.control.difference).isZero() ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5 text-destructive"}`} role="status" data-testid="aging-control">
            {D(r.control.difference).isZero() ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
            {D(r.control.difference).isZero()
              ? t("arap.aging.reconciled", { account: r.control.account_code, amount: format.amount(r.control.balance, "USD", { withCode: true }) })
              : t("arap.aging.difference", { account: r.control.account_code, amount: format.amount(r.control.difference, "USD", { withCode: true }) })}
          </p>
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[48rem] text-sm" data-testid="aging-table">
              <caption className="sr-only">{t(`${SIDE[kind].ns}.agingTitle`)}</caption>
              <thead className="bg-muted/50"><tr>
                <th scope="col" className={head}>{t("arap.parties.col.code")}</th>
                <th scope="col" className={head}>{t(`${SIDE[kind].ns}.party`)}</th>
                {BUCKETS.map((b) => <th key={b} scope="col" className={`${head} text-right`}>{t(`arap.aging.bucket.${b}`)}</th>)}
              </tr></thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.party_id} className="border-t">
                    <td className="px-2 py-1.5"><AppLink href={`${SIDE[kind].partyPath}/${row.party_id}`} className="font-medium text-primary hover:underline">{row.code}</AppLink></td>
                    <td className="px-2 py-1.5">{nameOf(row)}</td>
                    {BUCKETS.map((b) => <td key={b} className={`px-2 py-1.5 ${b === "total" ? "font-medium" : ""}`}><AmountText value={row[b]} currency="USD" blankZero /></td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="px-2 py-2" colSpan={2}>{t("common.total")}</td>
                  {BUCKETS.map((b) => <td key={b} className="px-2 py-2" data-testid={`aging-total-${b}`}><AmountText value={r.totals[b]} currency="USD" /></td>)}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("arap.aging.note")}</p>
        </div>
      )}
    </div>
  );
}
