import { describe, expect, it } from "vitest";
import { formatDate, isIsoDate, parseDate } from "@/lib/format/dates";
import { D, currencyDecimals, inverseRate, isAmountString, parseAmountInput, sum, toBase, toWire } from "@/lib/money/decimal";
import { formatAmount, formatDecimal, formatRate } from "@/lib/money/format";

describe("decimal helpers", () => {
  it("never loses cents the way floats do", () => {
    expect(sum(["0.10", "0.20"]).toFixed(2)).toBe("0.30");
    expect(sum(["1000000000000.01", "0.02"]).toFixed(2)).toBe("1000000000000.03");
  });

  it("uses currency precision: USD 2, KHR 0", () => {
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("KHR")).toBe(0);
    expect(toWire("1250.5", "USD")).toBe("1250.50");
    expect(toWire("4100000.4", "KHR")).toBe("4100000");
  });

  it("rounds half-up (SRS BR-FX-005)", () => {
    expect(toWire("2.345", "USD")).toBe("2.35");
    expect(toWire("2.344", "USD")).toBe("2.34");
    expect(toWire("0.5", "KHR")).toBe("1");
  });

  it("treats empty and invalid text as zero", () => {
    expect(D("").isZero()).toBe(true);
    expect(D("abc").isZero()).toBe(true);
    expect(D(null).isZero()).toBe(true);
    expect(isAmountString("12.50")).toBe(true);
    expect(isAmountString("1e3")).toBe(false);
  });

  it("converts to base with base-per-unit rates (SRS 6.16)", () => {
    expect(toBase("4100000", "0.00024390", "USD").toFixed(2)).toBe("999.99");
    expect(toBase("4000000", "0.00025", "USD").toFixed(2)).toBe("1000.00");
    expect(inverseRate("0.00025", 2)?.toFixed(2)).toBe("4000.00");
    expect(inverseRate("0")).toBeNull();
  });
});

describe("parseAmountInput (typing and paste)", () => {
  it.each([
    ["1,250.00", "1250"],
    ["$1,250.50", "1250.5"],
    ["  4 100 000 ", "4100000"],
    ["1250.50 USD", "1250.5"],
    [".5", "0.5"],
    ["12.", "12"],
    ["", ""],
  ])("accepts %s", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it("rejects text that is not a number", () => {
    expect(parseAmountInput("12.3.4")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("1e5")).toBeNull();
  });

  it("allows negatives and accounting brackets only when asked", () => {
    expect(parseAmountInput("-300")).toBeNull();
    expect(parseAmountInput("(300)")).toBeNull();
    expect(parseAmountInput("-300", { allowNegative: true })).toBe("-300");
    expect(parseAmountInput("(1,250.00)", { allowNegative: true })).toBe("-1250");
  });
});

describe("formatting", () => {
  it("adds thousands separators and currency decimals", () => {
    expect(formatAmount("1250", "USD")).toBe("1,250.00");
    expect(formatAmount("4100000", "KHR")).toBe("4,100,000");
    expect(formatAmount("1250.5", "USD", { withCode: true })).toBe("1,250.50 USD");
    expect(formatAmount("123456789012345.67", "USD")).toBe("123,456,789,012,345.67");
  });

  it("shows negatives in brackets or with a minus, per user preference", () => {
    expect(formatAmount("-1250", "USD")).toBe("(1,250.00)");
    expect(formatAmount("-1250", "USD", { negative: "minus" })).toBe("-1,250.00");
    expect(formatDecimal("-0.001", 2)).toBe("0.00");
  });

  it("formats rates with up to 8 decimals", () => {
    expect(formatRate("0.00024390")).toBe("0.0002439");
    expect(formatRate("4100")).toBe("4,100.00");
  });
});

describe("dates", () => {
  it("formats business dates without shifting the day", () => {
    expect(formatDate("2027-03-31")).toBe("31/03/2027");
    expect(formatDate("2027-03-31", "MM/DD/YYYY")).toBe("03/31/2027");
    expect(formatDate("2027-03-31", "DD-MMM-YYYY")).toBe("31-Mar-2027");
    expect(formatDate(null)).toBe("");
  });

  it("parses the user's format and rejects impossible dates", () => {
    expect(parseDate("31/03/2027")).toBe("2027-03-31");
    expect(parseDate("3/4/2027", "MM/DD/YYYY")).toBe("2027-03-04");
    expect(parseDate("2027-03-31", "DD/MM/YYYY")).toBe("2027-03-31");
    expect(parseDate("31/02/2027")).toBeNull();
    expect(parseDate("tomorrow")).toBeNull();
    expect(isIsoDate("2027-02-29")).toBe(false);
  });
});
