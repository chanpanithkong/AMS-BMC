"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useHistoryLabel } from "@/components/cb/use-cash-bank";
import { EmptyState, ErrorState, FormSkeleton, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountInput } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HistoryPanel } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { taxCodesApi } from "@/lib/api/endpoints/arap";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import type { TaxCode } from "@/lib/api/types/arap";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { addDays } from "@/lib/money/invoice";
import { Can, usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { useNameOf } from "./shared";

function Disclaimer() {
  const t = useTranslations("arap.tax");
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="note" data-testid="tax-disclaimer">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{t("disclaimer")}
    </p>
  );
}

/** SCR-22 tax codes: list with rate in force, accounts and verification status. */
export function TaxCodesPage() {
  const t = useTranslations();
  const router = useAppRouter();
  const nameOf = useNameOf();
  const companyId = useUiStore((s) => s.companyId);
  const query = useQuery({ queryKey: ["tax-codes", companyId], queryFn: ({ signal }) => taxCodesApi.list({}, signal) });
  const head = "px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="min-w-0">
      <PageHeader title={t("arap.tax.title")} description={t("arap.tax.description")}
        actions={<Can permission="tax.create"><Button size="sm" asChild><AppLink href="/tax/codes/new"><Plus aria-hidden />{t("arap.tax.new")}</AppLink></Button></Can>} />
      <Disclaimer />
      {query.isPending && <TableSkeleton rows={5} />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[48rem] text-sm" data-testid="tax-codes">
            <caption className="sr-only">{t("arap.tax.title")}</caption>
            <thead className="bg-muted/50"><tr>
              {["code", "name", "kind", "method", "rate", "account", "verification", "active"].map((c) => <th key={c} scope="col" className={cn(head, c === "rate" && "text-right")}>{t(`arap.tax.col.${c}`)}</th>)}
            </tr></thead>
            <tbody>
              {query.data.data.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => router.push(`/tax/codes/${c.id}`)} data-testid={`tax-row-${c.code}`}>
                  <td className="px-3 py-2"><AppLink href={`/tax/codes/${c.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{c.code}</AppLink></td>
                  <td className="px-3 py-2">{nameOf(c)}</td>
                  <td className="px-3 py-2">{t(`arap.tax.kind.${c.kind}`)}</td>
                  <td className="px-3 py-2">{t(`arap.tax.method.${c.method}`)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{D(c.current_rate).toFixed()} %</td>
                  <td className="px-3 py-2 tabular-nums">{c.account_code ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={c.verification} /></td>
                  <td className="px-3 py-2"><StatusBadge status={c.is_active ? "ACTIVE" : "INACTIVE"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TaxCodePage({ id }: { id: string }) {
  const t = useTranslations();
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["tax-code", id], queryFn: ({ signal }) => taxCodesApi.get(id, signal), enabled: !isNew });
  if (isNew) return <div><PageHeader title={t("arap.tax.new")} /><Disclaimer /><TaxCodeForm code={null} /></div>;
  if (query.isPending) return <FormSkeleton fields={6} />;
  if (query.isError) return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("arap.tax.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <TaxCodeView code={query.data} />;
}

const taxAccounts = (a: Account) => a.type === "ASSET" || a.type === "LIABILITY";

function TaxCodeForm({ code, onSaved }: { code: TaxCode | null; onSaved?: (c: TaxCode) => void }) {
  const t = useTranslations();
  const router = useAppRouter();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const canEdit = usePermission(code ? "tax.manage" : "tax.create");
  const [value, setValue] = useState({
    code: code?.code ?? "", name: code?.name ?? "", name_km: code?.name_km ?? "", kind: code?.kind ?? "OUTPUT", method: code?.method ?? "EXCLUSIVE",
    account_id: code?.account_id ?? "acc-2200", is_active: code?.is_active ?? true, rate: "", effective_from: todayBusinessDate(),
  });
  const [failure, setFailure] = useState<string | null>(null);
  const set = (patch: Partial<typeof value>) => setValue((v) => ({ ...v, ...patch }));
  const save = useMutation({
    mutationFn: () => {
      setFailure(null);
      const base = { code: value.code, name: value.name, name_km: value.name_km, kind: value.kind as TaxCode["kind"], method: value.method as TaxCode["method"], account_id: value.kind === "EXEMPT" ? null : value.account_id };
      return code ? taxCodesApi.update(code.id, { ...base, is_active: value.is_active }, code.version) : taxCodesApi.create({ ...base, rate: value.rate, effective_from: value.effective_from });
    },
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: ["tax-codes"] });
      queryClient.setQueryData(["tax-code", next.id], next);
      toast.success(t("arap.tax.saved"));
      if (!code) router.replace(`/tax/codes/${next.id}`);
      else onSaved?.(next);
    },
    onError: (error) => {
      const detail = isApiError(error) ? error.details[0] : undefined;
      setFailure(isApiError(error) && error.code === "VALIDATION_ERROR" && detail?.message ? detail.message : describe(error).message);
    },
  });
  return (
    <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} data-testid="tax-form">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="tax-code" label={t("arap.tax.col.code")} required><Input id="tax-code" value={value.code} disabled={!canEdit} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></FormField>
        <FormField id="tax-name" label={t("arap.tax.form.name")} required><Input id="tax-name" value={value.name} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} /></FormField>
        <FormField id="tax-name-km" label={t("arap.tax.form.nameKm")}><Input id="tax-name-km" value={value.name_km} disabled={!canEdit} onChange={(e) => set({ name_km: e.target.value })} /></FormField>
        <FormField id="tax-kind" label={t("arap.tax.col.kind")}>
          <NativeSelect id="tax-kind" value={value.kind} disabled={!canEdit} onChange={(e) => set({ kind: e.target.value as TaxCode["kind"] })}>
            {(["OUTPUT", "INPUT", "EXEMPT"] as const).map((k) => <option key={k} value={k}>{t(`arap.tax.kind.${k}`)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="tax-method" label={t("arap.tax.col.method")}>
          <NativeSelect id="tax-method" value={value.method} disabled={!canEdit} onChange={(e) => set({ method: e.target.value as TaxCode["method"] })}>
            {(["EXCLUSIVE", "INCLUSIVE"] as const).map((k) => <option key={k} value={k}>{t(`arap.tax.method.${k}`)}</option>)}
          </NativeSelect>
        </FormField>
        {value.kind !== "EXEMPT" && (
          <FormField id="tax-account" label={t("arap.tax.form.account")} hint={t("arap.tax.form.accountHint")}>
            <AccountPicker id="tax-account" value={value.account_id} onChange={(account_id) => set({ account_id: account_id ?? "" })} filter={taxAccounts} disabled={!canEdit} aria-describedby="tax-account-hint" />
          </FormField>
        )}
        {!code && (
          <>
            <FormField id="tax-rate" label={t("arap.tax.form.rate")} required><AmountInput id="tax-rate" currency="PCT" value={value.rate} onValueChange={(rate) => set({ rate })} /></FormField>
            <FormField id="tax-from" label={t("arap.tax.form.from")} required><DateInput id="tax-from" value={value.effective_from} onValueChange={(effective_from) => set({ effective_from })} /></FormField>
          </>
        )}
        {code && (
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="size-4" checked={value.is_active} disabled={!canEdit} onChange={(e) => set({ is_active: e.target.checked })} />{t("arap.tax.form.active")}</label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("arap.tax.form.reverifyHint")}</p>
      {failure && <p className="text-sm text-destructive" role="alert">{failure}</p>}
      {canEdit && <div className="flex justify-end"><Button type="submit" disabled={save.isPending}><Save aria-hidden />{t("common.save")}</Button></div>}
    </form>
  );
}

function TaxCodeView({ code: c }: { code: TaxCode }) {
  const t = useTranslations();
  const format = useFormatters();
  const nameOf = useNameOf();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const historyLabel = useHistoryLabel();
  const canManage = usePermission("tax.manage");
  const canVerify = usePermission("tax.approve");
  const today = todayBusinessDate();
  const last = c.rates[c.rates.length - 1];
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(() => addDays(`${today.slice(0, 7)}-01`, 32).slice(0, 8) + "01");
  const [verifying, setVerifying] = useState(false);
  const update = (next: TaxCode) => {
    queryClient.setQueryData(["tax-code", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["tax-codes"] });
  };
  const addRate = useMutation({
    mutationFn: () => taxCodesApi.addRate(c.id, rate, from),
    onSuccess: (next) => { update(next); setRate(""); toast.success(t("arap.tax.rateAdded")); },
    onError: errorToast,
  });
  return (
    <div className="space-y-4" data-testid="tax-code-page" data-verification={c.verification}>
      <PageHeader title={`${c.code} · ${nameOf(c)}`} badge={<StatusBadge status={c.verification} />}
        actions={canVerify && c.verification !== "VERIFIED" ? <Button size="sm" onClick={() => setVerifying(true)} data-testid="tax-verify"><ShieldCheck aria-hidden />{t("arap.tax.verify")}</Button> : undefined} />
      <Disclaimer />
      {c.verification === "VERIFIED"
        ? <p className="text-sm text-muted-foreground">{t("arap.tax.verifiedBy", { name: c.verified_by ?? "", date: format.dateTime(c.verified_at), note: c.verification_note || "—" })}</p>
        : <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status">{t("arap.tax.unverifiedNote")} {c.verification_note}</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          <TaxCodeForm key={c.version} code={c} onSaved={update} />
          <section className="rounded-xl border bg-card p-4" aria-labelledby="rates-title">
            <h2 id="rates-title" className="mb-3 text-sm font-semibold">{t("arap.tax.rates")}</h2>
            <ol className="relative space-y-3 border-l pl-4" data-testid="rate-timeline">
              {[...c.rates].reverse().map((r) => {
                const current = r.effective_from <= today && (!r.effective_to || today <= r.effective_to);
                const future = r.effective_from > today;
                return (
                  <li key={r.effective_from} className="relative">
                    <span className={cn("absolute -left-[1.3rem] top-1 size-2.5 rounded-full border-2 bg-background", current ? "border-primary bg-primary" : "border-muted-foreground")} aria-hidden />
                    <p className="font-medium tabular-nums">{D(r.rate).toFixed()} %
                      {current && <span className="ml-2 rounded border px-1 text-xs">{t("arap.tax.current")}</span>}
                      {future && <span className="ml-2 rounded border px-1 text-xs">{t("arap.tax.future")}</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{r.effective_to ? t("arap.tax.range", { from: format.date(r.effective_from), to: format.date(r.effective_to) }) : t("arap.tax.since", { from: format.date(r.effective_from) })}</p>
                  </li>
                );
              })}
            </ol>
            {canManage && (
              <form className="mt-4 flex flex-wrap items-end gap-3 border-t pt-3" onSubmit={(e) => { e.preventDefault(); addRate.mutate(); }}>
                <FormField id="new-rate" label={t("arap.tax.form.rate")}><AmountInput id="new-rate" currency="PCT" value={rate} onValueChange={setRate} className="w-28" /></FormField>
                <FormField id="new-from" label={t("arap.tax.form.from")}><DateInput id="new-from" value={from} onValueChange={setFrom} /></FormField>
                <Button type="submit" size="sm" disabled={!rate || !from || addRate.isPending} data-testid="add-rate">{t("arap.tax.addRate")}</Button>
                <p className="basis-full text-xs text-muted-foreground">{t("arap.tax.addRateHint", { date: last ? format.date(last.effective_from) : "—" })}</p>
              </form>
            )}
          </section>
        </div>
        <aside className="rounded-xl border bg-card p-4"><HistoryPanel events={c.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></aside>
      </div>
      <ConfirmActionDialog open={verifying} onOpenChange={setVerifying} action="approve" requireReason reasonLabel={t("arap.tax.verifyNote")} title={t("arap.tax.verifyTitle", { code: c.code })}
        description={t("arap.tax.verifyDescription")} effect={{ currency: "USD" }} thresholdAmount="0"
        onConfirm={async ({ reason }) => { const next = await taxCodesApi.verify(c.id, reason); update(next); return t("status.VERIFIED"); }} />
    </div>
  );
}
