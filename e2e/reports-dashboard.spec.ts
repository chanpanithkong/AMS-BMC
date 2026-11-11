import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues, navTo, signInAs } from "./helpers";

// Phase 5 end-to-end tests: SCR-15 report viewer and SCR-02 dashboard (docs/BUILD_PROMPT.md §11 item 5).
// Next keeps earlier pages mounted (hidden), so test ids are matched on visible elements only.

const visible = (page: import("@playwright/test").Page, id: string) => page.getByTestId(id).filter({ visible: true });

test.describe("report viewer (SCR-15)", () => {
  test("AT-RPT-01: the balance sheet at 31 March balances and drills down to the ledger", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Financial Reports");
    await visible(page, "report-balance-sheet").click();
    await page.locator("#rp-asof").fill("31/03/2027");
    await visible(page, "run-report").click();
    await expect(page).toHaveURL(/as_of=2027-03-31/);
    await expect(visible(page, "report-checks")).toHaveAttribute("data-ok", "true");
    await expect(visible(page, "report-checks")).toContainText("Total assets equal total liabilities plus equity");
    await expect(page.getByRole("cell", { name: "Current-year earnings" })).toBeVisible();

    // Groups collapse and expand.
    await page.getByRole("button", { name: "Collapse Current assets" }).click();
    await expect(page.getByRole("link", { name: "Accounts receivable – trade" })).toHaveCount(0);
    await page.getByRole("button", { name: "Expand Current assets" }).click();
    await page.getByRole("link", { name: "Accounts receivable – trade" }).click();
    await expect(page).toHaveURL(/general-ledger\?accounts=acc-1200/);
  });

  test("income statement with a comparative, the unposted option and a CSV export", async ({ page }) => {
    await signInAs(page, "finmgr");
    await page.goto("/en/reports/income-statement?from=2027-01-01&to=2027-03-31");
    await expect(visible(page, "report-table")).toContainText("Net profit (loss)");
    await page.locator("#rp-compare").selectOption("prior_period");
    await visible(page, "include-unposted").check();
    await visible(page, "run-report").click();
    await expect(page.getByRole("columnheader", { name: "Prior period (USD)" })).toBeVisible();
    await expect(page.getByText("Includes unposted transactions")).toBeVisible();

    await page.getByRole("button", { name: "Export" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /CSV/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/^income-statement-2027-01-01-2027-03-31\.csv$/);
  });

  test("the catalogue shows only permitted reports; later-phase reports are marked", async ({ page }) => {
    await signInAs(page, "aro");
    await navTo(page, "Financial Reports");
    await expect(visible(page, "report-customer-balances")).toBeVisible();
    await expect(visible(page, "report-balance-sheet")).toHaveCount(0);
    await visible(page, "report-customer-balances").click();
    await expect(visible(page, "report-checks")).toContainText("Total equals control account 1200");
  });

  test("a report renders in Khmer", async ({ page }) => {
    await signInAs(page, "owner", "km");
    await page.goto("/km/reports/income-statement?from=2027-01-01&to=2027-03-31");
    await expect(visible(page, "report-table")).toContainText("ប្រាក់ចំណេញ (ខាត) សុទ្ធ");
  });
});

test.describe("dashboard (SCR-02)", () => {
  test("AT-DASH-01: the year-to-date profit KPI equals the income statement, and opens it", async ({ page }) => {
    await signInAs(page, "finmgr");
    await visible(page, "dash-period").selectOption("year");
    const kpi = visible(page, "kpi-net_profit");
    await expect(kpi).toBeVisible();
    const value = await kpi.locator("[data-value]").getAttribute("data-value");
    await expect(visible(page, "pending-widget")).toContainText("not included in the figures above");
    await kpi.click();
    await expect(page).toHaveURL(/reports\/income-statement\?from=2027-01-01&to=2027-04-05/);
    const net = page.getByRole("row").filter({ hasText: "Net profit (loss)" });
    await expect(net).toContainText(new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(Math.abs(Number(value))));
  });

  test("widgets follow the role: the cashier sees cash but no profit or trend", async ({ page }) => {
    await signInAs(page, "cashier");
    await expect(visible(page, "kpi-cash")).toBeVisible();
    await expect(visible(page, "kpi-revenue")).toHaveCount(0);
    await expect(visible(page, "trend-widget")).toHaveCount(0);
  });

  test("the trend can be read as a table", async ({ page }) => {
    await signInAs(page, "owner");
    await page.getByRole("button", { name: "Show table" }).click();
    await expect(visible(page, "trend-widget").getByRole("row")).toHaveCount(13);
  });
});

test.describe("accessibility", () => {
  test("dashboard with widgets has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "finmgr");
    await expect(visible(page, "recent-widget")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("report viewer has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "finmgr");
    await page.goto("/en/reports/balance-sheet");
    await expect(visible(page, "report-table")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("responsive @responsive", () => {
  test("dashboard widgets and a report fit the screen", async ({ page }) => {
    await signInAs(page, "finmgr");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await expect(visible(page, "recent-widget")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/en/reports/income-statement");
    await expect(visible(page, "report-table")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
