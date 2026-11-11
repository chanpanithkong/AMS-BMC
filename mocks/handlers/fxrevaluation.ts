import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { FxRevaluation, FxRevaluationLine } from "@/lib/api/types/planning";
import { addDays } from "@/lib/money/invoice";
import { db } from "../db";
import { outstandingBase } from "../db/arap";
import { accountBalance, line, postJournal, type PostingLine } from "../db/posting";
import { MOCK_TODAY, type MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, type Ctx } from "../http";
import { asOutcome, nextNumber, rateFor, rateMissing } from "./cashbank";
import { checkPeriod } from "./journals";

// SRS §6.16 FR-FX-010, BR-FX-004, AT-FX-03: period-end revaluation of foreign-currency cash and bank
// balances at the closing rate, posted with an automatic reversal on the first day of the next period.

const now = () => new Date().toISOString();
let counter = 0;
const UNREALISED_GAIN = "acc-7400";
const UNREALISED_LOSS = "acc-8410";
const periods = () => db().fiscalYears.flatMap((y) => y.periods);
const periodName = (code: string) => periods().find((p) => p.code === code)?.name ?? code;

function log(r: FxRevaluation, user: MockUser, action: string, comment?: string) {
  r.history.push({ id: `${r.id}-h${r.history.length + 1}`, at: now(), user_name: user.full_name, action, comment: comment ?? null });
}

/** Foreign-currency cash and bank accounts at the period end, revalued at that day's rate. */
function compute(r: FxRevaluation): Response | null {
  const lines: FxRevaluationLine[] = [];
  for (const cb of db().cashBankAccounts.filter((a) => a.currency !== "USD")) {
    const gl = db().accounts.find((a) => a.id === cb.gl_account_id)!;
    const { amount, base } = accountBalance(db(), cb.gl_account_id, r.period_end);
    if (amount.isZero() && base.isZero()) continue;
    // ASSUMPTION: the transaction rate of the last day stands in for a closing rate until closing rates are kept (D-11).
    const rate = rateFor(cb.currency, r.period_end);
    if (!rate) return rateMissing(cb.currency, r.period_end);
    const revalued = amount.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const difference = revalued.minus(base);
    lines.push({
      account_id: gl.id, account_code: gl.code, account_name: gl.name, account_name_km: gl.name_km, currency: cb.currency, foreign_balance: amount.toFixed(cb.currency === "KHR" ? 0 : 2),
      closing_rate: rate, booked_base: base.toFixed(2), revalued_base: revalued.toFixed(2), difference: difference.toFixed(2),
    });
  }
  r.lines = lines;
  r.net_difference = lines.reduce((s, l) => s.plus(l.difference), new Decimal(0)).toFixed(2);
  // Open foreign-currency receivables and payables are listed, not revalued, in this release (D-12).
  const open = new Map<string, Decimal>();
  for (const d of db().invoices.filter((x) => x.posted && x.currency !== "USD" && x.date <= r.period_end)) {
    const key = `${d.kind}|${d.currency}`;
    open.set(key, (open.get(key) ?? new Decimal(0)).plus(outstandingBase(d)));
  }
  r.not_revalued = [...open].filter(([, v]) => !v.isZero()).map(([k, v]) => {
    const [kind, currency] = k.split("|");
    return { label: kind === "AR" ? "Open customer invoices" : "Open supplier invoices", label_km: kind === "AR" ? "វិក្កយបត្រអតិថិជនមិនទាន់ទូទាត់" : "វិក្កយបត្រអ្នកផ្គត់ផ្គង់មិនទាន់ទូទាត់", currency, amount: v.toFixed(2) };
  });
  return null;
}

const find = (ctx: Ctx) => db().fxRevaluations.find((r) => r.id === ctx.params.id) ?? fail(404, "NOT_FOUND", "Revaluation not found.");
const alreadyPosted = (code: string) => fail(409, "ALREADY_POSTED", `Revaluation for ${periodName(code)} already posted`, [{ field: "period_id", issue: "posted", value: periodName(code) }]);

function journalLines(r: FxRevaluation, reverse: boolean): PostingLine[] {
  const out: PostingLine[] = [];
  for (const l of r.lines) {
    const diff = new Decimal(l.difference).times(reverse ? -1 : 1);
    if (diff.isZero()) continue;
    const desc = `${reverse ? "Reversal of " : ""}FX revaluation ${r.period_code} ${l.account_code}`;
    const abs = diff.abs().toFixed(2);
    // The account's currency amount does not change; only its base value moves.
    out.push({ ...line(l.account_id, "0", "0", { currency: l.currency, rate: l.closing_rate, description: desc }), base_override: diff.gt(0) ? { debit: abs, credit: "0" } : { debit: "0", credit: abs } });
    out.push(diff.gt(0) ? line(UNREALISED_GAIN, "0", abs, { description: desc }) : line(UNREALISED_LOSS, abs, "0", { description: desc }));
  }
  return out;
}

export const fxRevaluationHandlers = [
  route("get", "/fx-revaluations", "fx.rate.view", ({ url }) => paginate([...db().fxRevaluations].sort((a, b) => b.period_code.localeCompare(a.period_code)), url)),

  route<{ period_id: string }>("post", "/fx-revaluations", "fx.revalue", (ctx) => {
    const p = periods().find((x) => x.id === ctx.body?.period_id);
    if (!p) return fail(422, "VALIDATION_ERROR", "Choose the period", [{ field: "period_id", issue: "required", message: "Choose the period" }]);
    if (p.end_date > MOCK_TODAY) return fail(422, "VALIDATION_ERROR", "The period has not ended yet", [{ field: "period_id", issue: "future", message: "The period has not ended yet" }]);
    if (db().fxRevaluations.some((r) => r.period_code === p.code && r.status === "POSTED")) return alreadyPosted(p.code);
    const existing = db().fxRevaluations.find((r) => r.period_code === p.code && r.status === "DRAFT");
    const r: FxRevaluation = existing ?? {
      id: `fxr-${Date.now().toString(36)}-${(counter += 1)}`, number: null, period_id: p.id, period_code: p.code, period_end: p.end_date, status: "DRAFT", lines: [], net_difference: "0",
      journal_id: null, journal_no: null, reversal_journal_id: null, reversal_journal_no: null, reversal_date: addDays(p.end_date, 1), not_revalued: [], preparer_name: ctx.user.full_name,
      posted_by: null, history: [],
    };
    const bad = compute(r);
    if (bad) return bad;
    if (!existing) {
      log(r, ctx.user, "CREATED");
      db().fxRevaluations.push(r);
    }
    return HttpResponse.json(r, { status: existing ? 200 : 201 });
  }),

  route("get", "/fx-revaluations/:id", "fx.rate.view", (ctx) => {
    const r = find(ctx);
    return r instanceof Response ? r : HttpResponse.json(r);
  }),

  route("post", "/fx-revaluations/:id/post", "fx.revalue", (ctx) =>
    idempotent(ctx, () => {
      const r = find(ctx);
      if (r instanceof Response) return asOutcome(r);
      if (r.status === "POSTED" || db().fxRevaluations.some((x) => x.period_code === r.period_code && x.status === "POSTED")) return asOutcome(alreadyPosted(r.period_code));
      if (r.status !== "DRAFT") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "Only a previewed revaluation can be posted."));
      const blocked = checkPeriod(r.period_end, "ADJUSTING", ctx.user, "period_id") ?? checkPeriod(r.reversal_date, "MANUAL", ctx.user, "reversal_date") ?? compute(r);
      if (blocked) return asOutcome(blocked);
      const lines = journalLines(r, false);
      if (!lines.length) return asOutcome(fail(422, "VALIDATION_ERROR", "There is no difference to post", [{ field: "lines", issue: "empty", message: "There is no difference to post" }]));
      r.number = nextNumber("FXR", r.period_end);
      const j = postJournal(db(), { date: r.period_end, description: `Unrealised FX revaluation ${r.period_code}`, reference: r.number, type: "ADJUSTING", source_type: "FX_REVALUATION", source_no: r.number, lines, user: ctx.user });
      const rev = postJournal(db(), { date: r.reversal_date, description: `Reversal of FX revaluation ${r.period_code}`, reference: r.number, type: "REVERSAL", source_type: "FX_REVALUATION", source_no: `${r.number}-R`, lines: journalLines(r, true), user: ctx.user });
      Object.assign(r, { status: "POSTED", journal_id: j.id, journal_no: j.journal_no, reversal_journal_id: rev.id, reversal_journal_no: rev.journal_no, posted_by: ctx.user.full_name });
      log(r, ctx.user, "POSTED", `${j.journal_no}, reversed by ${rev.journal_no}`);
      return { status: 200, body: r };
    }),
  ),

  route("post", "/fx-revaluations/:id/cancel", "fx.revalue", (ctx) => {
    const r = find(ctx);
    if (r instanceof Response) return r;
    if (r.status !== "DRAFT") return fail(409, "INVALID_STATE_TRANSITION", "Only a preview can be cancelled.");
    r.status = "CANCELLED";
    log(r, ctx.user, "CANCELLED");
    return HttpResponse.json(r);
  }),
];
