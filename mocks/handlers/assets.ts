import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { DepreciationRun, FixedAsset, FixedAssetInput, ScheduleRow } from "@/lib/api/types/assets";
import type { Invoice } from "@/lib/api/types/arap";
import type { ApprovalItem } from "@/lib/api/types/journals";
import { schedule } from "@/lib/money/depreciation";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { depreciationJournalLines, GO_LIVE_PERIOD, postedAccumulated, refreshAsset, runAmount, termsOf } from "../db/advanced";
import { line, postJournal } from "../db/posting";
import { MOCK_TODAY, type MockUser } from "../db/seed";
import { fail, idempotent, paginate, route, versionConflict, type Ctx } from "../http";
import { asOutcome, nextNumber, visibleCashBankAccounts } from "./cashbank";
import { checkPeriod } from "./journals";

// SRS §6.12 Fixed Asset Management: FR-FA-001..011, BR-FA-001..003, AT-FA-01..03, SCR-14.

const now = () => new Date().toISOString();
let counter = 0;
const money = (d: Decimal.Value | null | undefined) => new Decimal(d || 0).toFixed(2);
const invalid = (details: { field: string; issue: string; message: string; value?: string }[]) => fail(422, "VALIDATION_ERROR", details[0].message, details);
const log = (a: { id: string; history: FixedAsset["history"]; version: number }, user: MockUser, action: string, comment?: string | null) => {
  a.history.push({ id: `${a.id}-h${a.history.length + 1}`, at: now(), user_name: user.full_name, action, comment: comment ?? null });
  a.version += 1;
};
const periodOf = (id: string) => db().fiscalYears.flatMap((y) => y.periods).find((p) => p.id === id);
const periodName = (code: string) => db().fiscalYears.flatMap((y) => y.periods).find((p) => p.code === code)?.name ?? code;

function canSee(a: FixedAsset, user: MockUser) {
  // Department managers see their own departments' assets (SRS §6.12 actors).
  return !user.roles.includes("DEPTMGR") || (a.department_id !== null && user.department_ids.includes(a.department_id));
}

function find(ctx: Ctx): FixedAsset | Response {
  const a = db().assets.find((x) => x.id === ctx.params.id);
  return a && canSee(a, ctx.user) ? a : fail(404, "NOT_FOUND", "Asset not found.");
}

const hasPostedDepreciation = (a: FixedAsset) => Object.keys(db().depreciationPosted[a.id] ?? {}).length > 0;

function view(a: FixedAsset): FixedAsset {
  refreshAsset(db(), a);
  return a;
}

function applyInput(a: FixedAsset, input: FixedAssetInput) {
  const cat = db().assetCategories.find((c) => c.id === input.category_id);
  Object.assign(a, {
    name: (input.name ?? "").trim(), name_km: (input.name_km ?? "").trim(), category_id: input.category_id ?? "", category_name: cat?.name ?? "", category_name_km: cat?.name_km ?? "",
    cost: money(input.cost), residual_value: money(input.residual_value), useful_life_months: Math.trunc(Number(input.useful_life_months) || 0),
    method: input.method || cat?.method || "STRAIGHT_LINE", declining_rate: input.method === "DECLINING_BALANCE" ? money(input.declining_rate) : null,
    convention: input.convention || cat?.convention || "NEXT_MONTH", acquisition_date: input.acquisition_date ?? "", in_service_date: input.in_service_date || input.acquisition_date || "",
    supplier_name: input.supplier_name ?? "", location: input.location ?? "", branch_id: input.branch_id || null, department_id: input.department_id || null, custodian: input.custodian ?? "",
  });
}

function validate(a: FixedAsset, input?: Pick<FixedAssetInput, "funding" | "funding_account_id" | "accumulated_brought_forward">) {
  const details: { field: string; issue: string; message: string }[] = [];
  if (!a.name) details.push({ field: "name", issue: "required", message: "Enter the asset name" });
  if (!db().assetCategories.some((c) => c.id === a.category_id)) details.push({ field: "category_id", issue: "required", message: "Choose a category" });
  if (!new Decimal(a.cost).gt(0)) details.push({ field: "cost", issue: "positive", message: "Cost must be greater than zero" });
  if (new Decimal(a.residual_value).isNegative() || new Decimal(a.residual_value).gte(a.cost)) details.push({ field: "residual_value", issue: "range", message: "Residual value must be less than cost" });
  if (a.useful_life_months <= 0) details.push({ field: "useful_life_months", issue: "positive", message: "Useful life must be at least one month" });
  if (a.method === "DECLINING_BALANCE" && !(new Decimal(a.declining_rate ?? "0").gt(0) && new Decimal(a.declining_rate ?? "0").lte(100))) details.push({ field: "declining_rate", issue: "range", message: "Enter a rate between 0 and 100 %" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.acquisition_date)) details.push({ field: "acquisition_date", issue: "required", message: "Enter the acquisition date" });
  if (a.in_service_date < a.acquisition_date) details.push({ field: "in_service_date", issue: "range", message: "The in-service date cannot be before acquisition" });
  if (input?.funding === "POST" && !input.funding_account_id) details.push({ field: "funding_account_id", issue: "required", message: "Choose the account the asset was paid from or owed to" });
  if (input?.funding === "ALREADY_POSTED" && new Decimal(input.accumulated_brought_forward || "0").gt(0)) {
    if (a.in_service_date.slice(0, 7) > GO_LIVE_PERIOD) details.push({ field: "accumulated_brought_forward", issue: "go_live", message: "Depreciation brought forward is only for assets in service before go-live" });
    if (new Decimal(input.accumulated_brought_forward ?? "0").gt(new Decimal(a.cost).minus(a.residual_value))) details.push({ field: "accumulated_brought_forward", issue: "range", message: "Brought-forward depreciation cannot exceed cost less residual value" });
  }
  return details.length ? invalid(details) : null;
}

/** FR-AP-005: posting a supplier invoice line marked as an asset creates a draft asset to complete. */
export function capitaliseFromInvoice(inv: Invoice, user: MockUser) {
  for (const l of inv.lines.filter((x) => x.is_asset)) {
    const cat = db().assetCategories.find((c) => c.cost_account_id === l.account_id) ?? db().assetCategories.find((c) => c.id === "fac-furniture")!;
    const id = `fa-${Date.now().toString(36)}-${(counter += 1)}`;
    const tag = `FA-${String(db().sequences.FA).padStart(4, "0")}`;
    db().sequences.FA += 1;
    db().assets.push({
      id, tag, name: l.description, name_km: l.description, category_id: cat.id, category_name: cat.name, category_name_km: cat.name_km, cost: money(l.net), residual_value: "0.00",
      useful_life_months: cat.useful_life_months, method: cat.method, declining_rate: cat.declining_rate, convention: cat.convention, acquisition_date: inv.date, in_service_date: inv.date,
      supplier_name: inv.party_name, source: { type: "AP_INVOICE", id: inv.id, number: inv.number }, location: "", branch_id: l.branch_id, department_id: l.department_id, custodian: "",
      status: "DRAFT", accumulated_brought_forward: "0.00", accumulated: "0.00", net_book_value: money(l.net), last_depreciated_period: null, disposal: null,
      history: [{ id: `${id}-h1`, at: now(), user_name: user.full_name, action: "CREATED", comment: `From ${inv.number}` }], version: 1,
    });
  }
}

function scheduleOf(a: FixedAsset): ScheduleRow[] {
  const posted = db().depreciationPosted[a.id] ?? {};
  const rows: ScheduleRow[] = [];
  let accumulated = new Decimal(0);
  const migrated = a.source.type === "OPENING" || new Decimal(a.accumulated_brought_forward).gt(0);
  for (const m of schedule(termsOf(a))) {
    const opening = new Decimal(a.cost).minus(accumulated);
    accumulated = accumulated.plus(m.amount);
    const state = posted[m.period] ? "POSTED" : migrated && m.period <= GO_LIVE_PERIOD ? "BROUGHT_FORWARD" : "PLANNED";
    rows.push({ period: m.period, opening_nbv: money(opening), depreciation: money(m.amount), accumulated: money(accumulated), closing_nbv: money(m.nbv), state, run_id: posted[m.period] ?? null });
    if (a.status === "DISPOSED" && a.disposal && m.period >= a.disposal.date.slice(0, 7)) break;
  }
  return rows;
}

// ------------------------------------------------------------------ depreciation runs

/** Lines for a period: every active asset in service, not yet depreciated for it (BR-FA-002). */
function computeRun(run: DepreciationRun) {
  run.lines = [];
  run.skipped = [];
  for (const a of db().assets) {
    if (a.status !== "ACTIVE") continue;
    if (db().depreciationPosted[a.id]?.[run.period_code]) {
      run.skipped.push({ asset_id: a.id, tag: a.tag, reason: "Already posted for this period" });
      continue;
    }
    const acc = postedAccumulated(db(), a);
    const amount = runAmount(a, run.period_code, acc);
    if (amount.isZero()) continue;
    run.lines.push({ asset_id: a.id, tag: a.tag, name: a.name, category_id: a.category_id, amount: money(amount), accumulated_after: money(acc.plus(amount)), nbv_after: money(new Decimal(a.cost).minus(acc).minus(amount)), department_id: a.department_id, branch_id: a.branch_id });
  }
  run.total = money(run.lines.reduce((s, l) => s.plus(l.amount), new Decimal(0)));
}

const findRun = (ctx: Ctx) => db().depreciationRuns.find((r) => r.id === ctx.params.id) ?? fail(404, "NOT_FOUND", "Depreciation run not found.");
const alreadyPosted = (code: string) => fail(409, "ALREADY_POSTED", `Depreciation for ${periodName(code)} already posted`, [{ field: "period_id", issue: "posted", value: periodName(code) }]);

export function pendingAssetApprovals(user: MockUser): ApprovalItem[] {
  if (!hasPermission(user.permissions, "fa.approve")) return [];
  const items: ApprovalItem[] = [];
  for (const r of db().depreciationRuns.filter((x) => x.status === "DRAFT" && x.lines.length)) {
    items.push({
      id: `apr-${r.id}`, document_type: "DEPRECIATION_RUN", document_id: r.id, number: r.period_code, date: r.period_end, description: `Depreciation ${periodName(r.period_code)} (${r.lines.length} assets)`,
      total: r.total, currency: "USD", preparer_id: r.preparer_id, preparer_name: r.preparer_name, submitted_at: r.history[0]?.at ?? now(), step: 1, step_role: "FINMGR",
    });
  }
  for (const a of db().assets.filter((x) => x.status === "DISPOSAL_PENDING" && x.disposal)) {
    items.push({
      id: `apr-disp-${a.id}`, document_type: "ASSET_DISPOSAL", document_id: a.id, number: a.tag, date: a.disposal!.date, description: `${a.name} — ${a.disposal!.reason}`,
      total: a.disposal!.proceeds, currency: "USD", preparer_id: a.disposal!.requested_by_id, preparer_name: a.disposal!.requested_by, submitted_at: a.disposal!.requested_at, step: 1, step_role: "FINMGR",
    });
  }
  return items;
}

export const assetHandlers = [
  route("get", "/asset-categories", "fa.view", ({ url }) => paginate(db().assetCategories, url)),

  route("get", "/fixed-assets", "fa.view", ({ user, url }) => {
    const q = url.searchParams;
    const statuses = (q.get("status") ?? "").split(",").filter(Boolean);
    const search = (q.get("search") ?? "").toLowerCase();
    const rows = db().assets.filter((a) => canSee(a, user)).map(view)
      .filter((a) => !statuses.length || statuses.includes(a.status))
      .filter((a) => (!q.get("category_id") || a.category_id === q.get("category_id")) && (!q.get("branch_id") || a.branch_id === q.get("branch_id")) && (!q.get("department_id") || a.department_id === q.get("department_id")))
      .filter((a) => !search || `${a.tag} ${a.name} ${a.name_km} ${a.location} ${a.custodian} ${a.supplier_name}`.toLowerCase().includes(search))
      .sort((a, b) => a.tag.localeCompare(b.tag));
    return paginate(rows, url);
  }),

  route<FixedAssetInput>("post", "/fixed-assets", "fa.create", (ctx) => {
    const input = ctx.body ?? ({} as FixedAssetInput);
    const a: FixedAsset = {
      id: `fa-${Date.now().toString(36)}-${(counter += 1)}`, tag: "", name: "", name_km: "", category_id: "", category_name: "", category_name_km: "", cost: "0", residual_value: "0",
      useful_life_months: 0, method: "STRAIGHT_LINE", declining_rate: null, convention: "NEXT_MONTH", acquisition_date: "", in_service_date: "", supplier_name: "",
      source: { type: input.funding === "POST" ? "MANUAL" : "OPENING", id: null, number: null }, location: "", branch_id: null, department_id: null, custodian: "", status: "ACTIVE",
      accumulated_brought_forward: input.funding === "ALREADY_POSTED" ? money(input.accumulated_brought_forward ?? "0") : "0.00", accumulated: "0", net_book_value: "0", last_depreciated_period: null,
      disposal: null, history: [], version: 0,
    };
    applyInput(a, input);
    const bad = validate(a, input) ?? (input.funding === "POST" ? checkPeriod(a.acquisition_date, "MANUAL", ctx.user, "acquisition_date") : null);
    if (bad) return bad;
    a.tag = `FA-${String(db().sequences.FA).padStart(4, "0")}`;
    db().sequences.FA += 1;
    if (input.funding === "POST") {
      const cat = db().assetCategories.find((c) => c.id === a.category_id)!;
      const funding = db().accounts.find((x) => x.id === input.funding_account_id);
      if (!funding || !funding.is_posting) return invalid([{ field: "funding_account_id", issue: "invalid", message: "Choose a posting account" }]);
      const j = postJournal(db(), {
        date: a.acquisition_date, description: `Acquisition of ${a.tag} ${a.name}`, reference: a.tag, source_type: "FIXED_ASSET", source_no: a.tag, user: ctx.user,
        lines: [line(cat.cost_account_id, a.cost, "0", { description: a.name, department_id: a.department_id, branch_id: a.branch_id }), line(funding.id, "0", a.cost, { description: a.name })],
      });
      a.source = { type: "MANUAL", id: j.id, number: j.journal_no };
    }
    log(a, ctx.user, "CREATED");
    db().assets.push(a);
    return HttpResponse.json(view(a), { status: 201 });
  }),

  route("get", "/fixed-assets/:id", "fa.view", (ctx) => {
    const a = find(ctx);
    return a instanceof Response ? a : HttpResponse.json(view(a));
  }),

  route("get", "/fixed-assets/:id/schedule", "fa.view", (ctx) => {
    const a = find(ctx);
    return a instanceof Response ? a : HttpResponse.json({ data: scheduleOf(a) });
  }),

  // SCR-14: edit before depreciation only.
  route<FixedAssetInput>("patch", "/fixed-assets/:id", "fa.edit", (ctx) => {
    const a = find(ctx);
    if (a instanceof Response) return a;
    if (hasPostedDepreciation(a) || (a.status !== "ACTIVE" && a.status !== "DRAFT")) return fail(409, "INVALID_STATE_TRANSITION", "An asset can be edited only before its first depreciation.");
    const stale = versionConflict(ctx, a.version);
    if (stale) return stale;
    const before = structuredClone(a);
    // The cost of a posted acquisition cannot change here.
    const cost = a.cost;
    applyInput(a, ctx.body);
    if (a.source.type !== "OPENING" && a.status !== "DRAFT") a.cost = cost;
    const bad = validate(a);
    if (bad) {
      Object.assign(a, before);
      return bad;
    }
    log(a, ctx.user, "EDITED");
    return HttpResponse.json(view(a));
  }),

  route("post", "/fixed-assets/:id/activate", "fa.create", (ctx) => {
    const a = find(ctx);
    if (a instanceof Response) return a;
    if (a.status !== "DRAFT") return fail(409, "INVALID_STATE_TRANSITION", "Only a draft asset can be activated.");
    const bad = validate(a);
    if (bad) return bad;
    a.status = "ACTIVE";
    log(a, ctx.user, "ACTIVATED");
    return HttpResponse.json(view(a));
  }),

  // FR-FA-009: transfer between branches, departments or locations; dimension changes are reclassified.
  route<{ date: string; branch_id: string | null; department_id: string | null; location: string; custodian: string; reason: string }>("post", "/fixed-assets/:id/transfer", "fa.edit", (ctx) =>
    idempotent(ctx, () => {
      const a = find(ctx);
      if (a instanceof Response) return asOutcome(a);
      if (a.status !== "ACTIVE" && a.status !== "FULLY_DEPRECIATED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "Only an asset in use can be transferred."));
      const b = ctx.body;
      if (!b?.reason?.trim() || !b.date) return asOutcome(invalid([{ field: "reason", issue: "required", message: "Enter the date and the reason for the transfer" }]));
      const moved = (b.branch_id || null) !== a.branch_id || (b.department_id || null) !== a.department_id;
      const from = `${a.branch_id ?? "—"}/${a.department_id ?? "—"}/${a.location || "—"}`;
      if (moved) {
        const blocked = checkPeriod(b.date, "MANUAL", ctx.user, "date");
        if (blocked) return asOutcome(blocked);
        const cat = db().assetCategories.find((c) => c.id === a.category_id)!;
        const acc = postedAccumulated(db(), a).toFixed(2);
        const oldDims = { branch_id: a.branch_id, department_id: a.department_id };
        const newDims = { branch_id: b.branch_id || null, department_id: b.department_id || null };
        const desc = `Transfer of ${a.tag}`;
        postJournal(db(), {
          date: b.date, description: desc, reference: a.tag, source_type: "FIXED_ASSET", source_no: `${a.tag}-T${a.history.length}`, user: ctx.user,
          lines: [
            line(cat.cost_account_id, a.cost, "0", { description: desc, ...newDims }), line(cat.cost_account_id, "0", a.cost, { description: desc, ...oldDims }),
            ...(new Decimal(acc).gt(0) ? [line(cat.accumulated_account_id, acc, "0", { description: desc, ...oldDims }), line(cat.accumulated_account_id, "0", acc, { description: desc, ...newDims })] : []),
          ],
        });
      }
      Object.assign(a, { branch_id: b.branch_id || null, department_id: b.department_id || null, location: b.location ?? a.location, custodian: b.custodian ?? a.custodian });
      log(a, ctx.user, "TRANSFERRED", `${from} → ${a.branch_id ?? "—"}/${a.department_id ?? "—"}/${a.location || "—"}: ${b.reason.trim()}`);
      return { status: 200, body: view(a) };
    }),
  ),

  // FR-FA-007: disposal is requested, then approved and posted by another user.
  route<{ date: string; proceeds: string; account_id: string | null; reason: string }>("post", "/fixed-assets/:id/dispose", "fa.edit", (ctx) => {
    const a = find(ctx);
    if (a instanceof Response) return a;
    if (a.status !== "ACTIVE" && a.status !== "FULLY_DEPRECIATED") return fail(409, "INVALID_STATE_TRANSITION", "Only an asset in use can be disposed of.");
    const b = ctx.body ?? { date: "", proceeds: "0", account_id: null, reason: "" };
    const proceeds = new Decimal(b.proceeds || 0);
    const details: { field: string; issue: string; message: string }[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "")) details.push({ field: "date", issue: "required", message: "Enter the disposal date" });
    if (proceeds.isNegative()) details.push({ field: "proceeds", issue: "positive", message: "Proceeds cannot be negative" });
    if (proceeds.gt(0) && !visibleCashBankAccounts(ctx.user).some((x) => x.id === b.account_id)) details.push({ field: "account_id", issue: "required", message: "Choose the account that received the proceeds" });
    if (!b.reason?.trim()) details.push({ field: "reason", issue: "required", message: "Enter the reason" });
    if (details.length) return invalid(details);
    a.disposal = { date: b.date, proceeds: money(proceeds), account_id: proceeds.gt(0) ? b.account_id : null, reason: b.reason.trim(), requested_by: ctx.user.full_name, requested_by_id: ctx.user.id, requested_at: now(), gain_loss: null, journal_id: null, journal_no: null };
    a.status = "DISPOSAL_PENDING";
    log(a, ctx.user, "DISPOSAL_REQUESTED", a.disposal.reason);
    return HttpResponse.json(view(a));
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/fixed-assets/:id/disposal/decision", "fa.approve", (ctx) =>
    idempotent(ctx, () => {
      const a = find(ctx);
      if (a instanceof Response) return asOutcome(a);
      if (a.status === "DISPOSED") return asOutcome(fail(409, "ALREADY_POSTED", `${a.tag} is already disposed of.`, [{ field: "status", value: a.tag }]));
      if (a.status !== "DISPOSAL_PENDING" || !a.disposal) return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "No disposal is waiting for approval."));
      if (!db().reducedSod && a.disposal.requested_by_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You requested this disposal and cannot approve it"));
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) return asOutcome(invalid([{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        a.disposal = null;
        a.status = "ACTIVE";
        log(a, ctx.user, "DISPOSAL_REJECTED", ctx.body.comment.trim());
        return { status: 200, body: view(a) };
      }
      const d = a.disposal;
      const blocked = checkPeriod(d.date, "MANUAL", ctx.user, "date");
      if (blocked) return asOutcome(blocked);
      // BR-FA-003: remove cost and accumulated depreciation, record proceeds, post the gain or loss.
      const cat = db().assetCategories.find((c) => c.id === a.category_id)!;
      const acc = postedAccumulated(db(), a);
      const nbv = new Decimal(a.cost).minus(acc);
      const result = new Decimal(d.proceeds).minus(nbv);
      const cash = d.account_id ? db().cashBankAccounts.find((x) => x.id === d.account_id) : null;
      const dims = { department_id: a.department_id, branch_id: a.branch_id, description: `Disposal of ${a.tag}` };
      const j = postJournal(db(), {
        date: d.date, description: `Disposal of ${a.tag} ${a.name}`, reference: a.tag, source_type: "FIXED_ASSET", source_no: `${a.tag}-D`, user: ctx.user,
        lines: [
          ...(cash && new Decimal(d.proceeds).gt(0) ? [line(cash.gl_account_id, d.proceeds, "0", dims)] : []),
          ...(acc.gt(0) ? [line(cat.accumulated_account_id, money(acc), "0", dims)] : []),
          ...(result.lt(0) ? [line(cat.loss_account_id, money(result.abs()), "0", dims)] : []),
          line(cat.cost_account_id, "0", a.cost, dims),
          ...(result.gt(0) ? [line(cat.gain_account_id, "0", money(result), dims)] : []),
        ],
      });
      Object.assign(d, { gain_loss: money(result), journal_id: j.id, journal_no: j.journal_no });
      a.status = "DISPOSED";
      log(a, ctx.user, "DISPOSED", `${result.gte(0) ? "Gain" : "Loss"} ${money(result.abs())}`);
      return { status: 200, body: view(a) };
    }),
  ),

  route("get", "/depreciation-runs", "fa.view", ({ url }) => paginate([...db().depreciationRuns].sort((a, b) => b.period_code.localeCompare(a.period_code)), url)),

  route<{ period_id: string }>("post", "/depreciation-runs", "fa.create", (ctx) => {
    const period = periodOf(ctx.body?.period_id ?? "");
    if (!period) return invalid([{ field: "period_id", issue: "required", message: "Choose the period" }]);
    if (period.start_date > MOCK_TODAY) return invalid([{ field: "period_id", issue: "future", message: "That period has not started yet" }]);
    const open = db().depreciationRuns.find((r) => r.period_code === period.code && (r.status === "DRAFT" || r.status === "APPROVED"));
    if (open) return fail(409, "DUPLICATE_RECORD", `A run for ${period.name} is already in progress`, [{ field: "period_id", issue: "in_progress", value: open.id }]);
    const run: DepreciationRun = {
      id: `dr-${Date.now().toString(36)}-${(counter += 1)}`, number: null, period_id: period.id, period_code: period.code, period_end: period.end_date, status: "DRAFT",
      lines: [], total: "0", skipped: [], approval_steps: [{ step: 1, role: "FINMGR", status: "PENDING", approver_name: null, acted_at: null, comment: null }],
      journal_id: null, journal_no: null, preparer_id: ctx.user.id, preparer_name: ctx.user.full_name, history: [], version: 0,
    };
    computeRun(run);
    // AT-FA-02: running a posted period again finds nothing left to depreciate.
    if (!run.lines.length && run.skipped.length) return alreadyPosted(period.code);
    if (!run.lines.length) return invalid([{ field: "period_id", issue: "empty", message: "No asset needs depreciation for that period" }]);
    log(run, ctx.user, "CREATED");
    db().depreciationRuns.push(run);
    return HttpResponse.json(run, { status: 201 });
  }),

  route("get", "/depreciation-runs/:id", "fa.view", (ctx) => {
    const run = findRun(ctx);
    if (run instanceof Response) return run;
    if (run.status === "DRAFT") computeRun(run);
    return HttpResponse.json(run);
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/depreciation-runs/:id/approve", "fa.approve", (ctx) =>
    idempotent(ctx, () => {
      const run = findRun(ctx);
      if (run instanceof Response) return asOutcome(run);
      if (run.status !== "DRAFT") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", `A ${run.status} run cannot be approved.`));
      if (!db().reducedSod && run.preparer_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You prepared this run and cannot approve it"));
      const step = run.approval_steps[0];
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) return asOutcome(invalid([{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        Object.assign(step, { status: "REJECTED", approver_name: ctx.user.full_name, acted_at: now(), comment: ctx.body.comment.trim() });
        run.status = "CANCELLED";
        log(run, ctx.user, "REJECTED", ctx.body.comment.trim());
        return { status: 200, body: run };
      }
      computeRun(run);
      Object.assign(step, { status: "APPROVED", approver_name: ctx.user.full_name, acted_at: now() });
      run.status = "APPROVED";
      log(run, ctx.user, "APPROVED");
      return { status: 200, body: run };
    }),
  ),

  route("post", "/depreciation-runs/:id/post", "fa.post", (ctx) =>
    idempotent(ctx, () => {
      const run = findRun(ctx);
      if (run instanceof Response) return asOutcome(run);
      if (run.status === "POSTED") return asOutcome(alreadyPosted(run.period_code));
      if (run.status !== "APPROVED") return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "The run must be approved first."));
      // Depreciation is a month-end adjusting entry; soft-closed periods accept it from the Finance Manager.
      const blocked = checkPeriod(run.period_end, "ADJUSTING", ctx.user, "period_id");
      if (blocked) return asOutcome(blocked);
      computeRun(run);
      if (!run.lines.length) return asOutcome(alreadyPosted(run.period_code));
      run.number = nextNumber("DR", run.period_end);
      const j = postJournal(db(), {
        date: run.period_end, description: `Depreciation for ${run.period_code}`, reference: run.number, type: "ADJUSTING", source_type: "DEPRECIATION", source_no: run.number,
        lines: depreciationJournalLines(run, db().assetCategories), user: ctx.user,
      });
      Object.assign(run, { status: "POSTED", journal_id: j.id, journal_no: j.journal_no });
      for (const l of run.lines) (db().depreciationPosted[l.asset_id] ??= {})[run.period_code] = run.id;
      for (const a of db().assets) refreshAsset(db(), a);
      log(run, ctx.user, "POSTED");
      return { status: 200, body: run };
    }),
  ),

  route("post", "/depreciation-runs/:id/cancel", "fa.create", (ctx) => {
    const run = findRun(ctx);
    if (run instanceof Response) return run;
    if (run.status !== "DRAFT" && run.status !== "APPROVED") return fail(409, "INVALID_STATE_TRANSITION", "Only an unposted run can be cancelled.");
    run.status = "CANCELLED";
    log(run, ctx.user, "CANCELLED");
    return HttpResponse.json(run);
  }),
];
