import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { api, apiContext } from "@/lib/api/client";
import { accountsApi } from "@/lib/api/endpoints/accounts";
import { authApi } from "@/lib/api/endpoints/auth";
import { orgApi } from "@/lib/api/endpoints/org";
import { ApiError, ERROR_CODES, parseErrorResponse } from "@/lib/api/errors";
import { IdempotencyKeyHolder, newIdempotencyKey, runIdempotent } from "@/lib/api/idempotency";
import { describeError } from "@/lib/i18n/error-messages";
import en from "@/messages/en.json";
import km from "@/messages/km.json";
import { DEMO_OTP, DEMO_PASSWORD } from "@/mocks/db/seed";
import { idempotent, mockConfig, route, versionConflict } from "@/mocks/http";
import { server } from "@/mocks/server";

const signIn = async (username: string) => {
  const session = await authApi.login({ username, password: DEMO_PASSWORD, otp: DEMO_OTP });
  apiContext.accessToken = session.access_token;
  apiContext.companyId = session.user.default_company_id;
  return session;
};

const caught = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
};

describe("error codes map to messages in both languages (NFR-USA-004)", () => {
  it.each(ERROR_CODES)("%s", (code) => {
    expect((en.errors as Record<string, string>)[code]?.trim()).toBeTruthy();
    expect((km.errors as Record<string, string>)[code]?.trim()).toBeTruthy();
  });

  it("describes an API error with its localised message and correlation ID", () => {
    const t = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], km) as string;
    const error = new ApiError({ status: 409, code: "PERIOD_CLOSED", message: "server text", correlationId: "abc-123" });
    expect(describeError(error, t)).toMatchObject({ code: "PERIOD_CLOSED", message: km.errors.PERIOD_CLOSED, reference: "abc-123" });
  });

  it("falls back to a generic message for unknown codes and non-API errors", () => {
    const t = (key: string) => key;
    expect(describeError(new ApiError({ status: 418, code: "TEAPOT" }), t).code).toBe("UNKNOWN_ERROR");
    expect(describeError(new Error("boom"), t).message).toBe("errors.UNKNOWN_ERROR");
  });
});

describe("standard error body (SRS 13.1)", () => {
  it("parses code, message, details and correlation_id", async () => {
    const response = HttpResponse.json(
      {
        error: {
          code: "JOURNAL_UNBALANCED",
          message: "Total debits (1,000.00) do not equal total credits (999.00).",
          details: [{ field: "lines", issue: "difference", value: "1.00" }],
          correlation_id: "4f0d9a7e",
        },
      },
      { status: 422 },
    );
    const error = await parseErrorResponse(response);
    expect(error).toMatchObject({ status: 422, code: "JOURNAL_UNBALANCED", correlationId: "4f0d9a7e" });
    expect(error.fieldErrors).toEqual({ lines: "difference" });
  });

  it("falls back to the HTTP status when the body is not the standard shape", async () => {
    expect((await parseErrorResponse(new Response("oops", { status: 503 }))).code).toBe("SERVICE_UNAVAILABLE");
    const limited = await parseErrorResponse(new Response("", { status: 429, headers: { "Retry-After": "30" } }));
    expect(limited).toMatchObject({ code: "RATE_LIMITED", retryAfter: 30 });
  });
});

describe("sign-in against the mock backend", () => {
  it("signs in a user without MFA and returns permissions and companies", async () => {
    const session = await authApi.login({ username: "acct", password: DEMO_PASSWORD });
    expect(session.user.roles).toEqual(["ACCT"]);
    expect(session.user.permissions).toContain("gl.journal.create");
    expect(session.companies[0].branches).toHaveLength(3);
    expect(session.user).not.toHaveProperty("password");
  });

  it("uses a generic message for wrong credentials", async () => {
    expect((await caught(authApi.login({ username: "acct", password: "wrong" }))).code).toBe("INVALID_CREDENTIALS");
    expect((await caught(authApi.login({ username: "nobody", password: "wrong" }))).code).toBe("INVALID_CREDENTIALS");
  });

  it("asks for a verification code when MFA is mandatory for the role (D-17)", async () => {
    expect((await caught(authApi.login({ username: "finmgr", password: DEMO_PASSWORD }))).code).toBe("MFA_REQUIRED");
    expect((await caught(authApi.login({ username: "finmgr", password: DEMO_PASSWORD, otp: "000000" }))).code).toBe("INVALID_OTP");
    expect((await authApi.login({ username: "finmgr", password: DEMO_PASSWORD, otp: DEMO_OTP })).user.roles).toEqual(["FINMGR"]);
  });

  it("locks the account after 5 failed attempts (FR-AUTH-009)", async () => {
    for (let i = 0; i < 4; i += 1) await caught(authApi.login({ username: "aro", password: "wrong" }));
    const locked = await caught(authApi.login({ username: "aro", password: "wrong" }));
    expect(locked.code).toBe("LOCKED");
    expect(locked.details[0].field).toBe("locked_until");
    expect((await caught(authApi.login({ username: "aro", password: DEMO_PASSWORD }))).code).toBe("LOCKED");
  });
});

describe("API client", () => {
  it("sends the bearer token, company and language headers", async () => {
    await signIn("acct");
    apiContext.locale = "km";
    let seen: Headers | null = null;
    server.use(route("get", "/probe", null, ({ request }) => {
      seen = request.headers;
      return HttpResponse.json({ ok: true });
    }));
    await api.get("/probe");
    expect(seen!.get("Authorization")).toMatch(/^Bearer mock\./);
    expect(seen!.get("X-Company-Id")).toBe("cmp-demo");
    expect(seen!.get("Accept-Language")).toBe("km");
    apiContext.locale = "en";
  });

  it("rejects requests without a token", async () => {
    expect((await caught(accountsApi.list())).code).toBe("NOT_AUTHENTICATED");
  });

  it("refreshes once on SESSION_EXPIRED and repeats the request", async () => {
    mockConfig.accessTokenSeconds = -1; // every token is already expired
    await signIn("acct");
    mockConfig.accessTokenSeconds = 15 * 60; // the refreshed token is valid
    const page = await accountsApi.list({ posting: true, limit: 5 });
    expect(page.data).toHaveLength(5);
  });

  it("answers 403 FORBIDDEN without the permission", async () => {
    await signIn("sysadmin"); // no coa.view
    const error = await caught(accountsApi.list());
    expect(error).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(error.correlationId).toBeTruthy();
  });

  it("paginates with cursors", async () => {
    await signIn("finmgr");
    const first = await accountsApi.list({ limit: 20 });
    expect(first.page).toMatchObject({ limit: 20, total: 56 });
    const second = await accountsApi.list({ limit: 20, cursor: first.page.next_cursor });
    expect(second.data[0].code > first.data[19].code).toBe(true);
  });

  it("hides sensitive accounts from roles without access (FR-RBAC-005)", async () => {
    await signIn("acct");
    const codes = (await accountsApi.list({ limit: 200 })).data.map((a) => a.code);
    expect(codes).not.toContain("6300");
    expect((await caught(accountsApi.get("acc-6300"))).code).toBe("NOT_FOUND");
    await signIn("finmgr");
    expect((await accountsApi.list({ limit: 200 })).data.map((a) => a.code)).toContain("6300");
  });

  it("offers only posting accounts to pickers (BR-COA-001)", async () => {
    await signIn("acct");
    const accounts = (await accountsApi.list({ posting: true, limit: 200 })).data;
    expect(accounts.every((a) => a.is_posting)).toBe(true);
    expect(accounts.map((a) => a.code)).not.toContain("1100");
  });

  it("answers RATE_MISSING when no exchange rate exists for the date (BR-FX-002)", async () => {
    await signIn("acct");
    expect((await orgApi.rateOn("KHR", "USD", "2027-03-31")).rate).toMatch(/^0\.0002\d{8}$/);
    expect((await caught(orgApi.rateOn("KHR", "USD", "2028-01-01"))).code).toBe("RATE_MISSING");
  });
});

describe("idempotency (SRS 13.1, RK-03)", () => {
  it("creates RFC 4122 v4 keys", () => {
    expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps the same key when a request fails on the network, and a new key for a new action", async () => {
    const holder = new IdempotencyKeyHolder();
    const keys: string[] = [];
    const flaky = (key: string) => {
      keys.push(key);
      return keys.length === 1 ? Promise.reject(new ApiError({ status: 0, code: "NETWORK_ERROR" })) : Promise.resolve("JV-1");
    };
    await expect(runIdempotent(holder, flaky)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    await expect(runIdempotent(holder, flaky)).resolves.toBe("JV-1");
    expect(keys[1]).toBe(keys[0]);
    await runIdempotent(holder, flaky);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("releases the key after a business error", async () => {
    const holder = new IdempotencyKeyHolder();
    await expect(runIdempotent(holder, () => Promise.reject(new ApiError({ status: 409, code: "PERIOD_CLOSED" })))).rejects.toBeTruthy();
    expect(holder.pending).toBe(false);
  });

  it("replays the stored response for the same key and rejects the key with a different body", async () => {
    await signIn("finmgr");
    let posted = 0;
    server.use(route("post", "/demo/:id/post", null, (ctx) =>
      idempotent(ctx, () => {
        posted += 1;
        return { status: 200, body: { status: "POSTED", journal_no: `JV-2027-00031${posted}` } };
      }),
    ));
    const key = newIdempotencyKey();
    const first = await api.post<{ journal_no: string }>("/demo/1/post", { a: 1 }, { idempotencyKey: key });
    const replay = await api.post<{ journal_no: string }>("/demo/1/post", { a: 1 }, { idempotencyKey: key });
    expect(replay.journal_no).toBe(first.journal_no);
    expect(posted).toBe(1);
    expect((await caught(api.post("/demo/1/post", { a: 2 }, { idempotencyKey: key }))).code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect((await caught(api.post("/demo/1/post", { a: 1 }))).code).toBe("MALFORMED_REQUEST");
  });

  it("answers VERSION_CONFLICT for a stale If-Match", async () => {
    await signIn("acct");
    server.use(route("patch", "/demo/:id", null, (ctx) => versionConflict(ctx, 3) ?? HttpResponse.json({ version: 4 })));
    expect(await api.patch<{ version: number }>("/demo/1", {}, 3)).toEqual({ version: 4 });
    expect((await caught(api.patch("/demo/1", {}, 2))).code).toBe("VERSION_CONFLICT");
  });
});
