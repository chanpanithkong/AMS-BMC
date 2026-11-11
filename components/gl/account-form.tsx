"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HistoryPanel } from "@/components/workflow/approval";
import { accountsApi } from "@/lib/api/endpoints/accounts";
import { isApiError } from "@/lib/api/errors";
import { useCurrencies } from "@/lib/api/hooks";
import type { Account, AccountInput, AccountType, ControlModule } from "@/lib/api/types/accounts";
import { useAppLocale } from "@/lib/i18n/navigation";
import { usePermission } from "@/lib/rbac/can";

const TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const MODULES: ControlModule[] = ["AR", "AP", "BANK", "FIXED_ASSETS", "INVENTORY", "TAX"];
const CASH_FLOW = ["CASH", "OPERATING", "INVESTING", "FINANCING"] as const;
const DEBIT_TYPES: AccountType[] = ["ASSET", "EXPENSE"];

// Client checks help the user; the server decides (SRS §12.2). Messages are translation keys.
const schema = z.object({
  code: z.string().trim().regex(/^\d{4}$/, "gl.accounts.form.codeHint"),
  name: z.string().trim().min(1, "gl.accounts.form.required"),
  name_km: z.string(),
  description: z.string(),
  type: z.enum(TYPES),
  category: z.string().trim().min(1, "gl.accounts.form.required"),
  parent_id: z.string().nullable(),
  normal_balance: z.enum(["DEBIT", "CREDIT"]),
  is_posting: z.boolean(),
  is_control: z.boolean(),
  control_module: z.enum(MODULES).nullable(),
  is_sensitive: z.boolean(),
  currency: z.string().nullable(),
  cash_flow_class: z.enum(CASH_FLOW).nullable(),
  statement_mapping: z.string().nullable(),
  effective_from: z.string().nullable(),
  effective_to: z.string().nullable(),
});
type Values = z.infer<typeof schema>;

const toValues = (a: Account | null): Values => ({
  code: a?.code ?? "", name: a?.name ?? "", name_km: a?.name_km ?? "", description: a?.description ?? "",
  type: a?.type ?? "EXPENSE", category: a?.category ?? "", parent_id: a?.parent_id ?? null,
  normal_balance: a?.normal_balance ?? "DEBIT", is_posting: a?.is_posting ?? true, is_control: a?.is_control ?? false,
  control_module: a?.control_module ?? null, is_sensitive: a?.is_sensitive ?? false, currency: a?.currency ?? null,
  cash_flow_class: a?.cash_flow_class ?? null, statement_mapping: a?.statement_mapping ?? null,
  effective_from: a?.effective_from ?? null, effective_to: a?.effective_to ?? null,
});

/** Show server field errors next to their fields (SRS §13.2). */
function applyServerErrors(error: unknown, setError: UseFormSetError<Values>): boolean {
  if (!isApiError(error) || !Object.keys(error.fieldErrors).length) return false;
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    if (field in toValues(null)) setError(field as keyof Values, { message });
  }
  return true;
}

interface AccountFormProps {
  account: Account | null;
  /** Header accounts to offer as parents. */
  accounts: Account[];
  onSaved: (account: Account) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** SCR-03 account form: create and edit, with the SRS validation messages. */
export function AccountForm({ account, accounts, onSaved, onDirtyChange }: AccountFormProps) {
  const t = useTranslations();
  const locale = useAppLocale();
  const errorToast = useErrorToast();
  const queryClient = useQueryClient();
  const canEdit = usePermission(account ? "coa.edit" : "coa.create");
  const seeSensitive = usePermission("coa.sensitive.view");
  const { data: currencies } = useCurrencies();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(account) });
  const { register, watch, setValue, formState } = form;
  const errors = formState.errors;
  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form's watch() manages its own subscriptions
  const type = watch("type");
  const isControl = watch("is_control");
  const readOnly = !canEdit;

  useEffect(() => onDirtyChange?.(formState.isDirty), [formState.isDirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async (values: Values) => {
      if (!account) return { result: await accountsApi.create(values as AccountInput), pending: false };
      const dirty = Object.keys(formState.dirtyFields) as (keyof Values)[];
      const patch = Object.fromEntries(dirty.map((k) => [k, values[k]])) as Partial<AccountInput>;
      const result = await accountsApi.update(account.id, patch, account.version);
      return { result, pending: Boolean(result.pending_change) && !account.pending_change };
    },
    onSuccess: ({ result, pending }) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(pending ? t("gl.accounts.form.pendingSent") : t(account ? "gl.accounts.form.updated" : "gl.accounts.form.created", { code: result.code }));
      form.reset(toValues(result));
      onSaved(result);
    },
    onError: (error) => {
      if (!applyServerErrors(error, form.setError)) errorToast(error);
    },
  });

  const parents = accounts.filter((a) => !a.is_posting && a.type === type && a.id !== account?.id);
  const msg = (key?: string) => (key ? (key.startsWith("gl.") ? t(key) : key) : undefined);
  const field = (id: keyof Values) => ({ id: `acc-${id}`, error: msg(errors[id]?.message) });

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4" data-testid="account-form">
      {account?.in_use && <p className="rounded-lg border border-info/30 bg-info/5 p-2 text-xs">{t("gl.accounts.form.inUseNote")}</p>}
      <fieldset disabled={readOnly || save.isPending} className="grid gap-3 sm:grid-cols-2">
        <FormField {...field("code")} label={t("gl.accounts.form.code")} hint={t("gl.accounts.form.codeHint")} required>
          <Input id="acc-code" inputMode="numeric" maxLength={4} className="tabular-nums" aria-invalid={!!errors.code} aria-describedby={describedBy("acc-code", msg(errors.code?.message), t("gl.accounts.form.codeHint"))} {...register("code")} />
        </FormField>
        <FormField {...field("type")} label={t("gl.accounts.form.type")} required>
          <NativeSelect
            id="acc-type"
            {...register("type", {
              onChange: (e) => {
                // The normal balance follows the type unless the user changes it (contra accounts).
                setValue("normal_balance", DEBIT_TYPES.includes(e.target.value) ? "DEBIT" : "CREDIT", { shouldDirty: true });
                setValue("parent_id", null, { shouldDirty: true });
              },
            })}
          >
            {TYPES.map((x) => <option key={x} value={x}>{t(`finance.account.types.${x}`)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField {...field("name")} label={t("gl.accounts.form.nameEn")} required>
          <Input id="acc-name" aria-invalid={!!errors.name} aria-describedby={describedBy("acc-name", msg(errors.name?.message))} {...register("name")} />
        </FormField>
        <FormField {...field("name_km")} label={t("gl.accounts.form.nameKm")}>
          <Input id="acc-name_km" lang="km" {...register("name_km")} />
        </FormField>
        <FormField {...field("category")} label={t("gl.accounts.form.category")} required>
          <Input id="acc-category" aria-invalid={!!errors.category} aria-describedby={describedBy("acc-category", msg(errors.category?.message))} {...register("category")} />
        </FormField>
        <FormField {...field("parent_id")} label={t("gl.accounts.form.parent")}>
          <NativeSelect id="acc-parent_id" aria-invalid={!!errors.parent_id} aria-describedby={describedBy("acc-parent_id", msg(errors.parent_id?.message))} {...register("parent_id", { setValueAs: (v) => v || null })}>
            <option value="">{t("gl.accounts.form.noParent")}</option>
            {parents.map((a) => <option key={a.id} value={a.id}>{a.code} {locale === "km" ? a.name_km : a.name}</option>)}
          </NativeSelect>
        </FormField>
        <FormField {...field("normal_balance")} label={t("gl.accounts.form.normal")} required>
          <NativeSelect id="acc-normal_balance" {...register("normal_balance")}>
            <option value="DEBIT">{t("finance.account.DEBIT")}</option>
            <option value="CREDIT">{t("finance.account.CREDIT")}</option>
          </NativeSelect>
        </FormField>
        <FormField {...field("currency")} label={t("gl.accounts.form.currency")}>
          <NativeSelect id="acc-currency" {...register("currency", { setValueAs: (v) => v || null })}>
            <option value="">{t("gl.accounts.form.anyCurrency")}</option>
            {(currencies ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </NativeSelect>
        </FormField>
        <FormField {...field("cash_flow_class")} label={t("gl.accounts.form.cashFlow")}>
          <NativeSelect id="acc-cash_flow_class" {...register("cash_flow_class", { setValueAs: (v) => v || null })}>
            <option value="">{t("gl.accounts.cashFlowClass.none")}</option>
            {CASH_FLOW.map((c) => <option key={c} value={c}>{t(`gl.accounts.cashFlowClass.${c}`)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField {...field("statement_mapping")} label={t("gl.accounts.form.mapping")} hint={t("gl.accounts.form.mappingHint")}>
          <Input id="acc-statement_mapping" aria-describedby="acc-statement_mapping-hint" {...register("statement_mapping", { setValueAs: (v) => v || null })} />
        </FormField>
        <FormField {...field("effective_from")} label={t("gl.accounts.form.effectiveFrom")}>
          <DateInput id="acc-effective_from" value={watch("effective_from") ?? ""} onValueChange={(v) => setValue("effective_from", v || null, { shouldDirty: true })} />
        </FormField>
        <FormField {...field("effective_to")} label={t("gl.accounts.form.effectiveTo")}>
          <DateInput id="acc-effective_to" value={watch("effective_to") ?? ""} onValueChange={(v) => setValue("effective_to", v || null, { shouldDirty: true })} aria-invalid={!!errors.effective_to} aria-describedby={describedBy("acc-effective_to", msg(errors.effective_to?.message))} />
        </FormField>
        <FormField {...field("description")} label={t("gl.accounts.form.description")} className="sm:col-span-2">
          <Textarea id="acc-description" rows={2} {...register("description")} />
        </FormField>

        <div className="space-y-2 sm:col-span-2">
          <CheckRow id="acc-is_posting" label={t("gl.accounts.form.posting")} hint={t("gl.accounts.form.postingHint")} checked={watch("is_posting")} onChange={(v) => setValue("is_posting", v, { shouldDirty: true })} />
          <CheckRow id="acc-is_control" label={t("gl.accounts.form.control")} hint={t("gl.accounts.form.controlHint")} checked={isControl} onChange={(v) => { setValue("is_control", v, { shouldDirty: true }); if (!v) setValue("control_module", null, { shouldDirty: true }); }} />
          {isControl && (
            <FormField {...field("control_module")} label={t("gl.accounts.form.controlModule")} required className="ml-6 max-w-60">
              <NativeSelect id="acc-control_module" aria-invalid={!!errors.control_module} aria-describedby={describedBy("acc-control_module", msg(errors.control_module?.message))} {...register("control_module", { setValueAs: (v) => v || null })}>
                <option value="">—</option>
                {MODULES.map((m) => <option key={m} value={m}>{t(`gl.accounts.controlModule.${m}`)}</option>)}
              </NativeSelect>
            </FormField>
          )}
          {seeSensitive && <CheckRow id="acc-is_sensitive" label={t("gl.accounts.form.sensitive")} checked={watch("is_sensitive")} onChange={(v) => setValue("is_sensitive", v, { shouldDirty: true })} />}
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="submit" disabled={save.isPending || (account !== null && !formState.isDirty)}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {t("gl.accounts.form.save")}
          </Button>
        </div>
      )}
    </form>
  );
}

function CheckRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-describedby={hint ? `${id}-hint` : undefined} />
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** Pending change banner, status actions and history for an existing account. */
export function AccountActions({ account, onChanged, onDeleted }: { account: Account; onChanged: (a: Account) => void; onDeleted: () => void }) {
  const t = useTranslations();
  const errorToast = useErrorToast();
  const queryClient = useQueryClient();
  const canEdit = usePermission("coa.edit");
  const canApprove = usePermission("coa.approve");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = (a?: Account) => {
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    if (a) onChanged(a);
  };
  const run = useMutation({
    mutationFn: async (action: "deactivate" | "activate" | "delete" | "approve" | "reject") => {
      if (action === "delete") return (await accountsApi.remove(account.id), null);
      if (action === "approve" || action === "reject") return accountsApi.decideChange(account.id, action);
      return action === "deactivate" ? accountsApi.deactivate(account.id) : accountsApi.activate(account.id);
    },
    onSuccess: (result, action) => {
      const messages = {
        deactivate: "gl.accounts.actions.deactivated", activate: "gl.accounts.actions.activated", delete: "gl.accounts.actions.deleted",
        approve: "gl.accounts.pending.approved", reject: "gl.accounts.pending.rejected",
      } as const;
      toast.success(t(messages[action], { code: account.code }));
      if (action === "delete") {
        refresh();
        onDeleted();
      } else refresh(result ?? undefined);
    },
    onError: errorToast,
  });
  const change = account.pending_change;

  return (
    <div className="space-y-3">
      {change && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status" data-testid="pending-change">
          <p className="flex items-center gap-1.5 font-medium text-warning"><AlertTriangle className="size-4" aria-hidden />{t("gl.accounts.pending.title")}</p>
          <p className="mt-1">{t("gl.accounts.pending.body", { name: change.requested_by_name, fields: Object.entries(change.fields).map(([k, v]) => `${k} → ${String(v)}`).join(", ") })}</p>
          {canApprove && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => run.mutate("approve")} disabled={run.isPending}>{t("gl.accounts.pending.approve")}</Button>
              <Button size="sm" variant="outline" onClick={() => run.mutate("reject")} disabled={run.isPending}>{t("gl.accounts.pending.reject")}</Button>
            </div>
          )}
        </div>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {account.is_active ? (
            <Button size="sm" variant="outline" onClick={() => run.mutate("deactivate")} disabled={run.isPending}>{t("gl.accounts.actions.deactivate")}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => run.mutate("activate")} disabled={run.isPending}>{t("gl.accounts.actions.activate")}</Button>
          )}
          {account.in_use ? (
            // Disabled with the reason, rather than hidden, because the reason helps (prompt §5).
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}><Button size="sm" variant="destructive" disabled>{t("gl.accounts.actions.delete")}</Button></span>
              </TooltipTrigger>
              <TooltipContent>{t("gl.accounts.actions.inUse")}</TooltipContent>
            </Tooltip>
          ) : confirmDelete ? (
            <div className="flex w-full flex-col gap-2 rounded-lg border border-destructive/30 p-2 text-sm" role="alertdialog" aria-label={t("gl.accounts.actions.deleteTitle", { code: account.code })}>
              <p className="font-medium">{t("gl.accounts.actions.deleteTitle", { code: account.code })}</p>
              <p className="text-xs text-muted-foreground">{t("gl.accounts.actions.deleteBody")}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => run.mutate("delete")} disabled={run.isPending}>{t("gl.accounts.actions.delete")}</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>{t("gl.accounts.actions.delete")}</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function AccountHistory({ accountId }: { accountId: string }) {
  const t = useTranslations("gl.accounts.history");
  const query = useQuery({ queryKey: ["accounts", "history", accountId], queryFn: () => accountsApi.history(accountId) });
  const events = (query.data?.data ?? []).map((e) => ({ ...e, action: t.has(e.action) ? t(e.action) : e.action }));
  return <HistoryPanel events={events} />;
}
