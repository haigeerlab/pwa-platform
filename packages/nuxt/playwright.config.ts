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
    // On failure, keep a trace in test-results/ (CI uploads it) so a flaky run leaves evidence (review N7).
    trace: "retain-on-failure",
    // The installed Google Chrome stable; tests never download browsers.
    // PWA_BROWSER_CHANNEL=msedge runs the same suite in the runner's preinstalled Edge (ADR-0044, non-blocking).
    channel: process.env.PWA_BROWSER_CHANNEL ?? "chrome",
    headless: true,
  },
});

export default config;
