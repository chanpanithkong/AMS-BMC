// Permission catalogue. Codes follow the SRS model <module>.<resource>.<action> (SRS §6.2).
// Codes that the SRS names are used as written; the others are derived from the §4.3 matrix
// and are marked ASSUMPTION in docs/API_CONTRACT.md until the backend publishes its catalogue.

export const ROLES = [
  "SYSADMIN", "OWNER", "FINMGR", "ACCT", "APO", "ARO", "CASHIER", "AUDITOR", "DEPTMGR", "READONLY",
] as const;
export type RoleCode = (typeof ROLES)[number];

const REPORTS = [
  "rpt.trial_balance", "rpt.general_ledger", "rpt.balance_sheet", "rpt.income_statement", "rpt.cash_flow",
  "rpt.equity", "rpt.ar_aging", "rpt.ap_aging", "rpt.customer_balances", "rpt.supplier_balances",
  "rpt.cashbook", "rpt.bankbook", "rpt.bank_reconciliation", "rpt.revenue", "rpt.expenses", "rpt.tax",
  "rpt.fixed_assets", "rpt.budget", "rpt.journals", "rpt.ar", "rpt.ap", "rpt.fx", "rpt.controls", "rpt.kpi",
] as const;

export const PERMISSIONS = [
  "dash.view",
  "users.view", "users.manage", "roles.manage", "roles.approve",
  "org.view", "org.manage", "org.periods.manage", "org.approve",
  "coa.view", "coa.create", "coa.edit", "coa.approve", "coa.sensitive.view",
  "gl.journal.view", "gl.journal.create", "gl.journal.edit", "gl.journal.delete", "gl.journal.submit",
  "gl.journal.approve", "gl.journal.post", "gl.journal.reverse", "gl.journal.export", "gl.journal.adjust",
  "coa.control.override",
  "ar.customer.view", "ar.customer.manage",
  "ar.invoice.view", "ar.invoice.create", "ar.invoice.edit", "ar.invoice.delete", "ar.invoice.submit",
  "ar.invoice.approve", "ar.invoice.post",
  "ar.receipt.view", "ar.receipt.create", "ar.receipt.post", "ar.receipt.allocate",
  "ar.credit_note.view", "ar.credit_note.create", "ar.credit_note.submit", "ar.credit_note.approve",
  "ar.credit_note.post", "ar.writeoff.create", "ar.writeoff.approve",
  "ap.supplier.view", "ap.supplier.manage", "ap.supplier.approve", "ap.supplier.bank.view",
  "ap.invoice.view", "ap.invoice.create", "ap.invoice.edit", "ap.invoice.delete", "ap.invoice.submit",
  "ap.invoice.approve", "ap.invoice.post",
  "ap.payment.view", "ap.payment.create", "ap.payment.submit", "ap.payment.approve", "ap.payment.release",
  "ap.payment.reverse",
  "cb.bank.view", "cb.bank.unmask", "cb.cash.view", "cb.cash.create", "cb.cash.post", "cb.statement.import",
  "cb.reconcile", "cb.reconcile.complete", "cb.reconcile.reopen",
  "exp.view", "exp.create", "exp.edit", "exp.submit", "exp.approve", "exp.post",
  "fa.view", "fa.create", "fa.edit", "fa.approve", "fa.post",
  "tax.view", "tax.create", "tax.manage", "tax.approve",
  "bud.view", "bud.create", "bud.edit", "bud.submit", "bud.approve",
  "fx.rate.view", "fx.rate.manage", "fx.revalue",
  "cls.period.view", "cls.period.manage", "cls.period.reopen.request", "cls.period.reopen.approve",
  "cls.year.close",
  ...REPORTS, "rpt.export",
  "imp.view", "imp.create", "imp.approve",
  "aud.view", "aud.export",
  "wfl.approval.view",
  "cfg.view", "cfg.manage", "cfg.approve",
  "inv.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const REPORT_PERMISSIONS: readonly Permission[] = REPORTS;

export function isPermission(code: string): code is Permission {
  return (PERMISSIONS as readonly string[]).includes(code);
}

/** True when the user holds the permission. A trailing ".*" matches any action, e.g. "ar.invoice.*". */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (required.endsWith(".*")) {
    const prefix = required.slice(0, -1);
    return granted.some((p) => p.startsWith(prefix));
  }
  return granted.includes(required);
}

export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((r) => hasPermission(granted, r));
}
