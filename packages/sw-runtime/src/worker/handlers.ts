// Turns the decision table into service worker listeners. The precache engine and the runtime-cache engine factory
// are both parameters, so every listener is testable with a fake port, a fake scope, and no Workbox import: this
// module only ever imports engine-workbox's *types*, never its runtime (workbox-core's dev logger touches `self` as
// soon as any of its modules loads, which breaks a plain Node import — see worker/index.ts, which does import the
// real values and is the only place that needs `self` stubbed first).
import type { createRuntimeCacheEngine, PwaPrecacheEngine, PwaRuntimeCacheEngine } from "@pwa-platform/engine-workbox/worker";
import { isOfflineWriteMessage, isRuntimeCachePendingMessage, isSkipWaitingMessage } from "../messages/index.js";
import type { PwaOfflineWriteMessage, PwaRuntimeCachePendingResult, PwaRuntimeCacheReason } from "../messages/index.js";
import { validatePushPayload } from "../push-payload/index.js";
import type { PwaPlatformWorkerConfig } from "../shared/config.js";
import { admitRuntimeResponse } from "./admit.js";
import { createRouter } from "./decide.js";
import type { PwaRequestDecision } from "./decide.js";
import { validateOfflineWriteEnqueue, validateOfflineWriteFlush } from "./offline-write-intent.js";
import { flushOfflineWrites } from "./offline-write-flush.js";
import { createOfflineWriteStore } from "./offline-write-store.js";
import { resolveNotificationTarget } from "./notification-target.js";
import { currentDataCacheName, deleteRuntimeCaches } from "./runtime-cleanup.js";

export type PwaPlatformWorkerHandlers = {
  readonly scope: ServiceWorkerGlobalScope;
  /** Already validated by `registerPlatformWorker`. */
  readonly config: PwaPlatformWorkerConfig;
  readonly engine: PwaPrecacheEngine;
  /**
   * Builds a runtime-cache engine. Required whenever `config.runtimeCache.enabled` is true; `registerPlatformWorker`
   * always supplies the real Workbox-backed factory. Tests inject a fake so they never need to load Workbox.
   */
  readonly createRuntimeCacheEngine?: typeof createRuntimeCacheEngine;
};

type PwaRuntimeDecision = Extract<PwaRequestDecision, { readonly kind: "runtime" }>;
type PwaRuntimeEngineKey = "pages" | "data-network-first" | "data-stale-while-revalidate";
type PwaPendingSignal = { readonly url: string; readonly cachedAt: number; readonly reason: PwaRuntimeCacheReason };

const PENDING_SIGNAL_LIMIT = 16;
const PENDING_SIGNAL_TTL_MS = 30_000;

/**
 * Registers `install`, `activate`, `fetch`, `message`, `push` and `notificationclick`, and nothing else. The worker
 * never calls `skipWaiting` on its own (updates are prompted) and never claims clients. `push` and
 * `notificationclick` are always on: see ADR-0021 for why a fixed pair of listeners has no observable effect on an
 * application that never subscribes to push.
 */
export function attachPlatformWorker({
  scope,
  config,
  engine,
  createRuntimeCacheEngine: runtimeCacheEngineFactory,
}: PwaPlatformWorkerHandlers): void {
  const origin = new URL(scope.location.href).origin;
  const router = createRouter({ config, manifestUrls: engine.urls(), origin });
  const offlineWriteStore = config.offlineWrites.enabled ? createOfflineWriteStore(config.offlineWrites) : undefined;
  const runtimeEngines = config.runtimeCache.enabled
    ? buildRuntimeEngines(config.runtimeCache, config.networkTimeoutSeconds, requireRuntimeCacheEngineFactory(runtimeCacheEngineFactory))
    : undefined;
  const pendingSignals = createPendingSignalStore();

  scope.addEventListener("install", (event) => {
    // The engine passes its work to event.waitUntil, so a failed download fails the install; the rejection is only
    // silenced here to keep it out of the worker's unhandled-rejection log.
    void engine.install(event).catch(() => undefined);
  });

  scope.addEventListener("activate", (event) => {
    // The cleanup itself already reached event.waitUntil, so a rejection here carries only the engine's diagnostic
    // signal — it fails loudly when a Workbox update changes the shape of its result. Let that surface.
    void engine.activate(event);
    // Every new activation removes runtime caches this config no longer wants: the pages cache outright (stale HTML
    // could reference resources the new precache dropped), and every data cache but the current digest's — all of
    // them when the runtime cache is disabled (spec "缓存命名与清理"). Activation cannot fail because of this cleanup:
    // a failure here has nowhere useful to surface and must not become an unhandled rejection on the activate event.
    event.waitUntil(deleteRuntimeCaches(scope, config.runtimeCache, currentDataCacheName(config.runtimeCache)).catch(() => undefined));
  });

  scope.addEventListener("fetch", (event) => {
    const decision = router.decide({
      method: event.request.method,
      url: event.request.url,
      navigation: event.request.mode === "navigate",
      // Any value counts, including "bytes=0-" (ADR-0023); decide() only acts on it for a manifest-hit request.
      range: event.request.headers.has("range"),
      authorization: event.request.headers.has("authorization"),
    });
    if (decision.kind === "passthrough") return;
    if (decision.kind === "precache") {
      event.respondWith(fromPrecache(scope, engine, decision.manifestUrl, event.request));
      return;
    }
    if (decision.kind === "runtime") {
      event.respondWith(respondFromRuntimeCache(scope, engine, runtimeEngineFor(runtimeEngines, decision), decision, event, pendingSignals));
      return;
    }
    event.respondWith(navigate(scope, engine, decision.fallbacks, event.request, config.networkTimeoutSeconds));
  });

  scope.addEventListener("message", (event) => {
    if (!isSameOriginWindow(event.source, origin)) return;
    if (isSkipWaitingMessage(event.data)) {
      // Prompted updates: the new worker takes over only after a page confirmed it (ADR-0005).
      event.waitUntil(scope.skipWaiting());
      return;
    }
    if (isRuntimeCachePendingMessage(event.data)) {
      const [port, ...rest] = event.ports;
      if (port === undefined || rest.length !== 0) return;
      const clientId = windowClientId(event.source);
      if (clientId === undefined) return;
      replyPending(port, pendingSignals.take(clientId));
      return;
    }
    if (!isOfflineWriteMessage(event.data)) return;
    const [port, ...rest] = event.ports;
    if (port === undefined || rest.length !== 0) return;
    if (event.data.type === "pwa:offline-write:clear") {
      event.waitUntil(clear(event.data, offlineWriteStore, port, scope, config.runtimeCache));
      return;
    }
    if (offlineWriteStore === undefined) return;
    if (event.data.type === "pwa:offline-write:enqueue") event.waitUntil(enqueue(event.data, config, origin, offlineWriteStore, port));
    if (event.data.type === "pwa:offline-write:flush") event.waitUntil(flush(event.data, config, origin, offlineWriteStore, port, scope.fetch));
  });

  scope.addEventListener("push", (event) => {
    const payload = event.data === null ? null : validatePushPayload(event.data.text());
    // Not the platform's format, empty, or unparsable: show nothing and record nothing (spec "设计 / 2").
    if (payload === null) return;
    const options: NotificationOptions = { data: { url: payload.url ?? null, data: payload.data ?? null } };
    if (payload.body !== undefined) options.body = payload.body;
    if (payload.tag !== undefined) options.tag = payload.tag;
    event.waitUntil(scope.registration.showNotification(payload.title, options));
  });

  scope.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const target = resolveNotificationTarget(readNotificationUrl(event.notification.data), scope.registration.scope);
    event.waitUntil(focusOrOpen(scope, target));
  });
}

async function clear(
  message: Extract<PwaOfflineWriteMessage, { readonly type: "pwa:offline-write:clear" }>,
  store: ReturnType<typeof createOfflineWriteStore> | undefined,
  port: MessagePort,
  scope: ServiceWorkerGlobalScope,
  runtimeCache: PwaPlatformWorkerConfig["runtimeCache"],
): Promise<void> {
  try {
    await store?.clear();
  } catch {
    reply(port, message.requestId, "rejected", "offline-write.storage");
    return;
  }
  // Every runtime cache goes on logout, current digest included — unlike activation, nothing is kept (spec "登出").
  // A failure here must not reply "cleared" while the runtime cache is enabled: the registration stays in place.
  // When it is disabled, this cleanup is best-effort (ADR-0035 "对 v1/v2 应用的非请求判断影响") — there is normally
  // nothing to delete, and a failure must not give v1/v2 and unenabled apps a new way for logout to fail.
  if (runtimeCache.enabled) {
    try {
      await deleteRuntimeCaches(scope, runtimeCache);
    } catch {
      reply(port, message.requestId, "rejected", "offline-write.storage");
      return;
    }
  } else {
    await deleteRuntimeCaches(scope, runtimeCache).catch(() => undefined);
  }
  replyClear(port, message.requestId);
}

async function flush(
  message: Extract<PwaOfflineWriteMessage, { readonly type: "pwa:offline-write:flush" }>,
  config: PwaPlatformWorkerConfig,
  origin: string,
  store: ReturnType<typeof createOfflineWriteStore>,
  port: MessagePort,
  send: typeof fetch,
): Promise<void> {
  const checked = validateOfflineWriteFlush(message, config);
  if (!checked.ok) return reply(port, message.requestId, "rejected", checked.code);
  try {
    const result = await flushOfflineWrites(store, checked.binding, origin, send);
    replyFlush(port, message.requestId, result);
  } catch {
    reply(port, message.requestId, "rejected", "offline-write.storage");
  }
}

async function enqueue(
  message: Extract<PwaOfflineWriteMessage, { readonly type: "pwa:offline-write:enqueue" }>,
  config: PwaPlatformWorkerConfig,
  origin: string,
  store: ReturnType<typeof createOfflineWriteStore>,
  port: MessagePort,
): Promise<void> {
  const checked = validateOfflineWriteEnqueue(message, config, origin);
  if (!checked.ok) return reply(port, message.requestId, "rejected", checked.code);
  try {
    reply(port, message.requestId, await store.enqueue(checked.value));
  } catch {
    reply(port, message.requestId, "rejected", "offline-write.storage");
  }
}

function reply(port: MessagePort, requestId: string, status: "queued" | "existing" | "rejected", code?: string): void {
  try {
    port.postMessage(code === undefined ? { type: "pwa:offline-write:result", version: 1, requestId, status } : { type: "pwa:offline-write:result", version: 1, requestId, status, code });
  } catch {
    // The page may have closed its port; queue admission remains authoritative and must not create an unhandled rejection.
  }
}

function replyFlush(port: MessagePort, requestId: string, result: Awaited<ReturnType<typeof flushOfflineWrites>>): void {
  try {
    port.postMessage({ type: "pwa:offline-write:result", version: 1, requestId, status: "flushed", ...result });
  } catch {
    // The page may have closed its port after requesting a flush; replay outcomes remain durable in IndexedDB.
  }
}

function replyClear(port: MessagePort, requestId: string): void {
  try {
    port.postMessage({ type: "pwa:offline-write:result", version: 1, requestId, status: "cleared" });
  } catch {
    // The page may have closed its port; a completed deletion must not surface as an unhandled worker rejection.
  }
}

/** Reads `data.url` without ever invoking an accessor: anything other than a plain object with a string data property is undefined. */
function readNotificationUrl(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const prototype: unknown = Object.getPrototypeOf(data);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(data, "url");
  if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "string") return undefined;
  return descriptor.value;
}

/** Focuses a same-origin, same-scope window already showing `target`, otherwise opens it. Never navigates an existing window. */
async function focusOrOpen(scope: ServiceWorkerGlobalScope, target: string): Promise<void> {
  try {
    const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true } as const);
    const existing = windows.find((client) => client.url === target);
    if (existing !== undefined) {
      await existing.focus();
      return;
    }
    await scope.clients.openWindow(target);
  } catch {
    // openWindow (and, in principle, focus) can reject — e.g. without user activation. There is nowhere useful to
    // surface that, so it is swallowed here rather than left as an unhandled rejection on the waitUntil promise.
  }
}

/** A precached URL: the cache answers; a missing entry falls back to the network rather than failing the request. */
async function fromPrecache(
  scope: ServiceWorkerGlobalScope,
  engine: PwaPrecacheEngine,
  manifestUrl: string,
  request: Request,
): Promise<Response> {
  return (await engine.match(manifestUrl)) ?? (await scope.fetch(request));
}

/**
 * Navigation: the network answers whenever it responds at all, including 4xx and 5xx; offline uses the fallbacks.
 * When `networkTimeoutSeconds` is set (ADR-0038) and the network has not answered within that many seconds, the
 * fallbacks are consulted early: a match is returned immediately and the still-pending network result is left to
 * settle on its own (its rejection is swallowed, and navigate() never writes to a cache either way, so nothing is
 * cached from it). With no matching fallback, navigate() keeps waiting for the network exactly as it would without a
 * timeout — a timeout must never turn a request that would have succeeded into an error.
 */
async function navigate(
  scope: ServiceWorkerGlobalScope,
  engine: PwaPrecacheEngine,
  fallbacks: readonly string[],
  request: Request,
  networkTimeoutSeconds: number | undefined,
): Promise<Response> {
  if (networkTimeoutSeconds === undefined) {
    try {
      const response = await scope.fetch(request);
      if (response.type !== "error") return response;
    } catch {
      // A rejected fetch is the usual network-failure signal; an error response follows the same fallback path.
    }
    return fallbackResponse(engine, fallbacks);
  }

  const networkPromise = scope.fetch(request);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Whichever settles first: the network (success or failure) clears the timer; the timer never rejects, so it
  // cannot itself produce an unhandled rejection.
  const timedOut = await new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), networkTimeoutSeconds * 1000);
    networkPromise.then(
      () => resolve(false),
      () => resolve(false),
    );
  });
  if (timer !== undefined) clearTimeout(timer);

  if (!timedOut) {
    try {
      const response = await networkPromise;
      if (response.type !== "error") return response;
    } catch {
      // A rejected fetch is the usual network-failure signal; an error response follows the same fallback path.
    }
    return fallbackResponse(engine, fallbacks);
  }

  // Timed out. The network promise above already has a handler attached (the race's own .then), so its eventual
  // settlement — success or rejection — can never surface as an unhandled rejection; nothing here awaits it while
  // a fallback is used.
  try {
    for (const candidate of fallbacks) {
      const fallback = await engine.match(candidate);
      if (fallback !== undefined) return fallback;
    }
  } catch {
    // engine.match rejected: fall through to waiting on the network below rather than turning a possibly-
    // successful request into an error (the same rule as "no fallback available").
  }
  // No fallback available: keep waiting for the network rather than turning a possibly-successful request into an
  // error (spec "一个都没有时，继续等网络"), then apply the same rules as a request that answered in time.
  try {
    const response = await networkPromise;
    if (response.type !== "error") return response;
  } catch {
    // Falls through to fallbackResponse, which finds nothing (again) and returns Response.error().
  }
  return fallbackResponse(engine, fallbacks);
}

/** The first precached fallback that exists, in order, or a network error when none does. */
async function fallbackResponse(engine: PwaPrecacheEngine, fallbacks: readonly string[]): Promise<Response> {
  for (const candidate of fallbacks) {
    const response = await engine.match(candidate);
    if (response !== undefined) return response;
  }
  return Response.error();
}

function isSameOriginWindow(source: ExtendableMessageEvent["source"], origin: string): boolean {
  if (source === null || !("type" in source) || source.type !== "window") return false;
  return URL.canParse(source.url) && new URL(source.url).origin === origin;
}

/** The requesting window client's id, read without invoking an accessor other than the plain property itself. */
function windowClientId(source: ExtendableMessageEvent["source"]): string | undefined {
  if (source === null || typeof source !== "object" || !("id" in source)) return undefined;
  const id = (source as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function replyPending(port: MessagePort, served: PwaRuntimeCachePendingResult["served"]): void {
  try {
    port.postMessage({ type: "pwa:runtime-cache:pending-result", version: 1, served });
  } catch {
    // The page may have closed its port; a missed reply must not surface as an unhandled worker rejection.
  }
}

function requireRuntimeCacheEngineFactory(factory: typeof createRuntimeCacheEngine | undefined): typeof createRuntimeCacheEngine {
  if (factory === undefined) {
    throw new Error("attachPlatformWorker: config.runtimeCache.enabled requires a createRuntimeCacheEngine factory");
  }
  return factory;
}

/**
 * Builds at most three runtime-cache engines, one per (cache, strategy) pair actually used, the first time each is
 * needed. `networkTimeoutSeconds` (ADR-0038), when set, is passed through only for the two network-first engines —
 * "pages" and "data-network-first" — never for "data-stale-while-revalidate", which never waits on the network.
 */
function buildRuntimeEngines(
  runtimeCache: Extract<PwaPlatformWorkerConfig["runtimeCache"], { readonly enabled: true }>,
  networkTimeoutSeconds: number | undefined,
  factory: typeof createRuntimeCacheEngine,
): (key: PwaRuntimeEngineKey) => PwaRuntimeCacheEngine {
  const built = new Map<PwaRuntimeEngineKey, PwaRuntimeCacheEngine>();
  return (key) => {
    const existing = built.get(key);
    if (existing !== undefined) return existing;
    const engine =
      key === "pages"
        ? factory({
            cacheName: runtimeCache.pagesCacheName,
            strategy: "network-first",
            maxEntries: runtimeCache.maxEntries,
            maxAgeSeconds: runtimeCache.maxAgeSeconds,
            admit: (response) =>
              admitRuntimeResponse(response, {
                resourceClass: "navigation-public-dynamic",
                strategy: "network-first",
                maxEntryBytes: runtimeCache.maxEntryBytes,
              }),
            ...(networkTimeoutSeconds === undefined ? {} : { networkTimeoutSeconds }),
          })
        : factory({
            cacheName: runtimeCache.dataCacheName,
            strategy: key === "data-network-first" ? "network-first" : "stale-while-revalidate",
            maxEntries: runtimeCache.maxEntries,
            maxAgeSeconds: runtimeCache.maxAgeSeconds,
            admit: (response) =>
              admitRuntimeResponse(response, {
                resourceClass: "public-data",
                strategy: key === "data-network-first" ? "network-first" : "stale-while-revalidate",
                maxEntryBytes: runtimeCache.maxEntryBytes,
              }),
            ...(key === "data-network-first" && networkTimeoutSeconds !== undefined ? { networkTimeoutSeconds } : {}),
          });
    built.set(key, engine);
    return engine;
  };
}

/** `decide()` only ever returns a `"runtime"` decision once `config.runtimeCache.enabled` made `runtimeEngines` non-undefined. */
function runtimeEngineFor(
  runtimeEngines: ((key: PwaRuntimeEngineKey) => PwaRuntimeCacheEngine) | undefined,
  decision: PwaRuntimeDecision,
): PwaRuntimeCacheEngine {
  if (runtimeEngines === undefined) throw new Error("Runtime-cache decision without a runtime-cache configuration");
  return runtimeEngines(decision.cache === "pages" ? "pages" : decision.strategy === "network-first" ? "data-network-first" : "data-stale-while-revalidate");
}

/**
 * Runs one runtime-cache decision. On success, a cache-served response's signal is delivered — posted straight to
 * the requesting client for a subresource, or stashed by `event.resultingClientId` for a navigation, since a
 * navigation's own client may not exist yet to receive a direct post (spec "页面信号", T1). On failure (network down
 * and nothing cached), a page decision falls back exactly like `navigate()`; a data decision rejects so the page
 * sees a network error, matching the spec's "read-only cache, no offline story for data" stance.
 */
async function respondFromRuntimeCache(
  scope: ServiceWorkerGlobalScope,
  precacheEngine: PwaPrecacheEngine,
  runtimeEngine: PwaRuntimeCacheEngine,
  decision: PwaRuntimeDecision,
  event: FetchEvent,
  pendingSignals: PwaPendingSignalStore,
): Promise<Response> {
  const result = await runtimeEngine.handle(event).catch((error: unknown) => {
    if (decision.cache === "pages") return undefined;
    throw error;
  });
  if (result === undefined) return fallbackResponse(precacheEngine, decision.fallbacks);

  if (result.servedFromCache !== null) {
    const signal: PwaPendingSignal = {
      url: requestPath(event.request.url),
      cachedAt: result.servedFromCache.cachedAt,
      reason: result.servedFromCache.reason,
    };
    if (decision.cache === "pages") pendingSignals.store(event.resultingClientId, signal);
    else event.waitUntil(postServedFromCacheSignal(scope, event.clientId, signal));
  }
  return result.response;
}

function requestPath(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
}

async function postServedFromCacheSignal(scope: ServiceWorkerGlobalScope, clientId: string, signal: PwaPendingSignal): Promise<void> {
  const client = await scope.clients.get(clientId);
  if (client === undefined) return;
  try {
    client.postMessage({ type: "pwa:runtime-cache:served", version: 1, ...signal });
  } catch {
    // The page may have navigated away or closed between the fetch and this signal; nothing to deliver to.
  }
}

type PwaPendingSignalStore = {
  readonly store: (clientId: string, signal: PwaPendingSignal) => void;
  readonly take: (clientId: string) => PwaPendingSignal | null;
};

/** At most 16 pending navigation signals, oldest evicted first; a signal older than 30s is dropped when taken. */
function createPendingSignalStore(): PwaPendingSignalStore {
  const entries = new Map<string, { readonly signal: PwaPendingSignal; readonly storedAt: number }>();
  return {
    store(clientId, signal) {
      entries.delete(clientId);
      entries.set(clientId, { signal, storedAt: Date.now() });
      while (entries.size > PENDING_SIGNAL_LIMIT) {
        const oldest: string | undefined = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
    take(clientId) {
      const entry = entries.get(clientId);
      entries.delete(clientId);
      if (entry === undefined || Date.now() - entry.storedAt > PENDING_SIGNAL_TTL_MS) return null;
      return entry.signal;
    },
  };
}
