import { ApiError, isApiError, type ErrorCode } from "@/lib/api/errors";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface DescribedError {
  code: ErrorCode;
  message: string;
  /** Correlation ID to quote to support (SRS §13.1). */
  reference: string | null;
  fieldErrors: Record<string, string>;
}

/** Message key for an error code; every code has an English and a Khmer text (NFR-USA-004). */
export const errorMessageKey = (code: ErrorCode) => `errors.${code}`;

/**
 * Turn any thrown value into a localised message. The UI maps codes to its own messages rather
 * than showing server text, except field-level messages, which the server localises (SRS §13.2).
 */
export function describeError(error: unknown, t: Translate): DescribedError {
  const apiError = isApiError(error) ? error : new ApiError({ status: 0, code: "UNKNOWN_ERROR" });
  let message = t(errorMessageKey(apiError.code));
  if (apiError.code === "RATE_LIMITED" && apiError.retryAfter) {
    message += " " + t("errors.retryAfter", { seconds: apiError.retryAfter });
  }
  return { code: apiError.code, message, reference: apiError.correlationId, fieldErrors: apiError.fieldErrors };
}
