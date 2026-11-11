import { HttpResponse } from "msw";
import type { LoginRequest, ResetPasswordRequest, SessionResponse } from "@/lib/api/types/auth";
import { db } from "../db";
import { DEMO_OTP, type MockUser } from "../db/seed";
import { audit, fail, issueToken, mockConfig, publicRoute, route } from "../http";

// SRS §13.3 /auth, FR-AUTH-001..009.

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_KEY = "ams.mock.refresh-session";

// The real backend keeps the refresh token in an HttpOnly cookie. A service worker cannot set one,
// so the mock keeps a session marker (a user id, not a token) in sessionStorage to survive reloads.
let memorySession: string | null = null;

function rememberSession(userId: string | null) {
  // The marker is "user|session" so that a reload continues the same session.
  memorySession = userId;
  try {
    if (userId) sessionStorage.setItem(SESSION_KEY, userId);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // no sessionStorage in Node (unit tests)
  }
}

function recallSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? memorySession;
  } catch {
    return memorySession;
  }
}

function toSession(user: MockUser, sessionId?: string): SessionResponse {
  // Only the public fields leave the "server".
  const publicUser = {
    id: user.id, username: user.username, email: user.email, full_name: user.full_name, full_name_km: user.full_name_km, roles: user.roles,
    permissions: user.permissions, locale: user.locale, date_format: user.date_format, negative_style: user.negative_style, mfa_enabled: user.mfa_enabled,
    default_company_id: user.default_company_id, department_ids: user.department_ids, cash_account_ids: user.cash_account_ids,
  };
  return {
    access_token: issueToken(user, sessionId),
    expires_in: mockConfig.accessTokenSeconds,
    user: publicUser,
    companies: db().companies.filter((c) => user.company_ids.includes(c.id)),
  };
}

export const authHandlers = [
  publicRoute<LoginRequest>("post", "/auth/login", ({ body, request }) => {
    const identifier = (body?.username ?? "").trim().toLowerCase();
    const user = db().users.find((u) => u.username === identifier || u.email === identifier);
    const event = (type: string, outcome: "SUCCESS" | "DENIED" | "FAILED", reason: string | null = null) =>
      audit({ user: user ?? null, request, event_type: type, entity_type: "auth", entity_id: user?.id ?? identifier, outcome, reason });
    // Generic message: never reveal which field was wrong (SRS §6.1).
    const invalid = () => fail(401, "INVALID_CREDENTIALS", "Incorrect sign-in details");
    if (!user) {
      event("auth.login_failed", "FAILED", "Unknown user");
      return invalid();
    }
    // A deactivated user cannot sign in (FR-AUTH-005).
    if (user.status !== "ACTIVE") {
      event("auth.login_failed", "DENIED", "Account deactivated");
      return invalid();
    }

    if (user.locked_until && user.locked_until > Date.now()) {
      return fail(401, "LOCKED", "Account locked", [
        { field: "locked_until", value: new Date(user.locked_until).toISOString() },
      ]);
    }
    if (body.password !== user.password) {
      user.failed_attempts += 1;
      if (user.failed_attempts >= MAX_FAILED_ATTEMPTS) {
        user.failed_attempts = 0;
        user.locked_until = Date.now() + LOCK_MINUTES * 60_000;
        event("auth.lockout", "DENIED", `${MAX_FAILED_ATTEMPTS} failed attempts`);
        return fail(401, "LOCKED", "Account locked", [
          { field: "locked_until", value: new Date(user.locked_until).toISOString() },
        ]);
      }
      event("auth.login_failed", "FAILED", "Wrong password");
      return invalid();
    }
    if (user.mfa_enabled) {
      // ASSUMPTION: two-step sign-in — the first call answers MFA_REQUIRED, the second carries `otp`.
      if (!body.otp) return fail(401, "MFA_REQUIRED", "Verification code required");
      if (body.otp !== DEMO_OTP) return fail(401, "INVALID_OTP", "Invalid verification code", [{ field: "otp", issue: "invalid" }]);
    }
    user.failed_attempts = 0;
    user.locked_until = null;
    user.last_login_at = new Date().toISOString();
    const session = openSession(user, request);
    rememberSession(`${user.id}|${session}`);
    event("auth.login", "SUCCESS");
    return HttpResponse.json(toSession(user, session));
  }),

  publicRoute("post", "/auth/refresh", () => {
    const [userId, sessionId] = (recallSession() ?? "").split("|");
    const user = db().users.find((u) => u.id === userId);
    const session = db().sessions.find((s) => s.id === sessionId && s.user_id === userId);
    // Revoked sessions and deactivated users cannot refresh (FR-AUTH-002, AT-AUTH-02).
    if (!user || !session || user.status !== "ACTIVE") return fail(401, "NOT_AUTHENTICATED", "No active session.");
    return HttpResponse.json(toSession(user, session.id));
  }),

  route("post", "/auth/logout", null, ({ request, user }) => {
    const sessionId = sessionOf(request);
    db().sessions = db().sessions.filter((s) => s.id !== sessionId);
    rememberSession(null);
    audit({ user, request, event_type: "auth.logout", entity_type: "auth", entity_id: user.id, outcome: "SUCCESS" });
    return new HttpResponse(null, { status: 204 });
  }),

  // Never reveals whether the account exists (FR-AUTH-004).
  publicRoute("post", "/auth/password/forgot", () => new HttpResponse(null, { status: 204 })),

  publicRoute<ResetPasswordRequest>("post", "/auth/password/reset", ({ body }) => {
    if (!body?.token || body.token === "expired") {
      return fail(422, "INVALID_TOKEN", "This reset link is invalid or has expired.", [{ field: "token", issue: "invalid" }]);
    }
    // Password policy: at least 12 characters (SRS §6.1).
    if ((body.new_password ?? "").length < 12) {
      return fail(422, "VALIDATION_ERROR", "Validation failed", [
        { field: "new_password", issue: "too_short", message: "Password must be at least 12 characters." },
      ]);
    }
    return new HttpResponse(null, { status: 204 });
  }),
];

let sessionCounter = 0;

function openSession(user: MockUser, request: Request): string {
  const id = `ses-${Date.now().toString(36)}-${(sessionCounter += 1)}`;
  const at = new Date().toISOString();
  db().sessions.push({ id, user_id: user.id, created_at: at, last_activity_at: at, device: request.headers.get("User-Agent") || "Browser", ip: "127.0.0.1", current: false });
  return id;
}

const sessionOf = (request: Request) => /^Bearer mock\.[^.]+\.([^.]+)\.\d+$/.exec(request.headers.get("Authorization") ?? "")?.[1] ?? null;

/** Test helper. */
export function clearMockSession() {
  rememberSession(null);
}
