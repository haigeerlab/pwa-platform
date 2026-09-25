import { describe, expect, it } from "vitest";
import type { PwaOfflineWriteStore, PwaStoredOfflineWrite } from "../../src/worker/offline-write-store.js";
import { flushOfflineWrites } from "../../src/worker/offline-write-flush.js";

function write(idempotencyKey: string, createdAt: number): PwaStoredOfflineWrite {
  return {
    targetId: "submit-order",
    path: "/app/api/orders",
    bodyJson: '{"quantity":1}',
    idempotencyKey,
    sessionBinding: "opaque-session-123",
    createdAt,
    bodyBytes: 14,
    deliveryState: "pending",
  };
}

describe("flushOfflineWrites", () => {
  it("deletes successful writes, retains transient failures and durably stops terminal failures", async () => {
    const removed: string[] = [];
    const marked: Array<{ readonly idempotencyKey: string; readonly state: "authorization-required" | "rejected" }> = [];
    const store: PwaOfflineWriteStore = {
      enqueue: async () => "queued",
      prepareFlush: async () => ({ writes: [write("order-1", 1), write("order-2", 2), write("order-3", 3), write("order-4", 4), write("order-5", 5)], purged: 2 }),
      remove: async (idempotencyKey) => { removed.push(idempotencyKey); },
      markFailed: async (idempotencyKey, state) => { marked.push({ idempotencyKey, state }); },
      clear: async () => undefined,
    };
    const statuses = [201, 503, 403, 422];
    const calls: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = [];
    const send = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ input, init });
      const status = statuses.shift();
      if (status === undefined) throw new TypeError("offline");
      return new Response(null, { status });
    }) as typeof fetch;

    await expect(flushOfflineWrites(store, "opaque-session-123", "https://shop.example.com", send)).resolves.toEqual({
      sent: 1,
      retained: 2,
      failed: 2,
      purged: 2,
    });
    expect(removed).toEqual(["order-1"]);
    expect(marked).toEqual([
      { idempotencyKey: "order-3", state: "authorization-required" },
      { idempotencyKey: "order-4", state: "rejected" },
    ]);
    expect(calls[0]).toEqual({
      input: new URL("https://shop.example.com/app/api/orders"),
      init: {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": "order-1" },
        body: '{"quantity":1}',
      },
    });
  });
});
