"use client";

import { AlertTriangle, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { useFormatters } from "@/lib/api/hooks";
import {
  allocatedTotal, autoAllocate, checkAllocations, realisedFxPreview, unallocatedAmount, type Allocations, type OpenInvoice,
} from "@/lib/money/allocation";
import { D, Decimal } from "@/lib/money/decimal";
import { cn } from "@/lib/utils";
import { AmountInput, AmountText } from "./amount";

interface AllocationGridProps {
  invoices: OpenInvoice[];
  /** Receipt or payment amount, in `currency`. */
  amount: string;
  currency: string;
  allocations: Allocations;
  onChange: (allocations: Allocations) => void;
  /** For the realised-FX preview: the settlement rate and the company's base currency. */
  settlementRate?: string;
  baseCurrency?: string;
  readOnly?: boolean;
  emptyText?: string;
}

/**
 * Allocates a receipt or payment to open invoices (SRS SCR-10, SCR-12): auto-allocate oldest first,
 * the remaining unallocated amount, a realised-FX preview, and blocking of over-allocation.
 * The server re-checks every limit (ALLOCATION_EXCEEDS_BALANCE).
 */
export function AllocationGrid({
  invoices, amount, currency, allocations, onChange, settlementRate, baseCurrency, readOnly, emptyText,
}: AllocationGridProps) {
  const t = useTranslations("finance.allocation");
  const format = useFormatters();
  const check = checkAllocations(invoices, amount, allocations);
  const allocated = allocatedTotal(allocations);
  const remaining = unallocatedAmount(amount, allocations);
  const showFx = Boolean(settlementRate && baseCurrency && baseCurrency !== currency);

  const fxFor = (invoice: OpenInvoice): Decimal | null => {
    const value = allocations[invoice.id];
    if (!showFx || !invoice.rate || !value || D(value).isZero()) return null;
    return realisedFxPreview(value, invoice.rate, settlementRate!, baseCurrency!);
  };
  const fxTotal = invoices.reduce((acc, inv) => acc.plus(fxFor(inv) ?? 0), new Decimal(0));

  if (invoices.length === 0) return <EmptyState title={emptyText ?? t("empty")} className="rounded-lg border py-8" />;

  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

  return (
    <div className="min-w-0 space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(autoAllocate(invoices, amount, currency))} disabled={D(amount).lte(0)}>
            <Wand2 aria-hidden />
            {t("autoAllocate")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({})} disabled={allocated.isZero()}>
            {t("clear")}
          </Button>
        </div>
      )}
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className={head}>{t("invoice")}</th>
              <th scope="col" className={head}>{t("date")}</th>
              <th scope="col" className={head}>{t("dueDate")}</th>
              <th scope="col" className={head}>{t("currency")}</th>
              <th scope="col" className={cn(head, "text-right")}>{t("outstanding")}</th>
              <th scope="col" className={cn(head, "w-40 text-right")}>{t("allocate")}</th>
              {showFx && <th scope="col" className={cn(head, "text-right")}>{t("fxPreview")} ({baseCurrency})</th>}
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const over = check.exceedsInvoice.includes(invoice.id) || check.negative.includes(invoice.id);
              const fx = fxFor(invoice);
              return (
                <tr key={invoice.id} className="border-t" data-testid="allocation-row">
                  <td className="px-2 py-1.5 font-medium">{invoice.number}</td>
                  <td className="px-2 py-1.5 tabular-nums">{format.date(invoice.date)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{format.date(invoice.due_date)}</td>
                  <td className="px-2 py-1.5">{invoice.currency}</td>
                  <td className="px-2 py-1.5"><AmountText value={invoice.outstanding} currency={invoice.currency} /></td>
                  <td className="p-1">
                    {readOnly ? (
                      <AmountText value={allocations[invoice.id] ?? "0"} currency={currency} blankZero className="px-2" />
                    ) : (
                      <>
                        <AmountInput
                          value={allocations[invoice.id] ?? ""}
                          onValueChange={(value) => {
                            const next = { ...allocations };
                            if (value === "" || D(value).isZero()) delete next[invoice.id];
                            else next[invoice.id] = value;
                            onChange(next);
                          }}
                          currency={currency}
                          aria-label={t("allocateFor", { invoice: invoice.number })}
                          aria-invalid={over}
                          aria-describedby={over ? `alloc-${invoice.id}-error` : undefined}
                        />
                        {over && (
                          <p id={`alloc-${invoice.id}-error`} className="mt-0.5 text-right text-xs text-destructive" role="alert">
                            {t("exceedsInvoice")}
                          </p>
                        )}
                      </>
                    )}
                  </td>
                  {showFx && (
                    <td className="px-2 py-1.5">
                      {fx && !fx.isZero() ? (
                        <span className="amount block">
                          {format.amount(fx.abs(), baseCurrency!)} {fx.gt(0) ? t("fxGain") : t("fxLoss")}
                        </span>
                      ) : (
                        <span className="amount block text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("receiptAmount")} ({currency})</dt>
        <dd><AmountText value={amount} currency={currency} /></dd>
        <dt className="text-muted-foreground">{t("allocated")}</dt>
        <dd data-testid="allocated-total"><AmountText value={allocated} currency={currency} /></dd>
        <dt className="font-medium">{t("unallocated")}</dt>
        <dd className="font-medium" data-testid="unallocated"><AmountText value={remaining} currency={currency} /></dd>
        {showFx && !fxTotal.isZero() && (
          <>
            <dt className="text-muted-foreground">{t("fxPreview")} ({baseCurrency})</dt>
            <dd className="amount">{format.amount(fxTotal.abs(), baseCurrency!)} {fxTotal.gt(0) ? t("fxGain") : t("fxLoss")}</dd>
          </>
        )}
      </dl>

      {check.exceedsReceipt && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert" data-testid="allocation-error">
          <AlertTriangle className="size-4" aria-hidden />
          {t("exceedsReceipt")}
        </p>
      )}
      {!check.exceedsReceipt && remaining.gt(0) && !allocated.isZero() && (
        <p className="flex items-center gap-1.5 text-sm text-warning" role="status" data-testid="unapplied-warning">
          <AlertTriangle className="size-4" aria-hidden />
          {t("unappliedWarning", { amount: format.amount(remaining, currency, { withCode: true }) })}
        </p>
      )}
    </div>
  );
}
