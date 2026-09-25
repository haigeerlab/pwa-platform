import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
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
