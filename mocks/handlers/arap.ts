import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type {
  AgingBuckets, AgingReport, AllocationLine, BankDetails, CreditNote, DuplicateCheck, Invoice, InvoiceInput, InvoiceLine, Party, PartyInput,
  PartyPayment, PartyPaymentInput, PartyStatement,
} from "@/lib/api/types/arap";
import type { ApprovalStep, HistoryEvent } from "@/lib/api/types/common";
import type { ApprovalItem } from "@/lib/api/types/journals";
import { addDays, agingBucket, normaliseInvoiceNo, rateOn } from "@/lib/money/invoice";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import {
  AP_CONTROL, AR_CONTROL, baseOf, creditNoteJournalLines, invoiceJournalLines, outstandingBase, priceDocument, refreshInvoice,
  settlementJournalLines, type StoredParty,
} from "../db/arap";
import { accountBalance, postJournal } from "../db/posting";
import { MOCK_TODAY, type MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, versionConflict, type Ctx } from "../http";
import { capitaliseFromInvoice } from "./assets";
import { asOutcome, insufficient, nextNumber, rateFor, rateMissing, visibleCashBankAccounts } from "./cashbank";
import { checkPeriod } from "./journals";

// SRS §6.6 Accounts Receivable (FR-AR-001..020, BR-AR-001..006, AT-AR-01..05) and §6.7 Accounts
// Payable (FR-AP-001..018, BR-AP-001..006, AT-AP-01..04). Tax codes are in ./tax.ts.

const now = () => new Date().toISOString();
let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;
const dpOf = (currency: string) => (currency === "KHR" ? 0 : 2);
const money = (value: Decimal.Value, currency: string) => new Decimal(value || 0).toFixed(dpOf(currency));
const amountOf = (value: unknown) => {
  try {
    return new Decimal(typeof value === "string" && value.trim() ? value : 0);
  } catch {
    return new Decimal(NaN);
  }
};

type Doc = { id: string; history: HistoryEvent[]; version: number };
function log(d: Doc, user: MockUser, action: string, comment?: string | null) {
  d.history.push({ id: `${d.id}-h${d.history.length + 1}`, at: now(), user_name: user.full_name, action, comment: comment ?? null });
  d.version += 1;
}
const pending = (step: number, role: string): ApprovalStep => ({ step, role, status: "PENDING", approver_name: null, acted_at: null, comment: null });
const invalid = (details: { field: string; issue: string; message: string; value?: string }[]) => fail(422, "VALIDATION_ERROR", details[0].message, details);
const mask = (n: string) => `•••• ${n.replace(/\D/g, "").slice(-4)}`;
const isFinMgr = (user: MockUser) => user.roles.includes("FINMGR") || user.roles.includes("OWNER");

// ---------------------------------------------------------------- parties

function maskBank(bank: BankDetails | null, user: MockUser): BankDetails | null {
  if (!bank || hasPermission(user.permissions, "ap.supplier.bank.view")) return bank;
  return { ...bank, account_number: mask(bank.account_number), pending: bank.pending ? { ...bank.pending, account_number: mask(bank.pending.account_number) } : null };
}

export function partyDto(p: StoredParty, user: MockUser): Party {
  let balance = new Decimal(0);
  let overdue = new Decimal(0);
  for (const d of db().invoices) {
    if (d.party_id !== p.id || !d.posted) continue;
    const owed = outstandingBase(d);
    balance = balance.plus(owed);
    if (d.due_date < MOCK_TODAY && owed.gt(0)) overdue = overdue.plus(owed);
  }
  const unapplied = db().partyPayments
    .filter((x) => x.party_id === p.id && x.kind === "RECEIPT" && x.status === "POSTED")
    .reduce((s, x) => s.plus(baseOf(x.unapplied, x.rate)), new Decimal(0));
  return { ...p, bank: maskBank(p.bank, user), balance: balance.toFixed(2), overdue: overdue.toFixed(2), unapplied: unapplied.toFixed(2) };
}

function applyParty(p: StoredParty, input: PartyInput) {
  Object.assign(p, {
    code: (input.code ?? "").trim().toUpperCase(), name: (input.name ?? "").trim(), name_km: (input.name_km ?? "").trim(), tax_id: input.tax_id ?? "",
    email: input.email ?? "", phone: input.phone ?? "", address: input.address ?? "", currency: input.currency || "USD",
    payment_terms_days: Math.max(0, Math.trunc(Number(input.payment_terms_days) || 0)),
    credit_limit: p.kind === "CUSTOMER" && input.credit_limit ? money(input.credit_limit, "USD") : null,
    default_account_id: input.default_account_id || null, notes: input.notes ?? "", contacts: (input.contacts ?? []).filter((c) => c.name?.trim()),
  });
}

function validateParty(p: StoredParty): Response | null {
  const details: { field: string; issue: string; message: string }[] = [];
  if (!p.code) details.push({ field: "code", issue: "required", message: "Enter a code" });
  if (!p.name) details.push({ field: "name", issue: "required", message: "Enter the name" });
  if (p.credit_limit !== null && new Decimal(p.credit_limit).lt(0)) details.push({ field: "credit_limit", issue: "positive", message: "The credit limit cannot be negative" });
  if (details.length) return invalid(details);
  if (db().parties.some((o) => o.id !== p.id && o.kind === p.kind && o.code === p.code)) {
    return fail(409, "DUPLICATE_CODE", `Code ${p.code} is already used`, [{ field: "code", issue: "duplicate", value: p.code }]);
  }
  return null;
}

/** Outstanding of an invoice at a date: total less settlements dated on or before it. */
export function outstandingAt(d: Invoice, asOf: string) {
  const settled = d.settlements.filter((s) => s.date <= asOf);
  const amount = settled.reduce((s, x) => s.minus(x.amount), new Decimal(d.total));
  const base = settled.reduce((s, x) => s.minus(baseOf(x.amount, d.rate)), new Decimal(d.total_base));
  return { amount, base };
}

const emptyBuckets = (): Record<keyof AgingBuckets, Decimal> => ({
  current: new Decimal(0), d1_30: new Decimal(0), d31_60: new Decimal(0), d61_90: new Decimal(0), over_90: new Decimal(0), total: new Decimal(0),
});
const fixBuckets = (b: Record<keyof AgingBuckets, Decimal>): AgingBuckets =>
  Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.toFixed(2)])) as unknown as AgingBuckets;

function agingFor(partyId: string, asOf: string) {
  const b = emptyBuckets();
  for (const d of db().invoices) {
    if (d.party_id !== partyId || !d.posted || d.date > asOf) continue;
    const { base } = outstandingAt(d, asOf);
    if (base.isZero()) continue;
    const bucket = agingBucket(d.due_date, asOf);
    b[bucket] = b[bucket].plus(base);
    b.total = b.total.plus(base);
  }
  return b;
}

function statement(p: StoredParty, from: string, to: string, user: MockUser): PartyStatement {
  const sales = p.kind === "CUSTOMER";
  type Entry = { date: string; type: string; number: string; description: string; debit: Decimal; credit: Decimal; doc_id: string; doc_kind: string };
  const entries: Entry[] = [];
  for (const d of db().invoices) {
    if (d.party_id !== p.id || !d.posted) continue;
    const amount = new Decimal(d.total);
    entries.push({ date: d.date, type: "INVOICE", number: d.number ?? "", description: d.is_opening ? "Balance brought forward" : d.reference || d.supplier_invoice_no || "", debit: sales ? amount : new Decimal(0), credit: sales ? new Decimal(0) : amount, doc_id: d.id, doc_kind: sales ? "AR_INVOICE" : "AP_INVOICE" });
  }
  for (const x of db().partyPayments) {
    if (x.party_id !== p.id || !(x.status === "POSTED" || x.status === "PAID")) continue;
    const amount = new Decimal(x.amount);
    entries.push({ date: x.date, type: x.kind, number: x.number ?? "", description: x.reference, debit: sales ? new Decimal(0) : amount, credit: sales ? amount : new Decimal(0), doc_id: x.id, doc_kind: x.kind });
  }
  for (const c of db().creditNotes) {
    if (c.party_id !== p.id || c.status !== "POSTED") continue;
    entries.push({ date: c.date, type: "CREDIT_NOTE", number: c.number ?? "", description: c.reason, debit: new Decimal(0), credit: new Decimal(c.total), doc_id: c.id, doc_kind: "CREDIT_NOTE" });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const signed = (e: Entry) => (sales ? e.debit.minus(e.credit) : e.credit.minus(e.debit));
  const opening = entries.filter((e) => e.date < from).reduce((s, e) => s.plus(signed(e)), new Decimal(0));
  let running = opening;
  const lines = entries.filter((e) => e.date >= from && e.date <= to).map((e) => {
    running = running.plus(signed(e));
    return { ...e, debit: money(e.debit, p.currency), credit: money(e.credit, p.currency), balance: money(running, p.currency) };
  });
  return {
    party: partyDto(p, user), date_from: from, date_to: to, currency: p.currency, opening: money(opening, p.currency), lines, closing: money(running, p.currency),
    aging: fixBuckets(agingFor(p.id, to)),
  };
}

function partyRoutes(kind: "CUSTOMER" | "SUPPLIER") {
  const base = kind === "CUSTOMER" ? "/customers" : "/suppliers";
  const view = kind === "CUSTOMER" ? "ar.customer.view" : "ap.supplier.view";
  const manage = kind === "CUSTOMER" ? "ar.customer.manage" : "ap.supplier.manage";
  const find = (ctx: Ctx) => db().parties.find((p) => p.kind === kind && p.id === ctx.params.id) ?? fail(404, "NOT_FOUND", `${kind === "CUSTOMER" ? "Customer" : "Supplier"} not found.`);
  return [
    route("get", base, view, ({ user, url }) => {
      const q = url.searchParams;
      const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
      const search = (q.get("search") ?? "").toLowerCase();
      const rows = db().parties
        .filter((p) => p.kind === kind && (!statuses.length || statuses.includes(p.status)))
        .filter((p) => !search || `${p.code} ${p.name} ${p.name_km} ${p.tax_id} ${p.phone}`.toLowerCase().includes(search))
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((p) => partyDto(p, user));
      const owing = q.get("with_balance") === "true" ? rows.filter((r) => !new Decimal(r.balance).isZero()) : rows;
      return paginate(owing, url);
    }),

    route<PartyInput & { bank?: Omit<BankDetails, "pending"> | null }>("post", base, manage, (ctx) => {
      const p: StoredParty = {
        id: newId(kind === "CUSTOMER" ? "cus" : "sup"), kind, code: "", name: "", name_km: "", tax_id: "", email: "", phone: "", address: "", currency: "USD",
        payment_terms_days: 30, credit_limit: null, status: kind === "CUSTOMER" ? "ACTIVE" : "DRAFT", contacts: [], bank: null, default_account_id: null, notes: "", version: 1,
      };
      applyParty(p, ctx.body);
      // A new supplier starts as a draft; its bank details are confirmed when the supplier is verified.
      if (kind === "SUPPLIER" && ctx.body.bank?.account_number?.trim()) p.bank = { ...ctx.body.bank, pending: null };
      const bad = validateParty(p);
      if (bad) return bad;
      db().parties.push(p);
      return HttpResponse.json(partyDto(p, ctx.user), { status: 201 });
    }),

    route("get", `${base}/:id`, view, (ctx) => {
      const p = find(ctx);
      return p instanceof Response ? p : HttpResponse.json(partyDto(p, ctx.user));
    }),

    route<PartyInput>("patch", `${base}/:id`, manage, (ctx) => {
      const p = find(ctx);
      if (p instanceof Response) return p;
      const stale = versionConflict(ctx, p.version);
      if (stale) return stale;
      const before = { ...p };
      applyParty(p, ctx.body);
      const bad = validateParty(p);
      if (bad) {
        Object.assign(p, before);
        return bad;
      }
      p.version += 1;
      return HttpResponse.json(partyDto(p, ctx.user));
    }),

    // ASSUMPTION: status changes as an action (verify, block, activate, deactivate); not listed in SRS §13.3.
    route<{ status: StoredParty["status"]; reason?: string }>("post", `${base}/:id/status`, kind === "CUSTOMER" ? manage : "ap.supplier.approve", (ctx) => {
      const p = find(ctx);
      if (p instanceof Response) return p;
      const allowed = kind === "CUSTOMER" ? ["ACTIVE", "INACTIVE"] : ["VERIFIED", "BLOCKED"];
      if (!allowed.includes(ctx.body?.status)) return fail(409, "INVALID_STATE_TRANSITION", "That status is not available.");
      if (ctx.body.status === "BLOCKED" && !ctx.body.reason?.trim()) return invalid([{ field: "reason", issue: "required", message: "A reason is required." }]);
      if (ctx.body.status === "VERIFIED" && !p.bank) return invalid([{ field: "bank", issue: "required", message: "Enter the supplier's bank details before verifying it." }]);
      p.status = ctx.body.status;
      p.notes = ctx.body.reason?.trim() ? `${p.notes ? `${p.notes}\n` : ""}${ctx.body.status}: ${ctx.body.reason.trim()}` : p.notes;
      p.version += 1;
      return HttpResponse.json(partyDto(p, ctx.user));
    }),

    route("get", `${base}/:id/statement`, view, (ctx) => {
      const p = find(ctx);
      if (p instanceof Response) return p;
      const from = ctx.url.searchParams.get("date_from") || "2027-01-01";
      const to = ctx.url.searchParams.get("date_to") || MOCK_TODAY;
      return HttpResponse.json(statement(p, from, to, ctx.user));
    }),
  ];
}

/** BR-AP-005: a bank-details change needs approval by another user; payments wait meanwhile. */
const bankRoutes = [
  route<{ bank_name: string; account_name: string; account_number: string }>("post", "/suppliers/:id/bank-details", "ap.supplier.manage", (ctx) => {
    const p = db().parties.find((x) => x.kind === "SUPPLIER" && x.id === ctx.params.id);
    if (!p) return fail(404, "NOT_FOUND", "Supplier not found.");
    const b = ctx.body ?? { bank_name: "", account_name: "", account_number: "" };
    const details = [
      ...(!b.bank_name?.trim() ? [{ field: "bank_name", issue: "required", message: "Enter the bank" }] : []),
      ...(!b.account_name?.trim() ? [{ field: "account_name", issue: "required", message: "Enter the account name" }] : []),
      ...(!/^[\d\s-]{6,}$/.test(b.account_number ?? "") ? [{ field: "account_number", issue: "format", message: "Enter the account number (digits)" }] : []),
    ];
    if (details.length) return invalid(details);
    const change = { bank_name: b.bank_name.trim(), account_name: b.account_name.trim(), account_number: b.account_number.trim() };
    if (!p.bank) p.bank = { ...change, pending: null };
    else p.bank.pending = { ...change, requested_by: ctx.user.full_name, requested_at: now() };
    p.version += 1;
    return HttpResponse.json(partyDto(p, ctx.user));
  }),
  route<{ action: "approve" | "reject"; comment?: string }>("post", "/suppliers/:id/bank-details/decision", "ap.supplier.approve", (ctx) =>
    idempotent(ctx, () => {
      const p = db().parties.find((x) => x.kind === "SUPPLIER" && x.id === ctx.params.id);
      if (!p) return asOutcome(fail(404, "NOT_FOUND", "Supplier not found."));
      if (!p.bank?.pending) return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "No bank-details change is waiting."));
      if (!db().reducedSod && p.bank.pending.requested_by === ctx.user.full_name) return asOutcome(fail(403, "SOD_VIOLATION", "You requested this change and cannot approve it"));
      if (ctx.body?.action === "reject" && !ctx.body.comment?.trim()) return asOutcome(invalid([{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
      const change = p.bank.pending;
      if (ctx.body?.action === "approve") p.bank = { bank_name: change.bank_name, account_name: change.account_name, account_number: change.account_number, pending: null };
      else p.bank.pending = null;
      p.version += 1;
      return { status: 200, body: partyDto(p, ctx.user) };
    }),
  ),
];

// ---------------------------------------------------------------- invoices

const CFG = {
  AR: { path: "/customer-invoices", perm: "ar.invoice", party: "CUSTOMER", prefix: "INV", source: "AR_INVOICE", taxKinds: ["OUTPUT", "EXEMPT"], label: "invoice" },
  AP: { path: "/supplier-invoices", perm: "ap.invoice", party: "SUPPLIER", prefix: "BILL", source: "AP_INVOICE", taxKinds: ["INPUT", "EXEMPT"], label: "supplier invoice" },
} as const;
/** Above this base amount a supplier invoice also needs the Finance Manager (illustrative, D-09). */
const AP_SECOND_STEP_ABOVE = "5000";

function canSeeInvoice(inv: Invoice, user: MockUser): boolean {
  if (inv.kind === "AP" && user.roles.includes("DEPTMGR")) {
    return inv.lines.some((l) => l.department_id && user.department_ids.includes(l.department_id));
  }
  return true;
}

/** Overdue is derived from the due date (SRS §6.6). */
export function invoiceView(inv: Invoice): Invoice {
  const late = inv.posted && (inv.status === "OPEN" || inv.status === "PARTIALLY_PAID") && inv.due_date < MOCK_TODAY && new Decimal(inv.outstanding).gt(0);
  return late ? { ...inv, status: "OVERDUE" } : inv;
}

function applyInvoiceInput(inv: Invoice, input: InvoiceInput) {
  const party = db().parties.find((p) => p.id === input.party_id && p.kind === CFG[inv.kind].party);
  const date = input.date ?? "";
  const terms = Math.max(0, Math.trunc(Number(input.terms_days ?? party?.payment_terms_days ?? 0)));
  const currency = input.currency || party?.currency || "USD";
  Object.assign(inv, {
    party_id: input.party_id ?? "", party_code: party?.code ?? "", party_name: party?.name ?? "", party_name_km: party?.name_km ?? "",
    date, received_date: inv.kind === "AP" ? input.received_date || date : null, terms_days: terms, due_date: input.due_date || addDays(date, terms),
    currency, rate: rateFor(currency, date) ?? "0", reference: input.reference ?? "", notes: input.notes ?? "",
    supplier_invoice_no: inv.kind === "AP" ? (input.supplier_invoice_no ?? "").trim() || null : null,
    duplicate_reason: inv.kind === "AP" ? input.duplicate_reason?.trim() || null : null,
    lines: (input.lines ?? []).map((l, i): InvoiceLine => ({
      id: `${inv.id}-l${i + 1}`, description: l.description ?? "", quantity: l.quantity || "0", unit_price: l.unit_price || "0", discount: l.discount || "0",
      tax_code_id: l.tax_code_id || null, account_id: l.account_id || null, department_id: l.department_id || null, branch_id: l.branch_id || null,
      ...(inv.kind === "AP" ? { is_asset: Boolean(l.is_asset) } : {}),
    })),
  });
  Object.assign(inv, priceDocument(inv, db().taxCodes));
}

function validateLines(lines: InvoiceLine[], date: string, kinds: readonly string[]) {
  const details: { field: string; issue: string; message: string; value?: string }[] = [];
  lines.forEach((l, i) => {
    const n = i + 1;
    const gross = amountOf(l.quantity).times(amountOf(l.unit_price));
    if (!l.description.trim()) details.push({ field: `lines.${i}.description`, issue: "required", message: `Line ${n}: enter a description` });
    if (!amountOf(l.quantity).gt(0)) details.push({ field: `lines.${i}.quantity`, issue: "positive", message: `Line ${n}: quantity must be greater than zero` });
    if (amountOf(l.unit_price).isNegative()) details.push({ field: `lines.${i}.unit_price`, issue: "positive", message: `Line ${n}: the price cannot be negative` });
    if (amountOf(l.discount).isNegative() || amountOf(l.discount).gt(gross)) details.push({ field: `lines.${i}.discount`, issue: "range", message: `Line ${n}: the discount must be between zero and the line amount` });
    const account = db().accounts.find((a) => a.id === l.account_id);
    // Control accounts for receivables, payables, bank and tax are posted by the system only (BR-COA-003).
    if (!account || !account.is_posting || !account.is_active || ["AR", "AP", "BANK", "TAX"].includes(account.control_module ?? "")) {
      details.push({ field: `lines.${i}.account_id`, issue: "invalid", message: `Line ${n}: choose an active posting account` });
    }
    if (l.tax_code_id) {
      const code = db().taxCodes.find((c) => c.id === l.tax_code_id);
      if (!code || !code.is_active || !kinds.includes(code.kind)) details.push({ field: `lines.${i}.tax_code_id`, issue: "invalid", message: `Line ${n}: this tax code cannot be used here` });
      else if (!rateOn(code.rates, date)) details.push({ field: `lines.${i}.tax_code_id`, issue: "no_rate", message: `Line ${n}: ${code.code} has no rate on this date` });
    }
  });
  return details;
}

function validateInvoice(inv: Invoice): Response | null {
  const party = db().parties.find((p) => p.id === inv.party_id && p.kind === CFG[inv.kind].party);
  const details: { field: string; issue: string; message: string; value?: string }[] = [];
  if (!party) details.push({ field: "party_id", issue: "required", message: inv.kind === "AR" ? "Choose a customer" : "Choose a supplier" });
  else if (inv.kind === "AR" && party.status !== "ACTIVE") details.push({ field: "party_id", issue: "inactive", message: "This customer is inactive" });
  else if (inv.kind === "AP" && party.status === "BLOCKED") details.push({ field: "party_id", issue: "blocked", message: "This supplier is blocked" });
  if (!inv.date) details.push({ field: "date", issue: "required", message: "Enter the invoice date" });
  if (inv.kind === "AP" && !inv.supplier_invoice_no) details.push({ field: "supplier_invoice_no", issue: "required", message: "Enter the supplier's invoice number" });
  if (inv.due_date && inv.date && inv.due_date < inv.date) details.push({ field: "due_date", issue: "range", message: "The due date cannot be before the invoice date" });
  if (!inv.lines.length) details.push({ field: "lines", issue: "required", message: "Add at least one line" });
  details.push(...validateLines(inv.lines, inv.date, CFG[inv.kind].taxKinds));
  if (inv.lines.length && !new Decimal(inv.total).gt(0)) details.push({ field: "total", issue: "positive", message: "The invoice total must be greater than zero" });
  if (details.length) return invalid(details);
  if (inv.currency !== "USD" && !rateFor(inv.currency, inv.date)) return rateMissing(inv.currency, inv.date);
  return null;
}

/** BR-AP-001: same supplier and the same invoice number once case, spaces, punctuation and leading zeros are ignored. */
function exactDuplicate(inv: { id?: string; party_id: string; supplier_invoice_no: string | null }) {
  if (!inv.supplier_invoice_no) return undefined;
  const key = normaliseInvoiceNo(inv.supplier_invoice_no);
  return db().invoices.find((o) => o.kind === "AP" && o.id !== inv.id && o.party_id === inv.party_id && o.status !== "CANCELLED" && o.supplier_invoice_no && normaliseInvoiceNo(o.supplier_invoice_no) === key);
}
/** Same supplier, amount and date under another number: allowed with a reason. */
function similarInvoices(inv: { id?: string; party_id: string; supplier_invoice_no: string | null; date: string; total: string }) {
  const key = normaliseInvoiceNo(inv.supplier_invoice_no ?? "");
  return db().invoices.filter((o) => o.kind === "AP" && o.id !== inv.id && o.party_id === inv.party_id && o.status !== "CANCELLED" && o.date === inv.date
    && new Decimal(o.total).eq(inv.total || 0) && normaliseInvoiceNo(o.supplier_invoice_no ?? "") !== key);
}
function duplicateFailure(o: Invoice) {
  return fail(409, "DUPLICATE_SUPPLIER_INVOICE", `Supplier invoice ${o.supplier_invoice_no} is already recorded as ${o.number ?? "a draft"}`, [
    { field: "supplier_invoice_no", issue: "duplicate", value: o.number ?? o.supplier_invoice_no ?? "" },
  ]);
}

function unverifiedTax(lines: InvoiceLine[]): Response | null {
  const bad = lines.map((l) => db().taxCodes.find((c) => c.id === l.tax_code_id)).find((c) => c && c.verification !== "VERIFIED");
  if (!bad || !db().blockUnverifiedTax) return null;
  return fail(422, "TAX_CODE_UNVERIFIED", `Tax code ${bad.code} is not verified`, [{ field: "lines", issue: "unverified", value: bad.code }]);
}

function creditExceeded(inv: Invoice): boolean {
  const party = db().parties.find((p) => p.id === inv.party_id);
  if (!party || party.credit_limit === null) return false;
  const balance = new Decimal(partyDto(party, db().users[0]).balance);
  return balance.plus(inv.total_base).gt(party.credit_limit);
}

function invoiceRoute(inv: Invoice): ApprovalStep[] {
  const steps = [pending(1, "ACCT")];
  if ((inv.kind === "AR" && inv.credit_limit_exceeded) || (inv.kind === "AP" && new Decimal(inv.total_base).gt(AP_SECOND_STEP_ABOVE))) steps.push(pending(2, "FINMGR"));
  return steps;
}

function mayApproveInvoice(inv: Invoice, user: MockUser): boolean {
  const step = inv.approval_steps.find((s) => s.status === "PENDING");
  if (!step || !hasPermission(user.permissions, `${CFG[inv.kind].perm}.approve`)) return false;
  if (step.role === "FINMGR") return isFinMgr(user);
  // A department manager approves supplier invoices of their own departments only (BR-AP-003).
  if (user.roles.includes("DEPTMGR")) return inv.kind === "AP" && inv.lines.every((l) => l.department_id && user.department_ids.includes(l.department_id));
  return true;
}

interface Approvable extends Doc {
  status: string;
  approval_steps: ApprovalStep[];
  preparer_id: string;
  rejection_comment: string | null;
}

/** Approve or reject the pending step (SoD, approval limit, comment on rejection). */
function decide(ctx: Ctx<{ action?: "approve" | "reject"; comment?: string }>, doc: Approvable, may: boolean, amountBase: string, label: string, view: () => unknown) {
  if (doc.status !== "SUBMITTED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", `A ${doc.status} ${label} cannot be approved or rejected.`));
  if (!db().reducedSod && doc.preparer_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", `You prepared this ${label} and cannot approve it`));
  if (!may) return asOutcome(fail(403, "FORBIDDEN", "This step is waiting for another approver."));
  const step = doc.approval_steps.find((s) => s.status === "PENDING")!;
  if (ctx.body?.action === "reject") {
    const comment = ctx.body.comment?.trim();
    if (!comment) return asOutcome(invalid([{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
    Object.assign(step, { status: "REJECTED", approver_name: ctx.user.full_name, acted_at: now(), comment });
    doc.status = "REJECTED";
    doc.rejection_comment = comment;
    log(doc, ctx.user, "REJECTED", comment);
    return { status: 200, body: view() };
  }
  if (ctx.user.approval_limit !== null && new Decimal(amountBase).gt(ctx.user.approval_limit)) {
    return asOutcome(fail(403, "APPROVAL_LIMIT_EXCEEDED", `Amount exceeds your approval limit (${ctx.user.approval_limit})`, [{ field: "total", value: ctx.user.approval_limit }]));
  }
  Object.assign(step, { status: "APPROVED", approver_name: ctx.user.full_name, acted_at: now(), comment: ctx.body?.comment?.trim() || null });
  if (doc.approval_steps.every((s) => s.status === "APPROVED")) doc.status = "APPROVED";
  log(doc, ctx.user, "APPROVED");
  return { status: 200, body: view() };
}

function postInvoice(inv: Invoice, user: MockUser): Response | null {
  const blocked = validateInvoice(inv) ?? checkPeriod(inv.date, "MANUAL", user, "date") ?? unverifiedTax(inv.lines);
  if (blocked) return blocked;
  if (inv.kind === "AP") {
    const dup = exactDuplicate(inv);
    if (dup) return duplicateFailure(dup);
  }
  inv.rate = rateFor(inv.currency, inv.date)!;
  Object.assign(inv, priceDocument(inv, db().taxCodes));
  inv.number = nextNumber(CFG[inv.kind].prefix, inv.date);
  const journal = postJournal(db(), {
    date: inv.date, description: `${inv.kind === "AR" ? "Invoice" : "Supplier invoice"} ${inv.number} — ${inv.party_name}`,
    reference: inv.supplier_invoice_no ?? inv.reference ?? inv.number, source_type: CFG[inv.kind].source, source_no: inv.number,
    lines: invoiceJournalLines(inv, db().taxCodes), user,
  });
  Object.assign(inv, { posted: true, status: "OPEN", journal_id: journal.id, journal_no: journal.journal_no });
  refreshInvoice(inv);
  log(inv, user, "POSTED");
  if (inv.kind === "AP") capitaliseFromInvoice(inv, user);
  return null;
}

function attachmentUrl(file: File): string | undefined {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined;
  } catch {
    return undefined;
  }
}

function invoiceRoutes(kind: "AR" | "AP") {
  const cfg = CFG[kind];
  const find = (ctx: Ctx) => {
    const inv = db().invoices.find((x) => x.kind === kind && x.id === ctx.params.id);
    return inv && canSeeInvoice(inv, ctx.user) ? inv : fail(404, "NOT_FOUND", `The ${cfg.label} was not found.`);
  };
  const routes = [
    route("get", cfg.path, `${cfg.perm}.view`, ({ user, url }) => {
      const q = url.searchParams;
      const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
      const search = (q.get("search") ?? "").toLowerCase();
      const rows = db().invoices
        .filter((x) => x.kind === kind && canSeeInvoice(x, user))
        .map(invoiceView)
        .filter((x) => !statuses.length || statuses.includes(x.status))
        .filter((x) => !q.get("party_id") || x.party_id === q.get("party_id"))
        .filter((x) => q.get("open") !== "true" || (x.posted && new Decimal(x.outstanding).gt(0)))
        .filter((x) => (!q.get("date_from") || x.date >= q.get("date_from")!) && (!q.get("date_to") || x.date <= q.get("date_to")!))
        .filter((x) => !search || `${x.number ?? ""} ${x.supplier_invoice_no ?? ""} ${x.party_code} ${x.party_name} ${x.party_name_km} ${x.reference}`.toLowerCase().includes(search))
        .sort((a, b) => b.date.localeCompare(a.date) || (b.number ?? "~").localeCompare(a.number ?? "~"));
      return paginate(rows, url);
    }),

    route<InvoiceInput>("post", cfg.path, `${cfg.perm}.create`, (ctx) => {
      const inv: Invoice = {
        id: newId(kind === "AR" ? "inv" : "bill"), kind, number: null, supplier_invoice_no: null, party_id: "", party_code: "", party_name: "", party_name_km: "",
        status: "DRAFT", posted: false, date: "", received_date: null, due_date: "", terms_days: 0, currency: "USD", rate: "1", lines: [], subtotal: "0", discount: "0",
        tax: "0", total: "0", total_base: "0", outstanding: "0", settlements: [], reference: "", notes: "", attachments: [], approval_steps: [], rejection_comment: null,
        duplicate_reason: null, is_opening: false, journal_id: null, journal_no: null, preparer_id: ctx.user.id, preparer_name: ctx.user.full_name, history: [], version: 0,
      };
      applyInvoiceInput(inv, ctx.body ?? ({} as InvoiceInput));
      if (kind === "AP") {
        const dup = exactDuplicate(inv);
        if (dup) return duplicateFailure(dup);
      }
      log(inv, ctx.user, "CREATED");
      db().invoices.push(inv);
      return HttpResponse.json(invoiceView(inv), { status: 201 });
    }),

    route<InvoiceInput>("patch", `${cfg.path}/:id`, `${cfg.perm}.edit`, (ctx) => {
      const inv = find(ctx);
      if (inv instanceof Response) return inv;
      if (inv.status !== "DRAFT" && inv.status !== "REJECTED") return fail(409, inv.posted ? "JOURNAL_POSTED" : "INVALID_STATE_TRANSITION", "Only a draft can be edited.");
      const stale = versionConflict(ctx, inv.version);
      if (stale) return stale;
      const before = structuredClone(inv);
      applyInvoiceInput(inv, ctx.body);
      if (kind === "AP") {
        const dup = exactDuplicate(inv);
        if (dup) {
          Object.assign(inv, before);
          return duplicateFailure(dup);
        }
      }
      inv.status = "DRAFT";
      log(inv, ctx.user, "EDITED");
      return HttpResponse.json(invoiceView(inv));
    }),

    route("post", `${cfg.path}/:id/submit`, `${cfg.perm}.submit`, (ctx) => {
      const inv = find(ctx);
      if (inv instanceof Response) return inv;
      if (inv.status !== "DRAFT" && inv.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be submitted.");
      const bad = validateInvoice(inv) ?? checkPeriod(inv.date, "MANUAL", ctx.user, "date");
      if (bad) return bad;
      if (kind === "AP") {
        const dup = exactDuplicate(inv);
        if (dup) return duplicateFailure(dup);
        const similar = similarInvoices(inv);
        if (similar.length && !inv.duplicate_reason) {
          return invalid([{ field: "duplicate_reason", issue: "possible_duplicate", message: `Possible duplicate of ${similar[0].number ?? similar[0].supplier_invoice_no}: give a reason to continue`, value: similar[0].number ?? similar[0].supplier_invoice_no ?? "" }]);
        }
      }
      inv.rate = rateFor(inv.currency, inv.date)!;
      Object.assign(inv, priceDocument(inv, db().taxCodes));
      inv.credit_limit_exceeded = kind === "AR" ? creditExceeded(inv) : false;
      inv.status = "SUBMITTED";
      inv.rejection_comment = null;
      inv.approval_steps = invoiceRoute(inv);
      log(inv, ctx.user, "SUBMITTED", inv.duplicate_reason ? `Possible duplicate: ${inv.duplicate_reason}` : inv.credit_limit_exceeded ? "Credit limit exceeded: Finance Manager override required" : null);
      return HttpResponse.json(invoiceView(inv));
    }),

    route("post", `${cfg.path}/:id/recall`, `${cfg.perm}.submit`, (ctx) => {
      const inv = find(ctx);
      if (inv instanceof Response) return inv;
      if (inv.status !== "SUBMITTED" || inv.preparer_id !== ctx.user.id) return fail(409, "INVALID_STATE_TRANSITION", "Only the preparer can recall a submitted invoice.");
      inv.status = "DRAFT";
      inv.approval_steps = [];
      log(inv, ctx.user, "RECALLED");
      return HttpResponse.json(invoiceView(inv));
    }),

    // BR-AR-001: cancel from Draft or Approved (and Rejected); posted invoices need a credit note.
    route<{ reason?: string }>("post", `${cfg.path}/:id/cancel`, `${cfg.perm}.edit`, (ctx) => {
      const inv = find(ctx);
      if (inv instanceof Response) return inv;
      if (!["DRAFT", "REJECTED", "APPROVED"].includes(inv.status)) return fail(409, inv.posted ? "JOURNAL_POSTED" : "INVALID_STATE_TRANSITION", "Only an unposted invoice can be cancelled.");
      inv.status = "CANCELLED";
      log(inv, ctx.user, "CANCELLED", ctx.body?.reason ?? null);
      return HttpResponse.json(invoiceView(inv));
    }),

    route<{ action: "approve" | "reject"; comment?: string }>("post", `${cfg.path}/:id/approve`, `${cfg.perm}.approve`, (ctx) =>
      idempotent(ctx, () => {
        const inv = find(ctx);
        if (inv instanceof Response) return asOutcome(inv);
        return decide(ctx, inv, mayApproveInvoice(inv, ctx.user), inv.total_base, cfg.label, () => invoiceView(inv));
      }),
    ),

    route("post", `${cfg.path}/:id/post`, `${cfg.perm}.post`, (ctx) =>
      idempotent(ctx, () => {
        const inv = find(ctx);
        if (inv instanceof Response) return asOutcome(inv);
        if (inv.posted) return asOutcome(fail(409, "ALREADY_POSTED", `${inv.number} is already posted.`, [{ field: "number", value: inv.number ?? "" }]));
        if (inv.status !== "APPROVED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", `The ${cfg.label} must be approved first.`));
        const bad = postInvoice(inv, ctx.user);
        return bad ? asOutcome(bad) : { status: 200, body: invoiceView(inv) };
      }),
    ),

    route("post", `${cfg.path}/:id/attachments`, `${cfg.perm}.edit`, async (ctx) => {
      const inv = find(ctx);
      if (inv instanceof Response) return inv;
      if (inv.posted || inv.status === "CANCELLED") return fail(409, "JOURNAL_POSTED", "Posted invoices cannot be changed.");
      const file = (await ctx.request.formData()).get("file");
      if (!(file instanceof File)) return invalid([{ field: "file", issue: "required", message: "A file is required." }]);
      inv.attachments.push({ id: newId("att"), file_name: file.name, content_type: file.type, size: file.size, uploaded_at: now(), uploaded_by: ctx.user.full_name, url: attachmentUrl(file) });
      log(inv, ctx.user, "ATTACHMENT_ADDED", file.name);
      return HttpResponse.json(invoiceView(inv), { status: 201 });
    }),

    route("delete", `${cfg.path}/:id/attachments/:attachmentId`, `${cfg.perm}.edit`, (ctx) => {
      const inv = find(ctx);
      if (inv instanceof Response) return inv;
      if (inv.posted) return fail(409, "JOURNAL_POSTED", "Posted invoices cannot be changed.");
      inv.attachments = inv.attachments.filter((a) => a.id !== ctx.params.attachmentId);
      log(inv, ctx.user, "ATTACHMENT_REMOVED");
      return HttpResponse.json(invoiceView(inv));
    }),
  ];
  // Registered before "/:id" so that "duplicate-check" is not read as an id.
  const head = [
    route("get", `${cfg.path}/:id`, `${cfg.perm}.view`, (ctx) => {
      const inv = find(ctx);
      return inv instanceof Response ? inv : HttpResponse.json(invoiceView(inv));
    }),
  ];
  if (kind === "AP") {
    // ASSUMPTION: the check on blur of the supplier invoice number (SCR-11); not listed in SRS §13.3.
    head.unshift(route("get", `${cfg.path}/duplicate-check`, "ap.invoice.view", ({ url }) => {
      const q = url.searchParams;
      const probe = { id: q.get("exclude_id") ?? undefined, party_id: q.get("party_id") ?? "", supplier_invoice_no: q.get("supplier_invoice_no"), date: q.get("date") ?? "", total: q.get("total") ?? "0" };
      const exact = exactDuplicate(probe);
      const similar = probe.date && amountOf(probe.total).gt(0) ? similarInvoices(probe) : [];
      const result: DuplicateCheck = {
        exact: exact ? { id: exact.id, number: exact.number, supplier_invoice_no: exact.supplier_invoice_no ?? "", date: exact.date, status: invoiceView(exact).status, posted_at: exact.posted ? exact.date : null } : null,
        similar: similar.map((s) => ({ id: s.id, number: s.number, supplier_invoice_no: s.supplier_invoice_no ?? "", date: s.date, total: s.total })),
      };
      return HttpResponse.json(result);
    }));
  }
  return [...head, ...routes];
}

// ---------------------------------------------------------------- credit notes

function findCreditNote(ctx: Ctx) {
  return db().creditNotes.find((c) => c.id === ctx.params.id) ?? fail(404, "NOT_FOUND", "Credit note not found.");
}

function applyCreditInput(cn: CreditNote, input: { date?: string; reason?: string; lines?: InvoiceLine[] }, inv: Invoice) {
  cn.date = input.date ?? cn.date;
  cn.reason = input.reason ?? "";
  cn.lines = (input.lines ?? []).map((l, i) => ({
    id: `${cn.id}-l${i + 1}`, description: l.description ?? "", quantity: l.quantity || "0", unit_price: l.unit_price || "0", discount: l.discount || "0",
    tax_code_id: l.tax_code_id || null, account_id: l.account_id || "acc-4900", department_id: l.department_id || null, branch_id: l.branch_id || null,
  }));
  // Tax at the rates of the original invoice date, so the credit mirrors what was charged (BR-TAX-001).
  const priced = priceDocument({ lines: cn.lines, date: inv.date, currency: inv.currency, rate: inv.rate }, db().taxCodes);
  Object.assign(cn, { subtotal: priced.subtotal, tax: priced.tax, total: priced.total });
}

function validateCreditNote(cn: CreditNote, inv: Invoice): Response | null {
  const details = validateLines(cn.lines, inv.date, CFG.AR.taxKinds);
  if (!cn.date) details.unshift({ field: "date", issue: "required", message: "Enter the credit note date" });
  if (!cn.reason.trim()) details.unshift({ field: "reason", issue: "required", message: "Enter the reason" });
  if (!cn.lines.length) details.push({ field: "lines", issue: "required", message: "Add at least one line" });
  if (cn.lines.length && !new Decimal(cn.total).gt(0)) details.push({ field: "total", issue: "positive", message: "The credit total must be greater than zero" });
  if (details.length) return invalid(details);
  if (new Decimal(cn.total).gt(inv.outstanding)) {
    return fail(422, "ALLOCATION_EXCEEDS_BALANCE", `The credit (${cn.total}) is more than the invoice's outstanding ${inv.outstanding}`, [{ field: "total", issue: "exceeds", value: inv.outstanding }]);
  }
  return null;
}

const creditRoutes = [
  route("get", "/customer-credit-notes", "ar.credit_note.view", ({ url }) => {
    const q = url.searchParams;
    const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
    const search = (q.get("search") ?? "").toLowerCase();
    const rows = db().creditNotes
      .filter((c) => (!statuses.length || statuses.includes(c.status)) && (!q.get("invoice_id") || c.invoice_id === q.get("invoice_id")) && (!q.get("party_id") || c.party_id === q.get("party_id")))
      .filter((c) => !search || `${c.number ?? ""} ${c.invoice_number} ${c.party_name} ${c.reason}`.toLowerCase().includes(search))
      .sort((a, b) => b.date.localeCompare(a.date));
    return paginate(rows, url);
  }),

  route<{ invoice_id: string; date: string; reason: string; lines: InvoiceLine[] }>("post", "/customer-credit-notes", "ar.credit_note.create", (ctx) => {
    const inv = db().invoices.find((x) => x.kind === "AR" && x.id === ctx.body?.invoice_id);
    if (!inv || !inv.posted) return invalid([{ field: "invoice_id", issue: "required", message: "Choose a posted invoice" }]);
    if (!new Decimal(inv.outstanding).gt(0)) return fail(409, "INVALID_STATE_TRANSITION", "This invoice has nothing outstanding to credit.");
    const cn: CreditNote = {
      id: newId("cn"), number: null, invoice_id: inv.id, invoice_number: inv.number ?? "", party_id: inv.party_id, party_name: inv.party_name, date: "", reason: "",
      currency: inv.currency, lines: [], subtotal: "0", tax: "0", total: "0", status: "DRAFT", approval_steps: [], rejection_comment: null, journal_id: null, journal_no: null,
      preparer_id: ctx.user.id, preparer_name: ctx.user.full_name, history: [], version: 0,
    };
    applyCreditInput(cn, ctx.body, inv);
    log(cn, ctx.user, "CREATED");
    db().creditNotes.push(cn);
    return HttpResponse.json(cn, { status: 201 });
  }),

  route("get", "/customer-credit-notes/:id", "ar.credit_note.view", (ctx) => {
    const cn = findCreditNote(ctx);
    return cn instanceof Response ? cn : HttpResponse.json(cn);
  }),

  route<{ date: string; reason: string; lines: InvoiceLine[] }>("patch", "/customer-credit-notes/:id", "ar.credit_note.create", (ctx) => {
    const cn = findCreditNote(ctx);
    if (cn instanceof Response) return cn;
    if (cn.status !== "DRAFT" && cn.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be edited.");
    const stale = versionConflict(ctx, cn.version);
    if (stale) return stale;
    applyCreditInput(cn, ctx.body, db().invoices.find((x) => x.id === cn.invoice_id)!);
    cn.status = "DRAFT";
    log(cn, ctx.user, "EDITED");
    return HttpResponse.json(cn);
  }),

  route("post", "/customer-credit-notes/:id/submit", "ar.credit_note.submit", (ctx) => {
    const cn = findCreditNote(ctx);
    if (cn instanceof Response) return cn;
    if (cn.status !== "DRAFT" && cn.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be submitted.");
    const inv = db().invoices.find((x) => x.id === cn.invoice_id)!;
    const bad = validateCreditNote(cn, inv) ?? checkPeriod(cn.date, "MANUAL", ctx.user, "date");
    if (bad) return bad;
    // BR-AR-005: approved by a user other than the preparer.
    cn.status = "SUBMITTED";
    cn.rejection_comment = null;
    cn.approval_steps = [pending(1, "FINMGR")];
    log(cn, ctx.user, "SUBMITTED");
    return HttpResponse.json(cn);
  }),

  route("post", "/customer-credit-notes/:id/cancel", "ar.credit_note.create", (ctx) => {
    const cn = findCreditNote(ctx);
    if (cn instanceof Response) return cn;
    if (!["DRAFT", "REJECTED", "APPROVED"].includes(cn.status)) return fail(409, "INVALID_STATE_TRANSITION", "Only an unposted credit note can be cancelled.");
    cn.status = "CANCELLED";
    log(cn, ctx.user, "CANCELLED");
    return HttpResponse.json(cn);
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/customer-credit-notes/:id/approve", "ar.credit_note.approve", (ctx) =>
    idempotent(ctx, () => {
      const cn = findCreditNote(ctx);
      if (cn instanceof Response) return asOutcome(cn);
      const inv = db().invoices.find((x) => x.id === cn.invoice_id)!;
      return decide(ctx, cn, isFinMgr(ctx.user), baseOf(cn.total, inv.rate).toFixed(2), "credit note", () => cn);
    }),
  ),

  route("post", "/customer-credit-notes/:id/post", "ar.credit_note.post", (ctx) =>
    idempotent(ctx, () => {
      const cn = findCreditNote(ctx);
      if (cn instanceof Response) return asOutcome(cn);
      if (cn.status === "POSTED") return asOutcome(fail(409, "ALREADY_POSTED", `${cn.number} is already posted.`, [{ field: "number", value: cn.number ?? "" }]));
      if (cn.status !== "APPROVED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "The credit note must be approved first."));
      const inv = db().invoices.find((x) => x.id === cn.invoice_id)!;
      const bad = validateCreditNote(cn, inv) ?? checkPeriod(cn.date, "MANUAL", ctx.user, "date") ?? unverifiedTax(cn.lines);
      if (bad) return asOutcome(bad);
      cn.number = nextNumber("CN", cn.date);
      const journal = postJournal(db(), {
        date: cn.date, description: `Credit note ${cn.number} — ${inv.party_name}`, reference: inv.number ?? "", source_type: "AR_CREDIT_NOTE", source_no: cn.number,
        lines: creditNoteJournalLines(cn, inv, db().taxCodes), user: ctx.user,
      });
      Object.assign(cn, { status: "POSTED", journal_id: journal.id, journal_no: journal.journal_no });
      inv.settlements.push({ doc_type: "CREDIT_NOTE", doc_id: cn.id, number: cn.number, date: cn.date, amount: cn.total });
      refreshInvoice(inv);
      log(inv, ctx.user, "CREDITED", cn.number);
      log(cn, ctx.user, "POSTED");
      return { status: 200, body: cn };
    }),
  ),
];

// ---------------------------------------------------------------- receipts and payments

function canSeePayment(p: PartyPayment, user: MockUser): boolean {
  if (user.roles.includes("CASHIER")) return p.preparer_id === user.id || user.cash_account_ids.includes(p.account_id);
  return true;
}

function applyPaymentInput(p: PartyPayment, input: PartyPaymentInput) {
  const party = db().parties.find((x) => x.id === input.party_id && x.kind === (p.kind === "RECEIPT" ? "CUSTOMER" : "SUPPLIER"));
  const currency = party?.currency ?? "USD";
  const amount = amountOf(input.amount);
  const allocations: AllocationLine[] = (input.allocations ?? [])
    .filter((a) => amountOf(a.amount).gt(0) || amountOf(a.amount).isNegative())
    .map((a) => ({ invoice_id: a.invoice_id, invoice_number: db().invoices.find((x) => x.id === a.invoice_id)?.number ?? "", amount: money(amountOf(a.amount), currency) }));
  const allocated = allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0));
  Object.assign(p, {
    party_id: input.party_id ?? "", party_name: party?.name ?? "", party_name_km: party?.name_km ?? "", date: input.date ?? "", account_id: input.account_id ?? "",
    method: input.method || "BANK_TRANSFER", currency, amount: amount.isNaN() ? "0" : money(amount, currency), rate: rateFor(currency, input.date ?? "") ?? "0",
    reference: input.reference ?? "", allocations,
    unapplied: money(p.kind === "RECEIPT" && amount.minus(allocated).gt(0) ? amount.minus(allocated) : 0, currency),
  });
}

/** Allocation limits (BR-AR-003, BR-AP-006): each ≤ the invoice's outstanding; together ≤ the amount. */
function checkAllocations(allocations: AllocationLine[], partyId: string, kind: "AR" | "AP", currency: string, available: Decimal): Response | null {
  const details: { field: string; issue: string; message: string; value?: string }[] = [];
  const seen = new Set<string>();
  for (const [i, a] of allocations.entries()) {
    const inv = db().invoices.find((x) => x.id === a.invoice_id && x.kind === kind && x.party_id === partyId && x.posted);
    if (!inv || inv.currency !== currency || seen.has(a.invoice_id)) {
      details.push({ field: `allocations.${i}.invoice_id`, issue: "invalid", message: `Allocation ${i + 1}: choose an open invoice of this ${kind === "AR" ? "customer" : "supplier"} in ${currency}` });
      continue;
    }
    seen.add(a.invoice_id);
    if (!new Decimal(a.amount).gt(0)) details.push({ field: `allocations.${i}.amount`, issue: "positive", message: `Allocation ${i + 1}: the amount must be greater than zero` });
    else if (new Decimal(a.amount).gt(inv.outstanding)) {
      return fail(422, "ALLOCATION_EXCEEDS_BALANCE", `Allocation of ${a.amount} to ${inv.number} is more than its outstanding ${inv.outstanding}`, [
        { field: `allocations.${i}.amount`, issue: "exceeds_invoice", value: inv.outstanding },
      ]);
    }
  }
  if (details.length) return invalid(details);
  const total = allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0));
  if (total.gt(available)) {
    return fail(422, "ALLOCATION_EXCEEDS_BALANCE", `Allocations total ${total.toFixed(dpOf(currency))}, more than the ${available.toFixed(dpOf(currency))} available`, [
      { field: "amount", issue: "exceeds_amount", value: available.toFixed(dpOf(currency)) },
    ]);
  }
  return null;
}

/** BR-AP-004 / BR-AP-005: pay verified suppliers only, and not while a bank-details change waits. */
function supplierPayable(partyId: string): Response | null {
  const s = db().parties.find((x) => x.id === partyId && x.kind === "SUPPLIER");
  if (!s) return invalid([{ field: "party_id", issue: "required", message: "Choose a supplier" }]);
  if (s.status !== "VERIFIED") return fail(422, "SUPPLIER_NOT_VERIFIED", `${s.name} is not verified (${s.status.toLowerCase()})`, [{ field: "party_id", issue: s.status.toLowerCase(), value: s.status }]);
  if (!s.bank) return fail(422, "SUPPLIER_NOT_VERIFIED", `${s.name} has no bank details`, [{ field: "party_id", issue: "no_bank" }]);
  if (s.bank.pending) return fail(422, "SUPPLIER_NOT_VERIFIED", `A change to ${s.name}'s bank details is waiting for approval`, [{ field: "party_id", issue: "bank_pending" }]);
  return null;
}

function validatePayment(p: PartyPayment, user: MockUser): Response | null {
  const details: { field: string; issue: string; message: string }[] = [];
  const party = db().parties.find((x) => x.id === p.party_id && x.kind === (p.kind === "RECEIPT" ? "CUSTOMER" : "SUPPLIER"));
  if (!party) details.push({ field: "party_id", issue: "required", message: p.kind === "RECEIPT" ? "Choose a customer" : "Choose a supplier" });
  if (!p.date) details.push({ field: "date", issue: "required", message: "Enter the date" });
  const account = visibleCashBankAccounts(user).find((a) => a.id === p.account_id);
  if (!account) details.push({ field: "account_id", issue: "required", message: "Choose the cash or bank account" });
  else if (account.currency !== p.currency) details.push({ field: "account_id", issue: "currency", message: `Choose an account in ${p.currency}` });
  if (!new Decimal(p.amount).gt(0)) details.push({ field: "amount", issue: "positive", message: "The amount must be greater than zero" });
  if (details.length) return invalid(details);
  const limits = checkAllocations(p.allocations, p.party_id, p.kind === "RECEIPT" ? "AR" : "AP", p.currency, new Decimal(p.amount));
  if (limits) return limits;
  // ASSUMPTION: supplier advances are out of scope in Phase 4, so a payment is fully allocated.
  if (p.kind === "PAYMENT" && !p.allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0)).eq(p.amount)) {
    return invalid([{ field: "amount", issue: "allocation_total", message: "Allocate the full payment amount to the supplier's invoices" }]);
  }
  if (p.currency !== "USD" && !rateFor(p.currency, p.date)) return rateMissing(p.currency, p.date);
  return null;
}

function settle(p: PartyPayment, user: MockUser, prefix: "RV" | "SPV") {
  const account = db().cashBankAccounts.find((a) => a.id === p.account_id)!;
  p.rate = rateFor(p.currency, p.date)!;
  const number = nextNumber(prefix, p.date);
  const allocations = p.allocations.map((a) => ({ invoice: db().invoices.find((x) => x.id === a.invoice_id)!, amount: a.amount }));
  const journal = postJournal(db(), {
    date: p.date, description: `${p.kind === "RECEIPT" ? "Receipt" : "Supplier payment"} ${number} — ${p.party_name}`, reference: p.bank_reference || p.reference || number,
    source_type: p.kind === "RECEIPT" ? "AR_RECEIPT" : "AP_PAYMENT", source_no: number,
    lines: settlementJournalLines({ ...p, number }, account.gl_account_id, allocations, p.unapplied), user,
  });
  Object.assign(p, { number, journal_id: journal.id, journal_no: journal.journal_no });
  for (const a of allocations) {
    a.invoice.settlements.push({ doc_type: p.kind, doc_id: p.id, number, date: p.date, amount: a.amount });
    refreshInvoice(a.invoice);
  }
}

const blankPayment = (kind: "RECEIPT" | "PAYMENT", user: MockUser): PartyPayment => ({
  id: newId(kind === "RECEIPT" ? "rcp" : "spv"), kind, number: null, party_id: "", party_name: "", party_name_km: "", date: "", account_id: "", method: "BANK_TRANSFER",
  currency: "USD", amount: "0", rate: "1", reference: "", allocations: [], unapplied: "0", status: "DRAFT", bank_reference: null, released_by: null, released_at: null,
  pay_to: null, approval_steps: [], rejection_comment: null, journal_id: null, journal_no: null, preparer_id: user.id, preparer_name: user.full_name, history: [], version: 0,
});

function paymentList(kind: "RECEIPT" | "PAYMENT") {
  return ({ user, url }: Ctx) => {
    const q = url.searchParams;
    const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
    const search = (q.get("search") ?? "").toLowerCase();
    const rows = db().partyPayments
      .filter((p) => p.kind === kind && canSeePayment(p, user) && (!statuses.length || statuses.includes(p.status)))
      .filter((p) => (!q.get("party_id") || p.party_id === q.get("party_id")) && (!q.get("date_from") || p.date >= q.get("date_from")!) && (!q.get("date_to") || p.date <= q.get("date_to")!))
      .filter((p) => !search || `${p.number ?? ""} ${p.party_name} ${p.party_name_km} ${p.reference} ${p.bank_reference ?? ""}`.toLowerCase().includes(search))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.number ?? "~").localeCompare(a.number ?? "~"));
    return paginate(rows.map((p) => paymentView(p, user)), url);
  };
}

function paymentView(p: PartyPayment, user: MockUser): PartyPayment {
  const unmask = hasPermission(user.permissions, "ap.supplier.bank.view");
  return p.pay_to && !unmask ? { ...p, pay_to: { ...p.pay_to, account_number: mask(p.pay_to.account_number) } } : p;
}

function findPayment(ctx: Ctx, kind: "RECEIPT" | "PAYMENT") {
  const p = db().partyPayments.find((x) => x.kind === kind && x.id === ctx.params.id);
  return p && canSeePayment(p, ctx.user) ? p : fail(404, "NOT_FOUND", `${kind === "RECEIPT" ? "Receipt" : "Payment"} not found.`);
}

const receiptRoutes = [
  route("get", "/customer-receipts", "ar.receipt.view", (ctx) => paymentList("RECEIPT")(ctx)),

  // SRS §13.3: one call records a receipt as a draft, or records and posts it (post = true).
  route<PartyPaymentInput & { post?: boolean }>("post", "/customer-receipts", "ar.receipt.create", (ctx) =>
    idempotent(ctx, () => {
      if (ctx.body?.post && !hasPermission(ctx.user.permissions, "ar.receipt.post")) return asOutcome(fail(403, "FORBIDDEN", "Permission ar.receipt.post is required."));
      const p = blankPayment("RECEIPT", ctx.user);
      applyPaymentInput(p, ctx.body ?? ({} as PartyPaymentInput));
      if (ctx.body?.post) {
        const bad = validatePayment(p, ctx.user) ?? checkPeriod(p.date, "MANUAL", ctx.user, "date");
        if (bad) return asOutcome(bad);
        log(p, ctx.user, "CREATED");
        settle(p, ctx.user, "RV");
        p.status = "POSTED";
        log(p, ctx.user, "POSTED");
      } else log(p, ctx.user, "CREATED");
      db().partyPayments.push(p);
      return { status: 201, body: p };
    }),
  ),

  route("get", "/customer-receipts/:id", "ar.receipt.view", (ctx) => {
    const p = findPayment(ctx, "RECEIPT");
    return p instanceof Response ? p : HttpResponse.json(p);
  }),

  route<PartyPaymentInput>("patch", "/customer-receipts/:id", "ar.receipt.create", (ctx) => {
    const p = findPayment(ctx, "RECEIPT");
    if (p instanceof Response) return p;
    if (p.status !== "DRAFT") return fail(409, p.status === "POSTED" ? "JOURNAL_POSTED" : "INVALID_STATE_TRANSITION", "Only a draft can be edited.");
    const stale = versionConflict(ctx, p.version);
    if (stale) return stale;
    applyPaymentInput(p, ctx.body);
    log(p, ctx.user, "EDITED");
    return HttpResponse.json(p);
  }),

  route("post", "/customer-receipts/:id/post", "ar.receipt.post", (ctx) =>
    idempotent(ctx, () => {
      const p = findPayment(ctx, "RECEIPT");
      if (p instanceof Response) return asOutcome(p);
      if (p.status === "POSTED") return asOutcome(fail(409, "ALREADY_POSTED", `${p.number} is already posted.`, [{ field: "number", value: p.number ?? "" }]));
      if (p.status !== "DRAFT") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "Only a draft receipt can be posted."));
      const bad = validatePayment(p, ctx.user) ?? checkPeriod(p.date, "MANUAL", ctx.user, "date");
      if (bad) return asOutcome(bad);
      settle(p, ctx.user, "RV");
      p.status = "POSTED";
      log(p, ctx.user, "POSTED");
      return { status: 200, body: p };
    }),
  ),

  route("post", "/customer-receipts/:id/cancel", "ar.receipt.create", (ctx) => {
    const p = findPayment(ctx, "RECEIPT");
    if (p instanceof Response) return p;
    if (p.status !== "DRAFT") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft receipt can be cancelled.");
    p.status = "CANCELLED";
    log(p, ctx.user, "CANCELLED");
    return HttpResponse.json(p);
  }),

  // Apply a posted receipt's unapplied amount to invoices (FR-AR-011): Dr customer advances, Cr AR.
  route<{ allocations: AllocationLine[]; date?: string }>("post", "/customer-receipts/:id/allocate", "ar.receipt.allocate", (ctx) =>
    idempotent(ctx, () => {
      const p = findPayment(ctx, "RECEIPT");
      if (p instanceof Response) return asOutcome(p);
      if (p.status !== "POSTED" || !new Decimal(p.unapplied).gt(0)) return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "Only a posted receipt with an unapplied amount can be allocated."));
      const date = ctx.body?.date || MOCK_TODAY;
      const allocations = (ctx.body?.allocations ?? []).filter((a) => amountOf(a.amount).gt(0)).map((a) => ({ invoice_id: a.invoice_id, amount: money(a.amount, p.currency) }));
      if (!allocations.length) return asOutcome(invalid([{ field: "allocations", issue: "required", message: "Allocate an amount to at least one invoice" }]));
      const bad = checkAllocations(allocations, p.party_id, "AR", p.currency, new Decimal(p.unapplied)) ?? checkPeriod(date, "MANUAL", ctx.user, "date");
      if (bad) return asOutcome(bad);
      const rows = allocations.map((a) => ({ invoice: db().invoices.find((x) => x.id === a.invoice_id)!, amount: a.amount }));
      const ref = `${p.number}-A${p.history.filter((h) => h.action === "ALLOCATED").length + 1}`;
      const journal = postJournal(db(), {
        date, description: `Receipt ${p.number} applied — ${p.party_name}`, reference: p.number ?? "", source_type: "AR_RECEIPT", source_no: ref,
        lines: settlementJournalLines({ ...p, number: p.number ?? ref }, "", rows, "0", true), user: ctx.user,
      });
      for (const r of rows) {
        r.invoice.settlements.push({ doc_type: "RECEIPT", doc_id: p.id, number: p.number ?? ref, date, amount: r.amount });
        refreshInvoice(r.invoice);
        const existing = p.allocations.find((a) => a.invoice_id === r.invoice.id);
        if (existing) existing.amount = money(new Decimal(existing.amount).plus(r.amount), p.currency);
        else p.allocations.push({ invoice_id: r.invoice.id, invoice_number: r.invoice.number ?? "", amount: r.amount });
      }
      p.unapplied = money(new Decimal(p.unapplied).minus(rows.reduce((s, r) => s.plus(r.amount), new Decimal(0))), p.currency);
      log(p, ctx.user, "ALLOCATED", journal.journal_no);
      return { status: 200, body: p };
    }),
  ),
];

const paymentRoutes = [
  route("get", "/supplier-payments", "ap.payment.view", (ctx) => paymentList("PAYMENT")(ctx)),

  route<PartyPaymentInput>("post", "/supplier-payments", "ap.payment.create", (ctx) => {
    const p = blankPayment("PAYMENT", ctx.user);
    applyPaymentInput(p, ctx.body ?? ({} as PartyPaymentInput));
    const s = db().parties.find((x) => x.id === p.party_id && x.kind === "SUPPLIER");
    if (s && s.status !== "VERIFIED") return supplierPayable(p.party_id)!;
    log(p, ctx.user, "CREATED");
    db().partyPayments.push(p);
    return HttpResponse.json(paymentView(p, ctx.user), { status: 201 });
  }),

  route("get", "/supplier-payments/:id", "ap.payment.view", (ctx) => {
    const p = findPayment(ctx, "PAYMENT");
    return p instanceof Response ? p : HttpResponse.json(paymentView(p, ctx.user));
  }),

  route<PartyPaymentInput>("patch", "/supplier-payments/:id", "ap.payment.create", (ctx) => {
    const p = findPayment(ctx, "PAYMENT");
    if (p instanceof Response) return p;
    if (p.status !== "DRAFT" && p.status !== "REJECTED") return fail(409, p.status === "PAID" ? "JOURNAL_POSTED" : "INVALID_STATE_TRANSITION", "Only a draft can be edited.");
    const stale = versionConflict(ctx, p.version);
    if (stale) return stale;
    applyPaymentInput(p, ctx.body);
    p.status = "DRAFT";
    log(p, ctx.user, "EDITED");
    return HttpResponse.json(paymentView(p, ctx.user));
  }),

  route("post", "/supplier-payments/:id/submit", "ap.payment.submit", (ctx) => {
    const p = findPayment(ctx, "PAYMENT");
    if (p instanceof Response) return p;
    if (p.status !== "DRAFT" && p.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be submitted.");
    const bad = validatePayment(p, ctx.user) ?? supplierPayable(p.party_id) ?? checkPeriod(p.date, "MANUAL", ctx.user, "date");
    if (bad) return bad;
    p.status = "SUBMITTED";
    p.rejection_comment = null;
    p.approval_steps = [pending(1, "FINMGR")];
    log(p, ctx.user, "SUBMITTED");
    return HttpResponse.json(paymentView(p, ctx.user));
  }),

  route("post", "/supplier-payments/:id/cancel", "ap.payment.create", (ctx) => {
    const p = findPayment(ctx, "PAYMENT");
    if (p instanceof Response) return p;
    if (!["DRAFT", "REJECTED", "APPROVED"].includes(p.status)) return fail(409, "INVALID_STATE_TRANSITION", "Only an unreleased payment can be cancelled.");
    p.status = "CANCELLED";
    log(p, ctx.user, "CANCELLED");
    return HttpResponse.json(paymentView(p, ctx.user));
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/supplier-payments/:id/approve", "ap.payment.approve", (ctx) =>
    idempotent(ctx, () => {
      const p = findPayment(ctx, "PAYMENT");
      if (p instanceof Response) return asOutcome(p);
      if (ctx.body?.action !== "reject") {
        const blocked = supplierPayable(p.party_id);
        if (blocked && p.status === "SUBMITTED") return asOutcome(blocked);
      }
      return decide(ctx, p, isFinMgr(ctx.user), baseOf(p.amount, rateFor(p.currency, p.date) ?? p.rate).toFixed(2), "payment", () => paymentView(p, ctx.user));
    }),
  ),

  // BR-AP-004, AT-AP-02, AT-AP-04: approved payments only, once. The same Idempotency-Key replays the
  // first answer; a new key after release answers ALREADY_RELEASED.
  route<{ bank_reference?: string }>("post", "/supplier-payments/:id/release", "ap.payment.release", (ctx) =>
    idempotent(ctx, () => {
      const p = findPayment(ctx, "PAYMENT");
      if (p instanceof Response) return asOutcome(p);
      if (p.status === "PAID") return asOutcome(fail(409, "ALREADY_RELEASED", `${p.number} was already released.`, [{ field: "number", value: p.number ?? "" }]));
      if (p.status !== "APPROVED") return asOutcome(fail(409, "PAYMENT_NOT_APPROVED", "Payment must be approved before release", [{ field: "status", value: p.status }]));
      if (!db().reducedSod && p.preparer_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You prepared this payment and cannot release it"));
      const reference = ctx.body?.bank_reference?.trim() ?? "";
      if (p.method !== "CASH" && !reference) return asOutcome(invalid([{ field: "bank_reference", issue: "required", message: "Enter the bank reference" }]));
      const bad = supplierPayable(p.party_id) ?? validatePayment(p, ctx.user) ?? checkPeriod(p.date, "MANUAL", ctx.user, "date");
      if (bad) return asOutcome(bad);
      const account = db().cashBankAccounts.find((a) => a.id === p.account_id)!;
      const short = insufficient(account, new Decimal(p.amount));
      if (short) return asOutcome(short);
      const supplier = db().parties.find((x) => x.id === p.party_id)!;
      p.bank_reference = reference || null;
      settle(p, ctx.user, "SPV");
      Object.assign(p, {
        status: "PAID", released_by: ctx.user.full_name, released_at: now(),
        pay_to: supplier.bank ? { bank_name: supplier.bank.bank_name, account_number: supplier.bank.account_number } : null,
      });
      log(p, ctx.user, "RELEASED", reference || null);
      return { status: 200, body: paymentView(p, ctx.user) };
    }),
  ),
];

// ---------------------------------------------------------------- aging and approvals

function agingReport(kind: "AR" | "AP", asOf: string): AgingReport {
  const partyKind = kind === "AR" ? "CUSTOMER" : "SUPPLIER";
  const totals = emptyBuckets();
  const rows = db().parties
    .filter((p) => p.kind === partyKind)
    .map((p) => ({ p, b: agingFor(p.id, asOf) }))
    .filter(({ b }) => !b.total.isZero())
    .map(({ p, b }) => {
      for (const k of Object.keys(totals) as (keyof AgingBuckets)[]) totals[k] = totals[k].plus(b[k]);
      return { party_id: p.id, code: p.code, name: p.name, name_km: p.name_km, ...fixBuckets(b) };
    })
    .sort((a, b) => new Decimal(b.total).cmp(a.total));
  const controlId = kind === "AR" ? AR_CONTROL : AP_CONTROL;
  const raw = accountBalance(db(), controlId, asOf).base;
  const control = kind === "AR" ? raw : raw.negated();
  return {
    kind, as_of: asOf, currency: "USD", rows, totals: fixBuckets(totals),
    control: { account_code: kind === "AR" ? "1200" : "2100", balance: control.toFixed(2), difference: control.minus(totals.total).toFixed(2) },
  };
}

const reportRoutes = [
  route("get", "/reports/ar-aging", "rpt.ar_aging", ({ url }) => HttpResponse.json(agingReport("AR", url.searchParams.get("as_of") || MOCK_TODAY))),
  route("get", "/reports/ap-aging", "rpt.ap_aging", ({ url }) => HttpResponse.json(agingReport("AP", url.searchParams.get("as_of") || MOCK_TODAY))),
];

const submittedAt = (d: Doc) => [...d.history].reverse().find((h) => h.action === "SUBMITTED")?.at ?? now();

export function pendingArApApprovals(user: MockUser): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  for (const inv of db().invoices) {
    if (inv.status !== "SUBMITTED" || !canSeeInvoice(inv, user) || !mayApproveInvoice(inv, user)) continue;
    const step = inv.approval_steps.find((s) => s.status === "PENDING")!;
    items.push({
      id: `apr-${inv.id}`, document_type: inv.kind === "AR" ? "AR_INVOICE" : "AP_INVOICE", document_id: inv.id, number: inv.supplier_invoice_no ?? inv.party_code,
      date: inv.date, description: inv.party_name, total: inv.total, currency: inv.currency, preparer_id: inv.preparer_id, preparer_name: inv.preparer_name,
      submitted_at: submittedAt(inv), step: step.step, step_role: step.role,
    });
  }
  if (isFinMgr(user)) {
    if (hasPermission(user.permissions, "ar.credit_note.approve")) {
      for (const cn of db().creditNotes.filter((c) => c.status === "SUBMITTED")) {
        items.push({
          id: `apr-${cn.id}`, document_type: "CREDIT_NOTE", document_id: cn.id, number: cn.invoice_number, date: cn.date, description: `${cn.party_name} — ${cn.reason}`,
          total: cn.total, currency: cn.currency, preparer_id: cn.preparer_id, preparer_name: cn.preparer_name, submitted_at: submittedAt(cn), step: 1, step_role: "FINMGR",
        });
      }
    }
    if (hasPermission(user.permissions, "ap.payment.approve")) {
      for (const p of db().partyPayments.filter((x) => x.kind === "PAYMENT" && x.status === "SUBMITTED")) {
        items.push({
          id: `apr-${p.id}`, document_type: "SUPPLIER_PAYMENT", document_id: p.id, number: p.reference || p.party_name, date: p.date, description: p.party_name,
          total: p.amount, currency: p.currency, preparer_id: p.preparer_id, preparer_name: p.preparer_name, submitted_at: submittedAt(p), step: 1, step_role: "FINMGR",
        });
      }
    }
  }
  if (hasPermission(user.permissions, "ap.supplier.approve")) {
    for (const s of db().parties.filter((x) => x.kind === "SUPPLIER" && x.bank?.pending)) {
      const requester = db().users.find((u) => u.full_name === s.bank!.pending!.requested_by);
      items.push({
        id: `apr-bank-${s.id}`, document_type: "SUPPLIER_BANK", document_id: s.id, number: s.code, date: s.bank!.pending!.requested_at.slice(0, 10),
        description: `${s.name} — ${s.bank!.pending!.bank_name}`, total: "0", currency: "USD", preparer_id: requester?.id ?? "", preparer_name: s.bank!.pending!.requested_by,
        submitted_at: s.bank!.pending!.requested_at, step: 1, step_role: "FINMGR",
      });
    }
  }
  return items;
}

export const arapHandlers = [
  ...partyRoutes("CUSTOMER"), ...partyRoutes("SUPPLIER"), ...bankRoutes,
  ...invoiceRoutes("AR"), ...invoiceRoutes("AP"), ...creditRoutes, ...receiptRoutes, ...paymentRoutes, ...reportRoutes,
];
