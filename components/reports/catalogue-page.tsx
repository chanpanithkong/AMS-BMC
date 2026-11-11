"use client";

import { ChevronRight, Clock, FileBarChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@/components/feedback/states";
import { Input } from "@/components/ui/input";
import { AppLink } from "@/lib/i18n/navigation";
import { useAccessContext } from "@/lib/rbac/can";
import { hasPermission } from "@/lib/rbac/permissions";
import { CATEGORY_ORDER, REPORT_CATALOGUE } from "@/lib/reports/catalogue";

/** SCR-15 report catalogue by category; only reports the user may run are listed (SRS §15.2). */
export function ReportCatalogue() {
  const t = useTranslations("reports");
  const access = useAccessContext();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const allowed = REPORT_CATALOGUE.filter((e) => hasPermission(access.permissions, e.permission))
    .filter((e) => !term || `${e.id} ${t(`list.${e.slug}.title`)} ${t(`list.${e.slug}.description`)}`.toLowerCase().includes(term));

  return (
    <div className="min-w-0" data-testid="report-catalogue">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 max-w-sm">
        <label htmlFor="report-search" className="sr-only">{t("search")}</label>
        <Input id="report-search" type="search" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {allowed.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
      <div className="space-y-6">
        {CATEGORY_ORDER.map((category) => {
          const entries = allowed.filter((e) => e.category === category);
          if (!entries.length) return null;
          return (
            <section key={category} aria-labelledby={`cat-${category}`}>
              <h2 id={`cat-${category}`} className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t(`category.${category}`)}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {entries.map((e) => {
                  const body = (
                    <>
                      <FileBarChart className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t(`list.${e.slug}.title`)} <span className="text-xs font-normal text-muted-foreground">{e.id}</span></span>
                        <span className="block text-sm text-muted-foreground">{t(`list.${e.slug}.description`)}</span>
                        {e.phase && <span className="mt-1 inline-flex items-center gap-1 rounded border px-1.5 text-xs"><Clock className="size-3" aria-hidden />{t("phase", { phase: e.phase })}</span>}
                      </span>
                      {!e.phase && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    </>
                  );
                  return (
                    <li key={e.id}>
                      {e.phase ? (
                        <div className="flex h-full gap-3 rounded-xl border border-dashed bg-card p-3 opacity-80" aria-disabled="true">{body}</div>
                      ) : (
                        <AppLink href={e.path ?? `/reports/${e.slug}`} className="flex h-full gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" data-testid={`report-${e.slug}`}>
                          {body}
                        </AppLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
