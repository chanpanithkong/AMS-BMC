import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { CashTransaction, Expense, ExpenseInput, SpendingCheck } from "@/lib/api/types/cashbank";
import type { ApprovalItem } from "@/lib/api/types/journals";
import { splitByPercent, total } from "@/lib/money/split";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { ledgerLines } from "../db/journals";
import { line, postJournal } from "../db/posting";
import type { MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, versionConflict, type Ctx } from "../http";
import { asOutcome, insufficient, nextNumber, rateFor, rateMissing, visibleCashBankAccounts } from "./cashbank";
import { spendingBudget } from "./budgets";
import { checkPeriod } from "./journals";

// SRS §6.9 Income and Expense Management: FR-EXP-002..011, BR-EXP-001, WF-06, AT-EXP-01..03.

/** Above this amount a second approval step by the Finance Manager is needed (illustrative, D-09). */
const SECOND_STEP_ABOVE = "2000";
const LIABILITY = { UNPAID: "acc-2150", CLAIM: "acc-2160" } as const;
const now = () => new Date().toISOString();
let counter = 0;

const log = (e: Expense, user: MockUser, action: string, comment?: string) => {
  e.history.push({ id: `${e.id}-h${e.history.length + 1}`, at: now(), user_name: user.full_name, action, comment });
  e.version += 1;
};

/** Department managers see their own department's expenses; cashiers their own (SRS §4.3). */
function canSee(e: Expense, user: MockUser): boolean {
  if (user.roles.includes("DEPTMGR")) return e.preparer_id === user.id || e.allocations.some((a) => a.department_id && user.department_ids.includes(a.department_id));
  if (user.roles.includes("CASHIER") || user.roles.includes("APO")) return e.preparer_id === user.id;
  return true;
}

function find(ctx: Ctx): Expense | Response {
  const e = db().expenses.find((x) => x.id === ctx.params.id);
  return e && canSee(e, ctx.user) ? e : fail(404, "NOT_FOUND", "Expense not found.");
}

function applyInput(e: Expense, input: ExpenseInput) {
  const category = db().expenseCategories.find((c) => c.id === input.category_id);
  const amount = new Decimal(input.amount || 0);
  const dp = input.currency === "KHR" ? 0 : 2;
  // The server recomputes allocation amounts; the last line takes the rounding remainder (FR-EXP-005).
  const allocations = input.allocation_mode === "PERCENT"
    ? (() => {
        const split = splitByPercent(amount.toFixed(dp), input.allocations.map((a) => a.percent ?? "0"), input.currency);
        return input.allocations.map((a, i) => ({ ...a, amount: split?.[i] ?? "0" }));
      })()
    : input.allocations.map((a) => ({ ...a, percent: null, amount: new Decimal(a.amount || 0).toFixed(dp) }));
  Object.assign(e, {
    date: input.date, category_id: input.category_id, category_name: category?.name ?? "", category_name_km: category?.name_km ?? "",
    description: input.description ?? "", payee: input.payee ?? "", payment_mode: input.payment_mode,
    paid_from_id: input.payment_mode === "PAID" ? input.paid_from_id : null, currency: input.currency || "USD", amount: amount.toFixed(dp),
    allocation_mode: input.allocation_mode, allocations,
  });
}

function validate(e: Expense, user: MockUser): Response | null {
  const details: { field: string; issue: string; message: string }[] = [];
  const category = db().expenseCategories.find((c) => c.id === e.category_id);
  if (!category) details.push({ field: "category_id", issue: "required", message: "Choose a category" });
  if (!e.description.trim()) details.push({ field: "description", issue: "required", message: "Enter a description" });
  if (!new Decimal(e.amount || 0).gt(0)) details.push({ field: "amount", issue: "positive", message: "Amount must be greater than zero" });
  if (e.payment_mode === "PAID" && !visibleCashBankAccounts(user).some((a) => a.id === e.paid_from_id)) {
    details.push({ field: "paid_from_id", issue: "required", message: "Choose the cash or bank account it was paid from" });
  }
  if (!e.allocations.length) details.push({ field: "allocations", issue: "required", message: "Allocate the expense to at least one department or branch" });
  if (e.allocation_mode === "PERCENT" && !total(e.allocations.map((a) => a.percent)).eq(100)) {
    details.push({ field: "allocations", issue: "percent_total", message: "Percentages must total 100%" });
  }
  if (e.allocation_mode === "AMOUNT" && !total(e.allocations.map((a) => a.amount)).eq(e.amount)) {
    details.push({ field: "allocations", issue: "amount_total", message: "Allocated amounts must equal the expense amount" });
  }
  e.allocations.forEach((a, i) => {
    if (!a.department_id && !a.branch_id) details.push({ field: `allocations.${i}.department_id`, issue: "required", message: `Line ${i + 1}: choose a department or branch` });
  });
  if (details.length) return fail(422, "VALIDATION_ERROR", details[0].message, details);
  // ASSUMPTION: error code from AT-EXP-03; not in the SRS §13.1 list.
  const needsAttachment = category!.requires_attachment || (category!.attachment_threshold !== null && new Decimal(e.amount).gt(category!.attachment_threshold));
  if (needsAttachment && !e.attachments.length) {
    return fail(422, "ATTACHMENT_REQUIRED", `Attach the receipt or invoice for ${category!.name}`, [{ field: "attachments", issue: "required", value: category!.name }]);
  }
  return null;
}

/** Route: step 1 by the department's manager (budget owner), step 2 by the Finance Manager above 2,000.00. */
function route1(e: Expense) {
  const base = new Decimal(e.amount).times(e.rate || 1);
  const roles = base.gt(SECOND_STEP_ABOVE) ? ["DEPTMGR", "FINMGR"] : ["DEPTMGR"];
  return roles.map((role, i) => ({ step: i + 1, role, status: "PENDING" as const, approver_name: null, acted_at: null, comment: null }));
}

/** May this user take the pending step? A department manager only for their own departments. */
function mayApprove(e: Expense, user: MockUser): boolean {
  const step = e.approval_steps.find((s) => s.status === "PENDING");
  if (!step || !hasPermission(user.permissions, "exp.approve")) return false;
  if (user.roles.includes("DEPTMGR")) {
    return step.role === "DEPTMGR" && e.allocations.every((a) => !a.department_id || user.department_ids.includes(a.department_id));
  }
  return user.roles.includes("FINMGR") || user.roles.includes("OWNER");
}

function post(e: Expense, user: MockUser): Response | null {
  const store = db();
  const category = store.expenseCategories.find((c) => c.id === e.category_id)!;
  const rate = rateFor(e.currency, e.date);
  if (!rate) return rateMissing(e.currency, e.date);
  let credit: string;
  if (e.payment_mode === "PAID") {
    const from = store.cashBankAccounts.find((a) => a.id === e.paid_from_id)!;
    if (from.currency !== e.currency) {
      return fail(422, "VALIDATION_ERROR", `Account ${from.code} is in ${from.currency}`, [{ field: "paid_from_id", issue: "currency", message: `Choose an account in ${e.currency}` }]);
    }
    const short = insufficient(from, new Decimal(e.amount));
    if (short) return short;
    credit = from.gl_account_id;
  } else credit = LIABILITY[e.payment_mode];
  const cur = { currency: e.currency, rate, description: e.description };
  const number = nextNumber("EXP", e.date);
  const journal = postJournal(store, {
    date: e.date, description: e.description, reference: e.payee || number, source_type: "EXPENSE", source_no: number, user,
    lines: [
      ...e.allocations.map((a) => line(category.account_id, a.amount, "0", { ...cur, department_id: a.department_id, branch_id: a.branch_id })),
      line(credit, "0", e.amount, cur),
    ],
  });
  Object.assign(e, { status: "POSTED", number, rate, amount_base: journal.totals.debit_base, journal_id: journal.id, journal_no: journal.journal_no });
  log(e, user, "POSTED");
  return null;
}

export function pendingExpenseApprovals(user: MockUser): ApprovalItem[] {
  return db().expenses
    .filter((e) => e.status === "SUBMITTED" && canSee(e, user) && mayApprove(e, user))
    .map((e) => {
      const step = e.approval_steps.find((s) => s.status === "PENDING")!;
      return {
        id: `apr-${e.id}`, document_type: "EXPENSE" as const, document_id: e.id, number: e.number ?? e.payee, date: e.date,
        description: e.description, total: e.amount, currency: e.currency, preparer_id: e.preparer_id, preparer_name: e.preparer_name,
        submitted_at: e.history.find((h) => h.action === "SUBMITTED")?.at ?? now(), step: step.step, step_role: step.role,
      };
    });
}

export const expenseHandlers = [
  route("get", "/expense-categories", "exp.view", ({ url }) => paginate(db().expenseCategories, url)),

  route("get", "/expenses", "exp.view", ({ user, url }) => {
    const q = url.searchParams;
    const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
    const search = (q.get("search") ?? "").toLowerCase();
    const rows = db().expenses
      .filter((e) => canSee(e, user) && (!statuses.length || statuses.includes(e.status)))
      .filter((e) => (!q.get("category_id") || e.category_id === q.get("category_id")) && (!q.get("payment_mode") || e.payment_mode === q.get("payment_mode")))
      .filter((e) => (!q.get("date_from") || e.date >= q.get("date_from")!) && (!q.get("date_to") || e.date <= q.get("date_to")!))
      .filter((e) => !q.get("preparer_id") || e.preparer_id === q.get("preparer_id"))
      .filter((e) => !search || `${e.number ?? ""} ${e.description} ${e.payee}`.toLowerCase().includes(search))
      .sort((a, b) => b.date.localeCompare(a.date));
    return paginate(rows, url);
  }),

  // ASSUMPTION: year-to-date spending and the approved budget for the budget panel (FR-EXP-011).
  route("get", "/expenses/spending", "exp.view", ({ url }) => {
    const account = db().accounts.find((a) => a.id === url.searchParams.get("account_id"));
    if (!account) return fail(404, "NOT_FOUND", "Account not found.");
    const department = url.searchParams.get("department_id");
    const date = url.searchParams.get("date") ?? "2027-12-31";
    const spent = ledgerLines(db().journals, { dateFrom: `${date.slice(0, 4)}-01-01`, dateTo: date, departmentId: department })
      .filter((l) => l.account_id === account.id)
      .reduce((s, l) => s.plus(l.debit_base).minus(l.credit_base), new Decimal(0));
    // The approved budget arrives with Phase 6; D-13 (warn or block) is a warning on screen for now.
    const result: SpendingCheck = { account_code: account.code, department_id: department, year_to_date: spent.toFixed(2), ...spendingBudget(account.id, department, date, spent) };
    return HttpResponse.json(result);
  }),

  route<ExpenseInput>("post", "/expenses", "exp.create", (ctx) => {
    const e: Expense = {
      id: `exp-${Date.now().toString(36)}-${(counter += 1)}`, number: null, status: "DRAFT", date: "", category_id: "", category_name: "",
      category_name_km: "", description: "", payee: "", payment_mode: "PAID", paid_from_id: null, currency: "USD", rate: "1", amount: "0",
      amount_base: "0", allocation_mode: "PERCENT", allocations: [], attachments: [], preparer_id: ctx.user.id, preparer_name: ctx.user.full_name,
      approval_steps: [], rejection_comment: null, journal_id: null, journal_no: null, settlement: null, history: [], version: 0,
    };
    applyInput(e, ctx.body);
    log(e, ctx.user, "CREATED");
    db().expenses.push(e);
    return HttpResponse.json(e, { status: 201 });
  }),

  route("get", "/expenses/:id", "exp.view", (ctx) => {
    const e = find(ctx);
    return e instanceof Response ? e : HttpResponse.json(e);
  }),

  route<ExpenseInput>("patch", "/expenses/:id", "exp.create", (ctx) => {
    const e = find(ctx);
    if (e instanceof Response) return e;
    if (e.status !== "DRAFT" && e.status !== "REJECTED") return fail(409, e.status === "POSTED" ? "JOURNAL_POSTED" : "INVALID_STATE_TRANSITION", "Only a draft can be edited.");
    const stale = versionConflict(ctx, e.version);
    if (stale) return stale;
    applyInput(e, ctx.body);
    e.status = "DRAFT";
    log(e, ctx.user, "EDITED");
    return HttpResponse.json(e);
  }),

  route("post", "/expenses/:id/submit", "exp.submit", (ctx) => {
    const e = find(ctx);
    if (e instanceof Response) return e;
    if (e.status !== "DRAFT" && e.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be submitted.");
    const invalid = validate(e, ctx.user) ?? checkPeriod(e.date, "MANUAL", ctx.user, "date");
    if (invalid) return invalid;
    if (e.currency !== "USD" && !rateFor(e.currency, e.date)) return rateMissing(e.currency, e.date);
    e.rate = rateFor(e.currency, e.date)!;
    e.status = "SUBMITTED";
    e.rejection_comment = null;
    e.approval_steps = route1(e);
    log(e, ctx.user, "SUBMITTED");
    return HttpResponse.json(e);
  }),

  route("post", "/expenses/:id/recall", "exp.submit", (ctx) => {
    const e = find(ctx);
    if (e instanceof Response) return e;
    if (e.status !== "SUBMITTED" || e.preparer_id !== ctx.user.id) return fail(409, "INVALID_STATE_TRANSITION", "Only the preparer can recall a submitted expense.");
    e.status = "DRAFT";
    e.approval_steps = [];
    log(e, ctx.user, "RECALLED");
    return HttpResponse.json(e);
  }),

  route("post", "/expenses/:id/cancel", "exp.create", (ctx) => {
    const e = find(ctx);
    if (e instanceof Response) return e;
    if (e.status !== "DRAFT" && e.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be cancelled.");
    e.status = "CANCELLED";
    log(e, ctx.user, "CANCELLED");
    return HttpResponse.json(e);
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/expenses/:id/approve", "exp.approve", (ctx) =>
    idempotent(ctx, async () => {
      const e = find(ctx);
      if (e instanceof Response) return asOutcome(e);
      if (e.status !== "SUBMITTED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", `A ${e.status} expense cannot be approved or rejected.`));
      if (!db().reducedSod && e.preparer_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You prepared this expense and cannot approve it"));
      if (!mayApprove(e, ctx.user)) return asOutcome(fail(403, "FORBIDDEN", "This step is waiting for another approver."));
      const step = e.approval_steps.find((s) => s.status === "PENDING")!;
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) {
          return asOutcome(fail(422, "VALIDATION_ERROR", "A comment is required to reject.", [{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        }
        Object.assign(step, { status: "REJECTED", approver_name: ctx.user.full_name, acted_at: now(), comment: ctx.body.comment.trim() });
        e.status = "REJECTED";
        e.rejection_comment = ctx.body.comment.trim();
        log(e, ctx.user, "REJECTED", e.rejection_comment);
        return { status: 200, body: e };
      }
      const base = new Decimal(e.amount).times(e.rate || 1);
      if (ctx.user.approval_limit !== null && base.gt(ctx.user.approval_limit)) {
        return asOutcome(fail(403, "APPROVAL_LIMIT_EXCEEDED", `Amount exceeds your approval limit (${ctx.user.approval_limit})`, [{ field: "total", value: ctx.user.approval_limit }]));
      }
      Object.assign(step, { status: "APPROVED", approver_name: ctx.user.full_name, acted_at: now(), comment: ctx.body?.comment?.trim() || null });
      if (e.approval_steps.every((s) => s.status === "APPROVED")) e.status = "APPROVED";
      log(e, ctx.user, "APPROVED");
      return { status: 200, body: e };
    }),
  ),

  route("post", "/expenses/:id/post", "exp.post", (ctx) =>
    idempotent(ctx, async () => {
      const e = find(ctx);
      if (e instanceof Response) return asOutcome(e);
      if (e.status === "POSTED") return asOutcome(fail(409, "ALREADY_POSTED", `${e.number} is already posted.`, [{ field: "number", value: e.number ?? "" }]));
      if (e.status !== "APPROVED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "The expense must be approved first."));
      if (!db().reducedSod && e.preparer_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You prepared this expense and cannot post it"));
      const invalid = validate(e, ctx.user) ?? checkPeriod(e.date, "MANUAL", ctx.user, "date") ?? post(e, ctx.user);
      if (invalid) return asOutcome(invalid);
      return { status: 200, body: e };
    }),
  ),

  // FR-EXP-010: settle an unpaid or claim expense; the payment clears the liability and does not
  // recognise the expense again (BR-EXP-001, AT-EXP-01). ASSUMPTION: endpoint not in SRS §13.3.
  route<{ account_id: string; date: string }>("post", "/expenses/:id/settle", "exp.post", (ctx) =>
    idempotent(ctx, async () => {
      const e = find(ctx);
      if (e instanceof Response) return asOutcome(e);
      if (e.status !== "POSTED" || e.payment_mode === "PAID") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "Only a posted unpaid expense or claim can be settled."));
      if (e.settlement) return asOutcome(fail(409, "ALREADY_POSTED", `Already settled by ${e.settlement.number}.`, [{ field: "settlement", value: e.settlement.number }]));
      const from = visibleCashBankAccounts(ctx.user).find((a) => a.id === ctx.body?.account_id);
      if (!from) return asOutcome(fail(422, "VALIDATION_ERROR", "Choose the account to pay from", [{ field: "account_id", issue: "required", message: "Choose the account to pay from" }]));
      if (from.currency !== e.currency) return asOutcome(fail(422, "VALIDATION_ERROR", `Choose an account in ${e.currency}`, [{ field: "account_id", issue: "currency", message: `Choose an account in ${e.currency}` }]));
      const date = ctx.body.date || e.date;
      const blocked = checkPeriod(date, "MANUAL", ctx.user, "date") ?? insufficient(from, new Decimal(e.amount));
      if (blocked) return asOutcome(blocked);
      const rate = rateFor(e.currency, date);
      if (!rate) return asOutcome(rateMissing(e.currency, date));
      const liability = LIABILITY[e.payment_mode];
      const number = nextNumber("PV", date);
      const cur = { currency: e.currency, rate, description: `Payment of ${e.number}: ${e.description}` };
      const journal = postJournal(db(), {
        date, description: cur.description, reference: e.number ?? number, source_type: "CB_PAYMENT", source_no: number, user: ctx.user,
        lines: [line(liability, e.amount, "0", cur), line(from.gl_account_id, "0", e.amount, cur)],
      });
      const liabilityAccount = db().accounts.find((a) => a.id === liability)!;
      const payment: CashTransaction = {
        id: `ctx-settle-${e.id}`, number, type: "PAYMENT", status: "POSTED", date, account_id: from.id, to_account_id: null, currency: e.currency,
        amount: e.amount, to_amount: null, rate, reference: e.number ?? "", description: cur.description, payee: e.payee, expense_id: e.id,
        lines: [{ account_id: liability, account_code: liabilityAccount.code, account_name: liabilityAccount.name, account_name_km: liabilityAccount.name_km, description: cur.description, amount: e.amount, department_id: null, branch_id: null }],
        journal_id: journal.id, journal_no: journal.journal_no, preparer_id: ctx.user.id, preparer_name: ctx.user.full_name,
        posted_by: ctx.user.full_name, posted_at: now(), history: [{ id: `${e.id}-pay-h1`, at: now(), user_name: ctx.user.full_name, action: "POSTED" }],
        attachments: [], version: 1,
      };
      db().cashTransactions.push(payment);
      e.settlement = { transaction_id: payment.id, number, date };
      log(e, ctx.user, "SETTLED", number);
      return { status: 200, body: e };
    }),
  ),

  route("post", "/expenses/:id/attachments", "exp.create", async (ctx) => {
    const e = find(ctx);
    if (e instanceof Response) return e;
    if (e.status === "POSTED" || e.status === "CANCELLED") return fail(409, "JOURNAL_POSTED", "Posted expenses cannot be changed.");
    const file = (await ctx.request.formData()).get("file");
    if (!(file instanceof File)) return fail(422, "VALIDATION_ERROR", "A file is required.", [{ field: "file", issue: "required" }]);
    e.attachments.push({ id: `att-${Date.now().toString(36)}-${(counter += 1)}`, file_name: file.name, content_type: file.type, size: file.size, uploaded_at: now(), uploaded_by: ctx.user.full_name });
    log(e, ctx.user, "ATTACHMENT_ADDED", file.name);
    return HttpResponse.json(e, { status: 201 });
  }),

  route("delete", "/expenses/:id/attachments/:attachmentId", "exp.create", (ctx) => {
    const e = find(ctx);
    if (e instanceof Response) return e;
    if (e.status === "POSTED") return fail(409, "JOURNAL_POSTED", "Posted expenses cannot be changed.");
    e.attachments = e.attachments.filter((a) => a.id !== ctx.params.attachmentId);
    log(e, ctx.user, "ATTACHMENT_REMOVED");
    return HttpResponse.json(e);
  }),
];
