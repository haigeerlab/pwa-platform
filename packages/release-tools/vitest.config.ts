import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.ts"],
    // run-gate.integration.test.ts drives real `git worktree` and `pnpm` subprocesses, which take 4-5s per case on an
    // idle machine and passed vitest's 5s default under the concurrent workspace test run (review risk R7).
    testTimeout: 20_000,
  },
});
