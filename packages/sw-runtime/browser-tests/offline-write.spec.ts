import { expect, test, waitForControllerChange } from "@pwa-platform/browser-test-harness";
import { CONFIG_OFFLINE_WRITE, FIXTURE_SITE } from "./fixture-site.js";
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
