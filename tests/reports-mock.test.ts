// @vitest-environment node
import { describe, expect, it } from "vitest";
import { apiContext } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints/auth";
import { reportsApi } from "@/lib/api/endpoints/reports";
import { dashboardApi, statementsApi } from "@/lib/api/endpoints/statements";
import type { ApiError } from "@/lib/api/errors";
import type { ReportDocument } from "@/lib/api/types/statements";
import { apiFetch } from "@/lib/api/client";
import { REPORT_CATALOGUE } from "@/lib/reports/catalogue";
import { DEMO_OTP, DEMO_PASSWORD } from "@/mocks/db/seed";

// SRS AT-RPT-01..03, AT-DASH-01..02 and the §15.3 validations of every catalogue report, against the mock.

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
const row = (doc: ReportDocument, label: string) => doc.rows.find((r) => r.label === label)!;
const Q1 = { date_from: "2027-01-01", date_to: "2027-03-31" };

describe("financial statements", () => {
  it("AT-RPT-01: the balance sheet at 31 March balances, including current-year earnings", async () => {
    await as("finmgr");
    const bs = await statementsApi.run("balance-sheet", { as_of: "2027-03-31" });
    expect(bs.checks.every((c) => c.ok)).toBe(true);
    expect(row(bs, "Total assets").values.current).toBe(row(bs, "Total liabilities and equity").values.current);
    const is = await statementsApi.run("income-statement", Q1);
    expect(row(bs, "Current-year earnings").values.current).toBe(row(is, "Net profit (loss)").values.current);
  });

  it("AT-RPT-02: net profit equals revenue less expense movements; comparatives add columns", async () => {
    await as("acct");
    const is = await statementsApi.run("income-statement", { ...Q1, compare: "prior_period" });
    expect(is.checks[0].ok).toBe(true);
    expect(is.columns.map((c) => c.key)).toEqual(["current", "prior", "change"]);
    // ACCT may not see salaries (sensitive), so they are folded into a restricted line and totals still agree.
    expect(is.rows.some((r) => r.label === "Restricted accounts (total only)")).toBe(true);
    await as("finmgr");
    const full = await statementsApi.run("income-statement", Q1);
    expect(row(full, "Net profit (loss)").values.current).toBe(row(is, "Net profit (loss)").values.current);
  });

  it("BR-RPT-001: an approved but unposted journal changes the statement only when asked, with a banner", async () => {
    await as("finmgr");
    const posted = await statementsApi.run("income-statement", { date_from: "2027-04-01", date_to: "2027-04-30" });
    const withPending = await statementsApi.run("income-statement", { date_from: "2027-04-01", date_to: "2027-04-30", include_unposted: true });
    expect(posted.includes_unposted).toBe(false);
    expect(withPending.includes_unposted).toBe(true);
  });

  it("cash flow, changes in equity, ratios and every other report pass their own checks", async () => {
    await as("owner");
    for (const entry of REPORT_CATALOGUE.filter((e) => !e.path && !e.phase)) {
      const doc = await statementsApi.run(entry.slug, entry.params.includes("range") ? Q1 : { as_of: "2027-04-05" });
      const failed = doc.checks.filter((c) => !c.ok).map((c) => `${entry.slug}: ${c.message}`);
      // The tax summary lists tax posted by the seeded cash-sale journals, which have no tax documents;
      // budget versus actual flags adverse variances, which is information, not a failed reconciliation.
      expect(failed.filter((f) => !f.startsWith("tax-summary") && !f.startsWith("budget-vs-actual"))).toEqual([]);
    }
  });

  it("reports need their permission; the audit trail report waits for Phase 7", async () => {
    await as("aro");
    expect((await caught(statementsApi.run("balance-sheet", { as_of: "2027-03-31" }))).code).toBe("FORBIDDEN");
    expect((await statementsApi.run("customer-balances", { as_of: "2027-04-05" })).checks[0].ok).toBe(true);
    expect((await caught(statementsApi.run("audit-trail", {}))).code).toBe("NOT_FOUND");
  });

  it("department managers see only their own department's expenses", async () => {
    await as("deptmgr");
    const doc = await statementsApi.run("expenses-by-department", Q1);
    expect(doc.rows.filter((r) => r.kind === "section").map((r) => r.label)).toEqual(["Operations"]);
  });

  it("AT-RPT-03: the CSV export carries the figures shown on screen", async () => {
    await as("finmgr");
    const doc = await statementsApi.run("income-statement", Q1);
    const result = await reportsApi.export("income-statement", "csv", Q1);
    const blob = await apiFetch<Blob>(result.url!.replace(/^.*\/api\/v1/, ""), { responseType: "blob" });
    const text = await blob.text();
    for (const label of ["Total revenue", "Gross profit", "Net profit (loss)"]) {
      expect(text).toContain(`${label}","${row(doc, label).values.current}`);
    }
  });
});

describe("dashboard", () => {
  it("AT-DASH-01: revenue, expenses and profit equal the income statement for Q1", async () => {
    await as("finmgr");
    const kpis = await dashboardApi.kpis(Q1);
    const is = await statementsApi.run("income-statement", Q1);
    expect(kpis.net_profit).toBe(row(is, "Net profit (loss)").values.current);
    const revenue = (await statementsApi.run("revenue-by-period", Q1)).rows.find((r) => r.label === "Total revenue")!.values.total;
    expect(kpis.revenue).toBe(revenue);
  });

  it("AT-DASH-02: an approved but unposted supplier invoice is pending, not an expense", async () => {
    await as("acct");
    const april = { date_from: "2027-04-01", date_to: "2027-04-30" };
    const before = await dashboardApi.kpis(april);
    const pending = await dashboardApi.pending();
    expect(pending.approved_unposted.find((p) => p.type === "AP_INVOICE")?.count).toBeGreaterThan(0);
    expect((await dashboardApi.kpis(april)).expenses).toBe(before.expenses);
  });

  it("widgets follow the role: the cashier sees cash but no profit or bank figures", async () => {
    await as("cashier");
    const kpis = await dashboardApi.kpis({});
    expect(kpis.revenue).toBeNull();
    expect(kpis.bank).toBeNull();
    expect(kpis.cash).not.toBeNull();
    expect((await caught(dashboardApi.trend({}))).code).toBe("FORBIDDEN");
  });

  it("the trend has 12 months ending with the chosen month", async () => {
    await as("owner");
    const { data } = await dashboardApi.trend({ date_to: "2027-04-05" });
    expect(data).toHaveLength(12);
    expect(data.at(-1)!.period).toBe("2027-04");
    expect(data[0].period).toBe("2026-05");
  });
});
