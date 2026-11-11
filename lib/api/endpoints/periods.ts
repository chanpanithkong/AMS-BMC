import { api } from "../client";
import type { HistoryEvent } from "../types/common";
import type { JournalEntry } from "../types/journals";
import type { AccountingPeriod, FiscalYear } from "../types/org";
import type { PeriodChecklist } from "../types/reports";

const key = (idempotencyKey: string) => ({ idempotencyKey });

// SRS §13.3 /accounting-periods and /fiscal-years. Every transition carries an Idempotency-Key.
export const periodsApi = {
  checklist: (id: string) => api.get<PeriodChecklist>(`/accounting-periods/${id}/checklist`),
  /** ASSUMPTION: manual checklist items are ticked through this endpoint. */
  tick: (id: string, itemId: string, done: boolean, evidence?: string) =>
    api.patch<PeriodChecklist>(`/accounting-periods/${id}/checklist/${itemId}`, { done, evidence }),
  history: (id: string) => api.get<{ data: HistoryEvent[] }>(`/accounting-periods/${id}/history`),
  softClose: (id: string, k: string) => api.post<AccountingPeriod>(`/accounting-periods/${id}/soft-close`, undefined, key(k)),
  /** ASSUMPTION: soft-closed back to open. */
  open: (id: string, k: string) => api.post<AccountingPeriod>(`/accounting-periods/${id}/open`, undefined, key(k)),
  close: (id: string, k: string) => api.post<AccountingPeriod>(`/accounting-periods/${id}/close`, undefined, key(k)),
  requestReopen: (id: string, reason: string, k: string) =>
    api.post<AccountingPeriod>(`/accounting-periods/${id}/reopen-request`, { reason }, key(k)),
  /** ASSUMPTION: the Owner's decision on a reopen request. */
  decideReopen: (id: string, action: "approve" | "reject", comment: string, k: string) =>
    api.post<AccountingPeriod>(`/accounting-periods/${id}/reopen`, { action, comment }, key(k)),
  closeYear: (id: string, k: string) =>
    api.post<{ fiscal_year: FiscalYear; closing_journal: JournalEntry }>(`/fiscal-years/${id}/close`, undefined, key(k)),
};
