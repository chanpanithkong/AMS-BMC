import { HttpResponse } from "msw";
import { hasPermission } from "@/lib/rbac/permissions";
import { db } from "../db";
import { fail, paginate, route } from "../http";

// SRS §13.3 /accounts (read side). Create, edit and import arrive with SCR-03 in Phase 2.

const flag = (value: string | null) => (value === null ? null : value === "true");

export const accountHandlers = [
  route("get", "/accounts", "coa.view", ({ user, url }) => {
    const q = url.searchParams;
    const search = (q.get("search") ?? "").trim().toLowerCase();
    const posting = flag(q.get("posting"));
    const active = flag(q.get("active"));
    const control = flag(q.get("control"));
    // Sensitive accounts never leave the server for roles without access (FR-RBAC-005).
    const seeSensitive = hasPermission(user.permissions, "coa.sensitive.view");
    const rows = db()
      .accounts.filter(
        (a) =>
          (seeSensitive || !a.is_sensitive) &&
          (!q.get("type") || a.type === q.get("type")) &&
          (posting === null || a.is_posting === posting) &&
          (active === null || a.is_active === active) &&
          (control === null || a.is_control === control) &&
          (!search || a.code.startsWith(search) || a.name.toLowerCase().includes(search) || a.name_km.includes(search)),
      )
      .sort((a, b) => a.code.localeCompare(b.code));
    return paginate(rows, url);
  }),

  route("get", "/accounts/:id", "coa.view", ({ user, params }) => {
    const account = db().accounts.find((a) => a.id === params.id);
    const hidden = account?.is_sensitive && !hasPermission(user.permissions, "coa.sensitive.view");
    if (!account || hidden) return fail(404, "NOT_FOUND", "Account not found.");
    return HttpResponse.json(account);
  }),
];
