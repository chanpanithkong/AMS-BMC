import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type {
  DashboardBudgetUse, DashboardCashAccount, DashboardKpis, DashboardPending, DashboardReconciliation, DashboardRecent, DashboardTrendPoint,
} from "@/lib/api/types/statements";
import { addDays } from "@/lib/money/invoice";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { baseOf } from "../db/arap";
import { ledgerLines } from "../db/journals";
import { accountBalance } from "../db/posting";
import { MOCK_TODAY, type MockUser } from "../db/seed";
import { fail, route } from "../http";
import { outstandingAt, pendingArApApprovals } from "./arap";
import { visibleCashBankAccounts } from "./cashbank";
import { pendingExpenseApprovals } from "./expenses";
import { pendingJournalApprovals } from "./journals";
import { budgetUse } from "./budgets";
import { incomeFigures } from "./statements";

// SCR-02 dashboard (SRS §6.19, FR-DASH-001..010). One call per widget (ASSUMPTION: /dashboard/{widget};
// SRS names /api/v1/dashboard), so that each widget loads, fails and retries on its own.
// Posted data only; pending items are reported separately and never added to KPIs (FR-DASH-009).

const UPCOMING_DAYS = 14;
const ZERO = new Decimal(0);
const money = (d: Decimal) => d.toFixed(2);
const can = (user: MockUser, ...permissions: string[]) => permissions.some((p) => hasPermission(user.permissions, p));
const seesProfit = (user: MockUser) => can(user, "rpt.income_statement", "rpt.kpi");

function range(url: URL): { from: string; to: string; branchId: string | null } | Response {
  const to = url.searchParams.get("date_to") || MOCK_TODAY;
  const from = url.searchParams.get("date_from") || `${to.slice(0, 7)}-01`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return fail(422, "VALIDATION_ERROR", "Choose a valid date range.", [{ field: "date_from", issue: "invalid_range" }]);
  }
  return { from, to, branchId: url.searchParams.get("branch_id") || null };
}

const outstandingSum = (kind: "AR" | "AP", date: string, filter: (dueDate: string) => boolean) =>
  db().invoices.filter((d) => d.kind === kind && d.posted && d.date <= date && filter(d.due_date)).reduce((s, d) => s.plus(outstandingAt(d, date).base), ZERO);

export const dashboardHandlers = [
  route("get", "/dashboard/kpis", "dash.view", ({ user, url }) => {
    const r = range(url);
    if (r instanceof Response) return r;
    const income = seesProfit(user) ? incomeFigures({ branchId: r.branchId, departmentId: null, unposted: false }, r.from, r.to) : null;
    const accounts = visibleCashBankAccounts(user);
    const total = (kind: "CASH" | "BANK") => accounts.filter((a) => a.kind === kind).reduce((s, a) => s.plus(accountBalance(db(), a.gl_account_id, r.to).base), ZERO);
    const seeAr = can(user, "ar.invoice.view");
    const seeAp = can(user, "ap.invoice.view");
    const today = MOCK_TODAY;
    const result: DashboardKpis = {
      date_from: r.from, date_to: r.to, currency: "USD", upcoming_days: UPCOMING_DAYS,
      revenue: income ? money(income.revenue) : null, expenses: income ? money(income.expenses) : null, net_profit: income ? money(income.profit) : null,
      cash: can(user, "cb.cash.view") ? money(total("CASH")) : null, bank: can(user, "cb.bank.view") && !user.roles.includes("CASHIER") ? money(total("BANK")) : null,
      ar: seeAr ? money(accountBalance(db(), "acc-1200", r.to).base) : null,
      ap: seeAp ? money(accountBalance(db(), "acc-2100", r.to).base.negated()) : null,
      overdue_ar: seeAr ? money(outstandingSum("AR", today, (due) => due < today)) : null,
      upcoming_ap: seeAp ? money(outstandingSum("AP", today, (due) => due >= today && due <= addDays(today, UPCOMING_DAYS))) : null,
    };
    return HttpResponse.json(result);
  }),

  route("get", "/dashboard/trend", "dash.view", ({ user, url }) => {
    if (!seesProfit(user)) return fail(403, "FORBIDDEN", "Permission rpt.income_statement is required.");
    const r = range(url);
    if (r instanceof Response) return r;
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTHS_KM = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
    const points: DashboardTrendPoint[] = [];
    let y = Number(r.to.slice(0, 4));
    let m = Number(r.to.slice(5, 7));
    for (let i = 0; i < 12; i += 1) {
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const end = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
      const f = incomeFigures({ branchId: r.branchId, departmentId: null, unposted: false }, start, end < r.to ? end : r.to);
      points.unshift({ period: start.slice(0, 7), label: `${MONTHS[m - 1]} ${String(y).slice(2)}`, label_km: `${MONTHS_KM[m - 1]} ${y}`, revenue: money(f.revenue), expenses: money(f.expenses), profit: money(f.profit) });
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
    }
    return HttpResponse.json({ data: points });
  }),

  route("get", "/dashboard/cash", "dash.view", ({ user, url }) => {
    if (!can(user, "cb.cash.view", "cb.bank.view")) return fail(403, "FORBIDDEN", "Permission cb.cash.view is required.");
    const to = url.searchParams.get("date_to") || MOCK_TODAY;
    const data: DashboardCashAccount[] = visibleCashBankAccounts(user).map((a) => {
      const b = accountBalance(db(), a.gl_account_id, to);
      return { id: a.id, code: a.code, name: a.name, name_km: a.name_km, kind: a.kind, currency: a.currency, balance: b.amount.toFixed(a.currency === "KHR" ? 0 : 2), balance_base: money(b.base) };
    });
    return HttpResponse.json({ data });
  }),

  route("get", "/dashboard/reconciliations", "dash.view", ({ user }) => {
    if (!can(user, "cb.bank.view", "cb.reconcile") || user.roles.includes("CASHIER")) return fail(403, "FORBIDDEN", "Permission cb.bank.view is required.");
    const data: DashboardReconciliation[] = db().cashBankAccounts.filter((a) => a.kind === "BANK").map((a) => {
      const recs = db().reconciliations.filter((r) => r.bank_account_id === a.id);
      const last = recs.filter((r) => r.status === "COMPLETED").map((r) => r.statement_date).sort().pop() ?? null;
      const open = recs.find((r) => r.status === "IN_PROGRESS");
      const unreconciled = ledgerLines(db().journals, { dateFrom: last ? addDays(last, 1) : undefined }).filter((l) => l.account_id === a.gl_account_id).length;
      return { bank_account_id: a.id, code: a.code, name: a.name, name_km: a.name_km, last_completed: last, in_progress_id: open?.id ?? null, unreconciled_items: unreconciled };
    });
    return HttpResponse.json({ data });
  }),

  route("get", "/dashboard/recent", "dash.view", ({ user }) => {
    let data: DashboardRecent[] = [];
    if (can(user, "gl.journal.view")) {
      const sensitive = new Set(db().accounts.filter((a) => a.is_sensitive).map((a) => a.id));
      const seeSensitive = can(user, "coa.sensitive.view");
      data = db().journals
        .filter((j) => j.status === "POSTED" && (seeSensitive || !j.lines.some((l) => sensitive.has(l.account_id))))
        .sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "") || (b.journal_no ?? "").localeCompare(a.journal_no ?? ""))
        .slice(0, 10)
        .map((j) => ({ id: j.id, date: j.posting_date, number: j.journal_no ?? "", type: j.source_type ?? j.type, description: j.description, amount: j.totals.debit_base, currency: "USD", status: j.status, href: `/accounting/journals/${j.id}` }));
    } else if (can(user, "ar.invoice.view", "ap.invoice.view")) {
      const kinds = [...(can(user, "ar.invoice.view") ? ["AR"] : []), ...(can(user, "ap.invoice.view") ? ["AP"] : [])];
      data = db().invoices
        .filter((d) => d.posted && !d.is_opening && kinds.includes(d.kind))
        .sort((a, b) => b.date.localeCompare(a.date) || (b.number ?? "").localeCompare(a.number ?? ""))
        .slice(0, 10)
        .map((d) => ({ id: d.id, date: d.date, number: d.number ?? "", type: d.kind === "AR" ? "AR_INVOICE" : "AP_INVOICE", description: d.party_name, amount: d.total_base, currency: "USD", status: d.status, href: `${d.kind === "AR" ? "/sales" : "/purchases"}/invoices/${d.id}` }));
    }
    return HttpResponse.json({ data });
  }),

  route("get", "/dashboard/pending", "dash.view", ({ user }) => {
    const approvals = can(user, "wfl.approval.view")
      ? pendingJournalApprovals(user).length + pendingExpenseApprovals(user).length + pendingArApApprovals(user).length
      : 0;
    const rows: DashboardPending["approved_unposted"] = [];
    const push = (type: string, items: Decimal[]) => items.length && rows.push({ type, count: items.length, total: money(items.reduce((s, x) => s.plus(x), ZERO)) });
    if (can(user, "gl.journal.view")) push("JOURNAL", db().journals.filter((j) => j.status === "APPROVED").map((j) => new Decimal(j.totals.debit_base)));
    if (can(user, "exp.view")) push("EXPENSE", db().expenses.filter((e) => e.status === "APPROVED").map((e) => baseOf(e.amount, e.rate || 1)));
    if (can(user, "ar.invoice.view")) push("AR_INVOICE", db().invoices.filter((d) => d.kind === "AR" && d.status === "APPROVED").map((d) => new Decimal(d.total_base)));
    if (can(user, "ap.invoice.view")) push("AP_INVOICE", db().invoices.filter((d) => d.kind === "AP" && d.status === "APPROVED").map((d) => new Decimal(d.total_base)));
    if (can(user, "ap.payment.view")) push("SUPPLIER_PAYMENT", db().partyPayments.filter((p) => p.kind === "PAYMENT" && p.status === "APPROVED").map((p) => baseOf(p.amount, p.rate)));
    const result: DashboardPending = { approvals, approved_unposted: rows };
    return HttpResponse.json(result);
  }),

  // FR-DASH-006: posted actual ÷ approved annual budget by department; managers see their own.
  route("get", "/dashboard/budget", "dash.view", ({ user, url }) => {
    if (!can(user, "bud.view")) return HttpResponse.json({ available: false, rows: [] } satisfies DashboardBudgetUse);
    const own = user.roles.includes("DEPTMGR") ? user.department_ids : null;
    const rows = budgetUse(db(), url.searchParams.get("date_to") || MOCK_TODAY, own);
    return HttpResponse.json({ available: rows.length > 0, rows: rows.map((r) => ({ department_id: r.department_id, name: r.name, name_km: r.name_km, actual: r.actual, budget: r.budget_year, percent: r.percent ?? "0" })) } satisfies DashboardBudgetUse);
  }),
];
