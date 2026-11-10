import { api, refreshSession } from "../client";
import type { LoginRequest, ResetPasswordRequest, SessionResponse } from "../types/auth";

// SRS §13.3 — /api/v1/auth
export const authApi = {
  /** 401 INVALID_CREDENTIALS | LOCKED | MFA_REQUIRED | INVALID_OTP; 429 RATE_LIMITED. */
  login: (body: LoginRequest) => api.post<SessionResponse>("/auth/login", body, { anonymous: true }),
  logout: () => api.post<void>("/auth/logout"),
  /** Rotates tokens using the HttpOnly refresh cookie. */
  refresh: () => refreshSession() as unknown as Promise<SessionResponse>,
  /** Always answers 204, whether or not the account exists (FR-AUTH-004). */
  forgotPassword: (email: string) => api.post<void>("/auth/password/forgot", { email }, { anonymous: true }),
  resetPassword: (body: ResetPasswordRequest) => api.post<void>("/auth/password/reset", body, { anonymous: true }),
};
