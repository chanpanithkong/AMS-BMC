"use client";

import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, type ComponentProps, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrencies, useDepartments, useDimensions, useFormatters } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import { useCurrentCompany } from "@/lib/auth/session";
import { useAppLocale } from "@/lib/i18n/navigation";
import { D, inverseRate } from "@/lib/money/decimal";
import { formatDecimal } from "@/lib/money/format";
import { emptyJournalLine, journalLineIssues, journalTotals, type JournalLineDraft } from "@/lib/money/journal";
import { cn } from "@/lib/utils";
import { AccountPicker } from "./account-picker";
import { AmountInput } from "./amount";

interface Option {
  id: string;
  name: string;
  name_km?: string | null;
}

/** Compact native select for grid cells: fast to render in many rows and has built-in type-ahead. */
function CellSelect({ options, allowNone, className, ...props }: ComponentProps<"select"> & { options: { value: string; label: string }[]; allowNone?: boolean }) {
  return (
    <select
      {...props}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-1.5 text-sm outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
    >
      {allowNone && <option value="">—</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

interface JournalLineGridProps {
  lines: JournalLineDraft[];
  onChange: (lines: JournalLineDraft[]) => void;
  /** Journal currency used for new lines; defaults to the company's base currency. */
  defaultCurrency?: string;
  /** Posted journals are shown read-only (SRS SCR-04). */
  readOnly?: boolean;
  /** Accounts to offer; defaults to the posting accounts the user may see. */
  accounts?: Account[];
  /** Show the hints next to incomplete lines (after the first save or submit attempt). */
  showIssues?: boolean;
}

/**
 * Spreadsheet-like journal line editor (SRS SCR-04, NFR-USA-010).
 * Keyboard: Tab moves between cells, Enter moves to the same column in the next row (adding a row at
 * the end), Ctrl+Enter adds a line, Ctrl+Delete removes the current line.
 * Totals and the difference indicator are a preview; the server's numbers are authoritative.
 */
export function JournalLineGrid({ lines, onChange, defaultCurrency, readOnly, accounts, showIssues }: JournalLineGridProps) {
  const t = useTranslations("finance.journal");
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const base = company?.base_currency ?? "USD";
  const currency = defaultCurrency ?? base;
  const { data: currencies } = useCurrencies();
  const { data: departments } = useDepartments();
  const { data: dimensions } = useDimensions();
  const table = useRef<HTMLTableElement>(null);

  const name = (o: Option) => (locale === "km" && o.name_km ? o.name_km : o.name);
  const totals = journalTotals(lines, base);
  const currencyOptions = (currencies?.filter((c) => c.is_active).map((c) => c.code) ?? [base]).map((code) => ({ value: code, label: code }));
  const branchOptions = (company?.branches ?? []).map((b) => ({ value: b.id, label: name(b) }));
  const departmentOptions = (departments ?? []).map((d) => ({ value: d.id, label: name(d) }));

  const update = (index: number, patch: Partial<JournalLineDraft>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const focusCell = (row: number, col: string) => {
    // Wait for React to render a newly added row.
    requestAnimationFrame(() => {
      table.current?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)?.focus();
    });
  };

  const addLine = (after: number) => {
    const next = [...lines];
    next.splice(after + 1, 0, emptyJournalLine(currency));
    onChange(next);
    focusCell(after + 1, "account");
  };

  const removeLine = (index: number, col = "account") => {
    if (lines.length <= 1) return onChange([emptyJournalLine(currency)]);
    onChange(lines.filter((_, i) => i !== index));
    focusCell(Math.min(index, lines.length - 2), col);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    const row = Number(target.dataset.row);
    const col = target.dataset.col;
    if (!col || Number.isNaN(row)) return;

    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addLine(row);
    } else if (e.key === "Delete" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      removeLine(row, col);
    } else if (e.key === "Enter" && !e.shiftKey && target.dataset.gridEnter !== "native") {
      // Enter = next row, same column; a new row is added after the last one.
      e.preventDefault();
      if (row === lines.length - 1) {
        onChange([...lines, emptyJournalLine(currency)]);
      }
      focusCell(row + 1, col);
    }
  };

  const cell = (row: number, col: string, field: string) => ({
    "data-row": row,
    "data-col": col,
    "aria-label": t("lineField", { field, line: row + 1 }),
  });

  const head = "px-1.5 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

  return (
    <div className="min-w-0 space-y-2">
      <div className="relative overflow-x-auto rounded-lg border">
        <table ref={table} className="w-full min-w-[60rem] border-collapse text-sm" onKeyDown={onKeyDown}>
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className={cn(head, "w-8 text-center")}>{t("line")}</th>
              <th scope="col" className={cn(head, "min-w-56")}>{t("account")}</th>
              <th scope="col" className={cn(head, "min-w-40")}>{t("description")}</th>
              <th scope="col" className={cn(head, "w-32 text-right")}>{t("debit")}</th>
              <th scope="col" className={cn(head, "w-32 text-right")}>{t("credit")}</th>
              <th scope="col" className={cn(head, "w-20")}>{t("currency")}</th>
              <th scope="col" className={cn(head, "w-28 text-right")}>{t("rate")}</th>
              <th scope="col" className={cn(head, "w-32")}>{t("branch")}</th>
              <th scope="col" className={cn(head, "w-32")}>{t("department")}</th>
              {dimensions?.map((d) => (
                <th key={d.id} scope="col" className={cn(head, "w-32")}>{name(d)}</th>
              ))}
              {!readOnly && <th scope="col" className="w-9"><span className="sr-only">{t("removeLine", { line: "" })}</span></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const foreign = line.currency !== base;
              const issues = showIssues ? journalLineIssues(line, base) : [];
              const inverse = foreign ? inverseRate(line.rate, 2) : null;
              return (
                <tr key={line.key} className="border-t align-top" data-testid="journal-line">
                  <td className="px-1.5 py-2.5 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="p-1">
                    <AccountPicker
                      value={line.account_id}
                      onChange={(account_id) => update(i, { account_id })}
                      accounts={accounts}
                      disabled={readOnly}
                      invalid={issues.includes("no_account")}
                      cellProps={{ "data-row": i, "data-col": "account" }}
                      aria-label={t("lineField", { field: t("account"), line: i + 1 })}
                    />
                    {issues.length > 0 && (
                      <p className="mt-0.5 text-xs text-destructive" role="alert">
                        {issues.map((issue) => t(`issues.${issue}`)).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="p-1">
                    <Input
                      value={line.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      disabled={readOnly}
                      {...cell(i, "description", t("description"))}
                    />
                  </td>
                  <td className="p-1">
                    <AmountInput
                      value={line.debit}
                      onValueChange={(debit) => update(i, { debit })}
                      currency={line.currency}
                      disabled={readOnly}
                      aria-invalid={issues.includes("both_sides")}
                      {...cell(i, "debit", t("debit"))}
                    />
                  </td>
                  <td className="p-1">
                    <AmountInput
                      value={line.credit}
                      onValueChange={(credit) => update(i, { credit })}
                      currency={line.currency}
                      disabled={readOnly}
                      aria-invalid={issues.includes("both_sides")}
                      {...cell(i, "credit", t("credit"))}
                    />
                  </td>
                  <td className="p-1">
                    <CellSelect
                      value={line.currency}
                      options={currencyOptions}
                      disabled={readOnly}
                      onChange={(e) => update(i, { currency: e.target.value, rate: e.target.value === base ? "1" : "" })}
                      {...cell(i, "currency", t("currency"))}
                    />
                  </td>
                  <td className="p-1">
                    {foreign ? (
                      <>
                        <Input
                          value={line.rate}
                          onChange={(e) => /^[\d.]*$/.test(e.target.value) && update(i, { rate: e.target.value })}
                          disabled={readOnly}
                          inputMode="decimal"
                          className="amount"
                          aria-invalid={issues.includes("missing_rate")}
                          {...cell(i, "rate", t("rate"))}
                        />
                        {inverse && (
                          <p className="mt-0.5 text-right text-[11px] text-muted-foreground tabular-nums">
                            1 {base} = {formatDecimal(inverse, 2, "minus")} {line.currency}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="amount block px-2 py-1.5 text-muted-foreground">1.00</span>
                    )}
                  </td>
                  <td className="p-1">
                    <CellSelect
                      allowNone
                      value={line.branch_id ?? ""}
                      options={branchOptions}
                      disabled={readOnly}
                      onChange={(e) => update(i, { branch_id: e.target.value || null })}
                      {...cell(i, "branch", t("branch"))}
                    />
                  </td>
                  <td className="p-1">
                    <CellSelect
                      allowNone
                      value={line.department_id ?? ""}
                      options={departmentOptions}
                      disabled={readOnly}
                      onChange={(e) => update(i, { department_id: e.target.value || null })}
                      {...cell(i, "department", t("department"))}
                    />
                  </td>
                  {dimensions?.map((d) => (
                    <td key={d.id} className="p-1">
                      <CellSelect
                        allowNone
                        value={line.dimensions[d.code] ?? ""}
                        options={d.values.map((v) => ({ value: v.id, label: name(v) }))}
                        disabled={readOnly}
                        onChange={(e) => update(i, { dimensions: { ...line.dimensions, [d.code]: e.target.value || null } })}
                        {...cell(i, `dim-${d.code}`, name(d))}
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="p-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)} aria-label={t("removeLine", { line: i + 1 })} tabIndex={-1}>
                        <Trash2 aria-hidden />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 bg-muted/50 font-medium">
            <tr>
              <td colSpan={3} className="px-2 py-2 text-right">{t("totals", { currency: base })}</td>
              <td className="amount px-3 py-2" data-testid="total-debit">{format.amount(totals.debit, base)}</td>
              <td className="amount px-3 py-2" data-testid="total-credit">{format.amount(totals.credit, base)}</td>
              <td colSpan={4 + (dimensions?.length ?? 0) + (readOnly ? 0 : 1)} className="px-2 py-2">
                {/* Text plus icon plus colour: never colour alone. */}
                {totals.balanced ? (
                  <span className="inline-flex items-center gap-1 text-success" role="status" data-testid="balance-indicator" data-balanced="true">
                    <CheckCircle2 className="size-4" aria-hidden />
                    {t("balanced")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-destructive" role="status" data-testid="balance-indicator" data-balanced="false">
                    <XCircle className="size-4" aria-hidden />
                    {totals.difference.isZero()
                      ? t("needTwoLines")
                      : t("differ", { amount: format.amount(D(totals.difference).abs(), base) })}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addLine(lines.length - 1)}>
            <Plus aria-hidden />
            {t("addLine")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("shortcuts")}</p>
        </div>
      )}
    </div>
  );
}
