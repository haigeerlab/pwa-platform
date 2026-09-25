import type { Page } from "@playwright/test";
import { appCachePrefix, cacheName } from "@pwa-platform/contracts";
import {
  createCaches,
  diffCacheSnapshots,
  expect,
  expectCacheControl,
  expectDeletedExactlyUnderPrefix,
  fixturePath,
  registerWorker,
  snapshotCaches,
  test,
  waitForController,
  type CacheSnapshot,
  type FixtureServer,
} from "../src/index.js";

const identity = { appId: "shop", environment: "prod", cacheNamespaceSeed: "r2" } as const;
const prefix = appCachePrefix(identity);

// The control group of the recovery drill (docs/operations/recovery-drill.md).
const currentRevision = cacheName(identity, "precache");
const oldRevision = cacheName({ ...identity, cacheNamespaceSeed: "r1" }, "precache");
const otherEnvironment = cacheName({ ...identity, environment: "staging" }, "precache");
const appSharingPrefixText = cacheName({ ...identity, appId: "shop-admin" }, "precache");
const containsPrefixOnly = `legacy-${prefix}backup`;
const nonPlatform = "workbox-runtime";

async function prepareControlGroup(page: Page, fixtureServer: FixtureServer): Promise<CacheSnapshot> {
  await page.goto(fixtureServer.url("/"));
  await createCaches(page, [
    { name: currentRevision, entries: 2 },
    { name: oldRevision },
    { name: otherEnvironment },
    { name: appSharingPrefixText, entries: 3 },
    { name: containsPrefixOnly },
    { name: nonPlatform },
  ]);
  return snapshotCaches(page);
}

async function deleteCaches(page: Page, names: readonly string[]): Promise<void> {
  await page.evaluate(async (list) => {
    for (const name of list) await caches.delete(name);
  }, names);
}

test.describe("cache snapshots", () => {
  test("snapshotCaches records every cache with its entry count", async ({ page, fixtureServer }) => {
    const snapshot = await prepareControlGroup(page, fixtureServer);

    expect(Object.fromEntries(snapshot)).toEqual({
      [currentRevision]: 2,
      [oldRevision]: 1,
      [otherEnvironment]: 1,
      [appSharingPrefixText]: 3,
      [containsPrefixOnly]: 1,
      [nonPlatform]: 1,
    });
  });

  test("createCaches rejects caches without entries", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    await expect(createCaches(page, [{ name: "empty", entries: 0 }])).rejects.toThrow(/at least one entry/);
    expect((await snapshotCaches(page)).size).toBe(0);
  });
});

test.describe("exact deletion under the app prefix", () => {
  test("a worker that deletes the app prefix passes", async ({ page, fixtureServer }) => {
    const before = await prepareControlGroup(page, fixtureServer);
    const scriptUrl = `/cleanup-worker.js?prefix=${encodeURIComponent(prefix)}`;

    await registerWorker(page, { scriptUrl });
    await waitForController(page, scriptUrl);
    const after = await snapshotCaches(page);

    expect(diffCacheSnapshots(before, after)).toEqual({ deleted: [oldRevision, currentRevision].sort(), added: [], changed: [] });
    expect(() => expectDeletedExactlyUnderPrefix(before, after, prefix)).not.toThrow();
  });

  test("deleting fewer caches fails", async ({ page, fixtureServer }) => {
    const before = await prepareControlGroup(page, fixtureServer);
    await deleteCaches(page, [currentRevision]);

    const after = await snapshotCaches(page);
    expect(() => expectDeletedExactlyUnderPrefix(before, after, prefix)).toThrow(/not deleted/);
  });

  test("deleting more caches fails", async ({ page, fixtureServer }) => {
    const before = await prepareControlGroup(page, fixtureServer);
    await deleteCaches(page, [currentRevision, oldRevision, otherEnvironment]);

    const after = await snapshotCaches(page);
    expect(() => expectDeletedExactlyUnderPrefix(before, after, prefix)).toThrow(/deleted outside the prefix/);
  });

  test("changing the entry count of a kept cache fails", async ({ page, fixtureServer }) => {
    const before = await prepareControlGroup(page, fixtureServer);
    await deleteCaches(page, [currentRevision, oldRevision]);
    await createCaches(page, [{ name: appSharingPrefixText, entries: 4 }]);

    const after = await snapshotCaches(page);
    expect(() => expectDeletedExactlyUnderPrefix(before, after, prefix)).toThrow(/entry counts changed/);
  });
});

test.describe("Cache-Control of real responses", () => {
  test.use({
    fixtureSite: {
      versions: { site: fixturePath("pages") },
      headerRules: [
        { pathPrefix: "/", headers: { "Cache-Control": "no-cache" } },
        { pathPrefix: "/versioned-worker.js", headers: { "Cache-Control": "Public, MAX-AGE=31536000 , Immutable" } },
        { pathPrefix: "/no-fetch-worker.js", headers: { "Cache-Control": ["no-cache", "immutable"] } },
      ],
    },
  });

  test("expectCacheControl detects and rejects directives set by the server", async ({ page, fixtureServer }) => {
    const document = await page.goto(fixtureServer.url("/"));
    if (document === null) throw new Error("navigation produced no response");
    expectCacheControl(document, { include: ["no-cache"], exclude: ["immutable", "no-store"] });
    expect(() => expectCacheControl(document, { include: ["immutable"] })).toThrow(/missing \[immutable\]/);

    const asset = await page.request.get(fixtureServer.url("/versioned-worker.js"));
    expectCacheControl(asset, { include: ["immutable", "max-age=*", "max-age=31536000"], exclude: ["no-cache", "no-store"] });
    expect(() => expectCacheControl(asset, { exclude: ["immutable"] })).toThrow(/forbidden \[immutable\]/);
    expect(() => expectCacheControl(asset, { include: ["max-age"] })).toThrow(/missing \[max-age\]/);
  });

  test("a directive sent on a second header line is not missed", async ({ page, fixtureServer }) => {
    const navigated = await page.goto(fixtureServer.url("/no-fetch-worker.js"));
    if (navigated === null) throw new Error("navigation produced no response");
    expect(() => expectCacheControl(navigated, { exclude: ["immutable"] })).toThrow(/forbidden \[immutable\]/);

    const fetched = await page.request.get(fixtureServer.url("/no-fetch-worker.js"));
    expect(() => expectCacheControl(fetched, { exclude: ["immutable"] })).toThrow(/forbidden \[immutable\]/);
    expectCacheControl(fetched, { include: ["no-cache", "immutable"] });
  });
});
