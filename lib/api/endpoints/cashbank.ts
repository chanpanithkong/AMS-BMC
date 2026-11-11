import { api, apiFetch } from "../client";
import type {
  AccountBook, CashBankAccount, CashTransaction, CashTransactionInput, CashTransactionListParams, Expense, ExpenseCategory, ExpenseInput,
  ExpenseListParams, Reconciliation, ReconciliationListItem, SpendingCheck, StatementImport, StatementMapping,
} from "../types/cashbank";
import type { Page } from "../types/common";

const key = (idempotencyKey: string) => ({ idempotencyKey });

// SRS §13.3 /bank-accounts, /cash-accounts, /cash-transactions, /bank-statements, /bank-reconciliations.
export const cashBankApi = {
  bankAccounts: (signal?: AbortSignal) => api.get<Page<CashBankAccount>>("/bank-accounts", undefined, signal),
  cashAccounts: (signal?: AbortSignal) => api.get<Page<CashBankAccount>>("/cash-accounts", undefined, signal),
  account: (kind: "BANK" | "CASH", id: string) => api.get<CashBankAccount>(`/${kind === "BANK" ? "bank" : "cash"}-accounts/${id}`),
  /** ASSUMPTION: cashbook and bankbook (RPT-11, RPT-12) as a sub-resource of the account. */
  book: (kind: "BANK" | "CASH", id: string, from: string, to: string, signal?: AbortSignal) =>
    api.get<AccountBook>(`/${kind === "BANK" ? "bank" : "cash"}-accounts/${id}/book`, { date_from: from, date_to: to }, signal),

  transactions: (params: CashTransactionListParams = {}, signal?: AbortSignal) =>
    api.get<Page<CashTransaction>>("/cash-transactions", { ...params }, signal),
  transaction: (id: string, signal?: AbortSignal) => api.get<CashTransaction>(`/cash-transactions/${id}`, undefined, signal),
  createTransaction: (input: CashTransactionInput) => api.post<CashTransaction>("/cash-transactions", input),
  updateTransaction: (id: string, input: CashTransactionInput, version: number) => api.patch<CashTransaction>(`/cash-transactions/${id}`, input, version),
  /** ASSUMPTION: submit and cancel; SRS §13.3 lists only "(+ /post)". */
  submitTransaction: (id: string) => api.post<CashTransaction>(`/cash-transactions/${id}/submit`),
  cancelTransaction: (id: string) => api.post<CashTransaction>(`/cash-transactions/${id}/cancel`),
  postTransaction: (id: string, k: string) => api.post<CashTransaction>(`/cash-transactions/${id}/post`, undefined, key(k)),

  reconciliations: (bankAccountId?: string, signal?: AbortSignal) =>
    api.get<Page<ReconciliationListItem>>("/bank-reconciliations", { bank_account_id: bankAccountId }, signal),
  reconciliation: (id: string, signal?: AbortSignal) => api.get<Reconciliation>(`/bank-reconciliations/${id}`, undefined, signal),
  startReconciliation: (input: { bank_account_id: string; statement_date: string; statement_closing: string }) =>
    api.post<Reconciliation>("/bank-reconciliations", input),
  match: (id: string, change: { add?: { statement_line_ids: string[]; book_line_ids: string[] }[]; remove?: string[] }) =>
    api.post<Reconciliation>(`/bank-reconciliations/${id}/matches`, change),
  /** ASSUMPTION: applies the server's suggestions. */
  autoMatch: (id: string) => api.post<Reconciliation>(`/bank-reconciliations/${id}/auto-match`),
  /** ASSUMPTION: posts an adjustment for an unmatched statement line and matches it. */
  adjust: (id: string, input: { statement_line_id: string; account_id: string; description: string; date?: string }, k: string) =>
    api.post<Reconciliation>(`/bank-reconciliations/${id}/adjustments`, input, key(k)),
  complete: (id: string, explanation: string | undefined, k: string) =>
    api.post<Reconciliation>(`/bank-reconciliations/${id}/complete`, { explanation }, key(k)),
  reopen: (id: string, reason: string) => api.post<Reconciliation>(`/bank-reconciliations/${id}/reopen`, { reason }),

  importStatement: (bankAccountId: string, file: File, mapping: StatementMapping) => {
    const form = new FormData();
    form.append("bank_account_id", bankAccountId);
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    return api.post<StatementImport>("/bank-statements/import", form);
  },
  commitImport: (id: string, k: string) => api.post<StatementImport>(`/bank-statements/imports/${id}/commit`, undefined, key(k)),
  imports: (bankAccountId?: string) => api.get<Page<StatementImport>>("/bank-statements/imports", { bank_account_id: bankAccountId }),
  /** ASSUMPTION: the column mapping saved for a bank account. */
  savedMapping: (bankAccountId: string) => api.get<{ mapping: StatementMapping | null }>(`/bank-accounts/${bankAccountId}/statement-mapping`),
  /** Mock mode only: a sample April statement built from the books. */
  sampleStatement: (bankAccountId: string) => apiFetch<Blob>("/bank-statements/sample", { query: { bank_account_id: bankAccountId }, responseType: "blob" }),
};

// SRS §13.3 /expenses (+ /submit, /approve, /post) and §6.9.
export const expensesApi = {
  categories: () => api.get<Page<ExpenseCategory>>("/expense-categories"),
  list: (params: ExpenseListParams = {}, signal?: AbortSignal) => api.get<Page<Expense>>("/expenses", { ...params }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<Expense>(`/expenses/${id}`, undefined, signal),
  create: (input: ExpenseInput) => api.post<Expense>("/expenses", input),
  update: (id: string, input: ExpenseInput, version: number) => api.patch<Expense>(`/expenses/${id}`, input, version),
  submit: (id: string) => api.post<Expense>(`/expenses/${id}/submit`),
  recall: (id: string) => api.post<Expense>(`/expenses/${id}/recall`),
  cancel: (id: string) => api.post<Expense>(`/expenses/${id}/cancel`),
  decide: (id: string, action: "approve" | "reject", comment: string, k: string) =>
    api.post<Expense>(`/expenses/${id}/approve`, { action, comment }, key(k)),
  post: (id: string, k: string) => api.post<Expense>(`/expenses/${id}/post`, undefined, key(k)),
  /** ASSUMPTION: settles an unpaid expense or claim through a cash or bank payment (FR-EXP-010). */
  settle: (id: string, accountId: string, date: string, k: string) =>
    api.post<Expense>(`/expenses/${id}/settle`, { account_id: accountId, date }, key(k)),
  addAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<Expense>(`/expenses/${id}/attachments`, form);
  },
  removeAttachment: (id: string, attachmentId: string) => api.delete<Expense>(`/expenses/${id}/attachments/${attachmentId}`),
  /** ASSUMPTION: year-to-date spending for the budget panel. */
  spending: (accountId: string, departmentId: string | null, date: string) =>
    api.get<SpendingCheck>("/expenses/spending", { account_id: accountId, department_id: departmentId, date }),
};
