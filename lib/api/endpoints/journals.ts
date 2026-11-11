import { api } from "../client";
import type { Page } from "../types/common";
import type {
  ApprovalDecision, ApprovalItem, JournalEntry, JournalInput, JournalListParams, JournalSummary, ReverseRequest, UserRef,
} from "../types/journals";

// SRS §13.3 /journal-entries. State changes are action endpoints only; post, approve and reverse
// carry an Idempotency-Key (SRS §13.1).
export const journalsApi = {
  list: (params: JournalListParams = {}, signal?: AbortSignal) =>
    api.get<Page<JournalSummary>>("/journal-entries", { ...params }, signal),
  get: (id: string, signal?: AbortSignal) =>
    api.get<JournalEntry>(`/journal-entries/${id}`, { include: "lines,history,attachments" }, signal),
  create: (input: JournalInput) => api.post<JournalEntry>("/journal-entries", input),
  update: (id: string, input: JournalInput, version: number) => api.patch<JournalEntry>(`/journal-entries/${id}`, input, version),
  submit: (id: string) => api.post<JournalEntry>(`/journal-entries/${id}/submit`),
  /** ASSUMPTION: recall and cancel are named in SCR-04 without endpoints in §13.3. */
  recall: (id: string) => api.post<JournalEntry>(`/journal-entries/${id}/recall`),
  cancel: (id: string) => api.post<JournalEntry>(`/journal-entries/${id}/cancel`),
  /** Approve or reject: SRS §13.3 uses /approve with `action` (see docs/DECISIONS.md D-P2-01). */
  decide: (id: string, decision: ApprovalDecision, idempotencyKey: string) =>
    api.post<JournalEntry>(`/journal-entries/${id}/approve`, decision, { idempotencyKey }),
  /** ASSUMPTION: delegation is named in SCR-05 without an endpoint. */
  delegate: (id: string, userId: string) => api.post<JournalEntry>(`/journal-entries/${id}/delegate`, { user_id: userId }),
  post: (id: string, idempotencyKey: string) => api.post<JournalEntry>(`/journal-entries/${id}/post`, undefined, { idempotencyKey }),
  reverse: (id: string, request: ReverseRequest, idempotencyKey: string) =>
    api.post<JournalEntry>(`/journal-entries/${id}/reverse`, request, { idempotencyKey }),
  /** ASSUMPTION: attachment endpoints are not in §13.3. */
  addAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<JournalEntry>(`/journal-entries/${id}/attachments`, form);
  },
  removeAttachment: (id: string, attachmentId: string) =>
    api.delete<JournalEntry>(`/journal-entries/${id}/attachments/${attachmentId}`),
};

export const approvalsApi = {
  inbox: (params: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignal) =>
    api.get<Page<ApprovalItem>>("/approvals", params, signal),
  /** ASSUMPTION: users who may take over an approval. */
  approvers: (permission = "gl.journal.approve") => api.get<Page<UserRef>>("/users/approvers", { permission }),
};
