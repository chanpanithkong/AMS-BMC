import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { Account } from "@/lib/api/types/accounts";
import type { JournalEntry } from "@/lib/api/types/journals";
import type { ImportBatch, ImportError, ImportType } from "@/lib/api/types/planning";
import { IMPORT_TEMPLATES, templateOf } from "@/lib/imports/templates";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import type { StoredParty } from "../db/arap";
import { budgetTotals } from "../db/advanced";
import { buildLines, periodFor, totalsOf } from "../db/journals";
import type { MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, type Ctx } from "../http";
import { asOutcome, rateFor } from "./cashbank";

// SRS §6.21 Data Import: FR-IMP-001..010, BR-IMP-001, AT-IMP-01, AT-IMP-02, SCR-25. Two phases: the
// upload is validated in full and previewed; commit creates every record or none. Financial imports
// create drafts only. ASSUMPTION: the browser reads CSV and sends mapped rows; Excel is read by the backend.

type Row = Record<string, string>;
const now = () => new Date().toISOString();
let counter = 0;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MAX_ROWS = 50_000;
const isAmount = (v: string) => /^-?\d+(\.\d+)?$/.test((v ?? "").replace(/,/g, "").trim() || "0");
const amount = (v: string) => new Decimal((v ?? "").replace(/,/g, "").trim() || "0");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ក-៹]/g, "");

interface Validation {
  errors: ImportError[];
  warnings: string[];
}

function accountByCode(code: string): Account | undefined {
  return db().accounts.find((a) => a.code === (code ?? "").trim());
}

function validateParties(type: "CUSTOMERS" | "SUPPLIERS", rows: Row[], v: Validation) {
  const kind = type === "CUSTOMERS" ? "CUSTOMER" : "SUPPLIER";
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const n = i + 2; // row 1 is the header
    const code = (r.code ?? "").trim().toUpperCase();
    if (!code) v.errors.push({ row: n, column: "code", value: "", message: "Code is required" });
    else if (seen.has(code) || db().parties.some((p) => p.kind === kind && p.code === code)) v.errors.push({ row: n, column: "code", value: code, message: "This code already exists" });
    seen.add(code);
    if (!r.name_en?.trim()) v.errors.push({ row: n, column: "name_en", value: "", message: "English name is required" });
    if (!["USD", "KHR"].includes((r.currency ?? "").trim().toUpperCase())) v.errors.push({ row: n, column: "currency", value: r.currency ?? "", message: "Currency must be USD or KHR" });
    if (!/^\d{1,3}$/.test((r.payment_terms ?? "").trim())) v.errors.push({ row: n, column: "payment_terms", value: r.payment_terms ?? "", message: "Payment terms must be a number of days" });
    if (r.credit_limit?.trim() && !isAmount(r.credit_limit)) v.errors.push({ row: n, column: "credit_limit", value: r.credit_limit, message: "Credit limit must be an amount" });
    if (r.tax_id?.trim() && db().parties.some((p) => p.kind === kind && p.tax_id === r.tax_id.trim())) v.warnings.push(`Row ${n}: tax ID ${r.tax_id.trim()} is already used by another ${kind.toLowerCase()}`);
    const similar = db().parties.find((p) => p.kind === kind && norm(p.name) === norm(r.name_en ?? ""));
    if (similar) v.warnings.push(`Row ${n}: name is similar to ${similar.code} ${similar.name}`);
  });
}

function validateAccounts(rows: Row[], v: Validation) {
  const codes = new Map<string, Row>();
  rows.forEach((r, i) => {
    const n = i + 2;
    const code = (r.code ?? "").trim();
    if (!/^\d{3,8}$/.test(code)) v.errors.push({ row: n, column: "code", value: code, message: "Code must be 3 to 8 digits" });
    else if (codes.has(code) || accountByCode(code)) v.errors.push({ row: n, column: "code", value: code, message: "Account code already exists" });
    codes.set(code, r);
    if (!r.name_en?.trim()) v.errors.push({ row: n, column: "name_en", value: "", message: "English name is required" });
    const type = (r.type ?? "").trim().toUpperCase();
    if (!["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].includes(type)) v.errors.push({ row: n, column: "type", value: r.type ?? "", message: "Type must be ASSET, LIABILITY, EQUITY, REVENUE or EXPENSE" });
    const parent = accountByCode(r.parent_code);
    const parentInFile = codes.get((r.parent_code ?? "").trim());
    if (!parent && !parentInFile) v.errors.push({ row: n, column: "parent_code", value: r.parent_code ?? "", message: "Parent account not found" });
    else if (parent && (parent.is_posting || parent.type !== type)) v.errors.push({ row: n, column: "parent_code", value: r.parent_code, message: "Child account type must match a header parent" });
    if (!["Y", "N"].includes((r.posting_flag ?? "").trim().toUpperCase())) v.errors.push({ row: n, column: "posting_flag", value: r.posting_flag ?? "", message: "Posting flag must be Y or N" });
    if (!["DEBIT", "CREDIT"].includes((r.normal_balance ?? "").trim().toUpperCase())) v.errors.push({ row: n, column: "normal_balance", value: r.normal_balance ?? "", message: "Normal balance must be DEBIT or CREDIT" });
  });
}

function branchId(code: string) {
  const b = db().companies[0].branches.find((x) => x.code === (code ?? "").trim().toUpperCase());
  return b?.id ?? null;
}
function departmentId(code: string) {
  return db().departments.find((d) => d.code === (code ?? "").trim().toUpperCase())?.id ?? null;
}

function validateLinesCommon(r: Row, n: number, v: Validation) {
  const a = accountByCode(r.account_code);
  if (!a || !a.is_posting || !a.is_active) v.errors.push({ row: n, column: "account_code", value: r.account_code ?? "", message: "Account not found or not a posting account" });
  if (!isAmount(r.debit) || !isAmount(r.credit) || amount(r.debit).isNegative() || amount(r.credit).isNegative()) v.errors.push({ row: n, column: "debit", value: `${r.debit}/${r.credit}`, message: "Debit and credit must be amounts of zero or more" });
  else if (amount(r.debit).gt(0) === amount(r.credit).gt(0)) v.errors.push({ row: n, column: "debit", value: `${r.debit}/${r.credit}`, message: "Enter either a debit or a credit" });
  if (r.branch?.trim() && !branchId(r.branch)) v.errors.push({ row: n, column: "branch", value: r.branch, message: "Branch code not found" });
  if (r.department?.trim() && !departmentId(r.department)) v.errors.push({ row: n, column: "department", value: r.department, message: "Department code not found" });
}

function validateOpening(rows: Row[], v: Validation) {
  let dr = new Decimal(0);
  let cr = new Decimal(0);
  rows.forEach((r, i) => {
    validateLinesCommon(r, i + 2, v);
    if (isAmount(r.debit)) dr = dr.plus(amount(r.debit));
    if (isAmount(r.credit)) cr = cr.plus(amount(r.credit));
  });
  if (!dr.eq(cr)) v.errors.push({ row: 0, column: "debit", value: dr.minus(cr).toFixed(2), message: `Opening balances do not balance: debits exceed credits by ${dr.minus(cr).toFixed(2)}` });
  if (db().journals.some((j) => j.type === "OPENING" && j.status === "DRAFT" && j.source_type === "IMPORT")) v.errors.push({ row: 0, column: "", value: "", message: "A draft opening journal from an earlier import is waiting for review" });
  const posted = db().journals.find((j) => j.type === "OPENING" && j.status === "POSTED");
  if (posted) v.warnings.push(`An opening journal is already posted (${posted.journal_no}); this import creates a further draft for review`);
}

/** BR-IMP-001, AT-IMP-01: every journal must balance; one bad journal rejects the whole batch. */
function validateJournals(rows: Row[], v: Validation) {
  const groups = new Map<string, { rows: number[]; base: Decimal }>();
  rows.forEach((r, i) => {
    const n = i + 2;
    validateLinesCommon(r, n, v);
    const ref = (r.journal_ref ?? "").trim();
    if (!ref) v.errors.push({ row: n, column: "journal_ref", value: "", message: "Journal reference is required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test((r.posting_date ?? "").trim())) v.errors.push({ row: n, column: "posting_date", value: r.posting_date ?? "", message: "Posting date must be YYYY-MM-DD" });
    else if (!periodFor(db().fiscalYears.flatMap((y) => y.periods), r.posting_date.trim())) v.errors.push({ row: n, column: "posting_date", value: r.posting_date, message: "The date is outside every accounting period" });
    const currency = (r.currency ?? "").trim().toUpperCase();
    if (!["USD", "KHR"].includes(currency)) v.errors.push({ row: n, column: "currency", value: r.currency ?? "", message: "Currency must be USD or KHR" });
    const rate = currency === "USD" ? "1" : r.rate?.trim() || rateFor(currency, (r.posting_date ?? "").trim());
    if (!rate) v.errors.push({ row: n, column: "rate", value: "", message: `Exchange rate required for ${currency} on ${r.posting_date}` });
    if (db().journals.some((j) => j.reference === ref)) v.errors.push({ row: n, column: "journal_ref", value: ref, message: "A journal with this reference already exists" });
    const g = groups.get(ref) ?? { rows: [], base: new Decimal(0) };
    g.rows.push(n);
    if (rate && isAmount(r.debit) && isAmount(r.credit)) {
      const toBase = (x: string) => amount(x).times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      g.base = g.base.plus(toBase(r.debit)).minus(toBase(r.credit));
    }
    groups.set(ref, g);
  });
  for (const [ref, g] of groups) {
    if (ref && !g.base.isZero()) v.errors.push({ row: g.rows[0], column: "journal_ref", value: ref, message: `Journal ${ref} does not balance (difference ${g.base.toFixed(2)})` });
  }
}

function validateBudgets(rows: Row[], v: Validation, targetId: string | null, user: MockUser) {
  const target = db().budgets.find((b) => b.id === targetId);
  if (!target || (target.status !== "DRAFT" && target.status !== "REJECTED")) v.errors.push({ row: 0, column: "", value: targetId ?? "", message: "Choose a draft budget version to load into" });
  const own = user.roles.includes("DEPTMGR") ? user.department_ids : null;
  rows.forEach((r, i) => {
    const n = i + 2;
    const a = accountByCode(r.account_code);
    if (!a || !a.is_posting || (a.type !== "REVENUE" && a.type !== "EXPENSE")) v.errors.push({ row: n, column: "account_code", value: r.account_code ?? "", message: "Choose a revenue or expense posting account" });
    if (r.department?.trim() && !departmentId(r.department)) v.errors.push({ row: n, column: "department", value: r.department, message: "Department code not found" });
    if (own && !own.includes(departmentId(r.department) ?? "")) v.errors.push({ row: n, column: "department", value: r.department ?? "", message: "You can budget only for your own department" });
    if (r.branch?.trim() && !branchId(r.branch)) v.errors.push({ row: n, column: "branch", value: r.branch, message: "Branch code not found" });
    for (const m of MONTHS) if (!isAmount(r[m]) || amount(r[m]).isNegative()) v.errors.push({ row: n, column: m, value: r[m] ?? "", message: "Monthly amounts must be zero or more" });
  });
}

function draftJournal(user: MockUser, ref: string, date: string, description: string, type: JournalEntry["type"], inputs: Parameters<typeof buildLines>[0]): JournalEntry {
  const id = `jnl-imp-${Date.now().toString(36)}-${(counter += 1)}`;
  const lines = buildLines(inputs, db().accounts, id);
  const at = now();
  return {
    id, journal_no: null, status: "DRAFT", type, posting_date: date, document_date: date, description, reference: ref, currency: inputs.find((l) => l.currency !== "USD")?.currency ?? "USD",
    period: periodFor(db().fiscalYears.flatMap((y) => y.periods), date)?.code ?? null, totals: totalsOf(lines), preparer_id: user.id, preparer_name: user.full_name, approver_name: null,
    submitted_at: null, posted_at: null, source_type: "IMPORT", source_no: ref, version: 1, lines, history: [{ id: `${id}-h1`, at, user_name: user.full_name, action: "CREATED", comment: "Imported" }],
    approval_steps: [], attachments: [], reversed_by: null, reverses: null, reversal_reason: null, rejection_comment: null,
  };
}

const lineInput = (r: Row, currency = "USD", rate = "1") => ({
  account_id: accountByCode(r.account_code)!.id, description: r.description ?? "", debit: amount(r.debit).toFixed(currency === "KHR" ? 0 : 2), credit: amount(r.credit).toFixed(currency === "KHR" ? 0 : 2),
  currency, rate, branch_id: branchId(r.branch), department_id: departmentId(r.department), dimensions: {},
});

/** Create the records of a validated batch, all in one step. */
function commit(batch: ImportBatch, rows: Row[], user: MockUser) {
  const created: ImportBatch["created"] = [];
  switch (batch.type) {
    case "CUSTOMERS":
    case "SUPPLIERS": {
      const kind = batch.type === "CUSTOMERS" ? "CUSTOMER" : "SUPPLIER";
      for (const r of rows) {
        const p: StoredParty = {
          id: `${kind === "CUSTOMER" ? "cus" : "sup"}-imp-${Date.now().toString(36)}-${(counter += 1)}`, kind, code: r.code.trim().toUpperCase(), name: r.name_en.trim(), name_km: r.name_km?.trim() ?? "",
          tax_id: r.tax_id?.trim() ?? "", email: r.email?.trim() ?? "", phone: r.phone?.trim() ?? "", address: "", currency: r.currency.trim().toUpperCase(), payment_terms_days: Number(r.payment_terms),
          credit_limit: kind === "CUSTOMER" && r.credit_limit?.trim() ? amount(r.credit_limit).toFixed(2) : null, status: kind === "CUSTOMER" ? "ACTIVE" : "DRAFT", contacts: [], bank: null,
          default_account_id: kind === "CUSTOMER" ? "acc-4100" : null, notes: `Imported (${batch.file_name})`, version: 1,
        };
        db().parties.push(p);
        created.push({ type: kind, id: p.id, label: `${p.code} ${p.name}` });
      }
      break;
    }
    case "ACCOUNTS": {
      for (const r of rows) {
        const parent = accountByCode(r.parent_code)!;
        const a: Account = {
          id: `acc-${r.code.trim()}`, code: r.code.trim(), name: r.name_en.trim(), name_km: r.name_km?.trim() || r.name_en.trim(), type: r.type.trim().toUpperCase() as Account["type"],
          category: r.category?.trim() || parent.category, parent_id: parent.id, normal_balance: r.normal_balance.trim().toUpperCase() as Account["normal_balance"],
          is_posting: r.posting_flag.trim().toUpperCase() === "Y", is_control: false, control_module: null, is_contra: false, is_sensitive: false, currency: null, cash_flow_class: null, is_active: true, version: 1,
        };
        db().accounts.push(a);
        created.push({ type: "ACCOUNT", id: a.id, label: `${a.code} ${a.name}` });
      }
      break;
    }
    case "OPENING_BALANCES": {
      const fy = db().fiscalYears[0];
      const j = draftJournal(user, `OPEN-IMP-${batch.id.slice(-4)}`, fy.start_date, `Opening balances imported from ${batch.file_name}`, "OPENING", rows.map((r) => lineInput(r)));
      db().journals.push(j);
      db().openingSignedOff = false;
      created.push({ type: "JOURNAL", id: j.id, label: j.reference });
      break;
    }
    case "JOURNALS": {
      const groups = new Map<string, Row[]>();
      for (const r of rows) groups.set(r.journal_ref.trim(), [...(groups.get(r.journal_ref.trim()) ?? []), r]);
      for (const [ref, rs] of groups) {
        const currency = rs[0].currency.trim().toUpperCase();
        const rate = currency === "USD" ? "1" : rs[0].rate?.trim() || rateFor(currency, rs[0].posting_date.trim())!;
        const j = draftJournal(user, ref, rs[0].posting_date.trim(), rs[0].description?.trim() || ref, "MANUAL", rs.map((r) => lineInput(r, (r.currency ?? currency).trim().toUpperCase(), rate)));
        db().journals.push(j);
        created.push({ type: "JOURNAL", id: j.id, label: ref });
      }
      break;
    }
    case "BUDGETS": {
      const b = db().budgets.find((x) => x.id === batch.target_id)!;
      for (const r of rows) {
        const a = accountByCode(r.account_code)!;
        const dept = departmentId(r.department);
        const br = branchId(r.branch);
        const months = MONTHS.map((m) => amount(r[m]).toFixed(2));
        const existing = b.lines.find((l) => l.account_id === a.id && l.department_id === dept && l.branch_id === br);
        if (existing) existing.months = months;
        else b.lines.push({ id: `bl-imp-${(counter += 1)}`, account_id: a.id, account_code: a.code, account_name: a.name, account_name_km: a.name_km, department_id: dept, branch_id: br, months, total: "0", comment: "Imported" });
      }
      Object.assign(b, budgetTotals(b, db().accounts));
      b.history.push({ id: `${b.id}-h${b.history.length + 1}`, at: now(), user_name: user.full_name, action: "IMPORTED", comment: batch.file_name });
      b.row_version += 1;
      created.push({ type: "BUDGET", id: b.id, label: b.name });
      break;
    }
  }
  return created;
}

const rowsStore = new Map<string, Row[]>();
const find = (ctx: Ctx) => db().importBatches.find((b) => b.id === ctx.params.id) ?? fail(404, "NOT_FOUND", "Import not found.");

export const importHandlers = [
  route("get", "/imports", "imp.view", ({ url }) => paginate([...db().importBatches].sort((a, b) => b.created_at.localeCompare(a.created_at)), url)),
  route("get", "/imports/status", "imp.view", () => HttpResponse.json({ opening_signed_off: db().openingSignedOff })),
  route("get", "/imports/:id", "imp.view", (ctx) => {
    const b = find(ctx);
    return b instanceof Response ? b : HttpResponse.json(b);
  }),

  // Phase 1: validate everything and keep the batch for preview (FR-IMP-007).
  route<{ type: ImportType; file_name: string; file_hash: string; rows: Row[]; target_id?: string | null }>("post", "/imports", "imp.create", (ctx) => {
    const t = IMPORT_TEMPLATES.find((x) => x.type === ctx.body?.type);
    if (!t) return fail(422, "VALIDATION_ERROR", "Choose what to import", [{ field: "type", issue: "required", message: "Choose what to import" }]);
    if (!hasPermission(ctx.user.permissions, t.permission)) return fail(403, "FORBIDDEN", `Permission ${t.permission} is required for this import.`);
    const rows = (ctx.body.rows ?? []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "").trim()])));
    if (!rows.length) return fail(422, "VALIDATION_ERROR", "The file has no data rows", [{ field: "rows", issue: "empty", message: "The file has no data rows" }]);
    if (rows.length > MAX_ROWS) return fail(422, "VALIDATION_ERROR", `At most ${MAX_ROWS} rows per file`, [{ field: "rows", issue: "too_many", message: `At most ${MAX_ROWS} rows per file` }]);
    const v: Validation = { errors: [], warnings: [] };
    // Required columns are checked first; missing ones make every other check pointless.
    for (const col of templateOf(t.type).columns.filter((x) => x.required)) {
      rows.forEach((r, i) => {
        if (!(col.key in r)) v.errors.push({ row: i + 2, column: col.key, value: "", message: `Column ${col.key} is missing` });
      });
    }
    if (!v.errors.length) {
      if (t.type === "CUSTOMERS" || t.type === "SUPPLIERS") validateParties(t.type, rows, v);
      else if (t.type === "ACCOUNTS") validateAccounts(rows, v);
      else if (t.type === "OPENING_BALANCES") validateOpening(rows, v);
      else if (t.type === "JOURNALS") validateJournals(rows, v);
      else validateBudgets(rows, v, ctx.body.target_id ?? null, ctx.user);
    }
    const badRows = new Set(v.errors.map((e) => e.row));
    const batch: ImportBatch = {
      id: `imp-${Date.now().toString(36)}-${(counter += 1)}`, type: t.type, file_name: ctx.body.file_name || "upload.csv", file_hash: ctx.body.file_hash || "", status: v.errors.length ? "FAILED" : "VALIDATED",
      total_rows: rows.length, valid_rows: rows.filter((_, i) => !badRows.has(i + 2)).length, errors: v.errors.slice(0, 500), warnings: v.warnings.slice(0, 50), preview: rows.slice(0, 20),
      created: [], target_id: ctx.body.target_id ?? null, can_rollback: false, created_by: ctx.user.full_name, created_at: now(), committed_at: null,
    };
    rowsStore.set(batch.id, rows);
    db().importBatches.push(batch);
    return HttpResponse.json(batch, { status: 201 });
  }),

  // Phase 2: commit in one go; a failed batch cannot be committed (BR-IMP-001). Idempotent.
  route("post", "/imports/:id/commit", "imp.create", (ctx) =>
    idempotent(ctx, () => {
      const b = find(ctx);
      if (b instanceof Response) return asOutcome(b);
      if (b.status === "COMMITTED") return asOutcome(fail(409, "ALREADY_POSTED", "This import was already committed.", [{ field: "status", value: b.id }]));
      if (b.status !== "VALIDATED") return asOutcome(fail(422, "VALIDATION_ERROR", "Fix the errors and upload the file again", [{ field: "errors", issue: "failed", message: "Fix the errors and upload the file again" }]));
      const rows = rowsStore.get(b.id) ?? [];
      b.created = commit(b, rows, ctx.user);
      b.status = "COMMITTED";
      b.committed_at = now();
      b.can_rollback = ["CUSTOMERS", "SUPPLIERS", "ACCOUNTS"].includes(b.type);
      return { status: 200, body: b };
    }),
  ),

  // FR-IMP-010: master-data batches can be rolled back while nothing depends on them.
  route("post", "/imports/:id/rollback", "imp.create", (ctx) => {
    const b = find(ctx);
    if (b instanceof Response) return b;
    if (b.status !== "COMMITTED" || !b.can_rollback) return fail(409, "INVALID_STATE_TRANSITION", "Only a committed master-data import can be rolled back.");
    const ids = new Set(b.created.map((c) => c.id));
    const used = b.type === "ACCOUNTS"
      ? db().journals.some((j) => j.lines.some((l) => ids.has(l.account_id))) || db().accounts.some((a) => a.parent_id && ids.has(a.parent_id) && !ids.has(a.id))
      : db().invoices.some((d) => ids.has(d.party_id)) || db().partyPayments.some((p) => ids.has(p.party_id));
    if (used) return fail(409, "ACCOUNT_IN_USE", "Records from this import are already used; correct them individually.");
    if (b.type === "ACCOUNTS") db().accounts = db().accounts.filter((a) => !ids.has(a.id));
    else db().parties = db().parties.filter((p) => !ids.has(p.id));
    b.status = "ROLLED_BACK";
    b.can_rollback = false;
    return HttpResponse.json(b);
  }),

  // AT-IMP-02: imported opening balances stay "not signed off" until a Finance Manager signs off.
  route("post", "/imports/opening-signoff", "gl.journal.post", () => {
    db().openingSignedOff = true;
    return HttpResponse.json({ opening_signed_off: true });
  }),
];
