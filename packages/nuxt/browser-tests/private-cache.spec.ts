// Scenario 5 (tasks/ssr-adapters/plan.md, T7): the private page's SSR response is never cached, online or off —
// scenario 4 (offline.spec.ts) already covers the offline half; this covers the online visit itself.
import { expect, test } from "@pwa-platform/browser-test-harness";
import { cacheName } from "@pwa-platform/contracts";
import { serverEntry } from "./global-setup.js";
import { allCachedUrls, cacheContents, installAndControl } from "./page.js";
import { startNuxtServer, type NuxtServer } from "./servers.js";
import { IDENTITY } from "./site/pwa-config.js";
import { ACCOUNT_URL } from "./urls.js";

const PRECACHE = cacheName(IDENTITY, "precache");

test.describe("private page caching", () => {
  let server: NuxtServer;

  test.beforeEach(async () => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("manual", "v1"));
  });

  test.afterEach(async () => {
    await server.close();
  });

  test("visiting /app/account online (the response comes back) leaves no cache entry for it, in any cache", async ({ page }) => {
    await installAndControl(page, server);
    server.clearRequests();

    const response = await page.goto(server.url(ACCOUNT_URL));
    expect(response?.status()).toBe(200);
    // The worker answered this navigation itself, from its own network request — not the browser bypassing the
    // worker entirely, which the assertions below could not otherwise rule out (评审第 6 项, modelled on
    // sw-runtime's offline.spec.ts "denied navigations online" case).
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator("h1")).toHaveText("account");

    // Exactly one request for it reached the server: the worker fetched it once and passed the response through,
    // it did not also let some other, uncontrolled request through for the same URL.
    expect(server.requests().filter(({ path }) => path === ACCOUNT_URL)).toHaveLength(1);

    // CacheStorage holds only the precache: no cache was created, or reused, to hold the private page's response.
    const contents = await cacheContents(page);
    expect(Object.keys(contents)).toEqual([PRECACHE]);
    expect(contents[PRECACHE]?.some((url) => new URL(url).pathname === ACCOUNT_URL)).toBe(false);

    const cached = await allCachedUrls(page);
    expect(cached.some((entry) => entry.endsWith(` ${ACCOUNT_URL}`))).toBe(false);
  });
});
