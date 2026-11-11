import type { SodConflict } from "@/lib/api/types/admin";

// The SoD rules of SRS §4.4 as the browser checks them while roles are edited. The server checks
// the same list (mocks/db/admin.ts SOD_RULES) and is authoritative.

export const SOD_RULES: SodConflict[] = [
  { code: "SUPPLIER_PAYMENT", description: "create supplier and release payment", description_km: "បង្កើតអ្នកផ្គត់ផ្គង់ និងបញ្ចេញការទូទាត់", permissions: ["ap.supplier.manage", "ap.payment.release"] },
  { code: "PAYMENT_PREPARE_RELEASE", description: "prepare and release supplier payments", description_km: "រៀបចំ និងបញ្ចេញការទូទាត់អ្នកផ្គត់ផ្គង់", permissions: ["ap.payment.create", "ap.payment.release"] },
  { code: "BANK_DETAILS", description: "change and approve supplier bank details", description_km: "ផ្លាស់ប្តូរ និងអនុម័តព័ត៌មានធនាគារអ្នកផ្គត់ផ្គង់", permissions: ["ap.supplier.manage", "ap.supplier.approve"] },
  { code: "USER_ADMIN_POSTING", description: "manage users and post journals", description_km: "គ្រប់គ្រងអ្នកប្រើ និងកត់ត្រាទិនានុប្បវត្តិ", permissions: ["users.manage", "gl.journal.post"] },
  { code: "ROLES_APPROVE_SELF", description: "edit roles and approve role changes", description_km: "កែតួនាទី និងអនុម័តការផ្លាស់ប្តូរតួនាទី", permissions: ["roles.manage", "roles.approve"] },
  { code: "RECONCILE_COMPLETE", description: "record cash and complete bank reconciliations", description_km: "កត់ត្រាសាច់ប្រាក់ និងបញ្ចប់ការផ្ទៀងផ្ទាត់ធនាគារ", permissions: ["cb.cash.create", "cb.reconcile.complete"] },
];

export function sodConflictsOf(permissions: string[]): SodConflict[] {
  const set = new Set(permissions);
  return SOD_RULES.filter((r) => set.has(r.permissions[0]) && set.has(r.permissions[1]));
}
