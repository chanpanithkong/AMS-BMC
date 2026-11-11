import Decimal from "decimal.js";
import type { HistoryEvent } from "@/lib/api/types/common";
import type {
  CashTransaction, Expense, ExpenseCategory, ReconciliationMatch, StatementImport, StatementLine, StatementMapping,
} from "@/lib/api/types/cashbank";
import type { JournalEntry } from "@/lib/api/types/journals";
import { ledgerLines } from "./journals";
import { line, postJournal, type PostingStore } from "./posting";

// Phase 3 demo data: cash and bank accounts, statements, reconciliations, cash transactions and
// expenses. All figures are ILLUSTRATIVE (SRS §2.4).

export interface MockCashBankAccount {
  id: string;
  kind: "CASH" | "BANK";
  code: string;
  name: string;
  name_km: string;
  bank_name: string | null;
  account_number: string | null;
  currency: string;
  gl_account_id: string;
  branch_id: string;
  custodian_id: string | null;
  min_balance: string;
  allow_negative: boolean;
  status: "ACTIVE" | "INACTIVE";
  mapping: StatementMapping | null;
}

export interface MockReconciliation {
  id: string;
  bank_account_id: string;
  statement_date: string;
  previous_date: string | null;
  statement_opening: string;
  statement_closing: string;
  status: "IN_PROGRESS" | "COMPLETED";
  matches: ReconciliationMatch[];
  explanation: { reason: string; amount: string; approved_by: string } | null;
  prepared_by: string;
  completed_by: string | null;
  completed_at: string | null;
  history: HistoryEvent[];
  version: number;
}

export interface CashBankState {
  cashBankAccounts: MockCashBankAccount[];
  statementLines: StatementLine[];
  statementImports: StatementImport[];
  reconciliations: MockReconciliation[];
  cashTransactions: CashTransaction[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  /** Next number per document prefix (CR, PV, TR, DP, WD, BC, EXP). */
  sequences: Record<string, number>;
}

interface Person {
  id: string;
  full_name: string;
}

const ABA = "cba-aba-usd";
const ACLEDA = "cba-acleda-khr";

function accounts(cashierId: string): MockCashBankAccount[] {
  const base = { min_balance: "0", allow_negative: false, status: "ACTIVE" as const, mapping: null };
  return [
    { ...base, id: "cba-cash-usd", kind: "CASH", code: "CASH-USD", name: "Main cash – USD", name_km: "សាច់ប្រាក់មេ – ដុល្លារ", bank_name: null, account_number: null, currency: "USD", gl_account_id: "acc-1101", branch_id: "br-pp", custodian_id: cashierId, min_balance: "500" },
    { ...base, id: "cba-cash-khr", kind: "CASH", code: "CASH-KHR", name: "Main cash – KHR", name_km: "សាច់ប្រាក់មេ – រៀល", bank_name: null, account_number: null, currency: "KHR", gl_account_id: "acc-1102", branch_id: "br-pp", custodian_id: null, min_balance: "1000000" },
    { ...base, id: "cba-petty", kind: "CASH", code: "PETTY", name: "Petty cash", name_km: "សាច់ប្រាក់បន្តិចបន្តួច", bank_name: null, account_number: null, currency: "USD", gl_account_id: "acc-1103", branch_id: "br-pp", custodian_id: cashierId, min_balance: "100" },
    {
      ...base, id: ABA, kind: "BANK", code: "ABA-USD", name: "ABA current account – USD", name_km: "គណនីចរន្ត ABA – ដុល្លារ", bank_name: "ABA Bank",
      account_number: "000 123 4417", currency: "USD", gl_account_id: "acc-1110", branch_id: "br-pp", custodian_id: null, min_balance: "20000",
      mapping: { date: "Date", description: "Description", reference: "Reference", amount: null, debit: "Debit", credit: "Credit", balance: "Balance", date_format: "DD/MM/YYYY" },
    },
    { ...base, id: ACLEDA, kind: "BANK", code: "ACLEDA-KHR", name: "ACLEDA current account – KHR", name_km: "គណនីចរន្ត ACLEDA – រៀល", bank_name: "ACLEDA Bank", account_number: "2100 0055 8892", currency: "KHR", gl_account_id: "acc-1111", branch_id: "br-pp", custodian_id: null, min_balance: "10000000" },
  ];
}

function categories(): ExpenseCategory[] {
  return [
    { id: "cat-utilities", code: "UTIL", name: "Utilities", name_km: "ទឹកភ្លើង", account_id: "acc-6200", requires_attachment: false, attachment_threshold: "200" },
    { id: "cat-rent", code: "RENT", name: "Rent", name_km: "ការជួល", account_id: "acc-6100", requires_attachment: false, attachment_threshold: "200" },
    { id: "cat-travel", code: "TRAVEL", name: "Travel", name_km: "ការធ្វើដំណើរ", account_id: "acc-6400", requires_attachment: true, attachment_threshold: null },
    { id: "cat-repairs", code: "REPAIR", name: "Repairs and maintenance", name_km: "ជួសជុល និងថែទាំ", account_id: "acc-6500", requires_attachment: false, attachment_threshold: "200" },
    { id: "cat-office", code: "OFFICE", name: "Office supplies", name_km: "សម្ភារការិយាល័យ", account_id: "acc-6500", requires_attachment: false, attachment_threshold: "200" },
    { id: "cat-bank", code: "BANKFEE", name: "Bank charges", name_km: "កម្រៃសេវាធនាគារ", account_id: "acc-6800", requires_attachment: false, attachment_threshold: null },
  ];
}

const pad = (n: number) => String(n).padStart(6, "0");

/** Bank-side view of a ledger line on the bank's GL account: + deposit, − payment. */
function bankLines(journals: JournalEntry[], glAccountId: string) {
  return ledgerLines(journals)
    .filter((l) => l.account_id === glAccountId)
    .map((l) => ({ id: l.id, date: l.journal.posting_date, amount: new Decimal(l.debit).minus(l.credit), journal: l.journal }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.journal.journal_no ?? "").localeCompare(b.journal.journal_no ?? ""));
}

export function seedCashBank(store: PostingStore, people: { acct: Person; finmgr: Person; cashier: Person; deptmgr: Person }): CashBankState {
  const state: CashBankState = {
    cashBankAccounts: accounts(people.cashier.id),
    statementLines: [],
    statementImports: [],
    reconciliations: [],
    cashTransactions: [],
    expenseCategories: categories(),
    expenses: [],
    sequences: { CR: 1, PV: 1, TR: 1, DP: 1, WD: 1, BC: 1, EXP: 1 },
  };

  // Seeded payment journals become posted payment vouchers, so that the list is not empty.
  for (const j of store.journals) {
    if (j.source_type !== "CB_PAYMENT" || !j.source_no) continue;
    const bankLine = j.lines.find((l) => l.credit !== "0" && l.credit !== "0.00" && (l.account_id === "acc-1110" || l.account_id === "acc-1111"));
    const account = state.cashBankAccounts.find((a) => a.gl_account_id === bankLine?.account_id);
    if (!bankLine || !account) continue;
    state.cashTransactions.push({
      id: `ctx-${j.id}`, number: j.source_no, type: "PAYMENT", status: "POSTED", date: j.posting_date, account_id: account.id, to_account_id: null,
      currency: bankLine.currency, amount: bankLine.credit, to_amount: null, rate: bankLine.rate, reference: j.reference, description: j.description,
      payee: j.description.split(" — ")[0], journal_id: j.id, journal_no: j.journal_no, expense_id: null,
      lines: j.lines.filter((l) => l.id !== bankLine.id).map((l) => ({
        account_id: l.account_id, account_code: l.account_code, account_name: l.account_name, account_name_km: l.account_name_km,
        description: l.description, amount: l.debit, department_id: l.department_id, branch_id: l.branch_id,
      })),
      preparer_id: people.acct.id, preparer_name: people.acct.full_name, posted_by: people.acct.full_name, posted_at: j.posted_at,
      history: [], attachments: [], version: 1,
    });
    state.sequences.PV = Math.max(state.sequences.PV, Number(j.source_no.slice(-6)) + 1);
  }

  // ABA USD statements: January–February (reconciled) and March (in progress).
  const book = bankLines(store.journals, "acc-1110");
  const add = (importId: string, date: string, description: string, reference: string, amount: Decimal, i: number) => {
    state.statementLines.push({
      id: `stl-${importId}-${i}`, bank_account_id: ABA, import_id: importId, date, description, reference, amount: amount.toFixed(2), balance: null, match_id: null,
    });
    return state.statementLines[state.statementLines.length - 1];
  };
  const matches: ReconciliationMatch[] = [];
  const feb = book.filter((b) => b.date <= "2027-02-28");
  feb.forEach((b, i) => {
    const description = b.journal.type === "OPENING" ? "Balance brought forward" : b.journal.description;
    const s = add("imp-aba-2027-02", b.date, description, b.journal.reference, b.amount, i);
    const matchId = `mat-feb-${i}`;
    s.match_id = matchId;
    matches.push({ id: matchId, statement_line_ids: [s.id], book_line_ids: [b.id], auto: true, matched_by: people.acct.full_name, matched_at: "2027-03-03T03:00:00Z" });
  });
  const febClosing = feb.reduce((s, b) => s.plus(b.amount), new Decimal(0));
  state.reconciliations.push({
    id: "rec-aba-2027-02", bank_account_id: ABA, statement_date: "2027-02-28", previous_date: null, statement_opening: "0.00",
    statement_closing: febClosing.toFixed(2), status: "COMPLETED", matches, explanation: null, prepared_by: people.acct.full_name,
    completed_by: people.finmgr.full_name, completed_at: "2027-03-04T02:30:00Z",
    history: [
      { id: "rec-feb-h1", at: "2027-03-03T02:00:00Z", user_name: people.acct.full_name, action: "STARTED" },
      { id: "rec-feb-h2", at: "2027-03-04T02:30:00Z", user_name: people.finmgr.full_name, action: "COMPLETED" },
    ],
    version: 3,
  });

  // March: every book line except the last deposit and the last payment (still outstanding),
  // plus a service fee and interest that are not in the books yet.
  const march = book.filter((b) => b.date >= "2027-03-01" && b.date <= "2027-03-31");
  const lastDeposit = [...march].reverse().find((b) => b.amount.gt(0));
  const lastPayment = [...march].reverse().find((b) => b.amount.lt(0));
  let i = 0;
  for (const b of march) {
    if (b === lastDeposit || b === lastPayment) continue;
    // The bank posts a day later, as banks do.
    const next = new Date(Date.parse(b.date + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    add("imp-aba-2027-03", next > "2027-03-31" ? "2027-03-31" : next, b.journal.description.toUpperCase(), b.journal.reference, b.amount, (i += 1));
  }
  add("imp-aba-2027-03", "2027-03-31", "MONTHLY SERVICE FEE", "FEE-0331", new Decimal("-5.00"), (i += 1));
  add("imp-aba-2027-03", "2027-03-31", "INTEREST CREDIT", "INT-0331", new Decimal("2.10"), (i += 1));
  const marchStatement = state.statementLines.filter((s) => s.import_id === "imp-aba-2027-03");
  const marchClosing = marchStatement.reduce((s, l) => s.plus(l.amount), febClosing);
  state.reconciliations.push({
    id: "rec-aba-2027-03", bank_account_id: ABA, statement_date: "2027-03-31", previous_date: "2027-02-28",
    statement_opening: febClosing.toFixed(2), statement_closing: marchClosing.toFixed(2), status: "IN_PROGRESS", matches: [],
    explanation: null, prepared_by: people.acct.full_name, completed_by: null, completed_at: null,
    history: [{ id: "rec-mar-h1", at: "2027-04-02T02:00:00Z", user_name: people.acct.full_name, action: "STARTED" }], version: 1,
  });
  const imported = (id: string, file: string, n: number, at: string): StatementImport => ({
    id, bank_account_id: ABA, file_name: file, status: "COMMITTED", rows: [], counts: { valid: n, errors: 0, duplicates: 0 },
    imported_by: people.acct.full_name, created_at: at, committed_at: at, created_lines: n,
  });
  state.statementImports.push(
    imported("imp-aba-2027-02", "aba-usd-2027-01-02.csv", feb.length, "2027-03-03T01:50:00Z"),
    imported("imp-aba-2027-03", "aba-usd-2027-03.csv", marchStatement.length, "2027-04-02T01:50:00Z"),
  );

  // Cash transactions in progress.
  const draft = (id: string, partial: Partial<CashTransaction>, by: Person, status: CashTransaction["status"]): CashTransaction => ({
    id, number: null, type: "PAYMENT", status, date: "2027-04-05", account_id: "cba-petty", to_account_id: null, currency: "USD",
    amount: "0", to_amount: null, rate: "1", reference: "", description: "", payee: "", lines: [], journal_id: null, journal_no: null,
    expense_id: null, preparer_id: by.id, preparer_name: by.full_name, posted_by: null, posted_at: null,
    history: [{ id: `${id}-h1`, at: "2027-04-05T02:10:00Z", user_name: by.full_name, action: "CREATED" }], attachments: [], version: 1, ...partial,
  });
  state.cashTransactions.push(
    draft("ctx-petty-1", {
      amount: "38.50", description: "Drinking water and cleaning supplies", payee: "Lucky Market", reference: "PC-0405-01",
      lines: [{ account_id: "acc-6500", description: "Cleaning supplies", amount: "38.50", department_id: "dep-ADMIN", branch_id: "br-pp" }],
    }, people.cashier, "SUBMITTED"),
    draft("ctx-transfer-1", {
      type: "TRANSFER", account_id: ABA, to_account_id: "cba-petty", amount: "300.00", to_amount: "300.00", description: "Petty cash top-up", reference: "TOPUP-04",
    }, people.acct, "DRAFT"),
  );

  // Expenses in every status. Posted ones get their journal through the posting service.
  const cat = (id: string) => state.expenseCategories.find((c) => c.id === id)!;
  const expense = (id: string, partial: Partial<Expense>, by: Person): Expense => {
    const c = cat(partial.category_id ?? "cat-utilities");
    return {
      id, number: null, status: "DRAFT", date: "2027-04-03", category_id: c.id, category_name: c.name, category_name_km: c.name_km,
      description: "", payee: "", payment_mode: "PAID", paid_from_id: "cba-cash-usd", currency: "USD", rate: "1", amount: "0", amount_base: "0",
      allocation_mode: "PERCENT", allocations: [], attachments: [], preparer_id: by.id, preparer_name: by.full_name, approval_steps: [],
      rejection_comment: null, journal_id: null, journal_no: null, settlement: null,
      history: [{ id: `${id}-h1`, at: "2027-04-03T02:00:00Z", user_name: by.full_name, action: "CREATED" }], version: 1, ...partial,
    };
  };
  const alloc = (department: string, branch: string, percent: string, amount: string) => ({ department_id: department, branch_id: branch, percent, amount });
  const pending = (role: string) => [{ step: 1, role, status: "PENDING" as const, approver_name: null, acted_at: null, comment: null }];

  state.expenses.push(
    expense("exp-draft-travel", {
      category_id: "cat-travel", description: "Taxi to Siem Reap branch audit", payee: "Grab", amount: "45.00", amount_base: "45.00",
      allocations: [alloc("dep-FIN", "br-sr", "100", "45.00")],
    }, people.acct),
    expense("exp-sub-utilities", {
      status: "SUBMITTED", category_id: "cat-utilities", description: "Warehouse electricity March", payee: "EDC", payment_mode: "UNPAID", paid_from_id: null,
      amount: "640.00", amount_base: "640.00", allocations: [alloc("dep-OPS", "br-pp", "100", "640.00")], approval_steps: pending("DEPTMGR"),
      attachments: [{ id: "att-edc", file_name: "edc-bill-march.pdf", content_type: "application/pdf", size: 182_000, uploaded_at: "2027-04-03T02:05:00Z", uploaded_by: people.acct.full_name }],
    }, people.acct),
    expense("exp-sub-split", {
      status: "SUBMITTED", category_id: "cat-office", description: "Printer paper and toner", payee: "Lucky Stationery", amount: "100.00", amount_base: "100.00",
      allocations: [alloc("dep-ADMIN", "br-pp", "33.33", "33.33"), alloc("dep-SALES", "br-pp", "33.33", "33.33"), alloc("dep-OPS", "br-pp", "33.34", "33.34")],
      approval_steps: pending("DEPTMGR"),
    }, people.acct),
    expense("exp-appr-repair", {
      status: "APPROVED", category_id: "cat-repairs", description: "Air-conditioner repair, Battambang", payee: "Cool Tech", amount: "180.00", amount_base: "180.00",
      paid_from_id: "cba-cash-usd", allocations: [alloc("dep-OPS", "br-bb", "100", "180.00")],
      approval_steps: [{ step: 1, role: "DEPTMGR", status: "APPROVED", approver_name: people.deptmgr.full_name, acted_at: "2027-04-04T03:00:00Z", comment: null }],
    }, people.acct),
    expense("exp-rej-travel", {
      status: "REJECTED", category_id: "cat-travel", description: "Team dinner", payee: "Malis Restaurant", amount: "260.00", amount_base: "260.00",
      allocations: [alloc("dep-SALES", "br-pp", "100", "260.00")], rejection_comment: "Entertainment is not a travel expense; use the correct category.",
      approval_steps: [{ step: 1, role: "DEPTMGR", status: "REJECTED", approver_name: people.finmgr.full_name, acted_at: "2027-04-04T05:00:00Z", comment: "Entertainment is not a travel expense; use the correct category." }],
    }, people.acct),
  );

  // Posted in March: rent accrued unpaid (to be settled in April, AT-EXP-01) and a paid utility bill.
  const posted = (id: string, partial: Partial<Expense>, creditAccount: string) => {
    const e = expense(id, { ...partial, status: "POSTED" }, people.acct);
    const c = cat(e.category_id);
    const journal = postJournal(store, {
      date: e.date, description: e.description, reference: e.payee, type: "SYSTEM", source_type: "EXPENSE", source_no: `EXP-2027-${pad(state.sequences.EXP)}`,
      lines: [
        ...e.allocations.map((a) => line(c.account_id, a.amount, "0", { department_id: a.department_id, branch_id: a.branch_id, description: e.description })),
        line(creditAccount, "0", e.amount, { description: e.description }),
      ],
      user: people.finmgr, id: `jnl-${id}`, at: `${e.date}T09:00:00Z`,
    });
    e.number = journal.source_no;
    e.journal_id = journal.id;
    e.journal_no = journal.journal_no;
    e.approval_steps = [{ step: 1, role: "FINMGR", status: "APPROVED", approver_name: people.finmgr.full_name, acted_at: `${e.date}T08:00:00Z`, comment: null }];
    state.sequences.EXP += 1;
    state.expenses.push(e);
  };
  posted("exp-rent-march", {
    date: "2027-03-31", category_id: "cat-rent", description: "Siem Reap branch rent March 2027", payee: "Mr Vuthy (landlord)", payment_mode: "UNPAID",
    paid_from_id: null, amount: "1000.00", amount_base: "1000.00", allocations: [alloc("dep-SALES", "br-sr", "100", "1000.00")],
  }, "acc-2150");
  posted("exp-claim-travel", {
    date: "2027-03-22", category_id: "cat-travel", description: "Bus tickets to Battambang", payee: "Ly Sreymom (claim)", payment_mode: "CLAIM",
    paid_from_id: null, amount: "80.00", amount_base: "80.00", allocations: [alloc("dep-FIN", "br-bb", "100", "80.00")],
    attachments: [{ id: "att-bus", file_name: "bus-tickets.jpg", content_type: "image/jpeg", size: 95_000, uploaded_at: "2027-03-22T03:00:00Z", uploaded_by: people.acct.full_name }],
  }, "acc-2160");

  return state;
}

export const ABA_ACCOUNT_ID = ABA;
export const ACLEDA_ACCOUNT_ID = ACLEDA;
