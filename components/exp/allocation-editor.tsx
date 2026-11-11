"use client";

import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/forms/field";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { ExpenseAllocation } from "@/lib/api/types/cashbank";
import { useCurrentCompany } from "@/lib/auth/session";
import { useAppLocale } from "@/lib/i18n/navigation";
import { D, Decimal } from "@/lib/money/decimal";
import { splitByPercent, total } from "@/lib/money/split";

interface Props {
  mode: "PERCENT" | "AMOUNT";
  onModeChange: (mode: "PERCENT" | "AMOUNT") => void;
  allocations: ExpenseAllocation[];
  onChange: (allocations: ExpenseAllocation[]) => void;
  amount: string;
  currency: string;
  readOnly?: boolean;
}

/** Split an expense across departments and branches by percent or amount (FR-EXP-005, AT-EXP-02). */
export function AllocationEditor({ mode, onModeChange, allocations, onChange, amount, currency, readOnly }: Props) {
  const t = useTranslations("exp.alloc");
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const { data: departments } = useDepartments();
  // Amounts in percent mode are a preview of the server's split: the last line takes the remainder.
  const preview = mode === "PERCENT" ? splitByPercent(amount || "0", allocations.map((a) => a.percent ?? "0"), currency) : null;
  const percentTotal = total(allocations.map((a) => a.percent));
  const amountTotal = total(allocations.map((a) => a.amount));
  const ok = mode === "PERCENT" ? percentTotal.eq(100) : amountTotal.eq(D(amount));
  const set = (i: number, patch: Partial<ExpenseAllocation>) => onChange(allocations.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const splitEvenly = () => {
    const n = allocations.length;
    if (!n) return;
    const share = new Decimal(100).div(n).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    onChange(allocations.map((a, i) => ({ ...a, percent: (i === n - 1 ? new Decimal(100).minus(share.times(n - 1)) : share).toFixed(2) })));
  };
  const name = (x: { name: string; name_km: string }) => (locale === "km" ? x.name_km : x.name);

  return (
    <section className="space-y-2 rounded-xl border bg-card p-4" aria-labelledby="alloc-title" data-testid="allocation-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="alloc-title" className="text-sm font-semibold">{t("title")}</h2>
        {!readOnly && (
          <div className="flex items-center gap-1" role="group" aria-label={t("mode")}>
            {(["PERCENT", "AMOUNT"] as const).map((m) => (
              <Button key={m} type="button" size="xs" variant={mode === m ? "secondary" : "ghost"} aria-pressed={mode === m} onClick={() => onModeChange(m)}>{t(m)}</Button>
            ))}
          </div>
        )}
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="px-1 py-1 font-medium">{t("colDepartment")}</th>
              <th scope="col" className="px-1 py-1 font-medium">{t("colBranch")}</th>
              {mode === "PERCENT" && <th scope="col" className="w-24 px-1 py-1 text-right font-medium">{t("colPercent")}</th>}
              <th scope="col" className="w-36 px-1 py-1 text-right font-medium">{t("colAmount")} ({currency})</th>
              {!readOnly && <th scope="col" className="w-9"><span className="sr-only">{t("remove", { line: "" })}</span></th>}
            </tr>
          </thead>
          <tbody>
            {allocations.map((a, i) => (
              <tr key={i} className="border-t" data-testid="allocation-line">
                <td className="p-1">
                  <NativeSelect value={a.department_id ?? ""} disabled={readOnly} onChange={(e) => set(i, { department_id: e.target.value || null })} aria-label={t("department", { line: i + 1 })}>
                    <option value="">—</option>
                    {departments?.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
                  </NativeSelect>
                </td>
                <td className="p-1">
                  <NativeSelect value={a.branch_id ?? ""} disabled={readOnly} onChange={(e) => set(i, { branch_id: e.target.value || null })} aria-label={t("branch", { line: i + 1 })}>
                    <option value="">—</option>
                    {company?.branches.map((b) => <option key={b.id} value={b.id}>{name(b)}</option>)}
                  </NativeSelect>
                </td>
                {mode === "PERCENT" && (
                  <td className="p-1">
                    <Input className="amount" inputMode="decimal" disabled={readOnly} value={a.percent ?? ""} onChange={(e) => /^\d{0,3}(\.\d{0,2})?$/.test(e.target.value) && set(i, { percent: e.target.value })} aria-label={t("percent", { line: i + 1 })} />
                  </td>
                )}
                <td className="p-1">
                  {mode === "AMOUNT" && !readOnly ? (
                    <AmountInput currency={currency} value={a.amount === "0" ? "" : a.amount} onValueChange={(v) => set(i, { amount: v })} aria-label={t("amount", { line: i + 1 })} />
                  ) : (
                    <AmountText value={preview?.[i] ?? a.amount} currency={currency} className="px-2" />
                  )}
                </td>
                {!readOnly && (
                  <td className="p-1">
                    <Button type="button" variant="ghost" size="icon" disabled={allocations.length === 1} onClick={() => onChange(allocations.filter((_, j) => j !== i))} aria-label={t("remove", { line: i + 1 })}><Trash2 aria-hidden /></Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!readOnly && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onChange([...allocations, { department_id: null, branch_id: null, percent: mode === "PERCENT" ? "0" : null, amount: "0" }])}><Plus aria-hidden />{t("add")}</Button>
            {mode === "PERCENT" && allocations.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={splitEvenly}>{t("split")}</Button>}
          </div>
        )}
        <span className={`flex items-center gap-1 text-sm ${ok ? "text-success" : "text-destructive"}`} role="status" data-testid="allocation-total" data-ok={ok}>
          {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
          {mode === "PERCENT" ? t("totalPercent", { total: percentTotal.toFixed(2) }) : t("totalAmount", { total: format.amount(amountTotal, currency), amount: format.amount(amount || "0", currency) })}
          {!ok && <span className="sr-only">{mode === "PERCENT" ? t("percentError") : t("amountError")}</span>}
        </span>
      </div>
      {mode === "PERCENT" && <p className="text-xs text-muted-foreground">{t("rounding")}</p>}
    </section>
  );
}
