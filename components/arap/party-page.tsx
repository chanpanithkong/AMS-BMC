"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Printer, Save, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, FormSkeleton, PageHeader } from "@/components/feedback/states";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { DateRangePicker } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UnsavedChangesGuard } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { customerInvoicesApi, customersApi, receiptsApi, supplierInvoicesApi, supplierPaymentsApi, suppliersApi } from "@/lib/api/endpoints/arap";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import type { AgingBuckets, Party, PartyInput } from "@/lib/api/types/arap";
import { useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { usePermission } from "@/lib/rbac/can";
import type { Permission } from "@/lib/rbac/permissions";
import { useUiStore } from "@/lib/stores/ui";
import { SIDE, useNameOf, type DocKind } from "./shared";

const BUCKETS: (keyof AgingBuckets)[] = ["current", "d1_30", "d31_60", "d61_90", "over_90", "total"];

export function PartyPage({ kind, id }: { kind: DocKind; id: string }) {
  const t = useTranslations();
  const companyId = useUiStore((s) => s.companyId);
  const apiOf = kind === "AR" ? customersApi : suppliersApi;
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["party", kind, id, companyId], queryFn: ({ signal }) => apiOf.get(id, signal), enabled: !isNew });
  if (isNew) return <div><PageHeader title={t(`${SIDE[kind].ns}.newParty`)} /><PartyForm kind={kind} party={null} /></div>;
  if (query.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("arap.parties.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <PartyView kind={kind} party={query.data} />;
}

function PartyView({ kind, party: p }: { kind: DocKind; party: Party }) {
  const t = useTranslations();
  const side = SIDE[kind];
  const nameOf = useNameOf();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const apiOf = kind === "AR" ? customersApi : suppliersApi;
  const canManage = usePermission(`${side.partyPerm}.manage` as Permission);
  const canApprove = usePermission("ap.supplier.approve");
  const [status, setStatus] = useState<Party["status"] | null>(null);
  const update = (next: Party) => {
    queryClient.setQueryData(["party", kind, next.id, useUiStore.getState().companyId], next);
    void queryClient.invalidateQueries({ queryKey: ["party-list", kind] });
    void queryClient.invalidateQueries({ queryKey: ["parties", kind] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const statusActions: Party["status"][] = kind === "AR"
    ? (canManage ? [p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"] : [])
    : (canApprove ? (p.status === "VERIFIED" ? ["BLOCKED"] : ["VERIFIED"]) : []);

  return (
    <div className="min-w-0 space-y-4" data-testid="party-page" data-status={p.status}>
      <PageHeader
        title={`${p.code} · ${nameOf(p)}`}
        badge={<StatusBadge status={p.status} />}
        description={p.name_km && p.name_km !== nameOf(p) ? p.name_km : p.name}
        actions={statusActions.map((s) => (
          <Button key={s} size="sm" variant={s === "BLOCKED" || s === "INACTIVE" ? "outline" : "default"} onClick={() => setStatus(s)} data-testid={`party-status-${s}`}>
            {t(`arap.parties.setStatus.${s}`)}
          </Button>
        ))}
      />
      <dl className="grid gap-3 sm:grid-cols-4" data-testid="party-summary">
        {[
          [t("arap.parties.col.balance"), format.amount(p.balance, "USD", { withCode: true })],
          [t("arap.parties.col.overdue"), format.amount(p.overdue, "USD", { withCode: true })],
          ...(kind === "AR" ? [[t("arap.parties.col.creditLimit"), p.credit_limit === null ? t("arap.credit.noLimit") : format.amount(p.credit_limit, "USD", { withCode: true })], [t("arap.credit.unapplied"), format.amount(p.unapplied, "USD", { withCode: true })]] : []),
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="amount text-left text-lg font-semibold">{v}</dd></div>
        ))}
      </dl>
      <Tabs defaultValue="details">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details">{t("arap.parties.tabs.details")}</TabsTrigger>
          {kind === "AP" && <TabsTrigger value="bank" data-testid="bank-tab">{t("arap.parties.tabs.bank")}</TabsTrigger>}
          <TabsTrigger value="documents">{t("arap.parties.tabs.documents")}</TabsTrigger>
          <TabsTrigger value="statement" data-testid="statement-tab">{t("arap.parties.tabs.statement")}</TabsTrigger>
          <TabsTrigger value="aging">{t("arap.parties.tabs.aging")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details"><PartyForm kind={kind} party={p} onSaved={update} readOnly={!canManage} /></TabsContent>
        {kind === "AP" && <TabsContent value="bank"><BankTab party={p} onChange={update} /></TabsContent>}
        <TabsContent value="documents"><DocumentsTab kind={kind} party={p} /></TabsContent>
        <TabsContent value="statement"><StatementTab kind={kind} party={p} /></TabsContent>
        <TabsContent value="aging"><AgingTab kind={kind} party={p} /></TabsContent>
      </Tabs>
      <ConfirmActionDialog
        open={status !== null} onOpenChange={(o) => !o && setStatus(null)} action={status === "BLOCKED" || status === "INACTIVE" ? "reject" : "approve"}
        requireReason={status === "BLOCKED"} title={status ? t(`arap.parties.setStatus.${status}`) : ""} description={`${p.code} · ${nameOf(p)}`}
        effect={{ currency: "USD" }} thresholdAmount="0"
        onConfirm={async ({ reason }) => { const next = await apiOf.setStatus(p.id, status!, reason); update(next); return t(`status.${next.status}`); }}
      />
    </div>
  );
}

const toInput = (p: Party | null, kind: DocKind): PartyInput => ({
  code: p?.code ?? "", name: p?.name ?? "", name_km: p?.name_km ?? "", tax_id: p?.tax_id ?? "", email: p?.email ?? "", phone: p?.phone ?? "",
  address: p?.address ?? "", currency: p?.currency ?? "USD", payment_terms_days: p?.payment_terms_days ?? 30,
  credit_limit: kind === "AR" ? p?.credit_limit ?? "" : null, default_account_id: p?.default_account_id ?? (kind === "AR" ? "acc-4100" : null),
  notes: p?.notes ?? "", contacts: p?.contacts ?? [],
});

function PartyForm({ kind, party, onSaved, readOnly }: { kind: DocKind; party: Party | null; onSaved?: (p: Party) => void; readOnly?: boolean }) {
  const t = useTranslations();
  const side = SIDE[kind];
  const router = useAppRouter();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const apiOf = kind === "AR" ? customersApi : suppliersApi;
  const [value, setValue] = useState<PartyInput>(() => toInput(party, kind));
  const [bank, setBank] = useState({ bank_name: "", account_name: "", account_number: "" });
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const set = (patch: Partial<PartyInput>) => { setValue((v) => ({ ...v, ...patch })); setDirty(true); };
  const accountFilter = (a: Account) => (side.accountTypes as readonly string[]).includes(a.type) && !["AR", "AP", "BANK", "TAX"].includes(a.control_module ?? "");

  const save = useMutation({
    mutationFn: () => {
      setErrors({});
      setFailure(null);
      const input = { ...value, credit_limit: value.credit_limit || null };
      if (party) return apiOf.update(party.id, input, party.version);
      return kind === "AP" && bank.account_number ? suppliersApi.create({ ...input, bank }) : apiOf.create(input);
    },
    onSuccess: (next) => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["party-list", kind] });
      void queryClient.invalidateQueries({ queryKey: ["parties", kind] });
      toast.success(t("arap.toast.partySaved"));
      if (!party) {
        // Next keeps the /new page alive in the background: start it blank for the next visit.
        setValue(toInput(null, kind));
        setBank({ bank_name: "", account_name: "", account_number: "" });
        router.replace(`${side.partyPath}/${next.id}`);
      }
      else onSaved?.(next);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
      if (isApiError(error)) setErrors(error.fieldErrors);
      setFailure(describe(error).message);
    },
  });
  const field = (name: keyof PartyInput, label: string, extra: { required?: boolean; className?: string; type?: string } = {}) => (
    <FormField id={`party-${name}`} label={label} required={extra.required} error={errors[name]} className={extra.className}>
      <Input id={`party-${name}`} type={extra.type ?? "text"} value={String(value[name] ?? "")} disabled={readOnly}
        onChange={(e) => set({ [name]: extra.type === "number" ? Number(e.target.value) : e.target.value } as Partial<PartyInput>)}
        aria-invalid={Boolean(errors[name])} aria-describedby={describedBy(`party-${name}`, errors[name])} />
    </FormField>
  );

  return (
    <form className="space-y-4" data-testid="party-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <UnsavedChangesGuard dirty={dirty && !save.isPending} />
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        {field("code", t("arap.parties.form.code"), { required: true })}
        {field("name", t("arap.parties.form.name"), { required: true })}
        {field("name_km", t("arap.parties.form.nameKm"))}
        {field("tax_id", t("arap.parties.form.taxId"))}
        {field("email", t("arap.parties.form.email"), { type: "email" })}
        {field("phone", t("arap.parties.form.phone"))}
        {field("address", t("arap.parties.form.address"), { className: "sm:col-span-2 lg:col-span-3" })}
        <FormField id="party-currency" label={t("arap.form.currency")}>
          <NativeSelect id="party-currency" value={value.currency} disabled={readOnly} onChange={(e) => set({ currency: e.target.value })}>
            <option value="USD">USD</option><option value="KHR">KHR</option>
          </NativeSelect>
        </FormField>
        {field("payment_terms_days", t("arap.form.terms"), { type: "number" })}
        {kind === "AR" && (
          <FormField id="party-credit" label={t("arap.parties.form.creditLimit")} hint={t("arap.parties.form.creditHint")} error={errors.credit_limit}>
            <AmountInput id="party-credit" currency="USD" value={value.credit_limit ?? ""} disabled={readOnly} onValueChange={(credit_limit) => set({ credit_limit })} aria-describedby={describedBy("party-credit", errors.credit_limit, "x")} />
          </FormField>
        )}
        <FormField id="party-account" label={t(`${side.ns}.defaultAccount`)}>
          <AccountPicker id="party-account" value={value.default_account_id} onChange={(default_account_id) => set({ default_account_id })} filter={accountFilter} disabled={readOnly} />
        </FormField>
        <FormField id="party-notes" label={t("arap.form.notes")} className="sm:col-span-2 lg:col-span-3">
          <Textarea id="party-notes" rows={2} value={value.notes} disabled={readOnly} onChange={(e) => set({ notes: e.target.value })} />
        </FormField>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4" aria-labelledby="contacts-title">
        <h2 id="contacts-title" className="text-sm font-semibold">{t("arap.parties.contacts.title")}</h2>
        {value.contacts.length === 0 && <p className="text-sm text-muted-foreground">{t("arap.parties.contacts.empty")}</p>}
        {value.contacts.map((c, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]" data-testid="contact-row">
            {(["name", "role", "phone", "email"] as const).map((k) => (
              <Input key={k} value={c[k]} disabled={readOnly} aria-label={t(`arap.parties.contacts.${k}`, { n: i + 1 })} placeholder={t(`arap.parties.contacts.${k}`, { n: i + 1 })}
                onChange={(e) => set({ contacts: value.contacts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} />
            ))}
            {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label={t("arap.parties.contacts.remove", { n: i + 1 })} onClick={() => set({ contacts: value.contacts.filter((_, j) => j !== i) })}><Trash2 aria-hidden /></Button>}
          </div>
        ))}
        {!readOnly && <Button type="button" size="sm" variant="outline" onClick={() => set({ contacts: [...value.contacts, { name: "", role: "", phone: "", email: "" }] })}><Plus aria-hidden />{t("arap.parties.contacts.add")}</Button>}
      </section>

      {kind === "AP" && !party && (
        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3" aria-labelledby="new-bank-title">
          <h2 id="new-bank-title" className="text-sm font-semibold sm:col-span-3">{t("arap.bank.title")}</h2>
          {(["bank_name", "account_name", "account_number"] as const).map((k) => (
            <FormField key={k} id={`new-${k}`} label={t(`arap.bank.${k}`)}>
              <Input id={`new-${k}`} value={bank[k]} onChange={(e) => { setBank((b) => ({ ...b, [k]: e.target.value })); setDirty(true); }} />
            </FormField>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-3">{t("arap.bank.newHint")}</p>
        </section>
      )}

      {failure && <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{failure}</p>}
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending} data-testid="party-save">{save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{t("common.save")}</Button>
        </div>
      )}
    </form>
  );
}

/** Supplier bank details: masked numbers, verification status and the approval of changes (BR-AP-005). */
function BankTab({ party: p, onChange }: { party: Party; onChange: (p: Party) => void }) {
  const t = useTranslations();
  const userName = useSession((s) => s.user?.full_name);
  const errorToast = useErrorToast();
  const canManage = usePermission("ap.supplier.manage");
  const canApprove = usePermission("ap.supplier.approve");
  const [form, setForm] = useState<{ bank_name: string; account_name: string; account_number: string } | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const request = useMutation({
    mutationFn: () => suppliersApi.requestBankChange(p.id, form!),
    onSuccess: (next) => { setForm(null); onChange(next); toast.success(t("arap.bank.requested")); },
    onError: errorToast,
  });
  const pending = p.bank?.pending;
  const own = pending?.requested_by === userName;
  return (
    <div className="space-y-3" data-testid="bank-details">
      {p.bank ? (
        <dl className="grid gap-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">{t("arap.bank.bank_name")}</dt><dd className="font-medium">{p.bank.bank_name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("arap.bank.account_name")}</dt><dd className="font-medium">{p.bank.account_name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("arap.bank.account_number")}</dt><dd className="font-mono font-medium" data-testid="bank-number">{p.bank.account_number}</dd></div>
          <p className="flex items-center gap-2 sm:col-span-3">
            {p.status === "VERIFIED" && !pending ? <ShieldCheck className="size-4 text-success" aria-hidden /> : <ShieldAlert className="size-4 text-warning" aria-hidden />}
            {pending ? t("arap.bank.statusPending") : p.status === "VERIFIED" ? t("arap.bank.statusVerified") : t("arap.bank.statusUnverified")}
          </p>
        </dl>
      ) : <EmptyState title={t("arap.bank.none")} className="rounded-xl border py-8" />}
      {pending && (
        <section className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" aria-labelledby="pending-title" data-testid="bank-pending">
          <h2 id="pending-title" className="font-semibold">{t("arap.bank.pendingTitle")}</h2>
          <p>{pending.bank_name} · {pending.account_name} · <span className="font-mono">{pending.account_number}</span></p>
          <p className="text-xs text-muted-foreground">{t("arap.bank.requestedBy", { name: pending.requested_by })}</p>
          <p className="mt-1">{t("arap.bank.paymentsHeld")}</p>
          {canApprove && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDecision("reject")} disabled={own}>{t("arap.actions.reject")}</Button>
              <Button size="sm" onClick={() => setDecision("approve")} disabled={own} data-testid="approve-bank">{t("arap.actions.approve")}</Button>
              {own && <span className="self-center text-xs">{t("workflow.sod.violation")}</span>}
            </div>
          )}
        </section>
      )}
      {canManage && !pending && !form && <Button size="sm" variant="outline" onClick={() => setForm({ bank_name: "", account_name: p.name, account_number: "" })} data-testid="change-bank">{t("arap.bank.change")}</Button>}
      {form && (
        <form className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
          {(["bank_name", "account_name", "account_number"] as const).map((k) => (
            <FormField key={k} id={`bank-${k}`} label={t(`arap.bank.${k}`)} required>
              <Input id={`bank-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required />
            </FormField>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-3">{t("arap.bank.changeHint")}</p>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" variant="outline" onClick={() => setForm(null)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={request.isPending}>{t("arap.bank.request")}</Button>
          </div>
        </form>
      )}
      <ConfirmActionDialog
        open={decision !== null} onOpenChange={(o) => !o && setDecision(null)} action={decision ?? "approve"} title={t("arap.bank.pendingTitle")}
        description={pending ? `${pending.bank_name} · ${pending.account_number}` : ""} effect={{ currency: "USD" }} thresholdAmount="0" reasonLabel={t("common.comment")}
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await suppliersApi.decideBankChange(p.id, decision!, reason, idempotencyKey); onChange(next); return t("arap.bank.decided"); }}
      />
    </div>
  );
}

function DocumentsTab({ kind, party }: { kind: DocKind; party: Party }) {
  const t = useTranslations();
  const side = SIDE[kind];
  const format = useFormatters();
  const invoices = useQuery({ queryKey: ["invoices", kind, "party", party.id], queryFn: ({ signal }) => (kind === "AR" ? customerInvoicesApi : supplierInvoicesApi).list({ party_id: party.id, limit: 200 }, signal) });
  const payments = useQuery({ queryKey: ["payments", kind, "party", party.id], queryFn: ({ signal }) => (kind === "AR" ? receiptsApi : supplierPaymentsApi).list({ party_id: party.id, limit: 200 }, signal), retry: false });
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[
        { title: t(`${side.ns}.invoicesTitle`), rows: invoices.data?.data.map((d) => ({ id: d.id, href: `${side.invoicePath}/${d.id}`, number: d.number ?? t("arap.invoices.draftNo"), date: d.date, amount: d.total, currency: d.currency, status: d.status })) },
        { title: t(`${side.ns}.paymentsTitle`), rows: payments.data?.data.map((d) => ({ id: d.id, href: `${side.paymentPath}/${d.id}`, number: d.number ?? t("arap.invoices.draftNo"), date: d.date, amount: d.amount, currency: d.currency, status: d.status })) },
      ].map((block) => (
        <section key={block.title} className="min-w-0 rounded-xl border bg-card" aria-label={block.title}>
          <h2 className="border-b px-3 py-2 text-sm font-semibold">{block.title}</h2>
          {!block.rows?.length ? <p className="p-3 text-sm text-muted-foreground">{t("arap.parties.noDocuments")}</p> : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{block.title}</caption>
                <thead><tr><th scope="col" className={head}>{t("arap.invoices.col.number")}</th><th scope="col" className={head}>{t("arap.invoices.col.date")}</th><th scope="col" className={`${head} text-right`}>{t("arap.invoices.col.total")}</th><th scope="col" className={head}>{t("arap.invoices.col.status")}</th></tr></thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-2 py-1.5"><AppLink href={r.href} className="font-medium text-primary hover:underline">{r.number}</AppLink></td>
                      <td className="px-2 py-1.5 tabular-nums">{format.date(r.date)}</td>
                      <td className="px-2 py-1.5"><AmountText value={r.amount} currency={r.currency} withCode /></td>
                      <td className="px-2 py-1.5"><StatusBadge status={r.status as Parameters<typeof StatusBadge>[0]["status"]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** Statement of account (FR-AR-016, FR-AP-014) with opening, running and closing balance; printable. */
function StatementTab({ kind, party }: { kind: DocKind; party: Party }) {
  const t = useTranslations();
  const format = useFormatters();
  const nameOf = useNameOf();
  const today = todayBusinessDate();
  const [range, setRange] = useState({ from: `${today.slice(0, 4)}-01-01`, to: today });
  const statement = useQuery({
    queryKey: ["statement", kind, party.id, range.from, range.to],
    queryFn: ({ signal }) => (kind === "AR" ? customersApi : suppliersApi).statement(party.id, range.from, range.to, signal),
    enabled: Boolean(range.from && range.to),
  });
  const s = statement.data;
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="space-y-3" data-print="main">
      <div className="flex flex-wrap items-end gap-2" data-print="hide">
        <DateRangePicker idPrefix="stmt" value={range} onChange={(r) => setRange({ from: r.from, to: r.to })} />
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer aria-hidden />{t("arap.actions.print")}</Button>
      </div>
      {statement.isError && <ErrorState error={statement.error} onRetry={() => statement.refetch()} />}
      {s && (
        <section className="space-y-2" data-testid="statement" aria-label={t("arap.statement.title")}>
          <header className="hidden print:block">
            <p className="text-lg font-semibold">{t("arap.statement.title")} — {party.code} {nameOf(party)}</p>
            <p>{format.date(s.date_from)} – {format.date(s.date_to)}</p>
          </header>
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t("arap.statement.title")}</caption>
              <thead className="bg-muted/50"><tr>
                <th scope="col" className={head}>{t("arap.statement.date")}</th><th scope="col" className={head}>{t("arap.statement.type")}</th>
                <th scope="col" className={head}>{t("arap.statement.number")}</th><th scope="col" className={head}>{t("arap.statement.description")}</th>
                <th scope="col" className={`${head} text-right`}>{t("arap.statement.debit")}</th><th scope="col" className={`${head} text-right`}>{t("arap.statement.credit")}</th>
                <th scope="col" className={`${head} text-right`}>{t("arap.statement.balance")} ({s.currency})</th>
              </tr></thead>
              <tbody>
                <tr className="border-t font-medium"><td className="px-2 py-1.5" colSpan={6}>{t("arap.statement.opening")}</td><td className="px-2 py-1.5"><AmountText value={s.opening} currency={s.currency} /></td></tr>
                {s.lines.map((l, i) => (
                  <tr key={`${l.doc_id}-${i}`} className="border-t">
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{format.date(l.date)}</td>
                    <td className="px-2 py-1.5">{t(`arap.statement.types.${l.type}`)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{l.number}</td>
                    <td className="px-2 py-1.5">{l.description}</td>
                    <td className="px-2 py-1.5"><AmountText value={l.debit} currency={s.currency} blankZero /></td>
                    <td className="px-2 py-1.5"><AmountText value={l.credit} currency={s.currency} blankZero /></td>
                    <td className="px-2 py-1.5"><AmountText value={l.balance} currency={s.currency} /></td>
                  </tr>
                ))}
                <tr className="border-t font-semibold"><td className="px-2 py-1.5" colSpan={6}>{t("arap.statement.closing")}</td><td className="px-2 py-1.5" data-testid="statement-closing"><AmountText value={s.closing} currency={s.currency} /></td></tr>
              </tbody>
            </table>
          </div>
          <AgingRow buckets={s.aging} />
        </section>
      )}
    </div>
  );
}

function AgingRow({ buckets }: { buckets: AgingBuckets }) {
  const t = useTranslations("arap.aging");
  const format = useFormatters();
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="aging-buckets">
      {BUCKETS.map((b) => (
        <div key={b} className="rounded-lg border bg-card p-2">
          <dt className="text-xs text-muted-foreground">{t(`bucket.${b}`)}</dt>
          <dd className={`amount text-left font-medium ${b === "over_90" && D(buckets[b]).gt(0) ? "text-destructive" : ""}`}>{format.amount(buckets[b], "USD")}</dd>
        </div>
      ))}
    </dl>
  );
}

function AgingTab({ kind, party }: { kind: DocKind; party: Party }) {
  const t = useTranslations();
  const today = todayBusinessDate();
  const statement = useQuery({
    queryKey: ["statement", kind, party.id, `${today.slice(0, 4)}-01-01`, today],
    queryFn: ({ signal }) => (kind === "AR" ? customersApi : suppliersApi).statement(party.id, `${today.slice(0, 4)}-01-01`, today, signal),
  });
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("arap.aging.asOfNote")}</p>
      {statement.data && <AgingRow buckets={statement.data.aging} />}
    </div>
  );
}
