import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import {
  createCaches,
  expect,
  readRegistration,
  requestFromPage,
  snapshotCaches,
  test,
  waitForController,
  waitForControllerChange,
  waitForWorkerState,
  type FixtureServer,
} from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, PLAN, PLAN_V2, PRECACHE_CACHE_NAME, SITE_V2_SOURCE, WORKER_URL } from "./fixture-site.js";
import {
  askWorker,
  cacheContents,
  engineState,
  installEngineWorker,
  matchInWorker,
  waitForActivatedController,
  waitForActiveWorkerActivated,
} from "./worker-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

/**
 * Same-origin caches the engine must leave alone: another identity revision of the same app, another app, another
 * cache under the same namespace, and a cache the platform does not own.
 */
const OTHER_CACHES = [
  { name: "pwa:engine-fixture:staging:a0:precache", entries: 2 },
  { name: "pwa:other-app:staging:b1:precache", entries: 1 },
  { name: "pwa:engine-fixture:staging:b1:runtime", entries: 1 },
  { name: "workbox-precache-v2-http://localhost/", entries: 3 },
] as const;

/** Request URLs stored in each of `OTHER_CACHES`. */
async function otherCacheContents(page: Page): Promise<Record<string, string[]>> {
  const contents = await cacheContents(page);
  return Object.fromEntries(OTHER_CACHES.map(({ name }) => [name, contents[name] ?? []]));
}

/** Reloads the page so the installed v1 worker controls it. */
async function reloadUnderV1(page: Page): Promise<void> {
  await page.reload();
  await waitForController(page, WORKER_URL);
}

/** Deploys v2 of the site, asks the registration to update and waits until v2 has installed and waits. */
async function deployV2(page: Page, fixtureServer: FixtureServer): Promise<void> {
  fixtureServer.deploy("v2");
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
  await waitForWorkerState(page, "/", "waiting");
}

test.describe("activate", () => {
  test("after the new version takes over, removes only entries dropped from the manifest and keeps other caches intact", async ({
    page,
    fixtureServer,
  }) => {
    await installEngineWorker(page, fixtureServer.origin);
    await createCaches(page, OTHER_CACHES);
    const before = await snapshotCaches(page);
    expect(before).toEqual(new Map([[PRECACHE_CACHE_NAME, 3], ...OTHER_CACHES.map(({ name, entries }): [string, number] => [name, entries])]));
    const othersBefore = await otherCacheContents(page);

    await reloadUnderV1(page);
    await deployV2(page, fixtureServer);

    expect(await engineState(page, "waiting")).toMatchObject({
      install: {
        updatedUrls: [fixtureServer.url("/assets/app.9e8d7c6b.js"), fixtureServer.url("/assets/logo.svg")],
        notUpdatedUrls: [fixtureServer.url("/offline.html")],
      },
    });
    // Installing v2 only adds entries; both revisions of the logo sit side by side until v2 activates.
    expect((await cacheContents(page))[PRECACHE_CACHE_NAME]).toHaveLength(5);

    await waitForControllerChange(page, () => askWorker(page, "waiting", { type: "skipWaiting" }));
    await waitForActivatedController(page);

    expect(await engineState(page, "active")).toEqual({
      urls: PLAN_V2.precache.map(({ url }) => url),
      install: expect.anything(),
      activate: {
        deletedUrls: [fixtureServer.url("/assets/app.3f9a2c7d.js"), fixtureServer.url("/assets/logo.svg?__WB_REVISION__=a1b2c3d4e5f60718")],
      },
    });
    expect((await cacheContents(page))[PRECACHE_CACHE_NAME]).toEqual([
      fixtureServer.url("/assets/app.9e8d7c6b.js"),
      fixtureServer.url("/assets/logo.svg?__WB_REVISION__=b2c3d4e5f6071829"),
      fixtureServer.url("/offline.html?__WB_REVISION__=7d793037a0760186"),
    ]);
    expect(await matchInWorker(page, "/assets/logo.svg")).toEqual({
      found: true,
      status: 200,
      body: readFileSync(join(SITE_V2_SOURCE, "assets/logo.svg"), "utf8"),
    });
    expect(await snapshotCaches(page)).toEqual(before);
    expect(await otherCacheContents(page)).toEqual(othersBefore);
  });
});

test.describe("port boundaries", () => {
  test("the engine neither intercepts requests, claims clients nor skips waiting", async ({ page, fixtureServer }) => {
    await installEngineWorker(page, fixtureServer.origin);
    // Wait until activation has finished and give a late clients.claim() time to take effect.
    await waitForActiveWorkerActivated(page);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);

    await reloadUnderV1(page);
    await deployV2(page, fixtureServer);
    for (const url of ["/offline.html", "/assets/logo.svg", "/index.html"]) {
      expect(await requestFromPage(page, url), url).toEqual({ outcome: "response", status: 200, fromServiceWorker: false });
    }

    // Give an unwanted skipWaiting time to take effect before checking that v2 still waits behind v1.
    await page.waitForTimeout(1_000);
    expect((await readRegistration(page, "/"))?.waiting).toBe(fixtureServer.url(WORKER_URL));
    expect((await engineState(page, "active")).urls).toEqual(PLAN.precache.map(({ url }) => url));
    expect((await engineState(page, "waiting")).urls).toEqual(PLAN_V2.precache.map(({ url }) => url));
  });
});
