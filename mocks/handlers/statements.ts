import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { Account } from "@/lib/api/types/accounts";
import type { ReportCheck, ReportColumn, ReportDocument, ReportDrill, ReportRow } from "@/lib/api/types/statements";
import { addDays, agingBucket, daysBetween } from "@/lib/money/invoice";
import { findReport } from "@/lib/reports/catalogue";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { baseOf } from "../db/arap";
import { ledgerLines, netByAccount, type FlatLine } from "../db/journals";
import { accountBalance } from "../db/posting";
import { MOCK_TODAY, type MockUser } from "../db/seed";
import { fail, route } from "../http";
import { amountFor } from "@/lib/money/depreciation";
import { termsOf } from "../db/advanced";
import { outstandingAt } from "./arap";
import { actualFor } from "./budgets";
import { visibleCashBankAccounts } from "./cashbank";
import { summarise } from "./reconciliation";

// SCR-15 report engine for the mock backend (SRS §15.2–15.3, RPT-03..31). Every report is built from
// the posted ledger (BR-RPT-001) unless the user asks to include unposted journals, and returns the
// common ReportDocument so that screen, print and CSV export show the same figures (AT-RPT-03).

const ZERO = new Decimal(0);
const BASE = "USD";
const money = (d: Decimal.Value) => new Decimal(d).toFixed(2);
const isDate = (v: string | null | undefined): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export interface Params {
  from: string | null;
  to: string;
  branchId: string | null;
  departmentId: string | null;
  compare: "" | "prior_period" | "prior_year";
  unposted: boolean;
  group: "month" | "quarter";
  status: string;
}

// ------------------------------------------------------------------ ledger access

/** Journals in progress (submitted or approved) for the "include unposted" option. */
function unpostedLines(filter: { dateFrom?: string; dateTo?: string; before?: string; branchId?: string | null; departmentId?: string | null }): FlatLine[] {
  const out: FlatLine[] = [];
  for (const journal of db().journals) {
    if (journal.status !== "SUBMITTED" && journal.status !== "APPROVED") continue;
    const date = journal.posting_date;
    if ((filter.dateFrom && date < filter.dateFrom) || (filter.dateTo && date > filter.dateTo) || (filter.before && date >= filter.before)) continue;
    for (const l of journal.lines) {
      if ((filter.branchId && l.branch_id !== filter.branchId) || (filter.departmentId && l.department_id !== filter.departmentId)) continue;
      out.push({ ...l, journal });
    }
  }
  return out;
}

function lines(p: Pick<Params, "branchId" | "departmentId" | "unposted">, filter: { dateFrom?: string; dateTo?: string; before?: string }) {
  const f = { ...filter, branchId: p.branchId, departmentId: p.departmentId };
  return [...ledgerLines(db().journals, f), ...(p.unposted ? unpostedLines(f) : [])];
}

/** Balances at a date (debit − credit, base), including the opening journal. */
const balancesAt = (p: Params, date: string) => netByAccount(lines(p, { dateTo: date }));

/** Movements in a range. The opening journal carries balances brought forward, so it is never a movement. */
const movements = (p: Params, from: string, to: string) => netByAccount(lines(p, { dateFrom: from, dateTo: to }).filter((l) => l.journal.type !== "OPENING"));

const accountsOf = () => [...db().accounts].filter((a) => a.is_posting).sort((a, b) => a.code.localeCompare(b.code));
const get = (m: Map<string, Decimal>, id: string) => m.get(id) ?? ZERO;
const fiscalStart = (date: string) => db().fiscalYears.flatMap((y) => [y]).find((y) => y.start_date <= date && date <= y.end_date)?.start_date ?? `${date.slice(0, 4)}-01-01`;

// ------------------------------------------------------------------ document builder

class Builder {
  rows: ReportRow[] = [];
  checks: ReportCheck[] = [];
  notes: { message: string; message_km: string }[] = [];
  private n = 0;
  add(row: Omit<ReportRow, "id" | "parent_id" | "label_km"> & { parent?: string | null; label_km?: string }): string {
    const id = `r${(this.n += 1)}`;
    this.rows.push({ id, parent_id: row.parent ?? null, kind: row.kind, label: row.label, label_km: row.label_km ?? row.label, code: row.code, values: row.values, drill: row.drill, formula: row.formula, formula_km: row.formula_km });
    return id;
  }
  check(ok: boolean, message: string, message_km: string) {
    this.checks.push({ ok, message, message_km });
  }
  note(message: string, message_km: string) {
    this.notes.push({ message, message_km });
  }
}

const col = (key: string, label: string, label_km: string, kind: ReportColumn["kind"] = "amount"): ReportColumn => ({ key, label, label_km, kind, ...(kind === "amount" ? { currency: BASE } : {}) });
const accountDrill = (a: Account, from: string | null, to: string): ReportDrill => ({ type: "account", id: a.id, date_from: from ?? fiscalStart(to), date_to: to });

/** Sensitive accounts are folded into one "restricted" line for users who may not see them (FR-RBAC-005). */
const canSeeSensitive = (user: MockUser) => hasPermission(user.permissions, "coa.sensitive.view");

/** One line per account (or a restricted line), under a parent row, for each value column. */
function accountLines(b: Builder, user: MockUser, parent: string, accounts: Account[], values: (a: Account) => Record<string, Decimal>, drill: (a: Account) => ReportDrill) {
  const restricted: Record<string, Decimal> = {};
  for (const a of accounts) {
    const v = values(a);
    if (Object.values(v).every((x) => x.isZero())) continue;
    if (a.is_sensitive && !canSeeSensitive(user)) {
      for (const [k, x] of Object.entries(v)) restricted[k] = (restricted[k] ?? ZERO).plus(x);
      continue;
    }
    b.add({ parent, kind: "line", code: a.code, label: a.name, label_km: a.name_km, values: fix(v), drill: drill(a) });
  }
  if (Object.keys(restricted).length) b.add({ parent, kind: "line", label: "Restricted accounts (total only)", label_km: "គណនីដែលបានដាក់កំហិត (តែសរុប)", values: fix(restricted) });
}
const fix = (v: Record<string, Decimal | null>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === null ? null : money(x)]));
const sumOver = (accounts: Account[], f: (a: Account) => Decimal) => accounts.reduce((s, a) => s.plus(f(a)), ZERO);

// ------------------------------------------------------------------ comparatives

function priorRange(p: Params): { from: string; to: string; label: string; label_km: string } | null {
  if (!p.compare || !p.from) return null;
  if (p.compare === "prior_year") {
    const shift = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    return { from: shift(p.from), to: shift(p.to), label: "Prior year", label_km: "ឆ្នាំមុន" };
  }
  const days = daysBetween(p.from, p.to);
  const to = addDays(p.from, -1);
  return { from: addDays(to, -days), to, label: "Prior period", label_km: "គ្រាមុន" };
}

function priorDate(p: Params): { date: string; label: string; label_km: string } | null {
  if (!p.compare) return null;
  if (p.compare === "prior_year") return { date: `${Number(p.to.slice(0, 4)) - 1}${p.to.slice(4)}`, label: "Prior year", label_km: "ឆ្នាំមុន" };
  // Prior period for a balance sheet: the end of the previous month.
  return { date: addDays(`${p.to.slice(0, 7)}-01`, -1), label: "Prior period", label_km: "គ្រាមុន" };
}

// ------------------------------------------------------------------ RPT-03 / RPT-04

type Section = { key: string; label: string; label_km: string; accounts: Account[] };

function bsSections(): { assets: Section[]; liabilities: Section[]; equity: Account[]; unmapped: Account[] } {
  const all = accountsOf();
  const pick = (f: (a: Account) => boolean) => all.filter(f);
  // ILLUSTRATIVE mapping by account type and code range (FR-COA-006); the configurable mapping comes with SCR-19.
  return {
    assets: [
      { key: "ca", label: "Current assets", label_km: "ទ្រព្យសកម្មរយៈពេលខ្លី", accounts: pick((a) => a.type === "ASSET" && a.code >= "1000" && a.code < "1500") },
      { key: "nca", label: "Non-current assets", label_km: "ទ្រព្យសកម្មរយៈពេលវែង", accounts: pick((a) => a.type === "ASSET" && a.code >= "1500" && a.code < "2000") },
    ],
    liabilities: [
      { key: "cl", label: "Current liabilities", label_km: "បំណុលរយៈពេលខ្លី", accounts: pick((a) => a.type === "LIABILITY" && a.code < "2500") },
      { key: "ncl", label: "Non-current liabilities", label_km: "បំណុលរយៈពេលវែង", accounts: pick((a) => a.type === "LIABILITY" && a.code >= "2500") },
    ],
    equity: pick((a) => a.type === "EQUITY"),
    unmapped: pick((a) => a.type === "ASSET" && a.code >= "2000"),
  };
}

/** Balance sheet figures at a date: assets, liabilities and equity including current-year earnings. */
function bsFigures(p: Params, date: string) {
  const bal = balancesAt(p, date);
  const profit = profitFor(p, fiscalStart(date), date);
  const s = bsSections();
  const assets = sumOver(s.assets.flatMap((x) => x.accounts), (a) => get(bal, a.id));
  const liabilities = sumOver(s.liabilities.flatMap((x) => x.accounts), (a) => get(bal, a.id).negated());
  const equity = sumOver(s.equity, (a) => get(bal, a.id).negated()).plus(profit);
  return { bal, profit, assets, liabilities, equity, sections: s };
}

function balanceSheet(user: MockUser, p: Params): Builder & { columns: ReportColumn[] } {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  const prior = priorDate(p);
  b.columns = [col("current", "Amount", "ចំនួនទឹកប្រាក់"), ...(prior ? [col("prior", prior.label, prior.label_km), col("change", "Change", "បម្រែបម្រួល")] : [])];
  const cur = bsFigures(p, p.to);
  const old = prior ? bsFigures(p, prior.date) : null;
  const vals = (current: Decimal, previous: Decimal | null): Record<string, Decimal> => (old ? { current, prior: previous ?? ZERO, change: current.minus(previous ?? ZERO) } : { current });
  const group = (title: string, title_km: string, sections: Section[], sign: 1 | -1) => {
    const top = b.add({ kind: "section", label: title, label_km: title_km, values: {} });
    let total = ZERO;
    let totalOld = ZERO;
    for (const sec of sections) {
      const sid = b.add({ parent: top, kind: "section", label: sec.label, label_km: sec.label_km, values: {} });
      const f = (a: Account, m: Map<string, Decimal>) => get(m, a.id).times(sign);
      accountLines(b, user, sid, sec.accounts, (a) => vals(f(a, cur.bal), old ? f(a, old.bal) : null), (a) => accountDrill(a, null, p.to));
      const t = sumOver(sec.accounts, (a) => f(a, cur.bal));
      const tOld = old ? sumOver(sec.accounts, (a) => f(a, old.bal)) : ZERO;
      b.add({ parent: sid, kind: "subtotal", label: `Total ${sec.label.toLowerCase()}`, label_km: `សរុប${sec.label_km}`, values: fix(vals(t, tOld)) });
      total = total.plus(t);
      totalOld = totalOld.plus(tOld);
    }
    return { top, total, totalOld };
  };
  const assets = group("Assets", "ទ្រព្យសកម្ម", cur.sections.assets, 1);
  b.add({ kind: "total", label: "Total assets", label_km: "ទ្រព្យសកម្មសរុប", values: fix(vals(assets.total, assets.totalOld)) });
  const liab = group("Liabilities", "បំណុល", cur.sections.liabilities, -1);
  b.add({ kind: "total", label: "Total liabilities", label_km: "បំណុលសរុប", values: fix(vals(liab.total, liab.totalOld)) });
  const eq = b.add({ kind: "section", label: "Equity", label_km: "មូលធន", values: {} });
  accountLines(b, user, eq, cur.sections.equity, (a) => vals(get(cur.bal, a.id).negated(), old ? get(old.bal, a.id).negated() : null), (a) => accountDrill(a, null, p.to));
  b.add({ parent: eq, kind: "line", label: "Current-year earnings", label_km: "ចំណេញឆ្នាំបច្ចុប្បន្ន", values: fix(vals(cur.profit, old?.profit ?? null)), drill: { type: "report", id: "income-statement", date_from: fiscalStart(p.to), date_to: p.to } });
  b.add({ kind: "total", label: "Total equity", label_km: "មូលធនសរុប", values: fix(vals(cur.equity, old?.equity ?? null)) });
  b.add({ kind: "total", label: "Total liabilities and equity", label_km: "បំណុល និងមូលធនសរុប", values: fix(vals(cur.liabilities.plus(cur.equity), old ? old.liabilities.plus(old.equity) : null)) });

  const diff = cur.assets.minus(cur.liabilities).minus(cur.equity);
  b.check(diff.isZero(), diff.isZero() ? "Total assets equal total liabilities plus equity" : `Assets differ from liabilities plus equity by ${money(diff)}`,
    diff.isZero() ? "ទ្រព្យសកម្មសរុបស្មើបំណុល និងមូលធនសរុប" : `ទ្រព្យសកម្មខុសពីបំណុល និងមូលធនចំនួន ${money(diff)}`);
  const unmapped = cur.sections.unmapped.filter((a) => !get(cur.bal, a.id).isZero());
  b.check(unmapped.length === 0, unmapped.length ? `Unmapped accounts with a balance: ${unmapped.map((a) => a.code).join(", ")}` : "Every account with a balance is mapped to a statement line",
    unmapped.length ? `គណនីមិនទាន់ផ្គូផ្គងដែលមានសមតុល្យ៖ ${unmapped.map((a) => a.code).join(", ")}` : "គណនីដែលមានសមតុល្យទាំងអស់ត្រូវបានផ្គូផ្គងទៅបន្ទាត់របាយការណ៍");
  return b;
}

const IS_SECTIONS: { key: string; label: string; label_km: string; match: (a: Account) => boolean; sign: 1 | -1 }[] = [
  { key: "revenue", label: "Revenue", label_km: "ចំណូល", match: (a) => a.type === "REVENUE" && a.code < "5000", sign: -1 },
  { key: "cos", label: "Cost of sales", label_km: "ថ្លៃដើមលក់", match: (a) => a.type === "EXPENSE" && a.code >= "5000" && a.code < "6000", sign: 1 },
  { key: "opex", label: "Operating expenses", label_km: "ចំណាយប្រតិបត្តិការ", match: (a) => a.type === "EXPENSE" && a.code >= "6000" && a.code < "7000", sign: 1 },
  { key: "other_income", label: "Other income", label_km: "ចំណូលផ្សេងៗ", match: (a) => a.type === "REVENUE" && a.code >= "7000", sign: -1 },
  { key: "other_expense", label: "Other expenses", label_km: "ចំណាយផ្សេងៗ", match: (a) => a.type === "EXPENSE" && a.code >= "7000", sign: 1 },
];

/** Net profit = Σ revenue movements − Σ expense movements (SRS §6.19). */
export function profitFor(p: Pick<Params, "branchId" | "departmentId" | "unposted">, from: string, to: string): Decimal {
  const mv = netByAccount(lines(p, { dateFrom: from, dateTo: to }).filter((l) => l.journal.type !== "OPENING"));
  return accountsOf().filter((a) => a.type === "REVENUE" || a.type === "EXPENSE").reduce((s, a) => s.minus(get(mv, a.id)), ZERO);
}

/** Revenue and expense totals for a range, as on the income statement and the dashboard (AT-DASH-01). */
export function incomeFigures(p: Pick<Params, "branchId" | "departmentId" | "unposted">, from: string, to: string) {
  const mv = netByAccount(lines(p, { dateFrom: from, dateTo: to }).filter((l) => l.journal.type !== "OPENING"));
  const all = accountsOf();
  const revenue = sumOver(all.filter((a) => a.type === "REVENUE"), (a) => get(mv, a.id).negated());
  const expenses = sumOver(all.filter((a) => a.type === "EXPENSE"), (a) => get(mv, a.id));
  const sec = (key: string) => {
    const s = IS_SECTIONS.find((x) => x.key === key)!;
    return sumOver(all.filter(s.match), (a) => get(mv, a.id).times(s.sign));
  };
  return { mv, revenue, expenses, profit: revenue.minus(expenses), sec };
}

function incomeStatement(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  const from = p.from!;
  const prior = priorRange(p);
  b.columns = [col("current", "Amount", "ចំនួនទឹកប្រាក់"), ...(prior ? [col("prior", prior.label, prior.label_km), col("change", "Change", "បម្រែបម្រួល")] : [])];
  const cur = incomeFigures(p, from, p.to);
  const old = prior ? incomeFigures(p, prior.from, prior.to) : null;
  const vals = (c: Decimal, o: Decimal | null): Record<string, Decimal> => (old ? { current: c, prior: o ?? ZERO, change: c.minus(o ?? ZERO) } : { current: c });
  const all = accountsOf();
  const section = (key: string) => {
    const s = IS_SECTIONS.find((x) => x.key === key)!;
    const sid = b.add({ kind: "section", label: s.label, label_km: s.label_km, values: {} });
    accountLines(b, user, sid, all.filter(s.match), (a) => vals(get(cur.mv, a.id).times(s.sign), old ? get(old.mv, a.id).times(s.sign) : null), (a) => accountDrill(a, from, p.to));
    b.add({ parent: sid, kind: "subtotal", label: `Total ${s.label.toLowerCase()}`, label_km: `សរុប${s.label_km}`, values: fix(vals(cur.sec(key), old?.sec(key) ?? null)) });
  };
  const result = (label: string, label_km: string, f: (x: ReturnType<typeof incomeFigures>) => Decimal) => b.add({ kind: "total", label, label_km, values: fix(vals(f(cur), old ? f(old) : null)) });
  section("revenue");
  section("cos");
  result("Gross profit", "ប្រាក់ចំណេញដុល", (x) => x.sec("revenue").minus(x.sec("cos")));
  section("opex");
  result("Operating profit", "ប្រាក់ចំណេញពីប្រតិបត្តិការ", (x) => x.sec("revenue").minus(x.sec("cos")).minus(x.sec("opex")));
  section("other_income");
  section("other_expense");
  result("Net profit (loss)", "ប្រាក់ចំណេញ (ខាត) សុទ្ធ", (x) => x.profit);
  const bySections = cur.sec("revenue").minus(cur.sec("cos")).minus(cur.sec("opex")).plus(cur.sec("other_income")).minus(cur.sec("other_expense"));
  const ok = bySections.eq(cur.profit);
  b.check(ok, ok ? "Net profit equals revenue movements less expense movements" : `Statement lines differ from account movements by ${money(bySections.minus(cur.profit))}`,
    ok ? "ប្រាក់ចំណេញសុទ្ធស្មើចលនាចំណូលដកចលនាចំណាយ" : `បន្ទាត់របាយការណ៍ខុសពីចលនាគណនីចំនួន ${money(bySections.minus(cur.profit))}`);
  return b;
}

// ------------------------------------------------------------------ RPT-05 / RPT-06 / RPT-29

const CF_OPERATING = ["1200", "1210", "1300", "1400", "1410", "1420", "2100", "2150", "2160", "2170", "2200", "2300"];
const CF_INVESTING = ["1510", "1520"];
const CF_FINANCING = ["2500", "3100", "3200", "3300"];

function cashFlow(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("amount", "Amount", "ចំនួនទឹកប្រាក់")];
  const from = p.from!;
  const mv = movements(p, from, p.to);
  const all = accountsOf();
  const byCode = new Map(all.map((a) => [a.code, a]));
  const effect = (code: string) => get(mv, byCode.get(code)?.id ?? "").negated();
  const cashAccounts = all.filter((a) => a.cash_flow_class === "CASH");
  const profit = profitFor(p, from, p.to);

  const op = b.add({ kind: "section", label: "Operating activities (indirect method)", label_km: "សកម្មភាពប្រតិបត្តិការ (វិធីសាស្ត្រប្រយោល)", values: {} });
  b.add({ parent: op, kind: "line", label: "Net profit (loss)", label_km: "ប្រាក់ចំណេញ (ខាត) សុទ្ធ", values: { amount: money(profit) }, drill: { type: "report", id: "income-statement", date_from: from, date_to: p.to } });
  const dep = effect("1590");
  b.add({ parent: op, kind: "line", code: "1590", label: "Depreciation (non-cash)", label_km: "រំលស់ (មិនមែនសាច់ប្រាក់)", values: { amount: money(dep) } });
  let operating = profit.plus(dep);
  for (const code of CF_OPERATING) {
    const a = byCode.get(code)!;
    const v = effect(code);
    operating = operating.plus(v);
    if (!v.isZero()) b.add({ parent: op, kind: "line", code, label: `Change in ${a.name}`, label_km: `បម្រែបម្រួល${a.name_km}`, values: { amount: money(v) }, drill: accountDrill(a, from, p.to) });
  }
  const classified = new Set([...CF_OPERATING, ...CF_INVESTING, ...CF_FINANCING, "1590"]);
  const other = all.filter((a) => (a.type === "ASSET" || a.type === "LIABILITY" || a.type === "EQUITY") && a.cash_flow_class !== "CASH" && !classified.has(a.code));
  for (const a of other) {
    const v = get(mv, a.id).negated();
    if (v.isZero()) continue;
    operating = operating.plus(v);
    b.add({ parent: op, kind: "line", code: a.code, label: `Change in ${a.name} (unclassified)`, label_km: `បម្រែបម្រួល${a.name_km} (មិនទាន់ចាត់ថ្នាក់)`, values: { amount: money(v) }, drill: accountDrill(a, from, p.to) });
  }
  b.add({ parent: op, kind: "subtotal", label: "Net cash from operating activities", label_km: "សាច់ប្រាក់សុទ្ធពីសកម្មភាពប្រតិបត្តិការ", values: { amount: money(operating) } });
  const part = (label: string, label_km: string, codes: string[], total: string, total_km: string) => {
    const id = b.add({ kind: "section", label, label_km, values: {} });
    let sum = ZERO;
    for (const code of codes) {
      const a = byCode.get(code)!;
      const v = effect(code);
      sum = sum.plus(v);
      if (!v.isZero()) b.add({ parent: id, kind: "line", code, label: a.name, label_km: a.name_km, values: { amount: money(v) }, drill: accountDrill(a, from, p.to) });
    }
    b.add({ parent: id, kind: "subtotal", label: total, label_km: total_km, values: { amount: money(sum) } });
    return sum;
  };
  const investing = part("Investing activities", "សកម្មភាពវិនិយោគ", CF_INVESTING, "Net cash from investing activities", "សាច់ប្រាក់សុទ្ធពីសកម្មភាពវិនិយោគ");
  const financing = part("Financing activities", "សកម្មភាពហិរញ្ញប្បទាន", CF_FINANCING, "Net cash from financing activities", "សាច់ប្រាក់សុទ្ធពីសកម្មភាពហិរញ្ញប្បទាន");
  const net = operating.plus(investing).plus(financing);
  const opening = sumOver(cashAccounts, (a) => get(netByAccount(lines(p, { before: from }).concat(lines(p, { dateFrom: from, dateTo: p.to }).filter((l) => l.journal.type === "OPENING"))), a.id));
  const closing = sumOver(cashAccounts, (a) => get(balancesAt(p, p.to), a.id));
  b.add({ kind: "total", label: "Net change in cash and cash equivalents", label_km: "បម្រែបម្រួលសុទ្ធនៃសាច់ប្រាក់ និងសាច់ប្រាក់សមមូល", values: { amount: money(net) } });
  b.add({ kind: "line", label: "Cash and cash equivalents at the start", label_km: "សាច់ប្រាក់ និងសាច់ប្រាក់សមមូលដើមគ្រា", values: { amount: money(opening) } });
  b.add({ kind: "total", label: "Cash and cash equivalents at the end", label_km: "សាច់ប្រាក់ និងសាច់ប្រាក់សមមូលចុងគ្រា", values: { amount: money(closing) } });
  const ok = net.eq(closing.minus(opening));
  b.check(ok, ok ? "Net change equals closing less opening cash" : `Net change differs from the cash accounts by ${money(net.minus(closing.minus(opening)))}`,
    ok ? "បម្រែបម្រួលសុទ្ធស្មើសាច់ប្រាក់ចុងគ្រាដកដើមគ្រា" : `បម្រែបម្រួលសុទ្ធខុសពីគណនីសាច់ប្រាក់ចំនួន ${money(net.minus(closing.minus(opening)))}`);
  if (p.branchId) b.note("A branch filter is a management view; cash between branches may not net to zero.", "តម្រងសាខាជាទិដ្ឋភាពគ្រប់គ្រង។");
  return b;
}

function changesInEquity(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  const from = p.from!;
  b.columns = [col("opening", "Opening", "ដើមគ្រា"), col("profit", "Profit for the period", "ប្រាក់ចំណេញក្នុងគ្រា"), col("contributions", "Contributions", "ការចូលទុន"), col("distributions", "Distributions", "ការដកប្រាក់"), col("other", "Other", "ផ្សេងៗ"), col("closing", "Closing", "ចុងគ្រា")];
  const all = accountsOf();
  const equity = all.filter((a) => a.type === "EQUITY");
  const openingMap = netByAccount(lines(p, { before: from }).concat(lines(p, { dateFrom: from, dateTo: p.to }).filter((l) => l.journal.type === "OPENING")));
  const mvLines = lines(p, { dateFrom: from, dateTo: p.to }).filter((l) => l.journal.type !== "OPENING");
  const totals = { opening: ZERO, profit: ZERO, contributions: ZERO, distributions: ZERO, other: ZERO, closing: ZERO };
  const add = (k: keyof typeof totals, v: Decimal) => (totals[k] = totals[k].plus(v));
  for (const a of equity) {
    const opening = get(openingMap, a.id).negated();
    const mine = mvLines.filter((l) => l.account_id === a.id);
    const credits = mine.reduce((s, l) => s.plus(l.credit_base), ZERO);
    const debits = mine.reduce((s, l) => s.plus(l.debit_base), ZERO);
    const contributions = a.code === "3100" ? credits.minus(debits) : ZERO;
    const distributions = a.code === "3300" ? credits.minus(debits) : ZERO;
    const other = a.code !== "3100" && a.code !== "3300" ? credits.minus(debits) : ZERO;
    const closing = opening.plus(contributions).plus(distributions).plus(other);
    if ([opening, closing, contributions, distributions, other].every((x) => x.isZero())) continue;
    b.add({ kind: "line", code: a.code, label: a.name, label_km: a.name_km, values: fix({ opening, profit: ZERO, contributions, distributions, other, closing }), drill: accountDrill(a, from, p.to) });
    add("opening", opening); add("contributions", contributions); add("distributions", distributions); add("other", other); add("closing", closing);
  }
  const fy = fiscalStart(p.to);
  const earlier = from > fy ? profitFor(p, fy, addDays(from, -1)) : ZERO;
  const profit = profitFor(p, from, p.to);
  b.add({ kind: "line", label: "Current-year earnings", label_km: "ចំណេញឆ្នាំបច្ចុប្បន្ន", values: fix({ opening: earlier, profit, contributions: ZERO, distributions: ZERO, other: ZERO, closing: earlier.plus(profit) }) });
  add("opening", earlier); add("profit", profit); add("closing", earlier.plus(profit));
  b.add({ kind: "total", label: "Total equity", label_km: "មូលធនសរុប", values: fix(totals) });
  const bs = bsFigures(p, p.to).equity;
  const ok = bs.eq(totals.closing);
  b.check(ok, ok ? "Closing equity equals equity on the balance sheet" : `Closing equity differs from the balance sheet by ${money(totals.closing.minus(bs))}`,
    ok ? "មូលធនចុងគ្រាស្មើមូលធនក្នុងតារាងតុល្យការ" : `មូលធនចុងគ្រាខុសពីតារាងតុល្យការចំនួន ${money(totals.closing.minus(bs))}`);
  return b;
}

function ratios(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("value", "Value", "តម្លៃ", "number")];
  const from = p.from!;
  const bs = bsFigures(p, p.to);
  const is = incomeFigures(p, from, p.to);
  const byCode = new Map(accountsOf().map((a) => [a.code, a]));
  const bal = (code: string) => get(bs.bal, byCode.get(code)?.id ?? "");
  const currentAssets = sumOver(bs.sections.assets[0].accounts, (a) => get(bs.bal, a.id));
  const currentLiabilities = sumOver(bs.sections.liabilities[0].accounts, (a) => get(bs.bal, a.id).negated());
  const inventory = bal("1300");
  const ar = bal("1200");
  const ap = bal("2100").negated();
  const days = daysBetween(from, p.to) + 1;
  const div = (a: Decimal, d: Decimal, times = 1) => (d.isZero() ? null : a.div(d).times(times).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  const grossProfit = is.sec("revenue").minus(is.sec("cos"));
  const rows: [string, string, Decimal | null, string, string, string][] = [
    ["Current ratio", "អនុបាតបច្ចុប្បន្ន", div(currentAssets, currentLiabilities), "×", "Current assets ÷ current liabilities", "ទ្រព្យសកម្មរយៈពេលខ្លី ÷ បំណុលរយៈពេលខ្លី"],
    ["Quick ratio", "អនុបាតរហ័ស", div(currentAssets.minus(inventory), currentLiabilities), "×", "(Current assets − inventory) ÷ current liabilities", "(ទ្រព្យសកម្មរយៈពេលខ្លី − សន្និធិ) ÷ បំណុលរយៈពេលខ្លី"],
    ["Gross margin", "អត្រាចំណេញដុល", div(grossProfit, is.sec("revenue"), 100), "%", "Gross profit ÷ revenue × 100", "ប្រាក់ចំណេញដុល ÷ ចំណូល × 100"],
    ["Net margin", "អត្រាចំណេញសុទ្ធ", div(is.profit, is.revenue, 100), "%", "Net profit ÷ total revenue × 100", "ប្រាក់ចំណេញសុទ្ធ ÷ ចំណូលសរុប × 100"],
    ["Debt to equity", "អនុបាតបំណុលលើមូលធន", div(bs.liabilities, bs.equity), "×", "Total liabilities ÷ total equity", "បំណុលសរុប ÷ មូលធនសរុប"],
    ["Days sales outstanding", "ចំនួនថ្ងៃប្រមូលបំណុល", div(ar.times(days), is.sec("revenue")), "days", `AR ÷ revenue × ${days} days`, `គណនីត្រូវទទួល ÷ ចំណូល × ${days} ថ្ងៃ`],
    ["Days payables outstanding", "ចំនួនថ្ងៃទូទាត់បំណុល", div(ap.times(days), is.sec("cos")), "days", `AP ÷ cost of sales × ${days} days`, `គណនីត្រូវសង ÷ ថ្លៃដើមលក់ × ${days} ថ្ងៃ`],
  ];
  for (const [label, label_km, value, unit, formula, formula_km] of rows) {
    b.add({ kind: "line", label: `${label} (${unit})`, label_km: `${label_km} (${unit === "days" ? "ថ្ងៃ" : unit})`, values: { value: value === null ? null : value.toFixed(2) }, formula, formula_km });
  }
  b.note("Inputs come from the balance sheet at the end date and the income statement for the range.", "ទិន្នន័យយកពីតារាងតុល្យការនៅថ្ងៃបញ្ចប់ និងរបាយការណ៍លទ្ធផលសម្រាប់គ្រា។");
  return b;
}

// ------------------------------------------------------------------ receivables, payables, cash

function partyBalances(user: MockUser, p: Params, kind: "AR" | "AP") {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("currency", "Currency", "រូបិយប័ណ្ណ", "text"), { key: "amount", label: "Balance (document currency)", label_km: "សមតុល្យ (រូបិយប័ណ្ណឯកសារ)", kind: "number" }, col("base", "Balance", "សមតុល្យ")];
  let total = ZERO;
  for (const party of db().parties.filter((x) => x.kind === (kind === "AR" ? "CUSTOMER" : "SUPPLIER")).sort((a, c) => a.code.localeCompare(c.code))) {
    let amount = ZERO;
    let base = ZERO;
    for (const d of db().invoices) {
      if (d.party_id !== party.id || !d.posted || d.date > p.to) continue;
      const o = outstandingAt(d, p.to);
      amount = amount.plus(o.amount);
      base = base.plus(o.base);
    }
    if (base.isZero() && amount.isZero()) continue;
    total = total.plus(base);
    b.add({ kind: "line", code: party.code, label: party.name, label_km: party.name_km, values: { currency: party.currency, amount: amount.toFixed(party.currency === "KHR" ? 0 : 2), base: money(base) }, drill: { type: kind === "AR" ? "customer" : "supplier", id: party.id } });
  }
  b.add({ kind: "total", label: "Total", label_km: "សរុប", values: { currency: null, amount: null, base: money(total) } });
  controlCheck(b, kind, p.to, total);
  return b;
}

function controlCheck(b: Builder, kind: "AR" | "AP", date: string, total: Decimal) {
  const raw = accountBalance(db(), kind === "AR" ? "acc-1200" : "acc-2100", date).base;
  const control = kind === "AR" ? raw : raw.negated();
  const diff = control.minus(total);
  const code = kind === "AR" ? "1200" : "2100";
  b.check(diff.isZero(), diff.isZero() ? `Total equals control account ${code} (${money(control)})` : `Control account ${code} is ${money(control)}; difference ${money(diff)}`,
    diff.isZero() ? `សរុបស្មើគណនីត្រួតពិនិត្យ ${code} (${money(control)})` : `គណនីត្រួតពិនិត្យ ${code} មាន ${money(control)} ខុសគ្នា ${money(diff)}`);
}

function outstanding(user: MockUser, p: Params, kind: "AR" | "AP") {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [
    col("date", "Date", "កាលបរិច្ឆេទ", "date"), col("due", "Due", "ថ្ងៃកំណត់", "date"), { key: "days", label: "Days past due", label_km: "ថ្ងៃហួសកាលកំណត់", kind: "number" },
    col("currency", "Currency", "រូបិយប័ណ្ណ", "text"), { key: "amount", label: "Outstanding (document currency)", label_km: "នៅសល់ (រូបិយប័ណ្ណឯកសារ)", kind: "number" }, col("base", "Outstanding", "នៅសល់"),
  ];
  let total = ZERO;
  const docs = db().invoices.filter((d) => d.kind === kind && d.posted && d.date <= p.to).map((d) => ({ d, o: outstandingAt(d, p.to) })).filter(({ o }) => !o.amount.isZero())
    .sort((x, y) => x.d.due_date.localeCompare(y.d.due_date));
  for (const { d, o } of docs) {
    total = total.plus(o.base);
    const late = Math.max(0, daysBetween(d.due_date, p.to));
    b.add({
      kind: "line", code: d.number ?? "", label: `${d.party_name}${d.supplier_invoice_no ? ` · ${d.supplier_invoice_no}` : ""}`, label_km: d.party_name_km,
      values: { date: d.date, due: d.due_date, days: String(late), currency: d.currency, amount: o.amount.toFixed(d.currency === "KHR" ? 0 : 2), base: money(o.base) },
      drill: { type: kind === "AR" ? "customer_invoice" : "supplier_invoice", id: d.id },
    });
  }
  b.add({ kind: "total", label: `Total (${docs.length} documents)`, label_km: `សរុប (${docs.length} ឯកសារ)`, values: { date: null, due: null, days: null, currency: null, amount: null, base: money(total) } });
  const overdue = docs.filter(({ d }) => agingBucket(d.due_date, p.to) !== "current").reduce((s, { o }) => s.plus(o.base), ZERO);
  b.note(`Of which overdue: ${money(overdue)} USD`, `ក្នុងនោះហួសកាលកំណត់៖ ${money(overdue)} ដុល្លារ`);
  controlCheck(b, kind, p.to, total);
  return b;
}

function books(user: MockUser, p: Params, kind: "CASH" | "BANK") {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("currency", "Currency", "រូបិយប័ណ្ណ", "text"), { key: "opening", label: "Opening", label_km: "ដើមគ្រា", kind: "number" }, { key: "in", label: "Receipts", label_km: "ទទួល", kind: "number" },
    { key: "out", label: "Payments", label_km: "ចំណាយ", kind: "number" }, { key: "closing", label: "Closing", label_km: "ចុងគ្រា", kind: "number" }, col("closing_base", "Closing", "ចុងគ្រា")];
  const from = p.from!;
  let totalBase = ZERO;
  for (const a of visibleCashBankAccounts(user).filter((x) => x.kind === kind)) {
    const dp = a.currency === "KHR" ? 0 : 2;
    const open = accountBalance(db(), a.gl_account_id, addDays(from, -1));
    const inRange = ledgerLines(db().journals, { dateFrom: from, dateTo: p.to }).filter((l) => l.account_id === a.gl_account_id);
    const dr = inRange.reduce((s, l) => s.plus(l.debit), ZERO);
    const cr = inRange.reduce((s, l) => s.plus(l.credit), ZERO);
    const close = accountBalance(db(), a.gl_account_id, p.to);
    totalBase = totalBase.plus(close.base);
    b.add({ kind: "line", code: a.code, label: a.name, label_km: a.name_km, values: { currency: a.currency, opening: open.amount.toFixed(dp), in: dr.toFixed(dp), out: cr.toFixed(dp), closing: close.amount.toFixed(dp), closing_base: money(close.base) }, drill: { type: "cash_account", id: a.id, date_from: from, date_to: p.to } });
  }
  b.add({ kind: "total", label: "Total", label_km: "សរុប", values: { currency: null, opening: null, in: null, out: null, closing: null, closing_base: money(totalBase) } });
  b.check(true, "Closing balances are the ledger balances of each account", "សមតុល្យចុងគ្រាជាសមតុល្យក្នុងបញ្ជីនៃគណនីនីមួយៗ");
  b.note("Open an account for its full book with each transaction and running balance.", "បើកគណនីដើម្បីមើលសៀវភៅពេញលេញ។");
  return b;
}

function bankReconciliationReport(user: MockUser) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("date", "Statement date", "ថ្ងៃរបាយការណ៍ធនាគារ", "date"), { key: "statement", label: "Statement balance", label_km: "សមតុល្យធនាគារ", kind: "number" },
    { key: "deposits", label: "Outstanding deposits", label_km: "ប្រាក់បញ្ញើមិនទាន់ឆ្លុះ", kind: "number" }, { key: "payments", label: "Unpresented payments", label_km: "ការទូទាត់មិនទាន់ឆ្លុះ", kind: "number" },
    { key: "book", label: "Book balance", label_km: "សមតុល្យបញ្ជី", kind: "number" }, { key: "difference", label: "Difference", label_km: "លម្អៀង", kind: "number" }, col("status", "Status", "ស្ថានភាព", "text")];
  const visible = new Set(visibleCashBankAccounts(user).map((a) => a.id));
  for (const rec of [...db().reconciliations].filter((r) => visible.has(r.bank_account_id)).sort((a, c) => c.statement_date.localeCompare(a.statement_date))) {
    const { account, summary } = summarise(rec);
    b.add({
      kind: "line", code: account.code, label: account.name, label_km: account.name_km,
      values: { date: rec.statement_date, statement: summary.statement_closing, deposits: summary.outstanding_deposits, payments: summary.unpresented_payments, book: summary.book_balance, difference: summary.difference, status: rec.status },
      drill: { type: "reconciliation", id: rec.id },
    });
  }
  return b;
}

// ------------------------------------------------------------------ analysis

const months = (from: string, to: string, group: "month" | "quarter") => {
  const out: { key: string; label: string; label_km: string; from: string; to: string }[] = [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_KM = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  while (`${y}-${String(m).padStart(2, "0")}` <= to.slice(0, 7) && out.length < 36) {
    const step = group === "quarter" ? 3 - ((m - 1) % 3) : 1;
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const endMonth = m + step - 1;
    const end = addDays(endMonth === 12 ? `${y + 1}-01-01` : `${y}-${String(endMonth + 1).padStart(2, "0")}-01`, -1);
    const q = Math.floor((m - 1) / 3) + 1;
    out.push({
      key: `p${out.length}`, label: group === "quarter" ? `Q${q} ${y}` : `${MONTHS[m - 1]} ${y}`, label_km: group === "quarter" ? `ត្រីមាសទី ${q} ${y}` : `${MONTHS_KM[m - 1]} ${y}`,
      from: start < from ? from : start, to: end > to ? to : end,
    });
    m += step;
    if (m > 12) { m -= 12; y += 1; }
  }
  return out;
};

function revenueByPeriod(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  const periods = months(p.from!, p.to, p.group);
  b.columns = [...periods.map((x) => col(x.key, x.label, x.label_km)), col("total", "Total", "សរុប")];
  const revenue = accountsOf().filter((a) => a.type === "REVENUE");
  const per = periods.map((x) => movements(p, x.from, x.to));
  const sec = b.add({ kind: "section", label: "Revenue accounts", label_km: "គណនីចំណូល", values: {} });
  accountLines(b, user, sec, revenue, (a) => {
    const v: Record<string, Decimal> = {};
    periods.forEach((x, i) => (v[x.key] = get(per[i], a.id).negated()));
    v.total = Object.values(v).reduce((s, d) => s.plus(d), ZERO);
    return v;
  }, (a) => accountDrill(a, p.from, p.to));
  const totals: Record<string, Decimal> = {};
  periods.forEach((x, i) => (totals[x.key] = sumOver(revenue, (a) => get(per[i], a.id).negated())));
  totals.total = Object.values(totals).reduce((s, d) => s.plus(d), ZERO);
  b.add({ kind: "total", label: "Total revenue", label_km: "ចំណូលសរុប", values: fix(totals) });
  const is = incomeFigures(p, p.from!, p.to).revenue;
  b.check(is.eq(totals.total), `Total equals revenue on the income statement (${money(is)})`, `សរុបស្មើចំណូលក្នុងរបាយការណ៍លទ្ធផល (${money(is)})`);
  return b;
}

function expensesBy(user: MockUser, p: Params, by: "category" | "department" | "branch") {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("amount", "Amount", "ចំនួនទឹកប្រាក់")];
  const from = p.from!;
  const expense = accountsOf().filter((a) => a.type === "EXPENSE");
  // Department managers see their own departments only (SRS §15.2 "DEPTMGR own").
  const own = user.roles.includes("DEPTMGR") ? user.department_ids : null;
  let total = ZERO;
  if (by === "category") {
    const mv = movements(p, from, p.to);
    for (const s of IS_SECTIONS.filter((x) => x.sign === 1)) {
      const accounts = expense.filter(s.match);
      const sum = sumOver(accounts, (a) => get(mv, a.id));
      if (sum.isZero()) continue;
      const sid = b.add({ kind: "section", label: s.label, label_km: s.label_km, values: { amount: money(sum) } });
      accountLines(b, user, sid, accounts, (a) => ({ amount: get(mv, a.id) }), (a) => accountDrill(a, from, p.to));
      total = total.plus(sum);
    }
  } else {
    const groups = by === "department"
      ? [...db().departments.filter((d) => !own || own.includes(d.id)).map((d) => ({ id: d.id, name: d.name, name_km: d.name_km })), ...(own ? [] : [{ id: "", name: "No department", name_km: "គ្មាននាយកដ្ឋាន" }])]
      : [...db().companies[0].branches.map((x) => ({ id: x.id, name: x.name, name_km: x.name_km })), { id: "", name: "No branch", name_km: "គ្មានសាខា" }];
    const all = lines(p, { dateFrom: from, dateTo: p.to }).filter((l) => l.journal.type !== "OPENING");
    for (const g of groups) {
      const mine = all.filter((l) => ((by === "department" ? l.department_id : l.branch_id) ?? "") === g.id);
      const mv = netByAccount(mine);
      const sum = sumOver(expense, (a) => get(mv, a.id));
      if (sum.isZero()) continue;
      const sid = b.add({ kind: "section", label: g.name, label_km: g.name_km, values: { amount: money(sum) } });
      accountLines(b, user, sid, expense, (a) => ({ amount: get(mv, a.id) }), (a) => accountDrill(a, from, p.to));
      total = total.plus(sum);
    }
  }
  b.add({ kind: "total", label: "Total expenses", label_km: "ចំណាយសរុប", values: { amount: money(total) } });
  if (!own) {
    const is = incomeFigures(p, from, p.to).expenses;
    b.check(is.eq(total), `Total equals expenses on the income statement (${money(is)})`, `សរុបស្មើចំណាយក្នុងរបាយការណ៍លទ្ធផល (${money(is)})`);
  } else b.note("Showing your own departments only.", "បង្ហាញតែនាយកដ្ឋានរបស់អ្នក។");
  return b;
}

function fxReport(user: MockUser, p: Params, realised: boolean) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("date", "Date", "កាលបរិច្ឆេទ", "date"), col("source", "Source", "ប្រភព", "text"), col("gain", "Gain", "ចំណេញ"), col("loss", "Loss", "ខាត")];
  const [gainCode, lossCode] = realised ? ["7300", "8310"] : ["7400", "8410"];
  const ids = new Set(accountsOf().filter((a) => a.code === gainCode || a.code === lossCode).map((a) => a.id));
  const fx = lines(p, { dateFrom: p.from!, dateTo: p.to }).filter((l) => ids.has(l.account_id));
  let gain = ZERO;
  let loss = ZERO;
  for (const l of fx.sort((a, c) => a.journal.posting_date.localeCompare(c.journal.posting_date))) {
    const g = new Decimal(l.credit_base).minus(l.debit_base);
    const v = g.gte(0) ? { gain: g, loss: ZERO } : { gain: ZERO, loss: g.abs() };
    gain = gain.plus(v.gain);
    loss = loss.plus(v.loss);
    b.add({ kind: "line", code: l.journal.journal_no ?? "", label: l.journal.description, label_km: l.journal.description, values: { date: l.journal.posting_date, source: l.journal.source_no ?? l.journal.reference, ...fix(v) }, drill: { type: "journal", id: l.journal.id } });
  }
  b.add({ kind: "total", label: "Total", label_km: "សរុប", values: { date: null, source: null, gain: money(gain), loss: money(loss) } });
  b.add({ kind: "total", label: "Net gain (loss)", label_km: "ចំណេញ (ខាត) សុទ្ធ", values: { date: null, source: null, gain: money(gain.minus(loss)), loss: null } });
  b.check(true, `Equals the movements of accounts ${gainCode} and ${lossCode}`, `ស្មើចលនាគណនី ${gainCode} និង ${lossCode}`);
  if (!realised) b.note("Unrealised differences come from period-end revaluation runs; each is reversed on the first day of the next period.", "លម្អៀងមិនទាន់សម្រេចបានមកពីការវាយតម្លៃឡើងវិញចុងគ្រា ហើយត្រូវត្រឡប់វិញនៅថ្ងៃដំបូងនៃគ្រាបន្ទាប់។");
  return b;
}

// ------------------------------------------------------------------ tax, journals, controls

function taxSummary(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [{ key: "rate", label: "Rate %", label_km: "អត្រា %", kind: "number" }, col("base", "Taxable amount", "មូលដ្ឋានជាប់ពន្ធ"), col("tax", "Tax", "ពន្ធ")];
  const from = p.from!;
  type Acc = { base: Decimal; tax: Decimal };
  const byCode = new Map<string, Map<string, Acc>>();
  // Keyed by side and code: sales lines are output tax, purchase lines input tax (exempt lines on either side).
  const addLine = (side: "AR" | "AP", codeId: string | null, rate: string | undefined, net: string | undefined, tax: string | undefined, docRate: string, sign: 1 | -1) => {
    if (!codeId) return;
    const key0 = `${side}:${codeId}`;
    const m = byCode.get(key0) ?? new Map<string, Acc>();
    const key = new Decimal(rate ?? 0).toFixed();
    const cur = m.get(key) ?? { base: ZERO, tax: ZERO };
    m.set(key, { base: cur.base.plus(baseOf(net ?? 0, docRate).times(sign)), tax: cur.tax.plus(baseOf(tax ?? 0, docRate).times(sign)) });
    byCode.set(key0, m);
  };
  for (const d of db().invoices) {
    if (!d.posted || d.is_opening || d.date < from || d.date > p.to) continue;
    for (const l of d.lines) addLine(d.kind, l.tax_code_id, l.tax_rate, l.net, l.tax, d.rate, 1);
  }
  for (const c of db().creditNotes) {
    if (c.status !== "POSTED" || c.date < from || c.date > p.to) continue;
    const inv = db().invoices.find((x) => x.id === c.invoice_id)!;
    for (const l of c.lines) addLine("AR", l.tax_code_id, l.tax_rate, l.net, l.tax, inv.rate, -1);
  }
  const totals = { OUTPUT: ZERO, INPUT: ZERO };
  for (const kind of ["OUTPUT", "INPUT"] as const) {
    const sid = b.add({ kind: "section", label: kind === "OUTPUT" ? "Output tax (sales)" : "Input tax (purchases)", label_km: kind === "OUTPUT" ? "ពន្ធធាតុចេញ (លក់)" : "ពន្ធធាតុចូល (ទិញ)", values: {} });
    let base = ZERO;
    for (const code of db().taxCodes.filter((c) => c.kind === kind || c.kind === "EXEMPT")) {
      for (const [rate, acc] of byCode.get(`${kind === "OUTPUT" ? "AR" : "AP"}:${code.id}`) ?? []) {
        totals[kind] = totals[kind].plus(acc.tax);
        base = base.plus(acc.base);
        b.add({ parent: sid, kind: "line", code: code.code, label: `${code.name}${code.verification !== "VERIFIED" ? " — unverified" : ""}`, label_km: code.name_km, values: { rate, base: money(acc.base), tax: money(acc.tax) } });
      }
    }
    b.add({ parent: sid, kind: "subtotal", label: "Total", label_km: "សរុប", values: { rate: null, base: money(base), tax: money(totals[kind]) } });
  }
  // BR: tax totals equal movements of the tax accounts, differences listed (§15.3 RPT-18).
  const mv = movements(p, from, p.to);
  const outputAccount = get(mv, "acc-2200").negated();
  const inputAccount = get(mv, "acc-1410");
  const outDiff = outputAccount.minus(totals.OUTPUT);
  const inDiff = inputAccount.minus(totals.INPUT);
  b.check(outDiff.isZero(), outDiff.isZero() ? "Output tax equals the movement of account 2200" : `Account 2200 moved ${money(outputAccount)}; ${money(outDiff)} was posted without tax documents`,
    outDiff.isZero() ? "ពន្ធធាតុចេញស្មើចលនាគណនី 2200" : `គណនី 2200 មានចលនា ${money(outputAccount)}៖ ${money(outDiff)} ត្រូវបានកត់ត្រាដោយគ្មានឯកសារពន្ធ`);
  b.check(inDiff.isZero(), inDiff.isZero() ? "Input tax equals the movement of account 1410" : `Account 1410 moved ${money(inputAccount)}; ${money(inDiff)} was posted without tax documents`,
    inDiff.isZero() ? "ពន្ធធាតុចូលស្មើចលនាគណនី 1410" : `គណនី 1410 មានចលនា ${money(inputAccount)}៖ ${money(inDiff)} ត្រូវបានកត់ត្រាដោយគ្មានឯកសារពន្ធ`);
  b.note("Rates are illustrative and the summary is not a tax return.", "អត្រាជាឧទាហរណ៍ ហើយសេចក្តីសង្ខេបនេះមិនមែនជាលិខិតប្រកាសពន្ធទេ។");
  return b;
}

function journalReport(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("date", "Date", "កាលបរិច្ឆេទ", "date"), col("type", "Type", "ប្រភេទ", "text"), col("status", "Status", "ស្ថានភាព", "text"), col("debit", "Debit", "ឥណពន្ធ"), col("credit", "Credit", "ឥណទាន")];
  const statuses = (p.status || "POSTED").split(",");
  const sensitive = !canSeeSensitive(user);
  const list = db().journals.filter((j) => statuses.includes(j.status) && j.posting_date >= p.from! && j.posting_date <= p.to)
    .filter((j) => !sensitive || !j.lines.some((l) => db().accounts.find((a) => a.id === l.account_id)?.is_sensitive))
    .sort((a, c) => a.posting_date.localeCompare(c.posting_date) || (a.journal_no ?? "").localeCompare(c.journal_no ?? ""));
  let unbalanced = 0;
  let dr = ZERO;
  let cr = ZERO;
  for (const j of list) {
    if (!new Decimal(j.totals.difference).isZero()) unbalanced += 1;
    dr = dr.plus(j.totals.debit_base);
    cr = cr.plus(j.totals.credit_base);
    const id = b.add({ kind: "section", code: j.journal_no ?? j.reference, label: j.description, label_km: j.description, values: { date: j.posting_date, type: j.type, status: j.status, debit: j.totals.debit_base, credit: j.totals.credit_base }, drill: { type: "journal", id: j.id } });
    for (const l of j.lines) b.add({ parent: id, kind: "line", code: l.account_code, label: l.account_name, label_km: l.account_name_km, values: { date: null, type: null, status: null, debit: l.debit_base, credit: l.credit_base } });
  }
  b.add({ kind: "total", label: `Total (${list.length} journals)`, label_km: `សរុប (${list.length} ទិនានុប្បវត្តិ)`, values: { date: null, type: null, status: null, debit: money(dr), credit: money(cr) } });
  b.check(unbalanced === 0, unbalanced === 0 ? "Every journal is balanced" : `${unbalanced} journals are not balanced`, unbalanced === 0 ? "ទិនានុប្បវត្តិទាំងអស់មានតុល្យភាព" : `${unbalanced} ទិនានុប្បវត្តិមិនមានតុល្យភាព`);
  if (sensitive) b.note("Journals on sensitive accounts are not listed for your role.", "ទិនានុប្បវត្តិលើគណនីរសើបមិនត្រូវបានបង្ហាញសម្រាប់តួនាទីរបស់អ្នក។");
  return b;
}

function subledgerReconciliation(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("subledger", "Subledger", "បញ្ជីរង"), col("gl", "Control account", "គណនីត្រួតពិនិត្យ"), col("difference", "Difference", "លម្អៀង")];
  const sumParties = (kind: "AR" | "AP") => db().invoices.filter((d) => d.kind === kind && d.posted && d.date <= p.to).reduce((s, d) => s.plus(outstandingAt(d, p.to).base), ZERO);
  const gl = (id: string, credit = false) => (credit ? accountBalance(db(), id, p.to).base.negated() : accountBalance(db(), id, p.to).base);
  const advances = db().partyPayments.filter((x) => x.kind === "RECEIPT" && x.status === "POSTED" && x.date <= p.to).reduce((s, x) => s.plus(baseOf(x.unapplied, x.rate)), ZERO);
  const cashBook = db().cashBankAccounts.reduce((s, a) => s.plus(accountBalance(db(), a.gl_account_id, p.to).base), ZERO);
  const cashGl = accountsOf().filter((a) => a.cash_flow_class === "CASH").reduce((s, a) => s.plus(gl(a.id)), ZERO);
  const rows: [string, string, string, Decimal, Decimal][] = [
    ["1200", "Customers (AR)", "អតិថិជន (គណនីត្រូវទទួល)", sumParties("AR"), gl("acc-1200")],
    ["2100", "Suppliers (AP)", "អ្នកផ្គត់ផ្គង់ (គណនីត្រូវសង)", sumParties("AP"), gl("acc-2100", true)],
    ["2300", "Unapplied customer receipts", "បង្កាន់ដៃអតិថិជនមិនទាន់កាត់កង", advances, gl("acc-2300", true)],
    ["1101–1111", "Cash and bank books", "សៀវភៅសាច់ប្រាក់ និងធនាគារ", cashBook, cashGl],
  ];
  let bad = 0;
  for (const [code, label, label_km, sub, ctl] of rows) {
    const diff = sub.minus(ctl);
    if (!diff.isZero()) bad += 1;
    b.add({ kind: "line", code, label, label_km, values: fix({ subledger: sub, gl: ctl, difference: diff }) });
  }
  const register = db().assets.filter((a) => a.status !== "DRAFT" && a.acquisition_date <= p.to && !(a.status === "DISPOSED" && a.disposal && a.disposal.date <= p.to));
  const faCost = register.reduce((s2, a) => s2.plus(a.cost), ZERO);
  const faAcc = register.reduce((s2, a) => s2.plus(assetAccumulatedAt(a, p.to)), ZERO);
  const faRows: [string, string, string, Decimal, Decimal][] = [
    ["1510, 1520", "Fixed asset register — cost", "បញ្ជីទ្រព្យសកម្ម — ថ្លៃដើម", faCost, gl("acc-1510").plus(gl("acc-1520"))],
    ["1590", "Fixed asset register — accumulated depreciation", "បញ្ជីទ្រព្យសកម្ម — រំលស់បង្គរ", faAcc, gl("acc-1590", true)],
  ];
  for (const [code, label, label_km, sub, ctl] of faRows) {
    const diff = sub.minus(ctl);
    if (!diff.isZero()) bad += 1;
    b.add({ kind: "line", code, label, label_km, values: fix({ subledger: sub, gl: ctl, difference: diff }) });
  }
  const valuation = db().inventoryValuations.filter((v) => v.date <= p.to).sort((x, y) => y.date.localeCompare(x.date))[0];
  if (valuation) {
    const ctl = accountBalance(db(), "acc-1300", valuation.date).base;
    b.add({ kind: "line", code: "1300", label: `Inventory valuation at ${valuation.date} (supplied)`, label_km: `តម្លៃសន្និធិនៅ ${valuation.date}`, values: fix({ subledger: new Decimal(valuation.total), gl: ctl, difference: new Decimal(valuation.total).minus(ctl) }) });
    b.note("Inventory valuation comes from the inventory system; a difference is listed for review and does not fail this check (BR-INV-001).", "តម្លៃសន្និធិមកពីប្រព័ន្ធសន្និធិ លម្អៀងត្រូវបានរាយសម្រាប់ពិនិត្យ។");
  }
  b.check(bad === 0, bad === 0 ? "Every subledger agrees with its control account" : `${bad} subledgers differ from their control accounts`, bad === 0 ? "បញ្ជីរងទាំងអស់ត្រូវគ្នានឹងគណនីត្រួតពិនិត្យ" : `${bad} បញ្ជីរងខុសពីគណនីត្រួតពិនិត្យ`);
  if (p.to < MOCK_TODAY) b.note("Unapplied receipts are shown as they stand today, not as at the chosen date.", "បង្កាន់ដៃមិនទាន់កាត់កងបង្ហាញតាមស្ថានភាពថ្ងៃនេះ។");
  return b;
}

function reopenedPostings(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("date", "Posting date", "ថ្ងៃកត់ត្រា", "date"), col("period", "Period", "គ្រា", "text"), col("posted_at", "Posted at", "កត់ត្រានៅ", "text"), col("amount", "Amount", "ចំនួនទឹកប្រាក់")];
  const periods = db().fiscalYears.flatMap((y) => y.periods);
  const reopened = periods.filter((x) => x.status === "REOPENED");
  const list = db().journals.filter((j) => j.status === "POSTED" && j.posting_date >= p.from! && j.posting_date <= p.to && reopened.some((x) => x.start_date <= j.posting_date && j.posting_date <= x.end_date));
  for (const j of list) b.add({ kind: "line", code: j.journal_no ?? "", label: j.description, label_km: j.description, values: { date: j.posting_date, period: j.period, posted_at: j.posted_at, amount: j.totals.debit_base }, drill: { type: "journal", id: j.id } });
  b.note(reopened.length ? `Periods currently reopened: ${reopened.map((x) => x.name).join(", ")}` : "No period is reopened at present.", reopened.length ? `គ្រាដែលកំពុងបើកឡើងវិញ៖ ${reopened.map((x) => x.name_km).join(", ")}` : "បច្ចុប្បន្នគ្មានគ្រាណាត្រូវបានបើកឡើងវិញទេ។");
  return b;
}

function selfApprovals(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("date", "Date", "កាលបរិច្ឆេទ", "date"), col("type", "Document", "ឯកសារ", "text"), col("user", "User", "អ្នកប្រើ", "text"), col("amount", "Amount", "ចំនួនទឹកប្រាក់")];
  const inRange = (d: string) => d >= p.from! && d <= p.to;
  const selfStep = (steps: { approver_name?: string | null; status: string }[], preparer: string) => steps.some((s) => s.status === "APPROVED" && s.approver_name === preparer);
  for (const j of db().journals.filter((x) => (x.type === "MANUAL" || x.type === "ADJUSTING") && inRange(x.posting_date) && selfStep(x.approval_steps, x.preparer_name))) {
    b.add({ kind: "line", code: j.journal_no ?? j.reference, label: j.description, label_km: j.description, values: { date: j.posting_date, type: "Journal", user: j.preparer_name, amount: j.totals.debit_base }, drill: { type: "journal", id: j.id } });
  }
  for (const d of db().invoices.filter((x) => inRange(x.date) && selfStep(x.approval_steps, x.preparer_name))) {
    b.add({ kind: "line", code: d.number ?? "", label: d.party_name, label_km: d.party_name_km, values: { date: d.date, type: d.kind === "AR" ? "Customer invoice" : "Supplier invoice", user: d.preparer_name, amount: d.total_base }, drill: { type: d.kind === "AR" ? "customer_invoice" : "supplier_invoice", id: d.id } });
  }
  for (const e of db().expenses.filter((x) => inRange(x.date) && selfStep(x.approval_steps, x.preparer_name))) {
    b.add({ kind: "line", code: e.number ?? "", label: e.description, label_km: e.description, values: { date: e.date, type: "Expense", user: e.preparer_name, amount: e.amount_base } });
  }
  b.note(db().reducedSod ? "Reduced separation-of-duties mode is on (SRS D-10)." : "Strict separation of duties is on, so self-approval is refused; this list should stay empty.",
    db().reducedSod ? "របៀបបំបែកភារកិច្ចកាត់បន្ថយកំពុងបើក (SRS D-10)។" : "ការបំបែកភារកិច្ចតឹងរ៉ឹងកំពុងបើក ដូច្នេះការអនុម័តខ្លួនឯងត្រូវបានបដិសេធ បញ្ជីនេះគួរតែទទេ។");
  return b;
}

// ------------------------------------------------------------------ fixed assets and budgets (Phase 6)

const scheduleAmount = (a: Parameters<typeof termsOf>[0], period: string) => amountFor(termsOf(a), period);

/** Accumulated depreciation of an asset at a date: brought forward plus runs posted for periods up to it. */
function assetAccumulatedAt(a: { id: string; accumulated_brought_forward: string }, date: string): Decimal {
  let acc = new Decimal(a.accumulated_brought_forward);
  for (const run of db().depreciationRuns) {
    if (run.status !== "POSTED" || run.period_end > date) continue;
    for (const l of run.lines) if (l.asset_id === a.id) acc = acc.plus(l.amount);
  }
  return acc;
}

function assetRegister(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("in_service", "In service", "ចូលប្រើ", "date"), col("status", "Status", "ស្ថានភាព", "text"), col("cost", "Cost", "ថ្លៃដើម"), col("accumulated", "Accumulated depreciation", "រំលស់បង្គរ"), col("nbv", "Net book value", "តម្លៃសុទ្ធតាមបញ្ជី")];
  const own = user.roles.includes("DEPTMGR") ? user.department_ids : null;
  const totals = { cost: ZERO, accumulated: ZERO };
  for (const cat of db().assetCategories) {
    const assets = db().assets.filter((a) => a.category_id === cat.id && a.status !== "DRAFT" && a.acquisition_date <= p.to && (!p.branchId || a.branch_id === p.branchId) && (!own || (a.department_id && own.includes(a.department_id))));
    if (!assets.length) continue;
    const sid = b.add({ kind: "section", label: cat.name, label_km: cat.name_km, values: {} });
    let cost = ZERO;
    let acc = ZERO;
    for (const a of assets) {
      const disposed = a.status === "DISPOSED" && a.disposal !== null && a.disposal.date <= p.to;
      const accumulated = disposed ? ZERO : assetAccumulatedAt(a, p.to);
      const c = disposed ? ZERO : new Decimal(a.cost);
      cost = cost.plus(c);
      acc = acc.plus(accumulated);
      b.add({ parent: sid, kind: "line", code: a.tag, label: a.name, label_km: a.name_km, values: { in_service: a.in_service_date, status: disposed ? "DISPOSED" : a.status, cost: money(c), accumulated: money(accumulated), nbv: money(c.minus(accumulated)) }, drill: { type: "asset", id: a.id } });
    }
    b.add({ parent: sid, kind: "subtotal", label: `Total ${cat.name.toLowerCase()}`, label_km: `សរុប${cat.name_km}`, values: { in_service: null, status: null, cost: money(cost), accumulated: money(acc), nbv: money(cost.minus(acc)) } });
    totals.cost = totals.cost.plus(cost);
    totals.accumulated = totals.accumulated.plus(acc);
  }
  b.add({ kind: "total", label: "Total", label_km: "សរុប", values: { in_service: null, status: null, cost: money(totals.cost), accumulated: money(totals.accumulated), nbv: money(totals.cost.minus(totals.accumulated)) } });
  if (!own && !p.branchId) {
    const costGl = ["acc-1510", "acc-1520"].reduce((s2, id) => s2.plus(accountBalance(db(), id, p.to).base), ZERO);
    const accGl = accountBalance(db(), "acc-1590", p.to).base.negated();
    const okCost = costGl.eq(totals.cost);
    const okAcc = accGl.eq(totals.accumulated);
    b.check(okCost, okCost ? `Cost equals accounts 1510 and 1520 (${money(costGl)})` : `Accounts 1510 and 1520 hold ${money(costGl)}; difference ${money(costGl.minus(totals.cost))}`,
      okCost ? `ថ្លៃដើមស្មើគណនី 1510 និង 1520 (${money(costGl)})` : `គណនី 1510 និង 1520 មាន ${money(costGl)} ខុសគ្នា ${money(costGl.minus(totals.cost))}`);
    b.check(okAcc, okAcc ? `Accumulated depreciation equals account 1590 (${money(accGl)})` : `Account 1590 holds ${money(accGl)}; difference ${money(accGl.minus(totals.accumulated))}`,
      okAcc ? `រំលស់បង្គរស្មើគណនី 1590 (${money(accGl)})` : `គណនី 1590 មាន ${money(accGl)} ខុសគ្នា ${money(accGl.minus(totals.accumulated))}`);
  }
  const drafts = db().assets.filter((a) => a.status === "DRAFT").length;
  if (drafts) b.note(`${drafts} draft assets from supplier invoices are waiting to be completed and are not listed; their cost is already in the ledger.`, `ទ្រព្យសេចក្តីព្រាង ${drafts} ពីវិក្កយបត្រអ្នកផ្គត់ផ្គង់កំពុងរង់ចាំ ហើយមិនត្រូវបានបង្ហាញ។`);
  return b;
}

function depreciationSchedule(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  const periods = months(p.from!, p.to, "month");
  b.columns = [...periods.map((x) => col(x.key, x.label, x.label_km)), col("total", "Total", "សរុប")];
  const own = user.roles.includes("DEPTMGR") ? user.department_ids : null;
  const grand: Record<string, Decimal> = {};
  for (const cat of db().assetCategories) {
    const assets = db().assets.filter((a) => a.category_id === cat.id && a.status !== "DRAFT" && (!own || (a.department_id && own.includes(a.department_id))));
    const rows = assets.map((a) => {
      const v: Record<string, Decimal> = {};
      periods.forEach((x) => {
        const code = x.from.slice(0, 7);
        const posted = db().depreciationRuns.find((r) => r.status === "POSTED" && r.period_code === code)?.lines.find((l) => l.asset_id === a.id)?.amount;
        const planned = a.status === "DISPOSED" ? ZERO : scheduleAmount(a, code);
        v[x.key] = new Decimal(posted ?? planned);
      });
      v.total = Object.values(v).reduce((s2, d) => s2.plus(d), ZERO);
      return { a, v };
    }).filter((r) => !r.v.total.isZero());
    if (!rows.length) continue;
    const sid = b.add({ kind: "section", label: cat.name, label_km: cat.name_km, values: {} });
    for (const r of rows) {
      b.add({ parent: sid, kind: "line", code: r.a.tag, label: r.a.name, label_km: r.a.name_km, values: fix(r.v), drill: { type: "asset", id: r.a.id } });
      for (const [k, d] of Object.entries(r.v)) grand[k] = (grand[k] ?? ZERO).plus(d);
    }
  }
  b.add({ kind: "total", label: "Total depreciation", label_km: "រំលស់សរុប", values: fix(grand) });
  b.note("Months with a posted run show the posted amount; later months show the schedule.", "ខែដែលបានកត់ត្រាបង្ហាញចំនួនដែលបានកត់ត្រា ខែបន្ទាប់បង្ហាញតាមតារាង។");
  return b;
}

function budgetVsActual(user: MockUser, p: Params) {
  const b = new Builder() as Builder & { columns: ReportColumn[] };
  b.columns = [col("budget", "Budget", "ថវិកា"), col("actual", "Actual", "ជាក់ស្តែង"), col("variance", "Variance", "លម្អៀង"), { key: "pct", label: "Variance %", label_km: "លម្អៀង %", kind: "number" }];
  const from = p.from!;
  const fy = db().fiscalYears.find((y) => y.start_date <= p.to && p.to <= y.end_date);
  const budget = fy ? db().budgets.find((x) => x.fiscal_year_id === fy.id && x.status === "APPROVED") : undefined;
  if (!budget || !fy) {
    b.note("There is no approved budget for this year.", "មិនទាន់មានថវិកាដែលបានអនុម័តសម្រាប់ឆ្នាំនេះទេ។");
    return b;
  }
  const own = user.roles.includes("DEPTMGR") ? user.department_ids : null;
  const m0 = Number(from.slice(5, 7)) - 1;
  const m1 = Number(p.to.slice(5, 7)) - 1;
  const lines = budget.lines.filter((l) => (!p.departmentId || l.department_id === p.departmentId) && (!p.branchId || l.branch_id === p.branchId) && (!own || (l.department_id && own.includes(l.department_id))));
  const totals = { REVENUE: { budget: ZERO, actual: ZERO }, EXPENSE: { budget: ZERO, actual: ZERO } };
  const flagged: string[] = [];
  for (const type of ["REVENUE", "EXPENSE"] as const) {
    const sid = b.add({ kind: "section", label: type === "REVENUE" ? "Revenue" : "Expenses", label_km: type === "REVENUE" ? "ចំណូល" : "ចំណាយ", values: {} });
    for (const l of lines) {
      const account = db().accounts.find((a) => a.id === l.account_id)!;
      if (account.type !== type) continue;
      if (account.is_sensitive && !canSeeSensitive(user)) continue;
      const bud = l.months.slice(m0, m1 + 1).reduce((s2, m) => s2.plus(m), ZERO);
      const act = actualFor(db(), l, from, p.to, type);
      // A positive variance is favourable: more revenue, or less expense, than budgeted.
      const variance = type === "REVENUE" ? act.minus(bud) : bud.minus(act);
      const pct = bud.isZero() ? null : variance.div(bud).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
      if (pct && pct.lt(-10)) flagged.push(account.code);
      totals[type].budget = totals[type].budget.plus(bud);
      totals[type].actual = totals[type].actual.plus(act);
      const dept = db().departments.find((d) => d.id === l.department_id);
      b.add({ parent: sid, kind: "line", code: account.code, label: `${account.name}${dept ? ` — ${dept.name}` : ""}`, label_km: `${account.name_km}${dept ? ` — ${dept.name_km}` : ""}`, values: { budget: money(bud), actual: money(act), variance: money(variance), pct: pct ? pct.toFixed(1) : null }, drill: accountDrill(account, from, p.to) });
    }
    const t = totals[type];
    const variance = type === "REVENUE" ? t.actual.minus(t.budget) : t.budget.minus(t.actual);
    b.add({ parent: sid, kind: "subtotal", label: type === "REVENUE" ? "Total revenue" : "Total expenses", label_km: type === "REVENUE" ? "ចំណូលសរុប" : "ចំណាយសរុប", values: { budget: money(t.budget), actual: money(t.actual), variance: money(variance), pct: t.budget.isZero() ? null : variance.div(t.budget).times(100).toFixed(1) } });
  }
  const unique = [...new Set(flagged)];
  b.check(unique.length === 0, unique.length ? `Adverse variance over 10 %: ${unique.join(", ")}` : "No adverse variance over 10 %", unique.length ? `លម្អៀងអវិជ្ជមានលើស 10 %៖ ${unique.join(", ")}` : "គ្មានលម្អៀងអវិជ្ជមានលើស 10 % ទេ");
  b.note(`Approved budget: ${budget.name} (version ${budget.version}). Actuals are posted transactions only; approved but unposted documents are not included.`, `ថវិកាដែលបានអនុម័ត៖ ${budget.name} (កំណែ ${budget.version})។ ជាក់ស្តែងគឺតែប្រតិបត្តិការដែលបានកត់ត្រា។`);
  return b;
}

// ------------------------------------------------------------------ dispatcher

const TITLES: Record<string, [string, string]> = {
  "balance-sheet": ["Balance Sheet", "តារាងតុល្យការ"], "income-statement": ["Income Statement", "របាយការណ៍លទ្ធផល"],
  "cash-flow": ["Cash Flow Statement", "របាយការណ៍លំហូរសាច់ប្រាក់"], "changes-in-equity": ["Statement of Changes in Equity", "របាយការណ៍បម្រែបម្រួលមូលធន"],
  ratios: ["Financial Ratios and KPIs", "អនុបាតហិរញ្ញវត្ថុ និង KPI"], "journal-entries": ["Journal Entry Report", "របាយការណ៍ទិនានុប្បវត្តិ"],
  "customer-balances": ["Customer Balances", "សមតុល្យអតិថិជន"], "supplier-balances": ["Supplier Balances", "សមតុល្យអ្នកផ្គត់ផ្គង់"],
  "outstanding-invoices": ["Outstanding Invoices", "វិក្កយបត្រមិនទាន់ទូទាត់"], "outstanding-payables": ["Outstanding Payables", "បំណុលមិនទាន់ទូទាត់"],
  cashbook: ["Cashbook", "សៀវភៅសាច់ប្រាក់"], bankbook: ["Bankbook", "សៀវភៅធនាគារ"], "bank-reconciliation": ["Bank Reconciliation", "ការផ្ទៀងផ្ទាត់ធនាគារ"],
  "revenue-by-period": ["Revenue by Period", "ចំណូលតាមគ្រា"], "expenses-by-category": ["Expenses by Category", "ចំណាយតាមប្រភេទ"],
  "expenses-by-department": ["Expenses by Department", "ចំណាយតាមនាយកដ្ឋាន"], "expenses-by-branch": ["Expenses by Branch", "ចំណាយតាមសាខា"],
  "realised-fx": ["Realised FX Gain/Loss", "ចំណេញ/ខាតអត្រាប្តូរប្រាក់ដែលបានសម្រេច"], "unrealised-fx": ["Unrealised FX Gain/Loss", "ចំណេញ/ខាតអត្រាប្តូរប្រាក់មិនទាន់សម្រេច"],
  "tax-summary": ["Tax Summary", "សេចក្តីសង្ខេបពន្ធ"], "subledger-reconciliation": ["Subledger-to-GL Reconciliation", "ការផ្ទៀងផ្ទាត់បញ្ជីរងជាមួយបញ្ជីធំ"],
  "reopened-period-postings": ["Postings in Reopened Periods", "ការកត់ត្រាក្នុងគ្រាដែលបើកឡើងវិញ"], "self-approval-exceptions": ["Self-Approval Exceptions", "ករណីលើកលែងការអនុម័តខ្លួនឯង"],
  "fixed-asset-register": ["Fixed Asset Register", "បញ្ជីទ្រព្យសកម្មរយៈពេលវែង"], "depreciation-schedule": ["Depreciation Schedule", "តារាងរំលស់"], "budget-vs-actual": ["Budget versus Actual", "ថវិកាធៀបនឹងជាក់ស្តែង"],
};

const BUILDERS: Record<string, (user: MockUser, p: Params) => Builder & { columns: ReportColumn[] }> = {
  "balance-sheet": balanceSheet, "income-statement": incomeStatement, "cash-flow": cashFlow, "changes-in-equity": changesInEquity, ratios,
  "journal-entries": journalReport, "customer-balances": (u, p) => partyBalances(u, p, "AR"), "supplier-balances": (u, p) => partyBalances(u, p, "AP"),
  "outstanding-invoices": (u, p) => outstanding(u, p, "AR"), "outstanding-payables": (u, p) => outstanding(u, p, "AP"),
  cashbook: (u, p) => books(u, p, "CASH"), bankbook: (u, p) => books(u, p, "BANK"), "bank-reconciliation": bankReconciliationReport,
  "revenue-by-period": revenueByPeriod, "expenses-by-category": (u, p) => expensesBy(u, p, "category"), "expenses-by-department": (u, p) => expensesBy(u, p, "department"),
  "expenses-by-branch": (u, p) => expensesBy(u, p, "branch"), "realised-fx": (u, p) => fxReport(u, p, true), "unrealised-fx": (u, p) => fxReport(u, p, false),
  "tax-summary": taxSummary, "subledger-reconciliation": subledgerReconciliation, "reopened-period-postings": reopenedPostings, "self-approval-exceptions": selfApprovals,
  "fixed-asset-register": assetRegister, "depreciation-schedule": depreciationSchedule, "budget-vs-actual": budgetVsActual,
};

/** Build a report for a user, or an error response (permission, unknown report, bad dates). */
export function buildReport(slug: string, user: MockUser, q: URLSearchParams): ReportDocument | Response {
  const entry = findReport(slug);
  const builder = BUILDERS[slug];
  if (!entry || !builder || entry.phase) return fail(404, "NOT_FOUND", "Report not found.");
  // Cashiers have the cashbook for their own accounts (SRS §15.2).
  if (!hasPermission(user.permissions, entry.permission)) return fail(403, "FORBIDDEN", `Permission ${entry.permission} is required.`);
  const ranged = entry.params.includes("range");
  const to = (ranged ? q.get("date_to") : q.get("as_of") ?? q.get("date_to")) || MOCK_TODAY;
  const from = ranged ? q.get("date_from") || fiscalStart(to) : null;
  if (!isDate(to) || (ranged && (!isDate(from) || from! > to))) {
    return fail(422, "VALIDATION_ERROR", "Choose a valid date range.", [{ field: "date_from", issue: "invalid_range", message: "Choose a valid date range." }]);
  }
  const compare = q.get("compare");
  const unposted = q.get("include_unposted") === "true" && entry.params.includes("unposted");
  const params: Params = {
    from, to, branchId: entry.params.includes("branch") ? q.get("branch_id") || null : null,
    departmentId: entry.params.includes("department") ? q.get("department_id") || null : null,
    compare: compare === "prior_period" || compare === "prior_year" ? compare : "", unposted,
    group: q.get("group") === "quarter" ? "quarter" : "month", status: q.get("status") ?? "",
  };
  const b = builder(user, params);
  const [title, title_km] = TITLES[slug];
  return {
    report_id: entry.id, slug, title, title_km, date_from: from, date_to: to, basis: "ACCRUAL", currency: BASE, branch_id: params.branchId, department_id: params.departmentId,
    generated_at: new Date().toISOString(), generated_by: user.full_name, includes_unposted: unposted, columns: b.columns, rows: b.rows, checks: b.checks, notes: b.notes,
  };
}

/** CSV rows from a report document: identical figures to the screen (AT-RPT-03). */
export function reportCsvRows(doc: ReportDocument): (string | number)[][] {
  const depth = (row: { parent_id: string | null }): number => (row.parent_id ? 1 + depth(doc.rows.find((r) => r.id === row.parent_id)!) : 0);
  return [
    [doc.title, `${doc.date_from ?? ""}${doc.date_from ? " – " : "As of "}${doc.date_to}`, `Basis: accrual`, `Currency: ${doc.currency}`, doc.includes_unposted ? "Includes unposted transactions" : "Posted transactions only"],
    ["Code", "Line", ...doc.columns.map((c) => (c.currency ? `${c.label} (${c.currency})` : c.label))],
    ...doc.rows.map((r) => [r.code ?? "", `${"  ".repeat(depth(r))}${r.label}`, ...doc.columns.map((c) => r.values[c.key] ?? "")]),
    ...doc.checks.map((c) => ["", `${c.ok ? "OK" : "CHECK"}: ${c.message}`]),
  ];
}

export const statementHandlers = [
  // ASSUMPTION: one endpoint per catalogue report, GET /reports/{slug}, returning a ReportDocument (SRS §13.3 lists /reports/*).
  route("get", "/reports/:slug", null, ({ user, url, params }) => {
    const doc = buildReport(params.slug, user, url.searchParams);
    return doc instanceof Response ? doc : HttpResponse.json(doc);
  }),
];
