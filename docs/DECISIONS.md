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

## API assumptions

Listed in `docs/API_CONTRACT.md` under "Assumptions" (A-01 to A-10). Each is marked `// ASSUMPTION` in the code.

## Open SRS items that affect the UI

| Item | Effect on the UI | Current behaviour |
|---|---|---|
| D-04 Fiscal year | Period pickers, period 13 | 12 periods |
| D-09 Roles, permissions, limits | `lib/rbac/default-roles.ts`, mock users | §4.3 matrix as proposed |
| D-10 Reduced-SoD mode | `SoDIndicator` has a `reducedMode` state | Strict by default |
| D-13 Budget control (warn or block) | Budget panels (Phase 3/4) | Not built yet |
| D-17 MFA policy | MFA step for OWNER, FINMGR, SYSADMIN | As proposed |
| D-18 Rounding | Preview totals use half-up | As proposed; server is authoritative |
| V-01 Tax codes | Verified / Unverified badge exists | Tax screens in Phase 4 |
| V-02 Invoice content and numbering | Document templates | Phase 4 |
| V-04 Chart of accounts | Appendix C is illustrative | Seeded as an example only |
| V-10 Exchange-rate source | Seeded rates are labelled illustrative | ~4,100 KHR/USD, not real rates |

## Differences from the SRS still to settle

From `docs/SRS_MAPPING.md` §2: items 3 (six reports without a full layout), 5 (`/reject` vs `/approve` with `action`),
7 (A5 vouchers, COPY mark, signature blocks, `print` route group) and 8 (configurable aging buckets) are not
decided yet. They matter from Phase 2 (item 5) and Phase 3–5 (the others).
