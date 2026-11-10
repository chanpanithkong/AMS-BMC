import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

// Every page lives under /[locale]. Requests without a locale prefix are redirected to the user's
// remembered language, then the browser's preference, then English.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  // Static files such as /mockServiceWorker.js pass through.
  if (/\.[a-z0-9]+$/i.test(pathname)) return;
  if (isLocale(first)) {
    // "/en" has no page of its own: go to the dashboard.
    if (pathname === `/${first}` || pathname === `/${first}/`) {
      request.nextUrl.pathname = `/${first}/dashboard`;
      return NextResponse.redirect(request.nextUrl);
    }
    return;
  }

  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
  const preferred = (request.headers.get("accept-language") ?? "").toLowerCase().startsWith("km") ? "km" : defaultLocale;
  const locale = isLocale(remembered) ? remembered : preferred;
  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Skip Next.js internals and the API path; static files are skipped inside the function.
  matcher: ["/((?!_next/|api/).*)"],
};
