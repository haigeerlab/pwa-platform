import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  // Bundles the test worker and writes the fixture site into the git-ignored browser-build/ directory.
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  // Same as the harness self-tests: serial branded Chrome instances give stable results.
  workers: 1,
  reporter: "list",
  use: {
    // The installed Google Chrome stable; tests never download browsers.
    channel: "chrome",
    headless: true,
  },
});

export default config;
