"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Lock, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ExportMenu, FilterBar, useUrlFilters } from "@/components/data/filters";
import { EmptyState, ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { NativeSelect, useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnsavedChangesGuard } from "@/components/workflow/approval";
import { StatusBadge } from "@/components/workflow/status-badge";
import { accountsApi } from "@/lib/api/endpoints/accounts";
import { downloadExport, reportsApi, type ExportFormat } from "@/lib/api/endpoints/reports";
import type { Account } from "@/lib/api/types/accounts";
import { useCurrentCompany } from "@/lib/auth/session";
import { useAppLocale } from "@/lib/i18n/navigation";
import { Can, usePermission } from "@/lib/rbac/can";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";
import { AccountActions, AccountForm, AccountHistory } from "./account-form";
import { toast } from "sonner";

const FILTERS = ["search", "type", "posting", "active", "control", "view", "account"] as const;
const TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

/** Accounts plus every ancestor, so that a filtered tree keeps its structure. */
function withAncestors(all: Account[], matches: Account[]): Set<string> {
  const byId = new Map(all.map((a) => [a.id, a]));
  const keep = new Set<string>();
  for (const m of matches) {
    let current: Account | undefined = m;
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }
  return keep;
}

/** SCR-03 Chart of Accounts: tree and table views, filters in the URL, and the account drawer. */
export function ChartOfAccountsPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const company = useCurrentCompany();
  const companyId = useUiStore((s) => s.companyId);
  const errorToast = useErrorToast();
  const showBalance = usePermission("rpt.trial_balance");
  const { filters, setFilters, clear, active } = useUrlFilters(FILTERS);
  const view = filters.view === "table" ? "table" : "tree";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const query = useQuery({
    queryKey: ["accounts", companyId, "all", showBalance],
    queryFn: ({ signal }) => accountsApi.list({ limit: 200, include_balance: showBalance }, signal),
  });
  const all = useMemo(() => query.data?.data ?? [], [query.data]);
  const name = (a: Account) => (locale === "km" && a.name_km ? a.name_km : a.name);

  // Filtering is done here: the whole chart is one page (≤ 200 accounts). See docs/DECISIONS.md D-P2-03.
  const matches = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return all.filter((a) =>
      (!term || a.code.startsWith(term) || a.name.toLowerCase().includes(term) || a.name_km.includes(filters.search.trim())) &&
      (!filters.type || a.type === filters.type) &&
      (!filters.posting || String(a.is_posting) === filters.posting) &&
      (!filters.active || String(a.is_active) === filters.active) &&
      (filters.control !== "true" || a.is_control),
    );
  }, [all, filters]);

  const byParent = useMemo(() => {
    const keep = withAncestors(all, matches);
    const map = new Map<string | null, Account[]>();
    for (const a of all.filter((x) => keep.has(x.id))) {
      const parent = a.parent_id && keep.has(a.parent_id) ? a.parent_id : null;
      map.set(parent, [...(map.get(parent) ?? []), a]);
    }
    return map;
  }, [all, matches]);

  const selected = filters.account === "new" ? null : all.find((a) => a.id === filters.account) ?? null;
  const drawerOpen = filters.account === "new" || Boolean(selected);
  const open = (id: string) => setFilters({ account: id });
  const close = () => {
    setDirty(false);
    setFilters({ account: null });
  };

  const exportChart = async (format: ExportFormat) => {
    try {
      const result = await reportsApi.export("chart-of-accounts", format, {});
      if (result.status === "QUEUED") toast.info(t("gl.export.queued"));
      else {
        await downloadExport(result);
        toast.success(t("gl.export.done", { file: result.file_name ?? "" }));
      }
    } catch (error) {
      errorToast(error);
    }
  };

  const head = "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
  const row = (a: Account, depth: number, hasChildren: boolean) => (
    <tr
      key={a.id}
      className={cn("cursor-pointer border-t hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none", !a.is_posting && "bg-muted/20 font-medium")}
      tabIndex={0}
      onClick={() => open(a.id)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open(a.id)}
      data-testid={`account-row-${a.code}`}
      aria-label={`${a.code} ${name(a)}`}
    >
      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
        <span className="inline-flex items-center gap-1" style={view === "tree" ? { paddingLeft: depth * 16 } : undefined}>
          {view === "tree" && hasChildren ? (
            <button
              type="button"
              className="rounded p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-expanded={!collapsed.has(a.id)}
              aria-label={t("gl.accounts.toggle", { code: a.code })}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((c) => {
                  const next = new Set(c);
                  if (next.has(a.id)) next.delete(a.id);
                  else next.add(a.id);
                  return next;
                });
              }}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", !collapsed.has(a.id) && "rotate-90")} aria-hidden />
            </button>
          ) : (
            view === "tree" && <span className="inline-block w-4.5" />
          )}
          {a.code}
        </span>
      </td>
      <td className="px-3 py-1.5">
        <span className="flex items-center gap-1.5">
          {name(a)}
          {a.is_sensitive && <Lock className="size-3 text-muted-foreground" aria-label={t("gl.accounts.sensitive")} />}
          {a.pending_change && <StatusBadge status="PENDING" />}
        </span>
      </td>
      <td className="px-3 py-1.5 whitespace-nowrap">{t(`finance.account.types.${a.type}`)}</td>
      <td className="hidden px-3 py-1.5 lg:table-cell">{a.category}</td>
      <td className="hidden px-3 py-1.5 md:table-cell">{t(`finance.account.${a.normal_balance}`)}</td>
      <td className="px-3 py-1.5">{a.is_posting ? t("common.yesNo.true") : t("gl.accounts.header")}</td>
      <td className="hidden px-3 py-1.5 md:table-cell">{a.is_control ? t(`gl.accounts.controlModule.${a.control_module}`) : "—"}</td>
      <td className="px-3 py-1.5"><StatusBadge status={a.is_active ? "ACTIVE" : "INACTIVE"} /></td>
      {showBalance && <td className="px-3 py-1.5"><AmountText value={a.balance ?? "0"} currency={company?.base_currency ?? "USD"} /></td>}
    </tr>
  );

  const treeRows = (parent: string | null, depth: number): React.ReactNode[] =>
    (byParent.get(parent) ?? []).flatMap((a) => {
      const kids = byParent.get(a.id) ?? [];
      return [row(a, depth, kids.length > 0), ...(collapsed.has(a.id) ? [] : treeRows(a.id, depth + 1))];
    });

  const headers = all.filter((a) => !a.is_posting).map((a) => a.id);

  return (
    <div className="min-w-0">
      <UnsavedChangesGuard dirty={dirty} />
      <PageHeader
        title={t("gl.accounts.title")}
        description={t("gl.accounts.description")}
        actions={
          <>
            <ExportMenu formats={["xlsx", "pdf", "csv"]} onExport={exportChart} />
            <Can permission="coa.create">
              <Button size="sm" onClick={() => open("new")} data-testid="new-account">
                <Plus aria-hidden />
                {t("gl.accounts.new")}
              </Button>
            </Can>
          </>
        }
      />
      <FilterBar
        search={filters.search}
        onSearch={(search) => setFilters({ search })}
        searchPlaceholder={t("gl.accounts.searchPlaceholder")}
        onClear={() => clear()}
        canClear={active && Boolean(filters.search || filters.type || filters.posting || filters.active || filters.control)}
        actions={
          <div className="flex items-center gap-1" role="group" aria-label={t("gl.accounts.view.label")}>
            {(["tree", "table"] as const).map((v) => (
              <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} aria-pressed={view === v} onClick={() => setFilters({ view: v === "tree" ? null : v })}>
                {t(`gl.accounts.view.${v}`)}
              </Button>
            ))}
          </div>
        }
      >
        <NativeSelect className="w-auto" aria-label={t("gl.accounts.filters.type")} value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="">{t("gl.accounts.filters.type")}: {t("common.all")}</option>
          {TYPES.map((x) => <option key={x} value={x}>{t(`finance.account.types.${x}`)}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto" aria-label={t("gl.accounts.filters.posting")} value={filters.posting} onChange={(e) => setFilters({ posting: e.target.value })}>
          <option value="">{t("gl.accounts.filters.posting")}: {t("common.all")}</option>
          <option value="true">{t("gl.accounts.filters.postingOnly")}</option>
          <option value="false">{t("gl.accounts.filters.headerOnly")}</option>
        </NativeSelect>
        <NativeSelect className="w-auto" aria-label={t("gl.accounts.filters.status")} value={filters.active} onChange={(e) => setFilters({ active: e.target.value })}>
          <option value="">{t("gl.accounts.filters.status")}: {t("common.all")}</option>
          <option value="true">{t("status.ACTIVE")}</option>
          <option value="false">{t("status.INACTIVE")}</option>
        </NativeSelect>
        <label className="flex h-8 items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={filters.control === "true"} onChange={(e) => setFilters({ control: e.target.checked ? "true" : null })} />
          {t("gl.accounts.filters.control")}
        </label>
      </FilterBar>

      {view === "tree" && all.length > 0 && (
        <div className="mb-2 flex gap-2" data-print="hide">
          <Button size="xs" variant="ghost" onClick={() => setCollapsed(new Set())}>{t("gl.accounts.expandAll")}</Button>
          <Button size="xs" variant="ghost" onClick={() => setCollapsed(new Set(headers))}>{t("gl.accounts.collapseAll")}</Button>
        </div>
      )}

      <div className="relative overflow-x-auto rounded-lg border bg-card">
        {query.isPending ? (
          <TableSkeleton columns={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : all.length === 0 ? (
          <EmptyState title={t("gl.accounts.empty")} action={<Can permission="coa.create"><Button size="sm" onClick={() => open("new")}>{t("gl.accounts.new")}</Button></Can>} />
        ) : matches.length === 0 ? (
          <EmptyState title={t("gl.accounts.noMatch")} />
        ) : (
          <table className="w-full min-w-[44rem] border-collapse text-sm" data-testid="coa-table">
            <caption className="sr-only">{t("gl.accounts.title")}</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className={head}>{t("gl.accounts.col.code")}</th>
                <th scope="col" className={head}>{t("gl.accounts.col.name")}</th>
                <th scope="col" className={head}>{t("gl.accounts.col.type")}</th>
                <th scope="col" className={cn(head, "hidden lg:table-cell")}>{t("gl.accounts.col.category")}</th>
                <th scope="col" className={cn(head, "hidden md:table-cell")}>{t("gl.accounts.col.normal")}</th>
                <th scope="col" className={head}>{t("gl.accounts.col.posting")}</th>
                <th scope="col" className={cn(head, "hidden md:table-cell")}>{t("gl.accounts.col.control")}</th>
                <th scope="col" className={head}>{t("gl.accounts.col.active")}</th>
                {showBalance && <th scope="col" className={cn(head, "text-right")}>{t("gl.accounts.col.balance", { currency: company?.base_currency ?? "USD" })}</th>}
              </tr>
            </thead>
            <tbody>{view === "tree" ? treeRows(null, 0) : matches.map((a) => row(a, 0, false))}</tbody>
          </table>
        )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl" data-testid="account-drawer">
          <SheetHeader className="border-b">
            <SheetTitle>{selected ? t("gl.accounts.form.editTitle", { code: selected.code }) : t("gl.accounts.form.createTitle")}</SheetTitle>
            <SheetDescription>{selected ? name(selected) : t("gl.accounts.description")}</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            {selected ? (
              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">{t("gl.accounts.tabs.details")}</TabsTrigger>
                  <TabsTrigger value="history">{t("gl.accounts.tabs.history")}</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="space-y-4">
                  <AccountActions account={selected} onChanged={() => undefined} onDeleted={close} />
                  <AccountForm key={`${selected.id}-${selected.version}`} account={selected} accounts={all} onSaved={() => setDirty(false)} onDirtyChange={setDirty} />
                </TabsContent>
                <TabsContent value="history">
                  <AccountHistory accountId={selected.id} />
                </TabsContent>
              </Tabs>
            ) : (
              <AccountForm account={null} accounts={all} onSaved={(a) => { setDirty(false); open(a.id); }} onDirtyChange={setDirty} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
