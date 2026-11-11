import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests build into their own folder so they never disturb a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
