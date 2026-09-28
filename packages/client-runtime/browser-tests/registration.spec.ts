import {
  expect,
  expectLifecycleSequence,
  readRegistration,
  test,
  waitForWorkerState,
} from "@pwa-platform/browser-test-harness";
import { CLIENT_CONFIG, FIXTURE_SITE, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import { collectedEvents, installAndControl, pageRegister, waitForActiveWorkerActivated } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("first online visit", () => {
  test("registers the plan's worker URL with the identity's scope", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await pageRegister(page);

    const registration = await waitForWorkerState(page, SHELL_URL, "active");
    expect(registration).toEqual({
      scope: fixtureServer.url(SHELL_URL),
      installing: null,
      waiting: null,
      active: fixtureServer.url(WORKER_URL),
    });
  });

  test("uses the config the build step produced from the plan", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await pageRegister(page);
    await waitForActiveWorkerActivated(page);

    // The page never sees the plan: the registration it produced must match the compiled config's two paths.
    expect(CLIENT_CONFIG.scope).toBe(SHELL_URL);
    expect(CLIENT_CONFIG.serviceWorkerUrl).toBe(WORKER_URL);
    expect(CLIENT_CONFIG.installEnabled).toBe(true);
    const registration = await readRegistration(page, SHELL_URL);
    expect(registration?.active).toBe(fixtureServer.url(WORKER_URL));
  });

  test("emits registered, and nothing else, on a first visit", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await pageRegister(page);
    await waitForActiveWorkerActivated(page);

    const events = await collectedEvents(page);
    // No update-waiting: nothing controlled this page, so the first worker is not an update.
    expectLifecycleSequence(events, ["registered"]);
    expect(events[0]).toMatchObject({
      version: 1,
      type: "registered",
      appId: CLIENT_CONFIG.appId,
      metadata: { scope: fixtureServer.url(SHELL_URL) },
    });
  });

  test("registering twice leaves one registration and one event", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await pageRegister(page);
    await pageRegister(page);
    await waitForActiveWorkerActivated(page);

    expectLifecycleSequence(await collectedEvents(page), ["registered"]);
  });

  test("does not control the page that registered it until a reload", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await pageRegister(page);
    await waitForActiveWorkerActivated(page);

    // The platform worker never claims clients (ADR-0012), so this page stays uncontrolled.
    expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
    await page.reload();
    await waitForActiveWorkerActivated(page);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  });
});

test.describe("return visit while an update check is stalled (R9, ADR-0043)", () => {
  test("register() reports the existing active registration at once instead of waiting behind the stalled update", async ({
    page,
    fixtureServer,
    browserName,
  }) => {
    // Genuine engine difference (ADR-0043's probe table): Firefox does not queue register() behind a pending
    // update() fetch on the same registration the way Chromium and WebKit do, so the precondition this test proves
    // (browserRegister === "pending") never holds there. Product code is unaffected — the facade's own register()
    // still reports the existing active registration at once, which is what R9 actually depends on.
    test.skip(browserName === "firefox", "Firefox resolves register() immediately behind a pending update() fetch, unlike Chromium/WebKit (ADR-0043)");
    await installAndControl(page, fixtureServer);
    await page.reload();
    const release = fixtureServer.stall(WORKER_URL);
    try {
      // An update check whose script fetch never answers, as after the network returns on iPhone. The browser's own
      // register() queues behind it; the facade must not.
      const browserRegister = await page.evaluate(async (url) => {
        void (await navigator.serviceWorker.getRegistration())?.update().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return Promise.race([
          navigator.serviceWorker.register(url).then(() => "resolved"),
          new Promise((resolve) => setTimeout(() => resolve("pending"), 2_000)),
        ]);
      }, WORKER_URL);
      expect(browserRegister, "the precondition: the browser's register() is queued behind the stalled update").toBe("pending");

      const startedAt = Date.now();
      await pageRegister(page);
      expect(Date.now() - startedAt).toBeLessThan(1_000);
      expect(await collectedEvents(page)).toMatchObject([{ type: "registered", metadata: { scope: fixtureServer.url(SHELL_URL) } }]);
    } finally {
      release();
    }
  });
});
