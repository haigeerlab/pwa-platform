import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PwaPrecacheEngine } from "@pwa-platform/engine-workbox/worker";
import type { registerPlatformWorker as RegisterPlatformWorker } from "../../src/worker/index.js";
import { attachPlatformWorker } from "../../src/worker/handlers.js";
import { SKIP_WAITING_MESSAGE } from "../../src/messages/index.js";
import type { PwaPlatformWorkerConfig } from "../../src/shared/config.js";
import { deleteExpirationRecords } from "../../src/shared/expiration-records.js";

// deleteRuntimeCaches (T8) always calls this, even when the runtime cache is disabled, so every test that dispatches
// "activate" or a logout "clear" needs it stubbed rather than touching a real (here: nonexistent) global indexedDB.
vi.mock("../../src/shared/expiration-records.js", () => ({ deleteExpirationRecords: vi.fn(async () => undefined) }));

const expirationRecordsMock = vi.mocked(deleteExpirationRecords);

const ORIGIN = "https://shop.example.com";
const MANIFEST = ["/app/assets/logo.svg", "/app/index.html", "/app/offline.html"];

const config: PwaPlatformWorkerConfig = {
  kind: "platform",
  version: 1,
  scope: "/app/",
  precacheCacheName: "pwa:storefront:production:r3:precache",
  requestBaselineDenials: ["non-get", "cross-origin", "no-store", "opaque-response", "redirect", "websocket", "unclassified"],
  pathRules: [
    { pathPrefix: "/app/api/account", action: "deny" },
    { pathPrefix: "/app/assets", action: "cache-first" },
    { pathPrefix: "/app", action: "network-first" },
  ],
  offlineFallback: { enabled: true, path: "/app/offline.html" },
  updateMode: "prompt",
  offlineWrites: { enabled: false },
  runtimeCache: {
    enabled: false,
    pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
    dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
  },
};

type Listener = (event: never) => void;

type Harness = {
  readonly scope: ServiceWorkerGlobalScope;
  readonly listeners: Map<string, Listener[]>;
  readonly engine: PwaPrecacheEngine;
  readonly cached: Map<string, string>;
  readonly match: ReturnType<typeof vi.fn>;
  readonly install: ReturnType<typeof vi.fn>;
  readonly activate: ReturnType<typeof vi.fn>;
  readonly fetch: ReturnType<typeof vi.fn>;
  readonly skipWaiting: ReturnType<typeof vi.fn>;
  readonly claim: ReturnType<typeof vi.fn>;
  /** Every cache "name" the fake CacheStorage currently holds (T8 exercises this directly). */
  readonly cacheNames: Set<string>;
  readonly cachesDelete: ReturnType<typeof vi.fn>;
};

function createHarness(): Harness {
  const listeners = new Map<string, Listener[]>();
  const cached = new Map<string, string>([
    ["/app/assets/logo.svg", "logo"],
    ["/app/index.html", "shell"],
    ["/app/offline.html", "offline"],
  ]);
  const match = vi.fn(async (url: string) => {
    const body = cached.get(url);
    return body === undefined ? undefined : new Response(body);
  });
  const install = vi.fn(async () => ({ updatedUrls: [], notUpdatedUrls: [] }));
  const activate = vi.fn(async () => ({ deletedUrls: [] }));
  const fetch = vi.fn(async () => new Response("network"));
  const skipWaiting = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const cacheNames = new Set<string>();
  const cachesDelete = vi.fn(async (name: string) => cacheNames.delete(name));
  const scope = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    location: new URL(`${ORIGIN}/app/sw.js`),
    fetch,
    skipWaiting,
    clients: { claim },
    caches: { keys: vi.fn(async () => [...cacheNames]), delete: cachesDelete },
  };
  const engine = { install, activate, match, urls: () => MANIFEST } as unknown as PwaPrecacheEngine;
  return {
    scope: scope as unknown as ServiceWorkerGlobalScope,
    listeners,
    engine,
    cached,
    match,
    install,
    activate,
    fetch,
    skipWaiting,
    claim,
    cacheNames,
    cachesDelete,
  };
}

function request(
  url: string,
  options: { readonly method?: string; readonly mode?: string; readonly headers?: Readonly<Record<string, string>> } = {},
): Request {
  return {
    url,
    method: options.method ?? "GET",
    mode: options.mode ?? "cors",
    headers: new Headers(options.headers ?? {}),
  } as unknown as Request;
}

let harness: Harness;

beforeEach(() => {
  expirationRecordsMock.mockReset();
  expirationRecordsMock.mockResolvedValue(undefined);
  harness = createHarness();
  attachPlatformWorker({ scope: harness.scope, config, engine: harness.engine });
});

/** Dispatches a fetch event and returns what the listener passed to `respondWith`, or undefined if it passed. */
function fetchEvent(target: Request): Promise<Response> | undefined {
  const listener = (harness.listeners.get("fetch") ?? [])[0];
  if (listener === undefined) throw new Error("No fetch listener");
  let responded: Promise<Response> | undefined;
  const event = { request: target, respondWith: (value: Promise<Response>) => (responded = value) };
  listener(event as never);
  return responded;
}

function lifecycleEvent(type: "install" | "activate"): unknown[] {
  const listener = (harness.listeners.get(type) ?? [])[0];
  if (listener === undefined) throw new Error(`No ${type} listener`);
  const waitUntil = vi.fn();
  listener({ type, waitUntil } as never);
  return waitUntil.mock.calls.map(([value]) => value);
}

function messageEvent(data: unknown, source: unknown, ports: readonly MessagePort[] = []): Promise<unknown> | undefined {
  const listener = (harness.listeners.get("message") ?? [])[0];
  if (listener === undefined) throw new Error("No message listener");
  let waited: Promise<unknown> | undefined;
  listener({ data, source, ports, waitUntil: (value: Promise<unknown>) => (waited = value) } as never);
  return waited;
}

describe("listeners", () => {
  it("registers install, activate, fetch, message, push and notificationclick, and nothing else", () => {
    expect([...harness.listeners.keys()]).toEqual(["install", "activate", "fetch", "message", "push", "notificationclick"]);
    for (const [, registered] of harness.listeners) expect(registered).toHaveLength(1);
  });

  it("hands install and activate to the engine without skipping waiting or claiming clients", async () => {
    expect(lifecycleEvent("install")).toEqual([]);
    expect(harness.install).toHaveBeenCalledTimes(1);
    // T8: activate also waitUntils the runtime-cache cleanup, alongside the engine's own (uninstrumented) work.
    const [activateWaited] = lifecycleEvent("activate");
    expect(activateWaited).toBeInstanceOf(Promise);
    await activateWaited;
    expect(harness.activate).toHaveBeenCalledTimes(1);
    expect(harness.skipWaiting).not.toHaveBeenCalled();
    expect(harness.claim).not.toHaveBeenCalled();
  });
});

describe("fetch", () => {
  it("does not respond to requests the decision table passes through", () => {
    for (const target of [
      request(`${ORIGIN}/app/assets/logo.svg`, { method: "POST" }),
      request("https://cdn.example.com/app/assets/logo.svg"),
      request(`${ORIGIN}/app/api/account/profile`),
      request(`${ORIGIN}/other/index.html`),
      request(`${ORIGIN}/app/assets/missing.js`),
      request(`${ORIGIN}/other/page`, { mode: "navigate" }),
    ]) {
      expect(fetchEvent(target), target.url).toBeUndefined();
    }
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.match).not.toHaveBeenCalled();
  });

  it("answers a precached URL from the precache", async () => {
    const responded = fetchEvent(request(`${ORIGIN}/app/assets/logo.svg`));
    expect(responded).toBeDefined();
    expect(await (await responded)?.text()).toBe("logo");
    expect(harness.match).toHaveBeenCalledWith("/app/assets/logo.svg");
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it("falls back to the network when a manifest entry is missing from the cache", async () => {
    harness.cached.delete("/app/assets/logo.svg");
    expect(await (await fetchEvent(request(`${ORIGIN}/app/assets/logo.svg`)))?.text()).toBe("network");
    expect(harness.fetch).toHaveBeenCalledTimes(1);
  });

  it("answers navigations from the network, whatever it responds", async () => {
    harness.fetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const responded = await fetchEvent(request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));
    expect(responded?.status).toBe(404);
    expect(await responded?.text()).toBe("not found");
    expect(harness.match).not.toHaveBeenCalled();
  });

  it("uses the offline fallback when fetch resolves an error response", async () => {
    harness.fetch.mockResolvedValueOnce(Response.error());
    const responded = await fetchEvent(request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));
    expect(await responded?.text()).toBe("offline");
    expect(harness.match).toHaveBeenCalledWith("/app/offline.html");
  });

  it("uses the fallbacks in order when the network fails", async () => {
    harness.fetch.mockRejectedValue(new TypeError("offline"));
    expect(await (await fetchEvent(request(`${ORIGIN}/app/`, { mode: "navigate" })))?.text()).toBe("shell");
    expect(harness.match).toHaveBeenCalledWith("/app/index.html");

    harness.match.mockClear();
    expect(await (await fetchEvent(request(`${ORIGIN}/app/products/42`, { mode: "navigate" })))?.text()).toBe("offline");
    expect(harness.match).toHaveBeenCalledWith("/app/offline.html");
  });

  it("answers a denied navigation from the network untouched, without consulting the precache", async () => {
    harness.fetch.mockResolvedValue(new Response("private", { status: 200 }));
    const responded = await fetchEvent(request(`${ORIGIN}/app/api/account/profile`, { mode: "navigate" }));
    expect(await responded?.text()).toBe("private");
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(harness.match).not.toHaveBeenCalled();
  });

  it("answers a denied navigation with the offline page, and only that page, when the network fails", async () => {
    harness.fetch.mockRejectedValue(new TypeError("offline"));
    const responded = await fetchEvent(request(`${ORIGIN}/app/api/account/profile`, { mode: "navigate" }));
    expect(await responded?.text()).toBe("offline");
    expect(harness.match.mock.calls).toEqual([["/app/offline.html"]]);
  });

  it("does not respond at all on an excluded path, whether the network is up or not", () => {
    const excluding = createHarness();
    attachPlatformWorker({
      scope: excluding.scope,
      config: { ...config, pathRules: [{ pathPrefix: "/app/m", action: "exclude" }, ...config.pathRules] },
      engine: excluding.engine,
    });
    const listener = (excluding.listeners.get("fetch") ?? [])[0];
    if (listener === undefined) throw new Error("No fetch listener");
    for (const offline of [false, true]) {
      if (offline) excluding.fetch.mockRejectedValue(new TypeError("offline"));
      for (const mode of ["navigate", "cors"]) {
        let responded: Promise<Response> | undefined;
        listener({ request: request(`${ORIGIN}/app/m/page`, { mode }), respondWith: (value: Promise<Response>) => (responded = value) } as never);
        expect(responded, `${mode} offline=${offline}`).toBeUndefined();
      }
    }
    expect(excluding.fetch).not.toHaveBeenCalled();
    expect(excluding.match).not.toHaveBeenCalled();
  });

  it("returns a network error when the network fails and no fallback is cached", async () => {
    harness.fetch.mockRejectedValue(new TypeError("offline"));
    harness.cached.clear();
    const responded = await fetchEvent(request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));
    expect(responded?.type).toBe("error");
  });

  it("does not respond to a Range request for a precached asset, whatever the header's value (ADR-0023)", () => {
    for (const range of ["bytes=0-99", "bytes=0-"]) {
      expect(fetchEvent(request(`${ORIGIN}/app/assets/logo.svg`, { headers: { Range: range } })), range).toBeUndefined();
    }
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.match).not.toHaveBeenCalled();
  });

  it("derives range from request.headers.has(\"range\"), any casing of the header name", () => {
    expect(fetchEvent(request(`${ORIGIN}/app/assets/logo.svg`, { headers: { range: "bytes=0-99" } }))).toBeUndefined();
    expect(fetchEvent(request(`${ORIGIN}/app/assets/logo.svg`, { headers: { RANGE: "bytes=0-99" } }))).toBeUndefined();
  });

  it("still answers a precached URL from the precache when the request carries no Range header", async () => {
    const responded = fetchEvent(request(`${ORIGIN}/app/assets/logo.svg`));
    expect(await (await responded)?.text()).toBe("logo");
    expect(harness.match).toHaveBeenCalledWith("/app/assets/logo.svg");
  });
});

describe("navigate network timeout (ADR-0038)", () => {
  const timeoutConfig: PwaPlatformWorkerConfig = { ...config, networkTimeoutSeconds: 5 };

  function fetchEventOn(h: Harness, target: Request): Promise<Response> | undefined {
    const listener = (h.listeners.get("fetch") ?? [])[0];
    if (listener === undefined) throw new Error("No fetch listener");
    let responded: Promise<Response> | undefined;
    listener({ request: target, respondWith: (value: Promise<Response>) => (responded = value) } as never);
    return responded;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers within the timeout, including a 5xx response, without the timer ever firing", async () => {
    const h = createHarness();
    h.fetch.mockResolvedValueOnce(new Response("err", { status: 500 }));
    attachPlatformWorker({ scope: h.scope, config: timeoutConfig, engine: h.engine });
    const responded = fetchEventOn(h, request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));
    await vi.advanceTimersByTimeAsync(0);
    const response = await responded;
    expect(response?.status).toBe(500);
    expect(h.match).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the fallback when the network fails within the timeout, exactly as without one", async () => {
    const h = createHarness();
    h.fetch.mockRejectedValueOnce(new TypeError("offline"));
    attachPlatformWorker({ scope: h.scope, config: timeoutConfig, engine: h.engine });
    const responded = fetchEventOn(h, request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await (await responded)?.text()).toBe("offline");
    expect(h.match).toHaveBeenCalledWith("/app/offline.html");
  });

  it("returns the fallback once the timeout elapses, and swallows a late network rejection without an unhandled rejection", async () => {
    const h = createHarness();
    let rejectNetwork: ((error: unknown) => void) | undefined;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectNetwork = reject;
        }),
    );
    attachPlatformWorker({ scope: h.scope, config: timeoutConfig, engine: h.engine });
    const responded = fetchEventOn(h, request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(await (await responded)?.text()).toBe("offline");
    expect(h.match).toHaveBeenCalledWith("/app/offline.html");

    // The network eventually fails; this must never surface as an unhandled rejection (the test process would
    // otherwise fail it independently of any assertion here).
    rejectNetwork?.(new TypeError("late failure"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("keeps waiting for the network past the timeout when nothing matches the fallbacks, then returns the late response", async () => {
    const h = createHarness();
    h.cached.clear(); // No offline page and no app shell cached: no fallback can ever match.
    let resolveNetwork: ((response: Response) => void) | undefined;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNetwork = resolve;
        }),
    );
    attachPlatformWorker({ scope: h.scope, config: timeoutConfig, engine: h.engine });
    const responded = fetchEventOn(h, request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));

    await vi.advanceTimersByTimeAsync(5_000);
    resolveNetwork?.(new Response("late success"));
    expect(await (await responded)?.text()).toBe("late success");
  });

  it("keeps waiting for the network past the timeout when nothing matches the fallbacks, then returns Response.error() on a late network failure", async () => {
    const h = createHarness();
    h.cached.clear(); // No offline page and no app shell cached: no fallback can ever match.
    let rejectNetwork: ((error: unknown) => void) | undefined;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectNetwork = reject;
        }),
    );
    attachPlatformWorker({ scope: h.scope, config: timeoutConfig, engine: h.engine });
    const responded = fetchEventOn(h, request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));

    await vi.advanceTimersByTimeAsync(5_000);
    rejectNetwork?.(new TypeError("late failure"));
    const response = await responded;
    expect(response?.type).toBe("error");
  });

  it("keeps waiting for the network when the fallback lookup itself rejects after the timeout, and returns the late network response", async () => {
    const h = createHarness();
    // engine.match rejects for every candidate: the fallback lookup must not turn this into an error while the
    // network could still succeed.
    h.match.mockRejectedValue(new Error("precache lookup failed"));
    let resolveNetwork: ((response: Response) => void) | undefined;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNetwork = resolve;
        }),
    );
    attachPlatformWorker({ scope: h.scope, config: timeoutConfig, engine: h.engine });
    const responded = fetchEventOn(h, request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));

    await vi.advanceTimersByTimeAsync(5_000);
    resolveNetwork?.(new Response("late success"));
    expect(await (await responded)?.text()).toBe("late success");
  });

  it("registers no timer and behaves exactly as before when networkTimeoutSeconds is unset (regression)", async () => {
    const h = createHarness();
    attachPlatformWorker({ scope: h.scope, config, engine: h.engine }); // the outer `config`: no networkTimeoutSeconds
    h.fetch.mockResolvedValueOnce(new Response("ok"));
    const responded = fetchEventOn(h, request(`${ORIGIN}/app/products/42`, { mode: "navigate" }));
    expect(vi.getTimerCount()).toBe(0);
    expect(await (await responded)?.text()).toBe("ok");
  });
});

describe("message", () => {
  const windowClient = { type: "window", url: `${ORIGIN}/app/` };

  it("skips waiting only for the confirmation message from a same-origin window client", async () => {
    const waited = messageEvent(SKIP_WAITING_MESSAGE, windowClient);
    expect(waited).toBeDefined();
    await waited;
    expect(harness.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it("ignores every other message and source", () => {
    for (const [data, source] of [
      [{ type: "pwa:other" }, windowClient],
      [{ type: "pwa:skip-waiting", extra: 1 }, windowClient],
      ["pwa:skip-waiting", windowClient],
      [SKIP_WAITING_MESSAGE, null],
      [SKIP_WAITING_MESSAGE, { type: "worker", url: `${ORIGIN}/app/sw.js` }],
      [SKIP_WAITING_MESSAGE, { type: "window", url: "https://cdn.example.com/app/" }],
      [SKIP_WAITING_MESSAGE, { type: "window", url: "not a url" }],
      [SKIP_WAITING_MESSAGE, {}],
    ] as const) {
      expect(messageEvent(data, source), JSON.stringify({ data, source })).toBeUndefined();
    }
    expect(harness.skipWaiting).not.toHaveBeenCalled();
  });

  it("rejects an undeclared offline-write target through the caller's only reply port", async () => {
    const enabled = createHarness();
    attachPlatformWorker({
      scope: enabled.scope,
      config: {
        ...config,
        offlineWrites: {
          enabled: true,
          databaseName: "pwa-offline-write:storefront:production:r3",
          maxEntries: 10,
          maxTotalBodyBytes: 4096,
          targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1024 }],
        },
      },
      engine: enabled.engine,
    });
    const listener = (enabled.listeners.get("message") ?? [])[0];
    if (listener === undefined) throw new Error("No message listener");
    const postMessage = vi.fn();
    let waited: Promise<unknown> | undefined;
    listener({
      data: {
        type: "pwa:offline-write:enqueue",
        version: 1,
        requestId: "request-1",
        intent: { targetId: "other", path: "/app/api/orders", body: {}, idempotencyKey: "order-1", sessionBinding: "opaque-session-123" },
      },
      source: windowClient,
      ports: [{ postMessage }],
      waitUntil: (value: Promise<unknown>) => (waited = value),
    } as never);
    await waited;
    expect(postMessage).toHaveBeenCalledWith({
      type: "pwa:offline-write:result",
      version: 1,
      requestId: "request-1",
      status: "rejected",
      code: "offline-write.target",
    });
    expect(enabled.fetch).not.toHaveBeenCalled();
  });

  it("rejects a flush request with an invalid session binding before opening the queue", async () => {
    const enabled = createHarness();
    attachPlatformWorker({
      scope: enabled.scope,
      config: {
        ...config,
        offlineWrites: {
          enabled: true,
          databaseName: "pwa-offline-write:storefront:production:r3",
          maxEntries: 10,
          maxTotalBodyBytes: 4096,
          targets: [{ id: "submit-order", pathPrefix: "/app/api/orders", maxBodyBytes: 1024 }],
        },
      },
      engine: enabled.engine,
    });
    const listener = (enabled.listeners.get("message") ?? [])[0];
    if (listener === undefined) throw new Error("No message listener");
    const postMessage = vi.fn();
    let waited: Promise<unknown> | undefined;
    listener({
      data: { type: "pwa:offline-write:flush", version: 1, requestId: "request-2", sessionBinding: "short" },
      source: windowClient,
      ports: [{ postMessage }],
      waitUntil: (value: Promise<unknown>) => (waited = value),
    } as never);
    await waited;
    expect(postMessage).toHaveBeenCalledWith({
      type: "pwa:offline-write:result",
      version: 1,
      requestId: "request-2",
      status: "rejected",
      code: "offline-write.session-binding",
    });
    expect(enabled.fetch).not.toHaveBeenCalled();
  });

  it("acknowledges an empty clear when offline writes are disabled", async () => {
    const postMessage = vi.fn();
    const waited = messageEvent(
      { type: "pwa:offline-write:clear", version: 1, requestId: "request-3" },
      windowClient,
      [{ postMessage } as unknown as MessagePort],
    );
    await waited;
    expect(postMessage).toHaveBeenCalledWith({
      type: "pwa:offline-write:result",
      version: 1,
      requestId: "request-3",
      status: "cleared",
    });
  });
});

describe("registerPlatformWorker", () => {
  let registerPlatformWorker: typeof RegisterPlatformWorker;

  beforeAll(async () => {
    // Workbox's development logger writes to `self` while its module loads.
    vi.stubGlobal("self", { __WB_DISABLE_DEV_LOGS: true });
    ({ registerPlatformWorker } = await import("../../src/worker/index.js"));
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates the config before creating the engine or registering anything", () => {
    const scope = createHarness();
    expect(() =>
      registerPlatformWorker({
        scope: scope.scope,
        config: { ...config, precacheCacheName: "workbox-precache-v2" },
        manifest: [],
      }),
    ).toThrow(/Invalid sw-runtime worker config/);
    expect(scope.listeners.size).toBe(0);
  });

  it("registers the six listeners with an engine built from the config and manifest", () => {
    const scope = createHarness();
    // Workbox reads the global `location` while building its URL-to-cache-key map.
    vi.stubGlobal("self", { __WB_DISABLE_DEV_LOGS: true, location: scope.scope.location });
    vi.stubGlobal("location", scope.scope.location);
    registerPlatformWorker({
      scope: scope.scope,
      config,
      manifest: [{ url: "/app/assets/logo.svg", revision: "a1b2c3d4e5f60718" }],
    });
    expect([...scope.listeners.keys()]).toEqual(["install", "activate", "fetch", "message", "push", "notificationclick"]);
  });
});

describe("runtime cache (T7)", () => {
  const runtimeConfig: PwaPlatformWorkerConfig = {
    ...config,
    pathRules: [
      { pathPrefix: "/app/api/account", action: "deny" },
      { pathPrefix: "/app/assets", action: "cache-first" },
      { pathPrefix: "/app/api/catalog", action: "stale-while-revalidate" },
      { pathPrefix: "/app/articles", action: "network-first" },
      { pathPrefix: "/app", action: "network-first" },
    ],
    runtimeCache: {
      enabled: true,
      pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
      dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
      dataCacheName: "pwa:storefront:production:r3:runtime-data-0123456789abcdef",
      maxEntries: 50,
      maxEntryBytes: 65_536,
      maxAgeSeconds: 300,
      rules: [
        { pathPrefix: "/app/api/catalog", resourceClass: "public-data", strategy: "stale-while-revalidate" },
        { pathPrefix: "/app/articles", resourceClass: "navigation-public-dynamic", strategy: "network-first" },
      ],
    },
  };

  type RuntimeHarness = Harness & { readonly getClient: ReturnType<typeof vi.fn>; readonly postMessage: ReturnType<typeof vi.fn> };

  function createRuntimeHarness(): RuntimeHarness {
    const base = createHarness();
    const postMessage = vi.fn();
    const getClient = vi.fn(async () => undefined);
    (base.scope as unknown as { clients: { claim: unknown; get: unknown } }).clients = { claim: base.claim, get: getClient };
    return { ...base, getClient, postMessage };
  }

  /** Attaches the worker with a fake runtime-cache engine factory that always returns `handle`. */
  function attachRuntime(harness: RuntimeHarness, handle: ReturnType<typeof vi.fn>): ReturnType<typeof vi.fn> {
    const factory = vi.fn(() => ({ handle }));
    attachPlatformWorker({ scope: harness.scope, config: runtimeConfig, engine: harness.engine, createRuntimeCacheEngine: factory as never });
    return factory;
  }

  function fetchRuntimeEvent(
    harness: RuntimeHarness,
    target: Request,
    extra: { readonly clientId?: string; readonly resultingClientId?: string } = {},
  ): { responded: Promise<Response> | undefined; waited: readonly Promise<unknown>[] } {
    const listener = (harness.listeners.get("fetch") ?? [])[0];
    if (listener === undefined) throw new Error("No fetch listener");
    let responded: Promise<Response> | undefined;
    const waited: Promise<unknown>[] = [];
    listener({
      request: target,
      clientId: extra.clientId ?? "subresource-client",
      resultingClientId: extra.resultingClientId ?? "",
      respondWith: (value: Promise<Response>) => (responded = value),
      waitUntil: (value: Promise<unknown>) => {
        waited.push(value);
      },
    } as never);
    return { responded, waited };
  }

  it("serves a data request from the runtime cache and posts served-from-cache to the requesting client", async () => {
    const harness = createRuntimeHarness();
    const client = { postMessage: harness.postMessage };
    harness.getClient.mockResolvedValue(client);
    const handle = vi.fn(async () => ({
      response: new Response("catalog"),
      servedFromCache: { cachedAt: 1_700_000_000_000, reason: "stale-while-revalidate" },
    }));
    const factory = attachRuntime(harness, handle);

    const { responded, waited } = fetchRuntimeEvent(harness, request(`${ORIGIN}/app/api/catalog/latest.json?x=1`), { clientId: "client-42" });
    expect(await (await responded)?.text()).toBe("catalog");
    await Promise.all(waited);

    expect(harness.getClient).toHaveBeenCalledWith("client-42");
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "pwa:runtime-cache:served",
      version: 1,
      url: "/app/api/catalog/latest.json?x=1",
      cachedAt: 1_700_000_000_000,
      reason: "stale-while-revalidate",
    });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ cacheName: "pwa:storefront:production:r3:runtime-data-0123456789abcdef", strategy: "stale-while-revalidate" }),
    );
  });

  it("does not post a signal when the response is not served from cache", async () => {
    const harness = createRuntimeHarness();
    const handle = vi.fn(async () => ({ response: new Response("network"), servedFromCache: null }));
    attachRuntime(harness, handle);

    const { responded, waited } = fetchRuntimeEvent(harness, request(`${ORIGIN}/app/api/catalog/latest.json`));
    expect(await (await responded)?.text()).toBe("network");
    expect(waited).toHaveLength(0);
    expect(harness.getClient).not.toHaveBeenCalled();
  });

  it("rejects a data request when the runtime engine rejects, so the page sees a network error", async () => {
    const harness = createRuntimeHarness();
    const handle = vi.fn(async () => {
      throw new Error("network down");
    });
    attachRuntime(harness, handle);

    const { responded } = fetchRuntimeEvent(harness, request(`${ORIGIN}/app/api/catalog/latest.json`));
    await expect(responded).rejects.toThrow("network down");
  });

  it("falls back to the precache when a pages runtime request fails, without posting a signal", async () => {
    const harness = createRuntimeHarness();
    const handle = vi.fn(async () => {
      throw new Error("network down");
    });
    attachRuntime(harness, handle);

    const { responded, waited } = fetchRuntimeEvent(harness, request(`${ORIGIN}/app/articles/1`, { mode: "navigate" }), {
      resultingClientId: "nav-client-1",
    });
    expect(await (await responded)?.text()).toBe("offline");
    expect(harness.match).toHaveBeenCalledWith("/app/offline.html");
    expect(harness.postMessage).not.toHaveBeenCalled();
    void waited;
  });

  it("stashes a navigation's served-from-cache signal instead of posting it, and the page retrieves it once via pwa:runtime-cache:pending", async () => {
    const harness = createRuntimeHarness();
    const handle = vi.fn(async () => ({
      response: new Response("<html>page</html>", { headers: { "content-type": "text/html" } }),
      servedFromCache: { cachedAt: 1_700_000_000_000, reason: "network-failed" },
    }));
    attachRuntime(harness, handle);

    const { responded } = fetchRuntimeEvent(harness, request(`${ORIGIN}/app/articles/1`, { mode: "navigate" }), {
      resultingClientId: "nav-client-2",
    });
    expect(await (await responded)?.text()).toBe("<html>page</html>");
    expect(harness.postMessage).not.toHaveBeenCalled();

    const listener = (harness.listeners.get("message") ?? [])[0];
    if (listener === undefined) throw new Error("No message listener");

    const port = { postMessage: vi.fn() };
    listener({
      data: { type: "pwa:runtime-cache:pending", version: 1 },
      source: { type: "window", url: `${ORIGIN}/app/articles/1`, id: "nav-client-2" },
      ports: [port],
      waitUntil: () => undefined,
    } as never);
    expect(port.postMessage).toHaveBeenCalledWith({
      type: "pwa:runtime-cache:pending-result",
      version: 1,
      served: { url: "/app/articles/1", cachedAt: 1_700_000_000_000, reason: "network-failed" },
    });

    // Taken once: asking again for the same client returns null.
    const port2 = { postMessage: vi.fn() };
    listener({
      data: { type: "pwa:runtime-cache:pending", version: 1 },
      source: { type: "window", url: `${ORIGIN}/app/articles/1`, id: "nav-client-2" },
      ports: [port2],
      waitUntil: () => undefined,
    } as never);
    expect(port2.postMessage).toHaveBeenCalledWith({ type: "pwa:runtime-cache:pending-result", version: 1, served: null });
  });

  // The pending branch never calls event.waitUntil() — not even on success (see the previous test) — so asserting
  // `waited` stayed undefined here would pass just as well for a valid request. What actually distinguishes
  // "ignored" from "handled" is whether a reply was posted, so that is what these assert instead. Note that the
  // cross-origin and missing-source cases are rejected by `isSameOriginWindow` before the request ever reaches the
  // pending branch (see the top of the "message" listener) — this test still covers them because the failure mode
  // (no reply) is the same either way, but the pending branch's own reason for ignoring is only the port count.
  it("never replies to a pending request with the wrong number of ports, or a non-window / cross-origin / missing source", () => {
    const harness = createRuntimeHarness();
    attachRuntime(harness, vi.fn());
    const listener = (harness.listeners.get("message") ?? [])[0];
    if (listener === undefined) throw new Error("No message listener");

    for (const [ports, source] of [
      [[], { type: "window", url: `${ORIGIN}/app/`, id: "c1" }],
      [[{ postMessage: vi.fn() }, { postMessage: vi.fn() }], { type: "window", url: `${ORIGIN}/app/`, id: "c1" }],
      [[{ postMessage: vi.fn() }], { type: "window", url: "https://cdn.example.com/app/", id: "c1" }],
      [[{ postMessage: vi.fn() }], null],
    ] as const) {
      listener({ data: { type: "pwa:runtime-cache:pending", version: 1 }, source, ports, waitUntil: () => undefined } as never);
      for (const port of ports) expect(port.postMessage, JSON.stringify({ ports, source })).not.toHaveBeenCalled();
    }
  });

  // Positive control for the test above: with a valid same-origin window source and exactly one port, the pending
  // branch does reply — proving the "never replies" assertions above are actually exercising rejection, not a
  // handler that never replies to anything.
  it("replies to a pending request from a valid same-origin window source with exactly one port", () => {
    const harness = createRuntimeHarness();
    attachRuntime(harness, vi.fn());
    const listener = (harness.listeners.get("message") ?? [])[0];
    if (listener === undefined) throw new Error("No message listener");

    const port = { postMessage: vi.fn() };
    listener({
      data: { type: "pwa:runtime-cache:pending", version: 1 },
      source: { type: "window", url: `${ORIGIN}/app/`, id: "c1" },
      ports: [port],
      waitUntil: () => undefined,
    } as never);
    expect(port.postMessage).toHaveBeenCalledWith({ type: "pwa:runtime-cache:pending-result", version: 1, served: null });
  });

  it("delivers a network-timeout signal for a data request exactly like any other reason (ADR-0038)", async () => {
    const harness = createRuntimeHarness();
    const client = { postMessage: harness.postMessage };
    harness.getClient.mockResolvedValue(client);
    const handle = vi.fn(async () => ({
      response: new Response("catalog"),
      servedFromCache: { cachedAt: 1_700_000_000_000, reason: "network-timeout" },
    }));
    attachRuntime(harness, handle);

    const { responded, waited } = fetchRuntimeEvent(harness, request(`${ORIGIN}/app/api/catalog/latest.json`), { clientId: "client-42" });
    expect(await (await responded)?.text()).toBe("catalog");
    await Promise.all(waited);

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "pwa:runtime-cache:served",
      version: 1,
      url: "/app/api/catalog/latest.json",
      cachedAt: 1_700_000_000_000,
      reason: "network-timeout",
    });
  });

  it("stashes a navigation's network-timeout signal exactly like any other reason (ADR-0038)", async () => {
    const harness = createRuntimeHarness();
    const handle = vi.fn(async () => ({
      response: new Response("<html>page</html>", { headers: { "content-type": "text/html" } }),
      servedFromCache: { cachedAt: 1_700_000_000_000, reason: "network-timeout" },
    }));
    attachRuntime(harness, handle);

    const { responded } = fetchRuntimeEvent(harness, request(`${ORIGIN}/app/articles/1`, { mode: "navigate" }), {
      resultingClientId: "nav-client-timeout",
    });
    expect(await (await responded)?.text()).toBe("<html>page</html>");

    const listener = (harness.listeners.get("message") ?? [])[0];
    if (listener === undefined) throw new Error("No message listener");
    const port = { postMessage: vi.fn() };
    listener({
      data: { type: "pwa:runtime-cache:pending", version: 1 },
      source: { type: "window", url: `${ORIGIN}/app/articles/1`, id: "nav-client-timeout" },
      ports: [port],
      waitUntil: () => undefined,
    } as never);
    expect(port.postMessage).toHaveBeenCalledWith({
      type: "pwa:runtime-cache:pending-result",
      version: 1,
      served: { url: "/app/articles/1", cachedAt: 1_700_000_000_000, reason: "network-timeout" },
    });
  });

  it("passes networkTimeoutSeconds to the pages and data-network-first engines only, never to stale-while-revalidate", () => {
    const timeoutRuntimeConfig: PwaPlatformWorkerConfig = {
      ...runtimeConfig,
      networkTimeoutSeconds: 7,
      pathRules: [
        ...runtimeConfig.pathRules.slice(0, -1), // everything before the "/app" catch-all
        { pathPrefix: "/app/api/inventory", action: "network-first" },
        runtimeConfig.pathRules[runtimeConfig.pathRules.length - 1]!, // the "/app" catch-all, still last
      ],
      runtimeCache: runtimeConfig.runtimeCache.enabled
        ? {
            ...runtimeConfig.runtimeCache,
            rules: [
              ...runtimeConfig.runtimeCache.rules,
              { pathPrefix: "/app/api/inventory", resourceClass: "public-data", strategy: "network-first" },
            ],
          }
        : runtimeConfig.runtimeCache,
    };
    const harness = createRuntimeHarness();
    const handle = vi.fn(async () => ({ response: new Response("ok"), servedFromCache: null }));
    const factory = vi.fn<(options: Record<string, unknown>) => { handle: typeof handle }>(() => ({ handle }));
    attachPlatformWorker({ scope: harness.scope, config: timeoutRuntimeConfig, engine: harness.engine, createRuntimeCacheEngine: factory as never });

    // Pages (navigation-public-dynamic, network-first): gets the timeout.
    fetchRuntimeEvent(harness, request(`${ORIGIN}/app/articles/1`, { mode: "navigate" }), { resultingClientId: "nav-1" });
    // Data, network-first: gets the timeout.
    fetchRuntimeEvent(harness, request(`${ORIGIN}/app/api/inventory/1`));
    // Data, stale-while-revalidate: never gets the timeout.
    fetchRuntimeEvent(harness, request(`${ORIGIN}/app/api/catalog/1`));

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ cacheName: "pwa:storefront:production:r3:runtime-pages", strategy: "network-first", networkTimeoutSeconds: 7 }),
    );
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheName: "pwa:storefront:production:r3:runtime-data-0123456789abcdef",
        strategy: "network-first",
        networkTimeoutSeconds: 7,
      }),
    );
    const swrCall = factory.mock.calls.find(([options]) => options["strategy"] === "stale-while-revalidate");
    expect(swrCall?.[0]).not.toHaveProperty("networkTimeoutSeconds");
  });
});

describe("runtime cache cleanup (T8)", () => {
  const enabledConfig: PwaPlatformWorkerConfig = {
    ...config,
    runtimeCache: {
      enabled: true,
      pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
      dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
      dataCacheName: "pwa:storefront:production:r3:runtime-data-0123456789abcdef",
      maxEntries: 50,
      maxEntryBytes: 65_536,
      maxAgeSeconds: 300,
      rules: [],
    },
  };
  const cleanupWindowClient = { type: "window", url: `${ORIGIN}/app/` };

  function attachEnabled(): Harness {
    const h = createHarness();
    // These tests never dispatch "fetch", so the factory is never actually called; it only satisfies
    // attachPlatformWorker's requirement that one be supplied whenever runtimeCache.enabled is true.
    attachPlatformWorker({ scope: h.scope, config: enabledConfig, engine: h.engine, createRuntimeCacheEngine: vi.fn() as never });
    return h;
  }

  function activateEvent(h: Harness): readonly Promise<unknown>[] {
    const listener = (h.listeners.get("activate") ?? [])[0];
    if (listener === undefined) throw new Error("No activate listener");
    const waited: Promise<unknown>[] = [];
    listener({ type: "activate", waitUntil: (value: Promise<unknown>) => waited.push(value) } as never);
    return waited;
  }

  function logoutClear(h: Harness, requestId: string): { readonly postMessage: ReturnType<typeof vi.fn>; readonly waited: Promise<unknown> | undefined } {
    const listener = (h.listeners.get("message") ?? [])[0];
    if (listener === undefined) throw new Error("No message listener");
    const postMessage = vi.fn();
    let waited: Promise<unknown> | undefined;
    listener({
      data: { type: "pwa:offline-write:clear", version: 1, requestId },
      source: cleanupWindowClient,
      ports: [{ postMessage }],
      waitUntil: (value: Promise<unknown>) => (waited = value),
    } as never);
    return { postMessage, waited };
  }

  it("on activation, deletes the pages cache and stale-digest data caches, keeps the current digest, and leaves the precache and other namespaces untouched", async () => {
    const h = attachEnabled();
    h.cacheNames.add(enabledConfig.precacheCacheName);
    h.cacheNames.add("pwa:storefront:production:r3:runtime-pages");
    h.cacheNames.add("pwa:storefront:production:r3:runtime-data-0123456789abcdef"); // current digest: kept
    h.cacheNames.add("pwa:storefront:production:r3:runtime-data-fedcba9876543210"); // stale digest: deleted
    h.cacheNames.add("pwa:storefront:production:r2:precache"); // a different app revision: untouched
    h.cacheNames.add("pwa:other:production:r3:runtime-data-0123456789abcdef"); // a different app entirely: untouched
    h.cacheNames.add("images-v1"); // a non-platform cache: untouched

    const [waited] = activateEvent(h);
    await waited;

    expect([...h.cacheNames].sort()).toEqual(
      [
        enabledConfig.precacheCacheName,
        "pwa:storefront:production:r3:runtime-data-0123456789abcdef",
        "pwa:storefront:production:r2:precache",
        "pwa:other:production:r3:runtime-data-0123456789abcdef",
        "images-v1",
      ].sort(),
    );
  });

  it("on activation, also deletes the workbox-expiration records of the pages cache and stale-digest data caches, keeping the current digest's", async () => {
    const h = attachEnabled();

    const [waited] = activateEvent(h);
    await waited;

    expect(expirationRecordsMock).toHaveBeenCalledTimes(1);
    const matches = expirationRecordsMock.mock.calls[0]?.[0] as (name: string) => boolean;
    expect(matches("pwa:storefront:production:r3:runtime-pages")).toBe(true);
    expect(matches("pwa:storefront:production:r3:runtime-data-fedcba9876543210")).toBe(true);
    expect(matches(enabledConfig.runtimeCache.enabled ? enabledConfig.runtimeCache.dataCacheName : "")).toBe(false);
    expect(matches("pwa:other:production:r3:runtime-data-0123456789abcdef")).toBe(false);
  });

  it("on activation, deletes every data-cache digest and the pages cache when the runtime cache is disabled", async () => {
    const h = createHarness();
    attachPlatformWorker({ scope: h.scope, config, engine: h.engine }); // the outer `config`: runtimeCache.enabled === false
    h.cacheNames.add("pwa:storefront:production:r3:runtime-pages");
    h.cacheNames.add("pwa:storefront:production:r3:runtime-data-aaaaaaaaaaaaaaaa");
    h.cacheNames.add("pwa:storefront:production:r3:runtime-data-bbbbbbbbbbbbbbbb");
    h.cacheNames.add(config.precacheCacheName);

    const [waited] = activateEvent(h);
    await waited;

    expect([...h.cacheNames]).toEqual([config.precacheCacheName]);
  });

  it("on logout, deletes every runtime cache — current digest included — before replying cleared", async () => {
    const h = attachEnabled();
    h.cacheNames.add("pwa:storefront:production:r3:runtime-pages");
    h.cacheNames.add("pwa:storefront:production:r3:runtime-data-0123456789abcdef");
    h.cacheNames.add(enabledConfig.precacheCacheName);

    const { postMessage, waited } = logoutClear(h, "logout-1");
    await waited;

    expect(postMessage).toHaveBeenCalledWith({ type: "pwa:offline-write:result", version: 1, requestId: "logout-1", status: "cleared" });
    expect([...h.cacheNames]).toEqual([enabledConfig.precacheCacheName]);
  });

  it("on logout, deletes the workbox-expiration records of every data-cache digest, current one included", async () => {
    const h = attachEnabled();

    const { waited } = logoutClear(h, "logout-1b");
    await waited;

    expect(expirationRecordsMock).toHaveBeenCalledTimes(1);
    const matches = expirationRecordsMock.mock.calls[0]?.[0] as (name: string) => boolean;
    expect(matches("pwa:storefront:production:r3:runtime-pages")).toBe(true);
    expect(matches(enabledConfig.runtimeCache.enabled ? enabledConfig.runtimeCache.dataCacheName : "")).toBe(true);
    expect(matches("pwa:storefront:production:r3:runtime-data-fedcba9876543210")).toBe(true);
  });

  it("on logout, does not reply cleared when a runtime-cache deletion fails", async () => {
    const h = attachEnabled();
    h.cacheNames.add("pwa:storefront:production:r3:runtime-pages");
    h.cachesDelete.mockRejectedValueOnce(new Error("delete failed"));

    const { postMessage, waited } = logoutClear(h, "logout-2");
    await waited;

    expect(postMessage).toHaveBeenCalledWith({
      type: "pwa:offline-write:result",
      version: 1,
      requestId: "logout-2",
      status: "rejected",
      code: "offline-write.storage",
    });
  });

  it("on logout, does not reply cleared when the workbox-expiration record deletion fails", async () => {
    const h = attachEnabled();
    expirationRecordsMock.mockRejectedValueOnce(new Error("workbox-expiration record deletion failed"));

    const { postMessage, waited } = logoutClear(h, "logout-2b");
    await waited;

    expect(postMessage).toHaveBeenCalledWith({
      type: "pwa:offline-write:result",
      version: 1,
      requestId: "logout-2b",
      status: "rejected",
      code: "offline-write.storage",
    });
  });

  it("on logout, still replies cleared when the runtime cache is disabled and there is nothing to delete", async () => {
    const h = createHarness();
    attachPlatformWorker({ scope: h.scope, config, engine: h.engine });

    const { postMessage, waited } = logoutClear(h, "logout-3");
    await waited;

    expect(postMessage).toHaveBeenCalledWith({ type: "pwa:offline-write:result", version: 1, requestId: "logout-3", status: "cleared" });
  });

  it("on logout, still replies cleared when the runtime cache is disabled even if its (best-effort) cleanup fails", async () => {
    const h = createHarness();
    attachPlatformWorker({ scope: h.scope, config, engine: h.engine }); // the outer `config`: runtimeCache.enabled === false
    h.cachesDelete.mockRejectedValueOnce(new Error("delete failed"));

    const { postMessage, waited } = logoutClear(h, "logout-4");
    await waited;

    expect(postMessage).toHaveBeenCalledWith({ type: "pwa:offline-write:result", version: 1, requestId: "logout-4", status: "cleared" });
  });

  it("on activation, never produces an unhandled rejection when runtime-cache cleanup fails", async () => {
    const h = attachEnabled();
    h.cachesDelete.mockRejectedValueOnce(new Error("delete failed"));

    const [waited] = activateEvent(h);
    await expect(waited).resolves.toBeUndefined();
  });
});
