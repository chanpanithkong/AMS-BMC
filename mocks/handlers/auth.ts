import { HttpResponse } from "msw";
import type { LoginRequest, ResetPasswordRequest, SessionResponse } from "@/lib/api/types/auth";
import { db } from "../db";
import { DEMO_OTP, type MockUser } from "../db/seed";
import { fail, issueToken, mockConfig, publicRoute, route } from "../http";

// SRS §13.3 /auth, FR-AUTH-001..009.

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_KEY = "ams.mock.refresh-session";

// The real backend keeps the refresh token in an HttpOnly cookie. A service worker cannot set one,
// so the mock keeps a session marker (a user id, not a token) in sessionStorage to survive reloads.
let memorySession: string | null = null;

function rememberSession(userId: string | null) {
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

function toSession(user: MockUser): SessionResponse {
  // Strip mock-only fields before the user object leaves the "server".
  const { password, company_ids, failed_attempts, locked_until, ...publicUser } = user;
  void password;
  void failed_attempts;
  void locked_until;
  return {
    access_token: issueToken(user),
    expires_in: mockConfig.accessTokenSeconds,
    user: publicUser,
    companies: db().companies.filter((c) => company_ids.includes(c.id)),
  };
}

export const authHandlers = [
  publicRoute<LoginRequest>("post", "/auth/login", ({ body }) => {
    const identifier = (body?.username ?? "").trim().toLowerCase();
    const user = db().users.find((u) => u.username === identifier || u.email === identifier);
    // Generic message: never reveal which field was wrong (SRS §6.1).
    const invalid = () => fail(401, "INVALID_CREDENTIALS", "Incorrect sign-in details");
    if (!user) return invalid();

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
        return fail(401, "LOCKED", "Account locked", [
          { field: "locked_until", value: new Date(user.locked_until).toISOString() },
        ]);
      }
      return invalid();
    }
    if (user.mfa_enabled) {
      // ASSUMPTION: two-step sign-in — the first call answers MFA_REQUIRED, the second carries `otp`.
      if (!body.otp) return fail(401, "MFA_REQUIRED", "Verification code required");
      if (body.otp !== DEMO_OTP) return fail(401, "INVALID_OTP", "Invalid verification code", [{ field: "otp", issue: "invalid" }]);
    }
    user.failed_attempts = 0;
    user.locked_until = null;
    rememberSession(user.id);
    return HttpResponse.json(toSession(user));
  }),

  publicRoute("post", "/auth/refresh", () => {
    const user = db().users.find((u) => u.id === recallSession());
    if (!user) return fail(401, "NOT_AUTHENTICATED", "No active session.");
    return HttpResponse.json(toSession(user));
  }),

  route("post", "/auth/logout", null, () => {
    rememberSession(null);
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

/** Test helper. */
export function clearMockSession() {
  rememberSession(null);
}
