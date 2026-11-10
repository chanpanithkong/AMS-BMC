"use client";

import { Building, Languages, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentCompany, useSession } from "@/lib/auth/session";
import { locales, withLocale, type Locale } from "@/lib/i18n/config";
import { useAppLocale } from "@/lib/i18n/navigation";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

const ALL = "__all__";

/** Name in the active language. */
export function useLocalName() {
  const locale = useAppLocale();
  return <T extends { name: string; name_km?: string | null }>(item: T) =>
    locale === "km" && item.name_km ? item.name_km : item.name;
}

/** Company and branch selector in the header (SRS §14.1). The company sets X-Company-Id. */
export function CompanyBranchSwitcher({ className }: { className?: string }) {
  const t = useTranslations("shell");
  const localName = useLocalName();
  const companies = useSession((s) => s.companies);
  const company = useCurrentCompany();
  const branchId = useUiStore((s) => s.branchId);
  const setCompany = useUiStore((s) => s.setCompany);
  const setBranch = useUiStore((s) => s.setBranch);
  if (!company) return null;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {companies.length > 1 ? (
        <Select value={company.id} onValueChange={setCompany}>
          <SelectTrigger size="sm" aria-label={t("company")} className="max-w-56">
            <Building className="size-4 text-muted-foreground" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{localName(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium" title={t("company")}>
          <Building className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{localName(company)}</span>
        </div>
      )}
      <Select value={branchId ?? ALL} onValueChange={(v) => setBranch(v === ALL ? null : v)}>
        <SelectTrigger size="sm" aria-label={t("branch")} className="max-w-44">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allBranches")}</SelectItem>
          {company.branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>{localName(b)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Language switch EN / ខ្មែរ: swaps the locale prefix and keeps the current page and filters. */
export function LanguageSwitch({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const t = useTranslations("shell.language");
  const locale = useAppLocale();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();

  const change = (next: string) => {
    const qs = search.toString();
    router.replace(withLocale(pathname, next as Locale) + (qs ? `?${qs}` : ""));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" aria-label={t("label")} data-testid="language-switch">
          <Languages aria-hidden />
          <span lang={locale}>{t(locale)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={change}>
          {locales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code} data-testid={`language-${code}`}>
              {t(code)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
