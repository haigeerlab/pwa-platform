import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // Packs tarballs, installs them offline and runs a production vite build; see build-fixture.ts.
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  // Packing + an offline install + a vite build take longer than a plain browser assertion.
  timeout: 120_000,
  use: {
    channel: "chrome",
    headless: true,
  },
});

export default config;
