// @vitest-environment node
import { describe, expect, it } from "vitest";
import { api, apiContext, apiFetch } from "@/lib/api/client";
import { adminApi, auditApi, settingsApi } from "@/lib/api/endpoints/admin";
import { authApi } from "@/lib/api/endpoints/auth";
import { reportsApi } from "@/lib/api/endpoints/reports";
import type { ApiError } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import type { Page } from "@/lib/api/types/common";
import type { ApprovalItem, JournalEntry, JournalInput } from "@/lib/api/types/journals";
import { sha256 } from "@/lib/crypto/sha256";
import { db } from "@/mocks/db";
import { DEMO_OTP, DEMO_PASSWORD } from "@/mocks/db/seed";

// SRS acceptance tests AT-AUTH-01..02, AT-RBAC-01, AT-AUD-01..03, AT-WFL-01..03, AT-CFG-01..02, AT-IMP-03.

async function as(username: string) {
  const session = await authApi.login({ username, password: DEMO_PASSWORD, otp: DEMO_OTP });
  apiContext.accessToken = session.access_token;
  apiContext.companyId = session.user.default_company_id;
  return session.access_token;
}
const caught = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected the request to fail");
};
const k = () => ({ idempotencyKey: newIdempotencyKey() });
const line = (account: string, debit: string, credit: string, branch: string | null = null) => ({
  account_id: `acc-${account}`, description: "", debit, credit, currency: "USD", rate: "1", branch_id: branch, department_id: null, dimensions: {},
});
const draft = (amount = "250.00", branch: string | null = null): JournalInput => ({
  posting_date: "2027-04-05", document_date: "2027-04-05", description: "Accrual", reference: `T-${Math.random()}`, currency: "USD", type: "MANUAL",
  lines: [line("6200", amount, "0", branch), line("2150", "0", amount, branch)],
});
const events = (type: string) => db().auditLogs.filter((e) => e.event_type === type);

describe("hash and audit chain", () => {
  it("SHA-256 matches the standard test vectors", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("AT-AUD-01: posting a journal is audited with its status change and number", async () => {
    await as("acct");
    const j = await api.post<JournalEntry>("/journal-entries", draft());
    await api.post(`/journal-entries/${j.id}/submit`);
    await as("finmgr");
    await api.post(`/journal-entries/${j.id}/approve`, { action: "approve" }, k());
    const posted = await api.post<JournalEntry>(`/journal-entries/${j.id}/post`, undefined, k());
    const e = events("journal-entries.post").find((x) => x.entity_id === j.id)!;
    expect(e).toMatchObject({ user_name: "Keo Vannak", outcome: "SUCCESS" });
    expect(e.changes.find((c) => c.field === "status")).toMatchObject({ before: "APPROVED", after: "POSTED" });
    expect(e.changes.find((c) => c.field === "journal_no")?.after).toBe(posted.journal_no);
  });

  it("AT-AUD-02: altering a stored event breaks the chain at that event", async () => {
    await as("auditor");
    expect((await auditApi.integrity()).ok).toBe(true);
    db().auditLogs[5].user_name = "Someone else";
    const check = await auditApi.integrity();
    expect(check).toMatchObject({ ok: false, broken_at: 6 });
  });

  it("AT-AUD-03: reversing without a reason answers REASON_REQUIRED", async () => {
    await as("finmgr");
    const posted = db().journals.find((j) => j.status === "POSTED" && j.type !== "OPENING" && j.type !== "SYSTEM")!;
    expect((await caught(api.post(`/journal-entries/${posted.id}/reverse`, { reversal_date: "2027-04-05", reason: "" }, k()))).code).toBe("REASON_REQUIRED");
  });

  it("AT-IMP-03: a report export is recorded in the audit trail, and so is an audit export", async () => {
    await as("finmgr");
    await reportsApi.export("trial-balance", "csv", { date_from: "2027-01-01", date_to: "2027-03-31" });
    expect(events("reports.export").length).toBe(1);
    await as("auditor");
    const blob = await apiFetch<Blob>("/audit-logs/export", { method: "POST", responseType: "blob", query: { event_type: "reports" } });
    expect(await blob.text()).toContain("reports.export");
    expect(events("audit-logs.export").length).toBe(1);
  });
});

describe("authentication", () => {
  it("AT-AUTH-01: five wrong passwords lock the account and the lockout is logged", async () => {
    for (let i = 0; i < 5; i += 1) await caught(authApi.login({ username: "aro", password: "wrong" }));
    expect((await caught(authApi.login({ username: "aro", password: DEMO_PASSWORD }))).code).toBe("LOCKED");
    expect(events("auth.lockout").at(-1)?.entity_id).toBe("usr-aro");
    expect(events("auth.login_failed").length).toBeGreaterThanOrEqual(4);
  });

  it("AT-AUTH-02: deactivating a user ends both sessions; their journals stay", async () => {
    const first = await as("acct");
    const second = await as("acct");
    const before = db().journals.filter((j) => j.preparer_id === "usr-acct").length;
    await as("sysadmin");
    expect((await adminApi.sessions("usr-acct")).data.length).toBeGreaterThanOrEqual(2);
    await adminApi.setStatus("usr-acct", "INACTIVE", "Left the company");
    for (const token of [first, second]) {
      apiContext.accessToken = token;
      expect((await caught(api.get("/journal-entries"))).status).toBe(401);
    }
    expect(db().journals.filter((j) => j.preparer_id === "usr-acct").length).toBe(before);
    expect((await caught(authApi.login({ username: "acct", password: DEMO_PASSWORD }))).code).toBe("INVALID_CREDENTIALS");
  });
});

describe("roles and access", () => {
  it("AT-RBAC-01: a user limited to Phnom Penh gets 404 for a Siem Reap journal, and the attempt is logged", async () => {
    await as("sysadmin");
    const acct = await adminApi.user("usr-acct");
    await adminApi.setAccess("usr-acct", { roles: acct.roles, company_ids: acct.company_ids, branch_ids: ["br-pp"], department_ids: [], cash_account_ids: [], approval_limit: acct.approval_limit }, acct.version);
    const sr = db().journals.find((j) => j.status === "POSTED" && j.lines.every((l) => !l.branch_id || l.branch_id === "br-sr") && j.lines.some((l) => l.branch_id === "br-sr"))!;
    await as("acct");
    expect((await caught(api.get(`/journal-entries/${sr.id}`))).status).toBe(404);
    expect(events("journal-entries.access_denied").at(-1)).toMatchObject({ entity_id: sr.id, outcome: "DENIED" });
  });

  it("nobody changes their own permissions; SoD conflicts are refused; sensitive grants wait for the Owner", async () => {
    await as("sysadmin");
    const me = await adminApi.user("usr-sysadmin");
    expect((await caught(adminApi.setAccess("usr-sysadmin", { ...me, roles: ["SYSADMIN", "OWNER"] }, me.version))).code).toBe("SELF_PERMISSION_CHANGE");
    const apo = await adminApi.user("usr-apo");
    const conflict = await caught(adminApi.setAccess("usr-apo", { ...apo, roles: ["APO", "FINMGR"] }, apo.version));
    expect(conflict.code).toBe("SOD_CONFLICT");
    expect(conflict.message).toContain("create supplier and release payment");
    const ro = await adminApi.user("usr-readonly");
    const pending = await adminApi.setAccess("usr-readonly", { ...ro, roles: ["READONLY", "AUDITOR"], approval_limit: "1000" }, ro.version);
    expect(pending.pending?.roles).toEqual(["READONLY", "AUDITOR"]);
    expect(db().users.find((u) => u.id === "usr-readonly")!.roles).toEqual(["READONLY"]);
    await as("owner");
    expect((await api.get<Page<ApprovalItem>>("/approvals")).data.some((i) => i.document_type === "USER_ACCESS")).toBe(true);
    const approved = await adminApi.decideAccess("usr-readonly", "approve", "", newIdempotencyKey());
    expect(approved.roles).toEqual(["READONLY", "AUDITOR"]);
    expect(approved.permissions).toContain("aud.view");
  });

  it("a custom role copies another and its sensitive additions need the Owner", async () => {
    await as("sysadmin");
    const role = await adminApi.createRole({ code: "AP_CLERK", name: "AP clerk", name_km: "", description: "", copy_from: "APO" });
    expect(role.base_role).toBe("APO");
    const changed = await adminApi.updateRole("AP_CLERK", { permissions: [...role.permissions, "ap.invoice.approve"] }, role.version);
    expect(changed.pending?.permissions).toContain("ap.invoice.approve");
    expect(changed.permissions).not.toContain("ap.invoice.approve");
  });
});

describe("workflow and settings", () => {
  it("AT-WFL-01: a 15,000 journal routes to the Finance Manager then the Owner; AT-WFL-03: old items are escalated", async () => {
    await as("acct");
    const j = await api.post<JournalEntry>("/journal-entries", draft("15000.00"));
    const submitted = await api.post<JournalEntry>(`/journal-entries/${j.id}/submit`);
    expect(submitted.approval_steps.map((s) => s.role)).toEqual(["FINMGR", "OWNER"]);
    await as("finmgr");
    const inbox = (await api.get<Page<ApprovalItem>>("/approvals")).data;
    expect(inbox.find((i) => i.document_id === "jnl-sub-1")?.escalated).toBe(true);
  });

  it("AT-WFL-02: delegation does not let the preparer approve their own journal", async () => {
    await as("acct");
    const j = await api.post<JournalEntry>("/journal-entries", draft());
    await api.post(`/journal-entries/${j.id}/submit`);
    await as("finmgr");
    // The delegation itself is refused, so the preparer never holds the approval.
    expect((await caught(api.post(`/journal-entries/${j.id}/delegate`, { user_id: "usr-acct" }))).code).toBe("SOD_VIOLATION");
    await as("acct");
    expect((await caught(api.post(`/journal-entries/${j.id}/approve`, { action: "approve" }, k()))).code).toBe("SOD_VIOLATION");
  });

  it("AT-CFG-01: changing the retained earnings account waits for the Owner; both actions are audited", async () => {
    await as("finmgr");
    const company = await settingsApi.get<Record<string, unknown>>("company");
    const pending = await settingsApi.save("company", { ...company.value, retained_earnings_account_id: "acc-3100" }, company.version, "Merge equity accounts");
    expect(pending.pending?.fields).toEqual(["retained_earnings_account_id"]);
    expect((pending.value as Record<string, unknown>).retained_earnings_account_id).toBe("acc-3200");
    expect((await caught(settingsApi.decide("company", "approve", "", newIdempotencyKey()))).code).toBe("FORBIDDEN");
    await as("owner");
    const done = await settingsApi.decide("company", "approve", "", newIdempotencyKey());
    expect((done.value as Record<string, unknown>).retained_earnings_account_id).toBe("acc-3100");
    expect(events("settings.update").filter((e) => e.outcome === "SUCCESS").length).toBe(1);
    expect(events("settings.decision").map((e) => e.outcome)).toEqual(["DENIED", "SUCCESS"]);
  });

  it("AT-CFG-02: removing KHR, which posted documents use, is refused with CURRENCY_IN_USE", async () => {
    await as("finmgr");
    const cur = await settingsApi.get<{ code: string; is_active: boolean }[]>("currencies");
    const error = await caught(settingsApi.save("currencies", cur.value.filter((c) => c.code !== "KHR"), cur.version));
    expect(error.code).toBe("CURRENCY_IN_USE");
  });
});
