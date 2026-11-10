import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Mock backend for Node (Vitest).
export const server = setupServer(...handlers);
