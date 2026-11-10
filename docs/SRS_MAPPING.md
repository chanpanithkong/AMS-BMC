# Build prompt ↔ SRS mapping

Compares `docs/BUILD_PROMPT.md` with `docs/AMS-SRS-001` (v1.0, 27 October 2026, "Draft for Review — not approved").
Written 10 November 2026.

**Coverage of this review:** SRS §1–4, §7.5–7.10, §12–15, §19–20 and Appendix C were read.
§6 (functional requirements), §8–11 and the figures were **not** read, so the full permission-code
list and the business rules are unchecked.

`docs/AMS-SRS-001.md` is a text extract of the Word file: tables are included, figures are not.

## 1. Section mapping

| Prompt section | SRS source | Result |
|---|---|---|
| §0 Role, scope (front end only, FastAPI at `/api/v1`) | §12.1, §12.4, §13.5 | Matches |
| §1 Stack | §12.2, §12.4 | Matches; the prompt adds MSW, Zustand, decimal.js, date-fns, faker and axe, which the SRS does not name |
| §3 API client (headers, idempotency, `If-Match`, error body, cursor lists) | §13.1–13.3 | Matches |
| §4 Mock seed (10 roles, chart of accounts) | §4.2, Appendix C | Matches; Appendix C has 56 accounts with English names only |
| §5 Shell, 15 menu groups, role visibility | §14.1, §14.2 | Matches |
| §5 Critical-action dialog | §14.5, SCR-06, NFR-USA-005 | Matches |
| §6 Reusable components | §14.5 | Matches |
| §7 Screens SCR-01 to SCR-27 | §14.3, §14.4 | All 27 present with the same content |
| §7 Reports | §15.2–15.4 | 25 of 31 given full layouts |
| §8 Localisation | §7.10 (NFR-LOC-001 to 007) | Matches |
| §10 Responsive, accessibility, keyboard journal entry | NFR-USA-002, 003, 010 | Matches |
| §11 Phases | §19.1–19.7 | Same seven phases, different contents |

## 2. Differences to settle

| # | Topic | SRS says | Prompt says | Status |
|---|---|---|---|---|
| 1 | Phase contents | Phase 1: users and roles (SCR-16), company setup, chart of accounts. Phase 2: audit trail viewer, approval workflow, opening-balance import | SCR-16, 18, 19, 26 in Phase 7; full import wizard in Phase 6; SCR-03 in Phase 2 | Open — recommended: keep the prompt's order (the mock backend removes the dependencies behind the SRS order) and record it in `DECISIONS.md` |
| 2 | Menu home for Exchange rates and Imports | Neither is in the 15 menu groups (§14.2) | Routes `fx/rates`, `fx/revaluations`, `imports` exist | Open |
| 3 | Reports without a full layout | 31 reports (RPT-01 to RPT-31) | RPT-14, 15, 16, 17, 23 and 29 get only the generic viewer | Open |
| 4 | Missing endpoints | §13.3 has no endpoint for approving a period reopen, delegate, recall, notifications, attachments, global search, asset transfer or disposal, or settings; many resources list only `POST` | "Choose a sensible shape and mark it `// ASSUMPTION`" | Becomes assumptions in `API_CONTRACT.md` |
| 5 | Rejecting a journal | `/journal-entries/{id}/approve` with `action` in the body (§13.3); `/reject` appears only in the naming convention (§13.1) | `/reject` listed as its own action endpoint | Open |
| 6 | Error codes | Also `DUPLICATE_CODE`, `LOCKED`, `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `NOT_AUTHENTICATED`, `MALFORMED_REQUEST`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE` | Example list omits these | Add EN and KM messages for all |
| 7 | Print output | A5 for vouchers, COPY mark on reprints, optional signature blocks, a `print` route group (§12.4, §15.4) | A4 with `@media print` only | Open |
| 8 | Seed details | Period 13 in the default fiscal year (D-04); aging buckets configurable; MFA mandatory for OWNER, FINMGR, SYSADMIN (D-17) | 12 periods; fixed buckets; no mock TOTP mentioned | Open |
| 9 | Khmer account names | Appendix C is English only | Seed needs English and Khmer names | Names to be written and listed in `messages/km.review.md` |
| 10 | Project baseline | No Next.js version named | Next.js 15, `src/app/`, pnpm, empty folder | The project is already Next.js 16.4.6 with `app/` at the root — open |

## 3. Reference lists taken from the SRS

**Roles (§4.2):** SYSADMIN, OWNER, FINMGR, ACCT, APO, ARO, CASHIER, AUDITOR, DEPTMGR, READONLY.

**Menu groups (§14.2), in order:** Dashboard; Accounting; Sales and Receivables; Purchases and Payables;
Cash and Bank; Expenses; Fixed Assets; Inventory Integration (if enabled); Budgets; Financial Reports;
Tax; Approvals; Audit Trail; User Management; System Settings.

**Idempotency-Key required (§13.1, §13.3):** post, reverse, approve/reject, release payment,
create receipt/payment, allocate/unallocate, import commit, revaluation run, period soft-close/close/reopen-request,
year-end close, reconciliation complete.

**Sensitive accounts (Appendix C):** 2170 Salaries payable, 3300 Owner's drawings, 6300 Salaries and wages.

**Open SRS items that affect the UI:** D-04 (fiscal year), D-09 (permissions and limits), D-10 (reduced-SoD mode),
D-13 (budget control: warn vs block), D-17 (MFA policy), V-01 (tax codes), V-02 (invoice content and numbering).
