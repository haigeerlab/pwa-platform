import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  // Four full Nuxt production builds (two reload variants x two content versions) into browser-build/.
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  // Each spec spawns and swaps real Node child processes on its own; serial keeps that simple and matches every
  // other browser-test suite in this repo (stable results from one branded Chrome instance at a time).
  workers: 1,
  reporter: "list",
  use: {
    // The installed Google Chrome stable; tests never download browsers.
    channel: "chrome",
    headless: true,
  },
});

export default config;
