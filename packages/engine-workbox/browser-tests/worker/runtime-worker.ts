import { createRuntimeCacheEngine, type PwaRuntimeCacheEngine } from "../../src/worker/index.js";

// Stand-in for the platform worker (sw-runtime), which drives the runtime-cache port; bundled by runtime-fixture.ts.
// Test-only: skips waiting and claims clients immediately so a single registration controls the page without a
// reload, which the real platform worker (sw-runtime) must never do on its own.

declare const self: ServiceWorkerGlobalScope;

type Zone = { readonly prefix: string; readonly engine: PwaRuntimeCacheEngine };

/** One engine per test scenario, routed by URL path prefix; see browser-tests/runtime.spec.ts for what each covers. */
const zones: readonly Zone[] = [
  { prefix: "/rt/nf/", engine: createRuntimeCacheEngine({ cacheName: "rt-nf", strategy: "network-first", maxEntries: 50, maxAgeSeconds: 3600, admit: async () => true }) },
  { prefix: "/rt/swr/", engine: createRuntimeCacheEngine({ cacheName: "rt-swr", strategy: "stale-while-revalidate", maxEntries: 50, maxAgeSeconds: 3600, admit: async () => true }) },
  { prefix: "/rt/admit-false/", engine: createRuntimeCacheEngine({ cacheName: "rt-admit-false", strategy: "network-first", maxEntries: 50, maxAgeSeconds: 3600, admit: async () => false }) },
  { prefix: "/rt/expiry/", engine: createRuntimeCacheEngine({ cacheName: "rt-expiry", strategy: "network-first", maxEntries: 50, maxAgeSeconds: 2, admit: async () => true }) },
  { prefix: "/rt/max-entries/", engine: createRuntimeCacheEngine({ cacheName: "rt-max-entries", strategy: "network-first", maxEntries: 3, maxAgeSeconds: 3600, admit: async () => true }) },
  { prefix: "/rt/quota/", engine: createRuntimeCacheEngine({ cacheName: "rt-quota", strategy: "network-first", maxEntries: 50, maxAgeSeconds: 3600, admit: async () => true }) },
  { prefix: "/rt/quota-b/", engine: createRuntimeCacheEngine({ cacheName: "rt-quota-b", strategy: "network-first", maxEntries: 50, maxAgeSeconds: 3600, admit: async () => true }) },
  { prefix: "/rt/date/", engine: createRuntimeCacheEngine({ cacheName: "rt-date", strategy: "network-first", maxEntries: 50, maxAgeSeconds: 3600, admit: async () => true }) },
];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const path = new URL(event.request.url).pathname;
  const zone = zones.find((candidate) => path.startsWith(candidate.prefix));
  if (zone === undefined) return;
  event.respondWith(
    zone.engine.handle(event).then(({ response, servedFromCache }) => {
      // Test-only instrumentation: exposes what the engine reports without the engine itself ever adding a header
      // a real page could see. Never present in the platform worker.
      const headers = new Headers(response.headers);
      headers.set("x-test-served", JSON.stringify(servedFromCache));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }),
  );
});
