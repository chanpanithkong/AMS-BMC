import { describe, expect, it } from "vitest";
import { emptyJournalLine, journalLineIssues, journalTotals } from "@/lib/money/journal";

const line = (overrides: Parameters<typeof emptyJournalLine>[1]) => emptyJournalLine("USD", overrides);

describe("journal totals and difference", () => {
  it("is balanced when debits equal credits", () => {
    const totals = journalTotals([line({ debit: "250.00" }), line({ credit: "250.00" })], "USD");
    expect(totals.debit.toFixed(2)).toBe("250.00");
    expect(totals.credit.toFixed(2)).toBe("250.00");
    expect(totals.difference.isZero()).toBe(true);
    expect(totals.balanced).toBe(true);
  });

  it("reports the difference of an unbalanced journal", () => {
    const totals = journalTotals([line({ debit: "1000.00" }), line({ credit: "999.00" })], "USD");
    expect(totals.difference.toFixed(2)).toBe("1.00");
    expect(totals.balanced).toBe(false);
  });

  it("handles three lines and small amounts exactly", () => {
    const totals = journalTotals([line({ debit: "0.10" }), line({ debit: "0.20" }), line({ credit: "0.30" })], "USD");
    expect(totals.balanced).toBe(true);
    expect(totals.filledLines).toBe(3);
  });

  it("is not balanced with fewer than two filled lines", () => {
    expect(journalTotals([line({}), line({})], "USD").balanced).toBe(false);
    expect(journalTotals([], "USD").balanced).toBe(false);
  });

  it("converts foreign-currency lines to base with the line rate", () => {
    const totals = journalTotals(
      [line({ currency: "KHR", rate: "0.00025", debit: "4000000" }), line({ credit: "1000.00" })],
      "USD",
    );
    expect(totals.debit.toFixed(2)).toBe("1000.00");
    expect(totals.balanced).toBe(true);
  });

  it("ignores the rate on base-currency lines", () => {
    const totals = journalTotals([line({ rate: "5", debit: "10" }), line({ credit: "10" })], "USD");
    expect(totals.balanced).toBe(true);
  });
});

describe("journal line hints", () => {
  it("flags a line with both a debit and a credit", () => {
    expect(journalLineIssues(line({ account_id: "a", debit: "1", credit: "1" }), "USD")).toContain("both_sides");
  });
  it("flags an amount without an account", () => {
    expect(journalLineIssues(line({ debit: "1" }), "USD")).toEqual(["no_account"]);
  });
  it("flags a foreign-currency line without a rate (RATE_MISSING)", () => {
    expect(journalLineIssues(line({ account_id: "a", currency: "KHR", rate: "", debit: "4100" }), "USD")).toEqual(["missing_rate"]);
  });
  it("accepts an empty line", () => {
    expect(journalLineIssues(line({}), "USD")).toEqual([]);
  });
});
