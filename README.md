# AMS Web — Accounting Management System (front end)

Web user interface of the Accounting Management System described in `docs/AMS-SRS-001` (SRS v1.0, draft for review).
It is bilingual (English / Khmer) and multi-currency (USD, KHR and others). The backend is a separate FastAPI
service at `/api/v1`; this repository contains the front end and a mock backend for demos and tests.

**Status: Phases 1 to 6 (Foundation; General Ledger; Cash, Bank and Expenses; Receivables, Payables and Tax; Reporting and Dashboard; Fixed Assets, Budgets, FX Revaluation, Inventory and Imports) of 7.** See `docs/SCREEN_MAP.md` for what is built and `docs/DECISIONS.md` for
assumptions. No legal, tax or accounting-framework compliance is claimed.

## Run it

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:3000. With no `.env.local`, the app runs in **mock mode**: an in-browser mock backend (MSW)
with seeded demo data. The login page shows a "Sign in as…" picker with one user per role; every demo user has the
password `Demo@1234`, and Owner, Finance Manager and System Administrator also need the demo MFA code shown on the
verification step. Mock data resets on every full page reload.

### Live mode

Copy `.env.example` to `.env.local` and set:

```
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_BASE_URL=https://your-host/api/v1
```

The mock backend is then not loaded. `docs/API_CONTRACT.md` lists every endpoint and payload the UI expects,
including the assumptions made where the SRS gives no shape.

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` | `mock` or `live` |
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` | API base URL |
| `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES` | `30` | Sign-out after inactivity; a warning shows 60 seconds before |
| `NEXT_PUBLIC_CONFIRM_THRESHOLD` | `10000` | Amount above which critical actions need "I confirm" |
| `NEXT_PUBLIC_FEATURE_INVENTORY` | `false` | Shows the Inventory Integration menu |
| `NEXT_PUBLIC_MOCK_TODAY` | `2027-04-05` | Mock mode only: the business date of the demo data |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit and component tests (Vitest, MSW in Node) |
| `pnpm e2e` | End-to-end and accessibility tests (Playwright + axe) against mock mode; run `pnpm exec playwright install chromium` once |
| `pnpm i18n:check` | Fails when a message key or placeholder differs between `en.json` and `km.json` |

## Layout

```
app/[locale]/(auth)        sign-in, forgot and reset password
app/[locale]/(app)         shell (sidebar, header, breadcrumbs) and screens
components/                ui (shadcn), shell, auth, finance, data, workflow, feedback, files
lib/api                    typed client, errors, idempotency, endpoints, types
lib/auth, lib/rbac         session, permissions, role → menu matrix, <Can/>
lib/money, lib/format      decimal maths, formatting, amount in words, dates
mocks/                     MSW handlers and seeded demo data
messages/                  en.json, km.json, km.review.md (terms for an accountant to confirm)
tests/, e2e/               Vitest and Playwright tests
docs/                      SRS, build prompt, SRS mapping, decisions, screen map, API contract
proxy.ts                   locale redirect (Next.js 16 "proxy", formerly middleware)
```

## Conventions that matter

- **Money is never a JS number.** Amounts are decimal strings on the wire and `Decimal` objects in calculations
  (`lib/money`). Totals shown in forms are previews; the server's figures are authoritative.
- **The server decides.** The UI hides or disables actions by permission for usability only; the backend enforces
  permissions, limits and separation of duties on every request.
- **State changes are action endpoints** (`/submit`, `/approve`, `/post`, …) sent with an `Idempotency-Key`
  that is reused on retry. The UI never writes a `status` field.
- **The access token lives in memory only.** Nothing sensitive is written to `localStorage`.
- **Every string is translated.** Add keys to both `messages/en.json` and `messages/km.json`.
- **This is Next.js 16** with Cache Components. Read `AGENTS.md` and the guides in `node_modules/next/dist/docs/`
  before changing routing or rendering code.

Docker and deployment set-up are part of Phase 7.
