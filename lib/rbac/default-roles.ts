import { REPORT_PERMISSIONS, type Permission, type RoleCode } from "./permissions";

// Proposed default role → permission grants, transcribed from the SRS §4.3 matrix.
// Final permissions and limits need approval (SRS D-09). In live mode the backend returns each
// user's effective permissions; this table seeds the mock backend and the role editor (SCR-16).

const ALL_REPORTS: Permission[] = [...REPORT_PERMISSIONS, "rpt.export"];

const VIEW_ALL: Permission[] = [
  "dash.view", "users.view", "org.view", "coa.view", "gl.journal.view", "ar.customer.view", "ar.invoice.view",
  "ar.receipt.view", "ar.credit_note.view", "ap.supplier.view", "ap.invoice.view", "ap.payment.view",
  "cb.bank.view", "cb.cash.view", "exp.view", "fa.view", "tax.view", "bud.view", "fx.rate.view",
  "cls.period.view", "cfg.view",
];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  // No posting, approval or payment rights by default (SRS §4.2).
  SYSADMIN: [
    "dash.view", "users.view", "users.manage", "roles.manage", "org.view", "org.manage", "tax.view",
    "imp.view", "aud.view", "aud.export", "cfg.view", "cfg.manage",
  ],
  OWNER: [
    ...VIEW_ALL, "roles.approve", "org.approve", "coa.approve", "coa.sensitive.view", "gl.journal.approve",
    "ar.credit_note.approve", "ar.writeoff.approve", "ap.payment.approve", "ap.supplier.bank.view",
    "cb.bank.unmask", "exp.approve", "fa.approve", "tax.approve", "bud.approve", "cls.period.reopen.approve",
    ...ALL_REPORTS, "aud.view", "aud.export", "cfg.approve", "wfl.approval.view", "inv.view",
  ],
  FINMGR: [
    ...VIEW_ALL, "org.manage", "org.periods.manage", "coa.create", "coa.edit", "coa.approve",
    "coa.sensitive.view", "gl.journal.create", "gl.journal.edit", "gl.journal.submit", "gl.journal.approve",
    "gl.journal.post", "gl.journal.reverse", "gl.journal.export", "gl.journal.adjust", "ar.invoice.approve",
    "ar.invoice.post",
    "ar.receipt.post", "ar.credit_note.approve", "ar.credit_note.post", "ar.writeoff.approve",
    "ap.supplier.approve", "ap.supplier.bank.view", "ap.invoice.approve", "ap.invoice.post",
    "ap.payment.approve", "ap.payment.release", "ap.payment.reverse", "cb.bank.unmask", "cb.cash.post",
    "cb.reconcile", "cb.reconcile.complete", "cb.reconcile.reopen", "exp.approve", "exp.post", "fa.approve",
    "fa.post", "tax.create", "tax.manage", "bud.create", "bud.edit", "bud.approve", "fx.rate.manage",
    "fx.revalue", "cls.period.manage", "cls.period.reopen.request", "cls.year.close", ...ALL_REPORTS,
    "imp.view", "imp.approve", "aud.view", "cfg.manage", "wfl.approval.view", "inv.view",
  ],
  ACCT: [
    "dash.view", "org.view", "coa.view", "coa.create", "coa.edit", "gl.journal.view", "gl.journal.create",
    "gl.journal.edit", "gl.journal.delete", "gl.journal.submit", "gl.journal.approve", "gl.journal.post",
    "gl.journal.export", "ar.customer.view", "ar.customer.manage", "ar.invoice.view", "ar.invoice.create", "ar.invoice.edit",
    "ar.invoice.approve", "ar.invoice.post", "ar.receipt.view", "ar.receipt.create", "ar.receipt.post",
    "ar.receipt.allocate", "ar.credit_note.view", "ar.credit_note.create", "ar.credit_note.submit",
    "ap.supplier.view", "ap.supplier.manage", "ap.invoice.view", "ap.invoice.create", "ap.invoice.edit",
    "ap.invoice.approve", "ap.invoice.post", "ap.payment.view", "ap.payment.create", "ap.payment.submit",
    "cb.bank.view", "cb.cash.view", "cb.cash.create", "cb.cash.post", "cb.statement.import", "cb.reconcile",
    "exp.view", "exp.create", "exp.edit", "exp.submit", "exp.post", "fa.view", "fa.create", "fa.edit",
    "fa.post", "tax.view", "tax.create", "bud.view", "bud.create", "bud.edit", "fx.rate.view",
    "cls.period.view", ...ALL_REPORTS, "imp.view", "imp.create", "aud.view", "cfg.view", "wfl.approval.view",
    "inv.view",
  ],
  APO: [
    "dash.view", "coa.view", "ar.customer.view", "ar.invoice.view", "ap.supplier.view", "ap.supplier.manage",
    "ap.invoice.view", "ap.invoice.create", "ap.invoice.edit", "ap.invoice.delete", "ap.invoice.submit",
    "ap.payment.view", "ap.payment.create", "ap.payment.submit", "cb.bank.view", "cb.cash.view", "exp.view",
    "exp.create", "exp.submit", "fx.rate.view", "rpt.ap_aging", "rpt.supplier_balances", "rpt.ap",
    "rpt.export", "imp.view", "imp.create", "wfl.approval.view",
  ],
  ARO: [
    "dash.view", "coa.view", "ar.customer.view", "ar.customer.manage", "ar.invoice.view", "ar.invoice.create",
    "ar.invoice.edit", "ar.invoice.delete", "ar.invoice.submit", "ar.invoice.post", "ar.receipt.view",
    "ar.receipt.create", "ar.receipt.post", "ar.receipt.allocate", "ar.credit_note.view",
    "ar.credit_note.create", "ar.credit_note.submit", "ar.writeoff.create", "cb.bank.view", "cb.cash.view",
    "fx.rate.view", "rpt.ar_aging", "rpt.customer_balances", "rpt.ar", "rpt.export", "imp.view", "imp.create",
    "wfl.approval.view",
  ],
  // Own cash accounts; limits; no GL journals (SRS §4.2).
  CASHIER: [
    "dash.view", "coa.view", "ar.receipt.view", "ar.receipt.create", "ap.payment.view", "ap.payment.create",
    "cb.cash.view", "cb.cash.create", "exp.view", "exp.create", "fx.rate.view", "rpt.cashbook",
  ],
  // Read-only; no create, edit, approve or post (SRS §4.2).
  AUDITOR: [
    ...VIEW_ALL, "coa.sensitive.view", "gl.journal.export", ...ALL_REPORTS, "aud.view", "aud.export", "inv.view",
  ],
  // Own department only (SRS §4.2).
  DEPTMGR: [
    "dash.view", "coa.view", "gl.journal.view", "ar.customer.view", "ar.invoice.view", "ap.supplier.view",
    "ap.invoice.view", "ap.invoice.approve", "exp.view", "exp.create", "exp.submit", "exp.approve", "fa.view",
    "bud.view", "bud.create", "bud.submit", "rpt.expenses", "rpt.budget", "wfl.approval.view",
  ],
  READONLY: [
    "dash.view", "coa.view", "gl.journal.view", "ar.customer.view", "ar.invoice.view", "ar.receipt.view",
    "ap.supplier.view", "ap.invoice.view", "cb.bank.view", "cb.cash.view", "exp.view", "fa.view", "bud.view",
    "fx.rate.view", "rpt.trial_balance", "rpt.general_ledger", "rpt.balance_sheet", "rpt.income_statement",
  ],
};

/** Actions that change records. Used to check that read-only roles hold none of them. */
export const MUTATING_ACTIONS = [
  "create", "edit", "delete", "submit", "approve", "post", "reverse", "release", "manage", "complete",
  "reopen", "allocate", "import", "revalue", "close", "request", "adjust", "override",
];

export function isMutatingPermission(code: string): boolean {
  const action = code.split(".").pop() ?? "";
  return MUTATING_ACTIONS.includes(action) || code === "cb.reconcile";
}
