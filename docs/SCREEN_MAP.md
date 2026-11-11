# Screen map

SCR id → route → main components → permissions → status. Routes are shown without the `/[locale]` prefix.
Status: **done**, **partial**, or the phase that delivers it. Until a screen is built, its route shows a
"not built yet — Phase N" placeholder (`app/[locale]/(app)/[...rest]/page.tsx`).

| SCR | Screen | Route | Main components | Permissions | Status |
|---|---|---|---|---|---|
| SCR-01 | Login | `/login`, `/forgot-password`, `/reset-password` | `LoginForm` (credentials + MFA step), `DemoLoginPicker`, `ForgotPasswordForm`, `ResetPasswordForm`, `LanguageSwitch` | Public | **done** |
| SCR-02 | Dashboard | `/dashboard` | `DashboardHome`, `DashboardWidgets` (period and branch filters, KPI cards with drill-down, 12-month trend chart with table view, cash and bank, reconciliation status, pending, budget use, recent transactions) | `dash.view`; widgets by permission | **done**; budget use waits for Phase 6 |
| SCR-03 | Chart of Accounts | `/accounting/accounts` (`?view=table`, `?account=<id>` or `new`) | `ChartOfAccountsPage`, `AccountForm`, `AccountActions`, `AccountHistory` | `coa.view`, `coa.create`, `coa.edit`, `coa.approve` | **done**; import through SCR-25 |
| SCR-04 | Journal entries | `/accounting/journals`, `/accounting/journals/new` (`?copy=<id>`), `/accounting/journals/[id]` | `JournalListPage`, `JournalPage`, `JournalEditor`, `JournalVoucher` | `gl.journal.view/create/edit/submit/reverse` | **done** |
| SCR-05 | Journal approval | `/approvals`, `/accounting/journals/[id]` | `ApprovalsPage`, `JournalDialogs` (approve, reject, delegate), `SoDIndicator`, `ApprovalTimeline` | `gl.journal.approve` | **done** |
| SCR-06 | Posting confirmation | dialog on the journal page | `JournalDialogs`, `ConfirmActionDialog` | `gl.journal.post` | **done** |
| SCR-07 | GL inquiry | `/accounting/general-ledger?accounts=…&from=…&to=…` | `GeneralLedgerPage` | `rpt.general_ledger` | **done**; PDF and Excel files come from the server |
| SCR-08 | Trial Balance | `/accounting/trial-balance` | `TrialBalancePage` | `rpt.trial_balance` | **done** |
| SCR-09 | Customer invoices | `/sales/invoices`, `/sales/invoices/new`, `/sales/invoices/[id]` | `InvoiceListPage`, `InvoiceForm`, `InvoicePage`, `InvoiceLinesEditor`, `CreditPanel`, `InvoiceDocument` (DRAFT watermark), `TotalsPanel` | `ar.invoice.*` | **done** |
| SCR-10 | Customer receipt | `/sales/receipts`, `/sales/receipts/new?party=`, `/sales/receipts/[id]` | `PaymentListPage`, `PaymentPage` (side AR), `AllocationGrid`, receipt voucher print | `ar.receipt.*` | **done** |
| SCR-11 | Supplier invoice | `/purchases/invoices`, `/purchases/invoices/new`, `/purchases/invoices/[id]` | `InvoiceForm` (duplicate check on blur, `ReasonDialog`, asset flag, budget and approval-route panels), `AttachmentPanel` with preview | `ap.invoice.*` | **done** |
| SCR-12 | Supplier payment | `/purchases/payments`, `/purchases/payments/new?party=`, `/purchases/payments/[id]` | `PaymentPage` (side AP), `PayToPanel` (masked, verification), release `ConfirmActionDialog` with amount in words and bank reference | `ap.payment.*` | **done** |
| SCR-13 | Bank reconciliation | `/cash-bank/reconciliations`, `/cash-bank/reconciliations/[id]` | `ReconciliationsPage`, `ReconciliationPage`, `AdjustDialog`, `CompleteDialog` | `cb.reconcile`, `cb.reconcile.complete`, `cb.reconcile.reopen` | **done** |
| SCR-14 | Fixed assets | `/fixed-assets`, `/fixed-assets/[id]` (or `new`), `/fixed-assets/depreciation-runs`, `/fixed-assets/depreciation-runs/[id]` | `AssetListPage`, `AssetPage` (form with schedule preview, schedule and history tabs, transfer, disposal and its approval), `DepreciationRunsPage`, `DepreciationRunPage` | `fa.*` | **done** |
| SCR-15 | Report viewer | `/reports`, `/reports/[slug]` (parameters in the URL) | `ReportCatalogue`, `ReportViewer`, `ReportBody` (expandable groups, drill-down, checks), `ReportHeader`, `ExportMenu`; catalogue in `lib/reports/catalogue.ts` | `rpt.*`, `rpt.export` | **done**; RPT-19, 20, 21 in Phase 6, RPT-23 in Phase 7 |
| SCR-16 | Users and roles | `/admin/users`, `/admin/users/[id]`, `/admin/roles`, `/admin/roles/[id]` | — | `users.manage`, `roles.manage` | Phase 7 |
| SCR-17 | Period closure | `/accounting/periods?period=<id>` | `PeriodsPage`, `PeriodPanel` (checklist, history) | `cls.period.view/manage`, `cls.period.reopen.request/approve`, `cls.year.close` | **done** |
| SCR-18 | Audit trail | `/audit-trail` | — | `aud.view`, `aud.export` | Phase 7 |
| SCR-19 | Settings | `/settings/{company, branches, departments, fiscal-years, currencies, numbering, approval-rules, notifications, statement-mapping, templates, dimensions, backup-status}` | — | `cfg.*`, `org.*` | Phase 7 |
| SCR-20 | Customer and supplier profiles | `/sales/customers`, `/sales/customers/[id]` (or `new`), `/purchases/suppliers`, `/purchases/suppliers/[id]` | `PartyListPage`, `PartyPage` with tabs: details and contacts, bank details (suppliers), documents, statement (printable), aging | `ar.customer.*`, `ap.supplier.*` | **done** |
| SCR-21 | Expense form | `/expenses`, `/expenses/new`, `/expenses/[id]` | `ExpenseListPage`, `ExpensePage`, `ExpenseForm`, `AllocationEditor` | `exp.view/create/submit/approve/post` | **done**; budget figures arrive with Phase 6 |
| SCR-22 | Tax codes | `/tax/codes`, `/tax/codes/[id]` (or `new`) | `TaxCodesPage`, `TaxCodePage` (rate history timeline, add rate, verification) | `tax.*` | **done** |
| SCR-23 | Budgets | `/budgets`, `/budgets/[id]` | `BudgetsPage` (version selector, accounts × months grid with spread, department filter, approval, budget use bars, import link); budget versus actual in the report viewer | `bud.*` | **done** |
| SCR-24 | Exchange rates | `/fx/rates` | `RatesPage`, `RateEntry` | `fx.rate.view`, `fx.rate.manage` | **done**; see DECISIONS D-P2-07 |
| SCR-25 | Import wizard | `/imports` (`?type=BUDGETS&target=<id>`), `/cash-bank/reconciliations/import` (bank statements) | `ImportsPage`, `ImportWizard` (type → template → file → columns → check with error report → import → result), history with rollback, opening sign-off | `imp.*` plus the data type's permission | **done** |
| SCR-26 | Approvals inbox | `/approvals` | `ApprovalsPage` | `wfl.approval.view` | partial: journals and expenses; other documents with their modules |
| SCR-27 | Cash and bank accounts and transactions | `/cash-bank/accounts`, `/cash-bank/accounts/[id]` (cashbook / bankbook), `/cash-bank/transactions`, `/cash-bank/transactions/new?type=…`, `/cash-bank/transactions/[id]` | `CashBankAccountsPage`, `AccountBookPage`, `CashTransactionsPage`, `CashTransactionPage`, `CashTransactionForm` | `cb.cash.view/create/post`, `cb.bank.view` | **done**; account set-up in Phase 7 |
| — | Credit notes, aging | `/sales/credit-notes`, `/sales/credit-notes/new?invoice=`, `/sales/credit-notes/[id]`, `/sales/aging`, `/purchases/aging` | `CreditNoteListPage`, `CreditNotePage`, `AgingPage` (reconciles to 1200/2100) | `ar.credit_note.*`, `rpt.ar_aging`, `rpt.ap_aging` | **done** |
| — | FX revaluation | `/fx/revaluations` | `RevaluationsPage` (preview, post with reversal, history) | `fx.revalue`, `fx.rate.view` | **done** |
| — | Inventory (feature flag) | `/inventory` | `InventoryPage` (valuation against 1300, snapshot, event intake, events) | `inv.view`; posting `gl.journal.post` | **done** |

## Shell and shared pages (Phase 1, done)

| Area | Route / file | Components |
|---|---|---|
| Application shell | `app/[locale]/(app)/layout.tsx` | `AppShell` (sign-in guard, role guard, idle sign-out), `Sidebar`, `Header`, `Breadcrumbs`, `CompanyBranchSwitcher`, `GlobalSearch`, `LanguageSwitch`, `NotificationsBell`, `UserMenu` |
| 403 page | `/403` | `ForbiddenPage` |
| Placeholder / not found | any other route | `ComingSoonPage` |
| Component gallery (developer page) | `/dev/components` | every reusable component with demo data |

## Reusable components (Phase 1, done)

| Folder | Components |
|---|---|
| `components/finance` | `AmountInput`, `AmountText`, `AccountPicker`, `CurrencySelect`, `RateInput`, `DimensionPicker`, `PeriodPicker`, `DateInput`, `DateRangePicker`, `TotalsPanel`, `ReportHeader`, `JournalLineGrid`, `AllocationGrid` |
| `components/data` | `DataTable` (with column chooser), `FilterBar`, `StatusTabs`, `ExportMenu`, `useUrlFilters` |
| `components/workflow` | `StatusBadge`, `ConfirmActionDialog`, `ReasonDialog`, `ApprovalTimeline`, `HistoryPanel`, `SoDIndicator`, `UnsavedChangesGuard` |
| `components/feedback` | `EmptyState`, `ErrorState` (correlation ID), `TableSkeleton`, `CardSkeleton`, `FormSkeleton`, `PageHeader` |
| `components/files` | `AttachmentPanel`, `FileDropzone`, `PdfPreview` |
