import {
  createCaches,
  expect,
  expectDeletedExactlyUnderPrefix,
  requestFromPage,
  snapshotCaches,
  test,
  waitForControllerChange,
} from "@pwa-platform/browser-test-harness";
import {
  APP_CACHE_PREFIX,
  FIXTURE_SITE,
  PLAN_V1,
  PLAN_V2,
  PRECACHE_CACHE_NAME,
  SHELL_URL,
  precacheCacheKeys,
} from "./fixture-site.js";
import {
  cacheContents,
  confirmUpdate,
  deployAndWait,
  documentMark,
  installAndControl,
  markDocument,
  waitForActiveWorkerActivated,
} from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

/** Control caches of the recovery drill: only this app's own revisions may be deleted. */
const CONTROL_CACHES = [
  { name: `${APP_CACHE_PREFIX}r0:precache`, entries: 2 },
  { name: "pwa:swfixture:staging:r1:precache", entries: 1 },
  { name: "pwa:swfixture-eu:production:r1:precache", entries: 1 },
  { name: "images-v1", entries: 3 },
] as const;

test.describe("update discovery", () => {
  test("a new version waits until a page confirms it, then cleans only the stale precache entries", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await createCaches(page, CONTROL_CACHES);
    const before = await snapshotCaches(page);
    await markDocument(page);

    await deployAndWait(page, fixtureServer, "v2");

    // The new version waits: the page keeps its controller and is never reloaded.
    expect(await documentMark(page)).toBe("kept");
    const waiting = await cacheContents(page);
    expect(waiting[PRECACHE_CACHE_NAME]).toHaveLength(PLAN_V1.precache.length + PLAN_V2.precache.length - 1);

    await waitForControllerChange(page, () => confirmUpdate(page));
    await waitForActiveWorkerActivated(page);

    // Taking over does not reload the page either; that is the application's choice.
    expect(await documentMark(page)).toBe("kept");
    expect((await cacheContents(page))[PRECACHE_CACHE_NAME]).toEqual(precacheCacheKeys(PLAN_V2, fixtureServer.origin));
    const after = await snapshotCaches(page);
    for (const { name, entries } of CONTROL_CACHES) expect(after.get(name), name).toBe(entries);
    expect(before.size).toBe(after.size);
  });
});

test.describe("recovery drill", () => {
  test("the recovery worker takes over, stops serving and deletes only this app's caches", async ({ page, context, fixtureServer }) => {
    // A page opened before any worker exists stays uncontrolled until a worker claims it: the platform worker never
    // does, the recovery worker must (recovery-drill.md step 3).
    const uncontrolled = await context.newPage();
    await uncontrolled.goto(fixtureServer.url(SHELL_URL));

    // Step 1: install the current worker and fill the caches, including the control caches.
    await installAndControl(page, fixtureServer);
    expect(await uncontrolled.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
    await createCaches(page, CONTROL_CACHES);
    const before = await snapshotCaches(page);
    expect([...before.keys()].sort()).toEqual([PRECACHE_CACHE_NAME, ...CONTROL_CACHES.map(({ name }) => name)].sort());
    console.log(`[recovery-drill] before: ${[...before].map(([name, count]) => `${name}=${count}`).join(", ")}`);

    // Step 2: publish the recovery worker at the same service worker URL; it activates without a reload.
    await markDocument(page);
    await waitForControllerChange(page, async () => {
      fixtureServer.deploy("recovery");
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
    });
    await waitForActiveWorkerActivated(page);
    expect(await documentMark(page)).toBe("kept");

    // Step 3: it claims the open clients, serves nothing and deleted exactly this app's caches.
    await uncontrolled.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10_000 });
    fixtureServer.clearRequests();
    expect(await requestFromPage(page, "/app/assets/logo.svg")).toEqual({ outcome: "response", status: 200, fromServiceWorker: false });
    expect(fixtureServer.requests().map(({ path }) => path)).toEqual(["/app/assets/logo.svg"]);

    await context.setOffline(true);
    expect((await requestFromPage(page, "/app/assets/logo.svg")).outcome).toBe("network-error");
    await context.setOffline(false);

    const afterRecovery = await snapshotCaches(page);
    console.log(`[recovery-drill] after recovery: ${[...afterRecovery].map(([name, count]) => `${name}=${count}`).join(", ")}`);
    expectDeletedExactlyUnderPrefix(before, afterRecovery, APP_CACHE_PREFIX);

    // Step 4: the fixed worker installs, takes over on confirmation and refills the precache.
    await deployAndWait(page, fixtureServer, "v1");
    await waitForControllerChange(page, () => confirmUpdate(page));
    await waitForActiveWorkerActivated(page);
    expect((await cacheContents(page))[PRECACHE_CACHE_NAME]).toEqual(precacheCacheKeys(PLAN_V1, fixtureServer.origin));

    await context.setOffline(true);
    await page.goto(fixtureServer.url(SHELL_URL));
    await expect(page.locator("[data-shell]")).toHaveText("app shell v1");
  });
});
