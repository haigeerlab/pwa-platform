import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "ui-browser-tests",
  workers: 1,
  reporter: "list",
  use: { channel: "chrome", headless: true },
});

export default config;
