import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { HistoryEvent } from "@/lib/api/types/common";
import type {
  ApprovalDecision, ApprovalItem, JournalEntry, JournalInput, JournalSummary, ReverseRequest, UserRef,
} from "@/lib/api/types/journals";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { approvalRoute, buildLines, journalNumber, periodFor, totalsOf } from "../db/journals";
import type { MockUser } from "../db/seed";
import { audit, fail, idempotent, paginate, route, versionConflict, type Ctx } from "../http";
import { journalRouteRoles } from "./settings";

// SRS §13.3 /journal-entries and WF-01, WF-14. The controls below mirror the rules the real posting
// service enforces: BR-GL-001/003/004/005/008/009, BR-COA-001/002, BR-CLS-001, BR-SEC-002, FR-RBAC-006.

const now = () => new Date().toISOString();
let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter += 1)}`;

/** step number → user id, for approvals that were delegated. */
const delegations = new Map<string, string>();

function allPeriods() {
  return db().fiscalYears.flatMap((y) => y.periods);
}

function addHistory(journal: JournalEntry, user: MockUser, action: string, comment?: string) {
  const event: HistoryEvent = { id: newId("h"), at: now(), user_name: user.full_name, action, comment };
  journal.history.push(event);
}

function canSee(journal: JournalEntry, user: MockUser): boolean {
  if (!hasPermission(user.permissions, "coa.sensitive.view")) {
    const sensitive = new Set(db().accounts.filter((a) => a.is_sensitive).map((a) => a.id));
    if (journal.lines.some((l) => sensitive.has(l.account_id))) return false;
  }
  // Branch scope (FR-RBAC-004): a journal whose branch lines are all outside the user's branches is hidden.
  if (user.branch_ids?.length && journal.lines.some((l) => l.branch_id) && !journal.lines.some((l) => l.branch_id && user.branch_ids.includes(l.branch_id))) return false;
  // Department managers see journals of their own department only (SRS §4.3 "V (d)").
  if (user.roles.includes("DEPTMGR") && user.department_ids.length) {
    return journal.lines.some((l) => l.department_id && user.department_ids.includes(l.department_id));
  }
  return true;
}

function summary(journal: JournalEntry): JournalSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the detail-only fields
  const { lines, history, approval_steps, attachments, reversed_by, reverses, reversal_reason, rejection_comment, ...rest } = journal;
  return rest;
}

function find(ctx: Ctx): JournalEntry | Response {
  const journal = db().journals.find((j) => j.id === ctx.params.id);
  if (journal && !canSee(journal, ctx.user)) {
    // AT-RBAC-01: out-of-scope records answer 404, and the attempt is logged.
    audit({ user: ctx.user, request: ctx.request, event_type: "journal-entries.access_denied", entity_type: "journal-entries", entity_id: journal.id, outcome: "DENIED", reason: "Outside the user's scope", companyId: ctx.company.id });
  }
  if (!journal || !canSee(journal, ctx.user)) return fail(404, "NOT_FOUND", "Journal not found.");
  return journal;
}

/** Full validation used on submit and again at posting (FR-GL-003). */
function validate(journal: JournalEntry, user: MockUser): Response | null {
  const accounts = db().accounts;
  if (!journal.description.trim()) {
    return fail(422, "VALIDATION_ERROR", "Validation failed", [{ field: "description", issue: "required", message: "Description is required." }]);
  }
  const filled = journal.lines.filter((l) => !new Decimal(l.debit).isZero() || !new Decimal(l.credit).isZero());
  if (filled.length < 2) {
    return fail(422, "VALIDATION_ERROR", "A journal needs at least two lines.", [{ field: "lines", issue: "min_lines", value: "2" }]);
  }
  for (const line of journal.lines) {
    const debit = new Decimal(line.debit);
    const credit = new Decimal(line.credit);
    const field = `lines.${line.line_no - 1}`;
    if ((debit.gt(0) && credit.gt(0)) || (debit.isZero() && credit.isZero()) || debit.lt(0) || credit.lt(0)) {
      return fail(422, "VALIDATION_ERROR", `Line ${line.line_no}: enter a debit or a credit greater than zero, not both.`, [
        { field, issue: "debit_or_credit" },
      ]);
    }
    const account = accounts.find((a) => a.id === line.account_id);
    if (!account || !account.is_posting || !account.is_active) {
      return fail(422, "ACCOUNT_NOT_POSTABLE", `Account ${account?.code ?? "?"} is a header account`, [
        { field: `${field}.account_id`, issue: account ? (account.is_posting ? "inactive" : "header") : "missing", value: account?.code },
      ]);
    }
    // Control accounts are posted by their subledger, not by manual journals (BR-COA-002).
    const manual = journal.type === "MANUAL" || journal.type === "ADJUSTING";
    if (manual && account.is_control && !hasPermission(user.permissions, "coa.control.override")) {
      return fail(422, "ACCOUNT_NOT_POSTABLE", `Account ${account.code} is a control account and cannot be used in a manual journal.`, [
        { field: `${field}.account_id`, issue: "control_account", value: account.code },
      ]);
    }
    if (line.currency !== "USD" && new Decimal(line.rate || 0).lte(0)) {
      return fail(422, "RATE_MISSING", `Exchange rate required for ${line.currency} on ${journal.posting_date}`, [
        { field: `${field}.rate`, issue: "missing", value: line.currency },
      ]);
    }
  }
  const totals = totalsOf(journal.lines);
  if (!new Decimal(totals.difference).isZero()) {
    return fail(422, "JOURNAL_UNBALANCED", `Total debits (${totals.debit_base}) do not equal total credits (${totals.credit_base}).`, [
      { field: "lines", issue: "difference", value: new Decimal(totals.difference).abs().toFixed(2) },
    ]);
  }
  return checkPeriod(journal.posting_date, journal.type, user, "posting_date");
}

/** Closed periods reject posting; soft-closed periods accept adjusting journals from permitted users (BR-CLS-001). */
export function checkPeriod(date: string, type: string, user: MockUser, field: string): Response | null {
  const period = periodFor(allPeriods(), date);
  if (!period) {
    return fail(422, "VALIDATION_ERROR", "The posting date is outside every accounting period.", [
      { field, issue: "no_period", message: "The posting date is outside every accounting period." },
    ]);
  }
  const softBlocked = period.status === "SOFT_CLOSED" && !(type === "ADJUSTING" && hasPermission(user.permissions, "gl.journal.adjust"));
  if (period.status === "CLOSED" || softBlocked) {
    return fail(409, "PERIOD_CLOSED", `Posting date is in a closed period (${period.name})`, [
      { field, issue: period.status === "CLOSED" ? "closed" : "soft_closed", value: period.name },
    ]);
  }
  return null;
}

function applyInput(journal: JournalEntry, input: JournalInput) {
  journal.posting_date = input.posting_date;
  journal.document_date = input.document_date;
  journal.description = input.description ?? "";
  journal.reference = input.reference ?? "";
  journal.currency = input.currency;
  journal.type = input.type === "ADJUSTING" ? "ADJUSTING" : "MANUAL";
  journal.lines = buildLines(input.lines ?? [], db().accounts, journal.id);
  journal.totals = totalsOf(journal.lines);
  journal.period = periodFor(allPeriods(), input.posting_date)?.code ?? null;
}

/** Value limit for approve and post (FR-RBAC-006). */
function overLimit(user: MockUser, journal: JournalEntry): Response | null {
  if (user.approval_limit === null) return null;
  if (new Decimal(journal.totals.debit_base).lte(user.approval_limit)) return null;
  return fail(403, "APPROVAL_LIMIT_EXCEEDED", `Amount exceeds your approval limit (${user.approval_limit})`, [
    { field: "total", issue: "limit", value: user.approval_limit },
  ]);
}

function sodViolation(user: MockUser, journal: JournalEntry, what: string): Response | null {
  if (db().reducedSod || journal.preparer_id !== user.id) return null;
  return fail(403, "SOD_VIOLATION", `You prepared this journal and cannot ${what} it`);
}

function post(journal: JournalEntry, user: MockUser) {
  const store = db();
  journal.journal_no = journalNumber(journal.posting_date.slice(0, 4), store.journalSequence);
  store.journalSequence += 1;
  journal.status = "POSTED";
  journal.posted_at = now();
  journal.version += 1;
  addHistory(journal, user, "POSTED");
}

export const journalHandlers = [
  route("get", "/journal-entries", "gl.journal.view", ({ user, url }) => {
    const q = url.searchParams;
    const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
    const search = (q.get("search") ?? "").trim().toLowerCase();
    const min = q.get("amount_min");
    const max = q.get("amount_max");
    let rows = db().journals.filter((j) => {
      if (!canSee(j, user)) return false;
      if (statuses.length && !statuses.includes(j.status)) return false;
      if (q.get("type") && j.type !== q.get("type")) return false;
      if (q.get("date_from") && j.posting_date < q.get("date_from")!) return false;
      if (q.get("date_to") && j.posting_date > q.get("date_to")!) return false;
      if (q.get("account_id") && !j.lines.some((l) => l.account_id === q.get("account_id"))) return false;
      if (q.get("preparer_id") && j.preparer_id !== q.get("preparer_id")) return false;
      if (q.get("source") && j.source_type !== q.get("source")) return false;
      if (min && new Decimal(j.totals.debit_base).lt(min)) return false;
      if (max && new Decimal(j.totals.debit_base).gt(max)) return false;
      if (search) {
        const haystack = `${j.journal_no ?? ""} ${j.reference} ${j.description}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    const sort = q.get("sort") || "-posting_date";
    const direction = sort.startsWith("-") ? -1 : 1;
    const key = sort.replace(/^-/, "");
    rows = [...rows].sort((a, b) => {
      const byKey =
        key === "total"
          ? new Decimal(a.totals.debit_base).cmp(b.totals.debit_base)
          : key === "journal_no"
            ? (a.journal_no ?? "").localeCompare(b.journal_no ?? "")
            : a.posting_date.localeCompare(b.posting_date) || (a.journal_no ?? "~").localeCompare(b.journal_no ?? "~");
      return byKey * direction;
    });
    return paginate(rows.map(summary), url);
  }),

  route<JournalInput>("post", "/journal-entries", "gl.journal.create", ({ user, body }) => {
    const journal: JournalEntry = {
      id: newId("jnl"), journal_no: null, status: "DRAFT", type: "MANUAL", posting_date: "", document_date: "",
      description: "", reference: "", currency: "USD", period: null,
      totals: { debit_base: "0.00", credit_base: "0.00", difference: "0.00" }, preparer_id: user.id,
      preparer_name: user.full_name, approver_name: null, submitted_at: null, posted_at: null, source_type: null,
      source_no: null, version: 1, lines: [], history: [], approval_steps: [], attachments: [], reversed_by: null,
      reverses: null, reversal_reason: null, rejection_comment: null,
    };
    applyInput(journal, body);
    addHistory(journal, user, "CREATED");
    db().journals.push(journal);
    // A draft may be unbalanced while saving; the response carries the server's totals and difference.
    return HttpResponse.json(journal, { status: 201 });
  }),

  route("get", "/journal-entries/:id", "gl.journal.view", (ctx) => {
    const journal = find(ctx);
    return journal instanceof Response ? journal : HttpResponse.json(journal);
  }),

  route<JournalInput>("patch", "/journal-entries/:id", "gl.journal.edit", (ctx) => {
    const journal = find(ctx);
    if (journal instanceof Response) return journal;
    // Posted entries are immutable (BR-GL-003).
    if (journal.status === "POSTED" || journal.status === "REVERSED") {
      return fail(409, "JOURNAL_POSTED", "Posted journals cannot be edited.");
    }
    if (journal.status !== "DRAFT" && journal.status !== "REJECTED") {
      return fail(409, "INVALID_STATE_TRANSITION", `A ${journal.status} journal cannot be edited.`);
    }
    const stale = versionConflict(ctx, journal.version);
    if (stale) return stale;
    applyInput(journal, ctx.body);
    journal.status = "DRAFT";
    journal.version += 1;
    addHistory(journal, ctx.user, "EDITED");
    return HttpResponse.json(journal);
  }),

  route("post", "/journal-entries/:id/submit", "gl.journal.submit", (ctx) => {
    const journal = find(ctx);
    if (journal instanceof Response) return journal;
    if (journal.status !== "DRAFT" && journal.status !== "REJECTED") {
      return fail(409, "INVALID_STATE_TRANSITION", `A ${journal.status} journal cannot be submitted.`);
    }
    const invalid = validate(journal, ctx.user);
    if (invalid) return invalid;
    journal.status = "SUBMITTED";
    journal.submitted_at = now();
    journal.rejection_comment = null;
    // Route from the approval-rules setting (FR-WFL-001, AT-WFL-01).
    journal.approval_steps = journalRouteRoles(journal.totals.debit_base).map((role, i) => ({ step: i + 1, role, status: "PENDING" as const, approver_name: null, acted_at: null, comment: null }));
    journal.version += 1;
    addHistory(journal, ctx.user, "SUBMITTED");
    return HttpResponse.json(journal);
  }),

  // ASSUMPTION: recall and cancel are named in SCR-04 but have no endpoint in SRS §13.3.
  route("post", "/journal-entries/:id/recall", "gl.journal.submit", (ctx) => {
    const journal = find(ctx);
    if (journal instanceof Response) return journal;
    if (journal.status !== "SUBMITTED") return fail(409, "INVALID_STATE_TRANSITION", "Only a submitted journal can be recalled.");
    if (journal.preparer_id !== ctx.user.id) return fail(403, "FORBIDDEN", "Only the preparer can recall a journal.");
    journal.status = "DRAFT";
    journal.approval_steps = [];
    journal.version += 1;
    addHistory(journal, ctx.user, "RECALLED");
    return HttpResponse.json(journal);
  }),

  route("post", "/journal-entries/:id/cancel", "gl.journal.edit", (ctx) => {
    const journal = find(ctx);
    if (journal instanceof Response) return journal;
    if (journal.status !== "DRAFT" && journal.status !== "REJECTED") {
      return fail(409, "INVALID_STATE_TRANSITION", "Only a draft can be cancelled.");
    }
    journal.status = "CANCELLED";
    journal.version += 1;
    addHistory(journal, ctx.user, "CANCELLED");
    return HttpResponse.json(journal);
  }),

  route<ApprovalDecision>("post", "/journal-entries/:id/approve", "gl.journal.approve", (ctx) =>
    idempotent(ctx, () => {
      const error = (response: Response) => response.json().then((body) => ({ status: response.status, body }));
      const journal = find(ctx);
      if (journal instanceof Response) return error(journal);
      if (journal.status !== "SUBMITTED") {
        return error(fail(409, "INVALID_STATE_TRANSITION", `A ${journal.status} journal cannot be approved or rejected.`));
      }
      // Approver ≠ preparer (BR-SEC-002).
      const sod = sodViolation(ctx.user, journal, "approve");
      if (sod) return error(sod);
      const step = journal.approval_steps.find((s) => s.status === "PENDING");
      if (!step) return error(fail(409, "INVALID_STATE_TRANSITION", "No approval step is pending."));

      const delegated = delegations.get(`${journal.id}:${step.step}`) === ctx.user.id;
      const hasRole = (ctx.user.roles as string[]).includes(step.role);
      // The first step may also be taken by any approver whose limit covers the amount (SRS §4.2 ACCT).
      const withinLimit = step.role === "FINMGR";
      if (!delegated && !hasRole && !withinLimit) {
        return error(fail(403, "FORBIDDEN", `This step is waiting for approval by ${step.role}.`));
      }
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) {
          return error(fail(422, "VALIDATION_ERROR", "A comment is required to reject.", [
            { field: "comment", issue: "required", message: "A comment is required to reject." },
          ]));
        }
        step.status = "REJECTED";
        step.approver_name = ctx.user.full_name;
        step.acted_at = now();
        step.comment = ctx.body.comment.trim();
        journal.status = "REJECTED";
        journal.rejection_comment = step.comment;
        journal.version += 1;
        addHistory(journal, ctx.user, "REJECTED", step.comment);
        return { status: 200, body: journal };
      }
      const limit = overLimit(ctx.user, journal);
      if (limit) return error(limit);
      step.status = "APPROVED";
      step.approver_name = ctx.user.full_name;
      step.acted_at = now();
      step.comment = ctx.body?.comment?.trim() || null;
      journal.approver_name = ctx.user.full_name;
      if (journal.approval_steps.every((s) => s.status === "APPROVED")) journal.status = "APPROVED";
      journal.version += 1;
      addHistory(journal, ctx.user, "APPROVED", step.comment ?? undefined);
      return { status: 200, body: journal };
    }),
  ),

  // ASSUMPTION: delegation is named in SCR-05 but has no endpoint in SRS §13.3.
  route<{ user_id: string }>("post", "/journal-entries/:id/delegate", "gl.journal.approve", (ctx) => {
    const journal = find(ctx);
    if (journal instanceof Response) return journal;
    const step = journal.approval_steps.find((s) => s.status === "PENDING");
    if (journal.status !== "SUBMITTED" || !step) return fail(409, "INVALID_STATE_TRANSITION", "Nothing is waiting for approval.");
    const target = db().users.find((u) => u.id === ctx.body?.user_id);
    if (!target || !hasPermission(target.permissions, "gl.journal.approve")) {
      return fail(422, "VALIDATION_ERROR", "Choose a user who may approve journals.", [{ field: "user_id", issue: "not_approver" }]);
    }
    if (target.id === journal.preparer_id) return fail(403, "SOD_VIOLATION", "The preparer cannot approve this journal.");
    delegations.set(`${journal.id}:${step.step}`, target.id);
    step.approver_name = target.full_name;
    journal.version += 1;
    addHistory(journal, ctx.user, "DELEGATED", target.full_name);
    return HttpResponse.json(journal);
  }),

  route("post", "/journal-entries/:id/post", "gl.journal.post", (ctx) =>
    idempotent(ctx, () => {
      const error = (response: Response) => response.json().then((body) => ({ status: response.status, body }));
      const journal = find(ctx);
      if (journal instanceof Response) return error(journal);
      // A different request for a journal that is already posted (BR-GL-007).
      if (journal.status === "POSTED" || journal.status === "REVERSED") {
        return error(fail(409, "ALREADY_POSTED", `Journal ${journal.journal_no} is already posted.`, [{ field: "journal_no", value: journal.journal_no ?? "" }]));
      }
      if (journal.status !== "APPROVED") {
        return error(fail(409, "INVALID_STATE_TRANSITION", `A ${journal.status} journal cannot be posted; it must be approved first.`));
      }
      const sod = sodViolation(ctx.user, journal, "post");
      if (sod) return error(sod);
      const limit = overLimit(ctx.user, journal);
      if (limit) return error(limit);
      const invalid = validate(journal, ctx.user);
      if (invalid) return error(invalid);
      post(journal, ctx.user);
      return { status: 200, body: journal };
    }),
  ),

  route<ReverseRequest>("post", "/journal-entries/:id/reverse", "gl.journal.reverse", (ctx) =>
    idempotent(ctx, () => {
      const error = (response: Response) => response.json().then((body) => ({ status: response.status, body }));
      const original = find(ctx);
      if (original instanceof Response) return error(original);
      // A journal can be fully reversed only once (BR-GL-004).
      if (original.status === "REVERSED") return error(fail(409, "INVALID_STATE_TRANSITION", "This journal has already been reversed."));
      if (original.status !== "POSTED") return error(fail(409, "INVALID_STATE_TRANSITION", "Only a posted journal can be reversed."));
      if (!ctx.body?.reason?.trim()) {
        // AT-AUD-03.
        return error(fail(422, "REASON_REQUIRED", "A reason is required.", [{ field: "reason", issue: "required", message: "A reason is required." }]));
      }
      const date = ctx.body.reversal_date || original.posting_date;
      // Reversals into closed periods are not allowed (BR-GL-009).
      const closed = checkPeriod(date, "ADJUSTING", ctx.user, "reversal_date");
      if (closed) return error(closed);

      const id = newId("jnl");
      const lines = original.lines.map((l, i) => ({
        ...l, id: `${id}-l${i + 1}`, debit: l.credit, credit: l.debit, debit_base: l.credit_base, credit_base: l.debit_base,
      }));
      const reversal: JournalEntry = {
        ...original, id, journal_no: null, status: "APPROVED", type: "REVERSAL", posting_date: date, document_date: date,
        description: `Reversal of ${original.journal_no}`, period: periodFor(allPeriods(), date)?.code ?? null, lines,
        totals: totalsOf(lines), preparer_id: ctx.user.id, preparer_name: ctx.user.full_name, approver_name: ctx.user.full_name,
        submitted_at: now(), posted_at: null, history: [], approval_steps: [], attachments: [], version: 1, reversed_by: null,
        reverses: { id: original.id, journal_no: original.journal_no! }, reversal_reason: ctx.body.reason.trim(),
        rejection_comment: null, source_type: null, source_no: null,
      };
      addHistory(reversal, ctx.user, "CREATED", reversal.reversal_reason ?? undefined);
      post(reversal, ctx.user);
      db().journals.push(reversal);
      original.status = "REVERSED";
      original.reversed_by = { id: reversal.id, journal_no: reversal.journal_no! };
      original.reversal_reason = reversal.reversal_reason;
      original.version += 1;
      addHistory(original, ctx.user, "REVERSED", reversal.reversal_reason ?? undefined);
      return { status: 201, body: reversal };
    }),
  ),

  // ASSUMPTION: attachment endpoints are not listed in SRS §13.3. The mock stores metadata only.
  route("post", "/journal-entries/:id/attachments", "gl.journal.edit", async (ctx) => {
    const journal = find(ctx);
    if (journal instanceof Response) return journal;
    const form = await ctx.request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(422, "VALIDATION_ERROR", "A file is required.", [{ field: "file", issue: "required" }]);
    journal.attachments.push({
      id: newId("att"), file_name: file.name, content_type: file.type, size: file.size, uploaded_at: now(),
      uploaded_by: ctx.user.full_name,
    });
    addHistory(journal, ctx.user, "ATTACHMENT_ADDED", file.name);
    return HttpResponse.json(journal, { status: 201 });
  }),

  route("delete", "/journal-entries/:id/attachments/:attachmentId", "gl.journal.edit", (ctx) => {
    const journal = find(ctx);
    if (journal instanceof Response) return journal;
    if (journal.status === "POSTED" || journal.status === "REVERSED") return fail(409, "JOURNAL_POSTED", "Posted journals cannot be changed.");
    journal.attachments = journal.attachments.filter((a) => a.id !== ctx.params.attachmentId);
    return HttpResponse.json(journal);
  }),


  // ASSUMPTION: list of users who may take over an approval (for "delegate").
  route("get", "/users/approvers", "gl.journal.approve", ({ user, url }) => {
    const permission = url.searchParams.get("permission") ?? "gl.journal.approve";
    const users: UserRef[] = db()
      .users.filter((u) => u.id !== user.id && hasPermission(u.permissions, permission))
      .map((u) => ({ id: u.id, full_name: u.full_name, full_name_km: u.full_name_km, roles: u.roles }));
    return paginate(users, url);
  }),
];

/** Journals waiting for this user's decision (SRS §13.3 GET /approvals). */
export function pendingJournalApprovals(user: MockUser): ApprovalItem[] {
  if (!hasPermission(user.permissions, "gl.journal.approve")) return [];
  const items: ApprovalItem[] = [];
  for (const journal of db().journals) {
    if (journal.status !== "SUBMITTED" || !canSee(journal, user)) continue;
    const step = journal.approval_steps.find((s) => s.status === "PENDING");
    if (!step) continue;
    const mine = (user.roles as string[]).includes(step.role) || step.role === "FINMGR" || delegations.get(`${journal.id}:${step.step}`) === user.id;
    if (!mine) continue;
    items.push({
      id: `apr-${journal.id}`, document_type: "JOURNAL", document_id: journal.id, number: journal.reference || journal.id,
      date: journal.posting_date, description: journal.description, total: journal.totals.debit_base, currency: "USD",
      preparer_id: journal.preparer_id, preparer_name: journal.preparer_name, submitted_at: journal.submitted_at ?? now(),
      step: step.step, step_role: step.role,
    });
  }
  return items;
}

export function resetJournalState() {
  delegations.clear();
}
