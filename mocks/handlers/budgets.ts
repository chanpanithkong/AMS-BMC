import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { ApprovalItem } from "@/lib/api/types/journals";
import type { Budget, BudgetLine, BudgetLineInput, BudgetUse } from "@/lib/api/types/planning";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { budgetTotals } from "../db/advanced";
import { ledgerLines } from "../db/journals";
import { postingListeners, type PostingStore } from "../db/posting";
import { MOCK_TODAY, type MockDb, type MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, versionConflict, type Ctx } from "../http";
import { asOutcome } from "./cashbank";

// SRS §6.14 Budget Management: FR-BUD-001..010, BR-BUD-001..002, AT-BUD-01..03, SCR-23.

const now = () => new Date().toISOString();
let counter = 0;
const ZERO = new Decimal(0);
const money = (d: Decimal.Value) => new Decimal(d || 0).toFixed(2);
const invalid = (details: { field: string; issue: string; message: string; value?: string }[]) => fail(422, "VALIDATION_ERROR", details[0].message, details);
const THRESHOLDS = [80, 100];

function log(b: Budget, user: MockUser, action: string, comment?: string | null) {
  b.history.push({ id: `${b.id}-h${b.history.length + 1}`, at: now(), user_name: user.full_name, action, comment: comment ?? null });
  b.row_version += 1;
}

/** Department managers see and edit only their own departments' lines (FR-BUD-002). */
const scoped = (user: MockUser) => (user.roles.includes("DEPTMGR") ? user.department_ids : null);
function view(b: Budget, user: MockUser): Budget {
  const own = scoped(user);
  if (!own) return b;
  const lines = b.lines.filter((l) => l.department_id && own.includes(l.department_id));
  return { ...b, lines, ...budgetTotals({ lines: structuredClone(lines) }, db().accounts) };
}

const find = (ctx: Ctx) => db().budgets.find((b) => b.id === ctx.params.id) ?? fail(404, "NOT_FOUND", "Budget not found.");
const approvedFor = (store: Pick<MockDb, "budgets">, fiscalYearId: string) => store.budgets.find((b) => b.fiscal_year_id === fiscalYearId && b.status === "APPROVED");
const fiscalYearOf = (date: string) => db().fiscalYears.find((y) => y.start_date <= date && date <= y.end_date);

/** Posted actual for a budget line's account and dimensions over a range (BR-BUD-001). */
export function actualFor(store: Pick<MockDb, "journals">, l: Pick<BudgetLine, "account_id" | "department_id" | "branch_id">, from: string, to: string, type: string | undefined): Decimal {
  const sign = type === "REVENUE" ? -1 : 1;
  return ledgerLines(store.journals, { dateFrom: from, dateTo: to, departmentId: l.department_id, branchId: l.branch_id })
    .filter((x) => x.account_id === l.account_id && x.journal.type !== "OPENING")
    .reduce((s, x) => s.plus(new Decimal(x.debit_base).minus(x.credit_base).times(sign)), ZERO);
}

/** Budget for a line over the months from the start of the year to a date. */
const budgetThrough = (l: BudgetLine, date: string) => l.months.slice(0, Number(date.slice(5, 7))).reduce((s, m) => s.plus(m || 0), ZERO);

/** Expense budget use by department for the approved budget (FR-DASH-006). */
export function budgetUse(store: MockDb, date: string, departments: string[] | null): BudgetUse[] {
  const fy = store.fiscalYears.find((y) => y.start_date <= date && date <= y.end_date);
  const b = fy ? approvedFor(store, fy.id) : undefined;
  if (!b) return [];
  const out: BudgetUse[] = [];
  for (const d of store.departments.filter((x) => !departments || departments.includes(x.id))) {
    const lines = b.lines.filter((l) => l.department_id === d.id && store.accounts.find((a) => a.id === l.account_id)?.type === "EXPENSE");
    if (!lines.length) continue;
    const year = lines.reduce((s, l) => s.plus(l.total), ZERO);
    const ytd = lines.reduce((s, l) => s.plus(budgetThrough(l, date)), ZERO);
    const actual = lines.reduce((s, l) => s.plus(actualFor(store, l, fy!.start_date, date, "EXPENSE")), ZERO);
    out.push({ department_id: d.id, name: d.name, name_km: d.name_km, budget_ytd: money(ytd), budget_year: money(year), actual: money(actual), percent: year.isZero() ? null : actual.div(year).times(100).toFixed(1) });
  }
  return out;
}

/**
 * FR-BUD-009, AT-BUD-03: when posted actuals of a department reach 80 % or 100 % of its annual
 * expense budget, its department managers and the Finance Managers are notified once per threshold.
 */
export function checkBudgetAlerts(store: MockDb) {
  if (!store.budgets || !store.departments || !store.users) return;
  for (const fy of store.fiscalYears) {
    const b = approvedFor(store, fy.id);
    if (!b) continue;
    for (const use of budgetUse(store, fy.end_date < MOCK_TODAY ? fy.end_date : MOCK_TODAY, null)) {
      const pct = new Decimal(use.percent ?? 0);
      const key = `${b.id}:${use.department_id}`;
      const reached = THRESHOLDS.filter((t) => pct.gte(t)).pop();
      if (!reached || (store.budgetAlerts[key] ?? 0) >= reached) continue;
      store.budgetAlerts[key] = reached;
      const recipients = store.users.filter((u) => (u.roles.includes("DEPTMGR") && u.department_ids.includes(use.department_id)) || u.roles.includes("FINMGR"));
      for (const u of recipients) {
        (store.notifications[u.id] ??= []).unshift({
          id: `ntf-bud-${key}-${reached}-${u.id}`, created_at: now(), read: false, link: "/budgets",
          title: `${use.name}: ${reached} % of the budget used`, title_km: `${use.name_km}៖ ប្រើថវិកាអស់ ${reached} %`,
          body: `Posted expenses ${use.actual} of an annual budget of ${use.budget_year} (${use.percent} %).`,
          body_km: `ចំណាយបានកត់ត្រា ${use.actual} នៃថវិកាប្រចាំឆ្នាំ ${use.budget_year} (${use.percent} %)។`,
        });
      }
    }
  }
}

postingListeners.push((store: PostingStore) => {
  const full = store as Partial<MockDb>;
  if (full.budgets && full.budgetAlerts && full.notifications) checkBudgetAlerts(full as MockDb);
});

function applyLines(b: Budget, input: BudgetLineInput[], user: MockUser): Response | null {
  const own = scoped(user);
  const details: { field: string; issue: string; message: string }[] = [];
  const keys = new Set<string>();
  const next: BudgetLine[] = [];
  input.forEach((l, i) => {
    const account = db().accounts.find((a) => a.id === l.account_id);
    if (!account || !account.is_posting || (account.type !== "REVENUE" && account.type !== "EXPENSE")) details.push({ field: `lines.${i}.account_id`, issue: "invalid", message: `Line ${i + 1}: choose a revenue or expense posting account` });
    if (own && (!l.department_id || !own.includes(l.department_id))) details.push({ field: `lines.${i}.department_id`, issue: "scope", message: `Line ${i + 1}: you can budget only for your own department` });
    const months = Array.from({ length: 12 }, (_, m) => l.months?.[m] ?? "0");
    if (months.some((m) => !/^\d+(\.\d+)?$/.test(String(m || "0")))) details.push({ field: `lines.${i}.months`, issue: "number", message: `Line ${i + 1}: enter amounts of zero or more` });
    const key = `${l.account_id}|${l.department_id ?? ""}|${l.branch_id ?? ""}`;
    if (keys.has(key)) details.push({ field: `lines.${i}.account_id`, issue: "duplicate", message: `Line ${i + 1}: this account and dimension is already budgeted` });
    keys.add(key);
    if (account) {
      next.push({
        id: `bl-${Date.now().toString(36)}-${(counter += 1)}`, account_id: account.id, account_code: account.code, account_name: account.name, account_name_km: account.name_km,
        department_id: l.department_id || null, branch_id: l.branch_id || null, months: months.map((m) => money(m || 0)), total: "0", comment: l.comment ?? "",
      });
    }
  });
  if (details.length) return invalid(details);
  // A department manager's save replaces only their own departments' lines.
  b.lines = own ? [...b.lines.filter((l) => !l.department_id || !own.includes(l.department_id)), ...next] : next;
  Object.assign(b, budgetTotals(b, db().accounts));
  return null;
}

export function pendingBudgetApprovals(user: MockUser): ApprovalItem[] {
  if (!hasPermission(user.permissions, "bud.approve")) return [];
  return db().budgets.filter((b) => b.status === "SUBMITTED").map((b) => ({
    id: `apr-${b.id}`, document_type: "BUDGET" as const, document_id: b.id, number: `v${b.version}`, date: b.history.find((h) => h.action === "SUBMITTED")?.at.slice(0, 10) ?? MOCK_TODAY,
    description: `${b.name} — ${b.reason}`, total: b.total_expense, currency: "USD", preparer_id: b.preparer_id, preparer_name: b.preparer_name,
    submitted_at: b.history.find((h) => h.action === "SUBMITTED")?.at ?? now(), step: 1, step_role: "OWNER",
  }));
}

export const budgetHandlers = [
  route("get", "/budgets", "bud.view", ({ user, url }) => {
    const fy = url.searchParams.get("fiscal_year_id");
    return paginate(db().budgets.filter((b) => !fy || b.fiscal_year_id === fy).sort((a, b) => b.version - a.version).map((b) => view(b, user)), url);
  }),

  route("get", "/budgets/use", "bud.view", ({ user, url }) => HttpResponse.json({ data: budgetUse(db(), url.searchParams.get("date") || MOCK_TODAY, scoped(user)) })),

  route("get", "/budgets/:id", "bud.view", (ctx) => {
    const b = find(ctx);
    return b instanceof Response ? b : HttpResponse.json(view(b, ctx.user));
  }),

  // A new version: blank, or a copy of another version with an optional percentage change (FR-BUD-005).
  route<{ fiscal_year_id: string; name: string; reason: string; copy_from?: string | null; percent_change?: string }>("post", "/budgets", "bud.create", (ctx) => {
    const fy = db().fiscalYears.find((y) => y.id === ctx.body?.fiscal_year_id);
    if (!fy) return invalid([{ field: "fiscal_year_id", issue: "required", message: "Choose the fiscal year" }]);
    if (!ctx.body.reason?.trim()) return invalid([{ field: "reason", issue: "required", message: "Enter the reason for this version" }]);
    if (db().budgets.some((b) => b.fiscal_year_id === fy.id && (b.status === "DRAFT" || b.status === "SUBMITTED" || b.status === "REJECTED"))) {
      return fail(409, "DUPLICATE_RECORD", "A version for this year is already being prepared", [{ field: "fiscal_year_id", issue: "in_progress" }]);
    }
    const source = ctx.body.copy_from ? db().budgets.find((b) => b.id === ctx.body.copy_from) : null;
    const factor = new Decimal(100).plus(ctx.body.percent_change || 0).div(100);
    const version = Math.max(0, ...db().budgets.filter((b) => b.fiscal_year_id === fy.id).map((b) => b.version)) + 1;
    const b: Budget = {
      id: `bud-${Date.now().toString(36)}-${(counter += 1)}`, fiscal_year_id: fy.id, fiscal_year_name: fy.name, version, name: ctx.body.name?.trim() || `${fy.name} budget v${version}`,
      status: "DRAFT", reason: ctx.body.reason.trim(),
      lines: (source?.lines ?? []).map((l) => ({ ...l, id: `bl-${Date.now().toString(36)}-${(counter += 1)}`, months: l.months.map((m) => new Decimal(m).times(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)) })),
      total_revenue: "0", total_expense: "0", approval_steps: [], rejection_comment: null, preparer_id: ctx.user.id, preparer_name: ctx.user.full_name, approved_by: null, approved_at: null,
      history: [], row_version: 0,
    };
    Object.assign(b, budgetTotals(b, db().accounts));
    log(b, ctx.user, "CREATED", source ? `Copied from v${source.version}${ctx.body.percent_change ? ` ${ctx.body.percent_change} %` : ""}` : null);
    db().budgets.push(b);
    return HttpResponse.json(view(b, ctx.user), { status: 201 });
  }),

  route<{ lines: BudgetLineInput[]; version?: number }>("put", "/budgets/:id/lines", null, (ctx) => {
    if (!hasPermission(ctx.user.permissions, "bud.edit") && !hasPermission(ctx.user.permissions, "bud.create")) return fail(403, "FORBIDDEN", "Permission bud.edit is required.");
    const b = find(ctx);
    if (b instanceof Response) return b;
    if (b.status !== "DRAFT" && b.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft version can be changed; approved versions are locked.");
    const stale = versionConflict(ctx, b.row_version);
    if (stale) return stale;
    const bad = applyLines(b, ctx.body?.lines ?? [], ctx.user);
    if (bad) return bad;
    b.status = "DRAFT";
    log(b, ctx.user, "EDITED");
    return HttpResponse.json(view(b, ctx.user));
  }),

  route("post", "/budgets/:id/submit", null, (ctx) => {
    if (!hasPermission(ctx.user.permissions, "bud.submit") && !hasPermission(ctx.user.permissions, "bud.edit")) return fail(403, "FORBIDDEN", "Permission bud.submit is required.");
    const b = find(ctx);
    if (b instanceof Response) return b;
    if (b.status !== "DRAFT" && b.status !== "REJECTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft version can be submitted.");
    if (!b.lines.length) return invalid([{ field: "lines", issue: "required", message: "Add at least one budget line" }]);
    b.status = "SUBMITTED";
    b.rejection_comment = null;
    b.approval_steps = [{ step: 1, role: "OWNER", status: "PENDING", approver_name: null, acted_at: null, comment: null }];
    log(b, ctx.user, "SUBMITTED");
    return HttpResponse.json(view(b, ctx.user));
  }),

  // BR-BUD-002 / AT-BUD-02: approving a version supersedes the previously approved one.
  route<{ action: "approve" | "reject"; comment?: string }>("post", "/budgets/:id/approve", "bud.approve", (ctx) =>
    idempotent(ctx, () => {
      const b = find(ctx);
      if (b instanceof Response) return asOutcome(b);
      if (b.status !== "SUBMITTED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", `A ${b.status} version cannot be approved or rejected.`));
      const submitter = [...b.history].reverse().find((h) => h.action === "SUBMITTED")?.user_name;
      if (!db().reducedSod && (b.preparer_id === ctx.user.id || submitter === ctx.user.full_name)) return asOutcome(fail(403, "SOD_VIOLATION", "You prepared this budget and cannot approve it"));
      const step = b.approval_steps[0];
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) return asOutcome(invalid([{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        Object.assign(step, { status: "REJECTED", approver_name: ctx.user.full_name, acted_at: now(), comment: ctx.body.comment.trim() });
        b.status = "REJECTED";
        b.rejection_comment = ctx.body.comment.trim();
        log(b, ctx.user, "REJECTED", b.rejection_comment);
        return { status: 200, body: view(b, ctx.user) };
      }
      for (const old of db().budgets.filter((x) => x.fiscal_year_id === b.fiscal_year_id && x.status === "APPROVED")) {
        old.status = "SUPERSEDED";
        log(old, ctx.user, "SUPERSEDED", `By v${b.version}`);
      }
      Object.assign(step, { status: "APPROVED", approver_name: ctx.user.full_name, acted_at: now() });
      Object.assign(b, { status: "APPROVED", approved_by: ctx.user.full_name, approved_at: now() });
      log(b, ctx.user, "APPROVED");
      checkBudgetAlerts(db());
      return { status: 200, body: view(b, ctx.user) };
    }),
  ),
];

/** Approved budget for an account and department, and what remains this year (FR-EXP-011; D-13 warn only). */
export function spendingBudget(accountId: string, departmentId: string | null, date: string, spent: Decimal): { budget: string | null; remaining: string | null } {
  const fy = fiscalYearOf(date);
  const b = fy ? approvedFor(db(), fy.id) : undefined;
  const lines = b?.lines.filter((l) => l.account_id === accountId && (!departmentId || !l.department_id || l.department_id === departmentId)) ?? [];
  if (!lines.length) return { budget: null, remaining: null };
  const total = lines.reduce((s, l) => s.plus(l.total), ZERO);
  return { budget: money(total), remaining: money(total.minus(spent)) };
}
