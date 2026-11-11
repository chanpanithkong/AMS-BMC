import { HttpResponse } from "msw";
import Decimal from "decimal.js";
import type { ExchangeRate, SearchResult } from "@/lib/api/types/org";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { fail, paginate, route } from "../http";

// Organisation, currencies, exchange rates, notifications and global search.

export const orgHandlers = [
  route("get", "/companies", null, ({ user, url }) =>
    paginate(db().companies.filter((c) => user.company_ids.includes(c.id)), url),
  ),
  route("get", "/departments", null, ({ company, url }) =>
    paginate(db().departments.filter((d) => d.company_id === company.id), url),
  ),
  route("get", "/fiscal-years", null, ({ company, url }) =>
    paginate(db().fiscalYears.filter((f) => f.company_id === company.id), url),
  ),
  route("get", "/currencies", null, ({ url }) => paginate(db().currencies, url)),
  route("get", "/dimensions", null, ({ url }) => paginate(db().dimensions, url)),

  route("get", "/exchange-rates/lookup", "fx.rate.view", ({ url, company }) => {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to") ?? company.base_currency;
    const date = url.searchParams.get("date") ?? "";
    const rate = db().exchangeRates.find((r) => r.from_currency === from && r.to_currency === to && r.rate_date === date);
    // A document cannot be posted without a rate (BR-FX-002).
    if (!rate) {
      return fail(422, "RATE_MISSING", `Exchange rate required for ${from} on ${date}`, [
        { field: "rate", issue: "missing", value: `${from}/${to} ${date}` },
      ]);
    }
    return HttpResponse.json(rate);
  }),

  route("get", "/exchange-rates", "fx.rate.view", ({ url }) => {
    const q = url.searchParams;
    const rows = db()
      .exchangeRates.filter(
        (r) =>
          (!q.get("from") || r.from_currency === q.get("from")) &&
          (!q.get("to") || r.to_currency === q.get("to")) &&
          (!q.get("rate_type") || r.rate_type === q.get("rate_type")) &&
          (!q.get("date_from") || r.rate_date >= q.get("date_from")!) &&
          (!q.get("date_to") || r.rate_date <= q.get("date_to")!),
      )
      .sort((a, b) => b.rate_date.localeCompare(a.rate_date));
    return paginate(rows, url);
  }),

  // SCR-24 rate entry. Rate > 0 and one rate per pair, date and type (SRS §13.3, FR-FX-003/005).
  route<Omit<ExchangeRate, "id">>("post", "/exchange-rates", "fx.rate.manage", ({ body, company }) => {
    const details: { field: string; issue: string; message: string }[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.rate_date ?? "")) details.push({ field: "rate_date", issue: "required", message: "Enter the rate date" });
    if (!db().currencies.some((c) => c.code === body?.from_currency)) details.push({ field: "from_currency", issue: "unknown", message: "Choose a currency" });
    if (body?.from_currency === (body?.to_currency || company.base_currency)) details.push({ field: "from_currency", issue: "same", message: "Choose a currency other than the base currency" });
    if (!/^\d+(\.\d{1,12})?$/.test(body?.rate ?? "") || new Decimal(body.rate).lte(0)) details.push({ field: "rate", issue: "positive", message: "Rate must be greater than zero" });
    if (!["TRANSACTION", "CLOSING", "AVERAGE"].includes(body?.rate_type)) details.push({ field: "rate_type", issue: "invalid", message: "Choose a rate type" });
    if (details.length) return fail(422, "VALIDATION_ERROR", "Validation failed", details);
    const to = body.to_currency || company.base_currency;
    const exists = db().exchangeRates.some((r) => r.from_currency === body.from_currency && r.to_currency === to && r.rate_type === body.rate_type && r.rate_date === body.rate_date);
    if (exists) {
      return fail(409, "DUPLICATE_RECORD", "A rate for this currency, date and type already exists", [
        { field: "rate_date", issue: "duplicate", message: "A rate for this currency, date and type already exists" },
      ]);
    }
    const rate: ExchangeRate = {
      id: `rate-${body.from_currency}-${body.rate_type}-${body.rate_date}`, rate_date: body.rate_date, from_currency: body.from_currency,
      to_currency: to, rate_type: body.rate_type, rate: new Decimal(body.rate).toFixed(12), source: body.source?.trim() || "Manual entry",
    };
    db().exchangeRates.push(rate);
    return HttpResponse.json(rate, { status: 201 });
  }),

  route("get", "/notifications", null, ({ user, url }) => paginate(db().notifications[user.id] ?? [], url)),
  route("post", "/notifications/read-all", null, ({ user }) => {
    (db().notifications[user.id] ?? []).forEach((n) => (n.read = true));
    return new HttpResponse(null, { status: 204 });
  }),
  route("post", "/notifications/:id/read", null, ({ user, params }) => {
    const notification = (db().notifications[user.id] ?? []).find((n) => n.id === params.id);
    if (!notification) return fail(404, "NOT_FOUND", "Notification not found.");
    notification.read = true;
    return new HttpResponse(null, { status: 204 });
  }),

  // Global search over accounts now; customers, suppliers and documents join in their phases.
  route("get", "/search", null, ({ user, url }) => {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const results: SearchResult[] = [];
    if (q && hasPermission(user.permissions, "coa.view")) {
      const seeSensitive = hasPermission(user.permissions, "coa.sensitive.view");
      for (const a of db().accounts) {
        if (a.is_sensitive && !seeSensitive) continue;
        if (a.code.startsWith(q) || a.name.toLowerCase().includes(q) || a.name_km.includes(q)) {
          results.push({
            type: "account", id: a.id, label: `${a.code} ${a.name}`, sublabel: a.name_km,
            href: `/accounting/accounts?search=${a.code}`,
          });
        }
      }
    }
    if (q.length >= 2 && hasPermission(user.permissions, "gl.journal.view")) {
      const seeSensitive = hasPermission(user.permissions, "coa.sensitive.view");
      const sensitive = new Set(db().accounts.filter((a) => a.is_sensitive).map((a) => a.id));
      for (const j of db().journals) {
        if (!j.journal_no?.toLowerCase().includes(q) && !j.reference.toLowerCase().includes(q)) continue;
        if (!seeSensitive && j.lines.some((l) => sensitive.has(l.account_id))) continue;
        results.push({ type: "document", id: j.id, label: j.journal_no ?? j.reference, sublabel: j.description, href: `/accounting/journals/${j.id}` });
        if (results.length >= 20) break;
      }
    }
    return paginate(results, url);
  }),
];
