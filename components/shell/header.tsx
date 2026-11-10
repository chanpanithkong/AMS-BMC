"use client";

import { ChevronRight, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { isMock } from "@/lib/config";
import { AppLink, useBarePathname } from "@/lib/i18n/navigation";
import { findMenuItem } from "@/lib/rbac/menu";
import { useUiStore } from "@/lib/stores/ui";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { CompanyBranchSwitcher, LanguageSwitch } from "./switchers";
import { UserMenu } from "./user-menu";

const STATIC_LABELS: Record<string, string> = {
  "/profile": "nav.items.profile",
  "/403": "nav.items.forbidden",
  "/dev": "nav.items.dev",
};

/** Breadcrumbs on every page (SRS §14.1): Home › group › screen › record. */
export function Breadcrumbs() {
  const t = useTranslations();
  const pathname = useBarePathname();
  const match = findMenuItem(pathname);
  const crumbs: { label: string; href?: string }[] = [];

  if (match) {
    if (match.group.items.length > 1) crumbs.push({ label: t(match.group.labelKey) });
    const tail = pathname.slice(match.item.path.length).split("/").filter(Boolean);
    crumbs.push({ label: t(match.item.labelKey), href: tail.length ? match.item.path : undefined });
    // Record identifiers are shown as they are (document numbers, ids).
    tail.forEach((segment) => crumbs.push({ label: decodeURIComponent(segment) }));
  } else {
    const key = Object.keys(STATIC_LABELS).find((p) => pathname === p || pathname.startsWith(p + "/"));
    if (key) crumbs.push({ label: t(STATIC_LABELS[key]) });
  }

  return (
    <nav aria-label={t("nav.breadcrumbs")} className="min-w-0 px-4 pt-3 text-sm md:px-6" data-print="hide">
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <li>
          <AppLink href="/dashboard" className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {t("nav.home")}
          </AppLink>
        </li>
        {crumbs.map((crumb, i) => (
          <Fragment key={i}>
            <li aria-hidden><ChevronRight className="size-3.5" /></li>
            <li aria-current={i === crumbs.length - 1 ? "page" : undefined} className={i === crumbs.length - 1 ? "font-medium text-foreground" : undefined}>
              {crumb.href ? (
                <AppLink href={crumb.href} className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {crumb.label}
                </AppLink>
              ) : (
                crumb.label
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

/** Header: company and branch selector, global search, language, notifications, user menu. */
export function Header() {
  const t = useTranslations();
  const openNav = useUiStore((s) => s.setMobileNavOpen);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4" data-print="hide">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => openNav(true)} aria-label={t("nav.openMenu")}>
        <Menu aria-hidden />
      </Button>
      <CompanyBranchSwitcher className="hidden sm:flex" />
      {isMock && (
        <span className="hidden rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning xl:inline">
          {t("app.mockBadge")}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <GlobalSearch />
        <LanguageSwitch />
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
