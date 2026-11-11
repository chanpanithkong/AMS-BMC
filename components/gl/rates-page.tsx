"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, useUrlFilters } from "@/components/data/filters";
import { EmptyState, PageHeader } from "@/components/feedback/states";
import { FormField, NativeSelect } from "@/components/forms/field";
import { DateInput, DateRangePicker } from "@/components/finance/date-range-picker";
import { RateInput } from "@/components/finance/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { orgApi } from "@/lib/api/endpoints/org";
import { useCurrencies, useFormatters } from "@/lib/api/hooks";
import type { ExchangeRate } from "@/lib/api/types/org";
import { useCurrentCompany } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { D, inverseRate } from "@/lib/money/decimal";
import { formatDecimal, formatRate } from "@/lib/money/format";
import { Can } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";

const RATE_TYPES = ["TRANSACTION", "CLOSING", "AVERAGE"] as const;

/** SCR-24 exchange rates: table by date and currency pair, with an entry form for permitted users. */
export function RatesPage() {
  const t = useTranslations();
  const format = useFormatters();
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const base = company?.base_currency ?? "USD";
  const { data: currencies } = useCurrencies();
  const { filters, setFilters, clear, active } = useUrlFilters(["currency", "type", "from", "to"] as const);
  const [entry, setEntry] = useState(false);

  const columns: ColumnDef<ExchangeRate, unknown>[] = [
    { id: "date", header: t("gl.rates.col.date"), cell: ({ row }) => <span className="tabular-nums">{format.date(row.original.rate_date)}</span> },
    { id: "pair", header: t("gl.rates.col.pair"), cell: ({ row }) => `${row.original.from_currency} → ${row.original.to_currency}` },
    { id: "type", header: t("gl.rates.col.type"), cell: ({ row }) => t(`gl.rates.type.${row.original.rate_type}`) },
    {
      id: "rate", header: t("gl.rates.col.rate"), meta: { align: "right", label: t("gl.rates.col.rate") },
      cell: ({ row }) => <span className="amount block">{formatRate(row.original.rate)}</span>,
    },
    {
      id: "inverse", header: t("gl.rates.col.inverse"), meta: { align: "right", label: t("gl.rates.col.inverse") },
      cell: ({ row }) => {
        const inv = inverseRate(row.original.rate, 2);
        return <span className="amount block">{inv ? `1 ${row.original.to_currency} = ${formatDecimal(inv, 2, "minus")} ${row.original.from_currency}` : "—"}</span>;
      },
    },
    { id: "source", header: t("gl.rates.col.source"), cell: ({ row }) => row.original.source },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title={t("gl.rates.title")}
        description={t("gl.rates.description")}
        actions={
          <Can permission="fx.rate.manage">
            <Button size="sm" onClick={() => setEntry(true)} data-testid="new-rate"><Plus aria-hidden />{t("gl.rates.new")}</Button>
          </Can>
        }
      />
      <FilterBar onClear={() => clear()} canClear={active}>
        <NativeSelect className="w-auto" aria-label={t("gl.rates.form.currency")} value={filters.currency} onChange={(e) => setFilters({ currency: e.target.value })}>
          <option value="">{t("gl.rates.allCurrencies")}</option>
          {currencies?.filter((c) => c.code !== base).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto" aria-label={t("gl.rates.form.type")} value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="">{t("gl.rates.allTypes")}</option>
          {RATE_TYPES.map((x) => <option key={x} value={x}>{t(`gl.rates.type.${x}`)}</option>)}
        </NativeSelect>
        <DateRangePicker idPrefix="rates-range" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
      </FilterBar>
      <DataTable<ExchangeRate>
        tableId="rates"
        caption={t("gl.rates.title")}
        columns={columns}
        queryKey={["rates", companyId, filters.currency, filters.type, filters.from, filters.to]}
        fetchPage={({ cursor, limit }) =>
          orgApi.exchangeRates({ cursor, limit, from: filters.currency || undefined, rate_type: filters.type || undefined, date_from: filters.from || undefined, date_to: filters.to || undefined })
        }
        getRowId={(row) => row.id}
        empty={<EmptyState title={t("gl.rates.empty")} />}
      />
      {entry && <RateEntry base={base} onClose={() => setEntry(false)} />}
    </div>
  );
}

function RateEntry({ base, onClose }: { base: string; onClose: () => void }) {
  const t = useTranslations();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const { data: currencies } = useCurrencies();
  const foreign = currencies?.filter((c) => c.code !== base && c.is_active) ?? [];
  const [value, setValue] = useState({ rate_date: todayBusinessDate(), from_currency: "KHR", rate_type: "TRANSACTION" as ExchangeRate["rate_type"], rate: "", source: "" });
  const valid = Boolean(value.rate_date && value.from_currency && D(value.rate).gt(0));

  // The entry is a critical setting change (SRS §14.5): it goes through the confirmation dialog,
  // which shows the fields and any server error (duplicate rate, missing permission).
  return (
    <ConfirmActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      action="changeSetting"
      title={t("gl.rates.form.title")}
      description={valid ? t("gl.rates.form.confirm", { rate: `${formatRate(value.rate)} (1 ${base} = ${formatDecimal(inverseRate(value.rate, 2) ?? "0", 2, "minus")} ${value.from_currency})`, currency: value.from_currency, date: format.date(value.rate_date) }) : t("gl.rates.form.illustrative")}
      effect={{ currency: base, date: format.date(value.rate_date) }}
      thresholdAmount="0"
      canConfirm={valid}
      onConfirm={async () => {
        await orgApi.createRate(value);
        void queryClient.invalidateQueries({ queryKey: ["rates"] });
        return t("gl.rates.form.saved");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2" data-testid="rate-form">
        <FormField id="rate-date" label={t("gl.rates.form.date")} required>
          <DateInput id="rate-date" value={value.rate_date} onValueChange={(rate_date) => setValue((v) => ({ ...v, rate_date }))} />
        </FormField>
        <FormField id="rate-currency" label={t("gl.rates.form.currency")} required>
          <NativeSelect id="rate-currency" value={value.from_currency} onChange={(e) => setValue((v) => ({ ...v, from_currency: e.target.value, rate: "" }))}>
            {foreign.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="rate-type" label={t("gl.rates.form.type")} required>
          <NativeSelect id="rate-type" value={value.rate_type} onChange={(e) => setValue((v) => ({ ...v, rate_type: e.target.value as ExchangeRate["rate_type"] }))}>
            {RATE_TYPES.map((x) => <option key={x} value={x}>{t(`gl.rates.type.${x}`)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="rate-source" label={t("gl.rates.form.source")}>
          <Input id="rate-source" value={value.source} placeholder={t("gl.rates.form.sourcePlaceholder")} onChange={(e) => setValue((v) => ({ ...v, source: e.target.value }))} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField id="rate-value" label={t("gl.rates.form.rate")} required>
            <RateInput key={value.from_currency} id="rate-value" value={value.rate} onChange={(rate) => setValue((v) => ({ ...v, rate }))} currency={value.from_currency} baseCurrency={base} defaultInverse />
          </FormField>
        </div>
      </div>
    </ConfirmActionDialog>
  );
}
