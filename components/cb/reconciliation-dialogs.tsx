"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { DateInput } from "@/components/finance/date-range-picker";
import { Input } from "@/components/ui/input";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { useFormatters, usePostingAccounts } from "@/lib/api/hooks";
import type { Reconciliation, StatementLine } from "@/lib/api/types/cashbank";
import { D } from "@/lib/money/decimal";

/** Adjustment for a statement line the books do not have yet, e.g. a fee or interest (FR-CB-010). */
export function AdjustDialog({ rec, line, onClose, onDone }: { rec: Reconciliation; line: StatementLine; onClose: () => void; onDone: (r: Reconciliation) => void }) {
  const t = useTranslations();
  const format = useFormatters();
  const { data: accounts } = usePostingAccounts();
  // Income for money in, expenses for money out; never control or cash accounts.
  const choices = (accounts ?? []).filter((a) => !a.is_control && a.cash_flow_class !== "CASH" && (D(line.amount).gt(0) ? a.type === "REVENUE" : a.type === "EXPENSE"));
  const [accountId, setAccountId] = useState<string | null>(D(line.amount).lt(0) ? "acc-6800" : "acc-7100");
  const [text, setText] = useState(line.description);
  const [date, setDate] = useState(line.date);
  return (
    <ConfirmActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      action="post"
      title={t("cb.rec.adjust.title", { description: line.description })}
      description={t("cb.rec.adjust.description")}
      effect={{ date: format.date(date), currency: rec.currency, amount: line.amount, accounts: [rec.bank_account_name] }}
      thresholdAmount="0"
      canConfirm={Boolean(accountId && text.trim() && date)}
      onConfirm={async ({ idempotencyKey }) => {
        const next = await cashBankApi.adjust(rec.id, { statement_line_id: line.id, account_id: accountId!, description: text.trim(), date }, idempotencyKey);
        onDone(next);
        return t("cb.rec.toast.adjusted");
      }}
    >
      <div className="space-y-3" data-testid="adjust-form">
        <FormField id="adj-account" label={t("cb.rec.adjust.account")} required>
          <AccountPicker id="adj-account" value={accountId} accounts={choices} onChange={(id) => setAccountId(id)} aria-label={t("cb.rec.adjust.account")} />
        </FormField>
        <FormField id="adj-text" label={t("cb.rec.adjust.text")} required>
          <Input id="adj-text" value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
        <FormField id="adj-date" label={t("cb.rec.adjust.date")} required>
          <DateInput id="adj-date" value={date} onValueChange={setDate} />
        </FormField>
      </div>
    </ConfirmActionDialog>
  );
}

/** Complete (with an explanation when a difference remains, BR-CB-002) or reopen a reconciliation. */
export function CompleteDialog({ rec, mode, onClose, onDone }: { rec: Reconciliation; mode: "complete" | "reopen"; onClose: () => void; onDone: (r: Reconciliation) => void }) {
  const t = useTranslations();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const s = rec.summary;
  const hasDifference = !D(s.difference).isZero();
  return (
    <ConfirmActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      action={mode === "complete" ? "complete" : "reopen"}
      title={mode === "complete" ? t("cb.rec.complete.title") : t("cb.rec.reopen.title")}
      description={
        mode === "complete"
          ? hasDifference
            ? t("cb.rec.complete.differenceNote", { amount: format.amount(D(s.difference).abs(), rec.currency) })
            : t("cb.rec.complete.description")
          : t("cb.rec.reopen.description")
      }
      requireReason={mode === "reopen" || hasDifference}
      reasonLabel={mode === "complete" ? t("cb.rec.complete.explanation") : undefined}
      effect={{
        date: format.date(rec.statement_date), currency: rec.currency, amount: s.statement_closing,
        accounts: [rec.bank_account_name, `${t("cb.rec.summary.difference")}: ${format.amount(s.difference, rec.currency, { withCode: true })}`],
      }}
      thresholdAmount="0"
      onConfirm={async ({ reason, idempotencyKey }) => {
        const next = mode === "complete" ? await cashBankApi.complete(rec.id, reason || undefined, idempotencyKey) : await cashBankApi.reopen(rec.id, reason);
        onDone(next);
        void queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
        return t(`status.${next.status}`);
      }}
    />
  );
}
