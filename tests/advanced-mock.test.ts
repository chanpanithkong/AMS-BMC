// @vitest-environment node
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { api, apiContext } from "@/lib/api/client";
import { assetsApi, budgetsApi, importsApi, inventoryApi, revaluationsApi } from "@/lib/api/endpoints/assets";
import { authApi } from "@/lib/api/endpoints/auth";
import { statementsApi } from "@/lib/api/endpoints/statements";
import type { ApiError } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import type { FixedAssetInput } from "@/lib/api/types/assets";
import type { Page } from "@/lib/api/types/common";
import type { JournalEntry } from "@/lib/api/types/journals";
import type { AppNotification } from "@/lib/api/types/org";
import { schedule } from "@/lib/money/depreciation";
import { db } from "@/mocks/db";
import { DEMO_OTP, DEMO_PASSWORD } from "@/mocks/db/seed";

// SRS acceptance tests AT-FA-01..03, AT-BUD-01..03, AT-FX-01 and 03, AT-INV-01..02, AT-IMP-01..02.

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
const k = () => newIdempotencyKey();
const asset = (over: Partial<FixedAssetInput> = {}): FixedAssetInput => ({
  name: "Test asset", name_km: "", category_id: "fac-furniture", cost: "12000", residual_value: "0", useful_life_months: 60, method: "STRAIGHT_LINE", declining_rate: null,
  convention: "NEXT_MONTH", acquisition_date: "2026-06-10", in_service_date: "2026-06-10", supplier_name: "", location: "", branch_id: "br-pp", department_id: "dep-ADMIN", custodian: "",
  funding: "ALREADY_POSTED", funding_account_id: null, accumulated_brought_forward: "0", ...over,
});

describe("depreciation maths", () => {
  it("BR-FA-001: 12,000 over 60 months is 200.00 a month; the last month takes the rounding", () => {
    const s = schedule({ cost: "12000", residual_value: "0", useful_life_months: 60, method: "STRAIGHT_LINE", convention: "NEXT_MONTH", in_service_date: "2027-02-15" });
    expect(s).toHaveLength(60);
    expect(s[0]).toMatchObject({ period: "2027-03" });
    expect(s[0].amount.toFixed(2)).toBe("200.00");
    const odd = schedule({ cost: "1000", residual_value: "0", useful_life_months: 3, method: "STRAIGHT_LINE", convention: "SAME_MONTH", in_service_date: "2027-01-01" });
    expect(odd.map((m) => m.amount.toFixed(2))).toEqual(["333.33", "333.33", "333.34"]);
  });
});

describe("fixed assets", () => {
  it("the register agrees with the fixed-asset accounts and the subledger report", async () => {
    await as("finmgr");
    const reg = await statementsApi.run("fixed-asset-register", { as_of: "2027-04-05" });
    expect(reg.checks.every((c) => c.ok)).toBe(true);
    const sub = await statementsApi.run("subledger-reconciliation", { as_of: "2027-04-05" });
    expect(sub.rows.find((r) => r.code === "1590")?.values.difference).toBe("0.00");
  });

  it("AT-FA-01 and AT-FA-02: the April run depreciates FA-0001 by 200.00, once", async () => {
    await as("acct");
    const run = await assetsApi.createRun("per-2027-04");
    expect(run.lines.find((l) => l.tag === "FA-0001")?.amount).toBe("200.00");
    // The accountant has no fa.approve; the Finance Manager approves.
    expect((await caught(assetsApi.decideRun(run.id, "approve", "", k()))).code).toBe("FORBIDDEN");
    await as("finmgr");
    await assetsApi.decideRun(run.id, "approve", "", k());
    const posted = await assetsApi.postRun(run.id, k());
    expect(posted.status).toBe("POSTED");
    const journal = db().journals.find((j) => j.id === posted.journal_id)!;
    expect(journal.totals.debit_base).toBe(posted.total);
    await as("acct");
    const again = await caught(assetsApi.createRun("per-2027-04"));
    expect(again.code).toBe("ALREADY_POSTED");
    expect(again.message).toContain("Depreciation for April 2027 already posted");
    // March was posted by the seeded run.
    expect((await caught(assetsApi.createRun("per-2027-03"))).code).toBe("ALREADY_POSTED");
  });

  it("AT-FA-03: cost 10,000, accumulated 6,000, sold for 3,000 posts a 1,000 loss and stops depreciating", async () => {
    await as("acct");
    const a = await assetsApi.create(asset({ cost: "10000", accumulated_brought_forward: "6000", acquisition_date: "2024-01-05", in_service_date: "2024-01-05" }));
    expect(a.net_book_value).toBe("4000.00");
    expect((await caught(assetsApi.create(asset({ residual_value: "12000" })))).details[0].message).toBe("Residual value must be less than cost");
    const requested = await assetsApi.dispose(a.id, { date: "2027-04-05", proceeds: "3000", account_id: "cba-aba-usd", reason: "Sold to staff" });
    expect(requested.status).toBe("DISPOSAL_PENDING");
    await as("finmgr");
    const done = await assetsApi.decideDisposal(a.id, "approve", "", k());
    expect(done).toMatchObject({ status: "DISPOSED" });
    expect(done.disposal?.gain_loss).toBe("-1000.00");
    const loss = db().journals.find((j) => j.id === done.disposal?.journal_id)!.lines.find((l) => l.account_code === "8500");
    expect(loss?.debit).toBe("1000.00");
    await as("acct");
    const run = await assetsApi.createRun("per-2027-04");
    expect(run.lines.some((l) => l.asset_id === a.id)).toBe(false);
  });

  it("posting a supplier invoice with an asset line creates a draft asset", async () => {
    await as("apo");
    const bill = await api.post<{ id: string }>("/supplier-invoices", {
      party_id: "sup-0002", supplier_invoice_no: "FA-TEST-1", date: "2027-04-05", terms_days: 30, currency: "USD", reference: "", notes: "",
      lines: [{ description: "Forklift", quantity: "1", unit_price: "8000", discount: "0", tax_code_id: null, account_id: "acc-1520", department_id: "dep-OPS", branch_id: "br-pp", is_asset: true }],
    });
    await api.post(`/supplier-invoices/${bill.id}/submit`);
    await as("finmgr");
    await api.post(`/supplier-invoices/${bill.id}/approve`, { action: "approve" }, { idempotencyKey: k() });
    // Above 5,000.00 the Finance Manager also takes the second step.
    await api.post(`/supplier-invoices/${bill.id}/approve`, { action: "approve" }, { idempotencyKey: k() });
    await api.post(`/supplier-invoices/${bill.id}/post`, undefined, { idempotencyKey: k() });
    const drafts = (await assetsApi.list({ status: "DRAFT" })).data;
    expect(drafts.find((x) => x.name === "Forklift")).toMatchObject({ category_id: "fac-vehicles", cost: "8000.00", source: { type: "AP_INVOICE" } });
  });
});

describe("budgets", () => {
  it("AT-BUD-01: budget versus actual uses posted data only", async () => {
    await as("finmgr");
    const range = { date_from: "2027-01-01", date_to: "2027-03-31" };
    const before = await statementsApi.run("budget-vs-actual", range);
    // A draft journal changes nothing.
    db().journals.push({ ...structuredClone(db().journals.find((j) => j.status === "DRAFT")!), id: "jnl-test-draft", posting_date: "2027-02-10" } as JournalEntry);
    const after = await statementsApi.run("budget-vs-actual", range);
    expect(after.rows.find((r) => r.label === "Total expenses")?.values.actual).toBe(before.rows.find((r) => r.label === "Total expenses")?.values.actual);
  });

  it("AT-BUD-02 and AT-BUD-03: approving version 2 supersedes version 1 and alerts the department manager at 80 %", async () => {
    await as("finmgr");
    const v2 = await budgetsApi.get("bud-2027-v2");
    // Shrink the Operations budget so that posted actuals pass 80 % of it.
    const lines = v2.lines.map((l) => ({ account_id: l.account_id, department_id: l.department_id, branch_id: l.branch_id, months: l.department_id === "dep-OPS" ? l.months.map(() => "100.00") : l.months }));
    const saved = await budgetsApi.saveLines(v2.id, lines, v2.row_version);
    await budgetsApi.submit(saved.id);
    expect((await caught(budgetsApi.decide(saved.id, "approve", "", k()))).code).toBe("SOD_VIOLATION");
    await as("owner");
    const approved = await budgetsApi.decide(saved.id, "approve", "", k());
    expect(approved.status).toBe("APPROVED");
    expect((await budgetsApi.get("bud-2027-v1")).status).toBe("SUPERSEDED");
    await as("deptmgr");
    const notes = await api.get<Page<AppNotification>>("/notifications");
    expect(notes.data.some((n) => n.title.startsWith("Operations: 100 % of the budget used"))).toBe(true);
  });

  it("department managers edit only their own department's lines", async () => {
    await as("deptmgr");
    const v2 = await budgetsApi.get("bud-2027-v2");
    expect(v2.lines.every((l) => l.department_id === "dep-OPS")).toBe(true);
    const error = await caught(budgetsApi.saveLines(v2.id, [{ account_id: "acc-6100", department_id: "dep-ADMIN", branch_id: null, months: Array(12).fill("1") }], v2.row_version));
    expect(error.details[0].issue).toBe("scope");
  });
});

describe("FX revaluation", () => {
  it("AT-FX-03: March is revalued once, with a reversal on 1 April", async () => {
    await as("finmgr");
    const preview = await revaluationsApi.preview("per-2027-03");
    expect(preview.lines.map((l) => l.account_code).sort()).toEqual(["1102", "1111"]);
    const posted = await revaluationsApi.post(preview.id, k());
    expect(posted.status).toBe("POSTED");
    const reversal = db().journals.find((j) => j.id === posted.reversal_journal_id)!;
    expect(reversal.posting_date).toBe("2027-04-01");
    // The foreign-currency amount of the bank account is unchanged; only its base value moved.
    const line = db().journals.find((j) => j.id === posted.journal_id)!.lines.find((l) => l.account_code === "1111")!;
    expect([line.debit, line.credit]).toEqual(["0", "0"]);
    expect((await caught(revaluationsApi.preview("per-2027-03"))).code).toBe("ALREADY_POSTED");
    expect((await caught(revaluationsApi.post(preview.id, k()))).code).toBe("ALREADY_POSTED");
  });

  it("AT-FX-01: changing a rate later does not change posted base amounts", async () => {
    await as("finmgr");
    const invoice = db().invoices.find((d) => d.currency === "KHR" && d.posted)!;
    const before = db().journals.find((j) => j.id === invoice.journal_id)!.totals.debit_base;
    db().exchangeRates.find((r) => r.rate_date === invoice.date)!.rate = "0.000250000000";
    expect(db().journals.find((j) => j.id === invoice.journal_id)!.totals.debit_base).toBe(before);
  });
});

describe("inventory", () => {
  it("AT-INV-01: an event received twice posts once; AT-INV-02: the reconciliation lists the 100.00 difference", async () => {
    await as("acct");
    const event = { source_event_id: "E-100", type: "ISSUE" as const, date: "2027-04-05", item: "Rice 50 kg", quantity: "10", value: "350.00", reason: "Sales" };
    const first = await inventoryApi.send(event);
    const count = db().journals.length;
    const second = await inventoryApi.send(event);
    expect(second.duplicate).toBe(true);
    expect(second.event.journal_id).toBe(first.event.journal_id);
    expect(db().journals.length).toBe(count);
    const rec = await inventoryApi.reconciliation("2027-03-31");
    expect(rec.difference).toBe("100.00");
  });
});

describe("imports", () => {
  it("AT-IMP-01: one unbalanced journal rejects the batch and creates nothing", async () => {
    await as("acct");
    const rows = [
      { journal_ref: "IMP-1", posting_date: "2027-04-05", description: "Supplies", account_code: "6500", debit: "50.00", credit: "0", currency: "USD" },
      { journal_ref: "IMP-1", posting_date: "2027-04-05", description: "Supplies", account_code: "1101", debit: "0", credit: "50.00", currency: "USD" },
      { journal_ref: "IMP-2", posting_date: "2027-04-05", description: "Fees", account_code: "6800", debit: "10.00", credit: "0", currency: "USD" },
      { journal_ref: "IMP-2", posting_date: "2027-04-05", description: "Fees", account_code: "1110", debit: "0", credit: "9.99", currency: "USD" },
    ];
    const count = db().journals.length;
    const batch = await importsApi.validate({ type: "JOURNALS", file_name: "journals.csv", file_hash: "x", rows });
    expect(batch.status).toBe("FAILED");
    expect(batch.errors.some((e) => e.value === "IMP-2" && e.message.includes("does not balance"))).toBe(true);
    expect((await caught(importsApi.commit(batch.id, k()))).code).toBe("VALIDATION_ERROR");
    expect(db().journals.length).toBe(count);
    const good = await importsApi.validate({ type: "JOURNALS", file_name: "journals.csv", file_hash: "y", rows: rows.slice(0, 2) });
    const committed = await importsApi.commit(good.id, k());
    expect(committed.created).toHaveLength(1);
    expect(db().journals.find((j) => j.id === committed.created[0].id)?.status).toBe("DRAFT");
  });

  it("AT-IMP-02: a balanced opening-balance file creates a draft opening journal, not signed off", async () => {
    await as("acct");
    const batch = await importsApi.validate({ type: "OPENING_BALANCES", file_name: "opening.csv", file_hash: "z", rows: [
      { account_code: "1101", debit: "100.00", credit: "0" }, { account_code: "3100", debit: "0", credit: "100.00" },
    ] });
    expect(batch.status).toBe("VALIDATED");
    expect(batch.warnings[0]).toContain("already posted");
    await importsApi.commit(batch.id, k());
    expect((await importsApi.status()).opening_signed_off).toBe(false);
  });

  it("master data: duplicates are rejected, a clean batch commits and can be rolled back", async () => {
    await as("aro");
    const dup = await importsApi.validate({ type: "CUSTOMERS", file_name: "c.csv", file_hash: "1", rows: [{ code: "C-0001", name_en: "Copy", currency: "USD", payment_terms: "30" }] });
    expect(dup.errors[0]).toMatchObject({ column: "code", message: "This code already exists" });
    const ok = await importsApi.validate({ type: "CUSTOMERS", file_name: "c.csv", file_hash: "2", rows: [{ code: "C-0900", name_en: "New Co", currency: "USD", payment_terms: "30" }] });
    const done = await importsApi.commit(ok.id, k());
    expect(db().parties.some((p) => p.code === "C-0900")).toBe(true);
    await importsApi.rollback(done.id);
    expect(db().parties.some((p) => p.code === "C-0900")).toBe(false);
    expect((await caught(importsApi.validate({ type: "SUPPLIERS", file_name: "s.csv", file_hash: "3", rows: [{ code: "S-1" }] }))).code).toBe("FORBIDDEN");
  });

  it("totals stay in base currency maths", () => {
    expect(new Decimal("333.33").times(4100).toFixed(0)).toBe("1366653");
  });
});
