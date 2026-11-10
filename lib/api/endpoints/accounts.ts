import { api } from "../client";
import type { Account, AccountListParams } from "../types/accounts";

// SRS §13.3 — /api/v1/accounts (permission coa.view; sensitive accounts filtered server-side).
export const accountsApi = {
  list: (params: AccountListParams = {}, signal?: AbortSignal) =>
    api.list<Account>("/accounts", { ...params }, signal),
  get: (id: string) => api.get<Account>(`/accounts/${id}`),
};
