import { faker } from "@faker-js/faker";
import Decimal from "decimal.js";
import type { Account } from "@/lib/api/types/accounts";
import type { ApprovalStep, DocumentStatus, HistoryEvent } from "@/lib/api/types/common";
import type { JournalEntry, JournalLine, JournalLineInput, JournalType } from "@/lib/api/types/journals";
import type { AccountingPeriod, ExchangeRate } from "@/lib/api/types/org";
import { openingAccumulatedDepreciation } from "./advanced";

// Journal seed and ledger maths for the mock backend. Amounts are Decimal throughout.
// All figures are ILLUSTRATIVE demo data (SRS §2.4); they are not real business data.

const BASE = "USD";
const DECIMALS: Record<string, number> = { USD: 2, KHR: 0, THB: 2 };
const dp = (currency: string) => DECIMALS[currency] ?? 2;
const acc = (code: string) => `acc-${code}`;

export const APPROVAL_TWO_STEP_ABOVE = "10000";

export interface SeedPerson {
  id: string;
  name: string;
}

/** Build stored lines from inputs: resolves accounts and computes base amounts (half-up). */
export function buildLines(inputs: (JournalLineInput & { base_override?: { debit: string; credit: string } })[], accounts: Account[], idPrefix: string): JournalLine[] {
  return inputs.map((input, index) => {
    const account = accounts.find((a) => a.id === input.account_id);
    const rate = input.currency === BASE ? new Decimal(1) : new Decimal(input.rate || 0);
    const debit = new Decimal(input.debit || 0);
    const credit = new Decimal(input.credit || 0);
    return {
      id: `${idPrefix}-l${index + 1}`,
      line_no: index + 1,
      account_id: input.account_id ?? "",
      account_code: account?.code ?? "",
      account_name: account?.name ?? "",
      account_name_km: account?.name_km ?? "",
      description: input.description,
      debit: debit.toFixed(dp(input.currency)),
      credit: credit.toFixed(dp(input.currency)),
      currency: input.currency,
      rate: rate.toFixed(),
      debit_base: (input.base_override && debit.isZero() && credit.isZero() ? new Decimal(input.base_override.debit) : debit.times(rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      credit_base: (input.base_override && debit.isZero() && credit.isZero() ? new Decimal(input.base_override.credit) : credit.times(rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      branch_id: input.branch_id,
      department_id: input.department_id,
      dimensions: input.dimensions ?? {},
    };
  });
}

export function totalsOf(lines: JournalLine[]) {
  const debit = lines.reduce((sum, l) => sum.plus(l.debit_base), new Decimal(0));
  const credit = lines.reduce((sum, l) => sum.plus(l.credit_base), new Decimal(0));
  return { debit_base: debit.toFixed(2), credit_base: credit.toFixed(2), difference: debit.minus(credit).toFixed(2) };
}

export function periodFor(periods: AccountingPeriod[], date: string): AccountingPeriod | undefined {
  return periods.find((p) => p.start_date <= date && date <= p.end_date);
}

/** Approval route by amount: one step up to the threshold, Finance Manager then Owner above it. */
export function approvalRoute(totalBase: string): ApprovalStep[] {
  const roles = new Decimal(totalBase).gt(APPROVAL_TWO_STEP_ABOVE) ? ["FINMGR", "OWNER"] : ["FINMGR"];
  return roles.map((role, i) => ({ step: i + 1, role, status: "PENDING", approver_name: null, acted_at: null, comment: null }));
}

export const journalNumber = (year: string, seq: number) => `JV-${year}-${String(seq).padStart(6, "0")}`;

interface Draft {
  date: string;
  description: string;
  reference: string;
  type?: JournalType;
  source?: [string, string];
  lines: [code: string, debit: string, credit: string, extra?: Partial<JournalLineInput>][];
}

const line = (code: string, debit: string, credit: string, extra: Partial<JournalLineInput> = {}): JournalLineInput => ({
  account_id: acc(code), description: "", debit, credit, currency: BASE, rate: "1", branch_id: null, department_id: null,
  dimensions: {}, ...extra,
});

const BRANCHES = ["br-pp", "br-pp", "br-pp", "br-sr", "br-bb"];
const CUSTOMERS = ["Mekong Retail", "Angkor Supplies", "Sokha Hotel Group", "Tonle Sap Trading", "Phnom Penh Mart"];
const VENDORS = ["EDC electricity", "PPWSA water", "Smart Axiata", "Lucky Stationery", "Total fuel", "Office landlord"];

function isoDay(index: number): string {
  return new Date(Date.UTC(2027, 0, 1) + index * 86_400_000).toISOString().slice(0, 10);
}

/** About 120 balanced posted journals between 2 January and 4 April 2027, plus the opening journal. */
function postedDrafts(rates: ExchangeRate[]): Draft[] {
  faker.seed(2027);
  const money = (min: number, max: number) => faker.number.int({ min: min * 100, max: max * 100 }) / 100;
  const fx = (n: number) => n.toFixed(2);
  const drafts: Draft[] = [
    {
      date: "2027-01-01", description: "Opening balances at 1 January 2027", reference: "OPEN-2027", type: "OPENING",
      lines: [
        ["1101", "4200.00", "0"], ["1102", "0", "0", { currency: "KHR", rate: rates[0].rate, debit: "8200000" }],
        ["1103", "500.00", "0"], ["1110", "86500.00", "0"],
        ["1111", "0", "0", { currency: "KHR", rate: rates[0].rate, debit: "61500000" }],
        ["1200", "42300.00", "0"], ["1300", "58000.00", "0"], ["1400", "6000.00", "0"], ["1510", "24000.00", "0"],
        ["1520", "65000.00", "0"], ["1590", "0", openingAccumulatedDepreciation()], ["2100", "0", "31800.00"], ["2150", "0", "4200.00"],
        ["2500", "0", "60000.00"], ["3100", "0", "150000.00"],
      ],
    },
  ];
  // The opening journal is balanced by retained earnings, computed once the KHR lines are converted.
  let serial = 0;
  for (let day = 1; day <= 93; day += 1) {
    const date = isoDay(day);
    const weekday = new Date(date + "T00:00:00Z").getUTCDay();
    if (weekday === 0) continue;
    const branch = BRANCHES[day % BRANCHES.length];
    const rate = rates.find((r) => r.rate_date === date)?.rate ?? rates[0].rate;
    serial += 1;

    // A sale most days: Dr Bank / Cr Sales + Output tax (10 % illustrative, not a real tax rate).
    if (weekday !== 6) {
      const net = money(400, 4800);
      const tax = Math.round(net * 10) / 100;
      const customer = CUSTOMERS[day % CUSTOMERS.length];
      drafts.push({
        date, description: `Sales — ${customer}`, reference: `SI-${String(serial).padStart(4, "0")}`, type: "SYSTEM",
        source: ["AR_INVOICE", `INV-2027-${String(serial).padStart(6, "0")}`],
        lines: [
          ["1110", fx(net + tax), "0", { branch_id: branch }],
          [day % 4 === 0 ? "4200" : "4100", "0", fx(net), { branch_id: branch, department_id: "dep-SALES" }],
          ["2200", "0", fx(tax), { branch_id: branch }],
        ],
      });
    }
    // An expense on alternate days, some paid in KHR.
    if (day % 2 === 0) {
      const vendor = VENDORS[day % VENDORS.length];
      const code = ["6200", "6400", "6500", "6800", "6200", "6100"][day % 6];
      if (day % 6 === 2) {
        const khr = faker.number.int({ min: 200, max: 2400 }) * 1000;
        drafts.push({
          date, description: `${vendor} — paid in KHR`, reference: `EX-${String(serial).padStart(4, "0")}`, type: "SYSTEM",
          source: ["CB_PAYMENT", `PV-2027-${String(serial).padStart(6, "0")}`],
          lines: [
            [code, "0", "0", { currency: "KHR", rate, debit: String(khr), branch_id: branch, department_id: "dep-ADMIN" }],
            ["1111", "0", "0", { currency: "KHR", rate, credit: String(khr), branch_id: branch }],
          ],
        });
      } else {
        const amount = money(60, code === "6100" ? 2500 : 900);
        drafts.push({
          date, description: vendor, reference: `EX-${String(serial).padStart(4, "0")}`, type: "SYSTEM",
          source: ["CB_PAYMENT", `PV-2027-${String(serial).padStart(6, "0")}`],
          lines: [
            [code, fx(amount), "0", { branch_id: branch, department_id: day % 3 === 0 ? "dep-OPS" : "dep-ADMIN" }],
            ["1110", "0", fx(amount), { branch_id: branch }],
          ],
        });
      }
    }
    // Month-end: salaries (sensitive accounts) and cost of sales.
    if (["2027-01-31", "2027-02-27", "2027-03-31"].includes(date)) {
      const month = date.slice(5, 7);
      drafts.push({
        date, description: `Salaries for 2027-${month}`, reference: `PAY-2027-${month}`, type: "ADJUSTING",
        lines: [["6300", "18500.00", "0", { department_id: "dep-ADMIN" }], ["2170", "0", "18500.00"]],
      });
      // Depreciation is posted by the fixed-asset runs seeded in mocks/db/advanced.ts (Phase 6).
      const cogs = money(9000, 15000);
      drafts.push({
        date, description: `Cost of goods sold for 2027-${month}`, reference: `COGS-2027-${month}`, type: "ADJUSTING",
        lines: [["5100", fx(cogs), "0", { department_id: "dep-OPS" }], ["1300", "0", fx(cogs)]],
      });
    }
  }
  return drafts;
}

function toInputs(draft: Draft): JournalLineInput[] {
  return draft.lines.map(([code, debit, credit, extra]) => line(code, debit, credit, { description: draft.description, ...extra }));
}

export interface JournalSeed {
  journals: JournalEntry[];
  nextSequence: number;
}

export function seedJournals(
  accounts: Account[],
  periods: AccountingPeriod[],
  rates: ExchangeRate[],
  people: { acct: SeedPerson; finmgr: SeedPerson; owner: SeedPerson },
): JournalSeed {
  const journals: JournalEntry[] = [];
  let sequence = 0;
  const at = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:15:00Z`;

  const make = (id: string, draft: Draft, status: DocumentStatus, preparer: SeedPerson): JournalEntry => {
    let lines = buildLines(toInputs(draft), accounts, id);
    if (draft.type === "OPENING") {
      // Balance the opening journal on retained earnings.
      const diff = new Decimal(totalsOf(lines).difference);
      lines = buildLines([...toInputs(draft), line("3200", "0", diff.toFixed(2), { description: draft.description })], accounts, id);
    }
    const totals = totalsOf(lines);
    return {
      id, journal_no: null, status, type: draft.type ?? "MANUAL", posting_date: draft.date, document_date: draft.date,
      description: draft.description, reference: draft.reference, currency: lines.some((l) => l.currency !== BASE) ? lines[0].currency : BASE,
      period: periodFor(periods, draft.date)?.code ?? null, totals, preparer_id: preparer.id, preparer_name: preparer.name,
      approver_name: null, submitted_at: null, posted_at: null, source_type: draft.source?.[0] ?? null,
      source_no: draft.source?.[1] ?? null, version: 1, lines, history: [], approval_steps: [], attachments: [],
      reversed_by: null, reverses: null, reversal_reason: null, rejection_comment: null,
    };
  };

  const event = (journal: JournalEntry, when: string, who: SeedPerson, action: string, comment?: string): void => {
    const item: HistoryEvent = { id: `${journal.id}-h${journal.history.length + 1}`, at: when, user_name: who.name, action, comment };
    journal.history.push(item);
  };

  const post = (journal: JournalEntry) => {
    const date = journal.posting_date;
    sequence += 1;
    journal.status = "POSTED";
    journal.journal_no = journalNumber("2027", sequence);
    journal.submitted_at = at(date, 2);
    journal.posted_at = at(date, 8);
    journal.approver_name = people.finmgr.name;
    journal.approval_steps = [{ step: 1, role: "FINMGR", status: "APPROVED", approver_name: people.finmgr.name, acted_at: at(date, 6) }];
    event(journal, at(date, 1), people.acct, "CREATED");
    event(journal, at(date, 2), people.acct, "SUBMITTED");
    event(journal, at(date, 6), people.finmgr, "APPROVED");
    event(journal, at(date, 8), people.finmgr, "POSTED");
  };

  postedDrafts(rates).forEach((draft, index) => {
    const journal = make(`jnl-${String(index + 1).padStart(4, "0")}`, draft, "POSTED", people.acct);
    post(journal);
    journals.push(journal);
  });

  // One reversed journal with its reversal (BR-GL-004): a duplicate rent entry corrected in April.
  const original = make("jnl-rev-orig", {
    date: "2027-04-01", description: "Office rent April 2027 (entered twice)", reference: "RENT-2027-04",
    lines: [["6100", "2500.00", "0", { department_id: "dep-ADMIN" }], ["2150", "0", "2500.00"]],
  }, "POSTED", people.acct);
  post(original);
  const reversal = make("jnl-rev-new", {
    date: "2027-04-02", description: `Reversal of ${original.journal_no}`, reference: "RENT-2027-04", type: "REVERSAL",
    lines: [["6100", "0", "2500.00", { department_id: "dep-ADMIN" }], ["2150", "2500.00", "0"]],
  }, "POSTED", people.finmgr);
  post(reversal);
  original.status = "REVERSED";
  original.reversed_by = { id: reversal.id, journal_no: reversal.journal_no! };
  original.reversal_reason = "Duplicate of the rent journal posted on the same day";
  reversal.reverses = { id: original.id, journal_no: original.journal_no! };
  reversal.reversal_reason = original.reversal_reason;
  event(original, at("2027-04-02", 3), people.finmgr, "REVERSED", original.reversal_reason);
  journals.push(original, reversal);

  // Work in progress in every other status.
  const wip: [string, Draft, DocumentStatus, SeedPerson][] = [
    ["jnl-draft-1", { date: "2027-04-03", description: "Accrued electricity March 2027", reference: "ACCR-2027-03-01", type: "ADJUSTING", lines: [["6200", "250.00", "0", { department_id: "dep-ADMIN" }], ["2150", "0", "250.00"]] }, "DRAFT", people.acct],
    ["jnl-draft-2", { date: "2027-04-05", description: "Reclassify travel to repairs (incomplete)", reference: "RECL-01", lines: [["6500", "320.00", "0"], ["6400", "0", "300.00"]] }, "DRAFT", people.acct],
    ["jnl-sub-1", { date: "2027-04-02", description: "Prepaid insurance amortisation April", reference: "PREP-2027-04", lines: [["6500", "100.00", "0"], ["1400", "0", "100.00"]] }, "SUBMITTED", people.acct],
    ["jnl-sub-2", { date: "2027-04-03", description: "Loan interest accrual Q1", reference: "INT-2027-Q1", lines: [["8200", "12500.00", "0"], ["2150", "0", "12500.00"]] }, "SUBMITTED", people.acct],
    ["jnl-sub-3", { date: "2027-04-04", description: "Bank charges reclassification", reference: "RECL-02", lines: [["6800", "45.00", "0"], ["6500", "0", "45.00"]] }, "SUBMITTED", people.finmgr],
    ["jnl-appr-1", { date: "2027-04-02", description: "Accrued audit fee Q1", reference: "ACCR-2027-Q1-AUD", lines: [["6500", "1800.00", "0", { department_id: "dep-FIN" }], ["2150", "0", "1800.00"]] }, "APPROVED", people.acct],
    ["jnl-rej-1", { date: "2027-04-01", description: "Write-off small balances", reference: "WO-01", lines: [["6700", "75.00", "0"], ["8900", "0", "75.00"]] }, "REJECTED", people.acct],
  ];
  for (const [id, draft, status, preparer] of wip) {
    const journal = make(id, draft, status, preparer);
    event(journal, at(draft.date, 1), preparer, "CREATED");
    if (status !== "DRAFT") {
      journal.submitted_at = at(draft.date, 2);
      journal.approval_steps = approvalRoute(journal.totals.debit_base);
      event(journal, at(draft.date, 2), preparer, "SUBMITTED");
    }
    if (status === "APPROVED") {
      journal.approver_name = people.finmgr.name;
      journal.approval_steps = [{ step: 1, role: "FINMGR", status: "APPROVED", approver_name: people.finmgr.name, acted_at: at(draft.date, 5) }];
      event(journal, at(draft.date, 5), people.finmgr, "APPROVED");
    }
    if (status === "REJECTED") {
      journal.rejection_comment = "Attach the customer list and use the bad-debt allowance account.";
      journal.approval_steps = [{ step: 1, role: "FINMGR", status: "REJECTED", approver_name: people.finmgr.name, acted_at: at(draft.date, 5), comment: journal.rejection_comment }];
      event(journal, at(draft.date, 5), people.finmgr, "REJECTED", journal.rejection_comment);
    }
    journals.push(journal);
  }
  return { journals, nextSequence: sequence + 1 };
}

export interface LedgerFilter {
  dateFrom?: string;
  dateTo?: string;
  before?: string;
  branchId?: string | null;
  departmentId?: string | null;
}

export interface FlatLine extends JournalLine {
  journal: JournalEntry;
}

/** Posted ledger lines: journals that are Posted, including reversed originals and their reversals. */
export function ledgerLines(journals: JournalEntry[], filter: LedgerFilter = {}): FlatLine[] {
  const out: FlatLine[] = [];
  for (const journal of journals) {
    if (journal.status !== "POSTED" && journal.status !== "REVERSED") continue;
    const date = journal.posting_date;
    if (filter.dateFrom && date < filter.dateFrom) continue;
    if (filter.dateTo && date > filter.dateTo) continue;
    if (filter.before && date >= filter.before) continue;
    for (const l of journal.lines) {
      if (filter.branchId && l.branch_id !== filter.branchId) continue;
      if (filter.departmentId && l.department_id !== filter.departmentId) continue;
      out.push({ ...l, journal });
    }
  }
  return out;
}

/** Net debit balance (debits − credits, base currency) per account. */
export function netByAccount(lines: FlatLine[]): Map<string, Decimal> {
  const map = new Map<string, Decimal>();
  for (const l of lines) {
    map.set(l.account_id, (map.get(l.account_id) ?? new Decimal(0)).plus(l.debit_base).minus(l.credit_base));
  }
  return map;
}
