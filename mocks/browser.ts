import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

// Mock backend for the browser (NEXT_PUBLIC_API_MODE=mock).
export const worker = setupWorker(...handlers);
