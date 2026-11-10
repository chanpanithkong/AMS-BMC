import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { apiContext } from "@/lib/api/client";
import { resetDb } from "@/mocks/db";
import { clearMockSession } from "@/mocks/handlers/auth";
import { mockConfig, resetIdempotency } from "@/mocks/http";
import { server } from "@/mocks/server";

mockConfig.latency = false;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetDb();
  resetIdempotency();
  clearMockSession();
  apiContext.accessToken = null;
  apiContext.companyId = null;
  mockConfig.chaos = false;
  mockConfig.accessTokenSeconds = 15 * 60;
});
afterAll(() => server.close());
