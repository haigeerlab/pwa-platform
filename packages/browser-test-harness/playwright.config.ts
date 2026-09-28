import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  forbidOnly: true,
  // Parallel branded Chrome instances timed out while creating contexts under load; the suite is small,
  // so it runs serially for stable results.
  workers: 1,
  reporter: "list",
  use: {
    // On failure, keep a trace in test-results/ (CI uploads it) so a flaky run leaves evidence (review N7).
    trace: "retain-on-failure",
    // The installed Google Chrome stable; the harness never downloads browsers.
    // PWA_BROWSER_CHANNEL=msedge runs the same suite in the runner's preinstalled Edge (ADR-0044, non-blocking).
    channel: process.env.PWA_BROWSER_CHANNEL ?? "chrome",
    headless: true,
  },
});

export default config;
