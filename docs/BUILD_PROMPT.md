# Claude Code Prompt — Accounting Management System (AMS) Web UI in Next.js

> **How to use this file**
> 1. Create an empty folder, e.g. `ams-web/`, and open Claude Code in it.
> 2. Put your SRS in the folder as `docs/AMS-SRS-001.docx` (also export it as `docs/AMS-SRS-001.md` if you can; Claude Code reads Markdown more easily).
> 3. Save this file as `docs/BUILD_PROMPT.md`.
> 4. Paste the **Kickoff message** (bottom of this file) into Claude Code.
> 5. After each phase, review the result in the browser, then say: `Continue with Phase N`.

---

## 0. Role and goal

You are a senior front-end engineer building the **complete web user interface** of the **Accounting Management System (AMS)** described in `docs/AMS-SRS-001` (Software Requirements Specification v1.0, 27 October 2026). The SRS is the source of truth. When this prompt and the SRS differ, follow the SRS and record the difference in `docs/DECISIONS.md`.

The target users are Cambodian SMEs. The UI is **bilingual (English / Khmer)** and **multi-currency (USD, KHR and others)**, and it enforces strict accounting controls.

**Scope of this job: the front end only.** The backend is a separate **FastAPI** service at `/api/v1` (SRS §12, §13). It is not built here. You will:
- build every screen in SRS §14 (SCR-01 to SCR-27), plus the report pages in SRS §15;
- talk to the backend through a **typed API client** that follows the SRS §13 contract exactly;
- ship a **mock backend (MSW, Mock Service Worker)** with realistic seed data, so the whole app runs and can be demonstrated without FastAPI;
- connect to the real backend by changing one environment variable: `NEXT_PUBLIC_API_MODE=mock|live`.

Do **not** invent accounting logic that belongs on the server. The UI shows previews (totals, differences) for convenience only. The server's numbers are authoritative (SRS §13.5).

---

## 1. Technology stack (fixed by SRS §12.2)

| Concern | Use |
|---|---|
| Framework | **Next.js 15 (App Router)**, React 19, **TypeScript strict** |
| Styling / components | **Tailwind CSS v4** + **shadcn/ui** (Radix), lucide-react icons |
| Forms | **React Hook Form + Zod** (client validation helps the user; the server decides) |
| Tables | **TanStack Table v8**, server-side pagination (cursor), sorting, filtering, column visibility |
| Server state | **TanStack Query v5** |
| Charts | **Recharts** |
| i18n | **next-intl**, locales `en` and `km`, URL prefix `/[locale]/...` |
| Money | **decimal.js** — never use JS `number` for amounts; amounts are decimal **strings** on the wire |
| Dates | **date-fns** + `date-fns-tz`; business time zone `Asia/Phnom_Penh`; default display `DD/MM/YYYY` |
| Mock API | **MSW v2** (browser + node), `@faker-js/faker` with a fixed seed |
| Client state | Zustand, only for UI state (sidebar, selected company/branch) |
| Tests | **Vitest** + Testing Library (units/components), **Playwright** (E2E), **@axe-core/playwright** (accessibility) |
| Quality | ESLint, Prettier, `tsc --noEmit`; package manager **pnpm** |

Fonts: **Inter** for Latin text and **Noto Sans Khmer** for Khmer, via `next/font`. Use `font-variant-numeric: tabular-nums` on every amount.

---

## 2. Project structure

```
src/
  app/
    [locale]/
      (auth)/login, forgot-password, reset-password, mfa
      (app)/layout.tsx            # shell: sidebar + header + breadcrumbs
      (app)/dashboard
      (app)/accounting/{accounts, journals, journals/[id], general-ledger, trial-balance, periods}
      (app)/sales/{customers, customers/[id], invoices, invoices/[id], receipts, receipts/[id], credit-notes, aging}
      (app)/purchases/{suppliers, suppliers/[id], invoices, invoices/[id], payments, payments/[id], aging}
      (app)/cash-bank/{accounts, transactions, reconciliations, reconciliations/[id]}
      (app)/expenses, expenses/[id]
      (app)/fixed-assets, fixed-assets/[id], fixed-assets/depreciation-runs
      (app)/inventory               # only when the feature flag is on
      (app)/budgets, budgets/[id]
      (app)/reports, reports/[reportId]
      (app)/tax/codes
      (app)/fx/rates, fx/revaluations
      (app)/approvals
      (app)/audit-trail
      (app)/admin/{users, users/[id], roles, roles/[id]}
      (app)/settings/{company, branches, departments, fiscal-years, currencies, numbering, approval-rules, notifications, statement-mapping, templates, dimensions, backup-status}
      (app)/imports, imports/[id]
  components/
    ui/                          # shadcn primitives
    shell/                       # Sidebar, Header, CompanyBranchSwitcher, LanguageSwitch, NotificationsBell, UserMenu, Breadcrumbs, GlobalSearch
    data/                        # DataTable, FilterBar, StatusTabs, ColumnToggle, ExportMenu
    finance/                     # AmountInput, AmountText, CurrencySelect, RateInput, AccountPicker, DimensionPicker, PeriodPicker, DateRangePicker, TotalsPanel, JournalLineGrid, AllocationGrid
    workflow/                    # StatusBadge, ApprovalTimeline, ConfirmActionDialog, ReasonDialog, SoDIndicator, HistoryPanel
    feedback/                    # EmptyState, ErrorState (shows correlation ID), Skeletons, PageHeader
    files/                       # AttachmentPanel, FileDropzone, PdfPreview
  lib/
    api/                         # client.ts, errors.ts, idempotency.ts, endpoints/<module>.ts, types/<module>.ts
    auth/                        # session, token refresh, permission helpers
    rbac/                        # permission codes, role → menu map, <Can/> component, usePermission()
    money/                       # decimal helpers, formatting, amount-in-words (EN + KM)
    i18n/                        # config, error-code → message map
    format/                      # dates, numbers, negative-in-brackets preference
  mocks/
    handlers/<module>.ts, db/ (in-memory seeded store), seed.ts, browser.ts, server.ts
  messages/en.json, km.json
tests/ (unit), e2e/ (Playwright)
docs/ DECISIONS.md, SCREEN_MAP.md, API_CONTRACT.md
```

---

## 3. API contract (follow SRS §13 exactly)

Build `lib/api/client.ts` as a thin `fetch` wrapper that:

- uses base path `/api/v1` (configurable with `NEXT_PUBLIC_API_BASE_URL`);
- sends `Authorization: Bearer <access token>` (token kept **in memory only**, never in localStorage); refresh goes through `POST /auth/refresh` with the HttpOnly cookie and a CSRF header; on 401 `SESSION_EXPIRED` it refreshes once, then retries;
- sends `X-Company-Id` from the selected company and `Accept-Language` from the active locale;
- generates and sends **`Idempotency-Key`** (UUID v4) for: post, reverse, approve/reject, release payment, create receipt/payment, allocate, import commit, revaluation run, period close, year-end close, reconciliation complete. **Keep the same key when a request is retried** after a network failure, and create a new key only for a new user action;
- sends `If-Match: <version>` (or `version` in the body) when a draft is edited; on 409 `VERSION_CONFLICT`, show "This record was changed by someone else — reload" with a reload button;
- parses list responses `{ data, page: { next_cursor, limit, total? } }`;
- turns the standard error body `{ error: { code, message, details[], correlation_id } }` into a typed `ApiError`. Map every code in SRS §13.1 (e.g. `JOURNAL_UNBALANCED`, `PERIOD_CLOSED`, `ALREADY_POSTED`, `SOD_VIOLATION`, `APPROVAL_LIMIT_EXCEEDED`, `DUPLICATE_SUPPLIER_INVOICE`, `ALLOCATION_EXCEEDS_BALANCE`, `RATE_MISSING`, `TAX_CODE_UNVERIFIED`, `ACCOUNT_NOT_POSTABLE`, `DIFFERENCE_UNRESOLVED`, `RECONCILIATION_COMPLETED`, `IDEMPOTENCY_KEY_REUSED`, `RATE_LIMITED`, `INVALID_STATE_TRANSITION`, `UNMAPPED_ACCOUNTS`) to an English and a Khmer message. Show `details[].field` errors next to the matching form fields.

Write one typed endpoint module per resource in SRS §13.3: auth, users, roles, companies/branches/departments, fiscal-years, accounting-periods, accounts, journal-entries, customers, customer-invoices, customer-receipts, customer-credit-notes, suppliers, supplier-invoices, supplier-payments, bank-accounts, bank-statements, bank-reconciliations, cash-transactions, expenses, fixed-assets, depreciation-runs, exchange-rates, fx-revaluations, tax-codes, budgets, approvals, imports, reports/*, audit-logs, dashboard.

**State changes are action endpoints only** (`/submit`, `/approve`, `/reject`, `/post`, `/reverse`, `/release`, `/complete`, `/reopen`, `/soft-close`, `/close`, `/reopen-request`). The UI never PATCHes a `status` field.

Record every endpoint and TypeScript type in `docs/API_CONTRACT.md`, so the FastAPI team can check that the two sides match. Where the SRS leaves a payload unspecified, choose a sensible shape and mark it `// ASSUMPTION` in the code and in the doc.

---

## 4. Mock backend (MSW)

The mock must behave like the real server, so that it can be used to demonstrate the controls:

- Use an in-memory store seeded with a fixed seed: **1 company** ("Demo Trading Co., Ltd.", base currency **USD**, KHR as a transaction currency) with **3 branches** (Phnom Penh HQ, Siem Reap, Battambang) and 4 departments (Admin, Sales, Operations, Finance); fiscal year Jan–Dec 2027 with 12 periods (Jan–Feb closed, Mar soft-closed, the rest open).
- Seed the **Chart of Accounts from SRS Appendix C** (codes 1000–9999 with header, posting, control, contra and sensitive flags), with English and Khmer names.
- Seed about 40 customers and 30 suppliers (Khmer and English names, some with masked bank details, one supplier with unverified bank details); about 120 posted journals over 6 months; invoices, receipts, supplier invoices and payments in every status; 2 bank accounts (USD and KHR) with an imported statement and one reconciliation in progress; about 15 fixed assets; a budget for 2027; daily USD/KHR rates (an illustrative value around 4,100 — mark it as **illustrative**); tax codes marked *Verified* or *Unverified*, as in SRS V-01; and about 300 audit events.
- Seed **one demo user per role** in SRS §4.2 (SYSADMIN, OWNER, FINMGR, ACCT, APO, ARO, CASHIER, AUDITOR, DEPTMGR, READONLY), all with password `Demo@1234`. On the login page in mock mode, add a "Sign in as…" role picker for demos.
- Enforce, in the mock handlers: balanced journals (`JOURNAL_UNBALANCED`), header accounts (`ACCOUNT_NOT_POSTABLE`), closed periods (`PERIOD_CLOSED`), separation of duties (preparer ≠ approver → `SOD_VIOLATION`), approval limits (`APPROVAL_LIMIT_EXCEEDED`), duplicate supplier invoices, over-allocation, missing exchange rate, idempotency replay (same key → same response; same key with a different body → 409), and version conflicts. Posting assigns numbers such as `JV-2027-000312` and `INV-2027-000125`.
- Add realistic latency (150–600 ms) and a dev-only toggle that injects random 500 errors, to test error states.

---

## 5. Application shell and global behaviour (SRS §14.1–14.2, §14.5)

- **Layout:** collapsible left sidebar (icons only when collapsed); header with **Company and Branch selector**, global search (accounts, customers, suppliers and documents by number), **language switch EN / ខ្មែរ**, notifications bell with an unread count, and a user menu (profile, language, number-format preference, change password, MFA, sign out); breadcrumbs on every page.
- **Navigation:** the 15 menu groups of SRS §14.2, in that order. Visibility follows the **role-visibility matrix** in SRS §14.2 (● full, ○ limited or own scope, — hidden). Implement this as data (`lib/rbac/menu.ts`), not as scattered `if` statements.
- **Permissions:** use permission codes from the SRS (e.g. `gl.journal.post`, `ar.invoice.create`, `cb.reconcile.complete`, `cls.period.reopen.approve`, `rpt.trial_balance`). Provide a `<Can permission="…">` component and a `usePermission()` hook. **Hide** actions the user cannot do; where the reason helps the user (e.g. "You prepared this journal and cannot approve it"), **disable** the action and show a tooltip instead. Route guards redirect to a 403 page. Sensitive accounts (e.g. salaries, owner's drawings) are hidden for roles without access.
- **Look:** a professional business dashboard — neutral background, clear typography, amount columns **right-aligned with tabular figures**, a **currency code on every amount column**, and negative numbers shown as `(1,250.00)` or `-1,250.00` according to the user's preference. **StatusBadge** always shows text plus colour (never colour alone). Support a dark mode, but make light mode the default.
- **Status values:** Draft, Submitted, Approved, Rejected, Posted, Reversed, Cancelled; invoices also use Open, Partially Paid, Paid, Overdue (derived), Credited; reconciliations use In progress, Completed; periods use Open, Soft-closed, Closed, Reopened.
- **Critical actions** (post, reverse, approve, reject, release payment, write off, complete reconciliation, close or reopen a period, year-end close, change a tax or exchange-rate setting) all go through **`ConfirmActionDialog`**, which must:
  1. summarise the financial effect (company, period, date, debit and credit totals, accounts affected, amount **in words** in English or Khmer for payments);
  2. require a reason where the SRS asks for one (reverse, reject, reopen, write-off);
  3. require an "I confirm" checkbox above a configurable amount threshold;
  4. disable the button and show a spinner while the request runs;
  5. show the resulting number or status in a success toast; if the same action is clicked again, show "already posted" or "already released" rather than an error.
- **Unsaved changes:** warn before the user navigates away from a dirty form.
- **States on every page:** skeleton loading, a helpful **EmptyState** with a next action, **ErrorState** with a retry button and the `correlation_id`, and a read-only view of posted records with a POSTED badge.
- **Responsive design:** fully usable at 1280 px and 1024 px; at 390 px (mobile), the dashboard, approvals inbox and inquiry or detail pages must work (SRS NFR-USA-002).
- **Accessibility:** WCAG 2.2 AA — labels, focus order, full keyboard operation, errors linked to their fields with `aria-describedby`, visible focus rings.
- **Print:** `@media print` styles so that reports, vouchers and statements print on **A4** without cut-off content.

---

## 6. Reusable finance components (build these first and test them well)

- **AmountInput / AmountText:** decimal strings only; the number of decimals depends on the currency (USD 2, KHR 0, others from settings); thousands separators; paste-safe; never a float.
- **AccountPicker:** search by code or by English or Khmer name; shows type and normal balance; **hides header (non-posting) accounts**; respects sensitive-account rules; keyboard-first.
- **JournalLineGrid:** spreadsheet-like editing — Tab/Enter moves between cells, Ctrl+Enter adds a line, Ctrl+Delete removes a line. Columns: #, account, description, debit, credit, currency, rate, branch, department, other dimensions. Totals are always shown at the bottom with a **difference indicator** ("Debits and credits differ by 1.00" in red; "Balanced" in green). A trained accountant must be able to enter a 10-line journal with the keyboard alone in under 2 minutes (NFR-USA-010).
- **AllocationGrid:** lists open invoices with outstanding amounts; has an **Auto-allocate (oldest first)** button; shows the remaining unallocated amount; shows a realised FX preview when currencies differ; and blocks allocation above the receipt amount or above an invoice's outstanding amount.
- **PeriodPicker / DateRangePicker:** aware of fiscal periods; shows closed periods with a lock icon.
- **DataTable:** server-side cursor pagination, sorting, filters in the URL query string (so they can be shared), column visibility saved per user (localStorage, wrapped in try/catch), and row click → detail.
- **ApprovalTimeline, HistoryPanel, AttachmentPanel** (drag-and-drop, preview of images and PDFs), **SoDIndicator**, **ReportHeader** (company, report name, basis, period, generated at, generated by).

---

## 7. Screens — build every one (SRS §14.3–14.4)

For each screen, implement exactly the **components, table columns, filters, form fields, validation messages, actions, permissions and states** listed in the SRS. Short checklist:

| ID | Screen | Must include |
|---|---|---|
| SCR-01 | Login | Language switch, email/username, password with a show toggle, forgot password, **MFA step** (TOTP), generic error "Incorrect sign-in details", locked message "Account locked until HH:MM" |
| SCR-02 | Dashboard | Period and branch filters; KPI cards (revenue, expenses, net profit, cash, bank, AR, AP, overdue AR, payables due in the next 14 days); 12-month trend charts; budget-use bars; reconciliation status; pending approvals; recent transactions. Clicking a KPI opens a filtered list. Each widget has its own skeleton, error and retry. Show an "Includes pending" badge where it applies. Widgets depend on the role. |
| SCR-03 | Chart of Accounts | Switch between tree and table; account form in a drawer (code, English name, Khmer name, type, category, parent, normal balance, posting, control and module, sensitive, currency restriction, cash-flow class, statement mapping, effective dates); history tab; deactivate; delete only when unused; import and export |
| SCR-04 | Journal entries | Status tabs (Draft, Submitted, Approved, Posted, Reversed); form with JournalLineGrid, attachments and history; save draft, submit, recall, copy, cancel, print voucher, reverse |
| SCR-05 | Journal approval | Inbox and detail view; SoD indicator; approve, or reject with a required comment; delegate |
| SCR-06 | Posting confirmation | Modal as in §5; idempotent post |
| SCR-07 | GL inquiry | Choose several accounts; date or period range; dimensions; base or transaction currency; opening balance, lines, running balance and closing balance; drill-down to the journal or source document; export |
| SCR-08 | Trial Balance | Opening, period and closing debit and credit columns; include-zero option; hierarchy level; totals check ("Debits equal credits" in green, or a critical banner if not) |
| SCR-09 | Customer invoices | Customer picker with credit information; terms; currency and rate; lines (quantity, unit price, discount, tax code, revenue account, dimensions); totals panel with the base-currency equivalent; **PDF preview with a DRAFT watermark**; credit-limit and unverified-tax warnings; create credit note |
| SCR-10 | Customer receipt | AllocationGrid; unapplied-amount warning; print receipt voucher |
| SCR-11 | Supplier invoice | **Duplicate check when the supplier invoice number field loses focus**; possible-duplicate dialog that asks for a reason; asset flag on lines; attachment preview; budget availability panel; display of the approval route |
| SCR-12 | Supplier payment | Available balance; masked supplier bank details with verification status; release confirmation with the **amount in words**; bank reference on release |
| SCR-13 | Bank reconciliation | Header with statement balances; **two-pane matching** (statement lines on one side, book lines on the other) with suggested matches; auto-match; match and unmatch; create adjustment; summary panel (outstanding deposits, unpresented payments, difference); complete is blocked until the difference is explained; a completed reconciliation is locked |
| SCR-14 | Fixed assets | Register, asset form, depreciation schedule tab, history; transfer and dispose; depreciation run (preview → approve → post) |
| SCR-15 | Report viewer | Report catalogue by category; parameter panel; report body with groups that expand; validation banner (e.g. unmapped accounts); export to PDF, Excel and CSV; print; progress display for background jobs |
| SCR-16 | Users and roles | User form (profile, companies, branches, departments, roles, limits); **role editor as a permission matrix** (module × action); SoD conflict panel; sessions and activity tabs; "You cannot change your own permissions" |
| SCR-17 | Period closure | Fiscal year selector; periods with their status; **month-end checklist** (task, owner, status, evidence, automatic check result); blocking items; soft-close, close, request reopen (with reason), approve reopen (OWNER only), year-end close |
| SCR-18 | Audit trail | Filters; results table; detail drawer showing a **before/after diff**; integrity-check status banner; export (the export itself is logged) |
| SCR-19 | Settings | All the groups listed in §2 `settings/*`, each with change history and approval status |
| SCR-20 | Customer and supplier profiles | Tabs: details, contacts, bank details (masked), documents, statement, aging |
| SCR-21 | Expense form | Category; payment mode; allocation grid by percent or amount (must total 100% or the full amount); attachments; budget panel |
| SCR-22 | Tax codes | List and form; rate history timeline with effective dates; GL accounts; **verification status** |
| SCR-23 | Budgets | Grid of accounts × months with department and branch filters; version selector; import; approval status; budget-versus-actual view |
| SCR-24 | Exchange rates | Table by date and currency pair, with rate type and source; entry form with a permission check |
| SCR-25 | Import wizard | Choose type → download template → upload → map columns → validation preview with errors per row → commit (idempotent) → result and history. Types: COA, opening balances, customers, suppliers, bank statements, budgets |
| SCR-26 | Approvals inbox | All document types; filters; each item approved one at a time (**no bulk approve**) |
| SCR-27 | Cash and bank transactions | Forms for receipt, payment, transfer, deposit, withdrawal and bank charge; cashbook and bankbook views; a cashier sees only their own cash accounts |

**Reports (SRS §15.2, RPT-01 to RPT-31):** build one generic report viewer driven by a report registry (`id`, name EN/KM, category, parameters, columns, grouping, permission). Give full layouts to: Trial Balance, General Ledger, Balance Sheet, Income Statement (with comparative and budget columns), Cash Flow (indirect method), Statement of Changes in Equity, AR and AP Aging (buckets: current, 1–30, 31–60, 61–90, over 90), Customer and Supplier Balances, Cashbook, Bankbook, Bank Reconciliation, Tax Summary, Fixed Asset Register, Depreciation Schedule, Budget vs Actual, Journal Entry Report, Outstanding Invoices and Payables, Realised and Unrealised FX, Postings in Reopened Periods, Self-Approval Exceptions, and Subledger-to-GL Reconciliation. Every report shows the ReportHeader, uses posted data unless "Include unposted" is switched on (in which case a banner is shown), and drills down to the source.

Keep `docs/SCREEN_MAP.md` up to date: SCR id → route → main components → permissions → status (done / partial).

---

## 8. Localisation (SRS §7.10)

- Translate **100% of strings** in `messages/en.json` and `messages/km.json` — no hard-coded text in components. Add a script, `pnpm i18n:check`, that fails when a key is missing in either file.
- Use correct accounting terms in Khmer. Where you are unsure of a term, add `"// REVIEW"` next to the key in a separate file, `messages/km.review.md`, so a Khmer-speaking accountant can confirm it.
- Khmer text must render correctly (subscripts and vowels) in inputs, tables and print. Use Noto Sans Khmer and test with real Khmer strings in the seed data.
- Show every amount with its currency. KHR has 0 decimals by default. Dates are DD/MM/YYYY by default, and the user can change this.
- Write a function that converts amounts to words in **English and Khmer**, for payment and receipt vouchers.

---

## 9. Security in the browser

- Keep the access token in memory only. Never write tokens or personal data to localStorage.
- Never trust the client: always show the totals, numbers and statuses returned by the server.
- Mask bank account numbers (`•••• 4417`) except where the user has permission to see them.
- Prevent double-submission of every mutation (disable the button and send the same idempotency key on retry).
- Log out on inactivity after a configurable timeout, with a warning 60 seconds before.
- Escape all user content (React does this by default). Never use `dangerouslySetInnerHTML` with server data.

---

## 10. Testing and definition of done

- **Unit tests (Vitest):** decimal and money formatting, amount in words (EN/KM), JournalLineGrid totals and difference, AllocationGrid limits, permission and menu mapping for all 10 roles, mapping of API errors to messages.
- **E2E tests (Playwright, against MSW):**
  1. ACCT creates a 3-line journal → an unbalanced journal is blocked → it is balanced and submitted; FINMGR approves and posts; the TB still balances.
  2. ACCT tries to approve their own journal → SoD message.
  3. Posting into a closed period → `PERIOD_CLOSED` message.
  4. ARO creates an invoice → it is posted → a receipt is allocated across two invoices → the invoice status becomes Partially Paid or Paid.
  5. APO enters a duplicate supplier invoice number → blocked.
  6. A supplier payment is released twice → the second click shows "already released".
  7. A bank reconciliation is auto-matched → completion is blocked while there is a difference → completed after an adjustment.
  8. The language is switched to Khmer → the menu, a form and a report render in Khmer.
  9. CASHIER signs in → sees only the permitted menu items; going to `/admin/users` → 403 page.
- **Accessibility:** run axe on the login, dashboard, journal form, invoice form and report viewer pages — no serious or critical violations.
- **Done for each phase means:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm e2e` all pass; every screen in the phase works in **both languages** and at **1280 px and 390 px**; loading, empty and error states are present; `SCREEN_MAP.md` and `API_CONTRACT.md` are updated.

---

## 11. Build phases (follow the SRS §19 order; stop after each phase and report)

1. **Foundation:** scaffold the project, tooling, design tokens, fonts, i18n, the shell (sidebar, header, switchers, breadcrumbs), the API client, error mapping, MSW and seed data, auth (SCR-01 with MFA), RBAC and menu, and the reusable finance components with their unit tests.
2. **General Ledger:** SCR-03, 04, 05, 06, 07, 08, 17 (periods and checklist), 24 (exchange rates).
3. **Cash, bank and expenses:** SCR-27, 13, 21, plus statement import in SCR-25.
4. **Receivables and payables:** SCR-20, 09, 10, 11, 12, credit notes, aging, statements, and SCR-22 (tax codes).
5. **Reporting and dashboard:** SCR-15 with all reports, and SCR-02.
6. **Advanced:** SCR-14 (fixed assets and depreciation runs), SCR-23 (budgets), FX revaluation, the Inventory page (behind a feature flag), and the full SCR-25 import wizard.
7. **Administration and hardening:** SCR-16, 18, 19, 26; full accessibility and responsive pass; print styles; all E2E tests; a `README.md` that explains how to run the app in mock mode and in live mode, plus the Docker and env setup.

At the end of each phase, reply with: what was built, the routes to open, the demo logins to use, any assumptions (also added to `docs/DECISIONS.md`), and any SRS items that are still open (e.g. D-xx and V-xx decisions). Then wait for me to say "Continue".

---

## 12. Rules while working

- Read the relevant SRS section **before** building each screen, and quote its SCR, FR or BR IDs in code comments where it helps traceability.
- Do not remove or weaken a control described in the SRS to make the UI simpler.
- Do not claim legal or tax compliance anywhere in the UI. Tax codes and statutory items show their **Verified / Unverified** status, as the SRS requires (V-01 to V-09).
- Prefer small, composable components; avoid files longer than about 300 lines.
- If something in the SRS is ambiguous, choose the safest reasonable option, note it in `docs/DECISIONS.md`, and continue — do not stop to ask unless the choice cannot be undone.

---

## Kickoff message (paste this into Claude Code)

```
Read docs/BUILD_PROMPT.md completely, then skim docs/AMS-SRS-001 (focus on §4 roles and permissions, §12.2 stack, §13 API, §14 UI, §15 reports, §19 roadmap, Appendix C chart of accounts).
Then start Phase 1 (Foundation) exactly as described in BUILD_PROMPT.md §11.
Use a task list, run lint/typecheck/tests before you finish, and stop at the end of Phase 1 with the phase report.
```
