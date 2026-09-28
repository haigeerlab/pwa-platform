// Real-browser coverage for the public-read runtime cache (T11, spec "测试策略", ADR-0035), through the real
// platform worker (Workbox engine included). Everything here exercises the deployed worker over HTTP/IndexedDB;
// nothing reimplements admission, routing or cleanup in the test itself.
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  cacheNames,
  createCaches,
  expect,
  snapshotCaches,
  test,
  waitForControllerChange,
} from "@pwa-platform/browser-test-harness";
import {
  APP_CACHE_PREFIX,
  FIXTURE_SITE,
  PRECACHE_CACHE_NAME,
  RUNTIME_CATALOG_AUTH_URL,
  RUNTIME_CATALOG_COOKIE_PRIVATE_URL,
  RUNTIME_CATALOG_COOKIE_PUBLIC_URL,
  RUNTIME_CATALOG_ITEMS_URL,
  RUNTIME_CATALOG_NO_STORE_URL,
  RUNTIME_CATALOG_PRIVATE_URL,
  RUNTIME_CATALOG_TOO_BIG_URL,
  RUNTIME_CATALOG_VARY_COOKIE_URL,
  RUNTIME_CATALOG_WRONG_MIME_URL,
  RUNTIME_DASHBOARD_UNVISITED_URL,
  RUNTIME_DASHBOARD_URL,
  RUNTIME_REVIEWS_LIST_URL,
  RUNTIME_REVIEWS_NO_CACHE_URL,
  SITE_V3_ROOT,
} from "./fixture-site.js";
import { cacheContents, confirmUpdate, deployAndWait, installAndControl, waitForActiveWorkerActivated } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

/** Control caches proving activation/recovery cleanup never reaches outside this app's runtime-cache kinds. */
const CONTROL_CACHES = [
  { name: `${APP_CACHE_PREFIX}r0:precache`, entries: 2 },
  { name: "pwa:swfixture:staging:r1:precache", entries: 1 },
  { name: "pwa:swfixture-eu:production:r1:precache", entries: 1 },
  { name: "images-v1", entries: 3 },
] as const;

type FetchResult = { readonly ok: true; readonly status: number; readonly body: unknown } | { readonly ok: false; readonly message: string };

/** A same-origin JSON GET through the page, bypassing the HTTP cache; reports the network error instead of throwing. */
async function fetchJson(page: Page, url: string, headers: Record<string, string> = {}): Promise<FetchResult> {
  return page.evaluate(
    async ({ target, requestHeaders }) => {
      try {
        const response = await fetch(target, { cache: "no-store", headers: requestHeaders });
        return { ok: true as const, status: response.status, body: await response.json() };
      } catch (error) {
        return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
      }
    },
    { target: url, requestHeaders: headers },
  );
}

/** Overwrites a runtime-cache fixture JSON file served by the currently-deployed v3 site, so the next network read differs from the last one. */
async function writeCatalogFile(url: string, value: unknown): Promise<void> {
  await writeFile(join(SITE_V3_ROOT, url.replace(/^\//, "")), JSON.stringify(value));
}

/** True when some cache whose name contains `nameFragment` holds an entry whose URL ends with `urlSuffix`. */
function hasCachedEntry(contents: Record<string, string[]>, nameFragment: string, urlSuffix: string): boolean {
  return Object.entries(contents).some(([name, urls]) => name.includes(nameFragment) && urls.some((entry) => entry.endsWith(urlSuffix)));
}

function dataCacheNames(snapshot: ReadonlyMap<string, number>): string[] {
  return [...snapshot.keys()].filter((name) => name.includes("runtime-data"));
}

test.describe("network-first (public-data)", () => {
  test("online read writes the runtime data cache; offline read returns the cached body", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("v3");
    await writeCatalogFile(RUNTIME_CATALOG_ITEMS_URL, { item: "online-body" });
    await installAndControl(page, fixtureServer);

    const online = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    expect(online).toMatchObject({ ok: true, body: { item: "online-body" } });
    // NetworkFirst can return the network response before Workbox finishes the cache write under event.waitUntil.
    await expect.poll(async () => hasCachedEntry(await cacheContents(page), "runtime-data", RUNTIME_CATALOG_ITEMS_URL)).toBe(true);

    fixtureServer.goOffline();
    const offline = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    expect(offline).toMatchObject({ ok: true, body: { item: "online-body" } });
  });
});

test.describe("stale-while-revalidate (public-data)", () => {
  test("the second read returns the cached body; the third read shows the background-updated body", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("v3");
    await writeCatalogFile(RUNTIME_REVIEWS_LIST_URL, { review: "v1" });
    await installAndControl(page, fixtureServer);

    const first = await fetchJson(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL));
    expect(first).toMatchObject({ ok: true, body: { review: "v1" } });
    // SWR can return the network response before its first cache write finishes.
    await expect.poll(async () => hasCachedEntry(await cacheContents(page), "runtime-data", RUNTIME_REVIEWS_LIST_URL)).toBe(true);

    await writeCatalogFile(RUNTIME_REVIEWS_LIST_URL, { review: "v2" });

    const second = await fetchJson(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL));
    expect(second).toMatchObject({ ok: true, body: { review: "v1" } });

    await expect
      .poll(async () => (await fetchJson(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL))) as FetchResult & { ok: true }, { timeout: 5_000 })
      .toMatchObject({ ok: true, body: { review: "v2" } });
  });
});

test.describe("admission diagnostics (review risk R8)", () => {
  // Playwright forwards a service worker's console only in Chromium; other engines skip (ADR-0042).
  test.skip(({ browserName }) => browserName !== "chromium", "service worker console capture is Chromium-only in Playwright");
  test("a Vary: Origin rejection is reported once on the worker console, naming the reason and the path", async ({
    page,
    context,
    fixtureServer,
  }) => {
    fixtureServer.deploy("v3");
    fixtureServer.setHeaderRules([{ pathPrefix: RUNTIME_CATALOG_VARY_COOKIE_URL, headers: { Vary: "Origin" } }]);
    await installAndControl(page, fixtureServer);

    const warnings: string[] = [];
    context.on("console", (message) => {
      if (message.type() === "warning" && message.text().includes("[pwa-platform]")) warnings.push(message.text());
    });
    for (let read = 0; read < 2; read += 1) {
      expect((await fetchJson(page, fixtureServer.url(`${RUNTIME_CATALOG_VARY_COOKIE_URL}?read=${read}`))).ok).toBe(true);
    }

    await expect.poll(() => warnings.length, { timeout: 5_000 }).toBe(1);
    expect(warnings[0]).toContain(`${RUNTIME_CATALOG_VARY_COOKIE_URL}: vary (Vary: Origin)`);
    expect(warnings[0]).not.toContain("read=");
    expect(hasCachedEntry(await cacheContents(page), "runtime-data", RUNTIME_CATALOG_VARY_COOKIE_URL)).toBe(false);
  });
});

test.describe("rejected responses (public-data): admitted online, network error offline, nothing cached", () => {
  const cases: readonly {
    readonly name: string;
    readonly url: string;
    readonly headers?: Record<string, string>;
    readonly requestHeaders?: Record<string, string>;
  }[] = [
    { name: "Cache-Control: no-store", url: RUNTIME_CATALOG_NO_STORE_URL, headers: { "Cache-Control": "no-store" } },
    { name: "Cache-Control: private", url: RUNTIME_CATALOG_PRIVATE_URL, headers: { "Cache-Control": "private" } },
    { name: "Vary: Cookie", url: RUNTIME_CATALOG_VARY_COOKIE_URL, headers: { Vary: "Cookie" } },
    { name: "wrong MIME (text/plain on a data rule)", url: RUNTIME_CATALOG_WRONG_MIME_URL, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    { name: "body larger than maxEntryBytes", url: RUNTIME_CATALOG_TOO_BIG_URL },
    { name: "request carries Authorization", url: RUNTIME_CATALOG_AUTH_URL, requestHeaders: { Authorization: "Bearer test-token" } },
  ];

  for (const testCase of cases) {
    test(testCase.name, async ({ page, fixtureServer }) => {
      fixtureServer.deploy("v3");
      if (testCase.headers) fixtureServer.setHeaderRules([{ pathPrefix: testCase.url, headers: testCase.headers }]);
      await installAndControl(page, fixtureServer);

      const online = await fetchJson(page, fixtureServer.url(testCase.url), testCase.requestHeaders);
      expect(online.ok, "online read").toBe(true);

      fixtureServer.goOffline();
      const offline = await fetchJson(page, fixtureServer.url(testCase.url), testCase.requestHeaders);
      expect(offline.ok, "offline read must be a network error").toBe(false);

      expect(hasCachedEntry(await cacheContents(page), "runtime-data", testCase.url), "must not be cached").toBe(false);
    });
  }

  test("SWR under Cache-Control: no-cache (allowed for network-first, not for SWR)", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("v3");
    fixtureServer.setHeaderRules([{ pathPrefix: RUNTIME_REVIEWS_NO_CACHE_URL, headers: { "Cache-Control": "no-cache" } }]);
    await installAndControl(page, fixtureServer);

    const online = await fetchJson(page, fixtureServer.url(RUNTIME_REVIEWS_NO_CACHE_URL));
    expect(online.ok).toBe(true);

    fixtureServer.goOffline();
    const offline = await fetchJson(page, fixtureServer.url(RUNTIME_REVIEWS_NO_CACHE_URL));
    expect(offline.ok).toBe(false);
    expect(hasCachedEntry(await cacheContents(page), "runtime-data", RUNTIME_REVIEWS_NO_CACHE_URL)).toBe(false);
  });
});

test.describe("Set-Cookie (worker cannot see it; business responsibility)", () => {
  test("a response with Set-Cookie and no private IS cached, and the page cannot read Set-Cookie either", async ({
    page,
    fixtureServer,
  }) => {
    fixtureServer.deploy("v3");
    fixtureServer.setHeaderRules([{ pathPrefix: RUNTIME_CATALOG_COOKIE_PUBLIC_URL, headers: { "Set-Cookie": "sid=abc; Path=/", "x-probe": "1" } }]);
    await installAndControl(page, fixtureServer);

    const probe = await page.evaluate(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      await response.text();
      return { setCookie: response.headers.get("set-cookie"), probe: response.headers.get("x-probe"), type: response.type };
    }, fixtureServer.url(RUNTIME_CATALOG_COOKIE_PUBLIC_URL));
    // The Fetch spec makes Set-Cookie a forbidden response-header name on a basic response: this is true in the
    // page exactly as it is inside the worker (T1 探路 1), so a plain page fetch already demonstrates it.
    expect(probe.setCookie).toBeNull();
    expect(probe.probe).toBe("1");
    expect(probe.type).toBe("basic");

    fixtureServer.goOffline();
    const offline = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_COOKIE_PUBLIC_URL));
    expect(offline.ok, "must be cached despite the (invisible) Set-Cookie").toBe(true);
  });

  test("the same response with Cache-Control: private is NOT cached", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("v3");
    fixtureServer.setHeaderRules([
      { pathPrefix: RUNTIME_CATALOG_COOKIE_PRIVATE_URL, headers: { "Set-Cookie": "sid=abc; Path=/", "Cache-Control": "private" } },
    ]);
    await installAndControl(page, fixtureServer);

    const online = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_COOKIE_PRIVATE_URL));
    expect(online.ok).toBe(true);
    fixtureServer.goOffline();
    const offline = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_COOKIE_PRIVATE_URL));
    expect(offline.ok, "Cache-Control: private must dam what Set-Cookie cannot").toBe(false);
  });
});

test.describe("dynamic navigation (navigation-public-dynamic, runtime-pages)", () => {
  test("online navigation writes the pages cache; offline renders it; an unvisited URL falls back like any other navigation", async ({
    page,
    fixtureServer,
  }) => {
    fixtureServer.deploy("v3");
    await installAndControl(page, fixtureServer);

    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await expect(page.locator("[data-dashboard]")).toHaveText("dashboard v1");
    expect(hasCachedEntry(await cacheContents(page), "runtime-pages", RUNTIME_DASHBOARD_URL)).toBe(true);

    fixtureServer.goOffline();
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await expect(page.locator("[data-dashboard]")).toHaveText("dashboard v1");

    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_UNVISITED_URL));
    await expect(page.locator("[data-offline]")).toHaveText("offline fallback");
  });

  test("a navigation carrying Authorization is served from the network and never written to the pages cache", async ({
    page,
    fixtureServer,
  }) => {
    fixtureServer.deploy("v3");
    await installAndControl(page, fixtureServer);

    await page.setExtraHTTPHeaders({ authorization: "Bearer navigation-probe" });
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await expect(page.locator("[data-dashboard]")).toHaveText("dashboard v1");
    expect(hasCachedEntry(await cacheContents(page), "runtime-pages", RUNTIME_DASHBOARD_URL)).toBe(false);
  });
});

test.describe("quota error clears every runtime cache (review risk R12)", () => {
  // The quota is lowered through the Chrome DevTools Protocol, which only Chromium exposes (ADR-0042).
  test.skip(({ browserName }) => browserName !== "chromium", "Storage.overrideQuotaForOrigin is a Chromium DevTools Protocol command");
  test("a data write that hits QuotaExceededError in a fresh worker clears runtime-pages and runtime-data; the precache survives", async ({
    page,
    context,
    fixtureServer,
  }) => {
    fixtureServer.deploy("v3");
    await installAndControl(page, fixtureServer);
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    expect((await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL))).ok).toBe(true);
    // Workbox may finish cache.put after the response reaches the page.
    await expect.poll(async () => dataCacheNames(await snapshotCaches(page)).length).toBe(1);
    const before = await snapshotCaches(page);
    expect([...before.keys()].some((name) => name.includes("runtime-pages"))).toBe(true);

    const session = await context.newCDPSession(page);
    const origin = new URL(fixtureServer.url("/")).origin;
    // A fresh worker lifetime builds only the engines it is asked for, so the reviews read below builds the data
    // engine alone and the pages engine never exists. Workbox's own `purgeOnQuotaError` would clear nothing here:
    // an ExpirationPlugin only purges caches it has already touched in this lifetime (workbox-expiration@7.4.1
    // `_cacheExpirations`), and the failed write is the first touch. Only the worker-wide cleanup (R12) clears both.
    await session.send("ServiceWorker.enable");
    await session.send("ServiceWorker.stopAllWorkers");
    const { usage } = await session.send("Storage.getUsageAndQuota", { origin });
    await session.send("Storage.overrideQuotaForOrigin", { origin, quotaSize: usage });

    try {
      // Stale-while-revalidate miss: the network answer still reaches the page even though its cache write fails.
      expect(await fetchJson(page, fixtureServer.url(RUNTIME_REVIEWS_LIST_URL))).toMatchObject({ ok: true, status: 200 });
      await expect
        // Names only while the worker is still deleting: a snapshot opens caches and can re-create a deleted one.
        .poll(async () => (await cacheNames(page)).filter((name) => name.includes("runtime-")), {
          message: "every runtime cache must be cleared after the quota error",
          timeout: 5_000,
        })
        .toEqual([]);
      expect((await snapshotCaches(page)).get(PRECACHE_CACHE_NAME)).toBe(before.get(PRECACHE_CACHE_NAME));
    } finally {
      await session.send("Storage.overrideQuotaForOrigin", { origin });
    }
  });
});

test.describe("N3: a new version's install must not clear the still-active version's runtime caches (risks-delta N3)", () => {
  // Storage.overrideQuotaForOrigin is a Chromium DevTools Protocol command (ADR-0042).
  test.skip(({ browserName }) => browserName !== "chromium", "Storage.overrideQuotaForOrigin is a Chromium DevTools Protocol command");
  test("a precache write that hits QuotaExceededError while a v2 worker is only installing does not delete v1's runtime-data entry", async ({
    page,
    context,
    fixtureServer,
  }) => {
    fixtureServer.deploy("v3");
    await writeCatalogFile(RUNTIME_CATALOG_ITEMS_URL, { item: "v1-body" });
    await installAndControl(page, fixtureServer);

    // v1 (the worker this test keeps active throughout) writes and serves a runtime-data entry.
    const online = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    expect(online).toMatchObject({ ok: true, body: { item: "v1-body" } });
    await expect.poll(async () => hasCachedEntry(await cacheContents(page), "runtime-data", RUNTIME_CATALOG_ITEMS_URL)).toBe(true);
    fixtureServer.goOffline();
    const offlineBefore = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    expect(offlineBefore, "v1 must serve the entry offline before any v2 install is attempted").toMatchObject({ ok: true, body: { item: "v1-body" } });
    fixtureServer.goOnline();

    const session = await context.newCDPSession(page);
    const origin = new URL(fixtureServer.url("/")).origin;
    // Zero headroom: the very first precache write of the next installing worker throws QuotaExceededError, exactly
    // as review risk R12's fixture does for a runtime-cache write. v1 stays active and controlling throughout — this
    // test never confirms the update, so v1's own runtime cache is the only one that should still exist afterwards.
    const { usage } = await session.send("Storage.getUsageAndQuota", { origin });
    await session.send("Storage.overrideQuotaForOrigin", { origin, quotaSize: usage });

    try {
      // v3-same-config differs byte-for-byte from v3 (V3_FILES_B) but shares v3's runtimeCache configDigest, so this
      // is a genuine new worker version whose install precaches from scratch rather than reusing v1's entries.
      fixtureServer.deploy("v3-same-config");
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
      // The installing worker's install event fails (its precache download rejects with QuotaExceededError), so the
      // browser discards it: `installing` returns to null and no `waiting` worker ever appears.
      await expect
        .poll(
          async () =>
            page.evaluate(async () => {
              const registration = await navigator.serviceWorker.getRegistration();
              return { installing: registration?.installing?.state ?? null, waiting: registration?.waiting !== null && registration?.waiting !== undefined };
            }),
          { message: "the v3-same-config install must fail under zero headroom", timeout: 10_000 },
        )
        .toEqual({ installing: null, waiting: false });

      // N3: the installing worker's global quota-cleanup callback (handlers.ts registerRuntimeCacheQuotaCleanup) must
      // not have deleted the runtime-data cache the still-active v1 worker is serving from.
      expect(hasCachedEntry(await cacheContents(page), "runtime-data", RUNTIME_CATALOG_ITEMS_URL), "v1's runtime-data entry must survive v2's failed install").toBe(
        true,
      );
      fixtureServer.goOffline();
      const offlineAfter = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
      expect(offlineAfter, "v1 must still serve the entry offline after v2's install failed").toMatchObject({ ok: true, body: { item: "v1-body" } });
    } finally {
      fixtureServer.goOnline();
      await session.send("Storage.overrideQuotaForOrigin", { origin });
    }
  });
});

test.describe("activation cleanup", () => {
  test("a new version with the same runtimeCache config clears runtime-pages but keeps the current-digest runtime-data; other caches untouched", async ({
    page,
    fixtureServer,
  }) => {
    fixtureServer.deploy("v3");
    await installAndControl(page, fixtureServer);
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    await createCaches(page, CONTROL_CACHES);

    const before = await snapshotCaches(page);
    expect(before.get(PRECACHE_CACHE_NAME)).toBeGreaterThan(0);
    expect([...before.keys()].some((name) => name.includes("runtime-pages"))).toBe(true);
    const dataCacheBefore = dataCacheNames(before);
    expect(dataCacheBefore).toHaveLength(1);

    await deployAndWait(page, fixtureServer, "v3-same-config");
    await waitForControllerChange(page, () => confirmUpdate(page));
    await waitForActiveWorkerActivated(page);

    const after = await snapshotCaches(page);
    expect([...after.keys()].some((name) => name.includes("runtime-pages")), "runtime-pages must be cleared on every activation").toBe(false);
    expect(dataCacheNames(after), "the current-digest runtime-data cache must survive").toEqual(dataCacheBefore);
    for (const { name, entries } of CONTROL_CACHES) expect(after.get(name), name).toBe(entries);
    expect(after.get(PRECACHE_CACHE_NAME)).toBeGreaterThan(0);
  });

  test("a new version with a changed limit (different configDigest) also clears the stale runtime-data cache", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("v3");
    await installAndControl(page, fixtureServer);
    await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    await createCaches(page, CONTROL_CACHES);

    const before = await snapshotCaches(page);
    const staleDataCache = dataCacheNames(before)[0];
    expect(staleDataCache).toBeDefined();

    await deployAndWait(page, fixtureServer, "v3-changed-limit");
    await waitForControllerChange(page, () => confirmUpdate(page));
    await waitForActiveWorkerActivated(page);

    const afterActivation = await snapshotCaches(page);
    expect(afterActivation.has(staleDataCache!), "the old-digest data cache must be gone").toBe(false);
    expect(dataCacheNames(afterActivation), "nothing has been read yet under the new config").toHaveLength(0);

    // A read under the new (changed-limit) config creates its own, differently-digested data cache.
    await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    const after = await snapshotCaches(page);
    const newDataCaches = dataCacheNames(after);
    expect(newDataCaches).toHaveLength(1);
    expect(newDataCaches[0]).not.toBe(staleDataCache);
    for (const { name, entries } of CONTROL_CACHES) expect(after.get(name), name).toBe(entries);
  });
});

test.describe("recovery clears runtime caches and their expiration records", () => {
  const DATABASE_NAME = "workbox-expiration";
  const OBJECT_STORE_NAME = "cache-entries";

  /** Real workbox-expiration schema, spelled out independently of src/shared/expiration-records.ts (see expiration-records.spec.ts). */
  async function seedExpirationRecord(page: Page, cacheName: string, url: string): Promise<void> {
    await page.evaluate(
      async ({ databaseName, storeName, cacheName: name, url: entryUrl }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(databaseName, 1);
          request.onupgradeneeded = () => {
            request.result.createObjectStore(storeName, { keyPath: "id" }).createIndex("cacheName", "cacheName", { unique: false });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          transaction.objectStore(storeName).put({ id: `${name}|${entryUrl}`, cacheName: name, url: entryUrl, timestamp: Date.now() });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        db.close();
      },
      { databaseName: DATABASE_NAME, storeName: OBJECT_STORE_NAME, cacheName, url },
    );
  }

  async function recordedCacheNames(page: Page): Promise<readonly string[]> {
    return page.evaluate(async ({ databaseName, storeName }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
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
    }, { databaseName: DATABASE_NAME, storeName: OBJECT_STORE_NAME });
  }

  test("no runtime cache and no workbox-expiration record for this app remain; another app's record survives", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("v3");
    await installAndControl(page, fixtureServer);
    await page.goto(fixtureServer.url(RUNTIME_DASHBOARD_URL));
    await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    await seedExpirationRecord(page, "other-app:production:r1:runtime-pages", `${fixtureServer.origin}/other/`);

    const beforeRecords = await recordedCacheNames(page);
    expect(beforeRecords.some((name) => name.startsWith(APP_CACHE_PREFIX))).toBe(true);

    await waitForControllerChange(page, async () => {
      fixtureServer.deploy("recovery");
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
    });
    await waitForActiveWorkerActivated(page);

    const after = await snapshotCaches(page);
    expect([...after.keys()].some((name) => name.startsWith(APP_CACHE_PREFIX) && name.includes("runtime-"))).toBe(false);

    const afterRecords = await recordedCacheNames(page);
    expect(afterRecords.some((name) => name.startsWith(APP_CACHE_PREFIX)), "no record of this app must remain").toBe(false);
    expect(afterRecords).toContain("other-app:production:r1:runtime-pages");
  });
});

test.describe("v2 unchanged", () => {
  test("a v2 fixture that declares public-data + network-first never writes a runtime cache", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("v2-runtime-declared");
    await installAndControl(page, fixtureServer);

    const online = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    expect(online.ok).toBe(true);

    fixtureServer.goOffline();
    const offline = await fetchJson(page, fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL));
    expect(offline.ok, "v1/v2 must never runtime-cache, offline read is a network error").toBe(false);

    const contents = await cacheContents(page);
    expect(Object.keys(contents).some((name) => name.includes("runtime-"))).toBe(false);
  });
});
