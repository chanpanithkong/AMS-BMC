SOFTWARE REQUIREMENTS SPECIFICATION
Accounting Management System
Prepared for the Accounting Management System Development Project

| Document title | Accounting Management System - Software Requirements Specification |
| Document version | 1.0 |
| Document status | Draft for Review |
| Prepared for | Accounting Management System Development Project |
| Prepared by | Business Analysis and System Design Team |
| Date | 27 October 2026 |

This document is a draft for review and approval. Assumptions, proposed targets, illustrative values and items requiring verification against current official Cambodian sources are labelled throughout. No legal, tax or regulatory compliance is claimed, and the document does not describe implemented or tested software.

# Document Control and Version History

| Item | Detail |
| Document title | Accounting Management System - Software Requirements Specification |
| Document identifier | AMS-SRS-001 |
| Document version | 1.0 |
| Document status | Draft for Review — not approved |
| Prepared for | Accounting Management System Development Project |
| Prepared by | Business Analysis and System Design Team |
| Date | 27 October 2026 |
| Classification | Confidential — Project Use |

Version history

| Version | Date | Author | Description |
| 1.0 | 27 October 2026 | Business Analysis and System Design Team | First complete draft for stakeholder, accounting-professional and development-team review |

Version 1.0 is a draft. It becomes the approved baseline only after the approvals below are recorded, including confirmation of the accounting and tax items in Section 20.4 by a qualified Cambodian accountant or tax professional.
Approval (pending)

| Role | Name | Decision | Signature | Date |
| Business Owner (Sponsor) |  |  |  |  |
| Finance Manager |  |  |  |  |
| Qualified Accountant / Tax Adviser (accounting and tax items) |  |  |  |  |
| System Administrator / IT |  |  |  |  |
| Project Manager |  |  |  |  |
| Development Lead |  |  |  |  |

Deliverables map

| Deliverable | Location in this document |
| 1. Complete SRS | Whole document |
| 2. Functional requirements catalogue | Section 6 (by module) and Appendix A |
| 3. Non-functional requirements catalogue | Section 7 and Appendix B |
| 4. Business rules catalogue | Section 8 |
| 5. Use-case catalogue | Section 10 |
| 6. Business workflow catalogue | Section 9 |
| 7. Proposed database schema and ER diagram | Section 11 |
| 8. High-level system architecture diagram | Section 12 |
| 9. API endpoint catalogue | Section 13 |
| 10. User interface and navigation specification | Section 14 |
| 11. Financial reporting specification | Section 15 |
| 12. Testing plan with test cases | Section 17 |
| 13. Requirements traceability matrix | Section 21 |
| 14. Phased implementation roadmap | Section 19 |
| 15. Risk register | Section 20.1 |
| 16. Unresolved business and accounting decisions | Section 20.5 |

Statement categories used in this document

| Category | Label | Meaning |
| Confirmed requirement | C | Scope item stated in the project brief (the requirement exists); its detailed behaviour is still subject to review |
| Proposed requirement | P | Added by the analysis team to make the system complete or safe; requires stakeholder acceptance |
| Assumption | A-nn | Provisional fact assumed for design; must be confirmed (Section 20.2) |
| Recommendation | Recommended | Advice on technology or practice; may be changed by the development team with justification |
| Decision requiring approval | D-nn | Open decision with proposed default, alternatives and impact (Section 20.5) |
| Professional verification | V-nn | Accounting, tax or legal matter to be confirmed by a qualified Cambodian accountant, tax professional or legal adviser (Section 20.4) |
| Illustrative | Illustrative | Example values or journal entries only; not universal accounting treatments, actual rates or business data |
| Proposed target | Proposed target | Quality target not yet agreed or measured |


# 1. Executive Summary
Small and medium-sized enterprises (SMEs) in Cambodia frequently keep accounts in spreadsheets or in tools that do not enforce double-entry rules, approvals or period controls, and that handle USD and KHR inconsistently. The Accounting Management System (AMS) is a web application that integrates the General Ledger with receivables, payables, cash and bank, expenses, fixed assets, tax configuration, budgets, multi-currency, period-end closing, financial reporting and an audit trail.
Core design principles
The General Ledger is the single source of financial truth. Every financial document (invoice, receipt, payment, expense, depreciation, revaluation) posts a balanced journal through one posting service; subledgers reconcile to GL control accounts.
Integrity before convenience. Posted entries are immutable; corrections use reversals or adjustments; posting is atomic and idempotent; amounts use exact decimal arithmetic; periods are locked after closing.
Controls are built in. Role-based permissions, branch and account restrictions, value-based approvals and separation of duties are enforced by the backend.
Configurable, not hard-coded, for Cambodian requirements. Tax codes and rates, document requirements, retention periods and statutory reports are configuration items that must be verified by qualified professionals (Section 20.4). This document makes no claim of legal or accounting-framework compliance.
Bilingual and multi-currency. English and Khmer interface and documents; USD, KHR and other currencies with a configurable base (functional) currency per company.
Scope at a glance. 22 functional modules with 278 uniquely identified requirements (73 with Given-When-Then acceptance tests, the rest with planned tests); 96 non-functional requirements; 64 business rules; 16 business workflows with illustrative journal entries; 16 use cases; a PostgreSQL design with representative DDL; a modular-monolith architecture on Next.js, FastAPI and PostgreSQL; an API catalogue; 27 screen specifications; 31 financial and supporting reports; a test plan with 40 financial-integrity and security test cases and 20 overall acceptance criteria; a seven-phase roadmap with an MVP definition; and a risk register and decision log.
Proposed MVP (Section 19.8): authentication and RBAC, company/branch and period setup, Chart of Accounts, General Ledger with approval, posting and reversal, cash and bank with reconciliation, expenses, receivables and payables in a single base currency with KHR as a transaction currency, core financial statements and exports, audit trail. Fixed assets, budgets, full revaluation, inventory integration and advanced tax reporting follow in later phases.
Key items needing confirmation before development include the accounting framework and basis (V-04, D-02), base currency per company (D-03), tax codes and invoice requirements (V-01, V-02), record retention (V-03), deployment model (D-01) and approval thresholds (D-09).

# 2. Introduction

## 2.1 Purpose
This SRS defines what the AMS must do and the qualities it must have, in enough detail for a development team to design, implement, test and maintain it, and for business owners and accountants to confirm that it meets their needs. It describes required behaviour; it does not describe implemented or tested software.

## 2.2 Intended Audience

| Audience | Use of this document |
| Business owners and finance managers | Confirm scope, controls, priorities and decisions |
| Accountants and tax advisers | Validate accounting treatments, configuration items and reports; complete verification items |
| Software developers and architects | Implement requirements, rules, services and APIs |
| Database designers | Implement schema and integrity constraints (Section 11) |
| UI/UX designers | Design screens and flows (Section 14) |
| Testers | Derive and execute tests (Sections 17–18) |
| Project manager | Plan phases, dependencies and risks (Sections 19–20) |
| Auditors | Understand controls and audit evidence (Section 16) |


## 2.3 Product Scope
The AMS covers: authentication and user management; role-based access control; company and organisation management; Chart of Accounts; General Ledger; accounts receivable; accounts payable; cash and bank management; income and expense management; invoicing and financial documents; inventory accounting integration (optional); fixed assets; tax configuration; budgets; financial reporting; foreign currency; period-end and year-end closing; audit trail and internal controls; dashboard; notifications and approval workflows; data import and export; system configuration.
Out of scope for the first release: payroll calculation (salaries are recorded as accounting entries only); full inventory or warehouse management; point of sale; manufacturing costing; consolidation of group financial statements and intercompany eliminations; electronic filing with tax authorities; e-invoicing integration (pending V-09); direct bank API integration (statement import by file only); single sign-on (designed for, not delivered).

## 2.4 Definitions and Conventions
Base currency (functional currency): the currency in which a company keeps its books; configurable per company (not assumed to be USD).
Transaction currency: the currency of a document. Reporting currency: the currency in which a report is presented (base currency by default; translated presentation is a future enhancement).
Posting date (accounting date): the date that determines the accounting period. Document date: the date on the source document.
Subledger: detailed records (customers, suppliers, bank, assets) whose totals reconcile to GL control accounts.
Requirement IDs: FR-[MODULE]-nnn; NFR-[CAT]-nnn; business rules BR-[AREA]-nnn; workflows WF-nn; use cases UC-nn; screens SCR-nn; reports RPT-nn; test cases TC-nnn; acceptance tests AT-[MODULE]-nn (planned tests numbered 1nn); overall acceptance criteria AC-nn; business objectives BO-nn; risks RK-nn; assumptions A-nn; verification items V-nn; decisions D-nn; dependencies DP-nn.
Module codes: AUTH, RBAC, ORG, COA, GL, AR, AP, CB, EXP, DOC, INV, FA, TAX, BUD, RPT, FX, CLS, AUD, DASH, WFL, IMP, CFG.
Priorities: Must Have, Should Have, Could Have.
Monetary examples are illustrative and use USD and KHR; exchange rates and tax percentages in examples are placeholders, not current Cambodian rates.

## 2.5 References

| Ref | Source | Use |
| R1 | ISO/IEC/IEEE 29148:2018 | Requirements structure |
| R2 | OWASP ASVS 4.x and OWASP Top 10 | Security reference (no certification claimed) |
| R3 | W3C WCAG 2.2 | Proposed accessibility target |
| R4 | Unicode Standard — Khmer block | Khmer text |
| R5 | The accounting framework applicable to each organisation, as determined by its qualified accountant (V-04) | Accounting treatments to be validated |
| R6 | Current Cambodian tax, accounting, record-keeping, invoicing and data-protection requirements | To be identified and confirmed (Section 20.4) |


# 3. Business Objectives and Scope

## 3.1 Business Objectives

| ID | Objective | Indicative measure (to be agreed) |
| BO-01 | Financial accuracy and consistency | 100 % of posted journals balanced; subledgers reconcile to control accounts with zero unexplained difference |
| BO-02 | Transparency, accountability and auditability | Every state change of financial records attributable to a user with timestamp and before/after values |
| BO-03 | Strong internal financial controls | Approval and separation-of-duties rules enforced by the backend; no self-approval where prohibited |
| BO-04 | Timely financial reporting and decision support | Core statements available on demand for any open or closed period |
| BO-05 | Cash-flow monitoring | Daily cash and bank balances, upcoming payables and overdue receivables visible |
| BO-06 | Effective receivables and payables management | Aging, statements, allocation and reminders in place |
| BO-07 | Support for applicable accounting and tax requirements | Configurable tax and reporting verified by professionals before go-live; no hard-coded legal assumptions |
| BO-08 | Operational efficiency | Automatic journals from subledgers; imports; recurring entries; month-end checklist |
| BO-09 | Local fit | English and Khmer; USD and KHR; local date and number formats |
| BO-10 | Growth | More users, branches, companies and modules without redesign |


## 3.2 Module Scope and Release Classification

| # | Module | Code | Classification | Phase | MVP |
| 1 | Authentication and User Management | AUTH | Must | 1 | Yes |
| 2 | Role-Based Access Control | RBAC | Must | 1 | Yes |
| 3 | Company and Organisation Management | ORG | Must | 1 | Yes |
| 4 | Chart of Accounts | COA | Must | 1 | Yes |
| 5 | General Ledger | GL | Must | 2 | Yes |
| 6 | Accounts Receivable | AR | Must | 4 | Yes |
| 7 | Accounts Payable | AP | Must | 4 | Yes |
| 8 | Cash and Bank Management | CB | Must | 3 | Yes |
| 9 | Income and Expense Management | EXP | Must | 3 | Yes |
| 10 | Invoicing and Financial Documents | DOC | Must | 3–4 | Yes |
| 11 | Inventory Accounting Integration | INV | Could — optional | 6+ | No |
| 12 | Fixed Asset Management | FA | Should | 6 | No |
| 13 | Tax Management | TAX | Must (basic tax codes); Should (tax reports) | 4 / 6 | Basic |
| 14 | Budget Management | BUD | Should | 6 | No |
| 15 | Financial Reporting | RPT | Must | 2 / 5 | Core |
| 16 | Foreign Currency Management | FX | Must (transaction currency, rates); Should (revaluation) | 4 / 6 | Basic |
| 17 | Period-End and Year-End Closing | CLS | Must | 2 / 6 | Period lock |
| 18 | Audit Trail and Internal Controls | AUD | Must | 2 | Yes |
| 19 | Dashboard and Financial Analytics | DASH | Should | 5 | Basic |
| 20 | Notifications and Approval Workflows | WFL | Must (approvals); Should (reminders) | 2 / 5 | Approvals |
| 21 | Data Import and Export | IMP | Must (COA, opening balances, bank statements, exports) | 1–5 | Yes |
| 22 | System Configuration | CFG | Must | 1 | Yes |


## 3.3 Single-Company with Branches vs Multi-Company

| Aspect | Single company with multiple branches | Multi-company |
| Legal entities | One legal entity | Several legal entities, each with its own books |
| Chart of Accounts | One COA; branch is a dimension on journal lines | One COA per company (may be copied from a template) |
| Trial balance | One trial balance; can be filtered by branch | Separate trial balance per company; no automatic combination |
| Base currency, fiscal year, tax registration | One set | Per company |
| Document numbering | Scoped by company and optionally branch | Always scoped by company |
| Intercompany | Not applicable | Out of scope in release 1 (manual journals in each company) |
| Data isolation | Branch-level restrictions on users | Company-level isolation plus branch restrictions |

Proposed default (D-01): the data model is multi-company capable (company_id on every financial record); a typical SME deployment configures one company with branches. Consolidated reporting across companies is a future enhancement.

# 4. Stakeholders and User Roles

## 4.1 Stakeholders

| Stakeholder | Interest |
| Business Owner | Reliable figures, control over cash and approvals, compliance support |
| Finance Manager | Efficient closing, accurate reporting, control environment |
| Accounting staff | Fast, error-resistant data entry and reconciliation |
| Department and branch managers | Budget visibility, approval of departmental spending |
| External auditor / accountant | Complete audit trail, reproducible reports |
| Tax adviser | Correct tax configuration and summaries |
| IT / System Administrator | Secure, maintainable, recoverable system |
| Development team | Clear, testable requirements |


## 4.2 User Roles

| Code | Role | Main responsibilities | Key restrictions |
| SYSADMIN | System Administrator | Users, roles, technical settings, backups, integrations | No posting, approval or payment rights by default; cannot grant permissions to own account |
| OWNER | Business Owner | Oversight, high-value approvals, period reopening approval, all reports | Not involved in routine entry by default |
| FINMGR | Finance Manager | Approve and post journals, approve payments within limit, close periods, configure accounting settings | Cannot approve own entries |
| ACCT | Accountant | Prepare journals, adjustments, reconciliations, fixed assets, tax and reports; post where granted | Approval only for others’ entries within limit |
| APO | Accounts Payable Officer | Suppliers, supplier invoices, payment proposals | Cannot approve or release own payments |
| ARO | Accounts Receivable Officer | Customers, invoices, receipts, allocations, reminders | Write-offs and credit notes need approval |
| CASHIER | Cashier | Cash receipts and payments, petty cash, deposits | Own cash accounts; limits; no GL journals |
| AUDITOR | Auditor | Read-only access to transactions, reports and audit logs for granted companies | No create, edit, approve or post |
| DEPTMGR | Department Manager | Budgets and expense approval for own department; departmental reports | Own department only |
| READONLY | Read-only User | View permitted reports and records | No changes |


## 4.3 Role–Permission Matrix (proposed default)
Legend: V view · C create · E edit (draft) · D delete (draft only) · S submit · A approve · P post · R reverse · X export · M manage · — none · (o) own records · (d) own department · (l) within value limit.

| Area | SYSADMIN | OWNER | FINMGR | ACCT | APO | ARO | CASHIER | AUDITOR | DEPTMGR | READONLY |
| Dashboard | V (tech) | V | V | V | V (AP) | V (AR) | V (cash) | V | V (d) | V |
| Users and roles | V C E M | V A | V | — | — | — | — | V | — | — |
| Company, branches, periods | V E (tech) | V A | V C E M | V | — | — | — | V | — | — |
| Chart of Accounts | — | V A | V C E A | V C E | V | V | V | V | V | V |
| Journal entries | — | V A | V C E S A P R X | V C E D S P (l) X | — | — | — | V X | V (d) | V |
| Customers, invoices, receipts | — | V | V A P | V C E A P | V | V C E D S P (l) | C (receipts) | V | V (d) | V |
| Credit notes, write-offs | — | V A | V A P | V C S | — | C S | — | V | — | — |
| Suppliers, supplier invoices | — | V | V A P | V C E A P | V C E D S | — | — | V | A (d, l) | V |
| Supplier payments | — | V A (l) | V A P (l) | V C S | V C S | — | C (cash, (l)) | V | — | — |
| Cash and bank, reconciliation | — | V | V A P | V C E P | V | V | V C (o) | V | — | V |
| Expenses | — | V A | V A P | V C E P | V C | — | C (l) | V | V C A (d, l) | V |
| Fixed assets | — | V A | V A P | V C E P | — | — | — | V | V (d) | V |
| Tax configuration | V (tech) | V A | V C E | V C | — | — | — | V | — | — |
| Budgets | — | V A | V C E A | V C E | — | — | — | V | V C S (d) | V (d) |
| Exchange rates | — | V | V C E | V C (if delegated) | V | V | V | V | — | V |
| Period close and reopen | — | A (reopen) | V M (close) S (reopen request) | V (checklist) | — | — | — | V | — | — |
| Financial reports | V (tech) | V X | V X | V X | V (AP) X | V (AR) X | V (cash) | V X | V (d) | V |
| Imports | V (tech) | — | V A | V C | V C (suppliers) | V C (customers) | — | — | — | — |
| Audit trail | V X | V X | V | V (own areas) | — | — | — | V X | — | — |
| Settings | V E (tech) | V A | V E (accounting) | V | — | — | — | V | — | — |

Final permissions and limits require approval [D-09]. Account-level restrictions (e.g., payroll or owner-equity accounts hidden from some roles) are configured per role (FR-RBAC-005).

## 4.4 Separation of Duties

| Activity | Prepare | Approve | Post / release | Rule |
| Manual journal | ACCT | FINMGR (≠ preparer) | FINMGR or ACCT with post permission (≠ preparer when SoD strict) | BR-SEC-002 |
| Supplier invoice | APO | DEPTMGR (budget owner) and/or FINMGR by amount | ACCT/FINMGR | BR-AP-003 |
| Supplier payment | APO | FINMGR / OWNER by amount (≠ preparer, ≠ supplier-record editor where configured) | Cashier or bank release by authorised user | BR-AP-004 |
| Credit note / write-off | ARO | FINMGR / OWNER by amount | ACCT/FINMGR | BR-AR-005 |
| Bank reconciliation | ACCT | FINMGR review | Completion by reviewer | BR-CB-002 |
| Period reopen | FINMGR request | OWNER | System on approval | BR-CLS-003 |
| Supplier bank-detail change | APO | FINMGR | — | BR-AP-005 |

For very small organisations, a reduced-SoD mode (D-10) allows one user to prepare and post, but every self-approved or self-posted item is flagged and listed in the Self-Approval Exceptions report (RPT-30) for owner review.

# 5. Business Process Overview

## 5.1 System Context
Figure 1. System Context

## 5.2 Process Map
Figure 2. Process Map

## 5.3 Accounting Basis

| Basis | Description | Effect in AMS |
| Accrual (proposed default) | Revenue recognised when earned and expenses when incurred, regardless of cash movement | Invoices and supplier bills post to AR/AP and revenue/expense on posting date; receipts and payments clear AR/AP |
| Cash | Revenue and expenses recognised when cash is received or paid | Not supported as the books’ basis in release 1; a cash-basis view of selected reports (receipts and payments) may be produced from cash and bank transactions |

The accounting basis, fiscal year and period rules must be configured and confirmed before production posting (BR-CFG-001, D-02, V-04).

# 6. Functional Requirements

## 6.0 Structure, Conventions and Summary
Each module subsection has two parts. (1) Module profile — business purpose, actors, preconditions, main workflow, alternative and exception workflows, validation rules, business rules, expected results, and links to use cases, database entities, API groups, screens and acceptance criteria. These elements apply to every requirement of the module unless a requirement states otherwise, which avoids repeating identical preconditions and workflows for each requirement. (2) Requirements table — for each requirement: ID, name, description including the expected result, priority, source (C = confirmed scope from the project brief; P = proposed by the analysis team), specific business rules and acceptance test.
Acceptance tests numbered below 100 are specified in Given-When-Then form in Section 18.2. Tests numbered 101 and above are planned tests derived directly from the requirement text (the expected result is the pass condition) and will be detailed in the test plan. Critical financial-integrity tests are specified as test cases TC-nnn in Section 17.

| Section | Module | Name | Must | Should | Could | Confirmed (C) | Proposed (P) | Total |
| 6.1 | AUTH | Authentication and User Management | 9 | 2 | 1 | 12 | 0 | 12 |
| 6.2 | RBAC | Role-Based Access Control | 8 | 3 | 0 | 8 | 3 | 11 |
| 6.3 | ORG | Company and Organisation Management | 10 | 1 | 0 | 10 | 1 | 11 |
| 6.4 | COA | Chart of Accounts | 9 | 2 | 0 | 8 | 3 | 11 |
| 6.5 | GL | General Ledger | 18 | 3 | 0 | 18 | 3 | 21 |
| 6.6 | AR | Accounts Receivable | 16 | 4 | 0 | 19 | 1 | 20 |
| 6.7 | AP | Accounts Payable | 13 | 5 | 0 | 16 | 2 | 18 |
| 6.8 | CB | Cash and Bank Management | 13 | 1 | 0 | 14 | 0 | 14 |
| 6.9 | EXP | Income and Expense Management | 8 | 3 | 0 | 10 | 1 | 11 |
| 6.10 | DOC | Invoicing and Financial Documents | 9 | 1 | 0 | 9 | 1 | 10 |
| 6.11 | INV | Inventory Accounting Integration (optional) | 0 | 0 | 8 | 7 | 1 | 8 |
| 6.12 | FA | Fixed Asset Management | 0 | 11 | 1 | 10 | 2 | 12 |
| 6.13 | TAX | Tax Management | 8 | 4 | 0 | 11 | 1 | 12 |
| 6.14 | BUD | Budget Management | 0 | 9 | 1 | 9 | 1 | 10 |
| 6.15 | RPT | Financial Reporting | 11 | 5 | 1 | 16 | 1 | 17 |
| 6.16 | FX | Foreign Currency Management | 10 | 2 | 0 | 11 | 1 | 12 |
| 6.17 | CLS | Period-End and Year-End Closing | 5 | 8 | 0 | 12 | 1 | 13 |
| 6.18 | AUD | Audit Trail and Internal Controls | 6 | 3 | 0 | 7 | 2 | 9 |
| 6.19 | DASH | Dashboard and Financial Analytics | 1 | 8 | 1 | 10 | 0 | 10 |
| 6.20 | WFL | Notifications and Approval Workflows | 5 | 7 | 0 | 11 | 1 | 12 |
| 6.21 | IMP | Data Import and Export | 9 | 1 | 1 | 11 | 0 | 11 |
| 6.22 | CFG | System Configuration | 9 | 4 | 0 | 12 | 1 | 13 |
|  |  | Total | 177 | 87 | 14 | 251 | 27 | 278 |


## 6.1 Module AUTH: Authentication and User Management

| Element | Description |
| Module ID and name | AUTH — Authentication and User Management |
| Business purpose | Ensure that only identified, authorised people use the system, with secure credentials, sessions and a record of their activity. |
| Actors and user roles | All users; SYSADMIN manages accounts; OWNER approves privileged accounts |
| Priority | Must Have |
| Business objectives | BO-02, BO-03 |
| Preconditions | System installed; initial System Administrator and Owner accounts created through a secured bootstrap procedure. |
| Main workflow | (1) Administrator creates a user with name, email, preferred language, companies, branches and roles. (2) User receives an activation link and sets a password (and MFA if required). (3) User signs in; the backend creates a session and issues short-lived access and rotating refresh tokens. (4) User works; session idle and absolute timeouts apply. (5) User signs out or the session expires; tokens are revoked. |
| Alternative and exception workflows | A1 Forgotten password: single-use reset link; A2 Account locked after repeated failures: automatic unlock after the lock period or administrator unlock; A3 MFA enabled: TOTP verification after password; Invalid credentials: generic message without revealing which field was wrong; Deactivated user: sign-in refused and sessions revoked |
| Validation rules | Email unique per installation; username unique; Password policy: minimum 12 characters, not in a breached-password list, not containing the username; Activation and reset tokens single-use, expiring (proposed 24 h and 30 min) |
| Business rules | BR-SEC-001, BR-SEC-003, BR-AUD-001 |
| Expected results | Only active, authenticated users can access the system; every sign-in, failure, lockout and sign-out is recorded. |
| Use cases | UC-01, UC-02 |
| Database entities | users, user_sessions, user_activity_logs |
| API groups | /api/v1/auth, /api/v1/users |
| Screens | SCR-01, SCR-16 |
| Acceptance criteria | Section 18.2.1: AT-AUTH-01, AT-AUTH-02, AT-AUTH-03 |

Functional requirements — AUTH

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-AUTH-001 | Login | The system shall authenticate users by email or username and password and, on success, create a server-side session and return an access token (15-minute lifetime) and a rotating refresh token in an HttpOnly, Secure cookie. Expected result: the user reaches the dashboard of their default company. | Must | C | BR-SEC-001 | AT-AUTH-101 |
| FR-AUTH-002 | Logout | The system shall end the session and revoke the refresh token on logout and on idle timeout (proposed 30 minutes) or absolute timeout (proposed 12 hours). Expected result: further requests with the old tokens return 401. | Must | C | — | AT-AUTH-102 |
| FR-AUTH-003 | Secure password storage | The system shall store passwords only as Argon2id hashes with per-user salt and enforce the password policy at creation and change. | Must | C | — | AT-AUTH-03 |
| FR-AUTH-004 | Password change and reset | The system shall allow users to change their password (current password required) and request a reset link valid for 30 minutes, after which all other sessions are revoked. Responses to reset requests shall not reveal whether an account exists. | Must | C | — | AT-AUTH-103 |
| FR-AUTH-005 | Activation and deactivation | The system shall allow administrators to activate and deactivate accounts; deactivation immediately revokes sessions and preserves all records created by the user. | Must | C | BR-AUD-001 | AT-AUTH-02 |
| FR-AUTH-006 | User profile | The system shall allow users to view and update their name, phone, preferred language (English or Khmer), date format and notification preferences; email changes require verification. | Must | C | — | AT-AUTH-104 |
| FR-AUTH-007 | Session management | The system shall list a user’s active sessions (device, IP, last activity) and allow the user or an administrator to revoke them. | Should | C | — | AT-AUTH-02 |
| FR-AUTH-008 | Multi-factor authentication | The system shall support optional TOTP multi-factor authentication with recovery codes, configurable as mandatory for selected roles (proposed: OWNER, FINMGR, SYSADMIN). | Should | C | — | AT-AUTH-105 |
| FR-AUTH-009 | Failed-login protection | The system shall lock an account for 15 minutes after 5 failed attempts within 15 minutes (configurable) and rate-limit login attempts per IP address. | Must | C | — | AT-AUTH-01 |
| FR-AUTH-010 | Account recovery | The system shall allow administrators to unlock accounts and reset MFA after identity verification, recording the reason. | Must | C | BR-AUD-001 | AT-AUTH-106 |
| FR-AUTH-011 | User activity history | The system shall record sign-in, sign-out, failed attempts, lockouts, password and MFA changes and provide a per-user activity history to authorised users. | Must | C | BR-AUD-001 | AT-AUTH-01 |
| FR-AUTH-012 | Single sign-on readiness | The authentication component shall be designed so that an OpenID Connect provider can be added later without changing authorisation logic. SSO itself is not delivered in release 1. | Could | C | — | AT-AUTH-107 |


## 6.2 Module RBAC: Role-Based Access Control

| Element | Description |
| Module ID and name | RBAC — Role-Based Access Control |
| Business purpose | Control which users can see and do what, in which companies, branches and accounts, up to which amounts, with separation of duties. |
| Actors and user roles | SYSADMIN (configure roles), OWNER (approve sensitive role changes), FINMGR (approval limits), all users (subject to permissions) |
| Priority | Must Have |
| Business objectives | BO-03 |
| Preconditions | Default roles and permission catalogue seeded. |
| Main workflow | (1) Administrator selects or creates a role. (2) Assigns permissions per module and action. (3) Sets data scopes (companies, branches, departments, account groups) and value limits. (4) Assigns roles to users; sensitive changes route for Owner approval. (5) Every API request is authorised against role permissions, scopes and limits. |
| Alternative and exception workflows | A1 Temporary delegation of approval authority (WFL); A2 Reduced separation-of-duties mode for very small organisations (D-10); Attempt to self-grant: 403 and security alert |
| Validation rules | Permission codes exist in the catalogue; Limit amounts ≥ 0 in the company base currency; A user cannot change their own roles, scopes or limits |
| Business rules | BR-SEC-001, BR-SEC-002, BR-SEC-003, BR-SEC-004 |
| Expected results | Users can perform only the actions allowed by their roles within their scopes and limits; every permission change is approved where required and audited. |
| Use cases | UC-02 |
| Database entities | roles, permissions, role_permissions, user_roles, user_company_access, user_branch_access, approval_limits |
| API groups | /api/v1/roles, /api/v1/users |
| Screens | SCR-16 |
| Acceptance criteria | Section 18.2.2: AT-RBAC-01, AT-RBAC-02, AT-RBAC-03, AT-RBAC-04 |

Permission model. Permission = <module>.<resource>.<action> where action ∈ {view, create, edit, delete (drafts only), submit, approve, post, reverse, export, manage}. A grant is evaluated against: (1) role permissions; (2) company and branch scope; (3) department scope (for DEPTMGR); (4) account-group restrictions (sensitive accounts); (5) value limit for approve/post/pay actions, expressed in the base currency of the company; (6) separation-of-duties rules (Section 4.4).
Functional requirements — RBAC

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-RBAC-001 | Default roles | The system shall provide the ten default roles in Section 4.2 with the proposed permissions of Section 4.3, editable by authorised administrators. | Must | C | BR-SEC-001 | AT-RBAC-101 |
| FR-RBAC-002 | Configurable roles | The system shall allow creating, copying, editing and deactivating custom roles composed of catalogue permissions. | Must | C | — | AT-RBAC-102 |
| FR-RBAC-003 | Module and action permissions | The system shall control access by module and by action (view, create, edit, delete draft, submit, approve, post, reverse, export, manage). | Must | C | BR-SEC-001 | AT-RBAC-103 |
| FR-RBAC-004 | Company and branch scope | The system shall restrict each user to assigned companies and branches for all queries, documents and reports. | Must | C | BR-SEC-003 | AT-RBAC-01 |
| FR-RBAC-005 | Account-level restrictions | The system shall allow restricting view and posting access to specific accounts or account groups (e.g., salaries) by role. | Should | C | BR-SEC-004 | AT-RBAC-04 |
| FR-RBAC-006 | Value-based approval authority | The system shall evaluate approve, post and payment-release actions against value limits per role, document type and company. | Must | C | BR-SEC-001 | AT-RBAC-02 |
| FR-RBAC-007 | Separation of duties enforcement | The system shall prevent the preparer of a document from approving it and enforce the SoD matrix in Section 4.4, recording any reduced-SoD exceptions. | Must | C | BR-SEC-002 | AT-RBAC-03 |
| FR-RBAC-008 | Sensitive information masking | The system shall hide or mask restricted financial information (restricted accounts, bank account numbers, employee payee details) for roles without the corresponding permission. | Must | C | BR-SEC-004 | AT-RBAC-04 |
| FR-RBAC-009 | Server-side authorisation | The system shall enforce all permissions in the backend on every request; the frontend shall only hide unavailable actions for usability. | Must | P | BR-SEC-001 | AT-RBAC-104 |
| FR-RBAC-010 | Role change approval | The system shall route assignment of sensitive permissions (approve, post, reverse, manage settings, payment release) for Owner approval before activation. | Should | P | BR-SEC-002 | AT-RBAC-105 |
| FR-RBAC-011 | Permission review report | The system shall produce a user-access report listing users, roles, scopes, limits, last login and SoD conflicts. | Should | P | — | AT-RBAC-106 |


## 6.3 Module ORG: Company and Organisation Management

| Element | Description |
| Module ID and name | ORG — Company and Organisation Management |
| Business purpose | Define the legal entities, branches, departments, business units, fiscal calendars, currencies and numbering that structure all accounting data. |
| Actors and user roles | FINMGR, OWNER (approve), SYSADMIN (technical) |
| Priority | Must Have |
| Business objectives | BO-04, BO-10 |
| Preconditions | Deployment model decided (D-01). |
| Main workflow | (1) Owner or Finance Manager creates a company with legal name (English and Khmer), registration identifiers as applicable, address, base currency and accounting basis. (2) Defines fiscal year and generates accounting periods. (3) Creates branches, departments and business units. (4) Configures supported currencies and numbering series. (5) Completes the readiness checklist; company status changes from Setup to Active. |
| Alternative and exception workflows | A1 Copy configuration and chart of accounts from a template company; A2 Add a new fiscal year before the current one ends; Attempt to post in a Setup company: rejected (BR-CFG-001) |
| Validation rules | Base currency cannot be changed after the first posting; Fiscal year periods contiguous with no gaps or overlaps; Branch and department codes unique per company |
| Business rules | BR-CFG-001, BR-CLS-002, BR-DOC-001 |
| Expected results | Each company has a complete, confirmed accounting structure before any production posting. |
| Use cases | UC-15 |
| Database entities | companies, branches, departments, business_units, fiscal_years, accounting_periods, document_sequences |
| API groups | /api/v1/companies, /api/v1/fiscal-years, /api/v1/accounting-periods |
| Screens | SCR-17, SCR-19 |
| Acceptance criteria | Section 18.2.3: AT-ORG-01, AT-ORG-02, AT-ORG-03 |

Functional requirements — ORG

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-ORG-001 | Company profile | The system shall maintain company profiles with legal and trading names (English and Khmer), registration and tax identifiers as configured, address, contacts, logo, base currency and accounting basis. | Must | C | BR-CFG-001 | AT-ORG-101 |
| FR-ORG-002 | Multiple companies | The system shall support multiple companies in one installation with complete data isolation between companies, enabled by deployment configuration. | Should | C | BR-SEC-003 | AT-ORG-102 |
| FR-ORG-003 | Branches | The system shall maintain branches per company with code, names, address and status; branch is a dimension on journal lines and documents. | Must | C | — | AT-ORG-103 |
| FR-ORG-004 | Departments and business units | The system shall maintain departments and business units per company as hierarchical dimensions usable on journal lines, budgets and reports. | Must | C | — | AT-ORG-104 |
| FR-ORG-005 | Fiscal years | The system shall define fiscal years with start and end dates (any start month; proposed default 1 January to 31 December, D-04) and allow years of non-standard length for the first or transition year. | Must | C | BR-CFG-001 | AT-ORG-02 |
| FR-ORG-006 | Accounting periods | The system shall generate monthly accounting periods (and optional adjustment period 13) for each fiscal year and manage their status per BR-CLS-002. | Must | C | BR-CLS-002 | AT-ORG-02 |
| FR-ORG-007 | Base and supported currencies | The system shall set one base currency per company (USD, KHR or another ISO 4217 currency) and a list of supported transaction currencies. | Must | C | BR-FX-001 | AT-ORG-03 |
| FR-ORG-008 | Document numbering per company | The system shall configure numbering series per company and document type with optional branch and fiscal-year scope, prefix, padding and reset rules. | Must | C | BR-DOC-001 | AT-ORG-105 |
| FR-ORG-009 | Company accounting configuration | The system shall store per-company default accounts (retained earnings, current-year earnings, rounding, realised and unrealised FX gain/loss, AR and AP control, unapplied receipts, supplier advances, suspense). | Must | C | BR-CFG-001 | AT-ORG-106 |
| FR-ORG-010 | Branch-level reporting | The system shall allow every financial report to be filtered and grouped by branch, department and business unit. | Must | C | BR-RPT-002 | AT-ORG-107 |
| FR-ORG-011 | Readiness checklist | The system shall present a readiness checklist (basis, currency, fiscal year, periods, COA, control accounts, default accounts, opening balances) and change company status to Active only when complete and confirmed by the Finance Manager. | Must | P | BR-CFG-001, BR-CFG-002 | AT-ORG-01 |


## 6.4 Module COA: Chart of Accounts

| Element | Description |
| Module ID and name | COA — Chart of Accounts |
| Business purpose | Provide a flexible, hierarchical account structure with types, normal balances, posting eligibility and statement mappings that drives all ledger postings and reports. |
| Actors and user roles | ACCT (create, edit), FINMGR (approve changes), all users (view within restrictions) |
| Priority | Must Have |
| Business objectives | BO-01, BO-04 |
| Preconditions | Company exists; account code structure configured. |
| Main workflow | (1) Accountant creates an account with code, English and Khmer names, type, category, parent, normal balance, posting flag, control flag and statement mapping. (2) System validates code structure, parent type and uniqueness. (3) Change requiring approval (e.g., type or mapping change on a used account) is approved by the Finance Manager. (4) Account becomes available for posting. |
| Alternative and exception workflows | A1 Import chart from template or file (IMP); A2 Deactivate an account with zero balance; Deleting a used account: rejected (BR-COA-004); Changing type of an account with postings: allowed only with approval and only between compatible categories |
| Validation rules | Code unique per company and matches the structure; Type of child equals type of parent; Posting accounts cannot have children; Normal balance defaults from type (Assets and Expenses debit; Liabilities, Equity and Revenue credit) and may be overridden for contra accounts |
| Business rules | BR-COA-001, BR-COA-002, BR-COA-003, BR-COA-004 |
| Expected results | A complete, validated chart of accounts in which only active posting accounts receive transactions and every account maps to the statements. |
| Use cases | UC-03 |
| Database entities | chart_of_accounts, account_categories, statement_mappings |
| API groups | /api/v1/accounts |
| Screens | SCR-03 |
| Acceptance criteria | Section 18.2.4: AT-COA-01, AT-COA-02, AT-COA-03 |

Configuration guidance. Account types: Asset, Liability, Equity, Revenue, Expense. Categories (examples): Cash and cash equivalents, Accounts receivable, Inventory, Prepayments, Property plant and equipment, Accumulated depreciation (contra-asset, credit normal), Accounts payable, Accrued liabilities, Tax payable, Loans payable, Owner’s equity, Retained earnings, Sales revenue, Service revenue, Other income, Interest income, Cost of goods sold, Operating expenses, Administrative expenses, Depreciation expense, Interest expense, FX gain/loss. Proposed code structure (configurable): first digit = type (1 Assets, 2 Liabilities, 3 Equity, 4 Revenue, 5 Cost of sales, 6 Operating expenses, 7 Other income, 8 Other expenses); header accounts end in zeros (e.g., 1100 Cash and cash equivalents) and posting accounts below them (1101 Cash on hand – USD, 1102 Cash on hand – KHR, 1110 Bank – ABA USD). An illustrative chart is in Appendix C; it is not a mandated Cambodian chart (V-04).
Functional requirements — COA

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-COA-001 | Account master data | The system shall maintain accounts with code, name (English), name (Khmer, optional), description, type, category, parent, normal balance, posting flag, control flag, sensitive flag, currency restriction (optional), cash-flow classification, active status and effective dates. | Must | C | BR-COA-003 | AT-COA-101 |
| FR-COA-002 | Account hierarchy | The system shall support unlimited-depth hierarchy (practical limit 6 levels) with header (non-posting) and posting accounts, and roll up balances in reports. | Must | C | BR-COA-003 | AT-COA-102 |
| FR-COA-003 | Account types and categories | The system shall support the five account types and configurable categories with default normal balances and statement sections. | Must | C | — | AT-COA-103 |
| FR-COA-004 | Posting eligibility | The system shall reject postings to header, inactive or not-yet-effective accounts. | Must | C | BR-COA-001 | AT-COA-01 |
| FR-COA-005 | Control accounts | The system shall flag control accounts and prevent manual journal postings to them without override permission. | Must | P | BR-COA-002 | AT-COA-104 |
| FR-COA-006 | Financial statement mapping | The system shall map each posting account to balance-sheet or income-statement lines and cash-flow categories, and report unmapped accounts before statements are finalised. | Must | C | BR-RPT-003 | AT-COA-02 |
| FR-COA-007 | Account change history | The system shall record creation and every change to an account with before and after values, user and time. | Must | C | BR-AUD-001 | AT-COA-03 |
| FR-COA-008 | Deactivation and deletion rules | The system shall allow deletion only of unused accounts and deactivation only of zero-balance accounts (or with approved exception). | Must | C | BR-COA-004 | AT-COA-105 |
| FR-COA-009 | Search and tree view | The system shall show the chart as a searchable tree and flat list with filters by type, category, status and posting flag, and export it to Excel and PDF. | Must | C | — | AT-COA-106 |
| FR-COA-010 | Chart templates | The system shall allow copying a chart of accounts from a template or another company. | Should | P | — | AT-COA-107 |
| FR-COA-011 | Account currency restriction | The system shall optionally restrict an account (e.g., a USD bank account) to one transaction currency. | Should | P | BR-FX-001 | AT-COA-108 |


## 6.5 Module GL: General Ledger

| Element | Description |
| Module ID and name | GL — General Ledger |
| Business purpose | Record all financial transactions as balanced journal entries through one controlled posting service, maintain the immutable ledger and provide inquiry, reversal, opening balances and trial balance. |
| Actors and user roles | ACCT (prepare, post if permitted), FINMGR (approve, post, reverse), OWNER (approve high-value), AUDITOR (view) |
| Priority | Must Have |
| Business objectives | BO-01, BO-02, BO-04 |
| Preconditions | Company Active; periods open; accounts configured. |
| Main workflow | (1) Accountant creates a Draft journal with posting date, document date, description, reference, currency, rate and lines. (2) Accountant attaches support and submits; the system validates balance and accounts. (3) Approver approves (or rejects with comment). (4) Authorised user posts; the posting service validates period, accounts, balance and permissions, assigns the journal number and writes ledger lines atomically. (5) Ledger, account balances and reports reflect the posted entry. |
| Alternative and exception workflows | A1 Automatic journals from subledgers (AR, AP, CB, EXP, FA, FX, TAX, INV) are generated and posted by their documents’ posting actions; A2 Reversal of a posted journal; A3 Adjusting journal in a soft-closed period; A4 Recurring journal generated as Draft; Failed posting: transaction rolled back; journal remains Approved; error returned with code and correlation ID; Duplicate post request: original result returned (BR-GL-007); Concurrent edit of a draft: version conflict 409 |
| Validation rules | BR-GL-001, BR-GL-005, BR-GL-008, BR-COA-001, BR-CLS-001; Rate required for foreign currency (BR-FX-002); Attachment required above configurable amount (proposed: none by default) |
| Business rules | BR-GL-001, BR-GL-002, BR-GL-003, BR-GL-004, BR-GL-005, BR-GL-006, BR-GL-007, BR-GL-008, BR-GL-009, BR-GL-010, BR-CLS-001 |
| Expected results | Every posted entry is balanced, numbered, immutable, traceable to its source and visible in ledgers and the trial balance. |
| Use cases | UC-04, UC-05, UC-06, UC-07 |
| Database entities | journal_entries, journal_entry_lines, opening_balances, attachments, accounting_dimensions |
| API groups | /api/v1/journal-entries, /api/v1/reports/general-ledger, /api/v1/reports/trial-balance |
| Screens | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 |
| Acceptance criteria | Section 18.2.5: AT-GL-01, AT-GL-02, AT-GL-03, AT-GL-04, AT-GL-05 |

Journal states and types.

| State / type | Meaning | Affects ledger? | Editable? |
| Draft | Being prepared; may be unbalanced while saving | No | Yes, by preparer and permitted users |
| Submitted | Sent for approval; validated as balanced | No | No (recall to Draft allowed) |
| Approved | Approved by an authorised user; ready to post | No | No (can be returned to Draft by approver) |
| Rejected | Returned with comment | No | Becomes Draft for correction |
| Posted | Written to the ledger with a journal number | Yes | No (BR-GL-003) |
| Reversed | Posted journal that has been fully reversed by a linked reversal journal (the original stays Posted with a reversed flag) | Yes (original and reversal both remain) | No |
| Adjusting (type) | Journal flagged as period-end adjustment; may post to a Soft-Closed period with permission | Yes when posted | As other journals |
| System (type) | Generated by modules (source type and ID recorded); approval follows the source document | Yes when posted | No manual edit |

Figure 3. Module GL: General Ledger
Failed, duplicate and concurrent postings. Posting runs in one database transaction: lock journal row (FOR UPDATE), verify status Approved, lock period row (FOR SHARE), validate, take next number from the sequence row (locked), insert lines, set Posted, write audit, commit. Any exception rolls back everything. A repeated request with the same idempotency key returns the stored result; a different request for an already posted journal returns 409 ALREADY_POSTED. Concurrent postings to the same accounts do not conflict because balances are derived from immutable lines (no shared balance row is updated), so throughput is not limited by account hot spots.
Functional requirements — GL

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-GL-001 | Manual journal vouchers | The system shall allow creation of manual journal vouchers with company, branch, posting date, document date, description, reference, currency, exchange rate, attachments and at least two lines (account, debit or credit, line description, dimensions, tax code optional). | Must | C | BR-GL-005, BR-GL-008 | AT-GL-101 |
| FR-GL-002 | Automatic journals | The system shall generate journals automatically from posted subledger documents using configurable posting rules, recording source type, source ID and source number on the journal. | Must | C | BR-GL-006 | AT-GL-102 |
| FR-GL-003 | Double-entry validation | The system shall validate that total debits equal total credits in base currency and in each transaction currency on submit and again at posting. | Must | C | BR-GL-001 | AT-GL-01 |
| FR-GL-004 | Journal workflow states | The system shall implement the Draft, Submitted, Approved, Rejected, Posted, Reversed and Cancelled states with explicit transition endpoints only. | Must | C | BR-GL-003 | AT-GL-02 |
| FR-GL-005 | Journal approval workflow | The system shall route submitted journals to approvers according to amount, company, branch and journal type rules, supporting multi-level approval. | Must | C | BR-SEC-001, BR-SEC-002 | AT-GL-103 |
| FR-GL-006 | Atomic posting | The system shall post journals in a single database transaction that includes number assignment, ledger lines, status change and audit. | Must | C | BR-GL-006 | AT-GL-02, AT-GL-03 |
| FR-GL-007 | Idempotent posting | The system shall accept an idempotency key on post, approve and reverse requests and guarantee one accounting effect per journal. | Must | P | BR-GL-007 | AT-GL-03 |
| FR-GL-008 | Journal numbering | The system shall assign journal numbers at posting from the company and journal-type sequence without duplicates. | Must | C | BR-DOC-001 | AT-GL-104 |
| FR-GL-009 | Immutability of posted journals | The system shall prevent editing and deletion of posted journals and lines through the API and database privileges. | Must | C | BR-GL-003 | AT-GL-04 |
| FR-GL-010 | Reversal entries | The system shall reverse a posted journal by creating a linked mirror journal on a permitted date, with reason and approval, once per journal. | Must | C | BR-GL-004, BR-GL-009 | AT-GL-04 |
| FR-GL-011 | Adjusting journals | The system shall support adjusting journals flagged for period-end, postable into soft-closed periods by authorised users only. | Must | C | BR-CLS-001 | AT-GL-105 |
| FR-GL-012 | Recurring journals | The system shall maintain recurring journal templates (frequency, start, end, amounts) that generate Draft journals on schedule. | Should | P | BR-GL-010 | AT-GL-106 |
| FR-GL-013 | Supporting attachments | The system shall allow attachments (PDF, JPG, PNG, XLSX; ≤ 10 MB each, configurable) to journals and documents, stored securely with virus scanning where available. | Must | C | — | AT-GL-107 |
| FR-GL-014 | Opening balances | The system shall record opening balances as a balanced opening journal per company at the go-live date, with subledger detail for control accounts. | Must | C | BR-CFG-002 | AT-GL-108 |
| FR-GL-015 | General Ledger inquiry | The system shall show account activity for a date range or periods with opening balance, each posted line (date, journal number, source, description, debit, credit, running balance) and closing balance, filterable by dimensions and currency. | Must | C | BR-RPT-001 | AT-GL-109 |
| FR-GL-016 | Transaction drill-down | The system shall allow drilling from any report figure to ledger lines, to the journal and to the source document, subject to permissions. | Must | C | — | AT-GL-110 |
| FR-GL-017 | Journal history | The system shall show the complete history of a journal: creation, edits, submissions, approvals, rejections, posting, reversal, attachments, with users and times. | Must | C | BR-AUD-001 | AT-GL-111 |
| FR-GL-018 | Trial balance | The system shall produce a trial balance for a period range showing opening, period debits, period credits and closing balance per account with equal debit and credit totals. | Must | C | BR-GL-002 | AT-GL-05 |
| FR-GL-019 | Journal search | The system shall search journals by number, date range, status, type, source, account, amount range, reference, preparer and approver, with pagination. | Must | C | — | AT-GL-112 |
| FR-GL-020 | Dimensions on lines | The system shall record branch, department, business unit and user-defined dimensions on each journal line with validation of required dimensions per account. | Should | C | — | AT-GL-113 |
| FR-GL-021 | Suspense control | The system shall report balances in the suspense account and include them in the month-end checklist. | Should | P | — | AT-GL-114 |


## 6.6 Module AR: Accounts Receivable

| Element | Description |
| Module ID and name | AR — Accounts Receivable |
| Business purpose | Manage customers, invoices, receipts, allocations, credit notes, write-offs, refunds, statements, aging and reminders, with automatic posting to the General Ledger. |
| Actors and user roles | ARO (prepare), ACCT/FINMGR (approve, post), CASHIER (receipts), OWNER (high-value write-offs) |
| Priority | Must Have |
| Business objectives | BO-05, BO-06 |
| Preconditions | Customers set up; revenue, AR control, tax and bank/cash accounts configured. |
| Main workflow | (1) AR officer creates an invoice with customer, dates, terms, currency, lines (item or description, quantity, price, discount, tax code, revenue account, dimensions). (2) System calculates line, tax and total amounts and due date. (3) Invoice is approved (if required) and posted, generating the AR journal and invoice number. (4) Customer pays; receipt recorded and allocated to one or more invoices. (5) Statements, aging and reminders are produced. |
| Alternative and exception workflows | A1 Partial payment; A2 Overpayment held as unapplied credit; A3 Credit note against invoice; A4 Write-off with approval; A5 Refund of unapplied credit; Posting failure rolls back invoice number and journal; Rate missing for foreign-currency invoice: posting blocked |
| Validation rules | Customer active and within credit limit (BR-AR-004); Quantities and prices ≥ 0; discount ≤ line amount; Allocation limits (BR-AR-003) |
| Business rules | BR-AR-001, BR-AR-002, BR-AR-003, BR-AR-004, BR-AR-005, BR-AR-006, BR-DOC-001, BR-DOC-002, BR-FX-003, BR-TAX-003 |
| Expected results | Customer balances are always derived from posted invoices, credit notes, write-offs and allocated receipts and reconcile to the AR control account. |
| Use cases | UC-08, UC-09 |
| Database entities | customers, customer_invoices, customer_invoice_lines, customer_receipts, customer_payment_allocations, customer_credit_notes |
| API groups | /api/v1/customers, /api/v1/customer-invoices, /api/v1/customer-receipts, /api/v1/customer-credit-notes |
| Screens | SCR-09, SCR-10, SCR-20 |
| Acceptance criteria | Section 18.2.6: AT-AR-01, AT-AR-02, AT-AR-03, AT-AR-04, AT-AR-05 |

Statuses. Invoice: Draft, Submitted, Approved, Open (posted, unpaid), Partially Paid, Paid, Overdue (derived: Open/Partially Paid and past due date), Credited, Cancelled. Receipt: Draft, Posted, Partially Allocated, Fully Allocated, Reversed.
Accounting impact (illustrative; correct treatment depends on facts and the applicable framework).

| Event | Debit | Credit |
| Credit sale invoice 1,000.00 + illustrative tax 100.00 | Accounts receivable 1,100.00 | Sales revenue 1,000.00; Output tax payable 100.00 |
| Receipt 1,100.00 into bank | Bank 1,100.00 | Accounts receivable 1,100.00 |
| Credit note 200.00 + tax 20.00 | Sales returns/allowances (or revenue) 200.00; Output tax payable 20.00 | Accounts receivable 220.00 |
| Approved write-off 300.00 | Bad debt expense (or allowance for doubtful debts) 300.00 | Accounts receivable 300.00 |
| Overpayment 50.00 | Bank 50.00 | Unapplied receipts / customer advances 50.00 |

Functional requirements — AR

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-AR-001 | Customer records | The system shall maintain customers with code, names (English and Khmer), tax identifier if applicable, contacts, billing address, currency, payment terms, credit limit, AR control account, status and notes. | Must | C | BR-AR-004 | AT-AR-101 |
| FR-AR-002 | Customer invoices | The system shall create customer invoices with header, lines, discounts, tax codes, revenue accounts, dimensions and attachments, calculating totals with exact decimal arithmetic. | Must | C | BR-FX-005, BR-TAX-003 | AT-AR-102 |
| FR-AR-003 | Invoice posting | The system shall post approved invoices, assigning the invoice number and generating the AR journal in one atomic transaction. | Must | C | BR-GL-006, BR-DOC-001 | AT-AR-04 |
| FR-AR-004 | Invoice statuses | The system shall maintain invoice and payment statuses as defined in Section 6.6 and derive Overdue from due date. | Must | C | BR-AR-001 | AT-AR-103 |
| FR-AR-005 | Due dates and terms | The system shall calculate due dates from payment terms and allow authorised override with reason. | Must | C | BR-AP-002 | AT-AR-104 |
| FR-AR-006 | Receipt vouchers | The system shall record customer receipts with date, customer, method, bank or cash account, currency, amount, rate, reference and attachments, and post them atomically. | Must | C | BR-GL-006 | AT-AR-105 |
| FR-AR-007 | Payment allocation | The system shall allocate one receipt across multiple invoices and multiple receipts to one invoice, within allocation limits, with oldest-first suggestion. | Must | C | BR-AR-003 | AT-AR-01, AT-AR-02, AT-AR-03 |
| FR-AR-008 | Partial payments | The system shall support partial settlement, updating outstanding balances and statuses. | Must | C | BR-AR-002 | AT-AR-01 |
| FR-AR-009 | Overpayments and unapplied receipts | The system shall record overpayments as unapplied customer credit and allow later allocation or approved refund. | Must | C | BR-AR-006 | AT-AR-106 |
| FR-AR-010 | Outstanding balance derivation | The system shall derive invoice and customer outstanding balances from posted documents and allocations per BR-AR-002. | Must | C | BR-AR-002 | AT-AR-01 |
| FR-AR-011 | Credit limits | The system shall check credit limits at approval and posting and require override approval when exceeded. | Should | C | BR-AR-004 | AT-AR-107 |
| FR-AR-012 | Credit notes | The system shall issue credit notes referencing an invoice (or standalone with approval), with approval, posting and allocation to invoices. | Must | C | BR-AR-005 | AT-AR-01 |
| FR-AR-013 | Debit notes | The system shall issue debit notes to increase amounts receivable where applicable. | Should | C | BR-AR-001 | AT-AR-108 |
| FR-AR-014 | Write-offs | The system shall write off approved balances to the configured bad-debt account with approval and reason. | Must | C | BR-AR-005 | AT-AR-109 |
| FR-AR-015 | Refunds | The system shall refund unapplied customer credit through an approved payment voucher. | Should | C | BR-AR-006 | AT-AR-110 |
| FR-AR-016 | Customer statements | The system shall produce customer statements for a date range (opening balance, invoices, credit notes, receipts, closing balance, aging) in PDF (English/Khmer) and email them. | Must | C | — | AT-AR-111 |
| FR-AR-017 | Receivable aging | The system shall produce receivable aging by customer with configurable buckets (proposed current, 1–30, 31–60, 61–90, over 90 days past due) as of any date. | Must | C | BR-RPT-002 | AT-AR-112 |
| FR-AR-018 | Overdue notifications | The system shall send overdue reminders according to configurable schedules and templates. | Should | C | — | AT-AR-113 |
| FR-AR-019 | Foreign-currency receivables | The system shall record invoices in transaction currency and post realised exchange differences on settlement. | Must | C | BR-FX-001, BR-FX-003 | AT-AR-114 |
| FR-AR-020 | Subledger reconciliation | The system shall reconcile the sum of customer balances to the AR control account and report differences. | Must | P | BR-COA-002 | AT-AR-05 |


## 6.7 Module AP: Accounts Payable

| Element | Description |
| Module ID and name | AP — Accounts Payable |
| Business purpose | Manage suppliers, supplier invoices and expense bills, credit notes, advances, payment approval, scheduling and payment, allocation, statements, aging and reconciliation, while preventing duplicate invoices and unauthorised payments. |
| Actors and user roles | APO (prepare), DEPTMGR (approve within department), FINMGR/OWNER (approve), ACCT (post), CASHIER (cash payments) |
| Priority | Must Have |
| Business objectives | BO-03, BO-05, BO-06 |
| Preconditions | Suppliers verified; AP control, expense and tax accounts configured. |
| Main workflow | (1) AP officer records a supplier invoice with supplier invoice number, dates, currency, lines (expense, asset or inventory account, amount, tax code, dimensions) and attachment. (2) System checks duplicates and calculates due date. (3) Invoice is approved per rules and posted (AP journal). (4) AP officer prepares a payment proposal for due invoices. (5) Approver approves; authorised user releases payment from bank or cash; allocation updates balances. |
| Alternative and exception workflows | A1 Partial payment; A2 Supplier advance and later offset; A3 Supplier credit note; A4 Scheduled payment run; Duplicate detected: blocked or warning with reason; Bank-detail change pending: payment held (BR-AP-005) |
| Validation rules | BR-AP-001 duplicate check; Supplier status Verified for payments; Payment ≤ outstanding (BR-AP-006) |
| Business rules | BR-AP-001, BR-AP-002, BR-AP-003, BR-AP-004, BR-AP-005, BR-AP-006, BR-EXP-001, BR-FX-003 |
| Expected results | Supplier balances reconcile to the AP control account; no invoice is recorded twice and no payment is released without approval. |
| Use cases | UC-10, UC-11 |
| Database entities | suppliers, supplier_invoices, supplier_invoice_lines, supplier_payments, supplier_payment_allocations, supplier_credit_notes, payment_vouchers |
| API groups | /api/v1/suppliers, /api/v1/supplier-invoices, /api/v1/supplier-payments, /api/v1/supplier-credit-notes |
| Screens | SCR-11, SCR-12, SCR-20 |
| Acceptance criteria | Section 18.2.7: AT-AP-01, AT-AP-02, AT-AP-03, AT-AP-04 |

Accounting impact (illustrative).

| Event | Debit | Credit |
| Supplier invoice for services 500.00 + illustrative input tax 50.00 | Expense 500.00; Input tax recoverable 50.00 (if recoverable, V-01) | Accounts payable 550.00 |
| Payment of the invoice from bank | Accounts payable 550.00 | Bank 550.00 |
| Supplier advance 200.00 | Supplier advances (prepayment) 200.00 | Bank 200.00 |
| Offset advance against invoice | Accounts payable 200.00 | Supplier advances 200.00 |
| Supplier credit note 100.00 | Accounts payable 100.00 | Expense (or purchase returns) 100.00 |

Functional requirements — AP

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-AP-001 | Supplier records | The system shall maintain suppliers with code, names (English and Khmer), tax identifier if applicable, contacts, address, currency, payment terms, bank details, AP control account, default expense account, status (Draft, Verified, Blocked). | Must | C | BR-AP-005 | AT-AP-101 |
| FR-AP-002 | Supplier invoices and bills | The system shall record supplier invoices and expense bills with supplier invoice number, invoice date, received date, posting date, due date, currency, rate, lines, tax codes, dimensions and attachments. | Must | C | BR-AP-002 | AT-AP-102 |
| FR-AP-003 | Duplicate invoice detection | The system shall block exact duplicates and warn on near duplicates per BR-AP-001, recording any override reason. | Must | C | BR-AP-001 | AT-AP-01 |
| FR-AP-004 | Invoice approval and posting | The system shall route supplier invoices for approval by rules and post approved invoices atomically, generating the AP journal. | Must | C | BR-AP-003, BR-GL-006 | AT-AP-103 |
| FR-AP-005 | Purchase-related liabilities | The system shall allow supplier invoice lines to post to expense, asset (creating a fixed-asset draft when configured) or inventory accounts. | Should | C | BR-FA-001 | AT-AP-104 |
| FR-AP-006 | Supplier credit notes | The system shall record supplier credit notes and apply them to invoices or hold them as supplier credit. | Must | C | BR-AP-006 | AT-AP-105 |
| FR-AP-007 | Supplier advances | The system shall record advances to suppliers and offset them against later invoices. | Should | C | BR-AP-006 | AT-AP-106 |
| FR-AP-008 | Payment vouchers | The system shall create payment vouchers with supplier, bank or cash account, method, currency, amount, rate, reference and allocation to invoices. | Must | C | BR-AP-004 | AT-AP-107 |
| FR-AP-009 | Payment approval | The system shall require approval of payments by authorised users within limits, separate from the preparer, before release. | Must | C | BR-AP-004, BR-SEC-002 | AT-AP-02 |
| FR-AP-010 | Payment release | The system shall release (mark paid and post) approved payments once, with idempotency, and generate payment vouchers in PDF. | Must | C | BR-GL-007 | AT-AP-02, AT-AP-03, AT-AP-04 |
| FR-AP-011 | Partial payments | The system shall support partial payments and allocation across invoices. | Must | C | BR-AP-006 | AT-AP-108 |
| FR-AP-012 | Payment scheduling | The system shall propose payments by due date, supplier and available cash, and allow scheduled payment runs for approval. | Should | C | — | AT-AP-109 |
| FR-AP-013 | Outstanding liabilities | The system shall show outstanding supplier balances and invoices derived from posted documents and allocations. | Must | C | BR-AP-006 | AT-AP-03 |
| FR-AP-014 | Supplier statements | The system shall produce supplier statements for a date range. | Should | C | — | AT-AP-110 |
| FR-AP-015 | Payables aging | The system shall produce AP aging by supplier with configurable buckets as of any date. | Must | C | BR-RPT-002 | AT-AP-111 |
| FR-AP-016 | Supplier balance reconciliation | The system shall allow recording a supplier’s statement balance and reconciling it to the AMS balance, listing differences. | Should | C | — | AT-AP-112 |
| FR-AP-017 | Bank-detail change control | The system shall require approval for supplier bank-detail changes and hold payments to changed details as configured. | Must | P | BR-AP-005 | AT-AP-113 |
| FR-AP-018 | AP control reconciliation | The system shall reconcile Σ supplier balances to the AP control account and report differences. | Must | P | BR-COA-002 | AT-AP-114 |


## 6.8 Module CB: Cash and Bank Management

| Element | Description |
| Module ID and name | CB — Cash and Bank Management |
| Business purpose | Manage cash, petty cash and bank accounts, receipts, payments, transfers, deposits, withdrawals, charges and interest, cashbooks and bankbooks, statement import and controlled bank reconciliation. |
| Actors and user roles | CASHIER (cash transactions), ACCT (bank transactions, reconciliation), FINMGR (review, complete, reopen) |
| Priority | Must Have |
| Business objectives | BO-05, BO-01 |
| Preconditions | Cash and bank accounts linked to GL accounts. |
| Main workflow | (1) User records cash or bank receipts, payments, transfers, deposits, withdrawals, charges or interest. (2) Transactions post to the GL. (3) Accountant imports a bank statement file. (4) System auto-matches statement lines to unreconciled book entries; user matches the rest or records approved adjustments. (5) Reviewer completes the reconciliation when the difference is zero or documented. |
| Alternative and exception workflows | A1 Petty cash top-up; A2 Inter-account transfer with currency conversion; A3 Reopen a completed reconciliation (controlled); Duplicate statement lines detected by date, amount, reference and hash; Completed reconciliation edit attempt: 409 |
| Validation rules | Statement import: required columns date, description, amount or debit/credit, reference (optional), balance (optional); Statement period must not overlap a completed reconciliation; Cash balance non-negative (BR-CB-004) |
| Business rules | BR-CB-001, BR-CB-002, BR-CB-003, BR-CB-004, BR-FX-001 |
| Expected results | Cash and bank balances are accurate, every bank account is reconciled to statements, and reconciliation history is preserved. |
| Use cases | UC-12 |
| Database entities | bank_accounts, cash_accounts, cash_transactions, bank_statement_imports, bank_transactions, bank_reconciliations, bank_reconciliation_lines |
| API groups | /api/v1/bank-accounts, /api/v1/cash-accounts, /api/v1/cash-transactions, /api/v1/bank-statements, /api/v1/bank-reconciliations |
| Screens | SCR-13, SCR-27 |
| Acceptance criteria | Section 18.2.8: AT-CB-01, AT-CB-02, AT-CB-03, AT-CB-04 |

Functional requirements — CB

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-CB-001 | Cash accounts | The system shall maintain cash accounts (main cash, petty cash) per company and branch with currency, custodian, GL account and limits. | Must | C | BR-CB-004 | AT-CB-101 |
| FR-CB-002 | Bank accounts | The system shall maintain bank accounts with bank name, branch, masked account number, currency, GL account, opening date and status. | Must | C | BR-SEC-004 | AT-CB-102 |
| FR-CB-003 | Cash receipts and payments | The system shall record cash receipts and payments with counter-account lines, tax codes, dimensions, references and attachments, and post them. | Must | C | BR-GL-006 | AT-CB-103 |
| FR-CB-004 | Bank receipts, payments, deposits and withdrawals | The system shall record bank deposits, withdrawals, receipts and payments with payment references and post them. | Must | C | BR-GL-006 | AT-CB-104 |
| FR-CB-005 | Transfers | The system shall record transfers between cash and bank accounts (including different currencies via a transfer-clearing account and realised FX) as one balanced document. | Must | C | BR-CB-003 | AT-CB-04 |
| FR-CB-006 | Bank charges and interest | The system shall record bank charges and interest received or paid, including from reconciliation adjustments. | Must | C | — | AT-CB-105 |
| FR-CB-007 | Cashbook and bankbook | The system shall produce cashbooks and bankbooks with opening balance, transactions, running balance and closing balance in account currency and base currency. | Must | C | BR-RPT-002 | AT-CB-04 |
| FR-CB-008 | Bank statement import | The system shall import bank statements from CSV or Excel using saved column mappings per bank, with preview, validation, duplicate detection and import history. | Must | C | BR-IMP-001 | AT-CB-03 |
| FR-CB-009 | Automatic matching | The system shall suggest matches by amount, date window (± configurable days) and reference, and allow one-to-one, one-to-many and many-to-one matches. | Must | C | — | AT-CB-106 |
| FR-CB-010 | Manual matching and adjustments | The system shall allow manual matching and creation of approved adjustment entries (e.g., charges, interest) from unmatched statement lines. | Must | C | BR-CB-002 | AT-CB-107 |
| FR-CB-011 | Reconciliation completion | The system shall calculate statement balance, book balance, outstanding deposits, unpresented payments and difference, and allow completion only per BR-CB-002. | Must | C | BR-CB-002 | AT-CB-01 |
| FR-CB-012 | Locked reconciliation history | The system shall lock completed reconciliations and preserve their history; reopening requires permission, reason and audit. | Must | C | BR-CB-001 | AT-CB-02 |
| FR-CB-013 | Unreconciled transactions | The system shall list unreconciled book and statement items with age. | Must | C | — | AT-CB-108 |
| FR-CB-014 | Cash balance monitoring | The system shall show current balances of all cash and bank accounts and alert when below configured minimums. | Should | C | — | AT-CB-109 |


## 6.9 Module EXP: Income and Expense Management

| Element | Description |
| Module ID and name | EXP — Income and Expense Management |
| Business purpose | Record revenue not invoiced through AR, operating and other expenses, expense claims and recurring costs with categories, department and branch allocation, approvals and attachments, distinguishing recognition from payment. |
| Actors and user roles | ACCT, APO, CASHIER (cash expenses), DEPTMGR (approve own department), FINMGR (approve, post), employees through managers (claims) |
| Priority | Must Have |
| Business objectives | BO-04, BO-08 |
| Preconditions | Expense categories mapped to GL accounts; approval rules configured. |
| Main workflow | (1) User records an expense with date, category, description, amount, currency, tax code, department, branch, payee and payment mode (paid now, unpaid/payable, employee claim). (2) Attaches receipt or invoice. (3) Approver approves per rules. (4) Posting recognises the expense and credits cash/bank, AP, accrued liabilities or employee payable. (5) Unpaid amounts are settled later through AP or CB. |
| Alternative and exception workflows | A1 Allocation of one expense across departments or branches by percentage or amount; A2 Recurring expense template; A3 Other income recorded directly (e.g., interest); Budget exceeded: warning or block per D-13; Rejected expense returns to preparer with comment |
| Validation rules | Amount > 0; category active; attachment mandatory above configurable amount or for configured categories; Allocation percentages total 100 % |
| Business rules | BR-EXP-001, BR-AP-003, BR-BUD-001, BR-SEC-002 |
| Expected results | Expenses are recognised once, in the correct period, department and branch, and are settled without double counting. |
| Use cases | UC-10 |
| Database entities | expenses, expense_lines, expense_categories, expense_claims, recurring_templates, attachments |
| API groups | /api/v1/expenses, /api/v1/expense-categories, /api/v1/income-entries |
| Screens | SCR-21 |
| Acceptance criteria | Section 18.2.9: AT-EXP-01, AT-EXP-02, AT-EXP-03 |

Recognition versus payment (illustrative).

| Situation | Entry at recognition | Entry at payment |
| Electricity bill 120.00 paid immediately from cash | Dr Utilities expense 120.00 / Cr Cash 120.00 | — (already paid) |
| Rent for October 1,000.00 incurred, paid in November | Dr Rent expense 1,000.00 / Cr Accrued liabilities (or AP) 1,000.00 (October) | Dr Accrued liabilities (or AP) 1,000.00 / Cr Bank 1,000.00 (November) |
| Employee travel claim 80.00 | Dr Travel expense 80.00 / Cr Employee claims payable 80.00 | Dr Employee claims payable 80.00 / Cr Cash 80.00 |
| Salaries recorded as accounting entries (payroll calculated outside AMS) | Dr Salaries expense / Cr Salaries payable (and any withholding liabilities per V-07) | Dr Salaries payable / Cr Bank |

Functional requirements — EXP

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-EXP-001 | Revenue recording | The system shall record income not invoiced through AR (e.g., interest, sundry income) with category, account, amount, currency and dimensions, posting to the GL. | Must | C | BR-GL-006 | AT-EXP-101 |
| FR-EXP-002 | Expense recording | The system shall record expenses with date, category, description, amount, currency, rate, tax code, payee, department, branch and attachments. | Must | C | BR-EXP-001 | AT-EXP-102 |
| FR-EXP-003 | Expense categories | The system shall maintain hierarchical expense categories (operating, administrative, utilities, rent, salaries and wages, travel, maintenance, other) mapped to GL accounts and default tax codes. | Must | C | — | AT-EXP-103 |
| FR-EXP-004 | Payment mode | The system shall record whether an expense is paid immediately (cash/bank), unpaid (AP or accrued liability) or an employee claim, posting accordingly. | Must | C | BR-EXP-001 | AT-EXP-01 |
| FR-EXP-005 | Department and branch allocation | The system shall allocate an expense across departments and branches by amount or percentage, with lines summing exactly to the total (rounding to last line). | Must | C | BR-FX-005 | AT-EXP-02 |
| FR-EXP-006 | Expense approval | The system shall route expenses for approval by amount, department and category, with SoD. | Must | C | BR-AP-003, BR-SEC-002 | AT-EXP-104 |
| FR-EXP-007 | Expense attachments | The system shall require supporting attachments for configured categories and amounts. | Must | C | — | AT-EXP-03 |
| FR-EXP-008 | Expense claims and reimbursement | The system shall record employee expense claims with receipts, approve them and reimburse them through cash or bank payments. | Should | C | BR-EXP-001 | AT-EXP-105 |
| FR-EXP-009 | Recurring expenses | The system shall maintain recurring expense templates that generate Draft expenses on schedule. | Should | C | BR-GL-010 | AT-EXP-106 |
| FR-EXP-010 | Settlement of recognised expenses | The system shall settle unpaid expenses through AP payment or cash/bank payment allocation without recognising the expense again. | Must | C | BR-EXP-001 | AT-EXP-01 |
| FR-EXP-011 | Budget check | The system shall show remaining budget for the account and department when recording expenses and apply the configured warning or block. | Should | P | BR-BUD-001 | AT-EXP-107 |


## 6.10 Module DOC: Invoicing and Financial Documents

| Element | Description |
| Module ID and name | DOC — Invoicing and Financial Documents |
| Business purpose | Produce controlled, numbered, bilingual financial documents (invoices, bills, vouchers, notes, journal vouchers) with templates, PDF output, email delivery, status and history. |
| Actors and user roles | ARO, APO, ACCT, CASHIER (issue documents), FINMGR (templates, numbering) |
| Priority | Must Have |
| Business objectives | BO-02, BO-09 |
| Preconditions | Numbering series and templates configured per company and document type. |
| Main workflow | (1) User finalises (posts) a document. (2) System assigns the next number in scope. (3) System stores a document snapshot and renders the PDF from the template. (4) User prints or emails the document. (5) Document history records each print, email and status change. |
| Alternative and exception workflows | A1 Reprint marked COPY; A2 Draft preview watermarked DRAFT; A3 Cancellation via credit note or reversal; Email delivery failure: retried and logged; document remains valid |
| Validation rules | Numbering scope configured before first use; Template contains mandatory fields configured per V-02 |
| Business rules | BR-DOC-001, BR-DOC-002, BR-TAX-001 |
| Expected results | Every finalised document has a unique number in its scope, a reproducible PDF and a full history. |
| Use cases | UC-08, UC-11 |
| Database entities | document_sequences, document_templates, document_snapshots, attachments, notification_records |
| API groups | /api/v1/documents, /api/v1/document-templates, /api/v1/document-sequences |
| Screens | SCR-09, SCR-10, SCR-11, SCR-12 |
| Acceptance criteria | Section 18.2.10: AT-DOC-01, AT-DOC-02, AT-DOC-03 |

Numbering behaviour. Each sequence is defined by (company, document type, optional branch, optional fiscal year) with prefix pattern, e.g., INV-{BR}-{FY}-{000000} → INV-PP1-2027-000125. The next number is taken under a row lock inside the posting transaction; if the transaction rolls back, the number is not consumed (no gaps from failures). Cancelled-before-posting documents have no number. Numbers cannot be edited. A unique constraint on (company_id, document_type, scope_key, number) prevents duplicates even if configuration is changed. Changing a sequence pattern applies only to new numbers and requires approval. Whether gap-free numbering is legally required, and any invoice numbering format, must be confirmed (V-02).
Functional requirements — DOC

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-DOC-001 | Document types | The system shall support customer invoices, supplier bills, receipt vouchers, payment vouchers, credit notes, debit notes, journal vouchers and sales- and purchase-related documents (quotation and purchase order as non-posting documents, optional). | Must | C | — | AT-DOC-101 |
| FR-DOC-002 | Sequential numbering | The system shall number documents sequentially per configured scope at finalisation, with no duplicates and no reuse. | Must | C | BR-DOC-001 | AT-DOC-01 |
| FR-DOC-003 | Document templates | The system shall maintain templates per company and document type with logo, header, footer, field layout, language (English, Khmer or bilingual) and paper size (A4 default, A5 for vouchers). | Must | C | — | AT-DOC-102 |
| FR-DOC-004 | PDF generation | The system shall generate PDF documents with correct Khmer rendering, page numbers and DRAFT watermark for unfinalised documents. | Must | C | BR-DOC-002 | AT-DOC-03 |
| FR-DOC-005 | Printable layouts | The system shall provide print-optimised layouts that do not truncate long names or descriptions. | Must | C | — | AT-DOC-103 |
| FR-DOC-006 | Email delivery | The system shall email documents to customers or suppliers with editable message templates and record delivery status. | Should | C | — | AT-DOC-104 |
| FR-DOC-007 | Document status and history | The system shall show document status and a history of creation, approval, posting, printing, emailing, cancellation and related documents. | Must | C | BR-AUD-001 | AT-DOC-105 |
| FR-DOC-008 | Document snapshot | The system shall store the data used to render a finalised document so that reprints reproduce the original content, marked COPY. | Must | P | BR-DOC-002 | AT-DOC-02 |
| FR-DOC-009 | Supporting attachments | The system shall attach supporting files to any document. | Must | C | — | AT-DOC-106 |
| FR-DOC-010 | Bilingual text | The system shall render English and Khmer labels and item descriptions where configured. | Must | C | — | AT-DOC-03 |


## 6.11 Module INV: Inventory Accounting Integration (optional)

| Element | Description |
| Module ID and name | INV — Inventory Accounting Integration (optional) |
| Business purpose | Record the accounting effects of inventory transactions supplied by an inventory system or a simple stock register, and reconcile inventory valuation to the General Ledger. A full warehouse management system is not included. |
| Actors and user roles | ACCT, FINMGR; external inventory system (integration) |
| Priority | Could Have — optional module or integration point |
| Business objectives | BO-01, BO-04 |
| Preconditions | Integration enabled; inventory accounts and valuation method configured and validated (V-04). |
| Main workflow | (1) Inventory system sends inventory events (receipts, issues/sales cost, adjustments, write-offs, returns) with quantities and values. (2) AMS validates and posts summarised journals by batch and period. (3) Accountant reviews the inventory valuation summary. (4) Period-end reconciliation compares valuation to the inventory control account. |
| Alternative and exception workflows | A1 Simple stock register within AMS for small users (Could); A2 Manual journal when integration unavailable; Rejected events listed with reasons and not partially posted |
| Validation rules | Events idempotent by source event ID; Values in base currency with currency of purchase recorded |
| Business rules | BR-INV-001, BR-IMP-001, BR-GL-007 |
| Expected results | Inventory and COGS in the GL equal the valuation supplied by the inventory system, or differences are listed. |
| Use cases | UC-10 |
| Database entities | inventory_items, inventory_events, inventory_valuation_snapshots |
| API groups | /api/v1/inventory-events, /api/v1/reports/inventory-reconciliation |
| Screens | SCR-15 |
| Acceptance criteria | Section 18.2.11: AT-INV-01, AT-INV-02 |

Accounting entries (illustrative, perpetual inventory). Purchase received: Dr Inventory / Cr AP (or goods-received-not-invoiced). Sale cost: Dr Cost of goods sold / Cr Inventory. Write-off: Dr Inventory write-off expense / Cr Inventory. Return to supplier: Dr AP / Cr Inventory. Positive adjustment: Dr Inventory / Cr Inventory adjustment gain (or expense reduction). Valuation methods that may be supported: weighted average cost and FIFO (specific identification as future option). The method and treatment must be validated against the organisation’s applicable framework (V-04).
Functional requirements — INV

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-INV-001 | Inventory accounts | The system shall configure inventory asset, COGS, write-off, adjustment and goods-received-not-invoiced accounts per company or item category. | Could | C | BR-COA-002 | AT-INV-101 |
| FR-INV-002 | Inventory purchases and goods received | The system shall post inventory receipts linked to supplier invoices or GRNI. | Could | C | BR-INV-001 | AT-INV-102 |
| FR-INV-003 | Cost of goods sold | The system shall post COGS from inventory issue or sales events. | Could | C | BR-INV-001 | AT-INV-103 |
| FR-INV-004 | Adjustments, write-offs and returns | The system shall post inventory adjustments, write-offs and returns with reasons. | Could | C | — | AT-INV-104 |
| FR-INV-005 | Valuation integration | The system shall receive valuation summaries and store snapshots per period. | Could | C | BR-INV-001 | AT-INV-105 |
| FR-INV-006 | Idempotent event intake | The system shall accept inventory events through API or file with unique source event IDs and post each once. | Could | P | BR-GL-007 | AT-INV-01 |
| FR-INV-007 | Stock valuation summary | The system shall report inventory valuation by category and location as supplied. | Could | C | — | AT-INV-106 |
| FR-INV-008 | GL reconciliation | The system shall reconcile inventory valuation to the inventory control account and list differences. | Could | C | BR-INV-001 | AT-INV-02 |


## 6.12 Module FA: Fixed Asset Management

| Element | Description |
| Module ID and name | FA — Fixed Asset Management |
| Business purpose | Maintain a fixed asset register with acquisition, depreciation, transfers, impairment, disposal and history, posting all effects to the General Ledger. |
| Actors and user roles | ACCT (register, run depreciation), FINMGR (approve, post), DEPTMGR (view own assets) |
| Priority | Should Have |
| Business objectives | BO-01, BO-04 |
| Preconditions | Asset categories with GL accounts, methods and useful-life defaults configured. |
| Main workflow | (1) Accountant registers an asset from a supplier invoice line or manually with category, cost, acquisition date, in-service date, useful life, residual value, method, location, department. (2) System generates the depreciation schedule. (3) Monthly depreciation run calculates and posts depreciation for the period. (4) Transfers, impairments and disposals are recorded with approval. (5) Register and schedules are reported. |
| Alternative and exception workflows | A1 Asset acquired via AP invoice (capitalised); A2 Change in estimate (useful life or residual) applied prospectively with approval; A3 Asset sale with proceeds; Period closed: depreciation batch rejected; Re-run: already posted assets skipped (BR-FA-002) |
| Validation rules | Cost > 0; residual ≥ 0 and < cost; useful life > 0 months; Depreciation start per convention (BR-FA-001) |
| Business rules | BR-FA-001, BR-FA-002, BR-FA-003, BR-COA-002, BR-CLS-001 |
| Expected results | Asset register, accumulated depreciation and net book value reconcile to the GL fixed-asset accounts. |
| Use cases | UC-14 |
| Database entities | fixed_assets, asset_categories, depreciation_schedules, depreciation_runs, asset_transactions |
| API groups | /api/v1/fixed-assets, /api/v1/asset-categories, /api/v1/depreciation-runs |
| Screens | SCR-14 |
| Acceptance criteria | Section 18.2.12: AT-FA-01, AT-FA-02, AT-FA-03 |

Depreciation methods (configurable): straight-line (default proposed, D-14), declining balance (rate configurable), sum-of-years’-digits (optional), units of production (Could). Monthly calculation for straight-line: (cost − residual value) ÷ useful life in months; last period absorbs rounding so that accumulated depreciation equals cost − residual exactly. Tax depreciation rules are not applied as accounting depreciation; a separate tax book is a future enhancement (V-06).
Illustrative entries. Purchase of equipment 12,000.00 on credit: Dr Equipment (cost) 12,000.00 / Cr AP 12,000.00. Monthly depreciation (60 months, residual 0): Dr Depreciation expense 200.00 / Cr Accumulated depreciation 200.00. Disposal (cost 10,000, accumulated 6,000, proceeds 3,000): Dr Bank 3,000.00; Dr Accumulated depreciation 6,000.00; Dr Loss on disposal 1,000.00 / Cr Equipment 10,000.00.
Functional requirements — FA

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-FA-001 | Asset register | The system shall maintain assets with tag number, name (English and Khmer), category, cost, acquisition date, in-service date, supplier and invoice reference, location, branch, department, custodian, useful life, residual value, method, status. | Should | C | BR-FA-001 | AT-FA-101 |
| FR-FA-002 | Asset categories | The system shall maintain asset categories with default GL accounts (cost, accumulated depreciation, depreciation expense, disposal gain/loss), method, useful life and convention. | Should | C | — | AT-FA-102 |
| FR-FA-003 | Acquisition | The system shall capitalise assets from AP invoice lines or manual entry, with GL posting when not already posted via AP. | Should | C | BR-COA-002 | AT-FA-103 |
| FR-FA-004 | Depreciation schedule | The system shall calculate and display the full depreciation schedule per asset. | Should | C | BR-FA-001 | AT-FA-01 |
| FR-FA-005 | Monthly depreciation posting | The system shall run depreciation for a period for all eligible assets, preview, approve and post a summarised journal with asset-level detail, once per asset and period. | Should | C | BR-FA-002 | AT-FA-01, AT-FA-02 |
| FR-FA-006 | Accumulated depreciation and NBV | The system shall maintain accumulated depreciation and net book value per asset, derived from posted depreciation. | Should | C | — | AT-FA-104 |
| FR-FA-007 | Disposal and sale | The system shall record disposals and sales with date, proceeds and approval, calculating and posting gain or loss. | Should | C | BR-FA-003 | AT-FA-03 |
| FR-FA-008 | Impairment | The system shall record approved impairment adjustments where applicable and adjust future depreciation. | Could | C | — | AT-FA-105 |
| FR-FA-009 | Transfers | The system shall transfer assets between branches, departments or locations with history and, where dimensions change, reclassification journals. | Should | C | — | AT-FA-106 |
| FR-FA-010 | Change in estimates | The system shall apply approved changes to useful life or residual value prospectively from the change period. | Should | P | — | AT-FA-107 |
| FR-FA-011 | Asset history and reports | The system shall show asset history and produce the fixed asset register and depreciation schedule reports. | Should | C | — | AT-FA-108 |
| FR-FA-012 | GL reconciliation | The system shall reconcile register cost and accumulated depreciation to the GL accounts. | Should | P | BR-COA-002 | AT-FA-109 |


## 6.13 Module TAX: Tax Management

| Element | Description |
| Module ID and name | TAX — Tax Management |
| Business purpose | Provide a configurable tax engine with effective-dated tax codes, rates and GL accounts, applied to documents and summarised for reporting, without hard-coding any Cambodian tax rate or rule. |
| Actors and user roles | ACCT, FINMGR (configure), tax adviser (verify), OWNER (approve configuration) |
| Priority | Must Have (tax codes on documents); Should Have (tax reports and adjustments) |
| Business objectives | BO-07 |
| Preconditions | Tax types, rates and treatments confirmed by a qualified professional (V-01). |
| Main workflow | (1) Accountant creates tax codes with type, rate history, calculation method, applicability and GL accounts. (2) Tax adviser verification recorded; code status Verified. (3) Documents apply default tax codes from customer, supplier, item or account; users may change them within permissions. (4) Posting stores tax amounts and rates on lines and posts to tax accounts. (5) Tax summary and transaction reports for a tax period are produced and exported. |
| Alternative and exception workflows | A1 Tax adjustment journal with approval; A2 Tax-inclusive pricing; Unverified code used in production with blocking enabled: rejected (BR-TAX-002) |
| Validation rules | Rate between 0 and 100 %; effective ranges do not overlap per code; GL accounts set for each tax code |
| Business rules | BR-TAX-001, BR-TAX-002, BR-TAX-003 |
| Expected results | Tax amounts are calculated consistently from verified configuration and remain unchanged on finalised documents. |
| Use cases | UC-08, UC-10 |
| Database entities | tax_codes, tax_rate_history, tax_periods, tax_adjustments |
| API groups | /api/v1/tax-codes, /api/v1/tax-periods, /api/v1/reports/tax-summary |
| Screens | SCR-22 |
| Acceptance criteria | Section 18.2.13: AT-TAX-01, AT-TAX-02, AT-TAX-03 |

Calculation. Exclusive: tax = round(net × rate). Inclusive: tax = round(gross × rate ÷ (1 + rate)); net = gross − tax. Rounding at line or document level is configurable (V-01). Compound or multi-tax lines (e.g., more than one tax on a line) are supported by applying tax codes in configured sequence. Any rate shown in this document is illustrative only.
Functional requirements — TAX

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-TAX-001 | Tax codes | The system shall maintain tax codes with code, names, tax type (e.g., output, input, withholding, exempt, zero-rated — as confirmed under V-01), calculation method and status. | Must | C | BR-TAX-002 | AT-TAX-101 |
| FR-TAX-002 | Tax rates with effective dates | The system shall store tax rate history with effective-from and effective-to dates and select the rate by the document tax date. | Must | C | BR-TAX-002 | AT-TAX-01 |
| FR-TAX-003 | Inclusive and exclusive pricing | The system shall support tax-inclusive and tax-exclusive line amounts. | Must | C | — | AT-TAX-02 |
| FR-TAX-004 | Tax treatment by transaction type | The system shall define default tax codes per transaction type, customer, supplier, item category or account. | Should | C | — | AT-TAX-102 |
| FR-TAX-005 | Tax on documents | The system shall calculate and display tax per line and in total on invoices, bills and notes, and store amounts and rate references at posting. | Must | C | BR-TAX-001 | AT-TAX-01 |
| FR-TAX-006 | Tax GL accounts | The system shall post tax to the accounts mapped to each tax code. | Must | C | BR-TAX-003 | AT-TAX-103 |
| FR-TAX-007 | Tax periods | The system shall define tax periods (e.g., monthly) per company independent of accounting periods, with status. | Should | C | — | AT-TAX-104 |
| FR-TAX-008 | Tax summary and transaction reports | The system shall produce tax summaries and detailed tax transaction listings by tax code and period, exportable to Excel and CSV. | Should | C | BR-RPT-002 | AT-TAX-105 |
| FR-TAX-009 | Tax adjustments | The system shall record approved tax adjustment journals with reason. | Should | C | BR-SEC-001 | AT-TAX-106 |
| FR-TAX-010 | Configuration separate from code | The system shall hold all tax rules in configuration tables, never in application code. | Must | C | BR-TAX-002 | AT-TAX-107 |
| FR-TAX-011 | Change audit | The system shall record who changed tax settings, when, before and after values, and approval. | Must | C | BR-AUD-001 | AT-TAX-108 |
| FR-TAX-012 | Verification status | The system shall record verification status, verifier and reference document per tax code, and optionally block unverified codes in production. | Must | P | BR-TAX-002 | AT-TAX-03 |


## 6.14 Module BUD: Budget Management

| Element | Description |
| Module ID and name | BUD — Budget Management |
| Business purpose | Prepare, approve and revise annual and monthly budgets by account, department and branch, and compare them with posted actuals with variance analysis and alerts. |
| Actors and user roles | FINMGR (prepare, consolidate, approve), DEPTMGR (prepare own department), OWNER (approve), ACCT |
| Priority | Should Have |
| Business objectives | BO-04, BO-03 |
| Preconditions | Fiscal year and dimensions defined. |
| Main workflow | (1) Finance Manager opens a budget version for a fiscal year. (2) Department managers enter or import monthly amounts by account and dimension. (3) Finance Manager reviews and submits; Owner approves. (4) Approved budget is compared with posted actuals. (5) Revisions create new versions with approval. |
| Alternative and exception workflows | A1 Annual amount spread evenly or by profile across months; A2 Copy prior-year actuals or budget with percentage change; Spending limit exceeded: warn or block per D-13 |
| Validation rules | Budget accounts must be revenue or expense (balance-sheet budgets optional); Version status workflow |
| Business rules | BR-BUD-001, BR-BUD-002 |
| Expected results | Managers see budget, actual and variance from posted data for their scope. |
| Use cases | UC-13 |
| Database entities | budgets, budget_lines, budget_revisions |
| API groups | /api/v1/budgets, /api/v1/reports/budget-vs-actual |
| Screens | SCR-23 |
| Acceptance criteria | Section 18.2.14: AT-BUD-01, AT-BUD-02, AT-BUD-03 |

Functional requirements — BUD

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-BUD-001 | Annual and monthly budgets | The system shall maintain budgets per company and fiscal year with monthly amounts by account and dimensions. | Should | C | BR-BUD-002 | AT-BUD-101 |
| FR-BUD-002 | Department and branch budgets | The system shall allow budgets by department and branch, editable by their managers within scope. | Should | C | BR-SEC-003 | AT-BUD-102 |
| FR-BUD-003 | Revenue and expense budgets | The system shall budget revenue and expense accounts and optionally balance-sheet accounts. | Should | C | — | AT-BUD-103 |
| FR-BUD-004 | Budget approval | The system shall route budget versions for approval and lock approved versions. | Should | C | BR-BUD-002 | AT-BUD-02 |
| FR-BUD-005 | Budget revisions | The system shall create revised versions with reason and keep history of all versions. | Should | C | BR-BUD-002 | AT-BUD-02 |
| FR-BUD-006 | Budget versus actual | The system shall report budget, posted actual, variance and variance percentage by period and dimension. | Should | C | BR-BUD-001 | AT-BUD-01 |
| FR-BUD-007 | Variance analysis | The system shall highlight variances beyond configurable thresholds and allow commentary per line. | Should | C | — | AT-BUD-104 |
| FR-BUD-008 | Spending limits | The system shall optionally warn or block expense and supplier-invoice approval that exceeds remaining budget. | Could | C | BR-BUD-001 | AT-BUD-105 |
| FR-BUD-009 | Budget alerts | The system shall notify budget owners when utilisation reaches configurable thresholds (e.g., 80 %, 100 %). | Should | C | — | AT-BUD-03 |
| FR-BUD-010 | Budget import | The system shall import budget lines from Excel templates with validation. | Should | P | BR-IMP-001 | AT-BUD-106 |


## 6.15 Module RPT: Financial Reporting

| Element | Description |
| Module ID and name | RPT — Financial Reporting |
| Business purpose | Produce financial statements and supporting reports from posted ledger data with defined calculations, filters, permissions, exports and validation checks. |
| Actors and user roles | FINMGR, ACCT, OWNER, AUDITOR, DEPTMGR (scope), READONLY (permitted) |
| Priority | Must Have (core statements and supporting reports); Should Have (analytics) |
| Business objectives | BO-04 |
| Preconditions | Posted data; statement mappings configured. |
| Main workflow | (1) User selects a report, company, period or date range, filters and options. (2) Backend runs the report in a consistent read transaction with permission scopes. (3) Validation checks run (e.g., balance sheet balances, unmapped accounts). (4) Report is displayed with header showing basis, period, currency. (5) User exports to PDF, Excel or CSV. |
| Alternative and exception workflows | A1 Comparative periods; A2 Large reports generated in background; Validation failure: report shown with warning banner and cannot be marked final |
| Validation rules | Date range within defined fiscal years; User scopes applied |
| Business rules | BR-RPT-001, BR-RPT-002, BR-RPT-003, BR-GL-002 |
| Expected results | Reports reproduce the same figures for the same parameters and reconcile to the trial balance. |
| Use cases | UC-13, UC-16 |
| Database entities | report_definitions, statement_mappings, report_runs |
| API groups | /api/v1/reports/* |
| Screens | SCR-07, SCR-08, SCR-15 |
| Acceptance criteria | Section 18.2.15: AT-RPT-01, AT-RPT-02, AT-RPT-03, AT-RPT-04 |

The report catalogue, calculation rules and validation checks are specified in Section 15.
Functional requirements — RPT

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-RPT-001 | Trial balance | The system shall produce the trial balance (RPT-01). | Must | C | BR-GL-002 | AT-RPT-101 |
| FR-RPT-002 | General ledger report | The system shall produce the general ledger report (RPT-02). | Must | C | BR-RPT-001 | AT-RPT-102 |
| FR-RPT-003 | Balance sheet | The system shall produce the statement of financial position (RPT-03) and validate that assets equal liabilities plus equity. | Must | C | BR-RPT-003 | AT-RPT-01 |
| FR-RPT-004 | Income statement | The system shall produce the profit and loss statement (RPT-04) reconciling to revenue and expense account movements. | Must | C | BR-RPT-003 | AT-RPT-02 |
| FR-RPT-005 | Cash flow statement | The system shall produce the cash flow statement (RPT-05) using the indirect method by default (D-15) and reconcile net cash movement to cash account balances. | Should | C | BR-RPT-003 | AT-RPT-103 |
| FR-RPT-006 | Statement of changes in equity | The system shall produce the statement of changes in equity (RPT-06) where applicable. | Should | C | BR-RPT-003 | AT-RPT-104 |
| FR-RPT-007 | Receivable and payable reports | The system shall produce AR aging, AP aging, customer balances, supplier balances, outstanding invoices and outstanding payables (RPT-07 to RPT-10, RPT-24, RPT-25). | Must | C | — | AT-RPT-105 |
| FR-RPT-008 | Cash and bank reports | The system shall produce cashbook, bankbook and bank reconciliation reports (RPT-11 to RPT-13). | Must | C | — | AT-RPT-106 |
| FR-RPT-009 | Revenue and expense analysis | The system shall produce revenue by period and expenses by category, department and branch (RPT-14 to RPT-17). | Must | C | — | AT-RPT-107 |
| FR-RPT-010 | Tax, asset and budget reports | The system shall produce tax summary, fixed asset register, depreciation schedule and budget-versus-actual reports (RPT-18 to RPT-21). | Should | C | — | AT-RPT-108 |
| FR-RPT-011 | Control reports | The system shall produce journal entry, audit trail, reopened-period postings, self-approval exceptions and subledger reconciliation reports (RPT-22, RPT-23, RPT-28, RPT-30, RPT-31). | Must | C | — | AT-RPT-109 |
| FR-RPT-012 | FX reports | The system shall produce realised and unrealised FX gain/loss reports (RPT-26, RPT-27). | Should | C | BR-FX-003 | AT-RPT-110 |
| FR-RPT-013 | Ratios and KPIs | The system shall produce financial ratios and KPIs (RPT-29) with formulas shown. | Could | C | — | AT-RPT-111 |
| FR-RPT-014 | Report header and basis | The system shall show company, branch filter, period, basis, currency, run time and user on every report and export. | Must | C | BR-RPT-002 | AT-RPT-112 |
| FR-RPT-015 | Comparatives | The system shall show comparative columns (prior period, prior year, budget) on core statements. | Should | P | — | AT-RPT-113 |
| FR-RPT-016 | Exports | The system shall export reports to PDF, Excel (.xlsx) and CSV with values identical to the screen. | Must | C | — | AT-RPT-03 |
| FR-RPT-017 | Drafts excluded | The system shall exclude unposted documents from official reports unless the user selects an option that labels the report as including unposted transactions. | Must | C | BR-RPT-001 | AT-RPT-04 |


## 6.16 Module FX: Foreign Currency Management

| Element | Description |
| Module ID and name | FX — Foreign Currency Management |
| Business purpose | Record transactions in multiple currencies against a configurable base currency, maintain exchange rates, calculate realised and unrealised exchange differences and preserve original amounts and rates. |
| Actors and user roles | ACCT, FINMGR (rates, revaluation), all document users |
| Priority | Must Have (transaction currencies, rates); Should Have (revaluation) |
| Business objectives | BO-01, BO-09 |
| Preconditions | Base currency per company; supported currencies; rate source and types configured (D-11). |
| Main workflow | (1) Rates are entered manually or imported for each date and rate type. (2) Documents in foreign currency take the transaction-date rate (or override with permission). (3) Posting stores transaction amount, rate and base amount per line. (4) Settlement posts realised differences. (5) Period-end revaluation posts unrealised differences with auto-reversal. |
| Alternative and exception workflows | A1 Rate override with reason; A2 Revaluation preview without posting; Missing rate blocks posting (BR-FX-002) |
| Validation rules | Rate > 0; one rate per currency pair, date and type; Precision per currency (BR-FX-005) |
| Business rules | BR-FX-001, BR-FX-002, BR-FX-003, BR-FX-004, BR-FX-005 |
| Expected results | Original currency amounts and rates are preserved; exchange differences are measured and posted consistently. |
| Use cases | UC-09, UC-11 |
| Database entities | currencies, exchange_rates, fx_revaluation_runs, fx_revaluation_lines |
| API groups | /api/v1/currencies, /api/v1/exchange-rates, /api/v1/fx-revaluations |
| Screens | SCR-24 |
| Acceptance criteria | Section 18.2.16: AT-FX-01, AT-FX-02, AT-FX-03, AT-FX-04 |

Currency representation. Transaction currency (document currency) amounts and base (functional) currency amounts are stored on every line; the rate is stored as base units per one unit of transaction currency (e.g., 4,100 KHR per USD for a KHR-base company, or 0.000243902 USD per KHR for a USD-base company — stored to 8 decimal places, with the inverse displayed for readability). Reporting currency is the base currency in release 1. Precision: USD 2 decimals; KHR 0 decimals for document totals (configurable, e.g., cash rounding to 100 riel for cash documents only); other currencies per ISO 4217 minor units; internal 4 decimals.
Illustrative realised gain (USD base company). Invoice KHR 4,100,000 at 4,100 KHR/USD → AR 1,000.00 USD. Customer pays KHR 4,100,000 when the rate is 4,000 → bank receives 1,025.00 USD. Entry: Dr Bank 1,025.00; Cr AR 1,000.00; Cr Realised FX gain 25.00.
Functional requirements — FX

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-FX-001 | Currency master | The system shall maintain currencies with ISO code, names, symbol, minor units, rounding rules and active status. | Must | C | BR-FX-005 | AT-FX-101 |
| FR-FX-002 | Base currency per company | The system shall use each company’s configured base currency for ledger amounts and shall not assume USD. | Must | C | BR-FX-001 | AT-FX-102 |
| FR-FX-003 | Exchange-rate records | The system shall store rates by currency pair, date, rate type (e.g., transaction, closing, average) and source with history. | Must | C | BR-FX-002 | AT-FX-103 |
| FR-FX-004 | Rate sources | The system shall allow configuration of rate sources (manual entry, file import; automated source integration as future option) per company (D-11, V-10). | Must | C | BR-FX-002 | AT-FX-104 |
| FR-FX-005 | Manual rate entry with permissions | The system shall allow rate entry and change only by permitted users, with audit. | Must | C | BR-AUD-001 | AT-FX-105 |
| FR-FX-006 | Transaction-date rates | The system shall default the rate for the document date and rate type and allow override with permission and reason. | Must | C | BR-FX-002 | AT-FX-04 |
| FR-FX-007 | Preserve original amounts and rates | The system shall store transaction amount, rate, rate date, rate source and base amount on each posted line and never recalculate them. | Must | C | BR-FX-001 | AT-FX-01 |
| FR-FX-008 | Foreign currency balances | The system shall show customer, supplier and bank balances in transaction currency and base currency. | Must | C | — | AT-FX-106 |
| FR-FX-009 | Realised exchange differences | The system shall calculate and post realised gains and losses on settlement and on transfers between currencies. | Must | C | BR-FX-003 | AT-FX-02 |
| FR-FX-010 | Revaluation | The system shall revalue selected open foreign-currency monetary balances at period-end closing rates with preview, approval, posting and automatic reversal on the next period start. | Should | C | BR-FX-004 | AT-FX-03 |
| FR-FX-011 | Rounding account | The system shall post conversion rounding differences to the configured rounding account. | Must | P | BR-FX-005 | AT-FX-107 |
| FR-FX-012 | FX reports | The system shall report realised and unrealised exchange differences by account, customer, supplier and currency. | Should | C | — | AT-FX-108 |


## 6.17 Module CLS: Period-End and Year-End Closing

| Element | Description |
| Module ID and name | CLS — Period-End and Year-End Closing |
| Business purpose | Control accounting periods, guide month-end and year-end procedures with a checklist, post closing adjustments, lock periods and manage authorised reopening. |
| Actors and user roles | FINMGR (close), ACCT (checklist tasks), OWNER (approve reopen, year-end) |
| Priority | Must Have (period status and locking, checklist); Should Have (automated year-end) |
| Business objectives | BO-01, BO-03, BO-04 |
| Preconditions | Periods defined; posting rules and default accounts configured. |
| Main workflow | (1) Finance Manager soft-closes the period (only adjusting journals allowed). (2) Checklist tasks are completed: bank reconciliations, AR and AP review, accruals and prepayments, depreciation, FX revaluation, subledger reconciliation, suspense review, trial balance and statement review. (3) Finance Manager closes the period; it is locked. (4) At year-end, all periods closed, the closing journal to retained earnings is generated and posted, and the next year opens. |
| Alternative and exception workflows | A1 Reopen a closed period with Owner approval; A2 Period 13 for audit adjustments; Close blocked: list of blocking items shown |
| Validation rules | Mandatory checklist items completed or waived with reason; No Draft or Approved system documents dated in the period (or explicitly carried forward) |
| Business rules | BR-CLS-001, BR-CLS-002, BR-CLS-003, BR-CLS-004, BR-FX-004, BR-FA-002 |
| Expected results | Closed periods cannot be changed without authorised, audited reopening; year-end equity is correct. |
| Use cases | UC-15 |
| Database entities | accounting_periods, period_close_checklists, period_status_history, journal_entries |
| API groups | /api/v1/accounting-periods, /api/v1/period-close, /api/v1/fiscal-years/{id}/close |
| Screens | SCR-17 |
| Acceptance criteria | Section 18.2.17: AT-CLS-01, AT-CLS-02, AT-CLS-03, AT-CLS-04 |

Prevention of unauthorised backdated entries. (1) Posting service checks period status for the posting date under a shared row lock; closing takes an exclusive lock, so no posting can slip in during closing. (2) Users cannot choose the journal number or posting timestamp. (3) Soft-closed periods accept only adjusting journals by users with the period-adjustment permission. (4) Reopening requires a request with reason, Owner approval, a defined window, and is listed with all postings made during it (RPT-28). (5) All attempts to post into closed periods are audited.
Functional requirements — CLS

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-CLS-001 | Period management | The system shall show periods per fiscal year with status and allow transitions Open, Soft-Closed, Closed and Reopened per BR-CLS-002. | Must | C | BR-CLS-002 | AT-CLS-101 |
| FR-CLS-002 | Period locking | The system shall reject postings into Closed periods and restrict Soft-Closed periods to adjusting journals by authorised users. | Must | C | BR-CLS-001 | AT-CLS-01, AT-CLS-02 |
| FR-CLS-003 | Month-end checklist | The system shall provide a configurable checklist with tasks, owners, due dates, status, evidence links and automatic checks where possible. | Should | C | — | AT-CLS-102 |
| FR-CLS-004 | Bank reconciliation review | The checklist shall show reconciliation status for every bank account for the period. | Should | C | BR-CB-002 | AT-CLS-103 |
| FR-CLS-005 | Receivables and payables review | The checklist shall show subledger-to-control reconciliation and aging review status. | Should | C | BR-COA-002 | AT-CLS-104 |
| FR-CLS-006 | Accruals and prepayments | The system shall support accrual and prepayment adjustment journals, including automatic reversal on the first day of the next period and prepayment amortisation schedules. | Should | C | BR-GL-010 | AT-CLS-105 |
| FR-CLS-007 | Depreciation posting check | The checklist shall confirm depreciation has been posted for the period. | Should | C | BR-FA-002 | AT-CLS-106 |
| FR-CLS-008 | FX revaluation step | The checklist shall include foreign-currency revaluation where enabled. | Should | C | BR-FX-004 | AT-CLS-107 |
| FR-CLS-009 | Trial balance and statement review | The checklist shall require review sign-off of the trial balance and statements. | Should | C | BR-RPT-003 | AT-CLS-108 |
| FR-CLS-010 | Year-end closing | The system shall perform year-end close: verify all periods closed, generate and post the closing journal transferring income and expense balances to retained earnings, and open the next fiscal year. | Must | C | BR-CLS-004 | AT-CLS-04 |
| FR-CLS-011 | Retained earnings treatment | The system shall use the configured retained earnings account and show current-year earnings in the balance sheet before year-end close. | Must | C | BR-CLS-004 | AT-CLS-04 |
| FR-CLS-012 | Authorised reopening | The system shall reopen a closed period only after approved request and record the reopening, the postings made and the re-closing. | Must | C | BR-CLS-003 | AT-CLS-03 |
| FR-CLS-013 | Year-end re-close | If a closed year is reopened and adjusted, the system shall post an adjusting closing entry for the net change rather than duplicating the closing journal. | Should | P | BR-CLS-004 | AT-CLS-109 |


## 6.18 Module AUD: Audit Trail and Internal Controls

| Element | Description |
| Module ID and name | AUD — Audit Trail and Internal Controls |
| Business purpose | Record critical events with full context in an append-only, tamper-evident log and support internal control monitoring. |
| Actors and user roles | AUDITOR, OWNER, FINMGR (view), SYSADMIN (view technical events) |
| Priority | Must Have |
| Business objectives | BO-02, BO-03 |
| Preconditions | Audit service active; cannot be disabled by application users. |
| Main workflow | (1) A user or system process performs a critical action. (2) The audit service writes the event in the same transaction. (3) Authorised users search, view and export events. (4) Integrity verification runs daily. |
| Alternative and exception workflows | A1 Archival of old audit records with integrity preserved; Audit write failure rolls back the business action (BR-AUD-002) |
| Validation rules | Each event: event ID, user ID, event type, timestamp (UTC), company, branch, affected entity and ID, previous and new values (changed fields), source (IP, user agent, API client), correlation ID, reason where required |
| Business rules | BR-AUD-001, BR-AUD-002, BR-SEC-002 |
| Expected results | All critical actions are traceable; audit records cannot be altered by ordinary users. |
| Use cases | UC-16 |
| Database entities | audit_logs, user_activity_logs |
| API groups | /api/v1/audit-logs |
| Screens | SCR-18 |
| Acceptance criteria | Section 18.2.18: AT-AUD-01, AT-AUD-02, AT-AUD-03 |

Events recorded (minimum): login, logout, failed login, lockout; user creation, activation, deactivation; role and permission changes; chart of accounts changes; document and journal creation, edits before posting, submission, approval, rejection, posting, reversal, cancellation; payment creation, approval, release; receipt allocation and unallocation; exchange-rate changes; tax-setting changes; period soft-close, close, reopen, year-end close; bank reconciliation completion and reopening; imports; report and data exports (financial reports, audit logs, master data); configuration changes; attachment additions and downloads of sensitive documents.
Functional requirements — AUD

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-AUD-001 | Critical event logging | The system shall record the events listed in Section 6.18 with the fields in the validation rules. | Must | C | BR-AUD-002 | AT-AUD-01 |
| FR-AUD-002 | Before and after values | The system shall store previous and new values of changed fields for configuration, master data and draft document edits, masking secrets. | Must | C | — | AT-AUD-101 |
| FR-AUD-003 | Reason capture | The system shall require a reason for reversals, overrides, write-offs, reopenings, rate overrides and duplicate-warning overrides and store it in the audit record. | Must | C | — | AT-AUD-03 |
| FR-AUD-004 | Append-only protection | The system shall prevent modification and deletion of audit records by application users through database privileges and a hash chain. | Must | C | BR-AUD-001 | AT-AUD-02 |
| FR-AUD-005 | Audit viewer | The system shall provide search by date range, user, event type, entity, company and branch with pagination and drill-down to the record. | Must | C | — | AT-AUD-102 |
| FR-AUD-006 | Audit export | The system shall export audit search results to Excel and CSV for permitted users, and log the export. | Should | C | BR-AUD-001 | AT-AUD-103 |
| FR-AUD-007 | Integrity verification | The system shall verify the audit hash chain daily and alert on any break. | Should | P | BR-AUD-001 | AT-AUD-104 |
| FR-AUD-008 | Control exception monitoring | The system shall provide control reports: self-approvals, overrides, postings in reopened periods, manual postings to control accounts, rate overrides, after-hours postings. | Should | P | BR-SEC-002 | AT-AUD-105 |
| FR-AUD-009 | Audit retention and archival | The system shall retain audit records per the retention policy (Section 11.10) and archive them without loss of integrity. | Must | C | — | AT-AUD-106 |


## 6.19 Module DASH: Dashboard and Financial Analytics

| Element | Description |
| Module ID and name | DASH — Dashboard and Financial Analytics |
| Business purpose | Give each role a concise view of financial position, performance, cash and pending work, calculated from posted data, with drill-down to transactions. |
| Actors and user roles | OWNER, FINMGR, ACCT, APO, ARO, CASHIER, DEPTMGR, AUDITOR, READONLY (role-specific widgets) |
| Priority | Should Have |
| Business objectives | BO-04, BO-05 |
| Preconditions | User has dashboard permission; company selected. |
| Main workflow | (1) User opens the dashboard; widgets for the role, company and branch scope load. (2) User changes period or company. (3) User clicks a KPI to open underlying transactions (if permitted). |
| Alternative and exception workflows | A1 No posted data: empty states with guidance; Widget calculation timeout: retry option; other widgets unaffected |
| Validation rules | KPIs from posted data unless labelled “pending” |
| Business rules | BR-RPT-001, BR-RPT-002, BR-SEC-003, BR-SEC-004 |
| Expected results | KPIs match the corresponding reports for the same parameters. |
| Use cases | UC-13 |
| Database entities | journal_entry_lines, customer_invoices, supplier_invoices, bank_reconciliations, approval_requests |
| API groups | /api/v1/dashboard |
| Screens | SCR-02 |
| Acceptance criteria | Section 18.2.19: AT-DASH-01, AT-DASH-02 |

KPI definitions (for selected company, branch scope and period; base currency).

| KPI | Calculation | Data source |
| Total revenue | Σ credits − Σ debits on revenue accounts (posted) in period | Posted journal lines |
| Total expenses | Σ debits − Σ credits on expense and cost-of-sales accounts (posted) in period | Posted journal lines |
| Net profit or loss | Total revenue − total expenses | Derived |
| Cash balance | Σ balances of cash accounts at end of period (posted) | Posted lines on cash accounts |
| Bank balance | Σ balances of bank accounts at end of period (posted) | Posted lines on bank accounts |
| Accounts receivable | AR control balance at date; also Σ open invoice balances (should match) | GL and AR subledger |
| Accounts payable | AP control balance at date; also Σ open supplier balances | GL and AP subledger |
| Overdue receivables | Σ outstanding balance of invoices with due date < today | AR |
| Upcoming payables | Σ outstanding supplier invoices due in next N days (default 14) | AP |
| Monthly revenue / expense / profit trends | Monthly values of the above for the last 12 periods | Posted lines |
| Budget utilisation | Posted actual ÷ approved budget × 100, by department | Budgets and posted lines |
| Bank reconciliation status | Last completed reconciliation date and unreconciled item count per bank account | Reconciliations |
| Pending approvals | Count of documents awaiting the user’s approval (labelled pending, not financial) | Approval requests |
| Recent financial transactions | Last 10 posted journals within scope | Journals |

Functional requirements — DASH

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-DASH-001 | Role-specific dashboard | The system shall show widgets according to role and scope. | Should | C | BR-SEC-003 | AT-DASH-101 |
| FR-DASH-002 | Revenue, expense and profit KPIs | The system shall show total revenue, total expenses and net profit or loss for the period using the definitions in Section 6.19. | Should | C | BR-RPT-001 | AT-DASH-01 |
| FR-DASH-003 | Cash and bank KPIs | The system shall show cash and bank balances by account and total. | Should | C | — | AT-DASH-102 |
| FR-DASH-004 | AR and AP KPIs | The system shall show AR, AP, overdue receivables and upcoming payables. | Should | C | — | AT-DASH-103 |
| FR-DASH-005 | Trends | The system shall show 12-month revenue, expense and profit trend charts. | Should | C | — | AT-DASH-104 |
| FR-DASH-006 | Budget utilisation | The system shall show budget utilisation for permitted departments. | Could | C | BR-BUD-001 | AT-DASH-105 |
| FR-DASH-007 | Reconciliation status | The system shall show reconciliation status per bank account. | Should | C | — | AT-DASH-106 |
| FR-DASH-008 | Pending approvals and recent transactions | The system shall show the user’s pending approvals and recent posted transactions. | Should | C | — | AT-DASH-107 |
| FR-DASH-009 | Posted versus pending distinction | The system shall label any widget that includes unposted data and never mix pending amounts into posted KPIs. | Must | C | BR-RPT-001 | AT-DASH-02 |
| FR-DASH-010 | Drill-down | The system shall open the underlying transactions or report when a KPI is clicked, subject to permissions. | Should | C | — | AT-DASH-108 |


## 6.20 Module WFL: Notifications and Approval Workflows

| Element | Description |
| Module ID and name | WFL — Notifications and Approval Workflows |
| Business purpose | Route documents for approval using configurable rules, support delegation and escalation, and notify users of approvals, due items and system events. |
| Actors and user roles | All approvers; FINMGR and SYSADMIN (configure rules and notifications) |
| Priority | Must Have (approvals); Should Have (reminders, email) |
| Business objectives | BO-03, BO-08 |
| Preconditions | Approval rules and notification settings configured. |
| Main workflow | (1) Document submitted. (2) Rule engine selects the approval path by type, amount, company, branch, department and role. (3) Approvers receive in-app (and optionally email) notifications. (4) Each approver approves or rejects with comment. (5) Final approval moves the document to Approved; escalations occur on timeout. |
| Alternative and exception workflows | A1 Delegation during absence; A2 Parallel approvers (any one / all); No eligible approver: document flagged and Finance Manager notified |
| Validation rules | Approver must hold permission and limit; SoD enforced; Rules cannot leave a document without any eligible approver (validation at configuration) |
| Business rules | BR-SEC-001, BR-SEC-002, BR-WFL-001 |
| Expected results | Every document requiring approval is approved by eligible users only, with a complete record. |
| Use cases | UC-05 |
| Database entities | approval_rules, approval_requests, approval_actions, delegations, notification_records |
| API groups | /api/v1/approvals, /api/v1/approval-rules, /api/v1/notifications |
| Screens | SCR-26 |
| Acceptance criteria | Section 18.2.20: AT-WFL-01, AT-WFL-02, AT-WFL-03 |

Functional requirements — WFL

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-WFL-001 | Approval rules | The system shall configure approval rules by transaction type, amount band, company, branch, department and role, with sequential and parallel steps. | Must | C | BR-SEC-001 | AT-WFL-01 |
| FR-WFL-002 | Approval inbox | The system shall provide an inbox of pending approvals with document summary, attachments, history and approve/reject actions. | Must | C | — | AT-WFL-101 |
| FR-WFL-003 | Rejection with comment | The system shall require a comment when rejecting and return the document to the preparer. | Must | P | — | AT-WFL-102 |
| FR-WFL-004 | Delegation | The system shall allow approvers to delegate for a date range to eligible users, audited. | Should | C | BR-WFL-001 | AT-WFL-02 |
| FR-WFL-005 | Escalation | The system shall escalate approvals pending beyond a configurable time to the next level. | Should | C | BR-WFL-001 | AT-WFL-03 |
| FR-WFL-006 | Pending approval notifications | The system shall notify approvers of new pending approvals in-app and optionally by email. | Must | C | — | AT-WFL-103 |
| FR-WFL-007 | Overdue invoice reminders | The system shall notify AR users (and optionally customers) of overdue invoices. | Should | C | — | AT-WFL-104 |
| FR-WFL-008 | Upcoming payment reminders | The system shall notify AP users of supplier invoices due within a configurable window. | Should | C | — | AT-WFL-105 |
| FR-WFL-009 | Budget threshold notifications | The system shall notify budget owners at configured thresholds. | Should | C | — | AT-WFL-106 |
| FR-WFL-010 | Reconciliation and closing reminders | The system shall remind users of unreconciled bank accounts and upcoming period-close tasks. | Should | C | — | AT-WFL-107 |
| FR-WFL-011 | Failed scheduled task notifications | The system shall notify administrators of failed background or scheduled tasks. | Must | C | — | AT-WFL-108 |
| FR-WFL-012 | Email notifications | The system shall send optional email notifications through a configured provider, with user preferences. | Should | C | — | AT-WFL-109 |


## 6.21 Module IMP: Data Import and Export

| Element | Description |
| Module ID and name | IMP — Data Import and Export |
| Business purpose | Import master data, opening balances, journals, bank statements and invoices safely with validation and preview, and export data in Excel, CSV and PDF with permissions and audit. |
| Actors and user roles | ACCT, FINMGR, ARO (customers), APO (suppliers), SYSADMIN (technical) |
| Priority | Must Have |
| Business objectives | BO-08 |
| Preconditions | Templates available; user has import permission for the data type. |
| Main workflow | (1) User downloads the template and prepares the file. (2) User uploads the file; system validates structure, data types, references, duplicates and accounting rules. (3) System shows preview with valid rows and errors. (4) User confirms; system commits the batch in one transaction (or rejects if errors are blocking). (5) Import history records the batch, user, counts and error report. |
| Alternative and exception workflows | A1 Correction: fix file and re-upload; A2 Rollback of a committed master-data batch where no dependent records exist; financial imports are corrected by reversal; Any unbalanced journal or invalid account blocks the whole financial batch |
| Validation rules | Accepted formats: .xlsx, .csv (UTF-8); maximum 20 MB and 50,000 rows per file (proposed); Required columns per template (Section 6.21) |
| Business rules | BR-IMP-001, BR-CFG-002, BR-GL-001 |
| Expected results | No invalid or unbalanced financial data is posted by import; every import is traceable. |
| Use cases | UC-16 |
| Database entities | import_batches, import_errors, import_mappings |
| API groups | /api/v1/imports, /api/v1/exports |
| Screens | SCR-25 |
| Acceptance criteria | Section 18.2.21: AT-IMP-01, AT-IMP-02, AT-IMP-03 |

Import templates and required columns.

| Import | Required columns | Duplicate detection | Result |
| Customers / suppliers | code, name_en, currency, payment_terms (name_km, tax_id, contacts optional) | code; tax_id; name similarity warning | Master records (Draft or Active) |
| Chart of accounts | code, name_en, type, parent_code, posting_flag, normal_balance (name_km, category, mapping optional) | code | Accounts |
| Opening balances | account_code, debit, credit, branch (dimensions optional); subledger detail files for AR, AP, bank, fixed assets | one opening journal per company | Draft opening journal plus subledger detail |
| Journals | journal_ref, posting_date, description, account_code, debit, credit, currency, rate (dimensions optional) | journal_ref within batch and against existing references | Draft journals |
| Bank statements | date, description, amount (or debit and credit), reference optional, balance optional | date + amount + reference + row hash | Statement lines |
| Invoices (where applicable) | customer_or_supplier_code, invoice_no, invoice_date, due_date, currency, line description, account, amount, tax_code | invoice_no per party | Draft documents |

Functional requirements — IMP

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-IMP-001 | Customer and supplier import | The system shall import customers and suppliers from templates with validation and duplicate detection. | Must | C | BR-IMP-001 | AT-IMP-101 |
| FR-IMP-002 | Chart of accounts import | The system shall import the chart of accounts with hierarchy validation. | Must | C | BR-COA-003 | AT-IMP-102 |
| FR-IMP-003 | Opening balance import | The system shall import opening balances as a balanced Draft opening journal with subledger detail, followed by reconciliation sign-off. | Must | C | BR-CFG-002 | AT-IMP-02 |
| FR-IMP-004 | Journal import | The system shall import journals as Drafts, rejecting the batch if any journal is unbalanced or references invalid accounts. | Must | C | BR-IMP-001 | AT-IMP-01 |
| FR-IMP-005 | Bank statement import | The system shall import bank statements with saved mappings (see FR-CB-008). | Must | C | — | AT-IMP-103 |
| FR-IMP-006 | Invoice import | The system shall import customer and supplier invoices as Drafts where applicable. | Could | C | BR-IMP-001 | AT-IMP-104 |
| FR-IMP-007 | Preview and error report | The system shall show a preview and downloadable error report (row, column, value, error) before commit. | Must | C | — | AT-IMP-01 |
| FR-IMP-008 | Import history | The system shall keep import history with file name, hash, user, time, counts, status and links to created records. | Must | C | — | AT-IMP-105 |
| FR-IMP-009 | Permission checks | The system shall require data-type-specific import permissions and apply company and branch scope to imported data. | Must | C | BR-SEC-003 | AT-IMP-106 |
| FR-IMP-010 | Rollback and correction | The system shall allow rollback of master-data batches without dependent records; financial imports are corrected by deleting drafts or reversing posted entries. | Should | C | BR-GL-004 | AT-IMP-107 |
| FR-IMP-011 | Exports | The system shall export lists and reports to Excel, CSV and PDF, respecting permissions and logging financial exports. | Must | C | BR-AUD-001 | AT-IMP-03 |


## 6.22 Module CFG: System Configuration

| Element | Description |
| Module ID and name | CFG — System Configuration |
| Business purpose | Hold configurable settings for companies, currencies, languages, fiscal calendars, numbering, tax, approvals, notifications, statement mappings, templates, backups and dimensions, with permissions, approval and history. |
| Actors and user roles | FINMGR (accounting settings), OWNER (approve sensitive), SYSADMIN (technical settings) |
| Priority | Must Have |
| Business objectives | BO-07, BO-09 |
| Preconditions | Installation complete. |
| Main workflow | (1) Authorised user edits a settings group. (2) Sensitive accounting settings create a change request. (3) Approver approves; change takes effect (immediately or at effective date). (4) History records the change. |
| Alternative and exception workflows | A1 Initial setup wizard; Invalid configuration blocks save with explanation |
| Validation rules | Settings validated against schemas; dependencies checked (e.g., cannot remove a currency in use) |
| Business rules | BR-CFG-001, BR-TAX-002, BR-DOC-001, BR-AUD-001 |
| Expected results | Behaviour that varies by organisation is controlled by approved, audited configuration, not code changes. |
| Use cases | UC-02 |
| Database entities | company_settings, setting_history, document_sequences, approval_rules, statement_mappings, dimension_definitions |
| API groups | /api/v1/settings |
| Screens | SCR-19 |
| Acceptance criteria | Section 18.2.22: AT-CFG-01, AT-CFG-02 |

Functional requirements — CFG

| ID | Requirement | Description and Expected Result | Priority | Src | Business Rules | Acceptance |
| FR-CFG-001 | Company settings | The system shall configure company profile, basis, base currency, default accounts and readiness status. | Must | C | BR-CFG-001 | AT-CFG-101 |
| FR-CFG-002 | Currency settings | The system shall configure supported currencies, rate types, sources and rounding. | Must | C | BR-FX-005 | AT-CFG-02 |
| FR-CFG-003 | Language settings | The system shall configure default and available languages (English, Khmer) and translation of master-data labels. | Must | C | — | AT-CFG-102 |
| FR-CFG-004 | Fiscal year and periods | The system shall configure fiscal years and periods (see ORG). | Must | C | — | AT-CFG-103 |
| FR-CFG-005 | Document numbering | The system shall configure numbering sequences with scope and patterns, with approval for changes. | Must | C | BR-DOC-001 | AT-CFG-104 |
| FR-CFG-006 | Tax configuration | The system shall configure tax codes and rates (see TAX). | Must | C | BR-TAX-002 | AT-CFG-105 |
| FR-CFG-007 | Approval settings | The system shall configure approval rules, limits and SoD mode. | Must | C | BR-SEC-002 | AT-CFG-106 |
| FR-CFG-008 | Notification settings | The system shall configure notification types, channels, schedules and templates. | Should | C | — | AT-CFG-107 |
| FR-CFG-009 | Financial statement mapping | The system shall configure statement structures and account mappings with versioning. | Must | C | BR-RPT-003 | AT-CFG-108 |
| FR-CFG-010 | Report templates | The system shall configure report and document templates (logos, headers, languages). | Should | C | — | AT-CFG-109 |
| FR-CFG-011 | Backup settings view | The system shall show backup schedule and last successful backup status to administrators (backups themselves run at infrastructure level). | Should | C | — | AT-CFG-110 |
| FR-CFG-012 | User-defined dimensions | The system shall allow up to 5 user-defined dimensions (e.g., project, cost centre) with values and required-by-account rules. | Should | C | — | AT-CFG-111 |
| FR-CFG-013 | Setting history and approval | The system shall record every setting change with before and after values and require approval for accounting-critical settings. | Must | P | BR-AUD-001 | AT-CFG-01 |


# 7. Non-Functional Requirements
Each requirement has a unique identifier, a measurable target, a verification method (how it will be tested) and a priority. All targets are proposed and have not been measured.

## 7.1 Performance
All targets are proposed and have not been measured. Test workload assumptions: per company 5 years of data — 250,000 journals, 1.5 million journal lines, 30,000 customer invoices, 20,000 supplier invoices, 2,000 accounts, 10 branches; 50 concurrent users (60 % reads and searches, 25 % document entry, 10 % approvals and posting, 5 % reports); application tier 4 vCPU / 8 GB RAM (2 instances), database 4 vCPU / 16 GB RAM with SSD storage, same region as users or < 60 ms latency; measured at the server excluding client network latency, after warm-up, over 30 minutes. Complex reports and large exports are separate cases.

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-PERF-001 | Normal page loads and navigation (lists with first page of data, forms). | p95 ≤ 2.0 s end-to-end in browser | Browser load test (Playwright timings) under the workload | Must |
| NFR-PERF-002 | Dashboard load with all permitted widgets. | p95 ≤ 3.0 s | Load test | Should |
| NFR-PERF-003 | Searching and filtering lists (journals, invoices, customers) with indexed filters. | p95 ≤ 1.5 s for result pages of 50 rows | Load test with realistic filters | Must |
| NFR-PERF-004 | Saving a draft document or journal of up to 100 lines. | API p95 ≤ 1.0 s | API load test (k6/Locust) | Must |
| NFR-PERF-005 | Posting a journal or document of up to 100 lines including validation, numbering and audit. | API p95 ≤ 1.5 s; ≥ 20 postings/second sustained per company | Load test with concurrent posting | Must |
| NFR-PERF-006 | Trial balance for a full fiscal year (2,000 accounts). | ≤ 5 s | Report performance test | Must |
| NFR-PERF-007 | Balance sheet, income statement and cash flow statement for a fiscal year with comparatives. | ≤ 10 s each | Report performance test | Must |
| NFR-PERF-008 | General ledger report for one account and one year (up to 100,000 lines). | First page ≤ 3 s; full export ≤ 60 s as background job | Report performance test | Should |
| NFR-PERF-009 | Large exports (up to 1 million rows) run as background jobs with progress and notification. | Completed ≤ 5 min; no impact > 10 % on interactive p95 | Mixed load test | Should |
| NFR-PERF-010 | Concurrent users supported without breaching PERF-001 to PERF-005. | ≥ 50 concurrent users per installation (initial); growth target 200 | Load test | Must |
| NFR-PERF-011 | Bank statement import and auto-match of 5,000 lines. | ≤ 60 s | Performance test | Should |


## 7.2 Security
Security practices follow OWASP ASVS as a reference (R2); no certification is claimed.

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-SEC-001 | Passwords hashed with Argon2id (memory ≥ 64 MB, iterations ≥ 3, parallelism ≥ 1, tuned to ≤ 500 ms). | No plaintext or reversible passwords | Code review; database inspection | Must |
| NFR-SEC-002 | HTTPS only (TLS 1.2+), HSTS, secure cookies; HTTP redirected. | TLS scan grade A or better | TLS scanner | Must |
| NFR-SEC-003 | Role-based authorisation enforced server-side for every endpoint, including company, branch and account scopes and limits. | 100 % endpoints covered by permission matrix tests | Automated authorisation tests | Must |
| NFR-SEC-004 | Input validation with Pydantic schemas (types, ranges, lengths, formats, unknown fields rejected); output encoding in React. | 0 high findings in DAST | DAST (OWASP ZAP), API fuzzing | Must |
| NFR-SEC-005 | SQL injection prevented by SQLAlchemy bound parameters; raw SQL limited to reviewed report queries using bound parameters. | 0 findings | SAST (Bandit, Semgrep), DAST | Must |
| NFR-SEC-006 | XSS and CSRF protection: Content Security Policy, no dangerouslySetInnerHTML with user data, SameSite=Strict cookies and CSRF token for cookie-based state changes. | 0 findings | DAST; code review | Must |
| NFR-SEC-007 | Session handling: access token ≤ 15 min, refresh rotation with reuse detection, idle 30 min, absolute 12 h, revocation on password change. | Configured values verified | Functional tests | Must |
| NFR-SEC-008 | Rate limiting on authentication (10 attempts/15 min/IP), API (e.g., 300 requests/min/user) and export endpoints. | Limits enforced with 429 responses | Load tests | Must |
| NFR-SEC-009 | Secrets (DB credentials, email keys, signing keys) in a secret store or environment injection; never in code, images or the browser. | 0 secrets in repository; secret scanning on every commit | gitleaks in CI | Must |
| NFR-SEC-010 | Secure file uploads: type allow-list by content sniffing, size limits, malware scanning where available, stored outside web root with signed expiring URLs. | Malicious test files rejected | Security tests | Must |
| NFR-SEC-011 | Least-privilege database roles: application role cannot alter schema or update posted/audit tables; migrations use a separate role. | Privilege tests pass | Database tests | Must |
| NFR-SEC-012 | Protection of financial information: masking of bank account numbers and restricted accounts; exports controlled and audited. | Role tests pass | Functional tests | Must |
| NFR-SEC-013 | Protection against unauthorised transaction manipulation: explicit state-transition endpoints only; no client-supplied status, number, posted timestamp or totals accepted. | API tests prove fields are ignored or rejected | API tests | Must |
| NFR-SEC-014 | Dependency and container vulnerabilities remediated. | Critical ≤ 7 days, high ≤ 30 days | pip-audit, npm audit, image scanning | Must |
| NFR-SEC-015 | Independent penetration test before production rollout. | No open critical/high findings at go-live | Penetration test report | Should |


## 7.3 Financial Integrity
Exact arithmetic. Authoritative monetary values are PostgreSQL NUMERIC(19,4) (amounts) and NUMERIC(20,8) (exchange rates); quantities NUMERIC(19,6). In Python, all money is decimal.Decimal created from strings (never from float), with a module-level context (precision 28, ROUND_HALF_UP by default, configurable per currency) and explicit quantize() to the currency minor unit at defined points (line, tax, document total). Pydantic models declare money fields as Decimal with constraints; JSON carries money as strings. JavaScript in the browser formats values for display only and never performs authoritative calculations; where previews are needed it uses a decimal library (e.g., decimal.js) and the server result prevails. Binary floating point (float, double precision, JavaScript number for money) is prohibited for authoritative values and checked by schema and lint rules.

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-FIN-001 | Double-entry validation on submit and at posting; deferred database constraint confirms balance at commit. | 0 unbalanced posted journals in all tests and in production integrity checks | Unit, integration and property-based tests; nightly integrity job | Must |
| NFR-FIN-002 | Exact decimal arithmetic for all monetary calculations. | 0 float types for money in schema and code (lint rule); property tests on conversions | Static checks; unit tests | Must |
| NFR-FIN-003 | Posting operations run in database transactions; atomic journal posting. | 0 partial postings in fault-injection tests | Fault-injection integration tests | Must |
| NFR-FIN-004 | Duplicate posting prevention and idempotent APIs for post, approve, reverse, pay, receive, allocate, import commit and revaluation. | Exactly one effect per idempotency key in replay and concurrency tests | Concurrency and replay tests | Must |
| NFR-FIN-005 | Referential integrity enforced by foreign keys for all relationships. | 100 % of relationships have FKs | Schema review | Must |
| NFR-FIN-006 | Controlled reversals only; posted rows immutable (trigger and privilege). | UPDATE/DELETE on posted lines fails | Database tests | Must |
| NFR-FIN-007 | Period-locking controls with locking strategy preventing posting during close. | 0 postings into closed periods in concurrency tests | Concurrency tests | Must |
| NFR-FIN-008 | Concurrency controls: row locks on documents, sequences, allocations and periods; optimistic versions on drafts. | 0 lost updates or over-allocations in 1,000-iteration concurrent tests | Concurrency tests | Must |
| NFR-FIN-009 | Reconciliation checks: subledger vs control accounts, trial balance totals, bank reconciliation integrity, document totals vs lines, run nightly and on demand. | 0 unexplained differences; alerts within 15 min of job completion | Integrity job tests | Must |
| NFR-FIN-010 | Consistent rounding policy per currency applied in one shared calculation library used by all modules. | Single library; rounding test suite passes | Code review; unit tests | Must |
| NFR-FIN-011 | Reports reproducible: same parameters and data give identical results. | 100 % match in repeated runs | Regression tests | Must |


## 7.4 Reliability and Availability
Targets are proposed, not verified operational performance; they depend on hosting (D-16).

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-REL-001 | Service availability during business hours (Mon–Sat 07:00–20:00 ICT) excluding planned maintenance. | ≥ 99.5 % per month | Uptime monitoring | Must |
| NFR-REL-002 | Recovery point objective. | RPO ≤ 15 minutes | Restore tests with PITR | Must |
| NFR-REL-003 | Recovery time objective. | RTO ≤ 4 hours | DR exercise | Must |
| NFR-REL-004 | Errors handled centrally with standard error responses, correlation IDs and user-friendly messages; no stack traces to clients. | 100 % error responses follow the schema | API contract tests | Must |
| NFR-REL-005 | Transaction rollback on any failure within a business operation. | Verified by fault injection | Integration tests | Must |
| NFR-REL-006 | Backup verification by automated restore of the latest backup to an isolated environment. | Weekly automated restore check; quarterly full test | Backup verification logs | Must |
| NFR-REL-007 | Monitoring and alerting for availability, error rates, latency, failed jobs, backup failures and integrity check failures. | Alerts within 5 minutes of threshold breach | Alert tests | Must |
| NFR-REL-008 | Background jobs retried with exponential back-off and dead-letter queue; failures notified. | No silent job failures | Job failure tests | Must |


## 7.5 Usability

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-USA-001 | Clear navigation: any primary function reachable within 3 clicks from the sidebar. | Verified on navigation map | UX review | Must |
| NFR-USA-002 | Responsive layout for desktop (≥ 1280 px) and tablet; mobile for approvals, dashboards and inquiries. | Core screens usable at 1280, 1024 and 390 px widths | Responsive tests | Must |
| NFR-USA-003 | Accessible forms (labels, focus order, keyboard operation, error association). | WCAG 2.2 AA (proposed target) on core screens | axe automated checks plus manual review | Should |
| NFR-USA-004 | Validation messages specific and actionable, next to fields, in English and Khmer. | 100 % of error codes have messages in both languages | Translation coverage check | Must |
| NFR-USA-005 | Confirmation dialogs for critical actions (post, reverse, approve, pay, close period, complete reconciliation) summarising effects. | All listed actions confirmed | UI tests | Must |
| NFR-USA-006 | Consistent financial terminology per the glossary (Section 22) in both languages. | Terminology review sign-off | Review by accountant | Must |
| NFR-USA-007 | Searchable, filterable, sortable, paginated tables with column selection. | All list screens | UI tests | Must |
| NFR-USA-008 | Printable reports and documents with print-friendly layouts. | All reports print without truncation on A4 | Print tests | Must |
| NFR-USA-009 | Helpful empty states with next actions. | All list screens | UX review | Should |
| NFR-USA-010 | Journal entry efficiency: keyboard-only entry of a 10-line journal. | Completed by trained accountant in ≤ 2 minutes | Usability test | Should |


## 7.6 Maintainability

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-MNT-001 | Modular monolith with module boundaries enforced (import-linter). | CI rule passes | CI | Must |
| NFR-MNT-002 | Type safety: strict TypeScript; Python type hints with mypy strict on services. | 0 type errors in CI | CI | Must |
| NFR-MNT-003 | API documentation via OpenAPI generated by FastAPI with examples and error codes. | 100 % endpoints documented | CI check | Must |
| NFR-MNT-004 | Automated tests: backend line coverage ≥ 85 %; 100 % branch coverage of posting, allocation, FX, tax, depreciation and closing services. | Coverage report in CI | CI | Must |
| NFR-MNT-005 | Database migrations only via Alembic, reviewed, reversible where possible. | 0 manual schema changes | Migration audit | Must |
| NFR-MNT-006 | Coding standards: Ruff, Black-compatible formatting, ESLint, Prettier; conventional commits. | CI blocks violations | CI | Must |
| NFR-MNT-007 | Structured error logging with correlation IDs; no sensitive data in logs. | Log review finds 0 sensitive values | Log scan | Must |
| NFR-MNT-008 | Technical documentation (architecture, posting rules, runbooks) maintained with releases. | Docs updated in release checklist | Release review | Should |
| NFR-MNT-009 | Configuration management: environment variables and versioned configuration; same container image across environments. | No environment-specific builds | Review | Must |
| NFR-MNT-010 | Version control in Git with protected main branch and mandatory reviews. | Branch protection enabled | Repository settings | Must |


## 7.7 Scalability

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-SCL-001 | More users: stateless API instances scale horizontally behind a load balancer. | Throughput +70 % with second instance | Scaling test | Should |
| NFR-SCL-002 | More transactions: journal lines partitionable by company and fiscal year; indexes support 50 million lines. | Report targets met on 10 million-line test set | Performance test | Should |
| NFR-SCL-003 | More branches and companies without schema change. | 100 companies, 500 branches supported in test data | Load test | Should |
| NFR-SCL-004 | Larger reports: summary balance tables per account/period/dimension maintained transactionally or by refresh to accelerate statements. | Statement time grows sub-linearly with line count | Performance test | Could |
| NFR-SCL-005 | Additional modules added as new packages using the posting service and events without changing the GL core. | Architecture review | Review | Should |
| NFR-SCL-006 | Read replica option for reporting workloads. | Configurable report data source | Deployment test | Could |


## 7.8 Compatibility

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-CMP-001 | Current stable versions (latest two major) of Chrome, Edge, Firefox and Safari. | Core workflows pass on all | Cross-browser automated tests | Must |
| NFR-CMP-002 | Screen sizes: desktop 1280–2560 px, tablet 768–1279 px, phone ≥ 360 px for supported functions. | Layout tests pass | Responsive tests | Must |
| NFR-CMP-003 | Exports open correctly in Microsoft Excel (current), LibreOffice Calc and Google Sheets; CSV UTF-8 with BOM option for Excel Khmer display. | Manual verification | Compatibility test | Must |
| NFR-CMP-004 | Bank statement import supports CSV and Excel formats of configured banks via mappings. | Formats of at least 3 banks used by pilot users verified | Import tests | Must |


## 7.9 Backup and Recovery

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-BKP-001 | Automated full database backup daily plus continuous WAL archiving. | Daily full; WAL continuous | Backup job monitoring | Must |
| NFR-BKP-002 | Backup retention: daily 35 days, monthly 12 months, yearly per V-03 (proposed 10 years until confirmed). | Retention policy configured | Configuration review | Must |
| NFR-BKP-003 | Encrypted backup storage (AES-256) off-site in a separate location or region with restricted access. | Encryption verified | Review | Must |
| NFR-BKP-004 | Restoration tests: weekly automated, quarterly documented full restore including attachments. | Records of tests | Test reports | Must |
| NFR-BKP-005 | Documented recovery procedures (full restore, PITR, single-file restore of attachments). | Runbook approved | Review | Must |
| NFR-BKP-006 | Backup monitoring responsibility assigned to SYSADMIN with daily review and alerting to FINMGR on failure. | RACI documented; alert tested | Review | Must |


## 7.10 Localization

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-LOC-001 | Khmer Unicode storage, input, search and display. | Round-trip and search tests on Khmer samples pass | Automated tests | Must |
| NFR-LOC-002 | Complete English and Khmer interface with per-user language. | 100 % strings translated | Coverage check | Must |
| NFR-LOC-003 | USD and KHR (and other ISO currencies) with currency-specific display precision. | Format tests | Unit tests | Must |
| NFR-LOC-004 | Configurable date formats (default DD/MM/YYYY) and consistent numeric formatting (thousands separators, negative numbers in brackets option for reports). | Format tests | Unit tests | Must |
| NFR-LOC-005 | PDF rendering of Khmer text with correct shaping (subscripts, vowels) using embedded licensed fonts. | 20 reference documents verified visually by Khmer-reading reviewer | Visual test | Must |
| NFR-LOC-006 | Localized report labels and statement captions configurable in both languages. | All core statements bilingual | Review | Must |
| NFR-LOC-007 | Time zone Asia/Phnom_Penh for business dates; timestamps stored in UTC. | Date boundary tests | Unit tests | Must |


## 7.11 Data Privacy and Retention
Accounting records may be subject to legal retention obligations (V-03); they are never deleted because a user account is deactivated.

| ID | Requirement | Measurable Target | Verification | Priority |
| NFR-PRIV-001 | Access to sensitive financial data (restricted accounts, bank details, payee data) only for permitted roles. | Role tests pass | Functional tests | Must |
| NFR-PRIV-002 | Retention policies per record category (Section 11.10) configurable; financial records retained at least for the confirmed statutory period. | Policies configured and approved | Review | Must |
| NFR-PRIV-003 | Secure deletion or anonymisation of eligible non-financial personal data after retention, with audit. | Retention job tests | Functional tests | Should |
| NFR-PRIV-004 | Attachments retained with their parent records; deletion only with the parent after retention. | Tests pass | Functional tests | Must |
| NFR-PRIV-005 | Data export controls: permission, scope filters, audit of exports, watermark with user and time on PDF exports (optional). | Audit entries for 100 % of financial exports | Audit tests | Must |
| NFR-PRIV-006 | User deactivation preserves all records created, approved or posted by the user. | Tests pass | Functional tests | Must |
| NFR-PRIV-007 | Backup retention aligned with record retention; expired backups destroyed securely. | Policy configured | Review | Must |
| NFR-PRIV-008 | Audit-log retention at least as long as the financial records they relate to (proposed 10 years pending V-03). | Policy configured | Review | Must |


# 8. Business Rules
Business rules are policy and integrity constraints that the system must enforce independently of the user interface. Each rule states its purpose, implementation implications (database constraint, service logic or both) and acceptance criteria. The 24 mandatory rules from the project brief are all included; additional rules were added by the analysis team. Parameters such as limits, tolerances and accounts are configurable; rules affecting tax or legal matters require professional confirmation (Section 20.4).

## 8.1 General Ledger

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-GL-001 | Balanced journals | Every posted journal entry must balance: the sum of debit amounts equals the sum of credit amounts in the base currency, and, for each transaction currency used, the sum of debits equals the sum of credits in that currency. | Fundamental double-entry integrity. | Posting service validates totals with Python Decimal before insert; deferred database constraint trigger re-checks totals at commit; unbalanced entries cannot reach Posted status. | An entry with debits 100.00 and credits 99.99 is rejected with JOURNAL_UNBALANCED; no rows are posted. |
| BR-GL-002 | Total debits equal total credits | Reports and ledgers derived from posted journals must show total debits equal to total credits for any selection that contains complete journals (e.g., the trial balance for a period). | Detects corruption or partial postings. | Nightly integrity job and report-time check compare totals; any difference raises a critical alert. | Trial balance for any period shows equal totals; an injected imbalance in a test database is detected by the integrity job. |
| BR-GL-003 | Posted entries are immutable | Posted journal entries and lines cannot be edited or deleted by any application user. Only non-financial annotations (e.g., attachment added, internal note) may be appended, and they are audited. | Preserves the financial record. | No update/delete endpoints for posted journals; database privileges deny UPDATE/DELETE on posted lines; row-level trigger blocks updates where status = Posted. | API PATCH on a posted journal returns 409 JOURNAL_POSTED; direct UPDATE by the application role fails. |
| BR-GL-004 | Corrections by reversal or adjustment | A posted entry is corrected by (a) a reversal journal that mirrors the original with opposite signs and references it, followed by a correct entry, or (b) an adjusting journal for the difference. The original remains visible and linked. | Traceable corrections. | Reversal service creates the mirror entry atomically; original gets reversed_by reference; a journal can be fully reversed only once. | After reversal, original and reversal both appear in the ledger, net effect zero, linked both ways. |
| BR-GL-005 | Valid date and reference | Every journal must have a posting date within an existing accounting period of the company, a document date, a description, a unique journal number (assigned at posting) and a source reference (manual reference or source document). | Completeness and traceability. | Validation on submit and post; period lookup by company and posting date. | A journal with a posting date outside any defined period cannot be submitted. |
| BR-GL-006 | Atomic posting | Posting a journal (and the source document that generated it) is all-or-nothing: either all lines, balances, numbers, status changes and audit records are committed, or none are. | No partial accounting effects. | Single database transaction; external effects (emails) via outbox after commit. | Fault injection after inserting lines but before commit leaves no lines, no number consumed in the posted sequence (or the gap is recorded) and status unchanged. |
| BR-GL-007 | Idempotent posting | Repeating a post, approve, reverse or payment request for the same document must not create additional accounting effects. | Prevents duplicates from retries and double clicks. | Idempotency keys on state-transition endpoints; state check under row lock (status must be Approved to post); unique constraint on (source_type, source_id, purpose) for generated journals. | Two concurrent post requests for one journal result in one posting; the second receives the original result or 409 ALREADY_POSTED. |
| BR-GL-008 | Journal line validity | A journal has at least two lines; each line has either a debit or a credit amount greater than zero (not both, not zero); amounts use the currency precision; each line references one posting account and required dimensions. | Clean ledger data. | Schema and database CHECK constraints. | Lines with both debit and credit, or zero amounts, are rejected. |
| BR-GL-009 | Reversal dating | A reversal is dated on the original posting date (if that period is open) or on a user-selected date in an open period; reversals into closed periods are not allowed. | Respects period locks. | Period check on the reversal date. | Reversal into a closed period is rejected with PERIOD_CLOSED. |
| BR-GL-010 | Recurring and template journals | Recurring journals generate Draft entries on schedule; they never post automatically unless an approved auto-post rule exists for that template. | Keeps approval control over generated entries. | Scheduler creates drafts and notifies the owner. | A monthly rent template creates a Draft journal on the scheduled date and no posting occurs without approval. |


## 8.2 Chart of Accounts

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-COA-001 | Posting only to active posting accounts | Transactions cannot be posted to inactive accounts or to non-posting (header/parent) accounts. Any exception (e.g., posting to a recently deactivated account for a prior period adjustment) requires a documented, permission-controlled override. | Keeps the hierarchy and reporting meaningful. | Validation in posting service using account flags at the posting date; database foreign key to posting accounts plus trigger check. | Posting to header account 1000 is rejected with ACCOUNT_NOT_POSTABLE. |
| BR-COA-002 | Control accounts | Accounts flagged as control accounts (AR, AP, bank, fixed-asset cost and accumulated depreciation, inventory if integrated, tax control) can be posted only by their subledger modules, not by manual journals, unless the user holds the control-account override permission and gives a reason. | Keeps subledgers reconciled to the GL. | Posting service checks source module versus account control flag. | A manual journal to the AR control account by an accountant without override is rejected. |
| BR-COA-003 | Account code structure and uniqueness | Account codes are unique within a company, follow the configured structure (e.g., 4–8 digits with type prefix), and the account type of a child must match its parent. | Consistent hierarchy and reporting. | Unique (company_id, code); validation of prefix and parent type. | Creating code 4100 under an Asset parent is rejected. |
| BR-COA-004 | Used accounts cannot be deleted | An account with any journal line, opening balance, budget or mapping cannot be deleted; it can only be deactivated (and only when its balance is zero, unless an authorised exception is recorded). | Preserves history. | Delete endpoint checks references; deactivation checks balance. | Deleting an account with postings returns 409 ACCOUNT_IN_USE. |


## 8.3 Periods and Closing

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-CLS-001 | Closed periods reject posting | Ordinary posting attempts with a posting date in a Closed period are rejected. Soft-closed periods accept only adjusting journals from users with the period-adjustment permission. | Prevents unauthorised backdating. | Posting service locks the period row (FOR SHARE) and checks status; close operation takes an exclusive lock. | Posting into a closed March period fails with PERIOD_CLOSED; the attempt is audited. |
| BR-CLS-002 | Period states | Periods move Future → Open → Soft-Closed → Closed; Closed → Reopened (with approval) → Closed. Only one fiscal year can be in year-end closing at a time. | Controlled close process. | State machine with explicit transition endpoints. | Attempting to move Open → Closed without passing Soft-Closed checklist validation is rejected if the checklist is mandatory. |
| BR-CLS-003 | Reopening requires authorisation | Reopening a Closed period requires a request with reason by the Finance Manager and approval by the Owner (or a configured approver different from the requester); the reopen window and every posting during it are audited and reported. | Protects published figures. | Approval workflow; reopened period flagged; RPT-28 lists postings in reopened periods. | A reopen without approval is rejected; after approval, postings are allowed and appear on the reopen report. |
| BR-CLS-004 | Year-end close | At fiscal year-end close, the net balance of income and expense accounts is transferred to the configured retained-earnings account by a system closing journal, and balance-sheet balances carry forward as the opening position of the next year. All periods of the year must be Closed first. | Correct equity and opening balances. | Closing journal generated with source = YEAR_END; re-running after reopen generates an adjusting closing entry, not a duplicate. | After close, income and expense accounts show zero for the new year opening and retained earnings increases by the year’s net profit. |


## 8.4 Accounts Receivable

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-AR-001 | Invoice lifecycle | Customer invoices move Draft → Submitted → Approved → Posted (Open) → Partially Paid → Paid, or → Cancelled (Draft/Approved only) or → Credited (fully offset by credit notes). Posted invoices are never edited. | Clear status and control. | State machine; posting generates the AR journal. | A posted invoice cannot change amount; only credit notes reduce it. |
| BR-AR-002 | Outstanding balance derivation | Outstanding invoice balance = invoice total − Σ posted credit notes applied − Σ allocated receipts − Σ approved write-offs (+ debit notes where applicable), in the invoice currency; it is derived from posted records, not edited directly. | Accurate receivables. | Computed from allocation tables; cached balance verified nightly against derivation. | Invoice 1,000.00 with receipt 400.00 and credit note 100.00 shows 500.00 outstanding. |
| BR-AR-003 | Receipt allocation limits | Allocations of a receipt cannot exceed its unallocated amount, and allocation to an invoice cannot exceed the invoice’s outstanding balance. Excess remains as an unapplied receipt (customer credit). | Prevents over-allocation. | Row locks on receipt and invoice during allocation; CHECK on cached totals. | Allocating 600.00 of a 500.00 receipt is rejected. |
| BR-AR-004 | Credit limit | Posting an invoice that would raise a customer’s outstanding balance above the credit limit requires approval by a user with credit-override permission. | Credit risk control. | Check at approval and posting. | Invoice over the limit is held for approval with reason CREDIT_LIMIT. |
| BR-AR-005 | Credit notes and write-offs require approval | Credit notes and bad-debt write-offs require approval within value limits by a user other than the preparer; write-offs post to the configured bad-debt expense or allowance account. | Prevents unauthorised reduction of receivables. | Approval workflow; posting rules. | A write-off prepared and approved by the same user is rejected (unless reduced-SoD mode is enabled and flagged). |
| BR-AR-006 | Unapplied receipts and refunds | Overpayments are held as unapplied customer credit (customer advances liability or AR credit, per configuration) until allocated or refunded; refunds require approval and a payment voucher. | Correct liability presentation. | Posting rule maps unapplied amounts to the configured account. | A receipt of 1,200.00 against an invoice of 1,000.00 leaves 200.00 unapplied visible on the customer statement. |


## 8.5 Accounts Payable

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-AP-001 | Duplicate supplier invoice detection | A supplier invoice is a duplicate candidate if another non-cancelled invoice exists with the same supplier and supplier invoice number (normalised: case, spaces, leading zeros), or the same supplier, amount and invoice date within a configurable window. Exact number matches are blocked; near matches require confirmation with reason. | Prevents double payment. | Unique index on (company_id, supplier_id, normalised_invoice_no) for non-cancelled invoices; similarity query for warnings. | Entering INV-001 twice for the same supplier is blocked; same amount and date with a different number shows a warning. |
| BR-AP-002 | Payment terms and due dates | Due date = invoice date + payment terms (days or end-of-month rules) unless overridden with reason. | Payment scheduling. | Terms table; computed on save. | Terms Net 30 on 1 March gives due date 31 March. |
| BR-AP-003 | Supplier invoice approval | Supplier invoices and expense bills require approval according to amount, department and company rules before posting; the preparer cannot approve. | Spending control. | Approval rules engine (WFL). | An invoice above the department manager’s limit routes to the Finance Manager. |
| BR-AP-004 | Payment approval and release | Supplier payments require approval by authorised users within limits, separate from the preparer; payments can only be made to approved suppliers with verified bank details; a payment cannot be released twice. | Prevents unauthorised and duplicate payments. | Payment state machine Draft → Submitted → Approved → Paid (released) → Reconciled; idempotency; unique bank reference. | An unapproved payment cannot be marked Paid; a second release request returns the original result. |
| BR-AP-005 | Supplier bank-detail changes | Changes to supplier bank account details require approval by a user other than the requester and trigger a notification to the Finance Manager; payments to newly changed details may be held for a configurable cooling period. | Payment fraud prevention. | Change request workflow; supplier status Verified. | A payment to a supplier with pending bank-detail change is blocked. |
| BR-AP-006 | Payment allocation limits | Payment allocations cannot exceed the payment amount or the supplier invoice outstanding balance; excess becomes a supplier advance (prepayment) only if explicitly recorded as such. | Accurate payables. | Same mechanism as BR-AR-003. | Allocation above invoice balance is rejected. |


## 8.6 Cash and Bank

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-CB-001 | Completed reconciliations are locked | A completed bank reconciliation, its matched items and statement balances cannot be changed. Changes require a controlled reopening by an authorised user with reason, which is audited, and later reconciliations must be reopened in reverse order first. | Preserves reconciliation evidence. | Status Completed is terminal except via reopen endpoint; matched GL lines carry reconciliation_id and cannot be unmatched. | Editing a match in a completed reconciliation returns 409; reopen creates an audit record. |
| BR-CB-002 | Reconciliation differences | A reconciliation can be completed only when the difference between the adjusted bank balance and the adjusted book balance is zero, or when each remaining difference is documented with reason and approved by a reviewer. | Transparency of unreconciled items. | Completion validation; difference items table. | Completion with an undocumented 15.00 difference is rejected. |
| BR-CB-003 | Transfers are two-sided | Transfers between cash and bank accounts post one journal debiting the receiving account and crediting the sending account (via a transfer-clearing account when amounts or dates differ, e.g., currency conversion or in-transit funds). | Balanced and traceable transfers. | Transfer document generates the journal; clearing account balance monitored. | A transfer of 500.00 from Bank A to Bank B shows in both bankbooks with the same reference. |
| BR-CB-004 | Cash balances | Cash and petty-cash accounts cannot go negative on posting unless the account is configured to allow it; petty cash may use an imprest float with top-ups recorded as transfers. | Physical cash cannot be negative. | Balance check under row lock at posting. | A cash payment exceeding the petty cash balance is rejected. |


## 8.7 Foreign Currency

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-FX-001 | Preserve original currency and rate | Each foreign-currency document and journal line stores the transaction currency amount, the exchange rate used, its source and date, and the base-currency amount. These values never change after posting; revaluations are separate journals. | Audit and accurate gains/losses. | Columns on lines; immutability per BR-GL-003. | Changing the rate table after posting does not alter posted base amounts. |
| BR-FX-002 | Exchange rate determination | The default rate is the rate for the transaction date from the configured source and rate type; manual override requires permission and reason; a document cannot be posted without a rate when its currency differs from the base currency. | Consistency and control. | Rate lookup service; override audited. | Posting a KHR invoice with no rate for the date and no override fails with RATE_MISSING. |
| BR-FX-003 | Realised exchange differences | When a foreign-currency receivable, payable or bank balance is settled at a different base-currency value than recorded, the difference is posted to realised exchange gain or loss accounts in the settlement journal. | Correct profit measurement. | Allocation engine computes base difference per allocation. | Invoice 1,000 USD recorded at base 4,100,000 KHR settled when rate is 4,050 posts 50,000 KHR realised loss (illustrative, KHR-base company). |
| BR-FX-004 | Revaluation | At period end, open foreign-currency monetary balances selected by configuration are revalued at the closing rate; the unrealised difference is posted to unrealised gain/loss accounts and automatically reversed on the first day of the next period (proposed default, D-12). | Period-end measurement. | Revaluation run stores per-item detail; auto-reversal scheduled. | Running revaluation twice for the same period does not duplicate journals. |
| BR-FX-005 | Precision and rounding | Amounts are stored with 4 decimal places internally and rounded to the currency’s minor unit (USD 2, KHR 0 or as configured) at document line, tax and total levels using round-half-up (configurable); rates are stored with up to 8 decimal places. Rounding differences on conversion post to a configured rounding account. | Consistent totals. | Python Decimal with explicit quantize; PostgreSQL NUMERIC. | Converting 333.33 USD at 4,100 produces 1,366,653 KHR exactly with no floating-point error. |


## 8.8 Tax

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-TAX-001 | No recalculation of finalised tax | Changes to tax codes, rates or rules apply only to documents created (or tax-dated) on or after the effective date; finalised (posted) documents keep their stored tax amounts and rate references. | Historical integrity. | Tax amounts stored on document lines; rate history with effective dates. | Changing a rate from 10 % to 12 % (illustrative) leaves posted invoices unchanged. |
| BR-TAX-002 | Effective-dated, verified tax configuration | Tax codes have effective date ranges, linked GL accounts, calculation method (inclusive/exclusive), applicability and a verification status; codes marked “Unverified” display a warning and can be blocked from production use by setting. | Prevents use of unconfirmed tax rules. | Configuration validation; audit of changes. | Using an unverified tax code in production mode with blocking enabled is rejected. |
| BR-TAX-003 | Tax posting | Tax amounts post to the tax accounts mapped to the tax code (e.g., output tax payable, input tax recoverable) separately from revenue or expense. | Accurate tax balances. | Posting rules by tax code. | An invoice with tax shows separate tax payable lines in the journal. |


## 8.9 Documents

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-DOC-001 | Unique document numbering | Document numbers are unique within the configured scope (company, document type, optionally branch and fiscal year) and are assigned from a sequence at the defined point (on posting for journals and invoices by default). Numbers are never reused; voided numbers remain visible. | Prevents duplicates and supports completeness checks. | Sequence table row lock within the posting transaction; unique constraint on (company, type, scope key, number). | Two simultaneous postings receive different consecutive numbers; no duplicate occurs in 1,000 concurrent attempts. |
| BR-DOC-002 | Finalised documents | Posted customer invoices, supplier bills, receipt and payment vouchers cannot be edited; cancellation after posting is by credit note, debit note or reversal. PDFs of finalised documents are regenerated identically from stored data and marked COPY on reprint. | Document integrity. | Document snapshot data stored at posting. | Reprinting a posted invoice after a template change shows the original values and a COPY label. |


## 8.10 Security and Separation of Duties

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-SEC-001 | Authorised approval and posting | Only users with the specific approve or post permission for the document type, company, branch and amount may approve or post it. | Control. | Backend permission and limit evaluation on every transition. | An accountant with a 5,000 limit cannot approve a 7,500 journal. |
| BR-SEC-002 | No unauthorised self-approval | Where separation of duties applies, the preparer (creator or last editor) cannot approve the same document, and the approver cannot be the payee or supplier-record editor where configured. Reduced-SoD mode, if enabled, flags each exception. | Fraud prevention. | Approval service compares user IDs; exceptions recorded. | Self-approval attempt returns 403 SOD_VIOLATION. |
| BR-SEC-003 | Company and branch isolation | Users access only companies and branches assigned to them; every query and report applies these scopes; IDs from other scopes are treated as not found. | Confidentiality. | Scope filters in the data-access layer; optional PostgreSQL row-level security. | Requesting a journal of an unassigned company returns 404. |
| BR-SEC-004 | Restricted accounts | Accounts marked sensitive (e.g., salaries, owner drawings) are visible only to roles with the sensitive-account permission; reports aggregate them under a restricted label for others. | Confidentiality of sensitive data. | Account-level permission checks in queries. | A read-only user sees “Restricted” instead of salary account details. |


## 8.11 Audit

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-AUD-001 | Audit records protected | Audit records cannot be modified or deleted by any application user; only an archival process with system privileges can move records to archive storage, preserving integrity hashes. | Trustworthy evidence. | INSERT/SELECT privileges only; hash chain. | UPDATE on audit_logs by the application role fails. |
| BR-AUD-002 | Audit in the same transaction | Audit events for financial state changes are written in the same database transaction as the change; if the audit write fails, the change is rolled back. | No unaudited financial changes. | Audit service called inside the unit of work. | Simulated audit failure prevents posting. |


## 8.12 Reporting

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-RPT-001 | Drafts excluded from official reports | Draft, submitted, approved-but-unposted and cancelled documents do not affect official financial reports; reports that can include them must display “Includes unposted transactions” prominently. | Reliable statements. | Report queries read posted ledger only by default. | An approved but unposted journal does not change the trial balance. |
| BR-RPT-002 | Report basis and period | Every financial report states company, branch filter, accounting date range or period(s), reporting basis (accrual), currency, and run time. | Clear interpretation. | Common report header component. | All exported statements display the header fields. |
| BR-RPT-003 | Consistent data for statements | Financial statements generated together (balance sheet, income statement, cash flow, equity) use the same posted data snapshot and account mappings; the balance sheet must balance and the income statement net result must equal the change in current-year earnings shown in equity. | Internal consistency. | Reports run in a single REPEATABLE READ transaction; validation checks before display. | A statement pack shows identical net profit on the income statement and in equity; any imbalance blocks finalisation and lists unmapped accounts. |


## 8.13 Configuration and Import

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-CFG-001 | Configuration before production posting | The accounting basis, base currency, fiscal year, accounting periods, chart of accounts, control accounts, retained-earnings account, rounding and exchange-difference accounts must be configured and confirmed before production posting is enabled for a company. | Prevents structural errors. | Company status “Setup” blocks posting; readiness checklist. | Posting in a company in Setup status is rejected. |
| BR-CFG-002 | Opening balances reconciled | Opening balances must be imported as a balanced opening journal (with subledger detail for AR, AP, bank and fixed assets) and reconciled to the previous system’s trial balance and subledger reports before the organisation relies on production reports; the reconciliation sign-off is recorded. | Reliable starting point. | Opening balance workflow with sign-off; subledger-to-control check. | Production reports show “Opening balances not signed off” until sign-off is recorded. |
| BR-IMP-001 | Imports never post invalid data | Imports are validated in full before any record is created; journal imports must balance per journal; invalid rows block the batch (or are excluded only for non-financial master data with user confirmation); imported journals are created as Drafts unless an approved import-post permission is used. | Prevents silent corruption. | Two-phase import: validate/preview then commit in one transaction. | An import file with one unbalanced journal is rejected with an error report; no journals are created. |


## 8.14 Fixed Assets, Budgets, Inventory, Expenses and Workflow

| Rule ID | Rule | Statement | Purpose | Implementation Implications | Acceptance Criteria |
| BR-FA-001 | Depreciation basis | Depreciation starts from the configured convention (e.g., month of acquisition or month following) and is calculated on cost less residual value over useful life using the asset’s method; accounting depreciation settings are separate from any tax depreciation rules (V-06). | Correct asset accounting. | Asset category defaults; per-asset overrides with permission. | An asset of 12,000 with residual 0 and 60 months straight-line depreciates 200.00 per month (illustrative). |
| BR-FA-002 | Depreciation posted once per period | Depreciation for an asset and period is posted once; re-running a depreciation batch skips already posted assets. | No duplicate expense. | Unique (asset_id, period_id) in depreciation postings. | Running the March batch twice creates one set of journals. |
| BR-FA-003 | Disposal accounting | On disposal or sale, cost and accumulated depreciation are removed, proceeds recorded and the gain or loss posted; disposed assets stop depreciating. | Correct derecognition. | Disposal document generates journal. | Disposal of an asset with cost 10,000, accumulated depreciation 6,000 and proceeds 3,000 posts a 1,000 loss (illustrative). |
| BR-BUD-001 | Budgets compare to posted actuals | Budget-versus-actual reports use posted GL balances for the same accounts, dimensions and periods; commitments (approved unposted documents) may be shown separately, never mixed with actuals. | Meaningful variance analysis. | Report joins budget lines and ledger by account, period, dimension. | Actual column equals the trial balance movement for the account and period. |
| BR-BUD-002 | Approved budget versions | Only one approved budget version is active per company, fiscal year and budget type; revisions create new versions with history. | Clear reference for control. | Versioning with status. | Approving version 2 marks version 1 superseded. |
| BR-INV-001 | Inventory valuation and reconciliation | If inventory integration is enabled, the valuation method (e.g., weighted average or FIFO) is configured per company and validated against the applicable framework (V-04); the inventory control account must reconcile to the inventory valuation report at period end. | Accurate COGS and inventory. | Integration posts summarised journals by source batch; reconciliation report. | Inventory valuation total equals the inventory control account balance or the difference is listed. |
| BR-EXP-001 | Expense recognition separate from payment | An expense is recognised when recorded and posted (accrual), crediting accounts payable, accrued liabilities, an employee payable (claims) or cash/bank (paid immediately); paying an accrued expense later clears the liability and does not recognise the expense again. | Avoids double counting. | Expense document has payment mode; payment allocation against the liability. | An expense recorded as unpaid then paid shows expense once and liability cleared. |
| BR-WFL-001 | Delegation and escalation | Approvers may delegate approval authority for a date range to a user with equal or higher limits; pending approvals older than the configured threshold escalate to the next level; delegation and escalation are audited and do not bypass separation of duties. | Continuity without weakening control. | Delegation table; scheduled escalation job. | An approval delegated to a user who prepared the document is still blocked by SoD. |


# 9. Business Workflows
All journal entries in this section are illustrative examples, not universal accounting treatments. The correct accounting depends on the facts of each transaction and the organisation’s applicable accounting framework (V-04), and must be confirmed by a qualified accountant. Amounts are in a USD base currency unless stated; tax percentages and exchange rates are placeholders.

## 9.1 Workflow Catalogue

| ID | Workflow | Main actors | Generates journal | Key rules |
| WF-01 | Create and approve a manual journal entry | ACCT, FINMGR | Yes | BR-GL-001, BR-SEC-002 |
| WF-02 | Record a customer invoice | ARO, FINMGR | Yes | BR-AR-001, BR-DOC-001 |
| WF-03 | Receive a customer payment | ARO, CASHIER | Yes | BR-AR-003, BR-FX-003 |
| WF-04 | Record a supplier invoice | APO, DEPTMGR, ACCT | Yes | BR-AP-001, BR-AP-003 |
| WF-05 | Pay a supplier | APO, FINMGR, CASHIER | Yes | BR-AP-004, BR-AP-005 |
| WF-06 | Record an expense | ACCT, DEPTMGR | Yes | BR-EXP-001 |
| WF-07 | Record cash receipts and cash payments | CASHIER, ACCT | Yes | BR-CB-004 |
| WF-08 | Reconcile a bank statement | ACCT, FINMGR | Only adjustments | BR-CB-001, BR-CB-002 |
| WF-09 | Acquire and depreciate a fixed asset | ACCT, FINMGR | Yes | BR-FA-001, BR-FA-002 |
| WF-10 | Post a foreign currency transaction | ARO, APO, ACCT | Yes | BR-FX-001, BR-FX-002 |
| WF-11 | Revalue foreign currency balances | ACCT, FINMGR | Yes | BR-FX-004 |
| WF-12 | Close a month | FINMGR, ACCT | Adjustments | BR-CLS-001, BR-CLS-002 |
| WF-13 | Close a fiscal year | FINMGR, OWNER | Yes | BR-CLS-004 |
| WF-14 | Reverse an incorrect posted transaction | ACCT, FINMGR | Yes | BR-GL-004, BR-GL-009 |
| WF-15 | Import opening balances | ACCT, FINMGR | Yes | BR-CFG-002, BR-IMP-001 |
| WF-16 | Generate and review financial statements | FINMGR, OWNER | No | BR-RPT-002, BR-RPT-003 |


## 9.2 Journal Posting Flowchart (common to all posting workflows)
Figure 4. Journal Posting Flowchart (common to all posting workflows)

## 9.3 Workflow Specifications

### WF-01 Create and approve a manual journal entry

| Element | Specification |
| Trigger | Need to record a transaction not originating from a subledger (e.g., accrual, reclassification, loan interest) |
| Actors | Accountant (preparer), Finance Manager (approver and/or poster), Owner (above limit) |
| Preconditions | Period open for posting date; accounts active; user has gl.journal.create |
| Main steps | 1. Create Draft with header and lines; 2. Attach support; 3. Save (balance shown live); 4. Submit — server validates balance, accounts, dimensions, period; 5. Approval routing by amount; 6. Approver reviews and approves; 7. Authorised user posts (Section 9.2) |
| Alternative paths | Approver rejects with comment → Draft; preparer recalls before approval; multi-level approval above thresholds; auto-post on approval if configured for the user’s role |
| Validation rules | BR-GL-001, BR-GL-005, BR-GL-008, BR-COA-001, BR-COA-002, BR-CLS-001 |
| Accounting impact (illustrative) | Accrued utilities at month-end: Dr Utilities expense 250.00 / Cr Accrued liabilities 250.00 |
| Approval requirements | Per approval rules; approver ≠ preparer (BR-SEC-002) |
| Database records affected | journal_entries, journal_entry_lines, attachments, approval_requests, approval_actions, document_sequences, audit_logs, idempotency_keys |
| Failure handling | Any validation or database error rolls back; journal stays Approved; error code shown |
| Audit events | Created, edited, submitted, approved/rejected, posted (with number) |
| Completion criteria | Journal Posted with number; visible in GL inquiry and trial balance |


### WF-02 Record a customer invoice

| Element | Specification |
| Trigger | Goods or services delivered on credit |
| Actors | AR Officer, Finance Manager or Accountant (approve/post) |
| Preconditions | Customer active; revenue, AR and tax accounts mapped; tax codes verified (V-01) |
| Main steps | 1. Create invoice (customer, dates, terms, currency, lines with revenue account, tax code, dimensions); 2. System calculates tax, totals, due date; 3. Credit limit check; 4. Submit and approve per rules; 5. Post — invoice number assigned, AR journal generated atomically; 6. PDF generated and emailed |
| Alternative paths | Credit limit exceeded → override approval; foreign currency invoice (WF-10); draft cancelled before posting |
| Validation rules | BR-AR-001, BR-AR-004, BR-TAX-002, BR-DOC-001, BR-FX-002 |
| Accounting impact (illustrative credit sale) | Dr Accounts receivable 1,100.00 / Cr Sales revenue 1,000.00; Cr Output tax payable 100.00 (illustrative 10 % — not a confirmed rate) |
| Approval requirements | By amount and customer credit status |
| Database records affected | customer_invoices, customer_invoice_lines, journal_entries, journal_entry_lines, document_sequences, document_snapshots, audit_logs |
| Failure handling | Posting failure: no number consumed, invoice remains Approved |
| Audit events | Created, approved, posted, emailed, printed |
| Completion criteria | Invoice Open with outstanding balance equal to total; AR control increases by total |

Figure 5. WF-02 Record a customer invoice

### WF-03 Receive a customer payment

| Element | Specification |
| Trigger | Customer pays by cash, bank transfer or other method |
| Actors | AR Officer or Cashier; Accountant for review |
| Preconditions | Bank/cash account exists; rate available for foreign currency |
| Main steps | 1. Record receipt (customer, date, method, account, currency, amount, reference); 2. System suggests allocation to oldest open invoices; 3. User adjusts allocation; 4. Post — receipt journal and allocations in one transaction; 5. Receipt voucher PDF |
| Alternative paths | Partial payment; overpayment left unapplied; allocation later; receipt in different currency from invoice (realised FX) |
| Validation rules | BR-AR-003, BR-AR-006, BR-CB-004, BR-FX-003 |
| Accounting impact (illustrative collection) | Dr Bank 1,100.00 / Cr Accounts receivable 1,100.00 |
| Approval requirements | None by default; configurable for large receipts or cash |
| Database records affected | customer_receipts, customer_payment_allocations, journal_entries, journal_entry_lines, audit_logs |
| Failure handling | Concurrent allocation of the same invoice: row locks; second allocation re-validated against new balance |
| Audit events | Receipt created, posted, allocated, unallocated |
| Completion criteria | Invoice balances updated; receipt fully or partially allocated; bankbook shows receipt |


### WF-04 Record a supplier invoice

| Element | Specification |
| Trigger | Supplier bill received |
| Actors | AP Officer; Department Manager; Finance Manager; Accountant |
| Preconditions | Supplier Verified; accounts and tax codes configured |
| Main steps | 1. Enter supplier, supplier invoice number, dates, currency, lines (expense/asset/inventory account, tax code, department); 2. Duplicate check; 3. Attach scanned bill; 4. Submit; 5. Department and finance approval by amount; 6. Post AP journal |
| Alternative paths | Near-duplicate warning with reason; asset lines create fixed-asset draft; supplier credit note |
| Validation rules | BR-AP-001, BR-AP-002, BR-AP-003, BR-BUD-001 (budget check) |
| Accounting impact (illustrative expense incurred but not yet paid) | Dr Repairs expense 500.00; Dr Input tax recoverable 50.00 (if recoverable, V-01) / Cr Accounts payable 550.00 |
| Approval requirements | Department Manager within limit, then Finance Manager above limit; preparer cannot approve |
| Database records affected | supplier_invoices, supplier_invoice_lines, attachments, approval_requests, journal_entries, journal_entry_lines, audit_logs |
| Failure handling | Duplicate block; posting rollback |
| Audit events | Created, duplicate override (reason), approved, posted |
| Completion criteria | Invoice Open in AP aging; AP control increased |


### WF-05 Pay a supplier

| Element | Specification |
| Trigger | Supplier invoices due or advance required |
| Actors | AP Officer (prepare), Finance Manager/Owner (approve), authorised releaser (Cashier or Finance Manager) |
| Preconditions | Posted supplier invoices; supplier bank details verified; bank/cash balance sufficient |
| Main steps | 1. AP Officer creates payment proposal from due invoices; 2. Selects bank account and method; 3. Submits; 4. Approver approves within limit; 5. Payment executed outside AMS (bank portal or cash) and reference recorded; 6. Release/post — payment journal and allocations; 7. Payment voucher PDF; 8. Later matched in bank reconciliation |
| Alternative paths | Partial payment; payment of advance; offset with supplier credit note; payment rejected |
| Validation rules | BR-AP-004, BR-AP-005, BR-AP-006, BR-CB-004, BR-GL-007 |
| Accounting impact (illustrative payment of a previously recorded payable) | Dr Accounts payable 550.00 / Cr Bank 550.00 |
| Approval requirements | Value-based; approver ≠ preparer; optional dual approval above threshold |
| Database records affected | supplier_payments, supplier_payment_allocations, payment_vouchers, approval_requests, journal_entries, journal_entry_lines, audit_logs |
| Failure handling | Release is idempotent; if bank execution fails after approval, payment can be cancelled (if not posted) or reversed (if posted) |
| Audit events | Proposal created, approved, released, voucher printed |
| Completion criteria | Invoice balances reduced; bankbook entry ready for reconciliation |

Figure 6. WF-05 Pay a supplier

### WF-06 Record an expense

| Element | Specification |
| Trigger | Expense incurred (bill, receipt or claim) |
| Actors | Accountant or Cashier; Department Manager (approve) |
| Preconditions | Expense category mapped; budget available (if controlled) |
| Main steps | 1. Record expense with category, amount, tax, department, branch, payment mode; 2. Attach receipt; 3. Approve; 4. Post |
| Alternative paths | Paid immediately vs unpaid; employee claim reimbursed later; recurring template |
| Validation rules | BR-EXP-001, BR-BUD-001 |
| Accounting impact (illustrative) | Paid immediately: Dr Office supplies expense 80.00 / Cr Cash 80.00. Incurred, not yet paid: Dr Rent expense 1,000.00 / Cr Accrued liabilities 1,000.00; later Dr Accrued liabilities 1,000.00 / Cr Bank 1,000.00 |
| Approval requirements | By amount and department |
| Database records affected | expenses, expense_lines, attachments, journal_entries, journal_entry_lines |
| Failure handling | Budget block (if configured) prevents approval with explanation |
| Audit events | Created, approved, posted, settled |
| Completion criteria | Expense recognised once in correct period and dimensions |


### WF-07 Record cash receipts and cash payments

| Element | Specification |
| Trigger | Cash received or paid (e.g., cash sale, petty cash purchase) |
| Actors | Cashier (custodian), Accountant (review) |
| Preconditions | Cash account assigned to the cashier |
| Main steps | 1. Choose receipt or payment; 2. Enter counter-account lines, amount, reference, attachment; 3. Post; 4. Print voucher; 5. Daily cash count compared with cashbook |
| Alternative paths | Petty cash top-up from bank (transfer, Dr Petty cash / Cr Bank); cash deposit to bank |
| Validation rules | BR-CB-004 (no negative cash), cashier limits |
| Accounting impact (illustrative transfer between bank accounts) | Dr Bank B 500.00 / Cr Bank A 500.00 (with transfer-clearing when dates or currencies differ) |
| Approval requirements | Payments above cashier limit require approval |
| Database records affected | cash_transactions, journal_entries, journal_entry_lines, attachments |
| Failure handling | Insufficient balance: rejected |
| Audit events | Created, posted |
| Completion criteria | Cashbook balance equals counted cash or difference recorded |


### WF-08 Reconcile a bank statement

| Element | Specification |
| Trigger | Bank statement available (e.g., monthly) |
| Actors | Accountant (prepare), Finance Manager (review and complete) |
| Preconditions | Previous reconciliation completed; bank transactions posted for the period |
| Main steps | 1. Import bank transactions (CSV/Excel) with mapping; 2. Auto-match with accounting records; 3. Identify unmatched items; 4. Record approved adjustments (charges, interest) or investigate; 5. Review differences (statement balance vs adjusted book balance); 6. Complete reconciliation; 7. History preserved and locked |
| Alternative paths | Manual statement entry; reopen completed reconciliation with reason (later ones reopened first) |
| Validation rules | BR-CB-001, BR-CB-002; statement opening balance must equal previous reconciled closing balance |
| Accounting impact (illustrative bank charge found on statement) | Dr Bank charges expense 5.00 / Cr Bank 5.00 |
| Approval requirements | Completion by reviewer; adjustments per journal rules |
| Database records affected | bank_statement_imports, bank_transactions, bank_reconciliations, bank_reconciliation_lines, journal_entries (adjustments), audit_logs |
| Failure handling | Import errors listed; duplicate lines skipped |
| Audit events | Import, match/unmatch, adjustment, completion, reopen |
| Completion criteria | Difference zero or documented; reconciliation Completed and locked |

Figure 7. WF-08 Reconcile a bank statement

### WF-09 Acquire and depreciate a fixed asset

| Element | Specification |
| Trigger | Purchase of a capital item meeting the capitalisation policy |
| Actors | AP Officer (invoice), Accountant (register, depreciation run), Finance Manager (approve) |
| Preconditions | Asset category with accounts and defaults |
| Main steps | 1. Supplier invoice line to asset account (or manual acquisition); 2. Asset record created with cost, dates, life, residual, method; 3. Schedule generated; 4. Each month the depreciation run is previewed, approved and posted once |
| Alternative paths | Change in estimate; transfer; disposal (BR-FA-003) |
| Validation rules | BR-FA-001, BR-FA-002, BR-CLS-001 |
| Accounting impact (illustrative) | Purchase: Dr Equipment 12,000.00 / Cr Accounts payable 12,000.00. Monthly depreciation (60 months, nil residual): Dr Depreciation expense 200.00 / Cr Accumulated depreciation 200.00 |
| Approval requirements | Asset registration and depreciation batch approval |
| Database records affected | fixed_assets, depreciation_schedules, depreciation_runs, asset_transactions, journal_entries, journal_entry_lines |
| Failure handling | Batch fails as a whole; re-run skips posted assets |
| Audit events | Asset created, changed, depreciation posted, disposed |
| Completion criteria | Register NBV reconciles to GL |


### WF-10 Post a foreign currency transaction

| Element | Specification |
| Trigger | Document in a currency other than the company base currency |
| Actors | AR/AP Officer, Accountant |
| Preconditions | Currency supported; rate available for date and type |
| Main steps | 1. Select currency; 2. System proposes rate; 3. User accepts or overrides (permission, reason); 4. Amounts calculated in transaction and base currencies with rounding; 5. Post stores both amounts and rate |
| Alternative paths | Settlement at a different rate (realised difference) |
| Validation rules | BR-FX-001, BR-FX-002, BR-FX-005 |
| Accounting impact (illustrative, USD base) | Invoice KHR 4,100,000 at 4,100 KHR/USD: Dr AR 1,000.00 USD (KHR 4,100,000) / Cr Revenue 1,000.00 USD. Settlement at 4,000: Dr Bank 1,025.00 / Cr AR 1,000.00; Cr Realised FX gain 25.00 |
| Approval requirements | Rate override requires permission |
| Database records affected | exchange_rates, documents, journal_entry_lines (currency, amount_txn, rate, amount_base) |
| Failure handling | Missing rate blocks posting |
| Audit events | Rate override, posting |
| Completion criteria | Original amounts and rate preserved after posting |


### WF-11 Revalue foreign currency balances

| Element | Specification |
| Trigger | Period end where revaluation is enabled |
| Actors | Accountant (run), Finance Manager (approve) |
| Preconditions | Closing rates entered; accounts marked for revaluation (monetary items) |
| Main steps | 1. Select period and accounts; 2. Preview per item: base value at historical rates vs at closing rate; 3. Approve; 4. Post unrealised gain/loss journal; 5. Auto-reversal journal scheduled for day 1 of next period |
| Alternative paths | Re-run after correction (previous run reversed first) |
| Validation rules | BR-FX-004 |
| Accounting impact (illustrative, USD base) | Open receivable KHR 4,100,000 recorded at 1,000.00 USD; closing rate 4,050 → 1,012.35 USD: Dr AR 12.35 / Cr Unrealised FX gain 12.35; reversed next period |
| Approval requirements | Finance Manager |
| Database records affected | fx_revaluation_runs, fx_revaluation_lines, journal_entries, journal_entry_lines |
| Failure handling | Idempotent per period and account set |
| Audit events | Run, approval, posting, reversal |
| Completion criteria | Revaluation posted once; FX report shows unrealised amounts |


### WF-12 Close a month

| Element | Specification |
| Trigger | Month end |
| Actors | Finance Manager, Accountants |
| Preconditions | All routine documents for the month entered |
| Main steps | 1. Soft-close period; 2. Checklist: bank reconciliations, AR and AP review and subledger reconciliation, accruals and prepayments, depreciation, FX revaluation, suspense review, tax review; 3. Post adjusting journals; 4. Review trial balance and statements; 5. Close period (lock) |
| Alternative paths | Waive checklist item with reason; period 13 for audit adjustments |
| Validation rules | BR-CLS-001, BR-CLS-002, BR-CB-002, BR-COA-002 |
| Accounting impact | Adjustments only (e.g., prepayment amortisation: Dr Insurance expense 100.00 / Cr Prepaid insurance 100.00) |
| Approval requirements | Finance Manager closes; Owner approves any reopen |
| Database records affected | accounting_periods, period_close_checklists, period_status_history, journal_entries |
| Failure handling | Blocking items listed; close not executed |
| Audit events | Soft-close, checklist updates, close |
| Completion criteria | Period Closed; statements for the month final |

Figure 8. WF-12 Close a month

### WF-13 Close a fiscal year

| Element | Specification |
| Trigger | All periods of the fiscal year closed |
| Actors | Finance Manager, Owner |
| Preconditions | Year-end adjustments posted (including audit adjustments in period 13 if used); next fiscal year defined |
| Main steps | 1. Run year-end validation; 2. Preview closing journal; 3. Owner approval; 4. Post closing journal transferring income and expense balances to retained earnings; 5. Mark year Closed; 6. Opening balances of the next year derived from closing balances (balance-sheet accounts) |
| Alternative paths | Reopen year (Owner approval) and re-close with adjusting closing entry |
| Validation rules | BR-CLS-004, BR-RPT-003 |
| Accounting impact (illustrative) | Revenue 300,000.00 and expenses 250,000.00: Dr Revenue accounts 300,000.00 / Cr Expense accounts 250,000.00; Cr Retained earnings 50,000.00 |
| Approval requirements | Owner |
| Database records affected | fiscal_years, journal_entries (type YEAR_END), journal_entry_lines, audit_logs |
| Failure handling | Atomic; on failure year stays open |
| Audit events | Year-end close, reopen |
| Completion criteria | New year income statement starts at zero; retained earnings equals prior balance plus net result |


### WF-14 Reverse an incorrect posted transaction

| Element | Specification |
| Trigger | Error found in a posted journal or document |
| Actors | Accountant (request), Finance Manager (approve and post reversal) |
| Preconditions | Original posted and not already reversed; target period open |
| Main steps | 1. Select posted item and Reverse; 2. Enter reason and reversal date; 3. Approve; 4. Reversal journal posted with opposite amounts and link; 5. Source document status updated (e.g., invoice reversed → use credit note for customer-facing documents); 6. Correct entry recorded if needed |
| Alternative paths | Adjusting entry for difference instead of full reversal |
| Validation rules | BR-GL-004, BR-GL-009, BR-DOC-002 |
| Accounting impact (illustrative) | Original: Dr Rent expense 1,000.00 / Cr Bank 1,000.00 posted to wrong expense account; reversal: Dr Bank 1,000.00 / Cr Rent expense 1,000.00; correct: Dr Office rent – Branch 2 1,000.00 / Cr Bank 1,000.00 |
| Approval requirements | Reversal permission and approval |
| Database records affected | journal_entries (reversal_of, reversed_by), journal_entry_lines, audit_logs |
| Failure handling | Idempotent; second reversal rejected |
| Audit events | Reversal requested, approved, posted |
| Completion criteria | Original and reversal both visible and linked |


### WF-15 Import opening balances

| Element | Specification |
| Trigger | Go-live or new company onboarding |
| Actors | Accountant (prepare), Finance Manager (sign off) |
| Preconditions | Chart of accounts complete; go-live date chosen; previous system’s closing trial balance and subledger listings available |
| Main steps | 1. Download templates; 2. Prepare GL balances and subledger detail (open invoices, supplier bills, bank balances, assets); 3. Upload and validate (balanced, accounts valid, subledger totals equal control balances); 4. Preview; 5. Commit as Draft opening journal and subledger opening items; 6. Approve and post into the opening period; 7. Reconcile to previous system and record sign-off |
| Alternative paths | Re-import after deleting drafts; corrections after posting via adjusting journals |
| Validation rules | BR-CFG-002, BR-IMP-001, BR-GL-001 |
| Accounting impact | Opening journal: Dr asset and expense balances / Cr liability, equity and revenue balances as at go-live; balances on control accounts supported by subledger items |
| Approval requirements | Finance Manager sign-off |
| Database records affected | import_batches, import_errors, opening_balances, journal_entries, customer_invoices (opening), supplier_invoices (opening), fixed_assets |
| Failure handling | Batch rejected on any blocking error with error report |
| Audit events | Import, commit, posting, sign-off |
| Completion criteria | Trial balance at go-live equals previous system; sign-off recorded |


### WF-16 Generate and review financial statements

| Element | Specification |
| Trigger | Period close, management review or audit |
| Actors | Finance Manager, Owner, Auditor |
| Preconditions | Statement mappings complete; period posted |
| Main steps | 1. Select company, period, comparatives and branch filter; 2. System runs statements in one consistent snapshot; 3. Validation checks (balance sheet balances; net profit consistent; cash flow reconciles; no unmapped accounts); 4. Review with drill-down; 5. Export PDF/Excel; 6. Mark statement pack as reviewed (optional) |
| Alternative paths | Include unposted items (labelled) for preview |
| Validation rules | BR-RPT-001, BR-RPT-002, BR-RPT-003 |
| Accounting impact | None |
| Approval requirements | Review sign-off (optional) |
| Database records affected | report_runs, audit_logs (exports) |
| Failure handling | Validation failure shown; pack cannot be marked final |
| Audit events | Report run (optional), export |
| Completion criteria | Consistent statements exported with header information |


# 10. Use Cases

## 10.1 Use Case Catalogue

| ID | Use case | Primary actor | Related workflow |
| UC-01 | Login | Any user | — |
| UC-02 | Manage users and roles | SYSADMIN | — |
| UC-03 | Manage Chart of Accounts | ACCT | — |
| UC-04 | Create journal entry | ACCT | WF-01 |
| UC-05 | Approve journal entry | FINMGR | WF-01 |
| UC-06 | Post journal entry | FINMGR / ACCT | WF-01 |
| UC-07 | Reverse journal entry | FINMGR | WF-14 |
| UC-08 | Create customer invoice | ARO | WF-02 |
| UC-09 | Receive customer payment | ARO / CASHIER | WF-03 |
| UC-10 | Create supplier invoice | APO | WF-04, WF-06 |
| UC-11 | Record supplier payment | APO / FINMGR | WF-05 |
| UC-12 | Reconcile bank statement | ACCT | WF-08 |
| UC-13 | Generate financial reports | FINMGR | WF-16 |
| UC-14 | Manage fixed assets | ACCT | WF-09 |
| UC-15 | Close accounting period | FINMGR | WF-12, WF-13 |
| UC-16 | Export financial data | ACCT / AUDITOR | — |


## 10.2 Use Case Specifications

### UC-01 Login

| Element | Description |
| Primary actor | Any registered user |
| Supporting actors | Email service (reset), authenticator app (MFA) |
| Description | User authenticates to access permitted companies and functions |
| Preconditions | Account active |
| Trigger | User opens the application |
| Main success scenario | 1. User enters email/username and password. 2. System verifies credentials and lock status. 3. If MFA is required, user enters TOTP code. 4. System creates session, loads permissions and default company. 5. Dashboard displayed. |
| Alternative scenarios | A1 Forgot password → reset link. A2 Multiple companies → company selector. |
| Exception scenarios | E1 Invalid credentials → generic error, failure counted. E2 Locked account → lock message with time. E3 Deactivated account → refused. |
| Postconditions | Session active; login audited |
| Related functional requirements | FR-AUTH-001, FR-AUTH-008, FR-AUTH-009, FR-AUTH-011 |
| Relevant business rules | BR-SEC-003 |
| Acceptance criteria | AT-AUTH-01; successful login creates an audit event; failed attempts counted |


### UC-02 Manage users and roles

| Element | Description |
| Primary actor | System Administrator |
| Supporting actors | Owner (approves sensitive permissions) |
| Description | Create users, assign roles, scopes and limits; maintain roles |
| Preconditions | Administrator authenticated with users.manage |
| Trigger | New staff, role change or departure |
| Main success scenario | 1. Create or open user. 2. Assign companies, branches, departments. 3. Assign roles; set limits. 4. Save; sensitive permissions create approval request. 5. Owner approves. 6. User activated and notified. |
| Alternative scenarios | A1 Create custom role by copying a default. A2 Deactivate user. |
| Exception scenarios | E1 Administrator edits own permissions → rejected. E2 SoD conflict detected (e.g., same user can create supplier and approve payments) → warning requiring Owner approval. |
| Postconditions | Permissions effective; changes audited |
| Related functional requirements | FR-AUTH-005, FR-RBAC-001 to FR-RBAC-011 |
| Relevant business rules | BR-SEC-001, BR-SEC-002, BR-SEC-003 |
| Acceptance criteria | AT-RBAC-01 to AT-RBAC-04 |


### UC-03 Manage Chart of Accounts

| Element | Description |
| Primary actor | Accountant |
| Supporting actors | Finance Manager (approval of changes to used accounts) |
| Description | Create, modify, map, deactivate accounts |
| Preconditions | Company exists |
| Trigger | Setup or new reporting need |
| Main success scenario | 1. Open COA tree. 2. Add account under a parent with code, names, type, posting flag, mapping. 3. System validates structure and uniqueness. 4. Save; history recorded. |
| Alternative scenarios | A1 Import chart. A2 Deactivate zero-balance account. A3 Change mapping (approval). |
| Exception scenarios | E1 Duplicate code. E2 Delete used account → rejected. |
| Postconditions | Account available or changed; audit entry |
| Related functional requirements | FR-COA-001 to FR-COA-011 |
| Relevant business rules | BR-COA-001 to BR-COA-004 |
| Acceptance criteria | AT-COA-01 to AT-COA-03 |


### UC-04 Create journal entry

| Element | Description |
| Primary actor | Accountant |
| Supporting actors | — |
| Description | Prepare a manual journal voucher |
| Preconditions | Period exists and is open or soft-closed (adjusting); permission gl.journal.create |
| Trigger | Need for manual entry |
| Main success scenario | 1. New journal; enter header. 2. Add lines; running totals and difference displayed. 3. Attach support. 4. Save Draft. 5. Submit; system validates balance and accounts; status Submitted; approval routed. |
| Alternative scenarios | A1 From template or recurring schedule. A2 Copy existing journal. A3 Foreign currency journal. |
| Exception scenarios | E1 Unbalanced → cannot submit. E2 Control account without override → rejected. E3 Closed period date → rejected. |
| Postconditions | Draft or Submitted journal |
| Related functional requirements | FR-GL-001, FR-GL-003, FR-GL-004, FR-GL-013, FR-GL-020 |
| Relevant business rules | BR-GL-001, BR-GL-005, BR-GL-008, BR-COA-001, BR-COA-002 |
| Acceptance criteria | AT-GL-01 |


### UC-05 Approve journal entry

| Element | Description |
| Primary actor | Finance Manager |
| Supporting actors | Owner (higher level) |
| Description | Review and approve or reject a submitted journal |
| Preconditions | Journal Submitted; approver eligible |
| Trigger | Approval notification |
| Main success scenario | 1. Open approval inbox. 2. Review lines, attachments, history. 3. Approve. 4. If further levels required, route onward; otherwise status Approved. |
| Alternative scenarios | A1 Reject with comment. A2 Delegated approver acts. |
| Exception scenarios | E1 Approver is preparer → blocked. E2 Amount above limit → blocked/escalated. |
| Postconditions | Approved or Rejected; actions audited |
| Related functional requirements | FR-GL-005, FR-WFL-001 to FR-WFL-005, FR-RBAC-006, FR-RBAC-007 |
| Relevant business rules | BR-SEC-001, BR-SEC-002, BR-WFL-001 |
| Acceptance criteria | AT-RBAC-02, AT-RBAC-03, AT-WFL-01 |


### UC-06 Post journal entry

| Element | Description |
| Primary actor | Finance Manager or Accountant with post permission |
| Supporting actors | — |
| Description | Post an approved journal to the ledger |
| Preconditions | Journal Approved; period open |
| Trigger | User selects Post |
| Main success scenario | 1. Confirmation dialog shows date, period, totals, accounts. 2. User confirms. 3. Posting service executes (Section 9.2). 4. Journal number displayed; status Posted. |
| Alternative scenarios | A1 Batch posting of several approved journals (each atomic). |
| Exception scenarios | E1 Period closed. E2 Duplicate request → original result. E3 Database failure → rollback, retry possible. |
| Postconditions | Ledger updated; audit entry |
| Related functional requirements | FR-GL-006, FR-GL-007, FR-GL-008, FR-GL-009 |
| Relevant business rules | BR-GL-001, BR-GL-006, BR-GL-007, BR-CLS-001 |
| Acceptance criteria | AT-GL-02, AT-GL-03 |


### UC-07 Reverse journal entry

| Element | Description |
| Primary actor | Finance Manager |
| Supporting actors | Accountant (requests) |
| Description | Correct a posted journal by reversal |
| Preconditions | Journal Posted and not reversed; reversal date in open period |
| Trigger | Error detected |
| Main success scenario | 1. Open posted journal; Reverse. 2. Enter reason and date. 3. Approve (if required). 4. Reversal posted and linked. |
| Alternative scenarios | A1 Adjusting entry instead. |
| Exception scenarios | E1 Already reversed. E2 Date in closed period. E3 Journal generated by a subledger document → user directed to the document’s correction (credit note, payment reversal). |
| Postconditions | Original marked reversed; reversal posted |
| Related functional requirements | FR-GL-010, FR-GL-017 |
| Relevant business rules | BR-GL-004, BR-GL-009, BR-DOC-002 |
| Acceptance criteria | AT-GL-04 |


### UC-08 Create customer invoice

| Element | Description |
| Primary actor | AR Officer |
| Supporting actors | Approver; customer (receives PDF) |
| Description | Bill a customer on credit |
| Preconditions | Customer active; accounts and tax configured |
| Trigger | Delivery of goods or services |
| Main success scenario | As WF-02 steps 1–6 |
| Alternative scenarios | A1 Foreign currency. A2 Tax-inclusive prices. A3 Recurring invoice template (Could). |
| Exception scenarios | E1 Credit limit exceeded. E2 Unverified tax code blocked. E3 Missing rate. |
| Postconditions | Posted invoice; AR updated |
| Related functional requirements | FR-AR-002, FR-AR-003, FR-AR-005, FR-TAX-005, FR-DOC-002, FR-DOC-004 |
| Relevant business rules | BR-AR-001, BR-AR-004, BR-DOC-001, BR-TAX-001 |
| Acceptance criteria | AT-AR-04, AT-DOC-01 |


### UC-09 Receive customer payment

| Element | Description |
| Primary actor | AR Officer or Cashier |
| Supporting actors | Accountant |
| Description | Record and allocate a receipt |
| Preconditions | Bank/cash account; open invoices or advance allowed |
| Trigger | Payment received |
| Main success scenario | As WF-03 |
| Alternative scenarios | A1 Partial. A2 Overpayment. A3 Different currency (realised FX). |
| Exception scenarios | E1 Over-allocation. E2 Concurrent allocation conflict. |
| Postconditions | Receipt posted; balances updated |
| Related functional requirements | FR-AR-006 to FR-AR-010, FR-FX-009 |
| Relevant business rules | BR-AR-002, BR-AR-003, BR-AR-006, BR-FX-003 |
| Acceptance criteria | AT-AR-01 to AT-AR-03, AT-FX-02 |


### UC-10 Create supplier invoice

| Element | Description |
| Primary actor | AP Officer |
| Supporting actors | Department Manager, Finance Manager |
| Description | Record a supplier bill or expense invoice |
| Preconditions | Supplier Verified |
| Trigger | Bill received |
| Main success scenario | As WF-04 |
| Alternative scenarios | A1 Asset purchase. A2 Inventory purchase (if integrated). A3 Expense bill via Expenses module. |
| Exception scenarios | E1 Duplicate. E2 Budget block. |
| Postconditions | Posted supplier invoice |
| Related functional requirements | FR-AP-002 to FR-AP-005, FR-EXP-002, FR-EXP-006 |
| Relevant business rules | BR-AP-001, BR-AP-003, BR-EXP-001 |
| Acceptance criteria | AT-AP-01 |


### UC-11 Record supplier payment

| Element | Description |
| Primary actor | AP Officer (prepare); Finance Manager (approve) |
| Supporting actors | Cashier or releaser |
| Description | Approve and record payment to supplier |
| Preconditions | Posted invoices; verified bank details |
| Trigger | Due date or payment run |
| Main success scenario | As WF-05 |
| Alternative scenarios | A1 Partial. A2 Advance. A3 Cash payment. |
| Exception scenarios | E1 Not approved. E2 Bank-detail change pending. E3 Duplicate release. |
| Postconditions | Payment posted; invoices settled |
| Related functional requirements | FR-AP-008 to FR-AP-011, FR-AP-017 |
| Relevant business rules | BR-AP-004, BR-AP-005, BR-AP-006 |
| Acceptance criteria | AT-AP-02 to AT-AP-04 |


### UC-12 Reconcile bank statement

| Element | Description |
| Primary actor | Accountant |
| Supporting actors | Finance Manager (review) |
| Description | Reconcile book and bank balances |
| Preconditions | Statement file; posted transactions |
| Trigger | Statement received |
| Main success scenario | As WF-08 |
| Alternative scenarios | A1 Manual statement entry. A2 Reopen. |
| Exception scenarios | E1 Duplicate import. E2 Undocumented difference. |
| Postconditions | Completed, locked reconciliation |
| Related functional requirements | FR-CB-008 to FR-CB-013 |
| Relevant business rules | BR-CB-001, BR-CB-002 |
| Acceptance criteria | AT-CB-01 to AT-CB-03 |


### UC-13 Generate financial reports

| Element | Description |
| Primary actor | Finance Manager |
| Supporting actors | Owner, Auditor, Department Manager |
| Description | Run, review and export statements and reports |
| Preconditions | Report permission; mappings complete |
| Trigger | Period close or request |
| Main success scenario | As WF-16 |
| Alternative scenarios | A1 Background generation for large reports. A2 Comparatives and budget columns. |
| Exception scenarios | E1 Validation failure (imbalance, unmapped). E2 Scope restriction removes data. |
| Postconditions | Report displayed or exported |
| Related functional requirements | FR-RPT-001 to FR-RPT-017, FR-DASH-002 |
| Relevant business rules | BR-RPT-001 to BR-RPT-003 |
| Acceptance criteria | AT-RPT-01 to AT-RPT-04 |


### UC-14 Manage fixed assets

| Element | Description |
| Primary actor | Accountant |
| Supporting actors | Finance Manager |
| Description | Register, depreciate, transfer and dispose of assets |
| Preconditions | Asset categories configured |
| Trigger | Acquisition, month end, transfer, disposal |
| Main success scenario | As WF-09 |
| Alternative scenarios | A1 Disposal with sale. A2 Change in estimate. |
| Exception scenarios | E1 Period closed. E2 Duplicate depreciation run. |
| Postconditions | Register and GL consistent |
| Related functional requirements | FR-FA-001 to FR-FA-012 |
| Relevant business rules | BR-FA-001 to BR-FA-003 |
| Acceptance criteria | AT-FA-01 to AT-FA-03 |


### UC-15 Close accounting period

| Element | Description |
| Primary actor | Finance Manager |
| Supporting actors | Accountants, Owner |
| Description | Complete month-end or year-end close |
| Preconditions | Period Open |
| Trigger | Month or year end |
| Main success scenario | As WF-12 (month) and WF-13 (year) |
| Alternative scenarios | A1 Reopen with approval. |
| Exception scenarios | E1 Blocking checklist items. E2 Posting attempt during close (blocked by lock). |
| Postconditions | Period Closed |
| Related functional requirements | FR-CLS-001 to FR-CLS-013, FR-ORG-006 |
| Relevant business rules | BR-CLS-001 to BR-CLS-004 |
| Acceptance criteria | AT-CLS-01 to AT-CLS-04 |


### UC-16 Export financial data

| Element | Description |
| Primary actor | Accountant or Auditor |
| Supporting actors | — |
| Description | Export reports, lists or audit data |
| Preconditions | Export permission for the data type |
| Trigger | Need for offline analysis, audit or filing support |
| Main success scenario | 1. Open report or list with filters. 2. Choose format (PDF, Excel, CSV). 3. System generates with scope filters; large exports run in background. 4. File downloaded; export audited. |
| Alternative scenarios | A1 Scheduled export (Could). |
| Exception scenarios | E1 No permission → 403. E2 Export too large → background job. |
| Postconditions | File delivered; audit event |
| Related functional requirements | FR-IMP-011, FR-RPT-016, FR-AUD-006 |
| Relevant business rules | BR-SEC-003, BR-AUD-001 |
| Acceptance criteria | AT-IMP-03, AT-RPT-03 |


# 11. Database Design

## 11.1 Design Principles

| Principle | Specification |
| DBMS | PostgreSQL 16 (proposed); UTF-8 encoding; ICU collation supporting Khmer sorting where available |
| Keys | id UUID (v7, time-ordered) primary keys on business tables; bigint identity for high-volume append tables (journal_entry_lines, audit_logs) |
| Isolation | company_id NOT NULL on every company-owned table; branch_id on documents and lines; composite foreign keys include company_id where practical to prevent cross-company references |
| Money | NUMERIC(19,4) for amounts; NUMERIC(20,8) for rates; NUMERIC(19,6) for quantities; CHAR(3) ISO currency codes |
| Dates | DATE for posting, document and due dates; TIMESTAMPTZ (UTC) for events |
| Status | TEXT with CHECK constraints (or enum types) for state machines |
| Mutable drafts | version INTEGER for optimistic locking; created_at/by, updated_at/by |
| Immutable postings | Posted journals, lines, allocations, reconciliations and audit logs protected by triggers and privileges |
| Derived balances | No stored account balance is authoritative. Optional account_period_balances summary table maintained in the posting transaction and verified nightly (documented consistency strategy, NFR-SCL-004) |
| Soft delete | Not used for financial records; drafts may be deleted; master data deactivated |


## 11.2 Table Catalogue

| Group | Table | Purpose |
| Organisation | companies | Legal entities with base currency, basis, status, default accounts |
|  | branches, departments, business_units | Organisational dimensions |
|  | fiscal_years, accounting_periods, period_status_history, period_close_checklists | Calendars, period control and close evidence |
| Identity | users, user_sessions | Accounts and sessions |
|  | roles, permissions, role_permissions, user_roles | RBAC |
|  | user_company_access, user_branch_access, user_department_access, role_account_restrictions, approval_limits | Scopes and limits |
|  | user_activity_logs | Authentication and activity events |
| Accounting core | account_categories, chart_of_accounts, statement_mappings | Accounts and reporting structure |
|  | journal_entries, journal_entry_lines | General ledger |
|  | accounting_dimensions, dimension_values | User-defined dimensions |
|  | opening_balances | Opening balance batches and sign-off |
|  | account_period_balances (optional) | Performance summary |
| Receivables | customers, customer_invoices, customer_invoice_lines, customer_receipts, customer_payment_allocations, customer_credit_notes, customer_credit_note_lines, customer_writeoffs | AR subledger |
| Payables | suppliers, supplier_bank_accounts, supplier_invoices, supplier_invoice_lines, supplier_payments, supplier_payment_allocations, supplier_credit_notes | AP subledger |
| Cash and bank | bank_accounts, cash_accounts, cash_transactions, cash_transaction_lines, bank_statement_imports, bank_transactions, bank_reconciliations, bank_reconciliation_lines, transfers | Cash and bank |
| Financial operations | expenses, expense_lines, expense_categories, expense_claims, payment_vouchers, receipt_vouchers, recurring_templates | Expenses and vouchers |
|  | attachments | Files linked to any record |
|  | approval_rules, approval_requests, approval_actions, delegations | Workflow |
| Currency and tax | currencies, exchange_rates, fx_revaluation_runs, fx_revaluation_lines | Multi-currency |
|  | tax_codes, tax_rate_history, tax_periods | Tax configuration |
| Fixed assets | asset_categories, fixed_assets, depreciation_schedules, depreciation_runs, asset_transactions | Asset register |
| Budgeting | budgets, budget_lines, budget_revisions | Budgets |
| Inventory (optional) | inventory_events, inventory_valuation_snapshots | Integration |
| Platform | audit_logs, document_sequences, document_templates, document_snapshots, notification_records, import_batches, import_errors, import_mappings, idempotency_keys, outbox_events, report_runs, company_settings, setting_history | Cross-cutting |


## 11.3 Entity Relationship Diagrams
The model is shown in seven focused diagrams for readability. Cardinality notation: || exactly one, o| zero or one, }o zero or many, }| one or many.

### 11.3.1 Organisation and Identity
Figure 9. Organisation and Identity

### 11.3.2 Accounting Core
Figure 10. Accounting Core

### 11.3.3 Accounts Receivable
Figure 11. Accounts Receivable

### 11.3.4 Accounts Payable
Figure 12. Accounts Payable

### 11.3.5 Cash and Bank
Figure 13. Cash and Bank

### 11.3.6 Fixed Assets, Tax and Currency
Figure 14. Fixed Assets, Tax and Currency

### 11.3.7 Budgets, Workflow and Platform
Figure 15. Budgets, Workflow and Platform

## 11.4 Data Dictionary (Important Tables)
Legend: PK primary key; FK foreign key; UQ unique; N nullable (Y = may be null).

### 11.4.1 companies

| Column | Type | Key | N | Default | Business meaning |
| id | uuid | PK | N | gen | Company identifier |
| code | varchar(20) | UQ | N |  | Short code |
| legal_name_en, legal_name_km | varchar(200) |  | N / Y |  | Legal names |
| registration_no, tax_id | varchar(50) |  | Y |  | As applicable (V-02) |
| base_currency | char(3) | FK currencies | N |  | Functional currency; locked after first posting |
| accounting_basis | text | CHECK (‘ACCRUAL’) | N | ‘ACCRUAL’ | Release 1 supports accrual books (D-02) |
| status | text | CHECK (SETUP, ACTIVE, INACTIVE) | N | ‘SETUP’ | Posting allowed only when ACTIVE |
| retained_earnings_account_id, current_earnings_account_id, rounding_account_id, fx_realised_gain_id, fx_realised_loss_id, fx_unrealised_gain_id, fx_unrealised_loss_id, suspense_account_id | uuid | FK chart_of_accounts | Y until ACTIVE |  | Default accounts |
| opening_balances_signed_off_at, _by | timestamptz, uuid |  | Y |  | BR-CFG-002 |


### 11.4.2 accounting_periods

| Column | Type | Key | N | Default | Business meaning |
| id | uuid | PK | N |  |  |
| company_id, fiscal_year_id | uuid | FK | N |  |  |
| period_no | smallint | UQ (fiscal_year_id, period_no) | N |  | 1–12, 13 for adjustments |
| start_date, end_date | date | EXCLUDE overlapping daterange per company (except period 13) | N |  | Calendar range |
| status | text | CHECK (FUTURE, OPEN, SOFT_CLOSED, CLOSED, REOPENED) | N | ‘FUTURE’ | Posting control |
| closed_at, closed_by | timestamptz, uuid |  | Y |  | Last close |


### 11.4.3 chart_of_accounts

| Column | Type | Key | N | Default | Business meaning |
| id | uuid | PK | N |  |  |
| company_id | uuid | FK | N |  |  |
| code | varchar(20) | UQ (company_id, code) | N |  | Account code |
| name_en, name_km | varchar(200) |  | N / Y |  | Names |
| account_type | text | CHECK (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE) | N |  | Type |
| category_id | uuid | FK account_categories | N |  | Subcategory |
| parent_id | uuid | FK chart_of_accounts | Y |  | Hierarchy |
| normal_balance | text | CHECK (DEBIT, CREDIT) | N | from type |  |
| is_posting | boolean |  | N | true | Header accounts false |
| is_control, control_module | boolean, text |  | N / Y | false | BR-COA-002 |
| is_sensitive | boolean |  | N | false | BR-SEC-004 |
| currency_restriction | char(3) | FK | Y |  | Optional |
| cash_flow_class | text | CHECK (OPERATING, INVESTING, FINANCING, CASH, NONE) | N | ‘NONE’ | Cash flow statement |
| is_active, effective_from, effective_to | boolean, date, date |  | N / Y / Y | true |  |


### 11.4.4 journal_entries

| Column | Type | Key | N | Default | Business meaning |
| id | uuid | PK | N |  |  |
| company_id, branch_id | uuid | FK | N / Y |  |  |
| journal_no | varchar(40) | UQ (company_id, journal_no) when not null | Y until posted |  | Assigned at posting |
| journal_type | text | CHECK (MANUAL, SYSTEM, ADJUSTING, REVERSAL, OPENING, YEAR_END, REVALUATION) | N | ‘MANUAL’ |  |
| status | text | CHECK (DRAFT, SUBMITTED, APPROVED, REJECTED, POSTED, CANCELLED) | N | ‘DRAFT’ |  |
| posting_date, document_date | date |  | N |  | Posting date determines period |
| period_id | uuid | FK accounting_periods | N |  | Derived from posting date |
| description, reference | text, varchar(100) |  | N / Y |  |  |
| currency | char(3) | FK | N | base | Header currency (lines may differ for multi-currency journals) |
| source_type, source_id, source_no | text, uuid, varchar | UQ (source_type, source_id, purpose) | Y |  | Link to originating document (Section 11.7) |
| purpose | text |  | Y |  | e.g., POST, REVERSAL, FX_REALISED |
| reversal_of_id | uuid | FK journal_entries, UQ | Y |  | One reversal per journal |
| is_reversed | boolean |  | N | false |  |
| total_debit_base, total_credit_base | numeric(19,4) | CHECK equal when POSTED | N | 0 | Control totals |
| created_by, submitted_by, approved_by, posted_by | uuid | FK users | Y |  | Workflow actors |
| posted_at | timestamptz |  | Y |  | Server time |
| version | integer |  | N | 1 | Optimistic lock (drafts) |


### 11.4.5 journal_entry_lines

| Column | Type | Key | N | Default | Business meaning |
| id | bigint identity | PK | N |  |  |
| journal_entry_id | uuid | FK journal_entries ON DELETE RESTRICT | N |  |  |
| company_id | uuid | FK | N |  | Denormalised for isolation and indexing |
| line_no | smallint | UQ (journal_entry_id, line_no) | N |  |  |
| account_id | uuid | FK chart_of_accounts | N |  | Must be postable at posting date |
| debit_base, credit_base | numeric(19,4) | CHECK (≥ 0, exactly one > 0) | N | 0 | Base amounts |
| currency | char(3) | FK currencies | N |  | Transaction currency |
| debit_txn, credit_txn | numeric(19,4) | CHECK as above | N | 0 | Transaction-currency amounts |
| exchange_rate, rate_date, rate_source | numeric(20,8), date, text |  | N (1 for base) |  | BR-FX-001 |
| description | text |  | Y |  |  |
| branch_id, department_id, business_unit_id | uuid | FK | Y |  | Dimensions |
| dimension_values | jsonb | validated | Y |  | User-defined dimensions (keys validated against definitions) |
| tax_code_id, tax_base_amount | uuid, numeric |  | Y |  | Tax lines |
| party_type, party_id | text, uuid |  | Y |  | Customer or supplier for control-account lines |
| reconciliation_id | uuid | FK bank_reconciliations | Y |  | Set when reconciled (bank lines) |


### 11.4.6 customer_invoices and lines

| Column | Type | Key | N | Default | Business meaning |
| id, company_id, branch_id, customer_id | uuid | PK / FK | N |  |  |
| invoice_no | varchar(40) | UQ (company_id, sequence scope, invoice_no) | Y until posted |  |  |
| invoice_date, posting_date, due_date | date |  | N |  |  |
| currency, exchange_rate | char(3), numeric(20,8) |  | N |  |  |
| subtotal, discount_total, tax_total, total | numeric(19,4) | CHECK total = subtotal − discount + tax | N |  | Transaction currency |
| total_base | numeric(19,4) |  | N |  |  |
| status | text | CHECK (DRAFT, SUBMITTED, APPROVED, OPEN, PARTIALLY_PAID, PAID, CREDITED, CANCELLED) | N | ‘DRAFT’ |  |
| amount_allocated, amount_credited, amount_written_off | numeric(19,4) | CHECK ≤ total | N | 0 | Cached; verified nightly |
| outstanding | numeric(19,4) | generated column total − allocated − credited − written_off | N |  | BR-AR-002 |
| journal_entry_id | uuid | FK | Y |  | Posting journal |
| lines: line_no, description, quantity, unit_price, discount, net_amount, tax_code_id, tax_amount, revenue_account_id, dimensions | various | FK accounts, tax codes |  |  |  |


### 11.4.7 customer_receipts and customer_payment_allocations

| Column | Type | Key | N | Default | Business meaning |
| receipts: id, company_id, customer_id, receipt_no, receipt_date, method, bank_account_id or cash_account_id, currency, amount, exchange_rate, amount_base, reference, status, amount_allocated, journal_entry_id, idempotency_key |  | UQ (company_id, receipt_no); UQ idempotency_key |  |  | Money received |
| allocations: id, receipt_id, invoice_id, amount_txn, amount_base_at_invoice_rate, amount_base_at_receipt_rate, fx_difference_base, allocated_at, allocated_by, reversed_at |  | FK receipt and invoice; CHECK amount > 0 |  |  | Settlement and realised FX (BR-FX-003) |


### 11.4.8 supplier_invoices

| Column | Type | Key | N | Default | Business meaning |
| id, company_id, branch_id, supplier_id | uuid | PK / FK | N |  |  |
| supplier_invoice_no | varchar(60) |  | N |  | As printed by supplier |
| supplier_invoice_no_norm | varchar(60) | partial UQ (company_id, supplier_id, supplier_invoice_no_norm) WHERE status ≠ CANCELLED | N |  | BR-AP-001 |
| internal_no | varchar(40) | UQ | Y until posted |  |  |
| invoice_date, received_date, posting_date, due_date | date |  | N |  |  |
| currency, exchange_rate, subtotal, tax_total, total, total_base, outstanding |  |  | N |  |  |
| status | text | CHECK (DRAFT, SUBMITTED, APPROVED, OPEN, PARTIALLY_PAID, PAID, CANCELLED) | N |  |  |
| duplicate_override_reason | text |  | Y |  | Near-duplicate warning override |


### 11.4.9 supplier_payments

| Column | Type | Key | N | Default | Business meaning |
| id, company_id, supplier_id, bank_account_id or cash_account_id | uuid |  | N |  |  |
| payment_no | varchar(40) | UQ (company_id, payment_no) | Y until released |  |  |
| payment_date, method, currency, amount, exchange_rate, amount_base, bank_reference |  |  | N / Y |  |  |
| status | text | CHECK (DRAFT, SUBMITTED, APPROVED, PAID, CANCELLED, REVERSED) | N |  | BR-AP-004 |
| prepared_by, approved_by, released_by | uuid | CHECK approved_by ≠ prepared_by (unless reduced-SoD flag) |  |  |  |
| idempotency_key | varchar(80) | UQ | Y |  | Release idempotency |


### 11.4.10 bank_transactions, bank_reconciliations, bank_reconciliation_lines

| Column | Type | Key | N | Default | Business meaning |
| bank_transactions: id, bank_account_id, import_id, txn_date, description, amount (signed), reference, statement_balance, row_hash, status (UNMATCHED, MATCHED, ADJUSTED, IGNORED) |  | UQ (bank_account_id, row_hash) |  |  | Statement lines |
| bank_reconciliations: id, bank_account_id, statement_date, statement_opening, statement_closing, book_balance, difference, status (IN_PROGRESS, COMPLETED, REOPENED), completed_by, completed_at, reopened_reason |  | UQ (bank_account_id, statement_date) |  |  | Reconciliation header |
| bank_reconciliation_lines: reconciliation_id, bank_transaction_id, journal_entry_line_id, matched_amount, matched_by |  | UQ (journal_entry_line_id) for active matches |  |  | Matches |


### 11.4.11 currencies and exchange_rates

| Column | Type | Key | N | Default | Business meaning |
| currencies: code, name_en, name_km, symbol, minor_units, cash_rounding_increment, is_active | char(3) PK |  |  |  |  |
| exchange_rates: id, company_id, from_currency, to_currency, rate_type, rate_date, rate, source, entered_by |  | UQ (company_id, from, to, rate_type, rate_date) |  |  | Rate history |


### 11.4.12 tax_codes and tax_rate_history

| Column | Type | Key | N | Default | Business meaning |
| tax_codes: id, company_id, code, name_en, name_km, tax_type, calc_method (EXCLUSIVE, INCLUSIVE), payable_account_id, recoverable_account_id, verification_status, verified_by, verification_ref |  | UQ (company_id, code) |  |  |  |
| tax_rate_history: tax_code_id, rate, effective_from, effective_to, changed_by | numeric(9,6) | EXCLUDE overlapping daterange per code |  |  | BR-TAX-001 |


### 11.4.13 fixed_assets and asset_transactions

| Column | Type | Key | N | Default | Business meaning |
| fixed_assets: id, company_id, tag_no, name, category_id, cost, residual_value, acquisition_date, in_service_date, useful_life_months, method, status (DRAFT, ACTIVE, FULLY_DEPRECIATED, DISPOSED), branch_id, department_id, accumulated_depreciation (derived cache) |  | UQ (company_id, tag_no) |  |  | Register |
| asset_transactions: asset_id, txn_type (ACQUISITION, DEPRECIATION, IMPAIRMENT, TRANSFER, DISPOSAL), period_id, amount, journal_entry_id |  | UQ (asset_id, period_id) WHERE txn_type = DEPRECIATION |  |  | BR-FA-002 |


### 11.4.14 audit_logs

| Column | Type | Key | N | Default | Business meaning |
| id | bigint identity | PK | N |  | Sequence |
| occurred_at | timestamptz |  | N | now() |  |
| company_id, branch_id | uuid |  | Y |  | Scope |
| user_id | uuid |  | Y (system jobs) |  | Actor |
| event_type | text |  | N |  | e.g., JOURNAL_POSTED |
| entity_type, entity_id | text, text |  | Y |  | Affected record |
| old_values, new_values | jsonb |  | Y |  | Changed fields; secrets masked |
| reason | text |  | Y |  | Required for specified events |
| ip_address, user_agent, correlation_id | inet, text, uuid |  | Y |  | Context |
| prev_hash, entry_hash | bytea |  | N |  | Hash chain |


### 11.4.15 document_sequences, approval_requests, import_batches

| Table | Key columns and constraints |
| document_sequences | (company_id, document_type, scope_key) PK where scope_key encodes branch/fiscal year; prefix_pattern, next_value, padding; row locked during allocation |
| approval_requests | id, company_id, document_type, document_id, amount_base, rule_id, current_step, status, requested_by; approval_actions (request_id, step, actor_id, action, comment, acted_at, delegated_from) |
| import_batches | id, company_id, import_type, file_name, file_hash, status (VALIDATING, PREVIEW, COMMITTED, REJECTED, ROLLED_BACK), row_count, error_count, created_by; import_errors (batch_id, row_no, column, value, error_code, message) |
| idempotency_keys | (scope, key) PK, request_hash, response_status, response_body, created_at |


## 11.5 Representative DDL (Accounting Core)
The DDL below is representative and abbreviated (tables such as account_categories, branches, departments and the helper function forbid_posted_change_delete(), which simply raises an exception, are defined in the full migration set); final definitions are produced as Alembic migrations. btree_gist is required for exclusion constraints.
CREATE TABLE currencies (   code            char(3) PRIMARY KEY,   name_en         varchar(60) NOT NULL,   name_km         varchar(60),   symbol          varchar(8),   minor_units     smallint NOT NULL CHECK (minor_units BETWEEN 0 AND 4),   is_active       boolean NOT NULL DEFAULT true );  CREATE TABLE companies (   id              uuid PRIMARY KEY,   code            varchar(20) NOT NULL UNIQUE,   legal_name_en   varchar(200) NOT NULL,   legal_name_km   varchar(200),   tax_id          varchar(50),   base_currency   char(3) NOT NULL REFERENCES currencies(code),   accounting_basis text NOT NULL DEFAULT 'ACCRUAL' CHECK (accounting_basis IN ('ACCRUAL')),   status          text NOT NULL DEFAULT 'SETUP' CHECK (status IN ('SETUP','ACTIVE','INACTIVE')),   created_at      timestamptz NOT NULL DEFAULT now() );  CREATE TABLE fiscal_years (   id          uuid PRIMARY KEY,   company_id  uuid NOT NULL REFERENCES companies(id),   name        varchar(20) NOT NULL,   start_date  date NOT NULL,   end_date    date NOT NULL CHECK (end_date > start_date),   status      text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSING','CLOSED')),   UNIQUE (company_id, name) );  CREATE TABLE accounting_periods (   id              uuid PRIMARY KEY,   company_id      uuid NOT NULL REFERENCES companies(id),   fiscal_year_id  uuid NOT NULL REFERENCES fiscal_years(id),   period_no       smallint NOT NULL CHECK (period_no BETWEEN 1 AND 13),   start_date      date NOT NULL,   end_date        date NOT NULL CHECK (end_date >= start_date),   status          text NOT NULL DEFAULT 'FUTURE'                   CHECK (status IN ('FUTURE','OPEN','SOFT_CLOSED','CLOSED','REOPENED')),   UNIQUE (fiscal_year_id, period_no),   EXCLUDE USING gist (company_id WITH =, daterange(start_date, end_date, '[]') WITH &&)           WHERE (period_no <= 12) );  -- requires btree_gist extension  CREATE TABLE chart_of_accounts (   id              uuid PRIMARY KEY,   company_id      uuid NOT NULL REFERENCES companies(id),   code            varchar(20) NOT NULL,   name_en         varchar(200) NOT NULL,   name_km         varchar(200),   account_type    text NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),   category_id     uuid NOT NULL REFERENCES account_categories(id),   parent_id       uuid REFERENCES chart_of_accounts(id),   normal_balance  text NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),   is_posting      boolean NOT NULL DEFAULT true,   is_control      boolean NOT NULL DEFAULT false,   is_sensitive    boolean NOT NULL DEFAULT false,   cash_flow_class text NOT NULL DEFAULT 'NONE',   is_active       boolean NOT NULL DEFAULT true,   UNIQUE (company_id, code),   UNIQUE (company_id, id)            -- target for composite FKs );  CREATE TABLE journal_entries (   id                 uuid PRIMARY KEY,   company_id         uuid NOT NULL REFERENCES companies(id),   branch_id          uuid REFERENCES branches(id),   journal_no         varchar(40),   journal_type       text NOT NULL DEFAULT 'MANUAL'                      CHECK (journal_type IN ('MANUAL','SYSTEM','ADJUSTING','REVERSAL','OPENING','YEAR_END','REVALUATION')),   status             text NOT NULL DEFAULT 'DRAFT'                      CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED','CANCELLED')),   posting_date       date NOT NULL,   document_date      date NOT NULL,   period_id          uuid NOT NULL REFERENCES accounting_periods(id),   description        text NOT NULL,   reference          varchar(100),   source_type        text,   source_id          uuid,   purpose            text,   reversal_of_id     uuid UNIQUE REFERENCES journal_entries(id),   is_reversed        boolean NOT NULL DEFAULT false,   total_debit_base   numeric(19,4) NOT NULL DEFAULT 0,   total_credit_base  numeric(19,4) NOT NULL DEFAULT 0,   created_by uuid NOT NULL, approved_by uuid, posted_by uuid,   posted_at          timestamptz,   version            integer NOT NULL DEFAULT 1,   UNIQUE (company_id, journal_no),   UNIQUE (source_type, source_id, purpose),   CHECK (status <> 'POSTED' OR (journal_no IS NOT NULL AND posted_at IS NOT NULL                                 AND total_debit_base = total_credit_base AND total_debit_base > 0)) );  CREATE TABLE journal_entry_lines (   id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   journal_entry_id  uuid NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,   company_id        uuid NOT NULL,   line_no           smallint NOT NULL,   account_id        uuid NOT NULL,   debit_base        numeric(19,4) NOT NULL DEFAULT 0 CHECK (debit_base >= 0),   credit_base       numeric(19,4) NOT NULL DEFAULT 0 CHECK (credit_base >= 0),   currency          char(3) NOT NULL REFERENCES currencies(code),   debit_txn         numeric(19,4) NOT NULL DEFAULT 0 CHECK (debit_txn >= 0),   credit_txn        numeric(19,4) NOT NULL DEFAULT 0 CHECK (credit_txn >= 0),   exchange_rate     numeric(20,8) NOT NULL CHECK (exchange_rate > 0),   description       text,   branch_id uuid, department_id uuid, business_unit_id uuid,   dimension_values  jsonb,   party_type text, party_id uuid,   UNIQUE (journal_entry_id, line_no),   FOREIGN KEY (company_id, account_id) REFERENCES chart_of_accounts(company_id, id),   CHECK ((debit_base > 0 AND credit_base = 0) OR (credit_base > 0 AND debit_base = 0)),   CHECK ((debit_txn > 0 AND credit_txn = 0) OR (credit_txn > 0 AND debit_txn = 0)) );  -- Balance check at commit (defence in depth; the service validates first) CREATE FUNCTION check_journal_balanced() RETURNS trigger AS $$ BEGIN   IF NEW.status = 'POSTED' AND      (SELECT coalesce(sum(debit_base),0) - coalesce(sum(credit_base),0)         FROM journal_entry_lines WHERE journal_entry_id = NEW.id) <> 0 THEN     RAISE EXCEPTION 'JOURNAL_UNBALANCED %', NEW.id;   END IF;   RETURN NEW; END $$ LANGUAGE plpgsql; CREATE CONSTRAINT TRIGGER trg_journal_balanced AFTER INSERT OR UPDATE ON journal_entries   DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balanced();  -- Immutability of posted entries (only the is_reversed flag may change after posting) CREATE FUNCTION forbid_posted_change() RETURNS trigger AS $$ BEGIN   IF OLD.status = 'POSTED' AND      (NEW.company_id, NEW.journal_no, NEW.status, NEW.posting_date, NEW.period_id,       NEW.description, NEW.total_debit_base, NEW.total_credit_base, NEW.posted_at)      IS DISTINCT FROM      (OLD.company_id, OLD.journal_no, OLD.status, OLD.posting_date, OLD.period_id,       OLD.description, OLD.total_debit_base, OLD.total_credit_base, OLD.posted_at) THEN     RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE %', OLD.id;   END IF;   RETURN NEW; END $$ LANGUAGE plpgsql; CREATE TRIGGER trg_forbid_posted_change BEFORE UPDATE ON journal_entries   FOR EACH ROW EXECUTE FUNCTION forbid_posted_change(); CREATE TRIGGER trg_forbid_posted_delete BEFORE DELETE ON journal_entries   FOR EACH ROW WHEN (OLD.status = 'POSTED') EXECUTE FUNCTION forbid_posted_change_delete();  CREATE TABLE exchange_rates (   id             uuid PRIMARY KEY,   company_id     uuid NOT NULL REFERENCES companies(id),   from_currency  char(3) NOT NULL REFERENCES currencies(code),   to_currency    char(3) NOT NULL REFERENCES currencies(code),   rate_type      text NOT NULL DEFAULT 'TRANSACTION' CHECK (rate_type IN ('TRANSACTION','CLOSING','AVERAGE')),   rate_date      date NOT NULL,   rate           numeric(20,8) NOT NULL CHECK (rate > 0),   source         text NOT NULL,   entered_by     uuid NOT NULL,   entered_at     timestamptz NOT NULL DEFAULT now(),   UNIQUE (company_id, from_currency, to_currency, rate_type, rate_date),   CHECK (from_currency <> to_currency) );  CREATE TABLE audit_logs (   id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   occurred_at    timestamptz NOT NULL DEFAULT now(),   company_id     uuid,   branch_id      uuid,   user_id        uuid,   event_type     text NOT NULL,   entity_type    text,   entity_id      text,   old_values     jsonb,   new_values     jsonb,   reason         text,   ip_address     inet,   user_agent     text,   correlation_id uuid,   prev_hash      bytea NOT NULL,   entry_hash     bytea NOT NULL ); REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM ams_app; GRANT INSERT, SELECT ON audit_logs TO ams_app; REVOKE UPDATE, DELETE ON journal_entry_lines FROM ams_app;  -- lines are insert-only
The immutability trigger compares all business columns except the permitted is_reversed flag. Draft lines are replaced by inserting a new journal version or by deleting draft lines through a SECURITY DEFINER function that verifies the parent status is DRAFT, because the application role has no direct DELETE privilege on lines.

## 11.6 Integrity Rules: Database Constraints versus Application Logic

| Rule | Database constraint | Transactional application logic |
| Balanced journals (BR-GL-001) | Deferred constraint trigger; header CHECK on totals | Pre-validation with Decimal; per-currency balance check |
| Valid accounts (BR-COA-001) | FK to chart_of_accounts within company | Posting flag, active status and effective dates at posting date; control-account rule |
| Period control (BR-CLS-001) | FK to period | Status check under shared lock; permission for soft-closed |
| Unique numbering (BR-DOC-001) | UNIQUE (company, type, number) | Sequence allocation under row lock in posting transaction |
| Immutability (BR-GL-003) | Triggers and revoked privileges | No update endpoints for posted records |
| Idempotency (BR-GL-007) | UNIQUE idempotency keys; UNIQUE (source_type, source_id, purpose) | Return stored result |
| Allocation limits (BR-AR-003, BR-AP-006) | CHECK cached allocated ≤ total | Row locks on invoice and receipt; recompute and verify |
| Duplicate supplier invoice (BR-AP-001) | Partial UNIQUE on normalised number | Near-duplicate similarity warning |
| One reversal (BR-GL-004) | UNIQUE reversal_of_id | Status checks |
| Company isolation (BR-SEC-003) | Composite FKs; optional row-level security | Scope filters on every query |
| SoD (BR-SEC-002) | CHECK approved_by ≠ prepared_by where simple | Approval service with delegation and reduced-SoD flags |
| Depreciation once (BR-FA-002) | Partial UNIQUE (asset, period) | Batch skip logic |
| Rates present (BR-FX-002) | NOT NULL rate on lines | Rate lookup and override permission |


## 11.7 Source Document Linkage and Protection of Posted Data
Each journal generated by a module records source_type (e.g., CUSTOMER_INVOICE, CUSTOMER_RECEIPT, SUPPLIER_INVOICE, SUPPLIER_PAYMENT, CASH_TXN, EXPENSE, DEPRECIATION_RUN, FX_REVALUATION, YEAR_END, INVENTORY_BATCH), source_id, source_no and purpose; the source document stores journal_entry_id. The UNIQUE (source_type, source_id, purpose) constraint ensures one posting per document purpose. Control-account lines carry party_type and party_id so subledgers reconcile to the GL. Drill-down follows these links in both directions.
Posted records are protected by: (1) application design (no update or delete endpoints; state-transition endpoints only); (2) triggers rejecting changes to posted rows; (3) privileges — the application database role lacks UPDATE/DELETE on posted-line tables and audit logs; schema changes use a separate migration role; (4) the audit hash chain and nightly integrity checks; (5) restricted direct database access (administrator access logged and limited to break-glass procedures).

## 11.8 Indexing Recommendations

| Table | Index | Supports |
| journal_entry_lines | (company_id, account_id, journal_entry_id); BRIN or partition by posting period | Ledger inquiry, trial balance |
| journal_entries | (company_id, posting_date, status); (company_id, period_id, status); (source_type, source_id) | Period reports, drill-down |
| journal_entry_lines | (company_id, party_type, party_id) | Subledger reconciliation |
| customer_invoices | (company_id, customer_id, status); (company_id, due_date) WHERE status IN (‘OPEN’,‘PARTIALLY_PAID’) | Aging, overdue |
| supplier_invoices | partial UQ on normalised number; (company_id, due_date) WHERE open | Duplicates, payment proposals |
| customer_payment_allocations / supplier_payment_allocations | (invoice_id); (receipt_id or payment_id) | Balances |
| bank_transactions | (bank_account_id, txn_date); UQ (bank_account_id, row_hash) | Matching, duplicates |
| exchange_rates | UQ (company_id, from, to, rate_type, rate_date) | Rate lookup |
| audit_logs | (company_id, occurred_at); (entity_type, entity_id); (user_id, occurred_at) | Audit search |
| customers, suppliers | trigram GIN on name_en and name_km; UQ (company_id, code) | Search |


## 11.9 Transactions and Concurrency
Default isolation READ COMMITTED with explicit row locks for posting, allocation and sequence allocation; statement packs use REPEATABLE READ for a consistent snapshot.
Lock ordering (period → document → sequence → allocations in ID order) prevents deadlocks; deadlock retries are automatic for idempotent operations.
External calls (email) never occur inside posting transactions; the outbox pattern delivers them after commit.
Bulk operations (depreciation runs, revaluation, imports) commit per document or as a single batch as specified, never partially within a document.

## 11.10 Data Retention
Periods are proposed pending V-03 (statutory retention) and V-08 (personal data).

| Data | Proposed retention | Action |
| Journals, ledgers, invoices, receipts, payments, vouchers, reconciliations, asset records, tax records | At least the confirmed statutory period (proposed 10 years after fiscal year end) | Archive; never deleted because a user is deactivated |
| Attachments supporting financial records | Same as the parent record | Archive with parent |
| Audit logs | Same as financial records (proposed 10 years) | Archive with hash chain |
| Customer and supplier master data | While transactions are retained; inactive contact details may be anonymised after the retention of linked records ends | Anonymise |
| User activity logs | 2 years online, then archived with audit logs | Archive |
| Import files and error reports | 1 year | Delete |
| Application logs | 90 days | Delete |
| Idempotency keys | 7 days | Delete |
| Backups | Per NFR-BKP-002 | Expire securely |


## 11.11 Migration Strategy
Alembic migrations in version control, one per change, reviewed; expand–contract pattern for zero-downtime changes; every migration tested up and down in CI on an anonymised dataset; pre-migration backup in production; data backfills in batches with verification queries; seed scripts for currencies, permissions, default roles, account categories and templates; migration of legacy data through the import module (WF-15) rather than direct SQL.

# 12. System Architecture

## 12.1 Architectural Approach
The AMS is a modular monolith: one FastAPI backend organised into modules with explicit service interfaces, one PostgreSQL database, a Next.js frontend and a background worker process. There is no strong reason for microservices at SME scale: a single database transaction is the simplest and safest way to guarantee atomic posting across subledger and ledger. Module boundaries (enforced in CI) keep the option of extracting services later.

## 12.2 Technology Stack and Responsibilities

| Layer / need | Technology | Responsibility | Essential or optional |
| Web UI | Next.js (App Router), React, TypeScript | Pages, routing, server components for initial render, client components for forms and grids | Essential |
| Styling and components | Tailwind CSS, shadcn/ui | Consistent, accessible UI components | Essential |
| Forms | React Hook Form + Zod | Form state and client-side validation (usability only; server is authoritative) | Essential |
| Data tables | TanStack Table (with server-side pagination) | Sorting, filtering, column control | Essential |
| Charts | Recharts (proposed; alternative Apache ECharts) | Dashboard charts | Essential (dashboard) |
| Client data fetching | TanStack Query | Caching, retries, invalidation | Recommended |
| API | Python 3.12, FastAPI, Pydantic v2 | REST endpoints, validation, OpenAPI | Essential |
| ORM and migrations | SQLAlchemy 2.x, Alembic | Data access, unit of work, schema migrations | Essential |
| Authentication | Built-in module: Argon2 (argon2-cffi), JWT access tokens (short-lived) + server-side refresh sessions; TOTP (pyotp) | Identity, sessions, MFA | Essential |
| Authorisation | Built-in RBAC service with permission cache | Permissions, scopes, limits, SoD | Essential |
| Database | PostgreSQL 16 | System of record | Essential |
| Background jobs and scheduler | Procrastinate (PostgreSQL-backed task queue with periodic tasks) — avoids adding Redis in release 1; alternative ARQ/Dramatiq with Redis if load requires | Report generation, emails, imports, depreciation runs, reminders, integrity checks | Essential |
| PDF documents and reports | WeasyPrint with Jinja2 HTML templates | Invoices, vouchers, statements, reports with Khmer shaping | Essential |
| Excel and CSV | openpyxl (or XlsxWriter for large streaming exports); Python csv | Exports with typed numeric cells | Essential |
| File storage | S3-compatible object storage (cloud bucket or MinIO on premises); local volume acceptable for single-server pilot | Attachments, generated files | Essential |
| Email | SMTP relay or transactional email provider | Notifications, documents | Essential (optional feature for users) |
| Logging | structlog (JSON) to stdout; log collection by the hosting platform | Structured logs | Essential |
| Error tracking | Sentry (self-hosted or SaaS) | Exceptions with context | Recommended |
| Metrics and monitoring | Uptime checks; Prometheus + Grafana (optional) | Availability, latency, job health | Uptime essential; metrics optional |
| Backups | pgBackRest or WAL-G (self-managed) or managed database backups | Full + PITR backups, encryption | Essential |
| Reverse proxy | Caddy or Nginx | TLS termination, compression, rate limiting | Essential |
| Containers and deployment | Docker, Docker Compose (initial single host); Kubernetes only if scale requires | Packaging and runtime | Essential (Compose) |
| Configuration | Environment variables via .env per environment and secret store; pydantic-settings | Environment-specific settings | Essential |
| CI/CD | GitHub Actions | Lint, type check, tests, security scans, image build, deploy | Essential |
| Testing | pytest, Hypothesis, HTTPX, Testcontainers; Vitest; Playwright | Unit, property, integration, E2E | Essential |
| Future options | Redis (cache/queue), OpenID Connect SSO, read replica, Kubernetes | Scale and enterprise features | Optional |


## 12.3 High-Level Architecture
Figure 16. High-Level Architecture

## 12.4 Layers and Components

| # | Layer | Components | Responsibilities |
| 1 | User interface | Next.js app (route groups: auth, app, print), shared component library, i18n (next-intl, EN/KM), Zod schemas mirroring API | Rendering, navigation by permission, form UX, confirmation dialogs; never holds DB credentials or performs authoritative calculations |
| 2 | API | FastAPI routers per module, Pydantic request/response models, error handlers, idempotency middleware, pagination utilities | HTTP contract, validation, serialisation, OpenAPI |
| 3 | Authentication and authorisation | Auth service (login, refresh, MFA), permission dependency (require(permission, scope)), approval-limit and SoD evaluator | Identify user; enforce permissions, scopes, limits on every request |
| 4 | Business logic | Module services: AR, AP, CB, EXP, FA, BUD, TAX, FX, CLS, DOC, IMP, WFL | Workflows, state machines, document calculations, approvals |
| 5 | Accounting services | Posting service (single entry point to the ledger), posting-rule engine (document → journal lines), allocation engine, FX service, tax calculation library, money/rounding library, period service, sequence service | Double-entry enforcement, atomic posting, numbering, period control, exchange differences |
| 6 | Data access | SQLAlchemy repositories with scope filters, unit-of-work (one transaction per command), locking helpers | Persistence, isolation, concurrency |
| 7 | Database | PostgreSQL schemas, constraints, triggers, privileges | Integrity backstop, immutability |
| 8 | Reporting and document generation | Report query services (read-only, REPEATABLE READ), statement builder using mappings, WeasyPrint renderer, Excel/CSV writers | Consistent reports and documents |
| 9 | Background processing | Procrastinate worker: exports, large reports, emails, imports, scheduled reminders, recurring entries, depreciation runs, integrity checks, retention jobs | Asynchronous and scheduled work with retries |
| 10 | Logging and monitoring | structlog, correlation IDs, Sentry, health endpoints (/health/live, /health/ready), metrics endpoint | Observability and alerting |

Communication. The browser calls FastAPI through the reverse proxy using HTTPS REST with JSON. Next.js server components may call the API server-side, forwarding the user’s access token (never a privileged token). Only the API and worker connect to PostgreSQL and object storage, using least-privilege credentials from the environment. The worker shares the same codebase and services as the API, so posting logic is never duplicated.

## 12.5 Typical Request Flow
User submits a form; the UI validates for usability and sends POST /api/v1/customer-invoices with JSON and access token.
Reverse proxy terminates TLS and applies rate limits.
FastAPI middleware assigns a correlation ID; authentication dependency verifies the token and session.
Pydantic validates the body (Decimal strings, dates, required fields).
Permission dependency checks ar.invoice.create and company/branch scope.
Service runs inside a unit of work: business validation, calculation via the tax and money libraries, persistence, audit event.
Transaction commits; response returns the server-calculated document (totals, status, version).
Errors return the standard error schema with correlation ID.

## 12.6 Journal Posting Flow
Figure 17. Journal Posting Flow
Subledger documents (invoice, receipt, payment, expense, depreciation run) call the same posting service with lines produced by the posting-rule engine, inside the same transaction that changes the document status.

## 12.7 Financial Report Generation Flow
User requests a report with parameters; the API validates parameters and permissions.
Small reports run synchronously; large ones are queued as jobs (report_runs row created, user notified on completion).
The report service opens a READ ONLY, REPEATABLE READ transaction, applies company, branch, department and sensitive-account scopes, and queries posted ledger lines (and optional summary tables) for the period range.
The statement builder maps accounts to statement lines through the active mapping version, computes subtotals with Decimal, and runs validation checks (BR-RPT-003).
Output is rendered on screen (JSON) or to PDF (WeasyPrint), Excel or CSV; files are stored in object storage with an expiring link; exports are audited.

## 12.8 Authentication and Authorisation Flow
Figure 18. Authentication and Authorisation Flow

## 12.9 Document Generation Tool Evaluation

| Requirement | WeasyPrint (HTML/CSS → PDF) | ReportLab | Recommendation |
| Khmer Unicode shaping | Uses Pango/HarfBuzz; handles complex scripts including Khmer with suitable fonts | Limited complex-script shaping in the open-source edition; Khmer subscripts and reordering are unreliable without extra work | WeasyPrint for all documents with Khmer text |
| Invoices, receipts, vouchers | HTML templates easy to brand and maintain by web developers | Precise programmatic layout | WeasyPrint |
| Financial statements and long reports | Paged media CSS (headers, footers, page numbers, repeated table headers) | Good for very large tabular reports; faster | WeasyPrint; consider ReportLab only for very large, Latin-only exports if performance requires |
| Performance | Moderate (seconds for tens of pages) | Fast | Generate large PDFs in background jobs |
| Excel | — | — | openpyxl (formatting) or XlsxWriter (streaming large files) |
| CSV | — | — | Python csv, UTF-8 (BOM option for Excel) |

A proof of concept with selected Khmer fonts (e.g., Noto Sans Khmer, Kantumruy Pro or a licensed font chosen by the business, DP-04) is required early (RK-12).

## 12.10 Deployment Architecture

| Environment | Purpose | Deployment |
| Development | Local Docker Compose with sample data | Developer machines |
| Test / Staging | Automated and UAT testing with anonymised data | Docker Compose or equivalent on a staging host, deployed automatically from main after CI |
| Production | Live use | Docker Compose on a hardened VM (initial) behind Caddy/Nginx, managed PostgreSQL or self-managed with pgBackRest; manual approval to deploy; blue-green or rolling restart |

Configuration per environment through environment variables and a secret store; identical images promoted across environments; database migrations as a separate deployment step after a verified backup.

## 12.11 Modularity and Extension
New modules (e.g., payroll integration, consolidation) are added as packages that produce postings only through the posting service.
Posting rules are configuration (document type → account mapping with conditions), so new document types do not change GL code.
Domain events written to an outbox (journal.posted, invoice.overdue, period.closed) allow new notifications or integrations without altering producers.
API versioning under /api/v1; additive changes within a version.

# 13. API Specification
All endpoints are proposed and may be refined during design. The OpenAPI document generated by FastAPI is the authoritative contract once implemented.

## 13.1 Conventions

| Topic | Specification |
| Base path and versioning | /api/v1; breaking changes only in /api/v2; deprecations announced via Deprecation header |
| Authentication | Authorization: Bearer <access token>; refresh via HttpOnly cookie at /auth/refresh with CSRF token header |
| Company context | X-Company-Id header (or path parameter) selects the company; validated against user scope |
| Permissions | Each endpoint declares a permission code; scopes (company, branch, department, account restrictions) and limits are evaluated server-side |
| Naming | Plural kebab-case resources; state changes as explicit action endpoints (/submit, /approve, /reject, /post, /reverse, /release, /complete, /reopen); status fields are never directly writable |
| Request validation | Pydantic models; unknown fields rejected; money as decimal strings (e.g., "1250.00"); dates ISO 8601 (YYYY-MM-DD) |
| Response | JSON objects; lists as { "data": [...], "page": {"next_cursor": "...", "limit": 50, "total": 1234} } (total optional for expensive queries) |
| Pagination | Cursor-based (limit ≤ 200, cursor); offset allowed for small lists |
| Filtering and sorting | Query parameters per resource (e.g., status=POSTED&date_from=2027-01-01&date_to=2027-01-31&account_id=…&sort=-posting_date) |
| Idempotency | Idempotency-Key header required for post, reverse, approve, release payment, create receipt/payment, allocate, import commit, revaluation run, period close; keys scoped by user and endpoint; replay returns stored response; same key with different body → 409 IDEMPOTENCY_KEY_REUSED |
| Concurrency | If-Match: <version> (or version in body) for draft edits; stale → 409 VERSION_CONFLICT |
| Transaction boundaries | One request = one database transaction for commands; actions affecting several records (e.g., post invoice + journal + allocations) commit together or not at all |
| Rate limiting | Per IP and user (NFR-SEC-008); 429 with Retry-After |
| Audit | Commands produce audit events in the same transaction; exports produce audit events |
| Documentation | OpenAPI at /api/v1/openapi.json; interactive docs only in non-production or behind authentication |

Standard error response
{   "error": {     "code": "JOURNAL_UNBALANCED",     "message": "Total debits (1,000.00) do not equal total credits (999.00).",     "details": [{"field": "lines", "issue": "difference", "value": "1.00"}],     "correlation_id": "4f0d9a7e-5f8c-4c62-9a8e-1f6b2a3c4d5e"   } }

| HTTP | Typical codes |
| 400 | MALFORMED_REQUEST |
| 401 | NOT_AUTHENTICATED, SESSION_EXPIRED |
| 403 | FORBIDDEN, APPROVAL_LIMIT_EXCEEDED, SOD_VIOLATION |
| 404 | NOT_FOUND (also for out-of-scope records) |
| 409 | VERSION_CONFLICT, ALREADY_POSTED, INVALID_STATE_TRANSITION, PERIOD_CLOSED, DUPLICATE_SUPPLIER_INVOICE, RECONCILIATION_COMPLETED, IDEMPOTENCY_KEY_REUSED |
| 422 | VALIDATION_ERROR (field-level), JOURNAL_UNBALANCED, ACCOUNT_NOT_POSTABLE, RATE_MISSING, ALLOCATION_EXCEEDS_BALANCE, TAX_CODE_UNVERIFIED |
| 429 | RATE_LIMITED |
| 500 / 503 | INTERNAL_ERROR, SERVICE_UNAVAILABLE (no internal details exposed) |


## 13.2 Validation Handling
Field validation errors (422) list every invalid field with a machine code and a localised message (English or Khmer from Accept-Language). Business-rule violations return the rule’s error code. The frontend maps codes to messages and highlights fields; it never assumes success until the server responds.

## 13.3 Endpoint Catalogue

| Method | Endpoint | Purpose | Request parameters / body | Response | Permission | Validation | Expected errors |
| POST | /api/v1/auth/login | Sign in | body: username or email, password, (otp) | access token, user, companies | Public | Rate limit; lockout | 401, 423-style 401 LOCKED, 429 |
| POST | /api/v1/auth/logout | Sign out | — | 204 | Authenticated | — | 401 |
| POST | /api/v1/auth/refresh | Rotate tokens | refresh cookie, CSRF header | new access token | Refresh session | Reuse detection | 401 |
| POST | /api/v1/auth/password/forgot, /reset | Password reset | email; token + new password | 204 | Public | Policy | 422 |
| GET, POST | /api/v1/users | List, create users | filters: status, role, company; body: user data, roles, scopes | user list or user | users.view / users.manage | Unique email; no self-grant | 409, 403 |
| PATCH | /api/v1/users/{user_id} | Update user | body: changed fields, version | user | users.manage | SoD on sensitive grants | 403, 409 |
| POST | /api/v1/users/{user_id}/activate, /deactivate | Status change | reason | user | users.manage | — | 409 |
| GET, POST, PATCH | /api/v1/roles, /api/v1/roles/{role_id} | Manage roles and permissions | body: name, permissions, limits | role | roles.manage | Permission codes exist | 422 |
| GET, POST, PATCH | /api/v1/companies, /branches, /departments | Organisation | body: profile fields | resource | org.manage | Base currency lock | 409 |
| POST | /api/v1/fiscal-years | Create fiscal year and periods | start, end, period pattern | year with periods | org.periods.manage | No overlap | 409 |
| GET | /api/v1/accounts | List or tree of accounts | type, category, active, posting, search, tree=true | accounts | coa.view | Scope, sensitive filter | — |
| POST | /api/v1/accounts | Create account | code, names, type, category, parent_id, flags, mapping | account | coa.create | BR-COA-003 | 409 DUPLICATE_CODE, 422 |
| GET | /api/v1/accounts/{account_id} | Account detail and history | include=history,balance | account | coa.view | Scope | 404 |
| PATCH | /api/v1/accounts/{account_id} | Update account | changed fields, version | account or change request | coa.edit (approval for used accounts) | BR-COA-004 | 409 |
| GET | /api/v1/journal-entries | List journals | status, type, date range, account, amount range, source, preparer; cursor | journal list | gl.journal.view | Scope | — |
| POST | /api/v1/journal-entries | Create draft | header + lines | draft journal with totals and difference | gl.journal.create | Accounts exist; amounts ≥ 0 | 422 |
| GET | /api/v1/journal-entries/{journal_id} | Detail | include=lines,history,attachments | journal | gl.journal.view | Scope | 404 |
| PATCH | /api/v1/journal-entries/{journal_id} | Edit draft | header/lines, version | journal | gl.journal.edit | Draft only | 409 |
| POST | /api/v1/journal-entries/{journal_id}/submit | Submit for approval | — | journal (SUBMITTED) | gl.journal.submit | Balanced; period valid | 422, 409 |
| POST | /api/v1/journal-entries/{journal_id}/approve | Approve or reject | action, comment; Idempotency-Key | journal | gl.journal.approve | Limit; SoD | 403, 409 |
| POST | /api/v1/journal-entries/{journal_id}/post | Post | Idempotency-Key | journal (POSTED, number) | gl.journal.post | Full posting validation | 409 PERIOD_CLOSED/ALREADY_POSTED, 422 |
| POST | /api/v1/journal-entries/{journal_id}/reverse | Reverse | reversal_date, reason; Idempotency-Key | reversal journal | gl.journal.reverse | Not reversed; open period | 409 |
| GET, POST | /api/v1/customers | Customers | search, status; body | customer | ar.customer.view / ar.customer.manage | Unique code | 409 |
| POST | /api/v1/customer-invoices | Create invoice draft | customer, dates, currency, lines | invoice with calculated totals | ar.invoice.create | Customer active; tax codes | 422 |
| POST | /api/v1/customer-invoices/{id}/submit, /approve, /post, /cancel | Invoice transitions | Idempotency-Key for post | invoice | ar.invoice.* | Credit limit; rate; period | 403, 409, 422 |
| POST | /api/v1/customer-receipts | Record receipt (draft or post) | customer, date, account, currency, amount, rate, reference, allocations[], post=true; Idempotency-Key | receipt with allocations | ar.receipt.create (post permission if post=true) | Allocation limits | 422 ALLOCATION_EXCEEDS_BALANCE |
| POST | /api/v1/customer-receipts/{id}/allocate, /unallocate | Allocation changes | allocations[]; Idempotency-Key | receipt | ar.receipt.allocate | Limits; period of allocation date open | 409 |
| POST | /api/v1/customer-credit-notes (+ /approve, /post) | Credit notes | invoice_id, lines | credit note | ar.credit_note.* | Approval; SoD | 403 |
| GET, POST | /api/v1/suppliers | Suppliers | search; body | supplier | ap.supplier.* | Bank details change → approval | 409 |
| POST | /api/v1/supplier-invoices | Create supplier invoice | supplier, supplier_invoice_no, dates, lines | invoice with duplicate check result | ap.invoice.create | BR-AP-001 | 409 DUPLICATE_SUPPLIER_INVOICE |
| POST | /api/v1/supplier-invoices/{id}/submit, /approve, /post | Transitions | Idempotency-Key for post | invoice | ap.invoice.* | Approval rules | 403, 409 |
| POST | /api/v1/supplier-payments | Create payment proposal | supplier, account, method, amount, allocations[] | payment (DRAFT) | ap.payment.create | Supplier Verified | 422 |
| POST | /api/v1/supplier-payments/{id}/submit, /approve, /release, /reverse | Payment transitions | bank_reference (release); Idempotency-Key | payment | ap.payment.* | Limits; SoD; balance | 403, 409 |
| GET | /api/v1/bank-accounts | Bank accounts with balances | as_of | list | cb.bank.view | Masking | — |
| POST | /api/v1/bank-statements/import | Import statement file | multipart file, bank_account_id, mapping_id | import batch (preview) | cb.statement.import | Format; duplicates | 422 |
| POST | /api/v1/bank-reconciliations | Start reconciliation | bank_account_id, statement_date, statement_closing | reconciliation with suggested matches | cb.reconcile | Previous completed | 409 |
| POST | /api/v1/bank-reconciliations/{reconciliation_id}/matches | Add or remove matches | match sets | reconciliation | cb.reconcile | Not completed | 409 |
| POST | /api/v1/bank-reconciliations/{reconciliation_id}/complete | Complete | difference explanations; Idempotency-Key | completed reconciliation | cb.reconcile.complete | BR-CB-002 | 422 DIFFERENCE_UNRESOLVED |
| POST | /api/v1/bank-reconciliations/{reconciliation_id}/reopen | Controlled reopen | reason | reconciliation | cb.reconcile.reopen | Later reconciliations reopened first | 409 |
| POST | /api/v1/cash-transactions (+ /post) | Cash receipts, payments, transfers | lines | transaction | cb.cash.* | Non-negative cash | 422 |
| POST | /api/v1/expenses (+ /submit, /approve, /post) | Expenses | category, amounts, allocation, attachments | expense | exp.* | Attachment rules; budget | 422 |
| POST | /api/v1/fixed-assets; POST /api/v1/depreciation-runs (+ /post) | Assets and depreciation | asset data; period | asset; run preview | fa.* | BR-FA-001, BR-FA-002 | 409 |
| GET, POST | /api/v1/exchange-rates | Rates | currency pair, date range; body rate | rates | fx.rate.view / fx.rate.manage | Rate > 0; unique | 409 |
| POST | /api/v1/fx-revaluations (+ /post) | Revaluation | period, accounts | run preview / posted | fx.revalue | Idempotent per period | 409 |
| GET, POST | /api/v1/tax-codes, /tax-codes/{id}/rates | Tax configuration | code data; rate with effective dates | tax code | tax.manage | No overlap; verification | 409 |
| GET, POST | /api/v1/budgets (+ /submit, /approve) | Budgets | year, version, lines | budget | bud.* | Versioning | 409 |
| POST | /api/v1/accounting-periods/{id}/soft-close, /close, /reopen-request | Period control | reason (reopen); Idempotency-Key | period | cls.period.* | Checklist; approvals | 409 |
| POST | /api/v1/fiscal-years/{id}/close | Year-end close | Idempotency-Key | closing journal | cls.year.close | All periods closed | 409 |
| GET | /api/v1/approvals | Approval inbox | type, status | requests | wfl.approval.view | Scope | — |
| POST | /api/v1/imports (+ /{id}/commit) | Import upload and commit | multipart file, type; Idempotency-Key on commit | batch preview / result | imp. | BR-IMP-001 | 422 |
| GET | /api/v1/reports/trial-balance | Trial balance | company, period_from, period_to or date range, branch, include_zero, format | rows, totals, validation | rpt.trial_balance | Scope | 422 |
| GET | /api/v1/reports/general-ledger | General ledger | accounts, date range, dimensions, currency, cursor | lines with running balances | rpt.general_ledger | Scope; sensitive | — |
| GET | /api/v1/reports/balance-sheet | Balance sheet | as_of, comparatives, mapping_version, branch | statement, checks | rpt.balance_sheet | Mapping complete | 422 UNMAPPED_ACCOUNTS (warning in body) |
| GET | /api/v1/reports/income-statement | Income statement | date range or periods, comparatives, dimension filters | statement | rpt.income_statement | — | — |
| GET | /api/v1/reports/cash-flow | Cash flow (indirect) | date range | statement, reconciliation to cash | rpt.cash_flow | Cash-flow classes configured | 422 |
| POST | /api/v1/reports/{report_id}/export | Export | parameters, format (pdf, xlsx, csv) | job id or file link | rpt..export | Scope | 403 |
| GET | /api/v1/audit-logs | Audit search | date range, user, event type, entity | events | aud.view | Scope | — |
| GET | /api/v1/dashboard | Dashboard KPIs | period, branch | KPI set | dash.view | Scope; sensitive | — |


## 13.4 Representative Examples
Create a manual journal (draft)
POST /api/v1/journal-entries X-Company-Id: 7a1c… Content-Type: application/json  {   "posting_date": "2027-03-31",   "document_date": "2027-03-31",   "description": "Accrued electricity March 2027",   "reference": "ACCR-2027-03-01",   "currency": "USD",   "lines": [     {"account_id": "…6210…", "debit": "250.00", "department_id": "…ADMIN…"},     {"account_id": "…2150…", "credit": "250.00"}   ] }
{"id": "0193…", "status": "DRAFT", "journal_no": null, "version": 1,  "totals": {"debit_base": "250.00", "credit_base": "250.00", "difference": "0.00"}}
Post with idempotency
POST /api/v1/journal-entries/0193…/post Idempotency-Key: 5d2c9a1e-3f0b-4b8e-9a77-0c1d2e3f4a5b
{"id": "0193…", "status": "POSTED", "journal_no": "JV-2027-000312",  "posted_at": "2027-04-02T03:15:22Z", "period": "2027-03"}
Receipt with allocation across two invoices
{"customer_id": "…", "receipt_date": "2027-04-05", "bank_account_id": "…",  "currency": "USD", "amount": "800.00", "reference": "TT-88231",  "allocations": [{"invoice_id": "…INV-125…", "amount": "300.00"},                  {"invoice_id": "…INV-131…", "amount": "500.00"}],  "post": true}

## 13.5 Backend Enforcement Independent of the Frontend
The backend validates every request regardless of UI checks: schema validation; authentication; permission, scope, limit and SoD evaluation; business-rule validation inside the transaction using locked current data; server-side calculation of all amounts (client totals are ignored); database constraints as the final safeguard. Privileged operations (migrations, backups, key management) are never exposed through the API used by the browser.

# 14. User Interface and UX Requirements

## 14.1 Design Principles
Professional business-dashboard style using shadcn/ui and Tailwind CSS: neutral background, clear typography with a Khmer-capable font stack, right-aligned numeric columns with tabular figures, negative amounts in brackets or with a minus sign (user preference), currency codes shown on all amount columns, consistent status badges (text + colour), and explicit confirmation for financial actions. The layout has a collapsible left sidebar, a header with company and branch selector, global search, language switch (EN / ខ្មែរ), notifications and user menu, and breadcrumbs.

## 14.2 Main Navigation and Role Visibility
Legend: ● visible · ○ visible with limited functions or own scope · — hidden.

| Menu item | SYSADMIN | OWNER | FINMGR | ACCT | APO | ARO | CASHIER | AUDITOR | DEPTMGR | READONLY |
| 1. Dashboard | ○ | ● | ● | ● | ○ | ○ | ○ | ● | ○ | ○ |
| 2. Accounting (Chart of Accounts, Journal Entries, General Ledger, Trial Balance, Accounting Periods) | — | ● | ● | ● | ○ (COA view) | ○ (COA view) | — | ● | ○ | ○ |
| 3. Sales and Receivables (Customers, Customer Invoices, Receipts, Receivables Aging) | — | ● | ● | ● | — | ● | ○ (Receipts) | ● | ○ | ○ |
| 4. Purchases and Payables (Suppliers, Supplier Invoices, Payments, Payables Aging) | — | ● | ● | ● | ● | — | ○ (cash payments) | ● | ○ (approvals) | ○ |
| 5. Cash and Bank (Cash Accounts, Bank Accounts, Bank Transactions, Bank Reconciliation) | — | ● | ● | ● | ○ | ○ | ○ (own cash) | ● | — | ○ |
| 6. Expenses | — | ● | ● | ● | ● | — | ○ | ● | ○ | ○ |
| 7. Fixed Assets | — | ● | ● | ● | — | — | — | ● | ○ | ○ |
| 8. Inventory Integration (if enabled) | — | ● | ● | ● | — | — | — | ● | — | — |
| 9. Budgets | — | ● | ● | ● | — | — | — | ● | ○ | ○ |
| 10. Financial Reports | ○ | ● | ● | ● | ○ | ○ | ○ | ● | ○ | ○ |
| 11. Tax | — | ● | ● | ● | — | — | — | ● | — | — |
| 12. Approvals | — | ● | ● | ● | ○ | ○ | — | — | ● | — |
| 13. Audit Trail | ● | ● | ● | ○ | — | — | — | ● | — | — |
| 14. User Management | ● | ○ | ○ | — | — | — | — | ○ (view) | — | — |
| 15. System Settings | ● | ● | ● | ○ | — | — | — | ○ (view) | — | — |


## 14.3 Screen Catalogue

| ID | Screen | Module |
| SCR-01 | Login | AUTH |
| SCR-02 | Dashboard | DASH |
| SCR-03 | Chart of Accounts list and form | COA |
| SCR-04 | Journal entry list and form | GL |
| SCR-05 | Journal approval screen | GL, WFL |
| SCR-06 | Journal posting confirmation | GL |
| SCR-07 | General Ledger inquiry | GL, RPT |
| SCR-08 | Trial Balance | GL, RPT |
| SCR-09 | Customer invoice list and form | AR, DOC |
| SCR-10 | Customer receipt form | AR |
| SCR-11 | Supplier invoice form | AP |
| SCR-12 | Supplier payment form | AP |
| SCR-13 | Bank reconciliation | CB |
| SCR-14 | Fixed asset register | FA |
| SCR-15 | Financial report viewer | RPT |
| SCR-16 | User and permission management | AUTH, RBAC |
| SCR-17 | Accounting period closure | CLS |
| SCR-18 | Audit trail viewer | AUD |
| SCR-19 | Company and system settings | ORG, CFG |
| SCR-20 | Customer and supplier lists and profiles | AR, AP |
| SCR-21 | Expense form | EXP |
| SCR-22 | Tax codes | TAX |
| SCR-23 | Budgets | BUD |
| SCR-24 | Exchange rates | FX |
| SCR-25 | Import wizard | IMP |
| SCR-26 | Approvals inbox | WFL |
| SCR-27 | Cash and bank transactions | CB |


## 14.4 Screen Specifications

### SCR-01 Login

| Aspect | Specification |
| Purpose | Authenticate users |
| Main components | Logo, language switch, username/email, password with show toggle, Sign in button, Forgot password link, MFA code step |
| Validation messages | “Enter your email or username”; “Incorrect sign-in details” (generic); “Account locked until HH:MM”; “Invalid verification code” |
| Actions | Sign in; forgot password; verify MFA |
| Permissions | Public |
| States | Loading (button spinner, disabled); error (inline alert); success (redirect to dashboard); locked (message with time) |


### SCR-02 Dashboard

| Aspect | Specification |
| Purpose | Role-specific financial overview (Section 6.19 KPIs) |
| Main components | Period selector, branch filter, KPI cards (revenue, expenses, net profit, cash, bank, AR, AP, overdue AR, upcoming AP), trend charts (12 months), budget utilisation bars, reconciliation status list, pending approvals list, recent transactions table |
| Table columns | Recent transactions: date, number, type, description, amount, status |
| Actions | Click KPI → filtered report or list; open approval |
| Permissions | dash.view; widgets filtered by role and sensitivity |
| States | Skeleton loading per widget; empty (“No posted transactions in this period”); widget error with retry; “Includes pending” badge where applicable |


### SCR-03 Chart of Accounts list and form

| Aspect | Specification |
| Purpose | View and maintain accounts |
| Main components | Tree view and table toggle, search, filters, account drawer form, history tab |
| Table columns | Code, name (EN/KM), type, category, normal balance, posting, control, active, balance (if permitted) |
| Search and filters | Code or name; type; category; active; posting/header; control |
| Form fields | Code, name EN, name KM, description, type, category, parent, normal balance, posting flag, control flag and module, sensitive flag, currency restriction, cash-flow class, statement mapping, effective dates |
| Validation messages | “Account code already exists”; “Code does not match the configured structure”; “Child account type must match parent”; “This account has transactions and cannot be deleted” |
| Actions | Create, edit, deactivate, delete (unused), export, import |
| Permissions | coa.view, coa.create, coa.edit, coa.approve |
| States | Loading tree; empty company (“Import a chart or create your first account”); save success toast; pending approval banner for changes requiring approval |


### SCR-04 Journal entry list and form

| Aspect | Specification |
| Purpose | Create, edit, submit and view journals |
| Main components | List with status tabs (Draft, Submitted, Approved, Posted, Reversed); form with header, editable line grid (keyboard navigation, account search, add/remove lines), live totals and difference indicator, attachments panel, history panel |
| Table columns | List: journal no, posting date, type, description, reference, total, status, preparer, approver. Lines: #, account, description, debit, credit, currency, rate, branch, department, dimensions |
| Search and filters | Date range, status, type, account, amount range, reference, preparer, source |
| Form fields | Posting date, document date, description, reference, currency, rate (if foreign), type (manual/adjusting), lines, attachments |
| Validation messages | “Debits and credits differ by 1.00”; “Account 1100 is a header account”; “Posting date is in a closed period (March 2027)”; “Exchange rate required for KHR on 31/03/2027” |
| Actions | Save draft, submit, recall, copy, cancel draft, print journal voucher, reverse (posted) |
| Permissions | gl.journal.view/create/edit/submit/reverse |
| States | Unsaved-changes warning; read-only view for posted journals with POSTED badge and number; success toast with journal number |


### SCR-05 Journal approval screen

| Aspect | Specification |
| Purpose | Review and approve or reject submitted journals |
| Main components | Approval inbox list; detail view with lines, attachments preview, history, approval path, preparer and amount, SoD indicator |
| Table columns | Number/draft ID, date, description, total, preparer, submitted at, step |
| Actions | Approve; reject (comment required); delegate |
| Validation messages | “You prepared this journal and cannot approve it”; “Amount exceeds your approval limit (5,000.00)” |
| Permissions | gl.journal.approve within limit |
| States | Empty inbox (“No items awaiting your approval”); action confirmation; success |


### SCR-06 Journal posting confirmation

| Aspect | Specification |
| Purpose | Prevent accidental posting and show its effect |
| Main components | Modal showing company, period, posting date, total debit/credit, accounts affected, warning that posted entries cannot be edited, checkbox “I confirm” for amounts above a configurable threshold |
| Actions | Post (idempotent), cancel |
| Permissions | gl.journal.post |
| States | Posting in progress (button disabled); success with journal number; failure with error code and next step |


### SCR-07 General Ledger inquiry

| Aspect | Specification |
| Purpose | View account activity with drill-down |
| Main components | Account selector (multi), date or period range, dimension filters, currency view (base/transaction), results grid with opening balance, lines, running balance, closing balance |
| Table columns | Date, journal no, source, reference, description, debit, credit, balance, branch, department |
| Actions | Drill to journal or source document; export PDF/Excel/CSV |
| Permissions | rpt.general_ledger; sensitive accounts filtered |
| States | Large result paging; background export notice |


### SCR-08 Trial Balance

| Aspect | Specification |
| Purpose | Verify ledger balance by account |
| Main components | Period range, branch filter, include zero balances, hierarchy level, totals row with debit = credit check indicator |
| Table columns | Code, account, opening debit, opening credit, period debit, period credit, closing debit, closing credit |
| Actions | Drill to GL inquiry; export |
| Permissions | rpt.trial_balance |
| States | Check passed (green text “Debits equal credits”); check failed (critical banner — should never occur; triggers alert) |


### SCR-09 Customer invoice list and form

| Aspect | Specification |
| Purpose | Create and manage customer invoices |
| Main components | List with status tabs and overdue filter; form with customer selector (credit info), dates, terms, currency and rate, line grid (description, quantity, unit price, discount, tax code, revenue account, dimensions), totals panel (subtotal, discount, tax, total, base equivalent), notes, attachments, PDF preview |
| Table columns | Invoice no, date, customer, due date, currency, total, outstanding, status |
| Search and filters | Customer, status, date range, due date, amount, branch |
| Validation messages | “Customer credit limit exceeded by 1,250.00 — approval required”; “Tax code VAT-X is unverified”; “Quantity must be greater than zero” |
| Actions | Save, submit, approve, post, print/email, create credit note, cancel draft |
| Permissions | ar.invoice.* |
| States | Draft watermark on preview; posted read-only with number; email sent confirmation |


### SCR-10 Customer receipt form

| Aspect | Specification |
| Purpose | Record and allocate receipts |
| Main components | Customer, date, method, bank/cash account, currency, amount, rate, reference; open-invoice allocation grid with auto-allocate oldest-first, remaining unallocated amount, realised FX preview |
| Table columns | Invoice no, date, due date, currency, outstanding, allocate amount |
| Validation messages | “Allocated amount exceeds receipt amount”; “Allocation exceeds invoice outstanding balance” |
| Actions | Save, post, print receipt voucher |
| Permissions | ar.receipt.create, ar.receipt.post |
| States | Unapplied amount warning; success with receipt number |


### SCR-11 Supplier invoice form

| Aspect | Specification |
| Purpose | Record supplier bills |
| Main components | Supplier, supplier invoice no (duplicate check on blur), invoice/received/posting/due dates, currency, lines (account, description, amount, tax code, department, branch, asset flag), attachment upload with preview, budget availability panel |
| Validation messages | “Invoice INV-001 from this supplier already exists (posted on 05/03/2027)”; “Possible duplicate: same amount and date as invoice 7781 — enter a reason to continue” |
| Actions | Save, submit, approve, post |
| Permissions | ap.invoice.* |
| States | Duplicate warning dialog; approval routing display |


### SCR-12 Supplier payment form

| Aspect | Specification |
| Purpose | Prepare, approve and release supplier payments |
| Main components | Supplier, bank/cash account with available balance, method, currency, amount, open invoices allocation, supplier bank details (masked, verification status), approval path, bank reference on release |
| Validation messages | “Supplier bank details changed on 02/04/2027 and are awaiting approval”; “Insufficient cash balance”; “Payment requires approval by Finance Manager” |
| Actions | Save, submit, approve, release (with confirmation), print payment voucher, reverse |
| Permissions | ap.payment.create/approve/release |
| States | Release confirmation modal with amount in words; success; idempotent re-click shows already released |


### SCR-13 Bank reconciliation

| Aspect | Specification |
| Purpose | Reconcile bank statements to the ledger |
| Main components | Header (bank account, statement date, statement opening and closing balances), two-pane matching (statement lines vs book lines) with suggestions, filters (unmatched, matched, amount), create-adjustment action, summary panel (statement balance, outstanding deposits, unpresented payments, adjusted balances, difference) |
| Table columns | Statement: date, description, reference, amount, status. Book: date, journal no, description, amount, status |
| Validation messages | “Difference of 15.00 must be resolved or explained before completion”; “Statement opening balance does not match previous reconciliation closing balance” |
| Actions | Import statement, auto-match, match, unmatch, add adjustment, complete, reopen (authorised) |
| Permissions | cb.reconcile, cb.reconcile.complete, cb.reconcile.reopen |
| States | Completed (locked, read-only, COMPLETED badge); in progress; import errors list |


### SCR-14 Fixed asset register

| Aspect | Specification |
| Purpose | Maintain assets and depreciation |
| Main components | Asset list, asset form, schedule tab, history tab, depreciation run screen (preview, approve, post) |
| Table columns | Tag, name, category, acquisition date, cost, accumulated depreciation, NBV, status, branch, department |
| Validation messages | “Residual value must be less than cost”; “Depreciation for March 2027 already posted” |
| Actions | Create, edit (before depreciation), transfer, dispose, run depreciation, export |
| Permissions | fa.* |
| States | Fully depreciated badge; disposed read-only |


### SCR-15 Financial report viewer

| Aspect | Specification |
| Purpose | Run, view and export reports |
| Main components | Report catalogue by category; parameter panel (company, period/date range, comparatives, branch, department, currency view, include unposted toggle where allowed); report body with expandable account groups; validation banner; header with basis and period; export buttons |
| Actions | Run, drill-down, export PDF/Excel/CSV, print |
| Permissions | rpt..view, rpt..export |
| States | Background job progress; validation warning (e.g., unmapped accounts); “Includes unposted transactions” banner |


### SCR-16 User and permission management

| Aspect | Specification |
| Purpose | Manage users, roles, scopes and limits |
| Main components | User list, user form (profile, companies, branches, departments, roles, limits), role editor with permission matrix by module and action, SoD conflict panel, sessions tab, activity tab |
| Validation messages | “You cannot change your own permissions”; “This combination creates an SoD conflict: create supplier and release payment” |
| Actions | Create, edit, activate, deactivate, reset MFA, revoke sessions, submit role change for approval |
| Permissions | users.manage, roles.manage |
| States | Pending approval badges; success toasts |


### SCR-17 Accounting period closure

| Aspect | Specification |
| Purpose | Manage period status and month-end checklist |
| Main components | Fiscal year selector, period list with status, checklist panel (task, owner, status, evidence, automatic check result), blocking items list, actions |
| Validation messages | “Bank account ABA-USD not reconciled for March”; “3 approved invoices dated in March are not posted” |
| Actions | Open, soft-close, close (confirmation), request reopen (reason), approve reopen (Owner), year-end close |
| Permissions | cls.period.manage, cls.period.reopen.approve, cls.year.close |
| States | Closed periods locked icon; reopen window banner |


### SCR-18 Audit trail viewer

| Aspect | Specification |
| Purpose | Investigate events |
| Main components | Filters, results table, detail drawer with before/after diff, integrity check status |
| Table columns | Time, user, event type, entity, entity ID, company, branch, IP, reason |
| Actions | Filter, view detail, export (logged) |
| Permissions | aud.view, aud.export |
| States | Empty result message; integrity warning banner if verification failed |


### Additional screens (SCR-19 to SCR-27)

| ID | Key components and behaviour |
| SCR-19 | Settings grouped by area (company, currencies, numbering, approval rules, notifications, statement mappings, templates, dimensions, backup status) with change history and approval status |
| SCR-20 | Customer and supplier lists with balances and status; profile tabs (details, contacts, bank details with masked numbers, documents, statement, aging) |
| SCR-21 | Expense form with category, payment mode, allocation grid (percent or amount), attachments, budget panel |
| SCR-22 | Tax code list and form with rate history timeline, GL accounts and verification status |
| SCR-23 | Budget grid by account × month with department/branch filters, version selector, import, approval status, budget-vs-actual view |
| SCR-24 | Exchange-rate table by date and currency pair with rate type and source; entry form with permission check |
| SCR-25 | Import wizard: choose type → download template → upload → mapping → validation preview with errors → commit → result and history |
| SCR-26 | Approvals inbox across document types with filters and bulk view (approve individually) |
| SCR-27 | Cash and bank transaction forms (receipt, payment, transfer, deposit, withdrawal, charge) and cashbook/bankbook views |


## 14.5 Reusable Components and Critical-Action Rules
Reusable components: DataTable (server-side), AmountInput and AmountText (Decimal strings, currency aware), AccountPicker (search by code or name, hides non-postable accounts), DimensionPicker, DateRangePicker (fiscal period aware), StatusBadge, ApprovalTimeline, AttachmentPanel, ConfirmActionDialog, ReportHeader, EmptyState, ErrorState with correlation ID.
Critical actions — post, reverse, approve, reject, release payment, write off, complete reconciliation, close or reopen a period, year-end close, change tax or exchange-rate settings — require the specific permission, show a confirmation dialog summarising the financial effect, require a reason where specified, disable the button while processing, and show the resulting number or status on success.

# 15. Financial Reporting Requirements

## 15.1 Accounting Basis for Reporting

| Aspect | Accrual basis (proposed default) | Cash basis |
| Revenue | When earned (invoice posting date) | When cash is received |
| Expenses | When incurred (bill or accrual posting date) | When cash is paid |
| Receivables and payables | Recognised | Not recognised |
| AMS support in release 1 | Books kept on accrual basis; all statements accrual | Not supported as a basis for books; a Cash Receipts and Payments view can be derived from cash and bank transactions for management information, clearly labelled |

Every report states its basis, accounting dates or periods and currency (BR-RPT-002). The basis must be confirmed by the business and its accountant before production posting (D-02, V-04).

## 15.2 Report Catalogue — Purpose, Source, Filters and Access

| ID | Report | Purpose | Data source | Filters | Access permission |
| RPT-01 | Trial Balance | Verify ledger balance; base for statements | Posted journal lines | Company, period/date range, branch, department, level, include zero | rpt.trial_balance (FINMGR, ACCT, OWNER, AUDITOR) |
| RPT-02 | General Ledger | Account activity detail | Posted lines with journal headers | Accounts, date range, dimensions, currency, source | rpt.general_ledger |
| RPT-03 | Balance Sheet / Statement of Financial Position | Financial position at a date | Posted lines; statement mapping | As-of date, comparatives, branch (management view) | rpt.balance_sheet |
| RPT-04 | Income Statement / Profit and Loss | Performance for a period | Posted lines; mapping | Date range or periods, comparatives, budget column, dimensions | rpt.income_statement |
| RPT-05 | Cash Flow Statement | Cash movements by activity | Posted lines; cash-flow classes | Date range | rpt.cash_flow |
| RPT-06 | Statement of Changes in Equity | Movements in equity components | Equity account lines; year-end and profit | Fiscal year | rpt.equity |
| RPT-07 | Accounts Receivable Aging | Collectability | Open invoices, credit notes, allocations | As-of date, buckets, customer, branch | rpt.ar_aging (ARO, ACCT, FINMGR, OWNER, AUDITOR) |
| RPT-08 | Accounts Payable Aging | Payment planning | Open supplier invoices, allocations | As-of date, buckets, supplier | rpt.ap_aging (APO, ACCT, FINMGR) |
| RPT-09 | Customer Balances | Balance by customer | AR subledger | As-of date, currency | rpt.customer_balances |
| RPT-10 | Supplier Balances | Balance by supplier | AP subledger | As-of date, currency | rpt.supplier_balances |
| RPT-11 | Cashbook | Cash account activity | Posted lines on cash accounts | Account, date range | rpt.cashbook (CASHIER own) |
| RPT-12 | Bankbook | Bank account activity | Posted lines on bank accounts | Account, date range | rpt.bankbook |
| RPT-13 | Bank Reconciliation | Reconciliation evidence | Reconciliation records | Bank account, statement date | rpt.bank_reconciliation |
| RPT-14 | Revenue by Period | Revenue trend | Revenue account lines | Date range, grouping (month/quarter), dimensions | rpt.revenue |
| RPT-15 | Expenses by Category | Cost analysis | Expense account lines; category mapping | Date range, category | rpt.expenses |
| RPT-16 | Expenses by Department | Departmental cost | Expense lines by department | Date range, department | rpt.expenses (DEPTMGR own) |
| RPT-17 | Expenses by Branch | Branch cost | Expense lines by branch | Date range, branch | rpt.expenses |
| RPT-18 | Tax Summary | Tax totals for a tax period | Tax lines on posted documents and tax accounts | Tax period, tax code | rpt.tax |
| RPT-19 | Fixed Asset Register | Asset listing and values | Fixed assets, asset transactions | As-of date, category, location | rpt.fixed_assets |
| RPT-20 | Depreciation Schedule | Depreciation by asset and period | Depreciation schedules and postings | Fiscal year, category | rpt.fixed_assets |
| RPT-21 | Budget-versus-Actual | Variance analysis | Approved budget lines; posted lines | Fiscal year, periods, dimension, version | rpt.budget (DEPTMGR own) |
| RPT-22 | Journal Entry Report | Journals listing | Journals and lines | Date range, type, status, user, source | rpt.journals |
| RPT-23 | Audit Trail Report | Audit evidence | Audit logs | Date range, user, event, entity | aud.view |
| RPT-24 | Outstanding Invoice Report | Open receivables detail | Open customer invoices | As-of date, customer, due status | rpt.ar |
| RPT-25 | Outstanding Payables Report | Open payables detail | Open supplier invoices | As-of date, supplier, due date | rpt.ap |
| RPT-26 | Realised FX Gain/Loss | Settlement differences | FX lines from allocations and transfers | Date range, currency, party | rpt.fx |
| RPT-27 | Unrealised FX Gain/Loss | Revaluation results | Revaluation runs and lines | Period, currency, account | rpt.fx |
| RPT-28 | Postings in Reopened Periods | Control over reopenings | Period status history, journals | Fiscal year | rpt.controls (OWNER, FINMGR, AUDITOR) |
| RPT-29 | Financial Ratios and KPIs | Performance indicators | Statement results | Period, comparatives | rpt.kpi |
| RPT-30 | Self-Approval Exceptions | SoD exceptions in reduced-SoD mode | Approval actions | Date range, user | rpt.controls |
| RPT-31 | Subledger-to-GL Reconciliation | Control account integrity | AR, AP, bank, asset, inventory subledgers and control accounts | As-of date | rpt.controls |


## 15.3 Report Catalogue — Calculation, Grouping, Exports and Checks

| ID | Calculation rules | Grouping and sorting | Exports | Reconciliation and validation checks |
| RPT-01 | Opening = Σ posted lines before range; movement = Σ debits and credits in range; closing = opening + debits − credits, shown on debit or credit side | By account code; optional hierarchy subtotals | PDF, Excel, CSV | Σ debits = Σ credits for each column pair |
| RPT-02 | Running balance per account from opening balance | Account, then posting date, journal no | PDF, Excel, CSV | Closing balances equal RPT-01 |
| RPT-03 | Asset, liability and equity balances at date via mapping; current-year earnings = Σ revenue − Σ expenses for the fiscal year to date (before year-end close) | Mapping sections and lines | PDF, Excel | Total assets = total liabilities + equity; unmapped accounts listed |
| RPT-04 | Revenue (credit-normal, shown positive) − cost of sales = gross profit; − operating expenses = operating profit; ± other income/expenses, FX, interest = profit before tax; tax expense (if recorded) → net profit | Mapping sections | PDF, Excel | Net profit = Σ revenue − Σ expense movements; equals RPT-03 current-year earnings change |
| RPT-05 | Indirect method (D-15): net profit ± non-cash items (depreciation, unrealised FX) ± changes in working capital accounts by cash-flow class; investing and financing from classified account movements | Operating, investing, financing | PDF, Excel | Net change in cash = closing − opening cash and cash equivalents (accounts classed CASH) |
| RPT-06 | Opening equity components + profit + contributions − distributions ± other movements | Equity components | PDF, Excel | Closing equals equity in RPT-03 |
| RPT-07, RPT-08 | Outstanding per BR-AR-002 / BR-AP-006 as of date; days past due = as-of date − due date; buckets configurable | Party, bucket | PDF, Excel, CSV | Total equals AR/AP control balance (or differences listed) |
| RPT-09, RPT-10 | Party balance in transaction currency and base | Party name or code | PDF, Excel, CSV | Total equals control account |
| RPT-11, RPT-12 | Running balances in account currency and base | Date | PDF, Excel, CSV | Closing equals GL balance of the account |
| RPT-13 | Statement balance, outstanding deposits, unpresented payments, adjusted balances, difference | Item type | PDF | Difference zero or documented |
| RPT-14 to RPT-17 | Σ movements of revenue/expense accounts by period or dimension | Period or dimension, then account | PDF, Excel, CSV | Totals equal RPT-04 for same filters |
| RPT-18 | Taxable base and tax by tax code and rate from stored document tax lines | Tax code | Excel, CSV, PDF | Tax totals equal movements of tax accounts for the period (differences listed) |
| RPT-19, RPT-20 | Cost, accumulated depreciation, NBV; schedule amounts | Category, asset | PDF, Excel | Totals equal fixed-asset GL accounts |
| RPT-21 | Variance = actual − budget; variance % = variance ÷ budget × 100 (sign convention configurable for revenue vs expense) | Account, dimension, period | PDF, Excel | Actual equals ledger movements |
| RPT-22 | Journal headers and lines | Date, number | PDF, Excel, CSV | Each journal balanced |
| RPT-23 | Audit events | Time | Excel, CSV | Hash chain status shown |
| RPT-24, RPT-25 | Outstanding documents | Due date | PDF, Excel, CSV | Totals equal RPT-07/RPT-08 |
| RPT-26, RPT-27 | Σ FX difference lines | Currency, account | PDF, Excel | Equal to FX accounts movements |
| RPT-28 | Journals posted while period status was REOPENED | Period, date | PDF, Excel | — |
| RPT-29 | Current ratio = current assets ÷ current liabilities; quick ratio = (current assets − inventory) ÷ current liabilities; gross margin % = gross profit ÷ revenue × 100; net margin %; debt-to-equity = total liabilities ÷ equity; DSO = AR ÷ revenue × days; DPO = AP ÷ cost of sales × days | Ratio | PDF, Excel | Formulas displayed; inputs from RPT-03/RPT-04 |
| RPT-30 | Approvals where approver = preparer or SoD exception flag | Date, user | Excel, PDF | — |
| RPT-31 | Subledger totals vs control account balances | Control account | PDF, Excel | Difference = 0 expected |


## 15.4 Document and Report Output Requirements

| Requirement | Specification |
| Formats | On screen (HTML), PDF (A4 portrait or landscape; A5 for vouchers), Excel (.xlsx with numeric cells and number formats), CSV (UTF-8, optional BOM) |
| Documents | Printable customer invoices, receipts, credit/debit notes, payment and receipt vouchers, journal vouchers, supplier remittance advice, customer statements |
| Bilingual | English, Khmer or both per template; Khmer rendered with embedded licensed Unicode fonts and correct shaping (NFR-LOC-005) |
| Header | Company legal name (EN/KM), logo, report or document title, company and branch filters, period or as-of date, basis, currency label, generation time and user |
| Pages | Page numbers “Page X of Y”; repeated table headers; no truncation of long account names or descriptions (text wraps) |
| Draft versus final | Unposted documents and provisional reports watermarked DRAFT or labelled “Includes unposted transactions”; finalised documents show number and status; reprints show COPY |
| Amounts | Right-aligned, thousand separators, currency precision, negatives per preference |
| Signatures | Optional prepared/approved/received signature blocks on vouchers |


## 15.5 Data Retrieval, Consistency and Permissions
Report services read only posted data by default from the ledger and subledgers, within a single READ ONLY REPEATABLE READ transaction so that all figures in a report or statement pack come from the same snapshot. Company, branch, department and sensitive-account scopes are applied in the query layer before aggregation, so restricted data never leaves the database. Statement mappings are versioned; each report records the mapping version used. Optional summary tables (account_period_balances) are maintained within posting transactions and verified nightly against detail; if verification fails, reports fall back to detail queries and an alert is raised. Report runs and exports are logged.

# 16. Security and Internal Controls

## 16.1 Security Architecture Summary

| Control area | Measures | References |
| Identity | Argon2id passwords, lockout, optional/mandatory MFA, session revocation, activity history | FR-AUTH-001 to FR-AUTH-011, NFR-SEC-001, NFR-SEC-007 |
| Authorisation | Server-side RBAC with company, branch, department and account scopes, value limits, SoD | FR-RBAC-001 to FR-RBAC-009, NFR-SEC-003 |
| Transport and storage | HTTPS only, HSTS; encrypted disks and backups; signed expiring URLs for files | NFR-SEC-002, NFR-BKP-003 |
| Application | Input validation, parameterised queries, CSP, CSRF protection, rate limiting, secure uploads | NFR-SEC-004 to NFR-SEC-010 |
| Data | Least-privilege DB roles, immutable posted records, audit hash chain | NFR-SEC-011, NFR-FIN-006, BR-AUD-001 |
| Secrets | Secret store / environment injection; rotation; never in browser | NFR-SEC-009 |
| Operations | Dependency scanning, penetration test, monitoring, incident response | NFR-SEC-014, NFR-SEC-015, NFR-REL-007 |


## 16.2 Internal Control Matrix

| Risk | Preventive control | Detective control |
| Fictitious or erroneous journals | Approval by amount; SoD; attachment requirements; control-account restriction | Journal entry report; manual postings to control accounts report; audit trail |
| Unauthorised payments | Payment approval and release separation; verified supplier bank details with change approval; limits | Payment register review; bank reconciliation; RPT-30 |
| Duplicate supplier invoices or payments | Duplicate detection; idempotent release; unique bank references | AP aging review; duplicate-suspect report |
| Backdated entries after close | Period locking; soft-close rules; reopen approval | RPT-28; audit of rejected attempts |
| Manipulation of exchange or tax rates | Restricted permissions; effective dating; approval for tax changes | Rate override report; tax configuration history |
| Unreconciled bank differences | Completion only with zero or documented differences; locked history | Reconciliation status on dashboard and checklist |
| Subledger–GL divergence | Single posting service; control-account restrictions | RPT-31 nightly and at close |
| Unauthorised data access | Scope filters; sensitive-account masking; export permissions | Export audit; access review report |
| Loss of data | Backups, PITR, restore tests | Backup monitoring alerts |
| Self-approval in small teams | Reduced-SoD mode only by Owner decision | RPT-30 reviewed monthly by Owner |


## 16.3 Separation of Duties Implementation
The approval service evaluates, for each approve, post, release or complete action: (1) the actor is not the preparer or last editor; (2) the actor is not the editor of the supplier bank details used by a payment (configurable); (3) delegated authority does not bypass (1) and (2); (4) in reduced-SoD mode the action is allowed but flagged. SoD conflicts in role assignments (e.g., the same user can create suppliers, approve payments and release payments) are detected and require Owner approval (FR-RBAC-010).

## 16.4 Protection Against Unauthorised Transaction Manipulation
Status, numbers, posting timestamps, totals and exchange-rate-derived base amounts are server-controlled; clients cannot set them (NFR-SEC-013).
Posted records are immutable in the database (triggers and privileges) and corrections are reversals (BR-GL-003, BR-GL-004).
Database administration access is restricted to named administrators through a bastion with logging; break-glass access requires Owner notification.
Daily integrity jobs verify journal balance, subledger reconciliation and audit hash chain; failures alert the Finance Manager and System Administrator.

## 16.5 Security Testing
SAST and secret scanning on every pull request; dependency and container scanning in CI; DAST against staging before each release; automated permission-matrix and cross-company access tests; penetration test before production rollout; retest after fixes. Detailed security test cases are in Section 17.6.

# 17. Testing Strategy
No tests have been executed. All test cases are specifications with status “Not run”.

## 17.1 Approach and Coverage Targets

| Level | Scope | Tools | Entry criteria | Exit criteria |
| Unit | Money and rounding library, currency conversion, tax calculation, invoice balance, allocation engine, journal validation, depreciation, statement calculations, permission evaluator | pytest, Hypothesis (property-based) | Requirement approved; code compiles | All pass; coverage targets met |
| Integration | FastAPI + PostgreSQL (Testcontainers), posting service, subledger postings, reconciliation, depreciation posting, reporting queries, auth and permissions | pytest, HTTPX, Testcontainers | Unit tests pass; migrations run | All pass; no partial writes under fault injection |
| End-to-end | Complete workflows WF-01 to WF-16 through the UI; approvals; month-end close; role restrictions; import/export | Playwright | Features deployed to staging | All Must workflows pass on supported browsers |
| Security | Unauthorised access, privilege escalation, cross-company access, input validation, session security, audit protection | pytest, OWASP ZAP, Semgrep, Bandit, manual penetration test | Staging available | No open critical/high findings |
| Financial integrity | Section 17.5 test cases | pytest, concurrency harness, SQL checks | Posting implemented | 100 % pass; reviewed by a qualified accountant |
| Performance | NFR-PERF under stated workload | k6 / Locust, Playwright timings | Release candidate | Targets met or variances approved |
| Backup and recovery | Restore, PITR | pgBackRest/WAL-G scripts | Backups configured | RPO/RTO met in test |
| Localisation | Khmer UI, PDFs, formats | Manual + visual regression | Translations loaded | NFR-LOC pass |
| UAT | Business scenarios with real (anonymised) data | Scripts from Sections 9, 10, 18 | System tests passed; training done | Sign-off by Owner and Finance Manager; accountant confirms treatments |

Coverage targets (proposed). Backend line coverage ≥ 85 %; 100 % branch coverage for posting, allocation, FX, tax, depreciation and closing services; frontend critical components ≥ 70 %. Limitations: code coverage shows that code was executed, not that accounting results are correct. Correctness is demonstrated by (a) independently calculated expected results (spreadsheet oracle reviewed by an accountant), (b) property-based tests of invariants (balanced journals, allocation limits, conversion round trips), (c) end-to-end reconciliation checks (subledger = control, TB balanced, statements consistent) and (d) UAT with realistic scenarios.

## 17.2 Unit Test Focus

| Area | Examples of cases |
| Money and rounding | Half-up at 0.005; KHR 0 decimals; allocation of 100.00 into three parts; no float input accepted |
| Currency conversion | USD→KHR and KHR→USD with 8-decimal rates; inverse consistency; rounding difference to rounding account |
| Tax calculations | Exclusive and inclusive; zero-rated; exempt; line vs document rounding; effective date selection |
| Invoice balance | Allocations, credit notes, write-offs, reversals of allocations |
| Payment allocations | Multi-invoice; partial; over-allocation rejection; FX difference per allocation |
| Journal validation | Balanced per currency; one-sided lines; zero amounts; non-postable accounts |
| Depreciation | Straight-line with last-period rounding; declining balance; mid-life change in estimate; disposal |
| Statement calculations | Current-year earnings; cash-flow indirect adjustments; ratio formulas |


## 17.3 Integration Test Focus
FastAPI and PostgreSQL transaction behaviour; journal posting with triggers and constraints; invoice → receipt → allocation chains; supplier invoice → payment; bank import → match → complete; depreciation run posting; reporting queries vs detail; authentication and permission dependency on every router.

## 17.4 End-to-End Test Focus
Full month: opening balances → invoices, bills, receipts, payments, expenses → bank reconciliation → depreciation → revaluation → close → statements; approval workflows with delegation and escalation; role restrictions per Section 14.2; imports with errors and corrections; exports in all formats.

## 17.5 Financial Integrity Test Cases

| Test ID | Scenario | Preconditions | Test data | Steps | Expected result | Requirements covered |
| TC-001 | Posted journals always balance | Company active; period open | Property-based generator of journals with 2–200 lines, random amounts and currencies | Generate, submit, post 10,000 journals; query sums | Every posted journal has Σ debit = Σ credit in base and per currency; unbalanced ones never reach POSTED | FR-GL-003, FR-GL-006, NFR-FIN-001 |
| TC-002 | Failed posting leaves no partial entry | Fault injection enabled | Approved journal with 50 lines | Inject DB error after inserting 25 lines; retry without fault | First attempt: no lines, no number, status Approved; second attempt posts once | FR-GL-006, NFR-FIN-003 |
| TC-003 | Duplicate requests do not duplicate | Approved journal; idempotency enabled | Same Idempotency-Key | Send post request twice sequentially | One posting; identical responses; one audit event | FR-GL-007, NFR-FIN-004 |
| TC-004 | Concurrent posting requests | Approved journal | 20 parallel post requests with different keys | Fire concurrently | Exactly one succeeds; others receive ALREADY_POSTED; one number used | FR-GL-007, FR-GL-008, NFR-FIN-008 |
| TC-005 | Concurrent numbering | 1,000 approved invoices | — | Post concurrently with 50 workers | 1,000 unique consecutive numbers; no duplicates | FR-AR-003, FR-DOC-002 |
| TC-006 | Closed period rejects posting | March CLOSED | Journal dated 15/03 | Post as accountant and as Finance Manager without reopen | Both rejected with PERIOD_CLOSED; attempts audited | FR-CLS-002, NFR-FIN-007 |
| TC-007 | Posting during close is blocked | March OPEN | Long-running close operation | Start close; concurrently post March journal | Either posting completes before close obtains lock (and is included) or is rejected; never posted after close | FR-CLS-001, FR-CLS-002 |
| TC-008 | Reversal preserves original | Posted journal JV-1 | Reversal date in open period | Reverse; attempt second reversal; attempt to edit JV-1 | Reversal posted and linked; second reversal rejected; edit rejected; net TB effect zero | FR-GL-009, FR-GL-010 |
| TC-009 | AR subledger reconciles to GL | Data set with invoices, credit notes, receipts, write-offs, FX | Oracle spreadsheet | Run RPT-31 and RPT-07 | Σ customer balances = AR control; aging total = control | FR-AR-020, FR-AR-010 |
| TC-010 | AP subledger reconciles to GL | Data set with bills, advances, payments, credit notes | Oracle | Run RPT-31 and RPT-08 | Σ supplier balances = AP control | FR-AP-018, FR-AP-013 |
| TC-011 | Invoice balance after allocations | Invoice 1,000.00 | Receipts 400.00 and 700.00 | Allocate 400, then attempt 700 | First allowed; second limited to 600 or rejected per UI choice; balance never negative | FR-AR-007, FR-AR-010 |
| TC-012 | Supplier balance after payments | Invoice 550.00 | Payment 550.00 | Approve, release twice | One payment; invoice Paid | FR-AP-010, FR-AP-013 |
| TC-013 | Bank reconciliation difference | Statement closing 10,000.00 | Book items with one unpresented payment 200.00 and missing charge 15.00 | Import, match, compute | Difference 15.00 until charge adjustment posted; then 0.00; completion allowed | FR-CB-010, FR-CB-011 |
| TC-014 | Completed reconciliation immutable | Completed reconciliation | — | Try unmatch, edit, delete via API | All rejected; reopen with reason allowed for authorised user and audited | FR-CB-012 |
| TC-015 | Reports use correct period | Journals dated 31/03 and 01/04 | — | Run IS for March | Only 31/03 journal included; posting date determines period | FR-RPT-004, FR-RPT-014 |
| TC-016 | Balance sheet balances | Year with profit, FX, depreciation | Oracle | Run RPT-03 | Assets = liabilities + equity; current-year earnings = RPT-04 net profit | FR-RPT-003, FR-RPT-004 |
| TC-017 | Multi-currency preservation | KHR invoice at 4,100 | Rate later changed to 4,050 | Post invoice; update rate table; re-query | Original transaction amount and rate unchanged on lines | FR-FX-007, FR-FX-006 |
| TC-018 | Realised FX on settlement | Illustrative example in Section 6.16 | — | Allocate receipt | Gain 25.00 posted to realised gain account | FR-FX-009, FR-AR-019 |
| TC-019 | Revaluation and auto-reversal | Open KHR receivable | Closing rate | Run revaluation twice; open next period | One revaluation journal; reversal on day 1 of next period | FR-FX-010 |
| TC-020 | Cross-company data isolation | Users in Company A only | Company B records | Request B records by ID, list, report, export | 404 or empty; no B data in any output | FR-RBAC-004, FR-RPT-014 |
| TC-021 | Branch isolation in reports | User limited to Branch 1 | Transactions in Branches 1 and 2 | Run TB, GL, IS | Only Branch 1 lines included; totals labelled with branch filter | FR-RBAC-004, FR-ORG-010 |
| TC-022 | Unbalanced import blocked | Journal import file with one unbalanced journal | — | Upload; attempt commit | Commit refused; error report lists journal; zero journals created | FR-IMP-004, FR-IMP-007 |
| TC-023 | Opening balances reconciled | Previous system TB and subledgers | Import files | Import; compare | Opening TB equals prior TB; subledger opening = control | FR-IMP-003, FR-GL-014 |
| TC-024 | Depreciation once per period | Active assets | — | Run March depreciation twice concurrently | One posting per asset | FR-FA-005 |
| TC-025 | Tax change does not recalculate history | Posted invoices with code TX1 | New rate effective next month | Change rate; reprint old invoice; run tax summary for old period | Old amounts unchanged | FR-TAX-002, FR-TAX-005 |
| TC-026 | Year-end close correct and idempotent | All periods closed; net profit known | — | Close year; retry request | One closing journal; retained earnings updated; new year P&L zero | FR-CLS-010, FR-CLS-011 |
| TC-027 | Non-posting account rejected | Header account 1100 | Journal line to 1100 | Submit | Rejected | FR-COA-004 |
| TC-028 | Control account protected | AR control account | Manual journal to AR | Submit without override | Rejected | FR-COA-005 |
| TC-029 | Decimal exactness | Amounts 0.1 + 0.2 and KHR conversions | — | Calculate totals via API | Results exact (0.30); no floating-point artefacts | NFR-FIN-002 |
| TC-030 | Allocation concurrency | Invoice 1,000.00 | Two receipts allocating 700.00 each concurrently | Fire concurrently | One succeeds fully, other limited/rejected; outstanding never negative | FR-AR-007, NFR-FIN-008 |


## 17.6 Security Test Cases

| Test ID | Scenario | Preconditions | Test data | Steps | Expected result | Requirements covered |
| TC-031 | Unauthorised access | Unauthenticated client | All endpoints from OpenAPI | Call each without token | 401 for all non-public endpoints | FR-AUTH-001, NFR-SEC-003 |
| TC-032 | Privilege escalation | Accountant token | PATCH own user roles; call role endpoints | Attempt | 403; security event logged | FR-RBAC-009, FR-AUTH-011 |
| TC-033 | Permission matrix | Tokens for each default role | Generated matrix of endpoints × roles | Execute | Every allow/deny matches the matrix | FR-RBAC-003, FR-RBAC-006 |
| TC-034 | Input validation | API | Oversized strings, invalid decimals (“1e3”, “NaN”), negative amounts, script tags, SQL fragments | Submit | 422 with field errors; no execution; stored text escaped on display | NFR-SEC-004, NFR-SEC-005, NFR-SEC-006 |
| TC-035 | Session security | Active session | Stolen refresh token reused after rotation | Replay | Session family revoked; user forced to sign in | FR-AUTH-007, NFR-SEC-007 |
| TC-036 | Audit log protection | Application DB role | UPDATE/DELETE audit rows | Execute SQL with app credentials | Permission denied; hash chain intact | FR-AUD-004, FR-AUD-007 |
| TC-037 | Client-controlled fields ignored | Draft journal | Body containing status=POSTED, journal_no, totals | PATCH | Fields rejected or ignored; status unchanged | NFR-SEC-013, FR-GL-004 |
| TC-038 | File upload safety | Upload endpoint | EICAR test file, renamed executable, 50 MB file | Upload | Rejected with reason | NFR-SEC-010, FR-GL-013 |
| TC-039 | Sensitive account masking | Read-only user | Salary postings | View GL, TB, export | Restricted lines not exposed | FR-RBAC-005, FR-RBAC-008 |
| TC-040 | Self-approval prevention | Preparer token | Own payment | Approve | 403 SOD_VIOLATION | FR-AP-009, FR-RBAC-007 |


# 18. Acceptance Criteria

## 18.1 Overall System Acceptance Criteria

| ID | Criterion | How demonstrated or tested |
| AC-01 | An unbalanced journal entry cannot be posted | TC-001; AT-GL-01; attempt via UI and API |
| AC-02 | A valid balanced journal can be posted only by an authorised user | AT-GL-02; TC-033 permission matrix |
| AC-03 | A posted transaction cannot be silently edited or deleted | TC-008, TC-037; database privilege test |
| AC-04 | A reversal preserves the original transaction | AT-GL-04; TC-008 |
| AC-05 | Customer invoice balances update correctly after allocated payments | AT-AR-01, AT-AR-02; TC-011, TC-030 |
| AC-06 | Supplier outstanding balances update correctly after approved payments | AT-AP-03; TC-012 |
| AC-07 | A completed bank reconciliation preserves its transaction history | AT-CB-02; TC-014 |
| AC-08 | A closed accounting period rejects unauthorised posting | AT-CLS-01; TC-006, TC-007 |
| AC-09 | A user cannot access a company or branch outside their permissions | AT-RBAC-01; TC-020, TC-021 |
| AC-10 | The Trial Balance reports equal total debits and credits for posted entries | AT-GL-05; TC-016 |
| AC-11 | Financial statements use consistent reporting periods and account mappings | AT-RPT-01, AT-RPT-02; TC-015, TC-016 |
| AC-12 | Foreign currency transactions preserve transaction currency and exchange-rate details | AT-FX-01; TC-017 |
| AC-13 | PDF reports render Khmer text correctly | AT-DOC-03; NFR-LOC-005 visual review by a Khmer reader of 20 reference documents |
| AC-14 | Audit logs record critical financial state transitions | AT-AUD-01; audit completeness test comparing state changes with audit events for a full test month |
| AC-15 | Subledgers reconcile to General Ledger control accounts | AT-AR-05; TC-009, TC-010 |
| AC-16 | Duplicate requests do not create duplicate financial transactions | AT-GL-03, AT-AP-04; TC-003 to TC-005 |
| AC-17 | Imports cannot post invalid or unbalanced data | AT-IMP-01; TC-022 |
| AC-18 | Proposed performance targets are met under the stated workload, or variances are approved | Performance test report (NFR-PERF) |
| AC-19 | Backup restore meets proposed RPO and RTO | Restore and DR test records (NFR-REL-002, NFR-REL-003) |
| AC-20 | Tax configuration has been verified by a qualified professional before production use | Signed verification record for V-01 and V-02; FR-TAX-012 status |


## 18.2 Module Acceptance Criteria
Given-When-Then criteria per module. They are specifications for future tests; none has been executed. Amounts and rates are illustrative.

### 18.2.1 Authentication and User Management (AUTH)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-AUTH-01 | Lockout | lockout threshold 5 failures in 15 minutes | a user enters a wrong password 5 times | the account is locked for 15 minutes, a lockout event is logged and the sixth attempt is refused even with the correct password | FR-AUTH-009, FR-AUTH-011 |
| AT-AUTH-02 | Deactivation revokes sessions | a user with two active sessions | an administrator deactivates the user | both sessions return 401 on the next request and the user’s posted journals remain unchanged | FR-AUTH-005, FR-AUTH-007 |
| AT-AUTH-03 | Password storage | a newly created user | the users table is inspected | only an Argon2id hash is stored; no plaintext or reversible password exists | FR-AUTH-003 |


### 18.2.2 Role-Based Access Control (RBAC)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-RBAC-01 | Branch isolation | an accountant assigned only to Branch A | the user requests a journal belonging to Branch B by ID | the API returns 404 and the attempt is logged | FR-RBAC-004 |
| AT-RBAC-02 | Value limit | an accountant with a 5,000 approval limit | the user approves a journal of 7,500 | the request returns 403 APPROVAL_LIMIT_EXCEEDED | FR-RBAC-006 |
| AT-RBAC-03 | Self-approval blocked | a journal prepared by user X | user X attempts approval | the request returns 403 SOD_VIOLATION | FR-RBAC-007 |
| AT-RBAC-04 | Restricted account | salary accounts marked sensitive | a read-only user opens the general ledger | salary account lines are not shown and totals display a Restricted line | FR-RBAC-005, FR-RBAC-008 |


### 18.2.3 Company and Organisation Management (ORG)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-ORG-01 | Setup blocks posting | a company in Setup status | an accountant posts a journal | the request is rejected with COMPANY_NOT_ACTIVE | FR-ORG-011 |
| AT-ORG-02 | Period generation | a fiscal year 1 Jan–31 Dec 2027 | periods are generated | 12 contiguous monthly periods (and an optional period 13) exist with status Future | FR-ORG-005, FR-ORG-006 |
| AT-ORG-03 | Base currency lock | a company with posted journals in USD base | an administrator changes the base currency to KHR | the change is rejected with BASE_CURRENCY_LOCKED | FR-ORG-007 |


### 18.2.4 Chart of Accounts (COA)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-COA-01 | Header account posting | account 1100 is a header account | a journal line uses 1100 | submission is rejected with ACCOUNT_NOT_POSTABLE | FR-COA-004 |
| AT-COA-02 | Unmapped account | account 6150 has no statement mapping and has postings | the Finance Manager runs the balance sheet | the report lists 6150 as unmapped and cannot be finalised until mapped | FR-COA-006 |
| AT-COA-03 | Change history | account 6100 named “Office rent” | it is renamed “Office and warehouse rent” | the history shows old and new names, user and time | FR-COA-007 |


### 18.2.5 General Ledger (GL)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-GL-01 | Unbalanced journal rejected | a journal with debits 1,000.00 and credits 999.00 | the accountant submits it | submission fails with JOURNAL_UNBALANCED and the difference of 1.00 is shown | FR-GL-003 |
| AT-GL-02 | Only authorised posting | an approved balanced journal and a user without gl.journal.post | the user posts | the request returns 403 and the journal stays Approved | FR-GL-004, FR-GL-006 |
| AT-GL-03 | Duplicate post | an approved journal | two post requests with the same idempotency key arrive concurrently | one journal number is assigned, one set of ledger lines exists and both responses are identical | FR-GL-006, FR-GL-007 |
| AT-GL-04 | Reversal preserves original | posted journal JV-2027-000123 | the Finance Manager reverses it with reason | a reversal journal with opposite amounts referencing JV-2027-000123 is posted; the original remains posted and marked reversed; the trial balance is unchanged net | FR-GL-009, FR-GL-010 |
| AT-GL-05 | Trial balance totals | posted journals in March | the trial balance for March is run | total debits equal total credits and each account closing balance equals opening plus movements | FR-GL-018 |


### 18.2.6 Accounts Receivable (AR)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-AR-01 | Balance after allocation | invoice 1,000.00 posted | a receipt of 400.00 is allocated and a credit note of 100.00 is posted and applied | the outstanding balance is 500.00 and the status Partially Paid | FR-AR-007, FR-AR-008, FR-AR-010, FR-AR-012 |
| AT-AR-02 | One receipt, many invoices | invoices of 300.00 and 500.00 | a receipt of 800.00 is allocated to both | both invoices are Paid and the receipt is Fully Allocated | FR-AR-007 |
| AT-AR-03 | Over-allocation blocked | a receipt of 500.00 | the user allocates 600.00 | the allocation is rejected | FR-AR-007 |
| AT-AR-04 | Credit sale journal | an invoice of 1,000.00 with illustrative tax 100.00 | the invoice is posted | the journal debits AR 1,100.00 and credits revenue 1,000.00 and output tax 100.00 | FR-AR-003 |
| AT-AR-05 | Control reconciliation | posted AR documents | the reconciliation report runs | Σ customer balances equals the AR control balance | FR-AR-020 |


### 18.2.7 Accounts Payable (AP)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-AP-01 | Duplicate blocked | invoice INV-001 from supplier S1 posted | an AP officer enters “inv 001” for S1 | the system blocks it as a duplicate of the posted invoice | FR-AP-003 |
| AT-AP-02 | Unapproved payment | a Submitted payment | a cashier attempts to release it | the release is rejected with PAYMENT_NOT_APPROVED | FR-AP-009, FR-AP-010 |
| AT-AP-03 | Balance after payment | supplier invoice 550.00 posted | an approved payment of 550.00 is released and allocated | the invoice is Paid and the supplier balance decreases by 550.00 | FR-AP-010, FR-AP-013 |
| AT-AP-04 | Duplicate release | an approved payment | release is requested twice with the same key | one bank posting exists | FR-AP-010 |


### 18.2.8 Cash and Bank Management (CB)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-CB-01 | Difference blocks completion | statement closing 10,000.00, adjusted book 9,985.00 | the reviewer completes the reconciliation without documenting the 15.00 difference | completion is rejected and the difference is displayed | FR-CB-011 |
| AT-CB-02 | Completed reconciliation locked | a completed March reconciliation | a user unmatches an item | the request returns 409 RECONCILIATION_COMPLETED | FR-CB-012 |
| AT-CB-03 | Statement duplicates | a March statement already imported | the same file is imported again | all lines are flagged as duplicates and none are created | FR-CB-008 |
| AT-CB-04 | Transfer | Bank A and Bank B in USD | a transfer of 500.00 is posted | one balanced journal debits Bank B and credits Bank A, and both bankbooks show it | FR-CB-005, FR-CB-007 |


### 18.2.9 Income and Expense Management (EXP)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-EXP-01 | Accrued then paid | October rent of 1,000.00 recorded as unpaid | it is paid in November | October shows rent expense 1,000.00; November shows no rent expense from the payment and the liability is cleared | FR-EXP-004, FR-EXP-010 |
| AT-EXP-02 | Allocation sums | an expense of 100.00 allocated 33.33 %/33.33 %/33.34 % | it is posted | lines are 33.33, 33.33 and 33.34 summing to 100.00 | FR-EXP-005 |
| AT-EXP-03 | Attachment required | category Travel requires an attachment | an expense is submitted without one | submission is rejected with ATTACHMENT_REQUIRED | FR-EXP-007 |


### 18.2.10 Invoicing and Financial Documents (DOC)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-DOC-01 | Concurrent numbering | sequence INV-PP1-2027 at 000124 | two invoices are posted simultaneously | they receive 000125 and 000126 with no duplicates | FR-DOC-002 |
| AT-DOC-02 | Reprint copy | a posted invoice | the template is changed and the invoice reprinted | the PDF shows original values and a COPY label | FR-DOC-008 |
| AT-DOC-03 | Khmer PDF | an invoice with Khmer customer name and item descriptions | the PDF is generated | Khmer text renders with correct shaping (verified visually against reference) | FR-DOC-004, FR-DOC-010 |


### 18.2.11 Inventory Accounting Integration (optional) (INV)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-INV-01 | Idempotent events | inventory event E-100 posted | E-100 is received again | no new journal is created and the response references the original posting | FR-INV-006 |
| AT-INV-02 | Reconciliation | valuation 25,000.00 and control account 24,900.00 | the reconciliation runs | a difference of 100.00 is reported | FR-INV-008 |


### 18.2.12 Fixed Asset Management (FA)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-FA-01 | Straight-line | an asset costing 12,000.00, residual 0, 60 months | March depreciation is run | 200.00 is posted (illustrative) | FR-FA-004, FR-FA-005 |
| AT-FA-02 | Run once | March depreciation posted | the March run is executed again | no additional depreciation is posted | FR-FA-005 |
| AT-FA-03 | Disposal loss | cost 10,000.00, accumulated 6,000.00 | the asset is sold for 3,000.00 | a loss of 1,000.00 is posted and the asset stops depreciating | FR-FA-007 |


### 18.2.13 Tax Management (TAX)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-TAX-01 | Historical preservation | an invoice posted with code TX1 at illustrative 10 % | TX1 changes to 12 % effective next month | the posted invoice still shows the 10 % amount and new invoices dated next month use 12 % | FR-TAX-002, FR-TAX-005 |
| AT-TAX-02 | Inclusive calculation | an inclusive price of 110.00 and illustrative rate 10 % | the line is calculated | tax is 10.00 and net 100.00 | FR-TAX-003 |
| AT-TAX-03 | Unverified blocked | blocking enabled and code TX9 Unverified | a user posts an invoice with TX9 | posting is rejected with TAX_CODE_UNVERIFIED | FR-TAX-012 |


### 18.2.14 Budget Management (BUD)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-BUD-01 | Actuals from posted data | an approved budget and posted and draft expenses | budget vs actual is run | actuals include only posted expenses | FR-BUD-006 |
| AT-BUD-02 | Version history | version 1 approved | version 2 is approved | version 1 becomes Superseded and remains viewable | FR-BUD-004, FR-BUD-005 |
| AT-BUD-03 | Alert | department budget 10,000.00 and threshold 80 % | posted actuals reach 8,000.00 | the department manager is notified | FR-BUD-009 |


### 18.2.15 Financial Reporting (RPT)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-RPT-01 | Balance sheet balances | posted data for 2027 with year-to-date profit | the balance sheet as of 31 March is run | total assets equal total liabilities plus equity including current-year earnings | FR-RPT-003 |
| AT-RPT-02 | Income statement reconciles | revenue and expense movements for Q1 | the income statement is run | net profit equals Σ revenue movements − Σ expense movements for the same accounts and period | FR-RPT-004 |
| AT-RPT-03 | Export identical | an income statement on screen | it is exported to PDF, Excel and CSV | all totals are identical to the screen | FR-RPT-016 |
| AT-RPT-04 | Drafts excluded | an approved but unposted journal of 5,000.00 | the trial balance is run | the journal is not included | FR-RPT-017 |


### 18.2.16 Foreign Currency Management (FX)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-FX-01 | Rate preserved | a posted KHR invoice at 4,100 | the rate table is updated to 4,050 for that date | the invoice base amount does not change | FR-FX-007 |
| AT-FX-02 | Realised gain | the illustrative example in Section 6.16 | the receipt is allocated | a realised gain of 25.00 USD is posted | FR-FX-009 |
| AT-FX-03 | Revaluation idempotent | March revaluation posted | the March revaluation is run again | no duplicate journal is created | FR-FX-010 |
| AT-FX-04 | Missing rate | no rate for a currency and date | a document in that currency is posted | posting fails with RATE_MISSING | FR-FX-006 |


### 18.2.17 Period-End and Year-End Closing (CLS)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-CLS-01 | Closed period rejects posting | March closed | an accountant posts a journal dated 15 March | posting fails with PERIOD_CLOSED and the attempt is audited | FR-CLS-002 |
| AT-CLS-02 | Soft-close | April soft-closed | an accountant without adjustment permission posts an adjusting journal | it is rejected; a Finance Manager with permission can post it | FR-CLS-002 |
| AT-CLS-03 | Reopen approval | March closed | the Finance Manager requests reopening and the Owner approves | postings are allowed during the window and listed on RPT-28 | FR-CLS-012 |
| AT-CLS-04 | Year-end | net profit 50,000.00 for 2027 | year-end close completes | retained earnings increases by 50,000.00 and 2028 opens with zero income and expense balances | FR-CLS-010, FR-CLS-011 |


### 18.2.18 Audit Trail and Internal Controls (AUD)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-AUD-01 | Posting audited | an approved journal | it is posted | an audit record exists with user, timestamp, journal ID, status Approved → Posted and journal number | FR-AUD-001 |
| AT-AUD-02 | Tamper attempt | the application database role | an UPDATE on audit_logs is attempted | it fails with a permission error | FR-AUD-004 |
| AT-AUD-03 | Reason required | a posted journal | a reversal is requested without reason | the request is rejected with REASON_REQUIRED | FR-AUD-003 |


### 18.2.19 Dashboard and Financial Analytics (DASH)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-DASH-01 | KPI equals report | posted Q1 data | the dashboard and the income statement are run for Q1 | total revenue, total expenses and net profit are identical | FR-DASH-002 |
| AT-DASH-02 | Pending separated | an approved but unposted supplier invoice | the dashboard loads | total expenses exclude it; it appears only in pending approvals or a labelled pending widget | FR-DASH-009 |


### 18.2.20 Notifications and Approval Workflows (WFL)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-WFL-01 | Amount routing | rule: journals > 10,000 require Owner after Finance Manager | a 15,000 journal is submitted | it routes to the Finance Manager then the Owner | FR-WFL-001 |
| AT-WFL-02 | Delegation respects SoD | the Finance Manager delegates to an accountant who prepared journal J | the accountant attempts to approve J | approval is blocked by SoD | FR-WFL-004 |
| AT-WFL-03 | Escalation | escalation after 48 hours | an approval is pending for 49 hours | it escalates to the next level and both users are notified | FR-WFL-005 |


### 18.2.21 Data Import and Export (IMP)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-IMP-01 | Unbalanced import blocked | a journal import file where one journal is out by 0.01 | the user uploads it | validation fails for the batch, the error report identifies the journal, and no journals are created | FR-IMP-004, FR-IMP-007 |
| AT-IMP-02 | Opening balance | an opening balance file that balances | it is imported | a Draft opening journal is created and the company shows “Opening balances not signed off” until reconciled | FR-IMP-003 |
| AT-IMP-03 | Export logged | a trial balance | it is exported to Excel | an audit event records the export | FR-IMP-011 |


### 18.2.22 System Configuration (CFG)

| Test ID | Scenario | Given | When | Then | Requirements |
| AT-CFG-01 | Approval for critical setting | retained earnings account setting | the Finance Manager changes it | the change is pending until approved by the Owner and both actions are audited | FR-CFG-013 |
| AT-CFG-02 | Currency in use | KHR used in posted documents | an administrator removes KHR from supported currencies | the change is rejected with CURRENCY_IN_USE | FR-CFG-002 |


# 19. Implementation Roadmap
No dates or durations are committed; budget and team size are not yet known. Phases end when their acceptance criteria are met. Phases 3 and 4 may run in parallel after Phase 2.
Figure 19. System Configuration (CFG)

## 19.1 Phase 1 — Foundation

| Aspect | Detail |
| Objectives | Establish project, security foundation, organisation structure and chart of accounts |
| Included features | Repository, CI/CD, environments; AUTH; RBAC (roles, scopes, limits); ORG (companies, branches, departments, fiscal years, periods, numbering); COA with import; CFG basics; audit framework; database foundation and migrations |
| Dependencies | Decisions D-01 (deployment model), D-03 (base currency), D-04 (fiscal year), D-09 (roles and limits) |
| Deliverables | Running application with login, user and role management, company setup wizard, COA |
| Testing requirements | Unit and integration for auth and RBAC; permission matrix tests; migration tests |
| Acceptance criteria | AT-AUTH-01 to 03, AT-RBAC-01 to 04, AT-ORG-01 to 03, AT-COA-01 to 03 pass |
| Key risks | RK-07 (scope creep), RK-10 (multi-company leakage) |


## 19.2 Phase 2 — General Ledger

| Aspect | Detail |
| Objectives | Deliver the controlled double-entry core |
| Included features | Journal entry, approval workflow (WFL core), posting service, reversals, adjusting journals, GL inquiry, trial balance, opening balance import, period soft-close/close, audit trail viewer |
| Dependencies | Phase 1 |
| Deliverables | Posting service with idempotency and immutability; GL and TB screens |
| Testing requirements | TC-001 to TC-008, TC-022, TC-023, TC-027, TC-028, TC-036, TC-037 |
| Acceptance criteria | AC-01 to AC-04, AC-08, AC-10, AC-14, AC-16, AC-17 |
| Key risks | RK-01 (incorrect accounting logic), RK-03 (duplicates), RK-06 (opening balances) |


## 19.3 Phase 3 — Cash, Bank and Expenses

| Aspect | Detail |
| Objectives | Control cash and bank and record expenses |
| Included features | Cash and bank accounts, cash transactions, transfers, payment and receipt vouchers, expenses with approvals and allocation, bank statement import, reconciliation, document generation (vouchers) |
| Dependencies | Phase 2 |
| Deliverables | Cashbook, bankbook, reconciliation, expense module |
| Testing requirements | TC-013, TC-014; E2E for WF-06 to WF-08 |
| Acceptance criteria | AC-07; AT-CB-01 to 04; AT-EXP-01 to 03 |
| Key risks | RK-05 (bank file formats vary) |


## 19.4 Phase 4 — Receivables and Payables

| Aspect | Detail |
| Objectives | Manage customers, suppliers and their balances |
| Included features | Customers, suppliers, invoices, credit notes, receipts, payments, allocations, duplicate detection, payment approval and release, statements, aging, basic tax codes on documents, KHR as transaction currency with realised FX |
| Dependencies | Phase 2; V-01 and V-02 verification for tax and invoice content |
| Deliverables | AR and AP modules with PDF invoices and vouchers |
| Testing requirements | TC-005, TC-009 to TC-012, TC-017, TC-018, TC-030, TC-040 |
| Acceptance criteria | AC-05, AC-06, AC-12, AC-15 |
| Key risks | RK-02 (tax configuration), RK-08 (FX) |


## 19.5 Phase 5 — Financial Reporting

| Aspect | Detail |
| Objectives | Produce reliable statements and supporting reports |
| Included features | Balance sheet, income statement, cash flow statement, equity statement, supporting reports RPT-07 to RPT-17, RPT-22 to RPT-25, RPT-31, dashboard, PDF/Excel/CSV exports, statement mapping management |
| Dependencies | Phases 3 and 4; mapping confirmed by accountant |
| Deliverables | Report viewer and exports; dashboard |
| Testing requirements | TC-015, TC-016, TC-020, TC-021; report accuracy oracle tests |
| Acceptance criteria | AC-11, AC-13 |
| Key risks | RK-09 (report performance), RK-12 (Khmer PDF) |


## 19.6 Phase 6 — Advanced Accounting

| Aspect | Detail |
| Objectives | Complete the accounting scope |
| Included features | Full multi-currency revaluation and FX reports, tax periods, summaries and adjustments, fixed assets and depreciation, budgets and budget-vs-actual, month-end checklist automation, year-end close, recurring entries, inventory integration (optional) |
| Dependencies | Phase 5; V-04, V-06 for asset and inventory policies; D-12, D-14 |
| Deliverables | FA, BUD, FX revaluation, CLS year-end, TAX reports |
| Testing requirements | TC-019, TC-024 to TC-026 |
| Acceptance criteria | AT-FA, AT-BUD, AT-TAX, AT-FX, AT-CLS sets pass; AC-20 |
| Key risks | RK-11 (period-end processing) |


## 19.7 Phase 7 — Production Readiness

| Aspect | Detail |
| Objectives | Make the system safe to operate |
| Included features | Security review and penetration test, performance testing, backup and recovery tests, deployment automation, monitoring and alerting, UAT, user and technical documentation, training, data migration rehearsal, production rollout and hypercare |
| Dependencies | All previous phases; hosting decision D-16 |
| Deliverables | Test reports, runbooks, user guides (EN/KM), signed UAT, go-live checklist |
| Testing requirements | TC-031 to TC-040; NFR-PERF, NFR-REL, NFR-BKP tests |
| Acceptance criteria | AC-18, AC-19; no open severity 1–2 defects; accountant confirmation of verification items |
| Key risks | RK-04 (unauthorised activity), RK-13 (backup), RK-14 (regulatory change) |


## 19.8 Minimum Viable Product (MVP)

| Included in MVP | Deferred |
| AUTH, RBAC, ORG (single company with branches; multi-company capable data model) | Multi-company UI and consolidated views |
| COA, GL with approval, posting, reversal, opening balances, TB | Recurring journals, allocation journals |
| CB with statement import and reconciliation | Bank API integration |
| EXP with approvals | Expense claims portal for employees |
| AR and AP with invoices, receipts, payments, allocations, credit notes, aging, statements | Debit notes, scheduled payment runs, supplier statement reconciliation |
| Basic TAX codes on documents (verified) | Tax periods, adjustments, detailed tax reports |
| Transaction currencies (USD, KHR) with realised FX | Revaluation and unrealised FX |
| Core statements (TB, BS, IS) and key supporting reports; PDF/Excel/CSV | Cash flow and equity statements (Phase 5 end), ratios |
| Period soft-close and close with manual checklist | Automated checklist checks, year-end automation (manual closing journal allowed in MVP) |
| AUD audit trail and viewer | Hash-chain verification job (can follow shortly) |
|  | FA, BUD, INV integration, DASH advanced analytics, SSO |


# 20. Risks, Assumptions and Dependencies

## 20.1 Risk Register
Probability and impact: High, Medium, Low (initial assessment for review).

| ID | Risk description | Probability | Impact | Mitigation | Owner | Dependencies |
| RK-01 | Incorrect accounting logic (posting rules, FX, closing) produces wrong balances | Medium | High | Posting rules reviewed by a qualified accountant; oracle-based tests; integrity checks; UAT with real scenarios | Finance Manager, Development Lead | V-04 |
| RK-02 | Incorrect tax configuration (rates, treatments, invoice content) | Medium | High | No hard-coded taxes; professional verification (V-01, V-02); verification status and blocking; tax summary reconciliation | Owner, tax adviser | V-01, V-02 |
| RK-03 | Duplicate transactions from retries, double clicks or imports | Medium | High | Idempotency keys; unique constraints; duplicate detection; TC-003 to TC-005 | Development Lead | — |
| RK-04 | Unauthorised financial activity (self-approval, fraudulent payments) | Medium | High | RBAC, limits, SoD, bank-detail change control, audit, control reports | Owner | D-09, D-10 |
| RK-05 | Bank statement formats vary and break imports | High | Medium | Configurable mappings; pilot with users’ banks; manual entry fallback | Accountant | DP-02 |
| RK-06 | Poor opening balance data | High | High | Templates, validation, reconciliation to previous system, sign-off before reliance (BR-CFG-002) | Finance Manager | DP-01 |
| RK-07 | Scope creep delays MVP | High | Medium | MVP definition (Section 19.8); change control | Project Manager | — |
| RK-08 | Incorrect foreign exchange calculations | Medium | High | Decimal arithmetic; single FX service; tests TC-017 to TC-019; rate controls | Development Lead | D-11 |
| RK-09 | Large report performance problems | Medium | Medium | Indexes, optional summary tables, background generation, performance tests | Development Lead | — |
| RK-10 | Multi-company or branch data leakage | Low | High | Scope enforcement in data layer; composite FKs; optional RLS; TC-020, TC-021 | Development Lead | D-01 |
| RK-11 | Incorrect period-end processing (missed accruals, double depreciation, wrong year-end) | Medium | High | Checklist; idempotent runs; locks; accountant review | Finance Manager | — |
| RK-12 | Incomplete Khmer PDF rendering | Medium | Medium | Early WeasyPrint proof of concept with chosen fonts; visual tests | Development Lead | DP-04 |
| RK-13 | Inadequate backup and recovery | Low | High | Automated backups, PITR, encrypted off-site copies, quarterly restore tests | System Administrator | D-16 |
| RK-14 | Changes in legal or regulatory requirements | Medium | Medium | Configuration-driven rules; periodic review with advisers; release process for template changes | Owner | V-01 to V-11 |
| RK-15 | Users rely on drafts or unverified reports | Medium | Medium | Clear draft labelling; posted-only defaults; training | Finance Manager | — |
| RK-16 | Small teams cannot satisfy SoD | High | Medium | Reduced-SoD mode with exception reporting and owner review (D-10) | Owner | D-10 |


## 20.2 Assumptions

| ID | Assumption | Status |
| A-01 | Typical deployment is one company with several branches; the data model supports multiple companies | Proposed — confirm (D-01) |
| A-02 | Books are kept on the accrual basis | Proposed — confirm (D-02) |
| A-03 | Each company’s base currency is configurable; many Cambodian SMEs may choose USD but this is not assumed | Confirmed requirement (brief); default value to confirm (D-03) |
| A-04 | Up to 50 concurrent users and the data volumes in Section 7.1 for initial sizing | Proposed |
| A-05 | Payroll is calculated outside AMS; salaries are recorded as accounting entries | Confirmed (brief) |
| A-06 | No full warehouse management in release 1; inventory accounting is an optional integration | Confirmed (brief) |
| A-07 | Bank data arrives as CSV/Excel statement files | Confirmed (brief) |
| A-08 | Users have reliable internet access to a hosted application | Proposed |
| A-09 | English and Khmer are the only interface languages initially | Confirmed (brief) |
| A-10 | Email is the only external notification channel in release 1 | Proposed |
| A-11 | The organisation has, or will engage, a qualified accountant to confirm accounting policies and tax configuration | Required |


## 20.3 Dependencies

| ID | Dependency | Needed for |
| DP-01 | Previous system’s closing trial balance and subledger listings at go-live | Opening balances (WF-15) |
| DP-02 | Sample statement files from each bank used | Statement import mappings |
| DP-03 | SMTP or email provider account | Notifications and document emails |
| DP-04 | Licensed Khmer Unicode fonts for PDF | Documents and reports |
| DP-05 | Hosting environment and object storage | Deployment |
| DP-06 | Qualified accountant and tax adviser availability for reviews | Verification items, UAT |
| DP-07 | Inventory system API or export (if integration enabled) | INV module |


## 20.4 Items Requiring Professional Verification
These items must be confirmed by a qualified Cambodian accountant, tax professional or legal adviser. The system provides configuration only; this document makes no compliance claim.

| ID | Item | Why it matters | Responsible |
| V-01 | Applicable tax types, rates, bases, inclusive/exclusive presentation, recoverability of input tax, rounding and any withholding obligations for the organisation’s transactions | Tax codes and postings (TAX module) | Tax adviser |
| V-02 | Invoice, receipt and credit-note requirements: mandatory fields, languages, numbering rules (including whether gap-free sequences are required), taxpayer identifiers | Document templates and numbering | Tax adviser / accountant |
| V-03 | Statutory retention periods for accounting records, supporting documents and audit trails | Retention policy (Section 11.10) | Accountant / legal adviser |
| V-04 | Applicable accounting framework for each organisation and its requirements affecting AMS (e.g., inventory valuation methods, asset depreciation, foreign currency translation, statement formats) | Posting rules and statements | Qualified accountant |
| V-05 | Rules on currency of accounts and reporting, and on use of KHR and USD in invoices and books | Base and presentation currency | Accountant / tax adviser |
| V-06 | Tax depreciation rules and whether separate tax and accounting books are needed | Fixed-asset tax book (future) | Tax adviser |
| V-07 | Payroll-related tax and contribution liabilities to be recorded through journals | Salary journal templates | Tax adviser / HR |
| V-08 | Personal-data protection obligations for customer, supplier and employee data | Privacy controls | Legal adviser |
| V-09 | Any electronic invoicing or electronic filing obligations | Future integrations | Tax adviser |
| V-10 | Exchange-rate source acceptable for accounting and tax purposes | Rate source configuration | Accountant / tax adviser |
| V-11 | Statutory audit and financial statement submission requirements affecting report formats | Statement templates | Accountant |


## 20.5 Unresolved Business and Accounting Decisions
Each decision requires stakeholder confirmation. The proposed default is used for design until confirmed.

| ID | Decision | Proposed default | Alternatives | Impact of alternatives |
| D-01 | Deployment model | Multi-company-capable data model; deploy as single company with branches | (a) Strict single company; (b) multi-company UI from release 1 | (a) simpler UI but costly later change; (b) more scope and testing in MVP |
| D-02 | Accounting basis | Accrual books | Cash basis books | Cash basis would remove AR/AP recognition from GL and change statements; not supported in release 1 |
| D-03 | Base currency per company | Chosen per company at setup (USD expected for many SMEs, not assumed) | KHR base; other | Affects rate direction, FX gains/losses and reporting; cannot change after posting |
| D-04 | Fiscal year | Calendar year (1 January–31 December), monthly periods + period 13 | Other start month; 4-4-5 periods | Period generation and comparatives |
| D-05 | Document numbering scope | Per company, document type and fiscal year; branch prefix optional | Per branch sequences; continuous across years | Affects completeness checks and V-02 compliance |
| D-06 | Year-end closing method | Closing journal to retained earnings | Virtual close (no journal; reports compute) | Closing journal is explicit and auditable; virtual close is simpler but less transparent |
| D-07 | Inventory valuation (if integrated) | Weighted average cost | FIFO | Different COGS and inventory values; must follow V-04 |
| D-08 | Depreciation convention | Start month following in-service date | Full month in month of acquisition; daily pro rata | Timing of expense |
| D-09 | Roles, permissions and approval limits | Section 4.3 matrix with limits set by Owner | Custom | Control strength vs speed |
| D-10 | Separation-of-duties strictness | Strict SoD; reduced-SoD mode available only by Owner decision with exception reporting | Always strict; always reduced | Strict may be impractical for 1–2 person teams; reduced increases fraud risk |
| D-11 | Exchange-rate source and rate types | Manual entry daily (transaction rate) and month-end closing rate, from a source chosen by the accountant (V-10) | Automated feed (future) | Data entry effort vs integration cost |
| D-12 | FX revaluation approach | Revalue monetary items at period end with automatic reversal | Revalue only at year-end; no reversal (cumulative) | Monthly accuracy vs effort |
| D-13 | Budget control | Warn when budget exceeded | Block approval; no check | Control vs flexibility |
| D-14 | Default depreciation method | Straight-line monthly | Declining balance per category | Expense profile |
| D-15 | Cash flow statement method | Indirect method | Direct method | Direct requires classification of cash transactions by activity at entry |
| D-16 | Hosting | Cloud VM with managed or self-managed PostgreSQL and off-site backups | On-premises server; hybrid | Availability, backup responsibility, cost |
| D-17 | MFA policy | Mandatory for OWNER, FINMGR, SYSADMIN; optional for others | Mandatory for all; optional for all | Security vs convenience |
| D-18 | Rounding method | Half-up at line level for tax; document totals sum of rounded lines | Half-even; document-level tax rounding | Small differences in tax totals; must follow V-01 |
| D-19 | Attachment storage | S3-compatible object storage | Database storage; local disk | Backup and scaling approach |
| D-20 | Unapplied customer receipts presentation | Customer advances liability account | Credit balance within AR control | Balance-sheet presentation |


# 21. Requirements Traceability Matrix
The matrix connects business objectives, requirements, business rules, use cases, database entities, API endpoints, UI screens, test cases and acceptance criteria. Section 21.1 traces each module to its design artefacts; Section 21.2 traces every functional requirement. Non-functional requirements are traced to verification methods in Section 7 and Appendix B. All test statuses are “Not run”.

## 21.1 Module-Level Traceability

| Module | Business Objectives | Use Cases | Database Entities | API Groups | Screens | Acceptance Tests |
| AUTH | BO-02, BO-03 | UC-01, UC-02 | users, user_sessions, user_activity_logs | /api/v1/auth, /api/v1/users | SCR-01, SCR-16 | AT-AUTH-01 to AT-AUTH-03 |
| RBAC | BO-03 | UC-02 | roles, permissions, role_permissions, user_roles, user_company_access, user_branch_access, approval_limits | /api/v1/roles, /api/v1/users | SCR-16 | AT-RBAC-01 to AT-RBAC-04 |
| ORG | BO-04, BO-10 | UC-15 | companies, branches, departments, business_units, fiscal_years, accounting_periods, document_sequences | /api/v1/companies, /api/v1/fiscal-years, /api/v1/accounting-periods | SCR-17, SCR-19 | AT-ORG-01 to AT-ORG-03 |
| COA | BO-01, BO-04 | UC-03 | chart_of_accounts, account_categories, statement_mappings | /api/v1/accounts | SCR-03 | AT-COA-01 to AT-COA-03 |
| GL | BO-01, BO-02, BO-04 | UC-04, UC-05, UC-06, UC-07 | journal_entries, journal_entry_lines, opening_balances, attachments, accounting_dimensions | /api/v1/journal-entries, /api/v1/reports/general-ledger, /api/v1/reports/trial-balance | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-01 to AT-GL-05 |
| AR | BO-05, BO-06 | UC-08, UC-09 | customers, customer_invoices, customer_invoice_lines, customer_receipts, customer_payment_allocations, customer_credit_notes | /api/v1/customers, /api/v1/customer-invoices, /api/v1/customer-receipts, /api/v1/customer-credit-notes | SCR-09, SCR-10, SCR-20 | AT-AR-01 to AT-AR-05 |
| AP | BO-03, BO-05, BO-06 | UC-10, UC-11 | suppliers, supplier_invoices, supplier_invoice_lines, supplier_payments, supplier_payment_allocations, supplier_credit_notes, payment_vouchers | /api/v1/suppliers, /api/v1/supplier-invoices, /api/v1/supplier-payments, /api/v1/supplier-credit-notes | SCR-11, SCR-12, SCR-20 | AT-AP-01 to AT-AP-04 |
| CB | BO-05, BO-01 | UC-12 | bank_accounts, cash_accounts, cash_transactions, bank_statement_imports, bank_transactions, bank_reconciliations, bank_reconciliation_lines | /api/v1/bank-accounts, /api/v1/cash-accounts, /api/v1/cash-transactions, /api/v1/bank-statements, /api/v1/bank-reconciliations | SCR-13, SCR-27 | AT-CB-01 to AT-CB-04 |
| EXP | BO-04, BO-08 | UC-10 | expenses, expense_lines, expense_categories, expense_claims, recurring_templates, attachments | /api/v1/expenses, /api/v1/expense-categories, /api/v1/income-entries | SCR-21 | AT-EXP-01 to AT-EXP-03 |
| DOC | BO-02, BO-09 | UC-08, UC-11 | document_sequences, document_templates, document_snapshots, attachments, notification_records | /api/v1/documents, /api/v1/document-templates, /api/v1/document-sequences | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-01 to AT-DOC-03 |
| INV | BO-01, BO-04 | UC-10 | inventory_items, inventory_events, inventory_valuation_snapshots | /api/v1/inventory-events, /api/v1/reports/inventory-reconciliation | SCR-15 | AT-INV-01 to AT-INV-02 |
| FA | BO-01, BO-04 | UC-14 | fixed_assets, asset_categories, depreciation_schedules, depreciation_runs, asset_transactions | /api/v1/fixed-assets, /api/v1/asset-categories, /api/v1/depreciation-runs | SCR-14 | AT-FA-01 to AT-FA-03 |
| TAX | BO-07 | UC-08, UC-10 | tax_codes, tax_rate_history, tax_periods, tax_adjustments | /api/v1/tax-codes, /api/v1/tax-periods, /api/v1/reports/tax-summary | SCR-22 | AT-TAX-01 to AT-TAX-03 |
| BUD | BO-04, BO-03 | UC-13 | budgets, budget_lines, budget_revisions | /api/v1/budgets, /api/v1/reports/budget-vs-actual | SCR-23 | AT-BUD-01 to AT-BUD-03 |
| RPT | BO-04 | UC-13, UC-16 | report_definitions, statement_mappings, report_runs | /api/v1/reports/* | SCR-07, SCR-08, SCR-15 | AT-RPT-01 to AT-RPT-04 |
| FX | BO-01, BO-09 | UC-09, UC-11 | currencies, exchange_rates, fx_revaluation_runs, fx_revaluation_lines | /api/v1/currencies, /api/v1/exchange-rates, /api/v1/fx-revaluations | SCR-24 | AT-FX-01 to AT-FX-04 |
| CLS | BO-01, BO-03, BO-04 | UC-15 | accounting_periods, period_close_checklists, period_status_history, journal_entries | /api/v1/accounting-periods, /api/v1/period-close, /api/v1/fiscal-years/{id}/close | SCR-17 | AT-CLS-01 to AT-CLS-04 |
| AUD | BO-02, BO-03 | UC-16 | audit_logs, user_activity_logs | /api/v1/audit-logs | SCR-18 | AT-AUD-01 to AT-AUD-03 |
| DASH | BO-04, BO-05 | UC-13 | journal_entry_lines, customer_invoices, supplier_invoices, bank_reconciliations, approval_requests | /api/v1/dashboard | SCR-02 | AT-DASH-01 to AT-DASH-02 |
| WFL | BO-03, BO-08 | UC-05 | approval_rules, approval_requests, approval_actions, delegations, notification_records | /api/v1/approvals, /api/v1/approval-rules, /api/v1/notifications | SCR-26 | AT-WFL-01 to AT-WFL-03 |
| IMP | BO-08 | UC-16 | import_batches, import_errors, import_mappings | /api/v1/imports, /api/v1/exports | SCR-25 | AT-IMP-01 to AT-IMP-03 |
| CFG | BO-07, BO-09 | UC-02 | company_settings, setting_history, document_sequences, approval_rules, statement_mappings, dimension_definitions | /api/v1/settings | SCR-19 | AT-CFG-01 to AT-CFG-02 |


## 21.2 Requirement-Level Traceability

| Req. ID | Description | Business Objective | Business Rules | Use Case | Screen | Acceptance Test | Test Case | Priority |
| FR-AUTH-001 | Login | BO-02, BO-03 | BR-SEC-001 | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-101 | TC-031 | Must |
| FR-AUTH-002 | Logout | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-102 | — | Must |
| FR-AUTH-003 | Secure password storage | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-03 | — | Must |
| FR-AUTH-004 | Password change and reset | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-103 | — | Must |
| FR-AUTH-005 | Activation and deactivation | BO-02, BO-03 | BR-AUD-001 | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-02 | — | Must |
| FR-AUTH-006 | User profile | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-104 | — | Must |
| FR-AUTH-007 | Session management | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-02 | TC-035 | Should |
| FR-AUTH-008 | Multi-factor authentication | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-105 | — | Should |
| FR-AUTH-009 | Failed-login protection | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-01 | — | Must |
| FR-AUTH-010 | Account recovery | BO-02, BO-03 | BR-AUD-001 | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-106 | — | Must |
| FR-AUTH-011 | User activity history | BO-02, BO-03 | BR-AUD-001 | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-01 | TC-032 | Must |
| FR-AUTH-012 | Single sign-on readiness | BO-02, BO-03 | — | UC-01, UC-02 | SCR-01, SCR-16 | AT-AUTH-107 | — | Could |
| FR-RBAC-001 | Default roles | BO-03 | BR-SEC-001 | UC-02 | SCR-16 | AT-RBAC-101 | — | Must |
| FR-RBAC-002 | Configurable roles | BO-03 | — | UC-02 | SCR-16 | AT-RBAC-102 | — | Must |
| FR-RBAC-003 | Module and action permissions | BO-03 | BR-SEC-001 | UC-02 | SCR-16 | AT-RBAC-103 | TC-033 | Must |
| FR-RBAC-004 | Company and branch scope | BO-03 | BR-SEC-003 | UC-02 | SCR-16 | AT-RBAC-01 | TC-020, TC-021 | Must |
| FR-RBAC-005 | Account-level restrictions | BO-03 | BR-SEC-004 | UC-02 | SCR-16 | AT-RBAC-04 | TC-039 | Should |
| FR-RBAC-006 | Value-based approval authority | BO-03 | BR-SEC-001 | UC-02 | SCR-16 | AT-RBAC-02 | TC-033 | Must |
| FR-RBAC-007 | Separation of duties enforcement | BO-03 | BR-SEC-002 | UC-02 | SCR-16 | AT-RBAC-03 | TC-040 | Must |
| FR-RBAC-008 | Sensitive information masking | BO-03 | BR-SEC-004 | UC-02 | SCR-16 | AT-RBAC-04 | TC-039 | Must |
| FR-RBAC-009 | Server-side authorisation | BO-03 | BR-SEC-001 | UC-02 | SCR-16 | AT-RBAC-104 | TC-032 | Must |
| FR-RBAC-010 | Role change approval | BO-03 | BR-SEC-002 | UC-02 | SCR-16 | AT-RBAC-105 | — | Should |
| FR-RBAC-011 | Permission review report | BO-03 | — | UC-02 | SCR-16 | AT-RBAC-106 | — | Should |
| FR-ORG-001 | Company profile | BO-04, BO-10 | BR-CFG-001 | UC-15 | SCR-17, SCR-19 | AT-ORG-101 | — | Must |
| FR-ORG-002 | Multiple companies | BO-04, BO-10 | BR-SEC-003 | UC-15 | SCR-17, SCR-19 | AT-ORG-102 | — | Should |
| FR-ORG-003 | Branches | BO-04, BO-10 | — | UC-15 | SCR-17, SCR-19 | AT-ORG-103 | — | Must |
| FR-ORG-004 | Departments and business units | BO-04, BO-10 | — | UC-15 | SCR-17, SCR-19 | AT-ORG-104 | — | Must |
| FR-ORG-005 | Fiscal years | BO-04, BO-10 | BR-CFG-001 | UC-15 | SCR-17, SCR-19 | AT-ORG-02 | — | Must |
| FR-ORG-006 | Accounting periods | BO-04, BO-10 | BR-CLS-002 | UC-15 | SCR-17, SCR-19 | AT-ORG-02 | — | Must |
| FR-ORG-007 | Base and supported currencies | BO-04, BO-10 | BR-FX-001 | UC-15 | SCR-17, SCR-19 | AT-ORG-03 | — | Must |
| FR-ORG-008 | Document numbering per company | BO-04, BO-10 | BR-DOC-001 | UC-15 | SCR-17, SCR-19 | AT-ORG-105 | — | Must |
| FR-ORG-009 | Company accounting configuration | BO-04, BO-10 | BR-CFG-001 | UC-15 | SCR-17, SCR-19 | AT-ORG-106 | — | Must |
| FR-ORG-010 | Branch-level reporting | BO-04, BO-10 | BR-RPT-002 | UC-15 | SCR-17, SCR-19 | AT-ORG-107 | TC-021 | Must |
| FR-ORG-011 | Readiness checklist | BO-04, BO-10 | BR-CFG-001, BR-CFG-002 | UC-15 | SCR-17, SCR-19 | AT-ORG-01 | — | Must |
| FR-COA-001 | Account master data | BO-01, BO-04 | BR-COA-003 | UC-03 | SCR-03 | AT-COA-101 | — | Must |
| FR-COA-002 | Account hierarchy | BO-01, BO-04 | BR-COA-003 | UC-03 | SCR-03 | AT-COA-102 | — | Must |
| FR-COA-003 | Account types and categories | BO-01, BO-04 | — | UC-03 | SCR-03 | AT-COA-103 | — | Must |
| FR-COA-004 | Posting eligibility | BO-01, BO-04 | BR-COA-001 | UC-03 | SCR-03 | AT-COA-01 | TC-027 | Must |
| FR-COA-005 | Control accounts | BO-01, BO-04 | BR-COA-002 | UC-03 | SCR-03 | AT-COA-104 | TC-028 | Must |
| FR-COA-006 | Financial statement mapping | BO-01, BO-04 | BR-RPT-003 | UC-03 | SCR-03 | AT-COA-02 | — | Must |
| FR-COA-007 | Account change history | BO-01, BO-04 | BR-AUD-001 | UC-03 | SCR-03 | AT-COA-03 | — | Must |
| FR-COA-008 | Deactivation and deletion rules | BO-01, BO-04 | BR-COA-004 | UC-03 | SCR-03 | AT-COA-105 | — | Must |
| FR-COA-009 | Search and tree view | BO-01, BO-04 | — | UC-03 | SCR-03 | AT-COA-106 | — | Must |
| FR-COA-010 | Chart templates | BO-01, BO-04 | — | UC-03 | SCR-03 | AT-COA-107 | — | Should |
| FR-COA-011 | Account currency restriction | BO-01, BO-04 | BR-FX-001 | UC-03 | SCR-03 | AT-COA-108 | — | Should |
| FR-GL-001 | Manual journal vouchers | BO-01, BO-02, BO-04 | BR-GL-005, BR-GL-008 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-101 | — | Must |
| FR-GL-002 | Automatic journals | BO-01, BO-02, BO-04 | BR-GL-006 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-102 | — | Must |
| FR-GL-003 | Double-entry validation | BO-01, BO-02, BO-04 | BR-GL-001 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-01 | TC-001 | Must |
| FR-GL-004 | Journal workflow states | BO-01, BO-02, BO-04 | BR-GL-003 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-02 | TC-037 | Must |
| FR-GL-005 | Journal approval workflow | BO-01, BO-02, BO-04 | BR-SEC-001, BR-SEC-002 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-103 | — | Must |
| FR-GL-006 | Atomic posting | BO-01, BO-02, BO-04 | BR-GL-006 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-02, AT-GL-03 | TC-001, TC-002 | Must |
| FR-GL-007 | Idempotent posting | BO-01, BO-02, BO-04 | BR-GL-007 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-03 | TC-003, TC-004 | Must |
| FR-GL-008 | Journal numbering | BO-01, BO-02, BO-04 | BR-DOC-001 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-104 | TC-004 | Must |
| FR-GL-009 | Immutability of posted journals | BO-01, BO-02, BO-04 | BR-GL-003 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-04 | TC-008 | Must |
| FR-GL-010 | Reversal entries | BO-01, BO-02, BO-04 | BR-GL-004, BR-GL-009 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-04 | TC-008 | Must |
| FR-GL-011 | Adjusting journals | BO-01, BO-02, BO-04 | BR-CLS-001 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-105 | — | Must |
| FR-GL-012 | Recurring journals | BO-01, BO-02, BO-04 | BR-GL-010 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-106 | — | Should |
| FR-GL-013 | Supporting attachments | BO-01, BO-02, BO-04 | — | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-107 | TC-038 | Must |
| FR-GL-014 | Opening balances | BO-01, BO-02, BO-04 | BR-CFG-002 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-108 | TC-023 | Must |
| FR-GL-015 | General Ledger inquiry | BO-01, BO-02, BO-04 | BR-RPT-001 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-109 | — | Must |
| FR-GL-016 | Transaction drill-down | BO-01, BO-02, BO-04 | — | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-110 | — | Must |
| FR-GL-017 | Journal history | BO-01, BO-02, BO-04 | BR-AUD-001 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-111 | — | Must |
| FR-GL-018 | Trial balance | BO-01, BO-02, BO-04 | BR-GL-002 | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-05 | — | Must |
| FR-GL-019 | Journal search | BO-01, BO-02, BO-04 | — | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-112 | — | Must |
| FR-GL-020 | Dimensions on lines | BO-01, BO-02, BO-04 | — | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-113 | — | Should |
| FR-GL-021 | Suspense control | BO-01, BO-02, BO-04 | — | UC-04, UC-05, UC-06, UC-07 | SCR-04, SCR-05, SCR-06, SCR-07, SCR-08 | AT-GL-114 | — | Should |
| FR-AR-001 | Customer records | BO-05, BO-06 | BR-AR-004 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-101 | — | Must |
| FR-AR-002 | Customer invoices | BO-05, BO-06 | BR-FX-005, BR-TAX-003 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-102 | — | Must |
| FR-AR-003 | Invoice posting | BO-05, BO-06 | BR-GL-006, BR-DOC-001 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-04 | TC-005 | Must |
| FR-AR-004 | Invoice statuses | BO-05, BO-06 | BR-AR-001 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-103 | — | Must |
| FR-AR-005 | Due dates and terms | BO-05, BO-06 | BR-AP-002 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-104 | — | Must |
| FR-AR-006 | Receipt vouchers | BO-05, BO-06 | BR-GL-006 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-105 | — | Must |
| FR-AR-007 | Payment allocation | BO-05, BO-06 | BR-AR-003 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-01, AT-AR-02, AT-AR-03 | TC-011, TC-030 | Must |
| FR-AR-008 | Partial payments | BO-05, BO-06 | BR-AR-002 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-01 | — | Must |
| FR-AR-009 | Overpayments and unapplied receipts | BO-05, BO-06 | BR-AR-006 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-106 | — | Must |
| FR-AR-010 | Outstanding balance derivation | BO-05, BO-06 | BR-AR-002 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-01 | TC-009, TC-011 | Must |
| FR-AR-011 | Credit limits | BO-05, BO-06 | BR-AR-004 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-107 | — | Should |
| FR-AR-012 | Credit notes | BO-05, BO-06 | BR-AR-005 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-01 | — | Must |
| FR-AR-013 | Debit notes | BO-05, BO-06 | BR-AR-001 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-108 | — | Should |
| FR-AR-014 | Write-offs | BO-05, BO-06 | BR-AR-005 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-109 | — | Must |
| FR-AR-015 | Refunds | BO-05, BO-06 | BR-AR-006 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-110 | — | Should |
| FR-AR-016 | Customer statements | BO-05, BO-06 | — | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-111 | — | Must |
| FR-AR-017 | Receivable aging | BO-05, BO-06 | BR-RPT-002 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-112 | — | Must |
| FR-AR-018 | Overdue notifications | BO-05, BO-06 | — | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-113 | — | Should |
| FR-AR-019 | Foreign-currency receivables | BO-05, BO-06 | BR-FX-001, BR-FX-003 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-114 | TC-018 | Must |
| FR-AR-020 | Subledger reconciliation | BO-05, BO-06 | BR-COA-002 | UC-08, UC-09 | SCR-09, SCR-10, SCR-20 | AT-AR-05 | TC-009 | Must |
| FR-AP-001 | Supplier records | BO-03, BO-05, BO-06 | BR-AP-005 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-101 | — | Must |
| FR-AP-002 | Supplier invoices and bills | BO-03, BO-05, BO-06 | BR-AP-002 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-102 | — | Must |
| FR-AP-003 | Duplicate invoice detection | BO-03, BO-05, BO-06 | BR-AP-001 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-01 | — | Must |
| FR-AP-004 | Invoice approval and posting | BO-03, BO-05, BO-06 | BR-AP-003, BR-GL-006 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-103 | — | Must |
| FR-AP-005 | Purchase-related liabilities | BO-03, BO-05, BO-06 | BR-FA-001 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-104 | — | Should |
| FR-AP-006 | Supplier credit notes | BO-03, BO-05, BO-06 | BR-AP-006 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-105 | — | Must |
| FR-AP-007 | Supplier advances | BO-03, BO-05, BO-06 | BR-AP-006 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-106 | — | Should |
| FR-AP-008 | Payment vouchers | BO-03, BO-05, BO-06 | BR-AP-004 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-107 | — | Must |
| FR-AP-009 | Payment approval | BO-03, BO-05, BO-06 | BR-AP-004, BR-SEC-002 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-02 | TC-040 | Must |
| FR-AP-010 | Payment release | BO-03, BO-05, BO-06 | BR-GL-007 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-02, AT-AP-03, AT-AP-04 | TC-012 | Must |
| FR-AP-011 | Partial payments | BO-03, BO-05, BO-06 | BR-AP-006 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-108 | — | Must |
| FR-AP-012 | Payment scheduling | BO-03, BO-05, BO-06 | — | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-109 | — | Should |
| FR-AP-013 | Outstanding liabilities | BO-03, BO-05, BO-06 | BR-AP-006 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-03 | TC-010, TC-012 | Must |
| FR-AP-014 | Supplier statements | BO-03, BO-05, BO-06 | — | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-110 | — | Should |
| FR-AP-015 | Payables aging | BO-03, BO-05, BO-06 | BR-RPT-002 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-111 | — | Must |
| FR-AP-016 | Supplier balance reconciliation | BO-03, BO-05, BO-06 | — | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-112 | — | Should |
| FR-AP-017 | Bank-detail change control | BO-03, BO-05, BO-06 | BR-AP-005 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-113 | — | Must |
| FR-AP-018 | AP control reconciliation | BO-03, BO-05, BO-06 | BR-COA-002 | UC-10, UC-11 | SCR-11, SCR-12, SCR-20 | AT-AP-114 | TC-010 | Must |
| FR-CB-001 | Cash accounts | BO-05, BO-01 | BR-CB-004 | UC-12 | SCR-13, SCR-27 | AT-CB-101 | — | Must |
| FR-CB-002 | Bank accounts | BO-05, BO-01 | BR-SEC-004 | UC-12 | SCR-13, SCR-27 | AT-CB-102 | — | Must |
| FR-CB-003 | Cash receipts and payments | BO-05, BO-01 | BR-GL-006 | UC-12 | SCR-13, SCR-27 | AT-CB-103 | — | Must |
| FR-CB-004 | Bank receipts, payments, deposits and withdrawals | BO-05, BO-01 | BR-GL-006 | UC-12 | SCR-13, SCR-27 | AT-CB-104 | — | Must |
| FR-CB-005 | Transfers | BO-05, BO-01 | BR-CB-003 | UC-12 | SCR-13, SCR-27 | AT-CB-04 | — | Must |
| FR-CB-006 | Bank charges and interest | BO-05, BO-01 | — | UC-12 | SCR-13, SCR-27 | AT-CB-105 | — | Must |
| FR-CB-007 | Cashbook and bankbook | BO-05, BO-01 | BR-RPT-002 | UC-12 | SCR-13, SCR-27 | AT-CB-04 | — | Must |
| FR-CB-008 | Bank statement import | BO-05, BO-01 | BR-IMP-001 | UC-12 | SCR-13, SCR-27 | AT-CB-03 | — | Must |
| FR-CB-009 | Automatic matching | BO-05, BO-01 | — | UC-12 | SCR-13, SCR-27 | AT-CB-106 | — | Must |
| FR-CB-010 | Manual matching and adjustments | BO-05, BO-01 | BR-CB-002 | UC-12 | SCR-13, SCR-27 | AT-CB-107 | TC-013 | Must |
| FR-CB-011 | Reconciliation completion | BO-05, BO-01 | BR-CB-002 | UC-12 | SCR-13, SCR-27 | AT-CB-01 | TC-013 | Must |
| FR-CB-012 | Locked reconciliation history | BO-05, BO-01 | BR-CB-001 | UC-12 | SCR-13, SCR-27 | AT-CB-02 | TC-014 | Must |
| FR-CB-013 | Unreconciled transactions | BO-05, BO-01 | — | UC-12 | SCR-13, SCR-27 | AT-CB-108 | — | Must |
| FR-CB-014 | Cash balance monitoring | BO-05, BO-01 | — | UC-12 | SCR-13, SCR-27 | AT-CB-109 | — | Should |
| FR-EXP-001 | Revenue recording | BO-04, BO-08 | BR-GL-006 | UC-10 | SCR-21 | AT-EXP-101 | — | Must |
| FR-EXP-002 | Expense recording | BO-04, BO-08 | BR-EXP-001 | UC-10 | SCR-21 | AT-EXP-102 | — | Must |
| FR-EXP-003 | Expense categories | BO-04, BO-08 | — | UC-10 | SCR-21 | AT-EXP-103 | — | Must |
| FR-EXP-004 | Payment mode | BO-04, BO-08 | BR-EXP-001 | UC-10 | SCR-21 | AT-EXP-01 | — | Must |
| FR-EXP-005 | Department and branch allocation | BO-04, BO-08 | BR-FX-005 | UC-10 | SCR-21 | AT-EXP-02 | — | Must |
| FR-EXP-006 | Expense approval | BO-04, BO-08 | BR-AP-003, BR-SEC-002 | UC-10 | SCR-21 | AT-EXP-104 | — | Must |
| FR-EXP-007 | Expense attachments | BO-04, BO-08 | — | UC-10 | SCR-21 | AT-EXP-03 | — | Must |
| FR-EXP-008 | Expense claims and reimbursement | BO-04, BO-08 | BR-EXP-001 | UC-10 | SCR-21 | AT-EXP-105 | — | Should |
| FR-EXP-009 | Recurring expenses | BO-04, BO-08 | BR-GL-010 | UC-10 | SCR-21 | AT-EXP-106 | — | Should |
| FR-EXP-010 | Settlement of recognised expenses | BO-04, BO-08 | BR-EXP-001 | UC-10 | SCR-21 | AT-EXP-01 | — | Must |
| FR-EXP-011 | Budget check | BO-04, BO-08 | BR-BUD-001 | UC-10 | SCR-21 | AT-EXP-107 | — | Should |
| FR-DOC-001 | Document types | BO-02, BO-09 | — | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-101 | — | Must |
| FR-DOC-002 | Sequential numbering | BO-02, BO-09 | BR-DOC-001 | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-01 | TC-005 | Must |
| FR-DOC-003 | Document templates | BO-02, BO-09 | — | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-102 | — | Must |
| FR-DOC-004 | PDF generation | BO-02, BO-09 | BR-DOC-002 | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-03 | — | Must |
| FR-DOC-005 | Printable layouts | BO-02, BO-09 | — | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-103 | — | Must |
| FR-DOC-006 | Email delivery | BO-02, BO-09 | — | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-104 | — | Should |
| FR-DOC-007 | Document status and history | BO-02, BO-09 | BR-AUD-001 | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-105 | — | Must |
| FR-DOC-008 | Document snapshot | BO-02, BO-09 | BR-DOC-002 | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-02 | — | Must |
| FR-DOC-009 | Supporting attachments | BO-02, BO-09 | — | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-106 | — | Must |
| FR-DOC-010 | Bilingual text | BO-02, BO-09 | — | UC-08, UC-11 | SCR-09, SCR-10, SCR-11, SCR-12 | AT-DOC-03 | — | Must |
| FR-INV-001 | Inventory accounts | BO-01, BO-04 | BR-COA-002 | UC-10 | SCR-15 | AT-INV-101 | — | Could |
| FR-INV-002 | Inventory purchases and goods received | BO-01, BO-04 | BR-INV-001 | UC-10 | SCR-15 | AT-INV-102 | — | Could |
| FR-INV-003 | Cost of goods sold | BO-01, BO-04 | BR-INV-001 | UC-10 | SCR-15 | AT-INV-103 | — | Could |
| FR-INV-004 | Adjustments, write-offs and returns | BO-01, BO-04 | — | UC-10 | SCR-15 | AT-INV-104 | — | Could |
| FR-INV-005 | Valuation integration | BO-01, BO-04 | BR-INV-001 | UC-10 | SCR-15 | AT-INV-105 | — | Could |
| FR-INV-006 | Idempotent event intake | BO-01, BO-04 | BR-GL-007 | UC-10 | SCR-15 | AT-INV-01 | — | Could |
| FR-INV-007 | Stock valuation summary | BO-01, BO-04 | — | UC-10 | SCR-15 | AT-INV-106 | — | Could |
| FR-INV-008 | GL reconciliation | BO-01, BO-04 | BR-INV-001 | UC-10 | SCR-15 | AT-INV-02 | — | Could |
| FR-FA-001 | Asset register | BO-01, BO-04 | BR-FA-001 | UC-14 | SCR-14 | AT-FA-101 | — | Should |
| FR-FA-002 | Asset categories | BO-01, BO-04 | — | UC-14 | SCR-14 | AT-FA-102 | — | Should |
| FR-FA-003 | Acquisition | BO-01, BO-04 | BR-COA-002 | UC-14 | SCR-14 | AT-FA-103 | — | Should |
| FR-FA-004 | Depreciation schedule | BO-01, BO-04 | BR-FA-001 | UC-14 | SCR-14 | AT-FA-01 | — | Should |
| FR-FA-005 | Monthly depreciation posting | BO-01, BO-04 | BR-FA-002 | UC-14 | SCR-14 | AT-FA-01, AT-FA-02 | TC-024 | Should |
| FR-FA-006 | Accumulated depreciation and NBV | BO-01, BO-04 | — | UC-14 | SCR-14 | AT-FA-104 | — | Should |
| FR-FA-007 | Disposal and sale | BO-01, BO-04 | BR-FA-003 | UC-14 | SCR-14 | AT-FA-03 | — | Should |
| FR-FA-008 | Impairment | BO-01, BO-04 | — | UC-14 | SCR-14 | AT-FA-105 | — | Could |
| FR-FA-009 | Transfers | BO-01, BO-04 | — | UC-14 | SCR-14 | AT-FA-106 | — | Should |
| FR-FA-010 | Change in estimates | BO-01, BO-04 | — | UC-14 | SCR-14 | AT-FA-107 | — | Should |
| FR-FA-011 | Asset history and reports | BO-01, BO-04 | — | UC-14 | SCR-14 | AT-FA-108 | — | Should |
| FR-FA-012 | GL reconciliation | BO-01, BO-04 | BR-COA-002 | UC-14 | SCR-14 | AT-FA-109 | — | Should |
| FR-TAX-001 | Tax codes | BO-07 | BR-TAX-002 | UC-08, UC-10 | SCR-22 | AT-TAX-101 | — | Must |
| FR-TAX-002 | Tax rates with effective dates | BO-07 | BR-TAX-002 | UC-08, UC-10 | SCR-22 | AT-TAX-01 | TC-025 | Must |
| FR-TAX-003 | Inclusive and exclusive pricing | BO-07 | — | UC-08, UC-10 | SCR-22 | AT-TAX-02 | — | Must |
| FR-TAX-004 | Tax treatment by transaction type | BO-07 | — | UC-08, UC-10 | SCR-22 | AT-TAX-102 | — | Should |
| FR-TAX-005 | Tax on documents | BO-07 | BR-TAX-001 | UC-08, UC-10 | SCR-22 | AT-TAX-01 | TC-025 | Must |
| FR-TAX-006 | Tax GL accounts | BO-07 | BR-TAX-003 | UC-08, UC-10 | SCR-22 | AT-TAX-103 | — | Must |
| FR-TAX-007 | Tax periods | BO-07 | — | UC-08, UC-10 | SCR-22 | AT-TAX-104 | — | Should |
| FR-TAX-008 | Tax summary and transaction reports | BO-07 | BR-RPT-002 | UC-08, UC-10 | SCR-22 | AT-TAX-105 | — | Should |
| FR-TAX-009 | Tax adjustments | BO-07 | BR-SEC-001 | UC-08, UC-10 | SCR-22 | AT-TAX-106 | — | Should |
| FR-TAX-010 | Configuration separate from code | BO-07 | BR-TAX-002 | UC-08, UC-10 | SCR-22 | AT-TAX-107 | — | Must |
| FR-TAX-011 | Change audit | BO-07 | BR-AUD-001 | UC-08, UC-10 | SCR-22 | AT-TAX-108 | — | Must |
| FR-TAX-012 | Verification status | BO-07 | BR-TAX-002 | UC-08, UC-10 | SCR-22 | AT-TAX-03 | — | Must |
| FR-BUD-001 | Annual and monthly budgets | BO-04, BO-03 | BR-BUD-002 | UC-13 | SCR-23 | AT-BUD-101 | — | Should |
| FR-BUD-002 | Department and branch budgets | BO-04, BO-03 | BR-SEC-003 | UC-13 | SCR-23 | AT-BUD-102 | — | Should |
| FR-BUD-003 | Revenue and expense budgets | BO-04, BO-03 | — | UC-13 | SCR-23 | AT-BUD-103 | — | Should |
| FR-BUD-004 | Budget approval | BO-04, BO-03 | BR-BUD-002 | UC-13 | SCR-23 | AT-BUD-02 | — | Should |
| FR-BUD-005 | Budget revisions | BO-04, BO-03 | BR-BUD-002 | UC-13 | SCR-23 | AT-BUD-02 | — | Should |
| FR-BUD-006 | Budget versus actual | BO-04, BO-03 | BR-BUD-001 | UC-13 | SCR-23 | AT-BUD-01 | — | Should |
| FR-BUD-007 | Variance analysis | BO-04, BO-03 | — | UC-13 | SCR-23 | AT-BUD-104 | — | Should |
| FR-BUD-008 | Spending limits | BO-04, BO-03 | BR-BUD-001 | UC-13 | SCR-23 | AT-BUD-105 | — | Could |
| FR-BUD-009 | Budget alerts | BO-04, BO-03 | — | UC-13 | SCR-23 | AT-BUD-03 | — | Should |
| FR-BUD-010 | Budget import | BO-04, BO-03 | BR-IMP-001 | UC-13 | SCR-23 | AT-BUD-106 | — | Should |
| FR-RPT-001 | Trial balance | BO-04 | BR-GL-002 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-101 | — | Must |
| FR-RPT-002 | General ledger report | BO-04 | BR-RPT-001 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-102 | — | Must |
| FR-RPT-003 | Balance sheet | BO-04 | BR-RPT-003 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-01 | TC-016 | Must |
| FR-RPT-004 | Income statement | BO-04 | BR-RPT-003 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-02 | TC-015, TC-016 | Must |
| FR-RPT-005 | Cash flow statement | BO-04 | BR-RPT-003 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-103 | — | Should |
| FR-RPT-006 | Statement of changes in equity | BO-04 | BR-RPT-003 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-104 | — | Should |
| FR-RPT-007 | Receivable and payable reports | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-105 | — | Must |
| FR-RPT-008 | Cash and bank reports | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-106 | — | Must |
| FR-RPT-009 | Revenue and expense analysis | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-107 | — | Must |
| FR-RPT-010 | Tax, asset and budget reports | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-108 | — | Should |
| FR-RPT-011 | Control reports | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-109 | — | Must |
| FR-RPT-012 | FX reports | BO-04 | BR-FX-003 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-110 | — | Should |
| FR-RPT-013 | Ratios and KPIs | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-111 | — | Could |
| FR-RPT-014 | Report header and basis | BO-04 | BR-RPT-002 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-112 | TC-015, TC-020 | Must |
| FR-RPT-015 | Comparatives | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-113 | — | Should |
| FR-RPT-016 | Exports | BO-04 | — | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-03 | — | Must |
| FR-RPT-017 | Drafts excluded | BO-04 | BR-RPT-001 | UC-13, UC-16 | SCR-07, SCR-08, SCR-15 | AT-RPT-04 | — | Must |
| FR-FX-001 | Currency master | BO-01, BO-09 | BR-FX-005 | UC-09, UC-11 | SCR-24 | AT-FX-101 | — | Must |
| FR-FX-002 | Base currency per company | BO-01, BO-09 | BR-FX-001 | UC-09, UC-11 | SCR-24 | AT-FX-102 | — | Must |
| FR-FX-003 | Exchange-rate records | BO-01, BO-09 | BR-FX-002 | UC-09, UC-11 | SCR-24 | AT-FX-103 | — | Must |
| FR-FX-004 | Rate sources | BO-01, BO-09 | BR-FX-002 | UC-09, UC-11 | SCR-24 | AT-FX-104 | — | Must |
| FR-FX-005 | Manual rate entry with permissions | BO-01, BO-09 | BR-AUD-001 | UC-09, UC-11 | SCR-24 | AT-FX-105 | — | Must |
| FR-FX-006 | Transaction-date rates | BO-01, BO-09 | BR-FX-002 | UC-09, UC-11 | SCR-24 | AT-FX-04 | TC-017 | Must |
| FR-FX-007 | Preserve original amounts and rates | BO-01, BO-09 | BR-FX-001 | UC-09, UC-11 | SCR-24 | AT-FX-01 | TC-017 | Must |
| FR-FX-008 | Foreign currency balances | BO-01, BO-09 | — | UC-09, UC-11 | SCR-24 | AT-FX-106 | — | Must |
| FR-FX-009 | Realised exchange differences | BO-01, BO-09 | BR-FX-003 | UC-09, UC-11 | SCR-24 | AT-FX-02 | TC-018 | Must |
| FR-FX-010 | Revaluation | BO-01, BO-09 | BR-FX-004 | UC-09, UC-11 | SCR-24 | AT-FX-03 | TC-019 | Should |
| FR-FX-011 | Rounding account | BO-01, BO-09 | BR-FX-005 | UC-09, UC-11 | SCR-24 | AT-FX-107 | — | Must |
| FR-FX-012 | FX reports | BO-01, BO-09 | — | UC-09, UC-11 | SCR-24 | AT-FX-108 | — | Should |
| FR-CLS-001 | Period management | BO-01, BO-03, BO-04 | BR-CLS-002 | UC-15 | SCR-17 | AT-CLS-101 | TC-007 | Must |
| FR-CLS-002 | Period locking | BO-01, BO-03, BO-04 | BR-CLS-001 | UC-15 | SCR-17 | AT-CLS-01, AT-CLS-02 | TC-006, TC-007 | Must |
| FR-CLS-003 | Month-end checklist | BO-01, BO-03, BO-04 | — | UC-15 | SCR-17 | AT-CLS-102 | — | Should |
| FR-CLS-004 | Bank reconciliation review | BO-01, BO-03, BO-04 | BR-CB-002 | UC-15 | SCR-17 | AT-CLS-103 | — | Should |
| FR-CLS-005 | Receivables and payables review | BO-01, BO-03, BO-04 | BR-COA-002 | UC-15 | SCR-17 | AT-CLS-104 | — | Should |
| FR-CLS-006 | Accruals and prepayments | BO-01, BO-03, BO-04 | BR-GL-010 | UC-15 | SCR-17 | AT-CLS-105 | — | Should |
| FR-CLS-007 | Depreciation posting check | BO-01, BO-03, BO-04 | BR-FA-002 | UC-15 | SCR-17 | AT-CLS-106 | — | Should |
| FR-CLS-008 | FX revaluation step | BO-01, BO-03, BO-04 | BR-FX-004 | UC-15 | SCR-17 | AT-CLS-107 | — | Should |
| FR-CLS-009 | Trial balance and statement review | BO-01, BO-03, BO-04 | BR-RPT-003 | UC-15 | SCR-17 | AT-CLS-108 | — | Should |
| FR-CLS-010 | Year-end closing | BO-01, BO-03, BO-04 | BR-CLS-004 | UC-15 | SCR-17 | AT-CLS-04 | TC-026 | Must |
| FR-CLS-011 | Retained earnings treatment | BO-01, BO-03, BO-04 | BR-CLS-004 | UC-15 | SCR-17 | AT-CLS-04 | TC-026 | Must |
| FR-CLS-012 | Authorised reopening | BO-01, BO-03, BO-04 | BR-CLS-003 | UC-15 | SCR-17 | AT-CLS-03 | — | Must |
| FR-CLS-013 | Year-end re-close | BO-01, BO-03, BO-04 | BR-CLS-004 | UC-15 | SCR-17 | AT-CLS-109 | — | Should |
| FR-AUD-001 | Critical event logging | BO-02, BO-03 | BR-AUD-002 | UC-16 | SCR-18 | AT-AUD-01 | — | Must |
| FR-AUD-002 | Before and after values | BO-02, BO-03 | — | UC-16 | SCR-18 | AT-AUD-101 | — | Must |
| FR-AUD-003 | Reason capture | BO-02, BO-03 | — | UC-16 | SCR-18 | AT-AUD-03 | — | Must |
| FR-AUD-004 | Append-only protection | BO-02, BO-03 | BR-AUD-001 | UC-16 | SCR-18 | AT-AUD-02 | TC-036 | Must |
| FR-AUD-005 | Audit viewer | BO-02, BO-03 | — | UC-16 | SCR-18 | AT-AUD-102 | — | Must |
| FR-AUD-006 | Audit export | BO-02, BO-03 | BR-AUD-001 | UC-16 | SCR-18 | AT-AUD-103 | — | Should |
| FR-AUD-007 | Integrity verification | BO-02, BO-03 | BR-AUD-001 | UC-16 | SCR-18 | AT-AUD-104 | TC-036 | Should |
| FR-AUD-008 | Control exception monitoring | BO-02, BO-03 | BR-SEC-002 | UC-16 | SCR-18 | AT-AUD-105 | — | Should |
| FR-AUD-009 | Audit retention and archival | BO-02, BO-03 | — | UC-16 | SCR-18 | AT-AUD-106 | — | Must |
| FR-DASH-001 | Role-specific dashboard | BO-04, BO-05 | BR-SEC-003 | UC-13 | SCR-02 | AT-DASH-101 | — | Should |
| FR-DASH-002 | Revenue, expense and profit KPIs | BO-04, BO-05 | BR-RPT-001 | UC-13 | SCR-02 | AT-DASH-01 | — | Should |
| FR-DASH-003 | Cash and bank KPIs | BO-04, BO-05 | — | UC-13 | SCR-02 | AT-DASH-102 | — | Should |
| FR-DASH-004 | AR and AP KPIs | BO-04, BO-05 | — | UC-13 | SCR-02 | AT-DASH-103 | — | Should |
| FR-DASH-005 | Trends | BO-04, BO-05 | — | UC-13 | SCR-02 | AT-DASH-104 | — | Should |
| FR-DASH-006 | Budget utilisation | BO-04, BO-05 | BR-BUD-001 | UC-13 | SCR-02 | AT-DASH-105 | — | Could |
| FR-DASH-007 | Reconciliation status | BO-04, BO-05 | — | UC-13 | SCR-02 | AT-DASH-106 | — | Should |
| FR-DASH-008 | Pending approvals and recent transactions | BO-04, BO-05 | — | UC-13 | SCR-02 | AT-DASH-107 | — | Should |
| FR-DASH-009 | Posted versus pending distinction | BO-04, BO-05 | BR-RPT-001 | UC-13 | SCR-02 | AT-DASH-02 | — | Must |
| FR-DASH-010 | Drill-down | BO-04, BO-05 | — | UC-13 | SCR-02 | AT-DASH-108 | — | Should |
| FR-WFL-001 | Approval rules | BO-03, BO-08 | BR-SEC-001 | UC-05 | SCR-26 | AT-WFL-01 | — | Must |
| FR-WFL-002 | Approval inbox | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-101 | — | Must |
| FR-WFL-003 | Rejection with comment | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-102 | — | Must |
| FR-WFL-004 | Delegation | BO-03, BO-08 | BR-WFL-001 | UC-05 | SCR-26 | AT-WFL-02 | — | Should |
| FR-WFL-005 | Escalation | BO-03, BO-08 | BR-WFL-001 | UC-05 | SCR-26 | AT-WFL-03 | — | Should |
| FR-WFL-006 | Pending approval notifications | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-103 | — | Must |
| FR-WFL-007 | Overdue invoice reminders | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-104 | — | Should |
| FR-WFL-008 | Upcoming payment reminders | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-105 | — | Should |
| FR-WFL-009 | Budget threshold notifications | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-106 | — | Should |
| FR-WFL-010 | Reconciliation and closing reminders | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-107 | — | Should |
| FR-WFL-011 | Failed scheduled task notifications | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-108 | — | Must |
| FR-WFL-012 | Email notifications | BO-03, BO-08 | — | UC-05 | SCR-26 | AT-WFL-109 | — | Should |
| FR-IMP-001 | Customer and supplier import | BO-08 | BR-IMP-001 | UC-16 | SCR-25 | AT-IMP-101 | — | Must |
| FR-IMP-002 | Chart of accounts import | BO-08 | BR-COA-003 | UC-16 | SCR-25 | AT-IMP-102 | — | Must |
| FR-IMP-003 | Opening balance import | BO-08 | BR-CFG-002 | UC-16 | SCR-25 | AT-IMP-02 | TC-023 | Must |
| FR-IMP-004 | Journal import | BO-08 | BR-IMP-001 | UC-16 | SCR-25 | AT-IMP-01 | TC-022 | Must |
| FR-IMP-005 | Bank statement import | BO-08 | — | UC-16 | SCR-25 | AT-IMP-103 | — | Must |
| FR-IMP-006 | Invoice import | BO-08 | BR-IMP-001 | UC-16 | SCR-25 | AT-IMP-104 | — | Could |
| FR-IMP-007 | Preview and error report | BO-08 | — | UC-16 | SCR-25 | AT-IMP-01 | TC-022 | Must |
| FR-IMP-008 | Import history | BO-08 | — | UC-16 | SCR-25 | AT-IMP-105 | — | Must |
| FR-IMP-009 | Permission checks | BO-08 | BR-SEC-003 | UC-16 | SCR-25 | AT-IMP-106 | — | Must |
| FR-IMP-010 | Rollback and correction | BO-08 | BR-GL-004 | UC-16 | SCR-25 | AT-IMP-107 | — | Should |
| FR-IMP-011 | Exports | BO-08 | BR-AUD-001 | UC-16 | SCR-25 | AT-IMP-03 | — | Must |
| FR-CFG-001 | Company settings | BO-07, BO-09 | BR-CFG-001 | UC-02 | SCR-19 | AT-CFG-101 | — | Must |
| FR-CFG-002 | Currency settings | BO-07, BO-09 | BR-FX-005 | UC-02 | SCR-19 | AT-CFG-02 | — | Must |
| FR-CFG-003 | Language settings | BO-07, BO-09 | — | UC-02 | SCR-19 | AT-CFG-102 | — | Must |
| FR-CFG-004 | Fiscal year and periods | BO-07, BO-09 | — | UC-02 | SCR-19 | AT-CFG-103 | — | Must |
| FR-CFG-005 | Document numbering | BO-07, BO-09 | BR-DOC-001 | UC-02 | SCR-19 | AT-CFG-104 | — | Must |
| FR-CFG-006 | Tax configuration | BO-07, BO-09 | BR-TAX-002 | UC-02 | SCR-19 | AT-CFG-105 | — | Must |
| FR-CFG-007 | Approval settings | BO-07, BO-09 | BR-SEC-002 | UC-02 | SCR-19 | AT-CFG-106 | — | Must |
| FR-CFG-008 | Notification settings | BO-07, BO-09 | — | UC-02 | SCR-19 | AT-CFG-107 | — | Should |
| FR-CFG-009 | Financial statement mapping | BO-07, BO-09 | BR-RPT-003 | UC-02 | SCR-19 | AT-CFG-108 | — | Must |
| FR-CFG-010 | Report templates | BO-07, BO-09 | — | UC-02 | SCR-19 | AT-CFG-109 | — | Should |
| FR-CFG-011 | Backup settings view | BO-07, BO-09 | — | UC-02 | SCR-19 | AT-CFG-110 | — | Should |
| FR-CFG-012 | User-defined dimensions | BO-07, BO-09 | — | UC-02 | SCR-19 | AT-CFG-111 | — | Should |
| FR-CFG-013 | Setting history and approval | BO-07, BO-09 | BR-AUD-001 | UC-02 | SCR-19 | AT-CFG-01 | — | Must |


# 22. Glossary

| Term | Definition |
| Accrual basis | Recognising revenue when earned and expenses when incurred, regardless of cash timing |
| Adjusting journal | Journal recorded at period end to correct or complete balances (accruals, prepayments, reclassifications) |
| Aging | Analysis of open receivables or payables by days past due |
| Allocation | Application of a receipt or payment to one or more invoices |
| Approval limit | Maximum document value a role may approve, in base currency |
| Base (functional) currency | Currency in which a company’s books are kept |
| Cash basis | Recognising revenue and expenses only when cash is received or paid |
| Chart of Accounts (COA) | Structured list of accounts used to classify transactions |
| Control account | GL account whose balance is supported by a subledger (AR, AP, bank, fixed assets) |
| Credit note | Document reducing an amount previously invoiced |
| Debit note | Document increasing an amount receivable (or reducing a payable) |
| Depreciation | Systematic allocation of an asset’s depreciable amount over its useful life |
| Dimension | Additional classification on journal lines (branch, department, project) |
| Double-entry | Every transaction recorded with equal debits and credits |
| Draft | Unposted document or journal that does not affect official reports |
| Exchange difference (realised) | Gain or loss arising when a foreign-currency item is settled |
| Exchange difference (unrealised) | Gain or loss from revaluing open foreign-currency items at a reporting date |
| Fiscal year | Twelve-month (or other) accounting year of a company |
| General Ledger (GL) | Complete record of posted accounting entries by account |
| Header account | Non-posting account used to group other accounts |
| Idempotency | Property that repeating the same request has the same effect as making it once |
| Journal entry / voucher | Record of a transaction with debit and credit lines |
| Net book value (NBV) | Cost less accumulated depreciation and impairment |
| Normal balance | Side (debit or credit) on which an account’s balance usually appears |
| Opening balances | Balances brought into the system at go-live |
| Period lock | Status preventing posting into a closed accounting period |
| Posting | Final recording of a journal in the ledger; posted entries are immutable |
| Reconciliation | Comparison of two records (e.g., bank statement and bankbook) to explain differences |
| Retained earnings | Accumulated profits not distributed, carried in equity |
| Reversal | Journal that cancels a posted journal by mirroring it with opposite amounts |
| Revaluation | Remeasurement of foreign-currency monetary balances at a closing rate |
| Separation of duties (SoD) | Control requiring different people to prepare, approve and execute transactions |
| Soft close | Period status allowing only authorised adjusting entries |
| Subledger | Detailed ledger (customers, suppliers, bank, assets) supporting a control account |
| Suspense account | Temporary account for unclassified amounts, to be cleared |
| Transaction currency | Currency in which a document is denominated |
| Trial balance | List of account balances showing total debits equal total credits |
| Unapplied receipt | Customer money received but not yet allocated to invoices |
| Write-off | Removal of an uncollectible receivable balance with approval |


# Appendix A. Functional Requirements Catalogue
Consolidated list of all functional requirements (Deliverable 2). Full context is in Section 6.

| ID | Module | Requirement | Priority | Src | Acceptance |
| FR-AUTH-001 | AUTH | Login | Must | C | AT-AUTH-101 |
| FR-AUTH-002 | AUTH | Logout | Must | C | AT-AUTH-102 |
| FR-AUTH-003 | AUTH | Secure password storage | Must | C | AT-AUTH-03 |
| FR-AUTH-004 | AUTH | Password change and reset | Must | C | AT-AUTH-103 |
| FR-AUTH-005 | AUTH | Activation and deactivation | Must | C | AT-AUTH-02 |
| FR-AUTH-006 | AUTH | User profile | Must | C | AT-AUTH-104 |
| FR-AUTH-007 | AUTH | Session management | Should | C | AT-AUTH-02 |
| FR-AUTH-008 | AUTH | Multi-factor authentication | Should | C | AT-AUTH-105 |
| FR-AUTH-009 | AUTH | Failed-login protection | Must | C | AT-AUTH-01 |
| FR-AUTH-010 | AUTH | Account recovery | Must | C | AT-AUTH-106 |
| FR-AUTH-011 | AUTH | User activity history | Must | C | AT-AUTH-01 |
| FR-AUTH-012 | AUTH | Single sign-on readiness | Could | C | AT-AUTH-107 |
| FR-RBAC-001 | RBAC | Default roles | Must | C | AT-RBAC-101 |
| FR-RBAC-002 | RBAC | Configurable roles | Must | C | AT-RBAC-102 |
| FR-RBAC-003 | RBAC | Module and action permissions | Must | C | AT-RBAC-103 |
| FR-RBAC-004 | RBAC | Company and branch scope | Must | C | AT-RBAC-01 |
| FR-RBAC-005 | RBAC | Account-level restrictions | Should | C | AT-RBAC-04 |
| FR-RBAC-006 | RBAC | Value-based approval authority | Must | C | AT-RBAC-02 |
| FR-RBAC-007 | RBAC | Separation of duties enforcement | Must | C | AT-RBAC-03 |
| FR-RBAC-008 | RBAC | Sensitive information masking | Must | C | AT-RBAC-04 |
| FR-RBAC-009 | RBAC | Server-side authorisation | Must | P | AT-RBAC-104 |
| FR-RBAC-010 | RBAC | Role change approval | Should | P | AT-RBAC-105 |
| FR-RBAC-011 | RBAC | Permission review report | Should | P | AT-RBAC-106 |
| FR-ORG-001 | ORG | Company profile | Must | C | AT-ORG-101 |
| FR-ORG-002 | ORG | Multiple companies | Should | C | AT-ORG-102 |
| FR-ORG-003 | ORG | Branches | Must | C | AT-ORG-103 |
| FR-ORG-004 | ORG | Departments and business units | Must | C | AT-ORG-104 |
| FR-ORG-005 | ORG | Fiscal years | Must | C | AT-ORG-02 |
| FR-ORG-006 | ORG | Accounting periods | Must | C | AT-ORG-02 |
| FR-ORG-007 | ORG | Base and supported currencies | Must | C | AT-ORG-03 |
| FR-ORG-008 | ORG | Document numbering per company | Must | C | AT-ORG-105 |
| FR-ORG-009 | ORG | Company accounting configuration | Must | C | AT-ORG-106 |
| FR-ORG-010 | ORG | Branch-level reporting | Must | C | AT-ORG-107 |
| FR-ORG-011 | ORG | Readiness checklist | Must | P | AT-ORG-01 |
| FR-COA-001 | COA | Account master data | Must | C | AT-COA-101 |
| FR-COA-002 | COA | Account hierarchy | Must | C | AT-COA-102 |
| FR-COA-003 | COA | Account types and categories | Must | C | AT-COA-103 |
| FR-COA-004 | COA | Posting eligibility | Must | C | AT-COA-01 |
| FR-COA-005 | COA | Control accounts | Must | P | AT-COA-104 |
| FR-COA-006 | COA | Financial statement mapping | Must | C | AT-COA-02 |
| FR-COA-007 | COA | Account change history | Must | C | AT-COA-03 |
| FR-COA-008 | COA | Deactivation and deletion rules | Must | C | AT-COA-105 |
| FR-COA-009 | COA | Search and tree view | Must | C | AT-COA-106 |
| FR-COA-010 | COA | Chart templates | Should | P | AT-COA-107 |
| FR-COA-011 | COA | Account currency restriction | Should | P | AT-COA-108 |
| FR-GL-001 | GL | Manual journal vouchers | Must | C | AT-GL-101 |
| FR-GL-002 | GL | Automatic journals | Must | C | AT-GL-102 |
| FR-GL-003 | GL | Double-entry validation | Must | C | AT-GL-01 |
| FR-GL-004 | GL | Journal workflow states | Must | C | AT-GL-02 |
| FR-GL-005 | GL | Journal approval workflow | Must | C | AT-GL-103 |
| FR-GL-006 | GL | Atomic posting | Must | C | AT-GL-02, AT-GL-03 |
| FR-GL-007 | GL | Idempotent posting | Must | P | AT-GL-03 |
| FR-GL-008 | GL | Journal numbering | Must | C | AT-GL-104 |
| FR-GL-009 | GL | Immutability of posted journals | Must | C | AT-GL-04 |
| FR-GL-010 | GL | Reversal entries | Must | C | AT-GL-04 |
| FR-GL-011 | GL | Adjusting journals | Must | C | AT-GL-105 |
| FR-GL-012 | GL | Recurring journals | Should | P | AT-GL-106 |
| FR-GL-013 | GL | Supporting attachments | Must | C | AT-GL-107 |
| FR-GL-014 | GL | Opening balances | Must | C | AT-GL-108 |
| FR-GL-015 | GL | General Ledger inquiry | Must | C | AT-GL-109 |
| FR-GL-016 | GL | Transaction drill-down | Must | C | AT-GL-110 |
| FR-GL-017 | GL | Journal history | Must | C | AT-GL-111 |
| FR-GL-018 | GL | Trial balance | Must | C | AT-GL-05 |
| FR-GL-019 | GL | Journal search | Must | C | AT-GL-112 |
| FR-GL-020 | GL | Dimensions on lines | Should | C | AT-GL-113 |
| FR-GL-021 | GL | Suspense control | Should | P | AT-GL-114 |
| FR-AR-001 | AR | Customer records | Must | C | AT-AR-101 |
| FR-AR-002 | AR | Customer invoices | Must | C | AT-AR-102 |
| FR-AR-003 | AR | Invoice posting | Must | C | AT-AR-04 |
| FR-AR-004 | AR | Invoice statuses | Must | C | AT-AR-103 |
| FR-AR-005 | AR | Due dates and terms | Must | C | AT-AR-104 |
| FR-AR-006 | AR | Receipt vouchers | Must | C | AT-AR-105 |
| FR-AR-007 | AR | Payment allocation | Must | C | AT-AR-01, AT-AR-02, AT-AR-03 |
| FR-AR-008 | AR | Partial payments | Must | C | AT-AR-01 |
| FR-AR-009 | AR | Overpayments and unapplied receipts | Must | C | AT-AR-106 |
| FR-AR-010 | AR | Outstanding balance derivation | Must | C | AT-AR-01 |
| FR-AR-011 | AR | Credit limits | Should | C | AT-AR-107 |
| FR-AR-012 | AR | Credit notes | Must | C | AT-AR-01 |
| FR-AR-013 | AR | Debit notes | Should | C | AT-AR-108 |
| FR-AR-014 | AR | Write-offs | Must | C | AT-AR-109 |
| FR-AR-015 | AR | Refunds | Should | C | AT-AR-110 |
| FR-AR-016 | AR | Customer statements | Must | C | AT-AR-111 |
| FR-AR-017 | AR | Receivable aging | Must | C | AT-AR-112 |
| FR-AR-018 | AR | Overdue notifications | Should | C | AT-AR-113 |
| FR-AR-019 | AR | Foreign-currency receivables | Must | C | AT-AR-114 |
| FR-AR-020 | AR | Subledger reconciliation | Must | P | AT-AR-05 |
| FR-AP-001 | AP | Supplier records | Must | C | AT-AP-101 |
| FR-AP-002 | AP | Supplier invoices and bills | Must | C | AT-AP-102 |
| FR-AP-003 | AP | Duplicate invoice detection | Must | C | AT-AP-01 |
| FR-AP-004 | AP | Invoice approval and posting | Must | C | AT-AP-103 |
| FR-AP-005 | AP | Purchase-related liabilities | Should | C | AT-AP-104 |
| FR-AP-006 | AP | Supplier credit notes | Must | C | AT-AP-105 |
| FR-AP-007 | AP | Supplier advances | Should | C | AT-AP-106 |
| FR-AP-008 | AP | Payment vouchers | Must | C | AT-AP-107 |
| FR-AP-009 | AP | Payment approval | Must | C | AT-AP-02 |
| FR-AP-010 | AP | Payment release | Must | C | AT-AP-02, AT-AP-03, AT-AP-04 |
| FR-AP-011 | AP | Partial payments | Must | C | AT-AP-108 |
| FR-AP-012 | AP | Payment scheduling | Should | C | AT-AP-109 |
| FR-AP-013 | AP | Outstanding liabilities | Must | C | AT-AP-03 |
| FR-AP-014 | AP | Supplier statements | Should | C | AT-AP-110 |
| FR-AP-015 | AP | Payables aging | Must | C | AT-AP-111 |
| FR-AP-016 | AP | Supplier balance reconciliation | Should | C | AT-AP-112 |
| FR-AP-017 | AP | Bank-detail change control | Must | P | AT-AP-113 |
| FR-AP-018 | AP | AP control reconciliation | Must | P | AT-AP-114 |
| FR-CB-001 | CB | Cash accounts | Must | C | AT-CB-101 |
| FR-CB-002 | CB | Bank accounts | Must | C | AT-CB-102 |
| FR-CB-003 | CB | Cash receipts and payments | Must | C | AT-CB-103 |
| FR-CB-004 | CB | Bank receipts, payments, deposits and withdrawals | Must | C | AT-CB-104 |
| FR-CB-005 | CB | Transfers | Must | C | AT-CB-04 |
| FR-CB-006 | CB | Bank charges and interest | Must | C | AT-CB-105 |
| FR-CB-007 | CB | Cashbook and bankbook | Must | C | AT-CB-04 |
| FR-CB-008 | CB | Bank statement import | Must | C | AT-CB-03 |
| FR-CB-009 | CB | Automatic matching | Must | C | AT-CB-106 |
| FR-CB-010 | CB | Manual matching and adjustments | Must | C | AT-CB-107 |
| FR-CB-011 | CB | Reconciliation completion | Must | C | AT-CB-01 |
| FR-CB-012 | CB | Locked reconciliation history | Must | C | AT-CB-02 |
| FR-CB-013 | CB | Unreconciled transactions | Must | C | AT-CB-108 |
| FR-CB-014 | CB | Cash balance monitoring | Should | C | AT-CB-109 |
| FR-EXP-001 | EXP | Revenue recording | Must | C | AT-EXP-101 |
| FR-EXP-002 | EXP | Expense recording | Must | C | AT-EXP-102 |
| FR-EXP-003 | EXP | Expense categories | Must | C | AT-EXP-103 |
| FR-EXP-004 | EXP | Payment mode | Must | C | AT-EXP-01 |
| FR-EXP-005 | EXP | Department and branch allocation | Must | C | AT-EXP-02 |
| FR-EXP-006 | EXP | Expense approval | Must | C | AT-EXP-104 |
| FR-EXP-007 | EXP | Expense attachments | Must | C | AT-EXP-03 |
| FR-EXP-008 | EXP | Expense claims and reimbursement | Should | C | AT-EXP-105 |
| FR-EXP-009 | EXP | Recurring expenses | Should | C | AT-EXP-106 |
| FR-EXP-010 | EXP | Settlement of recognised expenses | Must | C | AT-EXP-01 |
| FR-EXP-011 | EXP | Budget check | Should | P | AT-EXP-107 |
| FR-DOC-001 | DOC | Document types | Must | C | AT-DOC-101 |
| FR-DOC-002 | DOC | Sequential numbering | Must | C | AT-DOC-01 |
| FR-DOC-003 | DOC | Document templates | Must | C | AT-DOC-102 |
| FR-DOC-004 | DOC | PDF generation | Must | C | AT-DOC-03 |
| FR-DOC-005 | DOC | Printable layouts | Must | C | AT-DOC-103 |
| FR-DOC-006 | DOC | Email delivery | Should | C | AT-DOC-104 |
| FR-DOC-007 | DOC | Document status and history | Must | C | AT-DOC-105 |
| FR-DOC-008 | DOC | Document snapshot | Must | P | AT-DOC-02 |
| FR-DOC-009 | DOC | Supporting attachments | Must | C | AT-DOC-106 |
| FR-DOC-010 | DOC | Bilingual text | Must | C | AT-DOC-03 |
| FR-INV-001 | INV | Inventory accounts | Could | C | AT-INV-101 |
| FR-INV-002 | INV | Inventory purchases and goods received | Could | C | AT-INV-102 |
| FR-INV-003 | INV | Cost of goods sold | Could | C | AT-INV-103 |
| FR-INV-004 | INV | Adjustments, write-offs and returns | Could | C | AT-INV-104 |
| FR-INV-005 | INV | Valuation integration | Could | C | AT-INV-105 |
| FR-INV-006 | INV | Idempotent event intake | Could | P | AT-INV-01 |
| FR-INV-007 | INV | Stock valuation summary | Could | C | AT-INV-106 |
| FR-INV-008 | INV | GL reconciliation | Could | C | AT-INV-02 |
| FR-FA-001 | FA | Asset register | Should | C | AT-FA-101 |
| FR-FA-002 | FA | Asset categories | Should | C | AT-FA-102 |
| FR-FA-003 | FA | Acquisition | Should | C | AT-FA-103 |
| FR-FA-004 | FA | Depreciation schedule | Should | C | AT-FA-01 |
| FR-FA-005 | FA | Monthly depreciation posting | Should | C | AT-FA-01, AT-FA-02 |
| FR-FA-006 | FA | Accumulated depreciation and NBV | Should | C | AT-FA-104 |
| FR-FA-007 | FA | Disposal and sale | Should | C | AT-FA-03 |
| FR-FA-008 | FA | Impairment | Could | C | AT-FA-105 |
| FR-FA-009 | FA | Transfers | Should | C | AT-FA-106 |
| FR-FA-010 | FA | Change in estimates | Should | P | AT-FA-107 |
| FR-FA-011 | FA | Asset history and reports | Should | C | AT-FA-108 |
| FR-FA-012 | FA | GL reconciliation | Should | P | AT-FA-109 |
| FR-TAX-001 | TAX | Tax codes | Must | C | AT-TAX-101 |
| FR-TAX-002 | TAX | Tax rates with effective dates | Must | C | AT-TAX-01 |
| FR-TAX-003 | TAX | Inclusive and exclusive pricing | Must | C | AT-TAX-02 |
| FR-TAX-004 | TAX | Tax treatment by transaction type | Should | C | AT-TAX-102 |
| FR-TAX-005 | TAX | Tax on documents | Must | C | AT-TAX-01 |
| FR-TAX-006 | TAX | Tax GL accounts | Must | C | AT-TAX-103 |
| FR-TAX-007 | TAX | Tax periods | Should | C | AT-TAX-104 |
| FR-TAX-008 | TAX | Tax summary and transaction reports | Should | C | AT-TAX-105 |
| FR-TAX-009 | TAX | Tax adjustments | Should | C | AT-TAX-106 |
| FR-TAX-010 | TAX | Configuration separate from code | Must | C | AT-TAX-107 |
| FR-TAX-011 | TAX | Change audit | Must | C | AT-TAX-108 |
| FR-TAX-012 | TAX | Verification status | Must | P | AT-TAX-03 |
| FR-BUD-001 | BUD | Annual and monthly budgets | Should | C | AT-BUD-101 |
| FR-BUD-002 | BUD | Department and branch budgets | Should | C | AT-BUD-102 |
| FR-BUD-003 | BUD | Revenue and expense budgets | Should | C | AT-BUD-103 |
| FR-BUD-004 | BUD | Budget approval | Should | C | AT-BUD-02 |
| FR-BUD-005 | BUD | Budget revisions | Should | C | AT-BUD-02 |
| FR-BUD-006 | BUD | Budget versus actual | Should | C | AT-BUD-01 |
| FR-BUD-007 | BUD | Variance analysis | Should | C | AT-BUD-104 |
| FR-BUD-008 | BUD | Spending limits | Could | C | AT-BUD-105 |
| FR-BUD-009 | BUD | Budget alerts | Should | C | AT-BUD-03 |
| FR-BUD-010 | BUD | Budget import | Should | P | AT-BUD-106 |
| FR-RPT-001 | RPT | Trial balance | Must | C | AT-RPT-101 |
| FR-RPT-002 | RPT | General ledger report | Must | C | AT-RPT-102 |
| FR-RPT-003 | RPT | Balance sheet | Must | C | AT-RPT-01 |
| FR-RPT-004 | RPT | Income statement | Must | C | AT-RPT-02 |
| FR-RPT-005 | RPT | Cash flow statement | Should | C | AT-RPT-103 |
| FR-RPT-006 | RPT | Statement of changes in equity | Should | C | AT-RPT-104 |
| FR-RPT-007 | RPT | Receivable and payable reports | Must | C | AT-RPT-105 |
| FR-RPT-008 | RPT | Cash and bank reports | Must | C | AT-RPT-106 |
| FR-RPT-009 | RPT | Revenue and expense analysis | Must | C | AT-RPT-107 |
| FR-RPT-010 | RPT | Tax, asset and budget reports | Should | C | AT-RPT-108 |
| FR-RPT-011 | RPT | Control reports | Must | C | AT-RPT-109 |
| FR-RPT-012 | RPT | FX reports | Should | C | AT-RPT-110 |
| FR-RPT-013 | RPT | Ratios and KPIs | Could | C | AT-RPT-111 |
| FR-RPT-014 | RPT | Report header and basis | Must | C | AT-RPT-112 |
| FR-RPT-015 | RPT | Comparatives | Should | P | AT-RPT-113 |
| FR-RPT-016 | RPT | Exports | Must | C | AT-RPT-03 |
| FR-RPT-017 | RPT | Drafts excluded | Must | C | AT-RPT-04 |
| FR-FX-001 | FX | Currency master | Must | C | AT-FX-101 |
| FR-FX-002 | FX | Base currency per company | Must | C | AT-FX-102 |
| FR-FX-003 | FX | Exchange-rate records | Must | C | AT-FX-103 |
| FR-FX-004 | FX | Rate sources | Must | C | AT-FX-104 |
| FR-FX-005 | FX | Manual rate entry with permissions | Must | C | AT-FX-105 |
| FR-FX-006 | FX | Transaction-date rates | Must | C | AT-FX-04 |
| FR-FX-007 | FX | Preserve original amounts and rates | Must | C | AT-FX-01 |
| FR-FX-008 | FX | Foreign currency balances | Must | C | AT-FX-106 |
| FR-FX-009 | FX | Realised exchange differences | Must | C | AT-FX-02 |
| FR-FX-010 | FX | Revaluation | Should | C | AT-FX-03 |
| FR-FX-011 | FX | Rounding account | Must | P | AT-FX-107 |
| FR-FX-012 | FX | FX reports | Should | C | AT-FX-108 |
| FR-CLS-001 | CLS | Period management | Must | C | AT-CLS-101 |
| FR-CLS-002 | CLS | Period locking | Must | C | AT-CLS-01, AT-CLS-02 |
| FR-CLS-003 | CLS | Month-end checklist | Should | C | AT-CLS-102 |
| FR-CLS-004 | CLS | Bank reconciliation review | Should | C | AT-CLS-103 |
| FR-CLS-005 | CLS | Receivables and payables review | Should | C | AT-CLS-104 |
| FR-CLS-006 | CLS | Accruals and prepayments | Should | C | AT-CLS-105 |
| FR-CLS-007 | CLS | Depreciation posting check | Should | C | AT-CLS-106 |
| FR-CLS-008 | CLS | FX revaluation step | Should | C | AT-CLS-107 |
| FR-CLS-009 | CLS | Trial balance and statement review | Should | C | AT-CLS-108 |
| FR-CLS-010 | CLS | Year-end closing | Must | C | AT-CLS-04 |
| FR-CLS-011 | CLS | Retained earnings treatment | Must | C | AT-CLS-04 |
| FR-CLS-012 | CLS | Authorised reopening | Must | C | AT-CLS-03 |
| FR-CLS-013 | CLS | Year-end re-close | Should | P | AT-CLS-109 |
| FR-AUD-001 | AUD | Critical event logging | Must | C | AT-AUD-01 |
| FR-AUD-002 | AUD | Before and after values | Must | C | AT-AUD-101 |
| FR-AUD-003 | AUD | Reason capture | Must | C | AT-AUD-03 |
| FR-AUD-004 | AUD | Append-only protection | Must | C | AT-AUD-02 |
| FR-AUD-005 | AUD | Audit viewer | Must | C | AT-AUD-102 |
| FR-AUD-006 | AUD | Audit export | Should | C | AT-AUD-103 |
| FR-AUD-007 | AUD | Integrity verification | Should | P | AT-AUD-104 |
| FR-AUD-008 | AUD | Control exception monitoring | Should | P | AT-AUD-105 |
| FR-AUD-009 | AUD | Audit retention and archival | Must | C | AT-AUD-106 |
| FR-DASH-001 | DASH | Role-specific dashboard | Should | C | AT-DASH-101 |
| FR-DASH-002 | DASH | Revenue, expense and profit KPIs | Should | C | AT-DASH-01 |
| FR-DASH-003 | DASH | Cash and bank KPIs | Should | C | AT-DASH-102 |
| FR-DASH-004 | DASH | AR and AP KPIs | Should | C | AT-DASH-103 |
| FR-DASH-005 | DASH | Trends | Should | C | AT-DASH-104 |
| FR-DASH-006 | DASH | Budget utilisation | Could | C | AT-DASH-105 |
| FR-DASH-007 | DASH | Reconciliation status | Should | C | AT-DASH-106 |
| FR-DASH-008 | DASH | Pending approvals and recent transactions | Should | C | AT-DASH-107 |
| FR-DASH-009 | DASH | Posted versus pending distinction | Must | C | AT-DASH-02 |
| FR-DASH-010 | DASH | Drill-down | Should | C | AT-DASH-108 |
| FR-WFL-001 | WFL | Approval rules | Must | C | AT-WFL-01 |
| FR-WFL-002 | WFL | Approval inbox | Must | C | AT-WFL-101 |
| FR-WFL-003 | WFL | Rejection with comment | Must | P | AT-WFL-102 |
| FR-WFL-004 | WFL | Delegation | Should | C | AT-WFL-02 |
| FR-WFL-005 | WFL | Escalation | Should | C | AT-WFL-03 |
| FR-WFL-006 | WFL | Pending approval notifications | Must | C | AT-WFL-103 |
| FR-WFL-007 | WFL | Overdue invoice reminders | Should | C | AT-WFL-104 |
| FR-WFL-008 | WFL | Upcoming payment reminders | Should | C | AT-WFL-105 |
| FR-WFL-009 | WFL | Budget threshold notifications | Should | C | AT-WFL-106 |
| FR-WFL-010 | WFL | Reconciliation and closing reminders | Should | C | AT-WFL-107 |
| FR-WFL-011 | WFL | Failed scheduled task notifications | Must | C | AT-WFL-108 |
| FR-WFL-012 | WFL | Email notifications | Should | C | AT-WFL-109 |
| FR-IMP-001 | IMP | Customer and supplier import | Must | C | AT-IMP-101 |
| FR-IMP-002 | IMP | Chart of accounts import | Must | C | AT-IMP-102 |
| FR-IMP-003 | IMP | Opening balance import | Must | C | AT-IMP-02 |
| FR-IMP-004 | IMP | Journal import | Must | C | AT-IMP-01 |
| FR-IMP-005 | IMP | Bank statement import | Must | C | AT-IMP-103 |
| FR-IMP-006 | IMP | Invoice import | Could | C | AT-IMP-104 |
| FR-IMP-007 | IMP | Preview and error report | Must | C | AT-IMP-01 |
| FR-IMP-008 | IMP | Import history | Must | C | AT-IMP-105 |
| FR-IMP-009 | IMP | Permission checks | Must | C | AT-IMP-106 |
| FR-IMP-010 | IMP | Rollback and correction | Should | C | AT-IMP-107 |
| FR-IMP-011 | IMP | Exports | Must | C | AT-IMP-03 |
| FR-CFG-001 | CFG | Company settings | Must | C | AT-CFG-101 |
| FR-CFG-002 | CFG | Currency settings | Must | C | AT-CFG-02 |
| FR-CFG-003 | CFG | Language settings | Must | C | AT-CFG-102 |
| FR-CFG-004 | CFG | Fiscal year and periods | Must | C | AT-CFG-103 |
| FR-CFG-005 | CFG | Document numbering | Must | C | AT-CFG-104 |
| FR-CFG-006 | CFG | Tax configuration | Must | C | AT-CFG-105 |
| FR-CFG-007 | CFG | Approval settings | Must | C | AT-CFG-106 |
| FR-CFG-008 | CFG | Notification settings | Should | C | AT-CFG-107 |
| FR-CFG-009 | CFG | Financial statement mapping | Must | C | AT-CFG-108 |
| FR-CFG-010 | CFG | Report templates | Should | C | AT-CFG-109 |
| FR-CFG-011 | CFG | Backup settings view | Should | C | AT-CFG-110 |
| FR-CFG-012 | CFG | User-defined dimensions | Should | C | AT-CFG-111 |
| FR-CFG-013 | CFG | Setting history and approval | Must | P | AT-CFG-01 |


# Appendix B. Non-Functional Requirements Catalogue
Consolidated list (Deliverable 3). All targets are proposed.

| ID | Category | Target | Verification | Priority |
| NFR-PERF-001 | Performance | p95 ≤ 2.0 s end-to-end in browser | Browser load test (Playwright timings) under the workload | Must |
| NFR-PERF-002 | Performance | p95 ≤ 3.0 s | Load test | Should |
| NFR-PERF-003 | Performance | p95 ≤ 1.5 s for result pages of 50 rows | Load test with realistic filters | Must |
| NFR-PERF-004 | Performance | API p95 ≤ 1.0 s | API load test (k6/Locust) | Must |
| NFR-PERF-005 | Performance | API p95 ≤ 1.5 s; ≥ 20 postings/second sustained per company | Load test with concurrent posting | Must |
| NFR-PERF-006 | Performance | ≤ 5 s | Report performance test | Must |
| NFR-PERF-007 | Performance | ≤ 10 s each | Report performance test | Must |
| NFR-PERF-008 | Performance | First page ≤ 3 s; full export ≤ 60 s as background job | Report performance test | Should |
| NFR-PERF-009 | Performance | Completed ≤ 5 min; no impact > 10 % on interactive p95 | Mixed load test | Should |
| NFR-PERF-010 | Performance | ≥ 50 concurrent users per installation (initial); growth target 200 | Load test | Must |
| NFR-PERF-011 | Performance | ≤ 60 s | Performance test | Should |
| NFR-SEC-001 | Security | No plaintext or reversible passwords | Code review; database inspection | Must |
| NFR-SEC-002 | Security | TLS scan grade A or better | TLS scanner | Must |
| NFR-SEC-003 | Security | 100 % endpoints covered by permission matrix tests | Automated authorisation tests | Must |
| NFR-SEC-004 | Security | 0 high findings in DAST | DAST (OWASP ZAP), API fuzzing | Must |
| NFR-SEC-005 | Security | 0 findings | SAST (Bandit, Semgrep), DAST | Must |
| NFR-SEC-006 | Security | 0 findings | DAST; code review | Must |
| NFR-SEC-007 | Security | Configured values verified | Functional tests | Must |
| NFR-SEC-008 | Security | Limits enforced with 429 responses | Load tests | Must |
| NFR-SEC-009 | Security | 0 secrets in repository; secret scanning on every commit | gitleaks in CI | Must |
| NFR-SEC-010 | Security | Malicious test files rejected | Security tests | Must |
| NFR-SEC-011 | Security | Privilege tests pass | Database tests | Must |
| NFR-SEC-012 | Security | Role tests pass | Functional tests | Must |
| NFR-SEC-013 | Security | API tests prove fields are ignored or rejected | API tests | Must |
| NFR-SEC-014 | Security | Critical ≤ 7 days, high ≤ 30 days | pip-audit, npm audit, image scanning | Must |
| NFR-SEC-015 | Security | No open critical/high findings at go-live | Penetration test report | Should |
| NFR-FIN-001 | Financial Integrity | 0 unbalanced posted journals in all tests and in production integrity checks | Unit, integration and property-based tests; nightly integrity job | Must |
| NFR-FIN-002 | Financial Integrity | 0 float types for money in schema and code (lint rule); property tests on conversions | Static checks; unit tests | Must |
| NFR-FIN-003 | Financial Integrity | 0 partial postings in fault-injection tests | Fault-injection integration tests | Must |
| NFR-FIN-004 | Financial Integrity | Exactly one effect per idempotency key in replay and concurrency tests | Concurrency and replay tests | Must |
| NFR-FIN-005 | Financial Integrity | 100 % of relationships have FKs | Schema review | Must |
| NFR-FIN-006 | Financial Integrity | UPDATE/DELETE on posted lines fails | Database tests | Must |
| NFR-FIN-007 | Financial Integrity | 0 postings into closed periods in concurrency tests | Concurrency tests | Must |
| NFR-FIN-008 | Financial Integrity | 0 lost updates or over-allocations in 1,000-iteration concurrent tests | Concurrency tests | Must |
| NFR-FIN-009 | Financial Integrity | 0 unexplained differences; alerts within 15 min of job completion | Integrity job tests | Must |
| NFR-FIN-010 | Financial Integrity | Single library; rounding test suite passes | Code review; unit tests | Must |
| NFR-FIN-011 | Financial Integrity | 100 % match in repeated runs | Regression tests | Must |
| NFR-REL-001 | Reliability and Availability | ≥ 99.5 % per month | Uptime monitoring | Must |
| NFR-REL-002 | Reliability and Availability | RPO ≤ 15 minutes | Restore tests with PITR | Must |
| NFR-REL-003 | Reliability and Availability | RTO ≤ 4 hours | DR exercise | Must |
| NFR-REL-004 | Reliability and Availability | 100 % error responses follow the schema | API contract tests | Must |
| NFR-REL-005 | Reliability and Availability | Verified by fault injection | Integration tests | Must |
| NFR-REL-006 | Reliability and Availability | Weekly automated restore check; quarterly full test | Backup verification logs | Must |
| NFR-REL-007 | Reliability and Availability | Alerts within 5 minutes of threshold breach | Alert tests | Must |
| NFR-REL-008 | Reliability and Availability | No silent job failures | Job failure tests | Must |
| NFR-USA-001 | Usability | Verified on navigation map | UX review | Must |
| NFR-USA-002 | Usability | Core screens usable at 1280, 1024 and 390 px widths | Responsive tests | Must |
| NFR-USA-003 | Usability | WCAG 2.2 AA (proposed target) on core screens | axe automated checks plus manual review | Should |
| NFR-USA-004 | Usability | 100 % of error codes have messages in both languages | Translation coverage check | Must |
| NFR-USA-005 | Usability | All listed actions confirmed | UI tests | Must |
| NFR-USA-006 | Usability | Terminology review sign-off | Review by accountant | Must |
| NFR-USA-007 | Usability | All list screens | UI tests | Must |
| NFR-USA-008 | Usability | All reports print without truncation on A4 | Print tests | Must |
| NFR-USA-009 | Usability | All list screens | UX review | Should |
| NFR-USA-010 | Usability | Completed by trained accountant in ≤ 2 minutes | Usability test | Should |
| NFR-MNT-001 | Maintainability | CI rule passes | CI | Must |
| NFR-MNT-002 | Maintainability | 0 type errors in CI | CI | Must |
| NFR-MNT-003 | Maintainability | 100 % endpoints documented | CI check | Must |
| NFR-MNT-004 | Maintainability | Coverage report in CI | CI | Must |
| NFR-MNT-005 | Maintainability | 0 manual schema changes | Migration audit | Must |
| NFR-MNT-006 | Maintainability | CI blocks violations | CI | Must |
| NFR-MNT-007 | Maintainability | Log review finds 0 sensitive values | Log scan | Must |
| NFR-MNT-008 | Maintainability | Docs updated in release checklist | Release review | Should |
| NFR-MNT-009 | Maintainability | No environment-specific builds | Review | Must |
| NFR-MNT-010 | Maintainability | Branch protection enabled | Repository settings | Must |
| NFR-SCL-001 | Scalability | Throughput +70 % with second instance | Scaling test | Should |
| NFR-SCL-002 | Scalability | Report targets met on 10 million-line test set | Performance test | Should |
| NFR-SCL-003 | Scalability | 100 companies, 500 branches supported in test data | Load test | Should |
| NFR-SCL-004 | Scalability | Statement time grows sub-linearly with line count | Performance test | Could |
| NFR-SCL-005 | Scalability | Architecture review | Review | Should |
| NFR-SCL-006 | Scalability | Configurable report data source | Deployment test | Could |
| NFR-CMP-001 | Compatibility | Core workflows pass on all | Cross-browser automated tests | Must |
| NFR-CMP-002 | Compatibility | Layout tests pass | Responsive tests | Must |
| NFR-CMP-003 | Compatibility | Manual verification | Compatibility test | Must |
| NFR-CMP-004 | Compatibility | Formats of at least 3 banks used by pilot users verified | Import tests | Must |
| NFR-BKP-001 | Backup and Recovery | Daily full; WAL continuous | Backup job monitoring | Must |
| NFR-BKP-002 | Backup and Recovery | Retention policy configured | Configuration review | Must |
| NFR-BKP-003 | Backup and Recovery | Encryption verified | Review | Must |
| NFR-BKP-004 | Backup and Recovery | Records of tests | Test reports | Must |
| NFR-BKP-005 | Backup and Recovery | Runbook approved | Review | Must |
| NFR-BKP-006 | Backup and Recovery | RACI documented; alert tested | Review | Must |
| NFR-LOC-001 | Localization | Round-trip and search tests on Khmer samples pass | Automated tests | Must |
| NFR-LOC-002 | Localization | 100 % strings translated | Coverage check | Must |
| NFR-LOC-003 | Localization | Format tests | Unit tests | Must |
| NFR-LOC-004 | Localization | Format tests | Unit tests | Must |
| NFR-LOC-005 | Localization | 20 reference documents verified visually by Khmer-reading reviewer | Visual test | Must |
| NFR-LOC-006 | Localization | All core statements bilingual | Review | Must |
| NFR-LOC-007 | Localization | Date boundary tests | Unit tests | Must |
| NFR-PRIV-001 | Data Privacy and Retention | Role tests pass | Functional tests | Must |
| NFR-PRIV-002 | Data Privacy and Retention | Policies configured and approved | Review | Must |
| NFR-PRIV-003 | Data Privacy and Retention | Retention job tests | Functional tests | Should |
| NFR-PRIV-004 | Data Privacy and Retention | Tests pass | Functional tests | Must |
| NFR-PRIV-005 | Data Privacy and Retention | Audit entries for 100 % of financial exports | Audit tests | Must |
| NFR-PRIV-006 | Data Privacy and Retention | Tests pass | Functional tests | Must |
| NFR-PRIV-007 | Data Privacy and Retention | Policy configured | Review | Must |
| NFR-PRIV-008 | Data Privacy and Retention | Policy configured | Review | Must |


# Appendix C. Illustrative Chart of Accounts
This structure is an example for configuration and testing only. It is not a prescribed Cambodian chart of accounts; the actual chart must be designed or confirmed by the organisation’s accountant (V-04).

| Code | Account | Type | Posting | Notes |
| 1000 | Assets | Asset | No | Header |
| 1100 | Cash and cash equivalents | Asset | No | Header; cash-flow class CASH for children |
| 1101 | Cash on hand – USD | Asset | Yes | Currency USD |
| 1102 | Cash on hand – KHR | Asset | Yes | Currency KHR |
| 1103 | Petty cash | Asset | Yes |  |
| 1110 | Bank – current account USD | Asset | Yes | Control (bank) |
| 1111 | Bank – current account KHR | Asset | Yes | Control (bank) |
| 1200 | Accounts receivable – trade | Asset | Yes | Control (AR) |
| 1210 | Allowance for doubtful debts | Asset | Yes | Contra (credit normal) |
| 1300 | Inventory | Asset | Yes | Control (inventory, if integrated) |
| 1400 | Prepayments | Asset | Yes |  |
| 1410 | Input tax recoverable | Asset | Yes | Tax control (if applicable, V-01) |
| 1420 | Supplier advances | Asset | Yes |  |
| 1500 | Property, plant and equipment – cost | Asset | No | Header |
| 1510 | Office equipment – cost | Asset | Yes | Control (fixed assets) |
| 1520 | Vehicles – cost | Asset | Yes | Control (fixed assets) |
| 1590 | Accumulated depreciation | Asset | Yes | Contra (credit normal) |
| 2000 | Liabilities | Liability | No | Header |
| 2100 | Accounts payable – trade | Liability | Yes | Control (AP) |
| 2150 | Accrued liabilities | Liability | Yes |  |
| 2160 | Employee claims payable | Liability | Yes |  |
| 2170 | Salaries payable | Liability | Yes | Sensitive |
| 2200 | Output tax payable | Liability | Yes | Tax control (V-01) |
| 2300 | Customer advances / unapplied receipts | Liability | Yes | D-20 |
| 2500 | Loans payable | Liability | Yes |  |
| 3000 | Equity | Equity | No | Header |
| 3100 | Owner’s capital | Equity | Yes |  |
| 3200 | Retained earnings | Equity | Yes | Year-end close target |
| 3300 | Owner’s drawings | Equity | Yes | Sensitive |
| 4000 | Revenue | Revenue | No | Header |
| 4100 | Sales revenue | Revenue | Yes |  |
| 4200 | Service revenue | Revenue | Yes |  |
| 4900 | Sales returns and allowances | Revenue | Yes | Contra (debit normal) |
| 5000 | Cost of sales | Expense | No | Header |
| 5100 | Cost of goods sold | Expense | Yes |  |
| 6000 | Operating expenses | Expense | No | Header |
| 6100 | Rent expense | Expense | Yes |  |
| 6200 | Utilities expense | Expense | Yes |  |
| 6300 | Salaries and wages | Expense | Yes | Sensitive |
| 6400 | Travel expense | Expense | Yes |  |
| 6500 | Repairs and maintenance | Expense | Yes |  |
| 6600 | Depreciation expense | Expense | Yes |  |
| 6700 | Bad debt expense | Expense | Yes |  |
| 6800 | Bank charges | Expense | Yes |  |
| 7000 | Other income | Revenue | No | Header |
| 7100 | Interest income | Revenue | Yes |  |
| 7300 | Realised FX gain | Revenue | Yes |  |
| 7400 | Unrealised FX gain | Revenue | Yes |  |
| 7500 | Gain on disposal of assets | Revenue | Yes |  |
| 8000 | Other expenses | Expense | No | Header |
| 8200 | Interest expense | Expense | Yes |  |
| 8310 | Realised FX loss | Expense | Yes |  |
| 8410 | Unrealised FX loss | Expense | Yes |  |
| 8500 | Loss on disposal of assets | Expense | Yes |  |
| 8900 | Rounding differences | Expense | Yes | Gains and losses may net in one account if configured |
| 9999 | Suspense | Asset | Yes | To be cleared monthly |
