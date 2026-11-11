"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountInput } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/workflow/approval";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFormatters, usePostingAccounts } from "@/lib/api/hooks";
import type { CashLine, CashTransaction, CashTransactionInput, CashTransactionType } from "@/lib/api/types/cashbank";
import { todayBusinessDate } from "@/lib/format/dates";
import { useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { total } from "@/lib/money/split";
import { usePermission } from "@/lib/rbac/can";
import { useAccountLabel, useCashBankAccounts } from "./use-cash-bank";

const TWO_SIDED: CashTransactionType[] = ["TRANSFER", "DEPOSIT", "WITHDRAWAL"];
const emptyLine = (account_id = ""): CashLine => ({ account_id, description: "", amount: "", department_id: null, branch_id: null });

interface Props {
  transaction: CashTransaction | null;
  type: CashTransactionType;
  /** Preselected account (from a cashbook's "New transaction"). */
  accountId?: string | null;
  onSaved?: (t: CashTransaction) => void;
}

/** SCR-27 form for receipts, payments, transfers, deposits, withdrawals and bank charges (FR-CB-003..006). */
export function CashTransactionForm({ transaction, type, accountId, onSaved }: Props) {
  const t = useTranslations();
  const locale = useAppLocale();
  const router = useAppRouter();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const label = useAccountLabel();
  const { accounts } = useCashBankAccounts();
  const { data: departments } = useDepartments();
  const { data: glAccounts } = usePostingAccounts();
  const canSubmit = usePermission("cb.cash.create");
  const twoSided = TWO_SIDED.includes(type);

  const [value, setValue] = useState<CashTransactionInput>(() => ({
    type,
    date: transaction?.date ?? todayBusinessDate(),
    account_id: transaction?.account_id ?? accountId ?? "",
    to_account_id: transaction?.to_account_id ?? null,
    amount: transaction?.amount && D(transaction.amount).gt(0) ? transaction.amount : "",
    to_amount: transaction?.to_amount ?? null,
    reference: transaction?.reference ?? "",
    description: transaction?.description ?? "",
    payee: transaction?.payee ?? "",
    lines: transaction?.lines.length ? transaction.lines : twoSided ? [] : [emptyLine(type === "CHARGE" ? "acc-6800" : "")],
  }));
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; reference: string | null } | null>(null);
  const saved = useRef<{ id: string; version: number } | null>(transaction ? { id: transaction.id, version: transaction.version } : null);

  const set = (patch: Partial<CashTransactionInput>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  const setLine = (i: number, patch: Partial<CashLine>) => set({ lines: value.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const from = accounts.find((a) => a.id === value.account_id);
  const to = accounts.find((a) => a.id === value.to_account_id);
  const currency = from?.currency ?? "USD";
  const crossCurrency = Boolean(twoSided && from && to && from.currency !== to.currency);
  const fromChoices = accounts.filter((a) => (type === "DEPOSIT" ? a.kind === "CASH" : type === "WITHDRAWAL" || type === "CHARGE" ? a.kind === "BANK" : true));
  const toChoices = accounts.filter((a) => a.id !== value.account_id && (type === "DEPOSIT" ? a.kind === "BANK" : type === "WITHDRAWAL" ? a.kind === "CASH" : true));
  // Lines may not use receivable, payable, bank or cash accounts: those have their own documents.
  const lineAccounts = (glAccounts ?? []).filter((a) => !a.is_control && a.cash_flow_class !== "CASH");
  const linesTotal = total(value.lines.map((l) => l.amount));
  const linesMatch = twoSided || linesTotal.eq(D(value.amount));

  const errors = {
    account_id: !value.account_id ? t("cb.tx.form.required") : undefined,
    to_account_id: twoSided && !value.to_account_id ? t("cb.tx.form.required") : undefined,
    date: !value.date ? t("cb.tx.form.required") : undefined,
    amount: !D(value.amount).gt(0) ? t("cb.tx.form.positive") : undefined,
    to_amount: crossCurrency && !D(value.to_amount).gt(0) ? t("cb.tx.form.positive") : undefined,
    description: !value.description.trim() ? t("cb.tx.form.required") : undefined,
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  const mutation = useMutation({
    mutationFn: async (mode: "save" | "submit") => {
      setServerError(null);
      const input = { ...value, to_amount: crossCurrency ? value.to_amount : null };
      const current = saved.current;
      let result = current ? await cashBankApi.updateTransaction(current.id, input, current.version) : await cashBankApi.createTransaction(input);
      saved.current = { id: result.id, version: result.version };
      setDirty(false);
      if (mode === "submit") result = await cashBankApi.submitTransaction(result.id);
      return { result, mode };
    },
    onSuccess: ({ result, mode }) => {
      void queryClient.invalidateQueries({ queryKey: ["cash-transactions"] });
      queryClient.setQueryData(["cash-transaction", result.id], result);
      toast.success(mode === "save" ? t("cb.tx.toast.saved") : t("cb.tx.toast.submitted"));
      if (!transaction) router.replace(`/cash-bank/transactions/${result.id}`);
      else onSaved?.(result);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
      setTouched(true);
      const d = describe(error);
      const detail = isApiError(error) ? error.details[0] : undefined;
      // Field problems carry their own message from the server; codes map to the user's language.
      setServerError({ message: isApiError(error) && error.code === "VALIDATION_ERROR" && detail?.message ? detail.message : d.message, reference: d.reference });
    },
  });

  const run = (mode: "save" | "submit") => {
    if (mode === "submit") {
      setTouched(true);
      if (Object.values(errors).some(Boolean) || !linesMatch) return;
    }
    mutation.mutate(mode);
  };

  return (
    <div className="space-y-4" data-testid="cash-form">
      <UnsavedChangesGuard dirty={dirty && !mutation.isPending} />
      <p className="text-sm text-muted-foreground">{t(`cb.typeHint.${type}`)}</p>
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="ctx-account" label={twoSided ? t("cb.tx.form.fromAccount") : t("cb.tx.form.account")} required error={show("account_id")} hint={from ? t("cb.tx.form.balance", { amount: format.amount(from.balance, from.currency, { withCode: true }) }) : undefined}>
          <NativeSelect id="ctx-account" value={value.account_id} onChange={(e) => set({ account_id: e.target.value })} aria-invalid={Boolean(show("account_id"))} aria-describedby={describedBy("ctx-account", show("account_id"), from ? "x" : undefined)}>
            <option value="">—</option>
            {fromChoices.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
          </NativeSelect>
        </FormField>
        {twoSided && (
          <FormField id="ctx-to" label={t("cb.tx.form.toAccount")} required error={show("to_account_id")}>
            <NativeSelect id="ctx-to" value={value.to_account_id ?? ""} onChange={(e) => set({ to_account_id: e.target.value || null })} aria-invalid={Boolean(show("to_account_id"))} aria-describedby={describedBy("ctx-to", show("to_account_id"))}>
              <option value="">—</option>
              {toChoices.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
            </NativeSelect>
          </FormField>
        )}
        <FormField id="ctx-date" label={t("cb.tx.form.date")} required error={show("date")}>
          <DateInput id="ctx-date" value={value.date} onValueChange={(date) => set({ date })} />
        </FormField>
        <FormField id="ctx-amount" label={`${t("cb.tx.form.amount")} (${currency})`} required error={show("amount")}>
          <AmountInput id="ctx-amount" currency={currency} value={value.amount} onValueChange={(amount) => set({ amount })} aria-invalid={Boolean(show("amount"))} aria-describedby={describedBy("ctx-amount", show("amount"))} />
        </FormField>
        {crossCurrency && to && (
          <FormField id="ctx-to-amount" label={`${t("cb.tx.form.toAmount")} (${to.currency})`} required error={show("to_amount")} hint={t("cb.tx.form.toAmountHint")}>
            <AmountInput id="ctx-to-amount" currency={to.currency} value={value.to_amount ?? ""} onValueChange={(to_amount) => set({ to_amount })} aria-describedby={describedBy("ctx-to-amount", show("to_amount"), "x")} />
          </FormField>
        )}
        <FormField id="ctx-reference" label={t("cb.tx.form.reference")}>
          <Input id="ctx-reference" value={value.reference} onChange={(e) => set({ reference: e.target.value })} />
        </FormField>
        {!twoSided && (
          <FormField id="ctx-payee" label={t("cb.tx.form.payee")}>
            <Input id="ctx-payee" value={value.payee} onChange={(e) => set({ payee: e.target.value })} />
          </FormField>
        )}
        <FormField id="ctx-description" label={t("cb.tx.form.description")} required error={show("description")} className="sm:col-span-2">
          <Input id="ctx-description" value={value.description} onChange={(e) => set({ description: e.target.value })} aria-invalid={Boolean(show("description"))} aria-describedby={describedBy("ctx-description", show("description"))} />
        </FormField>
      </section>

      {!twoSided && (
        <section className="space-y-2 rounded-xl border bg-card p-4" aria-labelledby="ctx-lines">
          <h2 id="ctx-lines" className="text-sm font-semibold">{t("cb.tx.form.lines")}</h2>
          {value.lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,1fr)_9rem_10rem_auto]" data-testid="cash-line">
              <AccountPicker value={l.account_id || null} accounts={lineAccounts} onChange={(id) => setLine(i, { account_id: id ?? "" })} aria-label={t("cb.tx.form.lineAccount", { line: i + 1 })} />
              <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={t("cb.tx.form.lineDescription", { line: i + 1 })} />
              <AmountInput currency={currency} value={l.amount} onValueChange={(amount) => setLine(i, { amount })} aria-label={t("cb.tx.form.lineAmount", { line: i + 1 })} />
              <NativeSelect value={l.department_id ?? ""} onChange={(e) => setLine(i, { department_id: e.target.value || null })} aria-label={t("cb.tx.form.lineDepartment", { line: i + 1 })}>
                <option value="">—</option>
                {departments?.map((d) => <option key={d.id} value={d.id}>{locale === "km" ? d.name_km : d.name}</option>)}
              </NativeSelect>
              <Button type="button" variant="ghost" size="icon" onClick={() => set({ lines: value.lines.filter((_, j) => j !== i) })} disabled={value.lines.length === 1} aria-label={t("cb.tx.form.removeLine", { line: i + 1 })}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => set({ lines: [...value.lines, emptyLine()] })}><Plus aria-hidden />{t("cb.tx.form.addLine")}</Button>
            {linesMatch ? (
              <span className="flex items-center gap-1 text-sm text-success" role="status"><CheckCircle2 className="size-4" aria-hidden />{t("cb.tx.form.linesMatch")}</span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-destructive" role="status" data-testid="lines-mismatch">
                <AlertTriangle className="size-4" aria-hidden />
                {t("cb.tx.form.linesTotal", { total: format.amount(linesTotal, currency), amount: format.amount(value.amount || "0", currency) })}
              </span>
            )}
          </div>
        </section>
      )}

      {serverError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="cash-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p>{serverError.message}</p>
            {serverError.reference && <p className="font-mono text-xs">{t("errors.reference", { id: serverError.reference })}</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2" data-print="hide">
        <Button variant="outline" onClick={() => run("save")} disabled={mutation.isPending} data-testid="cash-save">
          {mutation.isPending && mutation.variables === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t("cb.tx.actions.saveDraft")}
        </Button>
        {canSubmit && (
          <Button onClick={() => run("submit")} disabled={mutation.isPending} data-testid="cash-submit">
            {mutation.isPending && mutation.variables === "submit" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {t("cb.tx.actions.submit")}
          </Button>
        )}
      </div>
    </div>
  );
}
