import type { BrowserContext, Page } from "@playwright/test";
import { registerWorker, waitForController } from "@pwa-platform/browser-test-harness";

export const WORKER_URL = "/sw.js";
const STAMP_HEADER = "x-pwa-platform-cached-at";

export type ServedFromCache = { readonly cachedAt: number; readonly reason: "network-failed" | "stale-while-revalidate" } | null;

export type FetchOutcome =
  | { readonly ok: true; readonly status: number; readonly body: string; readonly servedFromCache: ServedFromCache; readonly hasStampHeader: boolean }
  | { readonly ok: false; readonly message: string };

/** Registers the runtime worker and waits until it controls the page (it claims clients itself; no reload needed). */
export async function installRuntimeWorker(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/`);
  await registerWorker(page, { scriptUrl: WORKER_URL });
  await waitForController(page, WORKER_URL);
}

/**
 * Fetches `url` from the page with the HTTP cache disabled, reading the test worker's `x-test-served` header for
 * `servedFromCache` and reporting whether the internal stamp header (which must never reach the page) is present.
 */
export async function fetchZone(page: Page, url: string): Promise<FetchOutcome> {
  return page.evaluate(
    async ({ requested, stampHeader }) => {
      try {
        const response = await fetch(requested, { cache: "no-store" });
        const body = await response.text();
        const servedHeader = response.headers.get("x-test-served");
        return {
          ok: true as const,
          status: response.status,
          body,
          servedFromCache: servedHeader === null ? null : (JSON.parse(servedHeader) as ServedFromCache),
          hasStampHeader: response.headers.has(stampHeader),
        };
      } catch (error) {
        return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
      }
    },
    { requested: url, stampHeader: STAMP_HEADER },
  );
}

/** Request URLs currently in `cacheName`, read directly through the page's own `caches`, sorted. */
export function cacheKeys(page: Page, cacheName: string): Promise<string[]> {
  return page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => request.url).sort();
  }, cacheName);
}

/** Names of every cache that currently exists for this origin; never re-creates a deleted cache. */
export function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}

/** The raw stamp header value stored for `url` in `cacheName`, bypassing every plugin (a direct `cache.match`). */
export async function rawStamp(page: Page, cacheName: string, url: string): Promise<string | null> {
  return page.evaluate(
    async ({ name, requested, stampHeader }) => {
      const cache = await caches.open(name);
      const response = await cache.match(requested);
      return response?.headers.get(stampHeader) ?? null;
    },
    { name: cacheName, requested: url, stampHeader: STAMP_HEADER },
  );
}

/** The raw cached body for `url` in `cacheName`, read directly through the page's `caches` (never via a fetch). */
export async function rawBody(page: Page, cacheName: string, url: string): Promise<string | null> {
  return page.evaluate(
    async ({ name, requested }) => {
      const cache = await caches.open(name);
      const response = await cache.match(requested);
      return response === undefined ? null : response.text();
    },
    { name: cacheName, requested: url },
  );
}

/** Writes `body` into `cacheName` under `url` directly through the page's `caches`, bypassing the engine entirely. */
export async function plantCacheEntry(page: Page, cacheName: string, url: string, body: string): Promise<void> {
  await page.evaluate(
    async ({ name, requested, content }) => {
      const cache = await caches.open(name);
      await cache.put(new Request(requested), new Response(content));
    },
    { name: cacheName, requested: url, content: body },
  );
}

/** Polls `check` until it returns true, or throws once `timeoutMs` has elapsed. */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() >= deadline) throw new Error(`Condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Shrinks the origin's storage quota via CDP so a subsequent write overflows it; restore is unnecessary per test. */
export async function overrideQuota(context: BrowserContext, page: Page, quotaBytes: number): Promise<void> {
  const session = await context.newCDPSession(page);
  await session.send("Storage.overrideQuotaForOrigin", { origin: new URL(page.url()).origin, quotaSize: quotaBytes });
}
