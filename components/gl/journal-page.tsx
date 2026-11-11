"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, Info, Printer, RotateCcw, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ErrorState, FormSkeleton, PageHeader } from "@/components/feedback/states";
import { AttachmentPanel } from "@/components/files/attachments";
import { useErrorToast } from "@/components/forms/field";
import { JournalLineGrid } from "@/components/finance/journal-line-grid";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApprovalTimeline, HistoryPanel, SoDIndicator } from "@/components/workflow/approval";
import { StatusBadge } from "@/components/workflow/status-badge";
import { journalsApi } from "@/lib/api/endpoints/journals";
import { useFormatters } from "@/lib/api/hooks";
import type { JournalEntry } from "@/lib/api/types/journals";
import { useSession } from "@/lib/auth/session";
import { AppLink, useAppRouter } from "@/lib/i18n/navigation";
import { usePermission } from "@/lib/rbac/can";
import { JournalDialogs, type JournalDialog } from "./journal-actions";
import { JournalEditor } from "./journal-editor";
import { isPostedState, toDraftLine } from "./journal-shared";
import { JournalVoucher } from "./journal-voucher";

function Banner({ tone, children, testId }: { tone: "info" | "warning" | "danger" | "success"; children: ReactNode; testId?: string }) {
  const styles = {
    info: "border-info/30 bg-info/5", warning: "border-warning/40 bg-warning/10", danger: "border-destructive/30 bg-destructive/5 text-destructive",
    success: "border-success/30 bg-success/5",
  };
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles[tone]}`} role="status" data-testid={testId} data-print="hide">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** An action the user may not take for a reason worth explaining: disabled with a tooltip (prompt §5). */
function Explained({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={reason}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/** SCR-04/05/06: a journal's detail with its workflow actions. `id` = "new" for a new journal. */
export function JournalPage({ id }: { id: string }) {
  const t = useTranslations();
  const copyId = useSearchParams().get("copy");
  const isNew = id === "new";
  const query = useQuery({ queryKey: ["journal", id], queryFn: ({ signal }) => journalsApi.get(id, signal), enabled: !isNew });
  const copy = useQuery({ queryKey: ["journal", copyId], queryFn: ({ signal }) => journalsApi.get(copyId!, signal), enabled: isNew && Boolean(copyId) });

  if (isNew) {
    if (copyId && copy.isPending) return <FormSkeleton />;
    return (
      <div>
        <PageHeader title={t("gl.journal.newTitle")} />
        <JournalEditor key={copyId ?? "new"} journal={null} copyFrom={copy.data ?? null} />
      </div>
    );
  }
  if (query.isPending) return <FormSkeleton fields={8} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <JournalView journal={query.data} />;
}

function JournalView({ journal }: { journal: JournalEntry }) {
  const t = useTranslations();
  const router = useAppRouter();
  const format = useFormatters();
  const queryClient = useQueryClient();
  const errorToast = useErrorToast();
  const userId = useSession((s) => s.user?.id);
  const [dialog, setDialog] = useState<JournalDialog>(null);
  const can = {
    edit: usePermission("gl.journal.edit"),
    submit: usePermission("gl.journal.submit"),
    approve: usePermission("gl.journal.approve"),
    post: usePermission("gl.journal.post"),
    reverse: usePermission("gl.journal.reverse"),
    create: usePermission("gl.journal.create"),
  };
  const mine = journal.preparer_id === userId;
  const editable = (journal.status === "DRAFT" || journal.status === "REJECTED") && can.edit && journal.type !== "SYSTEM";
  const posted = isPostedState(journal);
  const sodReason = mine ? t("workflow.sod.violation") : null;
  const pendingStep = journal.approval_steps.find((s) => s.status === "PENDING");

  const update = (j: JournalEntry) => queryClient.setQueryData(["journal", j.id], j);
  const simple = useMutation({
    mutationFn: (action: "recall" | "cancel") => (action === "recall" ? journalsApi.recall(journal.id) : journalsApi.cancel(journal.id)),
    onSuccess: (j, action) => {
      update(j);
      void queryClient.invalidateQueries({ queryKey: ["journals"] });
      toast.success(t(action === "recall" ? "gl.journal.toast.recalled" : "gl.journal.toast.cancelled"));
    },
    onError: errorToast,
  });
  const attach = useMutation({
    mutationFn: async (files: File[]) => {
      let latest = journal;
      for (const file of files) latest = await journalsApi.addAttachment(journal.id, file);
      return latest;
    },
    onSuccess: update,
    onError: errorToast,
  });
  const detach = useMutation({ mutationFn: (attachmentId: string) => journalsApi.removeAttachment(journal.id, attachmentId), onSuccess: update, onError: errorToast });

  const title = journal.journal_no ? t("gl.journal.title", { number: journal.journal_no }) : `${t("gl.journals.draftNo")} · ${journal.reference || journal.description}`;
  const historyEvents = journal.history.map((e) => ({ ...e, action: t.has(`gl.journal.history.${e.action}`) ? t(`gl.journal.history.${e.action}`) : e.action }));

  return (
    <div className="space-y-4" data-testid="journal-page" data-status={journal.status}>
      <div data-print="hide">
        <PageHeader
          title={title}
          badge={<span className="flex items-center gap-1.5"><StatusBadge status={journal.status} /><span className="rounded-md border px-1.5 py-0.5 text-xs">{t(`gl.type.${journal.type}`)}</span></span>}
          description={`${journal.description} · ${t("gl.journal.fields.preparer")}: ${journal.preparer_name}`}
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer aria-hidden />{t("gl.journal.actions.print")}</Button>
              {can.create && journal.type !== "SYSTEM" && (
                <Button size="sm" variant="ghost" onClick={() => { router.push(`/accounting/journals/new?copy=${journal.id}`); toast.info(t("gl.journal.toast.copied")); }}>
                  <Copy aria-hidden />{t("gl.journal.actions.copy")}
                </Button>
              )}
              {editable && (
                <Button size="sm" variant="ghost" onClick={() => simple.mutate("cancel")} disabled={simple.isPending}><Ban aria-hidden />{t("gl.journal.actions.cancelDraft")}</Button>
              )}
              {journal.status === "SUBMITTED" && mine && can.submit && (
                <Button size="sm" variant="outline" onClick={() => simple.mutate("recall")} disabled={simple.isPending} data-testid="recall"><Undo2 aria-hidden />{t("gl.journal.actions.recall")}</Button>
              )}
              {journal.status === "SUBMITTED" && can.approve && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setDialog("delegate")}>{t("gl.journal.actions.delegate")}</Button>
                  <Explained reason={sodReason}>
                    <Button size="sm" variant="destructive" onClick={() => setDialog("reject")} disabled={Boolean(sodReason)} data-testid="reject"><XCircle aria-hidden />{t("gl.journal.actions.reject")}</Button>
                  </Explained>
                  <Explained reason={sodReason}>
                    <Button size="sm" onClick={() => setDialog("approve")} disabled={Boolean(sodReason)} data-testid="approve">{t("gl.journal.actions.approve")}</Button>
                  </Explained>
                </>
              )}
              {journal.status === "APPROVED" && can.post && (
                <Explained reason={sodReason}>
                  <Button size="sm" onClick={() => setDialog("post")} disabled={Boolean(sodReason)} data-testid="post">{t("gl.journal.actions.post")}</Button>
                </Explained>
              )}
              {/* System and opening journals are corrected through their source document, not reversed here. */}
              {journal.status === "POSTED" && can.reverse && (journal.type === "MANUAL" || journal.type === "ADJUSTING") && (
                <Button size="sm" variant="destructive" onClick={() => setDialog("reverse")} data-testid="reverse"><RotateCcw aria-hidden />{t("gl.journal.actions.reverse")}</Button>
              )}
            </>
          }
        />
        <div className="space-y-2">
          {posted && <Banner tone="success" testId="posted-banner"><p className="font-medium">{t("feedback.posted")} · {journal.journal_no}</p><p>{t("gl.journal.banner.posted")}</p></Banner>}
          {journal.reversed_by && (
            <Banner tone="warning">
              <p><AppLink href={`/accounting/journals/${journal.reversed_by.id}`} className="font-medium underline">{t("gl.journal.banner.reversedBy", { number: journal.reversed_by.journal_no })}</AppLink></p>
              {journal.reversal_reason && <p>{t("gl.journal.banner.reason", { reason: journal.reversal_reason })}</p>}
            </Banner>
          )}
          {journal.reverses && (
            <Banner tone="info">
              <p><AppLink href={`/accounting/journals/${journal.reverses.id}`} className="font-medium underline">{t("gl.journal.banner.reverses", { number: journal.reverses.journal_no })}</AppLink></p>
              {journal.reversal_reason && <p>{t("gl.journal.banner.reason", { reason: journal.reversal_reason })}</p>}
            </Banner>
          )}
          {journal.status === "REJECTED" && journal.rejection_comment && <Banner tone="danger" testId="rejected-banner"><p>{t("gl.journal.banner.rejected", { comment: journal.rejection_comment })}</p></Banner>}
          {journal.status === "SUBMITTED" && <Banner tone="info"><p>{t("gl.journal.banner.submitted")}</p></Banner>}
          {journal.status === "APPROVED" && <Banner tone="info"><p>{t("gl.journal.banner.approved")}</p></Banner>}
          {journal.status === "CANCELLED" && <Banner tone="warning"><p>{t("gl.journal.banner.cancelled")}</p></Banner>}
          {journal.type === "SYSTEM" && journal.source_no && <Banner tone="info"><p>{t("gl.journal.banner.system", { source: journal.source_no })}</p></Banner>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]" data-print="hide">
        <div className="min-w-0 space-y-4">
          {editable ? (
            <JournalEditor key={journal.id} journal={journal} onSaved={update} />
          ) : (
            <>
              <dl className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
                {[
                  [t("gl.journal.fields.postingDate"), format.date(journal.posting_date)],
                  [t("gl.journal.fields.documentDate"), format.date(journal.document_date)],
                  [t("gl.journal.fields.period"), journal.period ?? "—"],
                  [t("gl.journal.fields.reference"), journal.reference || "—"],
                  [t("gl.journal.fields.currency"), journal.currency],
                  [t("gl.journal.fields.source"), journal.source_no ?? "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <section aria-label={t("gl.journal.sections.lines")}>
                <JournalLineGrid lines={journal.lines.map((l) => toDraftLine(l))} onChange={() => undefined} readOnly />
              </section>
            </>
          )}
        </div>
        <aside className="space-y-4">
          {journal.status === "SUBMITTED" && can.approve && <SoDIndicator preparerId={journal.preparer_id} preparerName={journal.preparer_name} />}
          {(journal.approval_steps.length > 0 || pendingStep) && <div className="rounded-xl border bg-card p-4"><ApprovalTimeline steps={journal.approval_steps} /></div>}
          <div className="rounded-xl border bg-card p-4">
            <AttachmentPanel
              attachments={journal.attachments}
              readOnly={posted || !can.edit}
              onUpload={(files) => attach.mutate(files)}
              onRemove={(a) => detach.mutate(a.id)}
            />
          </div>
          <div className="rounded-xl border bg-card p-4"><HistoryPanel events={historyEvents} /></div>
        </aside>
      </div>

      <JournalVoucher journal={journal} />
      <JournalDialogs journal={journal} open={dialog} onOpenChange={setDialog} onUpdated={update} />
    </div>
  );
}
