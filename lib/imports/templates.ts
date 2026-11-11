import type { ImportType } from "@/lib/api/types/planning";
import type { Permission } from "@/lib/rbac/permissions";

// SCR-25 import templates (SRS §6.21 "Import templates and required columns"). Shared by the wizard
// (template download, column mapping) and the mock server (validation).

export interface TemplateColumn {
  key: string;
  required: boolean;
  /** Example value for the template file. */
  example: string;
}

export interface ImportTemplate {
  type: ImportType;
  /** Permission for the data type, on top of imp.create (FR-IMP-009). */
  permission: Permission;
  columns: TemplateColumn[];
  /** Financial imports are all-or-nothing (BR-IMP-001); master data may skip invalid rows only with confirmation. */
  financial: boolean;
}

const c = (key: string, required: boolean, example: string): TemplateColumn => ({ key, required, example });
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const IMPORT_TEMPLATES: ImportTemplate[] = [
  {
    type: "CUSTOMERS", permission: "ar.customer.manage", financial: false,
    columns: [c("code", true, "C-0101"), c("name_en", true, "Riverside Trading"), c("name_km", false, "ពាណិជ្ជកម្ម ទន្លេ"), c("currency", true, "USD"), c("payment_terms", true, "30"), c("tax_id", false, "K001-901234567"), c("email", false, "accounts@riverside.example"), c("phone", false, "+855 12 345 678"), c("credit_limit", false, "5000")],
  },
  {
    type: "SUPPLIERS", permission: "ap.supplier.manage", financial: false,
    columns: [c("code", true, "S-0101"), c("name_en", true, "Mekong Paper Supplies"), c("name_km", false, "ក្រដាស មេគង្គ"), c("currency", true, "USD"), c("payment_terms", true, "30"), c("tax_id", false, "L001-101234567"), c("email", false, "billing@mekongpaper.example"), c("phone", false, "+855 23 456 789")],
  },
  {
    type: "ACCOUNTS", permission: "coa.create", financial: false,
    columns: [c("code", true, "6510"), c("name_en", true, "Software subscriptions"), c("name_km", false, "ការជាវកម្មវិធី"), c("type", true, "EXPENSE"), c("parent_code", true, "6000"), c("posting_flag", true, "Y"), c("normal_balance", true, "DEBIT"), c("category", false, "Operating expenses")],
  },
  {
    type: "OPENING_BALANCES", permission: "gl.journal.create", financial: true,
    columns: [c("account_code", true, "1101"), c("debit", true, "1000.00"), c("credit", true, "0"), c("branch", false, "PP")],
  },
  {
    type: "JOURNALS", permission: "gl.journal.create", financial: true,
    columns: [c("journal_ref", true, "IMP-001"), c("posting_date", true, "2027-04-05"), c("description", true, "Office supplies"), c("account_code", true, "6500"), c("debit", true, "50.00"), c("credit", true, "0"), c("currency", true, "USD"), c("rate", false, ""), c("branch", false, "PP"), c("department", false, "ADMIN")],
  },
  {
    type: "BUDGETS", permission: "bud.edit", financial: false,
    columns: [c("account_code", true, "6200"), c("department", false, "OPS"), c("branch", false, ""), ...MONTHS.map((m) => c(m, true, "800.00"))],
  },
];

export const templateOf = (type: ImportType) => IMPORT_TEMPLATES.find((t) => t.type === type)!;

/** A CSV template with the header row and one example row (UTF-8 with BOM so Excel reads Khmer). */
export function templateCsv(type: ImportType): string {
  const t = templateOf(type);
  const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `﻿${t.columns.map((x) => x.key).join(",")}\r\n${t.columns.map((x) => quote(x.example)).join(",")}\r\n`;
}

/** Guess which file column feeds each template column (case, spaces and punctuation ignored). */
export function guessColumns(type: ImportType, header: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out: Record<string, string> = {};
  for (const col of templateOf(type).columns) {
    const hit = header.find((h) => norm(h) === norm(col.key)) ?? header.find((h) => norm(h).startsWith(norm(col.key).replace(/en$/, "")));
    if (hit) out[col.key] = hit;
  }
  return out;
}
