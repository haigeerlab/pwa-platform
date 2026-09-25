import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  forbidOnly: true,
  // Parallel branded Chrome instances timed out while creating contexts under load; the suite is small,
  // so it runs serially for stable results.
  workers: 1,
  reporter: "list",
  use: {
    // The installed Google Chrome stable; the harness never downloads browsers.
    channel: "chrome",
    headless: true,
  },
});

export default config;
