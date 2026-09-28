import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// Non-blocking engine smoke (ADR-0042): the same suite on Playwright's own WebKit and Firefox builds, downloaded by
// the `test:browser:engines` script. Results are progressive-compatibility evidence for "WebKit engine" and
// "Firefox" at this Playwright version, never Safari or iOS. Network faults come from the fixture server, since
// context.setOffline and context.route do not reach a service worker's own requests in these engines.
const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests",
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  projects: [
    { name: "webkit", use: { browserName: "webkit", headless: true } },
    { name: "firefox", use: { browserName: "firefox", headless: true } },
  ],
});

export default config;
