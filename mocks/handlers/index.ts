import { accountHandlers } from "./accounts";
import { adminHandlers } from "./admin";
import { approvalHandlers } from "./approvals";
import { arapHandlers } from "./arap";
import { assetHandlers } from "./assets";
import { budgetHandlers } from "./budgets";
import { authHandlers } from "./auth";
import { cashBankHandlers } from "./cashbank";
import { dashboardHandlers } from "./dashboard";
import { expenseHandlers } from "./expenses";
import { fxRevaluationHandlers } from "./fxrevaluation";
import { importHandlers } from "./imports";
import { inventoryHandlers } from "./inventory";
import { journalHandlers } from "./journals";
import { orgHandlers } from "./org";
import { periodHandlers } from "./periods";
import { reconciliationHandlers } from "./reconciliation";
import { reportHandlers } from "./reports";
import { settingsHandlers } from "./settings";
import { statementHandlers } from "./statements";
import { taxHandlers } from "./tax";

export const handlers = [
  ...authHandlers, ...orgHandlers, ...accountHandlers, ...journalHandlers, ...periodHandlers, ...reportHandlers, ...approvalHandlers,
  ...cashBankHandlers, ...reconciliationHandlers, ...expenseHandlers, ...arapHandlers, ...taxHandlers, ...dashboardHandlers,
  ...assetHandlers, ...budgetHandlers, ...fxRevaluationHandlers, ...inventoryHandlers, ...importHandlers,
  ...adminHandlers, ...settingsHandlers,
  // Generic /reports/:slug last, after the specific report routes.
  ...statementHandlers,
];
