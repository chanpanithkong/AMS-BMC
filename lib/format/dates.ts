import { formatInTimeZone } from "date-fns-tz";
import { config, isMock } from "@/lib/config";

export type DateFormat = "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD-MMM-YYYY";
export const DATE_FORMATS: DateFormat[] = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD-MMM-YYYY"];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a business date ("YYYY-MM-DD" on the wire, SRS §13.1). Business dates have no time zone,
 * so this is plain string work and never shifts the day.
 */
export function formatDate(iso: string | null | undefined, format: DateFormat = "DD/MM/YYYY"): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  switch (format) {
    case "YYYY-MM-DD":
      return `${y}-${m}-${d}`;
    case "MM/DD/YYYY":
      return `${m}/${d}/${y}`;
    case "DD-MMM-YYYY":
      return `${d}-${MONTHS_SHORT[Number(m) - 1]}-${y}`;
    default:
      return `${d}/${m}/${y}`;
  }
}

/** Format a UTC timestamp in the business time zone (SRS NFR-LOC-007). */
export function formatDateTime(isoUtc: string | null | undefined, format: DateFormat = "DD/MM/YYYY"): string {
  if (!isoUtc) return "";
  const day = formatInTimeZone(isoUtc, config.businessTimeZone, "yyyy-MM-dd");
  const time = formatInTimeZone(isoUtc, config.businessTimeZone, "HH:mm");
  return `${formatDate(day, format)} ${time}`;
}

export function formatTime(isoUtc: string): string {
  return formatInTimeZone(isoUtc, config.businessTimeZone, "HH:mm");
}

/** Today's business date in Asia/Phnom_Penh. In mock mode the demo data's "today" is used. */
export function todayBusinessDate(now: Date = new Date()): string {
  if (isMock) return config.mockToday;
  return formatInTimeZone(now, config.businessTimeZone, "yyyy-MM-dd");
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Parse text typed in the user's date format into "YYYY-MM-DD"; null when it is not a real date. */
export function parseDate(text: string, format: DateFormat = "DD/MM/YYYY"): string | null {
  const value = text.trim();
  if (!value) return null;
  let y: string, m: string, d: string;
  const parts = value.split(/[\/\-.\s]+/);
  if (parts.length !== 3) return null;
  if (format === "YYYY-MM-DD" || /^\d{4}$/.test(parts[0])) [y, m, d] = parts;
  else if (format === "MM/DD/YYYY") [m, d, y] = parts;
  else [d, m, y] = parts;
  if (format === "DD-MMM-YYYY" && /^[A-Za-z]{3}$/.test(m)) {
    const index = MONTHS_SHORT.findIndex((name) => name.toLowerCase() === m.toLowerCase());
    if (index < 0) return null;
    m = String(index + 1);
  }
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return null;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}
