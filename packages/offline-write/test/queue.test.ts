import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineWriteQueue } from "../src/index.js";

class Port {
  onmessage: ((event: MessageEvent) => void) | null = null;
  peer: Port | undefined;
  postMessage(data: unknown): void { this.peer?.onmessage?.({ data } as MessageEvent); }
  start(): void {}
  close(): void {}
}

function channel(): MessageChannel {
  const port1 = new Port();
  const port2 = new Port();
  port1.peer = port2;
  port2.peer = port1;
  return { port1, port2 } as unknown as MessageChannel;
}

function controlled(reply: (message: Record<string, unknown>) => unknown): ServiceWorkerContainer {
  const worker = {
    postMessage: (message: Record<string, unknown>, transfer: Transferable[]) => {
      (transfer[0] as unknown as Port).postMessage(reply(message));
    },
  };
  return {
    controller: worker,
    getRegistration: async () => ({ scope: "https://shop.example.com/app/" }),
  } as unknown as ServiceWorkerContainer;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createOfflineWriteQueue", () => {
  it("sends a closed enqueue request and accepts only a correlated queued reply", async () => {
    const posted: unknown[] = [];
    const container = controlled((message) => {
      posted.push(message);
      return { type: "pwa:offline-write:result", version: 1, requestId: message.requestId, status: "queued" };
    });
    vi.stubGlobal("location", new URL("https://shop.example.com/app/"));
    const queue = createOfflineWriteQueue({ scope: "/app/", container, messageChannel: channel });
    await expect(queue.enqueue({ targetId: "submit-order", path: "/app/api/orders", body: { quantity: 1 }, idempotencyKey: "order-1", sessionBinding: "opaque-session-123" })).resolves.toEqual({ status: "queued" });
    expect(posted).toEqual([{
      type: "pwa:offline-write:enqueue", version: 1, requestId: "offline-write-1",
      intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 1 }, idempotencyKey: "order-1", sessionBinding: "opaque-session-123" },
    }]);
  });

  it("rejects an uncontrolled page or an uncorrelated reply", async () => {
    vi.stubGlobal("location", new URL("https://shop.example.com/app/"));
    const absent = { controller: null, getRegistration: async () => undefined } as unknown as ServiceWorkerContainer;
    await expect(createOfflineWriteQueue({ scope: "/app/", container: absent, messageChannel: channel }).clear()).rejects.toThrow("offline-write.uncontrolled");
    const wrong = controlled(() => ({ type: "pwa:offline-write:result", version: 1, requestId: "other", status: "cleared" }));
    await expect(createOfflineWriteQueue({ scope: "/app/", container: wrong, messageChannel: channel }).clear()).rejects.toThrow("offline-write.protocol");
  });
});
