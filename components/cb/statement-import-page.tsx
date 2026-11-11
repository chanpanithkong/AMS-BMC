"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/feedback/states";
import { FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/workflow/status-badge";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { useFormatters } from "@/lib/api/hooks";
import { IdempotencyKeyHolder, runIdempotent } from "@/lib/api/idempotency";
import type { StatementImport, StatementMapping } from "@/lib/api/types/cashbank";
import { isMock } from "@/lib/config";
import { AppLink } from "@/lib/i18n/navigation";
import { guessMapping, parseCsv } from "@/lib/money/statement";
import { cn } from "@/lib/utils";
import { useAccountLabel, useCashBankAccounts } from "./use-cash-bank";

type Step = "file" | "mapping" | "preview" | "result";
const STEPS: Step[] = ["file", "mapping", "preview", "result"];

/** Bank statement import (FR-CB-008, SCR-25): file → columns → preview → import. */
export function StatementImportPage() {
  const t = useTranslations();
  const format = useFormatters();
  const label = useAccountLabel();
  const errorToast = useErrorToast();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const { accounts } = useCashBankAccounts();
  const banks = accounts.filter((a) => a.kind === "BANK");
  const [step, setStep] = useState<Step>("file");
  const [accountId, setAccountId] = useState(params.get("account") ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<StatementMapping | null>(null);
  const [savedUsed, setSavedUsed] = useState(false);
  const [preview, setPreview] = useState<StatementImport | null>(null);
  const [holder] = useState(() => new IdempotencyKeyHolder());
  const account = banks.find((b) => b.id === (accountId || banks[0]?.id));
  const history = useQuery({ queryKey: ["statement-imports", account?.id], queryFn: () => cashBankApi.imports(account?.id), enabled: Boolean(account) });

  const readFile = async (f: File) => {
    setFile(f);
    const rows = parseCsv(await f.text());
    const head = rows[0] ?? [];
    setHeaders(head);
    setRowCount(Math.max(rows.length - 1, 0));
    // Use the mapping saved for the account when its columns are all in this file.
    const saved = account ? (await cashBankApi.savedMapping(account.id)).mapping : null;
    const fits = saved && [saved.date, saved.description, saved.amount, saved.debit, saved.credit].filter(Boolean).every((c) => head.includes(c!));
    setMapping(fits ? saved : guessMapping(head));
    setSavedUsed(Boolean(fits));
  };

  const upload = useMutation({
    mutationFn: () => cashBankApi.importStatement(account!.id, file!, mapping!),
    onSuccess: (p) => {
      setPreview(p);
      setStep("preview");
    },
    onError: errorToast,
  });
  const commit = useMutation({
    mutationFn: () => runIdempotent(holder, (key) => cashBankApi.commitImport(preview!.id, key)),
    onSuccess: (p) => {
      setPreview(p);
      setStep("result");
      void queryClient.invalidateQueries({ queryKey: ["statement-imports"] });
      void queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
    },
    onError: errorToast,
  });

  const downloadSample = async () => {
    if (!account) return;
    const blob = await cashBankApi.sampleStatement(account.id);
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${account.code.toLowerCase()}-2027-04.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const separate = mapping ? !mapping.amount : false;
  const col = (value: string | null, onChange: (v: string | null) => void, id: string, labelText: string, optional = true) => (
    <FormField id={id} label={labelText} required={!optional}>
      <NativeSelect id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        {optional && <option value="">{t("cb.import.mapping.notMapped")}</option>}
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </NativeSelect>
    </FormField>
  );
  const head = "px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title={t("cb.import.title")} description={t("cb.import.description")} />
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={t("cb.import.steps.label")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={cn("rounded-full border px-3 py-1", s === step ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground")}>
            {i + 1}. {t(`cb.import.steps.${s}`)}
          </li>
        ))}
      </ol>

      {step === "file" && (
        <section className="max-w-xl space-y-3 rounded-xl border bg-card p-4" data-testid="import-file">
          <FormField id="imp-account" label={t("cb.import.account")} required>
            <NativeSelect id="imp-account" value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)}>
              {banks.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="imp-file" label={t("cb.import.file")} required hint={t("cb.import.fileHint")}>
            <input id="imp-file" type="file" accept=".csv,text/csv" aria-describedby="imp-file-hint" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
          </FormField>
          {isMock && account && (
            <Button type="button" variant="link" size="sm" className="px-0" onClick={downloadSample}><Download aria-hidden />{t("cb.import.sample")}</Button>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setStep("mapping")} disabled={!file || !mapping} data-testid="import-next">{t("cb.import.next")}</Button>
          </div>
        </section>
      )}

      {step === "mapping" && mapping && (
        <section className="max-w-2xl space-y-3 rounded-xl border bg-card p-4" data-testid="import-mapping">
          <h2 className="font-semibold">{t("cb.import.mapping.title")}</h2>
          <p className="text-sm text-muted-foreground">{file?.name} · {t("cb.import.mapping.rows", { count: rowCount })}{savedUsed ? ` · ${t("cb.import.mapping.saved")}` : ""}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {col(mapping.date, (v) => setMapping({ ...mapping, date: v ?? "" }), "map-date", t("cb.import.mapping.date"), false)}
            {col(mapping.description, (v) => setMapping({ ...mapping, description: v ?? "" }), "map-description", t("cb.import.mapping.description"), false)}
            {col(mapping.reference, (v) => setMapping({ ...mapping, reference: v }), "map-reference", t("cb.import.mapping.reference"))}
            {col(mapping.balance, (v) => setMapping({ ...mapping, balance: v }), "map-balance", t("cb.import.mapping.balance"))}
            <FormField id="map-mode" label={t("cb.import.mapping.mode")}>
              <NativeSelect id="map-mode" value={separate ? "separate" : "single"} onChange={(e) => setMapping(e.target.value === "single" ? { ...mapping, amount: headers[0] ?? "", debit: null, credit: null } : { ...mapping, amount: null })}>
                <option value="single">{t("cb.import.mapping.single")}</option>
                <option value="separate">{t("cb.import.mapping.separate")}</option>
              </NativeSelect>
            </FormField>
            <FormField id="map-format" label={t("cb.import.mapping.dateFormat")}>
              <NativeSelect id="map-format" value={mapping.date_format} onChange={(e) => setMapping({ ...mapping, date_format: e.target.value as StatementMapping["date_format"] })}>
                {(["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"] as const).map((f) => <option key={f} value={f}>{f}</option>)}
              </NativeSelect>
            </FormField>
            {separate ? (
              <>
                {col(mapping.credit, (v) => setMapping({ ...mapping, credit: v }), "map-credit", t("cb.import.mapping.credit"), false)}
                {col(mapping.debit, (v) => setMapping({ ...mapping, debit: v }), "map-debit", t("cb.import.mapping.debit"), false)}
              </>
            ) : (
              col(mapping.amount, (v) => setMapping({ ...mapping, amount: v }), "map-amount", t("cb.import.mapping.amount"), false)
            )}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("file")}>{t("cb.import.back")}</Button>
            <Button onClick={() => upload.mutate()} disabled={upload.isPending} data-testid="import-preview">{t("cb.import.next")}</Button>
          </div>
        </section>
      )}

      {step === "preview" && preview && (
        <section className="space-y-3" data-testid="import-preview-step">
          <p className="text-sm font-medium" role="status" data-testid="import-counts">{t("cb.import.counts", preview.counts)}</p>
          <div className="relative max-h-[28rem] overflow-auto rounded-lg border bg-card">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">{t("cb.import.steps.preview")}</caption>
              <thead className="sticky top-0 bg-muted">
                <tr>{(["row", "date", "description", "reference", "amount", "status", "problem"] as const).map((c) => <th key={c} scope="col" className={cn(head, c === "amount" && "text-right")}>{t(`cb.import.col.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row_no} className={cn("border-t", r.status === "ERROR" && "bg-destructive/5", r.status === "DUPLICATE" && "bg-muted/40")} data-status={r.status}>
                    <td className="px-2 py-1 tabular-nums">{r.row_no}</td>
                    <td className="px-2 py-1 whitespace-nowrap tabular-nums">{r.date ? format.date(r.date) : "—"}</td>
                    <td className="px-2 py-1">{r.description}</td>
                    <td className="px-2 py-1">{r.reference}</td>
                    <td className="px-2 py-1">{r.amount ? <AmountText value={r.amount} currency={account?.currency ?? "USD"} /> : "—"}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{t(`cb.import.status.${r.status}`)}</td>
                    <td className="px-2 py-1 text-destructive">{r.errors.map((e) => t(`cb.import.errors.${e}`)).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("mapping")}>{t("cb.import.back")}</Button>
            <Button onClick={() => commit.mutate()} disabled={commit.isPending || preview.counts.valid === 0} data-testid="import-commit">
              {preview.counts.valid === 0 ? t("cb.import.nothing") : t("cb.import.commit", { count: preview.counts.valid })}
            </Button>
          </div>
        </section>
      )}

      {step === "result" && preview && (
        <section className="max-w-xl space-y-3 rounded-xl border bg-card p-4" data-testid="import-result">
          <p className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="size-5" aria-hidden />{t("cb.import.done", { count: preview.created_lines })}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><AppLink href={`/cash-bank/reconciliations?account=${preview.bank_account_id}`}>{t("cb.import.toReconcile")}</AppLink></Button>
            <Button variant="outline" onClick={() => { setStep("file"); setFile(null); setPreview(null); holder.settle(); }}>{t("cb.import.another")}</Button>
          </div>
        </section>
      )}

      <section className="space-y-2" aria-labelledby="imp-history">
        <h2 id="imp-history" className="font-semibold">{t("cb.import.history.title")}</h2>
        {(history.data?.data.length ?? 0) === 0 ? (
          <EmptyState title={t("cb.import.history.empty")} className="rounded-lg border py-6" />
        ) : (
          <div className="relative overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">{t("cb.import.history.title")}</caption>
              <thead className="bg-muted/50"><tr>{(["file", "by", "at", "lines", "status"] as const).map((c) => <th key={c} scope="col" className={head}>{t(`cb.import.history.${c}`)}</th>)}</tr></thead>
              <tbody>
                {history.data!.data.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-2 py-1.5">{i.file_name}</td>
                    <td className="px-2 py-1.5">{i.imported_by}</td>
                    <td className="px-2 py-1.5 tabular-nums">{format.dateTime(i.created_at)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{i.created_lines}</td>
                    <td className="px-2 py-1.5">{i.status === "COMMITTED" ? <StatusBadge status="COMPLETED" /> : t(`cb.import.status.${i.status}`)}</td>
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
