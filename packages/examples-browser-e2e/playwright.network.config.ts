import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// The push network suite (spec/push-module.md "修订：真实订阅与真实送达的证据收尾"). It reaches the real push
// service (FCM) through the internet, so it lives apart from playwright.config.ts: the default `pnpm test:browser`
// and the module gates never see it, and an offline machine keeps passing them. Run it with
// `pnpm --filter @pwa-platform/examples-browser-e2e test:browser:network`.
const config: PlaywrightTestConfig = defineConfig({
  testDir: "browser-tests-network",
  // The same builds as the default suite; this suite only uses the React example's v1.
  globalSetup: "./browser-tests/global-setup.ts",
  forbidOnly: true,
  workers: 1,
  reporter: "list",
  // A round trip through FCM usually takes one or two seconds; the budget leaves room for a slow network.
  timeout: 90_000,
  // No `use.channel` here: each test launches its own persistent context (see the spec file), because Chrome
  // refuses push subscriptions in the non-persistent contexts Playwright's built-in fixtures create.
});

export default config;
