"use client";

import { Hammer, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AppLink, useBarePathname } from "@/lib/i18n/navigation";
import { useAccessContext } from "@/lib/rbac/can";
import { findMenuItem, homePath } from "@/lib/rbac/menu";
import { EmptyState } from "./states";

/** 403 page that route guards redirect to (prompt §5). */
export function ForbiddenPage() {
  const t = useTranslations("feedback.forbidden");
  const access = useAccessContext();
  const home = homePath(access);
  return (
    <div data-testid="forbidden-page">
      <EmptyState
        icon={<ShieldX className="size-6 text-destructive" />}
        title={t("title")}
        description={t("body")}
        action={
          home !== "/403" && (
            <Button asChild variant="outline" size="sm">
              <AppLink href={home}>{t("back")}</AppLink>
            </Button>
          )
        }
      />
    </div>
  );
}

/** Placeholder for screens delivered in a later build phase; unknown paths show "not found". */
export function ComingSoonPage() {
  const t = useTranslations();
  const pathname = useBarePathname();
  const match = findMenuItem(pathname);

  if (!match && !pathname.startsWith("/profile")) {
    return <EmptyState title={t("feedback.notFound.title")} description={t("feedback.notFound.body")} />;
  }
  const screen = match ? t(match.item.labelKey) : t("nav.items.profile");
  const phase = match?.item.phase ?? 7;
  return (
    <div data-testid="coming-soon">
      <EmptyState
        icon={<Hammer className="size-6" />}
        title={t("feedback.comingSoon.title", { screen })}
        description={
          t("feedback.comingSoon.body", { phase }) +
          (match?.item.scr ? " " + t("feedback.comingSoon.scr", { scr: match.item.scr }) : "")
        }
        action={
          <Button asChild variant="outline" size="sm">
            <AppLink href="/dashboard">{t("feedback.comingSoon.back")}</AppLink>
          </Button>
        }
      />
    </div>
  );
}
