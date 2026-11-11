// @vitest-environment node
// (Node's fetch must read the uploaded File; jsdom's File class is not accepted by it.)
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { api, apiContext } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints/auth";
import type { ApiError } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import type { AccountBook, CashBankAccount, CashTransaction, Expense, ExpenseInput, Reconciliation, StatementImport } from "@/lib/api/types/cashbank";
import type { Page } from "@/lib/api/types/common";
import type { ApprovalItem } from "@/lib/api/types/journals";
import type { TrialBalanceReport } from "@/lib/api/types/reports";
import { guessMapping, mapRows, parseCsv } from "@/lib/money/statement";
import { splitByPercent } from "@/lib/money/split";
import { db } from "@/mocks/db";
import { DEMO_OTP, DEMO_PASSWORD } from "@/mocks/db/seed";

// SRS acceptance tests AT-CB-01..04 and AT-EXP-01..03, plus BR-CB-004 and role scopes, against the mock.

async function as(username: string) {
  const session = await authApi.login({ username, password: DEMO_PASSWORD, otp: DEMO_OTP });
  apiContext.accessToken = session.access_token;
  apiContext.companyId = session.user.default_company_id;
}
const caught = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected the request to fail");
};
const key = () => ({ idempotencyKey: newIdempotencyKey() });
const book = (id: string, from: string, to: string) => api.get<AccountBook>(`/bank-accounts/${id}/book`, { date_from: from, date_to: to });

describe("pure helpers", () => {
  it("AT-EXP-02: 100.00 split 33.33/33.33/33.34 % gives 33.33, 33.33, 33.34", () => {
    expect(splitByPercent("100.00", ["33.33", "33.33", "33.34"], "USD")).toEqual(["33.33", "33.33", "33.34"]);
    expect(splitByPercent("100.00", ["33.33", "33.33", "33.33"], "USD")).toBeNull();
    expect(splitByPercent("10000", ["50", "50"], "KHR")).toEqual(["5000", "5000"]);
  });

  it("reads statement CSV with quoted fields and debit/credit columns", () => {
    const rows = parseCsv('Date,Description,Reference,Debit,Credit,Balance\r\n"02/04/2027","PAYMENT, EDC",PV-1,"1,250.00",,\r\n03/04/2027,DEPOSIT,R-9,,500.00,\r\n31/02/2027,BAD,,,1,\r\n');
    const mapping = guessMapping(rows[0]);
    expect(mapping).toMatchObject({ date: "Date", debit: "Debit", credit: "Credit", amount: null, balance: "Balance" });
    const mapped = mapRows(rows, mapping);
    expect(mapped[0]).toMatchObject({ date: "2027-04-02", description: "PAYMENT, EDC", amount: "-1250", errors: [] });
    expect(mapped[1]).toMatchObject({ amount: "500" });
    expect(mapped[2].errors).toContain("date");
  });
});

describe("cash and bank accounts", () => {
  it("masks bank numbers unless the user may see them", async () => {
    await as("acct");
    const masked = (await api.get<Page<CashBankAccount>>("/bank-accounts")).data.find((a) => a.code === "ABA-USD")!;
    expect(masked.account_number).toBe("•••• 4417");
    await as("finmgr");
    expect((await api.get<CashBankAccount>("/bank-accounts/cba-aba-usd")).account_number).toBe("000 123 4417");
  });

  it("gives the cashier only the cash accounts in their custody", async () => {
    await as("cashier");
    const cash = (await api.get<Page<CashBankAccount>>("/cash-accounts")).data.map((a) => a.code);
    expect(cash).toEqual(["CASH-USD", "PETTY"]);
    expect((await caught(api.get("/bank-accounts"))).status).toBe(403);
    expect((await caught(api.get("/cash-accounts/cba-cash-khr"))).code).toBe("NOT_FOUND");
  });

  it("cashbook balance equals the GL balance of the account", async () => {
    await as("finmgr");
    const b = await book("cba-aba-usd", "2027-01-01", "2027-04-30");
    const tb = await api.get<TrialBalanceReport>("/reports/trial-balance", { date_from: "2027-01-01", date_to: "2027-04-30" });
    const row = tb.rows.find((r) => r.code === "1110")!;
    expect(new Decimal(row.closing_debit).minus(row.closing_credit).toFixed(2)).toBe(b.closing);
  });
});

describe("cash transactions (WF-07)", () => {
  const draft = (overrides: Partial<CashTransaction>) => ({
    type: "PAYMENT", date: "2027-04-05", account_id: "cba-petty", to_account_id: null, amount: "20.00", to_amount: null, reference: "T-1",
    description: "Stamps", payee: "Post office", lines: [{ account_id: "acc-6500", description: "", amount: "20.00", department_id: "dep-ADMIN", branch_id: "br-pp" }],
    ...overrides,
  });

  it("cashier creates and submits; the accountant posts with a number", async () => {
    await as("cashier");
    const t = await api.post<CashTransaction>("/cash-transactions", draft({}));
    await api.post(`/cash-transactions/${t.id}/submit`);
    expect((await caught(api.post(`/cash-transactions/${t.id}/post`, undefined, key()))).status).toBe(403);
    await as("acct");
    const posted = await api.post<CashTransaction>(`/cash-transactions/${t.id}/post`, undefined, key());
    expect(posted.number).toMatch(/^PV-2027-\d{6}$/);
    expect(posted.journal_no).toMatch(/^JV-2027-/);
  });

  it("BR-CB-004: a payment larger than the petty cash balance is refused", async () => {
    await as("acct");
    const t = await api.post<CashTransaction>("/cash-transactions", draft({ amount: "900.00", lines: [{ account_id: "acc-6500", description: "", amount: "900.00", department_id: null, branch_id: "br-pp" }] }));
    const error = await caught(api.post(`/cash-transactions/${t.id}/post`, undefined, key()));
    expect(error.code).toBe("INSUFFICIENT_BALANCE");
    expect(error.details[0].value).toBe("500.00");
  });

  it("refuses control and cash accounts on a line (use a transfer instead)", async () => {
    await as("acct");
    const t = await api.post<CashTransaction>("/cash-transactions", draft({ type: "RECEIPT", account_id: "cba-cash-usd", lines: [{ account_id: "acc-1200", description: "", amount: "20.00", department_id: null, branch_id: null }] }));
    expect((await caught(api.post(`/cash-transactions/${t.id}/submit`))).details[0].issue).toBe("control_account");
  });

  it("AT-CB-04: a transfer posts one balanced journal and shows in both books", async () => {
    await as("acct");
    const t = await api.post<CashTransaction>("/cash-transactions", draft({ type: "TRANSFER", account_id: "cba-aba-usd", to_account_id: "cba-petty", amount: "500.00", to_amount: null, reference: "TOPUP-T", lines: [] }));
    const posted = await api.post<CashTransaction>(`/cash-transactions/${t.id}/post`, undefined, key());
    const journal = db().journals.find((j) => j.id === posted.journal_id)!;
    expect(journal.totals.difference).toBe("0.00");
    expect(journal.lines.map((l) => [l.account_code, l.debit, l.credit])).toEqual([["1103", "500.00", "0.00"], ["1110", "0.00", "500.00"]]);
    await as("finmgr");
    const bank = await book("cba-aba-usd", "2027-04-05", "2027-04-05");
    const petty = await api.get<AccountBook>("/cash-accounts/cba-petty/book", { date_from: "2027-04-05", date_to: "2027-04-05" });
    expect(bank.lines.some((l) => l.reference === "TOPUP-T" && l.payment === "500.00")).toBe(true);
    expect(petty.lines.some((l) => l.reference === "TOPUP-T" && l.receipt === "500.00")).toBe(true);
  });

  it("a USD to KHR transfer posts the realised exchange difference", async () => {
    await as("acct");
    const rate = db().exchangeRates.find((r) => r.rate_date === "2027-04-05")!.rate;
    const t = await api.post<CashTransaction>("/cash-transactions", draft({ type: "TRANSFER", account_id: "cba-aba-usd", to_account_id: "cba-acleda-khr", amount: "100.00", to_amount: "420000", lines: [] }));
    const posted = await api.post<CashTransaction>(`/cash-transactions/${t.id}/post`, undefined, key());
    const journal = db().journals.find((j) => j.id === posted.journal_id)!;
    const expected = new Decimal("420000").times(rate).toDecimalPlaces(2).minus(100);
    const fx = journal.lines.find((l) => l.account_code === "7300" || l.account_code === "8310")!;
    expect(new Decimal(fx.credit).minus(fx.debit).toFixed(2)).toBe(expected.toFixed(2));
    expect(journal.totals.difference).toBe("0.00");
  });
});

describe("bank reconciliation (WF-08)", () => {
  const rec = () => api.get<Reconciliation>("/bank-reconciliations/rec-aba-2027-03");

  it("seeds a completed February and an in-progress March reconciliation", async () => {
    await as("acct");
    const list = await api.get<Page<{ id: string; status: string; difference: string }>>("/bank-reconciliations");
    expect(list.data.map((r) => [r.id, r.status])).toEqual([["rec-aba-2027-03", "IN_PROGRESS"], ["rec-aba-2027-02", "COMPLETED"]]);
    expect(list.data[1].difference).toBe("0.00");
    const march = await rec();
    expect(march.summary.statement_consistent).toBe(true);
    expect(march.suggestions.length).toBeGreaterThan(5);
  });

  it("AT-CB-01: auto-match leaves the fee and interest as a difference that blocks completion", async () => {
    await as("finmgr");
    const matched = await api.post<Reconciliation>("/bank-reconciliations/rec-aba-2027-03/auto-match");
    expect(matched.summary.difference).toBe("-2.90");
    expect(matched.statement_lines.filter((s) => !s.match_id).map((s) => s.reference)).toEqual(["FEE-0331", "INT-0331"]);
    expect(matched.book_lines.filter((b) => !b.match_id)).toHaveLength(2);
    const error = await caught(api.post("/bank-reconciliations/rec-aba-2027-03/complete", {}, key()));
    expect(error.code).toBe("DIFFERENCE_UNRESOLVED");
    expect(error.details[0].value).toBe("-2.90");
  });

  it("adjustments clear the difference; completion then locks it (AT-CB-02)", async () => {
    await as("finmgr");
    const matched = await api.post<Reconciliation>("/bank-reconciliations/rec-aba-2027-03/auto-match");
    const fee = matched.statement_lines.find((s) => s.reference === "FEE-0331")!;
    const interest = matched.statement_lines.find((s) => s.reference === "INT-0331")!;
    await api.post("/bank-reconciliations/rec-aba-2027-03/adjustments", { statement_line_id: fee.id, account_id: "acc-6800", description: "March service fee" }, key());
    const after = await api.post<Reconciliation>("/bank-reconciliations/rec-aba-2027-03/adjustments", { statement_line_id: interest.id, account_id: "acc-7100", description: "March interest" }, key());
    expect(after.summary.difference).toBe("0.00");
    const done = await api.post<Reconciliation>("/bank-reconciliations/rec-aba-2027-03/complete", {}, key());
    expect(done.status).toBe("COMPLETED");
    const error = await caught(api.post("/bank-reconciliations/rec-aba-2027-03/matches", { remove: [done.matches[0].id] }));
    expect(error.code).toBe("RECONCILIATION_COMPLETED");
  });

  it("the accountant cannot post adjustments into soft-closed March, and cannot complete", async () => {
    await as("acct");
    const r = await rec();
    const fee = r.statement_lines.find((s) => s.reference === "FEE-0331")!;
    expect((await caught(api.post("/bank-reconciliations/rec-aba-2027-03/adjustments", { statement_line_id: fee.id, account_id: "acc-6800", description: "fee" }, key()))).code).toBe("PERIOD_CLOSED");
    expect((await caught(api.post("/bank-reconciliations/rec-aba-2027-03/complete", { explanation: "x" }, key()))).status).toBe(403);
  });

  it("a documented difference can be completed by the reviewer (BR-CB-002)", async () => {
    await as("finmgr");
    await api.post("/bank-reconciliations/rec-aba-2027-03/auto-match");
    const done = await api.post<Reconciliation>("/bank-reconciliations/rec-aba-2027-03/complete", { explanation: "Fee and interest to be booked in April" }, key());
    expect(done.explanation).toMatchObject({ amount: "-2.90", approved_by: "Keo Vannak" });
  });

  it("only the latest completed reconciliation can be reopened, with a reason", async () => {
    await as("finmgr");
    expect((await caught(api.post("/bank-reconciliations/rec-aba-2027-02/reopen", { reason: "check" }))).code).toBe("INVALID_STATE_TRANSITION");
  });

  it("matching refuses amounts that differ", async () => {
    await as("acct");
    const r = await rec();
    const s = r.statement_lines.find((x) => new Decimal(x.amount).gt(0))!;
    const b = r.book_lines.find((x) => new Decimal(x.amount).lt(0))!;
    expect((await caught(api.post("/bank-reconciliations/rec-aba-2027-03/matches", { add: [{ statement_line_ids: [s.id], book_line_ids: [b.id] }] }))).details[0].issue).toBe("amounts_differ");
  });
});

describe("statement import (FR-CB-008)", () => {
  const upload = async (csv: string) => {
    const form = new FormData();
    form.append("bank_account_id", "cba-aba-usd");
    form.append("file", new File([csv], "aba-usd-2027-04.csv", { type: "text/csv" }));
    form.append("mapping", JSON.stringify(guessMapping(parseCsv(csv)[0])));
    return api.post<StatementImport>("/bank-statements/import", form);
  };

  it("AT-CB-03: importing the same file twice flags every line as a duplicate and creates none", async () => {
    await as("acct");
    const response = await fetch("http://localhost/api/v1/bank-statements/sample?bank_account_id=cba-aba-usd", {
      headers: { Authorization: `Bearer ${apiContext.accessToken}`, "X-Company-Id": "cmp-demo" },
    });
    const csv = await response.text();
    const first = await upload(csv);
    expect(first.counts.duplicates).toBe(0);
    expect(first.counts.valid).toBeGreaterThan(3);
    const committed = await api.post<StatementImport>(`/bank-statements/imports/${first.id}/commit`, undefined, key());
    expect(committed.created_lines).toBe(first.counts.valid);
    const again = await upload(csv);
    expect(again.counts).toEqual({ valid: 0, errors: 0, duplicates: first.counts.valid });
    const before = db().statementLines.length;
    await api.post(`/bank-statements/imports/${again.id}/commit`, undefined, key());
    expect(db().statementLines.length).toBe(before);
  });
});

describe("expenses (WF-06)", () => {
  const input = (overrides: Partial<ExpenseInput> = {}): ExpenseInput => ({
    date: "2027-04-05", category_id: "cat-utilities", description: "Internet April", payee: "Ezecom", payment_mode: "PAID",
    paid_from_id: "cba-cash-usd", currency: "USD", amount: "100.00", allocation_mode: "PERCENT",
    allocations: [{ department_id: "dep-ADMIN", branch_id: "br-pp", percent: "33.33", amount: "0" }, { department_id: "dep-SALES", branch_id: "br-pp", percent: "33.33", amount: "0" }, { department_id: "dep-OPS", branch_id: "br-pp", percent: "33.34", amount: "0" }],
    ...overrides,
  });

  it("AT-EXP-02: the server splits 100.00 into 33.33, 33.33 and 33.34", async () => {
    await as("acct");
    const e = await api.post<Expense>("/expenses", input());
    expect(e.allocations.map((a) => a.amount)).toEqual(["33.33", "33.33", "33.34"]);
  });

  it("AT-EXP-03: travel without an attachment is refused with ATTACHMENT_REQUIRED", async () => {
    await as("acct");
    expect((await caught(api.post("/expenses/exp-draft-travel/submit"))).code).toBe("ATTACHMENT_REQUIRED");
  });

  it("approval: the department manager approves own-department expenses; the preparer cannot", async () => {
    await as("acct"); // no exp.approve at all
    expect((await caught(api.post("/expenses/exp-sub-utilities/approve", { action: "approve" }, key()))).code).toBe("FORBIDDEN");
    await as("deptmgr");
    const own = await api.post<Expense>("/expenses", input({ category_id: "cat-office", amount: "40.00", payment_mode: "UNPAID", paid_from_id: null, allocation_mode: "AMOUNT", allocations: [{ department_id: "dep-OPS", branch_id: "br-pp", percent: null, amount: "40.00" }] }));
    await api.post(`/expenses/${own.id}/submit`);
    expect((await caught(api.post(`/expenses/${own.id}/approve`, { action: "approve" }, key()))).code).toBe("SOD_VIOLATION");
    const inbox = await api.get<Page<ApprovalItem>>("/approvals");
    expect(inbox.data.map((i) => i.document_id)).toContain("exp-sub-utilities");
    expect(inbox.data.map((i) => i.document_id)).not.toContain("exp-sub-split"); // Admin and Sales are not their departments
    const approved = await api.post<Expense>("/expenses/exp-sub-utilities/approve", { action: "approve" }, key());
    expect(approved.status).toBe("APPROVED");
  });

  it("AT-EXP-01: an unpaid expense is recognised once, and the later payment only clears the liability", async () => {
    await as("finmgr");
    const before = await api.get<TrialBalanceReport>("/reports/trial-balance", { date_from: "2027-04-01", date_to: "2027-04-30" });
    const settled = await api.post<Expense>("/expenses/exp-rent-march/settle", { account_id: "cba-aba-usd", date: "2027-04-05" }, key());
    expect(settled.settlement?.number).toMatch(/^PV-2027-/);
    const after = await api.get<TrialBalanceReport>("/reports/trial-balance", { date_from: "2027-04-01", date_to: "2027-04-30" });
    const period = (r: TrialBalanceReport, code: string) => r.rows.find((x) => x.code === code);
    expect(period(after, "6100")?.period_debit).toBe(period(before, "6100")?.period_debit); // no rent expense from the payment
    expect(new Decimal(period(after, "2150")!.period_debit).minus(period(before, "2150")?.period_debit ?? 0).toFixed(2)).toBe("1000.00");
    expect((await caught(api.post("/expenses/exp-rent-march/settle", { account_id: "cba-aba-usd", date: "2027-04-05" }, key()))).code).toBe("ALREADY_POSTED");
  });

  it("posting an approved paid expense credits the cash account, by the poster not the preparer", async () => {
    await as("acct");
    expect((await caught(api.post("/expenses/exp-appr-repair/post", undefined, key()))).code).toBe("SOD_VIOLATION");
    await as("finmgr");
    const posted = await api.post<Expense>("/expenses/exp-appr-repair/post", undefined, key());
    expect(posted.number).toMatch(/^EXP-2027-/);
    const journal = db().journals.find((j) => j.id === posted.journal_id)!;
    expect(journal.lines.map((l) => [l.account_code, l.department_id])).toEqual([["6500", "dep-OPS"], ["1101", null]]);
  });
});
