import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type {
  BookLine, Reconciliation, ReconciliationListItem, ReconciliationMatch, StatementImport, StatementLine, StatementMapping,
} from "@/lib/api/types/cashbank";
import { mapRows, parseCsv } from "@/lib/money/statement";
import { db } from "../db";
import type { MockCashBankAccount, MockReconciliation } from "../db/cashbank";
import { ledgerLines } from "../db/journals";
import { accountBalance, line, postJournal } from "../db/posting";
import type { MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, type Ctx } from "../http";
import { asOutcome, nextNumber, visibleCashBankAccounts } from "./cashbank";
import { checkPeriod } from "./journals";

// SRS §6.8 bank reconciliation and statement import: FR-CB-008..013, BR-CB-001, BR-CB-002, WF-08.

const MATCH_WINDOW_DAYS = 3;
const now = () => new Date().toISOString();
let counter = 0;
const dp = (a: MockCashBankAccount) => (a.currency === "KHR" ? 0 : 2);

function bankAccount(ctx: Ctx, id: string | null | undefined): MockCashBankAccount | Response {
  const a = visibleCashBankAccounts(ctx.user).find((x) => x.id === id && x.kind === "BANK");
  return a ?? fail(404, "NOT_FOUND", "Bank account not found.");
}

/** Match ids used by other (completed or open) reconciliations of the same account. */
function matchedElsewhere(rec: MockReconciliation) {
  const statement = new Set<string>();
  const book = new Set<string>();
  for (const r of db().reconciliations) {
    if (r.id === rec.id || r.bank_account_id !== rec.bank_account_id) continue;
    for (const m of r.matches) {
      m.statement_line_ids.forEach((id) => statement.add(id));
      m.book_line_ids.forEach((id) => book.add(id));
    }
  }
  return { statement, book };
}

function lines(rec: MockReconciliation) {
  const account = db().cashBankAccounts.find((a) => a.id === rec.bank_account_id)!;
  const elsewhere = matchedElsewhere(rec);
  const matchOf = (kind: "statement" | "book", id: string) =>
    rec.matches.find((m) => (kind === "statement" ? m.statement_line_ids : m.book_line_ids).includes(id))?.id ?? null;
  const statement: StatementLine[] = db().statementLines
    .filter((s) => s.bank_account_id === rec.bank_account_id && s.date <= rec.statement_date && !elsewhere.statement.has(s.id))
    .map((s) => ({ ...s, match_id: matchOf("statement", s.id) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const book: BookLine[] = ledgerLines(db().journals, { dateTo: rec.statement_date })
    .filter((l) => l.account_id === account.gl_account_id && !elsewhere.book.has(l.id))
    .map((l) => ({
      id: l.id, date: l.journal.posting_date, journal_id: l.journal.id, journal_no: l.journal.journal_no ?? "",
      description: l.description || l.journal.description, reference: l.journal.reference,
      amount: new Decimal(l.debit).minus(l.credit).toFixed(dp(account)), match_id: matchOf("book", l.id),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.journal_no.localeCompare(b.journal_no));
  return { account, statement, book };
}

/** One-to-one suggestions by amount and a ± date window, reference matches first (FR-CB-009). */
function suggest(statement: StatementLine[], book: BookLine[]): Reconciliation["suggestions"] {
  const openBook = book.filter((b) => !b.match_id);
  const used = new Set<string>();
  const out: Reconciliation["suggestions"] = [];
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  for (const s of statement.filter((x) => !x.match_id)) {
    const candidates = openBook.filter((b) => !used.has(b.id) && new Decimal(b.amount).eq(s.amount) && days(b.date, s.date) <= MATCH_WINDOW_DAYS);
    const byRef = candidates.find((b) => s.reference && b.reference && s.reference.toLowerCase() === b.reference.toLowerCase());
    const pick = byRef ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!pick) continue;
    used.add(pick.id);
    out.push({ statement_line_ids: [s.id], book_line_ids: [pick.id], reason: byRef ? "amount_date_reference" : "amount_date" });
  }
  return out;
}

export function summarise(rec: MockReconciliation) {
  const { account, statement, book } = lines(rec);
  const places = dp(account);
  const sum = (xs: { amount: string }[]) => xs.reduce((s, x) => s.plus(x.amount), new Decimal(0));
  const inWindow = statement.filter((s) => !rec.previous_date || s.date > rec.previous_date);
  const linesTotal = sum(inWindow).plus(rec.statement_opening);
  const outstanding = book.filter((b) => !b.match_id);
  const deposits = sum(outstanding.filter((b) => new Decimal(b.amount).gt(0)));
  const payments = sum(outstanding.filter((b) => new Decimal(b.amount).lt(0))).abs();
  const bookBalance = accountBalance(db(), account.gl_account_id, rec.statement_date).amount;
  const adjustedBank = new Decimal(rec.statement_closing).plus(deposits).minus(payments);
  const unrecorded = sum(statement.filter((s) => !s.match_id));
  return {
    account, statement, book,
    summary: {
      statement_opening: new Decimal(rec.statement_opening).toFixed(places),
      statement_closing: new Decimal(rec.statement_closing).toFixed(places),
      statement_lines_total: linesTotal.toFixed(places),
      statement_consistent: linesTotal.eq(rec.statement_closing),
      book_balance: bookBalance.toFixed(places),
      outstanding_deposits: deposits.toFixed(places),
      unpresented_payments: payments.toFixed(places),
      adjusted_bank_balance: adjustedBank.toFixed(places),
      unrecorded_items: unrecorded.toFixed(places),
      difference: adjustedBank.minus(bookBalance).toFixed(places),
    },
  };
}

function toDto(rec: MockReconciliation): Reconciliation {
  const { account, statement, book, summary } = summarise(rec);
  return {
    id: rec.id, bank_account_id: rec.bank_account_id, bank_account_name: account.name, currency: account.currency,
    statement_date: rec.statement_date, previous_date: rec.previous_date, status: rec.status, statement_lines: statement, book_lines: book,
    matches: rec.matches, suggestions: rec.status === "COMPLETED" ? [] : suggest(statement, book), summary, explanation: rec.explanation,
    prepared_by: rec.prepared_by, completed_by: rec.completed_by, completed_at: rec.completed_at, history: rec.history, version: rec.version,
  };
}

function findRec(ctx: Ctx): MockReconciliation | Response {
  const rec = db().reconciliations.find((r) => r.id === ctx.params.id);
  if (!rec || !visibleCashBankAccounts(ctx.user).some((a) => a.id === rec.bank_account_id)) return fail(404, "NOT_FOUND", "Reconciliation not found.");
  return rec;
}

const locked = () => fail(409, "RECONCILIATION_COMPLETED", "This reconciliation is completed and locked.");
const log = (rec: MockReconciliation, user: MockUser, action: string, comment?: string) => {
  rec.history.push({ id: `${rec.id}-h${rec.history.length + 1}`, at: now(), user_name: user.full_name, action, comment });
  rec.version += 1;
};

function addMatch(rec: MockReconciliation, statementIds: string[], bookIds: string[], user: MockUser, auto: boolean): Response | null {
  const { statement, book } = lines(rec);
  const s = statement.filter((x) => statementIds.includes(x.id));
  const b = book.filter((x) => bookIds.includes(x.id));
  if (s.length !== statementIds.length || b.length !== bookIds.length || !s.length || !b.length) {
    return fail(422, "VALIDATION_ERROR", "Choose at least one statement line and one book line that are not matched.", [{ field: "matches", issue: "invalid" }]);
  }
  if ([...s, ...b].some((x) => x.match_id)) return fail(409, "INVALID_STATE_TRANSITION", "A chosen line is already matched.");
  const sSum = s.reduce((t, x) => t.plus(x.amount), new Decimal(0));
  const bSum = b.reduce((t, x) => t.plus(x.amount), new Decimal(0));
  if (!sSum.eq(bSum)) {
    return fail(422, "VALIDATION_ERROR", `The amounts differ by ${sSum.minus(bSum).abs().toFixed(2)}`, [{ field: "matches", issue: "amounts_differ", value: sSum.minus(bSum).abs().toFixed(2) }]);
  }
  const match: ReconciliationMatch = {
    id: `mat-${Date.now().toString(36)}-${(counter += 1)}`, statement_line_ids: statementIds, book_line_ids: bookIds, auto,
    matched_by: user.full_name, matched_at: now(),
  };
  rec.matches.push(match);
  return null;
}

/** The newest statement date already covered for an account. */
const lastDate = (accountId: string) => db().reconciliations.filter((r) => r.bank_account_id === accountId).map((r) => r.statement_date).sort().pop() ?? null;

export const reconciliationHandlers = [
  route("get", "/bank-reconciliations", "cb.bank.view", ({ user, url }) => {
    const accountId = url.searchParams.get("bank_account_id");
    const visible = new Set(visibleCashBankAccounts(user).map((a) => a.id));
    const items: ReconciliationListItem[] = db().reconciliations
      .filter((r) => visible.has(r.bank_account_id) && (!accountId || r.bank_account_id === accountId))
      .map((r) => {
        const { account, summary } = summarise(r);
        return {
          id: r.id, bank_account_id: r.bank_account_id, bank_account_name: account.name, currency: account.currency, statement_date: r.statement_date,
          statement_closing: summary.statement_closing, difference: summary.difference, status: r.status, completed_by: r.completed_by, completed_at: r.completed_at,
        };
      })
      .sort((a, b) => b.statement_date.localeCompare(a.statement_date));
    return paginate(items, url);
  }),

  route<{ bank_account_id: string; statement_date: string; statement_closing: string }>("post", "/bank-reconciliations", "cb.reconcile", (ctx) => {
    const account = bankAccount(ctx, ctx.body?.bank_account_id);
    if (account instanceof Response) return account;
    const details: { field: string; issue: string; message: string }[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.body.statement_date ?? "")) details.push({ field: "statement_date", issue: "required", message: "Enter the statement date" });
    if (!/^-?\d+(\.\d+)?$/.test(ctx.body.statement_closing ?? "")) details.push({ field: "statement_closing", issue: "required", message: "Enter the statement closing balance" });
    if (details.length) return fail(422, "VALIDATION_ERROR", details[0].message, details);
    const mine = db().reconciliations.filter((r) => r.bank_account_id === account.id);
    // The previous reconciliation must be completed first (SRS §13.3).
    if (mine.some((r) => r.status === "IN_PROGRESS")) return fail(409, "INVALID_STATE_TRANSITION", "Complete the reconciliation in progress first.");
    const previous = mine.filter((r) => r.status === "COMPLETED").sort((a, b) => a.statement_date.localeCompare(b.statement_date)).pop();
    if (previous && ctx.body.statement_date <= previous.statement_date) {
      return fail(409, "INVALID_STATE_TRANSITION", `The statement date must be after ${previous.statement_date}.`, [{ field: "statement_date", issue: "overlap", value: previous.statement_date }]);
    }
    const rec: MockReconciliation = {
      id: `rec-${Date.now().toString(36)}-${(counter += 1)}`, bank_account_id: account.id, statement_date: ctx.body.statement_date,
      previous_date: previous?.statement_date ?? null, statement_opening: previous?.statement_closing ?? "0",
      statement_closing: new Decimal(ctx.body.statement_closing).toFixed(dp(account)), status: "IN_PROGRESS", matches: [], explanation: null,
      prepared_by: ctx.user.full_name, completed_by: null, completed_at: null, history: [], version: 0,
    };
    log(rec, ctx.user, "STARTED");
    db().reconciliations.push(rec);
    return HttpResponse.json(toDto(rec), { status: 201 });
  }),

  route("get", "/bank-reconciliations/:id", "cb.bank.view", (ctx) => {
    const rec = findRec(ctx);
    return rec instanceof Response ? rec : HttpResponse.json(toDto(rec));
  }),

  route<{ add?: { statement_line_ids: string[]; book_line_ids: string[] }[]; remove?: string[] }>("post", "/bank-reconciliations/:id/matches", "cb.reconcile", (ctx) => {
    const rec = findRec(ctx);
    if (rec instanceof Response) return rec;
    // Completed reconciliations are locked (BR-CB-001, AT-CB-02).
    if (rec.status === "COMPLETED") return locked();
    for (const id of ctx.body?.remove ?? []) {
      if (!rec.matches.some((m) => m.id === id)) return fail(404, "NOT_FOUND", "Match not found.");
      rec.matches = rec.matches.filter((m) => m.id !== id);
      log(rec, ctx.user, "UNMATCHED");
    }
    for (const m of ctx.body?.add ?? []) {
      const error = addMatch(rec, m.statement_line_ids ?? [], m.book_line_ids ?? [], ctx.user, false);
      if (error) return error;
      log(rec, ctx.user, "MATCHED");
    }
    return HttpResponse.json(toDto(rec));
  }),

  // ASSUMPTION: auto-match applies the server's suggestions (FR-CB-009).
  route("post", "/bank-reconciliations/:id/auto-match", "cb.reconcile", (ctx) => {
    const rec = findRec(ctx);
    if (rec instanceof Response) return rec;
    if (rec.status === "COMPLETED") return locked();
    const { statement, book } = lines(rec);
    const pairs = suggest(statement, book);
    for (const p of pairs) addMatch(rec, p.statement_line_ids, p.book_line_ids, ctx.user, true);
    log(rec, ctx.user, "AUTO_MATCHED", String(pairs.length));
    return HttpResponse.json(toDto(rec));
  }),

  // ASSUMPTION: an adjustment from an unmatched statement line (FR-CB-010): posts a journal and matches it.
  route<{ statement_line_id: string; account_id: string; description: string; date?: string }>(
    "post", "/bank-reconciliations/:id/adjustments", "cb.reconcile", (ctx) =>
      idempotent(ctx, async () => {
        const rec = findRec(ctx);
        if (rec instanceof Response) return asOutcome(rec);
        if (rec.status === "COMPLETED") return asOutcome(locked());
        const { account, statement } = lines(rec);
        const s = statement.find((x) => x.id === ctx.body?.statement_line_id);
        if (!s || s.match_id) return asOutcome(fail(422, "VALIDATION_ERROR", "Choose an unmatched statement line.", [{ field: "statement_line_id", issue: "invalid" }]));
        const target = db().accounts.find((a) => a.id === ctx.body.account_id);
        if (!target || !target.is_posting || target.is_control || target.cash_flow_class === "CASH") {
          return asOutcome(fail(422, "ACCOUNT_NOT_POSTABLE", "Choose an income or expense account for the adjustment.", [{ field: "account_id", issue: "header", value: target?.code ?? "" }]));
        }
        const date = ctx.body.date || s.date;
        // Reconciliation adjustments are period-end adjusting entries (soft-closed periods need gl.journal.adjust).
        const closed = checkPeriod(date, "ADJUSTING", ctx.user, "date");
        if (closed) return asOutcome(closed);
        const amount = new Decimal(s.amount);
        const description = ctx.body.description?.trim() || s.description;
        const number = nextNumber(amount.gt(0) ? "CR" : "BC", date);
        const rate = account.currency === "USD" ? "1" : db().exchangeRates.find((r) => r.from_currency === account.currency && r.rate_date === date)?.rate;
        if (!rate) return asOutcome(fail(422, "RATE_MISSING", `Exchange rate required for ${account.currency} on ${date}`, [{ field: "date", value: account.currency }]));
        const cur = { currency: account.currency, rate, description };
        const journal = postJournal(db(), {
          date, description, reference: s.reference || number, type: "ADJUSTING", source_type: "CB_ADJUSTMENT", source_no: number, user: ctx.user,
          lines: amount.gt(0)
            ? [line(account.gl_account_id, amount.toFixed(), "0", cur), line(target.id, "0", amount.toFixed(), cur)]
            : [line(target.id, amount.abs().toFixed(), "0", cur), line(account.gl_account_id, "0", amount.abs().toFixed(), cur)],
        });
        const bankLine = journal.lines.find((l) => l.account_id === account.gl_account_id)!;
        addMatch(rec, [s.id], [bankLine.id], ctx.user, false);
        log(rec, ctx.user, "ADJUSTED", `${journal.journal_no} ${description}`);
        return { status: 201, body: toDto(rec) };
      }),
  ),

  route<{ explanation?: string }>("post", "/bank-reconciliations/:id/complete", "cb.reconcile.complete", (ctx) =>
    idempotent(ctx, async () => {
      const rec = findRec(ctx);
      if (rec instanceof Response) return asOutcome(rec);
      if (rec.status === "COMPLETED") return asOutcome(fail(409, "RECONCILIATION_COMPLETED", "This reconciliation is already completed."));
      const { summary } = summarise(rec);
      const difference = new Decimal(summary.difference);
      const explanation = ctx.body?.explanation?.trim();
      // Complete only with no difference, or with the difference documented and approved (BR-CB-002, AT-CB-01).
      if (!difference.isZero() && !explanation) {
        return asOutcome(fail(422, "DIFFERENCE_UNRESOLVED", `Difference of ${difference.abs().toFixed(2)} must be resolved or explained before completion`, [
          { field: "difference", issue: "unresolved", value: difference.toFixed(2) },
        ]));
      }
      rec.status = "COMPLETED";
      rec.explanation = difference.isZero() ? null : { reason: explanation!, amount: difference.toFixed(2), approved_by: ctx.user.full_name };
      rec.completed_by = ctx.user.full_name;
      rec.completed_at = now();
      log(rec, ctx.user, "COMPLETED", explanation);
      return { status: 200, body: toDto(rec) };
    }),
  ),

  route<{ reason: string }>("post", "/bank-reconciliations/:id/reopen", "cb.reconcile.reopen", (ctx) => {
    const rec = findRec(ctx);
    if (rec instanceof Response) return rec;
    if (rec.status !== "COMPLETED") return fail(409, "INVALID_STATE_TRANSITION", "Only a completed reconciliation can be reopened.");
    if (!ctx.body?.reason?.trim()) return fail(422, "VALIDATION_ERROR", "A reason is required.", [{ field: "reason", issue: "required", message: "A reason is required." }]);
    // Later reconciliations must be reopened first (BR-CB-001).
    if (lastDate(rec.bank_account_id) !== rec.statement_date) {
      return fail(409, "INVALID_STATE_TRANSITION", "Reopen the later reconciliations of this account first.");
    }
    rec.status = "IN_PROGRESS";
    rec.completed_by = null;
    rec.completed_at = null;
    log(rec, ctx.user, "REOPENED", ctx.body.reason.trim());
    return HttpResponse.json(toDto(rec));
  }),

  // Statement import (FR-CB-008, SCR-25). The mock reads CSV; Excel is converted by the backend.
  route("post", "/bank-statements/import", "cb.statement.import", async (ctx) => {
    const form = await ctx.request.formData();
    const account = bankAccount(ctx, String(form.get("bank_account_id") ?? ""));
    if (account instanceof Response) return account;
    const file = form.get("file");
    if (!(file instanceof File)) return fail(422, "VALIDATION_ERROR", "Choose a file.", [{ field: "file", issue: "required", message: "Choose a file." }]);
    if (!/\.csv$/i.test(file.name)) {
      return fail(422, "VALIDATION_ERROR", "This demo reads CSV files; Excel files are converted by the server.", [{ field: "file", issue: "format", message: "Use a CSV file" }]);
    }
    let mapping: StatementMapping;
    try {
      mapping = JSON.parse(String(form.get("mapping")));
    } catch {
      return fail(422, "VALIDATION_ERROR", "The column mapping is missing.", [{ field: "mapping", issue: "required" }]);
    }
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return fail(422, "VALIDATION_ERROR", "The file has no data rows.", [{ field: "file", issue: "empty", message: "The file has no data rows." }]);
    // Duplicates: same date, amount, reference and description as a line already imported, or earlier in the file.
    const key = (date: string | null, amount: string | null, reference: string, description: string) =>
      `${date}|${amount ? new Decimal(amount).toFixed(2) : ""}|${reference.trim().toLowerCase()}|${description.trim().toLowerCase()}`;
    const existing = new Set(db().statementLines.filter((s) => s.bank_account_id === account.id).map((s) => key(s.date, s.amount, s.reference, s.description)));
    const seen = new Set<string>();
    const preview: StatementImport = {
      id: `imp-${Date.now().toString(36)}-${(counter += 1)}`, bank_account_id: account.id, file_name: file.name, status: "PREVIEW",
      rows: mapRows(rows, mapping).map((r) => {
        const k = key(r.date, r.amount, r.reference, r.description);
        const duplicate = !r.errors.length && (existing.has(k) || seen.has(k));
        seen.add(k);
        return { ...r, status: r.errors.length ? "ERROR" : duplicate ? "DUPLICATE" : "VALID" };
      }),
      counts: { valid: 0, errors: 0, duplicates: 0 }, imported_by: ctx.user.full_name, created_at: now(), committed_at: null, created_lines: 0,
    };
    preview.counts = {
      valid: preview.rows.filter((r) => r.status === "VALID").length,
      errors: preview.rows.filter((r) => r.status === "ERROR").length,
      duplicates: preview.rows.filter((r) => r.status === "DUPLICATE").length,
    };
    account.mapping = mapping;
    db().statementImports.push(preview);
    return HttpResponse.json(preview, { status: 201 });
  }),

  route("post", "/bank-statements/imports/:id/commit", "cb.statement.import", (ctx) =>
    idempotent(ctx, async () => {
      const imp = db().statementImports.find((i) => i.id === ctx.params.id);
      if (!imp || !visibleCashBankAccounts(ctx.user).some((a) => a.id === imp.bank_account_id)) return asOutcome(fail(404, "NOT_FOUND", "Import not found."));
      if (imp.status === "COMMITTED") return asOutcome(fail(409, "ALREADY_POSTED", "This import is already committed."));
      // Only valid rows are created; errors and duplicates are skipped (WF-08 failure handling).
      for (const r of imp.rows.filter((x) => x.status === "VALID")) {
        db().statementLines.push({
          id: `stl-${imp.id}-${r.row_no}`, bank_account_id: imp.bank_account_id, import_id: imp.id, date: r.date!, description: r.description,
          reference: r.reference, amount: new Decimal(r.amount!).toFixed(2), balance: r.balance, match_id: null,
        });
        imp.created_lines += 1;
      }
      imp.status = "COMMITTED";
      imp.committed_at = now();
      return { status: 200, body: imp };
    }),
  ),

  route("get", "/bank-statements/imports", "cb.bank.view", ({ user, url }) => {
    const accountId = url.searchParams.get("bank_account_id");
    const visible = new Set(visibleCashBankAccounts(user).map((a) => a.id));
    const rows = db().statementImports
      .filter((i) => visible.has(i.bank_account_id) && (!accountId || i.bank_account_id === accountId))
      .map((i) => ({ ...i, rows: [] }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return paginate(rows, url);
  }),

  route("get", "/bank-accounts/:id/statement-mapping", "cb.bank.view", (ctx) => {
    const account = bankAccount(ctx, ctx.params.id);
    return account instanceof Response ? account : HttpResponse.json({ mapping: account.mapping });
  }),

  // Mock-only helper: a sample statement for April built from the books, with a fee the books do not have.
  route("get", "/bank-statements/sample", "cb.bank.view", (ctx) => {
    const account = bankAccount(ctx, ctx.url.searchParams.get("bank_account_id"));
    if (account instanceof Response) return account;
    const rows = ledgerLines(db().journals, { dateFrom: "2027-04-01", dateTo: "2027-04-30" })
      .filter((l) => l.account_id === account.gl_account_id && l.journal.source_type !== "CB_ADJUSTMENT")
      .sort((a, b) => a.journal.posting_date.localeCompare(b.journal.posting_date));
    const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const places = dp(account);
    const csv = [
      ["Date", "Description", "Reference", "Debit", "Credit", "Balance"],
      ...rows.map((l) => [fmt(l.journal.posting_date), (l.description || l.journal.description).toUpperCase(), l.journal.reference,
        new Decimal(l.credit).isZero() ? "" : new Decimal(l.credit).toFixed(places), new Decimal(l.debit).isZero() ? "" : new Decimal(l.debit).toFixed(places), ""]),
      [fmt("2027-04-05"), "SMS BANKING FEE", "FEE-0405", (account.currency === "KHR" ? "4000" : "1.00"), "", ""],
    ].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    return new HttpResponse("﻿" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${account.code.toLowerCase()}-2027-04.csv"` },
    });
  }),
];
