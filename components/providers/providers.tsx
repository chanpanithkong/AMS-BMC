"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { ThemeProvider } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { apiContext } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { config, isMock } from "@/lib/config";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retry only when the server could not be reached or failed; never on business errors.
        retry: (count, error) => count < 2 && isApiError(error) && (error.isNetworkError || error.status >= 500),
      },
      // Mutations are never retried automatically: the user retries, with the same Idempotency-Key.
      mutations: { retry: false },
    },
  });
}

let bootstrapPromise: Promise<void> | null = null;

/** Runs once per page load, even when React mounts effects twice in development. */
function bootstrap(): Promise<void> {
  bootstrapPromise ??= (async () => {
    if (isMock) {
      const { worker } = await import("@/mocks/browser");
      await worker.start({ onUnhandledRequest: "bypass", quiet: true });
    }
    await useSession.getState().restore();
  })();
  return bootstrapPromise;
}

/** Starts the MSW mock backend (mock mode), then restores the session from the refresh cookie. */
function Bootstrap({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Accept-Language follows the active language (SRS §13.2).
    apiContext.locale = locale;
    void bootstrap().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!ready) return <SplashScreen />;
  return <>{children}</>;
}

export function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface ProvidersProps {
  locale: Locale;
  messages: AbstractIntlMessages;
  children: ReactNode;
}

export function Providers({ locale, messages, children }: ProvidersProps) {
  const [queryClient] = useState(makeQueryClient);

  // Remember the language for the next visit.
  useEffect(() => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={config.businessTimeZone}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            <Bootstrap locale={locale}>{children}</Bootstrap>
            <Toaster position="top-right" richColors closeButton />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
