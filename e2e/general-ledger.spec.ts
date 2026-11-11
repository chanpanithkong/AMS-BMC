import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yIssues, navTo, pickAccount, signInAs, switchUser } from "./helpers";

// Phase 2 end-to-end tests: scenarios 1–3 of docs/BUILD_PROMPT.md §10 and the GL screens.
// The mock database lives in the page, so each scenario stays in one page and moves by the sidebar.

async function newJournal(page: Page, description: string, date?: string) {
  await navTo(page, "Accounting", "Journal Entries");
  await page.getByTestId("new-journal").click();
  await expect(page.getByTestId("journal-editor")).toBeVisible();
  await page.locator("#jnl-description").fill(description);
  if (date) {
    await page.locator("#jnl-posting_date").fill(date);
    await page.locator("#jnl-document_date").fill(date);
    await page.locator("#jnl-document_date").press("Tab");
  }
}

test.describe("journals (SCR-04/05/06)", () => {
  test("scenario 1: unbalanced blocked, then balanced, approved, posted, reversed; the trial balance still balances", async ({ page }) => {
    test.slow(); // two users and five screens in one test
    await signInAs(page, "acct");
    await newJournal(page, "Accrued utilities and repairs");

    // Three lines, one cent short of balancing on purpose.
    await pickAccount(page, 1, "6200");
    await page.getByLabel("Debit, line 1").fill("600");
    await pickAccount(page, 2, "6500");
    await page.getByLabel("Debit, line 2").fill("400");
    await page.getByRole("button", { name: "Add line" }).click();
    await pickAccount(page, 3, "2150");
    await page.getByLabel("Credit, line 3").fill("999");
    await page.getByLabel("Credit, line 3").press("Tab");
    await expect(page.getByTestId("balance-indicator")).toHaveText("Debits and credits differ by 1.00");

    await page.getByTestId("submit-journal").click();
    await expect(page.getByTestId("journal-error")).toContainText("Debits and credits differ by 1.00");

    // Correct and submit.
    await page.getByLabel("Credit, line 3").fill("1000");
    await page.getByLabel("Credit, line 3").press("Tab");
    await expect(page.getByTestId("balance-indicator")).toHaveText("Balanced");
    await page.getByTestId("submit-journal").click();
    await expect(page.getByTestId("journal-page")).toHaveAttribute("data-status", "SUBMITTED");

    // Finance Manager approves and posts from the inbox.
    await switchUser(page, "finmgr");
    await navTo(page, "Approvals");
    await page.getByRole("cell", { name: "Accrued utilities and repairs" }).click();
    await page.getByTestId("approve").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("journal-page")).toHaveAttribute("data-status", "APPROVED");
    await page.getByTestId("post").click();
    const dialog = page.getByTestId("confirm-action-dialog");
    await expect(dialog).toContainText("6200 Utilities expense");
    await expect(dialog).toContainText("1,000.00 USD");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText(/Done: JV-2027-\d{6}/)).toBeVisible();
    await expect(page.getByTestId("posted-banner")).toContainText(/POSTED · JV-2027-\d{6}/);

    // AT-GL-04: reverse it with a reason; the original stays and is marked reversed.
    await page.getByTestId("reverse").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText("A reason is required")).toBeVisible();
    await page.getByRole("textbox", { name: "Reason" }).fill("Accrual already booked by the supplier invoice");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("journal-page")).toHaveAttribute("data-status", "REVERSED");
    await expect(page.getByText(/Reversed by JV-2027-\d{6}/)).toBeVisible();

    await navTo(page, "Accounting", "Trial Balance");
    await expect(page.getByTestId("tb-check")).toHaveText("Debits equal credits");
    await expect(page.getByTestId("tb-row-6200")).toBeVisible();
  });

  test("scenario 2: the accountant cannot approve their own journal (separation of duties)", async ({ page }) => {
    await signInAs(page, "acct");
    await newJournal(page, "Own journal for SoD check");
    await pickAccount(page, 1, "6400");
    await page.getByLabel("Debit, line 1").fill("50");
    await pickAccount(page, 2, "2150");
    await page.getByLabel("Credit, line 2").fill("50");
    await page.getByTestId("submit-journal").click();
    await expect(page.getByTestId("journal-page")).toHaveAttribute("data-status", "SUBMITTED");
    await expect(page.getByTestId("approve")).toBeDisabled();
    await expect(page.getByTestId("sod-indicator")).toHaveAttribute("data-state", "violation");
    await expect(page.getByTestId("sod-indicator")).toContainText("You prepared this record and cannot approve it");
  });

  test("scenario 3: a journal dated in a closed period gets PERIOD_CLOSED", async ({ page }) => {
    await signInAs(page, "acct");
    await newJournal(page, "Late February accrual", "15/02/2027");
    // The client warns at once…
    await expect(page.getByText("Posting date is in a closed period (February 2027)")).toBeVisible();
    await pickAccount(page, 1, "6200");
    await page.getByLabel("Debit, line 1").fill("80");
    await pickAccount(page, 2, "2150");
    await page.getByLabel("Credit, line 2").fill("80");
    // A draft may still be saved, but it cannot be submitted. The server refuses it too
    // (PERIOD_CLOSED, covered in tests/gl-mock.test.ts); the form stops it before the request.
    await page.getByTestId("save-draft").click();
    await expect(page).toHaveURL(/\/accounting\/journals\/jnl-/);
    // Next.js keeps the /new page mounted but hidden; act on the visible form.
    await page.getByTestId("submit-journal").filter({ visible: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Posting date is in a closed period (February 2027)" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId("journal-page").filter({ visible: true })).toHaveAttribute("data-status", "DRAFT");
  });

  test("a reversed journal is read-only and links to its reversal", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Accounting", "Journal Entries");
    await page.getByRole("tab", { name: "Reversed" }).click();
    await expect(page).toHaveURL(/status=REVERSED/);
    await page.getByPlaceholder("Number, reference or description").fill("Office rent April");
    await expect(page).toHaveURL(/search=Office/);
    await expect(page.getByRole("status").filter({ hasText: "1 of 1 shown" })).toBeVisible();
    await page.getByRole("cell", { name: "Office rent April 2027 (entered twice)" }).click();
    await expect(page.getByTestId("journal-page")).toHaveAttribute("data-status", "REVERSED");
    await expect(page.getByTestId("reverse")).toHaveCount(0);
    await expect(page.getByText(/Reversed by JV-2027-/)).toBeVisible();
  });
});

test.describe("chart of accounts (SCR-03)", () => {
  test("tree view, validation messages and a new account", async ({ page }) => {
    await signInAs(page, "acct");
    await navTo(page, "Accounting", "Chart of Accounts");
    await expect(page.getByTestId("account-row-1000")).toBeVisible();
    // Sensitive accounts are hidden for the accountant.
    await expect(page.getByTestId("account-row-6300")).toHaveCount(0);

    await page.getByTestId("new-account").click();
    const drawer = page.getByTestId("account-drawer");
    await drawer.locator("#acc-code").fill("6100");
    await drawer.locator("#acc-name").fill("Insurance expense");
    await drawer.locator("#acc-category").fill("Operating expenses");
    await drawer.locator("#acc-parent_id").selectOption("acc-6000");
    await drawer.getByRole("button", { name: "Save account" }).click();
    await expect(drawer.getByText("Account code already exists")).toBeVisible();

    await drawer.locator("#acc-code").fill("6900");
    await drawer.getByRole("button", { name: "Save account" }).click();
    await expect(page.getByText("Account 6900 created")).toBeVisible();
    await expect(page.getByTestId("account-row-6900")).toBeVisible();
  });

  test("a used account cannot be deleted", async ({ page }) => {
    await signInAs(page, "acct");
    await navTo(page, "Accounting", "Chart of Accounts");
    await page.getByTestId("account-row-6200").click();
    const drawer = page.getByTestId("account-drawer");
    await expect(drawer.getByText("This account has transactions.")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

test.describe("reports (SCR-07, SCR-08)", () => {
  test("trial balance drills down to the general ledger", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Accounting", "Trial Balance");
    await expect(page.getByTestId("tb-check")).toHaveText("Debits equal credits");
    await page.getByRole("link", { name: "Open 1110 in the General Ledger" }).click();
    const section = page.getByTestId("gl-account-1110");
    await expect(section).toBeVisible();
    await expect(section.getByText("Opening balance")).toBeVisible();
    await expect(page.getByTestId("gl-closing-1110")).toContainText("Closing balance");
  });
});

test.describe("periods (SCR-17)", () => {
  test("closing March is blocked by the checklist until it is resolved", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Accounting", "Accounting Periods");
    await page.getByRole("button", { name: "Show checklist for March 2027" }).click();
    await expect(page.getByTestId("blocking-items")).toBeVisible();
    await page.getByTestId("period-2027-03-close").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("confirm-action-dialog")).toContainText("This action is not allowed");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByTestId("tick-review").click();
    await expect(page.getByTestId("check-review")).toContainText("Done");
    await page.getByTestId("period-2027-03-close").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("period-2027-03")).toContainText("Closed");
  });

  test("reopening needs a reason and the Owner's approval", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Accounting", "Accounting Periods");
    await page.getByTestId("period-2027-02-requestReopen").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText("A reason is required")).toBeVisible();
    await page.getByRole("textbox", { name: "Reason" }).fill("Supplier invoice found late");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("period-2027-02")).toContainText("Pending");

    await switchUser(page, "owner");
    await navTo(page, "Accounting", "Accounting Periods");
    await page.getByTestId("period-2027-02-approveReopen").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("period-2027-02")).toContainText("Reopened");
  });
});

test.describe("exchange rates (SCR-24)", () => {
  test("a rate is entered in KHR per USD and a duplicate is refused", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Accounting", "Exchange Rates");
    await page.getByTestId("new-rate").click();
    const form = page.getByTestId("rate-form");
    await form.locator("#rate-date").fill("06/04/2027");
    await form.locator("#rate-value").fill("4105");
    await form.locator("#rate-value").press("Tab");
    // Rates are kept with 12 decimals (docs/DECISIONS.md D-P2-07), so 4,105 KHR per USD reads back exactly.
    await expect(page.getByTestId("confirm-action-dialog")).toContainText("0.000243605359 (1 USD = 4,105.00 KHR)");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText("Done: Rate saved")).toBeVisible();

    await page.getByTestId("new-rate").click();
    await form.locator("#rate-date").fill("06/04/2027");
    await form.locator("#rate-value").fill("4105");
    await form.locator("#rate-value").press("Tab");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("confirm-action-dialog")).toContainText("A record with these details already exists.");
  });
});

test.describe("Khmer and accessibility", () => {
  test("the trial balance and the journal form render in Khmer", async ({ page }) => {
    await signInAs(page, "acct", "km");
    await page.getByRole("navigation", { name: "ម៉ឺនុយមេ" }).getByRole("button", { name: "គណនេយ្យ", exact: true }).click();
    await page.getByRole("link", { name: "តារាងតុល្យភាពសាកល្បង" }).click();
    await expect(page.getByRole("heading", { name: "តារាងតុល្យភាពសាកល្បង" }).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "ដើមគ្រា" })).toBeVisible();
  });

  test("journal form has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "acct");
    await newJournal(page, "Accessibility check");
    await expectNoSeriousA11yIssues(page);
  });

  test("trial balance has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Accounting", "Trial Balance");
    await expect(page.getByTestId("tb-table")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("responsive @responsive", () => {
  test("approvals inbox, a journal and the GL inquiry fit the screen", async ({ page }) => {
    test.slow();
    await signInAs(page, "finmgr");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const width = page.viewportSize()?.width ?? 1280;
    const open = async (group: string, item?: string) => {
      if (width < 768) {
        await page.getByRole("button", { name: "Open menu" }).click();
        const drawer = page.getByRole("dialog");
        if (item) {
          const button = drawer.getByRole("button", { name: group, exact: true });
          if ((await button.getAttribute("aria-expanded")) === "false") await button.click();
          await drawer.getByRole("link", { name: item, exact: true }).click();
        } else {
          await drawer.getByRole("link", { name: group, exact: true }).click();
        }
      } else {
        await navTo(page, group, item);
      }
    };

    await open("Approvals");
    await expect(page.getByRole("heading", { name: "Approvals Inbox" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Prepaid insurance amortisation April" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);

    await page.getByRole("cell", { name: "Prepaid insurance amortisation April" }).click();
    await expect(page.getByTestId("journal-page").filter({ visible: true })).toHaveAttribute("data-status", "SUBMITTED");
    expect(await overflow()).toBeLessThanOrEqual(1);

    await open("Accounting", "Trial Balance");
    await page.getByRole("link", { name: "Open 1110 in the General Ledger" }).click();
    await expect(page.getByTestId("gl-account-1110")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
