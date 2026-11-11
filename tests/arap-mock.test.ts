// @vitest-environment node
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { api, apiContext } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints/auth";
import {
  agingApi, creditNotesApi, customerInvoicesApi, customersApi, receiptsApi, supplierInvoicesApi, supplierPaymentsApi, suppliersApi, taxCodesApi,
} from "@/lib/api/endpoints/arap";
import type { ApiError } from "@/lib/api/errors";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import type { Invoice, InvoiceInput, InvoiceLine } from "@/lib/api/types/arap";
import type { Page } from "@/lib/api/types/common";
import type { ApprovalItem } from "@/lib/api/types/journals";
import { lineAmounts, normaliseInvoiceNo } from "@/lib/money/invoice";
import { db } from "@/mocks/db";
import { DEMO_OTP, DEMO_PASSWORD } from "@/mocks/db/seed";

// SRS acceptance tests AT-AR-01..05, AT-AP-01..04 and AT-TAX-01..03 against the mock backend.

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
const line = (unit_price: string, extra: Partial<InvoiceLine> = {}): InvoiceLine => ({
  description: "Goods", quantity: "1", unit_price, discount: "0", tax_code_id: "tax-exempt", account_id: "acc-4100", department_id: "dep-SALES", branch_id: "br-pp", ...extra,
});
const sale = (lines: InvoiceLine[], party = "cus-0010"): InvoiceInput => ({ party_id: party, date: "2027-04-05", terms_days: 30, currency: "USD", reference: "", notes: "", lines });

/** ARO prepares and submits, the accountant approves, ARO posts. */
async function postedSale(lines: InvoiceLine[], party = "cus-0010"): Promise<Invoice> {
  await as("aro");
  const draft = await customerInvoicesApi.create(sale(lines, party));
  await customerInvoicesApi.submit(draft.id);
  await as("acct");
  await customerInvoicesApi.decide(draft.id, "approve", "", k());
  await as("aro");
  return customerInvoicesApi.post(draft.id, k());
}
const receipt = (invoices: [string, string][], amount: string, party = "cus-0010") => ({
  party_id: party, date: "2027-04-05", account_id: "cba-aba-usd", method: "BANK_TRANSFER" as const, amount, reference: "TT-1",
  allocations: invoices.map(([invoice_id, a]) => ({ invoice_id, amount: a })),
});
const controlBalance = (id: string) =>
  db().journals.filter((j) => j.status === "POSTED").flatMap((j) => j.lines).filter((l) => l.account_id === id)
    .reduce((s, l) => s.plus(l.debit_base).minus(l.credit_base), new Decimal(0));

describe("pure rules", () => {
  it("AT-TAX-02: 110.00 at 10 % inclusive is tax 10.00 and net 100.00", () => {
    const a = lineAmounts({ quantity: "1", unit_price: "110", discount: "0" }, { rate: "10", method: "INCLUSIVE" }, "USD");
    expect([a.net.toFixed(2), a.tax.toFixed(2), a.total.toFixed(2)]).toEqual(["100.00", "10.00", "110.00"]);
    const e = lineAmounts({ quantity: "3", unit_price: "33.33", discount: "1.99" }, { rate: "10", method: "EXCLUSIVE" }, "USD");
    expect([e.net.toFixed(2), e.tax.toFixed(2), e.total.toFixed(2)]).toEqual(["98.00", "9.80", "107.80"]);
  });

  it("BR-AP-001: invoice numbers compare without case, spaces, punctuation or leading zeros", () => {
    expect(normaliseInvoiceNo("inv 001")).toBe(normaliseInvoiceNo("INV-001"));
    expect(normaliseInvoiceNo("INV-0010")).not.toBe(normaliseInvoiceNo("INV-001"));
  });
});

describe("seed", () => {
  it("AT-AR-05: customer balances add up to the AR control account, and suppliers to AP", async () => {
    await as("acct");
    const ar = await agingApi.ar("2027-04-05");
    expect(ar.control.difference).toBe("0.00");
    expect(new Decimal(ar.totals.total).eq(controlBalance("acc-1200"))).toBe(true);
    const ap = await agingApi.ap("2027-04-05");
    expect(ap.control.difference).toBe("0.00");
    expect(ar.totals.over_90).not.toBe("0.00");
  });

  it("has 40 customers and 30 suppliers, with masked supplier bank numbers", async () => {
    await as("apo");
    expect((await customersApi.list({ limit: 200 })).page.total).toBe(40);
    const suppliers = await suppliersApi.list({ limit: 200 });
    expect(suppliers.page.total).toBe(30);
    expect(suppliers.data[0].bank?.account_number).toMatch(/^•••• \d{4}$/);
    await as("finmgr");
    expect((await suppliersApi.get(suppliers.data[0].id)).bank?.account_number).toMatch(/^\d{3} \d{3} \d{3}$/);
  });
});

describe("receivables", () => {
  it("AT-AR-04: invoice 1,000 + tax 100 posts Dr AR 1,100, Cr revenue 1,000, Cr output tax 100", async () => {
    const inv = await postedSale([line("1000", { tax_code_id: "tax-vat10" })]);
    expect(inv).toMatchObject({ status: "OPEN", total: "1100.00", tax: "100.00", outstanding: "1100.00" });
    expect(inv.number).toMatch(/^INV-2027-\d{6}$/);
    const journal = db().journals.find((j) => j.id === inv.journal_id)!;
    const pick = (id: string) => journal.lines.filter((l) => l.account_id === id).map((l) => [l.debit, l.credit]);
    expect(pick("acc-1200")).toEqual([["1100.00", "0.00"]]);
    expect(pick("acc-4100")).toEqual([["0.00", "1000.00"]]);
    expect(pick("acc-2200")).toEqual([["0.00", "100.00"]]);
  });

  it("AT-AR-01: 1,000 invoice, 400 receipt and 100 credit note leave 500 outstanding, Partially Paid", async () => {
    const inv = await postedSale([line("1000")]);
    await receiptsApi.create(receipt([[inv.id, "400"]], "400"), true, k());
    const cn = await creditNotesApi.create({ invoice_id: inv.id, date: "2027-04-05", reason: "Allowance", lines: [line("100", { account_id: "acc-4900" })] });
    await creditNotesApi.submit(cn.id);
    // BR-AR-005: the preparer cannot approve their own credit note.
    expect((await caught(creditNotesApi.decide(cn.id, "approve", "", k()))).code).toBe("FORBIDDEN");
    await as("finmgr");
    await creditNotesApi.decide(cn.id, "approve", "", k());
    await creditNotesApi.post(cn.id, k());
    const after = await customerInvoicesApi.get(inv.id);
    expect(after).toMatchObject({ outstanding: "500.00", status: "PARTIALLY_PAID" });
  });

  it("AT-AR-02: one receipt of 800 pays invoices of 300 and 500 in full", async () => {
    const a = await postedSale([line("300")]);
    const b = await postedSale([line("500")]);
    const r = await receiptsApi.create(receipt([[a.id, "300"], [b.id, "500"]], "800"), true, k());
    expect(r).toMatchObject({ status: "POSTED", unapplied: "0.00" });
    expect(r.number).toMatch(/^RV-2027-\d{6}$/);
    expect((await customerInvoicesApi.get(a.id)).status).toBe("PAID");
    expect((await customerInvoicesApi.get(b.id)).status).toBe("PAID");
  });

  it("AT-AR-03: allocating 600 to an invoice of 500 is rejected", async () => {
    const inv = await postedSale([line("500")]);
    const error = await caught(receiptsApi.create(receipt([[inv.id, "600"]], "600"), true, k()));
    expect(error.code).toBe("ALLOCATION_EXCEEDS_BALANCE");
    expect(error.details[0]).toMatchObject({ field: "allocations.0.amount", value: "500.00" });
  });

  it("BR-AR-006: an overpayment is held as unapplied and can be allocated later", async () => {
    const a = await postedSale([line("300")]);
    const r = await receiptsApi.create(receipt([[a.id, "300"]], "450"), true, k());
    expect(r.unapplied).toBe("150.00");
    const b = await postedSale([line("100")]);
    const after = await receiptsApi.allocate(r.id, [{ invoice_id: b.id, amount: "100" }], k());
    expect(after.unapplied).toBe("50.00");
    expect((await customerInvoicesApi.get(b.id)).status).toBe("PAID");
    await as("acct");
    expect((await agingApi.ar("2027-04-05")).control.difference).toBe("0.00");
  });

  it("BR-AR-004: going over the credit limit adds a Finance Manager step", async () => {
    await as("aro");
    const draft = await customerInvoicesApi.create(sale([line("2000")], "cus-0001"));
    const submitted = await customerInvoicesApi.submit(draft.id);
    expect(submitted.credit_limit_exceeded).toBe(true);
    expect(submitted.approval_steps.map((s) => s.role)).toEqual(["ACCT", "FINMGR"]);
    await as("acct");
    const once = await customerInvoicesApi.decide(draft.id, "approve", "", k());
    expect(once.status).toBe("SUBMITTED");
    expect((await api.get<Page<ApprovalItem>>("/approvals")).data.some((i) => i.document_id === draft.id)).toBe(false);
    await as("finmgr");
    expect((await customerInvoicesApi.decide(draft.id, "approve", "", k())).status).toBe("APPROVED");
  });
});

describe("payables", () => {
  it("AT-AP-01: \"inv 001\" for the same supplier is blocked as a duplicate of INV-001", async () => {
    await as("apo");
    const check = await supplierInvoicesApi.duplicateCheck({ party_id: "sup-0001", supplier_invoice_no: "inv 001" });
    expect(check.exact?.supplier_invoice_no).toBe("INV-001");
    const error = await caught(supplierInvoicesApi.create({
      party_id: "sup-0001", supplier_invoice_no: "inv 001", date: "2027-04-05", terms_days: 30, currency: "USD", reference: "", notes: "",
      lines: [line("100", { tax_code_id: "tax-vat10-in", account_id: "acc-6500", department_id: "dep-OPS" })],
    }));
    expect(error.code).toBe("DUPLICATE_SUPPLIER_INVOICE");
    // Another supplier may use the same number.
    await supplierInvoicesApi.create({
      party_id: "sup-0002", supplier_invoice_no: "INV-001", date: "2027-04-05", terms_days: 30, currency: "USD", reference: "", notes: "",
      lines: [line("100", { tax_code_id: "tax-vat10-in", account_id: "acc-6500", department_id: "dep-OPS" })],
    });
  });

  it("a possible duplicate (same supplier, date and amount) needs a reason to submit", async () => {
    await as("apo");
    const input = (no: string, reason?: string): InvoiceInput => ({
      party_id: "sup-0002", supplier_invoice_no: no, date: "2027-04-05", terms_days: 30, currency: "USD", reference: "", notes: "", duplicate_reason: reason,
      lines: [line("250", { account_id: "acc-6500", department_id: "dep-OPS" })],
    });
    const first = await supplierInvoicesApi.create(input("A-1"));
    await supplierInvoicesApi.submit(first.id);
    const second = await supplierInvoicesApi.create(input("A-2"));
    const error = await caught(supplierInvoicesApi.submit(second.id));
    expect(error.details[0]).toMatchObject({ field: "duplicate_reason", issue: "possible_duplicate" });
    const fixed = await supplierInvoicesApi.update(second.id, input("A-2", "Two deliveries the same day"), second.version);
    expect((await supplierInvoicesApi.submit(fixed.id)).status).toBe("SUBMITTED");
  });

  it("AT-AP-02: releasing a submitted payment answers PAYMENT_NOT_APPROVED", async () => {
    await as("finmgr");
    expect((await caught(supplierPaymentsApi.release("spv-sub-1", "ABA123", k()))).code).toBe("PAYMENT_NOT_APPROVED");
  });

  it("AT-AP-03 and AT-AP-04: a 550 invoice paid in full; a repeated release posts once", async () => {
    await as("apo");
    const bill = await supplierInvoicesApi.create({
      party_id: "sup-0002", supplier_invoice_no: "Q-550", date: "2027-04-05", terms_days: 30, currency: "USD", reference: "", notes: "",
      lines: [line("550", { account_id: "acc-6500", department_id: "dep-OPS" })],
    });
    await supplierInvoicesApi.submit(bill.id);
    await as("acct");
    await supplierInvoicesApi.decide(bill.id, "approve", "", k());
    await supplierInvoicesApi.post(bill.id, k());
    await as("apo");
    const p = await supplierPaymentsApi.create({ party_id: "sup-0002", date: "2027-04-05", account_id: "cba-aba-usd", method: "BANK_TRANSFER", amount: "550", reference: "", allocations: [{ invoice_id: bill.id, amount: "550" }] });
    await supplierPaymentsApi.submit(p.id);
    await as("finmgr");
    await supplierPaymentsApi.decide(p.id, "approve", "", k());
    const journals = db().journals.length;
    const key = k();
    const [one, two] = await Promise.all([supplierPaymentsApi.release(p.id, "ABA-REF-1", key), supplierPaymentsApi.release(p.id, "ABA-REF-1", key)]);
    expect(one.number).toBe(two.number);
    expect(db().journals.length).toBe(journals + 1);
    expect((await supplierInvoicesApi.get(bill.id)).status).toBe("PAID");
    const again = await caught(supplierPaymentsApi.release(p.id, "ABA-REF-1", k()));
    expect(again.code).toBe("ALREADY_RELEASED");
  });

  it("BR-AP-005: a pending bank-details change holds payments until another user approves it", async () => {
    await as("apo");
    expect((await caught(supplierPaymentsApi.submit("spv-draft-1"))).code).toBe("SUPPLIER_NOT_VERIFIED");
    await as("finmgr");
    await suppliersApi.decideBankChange("sup-0003", "approve", "", k());
    await as("apo");
    expect((await supplierPaymentsApi.submit("spv-draft-1")).status).toBe("SUBMITTED");
  });

  it("the department manager approves only supplier invoices of their own department", async () => {
    await as("deptmgr");
    const inbox = (await api.get<Page<ApprovalItem>>("/approvals")).data;
    expect(inbox.some((i) => i.document_id === "bill-sub-1")).toBe(true);
    expect((await supplierInvoicesApi.decide("bill-sub-1", "approve", "", k())).status).toBe("APPROVED");
  });
});

describe("tax codes", () => {
  it("AT-TAX-01: a new rate from next month does not change posted invoices", async () => {
    const inv = await postedSale([line("1000", { tax_code_id: "tax-vat10" })]);
    await as("finmgr");
    const changed = await taxCodesApi.addRate("tax-vat10", "12", "2027-05-01");
    expect(changed.rates.at(-2)?.effective_to).toBe("2027-04-30");
    expect(changed.verification).toBe("UNVERIFIED");
    expect((await customerInvoicesApi.get(inv.id)).tax).toBe("100.00");
  });

  it("AT-TAX-03: posting with an unverified tax code is blocked with TAX_CODE_UNVERIFIED", async () => {
    await as("aro");
    const draft = await customerInvoicesApi.create(sale([line("100", { tax_code_id: "tax-acc", account_id: "acc-4200" })]));
    await customerInvoicesApi.submit(draft.id);
    await as("acct");
    await customerInvoicesApi.decide(draft.id, "approve", "", k());
    expect((await caught(customerInvoicesApi.post(draft.id, k()))).code).toBe("TAX_CODE_UNVERIFIED");
    await as("owner");
    await taxCodesApi.verify("tax-acc", "Confirmed by adviser (demo)");
    await as("acct");
    expect((await customerInvoicesApi.post(draft.id, k())).status).toBe("OPEN");
  });
});
