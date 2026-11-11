import { delay, http, HttpResponse, type HttpHandler } from "msw";
import type { CompanyRef } from "@/lib/api/types/auth";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "./db";
import { appendAudit } from "./db/admin";
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

/** Access token: user, session and expiry. The session can be revoked; the token then stops working. */
export function issueToken(user: MockUser, sessionId?: string): string {
  return `mock.${user.id}.${sessionId ?? "test"}.${Date.now() + mockConfig.accessTokenSeconds * 1000}`;
}

function userFromToken(request: Request): MockUser | "expired" | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer mock\.([^.]+)\.([^.]+)\.(\d+)$/.exec(header);
  if (!match) return null;
  const user = db().users.find((u) => u.id === match[1]);
  // Deactivation and session revocation take effect on the next request (AT-AUTH-02).
  if (!user || user.status !== "ACTIVE") return null;
  if (match[2] !== "test") {
    const session = db().sessions.find((s) => s.id === match[2] && s.user_id === user.id);
    if (!session) return null;
    session.last_activity_at = new Date().toISOString();
  }
  return Number(match[3]) < Date.now() ? "expired" : user;
}

// ------------------------------------------------------------------ audit trail (SRS §6.18)

const SECRET_FIELDS = /password|otp|token|secret/i;

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}, depth = 0): Record<string, string> {
  if (value === null || value === undefined) return out;
  if (typeof value !== "object") {
    out[prefix] = SECRET_FIELDS.test(prefix) ? "••••" : prefix.endsWith("account_number") ? `•••• ${String(value).replace(/\D/g, "").slice(-4)}` : String(value);
    return out;
  }
  if (depth > 2) return out;
  if (Array.isArray(value)) {
    out[prefix] = `${value.length} item${value.length === 1 ? "" : "s"}`;
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (["history", "lines", "settlements", "approval_steps", "attachments", "allocations", "rows", "preview", "errors", "created", "skipped"].includes(k)) continue;
    flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  }
  return out;
}

/** Record one audit event in the append-only, hash-chained log (FR-AUD-001, FR-AUD-004). */
export function audit(input: {
  user: MockUser | null; request: Request; event_type: string; entity_type: string; entity_id: string | null;
  outcome: "SUCCESS" | "DENIED" | "FAILED"; reason?: string | null; after?: unknown; companyId?: string | null;
}) {
  const store = db();
  const after = input.after === undefined ? null : flatten(input.after);
  // Before values: the state recorded by the previous event on the same entity.
  const previous = input.entity_id ? [...store.auditLogs].reverse().find((e) => e.entity_type === input.entity_type && e.entity_id === input.entity_id && e.outcome === "SUCCESS") : undefined;
  const before: Record<string, string> = previous ? Object.fromEntries(previous.changes.map((c) => [c.field, c.after ?? ""])) : {};
  const changes = after
    ? Object.keys(after).filter((k) => !["version", "row_version", "updated_at"].includes(k) && before[k] !== after[k]).map((k) => ({ field: k, before: before[k] ?? null, after: after[k] }))
    : [];
  // Keep the full state in the event so that the next change can show its before values.
  const unchanged = after ? Object.keys(after).filter((k) => before[k] === after[k]).map((k) => ({ field: k, before: after[k], after: after[k] })) : [];
  appendAudit(store.auditLogs, {
    at: new Date().toISOString(), user_id: input.user?.id ?? null, user_name: input.user?.full_name ?? "Anonymous", event_type: input.event_type,
    entity_type: input.entity_type, entity_id: input.entity_id, company_id: input.companyId ?? input.user?.default_company_id ?? null, branch_id: input.request.headers.get("X-Branch-Id"),
    ip: "127.0.0.1", user_agent: input.request.headers.get("User-Agent") || "Browser", correlation_id: uuid(), reason: input.reason ?? null,
    changes: [...changes, ...unchanged].slice(0, 80), outcome: input.outcome,
  });
}

/** "/journal-entries/:id/post" → entity "journal-entries", action "post". */
function eventOf(method: Method, path: string, params: Record<string, string>) {
  const parts = path.split("/").filter(Boolean);
  const entity = parts[0] ?? "unknown";
  const statics = parts.filter((p) => !p.startsWith(":"));
  const action = method === "post" && statics.length === 1 ? "create" : method === "patch" || method === "put" ? "update" : method === "delete" ? "delete" : statics.slice(1).join(".") || "create";
  const idParam = parts.find((p) => p.startsWith(":"))?.slice(1);
  return { entity, action, id: idParam ? params[idParam] ?? null : null };
}

async function recordFromResponse(response: Response, method: Method, path: string, ctx: Ctx) {
  if (response.headers.get("Idempotent-Replayed")) return;
  const denied = response.status === 403;
  if (method === "get" && !denied) return;
  if (!denied && response.status >= 400) return;
  const { entity, action, id } = eventOf(method, path, ctx.params);
  let body: unknown = undefined;
  if (!denied && (response.headers.get("Content-Type") ?? "").includes("application/json")) {
    try {
      body = await response.clone().json();
    } catch {
      body = undefined;
    }
  }
  const b = (ctx.body ?? {}) as { reason?: string; comment?: string };
  const entityId = id ?? ((body as { id?: string } | undefined)?.id ?? null);
  audit({
    user: ctx.user, request: ctx.request, event_type: `${entity}.${action}`, entity_type: entity, entity_id: entityId, outcome: denied ? "DENIED" : "SUCCESS",
    reason: b.reason || b.comment || null, after: denied ? undefined : body, companyId: ctx.company.id,
  });
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
      const denied = fail(403, "FORBIDDEN", `Permission ${permission} is required.`);
      if (method !== "get") {
        const { entity, action, id } = eventOf(method, path, params as Record<string, string>);
        audit({ user, request, event_type: `${entity}.${action}`, entity_type: entity, entity_id: id, outcome: "DENIED", reason: `Missing ${permission}`, companyId: company.id });
      }
      return denied;
    }
    const ctx: Ctx<B> = { request, url: new URL(request.url), params: params as Record<string, string>, body: (await readBody(request)) as B, user, company };
    const response = await resolver(ctx);
    // Every change and every refused attempt is audited (FR-AUD-001, AT-RBAC-01, AT-IMP-03).
    await recordFromResponse(response, method, path, ctx as Ctx);
    return response;
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
/** Requests still running, so that a concurrent duplicate waits for the first (SRS AT-GL-03). */
const inFlight = new Map<string, { fingerprint: string; reply: Promise<{ status: number; body: unknown }> }>();

export function resetIdempotency() {
  idempotencyStore.clear();
  inFlight.clear();
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
  const reused = () => fail(409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
  const replay = (reply: { status: number; body: unknown }) =>
    HttpResponse.json(reply.body as Record<string, unknown>, { status: reply.status, headers: { "Idempotent-Replayed": "true" } });

  const stored = idempotencyStore.get(storeKey);
  if (stored) return stored.fingerprint === fingerprint ? replay(stored) : reused();
  const running = inFlight.get(storeKey);
  if (running) return running.fingerprint === fingerprint ? replay(await running.reply) : reused();

  const reply = Promise.resolve().then(run);
  inFlight.set(storeKey, { fingerprint, reply });
  try {
    const result = await reply;
    // Only completed commands are stored; a failed attempt may be retried with the same key.
    if (result.status < 400) idempotencyStore.set(storeKey, { fingerprint, ...result });
    return HttpResponse.json(result.body as Record<string, unknown>, { status: result.status });
  } finally {
    inFlight.delete(storeKey);
  }
}

/** If-Match / version check for draft edits → 409 VERSION_CONFLICT when stale. */
export function versionConflict(ctx: Ctx, currentVersion: number): Response | null {
  const sent = ctx.request.headers.get("If-Match") ?? String((ctx.body as { version?: number } | undefined)?.version ?? "");
  if (sent === "" || Number(sent) === currentVersion) return null;
  return fail(409, "VERSION_CONFLICT", "This record was changed by someone else.", [
    { field: "version", issue: "stale", value: String(currentVersion) },
  ]);
}
