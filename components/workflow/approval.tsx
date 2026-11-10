"use client";

import { Check, Clock, Minus, ShieldAlert, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormatters } from "@/lib/api/hooks";
import type { ApprovalStep, HistoryEvent } from "@/lib/api/types/common";
import { useSession } from "@/lib/auth/session";
import { stripLocale } from "@/lib/i18n/config";
import { useAppRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const STEP_STYLE: Record<ApprovalStep["status"], { icon: LucideIcon; className: string }> = {
  PENDING: { icon: Clock, className: "border-warning/40 bg-warning/10 text-warning" },
  APPROVED: { icon: Check, className: "border-success/40 bg-success/10 text-success" },
  REJECTED: { icon: X, className: "border-destructive/40 bg-destructive/10 text-destructive" },
  SKIPPED: { icon: Minus, className: "border-border bg-muted text-muted-foreground" },
};

/** Approval path of a document: each step, who acts, and what happened (SRS SCR-05). */
export function ApprovalTimeline({ steps }: { steps: ApprovalStep[] }) {
  const t = useTranslations();
  const format = useFormatters();
  return (
    <section aria-label={t("workflow.timeline.title")}>
      <h3 className="mb-2 text-sm font-semibold">{t("workflow.timeline.title")}</h3>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workflow.timeline.empty")}</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step) => {
            const { icon: Icon, className } = STEP_STYLE[step.status];
            return (
              <li key={step.step} className="flex gap-3">
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border", className)} aria-hidden>
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {t("workflow.timeline.step", { step: step.step })} · {t(`roles.${step.role}`)}
                    <span className="ml-1.5 font-normal text-muted-foreground">— {t(`workflow.timeline.${step.status}`)}</span>
                  </p>
                  {(step.approver_name || step.acted_at) && (
                    <p className="text-xs text-muted-foreground">
                      {[step.approver_name, step.acted_at && format.dateTime(step.acted_at)].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {step.comment && <p className="mt-0.5 text-xs">“{step.comment}”</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Chronological record of what happened to a document. */
export function HistoryPanel({ events }: { events: HistoryEvent[] }) {
  const t = useTranslations("workflow.history");
  const format = useFormatters();
  return (
    <section aria-label={t("title")}>
      <h3 className="mb-2 text-sm font-semibold">{t("title")}</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="space-y-2 border-l pl-3">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <p>
                <span className="font-medium">{event.action}</span>
                <span className="text-muted-foreground"> — {event.user_name}</span>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{format.dateTime(event.at)}</p>
              {event.comment && <p className="text-xs">“{event.comment}”</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface SoDIndicatorProps {
  preparerId: string;
  preparerName: string;
  /** Reduced-SoD mode (SRS D-10): self-approval is allowed but listed in RPT-30. */
  reducedMode?: boolean;
}

/** Returns true when the signed-in user prepared the record and so may not approve it (BR-SEC-002). */
export function useSodViolation(preparerId: string, reducedMode?: boolean): boolean {
  const userId = useSession((s) => s.user?.id);
  return !reducedMode && userId === preparerId;
}

/** Separation-of-duties indicator on approval screens (SRS SCR-05). Text and icon, never colour alone. */
export function SoDIndicator({ preparerId, preparerName, reducedMode }: SoDIndicatorProps) {
  const t = useTranslations("workflow.sod");
  const userId = useSession((s) => s.user?.id);
  const self = userId === preparerId;
  const state = self ? (reducedMode ? "reduced" : "violation") : "ok";
  const Icon = state === "ok" ? ShieldCheck : ShieldAlert;
  return (
    <div
      data-testid="sod-indicator"
      data-state={state}
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border p-2 text-sm",
        state === "ok" && "border-success/30 bg-success/5 text-success",
        state === "reduced" && "border-warning/30 bg-warning/5 text-warning",
        state === "violation" && "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">{t(state)}</p>
        <p className="text-xs opacity-80">{t("preparedBy", { name: preparerName })}</p>
      </div>
    </div>
  );
}

/**
 * Warns before the user leaves a form with unsaved changes (prompt §5): the browser prompt covers
 * reload and tab close; in-app links open a confirmation dialog.
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
  const t = useTranslations("feedback.unsaved");
  const router = useAppRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const anchor = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(stripLocale(anchor.pathname) + anchor.search);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent showCloseButton={false} data-testid="unsaved-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => { const to = pending; setPending(null); if (to) router.push(to); }}>
            {t("leave")}
          </Button>
          <Button onClick={() => setPending(null)} autoFocus>{t("stay")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
