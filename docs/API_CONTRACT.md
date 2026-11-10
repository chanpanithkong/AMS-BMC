# API contract (front end ↔ FastAPI)

What the web UI sends and expects, so the FastAPI team can check that both sides match.
Source: `docs/AMS-SRS-001` §13. Where the SRS gives no payload, the shape here is an **ASSUMPTION** (list at the end)
and is marked `// ASSUMPTION` in the code. TypeScript types live in `lib/api/types/`; endpoint functions in
`lib/api/endpoints/`; the mock implementation in `mocks/handlers/`.

This file covers the endpoints the UI calls **as of Phase 1**. Each later phase adds its resources here.

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
`SERVICE_UNAVAILABLE`, `LOCKED`, and (assumptions) `INVALID_CREDENTIALS`, `MFA_REQUIRED`, `INVALID_OTP`, `INVALID_TOKEN`.

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

`ExchangeRate.rate` is `to_currency` units per one `from_currency` unit, up to 8 decimals. With base USD the UI reads
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

## Mock backend behaviour (for demos and tests)

`mocks/http.ts` gives every handler: 150–600 ms latency, an optional "inject random 500 errors" toggle (user menu),
token and expiry checks, company scope, permission checks, the standard error body with a correlation ID, cursor
pagination, idempotency replay (same key → stored response; same key with a different body → `409 IDEMPOTENCY_KEY_REUSED`;
missing key → `400`), and `If-Match` version checks. Rules enforced so far: generic sign-in errors, lockout after
5 failed attempts for 15 minutes, MFA for OWNER / FINMGR / SYSADMIN, sensitive-account filtering, `RATE_MISSING`.
Balanced journals, closed periods, separation of duties, approval limits, duplicate supplier invoices and
over-allocation are added with their modules (Phases 2–4).
