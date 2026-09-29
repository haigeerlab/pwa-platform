import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // Packs tarballs and installs a Vue project offline once; the spec then builds fixture variants in it.
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  timeout: 180_000,
});

export default config;
