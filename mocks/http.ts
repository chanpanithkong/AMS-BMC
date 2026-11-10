import { delay, http, HttpResponse, type HttpHandler } from "msw";
import type { CompanyRef } from "@/lib/api/types/auth";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "./db";
import type { MockUser } from "./db/seed";

// Shared plumbing for mock handlers: latency, injected failures, authentication, company scope,
// permissions, the standard error body, cursor pagination and idempotency replay (SRS §13.1).

export const mockConfig = {
  /** Realistic latency of 150–600 ms (prompt §4). Switched off in unit tests. */
  latency: true,
  /** Dev-only toggle: about one request in five fails with 500 to exercise error states. */
  chaos: false,
  accessTokenSeconds: 15 * 60,
};

export const apiPath = (path: string) => `*/api/v1${path}`;

function uuid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export interface ErrorDetailBody {
  field?: string;
  issue?: string;
  value?: string;
  message?: string;
}

export function fail(status: number, code: string, message: string, details: ErrorDetailBody[] = [], headers?: Record<string, string>) {
  return HttpResponse.json({ error: { code, message, details, correlation_id: uuid() } }, { status, headers });
}

export function issueToken(user: MockUser): string {
  return `mock.${user.id}.${Date.now() + mockConfig.accessTokenSeconds * 1000}`;
}

function userFromToken(request: Request): MockUser | "expired" | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer mock\.(.+)\.(\d+)$/.exec(header);
  if (!match) return null;
  const user = db().users.find((u) => u.id === match[1]);
  if (!user) return null;
  return Number(match[2]) < Date.now() ? "expired" : user;
}

export interface Ctx<B = unknown> {
  request: Request;
  url: URL;
  params: Record<string, string>;
  body: B;
  user: MockUser;
  company: CompanyRef;
}

type Method = "get" | "post" | "patch" | "put" | "delete";
type Resolver<B> = (ctx: Ctx<B>) => Response | Promise<Response>;

async function preamble(): Promise<Response | null> {
  if (mockConfig.latency) await delay(150 + Math.floor(Math.random() * 450));
  if (mockConfig.chaos && Math.random() < 0.2) {
    return fail(500, "INTERNAL_ERROR", "Injected failure (mock chaos toggle).");
  }
  return null;
}

async function readBody(request: Request): Promise<unknown> {
  if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) return undefined;
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

/** A public endpoint (sign-in, password reset). */
export function publicRoute<B = unknown>(
  method: Method,
  path: string,
  resolver: (ctx: { request: Request; url: URL; body: B }) => Response | Promise<Response>,
): HttpHandler {
  return http[method](apiPath(path), async ({ request }) => {
    const early = await preamble();
    if (early) return early;
    return resolver({ request, url: new URL(request.url), body: (await readBody(request)) as B });
  });
}

/**
 * An authenticated endpoint. Checks, in order: token, company scope (X-Company-Id), permission.
 * `permission` null = any signed-in user.
 */
export function route<B = unknown>(method: Method, path: string, permission: string | null, resolver: Resolver<B>): HttpHandler {
  return http[method](apiPath(path), async ({ request, params }) => {
    const early = await preamble();
    if (early) return early;

    const user = userFromToken(request);
    if (user === "expired") return fail(401, "SESSION_EXPIRED", "The access token has expired.");
    if (!user) return fail(401, "NOT_AUTHENTICATED", "Sign in to continue.");

    const companyId = request.headers.get("X-Company-Id") ?? user.default_company_id;
    const company = db().companies.find((c) => c.id === companyId && user.company_ids.includes(c.id));
    // Out-of-scope records answer 404, not 403 (SRS §13.1).
    if (!company) return fail(404, "NOT_FOUND", "Company not found.");

    if (permission && !hasPermission(user.permissions, permission)) {
      return fail(403, "FORBIDDEN", `Permission ${permission} is required.`);
    }
    return resolver({
      request,
      url: new URL(request.url),
      params: params as Record<string, string>,
      body: (await readBody(request)) as B,
      user,
      company,
    });
  });
}

/** Cursor pagination: `{ data, page: { next_cursor, limit, total } }`, limit ≤ 200. */
export function paginate<T>(items: T[], url: URL) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const cursor = url.searchParams.get("cursor");
  const start = cursor ? Number(atob(cursor)) || 0 : 0;
  const data = items.slice(start, start + limit);
  const next = start + limit < items.length ? btoa(String(start + limit)) : null;
  return HttpResponse.json({ data, page: { next_cursor: next, limit, total: items.length } });
}

interface StoredReply {
  fingerprint: string;
  status: number;
  body: unknown;
}

const idempotencyStore = new Map<string, StoredReply>();

export function resetIdempotency() {
  idempotencyStore.clear();
}

/**
 * Idempotency-Key handling: keys are scoped by user and endpoint; a replay returns the stored
 * response; the same key with a different body answers 409 IDEMPOTENCY_KEY_REUSED.
 */
export async function idempotent(ctx: Ctx, run: () => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }) {
  const key = ctx.request.headers.get("Idempotency-Key");
  if (!key) {
    return fail(400, "MALFORMED_REQUEST", "Idempotency-Key header is required.", [{ field: "Idempotency-Key", issue: "required" }]);
  }
  const storeKey = `${ctx.user.id}|${ctx.request.method} ${ctx.url.pathname}|${key}`;
  const fingerprint = JSON.stringify(ctx.body ?? null);
  const stored = idempotencyStore.get(storeKey);
  if (stored) {
    if (stored.fingerprint !== fingerprint) {
      return fail(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
    }
    return HttpResponse.json(stored.body as Record<string, unknown>, { status: stored.status, headers: { "Idempotent-Replayed": "true" } });
  }
  const result = await run();
  // Only completed commands are stored; a failed attempt may be retried with the same key.
  if (result.status < 400) idempotencyStore.set(storeKey, { fingerprint, ...result });
  return HttpResponse.json(result.body as Record<string, unknown>, { status: result.status });
}

/** If-Match / version check for draft edits → 409 VERSION_CONFLICT when stale. */
export function versionConflict(ctx: Ctx, currentVersion: number): Response | null {
  const sent = ctx.request.headers.get("If-Match") ?? String((ctx.body as { version?: number } | undefined)?.version ?? "");
  if (sent === "" || Number(sent) === currentVersion) return null;
  return fail(409, "VERSION_CONFLICT", "This record was changed by someone else.", [
    { field: "version", issue: "stale", value: String(currentVersion) },
  ]);
}
