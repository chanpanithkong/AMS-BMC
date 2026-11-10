"use client";

import { Bug, KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth/session";
import { isMock } from "@/lib/config";
import { DATE_FORMATS, type DateFormat } from "@/lib/format/dates";
import { useAppLocale, useAppRouter } from "@/lib/i18n/navigation";
import type { NegativeStyle } from "@/lib/money/format";

/** User menu: profile, number and date format, appearance, password, MFA, sign out (SRS §14.1). */
export function UserMenu() {
  const t = useTranslations();
  const locale = useAppLocale();
  const router = useAppRouter();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const setPreferences = useSession((s) => s.setPreferences);
  const { theme, setTheme } = useTheme();
  const [chaos, setChaos] = useState(false);
  if (!user) return null;

  const name = locale === "km" ? user.full_name_km : user.full_name;
  const initials = user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const toggleChaos = async (on: boolean) => {
    const { mockConfig } = await import("@/mocks/http");
    mockConfig.chaos = on;
    setChaos(on);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label={t("shell.userMenu.open")} data-testid="user-menu">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground" aria-hidden>
            {initials}
          </span>
          <span className="hidden max-w-32 truncate lg:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="text-xs font-normal text-muted-foreground" data-testid="user-role">
            {user.roles.map((role) => t(`roles.${role}`)).join(", ")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push("/profile")}>
            <UserRound aria-hidden />
            {t("shell.userMenu.profile")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("shell.userMenu.numberFormat")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={user.negative_style}
                onValueChange={(v) => setPreferences({ negative_style: v as NegativeStyle })}
              >
                <DropdownMenuRadioItem value="brackets">{t("shell.userMenu.negativeBrackets")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="minus">{t("shell.userMenu.negativeMinus")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("shell.userMenu.dateFormat")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={user.date_format}
                onValueChange={(v) => setPreferences({ date_format: v as DateFormat })}
              >
                {DATE_FORMATS.map((format) => (
                  <DropdownMenuRadioItem key={format} value={format}>{format}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("shell.userMenu.theme")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">{t("shell.userMenu.light")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t("shell.userMenu.dark")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/profile/password")}>
          <KeyRound aria-hidden />
          {t("shell.userMenu.changePassword")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/profile/mfa")}>
          <ShieldCheck aria-hidden />
          {t("shell.userMenu.mfa")}
        </DropdownMenuItem>
        {isMock && (
          <DropdownMenuCheckboxItem checked={chaos} onCheckedChange={toggleChaos} onSelect={(e) => e.preventDefault()}>
            <Bug aria-hidden />
            {t("shell.userMenu.chaos")}
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()} data-testid="sign-out">
          <LogOut aria-hidden />
          {t("shell.userMenu.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
