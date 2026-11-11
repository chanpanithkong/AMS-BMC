import { api, apiFetch } from "../client";
import type { GeneralLedgerParams, GeneralLedgerReport, TrialBalanceParams, TrialBalanceReport } from "../types/reports";

export type ExportFormat = "pdf" | "xlsx" | "csv";

export interface ExportResult {
  /** COMPLETED: the file is ready at `url`. QUEUED: a background job; the user is notified (SRS §12.7). */
  status: "COMPLETED" | "QUEUED";
  file_name?: string;
  url?: string;
  job_id?: string;
}

type Query = Record<string, string>;

const toQuery = (params: object): Query =>
  Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]),
  );

// SRS §13.3 /reports/*.
export const reportsApi = {
  trialBalance: (params: TrialBalanceParams, signal?: AbortSignal) =>
    api.get<TrialBalanceReport>("/reports/trial-balance", toQuery(params), signal),
  generalLedger: (params: GeneralLedgerParams, signal?: AbortSignal) =>
    api.get<GeneralLedgerReport>("/reports/general-ledger", toQuery(params), signal),
  export: (reportId: string, format: ExportFormat, parameters: object) =>
    api.post<ExportResult>(`/reports/${reportId}/export`, { format, parameters: toQuery(parameters) }),
};

/** Download a finished export with the user's token and save it under its file name. */
export async function downloadExport(result: ExportResult): Promise<void> {
  if (!result.url) return;
  const path = result.url.replace(/^.*\/api\/v1/, "");
  const blob = await apiFetch<Blob>(path, { responseType: "blob" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = result.file_name ?? "export";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
