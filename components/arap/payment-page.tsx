"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, Loader2, Printer, Save, Send, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccountLabel, useCashBankAccounts, useHistoryLabel } from "@/components/cb/use-cash-bank";
import { EmptyState, ErrorState, FormSkeleton, PageHeader } from "@/components/feedback/states";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AllocationGrid } from "@/components/finance/allocation-grid";
import { AmountInput } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApprovalTimeline, HistoryPanel, SoDIndicator, UnsavedChangesGuard } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { customerInvoicesApi, customersApi, receiptsApi, supplierInvoicesApi, supplierPaymentsApi, suppliersApi } from "@/lib/api/endpoints/arap";
import { isApiError } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import { useFormatters } from "@/lib/api/hooks";
import type { Party, PartyPayment, PartyPaymentInput } from "@/lib/api/types/arap";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import type { Allocations, OpenInvoice } from "@/lib/money/allocation";
import { allocatedTotal, checkAllocations } from "@/lib/money/allocation";
import { D } from "@/lib/money/decimal";
import { amountInWords } from "@/lib/money/words";
import { usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { Explained, Note } from "./invoice-page";
import { SIDE, useNameOf, useParties, type DocKind } from "./shared";

type Dialog = "post" | "approve" | "reject" | "release" | "cancel" | "allocate" | null;

function useOpenInvoices(side: DocKind, partyId: string) {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({
    queryKey: ["open-invoices", side, partyId, companyId],
    queryFn: ({ signal }) => (side === "AR" ? customerInvoicesApi : supplierInvoicesApi).list({ party_id: partyId, open: true, limit: 200 }, signal),
    enabled: Boolean(partyId),
    select: (page): OpenInvoice[] => page.data.map((d) => ({ id: d.id, number: d.number ?? "", date: d.date, due_date: d.due_date, currency: d.currency, outstanding: d.outstanding, rate: d.rate })),
  });
}

function useParty(side: DocKind, partyId: string) {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({
    queryKey: ["party", side, partyId, companyId],
    queryFn: ({ signal }) => (side === "AR" ? customersApi : suppliersApi).get(partyId, signal),
    enabled: Boolean(partyId),
  });
}

/** Supplier bank details as the payment will use them, masked, with their verification state (SCR-12). */
function PayToPanel({ supplier }: { supplier: Party }) {
  const t = useTranslations("arap.payTo");
  const ok = supplier.status === "VERIFIED" && supplier.bank && !supplier.bank.pending;
  return (
    <section className={`rounded-xl border p-4 text-sm ${ok ? "bg-card" : "border-warning/40 bg-warning/10"}`} aria-labelledby="payto-title" data-testid="pay-to">
      <h2 id="payto-title" className="mb-1 font-semibold">{t("title")}</h2>
      {supplier.bank ? <p>{supplier.bank.bank_name} · {supplier.bank.account_name} · <span className="font-mono">{supplier.bank.account_number}</span></p> : <p>{t("none")}</p>}
      <p className="mt-1 flex items-center gap-1.5">
        {ok ? <ShieldCheck className="size-4 text-success" aria-hidden /> : <ShieldAlert className="size-4 text-warning" aria-hidden />}
        {supplier.bank?.pending ? t("pending") : supplier.status === "VERIFIED" ? t("verified") : t("unverified")}
      </p>
    </section>
  );
}

export function PaymentPage({ side, id }: { side: DocKind; id: string }) {
  const t = useTranslations();
  const isNew = id === "new";
  const apiOf = side === "AR" ? receiptsApi : supplierPaymentsApi;
  const query = useQuery({ queryKey: ["payment", side, id], queryFn: ({ signal }) => apiOf.get(id, signal), enabled: !isNew });
  if (isNew) return <div><PageHeader title={t(`${SIDE[side].ns}.newPayment`)} /><PaymentForm side={side} payment={null} /></div>;
  if (query.isPending) return <FormSkeleton fields={6} />;
  if (query.isError) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("arap.payments.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return <PaymentView side={side} payment={query.data} />;
}

const toAllocations = (p: PartyPayment | null): Allocations => Object.fromEntries((p?.allocations ?? []).map((a) => [a.invoice_id, a.amount]));

function PaymentForm({ side, payment, onSaved }: { side: DocKind; payment: PartyPayment | null; onSaved?: (p: PartyPayment) => void }) {
  const t = useTranslations();
  const ns = SIDE[side].ns;
  const router = useAppRouter();
  const nameOf = useNameOf();
  const format = useFormatters();
  const label = useAccountLabel();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const canPost = usePermission("ar.receipt.post");
  const canSubmit = usePermission("ap.payment.submit");
  const { data: parties } = useParties(side);
  const { accounts } = useCashBankAccounts();
  const [value, setValue] = useState<Omit<PartyPaymentInput, "allocations">>(() => ({
    party_id: payment?.party_id ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("party") ?? "" : ""),
    date: payment?.date ?? todayBusinessDate(), account_id: payment?.account_id ?? "", method: payment?.method ?? "BANK_TRANSFER",
    amount: payment && D(payment.amount).gt(0) ? payment.amount : "", reference: payment?.reference ?? "",
  }));
  const [allocations, setAllocations] = useState<Allocations>(() => toAllocations(payment));
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<{ message: string; reference: string | null } | null>(null);
  const [confirmPost, setConfirmPost] = useState(false);
  const saved = useRef<{ id: string; version: number } | null>(payment ? { id: payment.id, version: payment.version } : null);
  const set = (patch: Partial<typeof value>) => { setValue((v) => ({ ...v, ...patch })); setDirty(true); };

  const party = useParty(side, value.party_id).data;
  const currency = party?.currency ?? "USD";
  const open = useOpenInvoices(side, value.party_id);
  const invoices = open.data ?? [];
  const check = checkAllocations(invoices, value.amount || "0", allocations);
  const allocated = allocatedTotal(allocations);
  const payFrom = accounts.filter((a) => a.currency === currency && a.status === "ACTIVE");
  const account = payFrom.find((a) => a.id === value.account_id);
  const input = (): PartyPaymentInput => ({ ...value, allocations: Object.entries(allocations).map(([invoice_id, amount]) => ({ invoice_id, amount })) });
  const errors = {
    party_id: !value.party_id ? t("arap.form.required") : undefined,
    account_id: !value.account_id ? t("arap.form.required") : undefined,
    amount: !D(value.amount).gt(0) ? t("arap.form.positive") : undefined,
    date: !value.date ? t("arap.form.required") : undefined,
  };
  const fullyAllocated = side === "AR" || allocated.eq(D(value.amount));
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const ready = !Object.values(errors).some(Boolean) && check.valid && fullyAllocated;

  const done = (result: PartyPayment, message: string) => {
    setDirty(false);
    void queryClient.invalidateQueries({ queryKey: ["payments", side] });
    void queryClient.invalidateQueries({ queryKey: ["invoices", SIDE[side].partyKind === "CUSTOMER" ? "AR" : "AP"] });
    void queryClient.invalidateQueries({ queryKey: ["open-invoices", side] });
    void queryClient.invalidateQueries({ queryKey: ["parties", side] });
    queryClient.setQueryData(["payment", side, result.id], result);
    toast.success(message);
    if (!payment) {
      // Next keeps the /new page alive in the background: start it blank for the next visit.
      saved.current = null;
      setValue((v) => ({ ...v, party_id: "", account_id: "", amount: "", reference: "" }));
      setAllocations({});
      setTouched(false);
      router.replace(`${SIDE[side].paymentPath}/${result.id}`);
    }
    else onSaved?.(result);
  };
  const fail = (error: unknown) => {
    if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
    const d = describe(error);
    const detail = isApiError(error) ? error.details[0] : undefined;
    setFailure({ message: isApiError(error) && error.code === "VALIDATION_ERROR" && detail?.message ? detail.message : d.message, reference: d.reference });
  };

  const save = useMutation({
    mutationFn: async (mode: "save" | "submit") => {
      setFailure(null);
      const current = saved.current;
      const api = side === "AR" ? receiptsApi : supplierPaymentsApi;
      let result = current
        ? await api.update(current.id, input(), current.version)
        : side === "AR" ? await receiptsApi.create(input(), false, newIdempotencyKey()) : await supplierPaymentsApi.create(input());
      saved.current = { id: result.id, version: result.version };
      if (mode === "submit") result = await supplierPaymentsApi.submit(result.id);
      return { result, mode };
    },
    onSuccess: ({ result, mode }) => done(result, mode === "save" ? t("arap.toast.saved") : t("arap.toast.submitted")),
    onError: fail,
  });

  return (
    <div className="space-y-4" data-testid="payment-form">
      <UnsavedChangesGuard dirty={dirty && !save.isPending} />
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="pay-party" label={t(`${ns}.party`)} required error={show("party_id")}>
            <NativeSelect id="pay-party" value={value.party_id} onChange={(e) => { set({ party_id: e.target.value, account_id: "" }); setAllocations({}); }} aria-invalid={Boolean(show("party_id"))} aria-describedby={describedBy("pay-party", show("party_id"))}>
              <option value="">{t("arap.form.select")}</option>
              {parties?.filter((p) => side === "AR" || p.status === "VERIFIED" || p.id === value.party_id).map((p) => <option key={p.id} value={p.id}>{p.code} · {nameOf(p)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="pay-date" label={t("arap.form.date")} required error={show("date")}>
            <DateInput id="pay-date" value={value.date} onValueChange={(date) => set({ date })} />
          </FormField>
          <FormField id="pay-account" label={t(`${ns}.account`)} required error={show("account_id")} hint={account ? t("arap.payments.available", { amount: format.amount(account.balance, account.currency, { withCode: true }) }) : undefined}>
            <NativeSelect id="pay-account" value={value.account_id} onChange={(e) => set({ account_id: e.target.value })} aria-invalid={Boolean(show("account_id"))} aria-describedby={describedBy("pay-account", show("account_id"), account ? "x" : undefined)}>
              <option value="">{t("arap.form.select")}</option>
              {payFrom.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="pay-method" label={t("arap.payments.method")}>
            <NativeSelect id="pay-method" value={value.method} onChange={(e) => set({ method: e.target.value as PartyPaymentInput["method"] })}>
              {(["BANK_TRANSFER", "CASH", "CHEQUE"] as const).map((m) => <option key={m} value={m}>{t(`arap.payments.methods.${m}`)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="pay-amount" label={`${t("arap.payments.amount")} (${currency})`} required error={show("amount")}>
            <AmountInput id="pay-amount" currency={currency} value={value.amount} onValueChange={(amount) => set({ amount })} aria-invalid={Boolean(show("amount"))} aria-describedby={describedBy("pay-amount", show("amount"))} />
          </FormField>
          <FormField id="pay-reference" label={t("arap.form.reference")}>
            <Input id="pay-reference" value={value.reference} onChange={(e) => set({ reference: e.target.value })} />
          </FormField>
        </section>
        <aside className="space-y-3">
          {side === "AP" && party && <PayToPanel supplier={party} />}
          {side === "AR" && party && D(party.unapplied).gt(0) && <Note>{t("arap.payments.hasUnapplied", { amount: format.amount(party.unapplied, "USD", { withCode: true }) })}</Note>}
        </aside>
      </div>

      <section className="space-y-2" aria-labelledby="alloc-title">
        <h2 id="alloc-title" className="text-sm font-semibold">{t("arap.payments.allocations")}</h2>
        {value.party_id ? (
          <AllocationGrid invoices={invoices} amount={value.amount || "0"} currency={currency} allocations={allocations} onChange={(a) => { setAllocations(a); setDirty(true); }}
            settlementRate={undefined} baseCurrency="USD" emptyText={t("arap.payments.noOpenInvoices")} />
        ) : <p className="text-sm text-muted-foreground">{t("arap.payments.chooseParty")}</p>}
        {side === "AP" && !fullyAllocated && D(value.amount).gt(0) && <p className="text-sm text-warning" role="status">{t("arap.payments.allocateAll")}</p>}
      </section>

      {failure && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="payment-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div><p>{failure.message}</p>{failure.reference && <p className="font-mono text-xs">{t("errors.reference", { id: failure.reference })}</p>}</div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => { setTouched(true); save.mutate("save"); }} disabled={save.isPending} data-testid="payment-save">
          {save.isPending && save.variables === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{t("arap.actions.saveDraft")}
        </Button>
        {side === "AR" && canPost && (
          <Button onClick={() => { setTouched(true); if (ready) setConfirmPost(true); }} disabled={save.isPending} data-testid="receipt-post">{t("arap.actions.postReceipt")}</Button>
        )}
        {side === "AP" && canSubmit && (
          <Button onClick={() => { setTouched(true); if (ready) save.mutate("submit"); }} disabled={save.isPending} data-testid="payment-submit">
            {save.isPending && save.variables === "submit" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}{t("arap.actions.submit")}
          </Button>
        )}
      </div>

      <ConfirmActionDialog
        open={confirmPost} onOpenChange={setConfirmPost} action="post" title={t("arap.dialogs.postReceipt")} showAmountInWords
        effect={{ date: format.date(value.date), currency, amount: value.amount || "0", accounts: [label(account), t("arap.effect.ar", { party: nameOf(party) })] }}
        onConfirm={async ({ idempotencyKey }) => {
          const current = saved.current;
          const result = current
            ? await (async () => { const u = await receiptsApi.update(current.id, input(), current.version); saved.current = { id: u.id, version: u.version }; return receiptsApi.post(u.id, idempotencyKey); })()
            : await receiptsApi.create(input(), true, idempotencyKey);
          done(result, t("arap.toast.posted"));
          return result.number ?? undefined;
        }}
      />
    </div>
  );
}

function PaymentView({ side, payment: p }: { side: DocKind; payment: PartyPayment }) {
  const t = useTranslations();
  const ns = SIDE[side].ns;
  const locale = useAppLocale();
  const format = useFormatters();
  const nameOf = useNameOf();
  const label = useAccountLabel();
  const historyLabel = useHistoryLabel();
  const company = useCurrentCompany();
  const queryClient = useQueryClient();
  const userId = useSession((s) => s.user?.id);
  const { accounts } = useCashBankAccounts();
  const can = {
    edit: usePermission(side === "AR" ? "ar.receipt.create" : "ap.payment.create"), approve: usePermission("ap.payment.approve"),
    release: usePermission("ap.payment.release"), allocate: usePermission("ar.receipt.allocate"), post: usePermission("ar.receipt.post"),
  };
  const [dialog, setDialog] = useState<Dialog>(null);
  const [bankRef, setBankRef] = useState("");
  const [extra, setExtra] = useState<Allocations>({});
  const supplier = useParty(side, side === "AP" ? p.party_id : "").data;
  const open = useOpenInvoices(side, p.status === "POSTED" && D(p.unapplied).gt(0) ? p.party_id : "");
  const update = (next: PartyPayment) => {
    queryClient.setQueryData(["payment", side, next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["payments", side] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["open-invoices", side] });
    void queryClient.invalidateQueries({ queryKey: ["parties", side] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const mine = p.preparer_id === userId;
  const sodReason = mine ? t("workflow.sod.violation") : null;
  const editable = (p.status === "DRAFT" || p.status === "REJECTED") && can.edit;
  const account = accounts.find((a) => a.id === p.account_id);
  const party = nameOf({ name: p.party_name, name_km: p.party_name_km });
  const title = p.number ? t(`${ns}.paymentNo`, { number: p.number }) : t(`${ns}.draftPayment`);
  const effect = {
    company: company ? (locale === "km" ? company.name_km : company.name) : undefined, date: format.date(p.date), currency: p.currency, amount: p.amount,
    accounts: [label(account) || p.account_id, side === "AR" ? t("arap.effect.ar", { party }) : t("arap.effect.ap", { party })],
  };
  const invoicesOf = p.allocations.map((a) => ({ id: a.invoice_id, number: a.invoice_number ?? a.invoice_id, date: p.date, due_date: p.date, currency: p.currency, outstanding: a.amount }));
  const cancel = useMutation({
    mutationFn: () => (side === "AR" ? receiptsApi.cancel(p.id) : supplierPaymentsApi.cancel(p.id)),
    onSuccess: (next) => { update(next); toast.success(t("arap.toast.cancelled")); },
  });

  return (
    <div className="space-y-4" data-testid="payment-page" data-status={p.status}>
      <div data-print="hide">
        <PageHeader
          title={title}
          badge={<StatusBadge status={p.status} />}
          description={`${party} · ${t("gl.journal.fields.preparer")}: ${p.preparer_name}`}
          actions={
            <>
              {side === "AR" && p.status === "POSTED" && <Button size="sm" variant="ghost" onClick={() => window.print()} data-testid="print-receipt"><Printer aria-hidden />{t("arap.actions.printReceipt")}</Button>}
              {["DRAFT", "REJECTED", "APPROVED"].includes(p.status) && can.edit && (side === "AP" || p.status === "DRAFT") && (
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}><Ban aria-hidden />{t("arap.actions.cancel")}</Button>
              )}
              {side === "AP" && p.status === "SUBMITTED" && can.approve && (
                <>
                  <Explained reason={sodReason}><Button size="sm" variant="destructive" disabled={Boolean(sodReason)} onClick={() => setDialog("reject")}><XCircle aria-hidden />{t("arap.actions.reject")}</Button></Explained>
                  <Explained reason={sodReason}><Button size="sm" disabled={Boolean(sodReason)} onClick={() => setDialog("approve")} data-testid="payment-approve">{t("arap.actions.approve")}</Button></Explained>
                </>
              )}
              {side === "AP" && p.status === "APPROVED" && can.release && (
                <Explained reason={sodReason}><Button size="sm" disabled={Boolean(sodReason)} onClick={() => setDialog("release")} data-testid="payment-release">{t("arap.actions.release")}</Button></Explained>
              )}
            </>
          }
        />
        {p.status === "SUBMITTED" && <Note>{t("arap.banner.paymentSubmitted")}</Note>}
        {p.status === "APPROVED" && <Note>{t("arap.banner.paymentApproved")}</Note>}
        {p.status === "REJECTED" && p.rejection_comment && <Note tone="danger">{t("arap.banner.rejected", { comment: p.rejection_comment })}</Note>}
        {(p.status === "POSTED" || p.status === "PAID") && (
          <Note testId="payment-done">
            {p.status === "PAID" ? t("arap.banner.released", { number: p.number ?? "", reference: p.bank_reference ?? "—", by: p.released_by ?? "" }) : t("arap.banner.receiptPosted", { number: p.number ?? "" })}{" "}
            {p.journal_id && <AppLink href={`/accounting/journals/${p.journal_id}`} className="underline">{p.journal_no}</AppLink>}
          </Note>
        )}
        {p.status === "POSTED" && D(p.unapplied).gt(0) && <Note tone="warning" testId="unapplied-note">{t("arap.banner.unapplied", { amount: format.amount(p.unapplied, p.currency, { withCode: true }) })}</Note>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]" data-print="hide">
        <div className="min-w-0 space-y-4">
          {editable ? <PaymentForm key={`${p.id}-${p.version}`} side={side} payment={p} onSaved={update} /> : (
            <>
              <dl className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
                {[
                  [t(`${ns}.party`), party], [t("arap.form.date"), format.date(p.date)], [t(`${ns}.account`), label(account) || p.account_id],
                  [t("arap.payments.method"), t(`arap.payments.methods.${p.method}`)], [t("arap.payments.amount"), format.amount(p.amount, p.currency, { withCode: true })],
                  [t("arap.form.reference"), p.reference || "—"], ...(p.bank_reference ? [[t("arap.payments.bankReference"), p.bank_reference]] : []),
                  ...(p.pay_to ? [[t("arap.payTo.title"), `${p.pay_to.bank_name} · ${p.pay_to.account_number}`]] : []),
                ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              </dl>
              <section className="space-y-2" aria-labelledby="alloc-view-title">
                <h2 id="alloc-view-title" className="text-sm font-semibold">{t("arap.payments.allocations")}</h2>
                <AllocationGrid invoices={invoicesOf} amount={p.amount} currency={p.currency} allocations={toAllocations(p)} onChange={() => undefined} readOnly emptyText={t("arap.payments.noAllocations")} />
              </section>
              {p.status === "POSTED" && D(p.unapplied).gt(0) && can.allocate && (
                <section className="space-y-2 rounded-xl border bg-card p-4" aria-labelledby="apply-title" data-testid="apply-unapplied">
                  <h2 id="apply-title" className="text-sm font-semibold">{t("arap.payments.applyTitle")}</h2>
                  <AllocationGrid invoices={open.data ?? []} amount={p.unapplied} currency={p.currency} allocations={extra} onChange={setExtra} emptyText={t("arap.payments.noOpenInvoices")} />
                  <div className="flex justify-end"><Button size="sm" disabled={allocatedTotal(extra).isZero()} onClick={() => setDialog("allocate")}>{t("arap.actions.apply")}</Button></div>
                </section>
              )}
            </>
          )}
        </div>
        <aside className="space-y-4">
          {side === "AP" && supplier && !editable && p.status !== "PAID" && <PayToPanel supplier={supplier} />}
          {p.status === "SUBMITTED" && can.approve && <SoDIndicator preparerId={p.preparer_id} preparerName={p.preparer_name} />}
          {p.approval_steps.length > 0 && <div className="rounded-xl border bg-card p-4"><ApprovalTimeline steps={p.approval_steps} /></div>}
          <div className="rounded-xl border bg-card p-4"><HistoryPanel events={p.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div>
        </aside>
      </div>

      {side === "AR" && p.status === "POSTED" && <ReceiptVoucher payment={p} accountLabel={label(account)} />}

      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="approve" title={t("arap.dialogs.approve", { title })} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const next = await supplierPaymentsApi.decide(p.id, "approve", "", idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("arap.dialogs.reject", { title })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await supplierPaymentsApi.decide(p.id, "reject", reason, idempotencyKey); update(next); return t(`status.${next.status}`); }} />
      <ConfirmActionDialog
        open={dialog === "release"} onOpenChange={(o) => !o && setDialog(null)} action="release" title={t("arap.dialogs.release", { title })} description={t("arap.dialogs.releaseDescription")}
        effect={effect} showAmountInWords thresholdAmount={p.amount} canConfirm={p.method === "CASH" || Boolean(bankRef.trim())}
        onConfirm={async ({ idempotencyKey }) => { const next = await supplierPaymentsApi.release(p.id, bankRef.trim(), idempotencyKey); update(next); return next.number ?? undefined; }}
        onDone={() => void queryClient.invalidateQueries({ queryKey: ["payment", side, p.id] })}
      >
        {supplier?.bank && <p className="text-sm" data-testid="release-pay-to">{t("arap.payTo.title")}: {supplier.bank.bank_name} · <span className="font-mono">{supplier.bank.account_number}</span></p>}
        {p.method !== "CASH" && (
          <FormField id="release-ref" label={t("arap.payments.bankReference")} required>
            <Input id="release-ref" value={bankRef} onChange={(e) => setBankRef(e.target.value)} autoComplete="off" />
          </FormField>
        )}
      </ConfirmActionDialog>
      <ConfirmActionDialog
        open={dialog === "allocate"} onOpenChange={(o) => !o && setDialog(null)} action="post" title={t("arap.dialogs.apply", { title })} description={t("arap.dialogs.applyDescription")}
        effect={{ currency: p.currency, amount: allocatedTotal(extra).toFixed(p.currency === "KHR" ? 0 : 2) }} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => {
          const next = await receiptsApi.allocate(p.id, Object.entries(extra).map(([invoice_id, amount]) => ({ invoice_id, amount })), idempotencyKey);
          update(next);
          setExtra({});
          return t("arap.toast.applied");
        }}
      />
    </div>
  );
}

/** Printed receipt voucher (SCR-10). */
function ReceiptVoucher({ payment: p, accountLabel }: { payment: PartyPayment; accountLabel: string }) {
  const t = useTranslations("arap.voucher");
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const cell = "border border-black/40 px-1.5 py-1";
  return (
    <div className="hidden text-[10pt] text-black print:block" data-testid="receipt-voucher">
      <header className="mb-3 flex justify-between border-b border-black pb-2">
        <div><p className="font-semibold">{company?.name}</p><p>{company?.name_km}</p></div>
        <div className="text-right"><p className="text-base font-bold">{t("title")}</p><p>{p.number}</p><p>{format.date(p.date)}</p></div>
      </header>
      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>{t("receivedFrom")}</dt><dd className="font-medium">{p.party_name} {p.party_name_km}</dd>
        <dt>{t("amount")}</dt><dd className="font-medium">{format.amount(p.amount, p.currency, { withCode: true })}</dd>
        <dt>{t("inWords")}</dt><dd>{amountInWords(p.amount, p.currency, locale)}</dd>
        <dt>{t("into")}</dt><dd>{accountLabel} · {t(`method.${p.method}`)} {p.reference}</dd>
      </dl>
      <table className="w-full border-collapse">
        <thead><tr><th className={`${cell} text-left`}>{t("invoice")}</th><th className={`${cell} text-right`}>{t("applied")}</th></tr></thead>
        <tbody>
          {p.allocations.map((a) => <tr key={a.invoice_id}><td className={cell}>{a.invoice_number}</td><td className={`${cell} text-right tabular-nums`}>{format.amount(a.amount, p.currency)}</td></tr>)}
          {D(p.unapplied).gt(0) && <tr><td className={cell}>{t("unapplied")}</td><td className={`${cell} text-right tabular-nums`}>{format.amount(p.unapplied, p.currency)}</td></tr>}
        </tbody>
      </table>
      <div className="mt-10 grid grid-cols-2 gap-6">
        {[t("receivedBy"), t("customer")].map((x) => <div key={x} className="border-t border-black pt-1"><p className="font-medium">{x}</p><p className="mt-6 text-[8pt]">{t("signature")}</p></div>)}
      </div>
    </div>
  );
}
