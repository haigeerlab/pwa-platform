import { expect, readRegistration, registerWorker, requestFromPage, test, waitForController, waitForWorkerState } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, PLAN_V1, PRECACHE_CACHE_NAME, SHELL_URL, WORKER_URL, precacheCacheKeys } from "./fixture-site.js";
import { cacheContents, waitForActiveWorkerActivated } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("first online visit", () => {
  test("registers at the plan's service worker URL with the identity's scope", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    const scope = await registerWorker(page, { scriptUrl: WORKER_URL });

    expect(scope).toBe(fixtureServer.url(SHELL_URL));
    const registration = await waitForWorkerState(page, SHELL_URL, "active");
    expect(registration.active).toBe(fixtureServer.url(WORKER_URL));
  });

  test("precaches exactly the plan's entries and nothing else", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForWorkerState(page, SHELL_URL, "active");
    await waitForActiveWorkerActivated(page);

    expect(await cacheContents(page)).toEqual({
      [PRECACHE_CACHE_NAME]: precacheCacheKeys(PLAN_V1, fixtureServer.origin),
    });
    expect(PRECACHE_CACHE_NAME).toBe("pwa:swfixture:production:r1:precache");
    // The shell, the fingerprinted bundle, the revisioned logo and the offline page.
    expect(PLAN_V1.precache.map(({ url }) => url)).toEqual([
      "/app/assets/app.3f9a2c7d.js",
      "/app/assets/logo.svg",
      "/app/index.html",
      "/app/offline.html",
    ]);
  });

  test("does not claim the clients that registered it", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await registerWorker(page, { scriptUrl: WORKER_URL });
    // This page loaded before the worker existed, and activation has finished, so a clients.claim() inside activate
    // would already have taken effect: no fixed wait is needed to prove the page stays uncontrolled.
    await waitForActiveWorkerActivated(page);

    expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  });
});

test.describe("precached resources", () => {
  test("are served from the precache without reaching the server", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForActiveWorkerActivated(page);
    await page.reload();
    await waitForController(page, WORKER_URL);
    fixtureServer.clearRequests();

    for (const url of ["/app/assets/logo.svg", "/app/assets/app.3f9a2c7d.js", "/app/index.html", "/app/offline.html"]) {
      expect(await requestFromPage(page, url), url).toEqual({ outcome: "response", status: 200, fromServiceWorker: true });
    }
    expect(fixtureServer.requests()).toEqual([]);
  });

  test("keep serving the page's own registration state after a reload", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await registerWorker(page, { scriptUrl: WORKER_URL });
    await waitForActiveWorkerActivated(page);
    await page.reload();
    await waitForController(page, WORKER_URL);

    expect(await readRegistration(page, SHELL_URL)).toEqual({
      scope: fixtureServer.url(SHELL_URL),
      installing: null,
      waiting: null,
      active: fixtureServer.url(WORKER_URL),
    });
  });
});
