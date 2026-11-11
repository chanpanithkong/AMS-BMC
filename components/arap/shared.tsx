"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { customersApi, suppliersApi, taxCodesApi } from "@/lib/api/endpoints/arap";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import type { Invoice, InvoiceLine, TaxCode } from "@/lib/api/types/arap";
import { useCurrentCompany } from "@/lib/auth/session";
import { useAppLocale } from "@/lib/i18n/navigation";
import { D, Decimal, toBase } from "@/lib/money/decimal";
import { documentTotals, lineAmounts, rateOn } from "@/lib/money/invoice";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

export type DocKind = "AR" | "AP";

/** Routes and permissions per side of the ledger. */
export const SIDE = {
  AR: {
    partyKind: "CUSTOMER", partyPath: "/sales/customers", invoicePath: "/sales/invoices", paymentPath: "/sales/receipts", agingPath: "/sales/aging",
    perm: "ar.invoice", partyPerm: "ar.customer", taxKinds: ["OUTPUT", "EXEMPT"], accountTypes: ["REVENUE"], ns: "arap.ar",
  },
  AP: {
    partyKind: "SUPPLIER", partyPath: "/purchases/suppliers", invoicePath: "/purchases/invoices", paymentPath: "/purchases/payments", agingPath: "/purchases/aging",
    perm: "ap.invoice", partyPerm: "ap.supplier", taxKinds: ["INPUT", "EXEMPT"], accountTypes: ["EXPENSE", "ASSET"], ns: "arap.ap",
  },
} as const;

export function useTaxCodes(kind?: DocKind) {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({
    queryKey: ["tax-codes", companyId],
    queryFn: ({ signal }) => taxCodesApi.list({}, signal),
    staleTime: 60_000,
    select: (page) => page.data.filter((c) => !kind || (SIDE[kind].taxKinds as readonly string[]).includes(c.kind)),
  });
}

export function useParties(kind: DocKind) {
  const companyId = useUiStore((s) => s.companyId);
  return useQuery({
    queryKey: ["parties", kind, companyId],
    queryFn: ({ signal }) => (kind === "AR" ? customersApi : suppliersApi).list({ limit: 200 }, signal),
    staleTime: 30_000,
    select: (page) => page.data,
  });
}

export function useNameOf() {
  const locale = useAppLocale();
  return (x: { name: string; name_km?: string | null } | undefined | null) => (!x ? "" : locale === "km" && x.name_km ? x.name_km : x.name);
}

export const emptyLine = (defaults: Partial<InvoiceLine> = {}): InvoiceLine => ({
  description: "", quantity: "1", unit_price: "", discount: "", tax_code_id: null, account_id: null, department_id: null, branch_id: null, ...defaults,
});

/** Live line and document amounts with the tax rates in force on the document date (preview; the server decides). */
export function useDocumentAmounts(lines: InvoiceLine[], codes: TaxCode[] | undefined, date: string, currency: string, rate?: string) {
  return useMemo(() => {
    const perLine = lines.map((l) => {
      const code = codes?.find((c) => c.id === l.tax_code_id);
      const r = code ? rateOn(code.rates, date) : null;
      return lineAmounts(l, code ? { rate: r?.rate ?? "0", method: code.method } : null, currency);
    });
    const totals = documentTotals(perLine);
    const base = rate && D(rate).gt(0) ? toBase(totals.total, rate, "USD") : null;
    const unverified = [...new Set(lines.map((l) => codes?.find((c) => c.id === l.tax_code_id)).filter((c): c is TaxCode => Boolean(c && c.verification !== "VERIFIED")).map((c) => c.code))];
    return { perLine, totals, base, unverified };
  }, [lines, codes, date, currency, rate]);
}

interface LinesEditorProps {
  kind: DocKind;
  lines: InvoiceLine[];
  onChange?: (lines: InvoiceLine[]) => void;
  currency: string;
  date: string;
  readOnly?: boolean;
  /** Server field errors keyed "lines.0.quantity". */
  errors?: Record<string, string>;
  /** Defaults for a new line (the party's default account). */
  newLine?: () => InvoiceLine;
  idPrefix?: string;
}

/** Invoice lines (SCR-09, SCR-11): quantity, price, discount, tax code, account, department and, for purchases, the asset flag. */
export function InvoiceLinesEditor({ kind, lines, onChange, currency, date, readOnly, errors = {}, newLine, idPrefix = "line" }: LinesEditorProps) {
  const t = useTranslations("arap.lines");
  const nameOf = useNameOf();
  const { data: codes } = useTaxCodes(kind);
  const { data: departments } = useDepartments();
  const company = useCurrentCompany();
  const { perLine, unverified } = useDocumentAmounts(lines, codes, date, currency);
  const accountFilter = useMemo(() => (a: Account) => (SIDE[kind].accountTypes as readonly string[]).includes(a.type) && !["AR", "AP", "BANK", "TAX"].includes(a.control_module ?? ""), [kind]);
  const set = (i: number, patch: Partial<InvoiceLine>) => onChange?.(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const head = "px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap";
  const err = (i: number, field: string) => errors[`lines.${i}.${field}`];

  return (
    <div className="min-w-0 space-y-2" data-testid="invoice-lines">
      <div className="relative overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className={cn(head, "w-8")}>#</th>
              <th scope="col" className={cn(head, "min-w-48")}>{t("description")}</th>
              <th scope="col" className={cn(head, "w-20 text-right")}>{t("quantity")}</th>
              <th scope="col" className={cn(head, "w-28 text-right")}>{t("unitPrice")}</th>
              <th scope="col" className={cn(head, "w-24 text-right")}>{t("discount")}</th>
              <th scope="col" className={cn(head, "w-36")}>{t("taxCode")}</th>
              <th scope="col" className={cn(head, "w-56")}>{t("account")}</th>
              <th scope="col" className={cn(head, "w-32")}>{t("department")}</th>
              {kind === "AP" && <th scope="col" className={cn(head, "w-16")}>{t("asset")}</th>}
              <th scope="col" className={cn(head, "w-28 text-right")}>{t("total")} ({currency})</th>
              {!readOnly && <th scope="col" className={cn(head, "w-10")}><span className="sr-only">{t("actions")}</span></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const n = i + 1;
              const a = perLine[i];
              const code = codes?.find((c) => c.id === l.tax_code_id);
              return (
                <tr key={i} className="border-t align-top" data-testid="invoice-line">
                  <td className="px-2 py-2 text-muted-foreground tabular-nums">{n}</td>
                  <td className="p-1">
                    {readOnly ? <span className="block px-1 py-1">{l.description}</span> : (
                      <Input id={`${idPrefix}-${i}-description`} value={l.description} onChange={(e) => set(i, { description: e.target.value })} aria-label={t("descriptionFor", { n })} aria-invalid={Boolean(err(i, "description"))} />
                    )}
                    {err(i, "description") && <p className="text-xs text-destructive" role="alert">{err(i, "description")}</p>}
                  </td>
                  <td className="p-1">
                    {readOnly ? <span className="amount block px-1 py-1">{D(l.quantity).toFixed()}</span> : (
                      <AmountInput currency="QTY" value={l.quantity} onValueChange={(quantity) => set(i, { quantity })} aria-label={t("quantityFor", { n })} aria-invalid={Boolean(err(i, "quantity"))} />
                    )}
                  </td>
                  <td className="p-1">
                    {readOnly ? <AmountText value={l.unit_price} currency={currency} className="px-1 py-1" /> : (
                      <AmountInput currency={currency === "KHR" ? "KHR" : "PRICE"} value={l.unit_price} onValueChange={(unit_price) => set(i, { unit_price })} aria-label={t("unitPriceFor", { n })} />
                    )}
                  </td>
                  <td className="p-1">
                    {readOnly ? <AmountText value={l.discount} currency={currency} blankZero className="px-1 py-1" /> : (
                      <AmountInput currency={currency} value={l.discount} onValueChange={(discount) => set(i, { discount })} aria-label={t("discountFor", { n })} aria-invalid={Boolean(err(i, "discount"))} />
                    )}
                    {err(i, "discount") && <p className="text-xs text-destructive" role="alert">{err(i, "discount")}</p>}
                  </td>
                  <td className="p-1">
                    {readOnly ? (
                      <span className="block px-1 py-1">{code ? `${code.code} · ${D(l.tax_rate ?? rateOn(code.rates, date)?.rate).toFixed()} %` : "—"}</span>
                    ) : (
                      <NativeSelect value={l.tax_code_id ?? ""} onChange={(e) => set(i, { tax_code_id: e.target.value || null })} aria-label={t("taxCodeFor", { n })}>
                        <option value="">{t("noTax")}</option>
                        {codes?.filter((c) => c.is_active || c.id === l.tax_code_id).map((c) => (
                          <option key={c.id} value={c.id}>{c.code} · {D(rateOn(c.rates, date)?.rate).toFixed()} %{c.verification !== "VERIFIED" ? ` (${t("unverifiedShort")})` : ""}</option>
                        ))}
                      </NativeSelect>
                    )}
                  </td>
                  <td className="p-1">
                    <AccountPicker value={l.account_id} onChange={(account_id) => set(i, { account_id })} filter={accountFilter} disabled={readOnly} aria-label={t("accountFor", { n })} invalid={Boolean(err(i, "account_id"))} />
                    {err(i, "account_id") && <p className="text-xs text-destructive" role="alert">{err(i, "account_id")}</p>}
                  </td>
                  <td className="p-1">
                    {readOnly ? <span className="block px-1 py-1">{nameOf(departments?.find((d) => d.id === l.department_id)) || "—"}</span> : (
                      <NativeSelect value={l.department_id ?? ""} onChange={(e) => set(i, { department_id: e.target.value || null })} aria-label={t("departmentFor", { n })}>
                        <option value="">—</option>
                        {departments?.map((d) => <option key={d.id} value={d.id}>{nameOf(d)}</option>)}
                      </NativeSelect>
                    )}
                    {!readOnly && company && company.branches.length > 1 && (
                      <NativeSelect className="mt-1" value={l.branch_id ?? ""} onChange={(e) => set(i, { branch_id: e.target.value || null })} aria-label={t("branchFor", { n })}>
                        <option value="">{t("anyBranch")}</option>
                        {company.branches.map((b) => <option key={b.id} value={b.id}>{nameOf(b)}</option>)}
                      </NativeSelect>
                    )}
                  </td>
                  {kind === "AP" && (
                    <td className="px-2 py-2">
                      <Checkbox checked={Boolean(l.is_asset)} disabled={readOnly} onCheckedChange={(v) => set(i, { is_asset: v === true, ...(v === true && !l.account_id ? { account_id: "acc-1510" } : {}) })} aria-label={t("assetFor", { n })} />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <AmountText value={readOnly && l.total ? l.total : a?.total} currency={currency} />
                    {a && !a.tax.isZero() && <span className="amount block text-xs text-muted-foreground">{t("taxIncluded", { tax: a.tax.toFixed(currency === "KHR" ? 0 : 2) })}</span>}
                  </td>
                  {!readOnly && (
                    <td className="p-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => onChange?.(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label={t("removeLine", { n })}>
                        <Trash2 aria-hidden />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange?.([...lines, newLine ? newLine() : emptyLine()])}>
          <Plus aria-hidden />{t("addLine")}
        </Button>
      )}
      {lines.some((l) => l.is_asset) && <p className="text-xs text-muted-foreground" role="note">{t("assetNote")}</p>}
      {unverified.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status" data-testid="unverified-tax">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t("unverifiedWarning", { codes: unverified.join(", ") })}
        </p>
      )}
    </div>
  );
}

/** Printable invoice (SRS §15.4); drafts carry a DRAFT watermark. */
export function InvoiceDocument({ invoice, kind, codes, className }: { invoice: Invoice; kind: DocKind; codes?: TaxCode[]; className?: string }) {
  const t = useTranslations("arap.document");
  const format = useFormatters();
  const nameOf = useNameOf();
  const company = useCurrentCompany();
  const draft = !invoice.posted;
  const cell = "border-b px-2 py-1 align-top";
  return (
    <article className={cn("relative overflow-hidden rounded-lg border bg-white p-6 text-[10pt] text-black", className)} data-testid="invoice-document" aria-label={t("label")}>
      {draft && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-bold tracking-widest text-black/10 select-none" style={{ transform: "rotate(-30deg)" }} data-testid="draft-watermark">
          {t("draft")}
        </span>
      )}
      <header className="mb-4 flex flex-wrap justify-between gap-4 border-b border-black pb-3">
        <div>
          <p className="font-semibold">{company?.name}</p>
          <p>{company?.name_km}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold">{kind === "AR" ? t("titleAr") : t("titleAp")}</p>
          <p>{invoice.number ?? t("unnumbered")}</p>
          {invoice.supplier_invoice_no && <p>{t("supplierNo", { number: invoice.supplier_invoice_no })}</p>}
        </div>
      </header>
      <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <dt className="text-black/60">{kind === "AR" ? t("billTo") : t("from")}</dt><dd className="font-medium">{invoice.party_name}<br />{invoice.party_name_km}</dd>
        <dt className="text-black/60">{t("date")}</dt><dd>{format.date(invoice.date)}</dd>
        <dt className="text-black/60">{t("due")}</dt><dd>{format.date(invoice.due_date)} ({t("terms", { days: invoice.terms_days })})</dd>
        <dt className="text-black/60">{t("currency")}</dt><dd>{invoice.currency}{invoice.currency !== "USD" ? ` @ ${invoice.rate}` : ""}</dd>
      </dl>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className={cell}>#</th><th className={cell}>{t("item")}</th><th className={`${cell} text-right`}>{t("qty")}</th>
            <th className={`${cell} text-right`}>{t("price")}</th><th className={`${cell} text-right`}>{t("discount")}</th><th className={cell}>{t("tax")}</th>
            <th className={`${cell} text-right`}>{t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={l.id ?? i}>
              <td className={cell}>{i + 1}</td>
              <td className={cell}>{l.description}</td>
              <td className={`${cell} text-right tabular-nums`}>{D(l.quantity).toFixed()}</td>
              <td className={`${cell} text-right tabular-nums`}>{format.amount(l.unit_price, invoice.currency)}</td>
              <td className={`${cell} text-right tabular-nums`}>{D(l.discount).isZero() ? "" : format.amount(l.discount, invoice.currency)}</td>
              <td className={cell}>{codes?.find((c) => c.id === l.tax_code_id)?.code ?? ""} {l.tax_rate && D(l.tax_rate).gt(0) ? `${D(l.tax_rate).toFixed()} %` : ""}</td>
              <td className={`${cell} text-right tabular-nums`}>{format.amount(l.total ?? "0", invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-3 grid w-64 grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        <dt>{t("subtotal")}</dt><dd className="text-right tabular-nums">{format.amount(new Decimal(invoice.subtotal).minus(invoice.discount), invoice.currency)}</dd>
        <dt>{t("taxTotal")}</dt><dd className="text-right tabular-nums">{format.amount(invoice.tax, invoice.currency)}</dd>
        <dt className="border-t border-black font-bold">{t("total")} ({invoice.currency})</dt><dd className="border-t border-black text-right font-bold tabular-nums">{format.amount(invoice.total, invoice.currency)}</dd>
        {invoice.currency !== "USD" && <><dt>{t("baseTotal")}</dt><dd className="text-right tabular-nums">{format.amount(invoice.total_base, "USD", { withCode: true })}</dd></>}
      </dl>
      {invoice.notes && <p className="mt-4 whitespace-pre-line">{invoice.notes}</p>}
      <p className="mt-6 text-[8pt] text-black/60">{t("disclaimer", { party: nameOf({ name: invoice.party_name, name_km: invoice.party_name_km }) })}</p>
    </article>
  );
}
