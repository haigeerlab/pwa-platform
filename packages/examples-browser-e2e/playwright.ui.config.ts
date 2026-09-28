import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "ui-browser-tests",
  workers: 1,
  reporter: "list",
  // On failure, keep a trace in test-results/ (CI uploads it) so a flaky run leaves evidence (review N7).
  // PWA_BROWSER_CHANNEL=msedge runs the same suite in the runner's preinstalled Edge (ADR-0044, non-blocking).
  use: { channel: process.env.PWA_BROWSER_CHANNEL ?? "chrome", headless: true, trace: "retain-on-failure" },
});

export default config;
