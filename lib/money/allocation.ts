import { D, Decimal, currencyDecimals, toBase } from "./decimal";

/** An open invoice that a receipt or payment can be allocated to (SRS SCR-10, SCR-12). */
export interface OpenInvoice {
  id: string;
  number: string;
  date: string;
  due_date: string;
  currency: string;
  outstanding: string;
  /** Rate at which the invoice was recorded (base units per unit of invoice currency). */
  rate?: string;
}

/** invoice id → allocated amount (decimal string, "" when empty). */
export type Allocations = Record<string, string>;

export function allocatedTotal(allocations: Allocations): Decimal {
  return Object.values(allocations).reduce((acc, v) => acc.plus(D(v)), new Decimal(0));
}

export function unallocatedAmount(receiptAmount: string, allocations: Allocations): Decimal {
  return D(receiptAmount).minus(allocatedTotal(allocations));
}

/** Allocate the receipt to the oldest invoices first (by due date, then invoice date, then number). */
export function autoAllocate(invoices: OpenInvoice[], receiptAmount: string, currency: string): Allocations {
  const decimals = currencyDecimals(currency);
  let remaining = D(receiptAmount);
  const result: Allocations = {};
  const ordered = [...invoices].sort(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.date.localeCompare(b.date) || a.number.localeCompare(b.number),
  );
  for (const invoice of ordered) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, D(invoice.outstanding));
    if (take.gt(0)) {
      result[invoice.id] = take.toFixed(decimals);
      remaining = remaining.minus(take);
    }
  }
  return result;
}

export interface AllocationCheck {
  /** Total allocated is more than the receipt amount → ALLOCATION_EXCEEDS_BALANCE on the server. */
  exceedsReceipt: boolean;
  /** Invoices whose allocation is more than their outstanding balance. */
  exceedsInvoice: string[];
  /** Invoices with a negative allocation. */
  negative: string[];
  valid: boolean;
}

export function checkAllocations(invoices: OpenInvoice[], receiptAmount: string, allocations: Allocations): AllocationCheck {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const exceedsInvoice: string[] = [];
  const negative: string[] = [];
  for (const [id, amount] of Object.entries(allocations)) {
    const value = D(amount);
    if (value.isNegative()) negative.push(id);
    const invoice = byId.get(id);
    if (invoice && value.gt(D(invoice.outstanding))) exceedsInvoice.push(id);
  }
  const exceedsReceipt = allocatedTotal(allocations).gt(D(receiptAmount));
  return { exceedsReceipt, exceedsInvoice, negative, valid: !exceedsReceipt && !exceedsInvoice.length && !negative.length };
}

/**
 * Preview of the realised exchange difference for one allocation, in base currency:
 * allocated × (settlement rate − invoice rate). Positive = gain on a receivable.
 * Preview only; the server posts the authoritative figure (SRS BR-FX-003).
 */
export function realisedFxPreview(allocated: string, invoiceRate: string, settlementRate: string, baseCurrency: string): Decimal {
  return toBase(allocated, settlementRate, baseCurrency).minus(toBase(allocated, invoiceRate, baseCurrency));
}
