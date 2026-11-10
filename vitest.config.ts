import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    env: {
      NEXT_PUBLIC_API_MODE: "mock",
      // Node's fetch needs an absolute URL; MSW intercepts it.
      NEXT_PUBLIC_API_BASE_URL: "http://localhost/api/v1",
      NEXT_PUBLIC_MOCK_TODAY: "2027-04-05",
    },
  },
});
