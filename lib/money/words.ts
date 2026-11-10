import { D, currencyDecimals, type AmountLike } from "./decimal";

// Amount in words for payment and receipt vouchers (SRS SCR-12, prompt §8).
// Khmer wording is listed in messages/km.review.md for confirmation by a Khmer-speaking accountant.

const EN_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = ["", "thousand", "million", "billion", "trillion", "quadrillion"];

function enBelowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(EN_ONES[Math.floor(n / 100)] + " hundred");
    n %= 100;
  }
  if (n >= 20) {
    const ones = n % 10;
    parts.push(EN_TENS[Math.floor(n / 10)] + (ones ? "-" + EN_ONES[ones] : ""));
  } else if (n > 0) {
    parts.push(EN_ONES[n]);
  }
  return parts.join(" ");
}

export function integerToWordsEn(value: bigint): string {
  if (value === BigInt(0)) return "zero";
  const groups: string[] = [];
  let rest = value;
  let scale = 0;
  const thousand = BigInt(1000);
  while (rest > BigInt(0)) {
    const chunk = Number(rest % thousand);
    if (chunk > 0) groups.unshift(enBelowThousand(chunk) + (EN_SCALES[scale] ? " " + EN_SCALES[scale] : ""));
    rest /= thousand;
    scale += 1;
  }
  return groups.join(" ");
}

const KM_DIGITS = ["សូន្យ", "មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ", "ប្រាំពីរ", "ប្រាំបី", "ប្រាំបួន"];
const KM_TENS = ["", "ដប់", "ម្ភៃ", "សាមសិប", "សែសិប", "ហាសិប", "ហុកសិប", "ចិតសិប", "ប៉ែតសិប", "កៅសិប"];
const KM_UNITS: [number, string][] = [
  [100000, "សែន"],
  [10000, "ម៉ឺន"],
  [1000, "ពាន់"],
  [100, "រយ"],
];

function kmBelowMillion(n: number): string {
  let out = "";
  for (const [size, word] of KM_UNITS) {
    if (n >= size) {
      out += KM_DIGITS[Math.floor(n / size)] + word;
      n %= size;
    }
  }
  if (n >= 10) {
    out += KM_TENS[Math.floor(n / 10)];
    n %= 10;
  }
  if (n > 0) out += KM_DIGITS[n];
  return out;
}

export function integerToWordsKm(value: bigint): string {
  if (value === BigInt(0)) return KM_DIGITS[0];
  const million = BigInt(1000000);
  if (value >= million) {
    const rest = Number(value % million);
    return integerToWordsKm(value / million) + "លាន" + (rest ? kmBelowMillion(rest) : "");
  }
  return kmBelowMillion(Number(value));
}

interface CurrencyWords {
  en: { major: [string, string]; minor?: [string, string] };
  km: { major: string; minor?: string };
}

const CURRENCY_WORDS: Record<string, CurrencyWords> = {
  USD: { en: { major: ["US dollar", "US dollars"], minor: ["cent", "cents"] }, km: { major: "ដុល្លារអាមេរិក", minor: "សេន" } },
  KHR: { en: { major: ["riel", "riels"] }, km: { major: "រៀល" } },
  EUR: { en: { major: ["euro", "euros"], minor: ["cent", "cents"] }, km: { major: "អឺរ៉ូ", minor: "សេន" } },
  THB: { en: { major: ["baht", "baht"], minor: ["satang", "satang"] }, km: { major: "បាត", minor: "សតាង្គ" } },
};

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Amount in words, e.g. "One thousand two hundred fifty US dollars and fifty cents only".
 * The amount is first rounded to the currency's minor unit.
 */
export function amountInWords(value: AmountLike, currency: string, locale: "en" | "km"): string {
  const decimals = currencyDecimals(currency);
  const amount = D(value).abs().toDecimalPlaces(decimals);
  const [intText, fractionText = ""] = amount.toFixed(decimals).split(".");
  const major = BigInt(intText);
  const minor = fractionText ? BigInt(fractionText) : BigInt(0);
  const words = CURRENCY_WORDS[currency];
  const one = BigInt(1);

  if (locale === "km") {
    const majorName = words?.km.major ?? currency;
    let text = integerToWordsKm(major) + majorName;
    if (minor > BigInt(0)) {
      const minorName = words?.km.minor;
      text += minorName
        ? " និង" + integerToWordsKm(minor) + minorName
        : ` និង ${fractionText}/${"1".padEnd(decimals + 1, "0")}`;
    }
    return text + "គត់";
  }

  const majorName = words ? words.en.major[major === one ? 0 : 1] : currency;
  let text = `${integerToWordsEn(major)} ${majorName}`;
  if (minor > BigInt(0)) {
    const minorNames = words?.en.minor;
    text += minorNames
      ? ` and ${integerToWordsEn(minor)} ${minorNames[minor === one ? 0 : 1]}`
      : ` and ${fractionText}/${"1".padEnd(decimals + 1, "0")}`;
  }
  return capitalise(text) + " only";
}
