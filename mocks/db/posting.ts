import Decimal from "decimal.js";
import type { JournalEntry, JournalLineInput, JournalType } from "@/lib/api/types/journals";
import type { Account } from "@/lib/api/types/accounts";
import type { AccountingPeriod } from "@/lib/api/types/org";
import { buildLines, journalNumber, ledgerLines, periodFor, totalsOf } from "./journals";

// The mock's single posting service (SRS §12.6): every module creates its ledger journal here.

export interface PostingStore {
  accounts: Account[];
  journals: JournalEntry[];
  journalSequence: number;
  fiscalYears: { periods: AccountingPeriod[] }[];
}

export interface PostingRequest {
  date: string;
  description: string;
  reference: string;
  type?: JournalType;
  source_type: string;
  source_no: string;
  lines: PostingLine[];
  user: { id: string; full_name: string };
  /** For seeding: an explicit id and timestamp. */
  id?: string;
  at?: string;
}

/** Called after every posting, e.g. for budget alerts (FR-BUD-009). Listeners must not post. */
export const postingListeners: ((store: PostingStore, journal: JournalEntry) => void)[] = [];

/** Create and post a balanced journal. The caller has already checked the period and permissions. */
export function postJournal(store: PostingStore, request: PostingRequest): JournalEntry {
  const id = request.id ?? `jnl-${request.source_type.toLowerCase()}-${Date.now().toString(36)}-${store.journals.length}`;
  const lines = buildLines(request.lines, store.accounts, id);
  const totals = totalsOf(lines);
  if (!new Decimal(totals.difference).isZero()) throw new Error(`Unbalanced ${request.source_no}: ${totals.difference}`);
  const at = request.at ?? new Date().toISOString();
  const periods = store.fiscalYears.flatMap((y) => y.periods);
  const journal: JournalEntry = {
    id, journal_no: journalNumber(request.date.slice(0, 4), store.journalSequence), status: "POSTED", type: request.type ?? "SYSTEM",
    posting_date: request.date, document_date: request.date, description: request.description, reference: request.reference,
    currency: lines.find((l) => l.currency !== "USD")?.currency ?? "USD", period: periodFor(periods, request.date)?.code ?? null, totals,
    preparer_id: request.user.id, preparer_name: request.user.full_name, approver_name: request.user.full_name, submitted_at: at,
    posted_at: at, source_type: request.source_type, source_no: request.source_no, version: 1, lines,
    history: [{ id: `${id}-h1`, at, user_name: request.user.full_name, action: "POSTED" }], approval_steps: [], attachments: [],
    reversed_by: null, reverses: null, reversal_reason: null, rejection_comment: null,
  };
  store.journalSequence += 1;
  store.journals.push(journal);
  for (const listener of postingListeners) listener(store, journal);
  return journal;
}

/** Balance of a GL account in its own currency (transaction amounts) and in base, up to a date. */
export function accountBalance(store: PostingStore, glAccountId: string, until?: string): { amount: Decimal; base: Decimal } {
  let amount = new Decimal(0);
  let base = new Decimal(0);
  for (const l of ledgerLines(store.journals, { dateTo: until })) {
    if (l.account_id !== glAccountId) continue;
    amount = amount.plus(l.debit).minus(l.credit);
    base = base.plus(l.debit_base).minus(l.credit_base);
  }
  return { amount, base };
}

/**
 * A posting line. `base_override` sets the base amounts of a line whose transaction amount is zero:
 * revaluation changes the base value of a foreign-currency account without changing its currency
 * amount (BR-FX-004). Internal to the posting service, never accepted from API input.
 */
export type PostingLine = JournalLineInput & { base_override?: { debit: string; credit: string } };

export const line = (
  account_id: string, debit: string, credit: string, extra: Partial<JournalLineInput> = {},
): JournalLineInput => ({
  account_id, description: "", debit, credit, currency: "USD", rate: "1", branch_id: null, department_id: null, dimensions: {}, ...extra,
});
