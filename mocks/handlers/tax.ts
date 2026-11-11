import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { TaxCode } from "@/lib/api/types/arap";
import { addDays, rateOn } from "@/lib/money/invoice";
import { db } from "../db";
import { MOCK_TODAY, type MockUser } from "../db/seed";
import { fail, paginate, route, versionConflict, type Ctx } from "../http";

// SRS §6.13 Tax: FR-TAX-001..007, BR-TAX-001..003, AT-TAX-01..03, SCR-22. Every tax code carries a
// verification status (SRS V-01); the demo codes are illustrative, not a statement of tax law.

type TaxInput = Pick<TaxCode, "code" | "name" | "name_km" | "kind" | "method" | "account_id" | "is_active">;

const now = () => new Date().toISOString();
let counter = 0;

function view(c: TaxCode): TaxCode {
  return { ...c, current_rate: rateOn(c.rates, MOCK_TODAY)?.rate ?? "0", account_code: db().accounts.find((a) => a.id === c.account_id)?.code ?? null };
}

function log(c: TaxCode, user: MockUser, action: string, comment?: string) {
  c.history.push({ id: `${c.id}-h${c.history.length + 1}`, at: now(), user_name: user.full_name, action, comment: comment ?? null });
  c.version += 1;
}

/** Any change to what the code charges or where it posts needs verifying again (V-01). ASSUMPTION. */
function unverify(c: TaxCode) {
  Object.assign(c, { verification: "UNVERIFIED", verified_by: null, verified_at: null });
}

function validate(c: TaxCode): Response | null {
  const details: { field: string; issue: string; message: string }[] = [];
  if (!/^[A-Z0-9-]{2,16}$/.test(c.code)) details.push({ field: "code", issue: "format", message: "Use 2–16 capital letters, digits or hyphens" });
  if (!c.name.trim()) details.push({ field: "name", issue: "required", message: "Enter the name" });
  if (!["OUTPUT", "INPUT", "EXEMPT"].includes(c.kind)) details.push({ field: "kind", issue: "required", message: "Choose the kind" });
  const account = db().accounts.find((a) => a.id === c.account_id);
  if (c.kind !== "EXEMPT" && (!account || !account.is_posting || !account.is_active)) {
    details.push({ field: "account_id", issue: "required", message: "Choose the tax account it posts to (BR-TAX-003)" });
  }
  if (details.length) return fail(422, "VALIDATION_ERROR", details[0].message, details);
  if (db().taxCodes.some((o) => o.id !== c.id && o.code === c.code)) return fail(409, "DUPLICATE_CODE", `Code ${c.code} is already used`, [{ field: "code", issue: "duplicate", value: c.code }]);
  return null;
}

const find = (ctx: Ctx) => db().taxCodes.find((c) => c.id === ctx.params.id) ?? fail(404, "NOT_FOUND", "Tax code not found.");

function apply(c: TaxCode, input: Partial<TaxInput>) {
  Object.assign(c, {
    code: (input.code ?? c.code).trim().toUpperCase(), name: input.name ?? c.name, name_km: input.name_km ?? c.name_km, kind: input.kind ?? c.kind,
    method: input.method ?? c.method, account_id: input.kind === "EXEMPT" ? null : (input.account_id ?? c.account_id), is_active: input.is_active ?? c.is_active,
  });
}

export const taxHandlers = [
  // ASSUMPTION: any signed-in user may read tax codes, because invoice forms need them (ARO, APO hold no tax.view).
  route("get", "/tax-codes", null, ({ url }) => {
    const kinds = (url.searchParams.get("kind") ?? "").split(",").filter(Boolean);
    const active = url.searchParams.get("active");
    const rows = db().taxCodes.filter((c) => (!kinds.length || kinds.includes(c.kind)) && (active !== "true" || c.is_active)).map(view);
    return paginate(rows, url);
  }),

  route<TaxInput & { rate: string; effective_from: string }>("post", "/tax-codes", "tax.create", (ctx) => {
    const c: TaxCode = {
      id: `tax-${Date.now().toString(36)}-${(counter += 1)}`, code: "", name: "", name_km: "", kind: "OUTPUT", method: "EXCLUSIVE", account_id: null, account_code: null,
      verification: "UNVERIFIED", verified_by: null, verified_at: null, verification_note: "", is_active: true, rates: [], current_rate: "0", history: [], version: 0,
    };
    apply(c, ctx.body ?? {});
    const bad = validate(c);
    if (bad) return bad;
    const rate = new Decimal(ctx.body?.rate || 0);
    if (rate.isNegative() || rate.gt(100) || !ctx.body?.effective_from) {
      return fail(422, "VALIDATION_ERROR", "Enter a rate between 0 and 100 and the date it applies from", [{ field: "rate", issue: "range", message: "Enter a rate between 0 and 100 and the date it applies from" }]);
    }
    c.rates = [{ rate: rate.toFixed(), effective_from: ctx.body.effective_from, effective_to: null }];
    log(c, ctx.user, "CREATED");
    db().taxCodes.push(c);
    return HttpResponse.json(view(c), { status: 201 });
  }),

  route("get", "/tax-codes/:id", null, (ctx) => {
    const c = find(ctx);
    return c instanceof Response ? c : HttpResponse.json(view(c));
  }),

  route<Partial<TaxInput>>("patch", "/tax-codes/:id", "tax.manage", (ctx) => {
    const c = find(ctx);
    if (c instanceof Response) return c;
    const stale = versionConflict(ctx, c.version);
    if (stale) return stale;
    const before = structuredClone(c);
    apply(c, ctx.body ?? {});
    const bad = validate(c);
    if (bad) {
      Object.assign(c, before);
      return bad;
    }
    if (c.method !== before.method || c.account_id !== before.account_id || c.kind !== before.kind) unverify(c);
    log(c, ctx.user, "EDITED");
    return HttpResponse.json(view(c));
  }),

  // A new rate from a date; the previous rate ends the day before (no overlap). Posted documents keep
  // the rate they were posted with (BR-TAX-001, AT-TAX-01).
  route<{ rate: string; effective_from: string }>("post", "/tax-codes/:id/rates", "tax.manage", (ctx) => {
    const c = find(ctx);
    if (c instanceof Response) return c;
    const rate = new Decimal(ctx.body?.rate || "-1");
    const from = ctx.body?.effective_from ?? "";
    if (rate.isNegative() || rate.gt(100) || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return fail(422, "VALIDATION_ERROR", "Enter a rate between 0 and 100 and the date it applies from", [{ field: "rate", issue: "range", message: "Enter a rate between 0 and 100 and the date it applies from" }]);
    }
    const last = c.rates[c.rates.length - 1];
    if (last && from <= last.effective_from) {
      return fail(409, "DUPLICATE_RECORD", `The new rate must start after ${last.effective_from}`, [{ field: "effective_from", issue: "overlap", value: last.effective_from }]);
    }
    if (last) last.effective_to = addDays(from, -1) || last.effective_to;
    c.rates.push({ rate: rate.toFixed(), effective_from: from, effective_to: null });
    unverify(c);
    log(c, ctx.user, "RATE_ADDED", `${rate.toFixed()} % from ${from}`);
    return HttpResponse.json(view(c));
  }),

  // ASSUMPTION: recording that a qualified adviser confirmed the code (SRS V-01); not in SRS §13.3.
  route<{ note?: string }>("post", "/tax-codes/:id/verify", "tax.approve", (ctx) => {
    const c = find(ctx);
    if (c instanceof Response) return c;
    if (!ctx.body?.note?.trim()) return fail(422, "VALIDATION_ERROR", "Record who confirmed the code and how", [{ field: "note", issue: "required", message: "Record who confirmed the code and how" }]);
    Object.assign(c, { verification: "VERIFIED", verified_by: ctx.user.full_name, verified_at: now(), verification_note: ctx.body.note.trim() });
    log(c, ctx.user, "VERIFIED", c.verification_note);
    return HttpResponse.json(view(c));
  }),
];
