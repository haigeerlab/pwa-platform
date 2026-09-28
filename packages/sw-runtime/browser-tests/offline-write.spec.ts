import type { BrowserContext, Page } from "@playwright/test";
import {
  cacheNames,
  createCaches,
  expect,
  requestFromPage,
  snapshotCaches,
  test,
  waitForController,
  waitForControllerChange,
  type FixtureServer,
} from "@pwa-platform/browser-test-harness";
import { APP_CACHE_PREFIX, CONFIG_OFFLINE_WRITE, FIXTURE_SITE, PRECACHE_CACHE_NAME, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import { installAndControl, waitForActiveWorkerActivated } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

async function message(page: import("@playwright/test").Page, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return page.evaluate(async (payload) => {
    const controller = navigator.serviceWorker.controller;
    if (controller === null) throw new Error("No controller");
    const channel = new MessageChannel();
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      channel.port1.onmessage = (event) => resolve(event.data as Record<string, unknown>);
      channel.port1.onmessageerror = () => reject(new Error("Message error"));
    });
    channel.port1.start();
    controller.postMessage(payload, [channel.port2]);
    return result;
  }, data);
}

async function queuedEntries(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction("writes", "readonly").objectStore("writes").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, CONFIG_OFFLINE_WRITE.offlineWrites.enabled ? CONFIG_OFFLINE_WRITE.offlineWrites.databaseName : "");
}

async function databaseExists(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(async (databaseName) => (await indexedDB.databases()).some(({ name }) => name === databaseName), CONFIG_OFFLINE_WRITE.offlineWrites.enabled ? CONFIG_OFFLINE_WRITE.offlineWrites.databaseName : "");
}

test.describe("offline write queue", () => {
  test("persists an explicit write, purges a changed binding before any replay, and clears on demand", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("offline-write");
    await installAndControl(page, fixtureServer);
    const accepted = await message(page, {
      type: "pwa:offline-write:enqueue", version: 1, requestId: "enqueue-1",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 1 }, idempotencyKey: "order-1", sessionBinding: "opaque-session-123" },
    });
    expect(accepted).toMatchObject({ type: "pwa:offline-write:result", requestId: "enqueue-1", status: "queued" });
    expect(await queuedEntries(page)).toBe(1);

    fixtureServer.clearRequests();
    const flushed = await message(page, { type: "pwa:offline-write:flush", version: 1, requestId: "flush-1", sessionBinding: "different-session-456" });
    expect(flushed).toMatchObject({ type: "pwa:offline-write:result", requestId: "flush-1", status: "flushed", sent: 0, purged: 1 });
    expect(await queuedEntries(page)).toBe(0);
    expect(fixtureServer.requests()).toEqual([]);

    const cleared = await message(page, { type: "pwa:offline-write:clear", version: 1, requestId: "clear-1" });
    expect(cleared).toEqual({ type: "pwa:offline-write:result", version: 1, requestId: "clear-1", status: "cleared" });
  });

  test("replays a matching binding exactly once and removes its successful entry", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("offline-write");
    await installAndControl(page, fixtureServer);
    await message(page, {
      type: "pwa:offline-write:enqueue", version: 1, requestId: "enqueue-success",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 2 }, idempotencyKey: "order-success", sessionBinding: "opaque-session-success" },
    });
    expect(await queuedEntries(page)).toBe(1);

    fixtureServer.clearRequests();
    const flushed = await message(page, { type: "pwa:offline-write:flush", version: 1, requestId: "flush-success", sessionBinding: "opaque-session-success" });
    expect(flushed).toMatchObject({ type: "pwa:offline-write:result", requestId: "flush-success", status: "flushed", sent: 1, purged: 0 });
    expect(fixtureServer.requests().map(({ method, path }) => `${method} ${path}`)).toEqual(["POST /app/api/orders"]);
    expect(await queuedEntries(page)).toBe(0);
  });

  test("single-flights concurrent flushes for one session binding across two pages (R5)", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("offline-write");
    await installAndControl(page, fixtureServer);

    // A second page in the same scope, already controlled by the same active worker.
    const page2 = await context.newPage();
    await page2.goto(fixtureServer.url(SHELL_URL));
    await waitForController(page2, WORKER_URL);

    const binding = "opaque-session-shared";
    await message(page, {
      type: "pwa:offline-write:enqueue", version: 1, requestId: "enqueue-shared-1",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 1 }, idempotencyKey: "order-shared-1", sessionBinding: binding },
    });
    await message(page, {
      type: "pwa:offline-write:enqueue", version: 1, requestId: "enqueue-shared-2",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 2 }, idempotencyKey: "order-shared-2", sessionBinding: binding },
    });
    expect(await queuedEntries(page)).toBe(2);

    fixtureServer.clearRequests();
    // Both tabs ask the same worker to flush the same binding at once: only one pass may reach the fixture server.
    const [flushedFromPage, flushedFromPage2] = await Promise.all([
      message(page, { type: "pwa:offline-write:flush", version: 1, requestId: "flush-shared-a", sessionBinding: binding }),
      message(page2, { type: "pwa:offline-write:flush", version: 1, requestId: "flush-shared-b", sessionBinding: binding }),
    ]);

    expect(flushedFromPage).toMatchObject({ type: "pwa:offline-write:result", requestId: "flush-shared-a", status: "flushed", sent: 2, purged: 0 });
    expect(flushedFromPage2).toMatchObject({ type: "pwa:offline-write:result", requestId: "flush-shared-b", status: "flushed", sent: 2, purged: 0 });
    // Same underlying flush: both replies carry the identical send/retain/fail counters, not two independent passes.
    expect({ ...(flushedFromPage as Record<string, unknown>), requestId: undefined }).toEqual({ ...(flushedFromPage2 as Record<string, unknown>), requestId: undefined });

    const orderRequests = fixtureServer.requests().filter(({ method, path }) => method === "POST" && path === "/app/api/orders");
    const idempotencyKeys = orderRequests.map((request) => request.headers["idempotency-key"]).sort();
    expect(idempotencyKeys).toEqual(["order-shared-1", "order-shared-2"]);
    expect(await queuedEntries(page)).toBe(0);
  });

  test("recovery deletes the offline write database before it takes control", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("offline-write");
    await installAndControl(page, fixtureServer);
    await message(page, {
      type: "pwa:offline-write:enqueue", version: 1, requestId: "enqueue-recovery",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 3 }, idempotencyKey: "order-recovery", sessionBinding: "opaque-session-recovery" },
    });
    expect(await queuedEntries(page)).toBe(1);
    expect(await databaseExists(page)).toBe(true);

    await waitForControllerChange(page, async () => {
      fixtureServer.deploy("recovery");
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
    });
    await waitForActiveWorkerActivated(page);
    expect(await databaseExists(page)).toBe(false);
  });
});

/**
 * Review #15 (risk R14): the recovery worker with one injected deletion failure (recovery-fault-entry.ts, built into
 * the `recovery-fault-*` versions). Standard browser APIs cannot make these deletions fail, so only this test build
 * reaches the path. Every other deletion is still attempted; recovery then fails closed: no push cancellation and no
 * `clients.claim()`, so an uncontrolled page stays uncontrolled. A page the broken worker already controlled is taken
 * over at activation anyway (ADR-0012 R14 addendum) and, with no fetch listener, is served nothing from the residue.
 */
test.describe("recovery with a deletion failure (#15)", () => {
  /** Queues one write, adds an older revision of this app's precache and an unrelated cache, then deploys `version`. */
  async function recoverWithFault(page: Page, context: BrowserContext, fixtureServer: FixtureServer, version: string): Promise<Page> {
    fixtureServer.deploy("offline-write");
    const uncontrolled = await context.newPage();
    await uncontrolled.goto(fixtureServer.url(SHELL_URL));
    await installAndControl(page, fixtureServer);
    await message(page, {
      type: "pwa:offline-write:enqueue", version: 1, requestId: "enqueue-fault",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 5 }, idempotencyKey: "order-fault", sessionBinding: "opaque-session-fault" },
    });
    expect(await queuedEntries(page)).toBe(1);
    await createCaches(page, [{ name: `${APP_CACHE_PREFIX}r0:precache`, entries: 2 }, { name: "images-v1", entries: 1 }]);
    expect([...(await snapshotCaches(page)).keys()][0], "the current precache is the first cache deleted").toBe(PRECACHE_CACHE_NAME);

    await waitForControllerChange(page, async () => {
      fixtureServer.deploy(version);
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration())?.update();
      });
    });
    await waitForActiveWorkerActivated(page);
    return uncontrolled;
  }

  /** Recovery serves nothing: a precached path goes to the network even while caches remain. */
  async function expectServedFromNetwork(page: Page): Promise<void> {
    expect(await requestFromPage(page, "/app/assets/logo.svg")).toEqual({ outcome: "response", status: 200, fromServiceWorker: false });
  }

  test("a failed cache deletion leaves only that cache: the older revision and the queue database are still deleted, nothing is claimed", async ({
    page,
    context,
    fixtureServer,
  }) => {
    const uncontrolled = await recoverWithFault(page, context, fixtureServer, "recovery-fault-cache");

    await expect.poll(() => databaseExists(page), { message: "the queue database is deleted despite the cache failure" }).toBe(false);
    const after = await snapshotCaches(page);
    expect([...after.keys()].sort()).toEqual([PRECACHE_CACHE_NAME, "images-v1"].sort());
    await expectServedFromNetwork(page);
    // Deletion finished (the database was its last step), so a claim would already have happened.
    await page.waitForTimeout(1_000);
    expect(await uncontrolled.evaluate(() => navigator.serviceWorker.controller === null), "recovery failed, so nothing is claimed").toBe(true);
  });

  test("a failed queue-database deletion still deletes every cache of this app, keeps the queued write, and claims nothing", async ({
    page,
    context,
    fixtureServer,
  }) => {
    const uncontrolled = await recoverWithFault(page, context, fixtureServer, "recovery-fault-database");

    // Names only while recovery is still deleting: a snapshot opens caches and can re-create a deleted one.
    await expect.poll(async () => cacheNames(page)).toEqual(["images-v1"]);
    expect(await databaseExists(page)).toBe(true);
    expect(await queuedEntries(page)).toBe(1);
    await expectServedFromNetwork(page);
    await page.waitForTimeout(1_000);
    expect(await uncontrolled.evaluate(() => navigator.serviceWorker.controller === null), "recovery failed, so nothing is claimed").toBe(true);
  });
});
