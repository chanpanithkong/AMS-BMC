import Decimal from "decimal.js";
import type { AssetCategory, DepreciationRun, FixedAsset } from "@/lib/api/types/assets";
import type { ApprovalStep } from "@/lib/api/types/common";
import type { Invoice } from "@/lib/api/types/arap";
import type { Account } from "@/lib/api/types/accounts";
import type { Budget, BudgetLine, FxRevaluation, ImportBatch, InventoryEvent, InventoryValuation } from "@/lib/api/types/planning";
import { accumulatedThrough, amountFor, type DepreciationTerms } from "@/lib/money/depreciation";
import { accountBalance, line, postJournal, type PostingStore } from "./posting";

// Phase 6 demo data: fixed assets and depreciation runs, budgets, FX revaluation, inventory
// integration and import history. All figures are ILLUSTRATIVE (SRS §2.4).

export const GO_LIVE_PERIOD = "2026-12";

export interface AdvancedState {
  assetCategories: AssetCategory[];
  assets: FixedAsset[];
  depreciationRuns: DepreciationRun[];
  /** asset id → periods ("YYYY-MM") posted by a run (BR-FA-002). */
  depreciationPosted: Record<string, Record<string, string>>;
  budgets: Budget[];
  /** "budget:department" → highest alert threshold already sent (FR-BUD-009). */
  budgetAlerts: Record<string, number>;
  fxRevaluations: FxRevaluation[];
  inventoryEvents: InventoryEvent[];
  inventoryValuations: InventoryValuation[];
  importBatches: ImportBatch[];
  /** AT-IMP-02: false after an opening-balance import until it is signed off. */
  openingSignedOff: boolean;
}

interface Person {
  id: string;
  full_name: string;
}

export const ASSET_CATEGORIES: AssetCategory[] = [
  { id: "fac-it", code: "IT", name: "IT equipment", name_km: "បរិក្ខារព័ត៌មានវិទ្យា", cost_account_id: "acc-1510", accumulated_account_id: "acc-1590", expense_account_id: "acc-6600", gain_account_id: "acc-7500", loss_account_id: "acc-8500", method: "STRAIGHT_LINE", declining_rate: null, useful_life_months: 36, convention: "NEXT_MONTH" },
  { id: "fac-furniture", code: "FURN", name: "Furniture and fittings", name_km: "គ្រឿងសង្ហារិម", cost_account_id: "acc-1510", accumulated_account_id: "acc-1590", expense_account_id: "acc-6600", gain_account_id: "acc-7500", loss_account_id: "acc-8500", method: "STRAIGHT_LINE", declining_rate: null, useful_life_months: 60, convention: "NEXT_MONTH" },
  { id: "fac-vehicles", code: "VEH", name: "Vehicles", name_km: "យានយន្ត", cost_account_id: "acc-1520", accumulated_account_id: "acc-1590", expense_account_id: "acc-6600", gain_account_id: "acc-7500", loss_account_id: "acc-8500", method: "STRAIGHT_LINE", declining_rate: null, useful_life_months: 60, convention: "NEXT_MONTH" },
];

type SeedAsset = Pick<FixedAsset, "tag" | "name" | "name_km" | "category_id" | "cost" | "residual_value" | "useful_life_months" | "in_service_date" | "location" | "branch_id" | "department_id" | "custodian" | "supplier_name">;

/** Assets at go-live: their cost and accumulated depreciation make up the opening balances of 1510, 1520 and 1590. */
export const ASSET_SEED: SeedAsset[] = [
  { tag: "FA-0001", name: "Server and network equipment", name_km: "ម៉ាស៊ីនមេ និងបរិក្ខារបណ្តាញ", category_id: "fac-it", cost: "12000.00", residual_value: "0.00", useful_life_months: 60, in_service_date: "2025-09-15", location: "Server room", branch_id: "br-pp", department_id: "dep-FIN", custodian: "Keo Vannak", supplier_name: "Asia IT Solutions" },
  { tag: "FA-0002", name: "Office furniture", name_km: "គ្រឿងសង្ហារិមការិយាល័យ", category_id: "fac-furniture", cost: "7200.00", residual_value: "0.00", useful_life_months: 60, in_service_date: "2024-12-10", location: "Head office", branch_id: "br-pp", department_id: "dep-ADMIN", custodian: "Sok Dara", supplier_name: "Royal Furniture" },
  { tag: "FA-0003", name: "Laptops (8)", name_km: "កុំព្យូទ័រយួរដៃ (8)", category_id: "fac-it", cost: "4800.00", residual_value: "0.00", useful_life_months: 36, in_service_date: "2026-03-20", location: "Sales floor", branch_id: "br-pp", department_id: "dep-SALES", custodian: "Chea Sokha", supplier_name: "Star IT Solutions" },
  { tag: "FA-0004", name: "Delivery truck", name_km: "រថយន្តដឹកជញ្ជូន", category_id: "fac-vehicles", cost: "45000.00", residual_value: "0.00", useful_life_months: 60, in_service_date: "2025-02-01", location: "Warehouse", branch_id: "br-pp", department_id: "dep-OPS", custodian: "Pich Samnang", supplier_name: "Golden Motors" },
  { tag: "FA-0005", name: "Motorbike fleet", name_km: "ក្រុមម៉ូតូ", category_id: "fac-vehicles", cost: "20000.00", residual_value: "3200.00", useful_life_months: 60, in_service_date: "2026-06-05", location: "Siem Reap branch", branch_id: "br-sr", department_id: "dep-SALES", custodian: "Chea Sokha", supplier_name: "Diamond Motors" },
];

export const termsOf = (a: Pick<FixedAsset, "cost" | "residual_value" | "useful_life_months" | "method" | "declining_rate" | "convention" | "in_service_date">): DepreciationTerms => ({
  cost: a.cost, residual_value: a.residual_value, useful_life_months: a.useful_life_months, method: a.method, declining_rate: a.declining_rate, convention: a.convention, in_service_date: a.in_service_date,
});

const seedTerms = (s: SeedAsset): DepreciationTerms => {
  const cat = ASSET_CATEGORIES.find((c) => c.id === s.category_id)!;
  return { cost: s.cost, residual_value: s.residual_value, useful_life_months: s.useful_life_months, method: cat.method, declining_rate: cat.declining_rate, convention: cat.convention, in_service_date: s.in_service_date };
};

/** Accumulated depreciation of the go-live register: the opening balance of account 1590. */
export function openingAccumulatedDepreciation(): string {
  return ASSET_SEED.reduce((s, a) => s.plus(accumulatedThrough(seedTerms(a), GO_LIVE_PERIOD)), new Decimal(0)).toFixed(2);
}

/** Accumulated depreciation of an asset: brought forward plus posted runs. */
export function postedAccumulated(state: Pick<AdvancedState, "depreciationRuns">, asset: FixedAsset): Decimal {
  let acc = new Decimal(asset.accumulated_brought_forward);
  for (const run of state.depreciationRuns) {
    if (run.status !== "POSTED") continue;
    for (const l of run.lines) if (l.asset_id === asset.id) acc = acc.plus(l.amount);
  }
  return acc;
}

/** Amount to depreciate an asset in a period: the schedule amount, never beyond cost − residual. */
export function runAmount(asset: FixedAsset, period: string, accumulated: Decimal): Decimal {
  const remaining = new Decimal(asset.cost).minus(asset.residual_value).minus(accumulated);
  if (remaining.lte(0)) return new Decimal(0);
  const scheduled = amountFor(termsOf(asset), period);
  return Decimal.min(scheduled, remaining);
}

const step = (role: string, who: Person, at: string): ApprovalStep => ({ step: 1, role, status: "APPROVED", approver_name: who.full_name, acted_at: at, comment: null });

/** Summarised depreciation journal: expense by department and branch, credit accumulated depreciation by category. */
export function depreciationJournalLines(run: DepreciationRun, categories: AssetCategory[]) {
  const debit = new Map<string, { account: string; dept: string | null; branch: string | null; amount: Decimal }>();
  const credit = new Map<string, Decimal>();
  for (const l of run.lines) {
    const cat = categories.find((c) => c.id === l.category_id)!;
    const key = `${cat.expense_account_id}|${l.department_id}|${l.branch_id}`;
    const d = debit.get(key) ?? { account: cat.expense_account_id, dept: l.department_id, branch: l.branch_id, amount: new Decimal(0) };
    d.amount = d.amount.plus(l.amount);
    debit.set(key, d);
    credit.set(cat.accumulated_account_id, (credit.get(cat.accumulated_account_id) ?? new Decimal(0)).plus(l.amount));
  }
  const desc = `Depreciation ${run.period_code}`;
  return [
    ...[...debit.values()].map((d) => line(d.account, d.amount.toFixed(2), "0", { description: desc, department_id: d.dept, branch_id: d.branch })),
    ...[...credit].map(([account, amount]) => line(account, "0", amount.toFixed(2), { description: desc })),
  ];
}

function budgetLine(accounts: Account[], id: string, code: string, dept: string | null, monthly: string, comment = ""): BudgetLine {
  const a = accounts.find((x) => x.code === code)!;
  const months = Array.from({ length: 12 }, () => monthly);
  return { id, account_id: a.id, account_code: a.code, account_name: a.name, account_name_km: a.name_km, department_id: dept, branch_id: null, months, total: new Decimal(monthly).times(12).toFixed(2), comment };
}

export function budgetTotals(b: Pick<Budget, "lines">, accounts: Account[]) {
  let revenue = new Decimal(0);
  let expense = new Decimal(0);
  for (const l of b.lines) {
    const type = accounts.find((a) => a.id === l.account_id)?.type;
    const total = l.months.reduce((s, m) => s.plus(m || 0), new Decimal(0));
    l.total = total.toFixed(2);
    if (type === "REVENUE") revenue = revenue.plus(total);
    else if (type === "EXPENSE") expense = expense.plus(total);
  }
  return { total_revenue: revenue.toFixed(2), total_expense: expense.toFixed(2) };
}

export function seedAdvanced(
  store: PostingStore & { sequences: Record<string, number>; invoices: Invoice[] },
  people: { acct: Person; finmgr: Person; owner: Person },
): AdvancedState {
  const state: AdvancedState = {
    assetCategories: ASSET_CATEGORIES, assets: [], depreciationRuns: [], depreciationPosted: {}, budgets: [], budgetAlerts: {}, fxRevaluations: [],
    inventoryEvents: [], inventoryValuations: [], importBatches: [], openingSignedOff: true,
  };
  Object.assign(store.sequences, { FA: ASSET_SEED.length + 1, DR: 1, FXR: 1 });
  const at = (date: string, hour = 9) => `${date}T${String(hour - 7).padStart(2, "0")}:00:00.000Z`;
  const blank = (s: SeedAsset, id: string, source: FixedAsset["source"], bf: string, created: string, who: Person): FixedAsset => {
    const cat = ASSET_CATEGORIES.find((c) => c.id === s.category_id)!;
    return {
      id, ...s, category_name: cat.name, category_name_km: cat.name_km, method: cat.method, declining_rate: cat.declining_rate, convention: cat.convention,
      acquisition_date: s.in_service_date, source, status: "ACTIVE", accumulated_brought_forward: bf, accumulated: bf, net_book_value: "0", last_depreciated_period: null,
      disposal: null, history: [{ id: `${id}-h1`, at: at(created), user_name: who.full_name, action: "CREATED" }], version: 1,
    };
  };
  ASSET_SEED.forEach((s, i) => {
    state.assets.push(blank(s, `fa-${String(i + 1).padStart(4, "0")}`, { type: "OPENING", id: null, number: "Go-live register" },
      accumulatedThrough(seedTerms(s), GO_LIVE_PERIOD).toFixed(2), "2027-01-01", people.acct));
  });

  // Asset lines on posted supplier invoices are capitalised (FR-FA-003, FR-AP-005).
  let tag = ASSET_SEED.length;
  for (const inv of store.invoices.filter((d) => d.kind === "AP" && d.posted && !d.is_opening)) {
    for (const l of inv.lines.filter((x) => x.is_asset)) {
      tag += 1;
      const s: SeedAsset = {
        tag: `FA-${String(tag).padStart(4, "0")}`, name: l.description, name_km: l.description, category_id: "fac-furniture", cost: new Decimal(l.net ?? 0).toFixed(2),
        residual_value: "0.00", useful_life_months: 60, in_service_date: inv.date, location: "Head office", branch_id: l.branch_id, department_id: l.department_id, custodian: "", supplier_name: inv.party_name,
      };
      const a = blank(s, `fa-${String(tag).padStart(4, "0")}`, { type: "AP_INVOICE", id: inv.id, number: inv.number }, "0.00", inv.date, people.acct);
      a.acquisition_date = inv.date;
      state.assets.push(a);
    }
  }
  store.sequences.FA = tag + 1;

  // Monthly depreciation runs for January to March 2027, posted.
  for (const [period, end] of [["2027-01", "2027-01-31"], ["2027-02", "2027-02-28"], ["2027-03", "2027-03-31"]] as const) {
    const number = `DR-2027-${String(store.sequences.DR).padStart(6, "0")}`;
    store.sequences.DR += 1;
    const run: DepreciationRun = {
      id: `dr-${period}`, number, period_id: `per-${period}`, period_code: period, period_end: end, status: "POSTED", lines: [], total: "0", skipped: [],
      approval_steps: [step("FINMGR", people.finmgr, at(end, 11))], journal_id: null, journal_no: null, preparer_id: people.acct.id, preparer_name: people.acct.full_name,
      history: [
        { id: `dr-${period}-h1`, at: at(end, 9), user_name: people.acct.full_name, action: "CREATED" },
        { id: `dr-${period}-h2`, at: at(end, 11), user_name: people.finmgr.full_name, action: "APPROVED" },
        { id: `dr-${period}-h3`, at: at(end, 15), user_name: people.finmgr.full_name, action: "POSTED" },
      ], version: 3,
    };
    for (const a of state.assets) {
      const acc = postedAccumulated(state, a);
      const amount = runAmount(a, period, acc);
      if (amount.isZero()) continue;
      run.lines.push({ asset_id: a.id, tag: a.tag, name: a.name, category_id: a.category_id, amount: amount.toFixed(2), accumulated_after: acc.plus(amount).toFixed(2), nbv_after: new Decimal(a.cost).minus(acc).minus(amount).toFixed(2), department_id: a.department_id, branch_id: a.branch_id });
    }
    run.total = run.lines.reduce((s, l) => s.plus(l.amount), new Decimal(0)).toFixed(2);
    const j = postJournal(store, { date: end, description: `Depreciation for ${period}`, reference: number, type: "ADJUSTING", source_type: "DEPRECIATION", source_no: number, lines: depreciationJournalLines(run, ASSET_CATEGORIES), user: { id: people.finmgr.id, full_name: people.finmgr.full_name }, at: at(end, 15) });
    Object.assign(run, { journal_id: j.id, journal_no: j.journal_no });
    state.depreciationRuns.push(run);
    for (const l of run.lines) (state.depreciationPosted[l.asset_id] ??= {})[period] = run.id;
  }
  for (const a of state.assets) refreshAsset(state, a);

  // FY 2027 budget: version 1 approved by the Owner, version 2 a draft revision.
  const v1Lines = [
    budgetLine(store.accounts, "bl-1", "4100", "dep-SALES", "26000.00"), budgetLine(store.accounts, "bl-2", "4200", "dep-SALES", "6000.00"),
    budgetLine(store.accounts, "bl-3", "5100", "dep-OPS", "12000.00"), budgetLine(store.accounts, "bl-4", "6100", "dep-ADMIN", "3000.00"),
    budgetLine(store.accounts, "bl-5", "6200", "dep-OPS", "800.00"), budgetLine(store.accounts, "bl-6", "6300", "dep-ADMIN", "18500.00"),
    budgetLine(store.accounts, "bl-7", "6400", "dep-SALES", "600.00"), budgetLine(store.accounts, "bl-8", "6500", "dep-OPS", "1000.00"),
    budgetLine(store.accounts, "bl-9", "6600", null, "1500.00"), budgetLine(store.accounts, "bl-10", "6800", "dep-FIN", "60.00"),
  ];
  const v1: Budget = {
    id: "bud-2027-v1", fiscal_year_id: "fy-2027", fiscal_year_name: "FY 2027", version: 1, name: "FY 2027 budget", status: "APPROVED", reason: "Original budget",
    lines: v1Lines, total_revenue: "0", total_expense: "0", approval_steps: [step("OWNER", people.owner, at("2026-12-20", 15))], rejection_comment: null,
    preparer_id: people.finmgr.id, preparer_name: people.finmgr.full_name, approved_by: people.owner.full_name, approved_at: at("2026-12-20", 15),
    history: [
      { id: "b1-h1", at: at("2026-12-10"), user_name: people.finmgr.full_name, action: "CREATED" },
      { id: "b1-h2", at: at("2026-12-15"), user_name: people.finmgr.full_name, action: "SUBMITTED" },
      { id: "b1-h3", at: at("2026-12-20", 15), user_name: people.owner.full_name, action: "APPROVED" },
    ], row_version: 3,
  };
  Object.assign(v1, budgetTotals(v1, store.accounts));
  const v2: Budget = {
    ...structuredClone(v1), id: "bud-2027-v2", version: 2, name: "FY 2027 budget — revision 1", status: "DRAFT", reason: "Utilities tariffs higher from April",
    approval_steps: [], approved_by: null, approved_at: null, history: [{ id: "b2-h1", at: at("2027-04-02"), user_name: people.finmgr.full_name, action: "CREATED", comment: "Revision of version 1" }], row_version: 1,
  };
  v2.lines = v2.lines.map((l) => ({ ...l, id: l.id.replace("bl-", "bl2-"), months: l.account_code === "6200" ? l.months.map((m, i) => (i >= 3 ? "950.00" : m)) : l.months }));
  Object.assign(v2, budgetTotals(v2, store.accounts));
  state.budgets.push(v1, v2);

  // Inventory valuation supplied by the inventory system at 31 March: 100.00 above the ledger (AT-INV-02).
  const inventoryGl = accountBalance(store, "acc-1300", "2027-03-31").base;
  const valuation = inventoryGl.plus(100);
  state.inventoryValuations.push({
    id: "inv-val-2027-03", date: "2027-03-31", method: "WEIGHTED_AVERAGE", source: "Stock register export (illustrative)",
    categories: [
      { name: "Rice and grains", name_km: "អង្ករ និងគ្រាប់ធញ្ញជាតិ", value: valuation.times(0.45).toDecimalPlaces(2).toFixed(2) },
      { name: "Cooking oil", name_km: "ប្រេងឆា", value: valuation.times(0.3).toDecimalPlaces(2).toFixed(2) },
      { name: "Beverages", name_km: "ភេសជ្ជៈ", value: valuation.minus(valuation.times(0.45).toDecimalPlaces(2)).minus(valuation.times(0.3).toDecimalPlaces(2)).toFixed(2) },
    ],
    total: valuation.toFixed(2),
  });
  return state;
}

/** Derived figures and status of an asset (FR-FA-006). */
export function refreshAsset(state: Pick<AdvancedState, "depreciationRuns" | "depreciationPosted">, a: FixedAsset) {
  const acc = postedAccumulated(state, a);
  a.accumulated = acc.toFixed(2);
  a.net_book_value = new Decimal(a.cost).minus(acc).toFixed(2);
  const periods = Object.keys(state.depreciationPosted[a.id] ?? {}).sort();
  a.last_depreciated_period = periods.at(-1) ?? (a.source.type === "OPENING" ? GO_LIVE_PERIOD : null);
  if (a.status === "ACTIVE" || a.status === "FULLY_DEPRECIATED") {
    a.status = acc.gte(new Decimal(a.cost).minus(a.residual_value)) ? "FULLY_DEPRECIATED" : "ACTIVE";
  }
}
