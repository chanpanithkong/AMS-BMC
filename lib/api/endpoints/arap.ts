import { api } from "../client";
import type {
  AgingReport, AllocationLine, CreditNote, DuplicateCheck, Invoice, InvoiceInput, InvoiceLine, InvoiceListParams, Party, PartyInput, PartyPayment,
  PartyPaymentInput, PartyStatement, TaxCode,
} from "../types/arap";
import type { ListParams, Page } from "../types/common";

const key = (idempotencyKey: string) => ({ idempotencyKey });
type Decision = "approve" | "reject";

export interface PartyListParams extends ListParams {
  status?: string;
  with_balance?: boolean;
}

export interface PaymentListParams extends ListParams {
  status?: string;
  party_id?: string;
  date_from?: string;
  date_to?: string;
}

// SRS §13.3 /customers, /suppliers (+ ASSUMPTION: /status, /statement, /bank-details).
function partyApi(base: "/customers" | "/suppliers") {
  return {
    list: (params: PartyListParams = {}, signal?: AbortSignal) => api.get<Page<Party>>(base, { ...params }, signal),
    get: (id: string, signal?: AbortSignal) => api.get<Party>(`${base}/${id}`, undefined, signal),
    create: (input: PartyInput & { bank?: { bank_name: string; account_name: string; account_number: string } | null }) => api.post<Party>(base, input),
    update: (id: string, input: PartyInput, version: number) => api.patch<Party>(`${base}/${id}`, input, version),
    setStatus: (id: string, status: Party["status"], reason?: string) => api.post<Party>(`${base}/${id}/status`, { status, reason }),
    statement: (id: string, from: string, to: string, signal?: AbortSignal) =>
      api.get<PartyStatement>(`${base}/${id}/statement`, { date_from: from, date_to: to }, signal),
  };
}

export const customersApi = partyApi("/customers");
export const suppliersApi = {
  ...partyApi("/suppliers"),
  /** BR-AP-005: a bank-details change waits for approval by another user. */
  requestBankChange: (id: string, bank: { bank_name: string; account_name: string; account_number: string }) => api.post<Party>(`/suppliers/${id}/bank-details`, bank),
  decideBankChange: (id: string, action: Decision, comment: string, k: string) =>
    api.post<Party>(`/suppliers/${id}/bank-details/decision`, { action, comment }, key(k)),
};

// SRS §13.3 /customer-invoices and /supplier-invoices (+ /submit, /approve, /post, /cancel).
function invoiceApi(base: "/customer-invoices" | "/supplier-invoices") {
  return {
    list: (params: InvoiceListParams & { open?: boolean } = {}, signal?: AbortSignal) => api.get<Page<Invoice>>(base, { ...params }, signal),
    get: (id: string, signal?: AbortSignal) => api.get<Invoice>(`${base}/${id}`, undefined, signal),
    create: (input: InvoiceInput) => api.post<Invoice>(base, input),
    update: (id: string, input: InvoiceInput, version: number) => api.patch<Invoice>(`${base}/${id}`, input, version),
    submit: (id: string) => api.post<Invoice>(`${base}/${id}/submit`),
    recall: (id: string) => api.post<Invoice>(`${base}/${id}/recall`),
    cancel: (id: string, reason?: string) => api.post<Invoice>(`${base}/${id}/cancel`, { reason }),
    decide: (id: string, action: Decision, comment: string, k: string) => api.post<Invoice>(`${base}/${id}/approve`, { action, comment }, key(k)),
    post: (id: string, k: string) => api.post<Invoice>(`${base}/${id}/post`, undefined, key(k)),
    addAttachment: (id: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<Invoice>(`${base}/${id}/attachments`, form);
    },
    removeAttachment: (id: string, attachmentId: string) => api.delete<Invoice>(`${base}/${id}/attachments/${attachmentId}`),
  };
}

export const customerInvoicesApi = invoiceApi("/customer-invoices");
export const supplierInvoicesApi = {
  ...invoiceApi("/supplier-invoices"),
  /** ASSUMPTION: duplicate check on blur of the supplier's invoice number (BR-AP-001). */
  duplicateCheck: (q: { party_id: string; supplier_invoice_no: string; date?: string; total?: string; exclude_id?: string }, signal?: AbortSignal) =>
    api.get<DuplicateCheck>("/supplier-invoices/duplicate-check", q, signal),
};

export const creditNotesApi = {
  list: (params: ListParams & { status?: string; invoice_id?: string; party_id?: string } = {}, signal?: AbortSignal) =>
    api.get<Page<CreditNote>>("/customer-credit-notes", { ...params }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<CreditNote>(`/customer-credit-notes/${id}`, undefined, signal),
  create: (input: { invoice_id: string; date: string; reason: string; lines: InvoiceLine[] }) => api.post<CreditNote>("/customer-credit-notes", input),
  update: (id: string, input: { date: string; reason: string; lines: InvoiceLine[] }, version: number) => api.patch<CreditNote>(`/customer-credit-notes/${id}`, input, version),
  submit: (id: string) => api.post<CreditNote>(`/customer-credit-notes/${id}/submit`),
  cancel: (id: string) => api.post<CreditNote>(`/customer-credit-notes/${id}/cancel`),
  decide: (id: string, action: Decision, comment: string, k: string) => api.post<CreditNote>(`/customer-credit-notes/${id}/approve`, { action, comment }, key(k)),
  post: (id: string, k: string) => api.post<CreditNote>(`/customer-credit-notes/${id}/post`, undefined, key(k)),
};

export const receiptsApi = {
  list: (params: PaymentListParams = {}, signal?: AbortSignal) => api.get<Page<PartyPayment>>("/customer-receipts", { ...params }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<PartyPayment>(`/customer-receipts/${id}`, undefined, signal),
  /** SRS §13.3: records a draft, or records and posts when `post` is true. */
  create: (input: PartyPaymentInput, post: boolean, k: string) => api.post<PartyPayment>("/customer-receipts", { ...input, post }, key(k)),
  update: (id: string, input: PartyPaymentInput, version: number) => api.patch<PartyPayment>(`/customer-receipts/${id}`, input, version),
  post: (id: string, k: string) => api.post<PartyPayment>(`/customer-receipts/${id}/post`, undefined, key(k)),
  cancel: (id: string) => api.post<PartyPayment>(`/customer-receipts/${id}/cancel`),
  allocate: (id: string, allocations: AllocationLine[], k: string) => api.post<PartyPayment>(`/customer-receipts/${id}/allocate`, { allocations }, key(k)),
};

export const supplierPaymentsApi = {
  list: (params: PaymentListParams = {}, signal?: AbortSignal) => api.get<Page<PartyPayment>>("/supplier-payments", { ...params }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<PartyPayment>(`/supplier-payments/${id}`, undefined, signal),
  create: (input: PartyPaymentInput) => api.post<PartyPayment>("/supplier-payments", input),
  update: (id: string, input: PartyPaymentInput, version: number) => api.patch<PartyPayment>(`/supplier-payments/${id}`, input, version),
  submit: (id: string) => api.post<PartyPayment>(`/supplier-payments/${id}/submit`),
  cancel: (id: string) => api.post<PartyPayment>(`/supplier-payments/${id}/cancel`),
  decide: (id: string, action: Decision, comment: string, k: string) => api.post<PartyPayment>(`/supplier-payments/${id}/approve`, { action, comment }, key(k)),
  release: (id: string, bankReference: string, k: string) => api.post<PartyPayment>(`/supplier-payments/${id}/release`, { bank_reference: bankReference }, key(k)),
};

export const agingApi = {
  /** RPT-07 / RPT-08. ASSUMPTION: paths under /reports. */
  ar: (asOf: string, signal?: AbortSignal) => api.get<AgingReport>("/reports/ar-aging", { as_of: asOf }, signal),
  ap: (asOf: string, signal?: AbortSignal) => api.get<AgingReport>("/reports/ap-aging", { as_of: asOf }, signal),
};

// SRS §13.3 /tax-codes, /tax-codes/{id}/rates (+ ASSUMPTION: /verify).
export const taxCodesApi = {
  list: (params: { kind?: string; active?: boolean } = {}, signal?: AbortSignal) => api.get<Page<TaxCode>>("/tax-codes", { ...params, limit: 200 }, signal),
  get: (id: string, signal?: AbortSignal) => api.get<TaxCode>(`/tax-codes/${id}`, undefined, signal),
  create: (input: Pick<TaxCode, "code" | "name" | "name_km" | "kind" | "method" | "account_id"> & { rate: string; effective_from: string }) =>
    api.post<TaxCode>("/tax-codes", input),
  update: (id: string, input: Partial<Pick<TaxCode, "code" | "name" | "name_km" | "kind" | "method" | "account_id" | "is_active">>, version: number) =>
    api.patch<TaxCode>(`/tax-codes/${id}`, input, version),
  addRate: (id: string, rate: string, effectiveFrom: string) => api.post<TaxCode>(`/tax-codes/${id}/rates`, { rate, effective_from: effectiveFrom }),
  verify: (id: string, note: string) => api.post<TaxCode>(`/tax-codes/${id}/verify`, { note }),
};
