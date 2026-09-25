// Scenario 1 (tasks/ssr-adapters/plan.md, T7): first online visit registers the worker under the identity's scope,
// the page is controlled after a reload, the precache holds exactly what the build shipped (the prerendered pages
// and the offline page — see site/pwa-config.ts for why /_nuxt is deliberately excluded), and neither the private
// nor the request-time public page ever gets a cache entry.
import { expect, test } from "@pwa-platform/browser-test-harness";
import { cacheName } from "@pwa-platform/contracts";
import { publicDir, serverEntry } from "./global-setup.js";
import { allCachedUrls, cacheEntryCount, installAndControl } from "./page.js";
import { readShippedPrecache } from "./release.js";
import { IDENTITY } from "./site/pwa-config.js";
import { startNuxtServer, type NuxtServer } from "./servers.js";
import { SHELL_URL } from "./urls.js";

const PRECACHE = cacheName(IDENTITY, "precache");

test.describe("first online visit", () => {
  let server: NuxtServer;

  test.beforeEach(async () => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("manual", "v1"));
  });

  test.afterEach(async () => {
    await server.close();
  });

  test("registers at the identity's scope, controls the page after reload, precaches exactly what the build shipped, and never caches /app/account or /app/news", async ({
    page,
  }) => {
    await installAndControl(page, server);

    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
    expect(scope).toBe(server.url(SHELL_URL));

    const shipped = await readShippedPrecache(publicDir("manual", "v1"));
    expect(shipped.length).toBeGreaterThan(0);
    await expect.poll(() => cacheEntryCount(page, PRECACHE)).toBe(shipped.length);

    const cachedPaths = (await allCachedUrls(page)).map((entry) => entry.slice(entry.indexOf(" ") + 1));
    expect(cachedPaths.sort()).toEqual([...shipped.map((entry) => entry.url)].sort());

    // Named explicitly, not just "whatever the build happened to ship": comparing only against the shipped
    // manifest above is self-referential and would not notice a policy change that stopped precaching one of
    // these pages (measured: removing the offline page's asset rule left this test green until these lines were
    // added, since the manifest it compares against shrinks along with the cache).
    expect(cachedPaths).toEqual(
      expect.arrayContaining(["/app/index.html", "/app/about/index.html", "/app/offline/index.html"]),
    );
    expect(cachedPaths).not.toContain("/app/account");
    expect(cachedPaths).not.toContain("/app/news");
  });
});
