import Decimal from "decimal.js";
import { HttpResponse } from "msw";
import type { Account, AccountInput, AccountType } from "@/lib/api/types/accounts";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { ledgerLines, netByAccount } from "../db/journals";
import type { MockUser } from "../db/seed";
import { fail, paginate, route, versionConflict, type Ctx } from "../http";

// SRS §13.3 /accounts, SCR-03, FR-COA-001..011, BR-COA-003/004.

const flag = (value: string | null) => (value === null ? null : value === "true");

/** Illustrative code structure: four digits, first digit by type (SRS §6.4 "4–8 digits with type prefix"). */
const PREFIX: Record<AccountType, string[]> = {
  ASSET: ["1", "9"], LIABILITY: ["2"], EQUITY: ["3"], REVENUE: ["4", "7"], EXPENSE: ["5", "6", "8"],
};

const inUse = (id: string) => db().journals.some((j) => j.lines.some((l) => l.account_id === id));

function decorate(account: Account, user: MockUser, balances?: Map<string, Decimal>): Account {
  const out: Account = { ...account, in_use: inUse(account.id) };
  if (balances && hasPermission(user.permissions, "rpt.trial_balance")) {
    // Header balances roll up their children.
    const ids = descendants(account.id);
    const sum = ids.reduce((s, id) => s.plus(balances.get(id) ?? 0), new Decimal(0));
    out.balance = (account.normal_balance === "DEBIT" ? sum : sum.neg()).toFixed(2);
  }
  return out;
}

function descendants(id: string): string[] {
  const children = db().accounts.filter((a) => a.parent_id === id);
  return [id, ...children.flatMap((c) => descendants(c.id))];
}

function seeAccount(user: MockUser, account: Account | undefined): account is Account {
  return Boolean(account && (!account.is_sensitive || hasPermission(user.permissions, "coa.sensitive.view")));
}

function history(account: Account, user: MockUser, action: string, comment?: string) {
  const store = db();
  (store.accountHistory[account.id] ??= []).push({
    id: `${account.id}-h${(store.accountHistory[account.id]?.length ?? 0) + 1}`, at: new Date().toISOString(),
    user_name: user.full_name, action, comment,
  });
}

/** Field validation for create and edit (BR-COA-003). */
function validateInput(input: AccountInput, current: Account | null): Response | null {
  const store = db();
  const details: { field: string; issue: string; message: string }[] = [];
  if (!/^\d{4}$/.test(input.code ?? "")) {
    details.push({ field: "code", issue: "structure", message: "Code does not match the configured structure" });
  } else if (!PREFIX[input.type]?.includes(input.code[0])) {
    details.push({ field: "code", issue: "prefix", message: "Code does not match the configured structure" });
  }
  if (!input.name?.trim()) details.push({ field: "name", issue: "required", message: "Enter the English name" });
  const parent = input.parent_id ? store.accounts.find((a) => a.id === input.parent_id) : null;
  if (input.parent_id && !parent) details.push({ field: "parent_id", issue: "missing", message: "Parent account not found" });
  if (parent && parent.type !== input.type) details.push({ field: "parent_id", issue: "type_mismatch", message: "Child account type must match parent" });
  if (parent?.is_posting) details.push({ field: "parent_id", issue: "posting_parent", message: "A parent must be a header account" });
  if (current && input.parent_id && descendants(current.id).includes(input.parent_id)) {
    details.push({ field: "parent_id", issue: "cycle", message: "An account cannot be placed under itself" });
  }
  if (input.is_control && !input.control_module) details.push({ field: "control_module", issue: "required", message: "Choose the module that controls this account" });
  if (input.effective_from && input.effective_to && input.effective_from > input.effective_to) {
    details.push({ field: "effective_to", issue: "range", message: "The end date must be after the start date" });
  }
  if (details.length) return fail(422, "VALIDATION_ERROR", "Validation failed", details);
  const duplicate = store.accounts.find((a) => a.code === input.code && a.id !== current?.id);
  if (duplicate) return fail(409, "DUPLICATE_CODE", "Account code already exists", [{ field: "code", issue: "duplicate", message: "Account code already exists" }]);
  return null;
}

function apply(account: Account, input: Partial<AccountInput>) {
  Object.assign(account, input, { version: account.version + 1 });
}

/** Changes to these fields of a used account need approval (SRS §13.3 "approval for used accounts"). */
const SENSITIVE_FIELDS: (keyof AccountInput)[] = ["type", "normal_balance", "is_posting", "parent_id", "is_control", "control_module", "currency"];

function findAccount(ctx: Ctx): Account | Response {
  const account = db().accounts.find((a) => a.id === ctx.params.id);
  if (!seeAccount(ctx.user, account)) return fail(404, "NOT_FOUND", "Account not found.");
  return account;
}

export const accountHandlers = [
  route("get", "/accounts", "coa.view", ({ user, url }) => {
    const q = url.searchParams;
    const search = (q.get("search") ?? "").trim().toLowerCase();
    const posting = flag(q.get("posting"));
    const active = flag(q.get("active"));
    const control = flag(q.get("control"));
    // Sensitive accounts never leave the server for roles without access (FR-RBAC-005).
    const rows = db()
      .accounts.filter(
        (a) =>
          seeAccount(user, a) &&
          (!q.get("type") || a.type === q.get("type")) &&
          (!q.get("category") || a.category === q.get("category")) &&
          (posting === null || a.is_posting === posting) &&
          (active === null || a.is_active === active) &&
          (control === null || a.is_control === control) &&
          (!search || a.code.startsWith(search) || a.name.toLowerCase().includes(search) || a.name_km.includes(search)),
      )
      .sort((a, b) => (q.get("sort") === "-code" ? b.code.localeCompare(a.code) : a.code.localeCompare(b.code)));
    const balances = q.get("include_balance") === "true" ? netByAccount(ledgerLines(db().journals)) : undefined;
    return paginate(rows.map((a) => decorate(a, user, balances)), url);
  }),

  route("get", "/accounts/:id", "coa.view", (ctx) => {
    const account = findAccount(ctx);
    if (account instanceof Response) return account;
    return HttpResponse.json(decorate(account, ctx.user, netByAccount(ledgerLines(db().journals))));
  }),

  route("get", "/accounts/:id/history", "coa.view", (ctx) => {
    const account = findAccount(ctx);
    if (account instanceof Response) return account;
    return HttpResponse.json({ data: db().accountHistory[account.id] ?? [] });
  }),

  route<AccountInput>("post", "/accounts", "coa.create", ({ user, body }) => {
    const invalid = validateInput(body, null);
    if (invalid) return invalid;
    if (body.is_sensitive && !hasPermission(user.permissions, "coa.sensitive.view")) {
      return fail(403, "FORBIDDEN", "You cannot create an account you would not be allowed to see.");
    }
    const account: Account = {
      ...body, id: `acc-${body.code}`, name_km: body.name_km ?? "", description: body.description ?? "", is_contra: false,
      is_active: true, version: 1, pending_change: null,
    };
    db().accounts.push(account);
    history(account, user, "CREATED");
    return HttpResponse.json(decorate(account, user), { status: 201 });
  }),

  route<AccountInput & { version: number }>("patch", "/accounts/:id", "coa.edit", (ctx) => {
    const account = findAccount(ctx);
    if (account instanceof Response) return account;
    const stale = versionConflict(ctx, account.version);
    if (stale) return stale;
    const input = { ...ctx.body } as Partial<AccountInput> & { version?: number };
    delete input.version;
    const merged = { ...account, ...input } as AccountInput;
    const invalid = validateInput(merged, account);
    if (invalid) return invalid;
    const changed = (Object.keys(input) as (keyof AccountInput)[]).filter((k) => JSON.stringify(input[k]) !== JSON.stringify(account[k as keyof Account]));
    if (!changed.length) return HttpResponse.json(decorate(account, ctx.user));
    const needsApproval = inUse(account.id) && changed.some((k) => SENSITIVE_FIELDS.includes(k)) && !hasPermission(ctx.user.permissions, "coa.approve");
    if (needsApproval) {
      account.pending_change = {
        requested_by_name: ctx.user.full_name, requested_at: new Date().toISOString(),
        fields: Object.fromEntries(changed.map((k) => [k, input[k]])) as Partial<AccountInput>,
      };
      account.version += 1;
      history(account, ctx.user, "CHANGE_REQUESTED", changed.join(", "));
      return HttpResponse.json(decorate(account, ctx.user), { status: 202 });
    }
    const before = changed.map((k) => `${k}: ${JSON.stringify(account[k as keyof Account])} → ${JSON.stringify(input[k])}`).join("; ");
    apply(account, Object.fromEntries(changed.map((k) => [k, input[k]])));
    history(account, ctx.user, "EDITED", before);
    return HttpResponse.json(decorate(account, ctx.user));
  }),

  // ASSUMPTION: approving a pending change to a used account (coa.approve); not in SRS §13.3.
  route<{ action: "approve" | "reject" }>("post", "/accounts/:id/change-decision", "coa.approve", (ctx) => {
    const account = findAccount(ctx);
    if (account instanceof Response) return account;
    const change = account.pending_change;
    if (!change) return fail(409, "INVALID_STATE_TRANSITION", "No change is waiting for approval.");
    if (change.requested_by_name === ctx.user.full_name) return fail(403, "SOD_VIOLATION", "You requested this change and cannot approve it.");
    account.pending_change = null;
    if (ctx.body?.action === "reject") {
      account.version += 1;
      history(account, ctx.user, "CHANGE_REJECTED");
    } else {
      apply(account, change.fields);
      history(account, ctx.user, "CHANGE_APPROVED", Object.keys(change.fields).join(", "));
    }
    return HttpResponse.json(decorate(account, ctx.user));
  }),

  // ASSUMPTION: activate and deactivate follow the user endpoints' pattern (SRS §13.3 /users/{id}/deactivate).
  route("post", "/accounts/:id/deactivate", "coa.edit", (ctx) => {
    const account = findAccount(ctx);
    if (account instanceof Response) return account;
    if (!account.is_active) return fail(409, "INVALID_STATE_TRANSITION", "The account is already inactive.");
    const net = netByAccount(ledgerLines(db().journals));
    const balance = descendants(account.id).reduce((s, id) => s.plus(net.get(id) ?? 0), new Decimal(0));
    // Deactivation only at zero balance (BR-COA-004).
    if (!balance.isZero()) {
      return fail(409, "INVALID_STATE_TRANSITION", `The account balance is ${balance.abs().toFixed(2)}; only zero-balance accounts can be deactivated.`, [
        { field: "balance", issue: "not_zero", value: balance.toFixed(2) },
      ]);
    }
    account.is_active = false;
    account.version += 1;
    history(account, ctx.user, "DEACTIVATED");
    return HttpResponse.json(decorate(account, ctx.user));
  }),

  route("post", "/accounts/:id/activate", "coa.edit", (ctx) => {
    const account = findAccount(ctx);
    if (account instanceof Response) return account;
    if (account.is_active) return fail(409, "INVALID_STATE_TRANSITION", "The account is already active.");
    account.is_active = true;
    account.version += 1;
    history(account, ctx.user, "ACTIVATED");
    return HttpResponse.json(decorate(account, ctx.user));
  }),

  route("delete", "/accounts/:id", "coa.edit", (ctx) => {
    const account = findAccount(ctx);
    if (account instanceof Response) return account;
    if (inUse(account.id)) {
      return fail(409, "ACCOUNT_IN_USE", "This account has transactions and cannot be deleted", [{ field: "id", issue: "in_use" }]);
    }
    if (db().accounts.some((a) => a.parent_id === account.id)) {
      return fail(409, "ACCOUNT_IN_USE", "This account has child accounts and cannot be deleted", [{ field: "id", issue: "has_children" }]);
    }
    db().accounts = db().accounts.filter((a) => a.id !== account.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
