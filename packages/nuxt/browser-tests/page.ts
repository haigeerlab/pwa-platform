// Page-side helpers shared by the specs, adapted from examples-browser-e2e/browser-tests/page.ts for a NuxtServer
// (servers.ts) instead of a FixtureServer: the interface (#registered, #apply-update, ...) is observed where it
// shows state; worker state nothing in the interface shows is read from navigator.serviceWorker directly.
import { expect, waitForController } from "@pwa-platform/browser-test-harness";
import type { CDPSession, Page } from "@playwright/test";
import type { NuxtServer } from "./servers.js";
import { SHELL_URL, WORKER_URL } from "./urls.js";

export async function waitForActivatedWorker(page: Page, timeout = 15_000): Promise<void> {
  await page.evaluate(async (limit) => {
    const deadline = Date.now() + limit;
    for (;;) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active?.state === "activated") return;
      if (Date.now() >= deadline) throw new Error(`No activated worker within ${limit} ms`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, timeout);
}

/**
 * Opens the shell, waits for its own register() call to resolve and the worker to activate, then reloads so the
 * worker controls the document — which is what precaching and offline both depend on.
 */
export async function installAndControl(page: Page, server: NuxtServer): Promise<void> {
  await page.goto(server.url(SHELL_URL));
  await expect(page.locator("#registered")).toHaveText("registered", { timeout: 15_000 });
  await waitForActivatedWorker(page);
  await page.reload();
  await waitForController(page, server.url(WORKER_URL));
  await expect(page.locator("#registered")).toHaveText("registered");
}

/** A value stashed on `window`; a reload builds a new window, so reading it back proves the document survived. */
const DOCUMENT_MARK_KEY = "__pwaNuxtE2eDocumentMark";

export async function markDocument(page: Page): Promise<string> {
  const mark = `mark-${Math.random().toString(36).slice(2)}`;
  await page.evaluate(([key, value]) => Reflect.set(window, key, value), [DOCUMENT_MARK_KEY, mark] as const);
  return mark;
}

export function documentMark(page: Page): Promise<string | null> {
  return page.evaluate((key) => (Reflect.get(window, key) as string | undefined) ?? null, DOCUMENT_MARK_KEY);
}

/**
 * A `ServiceWorker` object, stashed on `window` so a later call in the same document can compare it by identity
 * (`===`), not merely by `scriptURL` — sw.js never changes address across versions, so two different worker
 * instances (an old, active one and a new, waiting one) always report the same URL (评审第 7 项: update.spec.ts's
 * first test needs a way to tell them apart that URL comparison alone cannot give it).
 */
const CONTROLLER_MARK_KEY = "__pwaNuxtE2eControllerMark";

export async function markController(page: Page): Promise<void> {
  await page.evaluate((key) => {
    Reflect.set(window, key, navigator.serviceWorker.controller);
  }, CONTROLLER_MARK_KEY);
}

/** Whether the page's current controller is the exact same worker instance `markController` last stashed. */
export function isSameController(page: Page): Promise<boolean> {
  return page.evaluate((key) => Reflect.get(window, key) === navigator.serviceWorker.controller, CONTROLLER_MARK_KEY);
}

export async function checkForUpdate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
}

/** Number of entries in one cache of the page's origin; `null` when no such cache exists. */
export function cacheEntryCount(page: Page, name: string): Promise<number | null> {
  return page.evaluate(async (cacheName) => {
    if (!(await caches.has(cacheName))) return null;
    return (await (await caches.open(cacheName)).keys()).length;
  }, name);
}

/** Every URL path cached in any CacheStorage cache of the page's origin, as `"<cache name> <pathname>"`. */
export function allCachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(`${name} ${new URL(request.url).pathname}`);
    }
    return urls;
  });
}

/**
 * Request URLs of every CacheStorage cache in the page's origin, by cache name — the same shape sw-runtime's
 * page-probe.ts uses, needed here so a spec can assert on the *set of caches* (e.g. "only the precache exists"),
 * not just flatten every entry the way `allCachedUrls` does.
 */
export function cacheContents(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const contents: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      contents[name] = (await (await caches.open(name)).keys()).map((request) => request.url).sort();
    }
    return contents;
  });
}

/** Whether the browser holds any service-worker registration at all. */
export function hasAnyRegistration(page: Page): Promise<boolean> {
  return page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length > 0);
}

/** Must match site/app/pages/index.vue's own copy of this key. */
const LAZY_NAV_OUTCOME_KEY = "__pwaNuxtE2eLazyNavOutcome";

function lazyNavOutcome(page: Page): Promise<string | null> {
  return page.evaluate((key) => (Reflect.get(window, key) as string | undefined) ?? null, LAZY_NAV_OUTCOME_KEY);
}

/**
 * Clicks "#go-lazy" and waits for its navigateTo("/lazy") call to settle in the *same* document, returning
 * "resolved" or "rejected:<message>". Only meaningful when the click does not reload the page — reload.spec.ts's
 * "automatic" case waits for the real navigation instead, since a reload tears this document down before the
 * promise here could ever settle.
 */
export async function clickGoLazyAndWaitForOutcome(page: Page, timeout = 15_000): Promise<string> {
  await page.evaluate((key) => Reflect.deleteProperty(window, key), LAZY_NAV_OUTCOME_KEY);
  await page.locator("#go-lazy").click();
  await expect.poll(() => lazyNavOutcome(page), { timeout }).not.toBeNull();
  return (await lazyNavOutcome(page)) ?? "";
}

/**
 * Pathnames of every `/_nuxt/*.js` resource the document has fetched so far, from the Resource Timing API.
 * Returned as a plain array (Playwright's evaluate() result crosses a JSON boundary, which does not carry a Set).
 */
export function loadedNuxtChunkPaths(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...new Set(
      performance
        .getEntriesByType("resource")
        .map((entry) => new URL((entry as PerformanceResourceTiming).name).pathname)
        .filter((pathname) => /\/_nuxt\/.*\.js$/.test(pathname)),
    ),
  ]);
}

/**
 * Clears Chrome's own HTTP cache (not any CacheStorage cache) via CDP. Needed so that re-requesting a URL this
 * page already fetched once is a genuine network round trip, not a hit served locally by the browser's ordinary
 * disk/memory cache — reload.spec.ts's whole scenario depends on the second request for /lazy's chunk genuinely
 * reaching the (now-redeployed) origin instead of being answered from either cache.
 */
export async function clearHttpCache(page: Page): Promise<void> {
  const session: CDPSession = await page.context().newCDPSession(page);
  try {
    await session.send("Network.clearBrowserCache");
  } finally {
    await session.detach();
  }
}

/**
 * Deletes the precache entry whose URL's pathname is exactly `pathname`, by scanning the cache's own keys rather
 * than reconstructing sw-runtime's cache-key format. Returns whether an entry was actually found and removed —
 * reload.spec.ts asserts this so a mismatched pathname fails loudly instead of silently precaching nothing.
 */
export function deletePrecacheEntryForPath(page: Page, cacheName: string, pathname: string): Promise<boolean> {
  return page.evaluate(
    async ({ cacheName, pathname }) => {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      const match = keys.find((request) => new URL(request.url).pathname === pathname);
      if (match === undefined) return false;
      await cache.delete(match);
      return true;
    },
    { cacheName, pathname },
  );
}
