import { expect, requestFromPage, test } from "@pwa-platform/browser-test-harness";
import { DENIED_URL, FIXTURE_SITE, GUIDE_URL, PRECACHE_CACHE_NAME, SHELL_URL, UNCLASSIFIED_URL } from "./fixture-site.js";
import { cacheContents, installAndControl } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("offline startup", () => {
  test("renders the precached shell when the app shell URL is opened offline", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    await page.goto(fixtureServer.url(SHELL_URL));
    await expect(page.locator("[data-shell]")).toHaveText("app shell v1");
    // The shell came from the precache, not from the server.
    expect(fixtureServer.requests()).toEqual([]);
  });

  test("renders the precached shell, not the offline fallback, when the shell URL carries a query string (ADR-0034)", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    // Only `/app/index.html` is precached, not `/app/` itself, so this exercises the query-dropped fallback
    // candidates: the exact, query-preserving URL misses, and only dropping `?return=…` reaches the shell document.
    await page.goto(fixtureServer.url(`${SHELL_URL}?return=%2Fapp%2Fproducts%2F42`));
    await expect(page.locator("[data-shell]")).toHaveText("app shell v1");
    expect(fixtureServer.requests()).toEqual([]);
  });

  test("shows the offline fallback for a route that was never cached", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    await page.goto(fixtureServer.url("/app/products/42"));
    await expect(page.locator("[data-offline]")).toHaveText("offline fallback");
    expect(fixtureServer.requests()).toEqual([]);
  });

  test("fails closed when the plan disables the offline fallback", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("no-fallback");
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    await expect(page.goto(fixtureServer.url("/app/products/42"))).rejects.toThrow();
    expect(fixtureServer.requests()).toEqual([]);
  });

  test("opens a prerendered sub-page offline without the trailing slash", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("subpage");
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    for (const url of [GUIDE_URL, `${GUIDE_URL}/`]) {
      await page.goto(fixtureServer.url(url));
      await expect(page.locator("[data-guide]"), url).toHaveText("prerendered guide");
    }
    expect(fixtureServer.requests()).toEqual([]);
  });

  test("shows the offline page, never a cached copy, for a denied navigation", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    await page.goto(fixtureServer.url(DENIED_URL));
    await expect(page.locator("[data-offline]")).toHaveText("offline fallback");
    // Chrome may check the worker script independently of this navigation. The denied URL itself must never reach the server offline.
    expect(fixtureServer.requests().filter(({ path }) => path === DENIED_URL)).toEqual([]);
  });

  test("never answers an unclassified navigation", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    await expect(page.goto(fixtureServer.url(UNCLASSIFIED_URL))).rejects.toThrow();
    expect(fixtureServer.requests()).toEqual([]);
  });
});

test.describe("excluded paths (shared-origin root, ADR-0019)", () => {
  test("are never answered by this worker: online they reach the server, offline they get a network error", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("excluded");
    await installAndControl(page, fixtureServer);

    const online = await page.goto(fixtureServer.url(`${GUIDE_URL}/`));
    expect(online?.status()).toBe(200);
    expect(online?.fromServiceWorker()).toBe(false);
    expect(fixtureServer.requests().map(({ path }) => path)).toEqual([`${GUIDE_URL}/`]);

    await page.goto(fixtureServer.url(SHELL_URL));
    fixtureServer.clearRequests();
    await context.setOffline(true);
    // Contrast on the same worker: a denied navigation falls back to the offline page, an excluded one does not.
    await page.goto(fixtureServer.url(DENIED_URL));
    await expect(page.locator("[data-offline]")).toHaveText("offline fallback");
    await expect(page.goto(fixtureServer.url(`${GUIDE_URL}/`))).rejects.toThrow();
    expect(fixtureServer.requests()).toEqual([]);
  });
});

test.describe("denied navigations online", () => {
  test("reach the network, keep the server's response and leave no cache entry", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);

    const response = await page.goto(fixtureServer.url(DENIED_URL));
    expect(response?.status()).toBe(200);
    // The worker now answers this navigation, but from its own network request: the server saw exactly one request.
    expect(response?.fromServiceWorker()).toBe(true);
    expect(fixtureServer.requests().map(({ path }) => path)).toEqual([DENIED_URL]);

    const contents = await cacheContents(page);
    expect(Object.keys(contents)).toEqual([PRECACHE_CACHE_NAME]);
    expect(contents[PRECACHE_CACHE_NAME]?.some((key) => key.includes(DENIED_URL))).toBe(false);
  });
});

test.describe("denied and unclassified requests", () => {
  test("reach the network directly and leave no cache entry", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);

    for (const url of [DENIED_URL, UNCLASSIFIED_URL]) {
      expect(await requestFromPage(page, url), url).toEqual({ outcome: "response", status: 200, fromServiceWorker: false });
    }
    expect(fixtureServer.requests().map(({ path }) => path)).toEqual([DENIED_URL, UNCLASSIFIED_URL]);

    const contents = await cacheContents(page);
    expect(Object.keys(contents)).toEqual([PRECACHE_CACHE_NAME]);
    for (const url of [DENIED_URL, UNCLASSIFIED_URL]) {
      expect(contents[PRECACHE_CACHE_NAME]?.some((key) => key.includes(url)), url).toBe(false);
    }
  });

  test("get a network error offline instead of a cached response", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await context.setOffline(true);

    for (const url of [DENIED_URL, UNCLASSIFIED_URL]) {
      expect((await requestFromPage(page, url)).outcome, url).toBe("network-error");
    }
    expect(fixtureServer.requests()).toEqual([]);
  });
});
