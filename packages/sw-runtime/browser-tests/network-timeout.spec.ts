// Real-browser coverage for the explicit network timeout (NT6, spec/network-timeout.md "测试策略", ADR-0038),
// through the real platform worker (Workbox engine included). "Stalled" means intercepted by Playwright's
// `context.route` and never fulfilled, continued or aborted — the architecture decision in
// tasks/network-timeout/plan.md records that this reaches a service worker's own fetch too, so the worker's
// `networkTimeoutSeconds` timers fire exactly as they would against a genuinely slow network.
import type { BrowserContext, Page, Route } from "@playwright/test";
import { expect, snapshotCaches, test } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, RUNTIME_CATALOG_ITEMS_URL, RUNTIME_DASHBOARD_URL } from "./fixture-site.js";
import { installAndControl } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });
test.describe.configure({ timeout: 30_000 });

/** A navigation path under the app's scope that is neither precached nor a runtime-cache rule: it always reaches
 * `navigate()`'s own timeout branch (ADR-0038), the same route `offline.spec.ts` uses for "never cached". */
const UNCACHED_NAVIGATION_PATH = "/app/products/42";

/** The fixture's `networkTimeoutSeconds` (fixture-site.ts `timeoutPolicy`). Assertions leave generous margin on
 * both sides so a slow CI runner cannot make a real pass look like a miss. */
const TIMEOUT_LOWER_BOUND_MS = 900;
const TIMEOUT_UPPER_BOUND_MS = 5_000;

/**
 * Intercepts one URL and leaves every matching request pending: the handler never calls `fulfill`, `continue` or
 * `abort`. Call `release()` once the test is done observing the stall, so the dangling request (and, for a
 * navigation, the `page.goto()` awaiting it) can settle before the test ends.
 */
async function stallRoute(context: BrowserContext, url: string): Promise<{ release: () => Promise<void> }> {
  const captured: Route[] = [];
  await context.route(url, (route) => {
    captured.push(route);
  });
  return {
    release: async () => {
      await Promise.all(captured.map((route) => route.abort().catch(() => undefined)));
      await context.unroute(url);
    },
  };
}

/** Intercepts one URL and aborts every matching request immediately — a genuine network failure, not a stall. */
async function abortRoute(context: BrowserContext, url: string): Promise<() => Promise<void>> {
  await context.route(url, (route) => {
    void route.abort();
  });
  return () => context.unroute(url);
}

/** A same-origin JSON GET through the page, bypassing the HTTP cache. */
async function fetchJson(page: Page, url: string): Promise<unknown> {
  return page.evaluate(async (target) => (await fetch(target, { cache: "no-store" })).json(), url);
}

type ServedSignal = { readonly url: string; readonly cachedAt: number; readonly reason: string };

/**
 * Fetches a `public-data` URL while listening for the worker's `pwa:runtime-cache:served` message (posted straight
 * to this client, spec "页面事件"). The listener is attached before the fetch starts, in the same synchronous
 * promise-executor tick, so a message that arrives before the fetch settles is never missed.
 */
async function fetchWithServedSignal(page: Page, url: string): Promise<{ readonly body: unknown; readonly served: ServedSignal | null; readonly elapsedMs: number }> {
  return page.evaluate(async (target) => {
    const startedAt = Date.now();
    const { pathname, search } = new URL(target);
    const expectedPath = `${pathname}${search}`;
    const servedPromise = new Promise<ServedSignal | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 6_000);
      function handler(event: MessageEvent): void {
        const data = event.data as { readonly type?: string; readonly url?: string } | null;
        if (data !== null && data.type === "pwa:runtime-cache:served" && data.url === expectedPath) {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener("message", handler);
          resolve(data as unknown as ServedSignal);
        }
      }
      navigator.serviceWorker.addEventListener("message", handler);
    });
    const response = await fetch(target, { cache: "no-store" });
    const body: unknown = await response.json();
    const served = await servedPromise;
    return { body, served, elapsedMs: Date.now() - startedAt };
  }, url);
}

/**
 * Asks the controller for a runtime-cache signal stashed for this page's last navigation (spec "页面事件"; the same
 * `pwa:runtime-cache:pending` / `pending-result` exchange `client-runtime`'s facade uses, reimplemented here in the
 * page directly since sw-runtime's browser-tests talk to the worker without going through client-runtime).
 */
async function queryPendingServed(page: Page): Promise<ServedSignal | null> {
  return page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    if (controller === null) return null;
    return new Promise<ServedSignal | null>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 5_000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        const data = event.data as { readonly served: ServedSignal | null } | null;
        resolve(data?.served ?? null);
      };
      channel.port1.start();
      controller.postMessage({ type: "pwa:runtime-cache:pending", version: 1 }, [channel.port2]);
    });
  });
}

test.describe("navigation timeout (ADR-0038)", () => {
  test("a stalled navigation shows the offline fallback about a second later", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("timeout");
    await installAndControl(page, fixtureServer);
    const target = fixtureServer.url(UNCACHED_NAVIGATION_PATH);
    const before = await snapshotCaches(page);
    const stall = await stallRoute(context, target);

    const startedAt = Date.now();
    await page.goto(target);
    const elapsedMs = Date.now() - startedAt;

    await expect(page.locator("[data-offline]")).toHaveText("offline fallback");
    expect(elapsedMs).toBeGreaterThanOrEqual(TIMEOUT_LOWER_BOUND_MS);
    expect(elapsedMs).toBeLessThan(TIMEOUT_UPPER_BOUND_MS);
    // navigate()'s timeout branch never writes to any cache (spec "边界": 不引入新的缓存写入).
    expect(await snapshotCaches(page)).toEqual(before);

    await stall.release();
  });

  test("without networkTimeoutSeconds, the same stalled path is still pending after 3s (control)", async ({ page, context, fixtureServer }) => {
    // Default deployed version (fixture-site.ts FIXTURE_SITE) is "v1", which never sets networkTimeoutSeconds.
    await installAndControl(page, fixtureServer);
    const target = fixtureServer.url(UNCACHED_NAVIGATION_PATH);
    const stall = await stallRoute(context, target);

    // Chrome unloads the current document once a navigation starts, whether or not it ever commits, so the DOM
    // cannot tell "pending" from "committed to a blank page" here — the navigation promise itself is the signal.
    let settled = false;
    const navigation = page
      .goto(target, { timeout: 10_000 })
      .catch(() => undefined)
      .finally(() => {
        settled = true;
      });
    await page.waitForTimeout(3_000);

    expect(settled, "the stalled navigation must still be pending: no timeout is configured for this site").toBe(false);

    await stall.release();
    await navigation;
  });
});

test.describe("runtime cache timeout (ADR-0038)", () => {
  test("public-data network-first: a stalled retry is answered from cache in ~1s with reason network-timeout", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("timeout");
    await installAndControl(page, fixtureServer);
    const target = fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL);

    const online = await fetchJson(page, target);
    expect(online).toMatchObject({ item: "a" });

    const before = await snapshotCaches(page);
    const stall = await stallRoute(context, target);
    const result = await fetchWithServedSignal(page, target);
    const after = await snapshotCaches(page);
    await stall.release();

    expect(result.body).toEqual(online);
    expect(result.served).toMatchObject({ reason: "network-timeout" });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(TIMEOUT_LOWER_BOUND_MS);
    expect(result.elapsedMs).toBeLessThan(TIMEOUT_UPPER_BOUND_MS);
    // Nothing new was written to any cache while the network request was stalled (spec "边界": 不引入新的缓存写入).
    expect(after).toEqual(before);
  });

  test("navigation-public-dynamic network-first: a stalled reload is answered from cache in ~1s, signalled via the pending-query channel", async ({
    page,
    context,
    fixtureServer,
  }) => {
    fixtureServer.deploy("timeout");
    await installAndControl(page, fixtureServer);
    const target = fixtureServer.url(RUNTIME_DASHBOARD_URL);

    await page.goto(target);
    await expect(page.locator("[data-dashboard]")).toHaveText("dashboard v1");

    const before = await snapshotCaches(page);
    const stall = await stallRoute(context, target);
    const startedAt = Date.now();
    await page.goto(target);
    const elapsedMs = Date.now() - startedAt;
    await expect(page.locator("[data-dashboard]")).toHaveText("dashboard v1");
    const served = await queryPendingServed(page);
    const after = await snapshotCaches(page);
    await stall.release();

    expect(served).toMatchObject({ reason: "network-timeout" });
    expect(elapsedMs).toBeGreaterThanOrEqual(TIMEOUT_LOWER_BOUND_MS);
    expect(elapsedMs).toBeLessThan(TIMEOUT_UPPER_BOUND_MS);
    expect(after).toEqual(before);
  });
});

test.describe("network failure, not a timeout (ADR-0038)", () => {
  test("an aborted (not stalled) retry still reports reason network-failed", async ({ page, context, fixtureServer }) => {
    fixtureServer.deploy("timeout");
    await installAndControl(page, fixtureServer);
    const target = fixtureServer.url(RUNTIME_CATALOG_ITEMS_URL);

    const online = await fetchJson(page, target);
    expect(online).toMatchObject({ item: "a" });

    const unroute = await abortRoute(context, target);
    const result = await fetchWithServedSignal(page, target);
    await unroute();

    expect(result.body).toEqual(online);
    // The reason alone distinguishes an immediate failure from a timed-out stall; no separate upper-bound timing
    // assertion is needed (elapsedMs also includes waiting for the served message, not just the fetch itself).
    expect(result.served).toMatchObject({ reason: "network-failed" });
  });
});
