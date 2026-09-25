// Page-side helpers. The fixture app exposes its client, its collected events and its config on `window`; these
// read them back through page.evaluate so the specs stay about behaviour rather than plumbing.
import { waitForController, type FixtureServer } from "@pwa-platform/browser-test-harness";
import type { Page } from "@playwright/test";

export async function pageRegister(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (Reflect.get(window, "__pwaClient") as { register(): Promise<unknown> }).register();
  });
}

export function pageApplyUpdate(page: Page): Promise<boolean> {
  return page.evaluate(
    async () => await (Reflect.get(window, "__pwaClient") as { applyUpdate(): Promise<boolean> }).applyUpdate(),
  );
}

/** The raw event values; the harness validates them against contracts rather than trusting their shape here. */
export function collectedEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(() => [...(Reflect.get(window, "__pwaEvents") as unknown[])]);
}

/** The config the virtual module delivered, as the page received it. */
export function pageConfig(page: Page): Promise<unknown> {
  return page.evaluate(() => Reflect.get(window, "__pwaConfig"));
}

export type WaitForActiveWorkerActivatedOptions = {
  /** An explicit `getRegistration(scope)` lookup (the same exact-match guard `readRegistration` uses); omit for the
   * page's own implicit registration. */
  readonly scope?: string;
  readonly timeout?: number;
};

/**
 * Waits until a worker is "activated" — at `options.scope` when given, or via the page's own implicit registration
 * otherwise. Takes an options object, not a positional `(page, scope, timeout)`, so a numeric timeout can never be
 * passed where `scope` is expected and silently read as a scope string.
 *
 * The explicit form matters once more than one registration exists on an origin (T7's shared-origin fixture):
 * Chrome's argument-less `getRegistration()`, called right after registering a more specific scope alongside an
 * already-active broader one, was observed returning the *broader, already-active* registration instead of the one
 * actually being installed — so this resolved instantly without ever waiting. Polling `getRegistration(scope)`
 * avoids that ambiguity; every other caller (a single-registration fixture) is unaffected.
 */
export async function waitForActiveWorkerActivated(
  page: Page,
  { scope, timeout = 10_000 }: WaitForActiveWorkerActivatedOptions = {},
): Promise<void> {
  await page.evaluate(
    async ({ scope, limit }) => {
      const expected = scope === null ? null : new URL(scope, location.href).href;
      const deadline = Date.now() + limit;
      for (;;) {
        const registration =
          expected === null ? await navigator.serviceWorker.getRegistration() : await navigator.serviceWorker.getRegistration(expected);
        const worker = registration?.active;
        if (worker?.state === "activated" && (expected === null || registration?.scope === expected)) return;
        if (Date.now() >= deadline) throw new Error(`No activated worker within ${limit} ms`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    { scope: scope ?? null, limit: timeout },
  );
}

/** Registers and waits until the document is controlled, which is what precaching and offline both depend on. */
export async function installAndControl(
  page: Page,
  fixtureServer: FixtureServer,
  shellUrl: string,
  workerUrl: string,
): Promise<void> {
  await page.goto(fixtureServer.url(shellUrl));
  await pageRegister(page);
  await waitForActiveWorkerActivated(page, { scope: shellUrl });
  // A fresh navigation, not `page.reload()`: Chrome was observed keeping a reloaded document's existing (less
  // specific) controller rather than re-matching scopes on reload, so on a shared origin (T7) a reload here would
  // never hand control to a worker whose scope is more specific than one already active elsewhere on the origin. A
  // plain `goto` to the same URL always re-runs the match.
  await page.goto(fixtureServer.url(shellUrl));
  await waitForController(page, workerUrl);
  // The navigation built a new window: a new facade, a new event array, and no subscription to the registration.
  // Without registering again the page would observe nothing at all — not the update it is waiting for, and not
  // even its own registration.
  await pageRegister(page);
}

/** Deploys another version and waits for the browser to find the new worker. */
export async function deployAndWait(page: Page, fixtureServer: FixtureServer, version: string, timeout = 10_000): Promise<void> {
  fixtureServer.deploy(version);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
  await page.evaluate(async (limit) => {
    const deadline = Date.now() + limit;
    for (;;) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting !== null && registration?.waiting !== undefined) return;
      if (Date.now() >= deadline) throw new Error(`No waiting worker within ${limit} ms`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, timeout);
}

/** Names of the caches the browser holds, so a spec can assert what the worker created. */
export function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}

/** True if any live Cache Storage entry — under any cache name — answers exactly this URL. */
export function urlIsInAnyCache(page: Page, url: string): Promise<boolean> {
  // Compared by origin and path, ignoring the query: Workbox stores a revisioned precache entry under its URL plus
  // `?__WB_REVISION__=…`, so an exact `cache.match(url)` never finds it and this check would pass vacuously. The
  // shared-origin T9 mutation (root precache filter removed) was missed exactly that way before this was fixed.
  return page.evaluate(async (target) => {
    const wanted = new URL(target);
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const cached = new URL(request.url);
        if (cached.origin === wanted.origin && cached.pathname === wanted.pathname) return true;
      }
    }
    return false;
  }, url);
}

/** Fetches a URL from inside the page, reporting status and a marker from the body. */
export function fetchFromPage(page: Page, url: string, marker: string): Promise<{ status: number; hasMarker: boolean }> {
  return page.evaluate(
    async ([target, needle]) => {
      const response = await fetch(target as string);
      const body = await response.text();
      return { status: response.status, hasMarker: body.includes(needle as string) };
    },
    [url, marker],
  );
}
