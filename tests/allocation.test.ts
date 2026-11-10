import { describe, expect, it } from "vitest";
import {
  allocatedTotal, autoAllocate, checkAllocations, realisedFxPreview, unallocatedAmount, type OpenInvoice,
} from "@/lib/money/allocation";

const invoices: OpenInvoice[] = [
  { id: "new", number: "INV-140", date: "2027-03-20", due_date: "2027-04-19", currency: "USD", outstanding: "1250.00" },
  { id: "old", number: "INV-125", date: "2027-02-10", due_date: "2027-03-12", currency: "USD", outstanding: "300.00" },
  { id: "mid", number: "INV-131", date: "2027-03-02", due_date: "2027-04-01", currency: "USD", outstanding: "500.00" },
];

describe("auto-allocate (oldest first)", () => {
  it("fills the oldest invoices first", () => {
    expect(autoAllocate(invoices, "800.00", "USD")).toEqual({ old: "300.00", mid: "500.00" });
  });

  it("partly allocates the last invoice it reaches", () => {
    expect(autoAllocate(invoices, "1000.00", "USD")).toEqual({ old: "300.00", mid: "500.00", new: "200.00" });
  });

  it("never allocates more than the invoices' outstanding amounts", () => {
    const result = autoAllocate(invoices, "5000.00", "USD");
    expect(allocatedTotal(result).toFixed(2)).toBe("2050.00");
    expect(unallocatedAmount("5000.00", result).toFixed(2)).toBe("2950.00");
  });

  it("allocates nothing for a zero receipt", () => {
    expect(autoAllocate(invoices, "0", "USD")).toEqual({});
  });
});

describe("allocation limits", () => {
  it("accepts allocations within both limits", () => {
    expect(checkAllocations(invoices, "800.00", { old: "300.00", mid: "500.00" }).valid).toBe(true);
  });

  it("blocks allocation above the receipt amount", () => {
    const check = checkAllocations(invoices, "800.00", { old: "300.00", mid: "500.00", new: "0.01" });
    expect(check.exceedsReceipt).toBe(true);
    expect(check.valid).toBe(false);
  });

  it("blocks allocation above an invoice's outstanding amount", () => {
    const check = checkAllocations(invoices, "800.00", { old: "300.01" });
    expect(check.exceedsInvoice).toEqual(["old"]);
    expect(check.valid).toBe(false);
  });

  it("blocks negative allocations", () => {
    expect(checkAllocations(invoices, "800.00", { old: "-1" }).negative).toEqual(["old"]);
  });
});

describe("realised FX preview", () => {
  it("shows a gain when the settlement rate is better (SRS 6.16 illustration)", () => {
    // KHR 4,100,000 invoiced at 4,100 KHR/USD and paid at 4,000 KHR/USD.
    // The 8-decimal stored rate values the invoice at 999.99, so the preview is 25.01 rather than 25.00.
    const gain = realisedFxPreview("4100000", "0.00024390", "0.00025", "USD");
    expect(gain.toFixed(2)).toBe("25.01");
  });

  it("is zero when the rate did not change", () => {
    expect(realisedFxPreview("1000", "0.00025", "0.00025", "USD").isZero()).toBe(true);
  });
});
