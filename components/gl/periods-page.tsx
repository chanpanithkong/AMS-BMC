"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed, Lock, LockOpen, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useUrlFilters } from "@/components/data/filters";
import { ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { NativeSelect, useErrorToast } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HistoryPanel } from "@/components/workflow/approval";
import { ConfirmActionDialog, type CriticalAction } from "@/components/workflow/confirm-action-dialog";
import { StatusBadge } from "@/components/workflow/status-badge";
import { periodsApi } from "@/lib/api/endpoints/periods";
import { useFiscalYears, useFormatters } from "@/lib/api/hooks";
import type { AccountingPeriod, FiscalYear } from "@/lib/api/types/org";
import type { ChecklistItem } from "@/lib/api/types/reports";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { todayBusinessDate } from "@/lib/format/dates";
import { useAppLocale } from "@/lib/i18n/navigation";
import { usePermission } from "@/lib/rbac/can";
import { cn } from "@/lib/utils";

type PeriodAction = "softClose" | "open" | "close" | "requestReopen" | "approveReopen" | "rejectReopen" | "yearEnd";

const DIALOG_ACTION: Record<PeriodAction, CriticalAction> = {
  softClose: "closePeriod", open: "reopenPeriod", close: "closePeriod", requestReopen: "reopenPeriod",
  approveReopen: "approve", rejectReopen: "reject", yearEnd: "yearEndClose",
};

/** SCR-17 Accounting period closure (WF-12, WF-13, BR-CLS-001..004). */
export function PeriodsPage() {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const company = useCurrentCompany();
  const userId = useSession((s) => s.user?.id);
  const years = useFiscalYears();
  const { filters, setFilters } = useUrlFilters(["year", "period"] as const);
  const can = {
    manage: usePermission("cls.period.manage"),
    request: usePermission("cls.period.reopen.request"),
    approve: usePermission("cls.period.reopen.approve"),
    yearEnd: usePermission("cls.year.close"),
  };
  const [pending, setPending] = useState<{ action: PeriodAction; period?: AccountingPeriod } | null>(null);

  const year: FiscalYear | undefined = years.data?.find((y) => y.id === filters.year) ?? years.data?.[0];
  const today = todayBusinessDate();
  const selected = year?.periods.find((p) => p.id === filters.period) ?? year?.periods.find((p) => p.start_date <= today && today <= p.end_date) ?? year?.periods[0];
  const name = (p: AccountingPeriod) => (locale === "km" ? p.name_km : p.name);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
    void queryClient.invalidateQueries({ queryKey: ["checklist"] });
    void queryClient.invalidateQueries({ queryKey: ["period-history"] });
  };

  const actionsFor = (p: AccountingPeriod): PeriodAction[] => {
    const out: PeriodAction[] = [];
    if (p.status === "OPEN" && can.manage) out.push("softClose");
    if (p.status === "SOFT_CLOSED" && can.manage) out.push("open", "close");
    if (p.status === "REOPENED" && can.manage) out.push("close");
    const request = p.reopen_request;
    if (p.status === "CLOSED" && can.request && request?.status !== "PENDING") out.push("requestReopen");
    if (p.status === "CLOSED" && can.approve && request?.status === "PENDING" && request.requested_by_id !== userId) out.push("approveReopen", "rejectReopen");
    return out;
  };

  const run = async (action: PeriodAction, period: AccountingPeriod | undefined, reason: string, key: string): Promise<string> => {
    let result: string;
    if (action === "yearEnd") {
      const r = await periodsApi.closeYear(year!.id, key);
      result = t("gl.periods.toast.yearClosed", { year: year!.name, number: r.closing_journal.journal_no ?? "" });
    } else {
      const id = period!.id;
      const label = name(period!);
      switch (action) {
        case "softClose":
          await periodsApi.softClose(id, key);
          result = t("gl.periods.toast.softClosed", { period: label });
          break;
        case "open":
          await periodsApi.open(id, key);
          result = t("gl.periods.toast.opened", { period: label });
          break;
        case "close":
          await periodsApi.close(id, key);
          result = t("gl.periods.toast.closed", { period: label });
          break;
        case "requestReopen":
          await periodsApi.requestReopen(id, reason, key);
          result = t("gl.periods.toast.requested");
          break;
        case "approveReopen":
          await periodsApi.decideReopen(id, "approve", reason, key);
          result = t("gl.periods.toast.reopened", { period: label });
          break;
        default:
          await periodsApi.decideReopen(id, "reject", reason, key);
          result = t("gl.periods.toast.reopenRejected");
      }
    }
    refresh();
    return result;
  };

  const confirmText = (action: PeriodAction, p?: AccountingPeriod) => {
    const period = p ? name(p) : "";
    const map: Record<PeriodAction, string> = {
      softClose: t("gl.periods.confirm.softClose", { period }),
      open: t("gl.periods.confirm.open", { period }),
      close: t("gl.periods.confirm.close", { period }),
      requestReopen: t("gl.periods.confirm.reopen", { period }),
      approveReopen: t("gl.periods.confirm.approveReopen", { period, name: p?.reopen_request?.requested_by_name ?? "", reason: p?.reopen_request?.reason ?? "" }),
      rejectReopen: t("gl.periods.confirm.approveReopen", { period, name: p?.reopen_request?.requested_by_name ?? "", reason: p?.reopen_request?.reason ?? "" }),
      yearEnd: t("gl.periods.confirm.yearEnd", { year: year?.name ?? "" }),
    };
    return map[action];
  };

  const allClosed = year?.periods.every((p) => p.status === "CLOSED");

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title={t("gl.periods.title")}
        description={t("gl.periods.description")}
        actions={
          <>
            {years.data && years.data.length > 1 && (
              <NativeSelect className="w-40" aria-label={t("gl.periods.year")} value={year?.id} onChange={(e) => setFilters({ year: e.target.value, period: null })}>
                {years.data.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </NativeSelect>
            )}
            {can.yearEnd && year?.status === "OPEN" && (
              <Button size="sm" variant="outline" disabled={!allClosed} title={allClosed ? undefined : t("gl.periods.yearEndBlocked")} onClick={() => setPending({ action: "yearEnd" })} data-testid="year-end">
                {t("gl.periods.actions.yearEnd")}
              </Button>
            )}
          </>
        }
      />
      {year?.status === "CLOSED" && <p className="rounded-lg border bg-muted/40 p-3 text-sm">{t("gl.periods.yearClosed", { year: year.name })}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="relative overflow-x-auto rounded-lg border bg-card">
          {years.isPending ? (
            <TableSkeleton columns={4} rows={12} />
          ) : years.isError ? (
            <ErrorState error={years.error} onRetry={() => years.refetch()} />
          ) : (
            <table className="w-full min-w-[34rem] border-collapse text-sm" data-testid="periods-table">
              <caption className="sr-only">{t("gl.periods.title")} {year?.name}</caption>
              <thead className="bg-muted/50">
                <tr>
                  {["period", "dates", "status", "actions"].map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t(`gl.periods.col.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {year?.periods.map((p) => (
                  <tr key={p.id} className={cn("border-t", p.id === selected?.id && "bg-primary/5")} data-testid={`period-${p.code}`}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        aria-current={p.id === selected?.id ? "true" : undefined}
                        aria-label={t("gl.periods.select", { period: name(p) })}
                        onClick={() => setFilters({ period: p.id })}
                      >
                        {p.status === "CLOSED" ? <Lock className="size-3.5 text-muted-foreground" aria-hidden /> : p.status === "REOPENED" ? <LockOpen className="size-3.5 text-warning" aria-hidden /> : null}
                        {name(p)}
                      </button>
                      {p.reopen_request?.status === "PENDING" && <StatusBadge status="PENDING" className="mt-1" />}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{format.date(p.start_date)} – {format.date(p.end_date)}</td>
                    <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {actionsFor(p).map((action) => (
                          <Button
                            key={action}
                            size="xs"
                            variant={action === "rejectReopen" ? "destructive" : action === "close" || action === "approveReopen" ? "default" : "outline"}
                            onClick={() => setPending({ action, period: p })}
                            data-testid={`period-${p.code}-${action}`}
                          >
                            {t(`gl.periods.actions.${action}`)}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selected && <PeriodPanel period={selected} canManage={can.manage} />}
      </div>

      {pending && (
        <ConfirmActionDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          action={DIALOG_ACTION[pending.action]}
          title={pending.action === "yearEnd" ? `${t("gl.periods.actions.yearEnd")} · ${year?.name}` : `${t(`gl.periods.actions.${pending.action}`)} · ${pending.period ? name(pending.period) : ""}`}
          description={confirmText(pending.action, pending.period)}
          requireReason={pending.action === "requestReopen" || pending.action === "rejectReopen"}
          reasonLabel={pending.action === "rejectReopen" ? t("common.comment") : undefined}
          effect={{
            company: company ? (locale === "km" ? company.name_km : company.name) : undefined,
            period: pending.period ? name(pending.period) : year?.name,
            date: pending.period ? `${format.date(pending.period.start_date)} – ${format.date(pending.period.end_date)}` : undefined,
            currency: company?.base_currency ?? "USD",
          }}
          thresholdAmount="0"
          onConfirm={({ reason, idempotencyKey }) => run(pending.action, pending.period, reason, idempotencyKey)}
        />
      )}
    </div>
  );
}

const CHECK_ICON = { PASS: CheckCircle2, FAIL: XCircle, NOT_AVAILABLE: CircleDashed } as const;

function PeriodPanel({ period, canManage }: { period: AccountingPeriod; canManage: boolean }) {
  const t = useTranslations();
  const locale = useAppLocale();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const name = locale === "km" ? period.name_km : period.name;
  const checklist = useQuery({ queryKey: ["checklist", period.id, period.status], queryFn: () => periodsApi.checklist(period.id) });
  const history = useQuery({ queryKey: ["period-history", period.id, period.status], queryFn: () => periodsApi.history(period.id) });
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const tick = useMutation({
    mutationFn: ({ item, done }: { item: ChecklistItem; done: boolean }) => periodsApi.tick(period.id, item.id, done, evidence[item.id]),
    onSuccess: (data) => {
      queryClient.setQueryData(["checklist", period.id, period.status], data);
      void queryClient.invalidateQueries({ queryKey: ["period-history", period.id] });
    },
    onError: errorToast,
  });
  const request = period.reopen_request;
  const text = (i: ChecklistItem) => (locale === "km" ? i.task_km : i.task);
  const editable = canManage && period.status !== "CLOSED";

  return (
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4" aria-labelledby="checklist-title" data-testid="period-panel">
      <h2 id="checklist-title" className="font-semibold">{t("gl.periods.checklist.title", { period: name })}</h2>
      {request?.status === "PENDING" && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-sm" role="status" data-testid="reopen-banner">
          {t("gl.periods.reopenBanner", { name: request.requested_by_name, date: format.dateTime(request.requested_at), reason: request.reason })}
        </p>
      )}
      {period.status === "REOPENED" && <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-sm" role="status">{t("gl.periods.reopenedBanner", { period: name })}</p>}
      {checklist.isPending ? (
        <TableSkeleton columns={4} rows={6} />
      ) : checklist.isError ? (
        <ErrorState compact error={checklist.error} onRetry={() => checklist.refetch()} />
      ) : (
        <>
          {checklist.data.blocking.length > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" role="status" data-testid="blocking-items">
              <p className="flex items-center gap-1.5 font-medium text-destructive"><AlertTriangle className="size-4" aria-hidden />{t("gl.periods.checklist.blockingTitle")}</p>
              <ul className="mt-1 list-disc pl-6">
                {checklist.data.blocking.map((b) => <li key={b.message}>{locale === "km" ? b.message_km : b.message}</li>)}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden />{t("gl.periods.checklist.noBlocking")}</p>
          )}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="sr-only">{t("gl.periods.checklist.title", { period: name })}</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  {["task", "owner", "status", "check", "evidence"].map((c) => <th key={c} scope="col" className="px-2 py-1.5 font-medium">{t(`gl.periods.checklist.${c}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {checklist.data.items.map((item) => {
                  const Icon = item.auto_check ? CHECK_ICON[item.auto_check.result] : null;
                  return (
                    <tr key={item.id} className="border-t align-top" data-testid={`check-${item.id}`}>
                      <td className="px-2 py-1.5">
                        {text(item)}
                        {item.blocking && <span className="ml-1.5 rounded border border-destructive/30 px-1 text-[11px] text-destructive">{t("gl.periods.checklist.blocking")}</span>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{t(`roles.${item.owner_role}`)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={cn("inline-flex items-center gap-1", item.status === "DONE" ? "text-success" : "text-muted-foreground")}>
                          {item.status === "DONE" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
                          {t(`gl.periods.checklist.${item.status}`)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        {item.auto_check && Icon && (
                          <span className={cn("inline-flex items-start gap-1", item.auto_check.result === "FAIL" ? "text-destructive" : item.auto_check.result === "PASS" ? "text-success" : "text-muted-foreground")}>
                            <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <span><span className="sr-only">{t(`gl.periods.checklist.${item.auto_check.result}`)}: </span>{locale === "km" ? item.auto_check.message_km : item.auto_check.message}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {item.manual ? (
                          item.status === "DONE" ? (
                            <div className="space-y-1">
                              {item.evidence && <p>{item.evidence}</p>}
                              {item.completed_by && <p className="text-xs text-muted-foreground">{t("gl.periods.checklist.by", { name: item.completed_by })}</p>}
                              {editable && <Button size="xs" variant="ghost" onClick={() => tick.mutate({ item, done: false })} disabled={tick.isPending}>{t("gl.periods.checklist.markUndone")}</Button>}
                            </div>
                          ) : editable ? (
                            <div className="flex min-w-48 gap-1">
                              <Input
                                className="h-7"
                                value={evidence[item.id] ?? ""}
                                onChange={(e) => setEvidence((x) => ({ ...x, [item.id]: e.target.value }))}
                                placeholder={t("gl.periods.checklist.evidencePlaceholder")}
                                aria-label={`${t("gl.periods.checklist.evidence")}: ${text(item)}`}
                              />
                              <Button size="xs" onClick={() => tick.mutate({ item, done: true })} disabled={tick.isPending} data-testid={`tick-${item.id}`}>{t("gl.periods.checklist.markDone")}</Button>
                            </div>
                          ) : (
                            "—"
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="border-t pt-3">
        <HistoryPanel events={(history.data?.data ?? []).map((e) => ({ ...e, action: t.has(`gl.periods.history.${e.action}`) ? t(`gl.periods.history.${e.action}`) : e.action }))} />
      </div>
    </section>
  );
}
