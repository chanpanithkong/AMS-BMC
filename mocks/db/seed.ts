import type { Account } from "@/lib/api/types/accounts";
import type { BranchRef, CompanyRef, SessionUser } from "@/lib/api/types/auth";
import type { AppNotification, Currency, Department, Dimension, ExchangeRate, FiscalYear } from "@/lib/api/types/org";
import type { PeriodStatus } from "@/lib/api/types/common";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { ROLES, type RoleCode } from "@/lib/rbac/permissions";
import { accountId, seedAccounts } from "./coa";

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
}

export interface MockDb {
  companies: CompanyRef[];
  departments: Department[];
  fiscalYears: FiscalYear[];
  accounts: Account[];
  currencies: Currency[];
  exchangeRates: ExchangeRate[];
  dimensions: Dimension[];
  users: MockUser[];
  notifications: Record<string, AppNotification[]>;
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
      // base (USD) units per one KHR, 8 decimals (SRS §6.16). Integer maths, no floats in the result.
      rate: divideToFixed(1, khrPerUsd, 8),
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
    cash_account_ids: role === "CASHIER" ? [accountId("1101"), accountId("1103")] : [],
    password: DEMO_PASSWORD,
    company_ids: [COMPANY_ID],
    failed_attempts: 0,
    locked_until: null,
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
  return {
    companies: [
      {
        id: COMPANY_ID, code: "DEMO", name: "Demo Trading Co., Ltd.", name_km: "ក្រុមហ៊ុន ដេម៉ូ ត្រេឌីង ឯ.ក",
        base_currency: "USD", branches: BRANCHES,
      },
    ],
    departments: DEPARTMENTS.map(([code, name, name_km]) => ({
      id: `dep-${code}`, company_id: COMPANY_ID, code, name, name_km, is_active: true,
    })),
    fiscalYears: [seedFiscalYear()],
    accounts: seedAccounts(),
    currencies: [
      { code: "USD", name: "US dollar", name_km: "ដុល្លារអាមេរិក", symbol: "$", decimals: 2, is_active: true },
      { code: "KHR", name: "Cambodian riel", name_km: "រៀល", symbol: "៛", decimals: 0, is_active: true },
      { code: "THB", name: "Thai baht", name_km: "បាតថៃ", symbol: "฿", decimals: 2, is_active: true },
    ],
    exchangeRates: seedRates(),
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
