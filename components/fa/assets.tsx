"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowRightLeft, CalendarClock, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAccountLabel, useCashBankAccounts, useHistoryLabel } from "@/components/cb/use-cash-bank";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, StatusTabs, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, FormSkeleton, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { describedBy, FormField, NativeSelect, useErrorToast } from "@/components/forms/field";
import { AccountPicker } from "@/components/finance/account-picker";
import { AmountInput, AmountText } from "@/components/finance/amount";
import { DateInput } from "@/components/finance/date-range-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryPanel, UnsavedChangesGuard } from "@/components/workflow/approval";
import { ConfirmActionDialog } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { assetsApi } from "@/lib/api/endpoints/assets";
import { isApiError } from "@/lib/api/errors";
import { useDepartments, useFormatters } from "@/lib/api/hooks";
import type { Account } from "@/lib/api/types/accounts";
import type { FixedAsset, FixedAssetInput } from "@/lib/api/types/assets";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { D } from "@/lib/money/decimal";
import { schedule } from "@/lib/money/depreciation";
import { Can, usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";

const TABS = ["", "ACTIVE", "DRAFT", "FULLY_DEPRECIATED", "DISPOSAL_PENDING", "DISPOSED"] as const;

export function useAssetCategories() {
  return useQuery({ queryKey: ["asset-categories"], queryFn: assetsApi.categories, staleTime: 300_000, select: (p) => p.data });
}

function useLocal() {
  const locale = useAppLocale();
  return (x: { name: string; name_km?: string | null } | null | undefined) => (!x ? "" : locale === "km" && x.name_km ? x.name_km : x.name);
}

/** SCR-14 asset register. */
export function AssetListPage() {
  const t = useTranslations();
  const router = useAppRouter();
  const format = useFormatters();
  const local = useLocal();
  const companyId = useUiStore((s) => s.companyId);
  const { data: categories } = useAssetCategories();
  const { data: departments } = useDepartments();
  const { filters, setFilters, clear } = useUrlFilters(["status", "category", "search"] as const);
  const columns: ColumnDef<FixedAsset, unknown>[] = [
    { id: "tag", header: t("fa.col.tag"), cell: ({ row }) => <AppLink href={`/fixed-assets/${row.original.id}`} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.tag}</AppLink> },
    { id: "name", header: t("fa.col.name"), cell: ({ row }) => <span className="block min-w-40">{local(row.original)}</span> },
    { id: "category", header: t("fa.col.category"), cell: ({ row }) => local({ name: row.original.category_name, name_km: row.original.category_name_km }) },
    { id: "acquired", header: t("fa.col.acquired"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.date(row.original.acquisition_date)}</span> },
    { id: "cost", header: t("fa.col.cost"), meta: { align: "right", label: t("fa.col.cost") }, cell: ({ row }) => <AmountText value={row.original.cost} currency="USD" /> },
    { id: "acc", header: t("fa.col.accumulated"), meta: { align: "right", label: t("fa.col.accumulated") }, cell: ({ row }) => <AmountText value={row.original.accumulated} currency="USD" /> },
    { id: "nbv", header: t("fa.col.nbv"), meta: { align: "right", label: t("fa.col.nbv") }, cell: ({ row }) => <AmountText value={row.original.net_book_value} currency="USD" /> },
    { id: "status", header: t("fa.col.status"), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "department", header: t("fa.col.department"), cell: ({ row }) => local(departments?.find((d) => d.id === row.original.department_id)) || "—" },
  ];
  return (
    <div className="min-w-0">
      <PageHeader title={t("fa.title")} description={t("fa.description")}
        actions={<>
          <Button size="sm" variant="outline" asChild><AppLink href="/fixed-assets/depreciation-runs"><CalendarClock aria-hidden />{t("fa.runs.title")}</AppLink></Button>
          <Can permission="fa.create"><Button size="sm" asChild data-testid="new-asset"><AppLink href="/fixed-assets/new"><Plus aria-hidden />{t("fa.new")}</AppLink></Button></Can>
        </>} />
      <StatusTabs label={t("fa.tabsLabel")} value={filters.status} onChange={(status) => setFilters({ status })} tabs={TABS.map((s) => ({ value: s, label: s ? t(`status.${s}`) : t("common.all") }))} />
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("fa.searchPlaceholder")} onClear={() => clear()} canClear={Boolean(filters.category || filters.search)}>
        <NativeSelect className="w-auto" aria-label={t("fa.col.category")} value={filters.category} onChange={(e) => setFilters({ category: e.target.value })}>
          <option value="">{t("fa.allCategories")}</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{local(c)}</option>)}
        </NativeSelect>
      </FilterBar>
      <DataTable<FixedAsset>
        tableId="assets" caption={t("fa.title")} columns={columns}
        queryKey={["assets", companyId, filters.status, filters.category, filters.search]}
        fetchPage={({ cursor, limit }, signal) => assetsApi.list({ cursor, limit, status: filters.status || undefined, category_id: filters.category || undefined, search: filters.search || undefined }, signal)}
        getRowId={(r) => r.id} onRowClick={(r) => router.push(`/fixed-assets/${r.id}`)}
        empty={<EmptyState title={t("fa.empty")} />}
      />
    </div>
  );
}

export function AssetPage({ id }: { id: string }) {
  const t = useTranslations();
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["asset", id], queryFn: ({ signal }) => assetsApi.get(id, signal), enabled: !isNew });
  if (isNew) return <div><PageHeader title={t("fa.new")} /><AssetForm asset={null} /></div>;
  if (query.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <EmptyState title={t("fa.notFound")} /> : <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <AssetView asset={query.data} />;
}

const toInput = (a: FixedAsset | null): FixedAssetInput => ({
  name: a?.name ?? "", name_km: a?.name_km ?? "", category_id: a?.category_id ?? "", cost: a?.cost ?? "", residual_value: a?.residual_value ?? "0", useful_life_months: a?.useful_life_months ?? 60,
  method: a?.method ?? "STRAIGHT_LINE", declining_rate: a?.declining_rate ?? null, convention: a?.convention ?? "NEXT_MONTH", acquisition_date: a?.acquisition_date ?? todayBusinessDate(),
  in_service_date: a?.in_service_date ?? todayBusinessDate(), supplier_name: a?.supplier_name ?? "", location: a?.location ?? "", branch_id: a?.branch_id ?? null, department_id: a?.department_id ?? null,
  custodian: a?.custodian ?? "", funding: "POST", funding_account_id: null, accumulated_brought_forward: "0",
});

const fundingFilter = (a: Account) => (a.type === "ASSET" && a.cash_flow_class === "CASH") || ["2100", "2150", "2500"].includes(a.code);

/** Asset form with a live depreciation preview (FR-FA-001, FR-FA-004). */
function AssetForm({ asset, onSaved }: { asset: FixedAsset | null; onSaved?: (a: FixedAsset) => void }) {
  const t = useTranslations();
  const router = useAppRouter();
  const local = useLocal();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const describe = useDescribeError();
  const company = useCurrentCompany();
  const { data: categories } = useAssetCategories();
  const { data: departments } = useDepartments();
  const [value, setValue] = useState<FixedAssetInput>(() => toInput(asset));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const set = (patch: Partial<FixedAssetInput>) => { setValue((v) => ({ ...v, ...patch })); setDirty(true); };
  const preview = useMemo(() => schedule({ ...value, cost: value.cost || "0" }), [value]);
  const save = useMutation({
    mutationFn: async (activate: boolean) => {
      setErrors({});
      setFailure(null);
      let result = asset ? await assetsApi.update(asset.id, value, asset.version) : await assetsApi.create(value);
      if (activate) result = await assetsApi.activate(result.id);
      return result;
    },
    onSuccess: (next) => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.setQueryData(["asset", next.id], next);
      toast.success(t("fa.saved", { tag: next.tag }));
      if (!asset) {
        // Next keeps the /new page alive in the background: start it blank for the next visit.
        setValue(toInput(null));
        router.replace(`/fixed-assets/${next.id}`);
      } else onSaved?.(next);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === "VERSION_CONFLICT") return errorToast(error);
      if (isApiError(error)) setErrors(error.fieldErrors);
      const detail = isApiError(error) ? error.details[0] : undefined;
      setFailure(isApiError(error) && error.code === "VALIDATION_ERROR" && detail?.message ? detail.message : describe(error).message);
    },
  });
  const chooseCategory = (id: string) => {
    const c = categories?.find((x) => x.id === id);
    set({ category_id: id, ...(c ? { useful_life_months: c.useful_life_months, method: c.method, convention: c.convention, declining_rate: c.declining_rate } : {}) });
  };
  const field = (key: keyof FixedAssetInput, label: string, input: React.ReactNode, opts: { required?: boolean; hint?: string; className?: string } = {}) => (
    <FormField id={`fa-${key}`} label={label} required={opts.required} error={errors[key]} hint={opts.hint} className={opts.className}>{input}</FormField>
  );
  const firstYear = preview.slice(0, 12);
  return (
    <div className="space-y-4" data-testid="asset-form">
      <UnsavedChangesGuard dirty={dirty && !save.isPending} />
      <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        {field("name", t("fa.form.name"), <Input id="fa-name" value={value.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("fa-name", errors.name)} />, { required: true })}
        {field("name_km", t("fa.form.nameKm"), <Input id="fa-name_km" value={value.name_km} onChange={(e) => set({ name_km: e.target.value })} />)}
        {field("category_id", t("fa.col.category"), (
          <NativeSelect id="fa-category_id" value={value.category_id} onChange={(e) => chooseCategory(e.target.value)} aria-invalid={Boolean(errors.category_id)}>
            <option value="">{t("arap.form.select")}</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{local(c)}</option>)}
          </NativeSelect>
        ), { required: true })}
        {field("cost", `${t("fa.col.cost")} (USD)`, <AmountInput id="fa-cost" currency="USD" value={value.cost} onValueChange={(cost) => set({ cost })} disabled={Boolean(asset && asset.status !== "DRAFT" && asset.source.type !== "OPENING")} aria-invalid={Boolean(errors.cost)} aria-describedby={describedBy("fa-cost", errors.cost)} />, { required: true })}
        {field("residual_value", `${t("fa.form.residual")} (USD)`, <AmountInput id="fa-residual_value" currency="USD" value={value.residual_value} onValueChange={(residual_value) => set({ residual_value })} aria-invalid={Boolean(errors.residual_value)} aria-describedby={describedBy("fa-residual_value", errors.residual_value)} />)}
        {field("useful_life_months", t("fa.form.life"), <Input id="fa-useful_life_months" type="number" min={1} max={600} value={value.useful_life_months} onChange={(e) => set({ useful_life_months: Number(e.target.value) })} />, { required: true })}
        {field("method", t("fa.form.method"), (
          <NativeSelect id="fa-method" value={value.method} onChange={(e) => set({ method: e.target.value as FixedAssetInput["method"] })}>
            <option value="STRAIGHT_LINE">{t("fa.method.STRAIGHT_LINE")}</option><option value="DECLINING_BALANCE">{t("fa.method.DECLINING_BALANCE")}</option>
          </NativeSelect>
        ))}
        {value.method === "DECLINING_BALANCE" && field("declining_rate", t("fa.form.rate"), <AmountInput id="fa-declining_rate" currency="PCT" value={value.declining_rate ?? ""} onValueChange={(declining_rate) => set({ declining_rate })} />)}
        {field("convention", t("fa.form.convention"), (
          <NativeSelect id="fa-convention" value={value.convention} onChange={(e) => set({ convention: e.target.value as FixedAssetInput["convention"] })}>
            <option value="NEXT_MONTH">{t("fa.convention.NEXT_MONTH")}</option><option value="SAME_MONTH">{t("fa.convention.SAME_MONTH")}</option>
          </NativeSelect>
        ))}
        {field("acquisition_date", t("fa.col.acquired"), <DateInput id="fa-acquisition_date" value={value.acquisition_date} onValueChange={(acquisition_date) => set({ acquisition_date })} />, { required: true })}
        {field("in_service_date", t("fa.form.inService"), <DateInput id="fa-in_service_date" value={value.in_service_date} onValueChange={(in_service_date) => set({ in_service_date })} />, { required: true })}
        {field("supplier_name", t("fa.form.supplier"), <Input id="fa-supplier_name" value={value.supplier_name} onChange={(e) => set({ supplier_name: e.target.value })} />)}
        {field("location", t("fa.form.location"), <Input id="fa-location" value={value.location} onChange={(e) => set({ location: e.target.value })} />)}
        {field("custodian", t("fa.form.custodian"), <Input id="fa-custodian" value={value.custodian} onChange={(e) => set({ custodian: e.target.value })} />)}
        {field("department_id", t("fa.col.department"), (
          <NativeSelect id="fa-department_id" value={value.department_id ?? ""} onChange={(e) => set({ department_id: e.target.value || null })}>
            <option value="">—</option>
            {departments?.map((d) => <option key={d.id} value={d.id}>{local(d)}</option>)}
          </NativeSelect>
        ))}
        {field("branch_id", t("fa.form.branch"), (
          <NativeSelect id="fa-branch_id" value={value.branch_id ?? ""} onChange={(e) => set({ branch_id: e.target.value || null })}>
            <option value="">—</option>
            {company?.branches.map((b) => <option key={b.id} value={b.id}>{local(b)}</option>)}
          </NativeSelect>
        ))}
      </section>
      {!asset && (
        <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3" aria-labelledby="funding-title">
          <h2 id="funding-title" className="text-sm font-semibold sm:col-span-3">{t("fa.form.fundingTitle")}</h2>
          {field("funding", t("fa.form.funding"), (
            <NativeSelect id="fa-funding" value={value.funding} onChange={(e) => set({ funding: e.target.value as FixedAssetInput["funding"] })} aria-describedby="fa-funding-hint">
              <option value="POST">{t("fa.funding.POST")}</option><option value="ALREADY_POSTED">{t("fa.funding.ALREADY_POSTED")}</option>
            </NativeSelect>
          ), { hint: t(`fa.fundingHint.${value.funding}`) })}
          {value.funding === "POST" && field("funding_account_id", t("fa.form.fundingAccount"), <AccountPicker id="fa-funding_account_id" value={value.funding_account_id} onChange={(funding_account_id) => set({ funding_account_id })} filter={fundingFilter} invalid={Boolean(errors.funding_account_id)} />, { required: true })}
          {value.funding === "ALREADY_POSTED" && field("accumulated_brought_forward", `${t("fa.form.broughtForward")} (USD)`, <AmountInput id="fa-accumulated_brought_forward" currency="USD" value={value.accumulated_brought_forward} onValueChange={(accumulated_brought_forward) => set({ accumulated_brought_forward })} aria-describedby={describedBy("fa-accumulated_brought_forward", errors.accumulated_brought_forward)} />)}
        </section>
      )}
      <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="preview-title" data-testid="schedule-preview">
        <h2 id="preview-title" className="mb-2 font-semibold">{t("fa.form.preview")}</h2>
        {preview.length === 0 ? <p className="text-muted-foreground">{t("fa.form.previewEmpty")}</p> : (
          <p>{t("fa.form.previewText", { first: preview[0].period, monthly: format.amount(preview[0].amount, "USD", { withCode: true }), months: preview.length, last: preview.at(-1)!.period, year: format.amount(firstYear.reduce((s, m) => s.plus(m.amount), D("0")), "USD", { withCode: true }) })}</p>
        )}
      </section>
      {failure && <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="asset-error"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{failure}</p>}
      <div className="flex justify-end gap-2">
        <Button variant={asset?.status === "DRAFT" ? "outline" : "default"} onClick={() => save.mutate(false)} disabled={save.isPending} data-testid="asset-save">{save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}{t("common.save")}</Button>
        {asset?.status === "DRAFT" && <Button onClick={() => save.mutate(true)} disabled={save.isPending} data-testid="asset-activate">{t("fa.actions.activate")}</Button>}
      </div>
    </div>
  );
}

type Dialog = "transfer" | "dispose" | "approve" | "reject" | null;

function AssetView({ asset: a }: { asset: FixedAsset }) {
  const t = useTranslations();
  const local = useLocal();
  const format = useFormatters();
  const label = useAccountLabel();
  const queryClient = useQueryClient();
  const historyLabel = useHistoryLabel();
  const company = useCurrentCompany();
  const userId = useSession((s) => s.user?.id);
  const { data: departments } = useDepartments();
  const { accounts } = useCashBankAccounts();
  const can = { edit: usePermission("fa.edit"), approve: usePermission("fa.approve"), create: usePermission("fa.create") };
  const sched = useQuery({ queryKey: ["asset-schedule", a.id, a.version], queryFn: ({ signal }) => assetsApi.schedule(a.id, signal) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = todayBusinessDate();
  const [transfer, setTransfer] = useState({ date: today, branch_id: a.branch_id, department_id: a.department_id, location: a.location, custodian: a.custodian, reason: "" });
  const [disposal, setDisposal] = useState({ date: today, proceeds: "", account_id: "", reason: "" });
  const [disposeError, setDisposeError] = useState<string | null>(null);
  const describe = useDescribeError();
  const update = (next: FixedAsset) => {
    queryClient.setQueryData(["asset", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };
  const dispose = useMutation({
    mutationFn: () => assetsApi.dispose(a.id, { ...disposal, proceeds: disposal.proceeds || "0", account_id: disposal.account_id || null }),
    onSuccess: (next) => { update(next); setDialog(null); toast.success(t("fa.toast.disposalRequested")); },
    onError: (e) => setDisposeError(isApiError(e) && e.details[0]?.message ? e.details[0].message : describe(e).message),
  });
  const editable = can.edit && (a.status === "DRAFT" || (a.status === "ACTIVE" && !a.last_depreciated_period) || (a.status === "ACTIVE" && a.source.type !== "OPENING" && a.last_depreciated_period === null));
  const inUse = a.status === "ACTIVE" || a.status === "FULLY_DEPRECIATED";
  const nbv = D(a.net_book_value);
  const gainLoss = D(disposal.proceeds || "0").minus(nbv);
  const effect = { date: format.date(a.disposal?.date ?? today), currency: "USD", amount: a.disposal?.proceeds ?? "0", accounts: [`${a.tag} ${local(a)}`] };
  const sodReason = a.disposal?.requested_by_id === userId ? t("workflow.sod.violation") : null;

  return (
    <div className="space-y-4" data-testid="asset-page" data-status={a.status}>
      <PageHeader title={`${a.tag} · ${local(a)}`} badge={<StatusBadge status={a.status} />} description={`${local({ name: a.category_name, name_km: a.category_name_km })} · ${a.source.number ?? t(`fa.source.${a.source.type}`)}`}
        actions={<>
          {inUse && can.edit && <Button size="sm" variant="outline" onClick={() => setDialog("transfer")} data-testid="asset-transfer"><ArrowRightLeft aria-hidden />{t("fa.actions.transfer")}</Button>}
          {inUse && can.edit && <Button size="sm" variant="outline" onClick={() => setDialog("dispose")} data-testid="asset-dispose"><Trash2 aria-hidden />{t("fa.actions.dispose")}</Button>}
          {a.status === "DISPOSAL_PENDING" && can.approve && <>
            <Button size="sm" variant="destructive" disabled={Boolean(sodReason)} onClick={() => setDialog("reject")}>{t("arap.actions.reject")}</Button>
            <Button size="sm" disabled={Boolean(sodReason)} onClick={() => setDialog("approve")} data-testid="disposal-approve">{t("fa.actions.approveDisposal")}</Button>
          </>}
        </>} />
      {a.status === "DRAFT" && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status">{t("fa.banner.draft")}</p>}
      {a.status === "FULLY_DEPRECIATED" && <p className="rounded-lg border p-3 text-sm" role="status">{t("fa.banner.fully")}</p>}
      {a.disposal && a.status === "DISPOSAL_PENDING" && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="status" data-testid="disposal-pending">{t("fa.banner.pending", { date: format.date(a.disposal.date), proceeds: format.amount(a.disposal.proceeds, "USD", { withCode: true }), by: a.disposal.requested_by, reason: a.disposal.reason })}</p>}
      {a.disposal && a.status === "DISPOSED" && (
        <p className="rounded-lg border p-3 text-sm" role="status" data-testid="disposal-done">
          {t(D(a.disposal.gain_loss ?? "0").gte(0) ? "fa.banner.disposedGain" : "fa.banner.disposedLoss", { date: format.date(a.disposal.date), amount: format.amount(D(a.disposal.gain_loss ?? "0").abs(), "USD", { withCode: true }) })}{" "}
          {a.disposal.journal_id && <AppLink href={`/accounting/journals/${a.disposal.journal_id}`} className="underline">{a.disposal.journal_no}</AppLink>}
        </p>
      )}
      <dl className="grid gap-3 sm:grid-cols-4">
        {[[t("fa.col.cost"), a.cost], [t("fa.col.accumulated"), a.accumulated], [t("fa.col.nbv"), a.net_book_value]].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="amount text-left text-lg font-semibold">{format.amount(v, "USD", { withCode: true })}</dd></div>
        ))}
        <div className="rounded-xl border bg-card p-3"><dt className="text-xs text-muted-foreground">{t("fa.lastPeriod")}</dt><dd className="text-lg font-semibold">{a.last_depreciated_period ?? "—"}</dd></div>
      </dl>
      <Tabs defaultValue={a.status === "DRAFT" || editable ? "details" : "schedule"}>
        <TabsList>
          <TabsTrigger value="details">{t("fa.tabs.details")}</TabsTrigger>
          <TabsTrigger value="schedule" data-testid="schedule-tab">{t("fa.tabs.schedule")}</TabsTrigger>
          <TabsTrigger value="history">{t("fa.tabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          {editable ? <AssetForm key={a.version} asset={a} onSaved={update} /> : (
            <dl className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
              {[
                [t("fa.form.residual"), format.amount(a.residual_value, "USD", { withCode: true })], [t("fa.form.life"), t("fa.months", { n: a.useful_life_months })],
                [t("fa.form.method"), t(`fa.method.${a.method}`)], [t("fa.form.convention"), t(`fa.convention.${a.convention}`)], [t("fa.col.acquired"), format.date(a.acquisition_date)],
                [t("fa.form.inService"), format.date(a.in_service_date)], [t("fa.form.supplier"), a.supplier_name || "—"], [t("fa.form.location"), a.location || "—"], [t("fa.form.custodian"), a.custodian || "—"],
                [t("fa.col.department"), local(departments?.find((d) => d.id === a.department_id)) || "—"], [t("fa.form.branch"), local(company?.branches.find((b) => b.id === a.branch_id)) || "—"],
                [t("fa.form.broughtForward"), format.amount(a.accumulated_brought_forward, "USD")],
              ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
          )}
        </TabsContent>
        <TabsContent value="schedule">
          {sched.isPending ? <TableSkeleton rows={6} /> : sched.isError ? <ErrorState error={sched.error} onRetry={() => sched.refetch()} /> : (
            <div className="relative max-h-[32rem] overflow-auto rounded-lg border">
              <table className="w-full min-w-[36rem] text-sm" data-testid="schedule-table">
                <caption className="sr-only">{t("fa.tabs.schedule")}</caption>
                <thead className="sticky top-0 bg-muted"><tr>
                  {["period", "opening", "depreciation", "accumulated", "closing", "state"].map((c) => <th key={c} scope="col" className={`px-2 py-2 text-xs font-medium text-muted-foreground ${c === "period" || c === "state" ? "text-left" : "text-right"}`}>{t(`fa.schedule.${c}`)}{["opening", "depreciation", "accumulated", "closing"].includes(c) ? " (USD)" : ""}</th>)}
                </tr></thead>
                <tbody>
                  {sched.data.data.map((r) => (
                    <tr key={r.period} className="border-t" data-state={r.state}>
                      <td className="px-2 py-1 tabular-nums">{r.period}</td>
                      <td className="px-2 py-1"><AmountText value={r.opening_nbv} currency="USD" /></td>
                      <td className="px-2 py-1"><AmountText value={r.depreciation} currency="USD" /></td>
                      <td className="px-2 py-1"><AmountText value={r.accumulated} currency="USD" /></td>
                      <td className="px-2 py-1"><AmountText value={r.closing_nbv} currency="USD" /></td>
                      <td className="px-2 py-1 text-xs">{r.run_id ? <AppLink href={`/fixed-assets/depreciation-runs/${r.run_id}`} className="text-primary hover:underline">{t(`fa.state.${r.state}`)}</AppLink> : t(`fa.state.${r.state}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="history"><div className="rounded-xl border bg-card p-4"><HistoryPanel events={a.history.map((h) => ({ ...h, action: historyLabel(h.action) }))} /></div></TabsContent>
      </Tabs>

      <ConfirmActionDialog open={dialog === "transfer"} onOpenChange={(o) => !o && setDialog(null)} action="approve" requireReason reasonLabel={t("fa.transfer.reason")} title={t("fa.transfer.title", { tag: a.tag })}
        description={t("fa.transfer.description")} effect={{ currency: "USD", amount: a.cost }} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await assetsApi.transfer(a.id, { ...transfer, reason }, idempotencyKey); update(next); return t("fa.toast.transferred"); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="tr-date" label={t("fa.transfer.date")}><DateInput id="tr-date" value={transfer.date} onValueChange={(date) => setTransfer({ ...transfer, date })} /></FormField>
          <FormField id="tr-branch" label={t("fa.form.branch")}>
            <NativeSelect id="tr-branch" value={transfer.branch_id ?? ""} onChange={(e) => setTransfer({ ...transfer, branch_id: e.target.value || null })}><option value="">—</option>{company?.branches.map((b) => <option key={b.id} value={b.id}>{local(b)}</option>)}</NativeSelect>
          </FormField>
          <FormField id="tr-dept" label={t("fa.col.department")}>
            <NativeSelect id="tr-dept" value={transfer.department_id ?? ""} onChange={(e) => setTransfer({ ...transfer, department_id: e.target.value || null })}><option value="">—</option>{departments?.map((d) => <option key={d.id} value={d.id}>{local(d)}</option>)}</NativeSelect>
          </FormField>
          <FormField id="tr-location" label={t("fa.form.location")}><Input id="tr-location" value={transfer.location} onChange={(e) => setTransfer({ ...transfer, location: e.target.value })} /></FormField>
          <FormField id="tr-custodian" label={t("fa.form.custodian")}><Input id="tr-custodian" value={transfer.custodian} onChange={(e) => setTransfer({ ...transfer, custodian: e.target.value })} /></FormField>
        </div>
      </ConfirmActionDialog>

      <Dialog open={dialog === "dispose"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("fa.dispose.title", { tag: a.tag })}</DialogTitle>
            <DialogDescription>{t("fa.dispose.description")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setDisposeError(null); dispose.mutate(); }} data-testid="dispose-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="dp-date" label={t("fa.dispose.date")} required><DateInput id="dp-date" value={disposal.date} onValueChange={(date) => setDisposal({ ...disposal, date })} /></FormField>
              <FormField id="dp-proceeds" label={`${t("fa.dispose.proceeds")} (USD)`}><AmountInput id="dp-proceeds" currency="USD" value={disposal.proceeds} onValueChange={(proceeds) => setDisposal({ ...disposal, proceeds })} /></FormField>
              {D(disposal.proceeds || "0").gt(0) && (
                <FormField id="dp-account" label={t("fa.dispose.account")} required className="sm:col-span-2">
                  <NativeSelect id="dp-account" value={disposal.account_id} onChange={(e) => setDisposal({ ...disposal, account_id: e.target.value })}>
                    <option value="">{t("arap.form.select")}</option>{accounts.filter((x) => x.currency === "USD").map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
                  </NativeSelect>
                </FormField>
              )}
              <FormField id="dp-reason" label={t("fa.dispose.reason")} required className="sm:col-span-2"><Input id="dp-reason" value={disposal.reason} onChange={(e) => setDisposal({ ...disposal, reason: e.target.value })} /></FormField>
            </div>
            <p className="text-sm" data-testid="disposal-preview">{t(gainLoss.gte(0) ? "fa.dispose.previewGain" : "fa.dispose.previewLoss", { nbv: format.amount(nbv, "USD", { withCode: true }), amount: format.amount(gainLoss.abs(), "USD", { withCode: true }) })}</p>
            <p className="text-xs text-muted-foreground">{t("fa.dispose.approvalNote")}</p>
            {disposeError && <p className="text-sm text-destructive" role="alert">{disposeError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={dispose.isPending} data-testid="dispose-submit">{t("fa.dispose.submit")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)} action="post" title={t("fa.dispose.approveTitle", { tag: a.tag })} effect={effect} thresholdAmount="0"
        onConfirm={async ({ idempotencyKey }) => { const next = await assetsApi.decideDisposal(a.id, "approve", "", idempotencyKey); update(next); return next.disposal?.journal_no ?? undefined; }} />
      <ConfirmActionDialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} action="reject" title={t("fa.dispose.rejectTitle", { tag: a.tag })} reasonLabel={t("common.comment")} effect={effect} thresholdAmount="0"
        onConfirm={async ({ reason, idempotencyKey }) => { const next = await assetsApi.decideDisposal(a.id, "reject", reason, idempotencyKey); update(next); return t(`status.${next.status}`); }} />
    </div>
  );
}
