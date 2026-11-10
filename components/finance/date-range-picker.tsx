"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFiscalYears, useFormatters } from "@/lib/api/hooks";
import { formatDate, parseDate, todayBusinessDate } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

interface DateInputProps extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  /** "YYYY-MM-DD", or "" when empty. */
  value: string;
  onValueChange: (iso: string) => void;
}

/** Date entry in the user's date format (default DD/MM/YYYY, SRS NFR-LOC-004). */
export function DateInput({ value, onValueChange, className, ...props }: DateInputProps) {
  const { dateFormat } = useFormatters();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      placeholder={dateFormat}
      value={draft ?? formatDate(value, dateFormat)}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn("tabular-nums", className)}
      onFocus={() => setDraft(formatDate(value, dateFormat))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const text = draft ?? "";
        if (text.trim() === "") {
          setInvalid(false);
          onValueChange("");
          return setDraft(null);
        }
        const iso = parseDate(text, dateFormat);
        setInvalid(iso === null);
        if (iso) {
          onValueChange(iso);
          setDraft(null);
        }
      }}
    />
  );
}

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  idPrefix?: string;
  className?: string;
}

/** Date range that knows the fiscal periods: quick ranges, and a lock when a closed period is included. */
export function DateRangePicker({ value, onChange, idPrefix = "range", className }: DateRangePickerProps) {
  const t = useTranslations("finance.dateRange");
  const { data } = useFiscalYears();
  const periods = data?.flatMap((y) => y.periods) ?? [];
  const today = todayBusinessDate();
  const currentIndex = periods.findIndex((p) => p.start_date <= today && today <= p.end_date);
  const current = periods[currentIndex];
  const previous = currentIndex > 0 ? periods[currentIndex - 1] : undefined;
  const year = data?.find((y) => y.start_date <= today && today <= y.end_date);

  const invalid = Boolean(value.from && value.to && value.from > value.to);
  const touchesClosed = Boolean(
    value.from && value.to && !invalid && periods.some((p) => p.status === "CLOSED" && p.start_date <= value.to && p.end_date >= value.from),
  );

  const presets: { key: "thisPeriod" | "lastPeriod" | "yearToDate"; range?: DateRange }[] = [
    { key: "thisPeriod", range: current && { from: current.start_date, to: current.end_date } },
    { key: "lastPeriod", range: previous && { from: previous.start_date, to: previous.end_date } },
    { key: "yearToDate", range: year && { from: year.start_date, to: today } },
  ];

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-from`} className="text-xs font-medium text-muted-foreground">{t("from")}</label>
          <DateInput
            id={`${idPrefix}-from`}
            value={value.from}
            onValueChange={(from) => onChange({ ...value, from })}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${idPrefix}-error` : undefined}
            className="w-32"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-to`} className="text-xs font-medium text-muted-foreground">{t("to")}</label>
          <DateInput
            id={`${idPrefix}-to`}
            value={value.to}
            onValueChange={(to) => onChange({ ...value, to })}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${idPrefix}-error` : undefined}
            className="w-32"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("presets")}>
          {presets.map(({ key, range }) => (
            <Button key={key} type="button" variant="outline" size="sm" disabled={!range} onClick={() => range && onChange(range)}>
              {t(key)}
            </Button>
          ))}
        </div>
      </div>
      {invalid && <p id={`${idPrefix}-error`} className="text-xs text-destructive" role="alert">{t("invalid")}</p>}
      {touchesClosed && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" aria-hidden />
          {t("closedHint")}
        </p>
      )}
    </div>
  );
}
