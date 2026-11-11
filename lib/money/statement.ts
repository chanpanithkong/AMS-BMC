import type { StatementMapping } from "@/lib/api/types/cashbank";
import { parseDate } from "@/lib/format/dates";
import { D, parseAmountInput } from "./decimal";

/**
 * Bank statement files (FR-CB-008): CSV parsing and column mapping. Shared by the import wizard
 * (to show the columns) and the mock backend (to build the preview). Excel files are converted by the
 * backend; the mock accepts CSV only.
 */

/** Parse CSV text (RFC 4180: quoted fields, doubled quotes, commas or semicolons). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

const GUESSES: Record<keyof Omit<StatementMapping, "date_format">, RegExp> = {
  date: /^(date|transaction date|value date|posting date|កាលបរិច្ឆេទ)$/i,
  description: /^(description|details|narrative|particulars|memo|បរិយាយ)$/i,
  reference: /^(reference|ref|ref\.? no\.?|cheque no\.?|ឯកសារយោង)$/i,
  amount: /^(amount|net amount|ចំនួន)$/i,
  debit: /^(debit|withdrawal|withdrawals|money out|paid out)$/i,
  credit: /^(credit|deposit|deposits|money in|paid in)$/i,
  balance: /^(balance|running balance|សមតុល្យ)$/i,
};

/** Guess a mapping from the header row. */
export function guessMapping(headers: string[]): StatementMapping {
  const find = (key: keyof typeof GUESSES) => headers.find((h) => GUESSES[key].test(h.trim())) ?? null;
  const amount = find("amount");
  return {
    date: find("date") ?? headers[0] ?? "",
    description: find("description") ?? headers[1] ?? "",
    reference: find("reference"),
    amount,
    debit: amount ? null : find("debit"),
    credit: amount ? null : find("credit"),
    balance: find("balance"),
    date_format: "DD/MM/YYYY",
  };
}

export interface MappedRow {
  row_no: number;
  date: string | null;
  description: string;
  reference: string;
  /** Signed: + money in, − money out. */
  amount: string | null;
  balance: string | null;
  errors: string[];
}

/** Apply a mapping to the data rows (row 1 is the header). Errors are message keys under `cb.import.errors`. */
export function mapRows(rows: string[][], mapping: StatementMapping): MappedRow[] {
  const [header, ...data] = rows;
  const col = (name: string | null) => (name ? header.indexOf(name) : -1);
  const iDate = col(mapping.date);
  const iDesc = col(mapping.description);
  const iRef = col(mapping.reference);
  const iAmount = col(mapping.amount);
  const iDebit = col(mapping.debit);
  const iCredit = col(mapping.credit);
  const iBalance = col(mapping.balance);
  return data.map((cells, index) => {
    const errors: string[] = [];
    const date = iDate >= 0 ? parseDate(cells[iDate] ?? "", mapping.date_format) : null;
    if (!date) errors.push("date");
    let amount: string | null = null;
    if (iAmount >= 0) {
      amount = parseAmountInput(cells[iAmount] ?? "", { allowNegative: true });
    } else {
      // Debit = money out of the account, credit = money in (bank statement convention).
      const debit = parseAmountInput(cells[iDebit] ?? "");
      const credit = parseAmountInput(cells[iCredit] ?? "");
      if (debit !== null && credit !== null) {
        if (!D(debit).isZero() && D(credit).isZero()) amount = D(debit).neg().toFixed();
        else if (D(debit).isZero() && !D(credit).isZero()) amount = D(credit).toFixed();
      }
    }
    if (amount === null || amount === "" || D(amount).isZero()) {
      errors.push("amount");
      amount = null;
    }
    const balanceText = iBalance >= 0 ? (cells[iBalance] ?? "") : "";
    const balance = balanceText ? parseAmountInput(balanceText, { allowNegative: true }) : null;
    if (balanceText && balance === null) errors.push("balance");
    const description = iDesc >= 0 ? (cells[iDesc] ?? "") : "";
    if (!description) errors.push("description");
    return {
      row_no: index + 2,
      date,
      description,
      reference: iRef >= 0 ? (cells[iRef] ?? "") : "",
      amount,
      balance: balance || null,
      errors,
    };
  });
}
