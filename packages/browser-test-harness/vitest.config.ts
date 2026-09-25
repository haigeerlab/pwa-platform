import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Browser self-tests live in browser-tests/ and run through Playwright, never Vitest.
    include: ["test/**/*.test.ts"],
  },
});
