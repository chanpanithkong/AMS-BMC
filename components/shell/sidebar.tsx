"use client";

import {
  BarChart3, BookOpen, Boxes, Building2, CheckSquare, ChevronDown, Landmark, LayoutDashboard, PanelLeftClose,
  PanelLeftOpen, Percent, Receipt, ScrollText, Settings, ShoppingCart, Target, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppLink, useBarePathname } from "@/lib/i18n/navigation";
import { useAccessContext } from "@/lib/rbac/can";
import { visibleMenu, type VisibleGroup } from "@/lib/rbac/menu";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, BookOpen, Receipt, ShoppingCart, Landmark, Wallet, Building2, Boxes, Target, BarChart3, Percent,
  CheckSquare, ScrollText, Users, Settings,
};

const isActive = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");

function NavGroup({ group, collapsed, pathname, onNavigate }: {
  group: VisibleGroup;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations();
  const Icon = ICONS[group.icon] ?? LayoutDashboard;
  const active = group.items.some((entry) => isActive(pathname, entry.path));
  const [open, setOpen] = useState(active);
  const single = group.items.length === 1;
  const label = t(group.labelKey);
  const rowClass = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
    "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
    active && "font-medium text-primary",
    collapsed && "justify-center px-0",
  );

  // Collapsed sidebar: icons only, with the label in a tooltip (SRS §14.1).
  if (collapsed || single) {
    const link = (
      <AppLink
        href={group.items[0].path}
        onClick={onNavigate}
        aria-label={collapsed ? label : undefined}
        aria-current={single && active ? "page" : undefined}
        className={cn(rowClass, single && active && "bg-sidebar-accent")}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {!collapsed && <span className="truncate">{label}</span>}
      </AppLink>
    );
    if (!collapsed) return <li>{link}</li>;
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return (
    <li>
      <button type="button" className={rowClass} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="mt-0.5 ml-4 space-y-0.5 border-l pl-2">
          {group.items.map((entry) => {
            const current = isActive(pathname, entry.path) &&
              !group.items.some((o) => o !== entry && o.path.length > entry.path.length && isActive(pathname, o.path));
            return (
              <li key={entry.id}>
                <AppLink
                  href={entry.path}
                  onClick={onNavigate}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "block truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none",
                    "hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    current && "bg-sidebar-accent font-medium text-foreground",
                  )}
                >
                  {t(entry.labelKey)}
                </AppLink>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = useBarePathname();
  const access = useAccessContext();
  const roleKey = access.roles.join(",");
  const permissionKey = access.permissions.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- access is rebuilt each render; keys track its content
  const groups = useMemo(() => visibleMenu(access), [roleKey, permissionKey]);
  return (
    <nav aria-label={t("mainNavigation")} className="flex-1 overflow-y-auto p-2">
      <ul className="space-y-0.5">
        {groups.map((group) => (
          <NavGroup key={group.id} group={group} collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("app");
  return (
    <div className={cn("flex h-14 items-center gap-2 border-b px-3", collapsed && "justify-center px-0")}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
        A
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{t("shortName")}</p>
          <p className="truncate text-xs text-muted-foreground">{t("name")}</p>
        </div>
      )}
    </div>
  );
}

/** Collapsible left sidebar for desktop and tablet; a drawer on phones. */
export function Sidebar() {
  const t = useTranslations("nav");
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <>
      <aside
        data-print="hide"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] md:flex",
          collapsed ? "w-14" : "w-64",
        )}
      >
        <Brand collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} onClick={toggle} aria-label={collapsed ? t("expand") : t("collapse")}>
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {!collapsed && <span>{t("collapse")}</span>}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("mainNavigation")}</SheetTitle>
            <SheetDescription>{t("mainNavigation")}</SheetDescription>
          </SheetHeader>
          <Brand collapsed={false} />
          <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
