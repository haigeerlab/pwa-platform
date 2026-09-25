import {
  diffCacheSnapshots,
  expect,
  expectLifecycleSequence,
  readRegistration,
  snapshotCaches,
  test,
  waitForControllerChange,
} from "@pwa-platform/browser-test-harness";
import { APP_CACHE_PREFIX, FIXTURE_SITE, OFFLINE_WRITE_DATABASE_NAME, PRECACHE_CACHE_NAME, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import {
  collectedEvents,
  deployAndWait,
  documentMark,
  installAndControl,
  markDocument,
  pageApplyUpdate,
  pageLogout,
  pageRegister,
  waitForActiveWorkerActivated,
} from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

async function enqueueOfflineWrite(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    if (controller === null) throw new Error("No controller");
    const channel = new MessageChannel();
    const result = new Promise<unknown>((resolve, reject) => {
      channel.port1.onmessage = (event) => resolve(event.data);
      channel.port1.onmessageerror = () => reject(new Error("Message error"));
    });
    channel.port1.start();
    controller.postMessage({
      type: "pwa:offline-write:enqueue", version: 1, requestId: "logout-enqueue",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 1 }, idempotencyKey: "logout-order", sessionBinding: "opaque-session-logout" },
    }, [channel.port2]);
    const reply = (await result) as { readonly status?: unknown };
    if (reply.status !== "queued") throw new Error("The worker did not queue the offline write");
  });
}

async function offlineWriteDatabaseExists(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(async (databaseName) => (await indexedDB.databases()).some(({ name }) => name === databaseName), OFFLINE_WRITE_DATABASE_NAME);
}

test.describe("update discovery", () => {
  test("announces a waiting version without reloading the page", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await markDocument(page);

    await deployAndWait(page, fixtureServer, "v2");

    // The new worker waits; the application decides when it takes over.
    const registration = await readRegistration(page, SHELL_URL);
    expect(registration?.waiting).toBe(fixtureServer.url(WORKER_URL));
    expect(await documentMark(page)).toBe("kept");
    expectLifecycleSequence(await collectedEvents(page), ["registered", "update-waiting"]);
  });

  test("applying the update hands over control, still without reloading", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await markDocument(page);
    await deployAndWait(page, fixtureServer, "v2");

    let applied: boolean | undefined;
    const after = await waitForControllerChange(page, async () => {
      applied = await pageApplyUpdate(page);
    });
    await waitForActiveWorkerActivated(page);

    expect(applied).toBe(true);
    expect(after.waiting).toBeNull();
    expect(after.active).toBe(fixtureServer.url(WORKER_URL));
    // Taking over does not reload the page: the acceptance matrix forbids a forced refresh.
    expect(await documentMark(page)).toBe("kept");
    // The document still shows v1's markup, proving nothing navigated.
    await expect(page.locator("[data-shell]")).toHaveText("app shell v1");
  });

  test("reports false when there is no update to apply", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    expect(await pageApplyUpdate(page)).toBe(false);
  });
});

test.describe("logout", () => {
  test("clears the worker-owned offline queue before it unregisters", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("offline-write");
    await installAndControl(page, fixtureServer);
    await enqueueOfflineWrite(page);
    expect(await offlineWriteDatabaseExists(page)).toBe(true);

    expect(await pageLogout(page)).toBe(true);
    expect(await offlineWriteDatabaseExists(page)).toBe(false);
    expect(await readRegistration(page, SHELL_URL)).toBeNull();
  });

  test("unregisters the worker and leaves every cache untouched", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    const before = await snapshotCaches(page);
    // The precache is filled, so "no cache was deleted" is a claim with something at stake.
    expect(before.get(PRECACHE_CACHE_NAME)).toBeGreaterThan(0);
    expect([...before.keys()].some((name) => name.startsWith(APP_CACHE_PREFIX))).toBe(true);

    expect(await pageLogout(page)).toBe(true);

    expect(await readRegistration(page, SHELL_URL)).toBeNull();
    const after = await snapshotCaches(page);
    expect(diffCacheSnapshots(before, after)).toEqual({ deleted: [], added: [], changed: [] });
  });

  test("leaves this document controlled until it is replaced, as unregister() specifies", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await pageLogout(page);

    // unregister() detaches the registration but existing clients keep their controller until they go away, so
    // asserting the current document loses control right away would contradict the specification.
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
    expect(await readRegistration(page, SHELL_URL)).toBeNull();
  });

  test("reports false when there is nothing registered", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    expect(await pageLogout(page)).toBe(false);
  });

  test("lets the page register again afterwards", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer);
    await pageLogout(page);

    await page.reload();
    await pageRegister(page);
    await waitForActiveWorkerActivated(page);
    expect((await readRegistration(page, SHELL_URL))?.active).toBe(fixtureServer.url(WORKER_URL));
  });
});
