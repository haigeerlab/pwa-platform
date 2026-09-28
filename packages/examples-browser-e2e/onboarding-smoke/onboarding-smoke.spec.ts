// The newcomer onboarding smoke: proves website/start/react.md and website/guide/configuration.md's minimal React
// integration actually works when installed from the packages as they would be published (packed tarballs,
// installed offline), not from this workspace's `workspace:*` symlinks. See build-fixture.ts for how the fixture
// is assembled, and spec/examples-browser-e2e.md for why this lives alongside the other examples.
import { readFileSync } from "node:fs";
import { expect, readRegistration, test, waitForController, waitForWorkerState } from "@pwa-platform/browser-test-harness";
import { POINTER_PATH, type FixturePointer } from "./pointer.js";

const pointer = JSON.parse(readFileSync(POINTER_PATH, "utf8")) as FixturePointer;

test.use({ fixtureSite: { versions: { default: pointer.distDir } } });

test.describe("onboarding smoke (packages installed from packed tarballs)", () => {
  test("manifest link, worker registration and scope, reload control, offline shell, and offline fallback", async ({
    page,
    fixtureServer,
  }) => {
    await page.goto(fixtureServer.url("/"));

    // 1. The manifest link the plugin injects, per website/guide/configuration.md's "已有链接时，只保留一个".
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBe("/manifest.webmanifest");
    await expect(page.locator("#app-shell-heading")).toHaveText("Onboarding Smoke App");

    // 2. The worker registers at the identity's scope (website/start/checklist.md step 1).
    const scope = fixtureServer.url("/");
    await waitForWorkerState(page, scope, "active");
    const registration = await readRegistration(page, scope);
    expect(registration?.scope).toBe(scope);

    // 3. Reload -> controlled. The platform never claims the page that registered it (checklist.md's "首次打开时
    // 即使注册成功、worker 已激活，当前页面仍可能显示 undefined"); a reload is required to observe a controller.
    await page.reload();
    await waitForController(page, fixtureServer.url("/sw.js"));
    const controllerUrl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
    expect(controllerUrl).toBe(fixtureServer.url("/sw.js"));

    // 4. Offline: the already-visited app shell still renders, not a blank page (checklist.md step 2.3).
    fixtureServer.goOffline();
    try {
      await page.reload();
      await expect(page.locator("#app-shell-heading")).toHaveText("Onboarding Smoke App");

      // 5. An uncached route falls back to the platform offline page while offline.
      await page.goto(fixtureServer.url("/no-such-route"));
      await expect(page.locator("h1.pwa-offline__heading")).toBeVisible();
    } finally {
      fixtureServer.goOnline();
    }
  });
});
