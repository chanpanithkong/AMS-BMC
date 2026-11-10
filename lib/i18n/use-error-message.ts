"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { describeError } from "./error-messages";

/** Hook form of describeError, bound to the active language. */
export function useDescribeError() {
  const t = useTranslations();
  return useCallback((error: unknown) => describeError(error, (key, values) => t(key, values)), [t]);
}
