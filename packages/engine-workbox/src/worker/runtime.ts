import { ExpirationPlugin } from "workbox-expiration";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
// Type-only: workbox-expiration@7.4.1's own .d.ts does not satisfy WorkboxPlugin under exactOptionalPropertyTypes
// (its optional callback properties are typed without `| undefined`), so the plugin list needs one explicit cast
// below. No Workbox type otherwise leaves this module; PwaRuntimeCacheEngineOptions stays Workbox-free.
import type { WorkboxPlugin } from "workbox-core/types.js";

/** Internal header on the cached copy only; stripped before the response reaches the page. Never a public API. */
const STAMP_HEADER = "x-pwa-platform-cached-at";

export type PwaRuntimeCacheEngineOptions = {
  readonly cacheName: string;
  readonly strategy: "network-first" | "stale-while-revalidate";
  readonly maxEntries: number;
  readonly maxAgeSeconds: number;
  /** Platform admission check; the engine writes to the cache only when it resolves true. */
  readonly admit: (response: Response) => Promise<boolean>;
  /**
   * 1-30 integer seconds. Only meaningful for strategy "network-first": passed straight through to Workbox's
   * `NetworkFirst` so a cache hit is served once the timeout elapses, even while the network request is still
   * pending. Ignored for "stale-while-revalidate", which never waits on the network before serving a cache hit.
   * Omitted entirely (not `undefined`) when unset, so an engine built without it constructs `NetworkFirst`
   * exactly as before this option existed.
   */
  readonly networkTimeoutSeconds?: number;
};

export type PwaRuntimeCacheHit = {
  readonly cachedAt: number;
  readonly reason: "network-failed" | "network-timeout" | "stale-while-revalidate";
};

export type PwaRuntimeCacheResult = { readonly response: Response; readonly servedFromCache: PwaRuntimeCacheHit | null };

/** Runtime-cache port used by the platform worker (sw-runtime); it only acts when `handle` is called. */
export type PwaRuntimeCacheEngine = {
  /** Handles one fetch event; registers its own background work with event.waitUntil. */
  handle(event: FetchEvent): Promise<PwaRuntimeCacheResult>;
};

/** Clones `response`'s status, statusText and body with `headers` in place of its own. */
function withHeaders(response: Response, headers: Headers): Response {
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Creates the runtime-cache port for one plan entry. Write-time admission and the read-time expiry stamp are the
 * platform's own; `ExpirationPlugin` only enforces `maxEntries` (LRU) and `purgeOnQuotaError`, never `maxAgeSeconds`
 * (see below).
 */
export function createRuntimeCacheEngine(options: PwaRuntimeCacheEngineOptions): PwaRuntimeCacheEngine {
  const { cacheName, strategy, maxEntries, maxAgeSeconds, admit, networkTimeoutSeconds } = options;

  // Per-request correlation for servedFromCache: a module- or closure-level "last hit" variable would leak between
  // concurrent fetch events on the same engine instance, so hits are keyed by the FetchEvent of the call that
  // produced them and read back once, in `handle`.
  const hits = new WeakMap<FetchEvent, PwaRuntimeCacheHit>();

  // Marks the moment a network-first request's own network fetch fails. Workbox's `fetchDidFail` plugin hook fires
  // synchronously, inside `fetch()`'s catch block, only when `fetch()` itself throws (a real network failure) --
  // never for a 4xx/5xx response, and never for the timeout path. NetworkFirst reaches a cache hit through exactly
  // one of two routes (see workbox-strategies@7.4.1 NetworkFirst.js `_handle`): the network-failure catch in
  // `_getNetworkPromise` (which always runs `fetchDidFail` before calling `handler.cacheMatch`), or the timeout
  // callback in `_getTimeoutPromise` (which calls `handler.cacheMatch` directly and never touches `fetchDidFail`).
  // So when `cachedResponseWillBeUsed` fires, checking whether this event's fetch already failed distinguishes the
  // two reliably: it reads a flag set synchronously by Workbox's own callback ordering, rather than racing a
  // second timer of our own against Workbox's `networkTimeoutSeconds` timer.
  const networkFailed = new WeakMap<FetchEvent, true>();

  // fetchDidFail is only meaningful when a timeout is in play (see the reason ternary in cachedResponseWillBeUsed
  // below: without a timeout the reason always falls back to "network-failed" regardless of this flag), so it is
  // included in the plugin object only for strategy "network-first" with a timeout configured. An engine built
  // without a timeout is therefore constructed with exactly the plugin list this module had before this option
  // existed (no fetchDidFail key on platformPlugin at all).
  const trackNetworkFailure = strategy === "network-first" && networkTimeoutSeconds !== undefined;
  const platformPlugin = {
    ...(trackNetworkFailure
      ? {
          async fetchDidFail({ event }: { readonly event: ExtendableEvent }): Promise<void> {
            if (event instanceof FetchEvent) networkFailed.set(event, true);
          },
        }
      : {}),
    // Registering this hook is also what stops Workbox from prepending its own default cacheOkAndOpaque plugin
    // (workbox-strategies only does that when no plugin already defines cacheWillUpdate) — admission here is the
    // only gate, private/opaque/non-200 responses are never written unless `admit` itself accepts them.
    async cacheWillUpdate({ response }: { readonly response: Response }): Promise<Response | null> {
      if (!(await admit(response))) return null;
      const headers = new Headers(response.headers);
      headers.set(STAMP_HEADER, String(Date.now()));
      return withHeaders(response, headers);
    },
    async cachedResponseWillBeUsed({
      request,
      cachedResponse,
      event,
    }: {
      readonly request: Request;
      readonly cachedResponse?: Response;
      readonly event: ExtendableEvent;
    }): Promise<Response | undefined> {
      if (cachedResponse === undefined) return cachedResponse;
      const stampValue = cachedResponse.headers.get(STAMP_HEADER);
      const stamp = stampValue === null ? Number.NaN : Number(stampValue);
      // Expiry is decided solely by this stamp, never by ExpirationPlugin's own Date-header check: that check
      // vetoes entries at read time using the server's Date header, which would reject a freshly written copy of a
      // CDN-cached (and therefore already-old) response. ExpirationPlugin is configured below without
      // maxAgeSeconds so its own freshness check never runs.
      if (!Number.isFinite(stamp) || Date.now() - stamp > maxAgeSeconds * 1000) {
        const cache = await self.caches.open(cacheName);
        await cache.delete(request);
        return undefined;
      }
      if (event instanceof FetchEvent) {
        const reason: PwaRuntimeCacheHit["reason"] =
          strategy !== "network-first"
            ? "stale-while-revalidate"
            : networkFailed.get(event) === true
              ? "network-failed"
              : networkTimeoutSeconds !== undefined
                ? "network-timeout"
                : "network-failed";
        hits.set(event, { cachedAt: stamp, reason });
      }
      const headers = new Headers(cachedResponse.headers);
      headers.delete(STAMP_HEADER);
      return withHeaders(cachedResponse, headers);
    },
  };

  // maxAgeSeconds intentionally omitted: see the comment in cachedResponseWillBeUsed above.
  const expirationPlugin = new ExpirationPlugin({ maxEntries, purgeOnQuotaError: true });

  // The platform plugin must run before ExpirationPlugin so a request expired by our stamp is deleted (and its
  // cachedResponse turned into undefined) before ExpirationPlugin's own cachedResponseWillBeUsed sees it.
  const plugins = [platformPlugin, expirationPlugin] as WorkboxPlugin[];
  const strategyInstance =
    strategy === "network-first"
      ? new NetworkFirst(networkTimeoutSeconds === undefined ? { cacheName, plugins } : { cacheName, plugins, networkTimeoutSeconds })
      : new StaleWhileRevalidate({ cacheName, plugins });

  return {
    async handle(event) {
      const [responseDone, handlerDone] = strategyInstance.handleAll({ event, request: event.request });
      // A write failure (including QuotaExceededError, which purgeOnQuotaError above reacts to globally) must
      // never surface as an unhandled rejection or affect the response already given to the page; handlerDone only
      // covers Workbox's own background work (cache writes), which is otherwise unobserved once ignored here.
      event.waitUntil(handlerDone.catch(() => undefined));
      const response = await responseDone;
      const servedFromCache = hits.get(event) ?? null;
      hits.delete(event);
      networkFailed.delete(event);
      return { response, servedFromCache };
    },
  };
}
