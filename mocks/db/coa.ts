import type { Account, AccountType, ControlModule } from "@/lib/api/types/accounts";

// Illustrative Chart of Accounts from SRS Appendix C. It is an example for configuration and testing
// only, not a prescribed Cambodian chart (V-04). Khmer names were written for the demo and are listed
// in messages/km.review.md for confirmation by a Khmer-speaking accountant.

type Flags = {
  control?: ControlModule;
  contra?: boolean;
  sensitive?: boolean;
  currency?: string;
  cash?: boolean;
};

// [code, parent code, English name, Khmer name, type, posting, flags]
type Row = [string, string | null, string, string, AccountType, boolean, Flags?];

const ROWS: Row[] = [
  ["1000", null, "Assets", "ទ្រព្យសកម្ម", "ASSET", false],
  ["1100", "1000", "Cash and cash equivalents", "សាច់ប្រាក់ និងសាច់ប្រាក់សមមូល", "ASSET", false],
  ["1101", "1100", "Cash on hand – USD", "សាច់ប្រាក់ក្នុងដៃ – ដុល្លារ", "ASSET", true, { currency: "USD", cash: true }],
  ["1102", "1100", "Cash on hand – KHR", "សាច់ប្រាក់ក្នុងដៃ – រៀល", "ASSET", true, { currency: "KHR", cash: true }],
  ["1103", "1100", "Petty cash", "សាច់ប្រាក់បន្តិចបន្តួច", "ASSET", true, { cash: true }],
  ["1110", "1100", "Bank – current account USD", "ធនាគារ – គណនីចរន្ត ដុល្លារ", "ASSET", true, { control: "BANK", currency: "USD", cash: true }],
  ["1111", "1100", "Bank – current account KHR", "ធនាគារ – គណនីចរន្ត រៀល", "ASSET", true, { control: "BANK", currency: "KHR", cash: true }],
  ["1200", "1000", "Accounts receivable – trade", "គណនីត្រូវទទួល – ពាណិជ្ជកម្ម", "ASSET", true, { control: "AR" }],
  ["1210", "1000", "Allowance for doubtful debts", "សំវិធានធនបំណុលសង្ស័យ", "ASSET", true, { contra: true }],
  ["1300", "1000", "Inventory", "សន្និធិ", "ASSET", true, { control: "INVENTORY" }],
  ["1400", "1000", "Prepayments", "បុរេប្រទាន", "ASSET", true],
  ["1410", "1000", "Input tax recoverable", "ពន្ធធាតុចូលអាចទាមទារបាន", "ASSET", true, { control: "TAX" }],
  ["1420", "1000", "Supplier advances", "បុរេប្រទានដល់អ្នកផ្គត់ផ្គង់", "ASSET", true],
  ["1500", "1000", "Property, plant and equipment – cost", "ទ្រព្យ រោងចក្រ និងបរិក្ខារ – ថ្លៃដើម", "ASSET", false],
  ["1510", "1500", "Office equipment – cost", "បរិក្ខារការិយាល័យ – ថ្លៃដើម", "ASSET", true, { control: "FIXED_ASSETS" }],
  ["1520", "1500", "Vehicles – cost", "យានយន្ត – ថ្លៃដើម", "ASSET", true, { control: "FIXED_ASSETS" }],
  ["1590", "1500", "Accumulated depreciation", "រំលស់បង្គរ", "ASSET", true, { contra: true }],
  ["2000", null, "Liabilities", "បំណុល", "LIABILITY", false],
  ["2100", "2000", "Accounts payable – trade", "គណនីត្រូវសង – ពាណិជ្ជកម្ម", "LIABILITY", true, { control: "AP" }],
  ["2150", "2000", "Accrued liabilities", "បំណុលបង្គរ", "LIABILITY", true],
  ["2160", "2000", "Employee claims payable", "សំណងបុគ្គលិកត្រូវសង", "LIABILITY", true],
  ["2170", "2000", "Salaries payable", "ប្រាក់បៀវត្សត្រូវសង", "LIABILITY", true, { sensitive: true }],
  ["2200", "2000", "Output tax payable", "ពន្ធធាតុចេញត្រូវបង់", "LIABILITY", true, { control: "TAX" }],
  ["2300", "2000", "Customer advances / unapplied receipts", "បុរេប្រទានពីអតិថិជន / បង្កាន់ដៃមិនទាន់កាត់កង", "LIABILITY", true],
  ["2500", "2000", "Loans payable", "ប្រាក់កម្ចីត្រូវសង", "LIABILITY", true],
  ["3000", null, "Equity", "មូលធន", "EQUITY", false],
  ["3100", "3000", "Owner’s capital", "ដើមទុនម្ចាស់", "EQUITY", true],
  ["3200", "3000", "Retained earnings", "ចំណេញរក្សាទុក", "EQUITY", true],
  ["3300", "3000", "Owner’s drawings", "ការដកប្រាក់របស់ម្ចាស់", "EQUITY", true, { sensitive: true, contra: true }],
  ["4000", null, "Revenue", "ចំណូល", "REVENUE", false],
  ["4100", "4000", "Sales revenue", "ចំណូលពីការលក់", "REVENUE", true],
  ["4200", "4000", "Service revenue", "ចំណូលពីសេវាកម្ម", "REVENUE", true],
  ["4900", "4000", "Sales returns and allowances", "ការបង្វិលទំនិញលក់ និងការបញ្ចុះតម្លៃ", "REVENUE", true, { contra: true }],
  ["5000", null, "Cost of sales", "ថ្លៃដើមលក់", "EXPENSE", false],
  ["5100", "5000", "Cost of goods sold", "ថ្លៃដើមទំនិញបានលក់", "EXPENSE", true],
  ["6000", null, "Operating expenses", "ចំណាយប្រតិបត្តិការ", "EXPENSE", false],
  ["6100", "6000", "Rent expense", "ចំណាយជួល", "EXPENSE", true],
  ["6200", "6000", "Utilities expense", "ចំណាយទឹកភ្លើង", "EXPENSE", true],
  ["6300", "6000", "Salaries and wages", "ប្រាក់បៀវត្ស និងប្រាក់ឈ្នួល", "EXPENSE", true, { sensitive: true }],
  ["6400", "6000", "Travel expense", "ចំណាយធ្វើដំណើរ", "EXPENSE", true],
  ["6500", "6000", "Repairs and maintenance", "ចំណាយជួសជុល និងថែទាំ", "EXPENSE", true],
  ["6600", "6000", "Depreciation expense", "ចំណាយរំលស់", "EXPENSE", true],
  ["6700", "6000", "Bad debt expense", "ចំណាយបំណុលអាក្រក់", "EXPENSE", true],
  ["6800", "6000", "Bank charges", "កម្រៃសេវាធនាគារ", "EXPENSE", true],
  ["7000", null, "Other income", "ចំណូលផ្សេងៗ", "REVENUE", false],
  ["7100", "7000", "Interest income", "ចំណូលការប្រាក់", "REVENUE", true],
  ["7300", "7000", "Realised FX gain", "ចំណេញពីអត្រាប្តូរប្រាក់ដែលបានសម្រេច", "REVENUE", true],
  ["7400", "7000", "Unrealised FX gain", "ចំណេញពីអត្រាប្តូរប្រាក់មិនទាន់សម្រេច", "REVENUE", true],
  ["7500", "7000", "Gain on disposal of assets", "ចំណេញពីការលក់ទ្រព្យសកម្ម", "REVENUE", true],
  ["8000", null, "Other expenses", "ចំណាយផ្សេងៗ", "EXPENSE", false],
  ["8200", "8000", "Interest expense", "ចំណាយការប្រាក់", "EXPENSE", true],
  ["8310", "8000", "Realised FX loss", "ខាតពីអត្រាប្តូរប្រាក់ដែលបានសម្រេច", "EXPENSE", true],
  ["8410", "8000", "Unrealised FX loss", "ខាតពីអត្រាប្តូរប្រាក់មិនទាន់សម្រេច", "EXPENSE", true],
  ["8500", "8000", "Loss on disposal of assets", "ខាតពីការលក់ទ្រព្យសកម្ម", "EXPENSE", true],
  ["8900", "8000", "Rounding differences", "លម្អៀងពីការបង្គត់", "EXPENSE", true],
  ["9999", null, "Suspense", "គណនីបណ្តោះអាសន្ន", "ASSET", true],
];

function category(code: string, type: AccountType): string {
  const n = Number(code);
  if (type === "ASSET") return n < 1500 ? "Current assets" : n < 2000 ? "Non-current assets" : "Suspense";
  if (type === "LIABILITY") return n < 2500 ? "Current liabilities" : "Non-current liabilities";
  if (type === "EQUITY") return "Equity";
  if (type === "REVENUE") return n < 7000 ? "Operating revenue" : "Other income";
  return n < 6000 ? "Cost of sales" : n < 8000 ? "Operating expenses" : "Other expenses";
}

export const accountId = (code: string) => `acc-${code}`;

export function seedAccounts(): Account[] {
  return ROWS.map(([code, parent, name, name_km, type, posting, flags = {}]) => {
    const debitNormal = type === "ASSET" || type === "EXPENSE";
    const normal = debitNormal !== Boolean(flags.contra) ? "DEBIT" : "CREDIT";
    return {
      id: accountId(code),
      code,
      name,
      name_km,
      type,
      category: category(code, type),
      parent_id: parent ? accountId(parent) : null,
      normal_balance: normal,
      is_posting: posting,
      is_control: Boolean(flags.control),
      control_module: flags.control ?? null,
      is_contra: Boolean(flags.contra),
      is_sensitive: Boolean(flags.sensitive),
      currency: flags.currency ?? null,
      cash_flow_class: flags.cash ? "CASH" : null,
      is_active: true,
      version: 1,
    };
  });
}
