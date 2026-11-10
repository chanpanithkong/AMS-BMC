"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ComponentProps } from "react";
import { stripLocale, type Locale } from "./config";

/** Prefix an app path ("/sales/invoices") with the active locale. */
export function useLocalePath() {
  const locale = useLocale();
  return useCallback((path: string) => `/${locale}${path === "/" ? "" : path}`, [locale]);
}

/** Current path without the locale prefix. */
export function useBarePathname(): string {
  return stripLocale(usePathname());
}

/** Router whose push/replace take app paths without the locale prefix. */
export function useAppRouter() {
  const router = useRouter();
  const localePath = useLocalePath();
  return {
    push: (path: string) => router.push(localePath(path)),
    replace: (path: string) => router.replace(localePath(path)),
    back: () => router.back(),
    refresh: () => router.refresh(),
  };
}

/** next/link that adds the locale prefix. */
export function AppLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const localePath = useLocalePath();
  return <Link href={localePath(href)} {...props} />;
}

export function useAppLocale(): Locale {
  return useLocale() as Locale;
}
