"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, Info, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { budgetsApi, importsApi } from "@/lib/api/endpoints/assets";
import { isApiError } from "@/lib/api/errors";
import { useFormatters } from "@/lib/api/hooks";
import type { ImportBatch, ImportType } from "@/lib/api/types/planning";
import { AppLink } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { guessColumns, IMPORT_TEMPLATES, templateCsv, templateOf } from "@/lib/imports/templates";
import { parseCsv } from "@/lib/money/statement";
import { useAccessContext, usePermission } from "@/lib/rbac/can";
import { hasPermission } from "@/lib/rbac/permissions";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

type Step = "type" | "file" | "map" | "preview" | "done";
const STEPS: Step[] = ["type", "file", "map", "preview", "done"];
const MAX_MB = 20;

function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sha256(text: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** SCR-25 import wizard and history (SRS §6.21). */
export function ImportsPage() {
  const t = useTranslations();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const companyId = useUiStore((s) => s.companyId);
  const canCreate = usePermission("imp.create");
  const canSignOff = usePermission("gl.journal.post");
  const history = useQuery({ queryKey: ["imports", companyId], queryFn: ({ signal }) => importsApi.list(signal) });
  const status = useQuery({ queryKey: ["imports-status", companyId], queryFn: ({ signal }) => importsApi.status(signal) });
  const [initial] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()));
  const [wizard, setWizard] = useState(Boolean(initial.get("type")));
  const rollback = useMutation({ mutationFn: (id: string) => importsApi.rollback(id), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["imports"] }); toast.success(t("imp.toast.rolledBack")); }, onError: errorToast });
  const signOff = useMutation({ mutationFn: importsApi.signOffOpening, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["imports-status"] }), onError: errorToast });
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  return (
    <div className="min-w-0 space-y-4" data-testid="imports-page">
      <PageHeader title={t("imp.title")} description={t("imp.description")} actions={canCreate && !wizard ? <Button size="sm" onClick={() => setWizard(true)} data-testid="new-import"><FileUp aria-hidden />{t("imp.new")}</Button> : undefined} />
      {status.data && !status.data.opening_signed_off && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status" data-testid="opening-not-signed-off">
          <AlertTriangle className="size-4 text-warning" aria-hidden />{t("imp.openingNotSignedOff")}
          {canSignOff && <Button size="sm" variant="outline" onClick={() => signOff.mutate()}>{t("imp.signOff")}</Button>}
        </p>
      )}
      {wizard && <ImportWizard initialType={(initial.get("type") as ImportType) || null} initialTarget={initial.get("target")} onClose={() => setWizard(false)} />}
      <section aria-labelledby="imp-history">
        <h2 id="imp-history" className="mb-2 text-sm font-semibold">{t("imp.history")}</h2>
        {history.isPending ? <TableSkeleton rows={3} /> : history.isError ? <ErrorState error={history.error} onRetry={() => history.refetch()} /> : history.data.data.length === 0 ? <EmptyState title={t("imp.empty")} className="rounded-lg border py-8" /> : (
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[48rem] text-sm" data-testid="import-history">
              <caption className="sr-only">{t("imp.history")}</caption>
              <thead className="bg-muted/50"><tr>
                {["type", "file", "rows", "status", "by", "at"].map((c) => <th key={c} scope="col" className={head}>{t(`imp.col.${c}`)}</th>)}
                <th scope="col" className={head}><span className="sr-only">{t("arap.lines.actions")}</span></th>
              </tr></thead>
              <tbody>
                {history.data.data.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-2 py-1.5">{t(`imp.types.${b.type}.title`)}</td>
                    <td className="px-2 py-1.5"><span className="block">{b.file_name}</span><span className="font-mono text-[10px] text-muted-foreground" title={b.file_hash}>{b.file_hash.slice(0, 12)}</span></td>
                    <td className="px-2 py-1.5 tabular-nums">{t("imp.rowCounts", { valid: b.valid_rows, total: b.total_rows, errors: b.errors.length })}</td>
                    <td className="px-2 py-1.5"><StatusBadge status={b.status} /></td>
                    <td className="px-2 py-1.5">{b.created_by}</td>
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{format.dateTime(b.committed_at ?? b.created_at)}</td>
                    <td className="px-2 py-1.5">{b.can_rollback && <Button size="sm" variant="ghost" onClick={() => rollback.mutate(b.id)} disabled={rollback.isPending}><Undo2 aria-hidden />{t("imp.rollback")}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ImportWizard({ initialType, initialTarget, onClose }: { initialType: ImportType | null; initialTarget: string | null; onClose: () => void }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const access = useAccessContext();
  const canBankImport = usePermission("cb.statement.import");
  const [step, setStep] = useState<Step>(initialType ? "file" : "type");
  const [type, setType] = useState<ImportType | null>(initialType);
  const [target, setTarget] = useState(initialTarget ?? "");
  const [file, setFile] = useState<{ name: string; hash: string; header: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitOpen, setCommitOpen] = useState(false);
  const drafts = useQuery({ queryKey: ["budgets", "drafts"], queryFn: () => budgetsApi.list(), enabled: type === "BUDGETS", select: (p) => p.data.filter((b) => b.status === "DRAFT" || b.status === "REJECTED") });
  const template = type ? templateOf(type) : null;
  const allowed = IMPORT_TEMPLATES.filter((x) => hasPermission(access.permissions, x.permission));

  const read = async (f: File) => {
    setError(null);
    if (!/\.csv$/i.test(f.name)) return setError(t("imp.errors.csvOnly"));
    if (f.size > MAX_MB * 1_048_576) return setError(t("imp.errors.tooLarge", { size: MAX_MB }));
    const text = await f.text();
    const table = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
    if (table.length < 2) return setError(t("imp.errors.noRows"));
    const header = table[0].map((h) => h.trim());
    setFile({ name: f.name, hash: await sha256(text), header, rows: table.slice(1) });
    setMapping(guessColumns(type!, header));
    setStep("map");
  };

  const validate = useMutation({
    mutationFn: () => {
      const rows = file!.rows.map((r) => Object.fromEntries(template!.columns.filter((c) => mapping[c.key]).map((c) => [c.key, r[file!.header.indexOf(mapping[c.key])] ?? ""])));
      return importsApi.validate({ type: type!, file_name: file!.name, file_hash: file!.hash, rows, target_id: type === "BUDGETS" ? target || null : null });
    },
    onSuccess: (b) => { setBatch(b); setStep("preview"); void queryClient.invalidateQueries({ queryKey: ["imports"] }); },
    onError: (e) => setError(isApiError(e) && e.details[0]?.message ? e.details[0].message : describe(e).message),
  });

  const missing = template?.columns.filter((c) => c.required && !mapping[c.key]) ?? [];
  const errorReport = () => download(`${file?.name.replace(/\.csv$/i, "") ?? "import"}-errors.csv`, `﻿${[["row", "column", "value", "error"], ...(batch?.errors ?? []).map((e) => [e.row, e.column, e.value, e.message])].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`);
  const head = "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4" aria-labelledby="wizard-title" data-testid="import-wizard" data-step={step}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="wizard-title" className="font-semibold">{type ? t("imp.wizardTitleType", { type: t(`imp.types.${type}.title`) }) : t("imp.wizardTitle")}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
      </div>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label={t("imp.steps")}>
        {STEPS.map((s, i) => (
          <li key={s} className={cn("rounded-full border px-2 py-0.5", s === step ? "border-primary bg-primary text-primary-foreground" : STEPS.indexOf(step) > i ? "bg-muted" : "text-muted-foreground")} aria-current={s === step ? "step" : undefined}>
            {i + 1}. {t(`imp.step.${s}`)}
          </li>
        ))}
      </ol>

      {step === "type" && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {allowed.map((x) => (
            <li key={x.type}>
              <button type="button" className="h-full w-full rounded-lg border p-3 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => { setType(x.type); setStep("file"); }} data-testid={`import-type-${x.type}`}>
                <span className="block font-medium">{t(`imp.types.${x.type}.title`)}</span>
                <span className="block text-sm text-muted-foreground">{t(`imp.types.${x.type}.description`)}</span>
              </button>
            </li>
          ))}
          {canBankImport && (
            <li><AppLink href="/cash-bank/reconciliations/import" className="block h-full rounded-lg border p-3 hover:bg-muted/50"><span className="block font-medium">{t("imp.bank.title")}</span><span className="block text-sm text-muted-foreground">{t("imp.bank.description")}</span></AppLink></li>
          )}
        </ul>
      )}

      {step === "file" && template && (
        <div className="space-y-3">
          <p className="text-sm">{t("imp.fileIntro")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => download(`${type!.toLowerCase()}-template.csv`, templateCsv(type!))} data-testid="download-template"><Download aria-hidden />{t("imp.downloadTemplate")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setStep("type")}><ArrowLeft aria-hidden />{t("imp.back")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("imp.columns", { columns: template.columns.map((c) => `${c.key}${c.required ? "*" : ""}`).join(", ") })}</p>
          {type === "BUDGETS" && (
            <FormField id="imp-target" label={t("imp.target")} required>
              <NativeSelect id="imp-target" value={target} onChange={(e) => setTarget(e.target.value)} className="w-auto">
                <option value="">{t("arap.form.select")}</option>
                {drafts.data?.map((b) => <option key={b.id} value={b.id}>v{b.version} · {b.name}</option>)}
              </NativeSelect>
            </FormField>
          )}
          <FormField id="imp-file" label={t("imp.file")} hint={t("imp.fileHint", { size: MAX_MB })}>
            <input id="imp-file" type="file" accept=".csv,text/csv" className="block text-sm" aria-describedby="imp-file-hint" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
          </FormField>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("imp.excelNote")}</p>
        </div>
      )}

      {step === "map" && template && file && (
        <div className="space-y-3" data-testid="import-mapping">
          <p className="text-sm">{t("imp.mapIntro", { file: file.name, rows: file.rows.length })}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {template.columns.map((c) => (
              <FormField key={c.key} id={`map-${c.key}`} label={`${c.key}${c.required ? " *" : ""}`}>
                <NativeSelect id={`map-${c.key}`} value={mapping[c.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value })} aria-invalid={c.required && !mapping[c.key]}>
                  <option value="">{t("imp.notMapped")}</option>
                  {file.header.map((h) => <option key={h} value={h}>{h}</option>)}
                </NativeSelect>
              </FormField>
            ))}
          </div>
          {missing.length > 0 && <p className="text-sm text-destructive" role="alert">{t("imp.missing", { columns: missing.map((c) => c.key).join(", ") })}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setStep("file")}><ArrowLeft aria-hidden />{t("imp.back")}</Button>
            <Button size="sm" onClick={() => { setError(null); validate.mutate(); }} disabled={missing.length > 0 || validate.isPending || (type === "BUDGETS" && !target)} data-testid="import-validate">{t("imp.validate")}</Button>
          </div>
        </div>
      )}

      {step === "preview" && batch && (
        <div className="space-y-3" data-testid="import-preview" data-status={batch.status}>
          <p className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", batch.status === "VALIDATED" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5 text-destructive")} role="status" data-testid="import-summary">
            {batch.status === "VALIDATED" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
            {batch.status === "VALIDATED" ? t("imp.valid", { rows: batch.total_rows }) : t("imp.invalid", { errors: batch.errors.length, rows: batch.total_rows - batch.valid_rows })}
          </p>
          {batch.warnings.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm text-warning" data-testid="import-warnings">{batch.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          {batch.errors.length > 0 && (
            <>
              <div className="relative max-h-72 overflow-auto rounded-lg border">
                <table className="w-full text-sm" data-testid="import-errors">
                  <caption className="sr-only">{t("imp.errorsTitle")}</caption>
                  <thead className="sticky top-0 bg-muted"><tr>{["row", "column", "value", "error"].map((c) => <th key={c} scope="col" className={head}>{t(`imp.err.${c}`)}</th>)}</tr></thead>
                  <tbody>{batch.errors.map((e, i) => <tr key={i} className="border-t"><td className="px-2 py-1 tabular-nums">{e.row || "—"}</td><td className="px-2 py-1">{e.column}</td><td className="px-2 py-1 font-mono text-xs">{e.value}</td><td className="px-2 py-1">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
              <Button size="sm" variant="outline" onClick={errorReport} data-testid="error-report"><Download aria-hidden />{t("imp.errorReport")}</Button>
            </>
          )}
          {batch.status === "VALIDATED" && (
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("imp.previewTitle")}</caption>
                <thead className="bg-muted/50"><tr>{Object.keys(batch.preview[0] ?? {}).map((k) => <th key={k} scope="col" className={head}>{k}</th>)}</tr></thead>
                <tbody>{batch.preview.map((r, i) => <tr key={i} className="border-t">{Object.values(r).map((v, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{v}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setStep("file")}><ArrowLeft aria-hidden />{t("imp.uploadAgain")}</Button>
            {batch.status === "VALIDATED" && <Button size="sm" onClick={() => setCommitOpen(true)} data-testid="import-commit">{t("imp.commit")}</Button>}
          </div>
          {template?.financial && <p className="text-xs text-muted-foreground">{t("imp.financialNote")}</p>}
        </div>
      )}

      {step === "done" && batch && (
        <div className="space-y-2" data-testid="import-done">
          <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" aria-hidden />{t("imp.committed", { count: batch.created.length })}</p>
          <ul className="list-disc pl-5 text-sm">
            {batch.created.slice(0, 20).map((c) => (
              <li key={c.id}>{c.type === "JOURNAL" ? <AppLink href={`/accounting/journals/${c.id}`} className="text-primary hover:underline">{c.label}</AppLink> : c.type === "CUSTOMER" ? <AppLink href={`/sales/customers/${c.id}`} className="text-primary hover:underline">{c.label}</AppLink> : c.type === "SUPPLIER" ? <AppLink href={`/purchases/suppliers/${c.id}`} className="text-primary hover:underline">{c.label}</AppLink> : c.type === "BUDGET" ? <AppLink href="/budgets" className="text-primary hover:underline">{c.label}</AppLink> : c.label}</li>
            ))}
          </ul>
          <Button size="sm" variant="outline" onClick={() => { setStep("type"); setType(null); setFile(null); setBatch(null); }}>{t("imp.another")}</Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive" role="alert" data-testid="import-error">{error}</p>}

      {batch && (
        <ConfirmActionDialog open={commitOpen} onOpenChange={setCommitOpen} action="approve" title={t("imp.commitTitle", { rows: batch.total_rows })} description={t(template?.financial ? "imp.commitFinancial" : "imp.commitMaster")}
          effect={{ currency: "USD" }} thresholdAmount="0"
          onConfirm={async ({ idempotencyKey }) => {
            const next = await importsApi.commit(batch.id, idempotencyKey);
            setBatch(next);
            setStep("done");
            void queryClient.invalidateQueries({ queryKey: ["imports"] });
            void queryClient.invalidateQueries({ queryKey: ["imports-status"] });
            return t("imp.committed", { count: next.created.length });
          }} />
      )}
    </section>
  );
}
