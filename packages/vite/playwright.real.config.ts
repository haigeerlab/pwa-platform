import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// Local, non-blocking real Safari/Firefox run (ADR-0047): the same suite, with the harness swapping Playwright's
// `browser`, `context` and `page` fixtures for a W3C WebDriver session on the system browser named by
// PWA_REAL_BROWSER=safari|firefox. Safari allows one automation session at a time, so everything runs serially.
const real = process.env.PWA_REAL_BROWSER;
if (real !== "safari" && real !== "firefox") {
  throw new Error(`PWA_REAL_BROWSER must be "safari" or "firefox" to use this config, got "${real ?? ""}"`);
}

const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  // Runs the plugin over a real app twice, writing the two fixture site versions into browser-build/.
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  projects: [{ name: real }],
});

export default config;
