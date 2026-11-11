import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yIssues, navTo, signInAs, switchUser } from "./helpers";

// Phase 3 end-to-end tests: scenario 7 of docs/BUILD_PROMPT.md §10, plus transfers, statement import,
// expenses and the cashier's own-account scope.

test.describe("bank reconciliation (SCR-13)", () => {
  test("scenario 7: auto-match, completion blocked by the difference, completed after adjustments", async ({ page }) => {
    test.slow();
    await signInAs(page, "finmgr");
    await navTo(page, "Cash and Bank", "Bank Reconciliation");
    await page.getByTestId("rec-row-rec-aba-2027-03").click();
    await expect(page.getByTestId("reconciliation")).toHaveAttribute("data-status", "IN_PROGRESS");

    await page.getByTestId("auto-match").click();
    await expect(page.getByText(/\d+ pairs matched/)).toBeVisible();
    await expect(page.getByTestId("rec-difference")).toContainText("(2.90) USD");

    // Completion without an explanation is refused while a difference remains.
    await page.getByTestId("complete-rec").click();
    const dialog = page.getByTestId("confirm-action-dialog");
    await expect(dialog).toContainText("Difference of 2.90 must be resolved or explained before completion");
    await page.getByTestId("confirm-action").click();
    await expect(dialog.getByText("A reason is required")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Record the fee and the interest from the statement.
    for (const line of ["MONTHLY SERVICE FEE", "INTEREST CREDIT"]) {
      await page.getByRole("checkbox", { name: `Select ${line}` }).click();
      await page.getByTestId("create-adjustment").click();
      await page.getByTestId("confirm-action").click();
      await expect(page.getByText("Done: Adjustment posted and matched")).toBeVisible();
      await page.getByText("Done: Adjustment posted and matched").waitFor({ state: "detached" }).catch(() => undefined);
    }
    await expect(page.getByTestId("rec-difference")).toHaveAttribute("data-zero", "true");

    await page.getByTestId("complete-rec").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("rec-locked")).toBeVisible();
    await expect(page.getByTestId("auto-match")).toHaveCount(0);
  });

  test("statement import: preview, import, then the same file again is all duplicates", async ({ page }, testInfo) => {
    test.slow();
    await signInAs(page, "acct");
    await navTo(page, "Cash and Bank", "Bank Reconciliation");
    await page.getByRole("link", { name: "Import statement" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download a sample April statement/ }).click()]);
    const file = testInfo.outputPath("aba-usd-2027-04.csv");
    await download.saveAs(file);

    const importOnce = async () => {
      await page.locator("#imp-file").setInputFiles(file);
      await page.getByTestId("import-next").click();
      await expect(page.getByTestId("import-mapping")).toContainText("Using the mapping saved for this account.");
      await page.getByTestId("import-preview").click();
      return page.getByTestId("import-counts");
    };
    const counts = await importOnce();
    await expect(counts).toContainText(/\d+ new · 0 duplicates/);
    await page.getByTestId("import-commit").click();
    await expect(page.getByTestId("import-result")).toContainText("statement lines imported");

    await page.getByRole("button", { name: "Import another file" }).click();
    const again = await importOnce();
    await expect(again).toContainText(/^0 new · \d+ duplicates/);
    await expect(page.getByTestId("import-commit")).toBeDisabled();
  });
});

test.describe("cash and bank transactions (SCR-27)", () => {
  test("AT-CB-04: a transfer posts once and shows in both books", async ({ page }) => {
    test.slow();
    await signInAs(page, "acct");
    await navTo(page, "Cash and Bank", "Cash and Bank Transactions");
    await page.getByTestId("new-cash-transaction").click();
    await page.getByTestId("new-TRANSFER").click();
    await page.locator("#ctx-account").selectOption({ label: "ABA-USD · ABA current account – USD" });
    await page.locator("#ctx-to").selectOption({ label: "PETTY · Petty cash" });
    await page.locator("#ctx-amount").fill("250");
    await page.locator("#ctx-reference").fill("TOPUP-E2E");
    await page.locator("#ctx-description").fill("Petty cash top-up");
    await page.getByTestId("cash-submit").click();
    await expect(page.getByTestId("cash-page")).toHaveAttribute("data-status", "SUBMITTED");
    await page.getByTestId("cash-post").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText(/Done: TR-2027-\d{6}/)).toBeVisible();

    await navTo(page, "Cash and Bank", "Cash and Bank Accounts");
    await page.getByRole("link", { name: "PETTY" }).click();
    await expect(page.getByTestId("account-book")).toContainText("TOPUP-E2E");
  });

  test("the cashier sees only the cash accounts in their custody", async ({ page }) => {
    await signInAs(page, "cashier");
    await navTo(page, "Cash and Bank", "Cash and Bank Accounts");
    await expect(page.getByTestId("cb-account-CASH-USD")).toBeVisible();
    await expect(page.getByTestId("cb-account-PETTY")).toBeVisible();
    await expect(page.getByTestId("cb-account-CASH-KHR")).toHaveCount(0);
    await expect(page.getByTestId("cb-table-BANK")).toHaveCount(0);
  });
});

test.describe("expenses (SCR-21)", () => {
  test("prepared, approved by the department manager, posted and paid", async ({ page }) => {
    test.slow();
    await signInAs(page, "acct");
    await navTo(page, "Expenses");
    await page.getByTestId("new-expense").click();
    await page.locator("#exp-category").selectOption({ label: "Utilities" });
    await page.locator("#exp-description").fill("Warehouse water April");
    await page.locator("#exp-payee").fill("PPWSA");
    await page.locator("#exp-amount").fill("120");
    await page.locator("#exp-mode").selectOption("UNPAID");
    await page.getByLabel("Department, line 1").selectOption({ label: "Operations" });
    await page.getByLabel("Branch, line 1").selectOption({ label: "Phnom Penh HQ" });
    await expect(page.getByTestId("allocation-total")).toHaveAttribute("data-ok", "true");
    await expect(page.getByTestId("spending-panel")).toContainText("6200");
    await page.getByTestId("expense-submit").click();
    await expect(page.getByTestId("expense-page")).toHaveAttribute("data-status", "SUBMITTED");

    await switchUser(page, "deptmgr");
    await navTo(page, "Approvals");
    await page.getByRole("cell", { name: "Warehouse water April" }).click();
    await page.getByTestId("expense-approve").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("expense-page")).toHaveAttribute("data-status", "APPROVED");

    await switchUser(page, "finmgr");
    await navTo(page, "Expenses");
    await page.getByRole("tab", { name: "Approved" }).click();
    await page.getByRole("cell", { name: "Warehouse water April" }).click();
    await page.getByTestId("expense-post").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("expense-posted")).toContainText(/EXP-2027-\d{6}/);

    await page.getByTestId("expense-settle").click();
    await page.locator("#settle-from").selectOption({ label: "ABA-USD · ABA current account – USD" });
    await expect(page.getByTestId("amount-in-words")).toHaveText("One hundred twenty US dollars only");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("expense-settled")).toContainText(/Paid by PV-2027-\d{6}/);
  });

  test("AT-EXP-02 and AT-EXP-03: the 33.33 % split and the travel attachment rule", async ({ page }) => {
    await signInAs(page, "acct");
    await navTo(page, "Expenses");
    await page.getByTestId("new-expense").click();
    await page.locator("#exp-category").selectOption({ label: "Travel" });
    await expect(page.getByTestId("attachment-note")).toContainText("Travel needs an attached receipt or invoice");
    await page.locator("#exp-amount").fill("100");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByRole("button", { name: "Add line" }).click();
    for (const [i, dept, pct] of [[1, "Admin", "33.33"], [2, "Sales", "33.33"], [3, "Operations", "33.34"]] as const) {
      await page.getByLabel(`Department, line ${i}`).selectOption({ label: dept });
      await page.getByLabel(`Percentage, line ${i}`).fill(pct);
    }
    const lines = page.getByTestId("allocation-line");
    await expect(lines.nth(0)).toContainText("33.33");
    await expect(lines.nth(2)).toContainText("33.34");
    await expect(page.getByTestId("allocation-total")).toHaveText(/100.00% of 100%/);

    await page.locator("#exp-description").fill("Taxi to the airport");
    await page.getByTestId("expense-submit").click();
    await expect(page.getByTestId("expense-error")).toContainText("Travel needs an attached receipt or invoice");
  });
});

test.describe("accessibility", () => {
  test("reconciliation page has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "acct");
    await navTo(page, "Cash and Bank", "Bank Reconciliation");
    await page.getByTestId("rec-row-rec-aba-2027-03").click();
    await expect(page.getByTestId("rec-summary")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("expense form has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "acct");
    await navTo(page, "Expenses");
    await page.getByTestId("new-expense").click();
    await expect(page.getByTestId("expense-form")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("responsive @responsive", () => {
  test("cash and bank accounts and the reconciliation fit the screen", async ({ page }) => {
    await signInAs(page, "finmgr");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // A reload keeps the session (restored from the refresh session) and rebuilds the demo data.
    await page.goto("/en/cash-bank/accounts");
    await expect(page.getByTestId("cb-table-BANK")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/en/cash-bank/reconciliations/rec-aba-2027-03");
    await expect(page.getByTestId("rec-summary")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
