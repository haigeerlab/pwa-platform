// The recovery drill (docs/operations/recovery-drill.md) executed in a real browser, for both examples.
//
// Every cache name is computed with the contracts helpers rather than written out: the drill says so, and a
// hand-written name would silently stop matching the moment the namespace rules change.
import {
  cacheNames,
  createCaches,
  expect,
  expectDeletedExactlyUnderPrefix,
  requestFromPage,
  snapshotCaches,
  test,
  waitForControllerChange,
  waitForWorkerState,
  type CacheSnapshot,
  type FixtureServer,
} from "@pwa-platform/browser-test-harness";
import { appCachePrefix, cacheName } from "@pwa-platform/contracts";
import type { Page } from "@playwright/test";
import { IDENTITY, SHELL_URL, WORKER_URL } from "../apps/shared/identity.js";
import { cacheEntryCount, checkForUpdate, installAndControl, waitForActivatedWorker, keepWebKitOffPushManager } from "./page.js";
import { readShippedWorker } from "./release.js";
import { EXAMPLES, fixtureSite, type ExampleName } from "./sites.js";

const PRECACHE = cacheName(IDENTITY, "precache");
const APP_PREFIX = appCachePrefix(IDENTITY);

/**
 * The drill's control caches. Only the first one shares this app's prefix, so only it may be deleted.
 *
 * The third is the interesting one: its `appId` starts with the app's own id. Because every segment is
 * percent-encoded and separated by `:`, its prefix still cannot be a prefix of this app's — that is the property
 * the drill asks to have exercised rather than assumed.
 */
const CONTROL_CACHES = [
  { name: cacheName({ ...IDENTITY, cacheNamespaceSeed: "r0" }, "precache"), entries: 2, kept: false },
  { name: cacheName({ ...IDENTITY, environment: "staging" }, "precache"), entries: 3, kept: true },
  { name: cacheName({ ...IDENTITY, appId: `${IDENTITY.appId}-legacy` }, "precache"), entries: 1, kept: true },
  { name: "example-app-shell-v1", entries: 1, kept: true },
] as const;

/** Drill step 1: the app is installed, its precache is filled, and the control caches are in place. */
async function prepareCaches(page: Page, fixtureServer: FixtureServer, example: ExampleName): Promise<CacheSnapshot> {
  await installAndControl(page, fixtureServer);
  // The drill asks for the entries `PwaPlan.precache` lists, not merely for a non-empty cache: the count comes from
  // the manifest the shipped worker carries, so a precache that silently dropped an entry fails here.
  const { precache } = await readShippedWorker(example, "v1");
  await expect.poll(() => cacheEntryCount(page, PRECACHE)).toBe(precache.length);
  await createCaches(page, CONTROL_CACHES);

  const before = await snapshotCaches(page);
  expect([...before.keys()].sort()).toEqual([PRECACHE, ...CONTROL_CACHES.map(({ name }) => name)].sort());
  return before;
}

/** Drill step 2: the recovery worker is published at the service worker URL and takes over on its own. */
async function deployRecovery(page: Page, fixtureServer: FixtureServer): Promise<void> {
  // No user action between the deployment and the takeover: the trigger only asks the registration to look for a
  // new worker, which is what a browser does by itself. `waitForControllerChange` fails if no takeover happens.
  const after = await waitForControllerChange(page, async () => {
    fixtureServer.deploy("recovery");
    await checkForUpdate(page);
  });
  expect(after.waiting).toBeNull();
  expect(after.active).toBe(fixtureServer.url(WORKER_URL));

  // The takeover arrives *before* the cleanup finishes. `skipWaiting()` hands the registration's clients to the
  // new worker at the start of activation, so `controllerchange` fires while the `activate` handler's waitUntil —
  // which is where the caches are deleted — is still running. Observed: snapshotting right after the controller
  // changed found every cache still in place, and a 1500 ms wait found them all gone. The worker reaching
  // "activated" is the event that means the cleanup settled; waiting on the caches themselves would be assuming
  // the answer the drill is asking for.
  await waitForActivatedWorker(page);
}

for (const example of EXAMPLES) {
  test.describe(`${example} example · recovery`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    // ADR-0042: Playwright's WebKit loses the page when the React example's push panel queries PushManager.
    if (example === "react") {
      test.beforeEach(async ({ context, browserName }) => keepWebKitOffPushManager(context, browserName));
    }

    test("the recovery worker takes over and deletes exactly this app's caches", async ({ page, fixtureServer }) => {
      const before = await prepareCaches(page, fixtureServer, example);
      await deployRecovery(page, fixtureServer);

      // Drill step 3, deletion set: taken before anything else can add a cache, because the assertion also
      // requires that nothing was created.
      const after = await snapshotCaches(page);
      expectDeletedExactlyUnderPrefix(before, after, APP_PREFIX);

      // The same outcome read off the drill's table row by row. `expectDeletedExactlyUnderPrefix` derives the
      // expected set from the prefix, so it would agree with a wrong prefix; these four say which cache is
      // supposed to go and which are supposed to survive untouched.
      expect(after.has(PRECACHE)).toBe(false);
      for (const { name, entries, kept } of CONTROL_CACHES) {
        expect({ name, entries: after.get(name) ?? null }).toEqual({ name, entries: kept ? entries : null });
      }
    });

    // Review risk R14. ADR-0012 reads "先删除以应用缓存前缀开头的全部缓存，再接管已打开的客户端" (delete this
    // app's caches, *then* take over already-open clients) — describing the `recover()` function's own program
    // order (cache deletion is awaited before `clients.claim()`). That is the SW-side call order; it is not what an
    // already-controlled page observes. Measured directly (Date.now(), shared clock, three independent runs): for a
    // page controlled by the old platform worker before recovery deploys, `controllerchange` fires roughly 1–1.5s
    // *before* the app's precache becomes empty from that page's point of view, and before the recovery worker's
    // own `indexedDB.deleteDatabase` call for the offline-write database even reaches an open connection (see the
    // next test). The ordering is a race the platform does not control, so this test pins only what always holds:
    // the page is handed to the recovery worker without waiting for "activated", and the cleanup then completes.
    // It deliberately does not assert that the precache is still present at takeover — that would pin a timing
    // outcome that a faster machine or another Chrome build may legitimately change (ADR-0012 amendment 2026-09-28).
    test("an already-controlled page is taken over without waiting for cleanup, and cleanup still completes", async ({
      page,
      fixtureServer,
    }) => {
      await prepareCaches(page, fixtureServer, example);

      // Unlike `deployRecovery`, this stops the instant the browser hands control over; it does not also wait for
      // "activated" (which is what makes the cleanup-has-settled assumption safe elsewhere in this file).
      const after = await waitForControllerChange(page, async () => {
        fixtureServer.deploy("recovery");
        await checkForUpdate(page);
      });
      expect(after.active).toBe(fixtureServer.url(WORKER_URL));

      // Whatever the page saw at the instant of takeover, the cleanup must still finish afterwards.
      // Names only while recovery is still deleting: a snapshot opens caches and can re-create a deleted one.
      await expect.poll(async () => (await cacheNames(page)).includes(PRECACHE)).toBe(false);
    });

    // Review risk R14, fault injection. A page-held connection to the same database name the recovery worker always
    // computes from identity (packages/sw-runtime/src/build/config.ts — derived unconditionally, even though this
    // example never enables offline-write), deliberately left open with no `onversionchange` handler that closes it.
    //
    // Measured in Chrome (2026-09-28): `indexedDB.deleteDatabase` fires "blocked" and the browser does not release
    // it on its own while the connection stays open. `deleteOfflineWriteDatabase` (recovery-worker/index.ts) waits a
    // bounded 3 s past "blocked" for the deletion to finish — the platform's own store closes each connection when
    // its transaction ends, so a legitimate block clears in milliseconds — and then fails closed. Recovery therefore
    // still activates a few seconds later, every cache of this app is still deleted (the #15 rule: one failed
    // deletion does not stop the others), and only the database stays behind. The sw-runtime suite covers the
    // no-claim and the closes-later outcomes ("recovery with a blocked deletion (R14 residue)").
    test("a page holding the offline-write database open delays recovery by the bounded wait but every cache is still deleted", async ({
      page,
      fixtureServer,
    }) => {
      const before = await prepareCaches(page, fixtureServer, example);

      const offlineWriteDatabaseName = `pwa-offline-write:${IDENTITY.appId}:${IDENTITY.environment}:${IDENTITY.cacheNamespaceSeed}`;
      await page.evaluate(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () => request.result.createObjectStore("queue");
            request.onsuccess = () => {
              // Kept alive on window so it is not garbage-collected; deliberately no onversionchange handler that
              // closes it, which is the fault this test injects.
              (window as unknown as { __heldOfflineWriteDb: IDBDatabase }).__heldOfflineWriteDb = request.result;
              resolve();
            };
            request.onerror = () => reject(request.error);
          }),
        offlineWriteDatabaseName,
      );

      await deployRecovery(page, fixtureServer);

      const after = await snapshotCaches(page);
      expectDeletedExactlyUnderPrefix(before, after, APP_PREFIX);
    });

    test("the recovery worker serves nothing, online or offline", async ({ page, fixtureServer }) => {
      await prepareCaches(page, fixtureServer, example);

      // The request has to be one the platform worker would answer, or "not answered by a worker" proves nothing
      // about which worker is in charge. A fetch of the shell URL is not a navigation, so the platform worker lets
      // it through too (found in the T9 review); a precached asset is served from its cache. The control below
      // establishes that before the recovery worker arrives, so the assertion after it can only pass because the
      // worker in charge changed.
      const { precache } = await readShippedWorker(example, "v1");
      const precached = precache[0]?.url;
      if (precached === undefined) throw new Error("The shipped worker precaches nothing; this check needs one entry");
      expect(await requestFromPage(page, fixtureServer.url(precached))).toMatchObject({
        outcome: "response",
        status: 200,
        fromServiceWorker: true,
      });

      await deployRecovery(page, fixtureServer);

      // Drill step 3, no fetch interception. `fromServiceWorker` stays false only when no fetch handler produced
      // the response — a handler that merely forwarded to the network would still set it. The server-side record
      // is the second witness: the request really left the page instead of being answered locally.
      fixtureServer.clearRequests();
      const online = await requestFromPage(page, fixtureServer.url(precached));
      expect(online).toMatchObject({ outcome: "response", status: 200, fromServiceWorker: false });
      expect(fixtureServer.requests().map(({ path }) => path)).toContain(precached);

      // Offline, a resource that was precached must fail rather than come back from a cache — the drill's wording.
      // On its own this cannot tell "no interception" from "intercepted, but the cache is gone"; that is why the
      // check above exists, and why the drill also leans on sw-runtime's unit test that no fetch listener exists.
      // Cut at the fixture server, not context.setOffline: this reaches the service worker's own fetch in every
      // engine (spec/browser-test-harness.md "增补：服务器端断网与网络故障").
      fixtureServer.goOffline();
      try {
        const offline = await requestFromPage(page, fixtureServer.url(precached));
        expect(offline.outcome).toBe("network-error");
      } finally {
        fixtureServer.goOnline();
      }
    });

    test("deploying the fixed worker refills the precache and restores offline start", async ({
      page,
      fixtureServer,
    }) => {
      await prepareCaches(page, fixtureServer, example);
      await deployRecovery(page, fixtureServer);
      expect(await cacheEntryCount(page, PRECACHE)).toBeNull();

      // Drill step 4: the fixed worker arrives through the normal update flow — it waits and the user confirms.
      //
      // Wait for the waiting slot, not for the prompt. The slot is the worker fact this recovery step needs; the
      // prompt is only a page-side consequence and the recovery worker's controllerchange now clears its transient
      // state. Waiting on the prompt would still fail to prove that the fixed v1 worker itself is ready.
      fixtureServer.deploy("v1");
      await checkForUpdate(page);
      await waitForWorkerState(page, SHELL_URL, "waiting", { timeout: 15_000 });
      await expect.poll(() => page.locator("#apply-update").isVisible()).toBe(true);
      await waitForControllerChange(page, async () => {
        await page.locator("#apply-update").click();
      });
      await expect.poll(() => cacheEntryCount(page, PRECACHE)).toBeGreaterThan(0);

      fixtureServer.goOffline();
      try {
        await page.reload();
        await expect.poll(() => page.locator("#shell").isVisible()).toBe(true);
        await expect.poll(() => page.locator("#version").textContent()).toBe("v1");
      } finally {
        fixtureServer.goOnline();
      }
    });
  });
}
