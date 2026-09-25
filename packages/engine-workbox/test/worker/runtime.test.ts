import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeCacheEngine } from "../../src/worker/runtime.js";
import type { PwaRuntimeCacheEngine } from "../../src/worker/runtime.js";

// NT3 (tasks/network-timeout/plan.md): createRuntimeCacheEngine's networkTimeoutSeconds option and the
// network-timeout / network-failed reason split. There is no unit-level Cache Storage or IndexedDB available in
// vitest's node environment -- workbox-expiration's ExpirationPlugin needs a real indexedDB, which Node does not
// provide -- so this file replaces workbox-strategies and workbox-expiration with small fakes that reproduce the
// exact sequencing this module depends on (studied from workbox-strategies@7.4.1's NetworkFirst.js `_handle`,
// `_getTimeoutPromise` and `_getNetworkPromise`, and StrategyHandler.js `fetch`, `fetchAndCachePut`, `waitUntil`
// and `doneWaiting`): a timeout callback calls `cacheMatch` directly, a network failure always runs the plugins'
// `fetchDidFail` hook (from inside `fetch()`'s catch block) before falling back to `cacheMatch`, and a network
// response that arrives after the timeout still runs through `cacheWillUpdate` in the background -- registered on
// the *handler's own* waitUntil, not the FetchEvent's (see the "late network response" test below for why that
// makes the write best effort, not guaranteed). Real-browser coverage of the network-timeout option, including
// through sw-runtime and the real Workbox strategy, lives in sw-runtime/browser-tests/network-timeout.spec.ts;
// this file's own real-Workbox coverage (predating this option) is in browser-tests/runtime.spec.ts.
//
// vi.mock is hoisted above this file's imports, so the fakes it references are built inside vi.hoisted().
const { MockNetworkFirst, MockStaleWhileRevalidate, MockExpirationPlugin, cacheStore, resetCacheStore } = vi.hoisted(() => {
  type PluginLike = {
    fetchDidFail?: (param: { readonly error: Error; readonly event: unknown; readonly originalRequest: Request; readonly request: Request }) => Promise<void>;
    cacheWillUpdate?: (param: { readonly response: Response }) => Promise<Response | null>;
    cachedResponseWillBeUsed?: (param: { readonly request: Request; readonly cachedResponse: Response | undefined; readonly event: unknown }) => Promise<Response | undefined>;
  };
  type WaitUntilEvent = { readonly waitUntil: (promise: Promise<unknown>) => void };

  // cacheName -> url -> stored Response. Mirrors Cache Storage closely enough for these tests: get/set by URL only.
  const cacheStore = new Map<string, Map<string, Response>>();

  function resetCacheStore(): void {
    cacheStore.clear();
  }

  async function cacheMatch(cacheName: string, plugins: readonly PluginLike[], request: Request, event: unknown): Promise<Response | undefined> {
    let cached = cacheStore.get(cacheName)?.get(request.url);
    for (const plugin of plugins) {
      if (plugin.cachedResponseWillBeUsed) {
        cached = (await plugin.cachedResponseWillBeUsed({ request, cachedResponse: cached, event })) ?? undefined;
      }
    }
    return cached;
  }

  async function cachePut(cacheName: string, plugins: readonly PluginLike[], request: Request, response: Response): Promise<void> {
    let toCache: Response | null = response;
    for (const plugin of plugins) {
      if (plugin.cacheWillUpdate) {
        toCache = await plugin.cacheWillUpdate({ response: toCache });
        if (!toCache) return;
      }
    }
    const byName = cacheStore.get(cacheName) ?? new Map<string, Response>();
    byName.set(request.url, toCache);
    cacheStore.set(cacheName, byName);
  }

  /**
   * Reproduces NetworkFirst._handle: races a timeout (if configured) against the network, falls back to awaiting
   * the network when the timeout's own cache lookup misses, and lets a network response that arrives after the
   * timeout keep writing to the cache in the background. That background write is registered on the *handler's
   * own* `waitUntil` (a plain array drained by `doneWaiting`), never on the FetchEvent's -- exactly like the real
   * `StrategyHandler.fetchAndCachePut` (StrategyHandler.js). `handlerDone` below only attaches to the real event
   * once, via `responseDone.then(doneWaiting)`: if `doneWaiting` already found the handler's list empty by the
   * time the response settled (the common case for a timeout hit), a write queued *after* that never gets folded
   * back in, so it never reaches the real `event.waitUntil` chain the engine sets up in runtime.ts. That is the
   * "best effort" behaviour ADR-0038 documents for a late network response.
   */
  class MockNetworkFirst {
    static readonly instances: MockNetworkFirst[] = [];
    readonly options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockNetworkFirst.instances.push(this);
    }

    handleAll({ event, request }: { readonly event: WaitUntilEvent; readonly request: Request }): readonly [Promise<Response>, Promise<void>] {
      const cacheName = this.options["cacheName"] as string;
      const plugins = (this.options["plugins"] as readonly PluginLike[] | undefined) ?? [];
      const networkTimeoutSeconds = this.options["networkTimeoutSeconds"] as number | undefined;

      // Mirrors StrategyHandler's own `_extendLifetimePromises` / `waitUntil` / `doneWaiting`: separate from the
      // FetchEvent's own waitUntil list, and only ever drained explicitly (see `doneWaiting` below).
      const handlerWaiters: Promise<unknown>[] = [];
      const handlerWaitUntil = (promise: Promise<unknown>): void => {
        handlerWaiters.push(promise);
      };
      const doneWaiting = async (): Promise<void> => {
        while (handlerWaiters.length > 0) {
          await Promise.allSettled(handlerWaiters.splice(0));
        }
      };

      const fetchOnce = async (): Promise<Response> => {
        try {
          return await globalThis.fetch(request);
        } catch (error) {
          for (const plugin of plugins) {
            if (plugin.fetchDidFail) await plugin.fetchDidFail({ error: error as Error, event, originalRequest: request, request });
          }
          throw error;
        }
      };

      const fetchAndCachePut = async (): Promise<Response> => {
        const response = await fetchOnce();
        handlerWaitUntil(cachePut(cacheName, plugins, request, response.clone()));
        return response;
      };

      const responseDone = (async (): Promise<Response> => {
        const promises: Array<Promise<Response | undefined>> = [];
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        if (networkTimeoutSeconds !== undefined) {
          promises.push(
            new Promise<Response | undefined>((resolve) => {
              timeoutId = setTimeout(() => {
                void cacheMatch(cacheName, plugins, request, event).then(resolve);
              }, networkTimeoutSeconds * 1000);
            }),
          );
        }
        const networkPromise: Promise<Response | undefined> = (async () => {
          let response: Response | undefined;
          try {
            response = await fetchAndCachePut();
          } catch {
            response = undefined;
          }
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          if (!response) response = await cacheMatch(cacheName, plugins, request, event);
          return response;
        })();
        promises.push(networkPromise);
        const response = (await Promise.race(promises)) ?? (await networkPromise);
        if (!response) throw new Error("no-response");
        return response;
      })();

      // Real StrategyHandler: the FetchEvent only ever learns about `doneWaiting()` itself (once, at construction
      // time); it never re-observes handler.waitUntil() calls made after doneWaiting() has already settled.
      const handlerDone = responseDone.then(
        () => doneWaiting(),
        () => doneWaiting(),
      );
      return [responseDone, handlerDone];
    }
  }

  /** Reproduces StaleWhileRevalidate closely enough to confirm it is unaffected by networkTimeoutSeconds. */
  class MockStaleWhileRevalidate {
    static readonly instances: MockStaleWhileRevalidate[] = [];
    readonly options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockStaleWhileRevalidate.instances.push(this);
    }

    handleAll({ event, request }: { readonly event: WaitUntilEvent; readonly request: Request }): readonly [Promise<Response>, Promise<void>] {
      const cacheName = this.options["cacheName"] as string;
      const plugins = (this.options["plugins"] as readonly PluginLike[] | undefined) ?? [];

      const responseDone = (async (): Promise<Response> => {
        const cached = await cacheMatch(cacheName, plugins, request, event);
        const revalidate = (async (): Promise<Response | undefined> => {
          try {
            const response = await globalThis.fetch(request);
            event.waitUntil(cachePut(cacheName, plugins, request, response.clone()));
            return response;
          } catch {
            return undefined;
          }
        })();
        if (cached) return cached;
        const response = await revalidate;
        if (!response) throw new Error("no-response");
        return response;
      })();

      const handlerDone = responseDone.then(
        () => undefined,
        () => undefined,
      );
      return [responseDone, handlerDone];
    }
  }

  class MockExpirationPlugin {
    constructor(public readonly options: Record<string, unknown>) {}
  }

  return { MockNetworkFirst, MockStaleWhileRevalidate, MockExpirationPlugin, cacheStore, resetCacheStore };
});

vi.mock("workbox-strategies", () => ({ NetworkFirst: MockNetworkFirst, StaleWhileRevalidate: MockStaleWhileRevalidate }));
vi.mock("workbox-expiration", () => ({ ExpirationPlugin: MockExpirationPlugin }));

/** Minimal FetchEvent/ExtendableEvent stand-in: collects every event.waitUntil() promise so a test can await them. */
class FakeFetchEvent {
  readonly request: Request;
  private readonly waiters: Promise<unknown>[] = [];

  constructor(request: Request) {
    this.request = request;
  }

  waitUntil(promise: Promise<unknown>): void {
    this.waiters.push(promise);
  }

  /** Waits for every promise registered with waitUntil so far, including ones a background write adds later. */
  async settled(): Promise<void> {
    await Promise.allSettled(this.waiters);
  }
}

function toFetchEvent(event: FakeFetchEvent): FetchEvent {
  return event as unknown as FetchEvent;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetCacheStore();
  MockNetworkFirst.instances.length = 0;
  MockStaleWhileRevalidate.instances.length = 0;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("FetchEvent", FakeFetchEvent);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function baseOptions(overrides: Partial<Parameters<typeof createRuntimeCacheEngine>[0]> = {}) {
  return {
    cacheName: "rt-test",
    strategy: "network-first" as const,
    maxEntries: 10,
    maxAgeSeconds: 3600,
    admit: async () => true,
    ...overrides,
  };
}

/** Writes one entry into the fake cache the same way a real online read would: through the engine's own admission path. */
async function primeCache(engine: PwaRuntimeCacheEngine, request: Request, body: string): Promise<void> {
  fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));
  const event = new FakeFetchEvent(request);
  await engine.handle(toFetchEvent(event));
  await event.settled();
}

describe("createRuntimeCacheEngine: networkTimeoutSeconds (network-first)", () => {
  it("serves the cache once the timeout elapses, with reason network-timeout, and passes the option to NetworkFirst", async () => {
    const request = new Request("https://shop.example.com/rt/a");
    const engine = createRuntimeCacheEngine(baseOptions({ cacheName: "rt-a", networkTimeoutSeconds: 2 }));
    expect(MockNetworkFirst.instances.at(-1)?.options["networkTimeoutSeconds"]).toBe(2);

    await primeCache(engine, request, "v1");

    // The second read's network never resolves within the 2s window.
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const event = new FakeFetchEvent(request);
    const pending = engine.handle(toFetchEvent(event));

    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;

    expect(await result.response.text()).toBe("v1");
    expect(result.servedFromCache?.reason).toBe("network-timeout");
    expect(typeof result.servedFromCache?.cachedAt).toBe("number");
  });

  it("a late network response still passes through admit/cacheWillUpdate while the handler is alive (best effort, ADR-0038)", async () => {
    const request = new Request("https://shop.example.com/rt/e");
    const engine = createRuntimeCacheEngine(baseOptions({ cacheName: "rt-e", networkTimeoutSeconds: 1 }));
    await primeCache(engine, request, "v1");

    let resolveNetwork: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveNetwork = resolve;
        }),
    );
    const event = new FakeFetchEvent(request);
    const pending = engine.handle(toFetchEvent(event));

    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    expect(await result.response.text()).toBe("v1");
    expect(result.servedFromCache?.reason).toBe("network-timeout");

    // The event's own extend-lifetime promises are already settled here -- doneWaiting() drained an empty handler
    // list once the timeout branch alone had answered (see the MockNetworkFirst comment above). A real worker is
    // free to terminate from this point on; this test does not model that, so it does NOT prove the write below is
    // guaranteed. It only proves that, while this handler instance stays alive, a response landing after the
    // timeout still runs through cacheWillUpdate/admission and updates the cache for the next read.
    await event.settled();

    resolveNetwork(new Response("v2", { status: 200 }));
    // The network promise's continuation (fetchAndCachePut -> handler.waitUntil(cachePut(...))) resumes on a later
    // microtask than this synchronous resolveNetwork() call; advancing fake timers by 0ms drains the microtask
    // queue so the cache write below has actually run.
    await vi.advanceTimersByTimeAsync(0);
    expect(await cacheStore.get("rt-e")?.get(request.url)?.clone().text()).toBe("v2");
  });

  it("serves the cache when the network fails before the timeout, with reason network-failed", async () => {
    const request = new Request("https://shop.example.com/rt/b");
    const engine = createRuntimeCacheEngine(baseOptions({ cacheName: "rt-b", networkTimeoutSeconds: 5 }));
    await primeCache(engine, request, "v1");

    fetchMock.mockRejectedValueOnce(new TypeError("offline in unit tests"));
    const event = new FakeFetchEvent(request);
    const result = await engine.handle(toFetchEvent(event));

    expect(await result.response.text()).toBe("v1");
    expect(result.servedFromCache?.reason).toBe("network-failed");
  });

  it("serves the cache on network failure with reason network-failed when no timeout is configured", async () => {
    const request = new Request("https://shop.example.com/rt/c");
    const engine = createRuntimeCacheEngine(baseOptions({ cacheName: "rt-c" }));
    await primeCache(engine, request, "v1");

    fetchMock.mockRejectedValueOnce(new TypeError("offline in unit tests"));
    const event = new FakeFetchEvent(request);
    const result = await engine.handle(toFetchEvent(event));

    expect(await result.response.text()).toBe("v1");
    expect(result.servedFromCache?.reason).toBe("network-failed");
  });

  it("waits for the network when the timeout elapses with no cache entry, and records no hit", async () => {
    const request = new Request("https://shop.example.com/rt/d");
    const engine = createRuntimeCacheEngine(baseOptions({ cacheName: "rt-d", networkTimeoutSeconds: 1 }));

    let resolveNetwork: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveNetwork = resolve;
        }),
    );
    const event = new FakeFetchEvent(request);
    const pending = engine.handle(toFetchEvent(event));

    await vi.advanceTimersByTimeAsync(1000);
    resolveNetwork(new Response("v-network", { status: 200 }));
    const result = await pending;

    expect(await result.response.text()).toBe("v-network");
    expect(result.servedFromCache).toBeNull();
  });

  it("constructs NetworkFirst without networkTimeoutSeconds when the option is unset, exactly as before this option existed", () => {
    createRuntimeCacheEngine(baseOptions({ cacheName: "rt-f" }));
    const instance = MockNetworkFirst.instances.at(-1);
    expect(Object.keys(instance?.options ?? {}).sort()).toEqual(["cacheName", "plugins"]);
    expect("networkTimeoutSeconds" in (instance?.options ?? {})).toBe(false);
  });

  it("builds the same plugin list as before this option existed when networkTimeoutSeconds is unset (no fetchDidFail hook)", () => {
    createRuntimeCacheEngine(baseOptions({ cacheName: "rt-f-plugins" }));
    const instance = MockNetworkFirst.instances.at(-1);
    const plugins =
      (instance?.options["plugins"] as
        | readonly { fetchDidFail?: unknown; cacheWillUpdate?: unknown; cachedResponseWillBeUsed?: unknown }[]
        | undefined) ?? [];
    expect(plugins).toHaveLength(2);
    const [platformPlugin, expirationPlugin] = plugins;
    expect(platformPlugin?.fetchDidFail).toBeUndefined();
    expect(typeof platformPlugin?.cacheWillUpdate).toBe("function");
    expect(typeof platformPlugin?.cachedResponseWillBeUsed).toBe("function");
    expect(expirationPlugin).toBeInstanceOf(MockExpirationPlugin);
  });

  it("registers the fetchDidFail hook only for network-first with a timeout configured", () => {
    createRuntimeCacheEngine(baseOptions({ cacheName: "rt-f-with-timeout", networkTimeoutSeconds: 2 }));
    const instance = MockNetworkFirst.instances.at(-1);
    const plugins = (instance?.options["plugins"] as readonly { fetchDidFail?: unknown }[] | undefined) ?? [];
    expect(typeof plugins[0]?.fetchDidFail).toBe("function");
  });
});

describe("createRuntimeCacheEngine: stale-while-revalidate is unaffected by networkTimeoutSeconds", () => {
  it("never passes networkTimeoutSeconds to StaleWhileRevalidate, and a cache hit still reports reason stale-while-revalidate", async () => {
    const request = new Request("https://shop.example.com/rt/g");
    const engine = createRuntimeCacheEngine(baseOptions({ cacheName: "rt-g", strategy: "stale-while-revalidate", networkTimeoutSeconds: 3 }));

    const instance = MockStaleWhileRevalidate.instances.at(-1);
    expect(Object.keys(instance?.options ?? {}).sort()).toEqual(["cacheName", "plugins"]);
    expect("networkTimeoutSeconds" in (instance?.options ?? {})).toBe(false);

    fetchMock.mockResolvedValue(new Response("v1", { status: 200 }));
    await primeCache(engine, request, "v1");

    const event = new FakeFetchEvent(request);
    const result = await engine.handle(toFetchEvent(event));

    expect(await result.response.text()).toBe("v1");
    expect(result.servedFromCache?.reason).toBe("stale-while-revalidate");
  });
});
