"use client";

import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SplashScreen } from "@/components/providers/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { stripLocale } from "@/lib/i18n/config";
import { useAppRouter } from "@/lib/i18n/navigation";
import { useAccessContext } from "@/lib/rbac/can";
import { canAccessPath } from "@/lib/rbac/menu";
import { useUiStore } from "@/lib/stores/ui";
import { Breadcrumbs, Header } from "./header";
import { CompanyBranchSwitcher } from "./switchers";
import { Sidebar } from "./sidebar";

const WARNING_SECONDS = 60;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

/**
 * Signs the user out after a period of inactivity, with a warning 60 seconds before
 * (prompt §9; SRS FR-AUTH-002 proposes 30 minutes).
 */
function IdleWatcher() {
  const t = useTranslations("shell.idle");
  const logout = useSession((s) => s.logout);
  const lastActivity = useRef(0);
  const warningShown = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const warning = secondsLeft !== null;

  useEffect(() => {
    lastActivity.current = Date.now();
    const limit = config.idleTimeoutMinutes * 60_000;
    // Once the warning shows, only the "Stay signed in" button resets the timer.
    const onActivity = () => {
      if (!warningShown.current) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(() => {
      const remaining = limit - (Date.now() - lastActivity.current);
      if (remaining <= 0) {
        void logout("idle");
      } else if (remaining <= WARNING_SECONDS * 1000) {
        warningShown.current = true;
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        warningShown.current = false;
        setSecondsLeft(null);
      }
    }, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
  }, [logout]);

  const stay = () => {
    lastActivity.current = Date.now();
    warningShown.current = false;
    setSecondsLeft(null);
  };

  return (
    <Dialog open={warning} onOpenChange={(open) => !open && stay()}>
      <DialogContent showCloseButton={false} data-testid="idle-warning">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription aria-live="polite">{t("body", { seconds: secondsLeft ?? 0 })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => logout()}>{t("signOut")}</Button>
          <Button onClick={stay} autoFocus>{t("stay")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Application shell: sidebar, header, breadcrumbs, plus the sign-in and role guards. */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  const status = useSession((s) => s.status);
  const router = useAppRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const bare = stripLocale(pathname);
  const access = useAccessContext();
  const hydrate = useUiStore((s) => s.hydrate);
  const allowed = status === "authenticated" && canAccessPath(access, bare);

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    if (status === "unauthenticated") {
      const qs = search.toString();
      const next = bare + (qs ? `?${qs}` : "");
      router.replace(bare === "/dashboard" || bare === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
    } else if (status === "authenticated" && !allowed) {
      // Route guard: roles without access land on the 403 page (prompt §5).
      router.replace("/403");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the session or the path changes
  }, [status, allowed, bare]);

  if (!allowed) return <SplashScreen />;

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="border-b px-3 py-2 sm:hidden" data-print="hide">
          <CompanyBranchSwitcher />
        </div>
        <Breadcrumbs />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 outline-none md:p-6" data-print="main">
          {children}
        </main>
      </div>
      <IdleWatcher />
    </div>
  );
}
