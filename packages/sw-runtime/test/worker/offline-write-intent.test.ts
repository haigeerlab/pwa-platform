import { describe, expect, it } from "vitest";
import type { PwaOfflineWriteMessage } from "../../src/messages/index.js";
import type { PwaPlatformWorkerConfig } from "../../src/shared/config.js";
import { validateOfflineWriteEnqueue, validateOfflineWriteFlush } from "../../src/worker/offline-write-intent.js";

const config: PwaPlatformWorkerConfig = {
  kind: "platform", version: 1, scope: "/app/", precacheCacheName: "pwa:shop:production:r1:precache",
  requestBaselineDenials: ["non-get", "cross-origin", "no-store", "opaque-response", "redirect", "websocket", "unclassified"],
  pathRules: [{ pathPrefix: "/app/api/orders", action: "deny" }], offlineFallback: { enabled: false }, updateMode: "prompt",
  offlineWrites: { enabled: true, databaseName: "pwa-offline-write:shop:production:r1", maxEntries: 10, maxTotalBodyBytes: 4096,
    targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 32 }] },
  runtimeCache: { enabled: false, pagesCacheName: "pwa:shop:production:r1:runtime-pages", dataCacheNamePrefix: "pwa:shop:production:r1:runtime-data-" },
};

const message: Extract<PwaOfflineWriteMessage, { readonly type: "pwa:offline-write:enqueue" }> = {
  type: "pwa:offline-write:enqueue", version: 1, requestId: "request-1",
  intent: { targetId: "submit-order", path: "/app/api/orders", body: { quantity: 1 }, idempotencyKey: "order-1", sessionBinding: "opaque-session-123" },
};

describe("validateOfflineWriteEnqueue", () => {
  it("normalizes a declared JSON POST intent without retaining the original body", () => {
    expect(validateOfflineWriteEnqueue(message, config, "https://shop.example.com")).toEqual({
      ok: true,
      value: { targetId: "submit-order", path: "/app/api/orders", bodyJson: '{"quantity":1}', idempotencyKey: "order-1", sessionBinding: "opaque-session-123" },
    });
  });

  it.each([
    ["disabled", { ...config, offlineWrites: { enabled: false } }, message, "offline-write.disabled"],
    ["target", config, { ...message, intent: { ...message.intent, targetId: "other" } }, "offline-write.target"],
    ["path", config, { ...message, intent: { ...message.intent, path: "/app/assets" } }, "offline-write.path"],
    ["body", config, { ...message, intent: { ...message.intent, body: "x".repeat(33) } }, "offline-write.body"],
    ["key", config, { ...message, intent: { ...message.intent, idempotencyKey: "bad key" } }, "offline-write.idempotency-key"],
    ["binding", config, { ...message, intent: { ...message.intent, sessionBinding: "short" } }, "offline-write.session-binding"],
  ] as const)("rejects %s", (_name, candidate, input, code) => {
    expect(validateOfflineWriteEnqueue(input, candidate, "https://shop.example.com")).toEqual({ ok: false, code });
  });

  it("rejects accessor-backed bodies without invoking them", () => {
    let invoked = false;
    const body = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        invoked = true;
        return "secret";
      },
    });
    expect(validateOfflineWriteEnqueue({ ...message, intent: { ...message.intent, body } }, config, "https://shop.example.com")).toEqual({
      ok: false,
      code: "offline-write.body",
    });
    expect(invoked).toBe(false);
  });
});

describe("validateOfflineWriteFlush", () => {
  const flush: Extract<PwaOfflineWriteMessage, { readonly type: "pwa:offline-write:flush" }> = {
    type: "pwa:offline-write:flush", version: 1, requestId: "request-2", sessionBinding: "opaque-session-123",
  };
  it("requires an enabled queue and an opaque current binding", () => {
    expect(validateOfflineWriteFlush(flush, config)).toEqual({ ok: true, binding: flush.sessionBinding });
    expect(validateOfflineWriteFlush(flush, { ...config, offlineWrites: { enabled: false } })).toEqual({ ok: false, code: "offline-write.disabled" });
    expect(validateOfflineWriteFlush({ ...flush, sessionBinding: "short" }, config)).toEqual({ ok: false, code: "offline-write.session-binding" });
  });
});
