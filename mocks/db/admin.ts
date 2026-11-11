import type { AuditEvent, Role, SettingsGroup, SettingsGroupId, SodConflict, UserSession } from "@/lib/api/types/admin";
import type { HistoryEvent } from "@/lib/api/types/common";
import type { JournalEntry } from "@/lib/api/types/journals";
import { sha256 } from "@/lib/crypto/sha256";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { ROLES, type RoleCode } from "@/lib/rbac/permissions";

// Phase 7 state: roles, sessions, the append-only audit log with its hash chain, and settings groups.

export interface AdminState {
  roles: Role[];
  sessions: UserSession[];
  auditLogs: AuditEvent[];
  settings: Record<SettingsGroupId, SettingsGroup>;
}

const ROLE_NAMES: Record<RoleCode, [string, string, string]> = {
  SYSADMIN: ["System Administrator", "អ្នកគ្រប់គ្រងប្រព័ន្ធ", "Users, roles and technical settings; no financial posting or approval."],
  OWNER: ["Business Owner", "ម្ចាស់អាជីវកម្ម", "Sees everything; approves sensitive changes, payments and period reopening."],
  FINMGR: ["Finance Manager", "ប្រធានហិរញ្ញវត្ថុ", "Approves and posts; closes periods; manages accounting settings."],
  ACCT: ["Accountant", "គណនេយ្យករ", "Prepares journals, invoices, receipts and reconciliations."],
  APO: ["Accounts Payable Officer", "មន្ត្រីគណនីត្រូវសង", "Suppliers, supplier invoices and payment proposals."],
  ARO: ["Accounts Receivable Officer", "មន្ត្រីគណនីត្រូវទទួល", "Customers, invoices, receipts and credit notes."],
  CASHIER: ["Cashier", "បេឡាករ", "Own cash accounts: receipts and payments within limits."],
  AUDITOR: ["Auditor", "សវនករ", "Read-only access to records, reports and the audit trail."],
  DEPTMGR: ["Department Manager", "ប្រធាននាយកដ្ឋាន", "Own department: expenses, budgets and approvals within limits."],
  READONLY: ["Read-only user", "អ្នកប្រើមើលតែប៉ុណ្ណោះ", "Views permitted lists and basic reports."],
};

/** SRS §4.4 combinations that must not sit with one person unless reduced SoD is approved. */
export const SOD_RULES: SodConflict[] = [
  { code: "SUPPLIER_PAYMENT", description: "create supplier and release payment", description_km: "បង្កើតអ្នកផ្គត់ផ្គង់ និងបញ្ចេញការទូទាត់", permissions: ["ap.supplier.manage", "ap.payment.release"] },
  { code: "PAYMENT_PREPARE_RELEASE", description: "prepare and release supplier payments", description_km: "រៀបចំ និងបញ្ចេញការទូទាត់អ្នកផ្គត់ផ្គង់", permissions: ["ap.payment.create", "ap.payment.release"] },
  { code: "BANK_DETAILS", description: "change and approve supplier bank details", description_km: "ផ្លាស់ប្តូរ និងអនុម័តព័ត៌មានធនាគារអ្នកផ្គត់ផ្គង់", permissions: ["ap.supplier.manage", "ap.supplier.approve"] },
  { code: "USER_ADMIN_POSTING", description: "manage users and post journals", description_km: "គ្រប់គ្រងអ្នកប្រើ និងកត់ត្រាទិនានុប្បវត្តិ", permissions: ["users.manage", "gl.journal.post"] },
  { code: "ROLES_APPROVE_SELF", description: "edit roles and approve role changes", description_km: "កែតួនាទី និងអនុម័តការផ្លាស់ប្តូរតួនាទី", permissions: ["roles.manage", "roles.approve"] },
  { code: "RECONCILE_COMPLETE", description: "record cash and complete bank reconciliations", description_km: "កត់ត្រាសាច់ប្រាក់ និងបញ្ចប់ការផ្ទៀងផ្ទាត់ធនាគារ", permissions: ["cb.cash.create", "cb.reconcile.complete"] },
];

export function sodConflicts(permissions: string[]): SodConflict[] {
  const set = new Set(permissions);
  return SOD_RULES.filter((r) => set.has(r.permissions[0]) && set.has(r.permissions[1]));
}

/** Permission changes that need Owner approval (FR-RBAC-010): approve, post, reverse, release, settings. */
export const isSensitivePermission = (code: string) =>
  /\.(approve|post|reverse|release|unmask|complete|reopen|close|revalue)$/.test(code) || /^(cfg|roles|users)\.manage$/.test(code) || code === "gl.journal.adjust";

export function auditHash(event: Omit<AuditEvent, "hash">): string {
  const { previous_hash, ...rest } = event;
  return sha256(`${previous_hash}|${JSON.stringify(rest)}`);
}

/** Append an event to the chain. */
export function appendAudit(log: AuditEvent[], event: Omit<AuditEvent, "id" | "sequence" | "hash" | "previous_hash">): AuditEvent {
  const previous = log[log.length - 1];
  const draft = { ...event, id: `aud-${log.length + 1}`, sequence: log.length + 1, previous_hash: previous?.hash ?? "0".repeat(64) };
  const full: AuditEvent = { ...draft, hash: auditHash(draft) };
  log.push(full);
  return full;
}

const hist = (who: string, action: string, at = "2026-12-01T02:00:00.000Z"): HistoryEvent[] => [{ id: `h-${action}-${who}`, at, user_name: who, action }];

function settings(): Record<SettingsGroupId, SettingsGroup> {
  const g = <T,>(group: SettingsGroupId, value: T, critical: string[] = [], read_only = false): SettingsGroup<T> => ({
    group, value, version: 1, critical_fields: critical, read_only, pending: null,
    history: [{ id: `${group}-h1`, at: "2026-12-01T02:00:00.000Z", user_name: "Sok Dara", action: "CREATED", changes: [] }],
  });
  return {
    company: g("company", {
      name: "Demo Trading Co., Ltd.", name_km: "ក្រុមហ៊ុន ដេម៉ូ ត្រេឌីង ឯ.ក", tax_id: "L001-100000001", address: "No. 12, Street 214, Phnom Penh", base_currency: "USD", basis: "ACCRUAL",
      retained_earnings_account_id: "acc-3200", rounding_account_id: "acc-8900", fx_gain_account_id: "acc-7300", fx_loss_account_id: "acc-8310",
      block_unverified_tax: true, reduced_sod: false,
    }, ["retained_earnings_account_id", "rounding_account_id", "fx_gain_account_id", "fx_loss_account_id", "block_unverified_tax", "reduced_sod"]) as SettingsGroup,
    branches: g("branches", []) as SettingsGroup,
    departments: g("departments", []) as SettingsGroup,
    "fiscal-years": g("fiscal-years", {}, [], true) as SettingsGroup,
    currencies: g("currencies", [], ["decimals"]) as SettingsGroup,
    numbering: g("numbering", [
      { document_type: "JOURNAL", prefix: "JV", pattern: "JV-{YYYY}-{NNNNNN}", sequence_key: "journal" },
      { document_type: "CUSTOMER_INVOICE", prefix: "INV", pattern: "INV-{YYYY}-{NNNNNN}", sequence_key: "INV" },
      { document_type: "SUPPLIER_INVOICE", prefix: "BILL", pattern: "BILL-{YYYY}-{NNNNNN}", sequence_key: "BILL" },
      { document_type: "RECEIPT", prefix: "RV", pattern: "RV-{YYYY}-{NNNNNN}", sequence_key: "RV" },
      { document_type: "SUPPLIER_PAYMENT", prefix: "SPV", pattern: "SPV-{YYYY}-{NNNNNN}", sequence_key: "SPV" },
      { document_type: "CREDIT_NOTE", prefix: "CN", pattern: "CN-{YYYY}-{NNNNNN}", sequence_key: "CN" },
      { document_type: "PAYMENT_VOUCHER", prefix: "PV", pattern: "PV-{YYYY}-{NNNNNN}", sequence_key: "PV" },
      { document_type: "EXPENSE", prefix: "EXP", pattern: "EXP-{YYYY}-{NNNNNN}", sequence_key: "EXP" },
    ], ["pattern", "next_number"]) as SettingsGroup,
    "approval-rules": g("approval-rules", [
      { document_type: "JOURNAL", above: "0", steps: ["FINMGR"] }, { document_type: "JOURNAL", above: "10000", steps: ["FINMGR", "OWNER"] },
      { document_type: "EXPENSE", above: "0", steps: ["DEPTMGR"] }, { document_type: "EXPENSE", above: "2000", steps: ["DEPTMGR", "FINMGR"] },
      { document_type: "SUPPLIER_INVOICE", above: "0", steps: ["ACCT"] }, { document_type: "SUPPLIER_INVOICE", above: "5000", steps: ["ACCT", "FINMGR"] },
      { document_type: "SUPPLIER_PAYMENT", above: "0", steps: ["FINMGR"] }, { document_type: "CREDIT_NOTE", above: "0", steps: ["FINMGR"] },
    ], ["rules"]) as SettingsGroup,
    notifications: g("notifications", {
      escalation_hours: 48, upcoming_payables_days: 14, budget_thresholds: [80, 100],
      events: [
        { event: "APPROVAL_PENDING", in_app: true, email: false }, { event: "APPROVAL_DECIDED", in_app: true, email: false },
        { event: "INVOICE_OVERDUE", in_app: true, email: false }, { event: "PAYABLE_DUE", in_app: true, email: false },
        { event: "BUDGET_THRESHOLD", in_app: true, email: true }, { event: "RECONCILIATION_DUE", in_app: true, email: false },
        { event: "PERIOD_CLOSE", in_app: true, email: true }, { event: "TASK_FAILED", in_app: true, email: true },
      ],
    }) as SettingsGroup,
    "statement-mapping": g("statement-mapping", {
      version: 1, approved_by: "Chan Sopheap", lines: [
        { section: "Current assets", section_km: "ទ្រព្យសកម្មរយៈពេលខ្លី", from: "1000", to: "1499" }, { section: "Non-current assets", section_km: "ទ្រព្យសកម្មរយៈពេលវែង", from: "1500", to: "1999" },
        { section: "Current liabilities", section_km: "បំណុលរយៈពេលខ្លី", from: "2000", to: "2499" }, { section: "Non-current liabilities", section_km: "បំណុលរយៈពេលវែង", from: "2500", to: "2999" },
        { section: "Equity", section_km: "មូលធន", from: "3000", to: "3999" }, { section: "Revenue", section_km: "ចំណូល", from: "4000", to: "4999" },
        { section: "Cost of sales", section_km: "ថ្លៃដើមលក់", from: "5000", to: "5999" }, { section: "Operating expenses", section_km: "ចំណាយប្រតិបត្តិការ", from: "6000", to: "6999" },
        { section: "Other income", section_km: "ចំណូលផ្សេងៗ", from: "7000", to: "7999" }, { section: "Other expenses", section_km: "ចំណាយផ្សេងៗ", from: "8000", to: "8999" },
      ],
    }, ["lines"]) as SettingsGroup,
    templates: g("templates", {
      invoice_header: "Demo Trading Co., Ltd. — VAT TIN L001-100000001", invoice_footer: "Thank you for your business. Bank: ABA 000 123 4417.",
      receipt_footer: "This receipt is valid only with an authorised signature.", show_khmer: true, logo_text: "DEMO",
    }) as SettingsGroup,
    dimensions: g("dimensions", []) as SettingsGroup,
    "backup-status": g("backup-status", {
      schedule: "Daily at 01:00 (Asia/Phnom_Penh); weekly full copy off-site", last_success_at: "2027-04-05T18:00:00.000Z", last_status: "SUCCESS",
      retention: "30 daily, 12 monthly, 7 yearly", last_restore_test: "2027-03-15",
    }, [], true) as SettingsGroup,
  };
}

/** Roles, a few historical sessions and the audit history of the seeded data. */
export function seedAdmin(
  users: { id: string; full_name: string; roles: string[] }[],
  journals: JournalEntry[],
): AdminState {
  const roles: Role[] = ROLES.map((code) => ({
    code, name: ROLE_NAMES[code][0], name_km: ROLE_NAMES[code][1], description: ROLE_NAMES[code][2], is_default: true, base_role: code,
    permissions: [...DEFAULT_ROLE_PERMISSIONS[code]], is_active: true, pending: null, user_count: users.filter((u) => u.roles.includes(code)).length,
    history: hist("Sok Dara", "CREATED"), version: 1,
  }));
  const log: AuditEvent[] = [];
  const base = { company_id: "cmp-demo", branch_id: null, ip: "10.0.0.15", user_agent: "Seed import", reason: null, outcome: "SUCCESS" as const };
  const owner = users.find((u) => u.roles.includes("OWNER"))!;
  const admin = users.find((u) => u.roles.includes("SYSADMIN"))!;
  for (const u of users) {
    appendAudit(log, { ...base, at: "2026-12-01T02:10:00.000Z", user_id: admin.id, user_name: admin.full_name, event_type: "users.create", entity_type: "users", entity_id: u.id, correlation_id: `seed-u-${u.id}`, changes: [{ field: "roles", before: null, after: u.roles.join(", ") }] });
  }
  appendAudit(log, { ...base, at: "2026-12-20T08:00:00.000Z", user_id: owner.id, user_name: owner.full_name, event_type: "budgets.approve", entity_type: "budgets", entity_id: "bud-2027-v1", correlation_id: "seed-b1", changes: [{ field: "status", before: "SUBMITTED", after: "APPROVED" }] });
  for (const j of [...journals].filter((x) => x.posted_at).sort((a, b) => (a.posted_at ?? "").localeCompare(b.posted_at ?? ""))) {
    const poster = users.find((u) => u.full_name === j.history.find((h) => h.action === "POSTED")?.user_name) ?? users.find((u) => u.id === j.preparer_id);
    appendAudit(log, {
      ...base, at: j.posted_at!, user_id: poster?.id ?? null, user_name: poster?.full_name ?? "System", event_type: j.source_type ? `${j.source_type.toLowerCase()}.post` : "journal-entries.post",
      entity_type: "journal-entries", entity_id: j.id, correlation_id: `seed-${j.id}`, changes: [{ field: "status", before: "APPROVED", after: "POSTED" }, { field: "journal_no", before: null, after: j.journal_no }],
    });
  }
  const sessions: UserSession[] = [];
  return { roles, sessions, auditLogs: log, settings: settings() };
}
