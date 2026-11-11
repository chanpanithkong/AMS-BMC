import { HttpResponse } from "msw";
import type { SettingsGroup, SettingsGroupId } from "@/lib/api/types/admin";
import type { ApprovalItem } from "@/lib/api/types/journals";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import type { MockUser } from "../db/seed";
import { fail, idempotent, route, versionConflict, type Ctx } from "../http";
import { asOutcome } from "./cashbank";

// SRS §6.22 System Configuration: FR-CFG-001..013, AT-CFG-01 (critical change needs the Owner),
// AT-CFG-02 (currency in use), SCR-19. Groups that mirror live data (branches, departments,
// currencies, dimensions, fiscal years, numbering) read from and write to that data.

const now = () => new Date().toISOString();
const GROUPS: SettingsGroupId[] = ["company", "branches", "departments", "fiscal-years", "currencies", "numbering", "approval-rules", "notifications", "statement-mapping", "templates", "dimensions", "backup-status"];
type Row = Record<string, unknown>;

/** Current value, read from live data where the group mirrors it. */
function current(group: SettingsGroupId): unknown {
  const store = db();
  switch (group) {
    case "branches": return store.companies[0].branches.map((b) => ({ ...b }));
    case "departments": return store.departments.map((d) => ({ id: d.id, code: d.code, name: d.name, name_km: d.name_km, is_active: d.is_active }));
    case "currencies": return store.currencies.map((c) => ({ ...c }));
    case "dimensions": return store.dimensions.map((d) => ({ ...d, values: d.values.map((v) => ({ ...v })) }));
    case "fiscal-years": return store.fiscalYears.map((y) => ({ id: y.id, name: y.name, start_date: y.start_date, end_date: y.end_date, status: y.status, periods: y.periods.length, closed: y.periods.filter((p) => p.status === "CLOSED").length }));
    case "numbering": return (store.settings.numbering.value as Row[]).map((r) => ({ ...r, next_number: r.sequence_key === "journal" ? store.journalSequence : store.sequences[r.sequence_key as string] ?? 1 }));
    default: return structuredClone(store.settings[group].value);
  }
}

function view(group: SettingsGroupId): SettingsGroup {
  const s = db().settings[group];
  return { ...s, value: current(group) };
}

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (value === null || value === undefined || typeof value !== "object") {
    out[prefix || "value"] = value === null || value === undefined ? "" : String(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}[${(v as Row)?.code ?? (v as Row)?.id ?? (v as Row)?.document_type ?? i}${(v as Row)?.above !== undefined ? `>${(v as Row).above}` : ""}]`, out));
    if (!value.length) out[prefix || "value"] = "";
    return out;
  }
  for (const [k, v] of Object.entries(value as Row)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function diff(before: unknown, after: unknown) {
  const a = flatten(before);
  const b = flatten(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).map((k) => ({ field: k, before: a[k] ?? null, after: b[k] ?? null }));
}

const usedCurrencies = () => new Set(db().journals.filter((j) => j.status === "POSTED").flatMap((j) => j.lines.map((l) => l.currency)));
const usedBranches = () => new Set(db().journals.flatMap((j) => j.lines.map((l) => l.branch_id)).filter(Boolean));
const usedDepartments = () => new Set(db().journals.flatMap((j) => j.lines.map((l) => l.department_id)).filter(Boolean));

/** Validation per group; dependencies are checked against data in use (BR-CFG-001). */
function validate(group: SettingsGroupId, value: unknown): Response | null {
  const bad = (field: string, message: string) => fail(422, "VALIDATION_ERROR", message, [{ field, issue: "invalid", message }]);
  if (group === "currencies") {
    const rows = value as { code: string; decimals: number; is_active: boolean }[];
    const keep = new Set(rows.filter((r) => r.is_active).map((r) => r.code));
    const removed = [...usedCurrencies()].filter((c) => !keep.has(c));
    // AT-CFG-02: a currency used in posted documents cannot be removed.
    if (removed.length) return fail(409, "CURRENCY_IN_USE", `${removed[0]} is used in posted documents`, [{ field: "currencies", issue: "in_use", value: removed[0] }]);
    if (!rows.some((r) => r.code === "USD" && r.is_active)) return bad("currencies", "The base currency cannot be removed");
    if (rows.some((r) => !(r.decimals >= 0 && r.decimals <= 4))) return bad("decimals", "Decimals must be 0 to 4");
  }
  if (group === "branches" || group === "departments") {
    const rows = value as { id?: string; code: string; name: string }[];
    if (rows.some((r) => !/^[A-Z0-9]{2,10}$/.test(r.code ?? "") || !r.name?.trim())) return bad("code", "Each row needs a code (2–10 capital letters or digits) and a name");
    if (new Set(rows.map((r) => r.code)).size !== rows.length) return fail(409, "DUPLICATE_CODE", "Codes must be unique", [{ field: "code", issue: "duplicate" }]);
    const ids = new Set(rows.map((r) => r.id).filter(Boolean));
    const used = group === "branches" ? usedBranches() : usedDepartments();
    const gone = [...used].filter((id) => !ids.has(id as string));
    if (gone.length) return fail(409, "RECORD_IN_USE", `${gone[0]} has transactions; deactivate it instead`, [{ field: "rows", issue: "in_use", value: String(gone[0]) }]);
  }
  if (group === "company") {
    const v = value as Row;
    for (const f of ["retained_earnings_account_id", "rounding_account_id", "fx_gain_account_id", "fx_loss_account_id"]) {
      const a = db().accounts.find((x) => x.id === v[f]);
      if (!a || !a.is_posting) return bad(f, "Choose a posting account");
    }
    if (!String(v.name ?? "").trim()) return bad("name", "Enter the company name");
  }
  if (group === "approval-rules") {
    const rows = value as { document_type: string; above: string; steps: string[] }[];
    // WFL validation: a rule must never leave a document without an eligible approver.
    if (rows.some((r) => !r.steps?.length)) return bad("steps", "Every rule needs at least one approver role");
    if (rows.some((r) => !/^\d+(\.\d+)?$/.test(String(r.above)))) return bad("above", "Amounts must be zero or more");
  }
  if (group === "notifications") {
    const v = value as { escalation_hours: number; upcoming_payables_days: number };
    if (!(v.escalation_hours >= 1 && v.escalation_hours <= 720) || !(v.upcoming_payables_days >= 1 && v.upcoming_payables_days <= 90)) return bad("escalation_hours", "Escalation 1–720 hours; payables window 1–90 days");
  }
  return null;
}

/** Write the value into live data or the stored settings. */
function apply(group: SettingsGroupId, value: unknown) {
  const store = db();
  switch (group) {
    case "branches": store.companies[0].branches = (value as Row[]).map((r) => ({ id: (r.id as string) || `br-${String(r.code).toLowerCase()}`, code: r.code as string, name: r.name as string, name_km: (r.name_km as string) || (r.name as string) })); break;
    case "departments": store.departments = (value as Row[]).map((r) => ({ id: (r.id as string) || `dep-${r.code}`, company_id: store.companies[0].id, code: r.code as string, name: r.name as string, name_km: (r.name_km as string) || (r.name as string), is_active: r.is_active !== false })); break;
    case "currencies": store.currencies = (value as Row[]).map((r) => ({ code: r.code as string, name: r.name as string, name_km: (r.name_km as string) ?? "", symbol: (r.symbol as string) ?? "", decimals: Number(r.decimals), is_active: Boolean(r.is_active) })); break;
    case "dimensions": store.dimensions = structuredClone(value) as typeof store.dimensions; break;
    case "numbering":
      for (const r of value as Row[]) {
        const n = Number(r.next_number);
        if (!Number.isFinite(n) || n < 1) continue;
        if (r.sequence_key === "journal") store.journalSequence = Math.max(store.journalSequence, n);
        else store.sequences[r.sequence_key as string] = Math.max(store.sequences[r.sequence_key as string] ?? 1, n);
      }
      store.settings.numbering.value = (value as Row[]).map(({ next_number: _n, ...rest }) => (void _n, rest));
      break;
    case "company": {
      const v = value as Row;
      store.settings.company.value = v;
      store.companies[0].name = v.name as string;
      store.companies[0].name_km = v.name_km as string;
      store.reducedSod = Boolean(v.reduced_sod);
      store.blockUnverifiedTax = Boolean(v.block_unverified_tax);
      break;
    }
    default: store.settings[group].value = value;
  }
}

/** The fields of a change that need the Owner (FR-CFG-013). */
function criticalFields(group: SettingsGroupId, changes: { field: string }[]): string[] {
  const critical = db().settings[group].critical_fields;
  if (!critical.length) return [];
  if (["rules", "lines"].some((c) => critical.includes(c))) return changes.length ? critical : [];
  return [...new Set(changes.map((c) => c.field.replace(/^\[[^\]]*\]\./, "")).filter((f) => critical.includes(f) || critical.some((c) => f.endsWith(`.${c}`))))];
}

function log(group: SettingsGroupId, user: MockUser, action: string, changes: { field: string; before: string | null; after: string | null }[], comment?: string | null) {
  const s = db().settings[group];
  s.history.push({ id: `${group}-h${s.history.length + 1}`, at: now(), user_name: user.full_name, action, comment: comment ?? null, changes });
  s.version += 1;
}

export function pendingSettingApprovals(user: MockUser): ApprovalItem[] {
  if (!hasPermission(user.permissions, "cfg.approve")) return [];
  return GROUPS.filter((g) => db().settings[g].pending).map((g) => {
    const p = db().settings[g].pending!;
    return {
      id: `apr-cfg-${g}`, document_type: "SETTING_CHANGE" as const, document_id: g, number: g, date: p.requested_at.slice(0, 10), description: `${p.fields.join(", ")}: ${p.reason}`,
      total: "0", currency: "USD", preparer_id: p.requested_by_id, preparer_name: p.requested_by, submitted_at: p.requested_at, step: 1, step_role: "OWNER",
    };
  });
}

/** Journal approval route from the approval rules setting (AT-WFL-01). */
export function journalRouteRoles(totalBase: string): string[] {
  const rules = (db().settings["approval-rules"].value as { document_type: string; above: string; steps: string[] }[])
    .filter((r) => r.document_type === "JOURNAL" && Number(totalBase) > Number(r.above))
    .sort((a, b) => Number(b.above) - Number(a.above));
  return rules[0]?.steps ?? ["FINMGR"];
}

const groupOf = (ctx: Ctx) => (GROUPS.includes(ctx.params.group as SettingsGroupId) ? (ctx.params.group as SettingsGroupId) : null);

export const settingsHandlers = [
  route("get", "/settings", "cfg.view", () => HttpResponse.json({
    data: GROUPS.map((g) => ({ group: g, version: db().settings[g].version, pending: Boolean(db().settings[g].pending), read_only: db().settings[g].read_only, critical_fields: db().settings[g].critical_fields })),
  })),

  route("get", "/settings/:group", "cfg.view", (ctx) => {
    const g = groupOf(ctx);
    return g ? HttpResponse.json(view(g)) : fail(404, "NOT_FOUND", "Settings group not found.");
  }),

  route<{ value: unknown; reason?: string; version?: number }>("put", "/settings/:group", "cfg.manage", (ctx) => {
    const g = groupOf(ctx);
    if (!g) return fail(404, "NOT_FOUND", "Settings group not found.");
    const s = db().settings[g];
    if (s.read_only) return fail(409, "INVALID_STATE_TRANSITION", "This group is read-only.");
    if (s.pending) return fail(409, "INVALID_STATE_TRANSITION", "A change to this group is waiting for approval.");
    const stale = versionConflict(ctx, s.version);
    if (stale) return stale;
    const bad = validate(g, ctx.body?.value);
    if (bad) return bad;
    const changes = diff(current(g), ctx.body.value);
    if (!changes.length) return HttpResponse.json(view(g));
    const critical = criticalFields(g, changes);
    if (critical.length) {
      if (!ctx.body.reason?.trim()) return fail(422, "REASON_REQUIRED", "A reason is required for this change", [{ field: "reason", issue: "required" }]);
      s.pending = { value: ctx.body.value, fields: critical, requested_by: ctx.user.full_name, requested_by_id: ctx.user.id, requested_at: now(), reason: ctx.body.reason.trim() };
      log(g, ctx.user, "CHANGE_REQUESTED", changes, ctx.body.reason.trim());
    } else {
      apply(g, ctx.body.value);
      log(g, ctx.user, "EDITED", changes, ctx.body.reason?.trim() || null);
    }
    return HttpResponse.json(view(g));
  }),

  route<{ action: "approve" | "reject"; comment?: string }>("post", "/settings/:group/decision", "cfg.approve", (ctx) =>
    idempotent(ctx, () => {
      const g = groupOf(ctx);
      if (!g) return asOutcome(fail(404, "NOT_FOUND", "Settings group not found."));
      const s = db().settings[g];
      if (!s.pending) return asOutcome(fail(409, "INVALID_STATE_TRANSITION", "No change is waiting."));
      if (s.pending.requested_by_id === ctx.user.id) return asOutcome(fail(403, "SOD_VIOLATION", "You requested this change and cannot approve it"));
      const changes = diff(current(g), s.pending.value);
      if (ctx.body?.action === "reject") {
        if (!ctx.body.comment?.trim()) return asOutcome(fail(422, "VALIDATION_ERROR", "A comment is required to reject.", [{ field: "comment", issue: "required", message: "A comment is required to reject." }]));
        s.pending = null;
        log(g, ctx.user, "CHANGE_REJECTED", changes, ctx.body.comment.trim());
      } else {
        const bad = validate(g, s.pending.value);
        if (bad) return asOutcome(bad);
        apply(g, s.pending.value);
        s.pending = null;
        log(g, ctx.user, "CHANGE_APPROVED", changes);
      }
      return { status: 200, body: view(g) };
    }),
  ),

  // FR-CFG-004: open the next fiscal year with twelve monthly periods.
  route("post", "/settings/fiscal-years/next", "cfg.manage", (ctx) => {
    const store = db();
    const last = [...store.fiscalYears].sort((a, b) => a.start_date.localeCompare(b.start_date)).at(-1)!;
    const year = Number(last.end_date.slice(0, 4)) + 1;
    const id = `fy-${year}`;
    if (store.fiscalYears.some((y) => y.id === id)) return fail(409, "DUPLICATE_RECORD", `FY ${year} already exists`, [{ field: "fiscal_year", issue: "duplicate" }]);
    const names = last.periods.map((p) => [p.name.replace(/\d{4}$/, ""), p.name_km.replace(/\d{4}$/, "")]);
    store.fiscalYears.push({
      id, company_id: last.company_id, name: `FY ${year}`, start_date: `${year}-01-01`, end_date: `${year}-12-31`, status: "OPEN",
      periods: names.map(([en, km], i) => {
        const m = String(i + 1).padStart(2, "0");
        const lastDay = new Date(Date.UTC(year, i + 1, 0)).getUTCDate();
        return { id: `per-${year}-${m}`, fiscal_year_id: id, code: `${year}-${m}`, period_no: i + 1, name: `${en}${year}`, name_km: `${km}${year}`, start_date: `${year}-${m}-01`, end_date: `${year}-${m}-${lastDay}`, status: "OPEN" as const };
      }),
    });
    log("fiscal-years", ctx.user, "CREATED", [{ field: "fiscal_year", before: null, after: `FY ${year}` }]);
    return HttpResponse.json(view("fiscal-years"), { status: 201 });
  }),
];
