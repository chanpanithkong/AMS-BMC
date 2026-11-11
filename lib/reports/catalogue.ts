import type { Permission } from "@/lib/rbac/permissions";

// The SCR-15 report catalogue (SRS §15.2, RPT-01..31). Shared by the viewer and the mock backend.
// `path` sends reports that already have their own screen there; `phase` marks reports whose data
// arrives later (fixed assets and budgets in Phase 6, audit trail in Phase 7).

export type ReportCategory = "statements" | "ledger" | "receivables" | "payables" | "cash" | "analysis" | "tax" | "assets" | "controls";

/** Parameters the parameter panel offers for a report. */
export type ReportParam = "range" | "as_of" | "branch" | "department" | "compare" | "unposted" | "group" | "journal_status";

export interface CatalogueEntry {
  id: string;
  slug: string;
  category: ReportCategory;
  permission: Permission;
  params: ReportParam[];
  /** Opens this screen instead of the generic viewer. */
  path?: string;
  /** Not available until this build phase. */
  phase?: number;
}

const r = (id: string, slug: string, category: ReportCategory, permission: Permission, params: ReportParam[], extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id, slug, category, permission, params, ...extra,
});

export const REPORT_CATALOGUE: CatalogueEntry[] = [
  r("RPT-03", "balance-sheet", "statements", "rpt.balance_sheet", ["as_of", "branch", "compare", "unposted"]),
  r("RPT-04", "income-statement", "statements", "rpt.income_statement", ["range", "branch", "department", "compare", "unposted"]),
  r("RPT-05", "cash-flow", "statements", "rpt.cash_flow", ["range"]),
  r("RPT-06", "changes-in-equity", "statements", "rpt.equity", ["range"]),
  r("RPT-29", "ratios", "statements", "rpt.kpi", ["range"]),
  r("RPT-01", "trial-balance", "ledger", "rpt.trial_balance", [], { path: "/accounting/trial-balance" }),
  r("RPT-02", "general-ledger", "ledger", "rpt.general_ledger", [], { path: "/accounting/general-ledger" }),
  r("RPT-22", "journal-entries", "ledger", "rpt.journals", ["range", "journal_status"]),
  r("RPT-07", "ar-aging", "receivables", "rpt.ar_aging", [], { path: "/sales/aging" }),
  r("RPT-09", "customer-balances", "receivables", "rpt.customer_balances", ["as_of"]),
  r("RPT-24", "outstanding-invoices", "receivables", "rpt.ar", ["as_of"]),
  r("RPT-08", "ap-aging", "payables", "rpt.ap_aging", [], { path: "/purchases/aging" }),
  r("RPT-10", "supplier-balances", "payables", "rpt.supplier_balances", ["as_of"]),
  r("RPT-25", "outstanding-payables", "payables", "rpt.ap", ["as_of"]),
  r("RPT-11", "cashbook", "cash", "rpt.cashbook", ["range"]),
  r("RPT-12", "bankbook", "cash", "rpt.bankbook", ["range"]),
  r("RPT-13", "bank-reconciliation", "cash", "rpt.bank_reconciliation", []),
  r("RPT-14", "revenue-by-period", "analysis", "rpt.revenue", ["range", "branch", "group"]),
  r("RPT-15", "expenses-by-category", "analysis", "rpt.expenses", ["range", "branch", "department"]),
  r("RPT-16", "expenses-by-department", "analysis", "rpt.expenses", ["range", "branch"]),
  r("RPT-17", "expenses-by-branch", "analysis", "rpt.expenses", ["range", "department"]),
  r("RPT-26", "realised-fx", "analysis", "rpt.fx", ["range"]),
  r("RPT-27", "unrealised-fx", "analysis", "rpt.fx", ["range"]),
  r("RPT-18", "tax-summary", "tax", "rpt.tax", ["range"]),
  r("RPT-19", "fixed-asset-register", "assets", "rpt.fixed_assets", ["as_of", "branch"]),
  r("RPT-20", "depreciation-schedule", "assets", "rpt.fixed_assets", ["range"]),
  r("RPT-21", "budget-vs-actual", "assets", "rpt.budget", ["range", "branch", "department"]),
  r("RPT-31", "subledger-reconciliation", "controls", "rpt.controls", ["as_of"]),
  r("RPT-28", "reopened-period-postings", "controls", "rpt.controls", ["range"]),
  r("RPT-30", "self-approval-exceptions", "controls", "rpt.controls", ["range"]),
  r("RPT-23", "audit-trail", "controls", "aud.view", [], { phase: 7 }),
];

export const CATEGORY_ORDER: ReportCategory[] = ["statements", "ledger", "receivables", "payables", "cash", "analysis", "tax", "assets", "controls"];

export const findReport = (slug: string) => REPORT_CATALOGUE.find((e) => e.slug === slug);
