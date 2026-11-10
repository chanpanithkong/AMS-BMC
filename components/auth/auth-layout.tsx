"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageSwitch } from "@/components/shell/switchers";
import { isMock } from "@/lib/config";

/** Centred card layout for sign-in and password pages, with the language switch (SCR-01). */
export function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("app");
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
            A
          </div>
          <span className="text-sm font-semibold">{t("name")}</span>
          {isMock && (
            <span className="rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
              {t("mockBadge")}
            </span>
          )}
        </div>
        <LanguageSwitch variant="outline" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-5 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Label + control + error text, wired with aria-describedby (WCAG 2.2 AA, prompt §5). */
export function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const describedBy = (id: string, error?: string) => (error ? `${id}-error` : undefined);
