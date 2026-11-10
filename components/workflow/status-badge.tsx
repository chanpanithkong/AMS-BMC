"use client";

import {
  Ban, CheckCircle2, CircleDashed, CircleDot, Clock, FileEdit, Lock, LockOpen, RotateCcw, Send, ShieldAlert,
  ShieldCheck, XCircle, type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AnyStatus } from "@/lib/api/types/common";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-foreground",
  info: "border-info/30 bg-info/10 text-info",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS: Record<AnyStatus, { tone: Tone; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: FileEdit },
  SUBMITTED: { tone: "info", icon: Send },
  APPROVED: { tone: "info", icon: CheckCircle2 },
  REJECTED: { tone: "danger", icon: XCircle },
  POSTED: { tone: "success", icon: Lock },
  REVERSED: { tone: "warning", icon: RotateCcw },
  CANCELLED: { tone: "neutral", icon: Ban },
  OPEN: { tone: "info", icon: CircleDot },
  PARTIALLY_PAID: { tone: "warning", icon: CircleDashed },
  PAID: { tone: "success", icon: CheckCircle2 },
  OVERDUE: { tone: "danger", icon: Clock },
  CREDITED: { tone: "neutral", icon: RotateCcw },
  IN_PROGRESS: { tone: "info", icon: CircleDashed },
  COMPLETED: { tone: "success", icon: Lock },
  SOFT_CLOSED: { tone: "warning", icon: Lock },
  CLOSED: { tone: "neutral", icon: Lock },
  REOPENED: { tone: "warning", icon: LockOpen },
  VERIFIED: { tone: "success", icon: ShieldCheck },
  UNVERIFIED: { tone: "warning", icon: ShieldAlert },
  ACTIVE: { tone: "success", icon: CheckCircle2 },
  INACTIVE: { tone: "neutral", icon: Ban },
  PENDING: { tone: "warning", icon: Clock },
};

interface StatusBadgeProps {
  status: AnyStatus;
  className?: string;
}

/** Status is always text plus colour plus icon, never colour alone (SRS §14.1). */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useTranslations("status");
  const { tone, icon: Icon } = STATUS[status] ?? STATUS.DRAFT;
  return (
    <span
      data-slot="badge"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {t(status)}
    </span>
  );
}
