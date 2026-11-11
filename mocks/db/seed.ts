import type { Account } from "@/lib/api/types/accounts";
import type { BranchRef, CompanyRef, SessionUser } from "@/lib/api/types/auth";
import type { AppNotification, Currency, Department, Dimension, ExchangeRate, FiscalYear } from "@/lib/api/types/org";
import type { PeriodStatus } from "@/lib/api/types/common";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { ROLES, type RoleCode } from "@/lib/rbac/permissions";
import type { HistoryEvent } from "@/lib/api/types/common";
import type { JournalEntry } from "@/lib/api/types/journals";
import { seedAccounts } from "./coa";
import { seedAdmin, type AdminState } from "./admin";
import { seedAdvanced, type AdvancedState } from "./advanced";
import { seedArAp, type ArApState } from "./arap";
import { seedCashBank, type CashBankState } from "./cashbank";
import { seedJournals } from "./journals";

// Deterministic demo data (prompt §4). Phase 1 seeds organisation, users, chart of accounts,
// currencies, rates and notifications; transaction data is added with each module's phase.

export const MOCK_TODAY = process.env.NEXT_PUBLIC_MOCK_TODAY || "2027-04-05";
export const DEMO_PASSWORD = "Demo@1234";
/** TOTP code accepted for demo users with MFA (mock only). */
export const DEMO_OTP = "123456";
export const COMPANY_ID = "cmp-demo";

export interface MockUser extends SessionUser {
  password: string;
  company_ids: string[];
  failed_attempts: number;
  locked_until: number | null;
  /** Value limit for approve and post actions, in base currency; null = no limit (FR-RBAC-006). */
  approval_limit: string | null;
  /** Roles as assigned (custom roles included); `roles` holds their base roles for checks and menus. */
  assigned_roles: string[];
  status: "ACTIVE" | "INACTIVE";
  /** Empty = every branch of the user's companies (FR-RBAC-004). */
  branch_ids: string[];
  phone: string;
  last_login_at: string | null;
  /** A change of roles, scopes or limits waiting for the Owner (FR-RBAC-010). */
  pending_access: import("@/lib/api/types/admin").AdminUser["pending"];
  access_history: HistoryEvent[];
  access_version: number;
}

export interface MockDb extends CashBankState, ArApState, AdvancedState, AdminState {
  companies: CompanyRef[];
  departments: Department[];
  fiscalYears: FiscalYear[];
  accounts: Account[];
  currencies: Currency[];
  exchangeRates: ExchangeRate[];
  dimensions: Dimension[];
  users: MockUser[];
  notifications: Record<string, AppNotification[]>;
  journals: JournalEntry[];
  /** Next number of the JV sequence (assigned at posting, FR-GL-008). */
  journalSequence: number;
  accountHistory: Record<string, HistoryEvent[]>;
  /** Manual month-end checklist ticks: period id → item id → evidence. */
  checklist: Record<string, Record<string, { evidence: string; by: string }>>;
  /** Reduced separation-of-duties mode (SRS D-10); strict by default. */
  reducedSod: boolean;
}

const BRANCHES: BranchRef[] = [
  { id: "br-pp", code: "PP", name: "Phnom Penh HQ", name_km: "ការិយាល័យកណ្តាល ភ្នំពេញ" },
  { id: "br-sr", code: "SR", name: "Siem Reap", name_km: "សាខាសៀមរាប" },
  { id: "br-bb", code: "BB", name: "Battambang", name_km: "សាខាបាត់ដំបង" },
];

const DEPARTMENTS: [string, string, string][] = [
  ["ADMIN", "Admin", "រដ្ឋបាល"],
  ["SALES", "Sales", "ផ្នែកលក់"],
  ["OPS", "Operations", "ប្រតិបត្តិការ"],
  ["FIN", "Finance", "ហិរញ្ញវត្ថុ"],
];

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_KM = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];

const pad = (n: number) => String(n).padStart(2, "0");

function seedFiscalYear(): FiscalYear {
  const year = 2027;
  // Jan–Feb closed, Mar soft-closed, the rest open (prompt §4).
  const statusOf = (month: number): PeriodStatus => (month <= 2 ? "CLOSED" : month === 3 ? "SOFT_CLOSED" : "OPEN");
  return {
    id: "fy-2027",
    company_id: COMPANY_ID,
    name: "FY 2027",
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    status: "OPEN",
    periods: MONTHS_EN.map((name, i) => {
      const month = i + 1;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return {
        id: `per-${year}-${pad(month)}`,
        fiscal_year_id: "fy-2027",
        code: `${year}-${pad(month)}`,
        period_no: month,
        name: `${name} ${year}`,
        name_km: `${MONTHS_KM[i]} ${year}`,
        start_date: `${year}-${pad(month)}-01`,
        end_date: `${year}-${pad(month)}-${pad(lastDay)}`,
        status: statusOf(month),
      };
    }),
  };
}

/**
 * Daily KHR→USD rates from 1 January 2027 to the mock "today".
 * ILLUSTRATIVE values around 4,100 KHR per USD — not actual market or official rates (SRS §2.4).
 */
function seedRates(): ExchangeRate[] {
  const rates: ExchangeRate[] = [];
  const end = Date.parse(MOCK_TODAY + "T00:00:00Z");
  let day = 0;
  for (let t = Date.UTC(2027, 0, 1); t <= end; t += 86_400_000, day += 1) {
    const date = new Date(t).toISOString().slice(0, 10);
    const khrPerUsd = 4100 + ((day * 7) % 21) - 10;
    rates.push({
      id: `rate-${date}`,
      rate_date: date,
      from_currency: "KHR",
      to_currency: "USD",
      rate_type: "TRANSACTION",
      // base (USD) units per one KHR, 12 decimals (D-P2-07). Integer maths, no floats in the result.
      rate: divideToFixed(1, khrPerUsd, 12),
      source: "Illustrative — manual entry",
    });
  }
  return rates;
}

/** numerator / denominator as a fixed-decimal string, by long division on BigInt. */
function divideToFixed(numerator: number, denominator: number, places: number): string {
  const scale = BigInt(10) ** BigInt(places + 1);
  const scaled = (BigInt(numerator) * scale) / BigInt(denominator);
  const rounded = (scaled + BigInt(5)) / BigInt(10);
  const text = rounded.toString().padStart(places + 1, "0");
  return `${text.slice(0, -places)}.${text.slice(-places)}`;
}

const USER_ROWS: [RoleCode, string, string, string][] = [
  ["SYSADMIN", "sysadmin", "Sok Dara", "សុខ ដារ៉ា"],
  ["OWNER", "owner", "Chan Sopheap", "ចាន់ សុភាព"],
  ["FINMGR", "finmgr", "Keo Vannak", "កែវ វណ្ណៈ"],
  ["ACCT", "acct", "Ly Sreymom", "លី ស្រីមុំ"],
  ["APO", "apo", "Heng Pisey", "ហេង ពិសី"],
  ["ARO", "aro", "Chea Sokha", "ជា សុខា"],
  ["CASHIER", "cashier", "Nhem Bopha", "ញ៉ែម បុប្ផា"],
  ["AUDITOR", "auditor", "Tep Rithy", "ទេព រិទ្ធី"],
  ["DEPTMGR", "deptmgr", "Pich Samnang", "ពេជ្រ សំណាង"],
  ["READONLY", "readonly", "Ouk Chenda", "អ៊ុក ចិន្តា"],
];

/** Illustrative approval and posting limits in base currency (SRS D-09 leaves the real values open). */
const APPROVAL_LIMITS: Partial<Record<RoleCode, string | null>> = { OWNER: null, FINMGR: "50000", ACCT: "5000", DEPTMGR: "2000" };

/** MFA is mandatory for these roles by default (SRS D-17). */
const MFA_ROLES: RoleCode[] = ["OWNER", "FINMGR", "SYSADMIN"];

function seedUsers(): MockUser[] {
  return USER_ROWS.map(([role, username, full_name, full_name_km]) => ({
    id: `usr-${username}`,
    username,
    email: `${username}@demo.ams.test`,
    full_name,
    full_name_km,
    roles: [role],
    permissions: [...DEFAULT_ROLE_PERMISSIONS[role]],
    locale: "en",
    date_format: "DD/MM/YYYY",
    negative_style: "brackets",
    mfa_enabled: MFA_ROLES.includes(role),
    default_company_id: COMPANY_ID,
    department_ids: role === "DEPTMGR" ? ["dep-OPS"] : [],
    // Cash accounts in the cashier's custody (SRS §4.2 "own cash accounts").
    cash_account_ids: role === "CASHIER" ? ["cba-cash-usd", "cba-petty"] : [],
    password: DEMO_PASSWORD,
    company_ids: [COMPANY_ID],
    failed_attempts: 0,
    locked_until: null,
    approval_limit: APPROVAL_LIMITS[role] ?? "0",
    assigned_roles: [role],
    status: "ACTIVE" as const,
    branch_ids: [],
    phone: "",
    last_login_at: null,
    pending_access: null,
    access_history: [],
    access_version: 1,
  }));
}

function seedNotifications(users: MockUser[]): Record<string, AppNotification[]> {
  const at = (hoursAgo: number) => new Date(Date.parse(MOCK_TODAY + "T09:00:00+07:00") - hoursAgo * 3_600_000).toISOString();
  const base: Omit<AppNotification, "id">[] = [
    {
      title: "March 2027 is soft-closed", title_km: "ខែមីនា 2027 ត្រូវបានបិទបណ្តោះអាសន្ន",
      body: "Only users with permission can post into March 2027.",
      body_km: "មានតែអ្នកប្រើដែលមានសិទ្ធិប៉ុណ្ណោះ អាចកត់ត្រាចូលខែមីនា 2027។",
      created_at: at(2), read: false, link: "/accounting/periods",
    },
    {
      title: "Exchange rate entered for 05/04/2027", title_km: "បានបញ្ចូលអត្រាប្តូរប្រាក់សម្រាប់ថ្ងៃ 05/04/2027",
      body: "KHR/USD transaction rate is available (illustrative).",
      body_km: "អត្រាប្រតិបត្តិការ KHR/USD អាចប្រើបាន (ជាឧទាហរណ៍)។",
      created_at: at(5), read: false, link: "/fx/rates",
    },
    {
      title: "Welcome to the AMS demo", title_km: "សូមស្វាគមន៍មកកាន់ការបង្ហាញសាកល្បង AMS",
      body: "This environment runs on seeded mock data.",
      body_km: "បរិស្ថាននេះដំណើរការលើទិន្នន័យសាកល្បង។",
      created_at: at(30), read: true, link: null,
    },
  ];
  return Object.fromEntries(users.map((u) => [u.id, base.map((n, i) => ({ ...n, id: `ntf-${u.username}-${i + 1}` }))]));
}

export function createDb(): MockDb {
  const users = seedUsers();
  const accounts = seedAccounts();
  const fiscalYear = seedFiscalYear();
  const exchangeRates = seedRates();
  const person = (username: string) => {
    const user = users.find((u) => u.username === username)!;
    return { id: user.id, name: user.full_name };
  };
  const { journals, nextSequence } = seedJournals(accounts, fiscalYear.periods, exchangeRates, {
    acct: person("acct"), finmgr: person("finmgr"), owner: person("owner"),
  });
  const fullName = (username: string) => {
    const p = person(username);
    return { id: p.id, full_name: p.name };
  };
  const companyBase = { fiscalYears: [fiscalYear], accounts, journals, journalSequence: nextSequence };
  const cashBank = seedCashBank(companyBase, {
    acct: fullName("acct"), finmgr: fullName("finmgr"), cashier: fullName("cashier"), deptmgr: fullName("deptmgr"),
  });
  // Receivables and payables post after the cash and bank seed so that the seeded bank statements
  // and reconciliations (to 31 March) are unchanged; their receipts and payments are dated April.
  // The same store object, so that the journal sequence keeps counting.
  const arap = seedArAp(Object.assign(companyBase, { sequences: cashBank.sequences, exchangeRates }), {
    acct: fullName("acct"), finmgr: fullName("finmgr"), owner: fullName("owner"), aro: fullName("aro"), apo: fullName("apo"), deptmgr: fullName("deptmgr"),
  });
  // Fixed assets (with their depreciation runs), budgets and inventory, after the supplier invoices
  // whose asset lines become assets.
  const advanced = seedAdvanced(Object.assign(companyBase, { sequences: cashBank.sequences, invoices: arap.invoices }), {
    acct: fullName("acct"), finmgr: fullName("finmgr"), owner: fullName("owner"),
  });
  // Roles, sessions, settings and the audit history of everything seeded above (Phase 7).
  const admin = seedAdmin(users, journals);
  return {
    ...cashBank,
    ...arap,
    ...advanced,
    ...admin,
    journals,
    journalSequence: companyBase.journalSequence,
    accountHistory: {},
    checklist: {},
    reducedSod: false,
    companies: [
      {
        id: COMPANY_ID, code: "DEMO", name: "Demo Trading Co., Ltd.", name_km: "ក្រុមហ៊ុន ដេម៉ូ ត្រេឌីង ឯ.ក",
        base_currency: "USD", branches: BRANCHES,
      },
    ],
    departments: DEPARTMENTS.map(([code, name, name_km]) => ({
      id: `dep-${code}`, company_id: COMPANY_ID, code, name, name_km, is_active: true,
    })),
    fiscalYears: [fiscalYear],
    accounts,
    currencies: [
      { code: "USD", name: "US dollar", name_km: "ដុល្លារអាមេរិក", symbol: "$", decimals: 2, is_active: true },
      { code: "KHR", name: "Cambodian riel", name_km: "រៀល", symbol: "៛", decimals: 0, is_active: true },
      { code: "THB", name: "Thai baht", name_km: "បាតថៃ", symbol: "฿", decimals: 2, is_active: true },
    ],
    exchangeRates,
    dimensions: [
      {
        id: "dim-project", code: "PROJECT", name: "Project", name_km: "គម្រោង",
        values: [
          { id: "prj-001", code: "P-001", name: "Retail expansion", name_km: "ការពង្រីកលក់រាយ" },
          { id: "prj-002", code: "P-002", name: "Warehouse upgrade", name_km: "ការកែលម្អឃ្លាំង" },
          { id: "prj-003", code: "P-003", name: "Website relaunch", name_km: "ការបើកគេហទំព័រឡើងវិញ" },
        ],
      },
    ],
    users,
    notifications: seedNotifications(users),
  };
}

export const DEMO_USERS = USER_ROWS.map(([role, username, full_name, full_name_km]) => ({
  role, username, full_name, full_name_km, mfa: MFA_ROLES.includes(role),
}));

export { ROLES };
