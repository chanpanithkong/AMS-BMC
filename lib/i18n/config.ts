export const locales = ["en", "km"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return (locales as readonly string[]).includes(value ?? "");
}

/** "/km/sales/invoices" → "/sales/invoices" */
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (isLocale(first)) return "/" + rest.join("/");
  return pathname;
}

/** Swap the locale prefix of a path, keeping the rest. */
export function withLocale(pathname: string, locale: Locale): string {
  const bare = stripLocale(pathname);
  return `/${locale}${bare === "/" ? "" : bare}`;
}
