import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Phase 1 end-to-end tests. Scenarios 8 and 9 of docs/BUILD_PROMPT.md §10 are covered here as far as
// Phase 1 screens allow; the transaction scenarios (1–7) arrive with their modules.

const DEMO_PASSWORD = "Demo@1234";
const DEMO_OTP = "123456";
const MFA_USERS = ["owner", "finmgr", "sysadmin"];

async function signInAs(page: Page, username: string, locale = "en") {
  await page.goto(`/${locale}/login`);
  await page.getByTestId(`demo-${username}`).click();
  // Users without MFA land on the dashboard; wait for it so that later navigation keeps the session.
  if (!MFA_USERS.includes(username)) await expect(page.getByTestId("dashboard")).toBeVisible();
}

async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

test.describe("sign-in (SCR-01)", () => {
  test("shows field messages, then a generic error for wrong details", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Enter your email or username")).toBeVisible();

    await page.getByLabel("Email or username").fill("acct");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByTestId("login-error")).toHaveText("Incorrect sign-in details");
  });

  test("accountant signs in with a password and reaches the dashboard", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email or username").fill("acct@demo.ams.test");
    await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Welcome, Ly Sreymom" })).toBeVisible();
  });

  test("finance manager must pass the MFA step", async ({ page }) => {
    await signInAs(page, "finmgr");
    await expect(page.getByRole("heading", { name: "Verification code" })).toBeVisible();
    await page.getByLabel("Verification code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByTestId("login-error")).toHaveText("Invalid verification code");

    await page.getByLabel("Verification code").fill(DEMO_OTP);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("heading", { name: "Welcome, Keo Vannak" })).toBeVisible();
  });

  test("locks the account after five failed attempts", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email or username").fill("readonly");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.getByLabel("Password", { exact: true }).fill(`wrong-${attempt}`);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByTestId("login-error")).toBeVisible();
      if (attempt < 4) await expect(page.getByTestId("login-error")).toHaveText("Incorrect sign-in details");
    }
    await expect(page.getByTestId("login-error")).toHaveText(/Account locked until \d{2}:\d{2}/);
  });

  test("the session survives a reload and ends on sign-out", async ({ page }) => {
    await signInAs(page, "acct");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("dashboard")).toBeVisible();

    await page.getByTestId("user-menu").click();
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/en\/login/);
    await page.goto("/en/dashboard");
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("forgot password never reveals whether the account exists", async ({ page }) => {
    await page.goto("/en/forgot-password");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists for this email, a reset link has been sent.")).toBeVisible();
  });
});

test.describe("roles and navigation", () => {
  test("scenario 9: CASHIER sees only permitted menu items and gets 403 for user management", async ({ page }) => {
    await signInAs(page, "cashier");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByText("Dashboard")).toBeVisible();
    await expect(nav.getByText("Cash and Bank")).toBeVisible();
    await expect(nav.getByText("Sales and Receivables")).toBeVisible();
    for (const hidden of ["User Management", "System Settings", "Fixed Assets", "Budgets", "Tax", "Approvals", "Audit Trail"]) {
      await expect(nav.getByText(hidden)).toHaveCount(0);
    }
    // Only Receipts is in scope for the cashier, so the group links straight to it.
    await expect(nav.getByRole("link", { name: "Customer Invoices" })).toHaveCount(0);
    await nav.getByRole("link", { name: "Sales and Receivables" }).click();
    await expect(page).toHaveURL(/\/en\/sales\/receipts$/);

    await page.goto("/en/admin/users");
    await expect(page).toHaveURL(/\/en\/403$/);
    await expect(page.getByTestId("forbidden-page")).toContainText("You do not have access to this page");
  });

  test("SYSADMIN reaches user management but not accounting", async ({ page }) => {
    await signInAs(page, "sysadmin");
    await page.getByLabel("Verification code").fill(DEMO_OTP);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await page.goto("/en/admin/users");
    await expect(page.getByTestId("coming-soon")).toContainText("Phase 7");
    await page.goto("/en/accounting/journals");
    await expect(page).toHaveURL(/\/en\/403$/);
  });

  test("an unauthenticated visitor is sent to sign-in and returned to the page asked for", async ({ page }) => {
    await page.goto("/en/accounting/journals");
    await expect(page).toHaveURL(/\/en\/login\?next=/);
    await page.getByTestId("demo-acct").click();
    await expect(page).toHaveURL(/\/en\/accounting\/journals$/);
    await expect(page.getByTestId("coming-soon")).toContainText("Journal Entries");
  });

  test("the header shows company, branch, search and unread notifications", async ({ page }) => {
    await signInAs(page, "acct");
    await expect(page.getByText("Demo Trading Co., Ltd.").first()).toBeVisible();
    await expect(page.getByTestId("unread-count")).toHaveText("2");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByPlaceholder(/Search accounts/).fill("6200");
    await expect(page.getByText("6200 Utilities expense")).toBeVisible();
  });
});

test.describe("language (scenario 8, Phase 1 part)", () => {
  test("switching to Khmer translates the menu, the dashboard and the form", async ({ page }) => {
    await signInAs(page, "acct");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    // Next.js keeps the previous page mounted but hidden, so target the visible switch.
    await page.getByTestId("language-switch").filter({ visible: true }).click();
    await page.getByTestId("language-km").click();
    await expect(page).toHaveURL(/\/km\/dashboard$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "km");
    const nav = page.getByRole("navigation", { name: "ម៉ឺនុយមេ" });
    await expect(nav.getByText("គណនេយ្យ", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "សូមស្វាគមន៍ លី ស្រីមុំ" })).toBeVisible();

    // A form and its controls in Khmer: the journal grid on the component gallery.
    await page.goto("/km/dev/components");
    await expect(page.getByRole("columnheader", { name: "ឥណពន្ធ" }).first()).toBeVisible();
    await expect(page.getByTestId("balance-indicator")).toContainText("ឥណពន្ធ និងឥណទានខុសគ្នា 1.00");
  });

  test("the login page is available in Khmer", async ({ page }) => {
    await page.goto("/km/login");
    await expect(page.getByRole("heading", { name: "ចូលប្រើប្រាស់" })).toBeVisible();
    await expect(page.getByLabel("ពាក្យសម្ងាត់", { exact: true })).toBeVisible();
  });
});

test.describe("finance components (gallery)", () => {
  test("journal grid: unbalanced is flagged, then balanced by keyboard", async ({ page }) => {
    await signInAs(page, "acct");
    await page.goto("/en/dev/components");
    const indicator = page.getByTestId("balance-indicator");
    await expect(indicator).toHaveText("Debits and credits differ by 1.00");
    const credit = page.getByLabel("Credit, line 2");
    await credit.click();
    await page.keyboard.type("250");
    await page.keyboard.press("Tab");
    await expect(indicator).toHaveText("Balanced");
    await expect(credit).toHaveValue("250.00");
  });

  test("critical actions: reason required, confirm checkbox, same key on retry", async ({ page }) => {
    await signInAs(page, "acct");
    await page.goto("/en/dev/components");

    // Reverse needs a reason.
    await page.getByTestId("demo-reverse").click();
    await page.getByTestId("i-confirm").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText("A reason is required")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("confirm-action-dialog")).toHaveCount(0);

    // Post above the threshold needs "I confirm"; the button is disabled while it runs.
    await page.getByTestId("demo-post").click();
    await expect(page.getByTestId("confirm-action")).toBeDisabled();
    await page.getByTestId("i-confirm").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("confirm-action")).toBeDisabled();
    await expect(page.getByText("Done: JV-2027-000312")).toBeVisible();

    // Release shows the amount in words, fails once on the network and succeeds on retry.
    await page.getByTestId("demo-release").click();
    await expect(page.getByTestId("amount-in-words")).toHaveText("One thousand two hundred fifty US dollars and fifty cents only");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText("Cannot reach the server.")).toBeVisible();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByText(/Done: PV-2027-000087/)).toBeVisible();
  });
});

test.describe("accessibility (axe, WCAG 2.2 AA)", () => {
  test("login page", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByTestId("demo-acct")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("dashboard", async ({ page }) => {
    await signInAs(page, "acct");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByText("FY 2027")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });

  test("finance components in Khmer", async ({ page }) => {
    await signInAs(page, "acct", "km");
    await page.goto("/km/dev/components");
    await expect(page.getByTestId("balance-indicator")).toBeVisible();
    await expectNoSeriousA11yIssues(page);
  });
});

test.describe("responsive @responsive", () => {
  test("wide grids scroll inside their own box, not the page", async ({ page }) => {
    await signInAs(page, "acct");
    await page.goto("/en/dev/components");
    await expect(page.getByTestId("balance-indicator")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });


  test("dashboard and navigation work at this width", async ({ page }) => {
    await signInAs(page, "acct");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    // No horizontal scrolling on the page itself.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const width = page.viewportSize()?.width ?? 1280;
    if (width < 768) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Accounting" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Journal Entries" }).click();
      await expect(page.getByTestId("coming-soon")).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    }
  });
});
