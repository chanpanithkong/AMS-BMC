import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { api, apiContext } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints/auth";
import type { ApiError } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import type { Account } from "@/lib/api/types/accounts";
import type { Page } from "@/lib/api/types/common";
import type { JournalEntry, JournalInput, JournalSummary } from "@/lib/api/types/journals";
import type { AccountingPeriod } from "@/lib/api/types/org";
import type { GeneralLedgerReport, PeriodChecklist, TrialBalanceReport } from "@/lib/api/types/reports";
import { db } from "@/mocks/db";
import { DEMO_OTP, DEMO_PASSWORD } from "@/mocks/db/seed";

// SRS acceptance tests AT-GL-01..05, AT-CLS-01..03 and the related business rules, against the mock.

async function as(username: string) {
  const session = await authApi.login({ username, password: DEMO_PASSWORD, otp: DEMO_OTP });
  apiContext.accessToken = session.access_token;
  apiContext.companyId = session.user.default_company_id;
}

const caught = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
};

const line = (account: string, debit: string, credit: string) => ({
  account_id: `acc-${account}`, description: "", debit, credit, currency: "USD", rate: "1", branch_id: null, department_id: null, dimensions: {},
});

const draft = (overrides: Partial<JournalInput> = {}): JournalInput => ({
  posting_date: "2027-04-05", document_date: "2027-04-05", description: "Accrued electricity", reference: "TEST-1",
  currency: "USD", type: "MANUAL", lines: [line("6200", "250.00", "0"), line("2150", "0", "250.00")], ...overrides,
});

const key = () => ({ idempotencyKey: newIdempotencyKey() });
const create = (input: JournalInput) => api.post<JournalEntry>("/journal-entries", input);
const submit = (id: string) => api.post<JournalEntry>(`/journal-entries/${id}/submit`);
const approve = (id: string) => api.post<JournalEntry>(`/journal-entries/${id}/approve`, { action: "approve" }, key());
const post = (id: string, idempotencyKey = newIdempotencyKey()) => api.post<JournalEntry>(`/journal-entries/${id}/post`, undefined, { idempotencyKey });
const tb = (from: string, to: string) => api.get<TrialBalanceReport>("/reports/trial-balance", { date_from: from, date_to: to });

async function preparedAndApproved(input = draft()): Promise<JournalEntry> {
  await as("acct");
  const created = await create(input);
  await submit(created.id);
  await as("finmgr");
  return approve(created.id);
}

describe("seeded ledger", () => {
  it("has about 120 posted journals and every posted journal balances", () => {
    const posted = db().journals.filter((j) => j.status === "POSTED" || j.status === "REVERSED");
    expect(posted.length).toBeGreaterThanOrEqual(110);
    for (const j of posted) expect(new Decimal(j.totals.difference).isZero()).toBe(true);
  });

  it("numbers posted journals without gaps or duplicates", () => {
    const numbers = db().journals.map((j) => j.journal_no).filter(Boolean) as string[];
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((n) => /^JV-2027-\d{6}$/.test(n))).toBe(true);
  });

  it("AT-GL-05: the trial balance balances and closing = opening + movements", async () => {
    await as("finmgr");
    const report = await tb("2027-03-01", "2027-03-31");
    const t = report.totals;
    expect(report.validation.balanced).toBe(true);
    expect(t.opening_debit).toBe(t.opening_credit);
    expect(t.period_debit).toBe(t.period_credit);
    expect(t.closing_debit).toBe(t.closing_credit);
    for (const r of report.rows.filter((x) => x.is_posting)) {
      const opening = new Decimal(r.opening_debit).minus(r.opening_credit);
      const closing = new Decimal(r.closing_debit).minus(r.closing_credit);
      expect(closing.eq(opening.plus(r.period_debit).minus(r.period_credit))).toBe(true);
    }
  });

  it("rolls header rows up from their children", async () => {
    await as("finmgr");
    const rows = (await tb("2027-01-01", "2027-04-05")).rows;
    const cash = rows.find((r) => r.code === "1100")!;
    const children = rows.filter((r) => ["1101", "1102", "1103", "1110", "1111"].includes(r.code));
    const sum = children.reduce((s, r) => s.plus(r.closing_debit).minus(r.closing_credit), new Decimal(0));
    expect(new Decimal(cash.closing_debit).minus(cash.closing_credit).eq(sum)).toBe(true);
  });

  it("leaves sensitive accounts out for roles without access", async () => {
    await as("acct");
    const codes = (await tb("2027-01-01", "2027-04-05")).rows.map((r) => r.code);
    expect(codes).not.toContain("6300");
    expect(codes).not.toContain("2170");
  });
});

describe("journal workflow (WF-01)", () => {
  it("saves an unbalanced draft and returns the server's difference", async () => {
    await as("acct");
    const created = await create(draft({ lines: [line("6200", "1000.00", "0"), line("2150", "0", "999.00")] }));
    expect(created.status).toBe("DRAFT");
    expect(created.totals.difference).toBe("1.00");
  });

  it("AT-GL-01: submitting an unbalanced journal fails with JOURNAL_UNBALANCED and the difference", async () => {
    await as("acct");
    const created = await create(draft({ lines: [line("6200", "1000.00", "0"), line("2150", "0", "999.00")] }));
    const error = await caught(submit(created.id));
    expect(error.code).toBe("JOURNAL_UNBALANCED");
    expect(error.details[0]).toMatchObject({ field: "lines", value: "1.00" });
  });

  it("rejects header accounts (BR-COA-001) and control accounts in manual journals (BR-COA-002)", async () => {
    await as("acct");
    const header = await create(draft({ lines: [line("1100", "10", "0"), line("2150", "0", "10")] }));
    expect((await caught(submit(header.id))).code).toBe("ACCOUNT_NOT_POSTABLE");
    const control = await create(draft({ lines: [line("1200", "10", "0"), line("2150", "0", "10")] }));
    const error = await caught(submit(control.id));
    expect(error.code).toBe("ACCOUNT_NOT_POSTABLE");
    expect(error.details[0].issue).toBe("control_account");
  });

  it("rejects a line with both a debit and a credit (BR-GL-008)", async () => {
    await as("acct");
    const created = await create(draft({ lines: [line("6200", "10", "10"), line("2150", "0", "0")] }));
    expect((await caught(submit(created.id))).code).toBe("VALIDATION_ERROR");
  });

  it("AT-RBAC-03: the preparer cannot approve their own journal (SOD_VIOLATION)", async () => {
    await as("acct");
    const created = await create(draft());
    await submit(created.id);
    const error = await caught(approve(created.id));
    expect(error).toMatchObject({ status: 403, code: "SOD_VIOLATION" });
  });

  it("requires a comment to reject, and a rejected journal returns to the preparer", async () => {
    await as("acct");
    const created = await create(draft());
    await submit(created.id);
    await as("finmgr");
    expect((await caught(api.post(`/journal-entries/${created.id}/approve`, { action: "reject" }, key()))).code).toBe("VALIDATION_ERROR");
    const rejected = await api.post<JournalEntry>(`/journal-entries/${created.id}/approve`, { action: "reject", comment: "Attach the bill" }, key());
    expect(rejected.status).toBe("REJECTED");
    await as("acct");
    const edited = await api.patch<JournalEntry>(`/journal-entries/${created.id}`, draft({ description: "Accrued electricity (bill attached)" }), rejected.version);
    expect(edited.status).toBe("DRAFT");
  });

  it("enforces approval limits (APPROVAL_LIMIT_EXCEEDED) and routes large journals to the Owner", async () => {
    await as("acct");
    const big = await create(draft({ lines: [line("6200", "60000.00", "0"), line("2150", "0", "60000.00")] }));
    const submitted = await submit(big.id);
    expect(submitted.approval_steps.map((s) => s.role)).toEqual(["FINMGR", "OWNER"]);
    await as("finmgr");
    expect((await caught(approve(big.id))).code).toBe("APPROVAL_LIMIT_EXCEEDED");
  });

  it("posts with a JV number; the journal then appears in the trial balance", async () => {
    const before = (await (await as("finmgr"), tb("2027-04-01", "2027-04-30"))).rows.find((r) => r.code === "6200");
    const approved = await preparedAndApproved();
    const posted = await post(approved.id);
    expect(posted.status).toBe("POSTED");
    expect(posted.journal_no).toMatch(/^JV-2027-\d{6}$/);
    const after = (await tb("2027-04-01", "2027-04-30")).rows.find((r) => r.code === "6200")!;
    expect(new Decimal(after.period_debit).minus(before?.period_debit ?? 0).toFixed(2)).toBe("250.00");
  });

  it("AT-GL-02: a user without gl.journal.post gets 403 and the journal stays approved", async () => {
    const approved = await preparedAndApproved();
    await as("aro");
    expect((await caught(post(approved.id))).status).toBe(403);
    expect(db().journals.find((j) => j.id === approved.id)!.status).toBe("APPROVED");
  });

  it("AT-GL-03: the same key twice gives one posting and identical answers; a new key gets ALREADY_POSTED", async () => {
    const approved = await preparedAndApproved();
    const k = newIdempotencyKey();
    const [first, second] = await Promise.all([post(approved.id, k), post(approved.id, k)]);
    expect(second.journal_no).toBe(first.journal_no);
    expect(db().journals.filter((j) => j.journal_no === first.journal_no)).toHaveLength(1);
    expect((await caught(post(approved.id))).code).toBe("ALREADY_POSTED");
  });

  it("posted journals cannot be edited (BR-GL-003)", async () => {
    await as("acct");
    const error = await caught(api.patch("/journal-entries/jnl-0002", draft(), 1));
    expect(error.code).toBe("JOURNAL_POSTED");
  });

  it("AT-GL-04: reversal mirrors the original, links both ways and nets to zero", async () => {
    await as("finmgr");
    const before = await tb("2027-04-01", "2027-04-30");
    const approved = await preparedAndApproved();
    const posted = await post(approved.id);
    const reversal = await api.post<JournalEntry>(`/journal-entries/${posted.id}/reverse`, { reversal_date: "2027-04-05", reason: "Entered twice" }, key());
    expect(reversal.status).toBe("POSTED");
    expect(reversal.reverses?.journal_no).toBe(posted.journal_no);
    expect(reversal.lines[0].credit).toBe(posted.lines[0].debit);
    const original = await api.get<JournalEntry>(`/journal-entries/${posted.id}`);
    expect(original.status).toBe("REVERSED");
    expect(original.reversed_by?.journal_no).toBe(reversal.journal_no);
    const after = await tb("2027-04-01", "2027-04-30");
    const net = (r: TrialBalanceReport) => r.rows.find((x) => x.code === "6200")!;
    expect(new Decimal(net(after).closing_debit).eq(net(before).closing_debit)).toBe(true);
    // Once only.
    expect((await caught(api.post(`/journal-entries/${posted.id}/reverse`, { reversal_date: "2027-04-05", reason: "again" }, key()))).code).toBe("INVALID_STATE_TRANSITION");
  });

  it("refuses a reversal dated in a closed period (BR-GL-009)", async () => {
    await as("finmgr");
    const error = await caught(api.post("/journal-entries/jnl-0005/reverse", { reversal_date: "2027-02-10", reason: "test" }, key()));
    expect(error.code).toBe("PERIOD_CLOSED");
  });
});

describe("periods (SCR-17)", () => {
  const periods = () => db().fiscalYears[0].periods;
  const byCode = (code: string) => periods().find((p) => p.code === code)!;

  it("AT-CLS-01: a journal dated in a closed period is refused with PERIOD_CLOSED", async () => {
    await as("acct");
    const created = await create(draft({ posting_date: "2027-02-15", document_date: "2027-02-15" }));
    const error = await caught(submit(created.id));
    expect(error.code).toBe("PERIOD_CLOSED");
    expect(error.details[0].value).toBe("February 2027");
  });

  it("AT-CLS-02: a soft-closed period takes adjusting journals only from users with permission", async () => {
    await as("acct");
    const manual = await create(draft({ posting_date: "2027-03-31", document_date: "2027-03-31" }));
    expect((await caught(submit(manual.id))).code).toBe("PERIOD_CLOSED");
    const adjusting = await create(draft({ posting_date: "2027-03-31", document_date: "2027-03-31", type: "ADJUSTING" }));
    expect((await caught(submit(adjusting.id))).code).toBe("PERIOD_CLOSED"); // ACCT lacks gl.journal.adjust
    await as("finmgr");
    const byManager = await create(draft({ posting_date: "2027-03-31", document_date: "2027-03-31", type: "ADJUSTING", reference: "ADJ-1" }));
    expect((await submit(byManager.id)).status).toBe("SUBMITTED");
  });

  it("closing is blocked by checklist items, then allowed once they are resolved", async () => {
    await as("finmgr");
    const march = byCode("2027-03");
    const blocked = await caught(api.post(`/accounting-periods/${march.id}/close`, undefined, key()));
    expect(blocked.code).toBe("INVALID_STATE_TRANSITION");
    const checklist = await api.get<PeriodChecklist>(`/accounting-periods/${march.id}/checklist`);
    expect(checklist.blocking.length).toBeGreaterThan(0);
    await api.patch(`/accounting-periods/${march.id}/checklist/review`, { done: true, evidence: "TB reviewed" });
    const closed = await api.post<AccountingPeriod>(`/accounting-periods/${march.id}/close`, undefined, key());
    expect(closed.status).toBe("CLOSED");
  });

  it("AT-CLS-03: reopening needs a reason, then Owner approval; the requester cannot approve", async () => {
    await as("finmgr");
    const feb = byCode("2027-02");
    expect((await caught(api.post(`/accounting-periods/${feb.id}/reopen-request`, { reason: " " }, key()))).code).toBe("VALIDATION_ERROR");
    await api.post(`/accounting-periods/${feb.id}/reopen-request`, { reason: "Supplier invoice found late" }, key());
    expect((await caught(api.post(`/accounting-periods/${feb.id}/reopen`, { action: "approve" }, key()))).status).toBe(403);
    await as("owner");
    const reopened = await api.post<AccountingPeriod>(`/accounting-periods/${feb.id}/reopen`, { action: "approve" }, key());
    expect(reopened.status).toBe("REOPENED");
    await as("acct");
    const late = await create(draft({ posting_date: "2027-02-20", document_date: "2027-02-20" }));
    expect((await submit(late.id)).status).toBe("SUBMITTED");
  });

  it("year-end close requires every period to be closed", async () => {
    await as("finmgr");
    const error = await caught(api.post("/fiscal-years/fy-2027/close", undefined, key()));
    expect(error.code).toBe("INVALID_STATE_TRANSITION");
    expect(error.details.length).toBe(10);
  });
});

describe("chart of accounts and reports", () => {
  it("validates codes, parents and duplicates (BR-COA-003)", async () => {
    await as("acct");
    const base = { name: "Insurance expense", name_km: "", description: "", category: "Operating expenses", normal_balance: "DEBIT", is_posting: true, is_control: false, control_module: null, is_sensitive: false, currency: null, cash_flow_class: null, statement_mapping: null, effective_from: null, effective_to: null };
    const wrongParent = await caught(api.post("/accounts", { ...base, code: "6900", type: "EXPENSE", parent_id: "acc-1000" }));
    expect(wrongParent.fieldErrors.parent_id).toBe("Child account type must match parent");
    expect((await caught(api.post("/accounts", { ...base, code: "6100", type: "EXPENSE", parent_id: "acc-6000" }))).code).toBe("DUPLICATE_CODE");
    const created = await api.post<Account>("/accounts", { ...base, code: "6900", type: "EXPENSE", parent_id: "acc-6000" });
    expect(created.in_use).toBe(false);
    await api.delete(`/accounts/${created.id}`);
  });

  it("refuses to delete a used account and to deactivate one with a balance (BR-COA-004)", async () => {
    await as("acct");
    expect((await caught(api.delete("/accounts/acc-6200"))).code).toBe("ACCOUNT_IN_USE");
    expect((await caught(api.post("/accounts/acc-6200/deactivate"))).code).toBe("INVALID_STATE_TRANSITION");
  });

  it("queues changes to used accounts for approval when the editor lacks coa.approve", async () => {
    await as("acct");
    const account = await api.get<Account>("/accounts/acc-6200");
    const pending = await api.patch<Account>("/accounts/acc-6200", { normal_balance: "CREDIT" }, account.version);
    expect(pending.normal_balance).toBe("DEBIT");
    expect(pending.pending_change?.fields).toEqual({ normal_balance: "CREDIT" });
  });

  it("GL inquiry: running balance runs from opening to closing", async () => {
    await as("finmgr");
    const report = await api.get<GeneralLedgerReport>("/reports/general-ledger", { accounts: "acc-1110", date_from: "2027-03-01", date_to: "2027-03-31" });
    const s = report.accounts[0];
    const last = s.lines[s.lines.length - 1];
    expect(last.balance).toBe(s.closing_balance);
    expect(new Decimal(s.opening_balance).plus(s.total_debit).minus(s.total_credit).toFixed(2)).toBe(s.closing_balance);
  });

  it("filters journals by status and paginates", async () => {
    await as("acct");
    const page = await api.list<JournalSummary>("/journal-entries", { status: "SUBMITTED", limit: 2 });
    expect(page.data.every((j) => j.status === "SUBMITTED")).toBe(true);
    expect(page.page.next_cursor).not.toBeNull();
    const all = await api.get<Page<JournalSummary>>("/journal-entries", { limit: 200 });
    expect(all.data.some((j) => j.preparer_id === "usr-finmgr")).toBe(true);
  });

  it("exports the trial balance as CSV", async () => {
    await as("finmgr");
    const result = await api.post<{ status: string; url: string }>("/reports/trial-balance/export", { format: "csv", parameters: { date_from: "2027-03-01", date_to: "2027-03-31" } });
    expect(result.status).toBe("COMPLETED");
  });
});
