import { db } from "../db";
import { MOCK_TODAY } from "../db/seed";
import { paginate, route } from "../http";
import { pendingAdminApprovals } from "./admin";
import { pendingSettingApprovals } from "./settings";
import { pendingArApApprovals } from "./arap";
import { pendingAssetApprovals } from "./assets";
import { pendingBudgetApprovals } from "./budgets";
import { pendingExpenseApprovals } from "./expenses";
import { pendingJournalApprovals } from "./journals";

// SRS §13.3 GET /approvals: everything waiting for the signed-in user, oldest first (SCR-26).
export const approvalHandlers = [
  route("get", "/approvals", "wfl.approval.view", ({ user, url }) => {
    const q = url.searchParams;
    // FR-WFL-005: items waiting longer than the escalation time are flagged and also shown to the
    // next level. The demo clock is the mock "today" when it is later than the real time.
    const hours = Number((db().settings.notifications.value as { escalation_hours?: number }).escalation_hours ?? 48);
    const reference = Math.max(Date.now(), Date.parse(`${MOCK_TODAY}T17:00:00+07:00`));
    const items = [
      ...pendingJournalApprovals(user), ...pendingExpenseApprovals(user), ...pendingArApApprovals(user), ...pendingAssetApprovals(user),
      ...pendingBudgetApprovals(user), ...pendingAdminApprovals(user), ...pendingSettingApprovals(user),
    ]
      .map((i) => {
        const age = Math.max(0, Math.floor((reference - Date.parse(i.submitted_at)) / 3_600_000));
        return { ...i, age_hours: age, escalated: age >= hours };
      })
      .filter((i) => (!q.get("type") || i.document_type === q.get("type")) && (q.get("escalated") !== "true" || i.escalated))
      .filter((i) => !q.get("search") || `${i.number} ${i.description} ${i.preparer_name}`.toLowerCase().includes(q.get("search")!.toLowerCase()))
      .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
    return paginate(items, url);
  }),
];
