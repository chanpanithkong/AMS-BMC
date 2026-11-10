"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useFormatters } from "@/lib/api/hooks";
import { isApiError } from "@/lib/api/errors";
import { IdempotencyKeyHolder, runIdempotent } from "@/lib/api/idempotency";
import { config } from "@/lib/config";
import { useAppLocale } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { amountInWords } from "@/lib/money/words";

export type CriticalAction =
  | "post" | "reverse" | "approve" | "reject" | "release" | "writeOff" | "complete" | "closePeriod" | "reopenPeriod"
  | "yearEndClose" | "changeSetting";

/** Actions for which the SRS asks for a reason (prompt §5). */
const REASON_REQUIRED: CriticalAction[] = ["reverse", "reject", "reopenPeriod", "writeOff"];
/** Server answers that mean "this was already done" — shown as information, not as an error. */
const ALREADY_DONE_CODES = ["ALREADY_POSTED", "RECONCILIATION_COMPLETED"];

export interface FinancialEffect {
  company?: string;
  period?: string;
  /** Posting or payment date, already formatted. */
  date?: string;
  currency: string;
  debitTotal?: string;
  creditTotal?: string;
  /** Single amount for payments, write-offs and approvals. */
  amount?: string;
  /** Accounts affected, e.g. "6200 Utilities expense". */
  accounts?: string[];
}

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: CriticalAction;
  /** Overrides the default title, e.g. "Post journal JV-DRAFT-12". */
  title?: string;
  description?: string;
  effect: FinancialEffect;
  /** Spell the amount out in words, in the active language (payments, SRS SCR-12). */
  showAmountInWords?: boolean;
  /** Force or waive the reason; by default it follows the action. */
  requireReason?: boolean;
  /** Amount in base currency compared with the "I confirm" threshold; defaults to the effect's amount. */
  thresholdAmount?: string;
  /**
   * Performs the action. Receives the Idempotency-Key to send; resolves with the resulting number or
   * status for the success message (e.g. "JV-2027-000312").
   */
  onConfirm: (input: { reason: string; idempotencyKey: string }) => Promise<string | void>;
  /** Called after success, or when the server says the action was already done. */
  onDone?: () => void;
}

/**
 * Confirmation for critical actions (SRS §14.5, SCR-06): summarises the financial effect, asks for a
 * reason where required and for "I confirm" above a threshold, blocks double submission, and shows
 * the resulting number or status.
 */
export function ConfirmActionDialog({
  open, onOpenChange, action, title, description, effect, showAmountInWords, requireReason, thresholdAmount, onConfirm, onDone,
}: ConfirmActionDialogProps) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const describe = useDescribeError();
  const reasonId = useId();
  const [holder] = useState(() => new IdempotencyKeyHolder());
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reasonMissing, setReasonMissing] = useState(false);
  const [failure, setFailure] = useState<{ message: string; reference: string | null; conflict: boolean } | null>(null);

  const needsReason = requireReason ?? REASON_REQUIRED.includes(action);
  const compareAmount = thresholdAmount ?? effect.amount ?? effect.debitTotal ?? "0";
  const needsCheckbox = D(compareAmount).abs().gte(D(config.confirmThreshold));
  const actionLabel = t(`workflow.actions.${action}`);
  const destructive = action === "reverse" || action === "reject" || action === "writeOff";

  const close = (next: boolean) => {
    if (busy) return; // never dismiss while the request is running
    if (!next) {
      setReason("");
      setConfirmed(false);
      setFailure(null);
      setReasonMissing(false);
    }
    onOpenChange(next);
  };

  const run = async () => {
    if (busy) return;
    if (needsReason && !reason.trim()) return setReasonMissing(true);
    setReasonMissing(false);
    setFailure(null);
    setBusy(true);
    try {
      const result = await runIdempotent(holder, (idempotencyKey) => onConfirm({ reason: reason.trim(), idempotencyKey }));
      toast.success(t("workflow.confirm.success", { result: result || actionLabel }));
      setBusy(false);
      close(false);
      onDone?.();
      return;
    } catch (error) {
      setBusy(false);
      if (isApiError(error) && ALREADY_DONE_CODES.includes(error.code)) {
        // A second click on an action that already went through is not an error (prompt §5).
        toast.info(t("workflow.confirm.alreadyDone", { result: describe(error).message }));
        close(false);
        onDone?.();
        return;
      }
      const described = describe(error);
      setFailure({ message: described.message, reference: described.reference, conflict: described.code === "VERSION_CONFLICT" });
    }
  };

  const rows: [string, string | undefined, boolean?][] = [
    [t("workflow.confirm.company"), effect.company],
    [t("workflow.confirm.period"), effect.period],
    [t("workflow.confirm.date"), effect.date],
    [t("workflow.confirm.debitTotal"), effect.debitTotal && format.amount(effect.debitTotal, effect.currency, { withCode: true }), true],
    [t("workflow.confirm.creditTotal"), effect.creditTotal && format.amount(effect.creditTotal, effect.currency, { withCode: true }), true],
    [t("workflow.confirm.amount"), effect.amount && format.amount(effect.amount, effect.currency, { withCode: true }), true],
  ];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={!busy} data-testid="confirm-action-dialog" onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title ?? actionLabel}</DialogTitle>
          <DialogDescription>{description ?? (action === "post" ? t("workflow.confirm.irreversible") : actionLabel)}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
          {rows.filter(([, value]) => value).map(([label, value, numeric]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={numeric ? "amount font-medium" : "text-right font-medium"}>{value}</dd>
            </div>
          ))}
          {showAmountInWords && effect.amount && (
            <div className="contents">
              <dt className="text-muted-foreground">{t("workflow.confirm.amountInWords")}</dt>
              <dd className="text-right font-medium" data-testid="amount-in-words">{amountInWords(effect.amount, effect.currency, locale)}</dd>
            </div>
          )}
          {effect.accounts && effect.accounts.length > 0 && (
            <div className="contents">
              <dt className="text-muted-foreground">{t("workflow.confirm.accounts")}</dt>
              <dd>
                <ul className="text-right">
                  {effect.accounts.map((account) => <li key={account}>{account}</li>)}
                </ul>
              </dd>
            </div>
          )}
        </dl>

        {needsReason && (
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium">
              {t("workflow.confirm.reason")} <span className="text-destructive" aria-hidden>*</span>
            </label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("workflow.confirm.reasonPlaceholder")}
              required
              disabled={busy}
              aria-invalid={reasonMissing}
              aria-describedby={reasonMissing ? `${reasonId}-error` : undefined}
            />
            {reasonMissing && <p id={`${reasonId}-error`} className="text-sm text-destructive" role="alert">{t("workflow.confirm.reasonRequired")}</p>}
          </div>
        )}

        {needsCheckbox && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} disabled={busy} data-testid="i-confirm" />
            {t("workflow.confirm.iConfirm")}
          </label>
        )}

        {failure && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="space-y-1">
              <p>{failure.message}</p>
              {failure.reference && <p className="font-mono text-xs">{t("errors.reference", { id: failure.reference })}</p>}
              {failure.conflict && (
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>{t("workflow.conflict.reload")}</Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>{t("common.cancel")}</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={run}
            disabled={busy || (needsCheckbox && !confirmed)}
            aria-busy={busy}
            data-testid="confirm-action"
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {busy ? t("workflow.confirm.processing") : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onSubmit: (reason: string) => void;
}

/** Small dialog that collects a required reason, e.g. for a possible-duplicate supplier invoice (SCR-11). */
export function ReasonDialog({ open, onOpenChange, title, description, onSubmit }: ReasonDialogProps) {
  const t = useTranslations();
  const id = useId();
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const close = (next: boolean) => {
    if (!next) {
      setReason("");
      setMissing(false);
    }
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t("workflow.reason.title")}</DialogTitle>
          <DialogDescription>{description ?? t("workflow.confirm.reasonPlaceholder")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return setMissing(true);
            onSubmit(reason.trim());
            close(false);
          }}
        >
          <label htmlFor={id} className="sr-only">{t("workflow.confirm.reason")}</label>
          <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus aria-invalid={missing} aria-describedby={missing ? `${id}-error` : undefined} />
          {missing && <p id={`${id}-error`} className="text-sm text-destructive" role="alert">{t("workflow.confirm.reasonRequired")}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>{t("common.cancel")}</Button>
            <Button type="submit">{t("workflow.reason.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
