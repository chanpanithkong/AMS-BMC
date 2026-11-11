import { api } from "../client";
import type { Account, AccountInput, AccountListParams } from "../types/accounts";
import type { HistoryEvent } from "../types/common";

// SRS §13.3 /api/v1/accounts (permission coa.view; sensitive accounts filtered server-side).
export const accountsApi = {
  list: (params: AccountListParams = {}, signal?: AbortSignal) => api.list<Account>("/accounts", { ...params }, signal),
  get: (id: string) => api.get<Account>(`/accounts/${id}`, { include: "history,balance" }),
  history: (id: string) => api.get<{ data: HistoryEvent[] }>(`/accounts/${id}/history`),
  create: (input: AccountInput) => api.post<Account>("/accounts", input),
  /** Changes to used accounts may come back as a pending change request (202). */
  update: (id: string, input: Partial<AccountInput>, version: number) => api.patch<Account>(`/accounts/${id}`, input, version),
  /** ASSUMPTION: decision on a pending change (coa.approve). */
  decideChange: (id: string, action: "approve" | "reject") => api.post<Account>(`/accounts/${id}/change-decision`, { action }),
  deactivate: (id: string) => api.post<Account>(`/accounts/${id}/deactivate`),
  activate: (id: string) => api.post<Account>(`/accounts/${id}/activate`),
  remove: (id: string) => api.delete(`/accounts/${id}`),
};
