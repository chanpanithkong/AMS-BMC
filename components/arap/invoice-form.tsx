"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Save, Send, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { DateInput } from "@/components/finance/date-range-picker";
import { TotalsPanel } from "@/components/finance/totals-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UnsavedChangesGuard } from "@/components/workflow/approval";
import { ReasonDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { customerInvoicesApi, supplierInvoicesApi } from "@/lib/api/endpoints/arap";
import { expensesApi } from "@/lib/api/endpoints/cashbank";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { Invoice, InvoiceInput, Party } from "@/lib/api/types/arap";
import { todayBusinessDate } from "@/lib/format/dates";
import { useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { addDays } from "@/lib/money/invoice";
import { usePermission } from "@/lib/rbac/can";
import type { Permission } from "@/lib/rbac/permissions";
import { emptyLine, InvoiceLinesEditor, SIDE, useDocumentAmounts, useNameOf, useParties, useTaxCodes, type DocKind } from "./shared";

/** Credit position of a customer (SCR-09): limit, balance, overdue and what this invoice would do. */
export function CreditPanel({ party, invoiceTotalBase }: { party: Party; invoiceTotalBase: string }) {
  const t = useTranslations("arap.credit");
  const format = useFormatters();
  const after = D(party.balance).plus(invoiceTotalBase);
  const over = party.credit_limit !== null && after.gt(party.credit_limit);
  return (
    <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="credit-title" data-testid="credit-panel">
      <h2 id="credit-title" className="mb-2 font-semibold">{t("title")}</h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">{t("limit")}</dt><dd className="amount">{party.credit_limit === null ? t("noLimit") : format.amount(party.credit_limit, "USD", { withCode: true })}</dd>
        <dt className="text-muted-foreground">{t("balance")}</dt><dd className="amount">{format.amount(party.balance, "USD", { withCode: true })}</dd>
        <dt className="text-muted-foreground">{t("overdue")}</dt><dd className={D(party.overdue).gt(0) ? "amount text-destructive" : "amount"}>{format.amount(party.overdue, "USD", { withCode: true })}</dd>
        {D(party.unapplied).gt(0) && <><dt className="text-muted-foreground">{t("unapplied")}</dt><dd className="amount">{format.amount(party.unapplied, "USD", { withCode: true })}</dd></>}
        <dt className="text-muted-foreground">{t("after")}</dt><dd className="amount font-medium">{format.amount(after, "USD", { withCode: true })}</dd>
      </dl>
      {over && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2" role="status" data-testid="credit-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{t("over")}
        </p>
      )}
    </section>
  );
}

function SupplierPanel({ party }: { party: Party }) {
  const t = useTranslations("arap.supplierPanel");
  return (
    <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="sup-title" data-testid="supplier-panel">
      <h2 id="sup-title" className="mb-2 font-semibold">{t("title")}</h2>
      <p className="flex items-center gap-2">{t("status")} <StatusBadge status={party.status} /></p>
      {party.bank && <p className="mt-1">{party.bank.bank_name} · <span className="font-mono">{party.bank.account_number}</span></p>}
      {party.bank?.pending && <p className="mt-2 flex items-start gap-2 text-warning" role="status"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{t("bankPending")}</p>}
      {party.status !== "VERIFIED" && <p className="mt-2 text-warning" role="status">{t("notVerified")}</p>}
    </section>
  );
}

const toInput = (inv: Invoice | null, kind: DocKind): InvoiceInput => ({
  party_id: inv?.party_id ?? "", supplier_invoice_no: kind === "AP" ? inv?.supplier_invoice_no ?? "" : null, date: inv?.date ?? todayBusinessDate(),
  received_date: kind === "AP" ? inv?.received_date ?? todayBusinessDate() : null, terms_days: inv?.terms_days ?? 30, currency: inv?.currency ?? "USD",
  reference: inv?.reference ?? "", notes: inv?.notes ?? "", duplicate_reason: inv?.duplicate_reason ?? null,
  lines: inv?.lines.length ? inv.lines.map((l) => ({ ...l, discount: D(l.discount).isZero() ? "" : l.discount })) : [emptyLine()],
});

/** SCR-09 customer invoice and SCR-11 supplier invoice entry. */
export function InvoiceForm({ kind, invoice, onSaved }: { kind: DocKind; invoice: Invoice | null; onSaved?: (inv: Invoice) => void }) {
  const t = useTranslations();
  const side = SIDE[kind];
  const router = useAppRouter();
  const format = useFormatters();
  const nameOf = useNameOf();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const canSubmit = usePermission(`${side.perm}.submit` as Permission);
  const { data: parties } = useParties(kind);
  const { data: codes } = useTaxCodes(kind);
  const { data: departments } = useDepartments();
  const apiOf = kind === "AR" ? customerInvoicesApi : supplierInvoicesApi;

  const [value, setValue] = useState<InvoiceInput>(() => toInput(invoice, kind));
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; reference: string | null } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [askReason, setAskReason] = useState<string | null>(null);
  const saved = useRef<{ id: string; version: number } | null>(invoice ? { id: invoice.id, version: invoice.version } : null);
  const set = (patch: Partial<InvoiceInput>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };

  const party = parties?.find((p) => p.id === value.party_id);
  const choosable = parties?.filter((p) => (kind === "AR" ? p.status === "ACTIVE" : p.status !== "BLOCKED") || p.id === value.party_id) ?? [];
  const { totals } = useDocumentAmounts(value.lines, codes, value.date, value.currency);
  const dp = value.currency === "KHR" ? 0 : 2;
  const dueDate = addDays(value.date, Number(value.terms_days) || 0);
  const totalBase = value.currency === "USD" ? totals.total.toFixed(2) : invoice?.total_base ?? "0";

  // BR-AP-001: check the supplier's invoice number as soon as it is entered.
  const [checkedNo, setCheckedNo] = useState(kind === "AP" ? `${value.party_id}|${value.supplier_invoice_no}` : "");
  const duplicate = useQuery({
    queryKey: ["dup-check", checkedNo, invoice?.id],
    queryFn: ({ signal }) => {
      const [party_id, no] = checkedNo.split("|");
      return supplierInvoicesApi.duplicateCheck({ party_id, supplier_invoice_no: no, exclude_id: invoice?.id }, signal);
    },
    enabled: kind === "AP" && /\|.+/.test(checkedNo) && !checkedNo.startsWith("|"),
  });
  const exact = duplicate.data?.exact && checkedNo === `${value.party_id}|${value.supplier_invoice_no}` ? duplicate.data.exact : null;

  const firstLine = value.lines.find((l) => l.account_id);
  const spending = useQuery({
    queryKey: ["spending", firstLine?.account_id, firstLine?.department_id ?? null, value.date],
    queryFn: () => expensesApi.spending(firstLine!.account_id!, firstLine!.department_id ?? null, value.date),
    enabled: kind === "AP" && Boolean(firstLine?.account_id && value.date),
    retry: false,
  });

  const errors = {
    party_id: !value.party_id ? t("arap.form.required") : fieldErrors.party_id,
    date: !value.date ? t("arap.form.required") : fieldErrors.date,
    supplier_invoice_no: kind === "AP" && !value.supplier_invoice_no?.trim() ? t("arap.form.required") : fieldErrors.supplier_invoice_no,
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  const choose = (id: string) => {
    const p = parties?.find((x) => x.id === id);
    set({
      party_id: id, terms_days: p?.payment_terms_days ?? value.terms_days, currency: p?.currency ?? value.currency,
      lines: value.lines.map((l) => (l.account_id || !p?.default_account_id ? l : { ...l, account_id: p.default_account_id })),
    });
    if (kind === "AP" && value.supplier_invoice_no) setCheckedNo(`${id}|${value.supplier_invoice_no}`);
  };

  const mutation = useMutation({
    mutationFn: async ({ mode, reason }: { mode: "save" | "submit"; reason?: string }) => {
      setServerError(null);
      setFieldErrors({});
      const input = { ...value, due_date: dueDate, duplicate_reason: reason ?? value.duplicate_reason };
      const current = saved.current;
      let result = current ? await apiOf.update(current.id, input, current.version) : await apiOf.create(input);
      saved.current = { id: result.id, version: result.version };
      setDirty(false);
      if (mode === "submit") result = await apiOf.submit(result.id);
      return { result, mode };
    },
    onSuccess: ({ result, mode }) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices", kind] });
      void queryClient.invalidateQueries({ queryKey: ["parties", kind] });
      queryClient.setQueryData(["invoice", kind, result.id], result);
      toast.success(mode === "save" ? t("arap.toast.saved") : t("arap.toast.submitted"));
      if (!invoice) {
        // Next keeps the /new page alive in the background: start it blank for the next visit.
        saved.current = null;
        setValue(toInput(null, kind));
        setTouched(false);
        router.replace(`${side.invoicePath}/${result.id}`);
      }
      else onSaved?.(result);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
      setTouched(true);
      if (isApiError(error) && error.details[0]?.issue === "possible_duplicate") {
        setAskReason(error.details[0].value ?? "");
        return;
      }
      const d = describe(error);
      const detail = isApiError(error) ? error.details[0] : undefined;
      if (isApiError(error)) setFieldErrors(error.fieldErrors);
      setServerError({ message: isApiError(error) && error.code === "VALIDATION_ERROR" && detail?.message ? detail.message : d.message, reference: d.reference });
    },
  });

  const run = (mode: "save" | "submit") => {
    setTouched(true);
    if (mode === "submit" && (Object.values(errors).some(Boolean) || !totals.total.gt(0))) return;
    if (exact) return;
    mutation.mutate({ mode });
  };

  const routeText = kind === "AP"
    ? (D(totalBase).gt("5000") ? t("arap.route.apTwo") : t("arap.route.apOne"))
    : party && party.credit_limit !== null && D(party.balance).plus(totalBase).gt(party.credit_limit) ? t("arap.route.arCredit") : t("arap.route.arOne");

  return (
    <div className="space-y-4" data-testid="invoice-form">
      <UnsavedChangesGuard dirty={dirty && !mutation.isPending} />
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="inv-party" label={t(`${side.ns}.party`)} required error={show("party_id")} className="sm:col-span-2 lg:col-span-1">
            <NativeSelect id="inv-party" value={value.party_id} onChange={(e) => choose(e.target.value)} aria-invalid={Boolean(show("party_id"))} aria-describedby={describedBy("inv-party", show("party_id"))}>
              <option value="">{t("arap.form.select")}</option>
              {choosable.map((p) => <option key={p.id} value={p.id}>{p.code} · {nameOf(p)}</option>)}
            </NativeSelect>
          </FormField>
          {kind === "AP" && (
            <FormField id="inv-supplier-no" label={t("arap.form.supplierNo")} required error={exact ? t("arap.form.duplicate", { number: exact.number ?? exact.supplier_invoice_no, date: format.date(exact.date) }) : show("supplier_invoice_no")}>
              <Input
                id="inv-supplier-no" value={value.supplier_invoice_no ?? ""} onChange={(e) => set({ supplier_invoice_no: e.target.value })}
                onBlur={() => setCheckedNo(`${value.party_id}|${(value.supplier_invoice_no ?? "").trim()}`)}
                aria-invalid={Boolean(exact || show("supplier_invoice_no"))} aria-describedby={describedBy("inv-supplier-no", exact ? "x" : show("supplier_invoice_no"))}
                data-testid="supplier-invoice-no"
              />
            </FormField>
          )}
          <FormField id="inv-date" label={t("arap.form.date")} required error={show("date")}>
            <DateInput id="inv-date" value={value.date} onValueChange={(date) => set({ date })} />
          </FormField>
          {kind === "AP" && (
            <FormField id="inv-received" label={t("arap.form.receivedDate")}>
              <DateInput id="inv-received" value={value.received_date ?? ""} onValueChange={(received_date) => set({ received_date })} />
            </FormField>
          )}
          <FormField id="inv-terms" label={t("arap.form.terms")} hint={dueDate ? t("arap.form.dueOn", { date: format.date(dueDate) }) : undefined}>
            <Input id="inv-terms" type="number" min={0} max={365} value={value.terms_days} onChange={(e) => set({ terms_days: Number(e.target.value) })} aria-describedby="inv-terms-hint" />
          </FormField>
          <FormField id="inv-currency" label={t("arap.form.currency")} hint={value.currency !== "USD" ? t("arap.form.rateHint") : undefined}>
            <NativeSelect id="inv-currency" value={value.currency} onChange={(e) => set({ currency: e.target.value })} aria-describedby={value.currency !== "USD" ? "inv-currency-hint" : undefined}>
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </NativeSelect>
          </FormField>
          <FormField id="inv-reference" label={t("arap.form.reference")}>
            <Input id="inv-reference" value={value.reference} onChange={(e) => set({ reference: e.target.value })} />
          </FormField>
          <FormField id="inv-notes" label={t("arap.form.notes")} className="sm:col-span-2 lg:col-span-3">
            <Textarea id="inv-notes" rows={2} value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
          </FormField>
        </section>
        <aside className="space-y-3">
          {party && kind === "AR" && <CreditPanel party={party} invoiceTotalBase={totalBase} />}
          {party && kind === "AP" && <SupplierPanel party={party} />}
          <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="route-title" data-testid="approval-route">
            <h2 id="route-title" className="mb-1 font-semibold">{t("arap.route.title")}</h2>
            <p>{routeText}</p>
          </section>
          {kind === "AP" && firstLine?.account_id && (
            <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="budget-title" data-testid="budget-panel">
              <h2 id="budget-title" className="mb-1 font-semibold">{t("exp.budget.title")}</h2>
              {spending.data && (
                <p>{t("exp.budget.spent", {
                  account: spending.data.account_code,
                  department: firstLine.department_id ? nameOf(departments?.find((d) => d.id === firstLine.department_id)) : t("exp.budget.allDepartments"),
                  amount: format.amount(spending.data.year_to_date, "USD", { withCode: true }),
                })}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{t("exp.budget.noBudget")}</p>
            </section>
          )}
        </aside>
      </div>

      <InvoiceLinesEditor
        kind={kind} lines={value.lines} onChange={(lines) => set({ lines })} currency={value.currency} date={value.date} errors={fieldErrors}
        newLine={() => emptyLine({ account_id: party?.default_account_id ?? null, tax_code_id: value.lines[value.lines.length - 1]?.tax_code_id ?? null })}
      />

      <TotalsPanel
        currency={value.currency}
        preview
        rows={[
          { label: t("arap.totals.subtotal"), value: totals.subtotal.toFixed(dp) },
          { label: t("arap.totals.discount"), value: totals.discount.negated().toFixed(dp) },
          { label: t("arap.totals.tax"), value: totals.tax.toFixed(dp) },
          { label: t("arap.totals.total"), value: totals.total.toFixed(dp), emphasis: true },
        ]}
        baseEquivalent={value.currency !== "USD" && invoice ? { value: invoice.total_base, currency: "USD" } : undefined}
      />

      {serverError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="invoice-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div><p>{serverError.message}</p>{serverError.reference && <p className="font-mono text-xs">{t("errors.reference", { id: serverError.reference })}</p>}</div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => run("save")} disabled={mutation.isPending || Boolean(exact)} data-testid="invoice-save">
          {mutation.isPending && mutation.variables?.mode === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t("arap.actions.saveDraft")}
        </Button>
        {canSubmit && (
          <Button onClick={() => run("submit")} disabled={mutation.isPending || Boolean(exact)} data-testid="invoice-submit">
            {mutation.isPending && mutation.variables?.mode === "submit" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {t("arap.actions.submit")}
          </Button>
        )}
      </div>

      <ReasonDialog
        open={askReason !== null}
        onOpenChange={(open) => !open && setAskReason(null)}
        title={t("arap.duplicate.title")}
        description={t("arap.duplicate.description", { number: askReason ?? "" })}
        onSubmit={(reason) => {
          set({ duplicate_reason: reason });
          mutation.mutate({ mode: "submit", reason });
        }}
      />
    </div>
  );
}
