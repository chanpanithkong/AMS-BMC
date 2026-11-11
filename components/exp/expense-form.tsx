"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Paperclip, Save, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccountLabel, useCashBankAccounts } from "@/components/cb/use-cash-bank";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AmountInput } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UnsavedChangesGuard } from "@/components/workflow/approval";
import { expensesApi } from "@/lib/api/endpoints/cashbank";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { Expense, ExpenseInput } from "@/lib/api/types/cashbank";
import { todayBusinessDate } from "@/lib/format/dates";
import { useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { total } from "@/lib/money/split";
import { usePermission } from "@/lib/rbac/can";
import { AllocationEditor } from "./allocation-editor";

const MODES = ["PAID", "UNPAID", "CLAIM"] as const;

export function useExpenseCategories() {
  return useQuery({ queryKey: ["expense-categories"], queryFn: expensesApi.categories, staleTime: 300_000, select: (p) => p.data });
}

/** SCR-21 expense form (WF-06): category, payment mode, allocation, attachments, spending panel. */
export function ExpenseForm({ expense, onSaved }: { expense: Expense | null; onSaved?: (e: Expense) => void }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const router = useAppRouter();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const label = useAccountLabel();
  const canSubmit = usePermission("exp.submit");
  const { data: categories } = useExpenseCategories();
  const { data: departments } = useDepartments();
  const { accounts } = useCashBankAccounts();

  const [value, setValue] = useState<ExpenseInput>(() => ({
    date: expense?.date ?? todayBusinessDate(),
    category_id: expense?.category_id ?? "",
    description: expense?.description ?? "",
    payee: expense?.payee ?? "",
    payment_mode: expense?.payment_mode ?? (accounts.length ? "PAID" : "UNPAID"),
    paid_from_id: expense?.paid_from_id ?? null,
    currency: expense?.currency ?? "USD",
    amount: expense && D(expense.amount).gt(0) ? expense.amount : "",
    allocation_mode: expense?.allocation_mode ?? "PERCENT",
    allocations: expense?.allocations.length ? expense.allocations : [{ department_id: null, branch_id: null, percent: "100", amount: "0" }],
  }));
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; reference: string | null } | null>(null);
  const saved = useRef<{ id: string; version: number } | null>(expense ? { id: expense.id, version: expense.version } : null);
  const set = (patch: Partial<ExpenseInput>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };

  const category = categories?.find((c) => c.id === value.category_id);
  const payFrom = accounts.filter((a) => a.currency === value.currency);
  const allocOk = value.allocation_mode === "PERCENT" ? total(value.allocations.map((a) => a.percent)).eq(100) : total(value.allocations.map((a) => a.amount)).eq(D(value.amount));
  const needsAttachment = category && (category.requires_attachment || (category.attachment_threshold !== null && D(value.amount).gt(category.attachment_threshold)));
  const department = value.allocations.find((a) => a.department_id)?.department_id ?? null;
  const spending = useQuery({
    queryKey: ["spending", category?.account_id, department, value.date],
    queryFn: () => expensesApi.spending(category!.account_id, department, value.date),
    enabled: Boolean(category && value.date),
  });

  const errors = {
    category_id: !value.category_id ? t("exp.form.required") : undefined,
    description: !value.description.trim() ? t("exp.form.required") : undefined,
    amount: !D(value.amount).gt(0) ? t("exp.form.positive") : undefined,
    paid_from_id: value.payment_mode === "PAID" && !value.paid_from_id ? t("exp.form.required") : undefined,
    date: !value.date ? t("exp.form.required") : undefined,
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  const mutation = useMutation({
    mutationFn: async (mode: "save" | "submit") => {
      setServerError(null);
      const current = saved.current;
      let result = current ? await expensesApi.update(current.id, value, current.version) : await expensesApi.create(value);
      saved.current = { id: result.id, version: result.version };
      setDirty(false);
      if (mode === "submit") result = await expensesApi.submit(result.id);
      return { result, mode };
    },
    onSuccess: ({ result, mode }) => {
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.setQueryData(["expense", result.id], result);
      toast.success(mode === "save" ? t("exp.toast.saved") : t("exp.toast.submitted"));
      if (!expense) {
        // Next keeps the /new page alive in the background: start it blank for the next visit.
        saved.current = null;
        setTouched(false);
        router.replace(`/expenses/${result.id}`);
      }
      else onSaved?.(result);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
      setTouched(true);
      const d = describe(error);
      const detail = isApiError(error) ? error.details[0] : undefined;
      const message = isApiError(error) && error.code === "ATTACHMENT_REQUIRED" && category
        ? t("exp.form.attachmentRequired", { category: locale === "km" ? category.name_km : category.name })
        : isApiError(error) && error.code === "VALIDATION_ERROR" && detail?.message ? detail.message : d.message;
      setServerError({ message, reference: d.reference });
      // Keep the new draft open on the same page so the message stays visible.
      if (!expense && saved.current) void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  const run = (mode: "save" | "submit") => {
    if (mode === "submit") {
      setTouched(true);
      if (Object.values(errors).some(Boolean) || !allocOk) return;
    }
    mutation.mutate(mode);
  };

  return (
    <div className="space-y-4" data-testid="expense-form">
      <UnsavedChangesGuard dirty={dirty && !mutation.isPending} />
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="exp-date" label={t("exp.form.date")} required error={show("date")}>
          <DateInput id="exp-date" value={value.date} onValueChange={(date) => set({ date })} />
        </FormField>
        <FormField id="exp-category" label={t("exp.form.category")} required error={show("category_id")}>
          <NativeSelect id="exp-category" value={value.category_id} onChange={(e) => set({ category_id: e.target.value })} aria-invalid={Boolean(show("category_id"))} aria-describedby={describedBy("exp-category", show("category_id"))}>
            <option value="">{t("exp.form.select")}</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{locale === "km" ? c.name_km : c.name}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="exp-payee" label={t("exp.form.payee")}>
          <Input id="exp-payee" value={value.payee} onChange={(e) => set({ payee: e.target.value })} />
        </FormField>
        <FormField id="exp-description" label={t("exp.form.description")} required error={show("description")} className="sm:col-span-2">
          <Input id="exp-description" value={value.description} onChange={(e) => set({ description: e.target.value })} aria-invalid={Boolean(show("description"))} aria-describedby={describedBy("exp-description", show("description"))} />
        </FormField>
        <FormField id="exp-currency" label={t("exp.form.currency")}>
          <NativeSelect id="exp-currency" value={value.currency} onChange={(e) => set({ currency: e.target.value, paid_from_id: null })}>
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </NativeSelect>
        </FormField>
        <FormField id="exp-amount" label={`${t("exp.form.amount")} (${value.currency})`} required error={show("amount")}>
          <AmountInput id="exp-amount" currency={value.currency} value={value.amount} onValueChange={(amount) => set({ amount })} aria-invalid={Boolean(show("amount"))} aria-describedby={describedBy("exp-amount", show("amount"))} />
        </FormField>
        <FormField id="exp-mode" label={t("exp.form.mode")} hint={t(`exp.modeHint.${value.payment_mode}`)}>
          <NativeSelect id="exp-mode" value={value.payment_mode} onChange={(e) => set({ payment_mode: e.target.value as ExpenseInput["payment_mode"], paid_from_id: null })} aria-describedby="exp-mode-hint">
            {MODES.filter((m) => m !== "PAID" || accounts.length > 0).map((m) => <option key={m} value={m}>{t(`exp.mode.${m}`)}</option>)}
          </NativeSelect>
        </FormField>
        {value.payment_mode === "PAID" && (
          <FormField id="exp-paid-from" label={t("exp.form.paidFrom")} required error={show("paid_from_id")}>
            <NativeSelect id="exp-paid-from" value={value.paid_from_id ?? ""} onChange={(e) => set({ paid_from_id: e.target.value || null })} aria-invalid={Boolean(show("paid_from_id"))} aria-describedby={describedBy("exp-paid-from", show("paid_from_id"))}>
              <option value="">{t("exp.form.select")}</option>
              {payFrom.map((a) => <option key={a.id} value={a.id}>{label(a)} · {format.amount(a.balance, a.currency, { withCode: true })}</option>)}
            </NativeSelect>
          </FormField>
        )}
      </section>

      <AllocationEditor
        mode={value.allocation_mode}
        onModeChange={(allocation_mode) => set({ allocation_mode, allocations: value.allocations.map((a) => ({ ...a, percent: allocation_mode === "PERCENT" ? (a.percent ?? "0") : null, amount: allocation_mode === "AMOUNT" ? "" : "0" })) })}
        allocations={value.allocations}
        onChange={(allocations) => set({ allocations })}
        amount={value.amount}
        currency={value.currency}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {category && (
          <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="exp-budget" data-testid="spending-panel">
            <h2 id="exp-budget" className="mb-1 font-semibold">{t("exp.budget.title")}</h2>
            {spending.data && (
              <p>{t("exp.budget.spent", {
                account: spending.data.account_code,
                department: department ? (locale === "km" ? departments?.find((d) => d.id === department)?.name_km : departments?.find((d) => d.id === department)?.name) ?? "" : t("exp.budget.allDepartments"),
                amount: format.amount(spending.data.year_to_date, "USD", { withCode: true }),
              })}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{t("exp.budget.noBudget")}</p>
          </section>
        )}
        {needsAttachment && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm" role="status" data-testid="attachment-note">
            <Paperclip className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {category.requires_attachment
                ? t("exp.form.attachmentRequired", { category: locale === "km" ? category.name_km : category.name })
                : t("exp.form.attachmentAbove", { amount: format.amount(category.attachment_threshold!, "USD", { withCode: true }) })}
              {!expense && <span className="block text-xs">{t("exp.form.attachAfterSave")}</span>}
            </span>
          </p>
        )}
      </div>

      {serverError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="expense-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div><p>{serverError.message}</p>{serverError.reference && <p className="font-mono text-xs">{t("errors.reference", { id: serverError.reference })}</p>}</div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => run("save")} disabled={mutation.isPending} data-testid="expense-save">
          {mutation.isPending && mutation.variables === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t("exp.actions.saveDraft")}
        </Button>
        {canSubmit && (
          <Button onClick={() => run("submit")} disabled={mutation.isPending} data-testid="expense-submit">
            {mutation.isPending && mutation.variables === "submit" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {t("exp.actions.submit")}
          </Button>
        )}
      </div>
    </div>
  );
}
