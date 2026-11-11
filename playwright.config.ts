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
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    // The mock backend is a service worker; give each test a clean one.
    serviceWorkers: "allow",
  },
  projects: [
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } }, grep: /@responsive/ },
  ],
  // A production build in its own folder and port, so the tests do not depend on (or disturb) a
  // dev server the developer may have running. Mock mode is baked into the build.
  webServer: {
    command: "pnpm build && pnpm start -p 3100",
    url: "http://localhost:3100/en/login",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // The optional inventory module is switched on so that its page is tested too.
    env: { NEXT_PUBLIC_API_MODE: "mock", NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_FEATURE_INVENTORY: "true" },
  },
});
