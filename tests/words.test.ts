import { describe, expect, it } from "vitest";
import { amountInWords, integerToWordsEn, integerToWordsKm } from "@/lib/money/words";

describe("amount in words: English", () => {
  it.each([
    ["0", "zero"],
    ["13", "thirteen"],
    ["21", "twenty-one"],
    ["100", "one hundred"],
    ["1250", "one thousand two hundred fifty"],
    ["1000000", "one million"],
    ["2000015", "two million fifteen"],
  ])("%s", (n, words) => {
    expect(integerToWordsEn(BigInt(n))).toBe(words);
  });

  it("writes vouchers with currency and minor units", () => {
    expect(amountInWords("1250.50", "USD", "en")).toBe("One thousand two hundred fifty US dollars and fifty cents only");
    expect(amountInWords("1", "USD", "en")).toBe("One US dollar only");
    expect(amountInWords("0.01", "USD", "en")).toBe("Zero US dollars and one cent only");
    expect(amountInWords("4100000", "KHR", "en")).toBe("Four million one hundred thousand riels only");
  });

  it("rounds to the currency minor unit first", () => {
    expect(amountInWords("10.005", "USD", "en")).toBe("Ten US dollars and one cent only");
    expect(amountInWords("99.6", "KHR", "en")).toBe("One hundred riels only");
  });
});

describe("amount in words: Khmer", () => {
  it.each([
    ["0", "សូន្យ"],
    ["11", "ដប់មួយ"],
    ["25", "ម្ភៃប្រាំ"],
    ["100", "មួយរយ"],
    ["1250", "មួយពាន់ពីររយហាសិប"],
    ["25000", "ពីរម៉ឺនប្រាំពាន់"],
    ["300000", "បីសែន"],
    ["4100000", "បួនលានមួយសែន"],
    ["1000000000", "មួយពាន់លាន"],
  ])("%s", (n, words) => {
    expect(integerToWordsKm(BigInt(n))).toBe(words);
  });

  it("writes vouchers with currency and minor units", () => {
    expect(amountInWords("1250.50", "USD", "km")).toBe("មួយពាន់ពីររយហាសិបដុល្លារអាមេរិក និងហាសិបសេនគត់");
    expect(amountInWords("4100000", "KHR", "km")).toBe("បួនលានមួយសែនរៀលគត់");
  });
});
