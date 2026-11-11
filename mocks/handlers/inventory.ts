import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { InventoryEvent, InventoryEventType, InventoryReconciliation } from "@/lib/api/types/planning";
import { db } from "../db";
import { accountBalance, line, postJournal } from "../db/posting";
import { MOCK_TODAY } from "../db/seed";
import { fail, paginate, route } from "../http";
import { checkPeriod } from "./journals";

// SRS §6.11 Inventory Accounting Integration (optional, behind the inventory feature flag):
// FR-INV-003..008, BR-INV-001, AT-INV-01 (idempotent intake) and AT-INV-02 (reconciliation).

const INVENTORY = "acc-1300";
const COGS = "acc-5100";
const GRNI = "acc-2150"; // goods received not invoiced: accrued liabilities in the illustrative chart
const TYPES: InventoryEventType[] = ["RECEIPT", "ISSUE", "ADJUSTMENT", "WRITE_OFF", "RETURN"];
let counter = 0;

/** Illustrative perpetual-inventory entries (SRS §6.11). */
function entry(type: InventoryEventType, value: Decimal): [string, string] {
  switch (type) {
    case "RECEIPT": return [INVENTORY, GRNI];
    case "ISSUE": return [COGS, INVENTORY];
    case "WRITE_OFF": return [COGS, INVENTORY];
    case "RETURN": return [GRNI, INVENTORY];
    case "ADJUSTMENT": return value.gte(0) ? [INVENTORY, COGS] : [COGS, INVENTORY];
  }
}

export const inventoryHandlers = [
  route("get", "/inventory-events", "inv.view", ({ url }) => paginate([...db().inventoryEvents].sort((a, b) => b.received_at.localeCompare(a.received_at)), url)),

  // ASSUMPTION: event intake needs gl.journal.post (it posts journals); the SRS names only the endpoint.
  route<Omit<InventoryEvent, "id" | "journal_id" | "journal_no" | "received_at">>("post", "/inventory-events", "gl.journal.post", (ctx) => {
    const b = ctx.body;
    const existing = db().inventoryEvents.find((e) => e.source_event_id === b?.source_event_id);
    // AT-INV-01: an event already received is not posted again; the answer refers to the original.
    if (existing) return HttpResponse.json({ event: existing, duplicate: true });
    const value = new Decimal(b?.value || 0);
    const details: { field: string; issue: string; message: string }[] = [];
    if (!b?.source_event_id?.trim()) details.push({ field: "source_event_id", issue: "required", message: "Enter the source event id" });
    if (!TYPES.includes(b?.type)) details.push({ field: "type", issue: "required", message: "Choose the event type" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b?.date ?? "")) details.push({ field: "date", issue: "required", message: "Enter the date" });
    if (value.isZero() || (b?.type !== "ADJUSTMENT" && value.isNegative())) details.push({ field: "value", issue: "positive", message: "Enter a value (negative only for adjustments)" });
    if (details.length) return fail(422, "VALIDATION_ERROR", details[0].message, details);
    const blocked = checkPeriod(b.date, "MANUAL", ctx.user, "date");
    if (blocked) return blocked;
    const [dr, cr] = entry(b.type, value);
    const amount = value.abs().toFixed(2);
    const desc = `${b.type} ${b.item} (${b.source_event_id})`;
    const j = postJournal(db(), { date: b.date, description: desc, reference: b.source_event_id, source_type: "INVENTORY", source_no: b.source_event_id, user: ctx.user, lines: [line(dr, amount, "0", { description: desc }), line(cr, "0", amount, { description: desc })] });
    const event: InventoryEvent = {
      id: `ive-${Date.now().toString(36)}-${(counter += 1)}`, source_event_id: b.source_event_id.trim(), type: b.type, date: b.date, item: b.item ?? "", quantity: b.quantity ?? "0", value: value.toFixed(2),
      reason: b.reason ?? "", journal_id: j.id, journal_no: j.journal_no, received_at: new Date().toISOString(),
    };
    db().inventoryEvents.push(event);
    return HttpResponse.json({ event, duplicate: false }, { status: 201 });
  }),

  route("get", "/inventory/valuations", "inv.view", ({ url }) => paginate([...db().inventoryValuations].sort((a, b) => b.date.localeCompare(a.date)), url)),

  // AT-INV-02: the supplied valuation against the inventory control account, difference listed.
  route("get", "/reports/inventory-reconciliation", "inv.view", ({ url }) => {
    const date = url.searchParams.get("date") || MOCK_TODAY;
    const snapshot = db().inventoryValuations.filter((v) => v.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
    const at = snapshot?.date ?? date;
    const control = accountBalance(db(), INVENTORY, at).base;
    const result: InventoryReconciliation = {
      date: at, valuation_total: snapshot?.total ?? null, control_balance: control.toFixed(2), difference: snapshot ? new Decimal(snapshot.total).minus(control).toFixed(2) : null, valuation_id: snapshot?.id ?? null,
    };
    return HttpResponse.json(result);
  }),
];
