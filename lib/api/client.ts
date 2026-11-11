import { config } from "@/lib/config";
import { ApiError, networkError, parseErrorResponse } from "./errors";
import type { Page } from "./types/common";

// Thin fetch wrapper for the /api/v1 contract (SRS §13.1).

/** Values the client needs on every request. Set by the session and UI stores. */
export const apiContext: {
  /** Access token: kept in memory only, never in localStorage (prompt §9). */
  accessToken: string | null;
  companyId: string | null;
  locale: string;
  /** Called when the session cannot be refreshed. */
  onSessionLost: (() => void) | null;
} = { accessToken: null, companyId: null, locale: "en", onSessionLost: null };

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined | string[]>;
  body?: unknown;
  /** Idempotency-Key for post, reverse, approve, release … (see lib/api/idempotency.ts). */
  idempotencyKey?: string;
  /** Record version for draft edits → If-Match (409 VERSION_CONFLICT when stale). */
  ifMatch?: number | string;
  signal?: AbortSignal;
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean;
  /** Read the body as a Blob (file downloads) instead of JSON. */
  responseType?: "json" | "blob";
  /** Internal: this request already went through one token refresh. */
  retried?: boolean;
}

export function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `${base}${path}${qs ? `?${qs}` : ""}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

let refreshInFlight: Promise<RefreshResult> | null = null;

export interface RefreshResult {
  access_token: string;
  [key: string]: unknown;
}

/**
 * Rotate tokens through POST /auth/refresh. The refresh token travels in an HttpOnly cookie; a CSRF
 * header accompanies it. Concurrent callers share one request.
 * ASSUMPTION: the CSRF token is readable from a `csrf_token` cookie (double-submit pattern).
 */
export function refreshSession(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      let response: Response;
      try {
        response = await fetch(buildUrl("/auth/refresh"), {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": readCookie("csrf_token") ?? "", "Accept-Language": apiContext.locale },
        });
      } catch (cause) {
        throw networkError(cause);
      }
      if (!response.ok) throw await parseErrorResponse(response);
      const result = (await response.json()) as RefreshResult;
      apiContext.accessToken = result.access_token;
      return result;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", "Accept-Language": apiContext.locale };
  if (!options.anonymous && apiContext.accessToken) headers.Authorization = `Bearer ${apiContext.accessToken}`;
  if (apiContext.companyId) headers["X-Company-Id"] = apiContext.companyId;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.ifMatch !== undefined) headers["If-Match"] = String(options.ifMatch);

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body,
      credentials: "include",
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw networkError(cause);
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    if (options.responseType === "blob") return (await response.blob()) as T;
    return (await response.json()) as T;
  }

  const error = await parseErrorResponse(response);

  // Access token expired: refresh once, then repeat the request with the same Idempotency-Key.
  if (error.status === 401 && error.code === "SESSION_EXPIRED" && !options.retried && !options.anonymous) {
    try {
      await refreshSession();
    } catch {
      apiContext.accessToken = null;
      apiContext.onSessionLost?.();
      throw error;
    }
    return apiFetch<T>(path, { ...options, retried: true });
  }
  if (error.status === 401 && error.code === "NOT_AUTHENTICATED" && !options.anonymous) {
    apiContext.accessToken = null;
    apiContext.onSessionLost?.();
  }
  throw error;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) => apiFetch<T>(path, { query, signal }),
  list: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    apiFetch<Page<T>>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body: unknown, version?: number, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body, ifMatch: version }),
  put: <T>(path: string, body: unknown, version?: number, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    apiFetch<T>(path, { ...options, method: "PUT", body, ifMatch: version }),
  delete: <T = void>(path: string, options: Omit<RequestOptions, "method"> = {}) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

export { ApiError };
