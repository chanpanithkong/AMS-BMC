// Standard error contract (SRS §13.1):
// { "error": { "code", "message", "details": [{ field, issue, value }], "correlation_id" } }

/** Every error code the UI knows. Each one has an English and a Khmer message (NFR-USA-004). */
export const ERROR_CODES = [
  // 400 / 401 / 403 / 404
  "MALFORMED_REQUEST", "NOT_AUTHENTICATED", "SESSION_EXPIRED", "FORBIDDEN", "APPROVAL_LIMIT_EXCEEDED",
  "SOD_VIOLATION", "NOT_FOUND",
  // 409
  "VERSION_CONFLICT", "ALREADY_POSTED", "INVALID_STATE_TRANSITION", "PERIOD_CLOSED",
  "DUPLICATE_SUPPLIER_INVOICE", "RECONCILIATION_COMPLETED", "IDEMPOTENCY_KEY_REUSED", "DUPLICATE_CODE",
  "JOURNAL_POSTED", "ACCOUNT_IN_USE", "DUPLICATE_RECORD",
  // Phase 3. ASSUMPTION: ATTACHMENT_REQUIRED comes from AT-EXP-03; INSUFFICIENT_BALANCE from BR-CB-004.
  "ATTACHMENT_REQUIRED", "INSUFFICIENT_BALANCE",
  // Phase 4. PAYMENT_NOT_APPROVED from AT-AP-02; ALREADY_RELEASED and SUPPLIER_NOT_VERIFIED are ASSUMPTIONS.
  "PAYMENT_NOT_APPROVED", "ALREADY_RELEASED", "SUPPLIER_NOT_VERIFIED",
  // Phase 7. REASON_REQUIRED from AT-AUD-03, CURRENCY_IN_USE from AT-CFG-02; the others are ASSUMPTIONS.
  "REASON_REQUIRED", "CURRENCY_IN_USE", "RECORD_IN_USE", "SELF_PERMISSION_CHANGE", "SOD_CONFLICT",
  // 422
  "VALIDATION_ERROR", "JOURNAL_UNBALANCED", "ACCOUNT_NOT_POSTABLE", "RATE_MISSING",
  "ALLOCATION_EXCEEDS_BALANCE", "TAX_CODE_UNVERIFIED", "DIFFERENCE_UNRESOLVED", "UNMAPPED_ACCOUNTS",
  // 429 / 5xx
  "RATE_LIMITED", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE",
  // Sign-in (SRS §13.3 "401 LOCKED"; MFA codes are an ASSUMPTION, see docs/API_CONTRACT.md)
  "INVALID_CREDENTIALS", "LOCKED", "MFA_REQUIRED", "INVALID_OTP", "INVALID_TOKEN",
  // Raised by the client itself
  "NETWORK_ERROR", "UNKNOWN_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetail {
  field?: string;
  issue?: string;
  value?: string;
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** The code exactly as the server sent it, kept for support even when the UI does not know it. */
  readonly rawCode: string;
  readonly details: ErrorDetail[];
  readonly correlationId: string | null;
  readonly retryAfter: number | null;

  constructor(init: {
    status: number;
    code: string;
    message?: string;
    details?: ErrorDetail[];
    correlationId?: string | null;
    retryAfter?: number | null;
  }) {
    super(init.message || init.code);
    this.name = "ApiError";
    this.status = init.status;
    this.rawCode = init.code;
    this.code = isErrorCode(init.code) ? init.code : "UNKNOWN_ERROR";
    this.details = init.details ?? [];
    this.correlationId = init.correlationId ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }

  /** The request never reached the server, so retrying with the same Idempotency-Key is safe. */
  get isNetworkError(): boolean {
    return this.code === "NETWORK_ERROR";
  }

  /** Field-level errors keyed by field path, for React Hook Form `setError`. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) {
      if (d.field) out[d.field] = d.message || d.issue || this.message;
    }
    return out;
  }
}

export function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const STATUS_FALLBACK: Record<number, ErrorCode> = {
  400: "MALFORMED_REQUEST", 401: "NOT_AUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND",
  422: "VALIDATION_ERROR", 429: "RATE_LIMITED", 500: "INTERNAL_ERROR", 503: "SERVICE_UNAVAILABLE",
};

/** Turn a non-2xx response into a typed ApiError. Tolerates bodies that are not the standard shape. */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // not JSON; fall back to the status code
  }
  const error = (body as { error?: Record<string, unknown> } | null)?.error;
  const retryAfterHeader = response.headers.get("Retry-After");
  return new ApiError({
    status: response.status,
    code: typeof error?.code === "string" ? error.code : (STATUS_FALLBACK[response.status] ?? "UNKNOWN_ERROR"),
    message: typeof error?.message === "string" ? error.message : undefined,
    details: Array.isArray(error?.details) ? (error.details as ErrorDetail[]) : [],
    correlationId:
      typeof error?.correlation_id === "string" ? error.correlation_id : response.headers.get("X-Correlation-Id"),
    retryAfter: retryAfterHeader ? Number(retryAfterHeader) : null,
  });
}

export function networkError(cause: unknown): ApiError {
  return new ApiError({ status: 0, code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : undefined });
}
