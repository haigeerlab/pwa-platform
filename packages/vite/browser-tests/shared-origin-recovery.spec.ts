// T7 scenario 5: on a shared origin, each app's recovery worker (docs/operations/recovery-drill.md) must delete
// only its own app's caches — never its sibling's, and never a cache that belongs to neither.
import {
  createCaches,
  expect,
  expectDeletedExactlyUnderPrefix,
  snapshotCaches,
  test,
  waitForController,
  waitForControllerChange,
} from "@pwa-platform/browser-test-harness";
import { appCachePrefix, cacheName } from "@pwa-platform/contracts";
import {
  CHILD_IDENTITY,
  CHILD_SHELL_URL,
  CHILD_WORKER_URL,
  ROOT_IDENTITY,
  ROOT_SHELL_URL,
  ROOT_WORKER_URL,
  SHARED_ORIGIN_SITE,
  UNRELATED_CACHE_NAME,
} from "./shared-origin-fixture-site.js";
import { installAndControl, waitForActiveWorkerActivated } from "./page-probe.js";

test.use({ fixtureSite: SHARED_ORIGIN_SITE });

const ROOT_PRECACHE = cacheName(ROOT_IDENTITY, "precache");
const CHILD_PRECACHE = cacheName(CHILD_IDENTITY, "precache");
const ROOT_APP_PREFIX = appCachePrefix(ROOT_IDENTITY);
const CHILD_APP_PREFIX = appCachePrefix(CHILD_IDENTITY);

test.describe("recovery isolation on a shared origin (ADR-0019)", () => {
  test("the root app's recovery worker deletes exactly the root app's caches", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);
    await installAndControl(page, fixtureServer, CHILD_SHELL_URL, CHILD_WORKER_URL);
    await createCaches(page, [{ name: UNRELATED_CACHE_NAME, entries: 1 }]);

    const before = await snapshotCaches(page);
    expect([...before.keys()].sort()).toEqual([CHILD_PRECACHE, ROOT_PRECACHE, UNRELATED_CACHE_NAME].sort());

    // installAndControl finished on the child page; the root's recovery worker has to be picked up from a page the
    // root worker actually controls.
    await page.goto(fixtureServer.url(ROOT_SHELL_URL));
    await waitForController(page, ROOT_WORKER_URL);

    const after1 = await waitForControllerChange(page, async () => {
      fixtureServer.deploy("root-recovery");
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
    });
    expect(after1.waiting).toBeNull();
    expect(after1.active).toBe(fixtureServer.url(ROOT_WORKER_URL));
    await waitForActiveWorkerActivated(page, { scope: ROOT_SHELL_URL });

    const after = await snapshotCaches(page);
    expectDeletedExactlyUnderPrefix(before, after, ROOT_APP_PREFIX);
    expect(after.has(ROOT_PRECACHE)).toBe(false);
    expect(after.get(CHILD_PRECACHE)).toBe(before.get(CHILD_PRECACHE));
    expect(after.get(UNRELATED_CACHE_NAME)).toBe(before.get(UNRELATED_CACHE_NAME));
  });

  test("the child app's recovery worker deletes exactly the child app's caches", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);
    await installAndControl(page, fixtureServer, CHILD_SHELL_URL, CHILD_WORKER_URL);
    await createCaches(page, [{ name: UNRELATED_CACHE_NAME, entries: 1 }]);

    const before = await snapshotCaches(page);
    expect([...before.keys()].sort()).toEqual([CHILD_PRECACHE, ROOT_PRECACHE, UNRELATED_CACHE_NAME].sort());

    // Already on the child page, which the child worker controls.
    const after1 = await waitForControllerChange(page, async () => {
      fixtureServer.deploy("child-recovery");
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
    });
    expect(after1.waiting).toBeNull();
    expect(after1.active).toBe(fixtureServer.url(CHILD_WORKER_URL));
    await waitForActiveWorkerActivated(page, { scope: CHILD_SHELL_URL });

    const after = await snapshotCaches(page);
    expectDeletedExactlyUnderPrefix(before, after, CHILD_APP_PREFIX);
    expect(after.has(CHILD_PRECACHE)).toBe(false);
    expect(after.get(ROOT_PRECACHE)).toBe(before.get(ROOT_PRECACHE));
    expect(after.get(UNRELATED_CACHE_NAME)).toBe(before.get(UNRELATED_CACHE_NAME));
  });
});
