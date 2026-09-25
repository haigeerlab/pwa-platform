// Real-browser coverage for the `served-from-cache` page event and logout's runtime-cache cleanup (T11, spec
// "测试策略", ADR-0035), through the real facade and the real platform worker.
import type { Page } from "@playwright/test";
import { expect, readRegistration, snapshotCaches, test } from "@pwa-platform/browser-test-harness";
import { APP_CACHE_PREFIX, FIXTURE_SITE, RUNTIME_CATALOG_ITEMS_URL, RUNTIME_DASHBOARD_URL, RUNTIME_REVIEWS_LIST_URL, SHELL_URL } from "./fixture-site.js";
import { collectedEvents, installAndControl, pageLogout, pageRegister, waitForClientEvent, waitForClientEventCount } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

type RuntimeCacheEvent = { readonly type: string; readonly metadata: { readonly url: string; readonly cachedAt: number; readonly reason: string } };

/** Every collected `served-from-cache` event, typed for the assertions below. */
async function servedFromCacheEvents(page: Page): Promise<readonly RuntimeCacheEvent[]> {
  const events = (await collectedEvents(page)) as { readonly type: string }[];
  return events.filter((event): event is RuntimeCacheEvent => event.type === "served-from-cache");
}

/** A same-origin GET through the page, bypassing the HTTP cache. */
async function fetchOk(page: Page, url: string): Promise<void> {
  const ok = await page.evaluate(async (target) => {
    try {
      const response = await fetch(target, { cache: "no-store" });
      return response.ok;
    } catch {
      return false;
    }
  }, url);
  expect(ok, `fetch ${url} must succeed`).toBe(true);
}

const DATABASE_NAME = "workbox-expiration";
const OBJECT_STORE_NAME = "cache-entries";

async function expirationRecordCacheNames(page: Page): Promise<readonly string[]> {
  return page.evaluate(
    async ({ databaseName, storeName }) => {
      const exists = (await indexedDB.databases()).some(({ name }) => name === databaseName);
      if (!exists) return [];
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<string[]>((resolve, reject) => {
          const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
          request.onsuccess = () => resolve((request.result as { readonly cacheName: string }[]).map((entry) => entry.cacheName));
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    { databaseName: DATABASE_NAME, storeName: OBJECT_STORE_NAME },
  );
}

test.describe("served-from-cache: subresource (network-failed)", () => {
  test("exactly one event per offline read, with reason network-failed and a plausible cachedAt", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("runtime-cache");
    await installAndControl(page, fixtureServer);
    const url = `${RUNTIME_CATALOG_ITEMS_URL}?x=1`;
    const before = Date.now();
    await fetchOk(page, fixtureServer.url(url));

    await context.setOffline(true);
    await fetchOk(page, fixtureServer.url(url));
    await waitForClientEvent(page, "served-from-cache");
    const after = Date.now();

    // Deterministic settle point (T13 review): asserting `toHaveLength(1)` right here would pass just as well if a
    // duplicate followed a moment later — `waitForClientEvent` only proves the *first* one landed. A second,
    // known-to-be-served-from-cache read of the same URL must produce its own event; waiting for that second event
    // before reading the final array catches a duplicate emitted anywhere in between.
    await fetchOk(page, fixtureServer.url(url));
    await waitForClientEventCount(page, "served-from-cache", 2);

    const events = await servedFromCacheEvents(page);
    expect(events).toHaveLength(2);
    expect(events[0]?.metadata.reason).toBe("network-failed");
    expect(events[0]?.metadata.url).toBe(url);
    expect(events[0]?.metadata.cachedAt).toBeGreaterThanOrEqual(before);
    expect(events[0]?.metadata.cachedAt).toBeLessThanOrEqual(after);
    expect(events[1]?.metadata.reason).toBe("network-failed");
    expect(events[1]?.metadata.url).toBe(url);
  });
});

test.describe("served-from-cache: navigation (page subscribes only after the worker already served it)", () => {
  test("exactly one event, delivered through the pending-query path, not a lost direct message", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("runtime-cache");
    await installAndControl(page, fixtureServer);
    // Warm the pages cache online, with a plain navigation (no facade involvement).
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await expect(page.locator("[data-dashboard]")).toHaveText("dashboard v1");

    await context.setOffline(true);
    // A fresh navigation: a brand-new document, whose page script has not called register() yet, so nothing is
    // listening for the worker's message when it answers this navigation from the runtime cache.
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await expect(page.locator("[data-dashboard]")).toHaveText("dashboard v1");

    // Only now does the page subscribe and register — the pending-query path (not a direct postMessage) must still
    // deliver the signal for the navigation that already happened.
    await pageRegister(page);
    await waitForClientEvent(page, "served-from-cache");

    // Deterministic settle point (T13 review): a second real navigation cannot be used here to prove no duplicate
    // follows — `page.goto` builds a brand-new document with a fresh, empty `__pwaEvents`, so it cannot observe an
    // event that arrived for the previous document. A second `pwa:runtime-cache:pending` query is not a substitute
    // either: the worker's stash for this client id was already taken above and answers `served: null` from then on
    // (spec "页面信号": "Taken once"), by design, so it produces no second event to wait for. The bound below is a
    // fixed grace period instead: the worker's reply to the pending query above is a single synchronous
    // `port.postMessage` off the "message" handler (see `replyPending` in sw-runtime/src/worker/handlers.ts), so any
    // duplicate would already be enqueued to this page by the time that reply arrived — 500ms is generous even under
    // CI load, since nothing here waits on the network or another round trip.
    await page.waitForTimeout(500);

    const events = await servedFromCacheEvents(page);
    expect(events).toHaveLength(1);
    expect(events[0]?.metadata.reason).toBe("network-failed");
    expect(events[0]?.metadata.url).toBe(RUNTIME_DASHBOARD_URL);
  });
});

test.describe("served-from-cache: stale-while-revalidate", () => {
  test("a stale read emits reason stale-while-revalidate; a fresh network-first read emits nothing", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("runtime-cache");
    await installAndControl(page, fixtureServer);

    // First SWR read: no cache yet, waits for the network — no signal.
    await fetchOk(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL));
    // Workbox writes in the background; the fetch resolving does not mean the cache is warm yet.
    await expect
      .poll(() => page.evaluate(async (url) => (await caches.match(url)) !== undefined, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL)))
      .toBe(true);
    // Second SWR read: served from the now-warm cache, background-revalidates — one signal.
    await fetchOk(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL));
    await waitForClientEvent(page, "served-from-cache");

    const firstSwrEvents = await servedFromCacheEvents(page);
    expect(firstSwrEvents).toHaveLength(1);
    expect(firstSwrEvents[0]?.metadata.reason).toBe("stale-while-revalidate");
    expect(firstSwrEvents[0]?.metadata.url).toBe(RUNTIME_REVIEWS_LIST_URL);

    // A network-first read that succeeds online must never emit a served-from-cache event. Asserting that right
    // here (T13 review) would be vacuous: it only proves nothing had arrived *yet*, not that this read produced
    // nothing — a same-tick or slightly delayed emission would be missed either way. A third, known-to-be-served
    // SWR read of the same resource (the background revalidation from the second read completes by now, so the
    // cache is warm again) must itself produce a second signal; waiting for that event before reading the final
    // array proves the network-first read in between contributed none: the total is exactly 2, not 3.
    await fetchOk(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    await fetchOk(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL));
    await waitForClientEventCount(page, "served-from-cache", 2);

    const swrEvents = await servedFromCacheEvents(page);
    expect(swrEvents).toHaveLength(2);
    expect(swrEvents[1]?.metadata.reason).toBe("stale-while-revalidate");
    expect(swrEvents[1]?.metadata.url).toBe(RUNTIME_REVIEWS_LIST_URL);
  });
});

test.describe("logout clears the runtime cache and its expiration records", () => {
  test("after logout() resolves true, no runtime cache and no workbox-expiration record for this app remain", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("runtime-cache");
    await installAndControl(page, fixtureServer);
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await fetchOk(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    await fetchOk(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL));
    await pageRegister(page);

    const beforeCaches = await snapshotCaches(page);
    expect([...beforeCaches.keys()].some((name) => name.includes("runtime-"))).toBe(true);
    const beforeRecords = await expirationRecordCacheNames(page);
    expect(beforeRecords.some((name) => name.startsWith(APP_CACHE_PREFIX))).toBe(true);

    expect(await pageLogout(page)).toBe(true);

    const afterCaches = await snapshotCaches(page);
    expect([...afterCaches.keys()].some((name) => name.includes("runtime-")), "no runtime cache must remain").toBe(false);
    const afterRecords = await expirationRecordCacheNames(page);
    expect(afterRecords.some((name) => name.startsWith(APP_CACHE_PREFIX)), "no expiration record of this app must remain").toBe(false);

    expect(await readRegistration(page, SHELL_URL)).toBeNull();
  });
});
