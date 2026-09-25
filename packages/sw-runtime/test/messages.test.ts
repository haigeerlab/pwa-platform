import { describe, expect, it } from "vitest";
import {
  isOfflineWriteClearResult,
  isOfflineWriteMessage,
  isRuntimeCachePendingMessage,
  isRuntimeCachePendingResult,
  isRuntimeCacheServedMessage,
  isSkipWaitingMessage,
  SKIP_WAITING_MESSAGE,
} from "../src/messages/index.js";

describe("SKIP_WAITING_MESSAGE", () => {
  it("is the frozen message { type: \"pwa:skip-waiting\" }", () => {
    expect(SKIP_WAITING_MESSAGE).toEqual({ type: "pwa:skip-waiting" });
    expect(Object.isFrozen(SKIP_WAITING_MESSAGE)).toBe(true);
    expect(() => {
      (SKIP_WAITING_MESSAGE as { type: string }).type = "pwa:other";
    }).toThrow(TypeError);
  });
});

describe("isOfflineWriteClearResult", () => {
  it("accepts only the correlated, closed clear acknowledgement", () => {
    expect(isOfflineWriteClearResult({ type: "pwa:offline-write:result", version: 1, requestId: "request-3", status: "cleared" }, "request-3")).toBe(true);
    for (const value of [
      { type: "pwa:offline-write:result", version: 1, requestId: "other", status: "cleared" },
      { type: "pwa:offline-write:result", version: 1, requestId: "request-3", status: "queued" },
      { type: "pwa:offline-write:result", version: 2, requestId: "request-3", status: "cleared" },
      { type: "pwa:offline-write:result", version: 1, requestId: "request-3", status: "cleared", extra: true },
      null,
    ]) {
      expect(isOfflineWriteClearResult(value, "request-3"), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("isSkipWaitingMessage", () => {
  it("accepts the constant, an equal literal, a structured clone and a null-prototype object", () => {
    const nullPrototype = Object.assign(Object.create(null) as object, { type: "pwa:skip-waiting" });
    for (const value of [SKIP_WAITING_MESSAGE, { type: "pwa:skip-waiting" }, structuredClone(SKIP_WAITING_MESSAGE), nullPrototype]) {
      expect(isSkipWaitingMessage(value)).toBe(true);
    }
  });

  it("rejects every other value", () => {
    class Message {
      readonly type = "pwa:skip-waiting";
    }
    const symbolKey = { type: "pwa:skip-waiting", [Symbol("extra")]: true };
    const inherited = Object.create({ type: "pwa:skip-waiting" }) as object;
    const nonEnumerable = Object.defineProperty({}, "type", { value: "pwa:skip-waiting", enumerable: false });
    for (const value of [
      undefined,
      null,
      "pwa:skip-waiting",
      42,
      [],
      ["pwa:skip-waiting"],
      {},
      { type: "pwa:skip-waiting ", },
      { type: "PWA:SKIP-WAITING" },
      { type: "pwa:skip-waiting", extra: 1 },
      { kind: "pwa:skip-waiting" },
      new Message(),
      symbolKey,
      inherited,
    ]) {
      expect(isSkipWaitingMessage(value), String(value)).toBe(false);
    }
    // A non-enumerable data property still is the only own key with the right value.
    expect(isSkipWaitingMessage(nonEnumerable)).toBe(true);
  });

  it("never invokes accessors", () => {
    let invoked = false;
    const accessor = Object.defineProperty({}, "type", {
      enumerable: true,
      get: () => {
        invoked = true;
        return "pwa:skip-waiting";
      },
    });
    expect(isSkipWaitingMessage(accessor)).toBe(false);
    expect(invoked).toBe(false);
  });
});

describe("isOfflineWriteMessage", () => {
  const intent = {
    targetId: "submit-order",
    path: "/app/api/orders",
    body: { sku: "shirt", quantity: 1 },
    idempotencyKey: "order-123",
    sessionBinding: "opaque-session-binding",
  };

  it("accepts only the three versioned, closed request envelopes", () => {
    for (const value of [
      { type: "pwa:offline-write:enqueue", version: 1, requestId: "request-1", intent },
      { type: "pwa:offline-write:flush", version: 1, requestId: "request-2", sessionBinding: "opaque-session-binding" },
      { type: "pwa:offline-write:clear", version: 1, requestId: "request-3" },
    ]) {
      expect(isOfflineWriteMessage(value), JSON.stringify(value)).toBe(true);
      expect(isOfflineWriteMessage(structuredClone(value))).toBe(true);
    }
  });

  it("rejects unknown versions, fields, shapes and non-string routing values", () => {
    for (const value of [
      { type: "pwa:offline-write:enqueue", version: 2, requestId: "request-1", intent },
      { type: "pwa:offline-write:enqueue", version: 1, requestId: "request-1", intent, extra: true },
      { type: "pwa:offline-write:enqueue", version: 1, requestId: "request-1" },
      { type: "pwa:offline-write:enqueue", version: 1, requestId: 1, intent },
      { type: "pwa:offline-write:flush", version: 1, requestId: "request-2", sessionBinding: 1 },
      { type: "pwa:offline-write:clear", version: 1, requestId: "request-3", sessionBinding: "unexpected" },
      { type: "pwa:offline-write:unknown", version: 1, requestId: "request-4" },
      { type: "pwa:offline-write:enqueue", version: 1, requestId: "request-5", intent: { ...intent, headers: {} } },
      null,
      [],
    ]) {
      expect(isOfflineWriteMessage(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("never invokes accessors while inspecting a request", () => {
    let invoked = false;
    const accessor = Object.defineProperty({}, "type", {
      enumerable: true,
      get: () => {
        invoked = true;
        return "pwa:offline-write:clear";
      },
    });
    expect(isOfflineWriteMessage(accessor)).toBe(false);
    expect(invoked).toBe(false);
  });
});

describe("isRuntimeCachePendingMessage", () => {
  it("accepts only the closed { type, version } request envelope", () => {
    expect(isRuntimeCachePendingMessage({ type: "pwa:runtime-cache:pending", version: 1 })).toBe(true);
    expect(isRuntimeCachePendingMessage(structuredClone({ type: "pwa:runtime-cache:pending", version: 1 }))).toBe(true);
    for (const value of [
      { type: "pwa:runtime-cache:pending", version: 2 },
      { type: "pwa:runtime-cache:pending", version: 1, extra: true },
      { type: "pwa:runtime-cache:pending" },
      { type: "pwa:runtime-cache:pending-result", version: 1 },
      "pwa:runtime-cache:pending",
      null,
      undefined,
    ]) {
      expect(isRuntimeCachePendingMessage(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("isRuntimeCacheServedMessage", () => {
  const served = { type: "pwa:runtime-cache:served", version: 1, url: "/app/api/catalog/1?x=1", cachedAt: 1_700_000_000_000, reason: "network-failed" };

  it("accepts only the closed served signal, for any of the three reasons (ADR-0038 added network-timeout)", () => {
    expect(isRuntimeCacheServedMessage(served)).toBe(true);
    expect(isRuntimeCacheServedMessage(structuredClone(served))).toBe(true);
    expect(isRuntimeCacheServedMessage({ ...served, reason: "stale-while-revalidate" })).toBe(true);
    expect(isRuntimeCacheServedMessage({ ...served, reason: "network-timeout" })).toBe(true);
  });

  it("rejects unknown versions, fields, shapes and reasons", () => {
    for (const value of [
      { ...served, version: 2 },
      { ...served, extra: true },
      { ...served, url: 1 },
      { ...served, cachedAt: "1700000000000" },
      { ...served, reason: "network-first" },
      { type: "pwa:runtime-cache:served" },
      null,
      [],
    ]) {
      expect(isRuntimeCacheServedMessage(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("isRuntimeCachePendingResult", () => {
  const hit = { url: "/app/api/catalog/1", cachedAt: 1_700_000_000_000, reason: "stale-while-revalidate" };

  it("accepts a null served result and a populated one", () => {
    expect(isRuntimeCachePendingResult({ type: "pwa:runtime-cache:pending-result", version: 1, served: null })).toBe(true);
    expect(isRuntimeCachePendingResult({ type: "pwa:runtime-cache:pending-result", version: 1, served: hit })).toBe(true);
    expect(isRuntimeCachePendingResult(structuredClone({ type: "pwa:runtime-cache:pending-result", version: 1, served: hit }))).toBe(true);
    expect(
      isRuntimeCachePendingResult({ type: "pwa:runtime-cache:pending-result", version: 1, served: { ...hit, reason: "network-timeout" } }),
    ).toBe(true);
  });

  it("rejects unknown versions, fields, and a malformed served entry", () => {
    for (const value of [
      { type: "pwa:runtime-cache:pending-result", version: 2, served: null },
      { type: "pwa:runtime-cache:pending-result", version: 1, served: null, extra: true },
      { type: "pwa:runtime-cache:pending-result", version: 1, served: { ...hit, reason: "other" } },
      { type: "pwa:runtime-cache:pending-result", version: 1, served: { ...hit, cachedAt: "1" } },
      { type: "pwa:runtime-cache:pending-result", version: 1 },
      { type: "pwa:runtime-cache:pending", version: 1, served: null },
      null,
    ]) {
      expect(isRuntimeCachePendingResult(value), JSON.stringify(value)).toBe(false);
    }
  });
});
