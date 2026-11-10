import { accountHandlers } from "./accounts";
import { authHandlers } from "./auth";
import { orgHandlers } from "./org";

export const handlers = [...authHandlers, ...orgHandlers, ...accountHandlers];
