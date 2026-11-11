"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmActionDialog, type FinancialEffect } from "@/components/workflow/confirm-action-dialog";
import { approvalsApi, journalsApi } from "@/lib/api/endpoints/journals";
import { useFormatters } from "@/lib/api/hooks";
import type { JournalEntry } from "@/lib/api/types/journals";
import { useCurrentCompany } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { useAppLocale } from "@/lib/i18n/navigation";
import { usePeriodOf } from "./journal-shared";

export type JournalDialog = "post" | "reverse" | "approve" | "reject" | "delegate" | null;

/** Financial effect shown in the confirmation (SRS SCR-06). */
function useEffectOf(journal: JournalEntry, date?: string): FinancialEffect {
  const locale = useAppLocale();
  const company = useCurrentCompany();
  const format = useFormatters();
  const periodOf = usePeriodOf();
  const period = periodOf(date ?? journal.posting_date);
  const accounts = [...new Map(journal.lines.map((l) => [l.account_id, `${l.account_code} ${locale === "km" ? l.account_name_km : l.account_name}`])).values()];
  return {
    company: company ? (locale === "km" ? company.name_km : company.name) : undefined,
    period: period ? (locale === "km" ? period.name_km : period.name) : journal.period ?? undefined,
    date: format.date(date ?? journal.posting_date),
    currency: company?.base_currency ?? "USD",
    debitTotal: journal.totals.debit_base,
    creditTotal: journal.totals.credit_base,
    accounts,
  };
}

interface JournalDialogsProps {
  journal: JournalEntry;
  open: JournalDialog;
  onOpenChange: (dialog: JournalDialog) => void;
  onUpdated: (journal: JournalEntry) => void;
}

/** Post, reverse, approve, reject and delegate, each through a confirmation (SRS §14.5). */
export function JournalDialogs({ journal, open, onOpenChange, onUpdated }: JournalDialogsProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [reversalDate, setReversalDate] = useState(() => {
    const today = todayBusinessDate();
    return journal.posting_date > today ? journal.posting_date : today;
  });
  const effect = useEffectOf(journal);
  const reversalEffect = useEffectOf(journal, reversalDate);
  const number = journal.journal_no ?? journal.reference;

  const done = (updated?: JournalEntry) => {
    void queryClient.invalidateQueries({ queryKey: ["journals"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
    void queryClient.invalidateQueries({ queryKey: ["journal", journal.id] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
    if (updated) onUpdated(updated);
  };
  const close = (o: boolean) => !o && onOpenChange(null);

  return (
    <>
      <ConfirmActionDialog
        open={open === "post"}
        onOpenChange={close}
        action="post"
        title={t("gl.journal.post.title")}
        description={t("gl.journal.post.description")}
        effect={effect}
        thresholdAmount={journal.totals.debit_base}
        onConfirm={async ({ idempotencyKey }) => {
          const posted = await journalsApi.post(journal.id, idempotencyKey);
          done(posted);
          return posted.journal_no ?? undefined;
        }}
        onDone={() => done()}
      />
      <ConfirmActionDialog
        open={open === "reverse"}
        onOpenChange={close}
        action="reverse"
        title={t("gl.journal.reverse.title", { number })}
        description={t("gl.journal.reverse.description")}
        effect={reversalEffect}
        thresholdAmount={journal.totals.debit_base}
        onConfirm={async ({ reason, idempotencyKey }) => {
          const reversal = await journalsApi.reverse(journal.id, { reversal_date: reversalDate, reason }, idempotencyKey);
          done();
          toast.success(t("gl.journal.toast.reversed", { number: reversal.journal_no ?? "" }));
          return reversal.journal_no ?? undefined;
        }}
      >
        <FormField id="reversal-date" label={t("gl.journal.reverse.date")} hint={t("gl.journal.reverse.dateHint")}>
          <DateInput id="reversal-date" value={reversalDate} onValueChange={setReversalDate} aria-describedby="reversal-date-hint" />
        </FormField>
      </ConfirmActionDialog>
      <ConfirmActionDialog
        open={open === "approve"}
        onOpenChange={close}
        action="approve"
        title={t("gl.journal.approve.title")}
        effect={effect}
        thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => {
          const updated = await journalsApi.decide(journal.id, { action: "approve" }, idempotencyKey);
          done(updated);
          return t(`status.${updated.status}`);
        }}
      />
      <ConfirmActionDialog
        open={open === "reject"}
        onOpenChange={close}
        action="reject"
        title={t("gl.journal.reject.title")}
        description={t("gl.journal.reject.description")}
        reasonLabel={t("common.comment")}
        effect={effect}
        thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => {
          const updated = await journalsApi.decide(journal.id, { action: "reject", comment: reason }, idempotencyKey);
          done(updated);
          return t(`status.${updated.status}`);
        }}
      />
      {open === "delegate" && <DelegateDialog journal={journal} onClose={() => onOpenChange(null)} onDone={done} />}
    </>
  );
}

function DelegateDialog({ journal, onClose, onDone }: { journal: JournalEntry; onClose: () => void; onDone: (j: JournalEntry) => void }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const errorToast = useErrorToast();
  const [userId, setUserId] = useState("");
  const approvers = useQuery({ queryKey: ["approvers"], queryFn: () => approvalsApi.approvers() });
  const options = (approvers.data?.data ?? []).filter((u) => u.id !== journal.preparer_id);
  const delegate = useMutation({
    mutationFn: () => journalsApi.delegate(journal.id, userId),
    onSuccess: (updated) => {
      const user = options.find((u) => u.id === userId);
      toast.success(t("gl.journal.toast.delegated", { name: user ? (locale === "km" ? user.full_name_km : user.full_name) : "" }));
      onDone(updated);
      onClose();
    },
    onError: errorToast,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("gl.journal.delegate.title")}</DialogTitle>
          <DialogDescription>{t("gl.journal.delegate.description")}</DialogDescription>
        </DialogHeader>
        <FormField id="delegate-user" label={t("gl.journal.delegate.user")}>
          <NativeSelect id="delegate-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">—</option>
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {locale === "km" ? u.full_name_km : u.full_name} ({u.roles.map((r) => t(`roles.${r}`)).join(", ")})
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => delegate.mutate()} disabled={!userId || delegate.isPending}>{t("gl.journal.delegate.submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
