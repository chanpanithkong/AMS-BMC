"use client";

import { useEffect } from "react";
import { SplashScreen } from "@/components/providers/providers";
import { useAppRouter } from "@/lib/i18n/navigation";

/** Client-side fallback for "/en": the proxy normally redirects it to the dashboard. */
export function LocaleIndex() {
  const router = useAppRouter();
  useEffect(() => {
    router.replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);
  return <SplashScreen />;
}
