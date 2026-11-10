/** Runtime configuration read from public environment variables. */
export const config = {
  apiMode: (process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "mock") as "mock" | "live",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1",
  idleTimeoutMinutes: Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES || 30),
  confirmThreshold: process.env.NEXT_PUBLIC_CONFIRM_THRESHOLD || "10000",
  featureInventory: process.env.NEXT_PUBLIC_FEATURE_INVENTORY === "true",
  /** Mock mode only: the demo data is seeded around this date (see docs/DECISIONS.md). */
  mockToday: process.env.NEXT_PUBLIC_MOCK_TODAY || "2027-04-05",
  businessTimeZone: "Asia/Phnom_Penh",
} as const;

export const isMock = config.apiMode === "mock";
