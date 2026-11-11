"use client";

import { useTranslations } from "next-intl";
import { useFiscalYears } from "@/lib/api/hooks";
import type { JournalEntry, JournalLine, JournalLineInput } from "@/lib/api/types/journals";
import type { AccountingPeriod } from "@/lib/api/types/org";
import { D } from "@/lib/money/decimal";
import { emptyJournalLine, type JournalLineDraft } from "@/lib/money/journal";

/** Server line → editable grid line. Zero amounts become empty cells. */
export function toDraftLine(line: JournalLine, keyPrefix = ""): JournalLineDraft {
  return emptyJournalLine(line.currency, {
    key: `${keyPrefix}${line.id}`,
    account_id: line.account_id,
    description: line.description,
    debit: D(line.debit).isZero() ? "" : line.debit,
    credit: D(line.credit).isZero() ? "" : line.credit,
    rate: line.rate,
    branch_id: line.branch_id,
    department_id: line.department_id,
    dimensions: line.dimensions ?? {},
  });
}

/** Grid lines → request lines. Completely empty lines are left out. */
export function toInputLines(lines: JournalLineDraft[]): JournalLineInput[] {
  return lines
    .filter((l) => l.account_id || !D(l.debit).isZero() || !D(l.credit).isZero() || l.description.trim())
    .map((l) => ({
      account_id: l.account_id,
      description: l.description,
      debit: l.debit || "0",
      credit: l.credit || "0",
      currency: l.currency,
      rate: l.rate || "0",
      branch_id: l.branch_id,
      department_id: l.department_id,
      dimensions: l.dimensions,
    }));
}

export function usePeriodOf() {
  const { data } = useFiscalYears();
  const periods = data?.flatMap((y) => y.periods) ?? [];
  return (date: string): AccountingPeriod | undefined => periods.find((p) => p.start_date <= date && date <= p.end_date);
}

/** Server field path such as "lines.2.account_id" → "Line 3: …" for the error banner. */
export function useFieldLabel() {
  const t = useTranslations();
  return (field: string | undefined): string | null => {
    if (!field) return null;
    const match = /^lines\.(\d+)/.exec(field);
    if (match) return t("finance.journal.lineField", { field: t("finance.journal.account"), line: Number(match[1]) + 1 });
    return null;
  };
}

export const isPostedState = (j: Pick<JournalEntry, "status">) => j.status === "POSTED" || j.status === "REVERSED";
