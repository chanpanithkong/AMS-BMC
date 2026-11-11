import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Demo@1234";
export const DEMO_OTP = "123456";
const MFA_USERS = ["owner", "finmgr", "sysadmin"];

/** Sign in through the mock-mode role picker; MFA users also pass the verification step. */
export async function signInAs(page: Page, username: string, locale = "en") {
  await page.goto(`/${locale}/login`);
  await page.getByTestId(`demo-${username}`).click();
  if (MFA_USERS.includes(username)) {
    await page.locator("#otp").fill(DEMO_OTP);
    await page.locator("#otp").press("Enter");
  }
  await expect(page.getByTestId("dashboard")).toBeVisible();
}

/**
 * Switch user without reloading: a reload would rebuild the in-memory mock database, so data made
 * by the previous user would be lost.
 */
export async function switchUser(page: Page, username: string) {
  await page.getByTestId("user-menu").filter({ visible: true }).click();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId(`demo-${username}`).filter({ visible: true }).click();
  if (MFA_USERS.includes(username)) {
    await page.locator("#otp").filter({ visible: true }).fill(DEMO_OTP);
    await page.locator("#otp").filter({ visible: true }).press("Enter");
  }
  // After signing out the login page carries ?next=, so the user returns to the page they left.
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("main")).toBeVisible();
}

/**
 * Navigate with the sidebar (client-side), keeping the in-memory mock database. `item` is needed
 * for groups with several entries.
 */
export async function navTo(page: Page, group: string, item?: string) {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  if (item) {
    const button = nav.getByRole("button", { name: group, exact: true });
    // Open the group only when it is closed; clicking an open group would close it.
    if ((await button.getAttribute("aria-expanded")) === "false") await button.click();
    await nav.getByRole("link", { name: item, exact: true }).click();
  } else {
    await nav.getByRole("link", { name: group, exact: true }).click();
  }
}

export async function expectNoSeriousA11yIssues(page: Page) {
  // Measure colours after transitions (e.g. a button fading from disabled to enabled) have finished.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

/** Choose an account in a journal-grid line by code. */
export async function pickAccount(page: Page, line: number, code: string) {
  await page.getByRole("combobox", { name: `Account, line ${line}` }).click();
  await page.getByPlaceholder("Search by code or name…").fill(code);
  await page.getByRole("option", { name: new RegExp(`^${code}\\b`) }).click();
}
