"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect } from "@/components/forms/field";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inventoryApi } from "@/lib/api/endpoints/assets";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { InventoryEventType } from "@/lib/api/types/planning";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";

const TYPES: InventoryEventType[] = ["RECEIPT", "ISSUE", "ADJUSTMENT", "WRITE_OFF", "RETURN"];

/** Optional inventory integration (SRS §6.11), shown only when the inventory feature flag is on. */
export function InventoryPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const describe = useDescribeError();
  const queryClient = useQueryClient();
  const companyId = useUiStore((s) => s.companyId);
  const canPost = usePermission("gl.journal.post");
  const rec = useQuery({ queryKey: ["inv-rec", companyId], queryFn: ({ signal }) => inventoryApi.reconciliation(todayBusinessDate(), signal) });
  const valuations = useQuery({ queryKey: ["inv-val", companyId], queryFn: ({ signal }) => inventoryApi.valuations(signal) });
  const events = useQuery({ queryKey: ["inv-events", companyId], queryFn: ({ signal }) => inventoryApi.events(signal) });
  const [form, setForm] = useState({ source_event_id: "", type: "ISSUE" as InventoryEventType, date: todayBusinessDate(), item: "", quantity: "", value: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => inventoryApi.send(form),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["inv-events"] });
      void queryClient.invalidateQueries({ queryKey: ["inv-rec"] });
      if (r.duplicate) toast.info(t("inv.duplicate", { id: r.event.source_event_id, journal: r.event.journal_no ?? "" }));
      else toast.success(t("inv.posted", { journal: r.event.journal_no ?? "" }));
    },
    onError: (e) => setError(isApiError(e) && e.details[0]?.message ? e.details[0].message : describe(e).message),
  });
  const latest = valuations.data?.data[0];
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="min-w-0 space-y-4" data-testid="inventory-page">
      <PageHeader title={t("inv.title")} description={t("inv.description")} />
      <section className="rounded-xl border bg-card p-4" aria-labelledby="inv-rec-title" data-testid="inv-reconciliation">
        <h2 id="inv-rec-title" className="mb-2 text-sm font-semibold">{t("inv.recTitle")}</h2>
        {rec.isPending ? <TableSkeleton rows={2} /> : rec.isError ? <ErrorState compact error={rec.error} onRetry={() => rec.refetch()} /> : (
          <div className="space-y-2 text-sm">
            <dl className="grid gap-3 sm:grid-cols-3">
              {[[t("inv.valuation", { date: format.date(rec.data.date) }), rec.data.valuation_total], [t("inv.control"), rec.data.control_balance], [t("inv.difference"), rec.data.difference]].map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{v === null ? "—" : `${format.amount(v as string, "USD")} USD`}</dd></div>
              ))}
            </dl>
            {rec.data.difference !== null && (D(rec.data.difference).isZero()
              ? <p className="flex items-center gap-2 text-success"><CheckCircle2 className="size-4" aria-hidden />{t("inv.agrees")}</p>
              : <p className="flex items-center gap-2 text-warning" role="status"><AlertTriangle className="size-4" aria-hidden />{t("inv.differs", { amount: format.amount(rec.data.difference, "USD", { withCode: true }) })}</p>)}
          </div>
        )}
      </section>
      {latest && (
        <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="inv-val-title">
          <h2 id="inv-val-title" className="mb-2 font-semibold">{t("inv.snapshot", { date: format.date(latest.date) })}</h2>
          <ul className="space-y-1">{latest.categories.map((c) => <li key={c.name} className="flex justify-between gap-2"><span>{locale === "km" ? c.name_km : c.name}</span><AmountText value={c.value} currency="USD" withCode /></li>)}</ul>
          <p className="mt-2 text-xs text-muted-foreground">{t("inv.snapshotNote", { method: t(`inv.method.${latest.method}`), source: latest.source })}</p>
        </section>
      )}
      {canPost && (
        <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setError(null); send.mutate(); }} aria-labelledby="inv-form-title" data-testid="inv-form">
          <h2 id="inv-form-title" className="text-sm font-semibold sm:col-span-2 lg:col-span-4">{t("inv.formTitle")}</h2>
          <FormField id="inv-src" label={t("inv.form.source")} required hint={t("inv.form.sourceHint")}><Input id="inv-src" value={form.source_event_id} onChange={(e) => setForm({ ...form, source_event_id: e.target.value })} aria-describedby="inv-src-hint" /></FormField>
          <FormField id="inv-type" label={t("inv.form.type")}>
            <NativeSelect id="inv-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InventoryEventType })}>{TYPES.map((x) => <option key={x} value={x}>{t(`inv.types.${x}`)}</option>)}</NativeSelect>
          </FormField>
          <FormField id="inv-date" label={t("inv.form.date")}><DateInput id="inv-date" value={form.date} onValueChange={(date) => setForm({ ...form, date })} /></FormField>
          <FormField id="inv-item" label={t("inv.form.item")}><Input id="inv-item" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} /></FormField>
          <FormField id="inv-qty" label={t("inv.form.quantity")}><AmountInput id="inv-qty" currency="QTY" value={form.quantity} onValueChange={(quantity) => setForm({ ...form, quantity })} /></FormField>
          <FormField id="inv-value" label={`${t("inv.form.value")} (USD)`} required><AmountInput id="inv-value" currency="USD" allowNegative={form.type === "ADJUSTMENT"} value={form.value} onValueChange={(value) => setForm({ ...form, value })} /></FormField>
          <FormField id="inv-reason" label={t("inv.form.reason")} className="sm:col-span-2"><Input id="inv-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></FormField>
          {error && <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4" role="alert">{error}</p>}
          <div className="flex justify-end sm:col-span-2 lg:col-span-4"><Button type="submit" size="sm" disabled={send.isPending} data-testid="inv-send"><Send aria-hidden />{t("inv.send")}</Button></div>
        </form>
      )}
      <section aria-labelledby="inv-events-title">
        <h2 id="inv-events-title" className="mb-2 text-sm font-semibold">{t("inv.events")}</h2>
        {events.isPending ? <TableSkeleton rows={3} /> : events.isError ? <ErrorState error={events.error} onRetry={() => events.refetch()} /> : events.data.data.length === 0 ? <EmptyState title={t("inv.noEvents")} className="rounded-lg border py-8" /> : (
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t("inv.events")}</caption>
              <thead className="bg-muted/50"><tr>
                <th scope="col" className={head}>{t("inv.form.source")}</th><th scope="col" className={head}>{t("inv.form.type")}</th><th scope="col" className={head}>{t("inv.form.date")}</th>
                <th scope="col" className={head}>{t("inv.form.item")}</th><th scope="col" className={`${head} text-right`}>{t("inv.form.value")} (USD)</th><th scope="col" className={head}>{t("inv.journal")}</th>
              </tr></thead>
              <tbody>
                {events.data.data.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-2 py-1.5 font-mono text-xs">{e.source_event_id}</td><td className="px-2 py-1.5">{t(`inv.types.${e.type}`)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{format.date(e.date)}</td><td className="px-2 py-1.5">{e.item}</td>
                    <td className="px-2 py-1.5"><AmountText value={e.value} currency="USD" /></td>
                    <td className="px-2 py-1.5">{e.journal_id && <AppLink href={`/accounting/journals/${e.journal_id}`} className="hover:underline">{e.journal_no}</AppLink>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
