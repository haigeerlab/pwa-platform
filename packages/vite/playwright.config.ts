import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  // Runs the plugin over a real app twice, writing the two fixture site versions into browser-build/.
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  // Same as the harness self-tests: serial branded Chrome instances give stable results.
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
