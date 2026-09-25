import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { createPrecacheEngine as CreatePrecacheEngine } from "../../src/worker/index.js";

const SCRIPT_URL = "https://shop.example.com/app/sw.js";
const CACHE_NAME = "pwa:storefront:production:r3:precache";
const entries = [
  { url: "/app/assets/app.3f9a2c7d.js", revision: null },
  { url: "/app/assets/logo.svg", revision: "a1b2c3d4e5f60718" },
  { url: "/app/offline.html", revision: "7d793037a0760186" },
];

type CacheMatch = (request: RequestInfo | URL, options?: MultiCacheQueryOptions) => Promise<Response | undefined>;

let createPrecacheEngine: typeof CreatePrecacheEngine;

beforeAll(async () => {
  // Workbox's development logger writes to `self` while its module loads, so the engine is imported only once a
  // service-worker-like `self` exists.
  vi.stubGlobal("self", { __WB_DISABLE_DEV_LOGS: true });
  ({ createPrecacheEngine } = await import("../../src/worker/index.js"));
  vi.unstubAllGlobals();
});

// A minimal service worker global scope: Workbox reads `location` and the engine reads `self`.
let cachesMatch: ReturnType<typeof vi.fn<CacheMatch>>;
let cachesOpen: ReturnType<typeof vi.fn>;
let addEventListener: ReturnType<typeof vi.fn>;
let skipWaiting: ReturnType<typeof vi.fn>;
let claim: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cachesMatch = vi.fn<CacheMatch>(async () => new Response("cached"));
  cachesOpen = vi.fn();
  addEventListener = vi.fn();
  skipWaiting = vi.fn();
  claim = vi.fn();
  const scope = {
    __WB_DISABLE_DEV_LOGS: true,
    location: new URL(SCRIPT_URL),
    caches: { match: cachesMatch, open: cachesOpen },
    addEventListener,
    skipWaiting,
    clients: { claim },
  };
  vi.stubGlobal("self", scope);
  vi.stubGlobal("location", scope.location);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createPrecacheEngine", () => {
  it("validates its options before touching Workbox", () => {
    expect(() => createPrecacheEngine({ cacheName: "workbox-precache-v2", entries })).toThrow(/cacheName must be/);
  });

  it("lists the manifest URLs in manifest order", () => {
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });
    expect(engine.urls()).toEqual(entries.map(({ url }) => url));
  });

  it("registers no listeners and neither skips waiting nor claims clients", async () => {
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });
    await engine.match("/app/offline.html");
    expect(addEventListener).not.toHaveBeenCalled();
    expect(skipWaiting).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });
});

describe("install", () => {
  it("hands its work to event.waitUntil during the event dispatch, before awaiting anything", async () => {
    // No network in unit tests: every download fails. Downloads themselves are verified in Chrome.
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline in unit tests"))));
    const waitUntil = vi.fn();
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });

    const pending = engine.install({ type: "install", waitUntil } as unknown as ExtendableEvent);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
    await expect(pending).rejects.toThrow();
  });
});

describe("activate", () => {
  it("deletes stale entries of its own precache and reports their request URLs", async () => {
    const stale = "https://shop.example.com/app/assets/app.0000aaaa.js";
    const current = "https://shop.example.com/app/offline.html?__WB_REVISION__=7d793037a0760186";
    const deleted: string[] = [];
    cachesOpen.mockResolvedValue({
      keys: async () => [new Request(current), new Request(stale)],
      delete: async (request: Request) => {
        deleted.push(request.url);
        return true;
      },
    });
    const waitUntil = vi.fn();
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });

    const pending = engine.activate({ waitUntil } as unknown as ExtendableEvent);
    // event.waitUntil must be called during the event dispatch, before the engine awaits anything.
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(await pending).toEqual({ deletedUrls: [stale] });
    expect(deleted).toEqual([stale]);
    expect(cachesOpen).toHaveBeenCalledWith(CACHE_NAME);
  });
});

describe("match", () => {
  it("reads a revisioned entry from its own precache under Workbox's revision cache key", async () => {
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });
    const response = await engine.match("/app/offline.html");

    expect(await response?.text()).toBe("cached");
    expect(cachesMatch).toHaveBeenCalledTimes(1);
    expect(cachesMatch).toHaveBeenCalledWith(
      "https://shop.example.com/app/offline.html?__WB_REVISION__=7d793037a0760186",
      { cacheName: CACHE_NAME },
    );
    expect(cachesOpen).not.toHaveBeenCalled();
  });

  it("uses the plain URL as the key of a fingerprinted entry and ignores fragments", async () => {
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });
    await engine.match("https://shop.example.com/app/assets/app.3f9a2c7d.js#chunk");
    expect(cachesMatch).toHaveBeenCalledWith("https://shop.example.com/app/assets/app.3f9a2c7d.js", { cacheName: CACHE_NAME });
  });

  it("returns undefined without reading any cache for URLs outside the manifest or that cannot be parsed", async () => {
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });
    for (const url of [
      "/app/unknown.js",
      "/app/offline.html?utm_source=mail",
      "/app/",
      "/app/offline",
      "https://cdn.example.com/app/offline.html",
      "http://[bad",
    ]) {
      expect(await engine.match(url), url).toBeUndefined();
    }
    expect(cachesMatch).not.toHaveBeenCalled();
    expect(cachesOpen).not.toHaveBeenCalled();
  });

  it("returns undefined when the entry is not cached yet", async () => {
    cachesMatch.mockResolvedValueOnce(undefined);
    const engine = createPrecacheEngine({ cacheName: CACHE_NAME, entries });
    expect(await engine.match("/app/assets/logo.svg")).toBeUndefined();
  });
});
