import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yIssues, navTo, signInAs, switchUser } from "./helpers";

// Phase 6 end-to-end tests: fixed assets and depreciation runs (SCR-14), budgets (SCR-23), FX
// revaluation, the inventory page (feature flag) and the import wizard (SCR-25).
// Next keeps earlier pages mounted (hidden), so test ids are matched on visible elements only.

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

test.describe("fixed assets (SCR-14)", () => {
  test("AT-FA-01 and AT-FA-02: the April run is previewed, approved, posted, and cannot run twice", async ({ page }) => {
    test.slow();
    await signInAs(page, "acct");
    await navTo(page, "Fixed Assets", "Depreciation Runs");
    await visible(page, "run-preview").click();
    await expect(visible(page, "run-page")).toHaveAttribute("data-status", "DRAFT");
    await expect(visible(page, "run-lines").getByRole("row").filter({ hasText: "FA-0001" })).toContainText("200.00");

    await switchUser(page, "finmgr");
    await navTo(page, "Approvals");
    await page.getByRole("row").filter({ hasText: "Depreciation run" }).first().click();
    await visible(page, "run-approve").click();
    await visible(page, "confirm-action").click();
    await expect(visible(page, "run-page")).toHaveAttribute("data-status", "APPROVED");
    await visible(page, "run-post").click();
    await visible(page, "confirm-action").click();
    await expect(visible(page, "run-posted")).toContainText(/DR-2027-\d{6}/);

    await switchUser(page, "acct");
    await navTo(page, "Fixed Assets", "Depreciation Runs");
    await visible(page, "run-preview").click();
    await expect(visible(page, "run-error")).toHaveText("Depreciation for April 2027 already posted");
  });

  test("AT-FA-03 style: a disposal is requested, approved by another user and posted", async ({ page }) => {
    test.slow();
    await signInAs(page, "acct");
    await navTo(page, "Fixed Assets", "Fixed Asset Register");
    await page.getByRole("link", { name: "FA-0002" }).click();
    await visible(page, "asset-dispose").click();
    const form = visible(page, "dispose-form");
    await form.locator("#dp-proceeds").fill("1000");
    await form.locator("#dp-account").selectOption({ label: "ABA-USD · ABA current account – USD" });
    await form.locator("#dp-reason").fill("Replaced by new furniture");
    await expect(visible(page, "disposal-preview")).toContainText(/a (gain|loss) of/);
    await visible(page, "dispose-submit").click();
    await expect(visible(page, "asset-page")).toHaveAttribute("data-status", "DISPOSAL_PENDING");

    await switchUser(page, "finmgr");
    await navTo(page, "Approvals");
    await page.getByRole("row").filter({ hasText: "Asset disposal" }).click();
    await visible(page, "disposal-approve").click();
    await visible(page, "confirm-action").click();
    await expect(visible(page, "asset-page")).toHaveAttribute("data-status", "DISPOSED");
    await expect(visible(page, "disposal-done")).toContainText(/JV-2027-\d{6}/);
  });

  test("the new-asset form previews the depreciation schedule", async ({ page }) => {
    await signInAs(page, "acct");
    await navTo(page, "Fixed Assets", "Fixed Asset Register");
    await visible(page, "new-asset").click();
    await page.locator("#fa-category_id").selectOption("fac-furniture");
    await page.locator("#fa-cost").fill("12000");
    await page.locator("#fa-cost").press("Tab");
    await expect(visible(page, "schedule-preview")).toContainText("200.00 USD a month for 60 months");
    await page.locator("#fa-residual_value").fill("12000");
    await page.locator("#fa-name").fill("Meeting table");
    await visible(page, "asset-save").click();
    await expect(visible(page, "asset-error")).toContainText("Residual value must be less than cost");
  });
});

test.describe("budgets (SCR-23)", () => {
  test("AT-BUD-02: version 2 is edited, submitted and approved; version 1 becomes superseded", async ({ page }) => {
    test.slow();
    await signInAs(page, "finmgr");
    await navTo(page, "Budgets");
    await expect(visible(page, "budget-view")).toHaveAttribute("data-status", "DRAFT");
    await expect(visible(page, "budget-use")).toBeVisible();
    // Typing an annual total spreads it over the months.
    const line = visible(page, "budget-line").filter({ hasText: "6400" });
    await line.getByLabel(/Annual total, line \d+/).fill("12000");
    await line.getByLabel(/Annual total, line \d+/).press("Tab");
    await expect(line.getByLabel(/Jan, line \d+/)).toHaveValue("1,000.00");
    await visible(page, "bud-submit").click();
    await expect(visible(page, "budget-view")).toHaveAttribute("data-status", "SUBMITTED");

    await switchUser(page, "owner");
    await navTo(page, "Approvals");
    await page.getByRole("row").filter({ hasText: "Budget" }).click();
    await visible(page, "bud-approve").click();
    await visible(page, "confirm-action").click();
    await expect(visible(page, "budget-view")).toHaveAttribute("data-status", "APPROVED");
    await expect(visible(page, "bud-version").locator("option").filter({ hasText: "v1" })).toHaveText(/Superseded/);
  });
});

test.describe("FX revaluation and inventory", () => {
  test("AT-FX-03: March is revalued once, with its reversal", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Accounting", "FX Revaluation");
    await page.locator("#fxr-period").selectOption({ label: "March 2027 · Soft-closed" });
    await visible(page, "fxr-preview").click();
    await expect(visible(page, "fxr-result")).toHaveAttribute("data-status", "DRAFT");
    await visible(page, "fxr-post").click();
    await visible(page, "confirm-action").click();
    await expect(visible(page, "fxr-result")).toHaveAttribute("data-status", "POSTED");
    await expect(visible(page, "fxr-journals")).toContainText(/JV-2027-\d{6}.*JV-2027-\d{6}/);
    await visible(page, "fxr-preview").click();
    await expect(visible(page, "fxr-error")).toHaveText("Revaluation for March 2027 already posted");
  });

  test("AT-INV-01 and AT-INV-02: the reconciliation shows 100.00 and an event is posted once", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Inventory Integration");
    await expect(visible(page, "inv-reconciliation")).toContainText("Difference of 100.00 USD to investigate");
    const form = visible(page, "inv-form");
    await form.locator("#inv-src").fill("E-200");
    await form.locator("#inv-item").fill("Cooking oil 5 L");
    await form.locator("#inv-value").fill("120");
    await visible(page, "inv-send").click();
    await expect(page.getByText(/Done|Posted as JV-2027-\d{6}/).first()).toBeVisible();
    await visible(page, "inv-send").click();
    await expect(page.getByText(/Event E-200 was already received; nothing new was posted/)).toBeVisible();
  });
});

test.describe("import wizard (SCR-25)", () => {
  test("AT-IMP-01: an unbalanced journal file is rejected with an error report; a corrected one imports drafts", async ({ page }, testInfo) => {
    test.slow();
    await signInAs(page, "acct");
    await navTo(page, "System Settings", "Data Import");
    await visible(page, "new-import").click();
    await visible(page, "import-type-JOURNALS").click();
    const csv = (credit: string) => `journal_ref,posting_date,description,account_code,debit,credit,currency\r\nE2E-1,2027-04-05,Office supplies,6500,50.00,0,USD\r\nE2E-1,2027-04-05,Office supplies,1101,0,${credit},USD\r\n`;
    const bad = testInfo.outputPath("journals-bad.csv");
    const good = testInfo.outputPath("journals-good.csv");
    const fs = await import("node:fs/promises");
    await fs.writeFile(bad, csv("49.99"));
    await fs.writeFile(good, csv("50.00"));

    await page.locator("#imp-file").setInputFiles(bad);
    await expect(visible(page, "import-mapping")).toBeVisible();
    await visible(page, "import-validate").click();
    await expect(visible(page, "import-preview")).toHaveAttribute("data-status", "FAILED");
    await expect(visible(page, "import-errors")).toContainText("Journal E2E-1 does not balance");
    await expect(visible(page, "import-commit")).toHaveCount(0);
    const [report] = await Promise.all([page.waitForEvent("download"), visible(page, "error-report").click()]);
    expect(report.suggestedFilename()).toBe("journals-bad-errors.csv");

    await page.getByRole("button", { name: "Upload a corrected file" }).click();
    await page.locator("#imp-file").setInputFiles(good);
    await visible(page, "import-validate").click();
    await expect(visible(page, "import-preview")).toHaveAttribute("data-status", "VALIDATED");
    await visible(page, "import-commit").click();
    await visible(page, "confirm-action").click();
    await expect(visible(page, "import-done")).toContainText("1 record created");
    await expect(visible(page, "import-done").getByRole("link", { name: "E2E-1" })).toBeVisible();
  });
});

test.describe("accessibility", () => {
  test("asset page and budget grid have no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Fixed Assets", "Fixed Asset Register");
    await page.getByRole("link", { name: "FA-0001" }).click();
    await expect(visible(page, "asset-page")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
    await navTo(page, "Budgets");
    await expect(visible(page, "budget-grid")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("import wizard has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "acct");
    await navTo(page, "System Settings", "Data Import");
    await visible(page, "new-import").click();
    await visible(page, "import-type-CUSTOMERS").click();
    await expect(visible(page, "import-wizard")).toHaveAttribute("data-step", "file");
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("responsive @responsive", () => {
  test("asset register, a run and the budget grid fit the screen", async ({ page }) => {
    await signInAs(page, "finmgr");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/en/fixed-assets");
    await expect(page.getByRole("link", { name: "FA-0001" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/en/fixed-assets/depreciation-runs/dr-2027-03");
    await expect(visible(page, "run-lines")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/en/budgets");
    await expect(visible(page, "budget-grid")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
