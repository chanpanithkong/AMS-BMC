# API contract (front end ↔ FastAPI)

What the web UI sends and expects, so the FastAPI team can check that both sides match.
Source: `docs/AMS-SRS-001` §13. Where the SRS gives no payload, the shape here is an **ASSUMPTION** (list at the end)
and is marked `// ASSUMPTION` in the code. TypeScript types live in `lib/api/types/`; endpoint functions in
`lib/api/endpoints/`; the mock implementation in `mocks/handlers/`.

This file covers the endpoints the UI calls **as of Phase 3**. Each later phase adds its resources here.

## Conventions the client follows (SRS §13.1)

| Topic | Client behaviour | Code |
|---|---|---|
| Base path | `NEXT_PUBLIC_API_BASE_URL`, default `/api/v1` | `lib/config.ts` |
| Authentication | `Authorization: Bearer <access token>`; the token is held in memory only | `lib/api/client.ts` |
| Refresh | On `401 SESSION_EXPIRED`: one `POST /auth/refresh` (cookie + `X-CSRF-Token`), then the request is repeated once with the same `Idempotency-Key`. Concurrent requests share one refresh. | `refreshSession()` |
| Company | `X-Company-Id: <selected company>` on every request | `apiContext.companyId` |
| Language | `Accept-Language: en` or `km` | `apiContext.locale` |
| Idempotency | `Idempotency-Key: <UUID v4>`; the same key is re-sent when the user retries after a network failure or 5xx; a new key for each new user action | `lib/api/idempotency.ts` |
| Concurrency | `If-Match: <version>` on draft edits; `409 VERSION_CONFLICT` shows "changed by someone else — reload" | `api.patch()` |
| Lists | `{ "data": [...], "page": { "next_cursor": string \| null, "limit": number, "total"?: number } }`; query `cursor`, `limit` (≤ 200), `sort` (`field` or `-field`) | `Page<T>` |
| Money | Decimal strings, e.g. `"1250.00"`; never JSON numbers | `Money` |
| Dates | Business dates `YYYY-MM-DD`; timestamps ISO 8601 UTC | `IsoDate`, `IsoDateTime` |
| State changes | Action endpoints only (`/submit`, `/approve`, `/post`, …); the UI never writes a `status` field | — |
| Errors | `{ "error": { "code", "message", "details": [{ "field", "issue", "value", "message" }], "correlation_id" } }` | `lib/api/errors.ts` |

### Error codes the UI knows

Each has an English and a Khmer message (`messages/*.json`, key `errors.<CODE>`); a unit test checks this.

`MALFORMED_REQUEST`, `NOT_AUTHENTICATED`, `SESSION_EXPIRED`, `FORBIDDEN`, `APPROVAL_LIMIT_EXCEEDED`, `SOD_VIOLATION`,
`NOT_FOUND`, `VERSION_CONFLICT`, `ALREADY_POSTED`, `INVALID_STATE_TRANSITION`, `PERIOD_CLOSED`,
`DUPLICATE_SUPPLIER_INVOICE`, `RECONCILIATION_COMPLETED`, `IDEMPOTENCY_KEY_REUSED`, `DUPLICATE_CODE`,
`VALIDATION_ERROR`, `JOURNAL_UNBALANCED`, `ACCOUNT_NOT_POSTABLE`, `RATE_MISSING`, `ALLOCATION_EXCEEDS_BALANCE`,
`TAX_CODE_UNVERIFIED`, `DIFFERENCE_UNRESOLVED`, `UNMAPPED_ACCOUNTS`, `RATE_LIMITED`, `INTERNAL_ERROR`,
`SERVICE_UNAVAILABLE`, `LOCKED`, `JOURNAL_POSTED` and `ACCOUNT_IN_USE` (both named in SRS §8), and (assumptions) `DUPLICATE_RECORD`, `ATTACHMENT_REQUIRED`, `INSUFFICIENT_BALANCE`, `INVALID_CREDENTIALS`, `MFA_REQUIRED`, `INVALID_OTP`, `INVALID_TOKEN`.

Unknown codes are shown with a generic message plus the correlation ID. `429` responses may carry `Retry-After`.
Field messages in `details[].message` are shown as sent, so the server should localise them (SRS §13.2).

## Endpoints used in Phase 1

### Authentication

| Method | Path | Request | Response | Errors the UI handles |
|---|---|---|---|---|
| POST | `/auth/login` | `LoginRequest` | `SessionResponse` | `401 INVALID_CREDENTIALS`, `401 LOCKED` (`details[{ field: "locked_until", value: ISO time }]`), `401 MFA_REQUIRED`, `401 INVALID_OTP`, `429 RATE_LIMITED` |
| POST | `/auth/refresh` | refresh cookie, `X-CSRF-Token` | `SessionResponse` | `401` → sign-in page |
| POST | `/auth/logout` | — | `204` | — |
| POST | `/auth/password/forgot` | `{ "email": string }` | `204` always | `422` |
| POST | `/auth/password/reset` | `{ "token": string, "new_password": string }` | `204` | `422 INVALID_TOKEN`, `422 VALIDATION_ERROR` (`details[].field = "new_password"`) |

```ts
interface LoginRequest { username: string; password: string; otp?: string }

interface SessionResponse {
  access_token: string;
  expires_in: number;            // seconds
  user: SessionUser;
  companies: CompanyRef[];
}

interface SessionUser {
  id: string; username: string; email: string;
  full_name: string; full_name_km: string;
  roles: RoleCode[];             // SYSADMIN | OWNER | FINMGR | ACCT | APO | ARO | CASHIER | AUDITOR | DEPTMGR | READONLY
  permissions: string[];         // effective permission codes, e.g. "gl.journal.post"
  locale: "en" | "km";
  date_format: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD-MMM-YYYY";
  negative_style: "brackets" | "minus";
  mfa_enabled: boolean;
  default_company_id: string;
  department_ids: string[];      // own-department scope (DEPTMGR)
  cash_account_ids: string[];    // own cash accounts (CASHIER)
}

interface CompanyRef { id: string; code: string; name: string; name_km: string; base_currency: string; branches: BranchRef[] }
interface BranchRef  { id: string; code: string; name: string; name_km: string }
```

### Organisation and reference data

| Method | Path | Query | Response item | Permission |
|---|---|---|---|---|
| GET | `/companies` | — | `CompanyRef` | signed in |
| GET | `/departments` | — | `Department` | signed in |
| GET | `/fiscal-years` | — | `FiscalYear` (with `periods`) | signed in |
| GET | `/currencies` | — | `Currency` | signed in |
| GET | `/dimensions` | — | `Dimension` | signed in |
| GET | `/exchange-rates` | `from`, `to`, `rate_type`, `date_from`, `date_to`, `cursor`, `limit` | `ExchangeRate` | `fx.rate.view` |
| GET | `/exchange-rates/lookup` | `from`, `to`, `date` | one `ExchangeRate`; `422 RATE_MISSING` when none | `fx.rate.view` |

```ts
interface Department { id: string; company_id: string; code: string; name: string; name_km: string; is_active: boolean }
interface FiscalYear { id: string; company_id: string; name: string; start_date: IsoDate; end_date: IsoDate; status: "OPEN" | "CLOSED"; periods: AccountingPeriod[] }
interface AccountingPeriod { id: string; fiscal_year_id: string; code: string; period_no: number; name: string; name_km: string; start_date: IsoDate; end_date: IsoDate; status: "OPEN" | "SOFT_CLOSED" | "CLOSED" | "REOPENED" }
interface Currency { code: string; name: string; name_km: string; symbol: string; decimals: number; is_active: boolean }
interface ExchangeRate { id: string; rate_date: IsoDate; from_currency: string; to_currency: string; rate_type: "TRANSACTION" | "CLOSING" | "AVERAGE"; rate: Money; source: string }
interface Dimension { id: string; code: string; name: string; name_km: string; values: { id: string; code: string; name: string; name_km: string }[] }
```

`ExchangeRate.rate` is `to_currency` units per one `from_currency` unit, up to **12 decimals** (the SRS proposes 8; see DECISIONS D-P2-07). Requests send rates with up to 12 decimals, and the server must keep all 12. With base USD the UI reads
`from = KHR`, `to = USD`, i.e. base units per one unit of transaction currency (SRS §6.16), and shows the inverse
("1 USD = 4,100 KHR") for readability.

### Chart of accounts (read side)

| Method | Path | Query | Response | Permission |
|---|---|---|---|---|
| GET | `/accounts` | `type`, `active`, `posting`, `control`, `search`, `cursor`, `limit`, `sort` | `Page<Account>` | `coa.view` |
| GET | `/accounts/{account_id}` | — | `Account`; `404` when out of scope or sensitive | `coa.view` |

```ts
interface Account {
  id: string; code: string; name: string; name_km: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  category: string; parent_id: string | null;
  normal_balance: "DEBIT" | "CREDIT";
  is_posting: boolean;           // false = header; never offered by AccountPicker
  is_control: boolean; control_module: "AR" | "AP" | "BANK" | "FIXED_ASSETS" | "INVENTORY" | "TAX" | null;
  is_contra: boolean; is_sensitive: boolean;
  currency: string | null; cash_flow_class: "CASH" | "OPERATING" | "INVESTING" | "FINANCING" | null;
  is_active: boolean; version: number; balance?: Money;
}
```

Pickers call `GET /accounts?posting=true&active=true&limit=200`. The server must leave sensitive accounts out for users
without access (FR-RBAC-005); the UI does not filter them itself.

### Notifications and search

| Method | Path | Query / body | Response |
|---|---|---|---|
| GET | `/notifications` | `limit` | `Page<AppNotification>` |
| POST | `/notifications/{id}/read` | — | `204` |
| POST | `/notifications/read-all` | — | `204` |
| GET | `/search` | `q` (≥ 2 characters), `limit` | `Page<SearchResult>` |

```ts
interface AppNotification { id: string; title: string; title_km: string; body: string; body_km: string; created_at: IsoDateTime; read: boolean; link: string | null }
interface SearchResult { type: "account" | "customer" | "supplier" | "document"; id: string; label: string; sublabel: string; href: string }
```

`link` and `href` are app paths without the locale prefix, e.g. `/accounting/journals/0193…`.

## Endpoints added in Phase 2

Types: `lib/api/types/journals.ts`, `lib/api/types/reports.ts`, `lib/api/types/accounts.ts`.
Calls marked † send an `Idempotency-Key`.

### Chart of accounts (SCR-03)

| Method | Path | Request | Response | Errors the UI handles |
|---|---|---|---|---|
| GET | `/accounts?include_balance=true` | also `category` | `Page<Account>` with `balance`, `in_use`, `pending_change` | — |
| GET | `/accounts/{id}/history` | — | `{ data: HistoryEvent[] }` | 404 |
| POST | `/accounts` | `AccountInput` | `Account` (201) | `422 VALIDATION_ERROR` (`code`, `parent_id`, `control_module`, `effective_to`), `409 DUPLICATE_CODE` |
| PATCH | `/accounts/{id}` | changed fields, `If-Match` | `Account` (200), or `Account` with `pending_change` (202) when the account is used and the change needs approval | `409 VERSION_CONFLICT`, 422 |
| POST | `/accounts/{id}/change-decision` | `{ action: "approve" or "reject" }` | `Account` | `403 SOD_VIOLATION` (own request). ASSUMPTION |
| POST | `/accounts/{id}/deactivate`, `/activate` | — | `Account` | `409 INVALID_STATE_TRANSITION` (balance not zero). ASSUMPTION |
| DELETE | `/accounts/{id}` | — | 204 | `409 ACCOUNT_IN_USE` |

### Journals (SCR-04, SCR-05, SCR-06)

| Method | Path | Request | Response | Errors the UI handles |
|---|---|---|---|---|
| GET | `/journal-entries` | `status` (comma list), `type`, `date_from`, `date_to`, `account_id`, `amount_min`, `amount_max`, `preparer_id`, `source`, `search`, `sort` (`posting_date`, `journal_no`, `total`, or with `-`), cursor | `Page<JournalSummary>` | — |
| GET | `/journal-entries/{id}` | — | `JournalEntry` (lines, history, approval steps, attachments, reversal links) | 404 |
| POST | `/journal-entries` | `JournalInput` | `JournalEntry` (201); may be unbalanced; carries `totals.difference` | 422 |
| PATCH | `/journal-entries/{id}` | `JournalInput`, `If-Match` | `JournalEntry` | `409 JOURNAL_POSTED`, `409 INVALID_STATE_TRANSITION`, `409 VERSION_CONFLICT` |
| POST | `/journal-entries/{id}/submit` | — | `JournalEntry` (SUBMITTED, with `approval_steps`) | `422 JOURNAL_UNBALANCED` (`details[{ field: "lines", value: difference }]`), `422 ACCOUNT_NOT_POSTABLE` (`details[{ field: "lines.N.account_id", issue: "header", "inactive" or "control_account", value: code }]`), `422 RATE_MISSING`, `409 PERIOD_CLOSED` (`value`: period name), `422 VALIDATION_ERROR` |
| POST | `/journal-entries/{id}/recall`, `/cancel` | — | `JournalEntry` | 409, 403. ASSUMPTION |
| POST † | `/journal-entries/{id}/approve` | `{ action: "approve" or "reject", comment }` (comment required to reject) | `JournalEntry` | `403 SOD_VIOLATION`, `403 APPROVAL_LIMIT_EXCEEDED`, `403 FORBIDDEN` (step for another role), 409, 422 |
| POST | `/journal-entries/{id}/delegate` | `{ user_id }` | `JournalEntry` | 422, `403 SOD_VIOLATION`. ASSUMPTION |
| POST † | `/journal-entries/{id}/post` | — | `JournalEntry` (POSTED, `journal_no` `JV-YYYY-NNNNNN`) | `409 ALREADY_POSTED` (shown as "already done"), `409 PERIOD_CLOSED`, `403 SOD_VIOLATION`, `403 APPROVAL_LIMIT_EXCEEDED`, 422 |
| POST † | `/journal-entries/{id}/reverse` | `{ reversal_date, reason }` | reversal `JournalEntry` (201, POSTED, `reverses`) | `409 PERIOD_CLOSED`, `409 INVALID_STATE_TRANSITION` (already reversed) |
| POST | `/journal-entries/{id}/attachments` | multipart `file` | `JournalEntry` | 422. ASSUMPTION |
| DELETE | `/journal-entries/{id}/attachments/{attachmentId}` | — | `JournalEntry` | `409 JOURNAL_POSTED`. ASSUMPTION |
| GET | `/approvals` | cursor | `Page<ApprovalItem>` (items waiting for the signed-in user) | — |
| GET | `/users/approvers?permission=gl.journal.approve` | — | `Page<UserRef>` | ASSUMPTION |

Concurrent requests with the same `Idempotency-Key` must wait for the first and return its stored response
(AT-GL-03); the mock does this.

### Reports (SCR-07, SCR-08)

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/reports/trial-balance` | `date_from`, `date_to`, `branch_id`, `include_zero`, `level` | `TrialBalanceReport`: rows with `level` and `is_posting`; header rows roll up; `totals` from posting accounts only; `validation.balanced` |
| GET | `/reports/general-ledger` | `accounts` (comma list; headers expand to their posting accounts), `date_from`, `date_to`, `branch_id`, `department_id`, `currency_view` (`base` or `transaction`) | `GeneralLedgerReport`: per account the opening balance, lines with a running balance on the normal side, totals, closing balance, `truncated` |
| POST | `/reports/{report_id}/export` | `{ format: "pdf", "xlsx" or "csv", parameters }` | `{ status: "COMPLETED", file_name, url }`, or `202 { status: "QUEUED", job_id }` |
| GET | `/exports/{id}` | — | the file (bearer token) |

### Periods and rates (SCR-17, SCR-24)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/accounting-periods/{id}/checklist` | — | `PeriodChecklist` (items, automatic checks, blocking messages). ASSUMPTION | — |
| PATCH | `/accounting-periods/{id}/checklist/{itemId}` | `{ done, evidence }` | `PeriodChecklist`. ASSUMPTION | 409 (automatic item) |
| GET | `/accounting-periods/{id}/history` | — | `{ data: HistoryEvent[] }`. ASSUMPTION | — |
| POST † | `/accounting-periods/{id}/soft-close`, `/close` | — | `AccountingPeriod` | `409 INVALID_STATE_TRANSITION` (wrong state, an earlier period still open, or blocking checklist items listed in `details[].message`) |
| POST † | `/accounting-periods/{id}/open` | — | `AccountingPeriod` (soft-closed back to open). ASSUMPTION | 409 |
| POST † | `/accounting-periods/{id}/reopen-request` | `{ reason }` | `AccountingPeriod` with `reopen_request` | 422, 409 |
| POST † | `/accounting-periods/{id}/reopen` | `{ action: "approve" or "reject", comment }` | `AccountingPeriod` (REOPENED). ASSUMPTION | `403 SOD_VIOLATION` (requester), 409, 422 |
| POST † | `/fiscal-years/{id}/close` | — | `{ fiscal_year, closing_journal }` | `409 INVALID_STATE_TRANSITION` (`details[]` lists the open periods) |
| POST | `/exchange-rates` | `{ rate_date, from_currency, to_currency?, rate_type, rate, source }` | `ExchangeRate` (201) | `422 VALIDATION_ERROR`, `409 DUPLICATE_RECORD` |

## Endpoints added in Phase 3

Types: `lib/api/types/cashbank.ts`. Endpoint functions: `lib/api/endpoints/cashbank.ts`. Calls marked † send an `Idempotency-Key`.

### Cash and bank accounts, cashbook and bankbook

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| GET | `/bank-accounts`, `/cash-accounts` | — | `Page<CashBankAccount>` with `balance` (account currency), `balance_base`, `min_balance`, `last_reconciled` | Numbers masked unless `cb.bank.unmask`. Cashiers see only cash accounts in their custody (`404` otherwise). |
| GET | `/bank-accounts/{id}`, `/cash-accounts/{id}` | — | `CashBankAccount` | |
| GET | `/{bank\|cash}-accounts/{id}/book` | `date_from`, `date_to` | `AccountBook`: opening, lines with running balance (account and base currency), totals, closing | ASSUMPTION (RPT-11, RPT-12) |

### Cash transactions (SCR-27)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/cash-transactions` | `type`, `status`, `account_id`, `date_from`, `date_to`, `search`, cursor | `Page<CashTransaction>` | |
| POST | `/cash-transactions` | `CashTransactionInput` | draft (201) | |
| PATCH | `/cash-transactions/{id}` | `CashTransactionInput`, `If-Match` | `CashTransaction` | `409` when not a draft |
| POST | `/cash-transactions/{id}/submit`, `/cancel` | — | `CashTransaction` | `422 VALIDATION_ERROR` (lines total, control or cash accounts on lines, deposit or withdrawal direction), `409 PERIOD_CLOSED`. ASSUMPTION |
| POST † | `/cash-transactions/{id}/post` | — | `CashTransaction` (POSTED, `number` CR/PV/TR/DP/WD/BC-YYYY-NNNNNN, `journal_no`) | `422 INSUFFICIENT_BALANCE` (`details[].value` = balance; ASSUMPTION), `422 RATE_MISSING`, `409 ALREADY_POSTED` |

Transfers, deposits and withdrawals carry `to_account_id`; between currencies also `to_amount` (amount received).

### Bank statements and reconciliation (SCR-13, FR-CB-008..013)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| POST | `/bank-statements/import` | multipart: `file` (CSV), `bank_account_id`, `mapping` (JSON `StatementMapping`) | `StatementImport` preview (rows VALID / ERROR / DUPLICATE, counts) | `422` format or empty file |
| POST † | `/bank-statements/imports/{id}/commit` | — | `StatementImport` (COMMITTED, `created_lines`) | `409 ALREADY_POSTED` |
| GET | `/bank-statements/imports` | `bank_account_id` | import history | |
| GET | `/bank-accounts/{id}/statement-mapping` | — | `{ mapping }` saved for the account | ASSUMPTION |
| GET | `/bank-statements/sample` | `bank_account_id` | CSV | mock mode only |
| GET | `/bank-reconciliations` | `bank_account_id` | `Page<ReconciliationListItem>` | |
| POST | `/bank-reconciliations` | `{ bank_account_id, statement_date, statement_closing }` | `Reconciliation` (201); opening = previous closing | `409` one in progress, or date not after the last |
| GET | `/bank-reconciliations/{id}` | — | `Reconciliation`: statement lines, book lines (bank-side signs), matches, suggestions, `summary` | |
| POST | `/bank-reconciliations/{id}/matches` | `{ add?: [{ statement_line_ids, book_line_ids }], remove?: [match_id] }` | `Reconciliation` | `422 VALIDATION_ERROR` (`issue: amounts_differ`), `409 RECONCILIATION_COMPLETED` |
| POST | `/bank-reconciliations/{id}/auto-match` | — | `Reconciliation` | ASSUMPTION |
| POST † | `/bank-reconciliations/{id}/adjustments` | `{ statement_line_id, account_id, description, date? }` | `Reconciliation` (201) | `409 PERIOD_CLOSED`, `422 ACCOUNT_NOT_POSTABLE`. ASSUMPTION |
| POST † | `/bank-reconciliations/{id}/complete` | `{ explanation? }` | `Reconciliation` (COMPLETED) | `422 DIFFERENCE_UNRESOLVED` (`details[].value` = difference) |
| POST | `/bank-reconciliations/{id}/reopen` | `{ reason }` | `Reconciliation` | `409` when a later reconciliation exists |

### Expenses (SCR-21, §6.9)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/expense-categories` | — | `Page<ExpenseCategory>` (account, attachment rule) | |
| GET | `/expenses` | `status`, `category_id`, `payment_mode`, `date_from`, `date_to`, `preparer_id`, `search`, cursor | `Page<Expense>` | Department managers see their departments; cashiers and AP officers their own |
| POST / PATCH | `/expenses`, `/expenses/{id}` | `ExpenseInput` (allocations by percent or amount) | `Expense`; the server computes allocation amounts, last line takes the rounding | |
| POST | `/expenses/{id}/submit` | — | SUBMITTED with `approval_steps` | `422 ATTACHMENT_REQUIRED` (ASSUMPTION, AT-EXP-03), `422 VALIDATION_ERROR` (allocations), `409 PERIOD_CLOSED` |
| POST | `/expenses/{id}/recall`, `/cancel` | — | `Expense` | ASSUMPTION |
| POST † | `/expenses/{id}/approve` | `{ action, comment }` | `Expense` | `403 SOD_VIOLATION`, `403 APPROVAL_LIMIT_EXCEEDED`, `403 FORBIDDEN` (not this approver's department) |
| POST † | `/expenses/{id}/post` | — | POSTED, `number` EXP-YYYY-NNNNNN | `403 SOD_VIOLATION`, `422 INSUFFICIENT_BALANCE` |
| POST † | `/expenses/{id}/settle` | `{ account_id, date }` | `Expense` with `settlement` | `409 ALREADY_POSTED` when settled. ASSUMPTION (FR-EXP-010) |
| POST / DELETE | `/expenses/{id}/attachments[/{attachmentId}]` | multipart `file` | `Expense` | ASSUMPTION |
| GET | `/expenses/spending` | `account_id`, `department_id`, `date` | `SpendingCheck` (year to date; budget null until Phase 6) | ASSUMPTION |

`GET /approvals` now also returns expenses (`document_type: "EXPENSE"`).

## Endpoints added in Phase 4

Types: `lib/api/types/arap.ts`. Endpoint functions: `lib/api/endpoints/arap.ts`. Calls marked † send an `Idempotency-Key`.
Line and total maths shared by the UI preview and the mock: `lib/money/invoice.ts`.

### Customers and suppliers (SCR-20)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/customers`, `/suppliers` | `status`, `search`, `with_balance`, cursor | `Page<Party>` with `balance`, `overdue` (base) and, for customers, `unapplied` | |
| POST / PATCH | `/customers[/{id}]`, `/suppliers[/{id}]` | `PartyInput` (suppliers may send `bank` on create) | `Party`; new suppliers are DRAFT | `409 DUPLICATE_CODE`, `422 VALIDATION_ERROR` |
| POST | `/customers/{id}/status`, `/suppliers/{id}/status` | `{ status, reason? }` (ACTIVE/INACTIVE; VERIFIED/BLOCKED with `ap.supplier.approve`) | `Party` | ASSUMPTION (A-11) |
| GET | `/customers/{id}/statement`, `/suppliers/{id}/statement` | `date_from`, `date_to` | `PartyStatement` (opening, lines with running balance, closing, aging) | ASSUMPTION (A-11) |
| POST | `/suppliers/{id}/bank-details` | `{ bank_name, account_name, account_number }` | `Party` with `bank.pending` | ASSUMPTION (A-12) |
| POST † | `/suppliers/{id}/bank-details/decision` | `{ action, comment }` | `Party` | `403 SOD_VIOLATION` (requester). ASSUMPTION (A-12) |

Bank account numbers are masked (`•••• 1234`) without `ap.supplier.bank.view`.

### Customer and supplier invoices (SCR-09, SCR-11)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/customer-invoices`, `/supplier-invoices` | `status` (incl. derived `OVERDUE`), `party_id`, `open`, `date_from`, `date_to`, `search`, cursor | `Page<Invoice>` | Department managers see supplier invoices of their departments |
| POST / PATCH | `/customer-invoices[/{id}]`, `/supplier-invoices[/{id}]` | `InvoiceInput` | `Invoice` with lines and totals calculated by the server | `409 DUPLICATE_SUPPLIER_INVOICE` (AP), `409 VERSION_CONFLICT` |
| GET | `/supplier-invoices/duplicate-check` | `party_id`, `supplier_invoice_no`, `date?`, `total?`, `exclude_id?` | `DuplicateCheck { exact, similar[] }` | ASSUMPTION (A-13) |
| POST | `.../{id}/submit` | — | SUBMITTED with `approval_steps`; `credit_limit_exceeded` on customer invoices | `422 VALIDATION_ERROR` (`duplicate_reason` / `possible_duplicate`), `409 DUPLICATE_SUPPLIER_INVOICE`, `409 PERIOD_CLOSED`, `422 RATE_MISSING` |
| POST | `.../{id}/recall`, `.../{id}/cancel` | `{ reason? }` | `Invoice` | ASSUMPTION for recall |
| POST † | `.../{id}/approve` | `{ action, comment }` | `Invoice` | `403 SOD_VIOLATION`, `403 APPROVAL_LIMIT_EXCEEDED`, `403 FORBIDDEN` |
| POST † | `.../{id}/post` | — | OPEN, `number` INV-/BILL-YYYY-NNNNNN, journal | `409 ALREADY_POSTED`, `422 TAX_CODE_UNVERIFIED`, `409 PERIOD_CLOSED` |
| POST / DELETE | `.../{id}/attachments[/{attachmentId}]` | multipart `file` | `Invoice` | |

### Credit notes, receipts and supplier payments (SCR-10, SCR-12)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET / POST / PATCH | `/customer-credit-notes[/{id}]` | `{ invoice_id, date, reason, lines }` | `CreditNote` | `422 ALLOCATION_EXCEEDS_BALANCE` (more than outstanding) |
| POST | `/customer-credit-notes/{id}/submit`, `/cancel` | — | `CreditNote` | |
| POST † | `/customer-credit-notes/{id}/approve`, `/post` | `{ action, comment }` / — | `CreditNote`, `number` CN-YYYY-NNNNNN | `403 SOD_VIOLATION`, `409 ALREADY_POSTED` |
| GET | `/customer-receipts`, `/supplier-payments` | `status`, `party_id`, `date_from`, `date_to`, `search`, cursor | `Page<PartyPayment>` | Cashiers see their own and their accounts' |
| POST † | `/customer-receipts` | `PartyPaymentInput` + `post` | `PartyPayment` (`RV-YYYY-NNNNNN` when posted; `unapplied`) | `422 ALLOCATION_EXCEEDS_BALANCE` (`details[0].field` = `allocations.N.amount`, `value` = outstanding) |
| PATCH / POST | `/customer-receipts/{id}`, `/{id}/cancel` | `PartyPaymentInput` | `PartyPayment` | |
| POST † | `/customer-receipts/{id}/post`, `/{id}/allocate` | — / `{ allocations, date? }` | `PartyPayment` | `409 ALREADY_POSTED`, `422 ALLOCATION_EXCEEDS_BALANCE` |
| POST / PATCH | `/supplier-payments[/{id}]` | `PartyPaymentInput` (fully allocated) | DRAFT `PartyPayment` | `422 SUPPLIER_NOT_VERIFIED` (A-14) |
| POST | `/supplier-payments/{id}/submit`, `/cancel` | — | `PartyPayment` | `422 SUPPLIER_NOT_VERIFIED` (bank change pending) |
| POST † | `/supplier-payments/{id}/approve` | `{ action, comment }` | `PartyPayment` | `403 SOD_VIOLATION` |
| POST † | `/supplier-payments/{id}/release` | `{ bank_reference }` | PAID, `number` SPV-YYYY-NNNNNN, `pay_to` (masked) | `409 PAYMENT_NOT_APPROVED`, `409 ALREADY_RELEASED` (A-14), `403 SOD_VIOLATION` |

### Aging and tax codes (SCR-22)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/reports/ar-aging`, `/reports/ap-aging` | `as_of` | `AgingReport` (rows, totals, `control` agreement with 1200/2100) | ASSUMPTION: paths for RPT-07/RPT-08 |
| GET | `/tax-codes`, `/tax-codes/{id}` | `kind`, `active` | `Page<TaxCode>` / `TaxCode` with `rates[]`, `current_rate`, `verification` | Any signed-in user (forms need them) |
| POST / PATCH | `/tax-codes[/{id}]` | code data (+ first `rate`, `effective_from`) | `TaxCode` (UNVERIFIED) | `409 DUPLICATE_CODE` |
| POST | `/tax-codes/{id}/rates` | `{ rate, effective_from }` | `TaxCode`; previous rate ends the day before | `409 DUPLICATE_RECORD` (overlap) |
| POST | `/tax-codes/{id}/verify` | `{ note }` | `TaxCode` (VERIFIED) | `tax.approve`. ASSUMPTION |

`GET /approvals` now also returns `AR_INVOICE`, `AP_INVOICE`, `CREDIT_NOTE`, `SUPPLIER_PAYMENT` and `SUPPLIER_BANK` items.

## Endpoints added in Phase 5

Types: `lib/api/types/statements.ts`. Endpoint functions: `lib/api/endpoints/statements.ts`. Catalogue: `lib/reports/catalogue.ts`.

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/reports/{slug}` | `date_from`, `date_to` or `as_of`; `branch_id`, `department_id`, `compare` (`prior_period`, `prior_year`), `include_unposted`, `group` (`month`, `quarter`), `status` — as the report allows | `ReportDocument` | `403 FORBIDDEN` (report permission), `404 NOT_FOUND` (unknown or later-phase report), `422 VALIDATION_ERROR` (dates). ASSUMPTION (A-15) |
| POST | `/reports/{slug}/export` | `{ format, parameters }` | CSV: `{ status: COMPLETED, url }` built from the same document; PDF and Excel: `202 QUEUED` (D-P2-06) | `403 FORBIDDEN` (`rpt.export`) |
| GET | `/dashboard/kpis` | `date_from`, `date_to`, `branch_id` | `DashboardKpis` (null for figures the user may not see) | ASSUMPTION (A-16) |
| GET | `/dashboard/trend` | `date_to`, `branch_id` | `{ data: DashboardTrendPoint[12] }` | `403` without `rpt.income_statement` / `rpt.kpi` |
| GET | `/dashboard/cash`, `/dashboard/reconciliations`, `/dashboard/recent`, `/dashboard/pending`, `/dashboard/budget` | `date_to` (cash) | `{ data }` lists, `DashboardPending`, `DashboardBudgetUse` | `403` where the user has no access |

Slugs: `balance-sheet`, `income-statement`, `cash-flow`, `changes-in-equity`, `ratios`, `journal-entries`, `customer-balances`,
`supplier-balances`, `outstanding-invoices`, `outstanding-payables`, `cashbook`, `bankbook`, `bank-reconciliation`,
`revenue-by-period`, `expenses-by-category`, `expenses-by-department`, `expenses-by-branch`, `realised-fx`, `unrealised-fx`,
`tax-summary`, `subledger-reconciliation`, `reopened-period-postings`, `self-approval-exceptions`.

## Endpoints added in Phase 6

Types: `lib/api/types/assets.ts`, `lib/api/types/planning.ts`. Endpoint functions: `lib/api/endpoints/assets.ts`. Depreciation maths: `lib/money/depreciation.ts`. Import templates: `lib/imports/templates.ts`. Calls marked † send an `Idempotency-Key`.

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/asset-categories` | — | `Page<AssetCategory>` (accounts, method, life, convention) | A-17 |
| GET / POST / PATCH | `/fixed-assets[/{id}]` | `status`, `category_id`, `search`; `FixedAssetInput` (`funding`: `POST` posts Dr cost / Cr funding account, `ALREADY_POSTED` records an existing asset) | `FixedAsset` with derived `accumulated`, `net_book_value` | `422 VALIDATION_ERROR` ("Residual value must be less than cost"), `409` edit after depreciation |
| GET | `/fixed-assets/{id}/schedule` | — | `{ data: ScheduleRow[] }` (posted, brought forward, planned) | A-17 |
| POST | `/fixed-assets/{id}/activate` | — | `FixedAsset` | Drafts from supplier-invoice lines |
| POST † | `/fixed-assets/{id}/transfer` | `{ date, branch_id, department_id, location, custodian, reason }` | `FixedAsset`; reclassification journal when dimensions change | |
| POST | `/fixed-assets/{id}/dispose` | `{ date, proceeds, account_id, reason }` | DISPOSAL_PENDING | |
| POST † | `/fixed-assets/{id}/disposal/decision` | `{ action, comment }` | DISPOSED with `disposal.gain_loss`, journal | `403 SOD_VIOLATION` (requester) |
| GET / POST | `/depreciation-runs` | `{ period_id }` | DRAFT preview with lines and skipped assets | `409 ALREADY_POSTED` "Depreciation for March 2027 already posted", `409 DUPLICATE_RECORD` (run in progress) |
| POST † | `/depreciation-runs/{id}/approve`, `/post` | `{ action, comment }` / — | APPROVED / POSTED (`DR-YYYY-NNNNNN`, one summarised journal) | `403 SOD_VIOLATION`, `409 PERIOD_CLOSED` |
| GET / POST | `/budgets` | `fiscal_year_id`; `{ fiscal_year_id, name, reason, copy_from?, percent_change? }` | `Budget` versions | `409 DUPLICATE_RECORD` (a version already in preparation) |
| PUT | `/budgets/{id}/lines` | `{ lines: BudgetLineInput[] }` + `If-Match` | `Budget` | Department managers: own departments only (A-18) |
| POST / POST † | `/budgets/{id}/submit`, `/budgets/{id}/approve` | — / `{ action, comment }` | approving supersedes the previous approved version | `403 SOD_VIOLATION` |
| GET | `/budgets/use` | `date` | `{ data: BudgetUse[] }` | A-18 |
| GET / POST | `/fx-revaluations` | `{ period_id }` | DRAFT preview (lines, `not_revalued`) | `409 ALREADY_POSTED` "Revaluation for March 2027 already posted", `422 RATE_MISSING` |
| POST † | `/fx-revaluations/{id}/post` | — | POSTED with journal and reversal journal (first day of next period) | A-19 |
| GET / POST | `/inventory-events` | event with `source_event_id` | `{ event, duplicate }`; a repeated id returns the original (AT-INV-01) | needs `gl.journal.post` (assumption) |
| GET | `/inventory/valuations`, `/reports/inventory-reconciliation` | `date` | snapshots; `{ valuation_total, control_balance, difference }` | |
| GET / POST | `/imports` | `{ type, file_name, file_hash, rows, target_id? }` | `ImportBatch` VALIDATED or FAILED with `errors[]` (row, column, value, message) | `403` without the data-type permission |
| POST † | `/imports/{id}/commit` | — | COMMITTED with `created[]` | `422` for a failed batch, `409 ALREADY_POSTED` |
| POST | `/imports/{id}/rollback`, `/imports/opening-signoff`; GET `/imports/status` | — | rolled-back batch; `{ opening_signed_off }` | `409 ACCOUNT_IN_USE` when records are used |

`GET /reports/{slug}` now also serves `fixed-asset-register`, `depreciation-schedule` and `budget-vs-actual`. `GET /approvals` adds `DEPRECIATION_RUN`, `ASSET_DISPOSAL` and `BUDGET`. `GET /expenses/spending` now returns the approved budget and what remains.

## Shared shapes used by later phases

Defined now in `lib/api/types/common.ts` because Phase 1 components render them.

```ts
type DocumentStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "POSTED" | "REVERSED" | "CANCELLED";
type InvoiceStatus = DocumentStatus | "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CREDITED";
type ReconciliationStatus = "IN_PROGRESS" | "COMPLETED";
type VerificationStatus = "VERIFIED" | "UNVERIFIED";

interface ApprovalStep { step: number; role: string; approver_name?: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED"; acted_at?: IsoDateTime | null; comment?: string | null }
interface HistoryEvent { id: string; at: IsoDateTime; user_name: string; action: string; comment?: string | null }
interface Attachment   { id: string; file_name: string; content_type: string; size: number; uploaded_at: IsoDateTime; uploaded_by: string; url?: string }
```

## Permission codes

The catalogue the UI uses is in `lib/rbac/permissions.ts`. Codes named in the SRS are used as written
(e.g. `gl.journal.post`, `ar.invoice.create`, `cb.reconcile.complete`, `cls.period.reopen.approve`, `rpt.trial_balance`).
The rest are derived from the §4.3 matrix and need confirmation against the backend catalogue:

`roles.approve`, `org.view`, `org.approve`, `coa.sensitive.view`, `gl.journal.delete`, `gl.journal.export`,
`ar.invoice.view|edit|delete|submit|approve|post`, `ar.receipt.view`, `ar.credit_note.view|create|submit|approve|post`,
`ar.writeoff.create|approve`, `ap.supplier.view|manage|approve`, `ap.supplier.bank.view`,
`ap.invoice.view|edit|delete|submit|approve|post`, `ap.payment.view|submit|approve|release|reverse`, `cb.bank.unmask`,
`cb.cash.view|create|post`, `exp.view|create|edit|submit|approve|post`, `fa.view|create|edit|approve|post`,
`tax.view|create|approve`, `bud.view|create|edit|submit|approve`, `cls.period.view`, `cls.period.reopen.request`,
`rpt.export`, `imp.view|create|approve`, `cfg.view|manage|approve`, `inv.view`.

## Assumptions

| ID | Assumption | Why | Where |
|---|---|---|---|
| A-01 | `/auth/login` and `/auth/refresh` both return `SessionResponse` (token, user with effective `permissions`, companies with branches). | SRS §13.3 says "access token, user, companies" for login and "new access token" for refresh. After a page reload the UI has only the refresh cookie, so it needs the user again; a separate `GET /users/me` would also work. | `lib/api/types/auth.ts`, `lib/auth/session.ts` |
| A-02 | Two-step MFA: login without `otp` answers `401 MFA_REQUIRED`; the UI repeats the call with `otp`. A wrong code answers `401 INVALID_OTP`. | SRS §13.3 lists `(otp)` in the login body but no flow. | `components/auth/login-form.tsx` |
| A-03 | Wrong credentials answer `401 INVALID_CREDENTIALS`; a locked account answers `401 LOCKED` with `locked_until` in `details`. | SRS: "401, 423-style 401 LOCKED"; SCR-01 shows "Account locked until HH:MM". | `components/auth/login-form.tsx` |
| A-04 | The CSRF token for `/auth/refresh` is read from a `csrf_token` cookie and sent as `X-CSRF-Token`. | SRS says "CSRF token header" without the source. | `lib/api/client.ts` |
| A-05 | `GET` list endpoints exist for `/companies`, `/departments`, `/fiscal-years`, `/currencies`, `/dimensions`. | SRS §13.3 lists POST/PATCH for organisation resources; `/currencies` is named in §6.16 only. | `lib/api/endpoints/org.ts` |
| A-06 | `GET /exchange-rates/lookup?from&to&date` returns the rate for one date or `422 RATE_MISSING`. | The UI defaults the rate for the document date (FR-FX-006). | `lib/api/endpoints/org.ts` |
| A-07 | `/notifications` (list, read, read-all) and `/search` exist with the shapes above. | SRS §14.1 requires both in the header; §13.3 has no endpoint. | `lib/api/endpoints/org.ts` |
| A-08 | `GET /accounts` accepts `limit=200` and returns a flat list; the tree is built from `parent_id`. | SRS lists `tree=true` without a shape. | `lib/api/endpoints/accounts.ts` |
| A-09 | Analysis dimensions other than branch and department come from `GET /dimensions`; journal lines carry them as `dimensions: { [code]: value_id }`. | SCR-04 lists "dimensions" as a line column; no API shape. | `lib/money/journal.ts` |
| A-10 | Reject uses its own decision in the request the SRS defines for approval (`/approve` with `action`), unless the backend exposes `/reject`. Not called yet. | SRS §13.1 names `/reject`; §13.3 uses `/approve` with `action`. To settle before Phase 2. | `docs/SRS_MAPPING.md` item 5 |
| A-11 | Party status changes and statements are sub-resources: `POST /customers/{id}/status` (and `/suppliers/…`), `GET .../statement`. | SRS §13.3 lists only `GET, POST /customers` and `/suppliers`. | `lib/api/endpoints/arap.ts` |
| A-12 | Supplier bank-details changes are requested and decided through `/suppliers/{id}/bank-details[/decision]`. | BR-AP-005 requires approval; no endpoint is named. | `mocks/handlers/arap.ts` |
| A-13 | `GET /supplier-invoices/duplicate-check` answers the on-blur check; create/submit still return `409 DUPLICATE_SUPPLIER_INVOICE`. | SCR-11 asks for the check on blur; §13.3 returns the result only on create. | `components/arap/invoice-form.tsx` |
| A-14 | Error codes `ALREADY_RELEASED` and `SUPPLIER_NOT_VERIFIED` (both in `lib/api/errors.ts` with en/km messages). `PAYMENT_NOT_APPROVED` comes from AT-AP-02. | §13.1 has no code for a second release or an unverified supplier. | `lib/api/errors.ts` |
| A-15 | Catalogue reports are served by `GET /reports/{slug}` in one document shape; the backend may instead expose one endpoint per report with the same body. | SRS §13.3 lists `/reports/*` without shapes. | `lib/api/endpoints/statements.ts` |
| A-16 | The dashboard is split into `/dashboard/{widget}` calls. | SRS names `/api/v1/dashboard` only; SCR-02 asks for per-widget loading and retry. | `components/dashboard/widgets.tsx` |
| A-17 | Fixed-asset actions beyond create and runs are sub-resources: `/fixed-assets/{id}/schedule`, `/activate`, `/transfer`, `/dispose`, `/disposal/decision`, and `/asset-categories`. | SRS §13.3 lists `/fixed-assets` and `/depreciation-runs (+ /post)` only. | `lib/api/endpoints/assets.ts` |
| A-18 | Budget lines are saved with `PUT /budgets/{id}/lines`; budget use comes from `GET /budgets/use`. | §13.3 lists `/budgets (+ /submit, /approve)` only. | `lib/api/endpoints/assets.ts` |
| A-19 | FX revaluation covers foreign-currency cash and bank accounts, using the transaction rate of the period's last day as the closing rate; open receivables and payables are listed, not revalued. | BR-FX-004 leaves the selection to configuration; closing rates are not kept yet (D-11, D-12). | `mocks/handlers/fxrevaluation.ts` |
| A-20 | The import wizard reads CSV in the browser and sends mapped rows (`POST /imports`), then commits (`/imports/{id}/commit`) or rolls back. Excel files are for the backend. | §6.21 accepts .xlsx and .csv; the front end has no spreadsheet reader. | `components/imp/imports.tsx` |

## Mock backend behaviour (for demos and tests)

`mocks/http.ts` gives every handler: 150–600 ms latency, an optional "inject random 500 errors" toggle (user menu),
token and expiry checks, company scope, permission checks, the standard error body with a correlation ID, cursor
pagination, idempotency replay (same key → stored response; same key with a different body → `409 IDEMPOTENCY_KEY_REUSED`;
missing key → `400`), and `If-Match` version checks. Rules enforced so far: generic sign-in errors, lockout after
5 failed attempts for 15 minutes, MFA for OWNER / FINMGR / SYSADMIN, sensitive-account filtering, `RATE_MISSING`.
Balanced journals, closed periods, separation of duties, approval limits, duplicate supplier invoices and
over-allocation are added with their modules (Phases 2–4).
