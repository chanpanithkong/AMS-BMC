import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yIssues, navTo, signInAs, switchUser } from "./helpers";

// Next keeps earlier pages mounted (hidden), so test ids are matched on visible elements only.
// Phase 4 end-to-end tests: scenarios 4, 5 and 6 of docs/BUILD_PROMPT.md §10, plus statements, tax
// codes, accessibility and phone width.

/** ARO fills a one-line customer invoice for C-0010 and submits it. */
async function draftInvoice(page: Page, quantity: string, price: string) {
  await navTo(page, "Sales and Receivables", "Customer Invoices");
  await page.getByTestId("new-invoice").filter({ visible: true }).click();
  await page.locator("#inv-party").selectOption("cus-0010");
  await page.getByLabel("Description, line 1").fill("Rice 50 kg bags");
  await page.getByLabel("Quantity, line 1").fill(quantity);
  await page.getByLabel("Unit price, line 1").fill(price);
  await page.getByLabel("Tax code, line 1").selectOption("tax-vat10");
  await page.getByTestId("invoice-submit").filter({ visible: true }).click();
  await expect(page.getByTestId("invoice-page").filter({ visible: true })).toHaveAttribute("data-status", "SUBMITTED");
}

test.describe("receivables (SCR-09, SCR-10)", () => {
  test("scenario 4: invoices approved and posted, one receipt allocated across both → Paid and Partially Paid", async ({ page }) => {
    test.slow();
    await signInAs(page, "aro");
    await draftInvoice(page, "2", "250"); // 500 + 10 % = 550.00
    await draftInvoice(page, "1", "300"); // 300 + 10 % = 330.00

    // The accountant approves both from the inbox; the preparer cannot approve their own.
    await switchUser(page, "acct");
    for (let i = 0; i < 2; i += 1) {
      await navTo(page, "Approvals");
      const waiting = page.getByRole("row").filter({ hasText: "Customer invoice" }).filter({ hasText: "Naga Retail" });
      await expect(waiting).toHaveCount(2 - i); // the inbox has refreshed after the previous approval
      await waiting.first().click();
      await page.getByTestId("invoice-approve").filter({ visible: true }).click();
      await page.getByTestId("confirm-action").filter({ visible: true }).click();
      await expect(page.getByTestId("invoice-page").filter({ visible: true })).toHaveAttribute("data-status", "APPROVED");
    }

    await switchUser(page, "aro");
    const numbers: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await navTo(page, "Sales and Receivables", "Customer Invoices");
      await page.getByRole("tab", { name: "Approved" }).click();
      const approved = page.getByRole("row").filter({ hasText: "Naga Retail" });
      await expect(approved).toHaveCount(2 - i);
      await approved.first().click();
      await page.getByTestId("invoice-post").filter({ visible: true }).click();
      await page.getByTestId("confirm-action").filter({ visible: true }).click();
      await expect(page.getByTestId("invoice-page").filter({ visible: true })).toHaveAttribute("data-status", "OPEN");
      numbers.push((await page.getByTestId("invoice-posted").filter({ visible: true }).textContent())!.match(/INV-2027-\d{6}/)![0]);
    }

    // Receipt of 700.00: auto-allocation pays the first invoice and part of the second.
    await navTo(page, "Sales and Receivables", "Receipts");
    await page.getByTestId("new-payment").filter({ visible: true }).click();
    await page.locator("#pay-party").selectOption("cus-0010");
    await page.locator("#pay-account").selectOption({ label: "ABA-USD · ABA current account – USD" });
    await page.locator("#pay-amount").fill("700");
    await page.locator("#pay-reference").fill("TT-E2E-700");
    const grid = page.getByTestId("allocation-row").filter({ visible: true });
    for (const n of numbers) await expect(grid.filter({ hasText: n })).toBeVisible();
    for (const [n, amount] of [[numbers[0], "550"], [numbers[1], "150"]] as const) {
      await page.getByLabel(`Allocate amount for ${n}`).fill(amount);
    }
    await expect(page.getByTestId("unallocated").filter({ visible: true })).toContainText("0.00");
    await page.getByTestId("receipt-post").filter({ visible: true }).click();
    await expect(page.getByTestId("amount-in-words").filter({ visible: true })).toHaveText("Seven hundred US dollars only");
    await page.getByTestId("confirm-action").filter({ visible: true }).click();
    await expect(page.getByTestId("payment-page").filter({ visible: true })).toHaveAttribute("data-status", "POSTED");
    await expect(page.getByTestId("payment-done").filter({ visible: true })).toContainText(/RV-2027-\d{6}/);

    await navTo(page, "Sales and Receivables", "Customer Invoices");
    for (const [n, status] of [[numbers[0], "Paid"], [numbers[1], "Partially Paid"]] as const) {
      await page.getByPlaceholder("Number, party or reference").filter({ visible: true }).fill(n);
      await expect(page.getByRole("row").filter({ hasText: n })).toContainText(status);
    }
  });

  test("AT-AR-03 in the form: allocating more than the invoice's balance is flagged", async ({ page }) => {
    await signInAs(page, "aro");
    await navTo(page, "Sales and Receivables", "Receipts");
    await page.getByTestId("new-payment").filter({ visible: true }).click();
    await page.locator("#pay-party").selectOption("cus-0001");
    await page.locator("#pay-amount").fill("99999");
    const first = page.getByTestId("allocation-row").filter({ visible: true }).first();
    await first.getByRole("textbox").fill("99999");
    await expect(first.getByRole("alert")).toBeVisible();
  });

  test("a customer statement shows opening, running and closing balances", async ({ page }) => {
    await signInAs(page, "aro");
    await navTo(page, "Sales and Receivables", "Customers");
    await page.getByRole("link", { name: "C-0001" }).click();
    await page.getByTestId("statement-tab").filter({ visible: true }).click();
    await expect(page.getByTestId("statement").filter({ visible: true })).toContainText("Opening balance");
    await expect(page.getByTestId("statement-closing").filter({ visible: true })).not.toBeEmpty();
    await expect(page.getByTestId("aging-buckets").filter({ visible: true })).toContainText("Over 90 days");
  });
});

test.describe("payables (SCR-11, SCR-12)", () => {
  test("scenario 5: a duplicate supplier invoice number is blocked", async ({ page }) => {
    await signInAs(page, "apo");
    await navTo(page, "Purchases and Payables", "Supplier Invoices");
    await page.getByTestId("new-invoice").filter({ visible: true }).click();
    await page.locator("#inv-party").selectOption("sup-0001");
    await page.getByTestId("supplier-invoice-no").filter({ visible: true }).fill("inv 001");
    await page.getByTestId("supplier-invoice-no").filter({ visible: true }).press("Tab");
    await expect(page.getByText(/Already recorded as BILL-2027-\d{6}/)).toBeVisible();
    await expect(page.getByTestId("invoice-save").filter({ visible: true })).toBeDisabled();
    await expect(page.getByTestId("invoice-submit").filter({ visible: true })).toBeDisabled();

    // A different number for the same supplier is accepted.
    await page.getByTestId("supplier-invoice-no").filter({ visible: true }).fill("INV-002");
    await page.getByTestId("supplier-invoice-no").filter({ visible: true }).press("Tab");
    await expect(page.getByText(/Already recorded as/)).toHaveCount(0);
    await expect(page.getByTestId("invoice-save").filter({ visible: true })).toBeEnabled();
  });

  test("scenario 6: a supplier payment released twice posts once and reports \"already released\"", async ({ page }) => {
    test.slow();
    await signInAs(page, "finmgr");
    await navTo(page, "Purchases and Payables", "Payments");
    await page.getByRole("tab", { name: "Approved" }).click();
    const request = page.waitForRequest((r) => /\/api\/v1\/supplier-payments\/spv-appr-1$/.test(r.url()) && r.method() === "GET");
    await page.getByRole("row").filter({ hasText: "Approved" }).first().click();
    const seen = await request;
    await expect(page.getByTestId("payment-page").filter({ visible: true })).toHaveAttribute("data-status", "APPROVED");
    await expect(page.getByTestId("pay-to").filter({ visible: true })).toContainText("Supplier and bank details verified");

    await page.getByTestId("payment-release").filter({ visible: true }).click();
    const dialog = page.getByTestId("confirm-action-dialog").filter({ visible: true });
    await expect(page.getByTestId("amount-in-words").filter({ visible: true })).toContainText("US dollars");
    await expect(page.getByTestId("confirm-action").filter({ visible: true })).toBeDisabled();
    await dialog.locator("#release-ref").fill("ABA-778812");

    // Meanwhile the same payment is released from another session.
    const headers = await seen.allHeaders();
    const first = await page.evaluate(async ({ url, headers }) => {
      const r = await fetch(`${url}/release`, {
        method: "POST",
        headers: { Authorization: headers.authorization, "X-Company-Id": headers["x-company-id"], "Content-Type": "application/json", "Idempotency-Key": "other-session" },
        body: JSON.stringify({ bank_reference: "ABA-778812" }),
      });
      return { status: r.status, body: await r.json() };
    }, { url: seen.url(), headers });
    expect(first.status).toBe(200);

    await page.getByTestId("confirm-action").filter({ visible: true }).click();
    await expect(page.getByText("Already completed: This payment has already been released.")).toBeVisible();
    await expect(page.getByTestId("payment-page").filter({ visible: true })).toHaveAttribute("data-status", "PAID");
    await expect(page.getByTestId("payment-done").filter({ visible: true })).toContainText(first.body.number);
  });

  test("a payment to a supplier whose bank change waits for approval cannot be submitted", async ({ page }) => {
    await signInAs(page, "apo");
    await navTo(page, "Purchases and Payables", "Payments");
    await page.getByRole("tab", { name: "Draft" }).click();
    await page.getByRole("row").filter({ hasText: "Draft" }).first().click();
    await expect(page.getByTestId("pay-to").filter({ visible: true })).toContainText("waiting for approval");
    await page.getByTestId("payment-submit").filter({ visible: true }).click();
    await expect(page.getByTestId("payment-error").filter({ visible: true })).toContainText("not verified, so it cannot be paid");
  });
});

test.describe("tax codes (SCR-22)", () => {
  test("shows verification status and the rate history; a new rate unverifies the code", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Tax");
    await expect(page.getByTestId("tax-disclaimer").filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId("tax-row-ACC").filter({ visible: true })).toContainText("Unverified");
    await page.getByTestId("tax-row-VAT10").filter({ visible: true }).click();
    await expect(page.getByTestId("tax-code-page").filter({ visible: true })).toHaveAttribute("data-verification", "VERIFIED");
    await page.locator("#new-rate").fill("12");
    await page.getByTestId("add-rate").filter({ visible: true }).click();
    await expect(page.getByTestId("rate-timeline").filter({ visible: true })).toContainText("Scheduled");
    await expect(page.getByTestId("tax-code-page").filter({ visible: true })).toHaveAttribute("data-verification", "UNVERIFIED");
  });
});

test.describe("accessibility", () => {
  test("customer invoice form has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "aro");
    await navTo(page, "Sales and Receivables", "Customer Invoices");
    await page.getByTestId("new-invoice").filter({ visible: true }).click();
    await page.locator("#inv-party").selectOption("cus-0001");
    await expect(page.getByTestId("credit-panel").filter({ visible: true })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("supplier payment page has no serious accessibility issues", async ({ page }) => {
    await signInAs(page, "finmgr");
    await navTo(page, "Purchases and Payables", "Payments");
    await page.getByRole("tab", { name: "Approved" }).click();
    await page.getByRole("row").filter({ hasText: "Approved" }).first().click();
    await expect(page.getByTestId("payment-page").filter({ visible: true })).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("responsive @responsive", () => {
  test("invoice list, invoice and aging fit a phone screen", async ({ page }) => {
    await signInAs(page, "acct");
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/en/sales/invoices");
    await expect(page.getByRole("table")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/en/purchases/invoices/bill-sub-1");
    await expect(page.getByTestId("invoice-page").filter({ visible: true })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.goto("/en/sales/aging");
    await expect(page.getByTestId("aging-control").filter({ visible: true })).toContainText("Agrees with control account 1200");
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
