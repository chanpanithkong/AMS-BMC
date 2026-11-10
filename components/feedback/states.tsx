"use client";

import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title?: string;
  description?: string;
  /** The next action, e.g. a "Create your first account" button (SRS NFR-USA-009). */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  const t = useTranslations("feedback.empty");
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title ?? t("title")}</p>
        {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Compact variant for widgets and table cells. */
  compact?: boolean;
  className?: string;
}

/** Error with a retry button and the correlation ID to quote to support (SRS §14.5). */
export function ErrorState({ error, onRetry, compact, className }: ErrorStateProps) {
  const t = useTranslations();
  const describe = useDescribeError();
  const { message, reference } = describe(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "px-3 py-4" : "px-6 py-12",
        className,
      )}
    >
      <AlertTriangle className={cn("text-destructive", compact ? "size-5" : "size-8")} aria-hidden />
      <div className="space-y-1">
        {!compact && <p className="font-medium">{t("feedback.error.title")}</p>}
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        {reference && (
          <p className="font-mono text-xs text-muted-foreground" data-testid="correlation-id">
            {t("errors.reference", { id: reference })}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-3" role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-6", c === 0 ? "w-24" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4", className)} role="status" aria-busy="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" role="status" aria-busy="true">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Status badge or document number shown next to the title. */
  badge?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          {actions}
        </div>
      )}
    </div>
  );
}
