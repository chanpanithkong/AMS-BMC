import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS, isMutatingPermission } from "@/lib/rbac/default-roles";
import { MENU, canAccessPath, findMenuItem, homePath, visibleMenu, type AccessContext } from "@/lib/rbac/menu";
import { ROLES, hasPermission, isPermission, type RoleCode } from "@/lib/rbac/permissions";

const ctx = (role: RoleCode, inventory = false): AccessContext => ({
  roles: [role],
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  flags: { inventory },
});
const groups = (role: RoleCode) => visibleMenu(ctx(role)).map((g) => g.id);
const items = (role: RoleCode, group: string) => visibleMenu(ctx(role)).find((g) => g.id === group)?.items.map((i) => i.id) ?? [];

describe("menu structure (SRS 14.2)", () => {
  it("has the 15 groups in SRS order", () => {
    expect(MENU.map((g) => g.id)).toEqual([
      "dashboard", "accounting", "sales", "purchases", "cashBank", "expenses", "fixedAssets", "inventory", "budgets",
      "reports", "tax", "approvals", "auditTrail", "admin", "settings",
    ]);
  });

  it("defines visibility for every role in every group", () => {
    for (const group of MENU) {
      expect(Object.keys(group.visibility).sort()).toEqual([...ROLES].sort());
    }
  });
});

describe("menu visibility per role (SRS 14.2 matrix)", () => {
  // Inventory is behind a feature flag and is checked separately.
  const expected: Record<RoleCode, string[]> = {
    SYSADMIN: ["dashboard", "reports", "auditTrail", "admin", "settings"],
    OWNER: ["dashboard", "accounting", "sales", "purchases", "cashBank", "expenses", "fixedAssets", "budgets", "reports", "tax", "approvals", "auditTrail", "admin", "settings"],
    FINMGR: ["dashboard", "accounting", "sales", "purchases", "cashBank", "expenses", "fixedAssets", "budgets", "reports", "tax", "approvals", "auditTrail", "admin", "settings"],
    ACCT: ["dashboard", "accounting", "sales", "purchases", "cashBank", "expenses", "fixedAssets", "budgets", "reports", "tax", "approvals", "auditTrail", "settings"],
    APO: ["dashboard", "accounting", "purchases", "cashBank", "expenses", "reports", "approvals", "settings"],
    ARO: ["dashboard", "accounting", "sales", "cashBank", "reports", "approvals", "settings"],
    CASHIER: ["dashboard", "accounting", "sales", "purchases", "cashBank", "expenses", "reports"],
    AUDITOR: ["dashboard", "accounting", "sales", "purchases", "cashBank", "expenses", "fixedAssets", "budgets", "reports", "tax", "auditTrail", "admin", "settings"],
    DEPTMGR: ["dashboard", "accounting", "sales", "purchases", "expenses", "fixedAssets", "budgets", "reports", "approvals"],
    READONLY: ["dashboard", "accounting", "sales", "purchases", "cashBank", "expenses", "fixedAssets", "budgets", "reports"],
  };

  it.each(ROLES)("%s sees the expected groups", (role) => {
    expect(groups(role)).toEqual(expected[role]);
  });

  it("limits the items inside a group for roles marked limited", () => {
    expect(items("APO", "accounting")).toEqual(["accounts", "fxRates"]);
    expect(items("CASHIER", "sales")).toEqual(["receipts"]);
    expect(items("CASHIER", "purchases")).toEqual(["payments"]);
    expect(items("CASHIER", "cashBank")).toEqual(["cashBankAccounts", "cashBankTransactions"]);
    expect(items("DEPTMGR", "purchases")).toEqual(["supplierInvoices"]);
  });

  it("shows items outside the SRS matrix by permission only", () => {
    // Exchange rates: CASHIER may view rates although the Accounting group is hidden for the role.
    expect(items("CASHIER", "accounting")).toEqual(["fxRates"]);
    // Data import: APO and ARO import suppliers and customers although Settings is hidden for them.
    expect(items("APO", "settings")).toEqual(["imports"]);
    expect(items("ARO", "settings")).toEqual(["imports"]);
    expect(items("OWNER", "settings")).not.toContain("imports");
    expect(items("FINMGR", "accounting")).toContain("fxRevaluations");
    expect(items("ACCT", "accounting")).not.toContain("fxRevaluations");
  });

  it("shows Inventory only when the feature flag is on", () => {
    expect(groups("FINMGR")).not.toContain("inventory");
    expect(visibleMenu(ctx("FINMGR", true)).map((g) => g.id)).toContain("inventory");
    expect(visibleMenu(ctx("APO", true)).map((g) => g.id)).not.toContain("inventory");
  });
});

describe("route guard", () => {
  it("sends CASHIER to 403 for user management", () => {
    expect(canAccessPath(ctx("CASHIER"), "/admin/users")).toBe(false);
    expect(canAccessPath(ctx("CASHIER"), "/admin/users/usr-1")).toBe(false);
    expect(canAccessPath(ctx("SYSADMIN"), "/admin/users")).toBe(true);
  });

  it("guards detail pages with their list's rule", () => {
    expect(canAccessPath(ctx("ARO"), "/sales/invoices/inv-1")).toBe(true);
    expect(canAccessPath(ctx("APO"), "/sales/invoices/inv-1")).toBe(false);
    expect(findMenuItem("/fixed-assets/depreciation-runs")?.item.id).toBe("depreciationRuns");
  });

  it("keeps SYSADMIN away from accounting screens (no posting rights by default)", () => {
    for (const path of ["/accounting/journals", "/sales/invoices", "/purchases/payments", "/cash-bank/reconciliations"]) {
      expect(canAccessPath(ctx("SYSADMIN"), path)).toBe(false);
    }
  });

  it("always allows the dashboard, the 403 page and the profile", () => {
    for (const role of ROLES) {
      expect(canAccessPath(ctx(role), "/dashboard")).toBe(true);
      expect(canAccessPath(ctx(role), "/403")).toBe(true);
      expect(canAccessPath(ctx(role), "/profile")).toBe(true);
      expect(homePath(ctx(role))).toBe("/dashboard");
    }
  });
});

describe("default role permissions (SRS 4.2 and 4.3)", () => {
  it("uses only codes from the catalogue, without duplicates", () => {
    for (const role of ROLES) {
      const granted = DEFAULT_ROLE_PERMISSIONS[role];
      expect(granted.filter((p) => !isPermission(p))).toEqual([]);
      expect(new Set(granted).size).toBe(granted.length);
    }
  });

  it("gives AUDITOR and READONLY no permission that changes records", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.AUDITOR.filter(isMutatingPermission)).toEqual([]);
    expect(DEFAULT_ROLE_PERMISSIONS.READONLY.filter(isMutatingPermission)).toEqual([]);
  });

  it("gives SYSADMIN no posting, approval or payment rights", () => {
    const granted = DEFAULT_ROLE_PERMISSIONS.SYSADMIN;
    expect(granted.filter((p) => /\.(post|approve|release|reverse)$/.test(p))).toEqual([]);
  });

  it("separates preparing from approving and releasing", () => {
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.ACCT, "gl.journal.create")).toBe(true);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.ACCT, "gl.journal.approve")).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.APO, "ap.payment.create")).toBe(true);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.APO, "ap.payment.approve")).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.APO, "ap.payment.release")).toBe(false);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.FINMGR, "ap.payment.release")).toBe(true);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.OWNER, "cls.period.reopen.approve")).toBe(true);
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.FINMGR, "cls.period.reopen.approve")).toBe(false);
  });

  it("keeps CASHIER out of GL journals", () => {
    expect(hasPermission(DEFAULT_ROLE_PERMISSIONS.CASHIER, "gl.journal.*")).toBe(false);
  });

  it("matches wildcard permissions", () => {
    expect(hasPermission(["ar.invoice.create"], "ar.invoice.*")).toBe(true);
    expect(hasPermission(["ar.invoice.create"], "ap.invoice.*")).toBe(false);
  });
});
