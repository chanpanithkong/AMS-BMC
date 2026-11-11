"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useDescribeError } from "@/lib/i18n/use-error-message";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  label: string;
  /** Message shown under the control and linked to it with aria-describedby (WCAG 2.2 AA). */
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label, control, hint and error. Give the control `id` and `aria-describedby={describedBy(id, error, hint)}`. */
export function FormField({ id, label, error, hint, required, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

export const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

/** Native select styled like the inputs; quick for forms and fully keyboard operable. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className,
      )}
    >
      {children}
    </select>
  );
}

/** Toast an API error with its localised message and correlation ID. */
export function useErrorToast() {
  const t = useTranslations();
  const describe = useDescribeError();
  return (error: unknown) => {
    const { message, reference } = describe(error);
    toast.error(message, { description: reference ? t("errors.reference", { id: reference }) : undefined });
  };
}
