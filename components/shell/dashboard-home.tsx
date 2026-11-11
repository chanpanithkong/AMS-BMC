"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { CardSkeleton, ErrorState, PageHeader } from "@/components/feedback/states";
import { StatusBadge } from "@/components/workflow/status-badge";
import { orgApi } from "@/lib/api/endpoints/org";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { formatDate, todayBusinessDate } from "@/lib/format/dates";
import { AppLink, useAppLocale } from "@/lib/i18n/navigation";
import { useAccessContext } from "@/lib/rbac/can";
import { visibleMenu } from "@/lib/rbac/menu";
import { DashboardWidgets } from "@/components/dashboard/widgets";
import { useLocalName } from "./switchers";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/**
 * SCR-02 dashboard: role-specific widgets (SRS §6.19), then who is signed in, the company context,
 * what the role can reach and the period status.
 */
export function DashboardHome() {
  const t = useTranslations();
  const locale = useAppLocale();
  const localName = useLocalName();
  const user = useSession((s) => s.user);
  const company = useCurrentCompany();
  const access = useAccessContext();
  const periods = useQuery({ queryKey: ["fiscal-years", company?.id], queryFn: orgApi.fiscalYears });
  if (!user || !company) return null;

  const year = periods.data?.data[0];
  const menu = visibleMenu(access);

  return (
    <div data-testid="dashboard">
      <PageHeader
        title={t("dashboard.welcome", { name: locale === "km" ? user.full_name_km : user.full_name })}
        description={t("dashboard.signedInAs", { role: user.roles.map((r) => t(`roles.${r}`)).join(", ") })}
      />
      <DashboardWidgets />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t("dashboard.company")}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("dashboard.company")}</dt>
              <dd className="text-right font-medium">{localName(company)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("dashboard.baseCurrency")}</dt>
              <dd className="font-medium">{company.base_currency}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("dashboard.businessDate")}</dt>
              <dd className="font-medium tabular-nums">{formatDate(todayBusinessDate(), user.date_format)}</dd>
            </div>
          </dl>
        </Card>

        <Card title={t("dashboard.yourAccess")}>
          <ul className="flex flex-wrap gap-1.5" data-testid="access-list">
            {menu.map((group) => (
              <li key={group.id}>
                <AppLink
                  href={group.items[0].path}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t(group.labelKey)}
                  {group.level === "limited" && <span className="text-muted-foreground">({t("nav.limited")})</span>}
                </AppLink>
              </li>
            ))}
          </ul>
        </Card>

        {periods.isPending ? (
          <CardSkeleton />
        ) : periods.isError ? (
          <section className="rounded-xl border bg-card">
            <ErrorState compact error={periods.error} onRetry={() => periods.refetch()} />
          </section>
        ) : (
          <Card title={t("dashboard.openPeriods", { year: year?.name ?? "" })}>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {year?.periods.map((period) => (
                <li key={period.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 truncate">
                    {period.status === "CLOSED" && <Lock className="size-3 text-muted-foreground" aria-hidden />}
                    {localName(period)}
                  </span>
                  <StatusBadge status={period.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
