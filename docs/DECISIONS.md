# Decisions and assumptions

Records where the build differs from `docs/BUILD_PROMPT.md` or where `docs/AMS-SRS-001` leaves a choice open.
The SRS stays the source of truth. IDs `D-P<phase>-<nn>` are local to this file; `D-nn` and `V-nn` are SRS items.

## Phase 1 — Foundation

| ID | Topic | Decision | Why | Reversible? |
|---|---|---|---|---|
| D-P1-01 | Next.js version | Stay on the existing Next.js 16.4.6 project (React 19.3) instead of Next.js 15. | The SRS names no version (§12.2); the project was already scaffolded on 16. | Yes |
| D-P1-02 | Folder layout | `app/`, `components/`, `lib/`, `mocks/`, `messages/` at the repository root, not under `src/`. | Keeps the existing scaffold; `@/` resolves to the root. | Yes |
| D-P1-03 | Phase order | Keep the prompt's phase contents although SRS §19 puts users/roles, company setup and COA in Phase 1 and the audit viewer, approvals and opening-balance import in Phase 2. | The mock backend removes the dependencies behind the SRS order. | Yes |
| D-P1-04 | Menu home for Exchange rates, FX revaluation and Data import | Exchange rates and FX revaluation sit under **Accounting**; Data import sits under **System Settings**. They are shown by permission (`fx.rate.view`, `fx.revalue`, `imp.view`), not by the role matrix, because SRS §14.2 does not list them. | SRS §4.3 gives CASHIER, APO, ARO a view of rates and gives APO/ARO imports, although those groups are hidden or limited for them. | Yes |
| D-P1-05 | next-intl without its plugin | `NextIntlClientProvider` gets `locale` and `messages` from the `[locale]` layout; translations are used in Client Components only. Locale redirects are done in `proxy.ts`. | The app is client-rendered behind sign-in, and the project runs with `cacheComponents`; request-scoped server i18n would make every route dynamic. | Yes |
| D-P1-06 | Instant-navigation validation | Every layout and page exports `instant = false`. | Pages render on the client after the session is restored, so there is no server-rendered content to validate. | Yes |
| D-P1-07 | MFA route | The MFA (TOTP) step is a step inside `/login`, not a separate `/mfa` route. | The password must be re-sent with the code (see API assumption A-02); keeping it in one component avoids passing it between routes. It is cleared from memory after sign-in. | Yes |
| D-P1-08 | Mock "today" | In mock mode the business date is `NEXT_PUBLIC_MOCK_TODAY` (default 2027-04-05). | The prompt seeds fiscal year 2027 with Jan–Feb closed and Mar soft-closed, which implies a date in April 2027. | Yes |
| D-P1-09 | Mock refresh session | The mock keeps a session marker (a user id, not a token) in `sessionStorage` so that a reload restores the session. | A service worker cannot set an HttpOnly cookie. Live mode uses the real HttpOnly cookie; the access token is in memory only in both modes. | n/a (mock only) |
| D-P1-10 | Mock data resets | The in-memory mock database is rebuilt from the seed on every full page load. | Simple and deterministic for demos and tests. | Yes |
| D-P1-11 | Seed scope | Phase 1 seeds company, branches, departments, fiscal year, chart of accounts, currencies, rates, users, one dimension and notifications. Customers, suppliers, journals, invoices, bank data, assets, budgets and audit events are seeded in the phase that builds their handlers. `@faker-js/faker` is installed for that. | Seed data without handlers cannot be shown or tested. | Yes |
| D-P1-12 | Fiscal periods | 12 monthly periods are seeded, as the prompt says; SRS D-04 proposes 12 + period 13. | Follows the prompt; period 13 is an open SRS decision. | Yes |
| D-P1-13 | MFA for demo users | OWNER, FINMGR and SYSADMIN demo users require a code (SRS D-17). The demo code is shown on the MFA step in mock mode. | Demonstrates the MFA step. | Yes |
| D-P1-14 | Colours | Status text colours and muted text were darkened from the shadcn defaults. | axe found contrast below 4.5:1 on tinted badges (WCAG 2.2 AA). | Yes |
| D-P1-15 | Single-item limited groups | When a role sees exactly one item of a menu group (e.g. CASHIER → Receipts), the group label links straight to that item. | Avoids an expand step for one link. | Yes |
| D-P1-16 | Unsaved-changes warning | Covers reload, tab close and in-app links. The browser Back button is not intercepted. | The App Router has no supported navigation-blocking API. | Yes |
| D-P1-17 | Developer gallery | `/dev/components` shows every reusable component with demo data. Its headings are English only. | It is a developer page, not product UI. Remove or gate it before production. | Yes |
| D-P1-18 | Date entry | `DateInput` is a text field in the user's date format, not the native date picker. | Native pickers follow the browser locale, not the user's preference (NFR-LOC-004). | Yes |
| D-P1-19 | Profile pages | Profile, change password and MFA set-up link to placeholder pages. Number format, date format and theme work now but are not saved to the server. | SRS §13.3 has no profile endpoint; SCR-16 is in Phase 7. | Yes |

## Phase 2 — General Ledger

| ID | Topic | Decision | Why | Reversible? |
|---|---|---|---|---|
| D-P2-01 | Reject endpoint | Approve and reject both use `POST /journal-entries/{id}/approve` with `{ action: "approve" or "reject", comment }`, as SRS §13.3 shows. No separate `/reject` (settles SRS_MAPPING item 5). | §13.3 is the more specific of the two places. | Yes |
| D-P2-02 | Approval route and limits | Up to 10,000.00 (base): one step by FINMGR. Above: FINMGR then OWNER. A user with `gl.journal.approve` and a high enough limit may take the FINMGR step (SRS §4.2 lets ACCT approve others' entries within a limit). Demo limits: OWNER none, FINMGR 50,000, ACCT 5,000, DEPTMGR 2,000. | SRS D-09 leaves rules and limits open. | Yes |
| D-P2-03 | Chart of accounts filtering | The chart is loaded in one request (up to 200 accounts) and filtered in the browser, so the tree keeps its parents. | A small list; a server-side tree query (`tree=true`) has no shape in the SRS. | Yes |
| D-P2-04 | Manual journals on control accounts | Refused with `ACCOUNT_NOT_POSTABLE` (`issue: control_account`) unless the user holds `coa.control.override` (no demo role has it). | BR-COA-002; the SRS gives no error code of its own. | Yes |
| D-P2-05 | Balance check on submit | The form shows the difference while typing but sends an unbalanced journal to the server, which answers `JOURNAL_UNBALANCED` with the difference (AT-GL-01). Missing dates, description and closed periods are stopped in the form. | Shows the server control; avoids a second rule set in the browser. | Yes |
| D-P2-06 | Exports | The mock produces CSV. PDF and Excel answer `202 QUEUED` and the UI says the file will follow, because those files are made by the backend (WeasyPrint, openpyxl, SRS §12.2). | The front end cannot produce the server's documents. Printing uses the A4 print styles. | n/a (mock only) |
| D-P2-07 | **Exchange-rate precision (decided 10/11/2026: 12 decimals)** | Rates are stored as base units per one transaction unit with **12 decimals**, not the 8 that SRS BR-FX-005 proposes. With 8, "4,105 KHR per USD" was stored as 0.00024361 and read back as 4,104.92, and the SRS's own example (KHR 4,100,000 at 4,100) valued at 999.99 instead of 1,000.00. With 12 both are exact to the cent. One constant, `RATE_DECIMALS` in `lib/money/decimal.ts`. | Chosen by the project owner. **The backend must store and accept 12 decimals** (e.g. `numeric(24,12)`), and the SRS (§6.16, BR-FX-005, §11.4.11) should be updated to match. | Yes (one constant), but the backend must agree |
| D-P2-08 | Journal voucher print | Printed from the journal page on A4 (browser print), with a DRAFT watermark before posting and three signature blocks. A5 vouchers and the COPY mark on reprints (SRS §15.4) are not done. | No `print` route group yet (SRS_MAPPING item 7). | Yes |
| D-P2-09 | Reversal of system journals | Reverse is offered only on manual and adjusting journals. System and opening journals are corrected through their source document. | SRS §6.5: system journals have "No manual edit". | Yes |
| D-P2-10 | Approvals inbox | `/approvals` (SCR-26) is built now with journals only, because SCR-05 needs an inbox. Other document types join in Phases 3 and 4. | SCR-05 is Phase 2. | Yes |
| D-P2-11 | Month-end checklist | Automatic checks: approved journals not posted, journals awaiting approval, depreciation posted, suspense balance, trial balance. Bank and subledger checks say "Not available yet" and do not block. Manual items: accruals, FX, tax, and the review sign-off (blocking). | The other modules do not exist yet. | Yes |
| D-P2-12 | Period transitions | Open, then Soft-closed, then Closed, in month order (an earlier period must be closed first). Soft-closed back to Open is allowed (`/open`, ASSUMPTION). Closed to Reopened needs a request with a reason (FINMGR) and approval by someone else with `cls.period.reopen.approve` (OWNER). Year-end close needs all periods closed. | BR-CLS-002, BR-CLS-003. | Yes |
| D-P2-13 | Drafts after a failed submit | When submitting a new journal fails, the draft is already saved; the form stays open with the error, and further saves update the same draft. | Keeps the error visible; avoids duplicate drafts. | Yes |

## Phase 3 — Cash, Bank and Expenses

| ID | Topic | Decision | Why | Reversible? |
|---|---|---|---|---|
| D-P3-01 | Cash transaction workflow | Draft → Submitted → Posted (or Cancelled). A cashier creates and submits; a user with `cb.cash.post` (Accountant, Finance Manager) posts. No separate approval step. | SRS §4.3 gives the cashier "C" only; WF-07 says payments above the cashier limit need approval. Posting by an accountant is that check. | Yes |
| D-P3-02 | Counter-account lines | Receipts, payments and charges may not use control accounts (receivables, payables, bank) or cash accounts on their lines. Money between own accounts is a transfer. | Keeps subledgers and transfers clean (BR-COA-002, BR-CB-003). | Yes |
| D-P3-03 | Cross-currency transfers | The user enters the amount sent and the amount received; the base-currency difference posts to Realised FX gain (7300) or loss (8310) in the same journal. No transfer-clearing account. | One balanced document (BR-CB-003); a clearing account adds a step the SRS does not require for same-day transfers. | Yes |
| D-P3-04 | Negative cash | Posting may not take a CASH account below zero (`422 INSUFFICIENT_BALANCE`, ASSUMPTION: the SRS names no code). Bank accounts may go negative. | BR-CB-004 covers cash and petty cash only. | Yes |
| D-P3-05 | Reconciliation difference | Difference = statement closing + outstanding deposits − unpresented payments − book balance. Statement lines with no book entry (fees, interest) are listed separately and must be recorded as adjustments, or the difference explained, before completion. | Matches AT-CB-01 ("adjusted book" vs statement) and the prompt's "completed after an adjustment". | Yes |
| D-P3-06 | Reconciliation adjustments | An adjustment is posted from an unmatched statement line as an ADJUSTING journal and matched at once. It is dated the statement line date by default, so soft-closed periods need `gl.journal.adjust` (the Accountant cannot; the Finance Manager can). | FR-CB-010; consistent with BR-CLS-001. | Yes |
| D-P3-07 | Who completes a reconciliation | Only `cb.reconcile.complete` (Finance Manager). The completer is not required to differ from the preparer. A remaining difference can be completed with an explanation, recorded as approved by the completer. | SRS §4.4 "completion by reviewer"; BR-CB-002. | Yes |
| D-P3-08 | Matching | Auto-match pairs one statement line with one book line of the same amount within ±3 days, reference first. Manual matching allows one-to-many and many-to-one when the totals are equal. | FR-CB-009; the window is "configurable" in the SRS and fixed at 3 days here. | Yes |
| D-P3-09 | Statement import | CSV only in the mock (Excel is converted by the backend). Duplicates are lines with the same date, amount, reference and description as one already imported for the account, or earlier in the same file; they and error rows are skipped. The column mapping is saved per bank account when a file is uploaded. A "sample April statement" download exists in mock mode only. | FR-CB-008, AT-CB-03. | n/a (mock only for the sample) |
| D-P3-10 | Statement import route | The wizard lives at `/cash-bank/reconciliations/import`, so it follows the Bank Reconciliation menu permissions. The full import wizard (other file types) is SCR-25 in Phase 6. | Keeps the route guard simple. | Yes |
| D-P3-11 | Expense approval route | Step 1 by the department manager of every allocated department (or the Finance Manager/Owner); step 2 by the Finance Manager above 2,000.00 base. Preparer may not approve or post (BR-SEC-002). | FR-EXP-006 "by amount, department and category"; values illustrative (D-09). | Yes |
| D-P3-12 | Expense payment modes | Paid now → credit the chosen cash or bank account; Not yet paid → credit Accrued liabilities (2150); Employee claim → credit Employee claims payable (2160). Unpaid and claim expenses are settled with "Pay now", which posts a payment voucher that clears the liability (AT-EXP-01). Settling through Accounts Payable arrives with Phase 4. | BR-EXP-001. | Yes |
| D-P3-13 | Attachment rule | Travel always needs an attachment; other categories above 200.00. Submitting without one gives `422 ATTACHMENT_REQUIRED` (from AT-EXP-03; not in the §13.1 list). | FR-EXP-007; thresholds illustrative. | Yes |
| D-P3-14 | Budget panel | Shows year-to-date spending on the category's account and department from posted journals. Budget and remaining amount arrive with the Budgets module (Phase 6). | FR-EXP-011 depends on BUD. | Yes |
| D-P3-15 | Cash and bank account maintenance | Accounts are listed with balances, masked numbers and minimum-balance alerts; creating and editing them is part of System Settings (Phase 7). | FR-CB-001/002 maintenance belongs with settings. | Yes |
| D-P3-16 | Vouchers | Payment, receipt and transfer vouchers print on A4 with the amount in words in the active language and three signature blocks. | SRS §15.4; A5 is still open (SRS_MAPPING item 7). | Yes |

## Phase 4 — Receivables, Payables and Tax

| ID | Topic | Decision | Why | Reversible? |
|---|---|---|---|---|
| D-P4-01 | Customer invoice workflow | Draft → Submitted → Approved → Posted (Open) → Partially Paid → Paid; Cancelled from Draft, Rejected or Approved; Credited when credit notes clear it. Overdue is derived from the due date, not stored. The AR Officer prepares, submits and posts; an Accountant or Finance Manager approves. | BR-AR-001; §4.3 gives ARO post but not approve, ACCT approve. | Yes |
| D-P4-02 | Credit limit | Submitting an invoice that takes the customer over its limit adds a second approval step for the Finance Manager (override); the invoice form warns before submission. | BR-AR-004 asks for override approval; who approves is not stated. | Yes |
| D-P4-03 | Credit notes | Raised against one posted invoice; lines start as a copy and post to 4900 Sales returns by default; tax at the invoice's rates; approved by the Finance Manager or Owner, never the preparer; total ≤ the invoice's outstanding. | BR-AR-005, BR-TAX-001. Write-offs (FR-AR write-off) are not built in Phase 4. | Yes |
| D-P4-04 | Receipts | `POST /customer-receipts` with `post: true` records and posts in one step (SRS §13.3); drafts are allowed. Overpayment is held in 2300 Customer advances and can be applied later (`/allocate`). | BR-AR-006. | Yes |
| D-P4-05 | Realised FX on settlement | Allocations clear AR/AP at each invoice's own rate; cash at the settlement rate; the difference goes to 7300 or 8310. Customer balances therefore always equal the control account (AT-AR-05). | BR-FX-003. | Yes |
| D-P4-06 | Supplier invoice duplicates | The supplier's number is compared ignoring case, spaces, punctuation and leading zeros ("inv 001" = "INV-001"). An exact match blocks save and submit; the same supplier, date and amount under another number asks for a reason. Checked on blur and again by the server. | BR-AP-001. Punctuation is ignored as well as spaces (assumption) so that AT-AP-01 holds. | Yes |
| D-P4-07 | Supplier invoice approval | Step 1 by an Accountant, or by the department manager when every line is in their own department; step 2 by the Finance Manager above 5,000.00 USD. Posting by ACCT/FINMGR. | BR-AP-003; amounts illustrative (D-09). | Yes |
| D-P4-08 | Supplier payments | Draft → Submitted → Approved (Finance Manager/Owner) → Paid on release (Finance Manager) with a bank reference; the preparer can neither approve nor release. Payments are fully allocated (no supplier advances in Phase 4). A second release with a new key answers `409 ALREADY_RELEASED`, shown as "already completed"; the same key replays the first answer. | BR-AP-004, AT-AP-02, AT-AP-04. `ALREADY_RELEASED` is an assumed code. | Yes |
| D-P4-09 | Supplier status and bank details | New suppliers are Draft until verified (`ap.supplier.approve`); Blocked suppliers cannot be invoiced or paid. A bank-details change is held as pending until another user approves it; payments to that supplier are refused meanwhile (`422 SUPPLIER_NOT_VERIFIED`, assumed code). Account numbers are masked without `ap.supplier.bank.view`. | BR-AP-004, BR-AP-005, BR-SEC-004. | Yes |
| D-P4-10 | Tax calculation | Per line, half-up to the currency's minor unit: exclusive tax added on top of the discounted amount, inclusive tax extracted (110 at 10 % → 10). The rate is taken from the code's history on the document date and stored on the line at posting. | AT-TAX-02, BR-TAX-001, D-18. | Yes |
| D-P4-11 | Tax verification | Every code carries Verified/Unverified. Posting with an unverified code is blocked (`TAX_CODE_UNVERIFIED`); entry shows a warning. A new rate, method, kind or account sets the code back to Unverified; an Owner (`tax.approve`) records the verification with a note. | V-01, BR-TAX-002, AT-TAX-03. Re-verification on change is an assumption. | Yes |
| D-P4-12 | Opening balances | The AR and AP control balances of the opening journal are broken down into "balance brought forward" documents (OB-AR-…, OB-AP-…) that point at the opening journal and post nothing new. | Needed for aging, statements and AT-AR-05 from day one. | Yes |
| D-P4-13 | Aging | Buckets current, 1–30, 31–60, 61–90, over 90 by days past due; outstanding is rebuilt as at the chosen date from settlements dated on or before it; the report shows the agreement with control account 1200 or 2100. Unapplied receipts (2300) are outside AR aging. | SRS §15.3; configurable buckets still open (SRS_MAPPING item 8). | Yes |
| D-P4-14 | Invoice PDF | The invoice preview and print are an HTML A4 layout with a DRAFT watermark until posted; a server PDF can replace it. Wording is illustrative and marked as not reviewed for tax compliance. | V-02 open; prompt: do not claim tax compliance. | Yes |
| D-P4-15 | New-document pages | After a new invoice, receipt, payment, credit note or party is created, its `/new` form resets itself, because Next keeps visited pages mounted and would otherwise reuse the saved draft. | Found by the scenario 4 test. | — |

## Phase 5 — Reporting and Dashboard

| ID | Topic | Decision | Why | Reversible? |
|---|---|---|---|---|
| D-P5-01 | One report document | Every catalogue report returns one shape (`ReportDocument`: columns, rows with parent groups, checks, notes). The viewer, print and the CSV export all render it, so the figures are the same everywhere. | FR-RPT-016, AT-RPT-03. | Yes |
| D-P5-02 | Statement mapping | Until the configurable mapping (SCR-19, FR-CFG-009) exists, accounts map to statement lines by type and code range (current assets 1000–1499, non-current 1500–1999, current liabilities below 2500, and so on). Any account with a balance that no line takes is listed as a failed check. | BR-RPT-003; illustrative chart (V-04). | Yes |
| D-P5-03 | Opening journal | The opening-balance journal counts as balances brought forward, never as a movement, in the income statement, cash flow and equity statement, even when dated inside the range. | Otherwise a range starting on 1 January shows go-live balances as cash flow. | Yes |
| D-P5-04 | Sensitive accounts on statements | Users without `coa.sensitive.view` see sensitive accounts folded into one "Restricted accounts (total only)" line, so statements still add up. | FR-RBAC-005 with BR-RPT-003; the SRS does not say how hidden accounts appear on statements. | Yes |
| D-P5-05 | Include unposted | Offered on the balance sheet and income statement only; it adds submitted and approved journals and shows the "Includes unposted transactions" banner. | FR-RPT-017, BR-RPT-001. | Yes |
| D-P5-06 | Comparatives | Prior period (same length immediately before; for the balance sheet, the end of the previous month) or same period last year, with a change column. Budget comparatives come with budgets in Phase 6. | FR-RPT-015 (P). | Yes |
| D-P5-07 | Cash flow | Indirect method: net profit, add back the movement on accumulated depreciation, then working-capital accounts; investing 1510/1520; financing 2500, 3100, 3200, 3300. Any other balance-sheet account is shown as "unclassified" under operating. A check compares the net change with the cash accounts. | D-15, RPT-05. | Yes |
| D-P5-08 | Tax summary | Built from the tax stored on posted documents and compared with the movements of 2200 and 1410; differences are listed, not hidden. The seeded cash-sale journals post tax without documents, so the demo shows that difference. | RPT-18 "differences listed". | Yes |
| D-P5-09 | Reports waiting for other phases | Fixed asset register, depreciation schedule and budget versus actual show "Available in Phase 6"; the audit trail report "Phase 7". RPT-01, 02, 07, 08 open their existing screens. | Data arrives with those modules. | — |
| D-P5-10 | Dashboard widgets | One call per widget (`/dashboard/kpis`, `/trend`, `/cash`, `/reconciliations`, `/recent`, `/pending`, `/budget`) so each has its own skeleton, error and retry. Profit figures need `rpt.income_statement` or `rpt.kpi`; cash `cb.cash.view` (cashiers see their own cash only); bank and reconciliations `cb.bank.view`; AR/AP the invoice view permissions. | SCR-02 states; FR-DASH-001. | Yes |
| D-P5-11 | Pending versus posted | KPIs use posted data only. Approved-but-unposted journals, expenses, invoices and payments to release are counted in a separate "Pending" widget with an "Includes pending" badge. | FR-DASH-009, AT-DASH-02. | Yes |
| D-P5-12 | Branch filter on the dashboard | The branch filter applies to revenue, expenses, profit and the trend; balances (cash, bank, AR, AP) are company-wide. | Control accounts are not kept per branch in the demo data. | Yes |
| D-P5-13 | Charts | Recharts, with a "Show table" switch that lists the same figures as exact decimals; chart numbers are for display only. | WCAG 2.2 AA; money stays decimal. | Yes |

## Phase 6 — Fixed Assets, Budgets, FX Revaluation, Inventory and Imports

| ID | Topic | Decision | Why | Reversible? |
|---|---|---|---|---|
| D-P6-01 | Asset register drives depreciation | The seeded monthly depreciation journals are replaced by depreciation runs built from a five-asset go-live register; account 1590's opening balance is the register's accumulated depreciation at 31 December 2026. Register and ledger therefore agree (FR-FA-012). | A register that does not reconcile to 1510/1520/1590 would fail RPT-19 and RPT-31. | Yes |
| D-P6-02 | Depreciation | Straight-line by default, declining balance optional; cents rounded half-up and the last month absorbs the rounding; starts the month after the asset goes into service unless the category says otherwise. | BR-FA-001, D-14. | Yes |
| D-P6-03 | Depreciation runs | One run per period: preview (DRAFT) → approval by a Finance Manager who did not prepare it → posting of one summarised journal (expense by department and branch, credit accumulated depreciation). Assets already posted for the period are skipped; a second run for a fully posted period answers "Depreciation for March 2027 already posted". Runs post as adjusting entries, so the Finance Manager can post into a soft-closed month. | FR-FA-005, BR-FA-002. | Yes |
| D-P6-04 | Asset acquisition | Supplier-invoice lines marked as assets create draft assets when the invoice posts (cost already in the ledger); manual assets either post Dr cost / Cr a chosen account or record an asset already in the ledger, with depreciation brought forward allowed only for assets in service before go-live. | FR-FA-003, FR-AP-005. | Yes |
| D-P6-05 | Disposal | Requested by an accountant, approved and posted by another user; gain or loss = proceeds − net book value from posted depreciation. Disposed assets stop depreciating and are read-only. | FR-FA-007, BR-FA-003. Catch-up depreciation to the disposal month is not automatic (run it first). | Yes |
| D-P6-06 | Edit before depreciation | An asset's terms can be edited only until its first posted depreciation; afterwards changes go through transfer, disposal or (later) a change-in-estimate approval. | SCR-14 "edit (before depreciation)"; FR-FA-010 is Partial. | Yes |
| D-P6-07 | Budget versions | One approved version per fiscal year; approving another supersedes it (still viewable). A new version is blank or copied from another with a percentage change. Approved and superseded versions are locked. | BR-BUD-002, FR-BUD-005. | Yes |
| D-P6-08 | Budget scope and approval | Department managers see and edit only their own departments' lines and can submit; the Owner or Finance Manager approves, never the preparer or submitter. | FR-BUD-002, FR-BUD-004. | Yes |
| D-P6-09 | Budget use and alerts | Use = posted expenses of a department ÷ its approved annual expense budget. Department managers and Finance Managers are notified once at 80 % and once at 100 % (checked after each posting and on approval). Actuals never include unposted documents. | FR-BUD-009, BR-BUD-001, AT-BUD-03. | Yes |
| D-P6-10 | Spending panels | Expense and supplier-invoice forms show the approved budget and what remains; it is a warning only (D-13 still open). | FR-EXP-011, FR-BUD-008. | Yes |
| D-P6-11 | FX revaluation scope | Foreign-currency cash and bank accounts are revalued at period end; the account's currency amount is unchanged and only its base value moves (to 7400/8410). A reversal is posted on the first day of the next period. Open receivables and payables are listed but not revalued yet. | BR-FX-004; AR/AP revaluation would need subledger revaluation to keep AT-AR-05 (D-12). | Yes |
| D-P6-12 | Inventory module | Behind the inventory feature flag (on for the browser tests). Events post illustrative perpetual entries (receipt Dr 1300 / Cr 2150; issue and write-off Dr 5100 / Cr 1300; return Dr 2150 / Cr 1300); a repeated source event id returns the original posting. The supplied valuation is reconciled to 1300 and the difference listed. | §6.11, AT-INV-01, AT-INV-02; accounts to be confirmed (V-04). | Yes |
| D-P6-13 | Imports | Two phases: every row is validated and previewed, then the batch commits in one step or not at all. Financial imports create drafts; one unbalanced journal rejects the file. Master-data batches can be rolled back while unused. An opening-balance import sets "Opening balances not signed off" until a Finance Manager signs off; a posted opening journal only raises a warning. | BR-IMP-001, AT-IMP-01, AT-IMP-02. | Yes |
| D-P6-14 | Import files | The browser reads CSV (UTF-8, up to 20 MB and 50,000 rows) and sends the mapped rows; Excel is for the backend. Templates are CSV with a BOM so Excel keeps Khmer text. | No spreadsheet library in the front end (A-20). | Yes |

## API assumptions

Listed in `docs/API_CONTRACT.md` under "Assumptions" (A-01 to A-20). Each is marked `// ASSUMPTION` in the code.

## Open SRS items that affect the UI

| Item | Effect on the UI | Current behaviour |
|---|---|---|
| D-04 Fiscal year | Period pickers, period 13 | 12 periods |
| D-09 Roles, permissions, limits | `lib/rbac/default-roles.ts`, mock users | §4.3 matrix as proposed |
| D-10 Reduced-SoD mode | `SoDIndicator` has a `reducedMode` state | Strict by default |
| D-13 Budget control (warn or block) | Budget panels on expenses and supplier invoices | Approved budget and remaining amount shown as a warning; blocking not built |
| D-17 MFA policy | MFA step for OWNER, FINMGR, SYSADMIN | As proposed |
| D-18 Rounding | Preview totals use half-up | As proposed; server is authoritative |
| V-01 Tax codes | Verified / Unverified on every code; unverified codes block posting | Demo codes are illustrative; one is left Unverified |
| V-02 Invoice content and numbering | Invoice preview/print layout, INV-/BILL-/RV-/SPV-/CN- numbers | Illustrative layout, not reviewed for compliance |
| V-04 Chart of accounts | Appendix C is illustrative | Seeded as an example only |
| V-10 Exchange-rate source | Seeded rates are labelled illustrative | ~4,100 KHR/USD, not real rates |

## Differences from the SRS still to settle

From `docs/SRS_MAPPING.md` §2: items 3 (six reports without a full layout), 5 (`/reject` vs `/approve` with `action`),
7 (A5 vouchers, COPY mark, signature blocks, `print` route group) and 8 (configurable aging buckets) are not
decided yet. They matter from Phase 2 (item 5) and Phase 3–5 (the others).
