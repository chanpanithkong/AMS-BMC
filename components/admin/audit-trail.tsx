"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, ShieldCheck, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, useUrlFilters } from "@/components/data/filters";
import { EmptyState } from "@/components/feedback/states";
import { NativeSelect, useErrorToast } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/feedback/states";
import { adminApi, auditApi } from "@/lib/api/endpoints/admin";
import { useFormatters } from "@/lib/api/hooks";
import type { AuditEvent, AuditListParams } from "@/lib/api/types/admin";
import { Can, usePermission } from "@/lib/rbac/can";
import { useCurrentCompany } from "@/lib/auth/session";
import { useAppLocale } from "@/lib/i18n/navigation";
import { useUiStore } from "@/lib/stores/ui";

const ENTITY_TYPES = ["auth", "users", "roles", "settings", "journal-entries", "periods", "accounts", "customer-invoices", "supplier-invoices", "supplier-payments", "receipts", "expenses", "reconciliations", "fixed-assets", "budgets", "reports", "audit-logs", "imports"];

/** SCR-18 audit trail: filters, results, detail with before/after values, chain check and export. */
export function AuditTrailPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const errorToast = useErrorToast();
  const companyId = useUiStore((s) => s.companyId);
  const company = useCurrentCompany();
  const canUsers = usePermission("users.view");
  const { filters, setFilters, clear } = useUrlFilters(["date_from", "date_to", "user_id", "entity_type", "outcome", "search"] as const);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const integrity = useQuery({ queryKey: ["audit-integrity", companyId], queryFn: ({ signal }) => auditApi.integrity(signal) });
  const users = useQuery({ queryKey: ["users", "all"], queryFn: ({ signal }) => adminApi.users({ limit: 200 }, signal), enabled: canUsers });
  const params: AuditListParams = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as AuditListParams;
  const branchName = (id: string | null) => { const b = company?.branches.find((x) => x.id === id); return b ? (locale === "km" ? b.name_km : b.name) : (id ?? "—"); };

  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await auditApi.export(params);
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "audit-trail.csv";
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      errorToast(e);
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnDef<AuditEvent, unknown>[] = [
    { id: "at", header: t("audit.col.time"), cell: ({ row }) => <span className="tabular-nums whitespace-nowrap">{format.dateTime(row.original.at)}</span> },
    { id: "user", header: t("audit.col.user"), cell: ({ row }) => row.original.user_name },
    { id: "event", header: t("audit.col.event"), cell: ({ row }) => <span className="font-mono text-xs">{row.original.event_type}</span> },
    { id: "entity", header: t("audit.col.entity"), cell: ({ row }) => row.original.entity_type },
    { id: "entity_id", header: t("audit.col.entityId"), cell: ({ row }) => <span className="font-mono text-xs">{row.original.entity_id ?? "—"}</span> },
    { id: "company", header: t("audit.col.company"), cell: ({ row }) => (row.original.company_id ? company?.code ?? row.original.company_id : "—") },
    { id: "branch", header: t("audit.col.branch"), cell: ({ row }) => branchName(row.original.branch_id) },
    { id: "ip", header: t("audit.col.ip"), cell: ({ row }) => <span className="font-mono text-xs">{row.original.ip}</span> },
    { id: "reason", header: t("audit.col.reason"), cell: ({ row }) => <span className="block max-w-56 truncate">{row.original.reason ?? "—"}</span> },
    { id: "outcome", header: t("audit.col.outcome"), cell: ({ row }) => <span className={row.original.outcome === "SUCCESS" ? "" : "font-medium text-destructive"}>{t(`audit.outcome.${row.original.outcome}`)}</span> },
  ];

  return (
    <div className="min-w-0">
      <PageHeader title={t("audit.title")} description={t("audit.description")}
        actions={<Can permission="aud.export"><Button size="sm" variant="outline" onClick={doExport} disabled={exporting} data-testid="audit-export"><Download aria-hidden />{t("audit.export")}</Button></Can>} />
      {integrity.data && (
        <p className={`mb-3 flex items-center gap-2 rounded-lg border p-3 text-sm ${integrity.data.ok ? "border-success/30 bg-success/5" : "border-destructive/40 bg-destructive/5 text-destructive"}`} role="status" data-testid="audit-integrity" data-ok={integrity.data.ok}>
          {integrity.data.ok ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldX className="size-4" aria-hidden />}
          {integrity.data.ok ? t("audit.integrityOk", { count: integrity.data.events, at: format.dateTime(integrity.data.checked_at) }) : t("audit.integrityBroken", { sequence: integrity.data.broken_at ?? 0 })}
        </p>
      )}
      <FilterBar search={filters.search} onSearch={(search) => setFilters({ search })} searchPlaceholder={t("audit.search")} onClear={() => clear()} canClear={Object.values(filters).some(Boolean)}>
        <label className="flex items-center gap-1 text-sm"><span className="text-muted-foreground">{t("common.from")}</span><Input type="date" className="w-auto" value={filters.date_from} onChange={(e) => setFilters({ date_from: e.target.value })} aria-label={t("audit.dateFrom")} /></label>
        <label className="flex items-center gap-1 text-sm"><span className="text-muted-foreground">{t("common.to")}</span><Input type="date" className="w-auto" value={filters.date_to} onChange={(e) => setFilters({ date_to: e.target.value })} aria-label={t("audit.dateTo")} /></label>
        {canUsers && (
          <NativeSelect className="w-auto" aria-label={t("audit.col.user")} value={filters.user_id} onChange={(e) => setFilters({ user_id: e.target.value })} data-testid="audit-user">
            <option value="">{t("audit.allUsers")}</option>
            {users.data?.data.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </NativeSelect>
        )}
        <NativeSelect className="w-auto" aria-label={t("audit.col.entity")} value={filters.entity_type} onChange={(e) => setFilters({ entity_type: e.target.value })} data-testid="audit-entity">
          <option value="">{t("audit.allEntities")}</option>
          {ENTITY_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
        </NativeSelect>
        <NativeSelect className="w-auto" aria-label={t("audit.col.outcome")} value={filters.outcome} onChange={(e) => setFilters({ outcome: e.target.value })} data-testid="audit-outcome">
          <option value="">{t("audit.allOutcomes")}</option>
          {(["SUCCESS", "DENIED", "FAILED"] as const).map((o) => <option key={o} value={o}>{t(`audit.outcome.${o}`)}</option>)}
        </NativeSelect>
      </FilterBar>
      <DataTable<AuditEvent>
        tableId="audit" caption={t("audit.title")} columns={columns}
        queryKey={["audit", companyId, params]}
        fetchPage={({ cursor, limit }, signal) => auditApi.list({ ...params, cursor, limit }, signal)}
        getRowId={(r) => r.id} onRowClick={setSelected}
        empty={<EmptyState title={t("data.table.noResults")} />}
      />
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl" data-testid="audit-detail">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.event_type}</SheetTitle>
                <SheetDescription>{t("audit.sequence", { sequence: selected.sequence })} · {format.dateTime(selected.at)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  {([
                    [t("audit.col.user"), selected.user_name], [t("audit.col.entity"), selected.entity_type], [t("audit.col.entityId"), selected.entity_id ?? "—"],
                    [t("audit.col.branch"), branchName(selected.branch_id)], [t("audit.col.ip"), selected.ip], [t("audit.device"), selected.user_agent],
                    [t("audit.correlation"), selected.correlation_id], [t("audit.col.reason"), selected.reason ?? "—"], [t("audit.col.outcome"), t(`audit.outcome.${selected.outcome}`)],
                  ] as [string, string][]).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></div>)}
                </dl>
                <section aria-labelledby="audit-changes">
                  <h3 id="audit-changes" className="mb-1 font-semibold">{t("audit.changes")}</h3>
                  {selected.changes.length === 0 ? <p className="text-muted-foreground">{t("audit.noChanges")}</p> : (
                    <div className="overflow-x-auto rounded border">
                      <table className="w-full text-xs" data-testid="audit-diff">
                        <caption className="sr-only">{t("audit.changes")}</caption>
                        <thead className="bg-muted/50 text-left"><tr><th scope="col" className="px-2 py-1">{t("audit.field")}</th><th scope="col" className="px-2 py-1">{t("audit.before")}</th><th scope="col" className="px-2 py-1">{t("audit.after")}</th></tr></thead>
                        <tbody>
                          {selected.changes.map((c) => (
                            <tr key={c.field} className="border-t align-top">
                              <th scope="row" className="px-2 py-1 text-left font-mono font-normal">{c.field}</th>
                              <td className="px-2 py-1 break-all"><span className={c.before !== c.after ? "bg-destructive/10" : ""}>{c.before ?? "—"}</span></td>
                              <td className="px-2 py-1 break-all"><span className={c.before !== c.after ? "bg-success/10" : ""}>{c.after ?? "—"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <p className="break-all font-mono text-[11px] text-muted-foreground">{t("audit.hash")}: {selected.hash}<br />{t("audit.previousHash")}: {selected.previous_hash}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
