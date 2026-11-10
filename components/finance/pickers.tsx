"use client";

import { ArrowLeftRight, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrencies, useFiscalYears } from "@/lib/api/hooks";
import type { AccountingPeriod } from "@/lib/api/types/org";
import { useAppLocale } from "@/lib/i18n/navigation";
import { D, Decimal, inverseRate, parseAmountInput } from "@/lib/money/decimal";
import { formatDecimal, formatRate } from "@/lib/money/format";
import { cn } from "@/lib/utils";

const NONE = "__none__";

interface CurrencySelectProps {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/** Currency selector listing the active currencies (SRS FR-FX-001). */
export function CurrencySelect({ value, onChange, disabled, id, className, ...aria }: CurrencySelectProps) {
  const t = useTranslations("finance.currency");
  const locale = useAppLocale();
  const { data } = useCurrencies();
  const currencies = data?.filter((c) => c.is_active) ?? [];
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label={aria["aria-label"] ?? t("label")}>
        <SelectValue placeholder={value} />
      </SelectTrigger>
      <SelectContent>
        {/* Keep the current value selectable while the list loads. */}
        {!currencies.some((c) => c.code === value) && value && <SelectItem value={value}>{value}</SelectItem>}
        {currencies.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span className="font-medium">{c.code}</span>
            <span className="text-muted-foreground">{locale === "km" ? c.name_km : c.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface RateInputProps {
  /** Base units per one unit of the transaction currency, up to 8 decimals (SRS §6.16). */
  value: string;
  onChange: (rate: string) => void;
  currency: string;
  baseCurrency: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Exchange-rate entry. The rate is stored as base per transaction-currency unit, but for a pair like
 * KHR→USD people think "4,100 KHR per USD", so the field can be switched to the inverse direction.
 */
export function RateInput({ value, onChange, currency, baseCurrency, disabled, id }: RateInputProps) {
  const t = useTranslations("finance.rate");
  // Small stored rates (0.00024390) read better as their inverse.
  const [inverse, setInverse] = useState(() => D(value).gt(0) && D(value).lt(1));
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  if (currency === baseCurrency) {
    return <p className="flex h-8 items-center text-sm text-muted-foreground">{t("baseCurrency")}</p>;
  }

  const shown = inverse ? (inverseRate(value, 4)?.toFixed() ?? "") : value;
  const display = draft ?? (shown === "" || D(shown).isZero() ? "" : inverse ? formatDecimal(shown, 2, "minus") : formatRate(shown));
  const equivalent = inverseRate(value, 2);

  const commit = (text: string) => {
    const parsed = parseAmountInput(text);
    if (parsed === null || (parsed !== "" && D(parsed).lte(0))) return setInvalid(true);
    setInvalid(false);
    if (parsed === "") return onChange("");
    const direct = inverse ? new Decimal(1).div(parsed) : new Decimal(parsed);
    onChange(direct.toDecimalPlaces(8).toFixed());
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={display}
          aria-label={t("label")}
          aria-invalid={invalid || undefined}
          aria-describedby={id ? `${id}-hint` : undefined}
          className="amount"
          onFocus={() => setDraft(shown)}
          onChange={(e) => /^[\d.,\s]*$/.test(e.target.value) && setDraft(e.target.value)}
          onBlur={() => {
            commit(draft ?? "");
            setDraft(null);
          }}
        />
        <Button type="button" variant="outline" size="icon" disabled={disabled} onClick={() => setInverse((i) => !i)} aria-label={t("switch")}>
          <ArrowLeftRight aria-hidden />
        </Button>
      </div>
      <p id={id ? `${id}-hint` : undefined} className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
        {invalid
          ? t("invalid")
          : `${inverse ? t("inverse", { base: baseCurrency, currency }) : t("direct", { base: baseCurrency, currency })}` +
            (equivalent ? ` · ${t("equivalent", { base: baseCurrency, currency, inverse: formatDecimal(equivalent, 2, "minus") })}` : "")}
      </p>
    </div>
  );
}

interface DimensionOption {
  id: string;
  code?: string;
  name: string;
  name_km?: string | null;
}

interface DimensionPickerProps {
  /** Dimension name for the accessible label, e.g. "Branch". */
  label: string;
  options: DimensionOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Allow "None" (default true). */
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** Picker for one analysis dimension: branch, department or a configured dimension (SRS §14.5). */
export function DimensionPicker({ label, options, value, onChange, clearable = true, disabled, id, className }: DimensionPickerProps) {
  const t = useTranslations("finance.dimension");
  const locale = useAppLocale();
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label={t("select", { name: label })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value={NONE}>{t("none")}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {locale === "km" && o.name_km ? o.name_km : o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface PeriodPickerProps {
  /** Period id. */
  value: string | null;
  onChange: (periodId: string, period: AccountingPeriod) => void;
  /** Disable closed periods (for posting dates); they stay selectable for inquiry by default. */
  disableClosed?: boolean;
  id?: string;
  className?: string;
}

/** Fiscal-period selector. Closed periods carry a lock icon (prompt §6). */
export function PeriodPicker({ value, onChange, disableClosed, id, className }: PeriodPickerProps) {
  const t = useTranslations("finance.period");
  const locale = useAppLocale();
  const { data } = useFiscalYears();
  const periods = data?.flatMap((y) => y.periods) ?? [];
  return (
    <Select
      value={value ?? undefined}
      onValueChange={(periodId) => {
        const period = periods.find((p) => p.id === periodId);
        if (period) onChange(periodId, period);
      }}
    >
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label={t("label")}>
        <SelectValue placeholder={t("placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {periods.map((p) => {
          const closed = p.status === "CLOSED";
          return (
            <SelectItem key={p.id} value={p.id} disabled={disableClosed && closed}>
              {closed && <Lock className="size-3 text-muted-foreground" aria-label={t("locked")} />}
              {locale === "km" ? p.name_km : p.name}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
