"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2, Lock, Sparkles, Unlink, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useUrlFilters } from "@/components/data/filters";
import { ErrorState, PageHeader, TableSkeleton } from "@/components/feedback/states";
import { useErrorToast } from "@/components/forms/field";
import { AmountText } from "@/components/finance/amount";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HistoryPanel } from "@/components/workflow/approval";
import { StatusBadge } from "@/components/workflow/status-badge";
import { cashBankApi } from "@/lib/api/endpoints/cashbank";
import { useFormatters } from "@/lib/api/hooks";
import type { BookLine, Reconciliation, StatementLine } from "@/lib/api/types/cashbank";
import { AppLink } from "@/lib/i18n/navigation";
import { D } from "@/lib/money/decimal";
import { total } from "@/lib/money/split";
import { usePermission } from "@/lib/rbac/can";
import { cn } from "@/lib/utils";
import { AdjustDialog, CompleteDialog } from "./reconciliation-dialogs";
import { useHistoryLabel } from "./use-cash-bank";

type Show = "unmatched" | "matched" | "all";

/** SCR-13 bank reconciliation: two-pane matching, adjustments, summary, completion (WF-08). */
export function ReconciliationPage({ id }: { id: string }) {
  const query = useQuery({ queryKey: ["reconciliation", id], queryFn: ({ signal }) => cashBankApi.reconciliation(id, signal) });
  if (query.isPending) return <TableSkeleton columns={6} rows={10} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <ReconciliationView rec={query.data} />;
}

function ReconciliationView({ rec }: { rec: Reconciliation }) {
  const t = useTranslations();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const historyLabel = useHistoryLabel();
  const { filters, setFilters } = useUrlFilters(["show"] as const);
  const show: Show = filters.show === "matched" || filters.show === "all" ? filters.show : "unmatched";
  const canWork = usePermission("cb.reconcile") && rec.status === "IN_PROGRESS";
  const canComplete = usePermission("cb.reconcile.complete");
  const canReopen = usePermission("cb.reconcile.reopen");
  const [selS, setSelS] = useState<string[]>([]);
  const [selB, setSelB] = useState<string[]>([]);
  const [adjusting, setAdjusting] = useState<StatementLine | null>(null);
  const [dialog, setDialog] = useState<"complete" | "reopen" | null>(null);
  const locked = rec.status === "COMPLETED";
  const cur = rec.currency;
  const s = rec.summary;

  const apply = (next: Reconciliation) => {
    queryClient.setQueryData(["reconciliation", next.id], next);
    void queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    setSelS([]);
    setSelB([]);
  };
  const action = useMutation({
    mutationFn: (a: { kind: "auto" } | { kind: "match" } | { kind: "unmatch"; matchId: string }) =>
      a.kind === "auto" ? cashBankApi.autoMatch(rec.id)
        : a.kind === "match" ? cashBankApi.match(rec.id, { add: [{ statement_line_ids: selS, book_line_ids: selB }] })
          : cashBankApi.match(rec.id, { remove: [a.matchId] }),
    onSuccess: (next, a) => {
      if (a.kind === "auto") {
        const added = next.matches.length - rec.matches.length;
        toast.success(added > 0 ? t("cb.rec.toast.autoMatched", { count: added }) : t("cb.rec.toast.nothing"));
      } else toast.success(t(a.kind === "match" ? "cb.rec.toast.matched" : "cb.rec.toast.unmatched"));
      apply(next);
    },
    onError: errorToast,
  });

  const suggestedS = new Set(rec.suggestions.flatMap((x) => x.statement_line_ids));
  const suggestedB = new Set(rec.suggestions.flatMap((x) => x.book_line_ids));
  const visible = <T extends { match_id: string | null }>(rows: T[]) =>
    rows.filter((r) => show === "all" || (show === "matched" ? r.match_id : !r.match_id));
  const sumS = total(rec.statement_lines.filter((x) => selS.includes(x.id)).map((x) => x.amount));
  const sumB = total(rec.book_lines.filter((x) => selB.includes(x.id)).map((x) => x.amount));
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const singleStatement = selS.length === 1 && selB.length === 0 ? rec.statement_lines.find((x) => x.id === selS[0]) : undefined;
  const differenceZero = D(s.difference).isZero();
  const head = "px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";

  const pane = <T extends StatementLine | BookLine>(kind: "statement" | "book", rows: T[], sel: string[], setSel: (v: string[]) => void, suggested: Set<string>) => (
    <section className="min-w-0 space-y-2" aria-labelledby={`pane-${kind}`}>
      <h2 id={`pane-${kind}`} className="font-semibold">{kind === "statement" ? t("cb.rec.statement") : t("cb.rec.book")} <span className="font-normal text-muted-foreground">({rows.length})</span></h2>
      <div className="relative max-h-[28rem] overflow-auto rounded-lg border bg-card">
        <table className="w-full min-w-[30rem] border-collapse text-sm" data-testid={`pane-${kind}`}>
          <caption className="sr-only">{kind === "statement" ? t("cb.rec.statement") : t("cb.rec.book")}</caption>
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th scope="col" className="w-8 px-2"><span className="sr-only">{t("common.selectAll")}</span></th>
              <th scope="col" className={head}>{t("cb.rec.line.date")}</th>
              <th scope="col" className={head}>{kind === "statement" ? t("cb.rec.line.reference") : t("cb.rec.line.journal")}</th>
              <th scope="col" className={head}>{t("cb.rec.line.description")}</th>
              <th scope="col" className={`${head} text-right`}>{t("cb.rec.line.amount")} ({cur})</th>
              <th scope="col" className={head}>{t("cb.rec.line.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-muted-foreground">{t("cb.rec.noLines")}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-t", sel.includes(r.id) && "bg-primary/5")} data-testid={`${kind}-line`} data-matched={Boolean(r.match_id)}>
                <td className="px-2 py-1.5">
                  {!r.match_id && canWork && (
                    <Checkbox checked={sel.includes(r.id)} onCheckedChange={() => toggle(sel, setSel, r.id)} aria-label={t("cb.rec.line.select", { description: r.description })} />
                  )}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{format.date(r.date)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {"journal_id" in r ? <AppLink href={`/accounting/journals/${r.journal_id}`} className="text-primary hover:underline">{r.journal_no}</AppLink> : r.reference}
                </td>
                <td className="px-2 py-1.5">{r.description}</td>
                <td className="px-2 py-1.5"><AmountText value={r.amount} currency={cur} /></td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {r.match_id ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Link2 className="size-3.5" aria-hidden />{t("cb.rec.matched")}
                      {canWork && (
                        <Button size="icon-xs" variant="ghost" onClick={() => action.mutate({ kind: "unmatch", matchId: r.match_id! })} aria-label={`${t("cb.rec.actions.unmatch")}: ${r.description}`}>
                          <Unlink aria-hidden />
                        </Button>
                      )}
                    </span>
                  ) : suggested.has(r.id) ? (
                    <span className="inline-flex items-center gap-1 text-info"><Sparkles className="size-3.5" aria-hidden />{t("cb.rec.suggested")}</span>
                  ) : (
                    <span className="text-muted-foreground">{t("cb.rec.unmatchedState")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const row = (label: string, value: string, opts: { strong?: boolean; testId?: string } = {}) => (
    <div className={cn("flex justify-between gap-3 py-1", opts.strong && "border-t font-semibold")} data-testid={opts.testId}>
      <dt>{label}</dt>
      <dd><AmountText value={value} currency={cur} /></dd>
    </div>
  );

  return (
    <div className="min-w-0 space-y-4" data-testid="reconciliation" data-status={rec.status}>
      <PageHeader
        title={t("cb.rec.pageTitle", { account: rec.bank_account_name, date: format.date(rec.statement_date) })}
        badge={<StatusBadge status={rec.status} />}
        description={`${t("cb.rec.summary.statementOpening")}: ${format.amount(s.statement_opening, cur, { withCode: true })} · ${t("cb.rec.summary.statementClosing")}: ${format.amount(s.statement_closing, cur, { withCode: true })}`}
        actions={
          <>
            {canWork && <Button size="sm" variant="outline" onClick={() => action.mutate({ kind: "auto" })} disabled={action.isPending} data-testid="auto-match"><Wand2 aria-hidden />{t("cb.rec.actions.autoMatch")}</Button>}
            {!locked && canComplete && <Button size="sm" onClick={() => setDialog("complete")} data-testid="complete-rec">{t("cb.rec.actions.complete")}</Button>}
            {locked && canReopen && <Button size="sm" variant="outline" onClick={() => setDialog("reopen")}>{t("cb.rec.actions.reopen")}</Button>}
          </>
        }
      />
      {locked && (
        <p className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm" role="status" data-testid="rec-locked">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t("cb.rec.banner.completed", { name: rec.completed_by ?? "", date: format.dateTime(rec.completed_at) })}
            {rec.explanation && <span className="block">{t("cb.rec.banner.explained", { amount: format.amount(rec.explanation.amount, cur, { withCode: true }), reason: rec.explanation.reason })}</span>}
          </span>
        </p>
      )}
      {!s.statement_consistent && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />{t("cb.rec.summary.inconsistent", { total: format.amount(s.statement_lines_total, cur, { withCode: true }) })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("cb.rec.line.status")}>
        {(["unmatched", "matched", "all"] as const).map((v) => (
          <Button key={v} size="sm" variant={show === v ? "secondary" : "ghost"} aria-pressed={show === v} onClick={() => setFilters({ show: v === "unmatched" ? null : v })}>
            {t(`cb.rec.show.${v}`)}
          </Button>
        ))}
      </div>

      {canWork && (selS.length > 0 || selB.length > 0) && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2 text-sm shadow-sm" data-testid="selection-bar">
          <span>{t("cb.rec.selection", { statement: format.amount(sumS, cur), book: format.amount(sumB, cur), difference: format.amount(sumS.minus(sumB), cur) })}</span>
          <Button size="sm" onClick={() => action.mutate({ kind: "match" })} disabled={!selS.length || !selB.length || !sumS.eq(sumB) || action.isPending}>{t("cb.rec.actions.match")}</Button>
          {singleStatement && <Button size="sm" variant="outline" onClick={() => setAdjusting(singleStatement)} data-testid="create-adjustment">{t("cb.rec.actions.adjust")}</Button>}
          <Button size="sm" variant="ghost" onClick={() => { setSelS([]); setSelB([]); }}>{t("cb.rec.actions.clear")}</Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_18rem]">
        {pane("statement", visible(rec.statement_lines), selS, setSelS, suggestedS)}
        {pane("book", visible(rec.book_lines), selB, setSelB, suggestedB)}
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4 text-sm" aria-labelledby="rec-summary" data-testid="rec-summary">
            <h2 id="rec-summary" className="mb-2 font-semibold">{t("cb.rec.summary.title")}</h2>
            <dl>
              {row(t("cb.rec.summary.statementClosing"), s.statement_closing)}
              {row(t("cb.rec.summary.outstandingDeposits"), s.outstanding_deposits)}
              {row(t("cb.rec.summary.unpresentedPayments"), s.unpresented_payments)}
              {row(t("cb.rec.summary.adjustedBank"), s.adjusted_bank_balance, { strong: true })}
              {row(t("cb.rec.summary.bookBalance"), s.book_balance)}
              {row(t("cb.rec.summary.unrecorded"), s.unrecorded_items)}
            </dl>
            <p className={cn("mt-2 flex items-center justify-between gap-2 border-t pt-2 font-semibold", differenceZero ? "text-success" : "text-destructive")} data-testid="rec-difference" data-zero={differenceZero}>
              <span className="flex items-center gap-1">{differenceZero ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}{t("cb.rec.summary.difference")}</span>
              <span className="tabular-nums">{differenceZero ? t("cb.rec.summary.zero") : format.amount(s.difference, cur, { withCode: true })}</span>
            </p>
          </section>
          <section className="rounded-xl border bg-card p-4"><HistoryPanel events={rec.history.map((e) => ({ ...e, action: historyLabel(e.action) }))} /></section>
        </aside>
      </div>

      {adjusting && <AdjustDialog rec={rec} line={adjusting} onClose={() => setAdjusting(null)} onDone={apply} />}
      {dialog && <CompleteDialog rec={rec} mode={dialog} onClose={() => setDialog(null)} onDone={apply} />}
    </div>
  );
}
