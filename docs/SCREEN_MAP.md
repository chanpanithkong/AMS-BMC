# Screen map

SCR id → route → main components → permissions → status. Routes are shown without the `/[locale]` prefix.
Status: **done**, **partial**, or the phase that delivers it. Until a screen is built, its route shows a
"not built yet — Phase N" placeholder (`app/[locale]/(app)/[...rest]/page.tsx`).

| SCR | Screen | Route | Main components | Permissions | Status |
|---|---|---|---|---|---|
| SCR-01 | Login | `/login`, `/forgot-password`, `/reset-password` | `LoginForm` (credentials + MFA step), `DemoLoginPicker`, `ForgotPasswordForm`, `ResetPasswordForm`, `LanguageSwitch` | Public | **done** |
| SCR-02 | Dashboard | `/dashboard` | `DashboardHome` (Phase 1 landing page: user, company, menu access, periods) | `dash.view` | partial — KPIs in Phase 5 |
| SCR-03 | Chart of Accounts | `/accounting/accounts` | — | `coa.*` | Phase 2 |
| SCR-04 | Journal entries | `/accounting/journals`, `/accounting/journals/[id]` | `JournalLineGrid` ready | `gl.journal.*` | Phase 2 |
| SCR-05 | Journal approval | `/approvals`, journal detail | `SoDIndicator`, `ApprovalTimeline` ready | `gl.journal.approve` | Phase 2 |
| SCR-06 | Posting confirmation | modal | `ConfirmActionDialog` ready | `gl.journal.post` | Phase 2 |
| SCR-07 | GL inquiry | `/accounting/general-ledger` | — | `rpt.general_ledger` | Phase 2 |
| SCR-08 | Trial Balance | `/accounting/trial-balance` | — | `rpt.trial_balance` | Phase 2 |
| SCR-09 | Customer invoices | `/sales/invoices`, `/sales/invoices/[id]` | `TotalsPanel`, `PdfPreview` ready | `ar.invoice.*` | Phase 4 |
| SCR-10 | Customer receipt | `/sales/receipts`, `/sales/receipts/[id]` | `AllocationGrid` ready | `ar.receipt.*` | Phase 4 |
| SCR-11 | Supplier invoice | `/purchases/invoices`, `/purchases/invoices/[id]` | `ReasonDialog`, `AttachmentPanel` ready | `ap.invoice.*` | Phase 4 |
| SCR-12 | Supplier payment | `/purchases/payments`, `/purchases/payments/[id]` | `ConfirmActionDialog` with amount in words ready | `ap.payment.*` | Phase 4 |
| SCR-13 | Bank reconciliation | `/cash-bank/reconciliations`, `/cash-bank/reconciliations/[id]` | — | `cb.reconcile*` | Phase 3 |
| SCR-14 | Fixed assets | `/fixed-assets`, `/fixed-assets/[id]`, `/fixed-assets/depreciation-runs` | — | `fa.*` | Phase 6 |
| SCR-15 | Report viewer | `/reports`, `/reports/[reportId]` | `ReportHeader`, `ExportMenu` ready | `rpt.*` | Phase 5 |
| SCR-16 | Users and roles | `/admin/users`, `/admin/users/[id]`, `/admin/roles`, `/admin/roles/[id]` | — | `users.manage`, `roles.manage` | Phase 7 |
| SCR-17 | Period closure | `/accounting/periods` | `PeriodPicker` ready | `cls.*` | Phase 2 |
| SCR-18 | Audit trail | `/audit-trail` | — | `aud.view`, `aud.export` | Phase 7 |
| SCR-19 | Settings | `/settings/{company, branches, departments, fiscal-years, currencies, numbering, approval-rules, notifications, statement-mapping, templates, dimensions, backup-status}` | — | `cfg.*`, `org.*` | Phase 7 |
| SCR-20 | Customer and supplier profiles | `/sales/customers`, `/sales/customers/[id]`, `/purchases/suppliers`, `/purchases/suppliers/[id]` | — | `ar.customer.*`, `ap.supplier.*` | Phase 4 |
| SCR-21 | Expense form | `/expenses`, `/expenses/[id]` | — | `exp.*` | Phase 3 |
| SCR-22 | Tax codes | `/tax/codes` | `StatusBadge` VERIFIED / UNVERIFIED ready | `tax.*` | Phase 4 |
| SCR-23 | Budgets | `/budgets`, `/budgets/[id]` | — | `bud.*` | Phase 6 |
| SCR-24 | Exchange rates | `/fx/rates` | `RateInput`, `CurrencySelect` ready | `fx.rate.view`, `fx.rate.manage` | Phase 2 |
| SCR-25 | Import wizard | `/imports`, `/imports/[id]` | `FileDropzone` ready | `imp.*` | Phase 3 (bank statements), Phase 6 (full) |
| SCR-26 | Approvals inbox | `/approvals` | — | `wfl.approval.view` | Phase 7 |
| SCR-27 | Cash and bank transactions | `/cash-bank/accounts`, `/cash-bank/transactions` | — | `cb.*` | Phase 3 |
| — | Credit notes, aging | `/sales/credit-notes`, `/sales/aging`, `/purchases/aging` | — | `ar.credit_note.*`, `rpt.ar_aging`, `rpt.ap_aging` | Phase 4 |
| — | FX revaluation | `/fx/revaluations` | — | `fx.revalue` | Phase 6 |
| — | Inventory (feature flag) | `/inventory` | — | `inv.view` | Phase 6 |

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
