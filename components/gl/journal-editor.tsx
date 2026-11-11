"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Lock, Save, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { DateInput } from "@/components/finance/date-range-picker";
import { JournalLineGrid } from "@/components/finance/journal-line-grid";
import { CurrencySelect } from "@/components/finance/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/workflow/approval";
import { journalsApi } from "@/lib/api/endpoints/journals";
import { orgApi } from "@/lib/api/endpoints/org";
import { isApiError } from "@/lib/api/errors";
import type { JournalEntry, JournalInput } from "@/lib/api/types/journals";
import { useCurrentCompany } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { emptyJournalLine, type JournalLineDraft } from "@/lib/money/journal";
import { usePermission } from "@/lib/rbac/can";
import { toDraftLine, toInputLines, useFieldLabel, usePeriodOf } from "./journal-shared";

interface Header {
  posting_date: string;
  document_date: string;
  description: string;
  reference: string;
  currency: string;
  type: "MANUAL" | "ADJUSTING";
}

interface JournalEditorProps {
  /** Existing draft or rejected journal; null for a new one. */
  journal: JournalEntry | null;
  /** Prefill a new journal from this one (Copy). */
  copyFrom?: JournalEntry | null;
  onSaved?: (journal: JournalEntry) => void;
}

/** SCR-04 journal form: header, line grid with live totals, save draft and submit. */
export function JournalEditor({ journal, copyFrom, onSaved }: JournalEditorProps) {
  const t = useTranslations();
  const locale = useAppLocale();
  const router = useAppRouter();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const fieldLabel = useFieldLabel();
  const periodOf = usePeriodOf();
  const company = useCurrentCompany();
  const base = company?.base_currency ?? "USD";
  const canSubmit = usePermission("gl.journal.submit");
  const canAdjust = usePermission("gl.journal.adjust");
  const source = journal ?? copyFrom ?? null;
  const today = todayBusinessDate();

  const [header, setHeader] = useState<Header>(() => ({
    posting_date: journal?.posting_date ?? today,
    document_date: journal?.document_date ?? today,
    description: source?.description ?? "",
    reference: journal?.reference ?? "",
    currency: source?.currency ?? base,
    type: source?.type === "ADJUSTING" ? "ADJUSTING" : "MANUAL",
  }));
  const [lines, setLines] = useState<JournalLineDraft[]>(() =>
    source?.lines.length ? source.lines.map((l) => toDraftLine(l, journal ? "" : "copy-")) : [emptyJournalLine(base), emptyJournalLine(base)],
  );
  const [dirty, setDirty] = useState(Boolean(copyFrom));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; reference: string | null; where: string | null } | null>(null);
  // The draft this editor writes to: the journal it was opened with, or the one its first save created.
  const savedRef = useRef<{ id: string; version: number } | null>(journal ? { id: journal.id, version: journal.version } : null);

  const change = <K extends keyof Header>(key: K, value: Header[K]) => {
    setHeader((h) => ({ ...h, [key]: value }));
    setDirty(true);
  };

  // Default the rate of foreign-currency lines from the rate table (FR-FX-006); the user may override it.
  const fetching = useRef(new Set<string>());
  useEffect(() => {
    for (const line of lines) {
      if (line.currency === base || line.rate) continue;
      const k = `${line.key}|${line.currency}|${header.posting_date}`;
      if (fetching.current.has(k)) continue;
      fetching.current.add(k);
      orgApi.rateOn(line.currency, base, header.posting_date).then(
        (rate) => setLines((current) => current.map((l) => (l.key === line.key && !l.rate ? { ...l, rate: rate.rate } : l))),
        () => undefined, // RATE_MISSING: the line shows "Exchange rate required" and the server blocks posting.
      );
    }
  }, [lines, header.posting_date, base]);

  const period = periodOf(header.posting_date);
  const periodNote = !header.posting_date
    ? null
    : !period
      ? { error: true, text: t("gl.journal.validation.noPeriod") }
      : period.status === "CLOSED"
        ? { error: true, text: t("gl.journal.validation.closedPeriod", { period: locale === "km" ? period.name_km : period.name }) }
        : period.status === "SOFT_CLOSED" && !(header.type === "ADJUSTING" && canAdjust)
          ? { error: true, text: t("gl.journal.validation.softClosedPeriod", { period: locale === "km" ? period.name_km : period.name }) }
          : null;

  const headerErrors = {
    posting_date: !header.posting_date ? t("gl.journal.validation.dateRequired") : periodNote?.error ? periodNote.text : undefined,
    document_date: !header.document_date ? t("gl.journal.validation.documentDateRequired") : undefined,
    description: !header.description.trim() ? t("gl.journal.validation.descriptionRequired") : undefined,
  };
  const showErrors = touched;

  const input = (): JournalInput => ({ ...header, lines: toInputLines(lines) });

  const persist = async (): Promise<JournalEntry> => {
    const current = savedRef.current;
    const saved = current ? await journalsApi.update(current.id, input(), current.version) : await journalsApi.create(input());
    savedRef.current = { id: saved.id, version: saved.version };
    return saved;
  };

  const mutation = useMutation({
    mutationFn: async (mode: "save" | "submit") => {
      setServerError(null);
      // Saving always writes; submitting writes first only when there are unsaved changes.
      const saved = mode === "save" || dirty || !savedRef.current ? await persist() : null;
      const id = saved?.id ?? savedRef.current!.id;
      if (mode === "save") return { saved: saved!, mode };
      try {
        return { saved: await journalsApi.submit(id), mode };
      } catch (error) {
        // Saved, but the server refused the submission: keep editing the saved draft.
        (error as { savedJournal?: JournalEntry }).savedJournal = saved ?? undefined;
        throw error;
      }
    },
    onSuccess: ({ saved, mode }) => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["journals"] });
      queryClient.setQueryData(["journal", saved.id], saved);
      toast.success(mode === "save" ? t("gl.journal.toast.saved") : t("gl.journal.toast.submitted"));
      if (!journal) router.replace(`/accounting/journals/${saved.id}`);
      else onSaved?.(saved);
    },
    onError: (error) => {
      const saved = (error as { savedJournal?: JournalEntry }).savedJournal;
      // The draft was saved but not submitted. Stay on this form so the error stays visible;
      // the next save updates the same draft (it is also listed under Draft).
      if (saved) {
        setDirty(false);
        void queryClient.invalidateQueries({ queryKey: ["journals"] });
      }
      if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
      setTouched(true);
      const described = describe(error);
      const detail = isApiError(error) ? error.details[0] : undefined;
      // Messages come from the code and its structured details, so they follow the active language.
      let message = described.message;
      if (isApiError(error)) {
        if (error.code === "JOURNAL_UNBALANCED" && detail?.value) message = t("finance.journal.differ", { amount: detail.value });
        else if (error.code === "PERIOD_CLOSED" && detail?.value) message = t("gl.journal.validation.closedPeriod", { period: period ? (locale === "km" ? period.name_km : period.name) : detail.value });
        else if (error.code === "ACCOUNT_NOT_POSTABLE" && detail?.value) {
          message = t(detail.issue === "control_account" ? "gl.journal.validation.controlAccount" : "gl.journal.validation.headerAccount", { code: detail.value });
        } else if (error.code === "RATE_MISSING" && detail?.value) message = t("gl.journal.validation.rateMissing", { currency: detail.value, date: header.posting_date });
      }
      setServerError({ message, reference: described.reference, where: fieldLabel(detail?.field) });
    },
  });

  const run = (mode: "save" | "submit") => {
    if (mode === "submit") {
      setTouched(true);
      // Balance is left to the server, which answers JOURNAL_UNBALANCED with the difference (AT-GL-01);
      // the grid already shows the difference while typing.
      if (headerErrors.posting_date || headerErrors.document_date || headerErrors.description) return;
    }
    mutation.mutate(mode);
  };

  const busy = mutation.isPending;

  return (
    <div className="space-y-4" data-testid="journal-editor">
      <UnsavedChangesGuard dirty={dirty && !busy} />
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="jnl-posting_date" label={t("gl.journal.fields.postingDate")} required error={showErrors || periodNote ? headerErrors.posting_date : undefined}>
          <DateInput id="jnl-posting_date" value={header.posting_date} onValueChange={(v) => change("posting_date", v)} aria-invalid={Boolean(headerErrors.posting_date && (showErrors || periodNote))} aria-describedby={describedBy("jnl-posting_date", headerErrors.posting_date)} />
        </FormField>
        <FormField id="jnl-document_date" label={t("gl.journal.fields.documentDate")} required error={showErrors ? headerErrors.document_date : undefined}>
          <DateInput id="jnl-document_date" value={header.document_date} onValueChange={(v) => change("document_date", v)} aria-invalid={showErrors && Boolean(headerErrors.document_date)} aria-describedby={describedBy("jnl-document_date", showErrors ? headerErrors.document_date : undefined)} />
        </FormField>
        <FormField id="jnl-type" label={t("gl.journal.fields.type")} hint={header.type === "ADJUSTING" ? t("gl.journal.fields.adjustingHint") : undefined}>
          <NativeSelect id="jnl-type" value={header.type} onChange={(e) => change("type", e.target.value as Header["type"])} aria-describedby={header.type === "ADJUSTING" ? "jnl-type-hint" : undefined}>
            <option value="MANUAL">{t("gl.type.MANUAL")}</option>
            <option value="ADJUSTING">{t("gl.type.ADJUSTING")}</option>
          </NativeSelect>
        </FormField>
        <FormField id="jnl-description" label={t("gl.journal.fields.description")} required error={showErrors ? headerErrors.description : undefined} className="sm:col-span-2">
          <Input id="jnl-description" value={header.description} onChange={(e) => change("description", e.target.value)} aria-invalid={showErrors && Boolean(headerErrors.description)} aria-describedby={describedBy("jnl-description", showErrors ? headerErrors.description : undefined)} />
        </FormField>
        <FormField id="jnl-reference" label={t("gl.journal.fields.reference")}>
          <Input id="jnl-reference" value={header.reference} onChange={(e) => change("reference", e.target.value)} />
        </FormField>
        <FormField id="jnl-currency" label={t("gl.journal.fields.currency")} hint={t("gl.journal.fields.currencyHint")}>
          <CurrencySelect id="jnl-currency" value={header.currency} onChange={(v) => change("currency", v)} />
        </FormField>
        {period && (
          <p className="flex items-center gap-1.5 self-end pb-2 text-sm text-muted-foreground">
            {period.status === "CLOSED" && <Lock className="size-3.5" aria-hidden />}
            {t("gl.journal.fields.period")}: {locale === "km" ? period.name_km : period.name} · {t(`status.${period.status}`)}
          </p>
        )}
      </section>

      {serverError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="journal-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p>{serverError.where ? `${serverError.where}: ` : ""}{serverError.message}</p>
            {serverError.reference && <p className="font-mono text-xs">{t("errors.reference", { id: serverError.reference })}</p>}
          </div>
        </div>
      )}

      <JournalLineGrid
        lines={lines}
        onChange={(next) => {
          setLines(next);
          setDirty(true);
        }}
        defaultCurrency={header.currency}
        showIssues={touched}
      />

      <div className="flex flex-wrap justify-end gap-2" data-print="hide">
        <Button variant="outline" onClick={() => run("save")} disabled={busy} data-testid="save-draft">
          {busy && mutation.variables === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {t("gl.journal.actions.saveDraft")}
        </Button>
        {canSubmit && (
          <Button onClick={() => run("submit")} disabled={busy} data-testid="submit-journal">
            {busy && mutation.variables === "submit" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {t("gl.journal.actions.submit")}
          </Button>
        )}
      </div>
    </div>
  );
}
