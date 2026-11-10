import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the app in mock mode (MSW in the browser).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // The dev server compiles pages on first visit; a few workers keep that from causing timeouts.
  workers: 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // The mock backend is a service worker; give each test a clean one.
    serviceWorkers: "allow",
  },
  projects: [
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } }, grep: /@responsive/ },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/en/login",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_API_MODE: "mock" },
  },
});
