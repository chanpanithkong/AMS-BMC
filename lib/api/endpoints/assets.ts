import { api } from "../client";
import type { AssetCategory, AssetListParams, DepreciationRun, FixedAsset, FixedAssetInput, ScheduleRow } from "../types/assets";
import type { Page } from "../types/common";
import type {
  Budget, BudgetLineInput, BudgetUse, FxRevaluation, ImportBatch, ImportType, InventoryEvent, InventoryReconciliation, InventoryValuation,
} from "../types/planning";

const key = (idempotencyKey: string) => ({ idempotencyKey });
type Decision = "approve" | "reject";

// SRS §13.3 /fixed-assets, /depreciation-runs (+ ASSUMPTION: /asset-categories, transfer, dispose, schedule).
export const assetsApi = {
  categories: () => api.get<Page<AssetCategory>>("/asset-categories"),
  list: (params: AssetListParams = {}, signal?: AbortSignal) => api.get<Page<FixedAsset>>("/fixed-assets", { ...params }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<FixedAsset>(`/fixed-assets/${id}`, undefined, signal),
  schedule: (id: string, signal?: AbortSignal) => api.get<{ data: ScheduleRow[] }>(`/fixed-assets/${id}/schedule`, undefined, signal),
  create: (input: FixedAssetInput) => api.post<FixedAsset>("/fixed-assets", input),
  update: (id: string, input: FixedAssetInput, version: number) => api.patch<FixedAsset>(`/fixed-assets/${id}`, input, version),
  activate: (id: string) => api.post<FixedAsset>(`/fixed-assets/${id}/activate`),
  transfer: (id: string, input: { date: string; branch_id: string | null; department_id: string | null; location: string; custodian: string; reason: string }, k: string) =>
    api.post<FixedAsset>(`/fixed-assets/${id}/transfer`, input, key(k)),
  dispose: (id: string, input: { date: string; proceeds: string; account_id: string | null; reason: string }) => api.post<FixedAsset>(`/fixed-assets/${id}/dispose`, input),
  decideDisposal: (id: string, action: Decision, comment: string, k: string) => api.post<FixedAsset>(`/fixed-assets/${id}/disposal/decision`, { action, comment }, key(k)),
  runs: (signal?: AbortSignal) => api.get<Page<DepreciationRun>>("/depreciation-runs", { limit: 200 }, signal),
  run: (id: string, signal?: AbortSignal) => api.get<DepreciationRun>(`/depreciation-runs/${id}`, undefined, signal),
  createRun: (periodId: string) => api.post<DepreciationRun>("/depreciation-runs", { period_id: periodId }),
  decideRun: (id: string, action: Decision, comment: string, k: string) => api.post<DepreciationRun>(`/depreciation-runs/${id}/approve`, { action, comment }, key(k)),
  postRun: (id: string, k: string) => api.post<DepreciationRun>(`/depreciation-runs/${id}/post`, undefined, key(k)),
  cancelRun: (id: string) => api.post<DepreciationRun>(`/depreciation-runs/${id}/cancel`),
};

// SRS §13.3 /budgets (+ /submit, /approve). ASSUMPTION: PUT /budgets/{id}/lines and GET /budgets/use.
export const budgetsApi = {
  list: (fiscalYearId?: string, signal?: AbortSignal) => api.get<Page<Budget>>("/budgets", { fiscal_year_id: fiscalYearId, limit: 200 }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<Budget>(`/budgets/${id}`, undefined, signal),
  create: (input: { fiscal_year_id: string; name: string; reason: string; copy_from?: string | null; percent_change?: string }) => api.post<Budget>("/budgets", input),
  saveLines: (id: string, lines: BudgetLineInput[], version: number) => api.put<Budget>(`/budgets/${id}/lines`, { lines }, version),
  submit: (id: string) => api.post<Budget>(`/budgets/${id}/submit`),
  decide: (id: string, action: Decision, comment: string, k: string) => api.post<Budget>(`/budgets/${id}/approve`, { action, comment }, key(k)),
  use: (date: string, signal?: AbortSignal) => api.get<{ data: BudgetUse[] }>("/budgets/use", { date }, signal),
};

// SRS §13.3 /fx-revaluations (+ /post).
export const revaluationsApi = {
  list: (signal?: AbortSignal) => api.get<Page<FxRevaluation>>("/fx-revaluations", { limit: 200 }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<FxRevaluation>(`/fx-revaluations/${id}`, undefined, signal),
  preview: (periodId: string) => api.post<FxRevaluation>("/fx-revaluations", { period_id: periodId }),
  post: (id: string, k: string) => api.post<FxRevaluation>(`/fx-revaluations/${id}/post`, undefined, key(k)),
  cancel: (id: string) => api.post<FxRevaluation>(`/fx-revaluations/${id}/cancel`),
};

// SRS §6.11 /inventory-events, /reports/inventory-reconciliation (optional module).
export const inventoryApi = {
  events: (signal?: AbortSignal) => api.get<Page<InventoryEvent>>("/inventory-events", { limit: 200 }, signal),
  send: (input: Omit<InventoryEvent, "id" | "journal_id" | "journal_no" | "received_at">) => api.post<{ event: InventoryEvent; duplicate: boolean }>("/inventory-events", input),
  valuations: (signal?: AbortSignal) => api.get<Page<InventoryValuation>>("/inventory/valuations", undefined, signal),
  reconciliation: (date: string, signal?: AbortSignal) => api.get<InventoryReconciliation>("/reports/inventory-reconciliation", { date }, signal),
};

// SRS §13.3 /imports. ASSUMPTION: the browser sends parsed CSV rows; commit and rollback as actions.
export const importsApi = {
  list: (signal?: AbortSignal) => api.get<Page<ImportBatch>>("/imports", { limit: 200 }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<ImportBatch>(`/imports/${id}`, undefined, signal),
  status: (signal?: AbortSignal) => api.get<{ opening_signed_off: boolean }>("/imports/status", undefined, signal),
  validate: (input: { type: ImportType; file_name: string; file_hash: string; rows: Record<string, string>[]; target_id?: string | null }) => api.post<ImportBatch>("/imports", input),
  commit: (id: string, k: string) => api.post<ImportBatch>(`/imports/${id}/commit`, undefined, key(k)),
  rollback: (id: string) => api.post<ImportBatch>(`/imports/${id}/rollback`),
  signOffOpening: () => api.post<{ opening_signed_off: boolean }>("/imports/opening-signoff"),
};
