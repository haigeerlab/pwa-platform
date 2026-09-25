import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.ts"],
    // The real-Nuxt build test spawns a production build; generous but bounded so a hang still fails the run.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
