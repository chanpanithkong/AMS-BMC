import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { HistoryEvent } from "@/lib/api/types/common";
import type { JournalEntry } from "@/lib/api/types/journals";
import type { AccountingPeriod, FiscalYear } from "@/lib/api/types/org";
import type { ChecklistItem, PeriodChecklist } from "@/lib/api/types/reports";
import { db } from "../db";
import { buildLines, journalNumber, ledgerLines, netByAccount, totalsOf } from "../db/journals";
import type { MockUser } from "../db/seed";
import { fail, idempotent, route, type Ctx } from "../http";

// SCR-17 Accounting period closure: BR-CLS-001..004, FR-CLS-001..012, WF-12, WF-13.

type Outcome = { status: number; body: unknown };
const asOutcome = async (response: Response): Promise<Outcome> => ({ status: response.status, body: await response.json() });

const periodHistory = new Map<string, HistoryEvent[]>();
const record = (period: AccountingPeriod, user: MockUser, action: string, comment?: string) => {
  const list = periodHistory.get(period.id) ?? [];
  list.push({ id: `${period.id}-h${list.length + 1}`, at: new Date().toISOString(), user_name: user.full_name, action, comment });
  periodHistory.set(period.id, list);
};

function findPeriod(id: string): { year: FiscalYear; period: AccountingPeriod } | null {
  for (const year of db().fiscalYears) {
    const period = year.periods.find((p) => p.id === id);
    if (period) return { year, period };
  }
  return null;
}

const inPeriod = (j: JournalEntry, p: AccountingPeriod) => j.posting_date >= p.start_date && j.posting_date <= p.end_date;

/**
 * Month-end checklist (FR-CLS-003..009). Automatic checks use the data the mock has today; checks for
 * modules that are not built yet answer NOT_AVAILABLE and do not block.
 */
export function buildChecklist(period: AccountingPeriod): PeriodChecklist {
  const store = db();
  const ticks = store.checklist[period.id] ?? {};
  const journals = store.journals.filter((j) => inPeriod(j, period));
  const approved = journals.filter((j) => j.status === "APPROVED").length;
  const pending = journals.filter((j) => j.status === "SUBMITTED").length;
  const suspense = netByAccount(ledgerLines(store.journals, { dateTo: period.end_date })).get("acc-9999") ?? new Decimal(0);
  const depreciation = journals.some((j) => j.reference === `DEP-${period.code}` && (j.status === "POSTED" || j.status === "REVERSED"));
  const lines = ledgerLines(store.journals, { dateFrom: period.start_date, dateTo: period.end_date });
  const dr = lines.reduce((s, l) => s.plus(l.debit_base), new Decimal(0));
  const cr = lines.reduce((s, l) => s.plus(l.credit_base), new Decimal(0));

  const auto = (pass: boolean, en: string, km: string) => ({ result: pass ? "PASS" as const : "FAIL" as const, message: en, message_km: km });
  const na = { result: "NOT_AVAILABLE" as const, message: "Available when the module is built", message_km: "អាចប្រើបាននៅពេលម៉ូឌុលត្រូវបានបង្កើត" };
  const manual = (id: string) => ticks[id];

  const items: ChecklistItem[] = [
    {
      id: "unposted", task: "Post or cancel approved journals", task_km: "កត់ត្រា ឬបោះបង់ទិនានុប្បវត្តិដែលបានអនុម័ត",
      owner_role: "FINMGR", manual: false, blocking: true, evidence: null, completed_by: null,
      status: approved === 0 ? "DONE" : "PENDING",
      auto_check: auto(approved === 0,
        approved === 0 ? "No approved journals waiting" : `${approved} approved journals dated in ${period.name} are not posted`,
        approved === 0 ? "គ្មានទិនានុប្បវត្តិដែលបានអនុម័តកំពុងរង់ចាំ" : `ទិនានុប្បវត្តិដែលបានអនុម័តចំនួន ${approved} ក្នុង${period.name_km} មិនទាន់បានកត់ត្រា`),
    },
    {
      id: "submitted", task: "Decide on journals waiting for approval", task_km: "សម្រេចលើទិនានុប្បវត្តិដែលរង់ចាំការអនុម័ត",
      owner_role: "FINMGR", manual: false, blocking: true, evidence: null, completed_by: null,
      status: pending === 0 ? "DONE" : "PENDING",
      auto_check: auto(pending === 0,
        pending === 0 ? "Nothing waiting for approval" : `${pending} journals dated in ${period.name} are waiting for approval`,
        pending === 0 ? "គ្មានអ្វីរង់ចាំការអនុម័ត" : `ទិនានុប្បវត្តិចំនួន ${pending} ក្នុង${period.name_km} កំពុងរង់ចាំការអនុម័ត`),
    },
    {
      id: "bank", task: "Reconcile every bank account", task_km: "ផ្ទៀងផ្ទាត់គណនីធនាគារទាំងអស់", owner_role: "ACCT",
      manual: false, blocking: false, evidence: null, completed_by: null, status: "PENDING", auto_check: na,
    },
    {
      id: "subledgers", task: "Reconcile receivables and payables to control accounts", task_km: "ផ្ទៀងផ្ទាត់គណនីត្រូវទទួល និងត្រូវសងជាមួយគណនីត្រួតពិនិត្យ",
      owner_role: "ACCT", manual: false, blocking: false, evidence: null, completed_by: null, status: "PENDING", auto_check: na,
    },
    {
      id: "depreciation", task: "Post depreciation", task_km: "កត់ត្រារំលស់", owner_role: "ACCT", manual: false, blocking: false,
      evidence: null, completed_by: null, status: depreciation ? "DONE" : "PENDING",
      auto_check: auto(depreciation, depreciation ? "Depreciation journal posted" : "No depreciation journal for the period",
        depreciation ? "ទិនានុប្បវត្តិរំលស់បានកត់ត្រាហើយ" : "គ្មានទិនានុប្បវត្តិរំលស់សម្រាប់គ្រានេះ"),
    },
    {
      id: "suspense", task: "Clear the suspense account", task_km: "សម្អាតគណនីបណ្តោះអាសន្ន", owner_role: "ACCT", manual: false,
      blocking: false, evidence: null, completed_by: null, status: suspense.isZero() ? "DONE" : "PENDING",
      auto_check: auto(suspense.isZero(), suspense.isZero() ? "Suspense balance is zero" : `Suspense balance is ${suspense.toFixed(2)}`,
        suspense.isZero() ? "សមតុល្យគណនីបណ្តោះអាសន្នស្មើសូន្យ" : `សមតុល្យគណនីបណ្តោះអាសន្ន ${suspense.toFixed(2)}`),
    },
    {
      id: "tb", task: "Trial balance debits equal credits", task_km: "ឥណពន្ធ និងឥណទាននៃតារាងតុល្យភាពសាកល្បងស្មើគ្នា",
      owner_role: "FINMGR", manual: false, blocking: true, evidence: null, completed_by: null, status: dr.eq(cr) ? "DONE" : "PENDING",
      auto_check: auto(dr.eq(cr), dr.eq(cr) ? "Debits equal credits" : "Debits and credits differ", dr.eq(cr) ? "ឥណពន្ធស្មើឥណទាន" : "ឥណពន្ធ និងឥណទានខុសគ្នា"),
    },
    { id: "accruals", task: "Review accruals and prepayments", task_km: "ពិនិត្យការបង្គរ និងបុរេប្រទាន", owner_role: "ACCT", manual: true, blocking: false, evidence: manual("accruals")?.evidence ?? null, completed_by: manual("accruals")?.by ?? null, status: manual("accruals") ? "DONE" : "PENDING", auto_check: null },
    { id: "fx", task: "Revalue foreign-currency balances (if enabled)", task_km: "វាយតម្លៃឡើងវិញនូវសមតុល្យរូបិយប័ណ្ណបរទេស (បើបានបើក)", owner_role: "ACCT", manual: true, blocking: false, evidence: manual("fx")?.evidence ?? null, completed_by: manual("fx")?.by ?? null, status: manual("fx") ? "DONE" : "PENDING", auto_check: null },
    { id: "tax", task: "Review tax accounts", task_km: "ពិនិត្យគណនីពន្ធ", owner_role: "ACCT", manual: true, blocking: false, evidence: manual("tax")?.evidence ?? null, completed_by: manual("tax")?.by ?? null, status: manual("tax") ? "DONE" : "PENDING", auto_check: null },
    { id: "review", task: "Sign off the trial balance and statements", task_km: "ចុះហត្ថលេខាលើតារាងតុល្យភាពសាកល្បង និងរបាយការណ៍", owner_role: "FINMGR", manual: true, blocking: true, evidence: manual("review")?.evidence ?? null, completed_by: manual("review")?.by ?? null, status: manual("review") ? "DONE" : "PENDING", auto_check: null },
  ];
  const blocking = items
    .filter((i) => i.blocking && i.status !== "DONE")
    .map((i) => ({ message: i.auto_check?.result === "FAIL" ? i.auto_check.message : i.task, message_km: i.auto_check?.result === "FAIL" ? i.auto_check.message_km : i.task_km }));
  return { period_id: period.id, status: period.status, items, blocking };
}

function requirePeriod(ctx: Ctx): { year: FiscalYear; period: AccountingPeriod } | Response {
  return findPeriod(ctx.params.id) ?? fail(404, "NOT_FOUND", "Period not found.");
}

const invalid = (period: AccountingPeriod, action: string) =>
  fail(409, "INVALID_STATE_TRANSITION", `A ${period.status.replace("_", "-").toLowerCase()} period cannot be ${action}.`);

/** Year-end closing journal: income and expense balances to retained earnings (BR-CLS-004). */
function closingJournal(year: FiscalYear, user: MockUser): JournalEntry {
  const store = db();
  const net = netByAccount(ledgerLines(store.journals, { dateFrom: year.start_date, dateTo: year.end_date }));
  const pl = store.accounts.filter((a) => a.is_posting && (a.type === "REVENUE" || a.type === "EXPENSE"));
  const inputs = pl
    .map((a) => ({ a, n: net.get(a.id) ?? new Decimal(0) }))
    .filter(({ n }) => !n.isZero())
    .map(({ a, n }) => ({
      account_id: a.id, description: `Year-end close ${year.name}`, debit: n.lt(0) ? n.abs().toFixed(2) : "0", credit: n.gt(0) ? n.toFixed(2) : "0",
      currency: "USD", rate: "1", branch_id: null, department_id: null, dimensions: {},
    }));
  const profit = pl.reduce((s, a) => s.minus(net.get(a.id) ?? 0), new Decimal(0));
  inputs.push({
    account_id: "acc-3200", description: `Year-end close ${year.name}`, debit: profit.lt(0) ? profit.abs().toFixed(2) : "0",
    credit: profit.gt(0) ? profit.toFixed(2) : "0", currency: "USD", rate: "1", branch_id: null, department_id: null, dimensions: {},
  });
  const id = `jnl-ye-${year.id}`;
  const lines = buildLines(inputs, store.accounts, id);
  const now = new Date().toISOString();
  const journal: JournalEntry = {
    id, journal_no: journalNumber(year.end_date.slice(0, 4), store.journalSequence), status: "POSTED", type: "SYSTEM",
    posting_date: year.end_date, document_date: year.end_date, description: `Year-end close ${year.name}`, reference: `YE-${year.name}`,
    currency: "USD", period: year.periods[year.periods.length - 1].code, totals: totalsOf(lines), preparer_id: user.id,
    preparer_name: user.full_name, approver_name: user.full_name, submitted_at: now, posted_at: now, source_type: "YEAR_END",
    source_no: year.name, version: 1, lines, history: [{ id: `${id}-h1`, at: now, user_name: user.full_name, action: "POSTED" }],
    approval_steps: [], attachments: [], reversed_by: null, reverses: null, reversal_reason: null, rejection_comment: null,
  };
  store.journalSequence += 1;
  return journal;
}

export const periodHandlers = [
  route("get", "/accounting-periods/:id/checklist", "cls.period.view", (ctx) => {
    const found = requirePeriod(ctx);
    return found instanceof Response ? found : HttpResponse.json(buildChecklist(found.period));
  }),

  // ASSUMPTION: checklist updates are not in SRS §13.3.
  route<{ done: boolean; evidence?: string }>("patch", "/accounting-periods/:id/checklist/:itemId", "cls.period.manage", (ctx) => {
    const found = requirePeriod(ctx);
    if (found instanceof Response) return found;
    const item = buildChecklist(found.period).items.find((i) => i.id === ctx.params.itemId);
    if (!item) return fail(404, "NOT_FOUND", "Checklist item not found.");
    if (!item.manual) return fail(409, "INVALID_STATE_TRANSITION", "This item follows an automatic check.");
    const ticks = (db().checklist[found.period.id] ??= {});
    if (ctx.body?.done) ticks[item.id] = { evidence: ctx.body.evidence?.trim() || "", by: ctx.user.full_name };
    else delete ticks[item.id];
    record(found.period, ctx.user, ctx.body?.done ? "CHECKLIST_DONE" : "CHECKLIST_UNDONE", item.task);
    return HttpResponse.json(buildChecklist(found.period));
  }),

  route("get", "/accounting-periods/:id/history", "cls.period.view", (ctx) => HttpResponse.json({ data: periodHistory.get(ctx.params.id) ?? [] })),

  route("post", "/accounting-periods/:id/soft-close", "cls.period.manage", (ctx) =>
    idempotent(ctx, async () => {
      const found = requirePeriod(ctx);
      if (found instanceof Response) return asOutcome(found);
      if (found.period.status !== "OPEN") return asOutcome(invalid(found.period, "soft-closed"));
      found.period.status = "SOFT_CLOSED";
      record(found.period, ctx.user, "SOFT_CLOSED");
      return { status: 200, body: found.period };
    }),
  ),

  // ASSUMPTION: returning a soft-closed period to Open ("Open" action on SCR-17).
  route("post", "/accounting-periods/:id/open", "cls.period.manage", (ctx) =>
    idempotent(ctx, async () => {
      const found = requirePeriod(ctx);
      if (found instanceof Response) return asOutcome(found);
      if (found.period.status !== "SOFT_CLOSED") return asOutcome(invalid(found.period, "reopened this way"));
      found.period.status = "OPEN";
      record(found.period, ctx.user, "OPENED");
      return { status: 200, body: found.period };
    }),
  ),

  route("post", "/accounting-periods/:id/close", "cls.period.manage", (ctx) =>
    idempotent(ctx, async () => {
      const found = requirePeriod(ctx);
      if (found instanceof Response) return asOutcome(found);
      const { period, year } = found;
      // Open → Soft-closed → Closed; a reopened period closes again directly (BR-CLS-002).
      if (period.status !== "SOFT_CLOSED" && period.status !== "REOPENED") return asOutcome(invalid(period, "closed"));
      const earlierOpen = year.periods.find((p) => p.period_no < period.period_no && p.status !== "CLOSED");
      if (earlierOpen) {
        return asOutcome(fail(409, "INVALID_STATE_TRANSITION", `Close ${earlierOpen.name} first.`, [{ field: "period", value: earlierOpen.name }]));
      }
      const checklist = buildChecklist(period);
      if (checklist.blocking.length) {
        return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "Blocking checklist items must be resolved before closing.",
          checklist.blocking.map((b) => ({ field: "checklist", issue: "blocking", message: b.message }))));
      }
      period.status = "CLOSED";
      period.reopen_request = null;
      record(period, ctx.user, "CLOSED");
      return { status: 200, body: period };
    }),
  ),

  route<{ reason: string }>("post", "/accounting-periods/:id/reopen-request", "cls.period.reopen.request", (ctx) =>
    idempotent(ctx, async () => {
      const found = requirePeriod(ctx);
      if (found instanceof Response) return asOutcome(found);
      if (found.period.status !== "CLOSED") return asOutcome(invalid(found.period, "reopened"));
      if (!ctx.body?.reason?.trim()) {
        return asOutcome(fail(422, "VALIDATION_ERROR", "A reason is required.", [{ field: "reason", issue: "required", message: "A reason is required." }]));
      }
      if (found.period.reopen_request?.status === "PENDING") {
        return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "A reopen request is already waiting for approval."));
      }
      found.period.reopen_request = {
        requested_by_id: ctx.user.id, requested_by_name: ctx.user.full_name, requested_at: new Date().toISOString(),
        reason: ctx.body.reason.trim(), status: "PENDING",
      };
      record(found.period, ctx.user, "REOPEN_REQUESTED", ctx.body.reason.trim());
      return { status: 200, body: found.period };
    }),
  ),

  // ASSUMPTION: the Owner's decision on a reopen request (SCR-17 "approve reopen"); not in SRS §13.3.
  route<{ action: "approve" | "reject"; comment?: string }>("post", "/accounting-periods/:id/reopen", "cls.period.reopen.approve", (ctx) =>
    idempotent(ctx, async () => {
      const found = requirePeriod(ctx);
      if (found instanceof Response) return asOutcome(found);
      const request = found.period.reopen_request;
      if (found.period.status !== "CLOSED" || request?.status !== "PENDING") {
        return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "There is no reopen request waiting for a decision."));
      }
      // The approver must differ from the requester (BR-CLS-003).
      if (request.requested_by_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You requested this reopening and cannot approve it."));
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) {
          return asOutcome(fail(422, "VALIDATION_ERROR", "A comment is required to reject.", [{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        }
        request.status = "REJECTED";
        record(found.period, ctx.user, "REOPEN_REJECTED", ctx.body.comment.trim());
      } else {
        request.status = "APPROVED";
        found.period.status = "REOPENED";
        record(found.period, ctx.user, "REOPENED", ctx.body?.comment?.trim());
      }
      return { status: 200, body: found.period };
    }),
  ),

  route("post", "/fiscal-years/:id/close", "cls.year.close", (ctx) =>
    idempotent(ctx, async () => {
      const year = db().fiscalYears.find((y) => y.id === ctx.params.id);
      if (!year) return asOutcome(fail(404, "NOT_FOUND", "Fiscal year not found."));
      if (year.status === "CLOSED") return asOutcome(fail(409, "ALREADY_POSTED", `${year.name} is already closed.`));
      const open = year.periods.filter((p) => p.status !== "CLOSED");
      if (open.length) {
        return asOutcome(fail(409, "INVALID_STATE_TRANSITION", `All periods must be closed first (${open.length} still open).`,
          open.map((p) => ({ field: "period", issue: "not_closed", value: p.name }))));
      }
      const journal = closingJournal(year, ctx.user);
      db().journals.push(journal);
      year.status = "CLOSED";
      return { status: 200, body: { fiscal_year: year, closing_journal: journal } };
    }),
  ),
];

export function resetPeriodState() {
  periodHistory.clear();
}
