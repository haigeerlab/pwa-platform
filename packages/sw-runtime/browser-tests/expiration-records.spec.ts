// Real-browser coverage for src/shared/expiration-records.ts (ADR-0035, "过期记录与缓存一起清理", T8 follow-up).
// The record-seeding and record-reading helpers below write and read `workbox-expiration` with the documented
// workbox-expiration@7.4.1 schema, spelled out independently of src/shared/expiration-records.ts. The page itself
// calls the actual bundled `deleteExpirationRecords` (via expiration-records-test-entry.ts), not a reimplementation.
//
// This is NOT a guard against Workbox changing that schema (T13 review, 2026-09-24): the records below are seeded by
// hand to the schema as documented, not written by Workbox itself, so a real drift in the library would not make
// this file fail — both the seed and `deleteExpirationRecords` would keep agreeing on the same (now stale)
// shape. The real guards are the tests that seed nothing and instead assert a *Workbox-written* record exists
// before cleanup runs: `packages/sw-runtime/browser-tests/runtime-cache.spec.ts` ("recovery clears runtime caches
// and their expiration records") and `packages/client-runtime/browser-tests/served-from-cache.spec.ts` ("logout
// clears the runtime cache and its expiration records"). A schema change severe enough to break record deletion
// would empty their "before" assertion or fail their "after" one.
import type { Page } from "@playwright/test";
import { expect, test } from "@pwa-platform/browser-test-harness";
import { APP_CACHE_PREFIX, EXPIRATION_RECORDS_TEST_URL, FIXTURE_SITE, SHELL_URL } from "./fixture-site.js";

test.use({ fixtureSite: FIXTURE_SITE });

const DATABASE_NAME = "workbox-expiration";
const OBJECT_STORE_NAME = "cache-entries";

async function loadTestEntry(page: Page): Promise<void> {
  await page.addScriptTag({ url: EXPIRATION_RECORDS_TEST_URL });
}

/** Writes one record with workbox-expiration's own schema, independently of the module under test. */
async function seedExpirationRecord(page: Page, cacheName: string, url: string): Promise<void> {
  await page.evaluate(
    async ({ databaseName, storeName, cacheName, url }) => {
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
        transaction.objectStore(storeName).put({ id: `${cacheName}|${url}`, cacheName, url, timestamp: Date.now() });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    },
    { databaseName: DATABASE_NAME, storeName: OBJECT_STORE_NAME, cacheName, url },
  );
}

/** Every remaining record's `cacheName`, read independently of the module under test. */
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

async function databaseExists(page: Page): Promise<boolean> {
  return page.evaluate(async (databaseName) => (await indexedDB.databases()).some(({ name }) => name === databaseName), DATABASE_NAME);
}

/** Calls the real, bundled `deleteExpirationRecords` (window.__pwaDeleteExpirationRecords) with a prefix predicate. */
async function deleteUnderPrefix(page: Page, prefix: string): Promise<void> {
  await page.evaluate(
    (appCachePrefix) =>
      (window as unknown as { readonly __pwaDeleteExpirationRecords: (matches: (name: string) => boolean) => Promise<void> }).__pwaDeleteExpirationRecords(
        (name) => name.startsWith(appCachePrefix),
      ),
    prefix,
  );
}

test.describe("workbox-expiration record cleanup", () => {
  test("deletes only matching records in the documented workbox-expiration schema", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await loadTestEntry(page);
    await seedExpirationRecord(page, `${APP_CACHE_PREFIX}r1:runtime-pages`, `${fixtureServer.origin}/app/`);
    await seedExpirationRecord(page, "other-app:production:r1:runtime-pages", `${fixtureServer.origin}/other/`);

    await deleteUnderPrefix(page, APP_CACHE_PREFIX);

    expect(await recordedCacheNames(page)).toEqual(["other-app:production:r1:runtime-pages"]);
  });

  test("never creates the workbox-expiration database when it did not already exist", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await loadTestEntry(page);
    expect(await databaseExists(page)).toBe(false);

    await deleteUnderPrefix(page, APP_CACHE_PREFIX);

    expect(await databaseExists(page)).toBe(false);
  });
});
