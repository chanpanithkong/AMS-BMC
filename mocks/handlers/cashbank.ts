import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { AccountBook, CashBankAccount, CashTransaction, CashTransactionInput } from "@/lib/api/types/cashbank";
import type { JournalLineInput } from "@/lib/api/types/journals";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import type { MockCashBankAccount } from "../db/cashbank";
import { ledgerLines } from "../db/journals";
import { accountBalance, line, postJournal } from "../db/posting";
import type { MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, versionConflict, type Ctx } from "../http";
import { checkPeriod } from "./journals";

// SRS §6.8 Cash and Bank: FR-CB-001..007, BR-CB-003 (transfers), BR-CB-004 (no negative cash).

type Outcome = { status: number; body: unknown };
export const asOutcome = async (response: Response): Promise<Outcome> => ({ status: response.status, body: await response.json() });

const PREFIX: Record<CashTransaction["type"], string> = { RECEIPT: "CR", PAYMENT: "PV", TRANSFER: "TR", DEPOSIT: "DP", WITHDRAWAL: "WD", CHARGE: "BC" };
const now = () => new Date().toISOString();
let counter = 0;

export function nextNumber(prefix: string, date: string): string {
  const store = db();
  const n = store.sequences[prefix] ?? 1;
  store.sequences[prefix] = n + 1;
  return `${prefix}-${date.slice(0, 4)}-${String(n).padStart(6, "0")}`;
}

/** A cashier sees only the cash accounts in their custody (SRS §4.2, §4.3 "own"). */
export function visibleCashBankAccounts(user: MockUser): MockCashBankAccount[] {
  const seeBank = hasPermission(user.permissions, "cb.bank.view");
  const seeCash = hasPermission(user.permissions, "cb.cash.view");
  const ownOnly = user.roles.includes("CASHIER");
  return db().cashBankAccounts.filter((a) => {
    if (a.kind === "BANK") return seeBank && !ownOnly;
    if (!seeCash) return false;
    return !ownOnly || user.cash_account_ids.includes(a.id);
  });
}

/** Rate (base per unit) for a currency and date, or null when none is entered (BR-FX-002). */
export function rateFor(currency: string, date: string): string | null {
  if (currency === "USD") return "1";
  return db().exchangeRates.find((r) => r.from_currency === currency && r.to_currency === "USD" && r.rate_type === "TRANSACTION" && r.rate_date === date)?.rate ?? null;
}

export function rateMissing(currency: string, date: string) {
  return fail(422, "RATE_MISSING", `Exchange rate required for ${currency} on ${date}`, [{ field: "date", issue: "missing", value: currency }]);
}

export function toDto(a: MockCashBankAccount, user: MockUser): CashBankAccount {
  const gl = db().accounts.find((x) => x.id === a.gl_account_id);
  const { amount, base } = accountBalance(db(), a.gl_account_id);
  const unmask = hasPermission(user.permissions, "cb.bank.unmask");
  const custodian = db().users.find((u) => u.id === a.custodian_id);
  const last = db().reconciliations.filter((r) => r.bank_account_id === a.id && r.status === "COMPLETED").map((r) => r.statement_date).sort().pop() ?? null;
  return {
    id: a.id, kind: a.kind, code: a.code, name: a.name, name_km: a.name_km, bank_name: a.bank_name,
    // Masked unless the user may see bank details (FR-RBAC-008).
    account_number: a.account_number ? (unmask ? a.account_number : `•••• ${a.account_number.replace(/\D/g, "").slice(-4)}`) : null,
    currency: a.currency, gl_account_id: a.gl_account_id, gl_account_code: gl?.code ?? "", branch_id: a.branch_id,
    custodian_name: custodian?.full_name ?? null, min_balance: a.min_balance, allow_negative: a.allow_negative, status: a.status,
    balance: amount.toFixed(a.currency === "KHR" ? 0 : 2), balance_base: base.toFixed(2), last_reconciled: a.kind === "BANK" ? last : null,
  };
}

function findAccount(ctx: Ctx, id: string): MockCashBankAccount | Response {
  const account = visibleCashBankAccounts(ctx.user).find((a) => a.id === id);
  return account ?? fail(404, "NOT_FOUND", "Account not found.");
}

function book(a: MockCashBankAccount, from: string, to: string, user: MockUser): AccountBook {
  const dp = a.currency === "KHR" ? 0 : 2;
  const before = accountBalance(db(), a.gl_account_id, new Date(Date.parse(from + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10));
  let running = before.amount;
  let runningBase = before.base;
  let receipts = new Decimal(0);
  let payments = new Decimal(0);
  const lines = ledgerLines(db().journals, { dateFrom: from, dateTo: to })
    .filter((l) => l.account_id === a.gl_account_id)
    .sort((x, y) => x.journal.posting_date.localeCompare(y.journal.posting_date) || (x.journal.journal_no ?? "").localeCompare(y.journal.journal_no ?? ""))
    .map((l) => {
      running = running.plus(l.debit).minus(l.credit);
      runningBase = runningBase.plus(l.debit_base).minus(l.credit_base);
      receipts = receipts.plus(l.debit);
      payments = payments.plus(l.credit);
      return {
        id: l.id, date: l.journal.posting_date, journal_id: l.journal.id, journal_no: l.journal.journal_no ?? "", source: l.journal.source_no ?? l.journal.type,
        reference: l.journal.reference, description: l.description || l.journal.description, receipt: new Decimal(l.debit).toFixed(dp),
        payment: new Decimal(l.credit).toFixed(dp), balance: running.toFixed(dp), balance_base: runningBase.toFixed(2),
      };
    });
  return {
    account: toDto(a, user), date_from: from, date_to: to, opening: before.amount.toFixed(dp), opening_base: before.base.toFixed(2), lines,
    total_receipts: receipts.toFixed(dp), total_payments: payments.toFixed(dp), closing: running.toFixed(dp), closing_base: runningBase.toFixed(2),
  };
}

const canSeeTransaction = (t: CashTransaction, user: MockUser) => {
  const ids = new Set(visibleCashBankAccounts(user).map((a) => a.id));
  return ids.has(t.account_id) || (t.to_account_id !== null && ids.has(t.to_account_id));
};

function enrichLines(lines: CashTransaction["lines"]) {
  return lines.map((l) => {
    const a = db().accounts.find((x) => x.id === l.account_id);
    return { ...l, account_code: a?.code, account_name: a?.name, account_name_km: a?.name_km };
  });
}

/** Field checks shared by save and post. */
function validate(t: CashTransaction, user: MockUser): Response | null {
  const store = db();
  const details: { field: string; issue: string; message: string }[] = [];
  const from = visibleCashBankAccounts(user).find((a) => a.id === t.account_id);
  if (!from) details.push({ field: "account_id", issue: "required", message: "Choose a cash or bank account" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) details.push({ field: "date", issue: "required", message: "Enter the date" });
  if (!new Decimal(t.amount || 0).gt(0)) details.push({ field: "amount", issue: "positive", message: "Amount must be greater than zero" });
  const twoSided = t.type === "TRANSFER" || t.type === "DEPOSIT" || t.type === "WITHDRAWAL";
  if (twoSided) {
    const to = store.cashBankAccounts.find((a) => a.id === t.to_account_id);
    if (!to || to.id === t.account_id) details.push({ field: "to_account_id", issue: "required", message: "Choose a different receiving account" });
    else {
      if (t.type === "DEPOSIT" && (from?.kind !== "CASH" || to.kind !== "BANK")) details.push({ field: "to_account_id", issue: "kind", message: "A deposit moves cash into a bank account" });
      if (t.type === "WITHDRAWAL" && (from?.kind !== "BANK" || to.kind !== "CASH")) details.push({ field: "to_account_id", issue: "kind", message: "A withdrawal moves money from a bank account into cash" });
      if (to.currency !== from?.currency && !new Decimal(t.to_amount || 0).gt(0)) details.push({ field: "to_amount", issue: "required", message: "Enter the amount received" });
    }
  } else {
    if (!t.lines.length) details.push({ field: "lines", issue: "required", message: "Add at least one line" });
    const sum = t.lines.reduce((s, l) => s.plus(l.amount || 0), new Decimal(0));
    if (t.lines.length && !sum.eq(new Decimal(t.amount || 0))) {
      details.push({ field: "lines", issue: "total", message: `Lines total ${sum.toFixed(2)}, not ${new Decimal(t.amount || 0).toFixed(2)}` });
    }
    t.lines.forEach((l, i) => {
      const a = store.accounts.find((x) => x.id === l.account_id);
      if (!a || !a.is_posting || !a.is_active) details.push({ field: `lines.${i}.account_id`, issue: "header", message: `Line ${i + 1}: choose a posting account` });
      // Receivables, payables and bank are posted by their own modules; cash moves are transfers.
      else if (a.is_control || a.cash_flow_class === "CASH") details.push({ field: `lines.${i}.account_id`, issue: "control_account", message: `Line ${i + 1}: account ${a.code} cannot be used here` });
      if (!new Decimal(l.amount || 0).gt(0)) details.push({ field: `lines.${i}.amount`, issue: "positive", message: `Line ${i + 1}: amount must be greater than zero` });
    });
  }
  return details.length ? fail(422, "VALIDATION_ERROR", details[0].message, details) : null;
}

/** BR-CB-004: posting may not take a cash account below zero. */
export function insufficient(account: MockCashBankAccount, amount: Decimal): Response | null {
  if (account.kind !== "CASH" || account.allow_negative) return null;
  const { amount: balance } = accountBalance(db(), account.gl_account_id);
  if (balance.minus(amount).gte(0)) return null;
  return fail(422, "INSUFFICIENT_BALANCE", "Insufficient cash balance", [{ field: "amount", issue: "insufficient", value: balance.toFixed(account.currency === "KHR" ? 0 : 2) }]);
}

/** Build and post the journal for a cash transaction. */
function postTransaction(t: CashTransaction, user: MockUser): Response | null {
  const store = db();
  const from = store.cashBankAccounts.find((a) => a.id === t.account_id)!;
  const fromRate = rateFor(from.currency, t.date);
  if (!fromRate) return rateMissing(from.currency, t.date);
  const amount = new Decimal(t.amount);
  const lines: JournalLineInput[] = [];
  const cur = (a: MockCashBankAccount, rate: string) => ({ currency: a.currency, rate });
  if (t.type === "RECEIPT") {
    lines.push(line(from.gl_account_id, t.amount, "0", { ...cur(from, fromRate), description: t.description }));
    t.lines.forEach((l) => lines.push(line(l.account_id, "0", l.amount, { ...cur(from, fromRate), description: l.description || t.description, department_id: l.department_id, branch_id: l.branch_id })));
  } else if (t.type === "PAYMENT" || t.type === "CHARGE") {
    const short = insufficient(from, amount);
    if (short) return short;
    t.lines.forEach((l) => lines.push(line(l.account_id, l.amount, "0", { ...cur(from, fromRate), description: l.description || t.description, department_id: l.department_id, branch_id: l.branch_id })));
    lines.push(line(from.gl_account_id, "0", t.amount, { ...cur(from, fromRate), description: t.description }));
  } else {
    const short = insufficient(from, amount);
    if (short) return short;
    const to = store.cashBankAccounts.find((a) => a.id === t.to_account_id)!;
    const toRate = rateFor(to.currency, t.date);
    if (!toRate) return rateMissing(to.currency, t.date);
    const received = to.currency === from.currency ? amount : new Decimal(t.to_amount ?? 0);
    t.to_amount = received.toFixed(to.currency === "KHR" ? 0 : 2);
    lines.push(line(to.gl_account_id, t.to_amount, "0", { ...cur(to, toRate), description: t.description }));
    lines.push(line(from.gl_account_id, "0", t.amount, { ...cur(from, fromRate), description: t.description }));
    // Currency conversion: the base-currency difference is a realised exchange gain or loss (BR-CB-003).
    const diff = received.times(toRate).toDecimalPlaces(2).minus(amount.times(fromRate).toDecimalPlaces(2));
    if (diff.gt(0)) lines.push(line("acc-7300", "0", diff.toFixed(2), { description: t.description }));
    if (diff.lt(0)) lines.push(line("acc-8310", diff.abs().toFixed(2), "0", { description: t.description }));
  }
  const number = nextNumber(PREFIX[t.type], t.date);
  const journal = postJournal(store, {
    date: t.date, description: t.description || number, reference: t.reference || number, source_type: `CB_${t.type}`, source_no: number,
    lines, user,
  });
  t.number = number;
  t.status = "POSTED";
  t.rate = fromRate;
  t.journal_id = journal.id;
  t.journal_no = journal.journal_no;
  t.posted_by = user.full_name;
  t.posted_at = now();
  t.version += 1;
  t.history.push({ id: `${t.id}-h${t.history.length + 1}`, at: now(), user_name: user.full_name, action: "POSTED" });
  return null;
}

function fromInput(t: CashTransaction, input: CashTransactionInput) {
  const account = db().cashBankAccounts.find((a) => a.id === input.account_id);
  Object.assign(t, {
    type: input.type, date: input.date, account_id: input.account_id, to_account_id: input.to_account_id ?? null,
    currency: account?.currency ?? "USD", amount: input.amount || "0", to_amount: input.to_amount ?? null, reference: input.reference ?? "",
    description: input.description ?? "", payee: input.payee ?? "",
    lines: input.type === "TRANSFER" || input.type === "DEPOSIT" || input.type === "WITHDRAWAL" ? [] : enrichLines(input.lines ?? []),
  });
}

function findTransaction(ctx: Ctx): CashTransaction | Response {
  const t = db().cashTransactions.find((x) => x.id === ctx.params.id);
  if (!t || !canSeeTransaction(t, ctx.user)) return fail(404, "NOT_FOUND", "Transaction not found.");
  return t;
}

const accountRoutes = (kind: "bank" | "cash") => {
  const permission = kind === "bank" ? "cb.bank.view" : "cb.cash.view";
  const wanted = kind === "bank" ? "BANK" : "CASH";
  return [
    route("get", `/${kind}-accounts`, permission, ({ user, url }) =>
      paginate(visibleCashBankAccounts(user).filter((a) => a.kind === wanted).map((a) => toDto(a, user)), url)),
    route("get", `/${kind}-accounts/:id`, permission, (ctx) => {
      const a = findAccount(ctx, ctx.params.id);
      return a instanceof Response ? a : HttpResponse.json(toDto(a, ctx.user));
    }),
    // ASSUMPTION: cashbook and bankbook as a sub-resource (RPT-11, RPT-12).
    route("get", `/${kind}-accounts/:id/book`, permission, (ctx) => {
      const a = findAccount(ctx, ctx.params.id);
      if (a instanceof Response) return a;
      const from = ctx.url.searchParams.get("date_from") ?? "2027-04-01";
      const to = ctx.url.searchParams.get("date_to") ?? "2027-04-30";
      if (from > to) return fail(422, "VALIDATION_ERROR", "Choose a valid date range.", [{ field: "date_from", issue: "invalid_range" }]);
      return HttpResponse.json(book(a, from, to, ctx.user));
    }),
  ];
};

export const cashBankHandlers = [
  ...accountRoutes("bank"),
  ...accountRoutes("cash"),

  route("get", "/cash-transactions", null, ({ user, url }) => {
    if (!hasPermission(user.permissions, "cb.cash.view") && !hasPermission(user.permissions, "cb.bank.view")) {
      return fail(403, "FORBIDDEN", "Permission cb.cash.view is required.");
    }
    const q = url.searchParams;
    const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
    const search = (q.get("search") ?? "").toLowerCase();
    const rows = db().cashTransactions
      .filter((t) => canSeeTransaction(t, user))
      .filter((t) => (!statuses.length || statuses.includes(t.status)) && (!q.get("type") || t.type === q.get("type")))
      .filter((t) => !q.get("account_id") || t.account_id === q.get("account_id") || t.to_account_id === q.get("account_id"))
      .filter((t) => (!q.get("date_from") || t.date >= q.get("date_from")!) && (!q.get("date_to") || t.date <= q.get("date_to")!))
      .filter((t) => !search || `${t.number ?? ""} ${t.reference} ${t.description} ${t.payee}`.toLowerCase().includes(search))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.number ?? "~").localeCompare(a.number ?? "~"));
    return paginate(rows, url);
  }),

  route<CashTransactionInput>("post", "/cash-transactions", "cb.cash.create", (ctx) => {
    if (!visibleCashBankAccounts(ctx.user).some((a) => a.id === ctx.body?.account_id)) {
      return fail(422, "VALIDATION_ERROR", "Choose a cash or bank account", [{ field: "account_id", issue: "required", message: "Choose a cash or bank account" }]);
    }
    const t: CashTransaction = {
      id: `ctx-${Date.now().toString(36)}-${(counter += 1)}`, number: null, type: "PAYMENT", status: "DRAFT", date: "", account_id: "", to_account_id: null,
      currency: "USD", amount: "0", to_amount: null, rate: "1", reference: "", description: "", payee: "", lines: [], journal_id: null, journal_no: null,
      expense_id: null, preparer_id: ctx.user.id, preparer_name: ctx.user.full_name, posted_by: null, posted_at: null,
      history: [{ id: `h-${counter}`, at: now(), user_name: ctx.user.full_name, action: "CREATED" }], attachments: [], version: 1,
    };
    fromInput(t, ctx.body);
    db().cashTransactions.push(t);
    return HttpResponse.json(t, { status: 201 });
  }),

  route("get", "/cash-transactions/:id", null, (ctx) => {
    const t = findTransaction(ctx);
    return t instanceof Response ? t : HttpResponse.json(t);
  }),

  route<CashTransactionInput>("patch", "/cash-transactions/:id", "cb.cash.create", (ctx) => {
    const t = findTransaction(ctx);
    if (t instanceof Response) return t;
    if (t.status !== "DRAFT") return fail(409, t.status === "POSTED" ? "ALREADY_POSTED" : "INVALID_STATE_TRANSITION", "Only a draft can be edited.");
    const stale = versionConflict(ctx, t.version);
    if (stale) return stale;
    fromInput(t, ctx.body);
    t.version += 1;
    t.history.push({ id: `${t.id}-h${t.history.length + 1}`, at: now(), user_name: ctx.user.full_name, action: "EDITED" });
    return HttpResponse.json(t);
  }),

  // ASSUMPTION: the cashier submits; an accountant with cb.cash.post posts (SRS §4.3, WF-07 "payments above cashier limit").
  route("post", "/cash-transactions/:id/submit", "cb.cash.create", (ctx) => {
    const t = findTransaction(ctx);
    if (t instanceof Response) return t;
    if (t.status !== "DRAFT") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be submitted.");
    const invalid = validate(t, ctx.user) ?? checkPeriod(t.date, "MANUAL", ctx.user, "date");
    if (invalid) return invalid;
    t.status = "SUBMITTED";
    t.version += 1;
    t.history.push({ id: `${t.id}-h${t.history.length + 1}`, at: now(), user_name: ctx.user.full_name, action: "SUBMITTED" });
    return HttpResponse.json(t);
  }),

  route("post", "/cash-transactions/:id/cancel", "cb.cash.create", (ctx) => {
    const t = findTransaction(ctx);
    if (t instanceof Response) return t;
    if (t.status === "POSTED" || t.status === "CANCELLED") return fail(409, "INVALID_STATE_TRANSITION", "This transaction cannot be cancelled.");
    t.status = "CANCELLED";
    t.version += 1;
    t.history.push({ id: `${t.id}-h${t.history.length + 1}`, at: now(), user_name: ctx.user.full_name, action: "CANCELLED" });
    return HttpResponse.json(t);
  }),

  route("post", "/cash-transactions/:id/post", "cb.cash.post", (ctx) =>
    idempotent(ctx, async () => {
      const t = findTransaction(ctx);
      if (t instanceof Response) return asOutcome(t);
      if (t.status === "POSTED") return asOutcome(fail(409, "ALREADY_POSTED", `${t.number} is already posted.`, [{ field: "number", value: t.number ?? "" }]));
      if (t.status !== "DRAFT" && t.status !== "SUBMITTED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "This transaction cannot be posted."));
      const invalid = validate(t, ctx.user) ?? checkPeriod(t.date, "MANUAL", ctx.user, "date") ?? postTransaction(t, ctx.user);
      if (invalid) return asOutcome(invalid);
      return { status: 200, body: t };
    }),
  ),
];
