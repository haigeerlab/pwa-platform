import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  // Copies the static fixture site and the built page entry into the git-ignored browser-build/.
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  // Same as sw-runtime and entry-resilience: serial branded Chrome instances give stable results.
  workers: 1,
  reporter: "list",
  use: {
    // The installed Google Chrome stable; tests never download browsers.
    channel: "chrome",
    headless: true,
  },
});

export default config;
