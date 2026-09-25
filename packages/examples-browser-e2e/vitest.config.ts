import { defineConfig } from "vitest/config";

// Node-side unit tests only. The real-browser suites live in browser-tests/ and run under Playwright.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: [
      "ssr-tests/**/*.test.ts",
      "apps/shared/**/*.test.ts",
      "release-verifier/test/**/*.test.ts",
      "push-tools/**/*.test.ts",
    ],
  },
});
