import { faker } from "@faker-js/faker";
import Decimal from "decimal.js";
import type {
  CreditNote, Invoice, InvoiceLine, Party, PartyPayment, TaxCode,
} from "@/lib/api/types/arap";
import type { ApprovalStep, HistoryEvent } from "@/lib/api/types/common";
import type { JournalLineInput } from "@/lib/api/types/journals";
import type { ExchangeRate } from "@/lib/api/types/org";
import { addDays, documentTotals, lineAmounts, rateOn } from "@/lib/money/invoice";
import { line, postJournal, type PostingStore } from "./posting";

// Phase 4 demo data and shared ledger rules for receivables, payables and tax codes.
// Names, amounts, tax rates and bank details are ILLUSTRATIVE (SRS §2.4) — the tax codes are not a
// statement of Cambodian tax law and must be confirmed by a qualified tax adviser (SRS V-01).

export type StoredParty = Omit<Party, "balance" | "overdue" | "unapplied">;

export interface ArApState {
  taxCodes: TaxCode[];
  parties: StoredParty[];
  invoices: Invoice[];
  creditNotes: CreditNote[];
  partyPayments: PartyPayment[];
  /** Posting with an unverified tax code is blocked (BR-TAX-002, AT-TAX-03). */
  blockUnverifiedTax: boolean;
}

export const AR_CONTROL = "acc-1200";
export const AP_CONTROL = "acc-2100";
export const CUSTOMER_ADVANCES = "acc-2300";
export const SALES_RETURNS = "acc-4900";
const FX_GAIN = "acc-7300";
const FX_LOSS = "acc-8310";
const ROUNDING = "acc-8900";

interface Person {
  id: string;
  full_name: string;
}

// ---------------------------------------------------------------- shared rules

const dpOf = (currency: string) => (currency === "KHR" ? 0 : 2);
export const baseOf = (amount: Decimal.Value, rate: Decimal.Value) => new Decimal(amount).times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Tax terms of a code on a date, or null for no tax. */
export function taxTerms(codes: TaxCode[], id: string | null, date: string) {
  const code = codes.find((c) => c.id === id);
  if (!code) return null;
  const rate = rateOn(code.rates, date);
  return { code, rate: rate?.rate ?? "0", method: code.method };
}

/** Recalculate lines and totals from quantities, prices, discounts and tax codes in force on the date. */
export function priceDocument(doc: { lines: InvoiceLine[]; date: string; currency: string; rate: string }, codes: TaxCode[]) {
  const amounts = doc.lines.map((l) => {
    const terms = taxTerms(codes, l.tax_code_id, doc.date);
    const a = lineAmounts(l, terms, doc.currency);
    const dp = dpOf(doc.currency);
    Object.assign(l, {
      quantity: new Decimal(l.quantity || 0).toFixed(), unit_price: new Decimal(l.unit_price || 0).toFixed(), discount: a.discount.toFixed(dp),
      tax_rate: terms ? new Decimal(terms.rate).toFixed() : "0", net: a.net.toFixed(dp), tax: a.tax.toFixed(dp), total: a.total.toFixed(dp),
    });
    return a;
  });
  const totals = documentTotals(amounts);
  const dp = dpOf(doc.currency);
  return {
    subtotal: totals.subtotal.toFixed(dp), discount: totals.discount.toFixed(dp), tax: totals.tax.toFixed(dp), total: totals.total.toFixed(dp),
    total_base: baseOf(totals.total, doc.rate).toFixed(2),
  };
}

/** Add a base-currency rounding line so that the journal balances in base (BR-FX-005). */
export function withRounding(lines: JournalLineInput[]): JournalLineInput[] {
  const diff = lines.reduce((s, l) => s.plus(baseOf(l.debit || 0, l.rate || 1)).minus(baseOf(l.credit || 0, l.rate || 1)), new Decimal(0));
  if (diff.isZero()) return lines;
  return [...lines, diff.gt(0) ? line(ROUNDING, "0", diff.toFixed(2), { description: "Rounding" }) : line(ROUNDING, diff.abs().toFixed(2), "0", { description: "Rounding" })];
}

/** Lines grouped by tax account: { account → tax amount }. */
function taxByAccount(doc: { lines: InvoiceLine[] }, codes: TaxCode[]) {
  const map = new Map<string, Decimal>();
  for (const l of doc.lines) {
    const code = codes.find((c) => c.id === l.tax_code_id);
    if (!code?.account_id || new Decimal(l.tax ?? 0).isZero()) continue;
    map.set(code.account_id, (map.get(code.account_id) ?? new Decimal(0)).plus(l.tax ?? 0));
  }
  return map;
}

/** AT-AR-04: Dr AR control total; Cr revenue net per line; Cr output tax. AP mirrors it. */
export function invoiceJournalLines(inv: Invoice, codes: TaxCode[]): JournalLineInput[] {
  const dp = dpOf(inv.currency);
  const cur = { currency: inv.currency, rate: inv.rate };
  const desc = `${inv.number ?? ""} ${inv.party_name}`.trim();
  const sales = inv.kind === "AR";
  const control = line(sales ? AR_CONTROL : AP_CONTROL, sales ? inv.total : "0", sales ? "0" : inv.total, { ...cur, description: desc });
  const body = inv.lines.map((l) => {
    const amount = new Decimal(l.net ?? 0).toFixed(dp);
    return line(l.account_id!, sales ? "0" : amount, sales ? amount : "0", { ...cur, description: l.description, department_id: l.department_id, branch_id: l.branch_id });
  });
  const tax = [...taxByAccount(inv, codes)].map(([account, amount]) =>
    line(account, sales ? "0" : amount.toFixed(dp), sales ? amount.toFixed(dp) : "0", { ...cur, description: `Tax ${desc}` }));
  return withRounding(sales ? [control, ...body, ...tax] : [...body, ...tax, control]);
}

/** Credit note: reverses revenue (to the line account, sales returns by default) and tax at the invoice rate. */
export function creditNoteJournalLines(cn: CreditNote, inv: Invoice, codes: TaxCode[]): JournalLineInput[] {
  const dp = dpOf(cn.currency);
  const cur = { currency: cn.currency, rate: inv.rate };
  const desc = `${cn.number ?? ""} credit to ${inv.number}`;
  return withRounding([
    ...cn.lines.map((l) => line(l.account_id ?? SALES_RETURNS, new Decimal(l.net ?? 0).toFixed(dp), "0", { ...cur, description: l.description, department_id: l.department_id, branch_id: l.branch_id })),
    ...[...taxByAccount(cn, codes)].map(([account, amount]) => line(account, amount.toFixed(dp), "0", { ...cur, description: `Tax ${desc}` })),
    line(AR_CONTROL, "0", cn.total, { ...cur, description: desc }),
  ]);
}

/**
 * Receipt or payment journal. Allocations clear the control account at each invoice's own rate; the
 * cash side uses the settlement rate; the base difference is realised FX (BR-FX-003). Receipts put
 * any unallocated amount to customer advances (BR-AR-006).
 */
export function settlementJournalLines(
  p: { kind: "RECEIPT" | "PAYMENT"; amount: string; currency: string; rate: string; number: string },
  cashGl: string, allocations: { invoice: Invoice; amount: string }[], unapplied: string, unappliedFromAdvances = false,
): JournalLineInput[] {
  const receipt = p.kind === "RECEIPT";
  const cur = { currency: p.currency };
  const lines: JournalLineInput[] = [];
  const cashAmount = unappliedFromAdvances ? null : p.amount;
  if (cashAmount) lines.push(line(cashGl, receipt ? cashAmount : "0", receipt ? "0" : cashAmount, { ...cur, rate: p.rate, description: p.number }));
  if (unappliedFromAdvances) {
    const used = allocations.reduce((s, a) => s.plus(a.amount), new Decimal(0)).toFixed(dpOf(p.currency));
    lines.push(line(CUSTOMER_ADVANCES, used, "0", { ...cur, rate: p.rate, description: `${p.number} applied` }));
  }
  for (const a of allocations) {
    const ctl = receipt ? AR_CONTROL : AP_CONTROL;
    lines.push(line(ctl, receipt ? "0" : a.amount, receipt ? a.amount : "0", { ...cur, rate: a.invoice.rate, description: `${p.number} → ${a.invoice.number}` }));
  }
  if (new Decimal(unapplied).gt(0)) lines.push(line(CUSTOMER_ADVANCES, "0", unapplied, { ...cur, rate: p.rate, description: `${p.number} unapplied` }));
  // Realised FX: whatever base difference remains after the control lines.
  const diff = lines.reduce((s, l) => s.plus(baseOf(l.debit || 0, l.rate || 1)).minus(baseOf(l.credit || 0, l.rate || 1)), new Decimal(0));
  if (!diff.isZero()) lines.push(diff.gt(0) ? line(FX_GAIN, "0", diff.toFixed(2), { description: "Realised FX" }) : line(FX_LOSS, diff.abs().toFixed(2), "0", { description: "Realised FX" }));
  return lines;
}

/** Outstanding amount and status after settlements (BR-AR-001, BR-AR-002). */
export function refreshInvoice(inv: Invoice) {
  const dp = dpOf(inv.currency);
  const settled = inv.settlements.reduce((s, x) => s.plus(x.amount), new Decimal(0));
  const outstanding = new Decimal(inv.total).minus(settled);
  inv.outstanding = outstanding.toFixed(dp);
  if (!inv.posted) return;
  if (outstanding.lte(0)) inv.status = inv.settlements.every((s) => s.doc_type === "CREDIT_NOTE") ? "CREDITED" : "PAID";
  else inv.status = inv.settlements.length ? "PARTIALLY_PAID" : "OPEN";
}

/** Outstanding in base: total at the invoice rate less each settlement at the invoice rate. */
export function outstandingBase(inv: Invoice): Decimal {
  return inv.settlements.reduce((s, x) => s.minus(baseOf(x.amount, inv.rate)), new Decimal(inv.total_base));
}

// ---------------------------------------------------------------- seed

const CUSTOMER_PREFIX: [string, string][] = [
  ["Mekong", "មេគង្គ"], ["Angkor", "អង្គរ"], ["Tonle", "ទន្លេ"], ["Bayon", "បាយ័ន"], ["Kampot", "កំពត"],
  ["Kep", "កែប"], ["Sokha", "សុខា"], ["Lotus", "ឈូក"], ["Apsara", "អប្សរា"], ["Naga", "នាគ"],
];
const CUSTOMER_SUFFIX: [string, string, string][] = [
  ["Trading", "ពាណិជ្ជកម្ម", "acc-4100"], ["Retail", "លក់រាយ", "acc-4100"], ["Hotel", "សណ្ឋាគារ", "acc-4200"], ["Mart", "ម៉ាត", "acc-4100"],
  ["Logistics", "ដឹកជញ្ជូន", "acc-4200"], ["Construction", "សំណង់", "acc-4100"], ["Pharmacy", "ឱសថស្ថាន", "acc-4100"], ["Café", "ហាងកាហ្វេ", "acc-4200"],
];
const SUPPLIER_PREFIX: [string, string][] = [["Golden", "មាស"], ["Royal", "រាជ"], ["Star", "ផ្កាយ"], ["Asia", "អាស៊ី"], ["Sunrise", "ថ្ងៃរះ"], ["Diamond", "ពេជ្រ"]];
const SUPPLIER_SUFFIX: [string, string, string][] = [
  ["Supplies", "ផ្គត់ផ្គង់", "acc-1300"], ["Electric", "អគ្គិសនី", "acc-6200"], ["Printing", "បោះពុម្ព", "acc-6500"], ["Transport", "ដឹកជញ្ជូន", "acc-6400"],
  ["Paper", "ក្រដាស", "acc-6500"], ["Steel", "ដែក", "acc-1300"], ["Furniture", "គ្រឿងសង្ហារិម", "acc-1510"], ["IT Solutions", "ដំណោះស្រាយព័ត៌មានវិទ្យា", "acc-6500"],
  ["Packaging", "វេចខ្ចប់", "acc-1300"], ["Motors", "ម៉ូតូ", "acc-6500"],
];
const CITIES = ["Phnom Penh", "Siem Reap", "Battambang", "Sihanoukville", "Kampot"];
const BANKS = ["ABA Bank", "ACLEDA Bank", "Canadia Bank", "Wing Bank"];
const PRODUCTS: [string, boolean][] = [
  ["Rice 50 kg bags", false], ["Cooking oil 5 L", false], ["Bottled water, cases", false], ["Delivery service", true],
  ["Installation service", true], ["Consulting hours", true], ["Hotel linen sets", false], ["Coffee beans 1 kg", false],
];
const OPENING_AR = ["4800.00", "3650.50", "2980.00", "1875.25", "2420.00", "3110.00", "1560.75", "2750.00", "980.00", "3340.00", "1295.50", "2210.00", "1785.00", "2635.00", "1420.00", "1990.00", "1180.00"];
const OPENING_AP = ["3200.00", "2875.40", "1950.00", "4100.00", "1325.60", "2480.00", "1760.00", "3050.00", "990.00", "2240.00", "1615.00", "2780.00", "1430.00"];

function taxCodes(acct: Person, owner: Person): TaxCode[] {
  const verified = { verification: "VERIFIED" as const, verified_by: owner.full_name, verified_at: "2026-12-15T03:00:00.000Z" };
  const h = (id: string): HistoryEvent[] => [{ id: `${id}-h1`, at: "2026-12-10T03:00:00.000Z", user_name: acct.full_name, action: "CREATED" }];
  const code = (c: Omit<TaxCode, "current_rate" | "history" | "version" | "is_active">): TaxCode => ({ ...c, is_active: true, current_rate: "0", history: h(c.id), version: 1 });
  return [
    code({ id: "tax-vat10", code: "VAT10", name: "Output tax 10 % (illustrative)", name_km: "ពន្ធធាតុចេញ 10 % (ឧទាហរណ៍)", kind: "OUTPUT", method: "EXCLUSIVE", account_id: "acc-2200", account_code: "2200", ...verified, verification_note: "Demo rate; confirm with a tax adviser.", rates: [{ rate: "10", effective_from: "2020-01-01", effective_to: null }] }),
    code({ id: "tax-vat10-inc", code: "VAT10-INC", name: "Output tax 10 % included in price (illustrative)", name_km: "ពន្ធធាតុចេញ 10 % រួមក្នុងតម្លៃ (ឧទាហរណ៍)", kind: "OUTPUT", method: "INCLUSIVE", account_id: "acc-2200", account_code: "2200", ...verified, verification_note: "Demo rate; confirm with a tax adviser.", rates: [{ rate: "10", effective_from: "2020-01-01", effective_to: null }] }),
    code({ id: "tax-vat10-in", code: "VAT10-IN", name: "Input tax 10 % (illustrative)", name_km: "ពន្ធធាតុចូល 10 % (ឧទាហរណ៍)", kind: "INPUT", method: "EXCLUSIVE", account_id: "acc-1410", account_code: "1410", ...verified, verification_note: "Demo rate; confirm with a tax adviser.", rates: [{ rate: "10", effective_from: "2020-01-01", effective_to: null }] }),
    code({ id: "tax-exempt", code: "EXEMPT", name: "No tax", name_km: "គ្មានពន្ធ", kind: "EXEMPT", method: "EXCLUSIVE", account_id: null, account_code: null, ...verified, verification_note: "", rates: [{ rate: "0", effective_from: "2020-01-01", effective_to: null }] }),
    code({
      id: "tax-acc", code: "ACC", name: "Accommodation tax (illustrative, unverified)", name_km: "ពន្ធស្នាក់នៅ (ឧទាហរណ៍ មិនទាន់ផ្ទៀងផ្ទាត់)", kind: "OUTPUT", method: "EXCLUSIVE",
      account_id: "acc-2200", account_code: "2200", verification: "UNVERIFIED", verified_by: null, verified_at: null, verification_note: "Rate and scope not yet confirmed by a tax adviser.",
      rates: [{ rate: "3", effective_from: "2025-01-01", effective_to: "2026-12-31" }, { rate: "2", effective_from: "2027-01-01", effective_to: null }],
    }),
  ];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "");

function parties(): StoredParty[] {
  const list: StoredParty[] = [];
  for (let i = 0; i < 40; i += 1) {
    const [p, pKm] = CUSTOMER_PREFIX[i % 10];
    const [s, sKm, account] = CUSTOMER_SUFFIX[(Math.floor(i / 10) + i) % 8];
    const name = `${p} ${s}`;
    list.push({
      id: `cus-${String(i + 1).padStart(4, "0")}`, kind: "CUSTOMER", code: `C-${String(i + 1).padStart(4, "0")}`, name, name_km: `${sKm} ${pKm}`,
      tax_id: `K00${(i % 9) + 1}-90${faker.string.numeric(7)}`, email: `accounts@${slug(name)}.example`, phone: `+855 ${faker.helpers.arrayElement(["12", "15", "17", "89"])} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`,
      address: `${faker.number.int({ min: 1, max: 400 })} Street ${faker.number.int({ min: 2, max: 600 })}, ${CITIES[i % CITIES.length]}`,
      currency: i % 9 === 4 ? "KHR" : "USD", payment_terms_days: [30, 15, 30, 45, 30][i % 5], credit_limit: i % 6 === 5 ? null : String((5 + (i % 4) * 5) * 1000),
      status: i === 39 ? "INACTIVE" : "ACTIVE", contacts: [{ name: faker.person.fullName(), role: "Accounts", phone: `+855 12 ${faker.string.numeric(3)} ${faker.string.numeric(3)}`, email: `ap@${slug(name)}.example` }],
      bank: null, default_account_id: account, notes: "", version: 1,
    });
  }
  for (let i = 0; i < 30; i += 1) {
    const [p, pKm] = SUPPLIER_PREFIX[i % 6];
    const [s, sKm, account] = SUPPLIER_SUFFIX[(Math.floor(i / 6) + i) % 10];
    const name = `${p} ${s}`;
    const number = `${faker.string.numeric(3)} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`;
    list.push({
      id: `sup-${String(i + 1).padStart(4, "0")}`, kind: "SUPPLIER", code: `S-${String(i + 1).padStart(4, "0")}`, name, name_km: `${sKm} ${pKm}`,
      tax_id: `L00${(i % 9) + 1}-10${faker.string.numeric(7)}`, email: `billing@${slug(name)}.example`, phone: `+855 ${faker.helpers.arrayElement(["23", "12", "16", "96"])} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`,
      address: `${faker.number.int({ min: 1, max: 400 })} Street ${faker.number.int({ min: 2, max: 600 })}, ${CITIES[(i + 2) % CITIES.length]}`,
      currency: "USD", payment_terms_days: [30, 30, 15, 45, 60][i % 5], credit_limit: null,
      // S-0004 is still a draft, S-0005 is blocked (BR-AP-004 pays verified suppliers only).
      status: i === 3 ? "DRAFT" : i === 4 ? "BLOCKED" : "VERIFIED",
      contacts: [{ name: faker.person.fullName(), role: "Sales", phone: `+855 12 ${faker.string.numeric(3)} ${faker.string.numeric(3)}`, email: `sales@${slug(name)}.example` }],
      bank: { bank_name: BANKS[i % BANKS.length], account_name: name, account_number: number, pending: null },
      default_account_id: account, notes: "", version: 1,
    });
  }
  return list;
}

const step = (role: string, approver: Person, at: string): ApprovalStep => ({ step: 1, role, status: "APPROVED", approver_name: approver.full_name, acted_at: at, comment: null });

export function seedArAp(
  store: PostingStore & { sequences: Record<string, number>; exchangeRates: ExchangeRate[] },
  people: { acct: Person; finmgr: Person; owner: Person; aro: Person; apo: Person; deptmgr: Person },
): ArApState {
  faker.seed(4027);
  const codes = taxCodes(people.acct, people.owner);
  for (const c of codes) c.current_rate = rateOn(c.rates, "2027-04-05")?.rate ?? "0";
  const all = parties();
  const state: ArApState = { taxCodes: codes, parties: all, invoices: [], creditNotes: [], partyPayments: [], blockUnverifiedTax: true };
  const customers = all.filter((p) => p.kind === "CUSTOMER");
  const suppliers = all.filter((p) => p.kind === "SUPPLIER");
  const opening = store.journals.find((j) => j.type === "OPENING");
  // Sales journals seeded in Phase 2 already use INV-2027-NNNNNN numbers for cash sales.
  const usedInv = store.journals.map((j) => /^INV-2027-(\d+)$/.exec(j.source_no ?? "")?.[1]).filter(Boolean).map(Number);
  Object.assign(store.sequences, { INV: Math.max(0, ...usedInv) + 1, BILL: 1, RV: 1, SPV: 1, CN: 1 });
  const take = (prefix: string, date: string) => {
    const n = store.sequences[prefix];
    store.sequences[prefix] = n + 1;
    return `${prefix}-${date.slice(0, 4)}-${String(n).padStart(6, "0")}`;
  };
  const rateOf = (currency: string, date: string) =>
    currency === "USD" ? "1" : store.exchangeRates.find((r) => r.from_currency === currency && r.rate_date === date)?.rate ?? store.exchangeRates[0].rate;
  const at = (date: string, hour = 9) => `${date}T${String(hour - 7).padStart(2, "0")}:00:00.000Z`;
  let seq = 0;

  const blank = (kind: "AR" | "AP", party: StoredParty, date: string, preparer: Person): Invoice => {
    seq += 1;
    return {
      id: `${kind === "AR" ? "inv" : "bill"}-${String(seq).padStart(3, "0")}`, kind, number: null, supplier_invoice_no: null, party_id: party.id, party_code: party.code,
      party_name: party.name, party_name_km: party.name_km, status: "DRAFT", posted: false, date, received_date: kind === "AP" ? date : null,
      due_date: addDays(date, party.payment_terms_days), terms_days: party.payment_terms_days, currency: party.currency, rate: rateOf(party.currency, date),
      lines: [], subtotal: "0", discount: "0", tax: "0", total: "0", total_base: "0", outstanding: "0", settlements: [], reference: "", notes: "",
      attachments: [], approval_steps: [], rejection_comment: null, duplicate_reason: null, is_opening: false, journal_id: null, journal_no: null,
      preparer_id: preparer.id, preparer_name: preparer.full_name, history: [{ id: `inv-s${seq}-h1`, at: at(date, 9), user_name: preparer.full_name, action: "CREATED" }], version: 1,
    };
  };
  const price = (inv: Invoice) => Object.assign(inv, priceDocument(inv, codes));
  const post = (inv: Invoice, poster: Person, approver: Person) => {
    inv.number = take(inv.kind === "AR" ? "INV" : "BILL", inv.date);
    inv.approval_steps = [step("ACCT", approver, at(inv.date, 11))];
    const j = postJournal(store, {
      date: inv.date, description: `${inv.kind === "AR" ? "Invoice" : "Supplier invoice"} ${inv.number} — ${inv.party_name}`, reference: inv.supplier_invoice_no ?? inv.number,
      source_type: inv.kind === "AR" ? "AR_INVOICE" : "AP_INVOICE", source_no: inv.number, lines: invoiceJournalLines(inv, codes), user: poster, at: at(inv.date, 15),
    });
    Object.assign(inv, { posted: true, status: "OPEN", journal_id: j.id, journal_no: j.journal_no });
    inv.history.push(
      { id: `${inv.id}-h2`, at: at(inv.date, 10), user_name: inv.preparer_name, action: "SUBMITTED" },
      { id: `${inv.id}-h3`, at: at(inv.date, 11), user_name: approver.full_name, action: "APPROVED" },
      { id: `${inv.id}-h4`, at: at(inv.date, 15), user_name: poster.full_name, action: "POSTED" },
    );
    refreshInvoice(inv);
  };
  const addLine = (inv: Invoice, l: Partial<InvoiceLine> & { description: string; quantity: string; unit_price: string }) =>
    inv.lines.push({ id: `${inv.id}-l${inv.lines.length + 1}`, discount: "0", tax_code_id: null, account_id: null, department_id: null, branch_id: "br-pp", ...l });

  // Balances brought forward at go-live: they make up the AR and AP control balances of the opening journal.
  const openingRows = (rows: string[], control: string, kind: "AR" | "AP", pool: StoredParty[]) => {
    const target = new Decimal(opening?.lines.find((l) => l.account_id === control)?.[kind === "AR" ? "debit_base" : "credit_base"] ?? 0);
    const amounts = [...rows, target.minus(rows.reduce((s, r) => s.plus(r), new Decimal(0))).toFixed(2)];
    amounts.forEach((amount, i) => {
      const party = pool[i];
      const date = addDays("2026-10-05", i * 5);
      const inv = blank(kind, party, date, kind === "AR" ? people.aro : people.apo);
      addLine(inv, { description: "Balance brought forward", quantity: "1", unit_price: amount, account_id: party.default_account_id });
      price(inv);
      Object.assign(inv, {
        number: `OB-${kind}-${String(i + 1).padStart(4, "0")}`, supplier_invoice_no: kind === "AP" ? `OB/${party.code}/${2026}` : null, posted: true, status: "OPEN",
        is_opening: true, journal_id: opening?.id ?? null, journal_no: opening?.journal_no ?? null, reference: "Go-live balance",
      });
      inv.history.push({ id: `${inv.id}-h2`, at: at("2027-01-01", 8), user_name: people.acct.full_name, action: "POSTED", comment: "Opening balance" });
      refreshInvoice(inv);
      state.invoices.push(inv);
    });
  };
  openingRows(OPENING_AR, AR_CONTROL, "AR", customers.filter((c) => c.currency === "USD"));
  openingRows(OPENING_AP, AP_CONTROL, "AP", suppliers);

  // Posted customer invoices, January to early April 2027.
  const salesDocs: Invoice[] = [];
  for (let i = 0; i < 24; i += 1) {
    const customer = customers[(i * 7 + 3) % 39];
    const date = addDays("2027-01-12", Math.floor(i * 3.5));
    const inv = blank("AR", customer, date, people.aro);
    const khr = customer.currency === "KHR";
    const n = 1 + (i % 3);
    for (let k = 0; k < n; k += 1) {
      const [description, service] = PRODUCTS[(i + k * 3) % PRODUCTS.length];
      const unit = faker.number.int({ min: 5, max: 260 });
      addLine(inv, {
        description, quantity: String(faker.number.int({ min: 1, max: 24 })), unit_price: khr ? String(unit * 4100) : `${unit}.${faker.helpers.arrayElement(["00", "50", "25"])}`,
        discount: k === 0 && i % 4 === 1 ? (khr ? "20000" : "5.00") : "0",
        tax_code_id: i % 7 === 6 ? "tax-exempt" : i % 5 === 3 ? "tax-vat10-inc" : "tax-vat10",
        account_id: service ? "acc-4200" : "acc-4100", department_id: "dep-SALES", branch_id: ["br-pp", "br-sr", "br-bb"][i % 3],
      });
    }
    price(inv);
    post(inv, people.aro, people.acct);
    state.invoices.push(inv);
    salesDocs.push(inv);
  }

  // Posted supplier invoices. S-0001's first one is "INV-001", for the duplicate check (AT-AP-01).
  const verified = suppliers.filter((s) => s.status === "VERIFIED");
  for (let i = 0; i < 18; i += 1) {
    const supplier = i === 0 ? suppliers[0] : verified[(i * 7) % verified.length];
    const date = addDays("2027-01-10", Math.floor(i * 4.4));
    const bill = blank("AP", supplier, date, people.apo);
    bill.supplier_invoice_no = i === 0 ? "INV-001" : `${supplier.code.replace("S-", "SI")}/${27}${String(100 + i)}`;
    bill.received_date = addDays(date, 2);
    const asset = supplier.default_account_id === "acc-1510";
    addLine(bill, {
      description: asset ? "Office desks and chairs" : `Purchase from ${supplier.name}`, quantity: String(faker.number.int({ min: 1, max: 12 })),
      unit_price: `${faker.number.int({ min: 20, max: 380 })}.00`, tax_code_id: i % 6 === 5 ? "tax-exempt" : "tax-vat10-in",
      account_id: supplier.default_account_id, department_id: ["dep-OPS", "dep-ADMIN", "dep-SALES"][i % 3], branch_id: "br-pp", is_asset: asset,
    });
    price(bill);
    post(bill, people.acct, people.finmgr);
    state.invoices.push(bill);
  }

  const cash = (code: string) => {
    const gl = { "CASH-USD": "acc-1101", "ABA-USD": "acc-1110" }[code]!;
    return { id: code === "CASH-USD" ? "cba-cash-usd" : "cba-aba-usd", gl };
  };
  const settle = (kind: "RECEIPT" | "PAYMENT", party: StoredParty, date: string, account: "CASH-USD" | "ABA-USD", allocations: { invoice: Invoice; amount: string }[], extra = "0", by: Person) => {
    const amount = allocations.reduce((s, a) => s.plus(a.amount), new Decimal(extra)).toFixed(2);
    const number = take(kind === "RECEIPT" ? "RV" : "SPV", date);
    const { id: accountId, gl } = cash(account);
    const payment: PartyPayment = {
      id: `${kind === "RECEIPT" ? "rcp" : "spv"}-seed-${state.partyPayments.length + 1}`, kind, number, party_id: party.id, party_name: party.name, party_name_km: party.name_km,
      date, account_id: accountId, method: account === "CASH-USD" ? "CASH" : "BANK_TRANSFER", currency: "USD", amount, rate: "1", reference: kind === "RECEIPT" ? `TT-${faker.string.numeric(6)}` : "",
      allocations: allocations.map((a) => ({ invoice_id: a.invoice.id, invoice_number: a.invoice.number ?? "", amount: a.amount })), unapplied: extra,
      status: kind === "RECEIPT" ? "POSTED" : "PAID", bank_reference: kind === "PAYMENT" ? `ABA${faker.string.numeric(8)}` : null,
      released_by: kind === "PAYMENT" ? people.finmgr.full_name : null, released_at: kind === "PAYMENT" ? at(date, 14) : null,
      pay_to: kind === "PAYMENT" && party.bank ? { bank_name: party.bank.bank_name, account_number: party.bank.account_number } : null,
      approval_steps: kind === "PAYMENT" ? [step("FINMGR", people.finmgr, at(date, 11))] : [], rejection_comment: null, journal_id: null, journal_no: null,
      preparer_id: by.id, preparer_name: by.full_name, history: [{ id: `p${state.partyPayments.length}-h1`, at: at(date, 9), user_name: by.full_name, action: "CREATED" }], version: 1,
    };
    const j = postJournal(store, {
      date, description: `${kind === "RECEIPT" ? "Receipt" : "Supplier payment"} ${number} — ${party.name}`, reference: payment.reference || number,
      source_type: kind === "RECEIPT" ? "AR_RECEIPT" : "AP_PAYMENT", source_no: number, lines: settlementJournalLines({ ...payment, number }, gl, allocations, extra), user: kind === "RECEIPT" ? by : people.finmgr, at: at(date, 14),
    });
    Object.assign(payment, { journal_id: j.id, journal_no: j.journal_no });
    payment.history.push({ id: `${payment.id}-h2`, at: at(date, 14), user_name: kind === "RECEIPT" ? by.full_name : people.finmgr.full_name, action: kind === "RECEIPT" ? "POSTED" : "RELEASED" });
    for (const a of allocations) {
      a.invoice.settlements.push({ doc_type: kind, doc_id: payment.id, number, date, amount: a.amount });
      refreshInvoice(a.invoice);
    }
    state.partyPayments.push(payment);
    return payment;
  };
  const usdSales = salesDocs.filter((d) => d.currency === "USD");
  const party = (id: string) => all.find((p) => p.id === id)!;
  settle("RECEIPT", party(usdSales[2].party_id), "2027-04-01", "ABA-USD", [{ invoice: usdSales[2], amount: usdSales[2].total }], "0", people.aro);
  settle("RECEIPT", party(usdSales[5].party_id), "2027-04-02", "CASH-USD", [{ invoice: usdSales[5], amount: new Decimal(usdSales[5].total).div(2).toFixed(2) }], "0", people.aro);
  settle("RECEIPT", party(usdSales[8].party_id), "2027-04-04", "ABA-USD", [{ invoice: usdSales[8], amount: usdSales[8].total }], "150.00", people.aro);
  const bills = state.invoices.filter((d) => d.kind === "AP" && !d.is_opening);
  settle("PAYMENT", party(bills[3].party_id), "2027-04-01", "ABA-USD", [{ invoice: bills[3], amount: bills[3].total }], "0", people.apo);

  // A posted credit note against a sales invoice (BR-AR-005: approved by someone other than the preparer).
  {
    const inv = usdSales[10];
    const first = inv.lines[0];
    const cn: CreditNote = {
      id: "cn-posted-1", number: take("CN", "2027-04-03"), invoice_id: inv.id, invoice_number: inv.number!, party_id: inv.party_id, party_name: inv.party_name,
      date: "2027-04-03", reason: "Damaged goods returned", currency: inv.currency,
      lines: [{ id: "cn-posted-1-l1", description: `Return: ${first.description}`, quantity: "1", unit_price: first.unit_price, discount: "0", tax_code_id: first.tax_code_id, account_id: SALES_RETURNS, department_id: first.department_id, branch_id: first.branch_id }],
      subtotal: "0", tax: "0", total: "0", status: "POSTED", approval_steps: [step("FINMGR", people.finmgr, at("2027-04-03", 11))], rejection_comment: null, journal_id: null, journal_no: null,
      preparer_id: people.aro.id, preparer_name: people.aro.full_name,
      history: [
        { id: "cn1-h1", at: at("2027-04-03", 9), user_name: people.aro.full_name, action: "CREATED" },
        { id: "cn1-h2", at: at("2027-04-03", 11), user_name: people.finmgr.full_name, action: "APPROVED" },
        { id: "cn1-h3", at: at("2027-04-03", 12), user_name: people.finmgr.full_name, action: "POSTED" },
      ], version: 3,
    };
    const priced = priceDocument({ lines: cn.lines, date: cn.date, currency: cn.currency, rate: inv.rate }, codes);
    Object.assign(cn, { subtotal: priced.subtotal, tax: priced.tax, total: priced.total });
    const j = postJournal(store, { date: cn.date, description: `Credit note ${cn.number} — ${inv.party_name}`, reference: inv.number!, source_type: "AR_CREDIT_NOTE", source_no: cn.number!, lines: creditNoteJournalLines(cn, inv, codes), user: people.finmgr, at: at(cn.date, 12) });
    Object.assign(cn, { journal_id: j.id, journal_no: j.journal_no });
    inv.settlements.push({ doc_type: "CREDIT_NOTE", doc_id: cn.id, number: cn.number!, date: cn.date, amount: cn.total });
    refreshInvoice(inv);
    state.creditNotes.push(cn);
  }

  // Work in progress, for the approvals inbox and the workflow demos.
  const wip = (kind: "AR" | "AP", id: string, partyRow: StoredParty, date: string, status: Invoice["status"], lines: Parameters<typeof addLine>[1][], extra: Partial<Invoice> = {}) => {
    const inv = blank(kind, partyRow, date, kind === "AR" ? people.aro : people.apo);
    inv.id = id;
    lines.forEach((l) => addLine(inv, l));
    price(inv);
    Object.assign(inv, extra, { status });
    if (status !== "DRAFT") inv.history.push({ id: `${id}-h2`, at: at(date, 10), user_name: inv.preparer_name, action: "SUBMITTED" });
    const pending = (role: string): ApprovalStep => ({ step: 1, role, status: "PENDING", approver_name: null, acted_at: null, comment: null });
    if (status === "SUBMITTED") inv.approval_steps = [pending("ACCT")];
    if (status === "APPROVED") {
      inv.approval_steps = [step("ACCT", kind === "AR" ? people.acct : people.finmgr, at(date, 11))];
      inv.history.push({ id: `${id}-h3`, at: at(date, 11), user_name: inv.approval_steps[0].approver_name!, action: "APPROVED" });
    }
    if (status === "REJECTED") {
      inv.approval_steps = [{ ...pending("ACCT"), status: "REJECTED", approver_name: people.acct.full_name, acted_at: at(date, 11), comment: "Attach the delivery note." }];
      inv.rejection_comment = "Attach the delivery note.";
      inv.history.push({ id: `${id}-h3`, at: at(date, 11), user_name: people.acct.full_name, action: "REJECTED", comment: inv.rejection_comment });
    }
    state.invoices.push(inv);
    return inv;
  };
  const sale = (description: string, quantity: string, unit_price: string) => ({ description, quantity, unit_price, tax_code_id: "tax-vat10", account_id: "acc-4100", department_id: "dep-SALES", branch_id: "br-pp" });
  wip("AR", "inv-draft-1", customers[2], "2027-04-04", "DRAFT", [sale("Cooking oil 5 L", "40", "12.50")]);
  wip("AR", "inv-sub-1", customers[6], "2027-04-03", "SUBMITTED", [sale("Rice 50 kg bags", "30", "38.00"), sale("Delivery service", "1", "45.00")]);
  wip("AR", "inv-appr-1", customers[11], "2027-04-02", "APPROVED", [sale("Bottled water, cases", "120", "4.20")]);
  const buy = (description: string, quantity: string, unit_price: string, account = "acc-6500", department_id = "dep-OPS") => ({ description, quantity, unit_price, tax_code_id: "tax-vat10-in", account_id: account, department_id, branch_id: "br-pp" });
  wip("AP", "bill-draft-1", suppliers[7], "2027-04-04", "DRAFT", [buy("Printer toner", "6", "48.00")], { supplier_invoice_no: "RP-7781" });
  wip("AP", "bill-sub-1", suppliers[1], "2027-04-02", "SUBMITTED", [buy("Warehouse lighting repair", "1", "640.00")], { supplier_invoice_no: "RE-2027-114" });
  wip("AP", "bill-appr-1", suppliers[8], "2027-04-01", "APPROVED", [buy("Packaging cartons", "500", "0.85", "acc-1300")], { supplier_invoice_no: "DP-0099" });
  wip("AP", "bill-rej-1", suppliers[9], "2027-03-30", "REJECTED", [buy("Delivery van service", "1", "310.00")], { supplier_invoice_no: "RM-3321" });

  // A credit note waiting for approval.
  {
    const inv = usdSales[12];
    const first = inv.lines[0];
    const cn: CreditNote = {
      id: "cn-sub-1", number: null, invoice_id: inv.id, invoice_number: inv.number!, party_id: inv.party_id, party_name: inv.party_name, date: "2027-04-04",
      reason: "Price adjustment agreed with the customer", currency: inv.currency,
      lines: [{ id: "cn-sub-1-l1", description: `Price adjustment: ${first.description}`, quantity: "1", unit_price: "20.00", discount: "0", tax_code_id: first.tax_code_id, account_id: SALES_RETURNS, department_id: first.department_id, branch_id: first.branch_id }],
      subtotal: "0", tax: "0", total: "0", status: "SUBMITTED", approval_steps: [{ step: 1, role: "FINMGR", status: "PENDING", approver_name: null, acted_at: null, comment: null }],
      rejection_comment: null, journal_id: null, journal_no: null, preparer_id: people.aro.id, preparer_name: people.aro.full_name,
      history: [{ id: "cn2-h1", at: at("2027-04-04", 9), user_name: people.aro.full_name, action: "CREATED" }, { id: "cn2-h2", at: at("2027-04-04", 10), user_name: people.aro.full_name, action: "SUBMITTED" }], version: 2,
    };
    const priced = priceDocument({ lines: cn.lines, date: cn.date, currency: cn.currency, rate: inv.rate }, codes);
    Object.assign(cn, { subtotal: priced.subtotal, tax: priced.tax, total: priced.total });
    state.creditNotes.push(cn);
  }

  // Supplier payments in the workflow: approved (ready to release), submitted, and a draft for the
  // supplier whose bank details change is waiting for approval (BR-AP-005).
  const openBill = (supplierIndex: number) => state.invoices.find((d) => d.kind === "AP" && d.party_id === suppliers[supplierIndex].id && d.is_opening)!;
  const unposted = (id: string, supplierIndex: number, status: PartyPayment["status"], date: string) => {
    const s = suppliers[supplierIndex];
    const bill = openBill(supplierIndex);
    const p: PartyPayment = {
      id, kind: "PAYMENT", number: null, party_id: s.id, party_name: s.name, party_name_km: s.name_km, date, account_id: "cba-aba-usd", method: "BANK_TRANSFER",
      currency: "USD", amount: bill.outstanding, rate: "1", reference: `Settle ${bill.supplier_invoice_no}`, allocations: [{ invoice_id: bill.id, invoice_number: bill.number!, amount: bill.outstanding }],
      unapplied: "0", status, bank_reference: null, released_by: null, released_at: null, pay_to: null,
      approval_steps: status === "APPROVED" ? [step("FINMGR", people.finmgr, at(date, 11))] : status === "SUBMITTED" ? [{ step: 1, role: "FINMGR", status: "PENDING", approver_name: null, acted_at: null, comment: null }] : [],
      rejection_comment: null, journal_id: null, journal_no: null, preparer_id: people.apo.id, preparer_name: people.apo.full_name,
      history: [{ id: `${id}-h1`, at: at(date, 9), user_name: people.apo.full_name, action: "CREATED" }], version: 1,
    };
    if (status !== "DRAFT") p.history.push({ id: `${id}-h2`, at: at(date, 10), user_name: people.apo.full_name, action: "SUBMITTED" });
    if (status === "APPROVED") p.history.push({ id: `${id}-h3`, at: at(date, 11), user_name: people.finmgr.full_name, action: "APPROVED" });
    state.partyPayments.push(p);
  };
  unposted("spv-appr-1", 1, "APPROVED", "2027-04-04");
  unposted("spv-sub-1", 6, "SUBMITTED", "2027-04-04");
  unposted("spv-draft-1", 2, "DRAFT", "2027-04-05");
  suppliers[2].bank!.pending = { bank_name: "Canadia Bank", account_name: suppliers[2].name, account_number: "001 778 230", requested_by: people.apo.full_name, requested_at: at("2027-04-03", 10) };

  // A customer close to its credit limit, for the warning on SCR-09 (BR-AR-004).
  const first = customers[0];
  const owed = state.invoices.filter((d) => d.party_id === first.id && d.posted).reduce((s, d) => s.plus(outstandingBase(d)), new Decimal(0));
  first.credit_limit = owed.plus(500).div(100).ceil().times(100).toFixed(2);
  return state;
}
