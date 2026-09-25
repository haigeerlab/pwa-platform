// Unit tests for the platform worker's `push` and `notificationclick` listeners (spec/push-module.md "设计 / 2.
// 平台 worker 的两个新监听"; ADR-0021) and the pure target-resolution helper they share.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PwaPrecacheEngine } from "@pwa-platform/engine-workbox/worker";
import { attachPlatformWorker } from "../../src/worker/handlers.js";
import { resolveNotificationTarget } from "../../src/worker/notification-target.js";
import type { PwaPlatformWorkerConfig } from "../../src/shared/config.js";

const ORIGIN = "https://example.test";
const SCOPE_PATH = "/app/";
const SCOPE_URL = `${ORIGIN}${SCOPE_PATH}`;

const config: PwaPlatformWorkerConfig = {
  kind: "platform",
  version: 1,
  scope: SCOPE_PATH,
  precacheCacheName: "pwa:demo:production:r1:precache",
  requestBaselineDenials: ["non-get", "cross-origin", "no-store", "opaque-response", "redirect", "websocket", "unclassified"],
  pathRules: [{ pathPrefix: "/app", action: "network-first" }],
  offlineFallback: { enabled: false },
  updateMode: "prompt",
  offlineWrites: { enabled: false },
  runtimeCache: { enabled: false, pagesCacheName: "pwa:demo:production:r1:runtime-pages", dataCacheNamePrefix: "pwa:demo:production:r1:runtime-data-" },
};

type Listener = (event: never) => void;

type WindowClientStub = {
  readonly url: string;
  readonly focus: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.fn>;
};

type CachesSpy = {
  readonly open: ReturnType<typeof vi.fn>;
  readonly match: ReturnType<typeof vi.fn>;
  readonly has: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
  readonly keys: ReturnType<typeof vi.fn>;
};

type Harness = {
  readonly scope: ServiceWorkerGlobalScope;
  readonly listeners: Map<string, Listener[]>;
  readonly engine: PwaPrecacheEngine;
  readonly showNotification: ReturnType<typeof vi.fn>;
  readonly matchAll: ReturnType<typeof vi.fn>;
  readonly openWindow: ReturnType<typeof vi.fn>;
  readonly caches: CachesSpy;
};

function windowClient(url: string): WindowClientStub {
  return { url, focus: vi.fn(async () => undefined), navigate: vi.fn() };
}

function createHarness(): Harness {
  const listeners = new Map<string, Listener[]>();
  const showNotification = vi.fn(async () => undefined);
  const matchAll = vi.fn(async (): Promise<readonly WindowClientStub[]> => []);
  const openWindow = vi.fn(async () => null);
  const caches: CachesSpy = {
    open: vi.fn(async () => undefined),
    match: vi.fn(async () => undefined),
    has: vi.fn(async () => false),
    delete: vi.fn(async () => false),
    keys: vi.fn(async () => []),
  };
  const install = vi.fn(async () => ({ updatedUrls: [], notUpdatedUrls: [] }));
  const activate = vi.fn(async () => ({ deletedUrls: [] }));
  const match = vi.fn(async () => undefined);
  const engine = { install, activate, match, urls: () => [] } as unknown as PwaPrecacheEngine;
  const scope = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    location: new URL(`${SCOPE_URL}sw.js`),
    fetch: vi.fn(async () => new Response("network")),
    skipWaiting: vi.fn(async () => undefined),
    registration: { scope: SCOPE_URL, showNotification },
    clients: { claim: vi.fn(async () => undefined), matchAll, openWindow },
    caches,
  };
  return { scope: scope as unknown as ServiceWorkerGlobalScope, listeners, engine, showNotification, matchAll, openWindow, caches };
}

/** Dispatches a `push` event and returns what the listener passed to `event.waitUntil`, or undefined if it never called it. */
function pushEvent(harness: Harness, data: { readonly text: () => string } | null): unknown {
  const listener = (harness.listeners.get("push") ?? [])[0];
  if (listener === undefined) throw new Error("No push listener");
  let waited: unknown;
  listener({ data, waitUntil: (value: unknown) => (waited = value) } as never);
  return waited;
}

type NotificationStub = { readonly close: ReturnType<typeof vi.fn>; readonly data: unknown };

function notificationClickEvent(harness: Harness, notification: NotificationStub): Promise<unknown> {
  const listener = (harness.listeners.get("notificationclick") ?? [])[0];
  if (listener === undefined) throw new Error("No notificationclick listener");
  let waited: Promise<unknown> | undefined;
  listener({ notification, waitUntil: (value: Promise<unknown>) => (waited = value) } as never);
  if (waited === undefined) throw new Error("notificationclick did not call waitUntil");
  return waited;
}

describe("resolveNotificationTarget", () => {
  it("resolves a relative url within the scope", () => {
    expect(resolveNotificationTarget("page", SCOPE_URL)).toBe(`${SCOPE_URL}page`);
  });

  it("accepts an absolute same-origin url inside the scope", () => {
    expect(resolveNotificationTarget(`${ORIGIN}/app/sub/page`, SCOPE_URL)).toBe(`${ORIGIN}/app/sub/page`);
  });

  it("accepts the scope itself", () => {
    expect(resolveNotificationTarget(SCOPE_URL, SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a cross-origin url", () => {
    expect(resolveNotificationTarget("https://other.example/app/x", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a same-origin url outside the scope", () => {
    expect(resolveNotificationTarget("/other/", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for '..' traversal", () => {
    expect(resolveNotificationTarget("../other/x", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for percent-encoded '..' traversal", () => {
    expect(resolveNotificationTarget("%2e%2e/other/x", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for an absolute path carrying an encoded '..' segment", () => {
    expect(resolveNotificationTarget("/app/%2e%2e/other", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a same-origin sibling path that merely shares the scope's prefix", () => {
    expect(resolveNotificationTarget("/application/x", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a javascript: url", () => {
    expect(resolveNotificationTarget("javascript:alert(1)", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a data: url", () => {
    expect(resolveNotificationTarget("data:text/html,hi", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a url carrying credentials", () => {
    expect(resolveNotificationTarget("https://u:p@example.test/app/x", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a non-string url", () => {
    expect(resolveNotificationTarget(123, SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for an empty string", () => {
    expect(resolveNotificationTarget("", SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for an object", () => {
    expect(resolveNotificationTarget({ url: "/app/x" }, SCOPE_URL)).toBe(SCOPE_URL);
  });

  it("falls back to the scope for a malformed url", () => {
    expect(resolveNotificationTarget("http://[", SCOPE_URL)).toBe(SCOPE_URL);
  });
});

describe("push listener", () => {
  let harness: Harness;
  let consoleSpies: ReturnType<typeof vi.spyOn>[];

  beforeEach(() => {
    harness = createHarness();
    attachPlatformWorker({ scope: harness.scope, config, engine: harness.engine });
    consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) spy.mockRestore();
  });

  function expectNoConsoleCalls(): void {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  }

  it("shows a notification with only the fields the payload carries", async () => {
    const text = JSON.stringify({ v: 1, title: "Hello" });
    const waited = pushEvent(harness, { text: () => text });
    expect(waited).toBeDefined();
    await waited;
    expect(harness.showNotification).toHaveBeenCalledTimes(1);
    const call = harness.showNotification.mock.calls[0] as [string, Record<string, unknown>];
    const [title, options] = call;
    expect(title).toBe("Hello");
    expect(Object.keys(options).sort()).toEqual(["data"]);
    expect(options["data"]).toEqual({ url: null, data: null });
    expectNoConsoleCalls();
  });

  it("shows a notification with every optional field mapped and no icon or actions", async () => {
    const text = JSON.stringify({ v: 1, title: "Hello", body: "World", tag: "t1", url: "/app/target", data: "opaque-id" });
    const waited = pushEvent(harness, { text: () => text });
    await waited;
    expect(harness.showNotification).toHaveBeenCalledTimes(1);
    const call = harness.showNotification.mock.calls[0] as [string, Record<string, unknown>];
    const [title, options] = call;
    expect(title).toBe("Hello");
    expect(Object.keys(options).sort()).toEqual(["body", "data", "tag"]);
    expect(options["body"]).toBe("World");
    expect(options["tag"]).toBe("t1");
    expect(options["data"]).toEqual({ url: "/app/target", data: "opaque-id" });
    expect(options).not.toHaveProperty("icon");
    expect(options).not.toHaveProperty("actions");
    expectNoConsoleCalls();
  });

  it("passes the showNotification promise itself to waitUntil", () => {
    const text = JSON.stringify({ v: 1, title: "Hello" });
    const notified = Promise.resolve(undefined);
    harness.showNotification.mockReturnValueOnce(notified);
    const waited = pushEvent(harness, { text: () => text });
    expect(waited).toBe(notified);
  });

  it("shows nothing and never calls waitUntil for a null data payload", () => {
    const waited = pushEvent(harness, null);
    expect(waited).toBeUndefined();
    expect(harness.showNotification).not.toHaveBeenCalled();
    expectNoConsoleCalls();
  });

  it("shows nothing and never calls waitUntil for invalid JSON", () => {
    const waited = pushEvent(harness, { text: () => "not json" });
    expect(waited).toBeUndefined();
    expect(harness.showNotification).not.toHaveBeenCalled();
    expectNoConsoleCalls();
  });

  it("shows nothing and never calls waitUntil for a payload with an invalid shape", () => {
    // Missing the required `title` field.
    const waited = pushEvent(harness, { text: () => JSON.stringify({ v: 1 }) });
    expect(waited).toBeUndefined();
    expect(harness.showNotification).not.toHaveBeenCalled();
    expectNoConsoleCalls();
  });

  it("shows nothing and never calls waitUntil for a payload over the byte limit", () => {
    const waited = pushEvent(harness, { text: () => "x".repeat(3073) });
    expect(waited).toBeUndefined();
    expect(harness.showNotification).not.toHaveBeenCalled();
    expectNoConsoleCalls();
  });

  it("never opens or reads the cache", async () => {
    const text = JSON.stringify({ v: 1, title: "Hello" });
    await pushEvent(harness, { text: () => text });
    pushEvent(harness, null);
    for (const spy of Object.values(harness.caches)) expect(spy).not.toHaveBeenCalled();
  });
});

describe("notificationclick listener", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
    attachPlatformWorker({ scope: harness.scope, config, engine: harness.engine });
  });

  it("closes the notification", async () => {
    const close = vi.fn();
    await notificationClickEvent(harness, { close, data: null });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("focuses an existing window whose url matches the target exactly, without opening a new one", async () => {
    const target = `${SCOPE_URL}page`;
    const exact = windowClient(target);
    const other = windowClient(`${SCOPE_URL}other`);
    harness.matchAll.mockResolvedValueOnce([other, exact]);
    await notificationClickEvent(harness, { close: vi.fn(), data: { url: "page" } });
    expect(harness.matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(exact.focus).toHaveBeenCalledTimes(1);
    expect(other.focus).not.toHaveBeenCalled();
    expect(harness.openWindow).not.toHaveBeenCalled();
    expect(exact.navigate).not.toHaveBeenCalled();
    expect(other.navigate).not.toHaveBeenCalled();
  });

  it("opens a new window when an existing window's url only starts with the target", async () => {
    const target = `${SCOPE_URL}page`;
    const prefixed = windowClient(`${target}/extra`);
    harness.matchAll.mockResolvedValueOnce([prefixed]);
    await notificationClickEvent(harness, { close: vi.fn(), data: { url: "page" } });
    expect(prefixed.focus).not.toHaveBeenCalled();
    expect(harness.openWindow).toHaveBeenCalledTimes(1);
    expect(harness.openWindow).toHaveBeenCalledWith(target);
    expect(prefixed.navigate).not.toHaveBeenCalled();
  });

  it("opens the target when there are no windows", async () => {
    const target = `${SCOPE_URL}page`;
    await notificationClickEvent(harness, { close: vi.fn(), data: { url: "page" } });
    expect(harness.openWindow).toHaveBeenCalledWith(target);
  });

  it("falls back to the scope and opens it for an out-of-scope data.url", async () => {
    await notificationClickEvent(harness, { close: vi.fn(), data: { url: "https://other.example/x" } });
    expect(harness.openWindow).toHaveBeenCalledWith(SCOPE_URL);
  });

  it("never invokes an accessor url and falls back to the scope", async () => {
    const getter = vi.fn(() => "https://other.example/should-not-be-read");
    const data: Record<string, unknown> = {};
    Object.defineProperty(data, "url", { get: getter, enumerable: true, configurable: true });
    await notificationClickEvent(harness, { close: vi.fn(), data });
    expect(getter).not.toHaveBeenCalled();
    expect(harness.openWindow).toHaveBeenCalledWith(SCOPE_URL);
  });

  it("resolves without throwing when openWindow rejects", async () => {
    harness.openWindow.mockRejectedValueOnce(new Error("InvalidAccessError"));
    await expect(notificationClickEvent(harness, { close: vi.fn(), data: { url: "page" } })).resolves.toBeUndefined();
  });

  it("never opens or reads the cache", async () => {
    await notificationClickEvent(harness, { close: vi.fn(), data: { url: "page" } });
    for (const spy of Object.values(harness.caches)) expect(spy).not.toHaveBeenCalled();
  });
});
