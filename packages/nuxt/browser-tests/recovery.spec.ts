// Scenario 7 (tasks/ssr-adapters/plan.md, T7, T7b), following docs/operations/recovery-drill.md step 2 onward.
//
// T7 measured (empirically, against the "artifacts" unit-test fixture's own build) that a real Nitro node-server
// build freezes each static file's Content-Length/etag at build time, so overwriting .output/public/sw.js on disk
// with the recovery worker's bytes *after* the build produces a corrupted response (a stale Content-Length
// truncated the body). T7b's fix (spec decision 19) is the module's own `recoveryRelease` build-time switch: this
// file now deploys a real build made with it on, not a post-build byte-swap — see global-setup.ts's "recovery"
// variant and src/artifacts.ts's `applyRecoveryRelease`.
import { createCaches, expect, expectDeletedExactlyUnderPrefix, requestFromPage, snapshotCaches, test, waitForControllerChange, type CacheSnapshot } from "@pwa-platform/browser-test-harness";
import { appCachePrefix, cacheName } from "@pwa-platform/contracts";
import type { Page } from "@playwright/test";
import { publicDir, serverEntry } from "./global-setup.js";
import { cacheEntryCount, checkForUpdate, installAndControl, waitForActivatedWorker } from "./page.js";
import { readShippedPrecache } from "./release.js";
import { IDENTITY } from "./site/pwa-config.js";
import { startNuxtServer, type NuxtServer } from "./servers.js";
import { WORKER_URL } from "./urls.js";

const PRECACHE = cacheName(IDENTITY, "precache");
const APP_PREFIX = appCachePrefix(IDENTITY);

/** Only the first cache shares this app's prefix, so only it may be deleted (recovery-drill.md's control table). */
const CONTROL_CACHES = [
  { name: cacheName({ ...IDENTITY, cacheNamespaceSeed: "r0" }, "precache"), entries: 2, kept: false },
  { name: cacheName({ ...IDENTITY, environment: "staging" }, "precache"), entries: 3, kept: true },
  { name: cacheName({ ...IDENTITY, appId: `${IDENTITY.appId}-legacy` }, "precache"), entries: 1, kept: true },
  { name: "nuxt-e2e-non-platform-cache", entries: 1, kept: true },
] as const;

/** Drill step 1: installed, precache filled to what the build shipped, control caches in place. */
async function prepareCaches(page: Page, server: NuxtServer): Promise<CacheSnapshot> {
  await installAndControl(page, server);
  const shipped = await readShippedPrecache(publicDir("manual", "v1"));
  await expect.poll(() => cacheEntryCount(page, PRECACHE)).toBe(shipped.length);
  await createCaches(page, CONTROL_CACHES);

  const before = await snapshotCaches(page);
  expect([...before.keys()].sort()).toEqual([PRECACHE, ...CONTROL_CACHES.map(({ name }) => name)].sort());
  return before;
}

/** Drill step 2: a real `recoveryRelease: true` build is deployed at the platform worker's own URL and takes over
 * on its own. */
async function deployRecovery(page: Page, server: NuxtServer): Promise<void> {
  const after = await waitForControllerChange(page, async () => {
    await server.deploy(serverEntry("recovery", "v1"));
    await checkForUpdate(page);
  });
  expect(after.waiting).toBeNull();
  expect(after.active).toBe(server.url(WORKER_URL));
  await waitForActivatedWorker(page);
}

test.describe("recovery", () => {
  let server: NuxtServer;

  test.beforeEach(async () => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("manual", "v1"));
  });

  test.afterEach(async () => {
    await server.close();
  });

  test("the recovery worker takes over and deletes exactly this app's caches", async ({ page }) => {
    const before = await prepareCaches(page, server);
    await deployRecovery(page, server);

    const after = await snapshotCaches(page);
    expectDeletedExactlyUnderPrefix(before, after, APP_PREFIX);

    expect(after.has(PRECACHE)).toBe(false);
    for (const { name, entries, kept } of CONTROL_CACHES) {
      expect({ name, entries: after.get(name) ?? null }).toEqual({ name, entries: kept ? entries : null });
    }
  });

  test("the recovery worker serves nothing, online or offline", async ({ page, context }) => {
    await prepareCaches(page, server);
    const shipped = await readShippedPrecache(publicDir("manual", "v1"));
    const precached = shipped[0]?.url;
    if (precached === undefined) throw new Error("The shipped precache is empty; this check needs one entry");
    expect(await requestFromPage(page, server.url(precached))).toMatchObject({
      outcome: "response",
      status: 200,
      fromServiceWorker: true,
    });

    await deployRecovery(page, server);

    server.clearRequests();
    const online = await requestFromPage(page, server.url(precached));
    expect(online).toMatchObject({ outcome: "response", status: 200, fromServiceWorker: false });
    expect(server.requests().map(({ path }) => path)).toContain(precached);

    await context.setOffline(true);
    try {
      const offline = await requestFromPage(page, server.url(precached));
      expect(offline.outcome).toBe("network-error");
    } finally {
      await context.setOffline(false);
    }
  });
});
