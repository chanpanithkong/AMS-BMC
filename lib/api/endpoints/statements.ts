import { api } from "../client";
import type {
  DashboardBudgetUse, DashboardCashAccount, DashboardKpis, DashboardPending, DashboardReconciliation, DashboardRecent, DashboardTrendPoint,
  ReportDocument, ReportParams,
} from "../types/statements";

const query = (params: object) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false).map(([k, v]) => [k, String(v)]));

// SCR-15 catalogue reports. ASSUMPTION: GET /reports/{slug} returns a ReportDocument (SRS §13.3 lists /reports/*).
export const statementsApi = {
  run: (slug: string, params: ReportParams, signal?: AbortSignal) => api.get<ReportDocument>(`/reports/${slug}`, query(params), signal),
};

type Range = { date_from?: string; date_to?: string; branch_id?: string | null };

// SCR-02 widgets. ASSUMPTION: /dashboard/{widget}; SRS §13 names /api/v1/dashboard.
export const dashboardApi = {
  kpis: (r: Range, signal?: AbortSignal) => api.get<DashboardKpis>("/dashboard/kpis", query(r), signal),
  trend: (r: Range, signal?: AbortSignal) => api.get<{ data: DashboardTrendPoint[] }>("/dashboard/trend", query(r), signal),
  cash: (r: Range, signal?: AbortSignal) => api.get<{ data: DashboardCashAccount[] }>("/dashboard/cash", query(r), signal),
  reconciliations: (signal?: AbortSignal) => api.get<{ data: DashboardReconciliation[] }>("/dashboard/reconciliations", undefined, signal),
  recent: (signal?: AbortSignal) => api.get<{ data: DashboardRecent[] }>("/dashboard/recent", undefined, signal),
  pending: (signal?: AbortSignal) => api.get<DashboardPending>("/dashboard/pending", undefined, signal),
  budget: (signal?: AbortSignal) => api.get<DashboardBudgetUse>("/dashboard/budget", undefined, signal),
};
