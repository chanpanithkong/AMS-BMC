import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { Account } from "@/lib/api/types/accounts";
import type { GeneralLedgerReport, LedgerAccountSection, TrialBalanceReport, TrialBalanceRow } from "@/lib/api/types/reports";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { ledgerLines, netByAccount } from "../db/journals";
import type { MockUser } from "../db/seed";
import { fail, route } from "../http";
import { buildReport, reportCsvRows } from "./statements";

// RPT-01 Trial Balance and RPT-02 General Ledger (SRS §13.3, §15.3). Posted data only.

const ZERO = new Decimal(0);
const MAX_LINES_PER_ACCOUNT = 500;

export function visibleAccounts(user: MockUser): Account[] {
  const seeSensitive = hasPermission(user.permissions, "coa.sensitive.view");
  return db().accounts.filter((a) => seeSensitive || !a.is_sensitive);
}

function levels(accounts: Account[]): Map<string, number> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out = new Map<string, number>();
  for (const a of accounts) {
    let depth = 1;
    let parent = a.parent_id ? byId.get(a.parent_id) : undefined;
    while (parent) {
      depth += 1;
      parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
    }
    out.set(a.id, depth);
  }
  return out;
}

/** A net debit amount shown on the debit or credit side. */
const sides = (net: Decimal): [string, string] => (net.gte(0) ? [net.toFixed(2), "0.00"] : ["0.00", net.abs().toFixed(2)]);

const isDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export function buildTrialBalance(user: MockUser, params: URLSearchParams): TrialBalanceReport | Response {
  const from = params.get("date_from");
  const to = params.get("date_to");
  if (!isDate(from) || !isDate(to) || from > to) {
    return fail(422, "VALIDATION_ERROR", "Choose a valid date range.", [{ field: "date_from", issue: "invalid_range" }]);
  }
  const branchId = params.get("branch_id");
  const includeZero = params.get("include_zero") === "true";
  const maxLevel = Number(params.get("level")) || 99;
  const store = db();
  const accounts = visibleAccounts(user);
  const depth = levels(store.accounts);

  const opening = netByAccount(ledgerLines(store.journals, { before: from, branchId }));
  const movementLines = ledgerLines(store.journals, { dateFrom: from, dateTo: to, branchId });
  const debit = new Map<string, Decimal>();
  const credit = new Map<string, Decimal>();
  for (const l of movementLines) {
    debit.set(l.account_id, (debit.get(l.account_id) ?? ZERO).plus(l.debit_base));
    credit.set(l.account_id, (credit.get(l.account_id) ?? ZERO).plus(l.credit_base));
  }

  // Each posting account, then header rows rolled up from their descendants (FR-COA-002).
  const figures = new Map<string, { open: Decimal; dr: Decimal; cr: Decimal }>();
  for (const a of accounts.filter((x) => x.is_posting)) {
    figures.set(a.id, { open: opening.get(a.id) ?? ZERO, dr: debit.get(a.id) ?? ZERO, cr: credit.get(a.id) ?? ZERO });
  }
  const byId = new Map(store.accounts.map((a) => [a.id, a]));
  for (const [id, f] of [...figures]) {
    let parent = byId.get(id)?.parent_id ? byId.get(byId.get(id)!.parent_id!) : undefined;
    while (parent) {
      const p = figures.get(parent.id) ?? { open: ZERO, dr: ZERO, cr: ZERO };
      figures.set(parent.id, { open: p.open.plus(f.open), dr: p.dr.plus(f.dr), cr: p.cr.plus(f.cr) });
      parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
    }
  }

  const rows: TrialBalanceRow[] = [];
  const totals = { od: ZERO, oc: ZERO, pd: ZERO, pc: ZERO, cd: ZERO, cc: ZERO };
  for (const a of [...accounts].sort((x, y) => x.code.localeCompare(y.code))) {
    const f = figures.get(a.id) ?? { open: ZERO, dr: ZERO, cr: ZERO };
    const closing = f.open.plus(f.dr).minus(f.cr);
    const empty = f.open.isZero() && f.dr.isZero() && f.cr.isZero();
    const level = depth.get(a.id) ?? 1;
    if (level > maxLevel || (empty && !includeZero)) continue;
    const [od, oc] = sides(f.open);
    const [cd, cc] = sides(closing);
    rows.push({
      account_id: a.id, code: a.code, name: a.name, name_km: a.name_km, type: a.type, level, is_posting: a.is_posting,
      opening_debit: od, opening_credit: oc, period_debit: f.dr.toFixed(2), period_credit: f.cr.toFixed(2),
      closing_debit: cd, closing_credit: cc,
    });
    if (a.is_posting) {
      totals.od = totals.od.plus(od); totals.oc = totals.oc.plus(oc);
      totals.pd = totals.pd.plus(f.dr); totals.pc = totals.pc.plus(f.cr);
      totals.cd = totals.cd.plus(cd); totals.cc = totals.cc.plus(cc);
    }
  }
  // With headers hidden by `level`, totals still come from every posting account in range.
  if (maxLevel < 99) {
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = ZERO;
    for (const a of accounts.filter((x) => x.is_posting)) {
      const f = figures.get(a.id)!;
      const closing = f.open.plus(f.dr).minus(f.cr);
      const [od, oc] = sides(f.open);
      const [cd, cc] = sides(closing);
      totals.od = totals.od.plus(od); totals.oc = totals.oc.plus(oc);
      totals.pd = totals.pd.plus(f.dr); totals.pc = totals.pc.plus(f.cr);
      totals.cd = totals.cd.plus(cd); totals.cc = totals.cc.plus(cc);
    }
  }
  // A role that cannot see sensitive accounts gets a TB without them, so its totals may not balance.
  // The check below is still honest: it reports what the user was shown.
  const balanced = totals.od.eq(totals.oc) && totals.pd.eq(totals.pc) && totals.cd.eq(totals.cc);
  return {
    currency: "USD", date_from: from, date_to: to, generated_at: new Date().toISOString(), rows,
    totals: {
      opening_debit: totals.od.toFixed(2), opening_credit: totals.oc.toFixed(2), period_debit: totals.pd.toFixed(2),
      period_credit: totals.pc.toFixed(2), closing_debit: totals.cd.toFixed(2), closing_credit: totals.cc.toFixed(2),
    },
    validation: { balanced },
    includes_unposted: false,
  };
}

export function buildGeneralLedger(user: MockUser, params: URLSearchParams): GeneralLedgerReport | Response {
  const from = params.get("date_from");
  const to = params.get("date_to");
  if (!isDate(from) || !isDate(to) || from > to) {
    return fail(422, "VALIDATION_ERROR", "Choose a valid date range.", [{ field: "date_from", issue: "invalid_range" }]);
  }
  const ids = (params.get("accounts") ?? "").split(",").filter(Boolean);
  if (!ids.length) return fail(422, "VALIDATION_ERROR", "Choose at least one account.", [{ field: "accounts", issue: "required" }]);
  const branchId = params.get("branch_id");
  const departmentId = params.get("department_id");
  const transactionView = params.get("currency_view") === "transaction";
  const store = db();
  const allowed = new Map(visibleAccounts(user).map((a) => [a.id, a]));

  // Header accounts expand to their posting descendants.
  const expand = (id: string): string[] => {
    const account = allowed.get(id);
    if (!account) return [];
    if (account.is_posting) return [id];
    return store.accounts.filter((a) => a.parent_id === id).flatMap((a) => expand(a.id));
  };
  const accountIds = [...new Set(ids.flatMap(expand))];
  const opening = netByAccount(ledgerLines(store.journals, { before: from, branchId, departmentId }));
  const movement = ledgerLines(store.journals, { dateFrom: from, dateTo: to, branchId, departmentId }).sort(
    (a, b) => a.journal.posting_date.localeCompare(b.journal.posting_date) || (a.journal.journal_no ?? "").localeCompare(b.journal.journal_no ?? "") || a.line_no - b.line_no,
  );

  const sections: LedgerAccountSection[] = [];
  for (const id of accountIds.sort((a, b) => allowed.get(a)!.code.localeCompare(allowed.get(b)!.code))) {
    const account = allowed.get(id)!;
    // Balances are shown on the account's normal side.
    const sign = account.normal_balance === "DEBIT" ? 1 : -1;
    const open = (opening.get(id) ?? ZERO).times(sign);
    let running = open;
    let totalDr = ZERO;
    let totalCr = ZERO;
    const lines = movement.filter((l) => l.account_id === id);
    const out = lines.slice(0, MAX_LINES_PER_ACCOUNT).map((l) => {
      const dr = new Decimal(transactionView ? l.debit : l.debit_base);
      const cr = new Decimal(transactionView ? l.credit : l.credit_base);
      running = running.plus(new Decimal(l.debit_base).minus(l.credit_base).times(sign));
      return {
        id: l.id, date: l.journal.posting_date, journal_id: l.journal.id, journal_no: l.journal.journal_no ?? "",
        source: l.journal.source_no ?? l.journal.type, reference: l.journal.reference, description: l.description || l.journal.description,
        debit: dr.toFixed(transactionView ? (l.currency === "KHR" ? 0 : 2) : 2),
        credit: cr.toFixed(transactionView ? (l.currency === "KHR" ? 0 : 2) : 2),
        balance: running.toFixed(2), currency: transactionView ? l.currency : "USD", branch_id: l.branch_id, department_id: l.department_id,
      };
    });
    for (const l of lines) {
      totalDr = totalDr.plus(l.debit_base);
      totalCr = totalCr.plus(l.credit_base);
    }
    const closing = open.plus(totalDr.minus(totalCr).times(sign));
    sections.push({
      account_id: id, code: account.code, name: account.name, name_km: account.name_km, normal_balance: account.normal_balance,
      opening_balance: open.toFixed(2), total_debit: totalDr.toFixed(2), total_credit: totalCr.toFixed(2),
      closing_balance: closing.toFixed(2), lines: out, truncated: lines.length > MAX_LINES_PER_ACCOUNT,
    });
  }
  return {
    currency: transactionView ? "TXN" : "USD", date_from: from, date_to: to, generated_at: new Date().toISOString(), accounts: sections,
  };
}

/** CSV for exports. Quotes every field; numbers stay plain decimal strings. */
function csv(rows: (string | number)[][]): string {
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

const exportsStore = new Map<string, { name: string; body: string }>();
let exportCounter = 0;

export const reportHandlers = [
  route("get", "/reports/trial-balance", "rpt.trial_balance", ({ user, url }) => {
    const result = buildTrialBalance(user, url.searchParams);
    return result instanceof Response ? result : HttpResponse.json(result);
  }),

  route("get", "/reports/general-ledger", "rpt.general_ledger", ({ user, url }) => {
    const result = buildGeneralLedger(user, url.searchParams);
    return result instanceof Response ? result : HttpResponse.json(result);
  }),

  // SRS §13.3 POST /reports/{report_id}/export. The mock produces CSV; PDF and Excel are generated by the
  // backend (WeasyPrint, openpyxl), so the mock answers with a queued job (see docs/DECISIONS.md D-P2-06).
  route<{ format: string; parameters: Record<string, string> }>("post", "/reports/:reportId/export", null, ({ user, params, body }) => {
    const query = new URLSearchParams(body?.parameters ?? {});
    const format = body?.format ?? "csv";
    // The chart of accounts export needs coa.view; reports need rpt.export (SRS §15.2).
    if (params.reportId !== "chart-of-accounts" && !hasPermission(user.permissions, "rpt.export")) {
      return fail(403, "FORBIDDEN", "Permission rpt.export is required.");
    }
    if (format !== "csv") {
      return HttpResponse.json({ status: "QUEUED", job_id: `job-${(exportCounter += 1)}`, format }, { status: 202 });
    }
    let rows: (string | number)[][];
    if (params.reportId === "trial-balance") {
      if (!hasPermission(user.permissions, "rpt.trial_balance")) return fail(403, "FORBIDDEN", "Permission rpt.trial_balance is required.");
      const tb = buildTrialBalance(user, query);
      if (tb instanceof Response) return tb;
      rows = [
        ["Code", "Account", "Opening debit", "Opening credit", "Period debit", "Period credit", "Closing debit", "Closing credit"],
        ...tb.rows.map((r) => [r.code, r.name, r.opening_debit, r.opening_credit, r.period_debit, r.period_credit, r.closing_debit, r.closing_credit]),
        ["", "Total", tb.totals.opening_debit, tb.totals.opening_credit, tb.totals.period_debit, tb.totals.period_credit, tb.totals.closing_debit, tb.totals.closing_credit],
      ];
    } else if (params.reportId === "general-ledger") {
      if (!hasPermission(user.permissions, "rpt.general_ledger")) return fail(403, "FORBIDDEN", "Permission rpt.general_ledger is required.");
      const gl = buildGeneralLedger(user, query);
      if (gl instanceof Response) return gl;
      rows = [["Account", "Date", "Journal no", "Source", "Reference", "Description", "Debit", "Credit", "Balance", "Currency"]];
      for (const s of gl.accounts) {
        rows.push([`${s.code} ${s.name}`, "", "", "", "", "Opening balance", "", "", s.opening_balance, ""]);
        for (const l of s.lines) rows.push([s.code, l.date, l.journal_no, l.source, l.reference, l.description, l.debit, l.credit, l.balance, l.currency]);
        rows.push([`${s.code} ${s.name}`, "", "", "", "", "Closing balance", s.total_debit, s.total_credit, s.closing_balance, ""]);
      }
    } else if (params.reportId === "chart-of-accounts") {
      if (!hasPermission(user.permissions, "coa.view")) return fail(403, "FORBIDDEN", "Permission coa.view is required.");
      rows = [
        ["Code", "Name (English)", "Name (Khmer)", "Type", "Category", "Parent", "Normal balance", "Posting", "Control", "Active"],
        ...visibleAccounts(user)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((a) => [a.code, a.name, a.name_km, a.type, a.category, db().accounts.find((p) => p.id === a.parent_id)?.code ?? "", a.normal_balance, a.is_posting ? "Y" : "N", a.control_module ?? "", a.is_active ? "Y" : "N"]),
      ];
    } else {
      // SCR-15 catalogue reports: the CSV is written from the same document the screen shows (AT-RPT-03).
      const doc = buildReport(params.reportId, user, query);
      if (doc instanceof Response) return doc;
      rows = reportCsvRows(doc);
    }
    const id = `exp-${(exportCounter += 1)}`;
    const name = `${params.reportId}-${query.get("date_from") ?? query.get("as_of") ?? ""}-${query.get("date_to") ?? ""}.csv`.replace(/-+\.csv$/, ".csv");
    exportsStore.set(id, { name, body: csv(rows) });
    // Exports are audited (SRS §13.1); the audit trail arrives in Phase 7.
    return HttpResponse.json({ status: "COMPLETED", file_name: name, url: `/api/v1/exports/${id}` });
  }),

  route("get", "/exports/:id", null, ({ params }) => {
    const file = exportsStore.get(params.id);
    if (!file) return fail(404, "NOT_FOUND", "Export not found or expired.");
    return new HttpResponse(file.body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file.name}"` },
    });
  }),
];
