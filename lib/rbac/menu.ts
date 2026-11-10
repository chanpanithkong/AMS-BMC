import { ROLES, hasPermission, type Permission, type RoleCode } from "./permissions";

// Main navigation as data (SRS §14.2). The 15 groups, their order and the role-visibility matrix
// (● full, ○ limited or own scope, — hidden) are transcribed from the SRS table.
// `phase` is the build phase in docs/BUILD_PROMPT.md §11 that delivers the screen.

export type Visibility = "full" | "limited" | "hidden";

export interface MenuItem {
  id: string;
  /** Path without the locale prefix. */
  path: string;
  labelKey: string;
  scr?: string;
  phase: number;
  /** A user holding this permission sees the item even when the group is hidden or limited for the role. */
  grant?: Permission;
}

export interface MenuGroup {
  id: string;
  labelKey: string;
  icon: string;
  visibility: Record<RoleCode, Visibility>;
  /** For roles with limited (○) visibility: the item ids they see. Omitted = all items, read-only or own scope. */
  limited?: Partial<Record<RoleCode, string[]>>;
  items: MenuItem[];
  /** Feature flag that must be on for the group to appear. */
  flag?: "inventory";
}

/** Parse one matrix row, in ROLES order: "●" full, "○" limited, "—" hidden. */
function row(marks: string): Record<RoleCode, Visibility> {
  const symbols = [...marks.replace(/\s/g, "")];
  if (symbols.length !== ROLES.length) throw new Error(`Menu row needs ${ROLES.length} marks: ${marks}`);
  const map = { "●": "full", "○": "limited", "—": "hidden" } as const;
  return Object.fromEntries(ROLES.map((role, i) => [role, map[symbols[i] as keyof typeof map]])) as Record<RoleCode, Visibility>;
}

const item = (id: string, path: string, phase: number, scr?: string, grant?: Permission): MenuItem => ({
  id, path, labelKey: `nav.items.${id}`, phase, scr, grant,
});

//                                   SYSADMIN OWNER FINMGR ACCT APO ARO CASHIER AUDITOR DEPTMGR READONLY
export const MENU: MenuGroup[] = [
  {
    id: "dashboard", labelKey: "nav.groups.dashboard", icon: "LayoutDashboard",
    visibility: row("○ ● ● ● ○ ○ ○ ● ○ ○"),
    items: [item("dashboard", "/dashboard", 5, "SCR-02")],
  },
  {
    id: "accounting", labelKey: "nav.groups.accounting", icon: "BookOpen",
    visibility: row("— ● ● ● ○ ○ — ● ○ ○"),
    limited: {
      APO: ["accounts"], ARO: ["accounts"], DEPTMGR: ["accounts", "journals"],
      READONLY: ["accounts", "journals", "generalLedger", "trialBalance"],
    },
    items: [
      item("accounts", "/accounting/accounts", 2, "SCR-03"),
      item("journals", "/accounting/journals", 2, "SCR-04"),
      item("generalLedger", "/accounting/general-ledger", 2, "SCR-07"),
      item("trialBalance", "/accounting/trial-balance", 2, "SCR-08"),
      item("periods", "/accounting/periods", 2, "SCR-17"),
      // Not in the SRS menu table; placed here (docs/DECISIONS.md D-P1-04).
      item("fxRates", "/fx/rates", 2, "SCR-24", "fx.rate.view"),
      item("fxRevaluations", "/fx/revaluations", 6, undefined, "fx.revalue"),
    ],
  },
  {
    id: "sales", labelKey: "nav.groups.sales", icon: "Receipt",
    visibility: row("— ● ● ● — ● ○ ● ○ ○"),
    limited: { CASHIER: ["receipts"], DEPTMGR: ["customers", "customerInvoices"] },
    items: [
      item("customers", "/sales/customers", 4, "SCR-20"),
      item("customerInvoices", "/sales/invoices", 4, "SCR-09"),
      item("receipts", "/sales/receipts", 4, "SCR-10"),
      item("creditNotes", "/sales/credit-notes", 4),
      item("arAging", "/sales/aging", 4),
    ],
  },
  {
    id: "purchases", labelKey: "nav.groups.purchases", icon: "ShoppingCart",
    visibility: row("— ● ● ● ● — ○ ● ○ ○"),
    limited: { CASHIER: ["payments"], DEPTMGR: ["supplierInvoices"] },
    items: [
      item("suppliers", "/purchases/suppliers", 4, "SCR-20"),
      item("supplierInvoices", "/purchases/invoices", 4, "SCR-11"),
      item("payments", "/purchases/payments", 4, "SCR-12"),
      item("apAging", "/purchases/aging", 4),
    ],
  },
  {
    id: "cashBank", labelKey: "nav.groups.cashBank", icon: "Landmark",
    visibility: row("— ● ● ● ○ ○ ○ ● — ○"),
    limited: { APO: ["cashBankAccounts"], ARO: ["cashBankAccounts"], CASHIER: ["cashBankAccounts", "cashBankTransactions"] },
    items: [
      item("cashBankAccounts", "/cash-bank/accounts", 3, "SCR-27"),
      item("cashBankTransactions", "/cash-bank/transactions", 3, "SCR-27"),
      item("reconciliations", "/cash-bank/reconciliations", 3, "SCR-13"),
    ],
  },
  {
    id: "expenses", labelKey: "nav.groups.expenses", icon: "Wallet",
    visibility: row("— ● ● ● ● — ○ ● ○ ○"),
    items: [item("expenses", "/expenses", 3, "SCR-21")],
  },
  {
    id: "fixedAssets", labelKey: "nav.groups.fixedAssets", icon: "Building2",
    visibility: row("— ● ● ● — — — ● ○ ○"),
    limited: { DEPTMGR: ["assetRegister"], READONLY: ["assetRegister"] },
    items: [
      item("assetRegister", "/fixed-assets", 6, "SCR-14"),
      item("depreciationRuns", "/fixed-assets/depreciation-runs", 6, "SCR-14"),
    ],
  },
  {
    id: "inventory", labelKey: "nav.groups.inventory", icon: "Boxes", flag: "inventory",
    visibility: row("— ● ● ● — — — ● — —"),
    items: [item("inventory", "/inventory", 6)],
  },
  {
    id: "budgets", labelKey: "nav.groups.budgets", icon: "Target",
    visibility: row("— ● ● ● — — — ● ○ ○"),
    items: [item("budgets", "/budgets", 6, "SCR-23")],
  },
  {
    id: "reports", labelKey: "nav.groups.reports", icon: "BarChart3",
    visibility: row("○ ● ● ● ○ ○ ○ ● ○ ○"),
    items: [item("reports", "/reports", 5, "SCR-15")],
  },
  {
    id: "tax", labelKey: "nav.groups.tax", icon: "Percent",
    visibility: row("— ● ● ● — — — ● — —"),
    items: [item("taxCodes", "/tax/codes", 4, "SCR-22")],
  },
  {
    id: "approvals", labelKey: "nav.groups.approvals", icon: "CheckSquare",
    visibility: row("— ● ● ● ○ ○ — — ● —"),
    items: [item("approvals", "/approvals", 7, "SCR-26")],
  },
  {
    id: "auditTrail", labelKey: "nav.groups.auditTrail", icon: "ScrollText",
    visibility: row("● ● ● ○ — — — ● — —"),
    items: [item("auditTrail", "/audit-trail", 7, "SCR-18")],
  },
  {
    id: "admin", labelKey: "nav.groups.admin", icon: "Users",
    visibility: row("● ○ ○ — — — — ○ — —"),
    items: [
      item("users", "/admin/users", 7, "SCR-16"),
      item("roles", "/admin/roles", 7, "SCR-16"),
    ],
  },
  {
    id: "settings", labelKey: "nav.groups.settings", icon: "Settings",
    visibility: row("● ● ● ○ — — — ○ — —"),
    items: [
      item("settingsCompany", "/settings/company", 7, "SCR-19"),
      item("settingsBranches", "/settings/branches", 7, "SCR-19"),
      item("settingsDepartments", "/settings/departments", 7, "SCR-19"),
      item("settingsFiscalYears", "/settings/fiscal-years", 7, "SCR-19"),
      item("settingsCurrencies", "/settings/currencies", 7, "SCR-19"),
      item("settingsNumbering", "/settings/numbering", 7, "SCR-19"),
      item("settingsApprovalRules", "/settings/approval-rules", 7, "SCR-19"),
      item("settingsNotifications", "/settings/notifications", 7, "SCR-19"),
      item("settingsStatementMapping", "/settings/statement-mapping", 7, "SCR-19"),
      item("settingsTemplates", "/settings/templates", 7, "SCR-19"),
      item("settingsDimensions", "/settings/dimensions", 7, "SCR-19"),
      item("settingsBackupStatus", "/settings/backup-status", 7, "SCR-19"),
      // Not in the SRS menu table; placed here (docs/DECISIONS.md D-P1-04).
      item("imports", "/imports", 6, "SCR-25", "imp.view"),
    ],
  },
];

export interface AccessContext {
  roles: readonly string[];
  permissions: readonly string[];
  flags?: { inventory?: boolean };
}

export interface VisibleGroup extends Omit<MenuGroup, "items"> {
  items: MenuItem[];
  /** Best visibility across the user's roles. */
  level: Visibility;
}

const RANK: Record<Visibility, number> = { hidden: 0, limited: 1, full: 2 };

function groupLevel(group: MenuGroup, roles: readonly string[]): Visibility {
  let best: Visibility = "hidden";
  for (const role of roles) {
    const v = group.visibility[role as RoleCode];
    if (v && RANK[v] > RANK[best]) best = v;
  }
  return best;
}

function itemVisible(group: MenuGroup, entry: MenuItem, ctx: AccessContext): boolean {
  if (group.flag === "inventory" && !ctx.flags?.inventory) return false;
  if (entry.grant && hasPermission(ctx.permissions, entry.grant)) return true;
  // Items that carry a grant are permission-driven only: they are not in the SRS matrix.
  if (entry.grant) return false;
  return ctx.roles.some((role) => {
    const v = group.visibility[role as RoleCode];
    if (v === "full") return true;
    if (v !== "limited") return false;
    const allowed = group.limited?.[role as RoleCode];
    return !allowed || allowed.includes(entry.id);
  });
}

/** Menu groups and items the user may see, in SRS order. */
export function visibleMenu(ctx: AccessContext): VisibleGroup[] {
  const result: VisibleGroup[] = [];
  for (const group of MENU) {
    const items = group.items.filter((entry) => itemVisible(group, entry, ctx));
    if (items.length) result.push({ ...group, items, level: groupLevel(group, ctx.roles) });
  }
  return result;
}

/** Find the menu item that owns a path (longest matching prefix). */
export function findMenuItem(path: string): { group: MenuGroup; item: MenuItem } | null {
  let best: { group: MenuGroup; item: MenuItem } | null = null;
  for (const group of MENU) {
    for (const entry of group.items) {
      if (path === entry.path || path.startsWith(entry.path + "/")) {
        if (!best || entry.path.length > best.item.path.length) best = { group, item: entry };
      }
    }
  }
  return best;
}

/** Paths every signed-in user may open. */
const OPEN_PATHS = ["/403", "/profile", "/dev"];

/** Route guard: may the user open this path (without locale prefix)? */
export function canAccessPath(ctx: AccessContext, path: string): boolean {
  if (path === "" || path === "/") return true;
  if (OPEN_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return true;
  const match = findMenuItem(path);
  if (!match) return true; // unknown paths fall through to the not-found page
  return itemVisible(match.group, match.item, ctx);
}

/** First page a user lands on after sign-in. */
export function homePath(ctx: AccessContext): string {
  return visibleMenu(ctx)[0]?.items[0]?.path ?? "/403";
}
