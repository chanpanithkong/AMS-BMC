import { api } from "../client";
import type { CompanyRef } from "../types/auth";
import type { AppNotification, Currency, Department, Dimension, ExchangeRate, FiscalYear, SearchResult } from "../types/org";

// SRS §13.3 — organisation, currencies and exchange rates.
// GET shapes are an ASSUMPTION where the catalogue lists only POST (see docs/API_CONTRACT.md).
export const orgApi = {
  companies: () => api.list<CompanyRef>("/companies"),
  departments: () => api.list<Department>("/departments"),
  fiscalYears: () => api.list<FiscalYear>("/fiscal-years"),
  currencies: () => api.list<Currency>("/currencies"),
  dimensions: () => api.list<Dimension>("/dimensions"),
  exchangeRates: (query: { from?: string; to?: string; date_from?: string; date_to?: string; rate_type?: string; cursor?: string | null; limit?: number }) =>
    api.list<ExchangeRate>("/exchange-rates", query),
  /** Rate for one date; 422 RATE_MISSING when none exists (BR-FX-002). ASSUMPTION: lookup endpoint. */
  rateOn: (from: string, to: string, date: string) =>
    api.get<ExchangeRate>("/exchange-rates/lookup", { from, to, date }),
};

// ASSUMPTION: notifications and global search are required by SRS §14.1 but have no endpoint in §13.3.
export const miscApi = {
  notifications: () => api.list<AppNotification>("/notifications", { limit: 20 }),
  markNotificationRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  markAllNotificationsRead: () => api.post<void>("/notifications/read-all"),
  search: (q: string, signal?: AbortSignal) => api.list<SearchResult>("/search", { q, limit: 12 }, signal),
};
