"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { useFormatters } from "@/lib/api/hooks";
import { useAppLocale } from "@/lib/i18n/navigation";
import type { AmountLike } from "@/lib/money/decimal";
import { cn } from "@/lib/utils";
import { AmountText } from "./amount";

export interface TotalsRow {
  label: string;
  value: AmountLike;
  /** The grand total row. */
  emphasis?: boolean;
}

interface TotalsPanelProps {
  rows: TotalsRow[];
  currency: string;
  /** Base-currency equivalent, shown when the document currency differs (SRS SCR-09). */
  baseEquivalent?: { value: AmountLike; currency: string };
  /** Totals computed in the browser are a preview until the server answers (SRS §13.5). */
  preview?: boolean;
  className?: string;
}

/** Document totals: subtotal, discount, tax, total and the base-currency equivalent. */
export function TotalsPanel({ rows, currency, baseEquivalent, preview, className }: TotalsPanelProps) {
  const t = useTranslations("finance.totals");
  return (
    <div className={cn("ml-auto w-full max-w-xs space-y-1 rounded-lg border bg-card p-3 text-sm", className)}>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {rows.map((row) => (
          <div key={row.label} className={cn("contents", row.emphasis && "font-semibold")}>
            <dt className={cn(!row.emphasis && "text-muted-foreground", row.emphasis && "border-t pt-1")}>
              {row.label}
              {row.emphasis && <span className="font-normal text-muted-foreground"> ({currency})</span>}
            </dt>
            <dd className={cn(row.emphasis && "border-t pt-1")}>
              <AmountText value={row.value} currency={currency} />
            </dd>
          </div>
        ))}
        {baseEquivalent && baseEquivalent.currency !== currency && (
          <>
            <dt className="text-muted-foreground">{t("baseEquivalent")}</dt>
            <dd><AmountText value={baseEquivalent.value} currency={baseEquivalent.currency} withCode /></dd>
          </>
        )}
      </dl>
      {preview && <p className="pt-1 text-xs text-muted-foreground">{t("preview")}</p>}
    </div>
  );
}

interface ReportHeaderProps {
  reportName: string;
  /** Period or as-of date, already formatted. */
  period: string;
  currency?: string;
  branch?: string;
  /** Accounting basis; accrual in release 1 (SRS §15.1). */
  basis?: string;
  generatedAt?: string;
  includesUnposted?: boolean;
  actions?: ReactNode;
}

/** Header printed on every report: company, report name, basis, period, generated at and by (SRS §15.4). */
export function ReportHeader({ reportName, period, currency, branch, basis, generatedAt, includesUnposted, actions }: ReportHeaderProps) {
  const t = useTranslations("report");
  const locale = useAppLocale();
  const format = useFormatters();
  const company = useCurrentCompany();
  const user = useSession((s) => s.user);
  const facts: [string, string | undefined][] = [
    [t("basis"), basis ?? t("accrual")],
    [t("period"), period],
    [t("currency"), currency ?? company?.base_currency],
    [t("branch"), branch],
    [t("generatedAt"), format.dateTime(generatedAt ?? new Date().toISOString())],
    [t("generatedBy"), user ? (locale === "km" ? user.full_name_km : user.full_name) : undefined],
  ];
  return (
    <header className="mb-4 space-y-2 border-b pb-3" data-print="keep">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{company ? (locale === "km" ? company.name_km : company.name) : ""}</p>
          <h1 className="text-xl font-semibold tracking-tight">{reportName}</h1>
        </div>
        {actions && <div className="flex flex-wrap gap-2" data-print="hide">{actions}</div>}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {facts.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="flex gap-1">
            <dt className="text-muted-foreground">{label}:</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {includesUnposted && (
        <p className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-sm text-warning" role="status">
          <AlertTriangle className="size-4" aria-hidden />
          {t("includesUnposted")}
        </p>
      )}
    </header>
  );
}
