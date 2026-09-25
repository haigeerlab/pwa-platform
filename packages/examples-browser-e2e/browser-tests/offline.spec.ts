import type { Route } from "@playwright/test";
import { expect, test } from "@pwa-platform/browser-test-harness";
import { INSTALL } from "../apps/shared/identity.js";
import { installAndControl } from "./page.js";
import { EXAMPLES, fixtureSite } from "./sites.js";

/** A route under the scope that no rule precaches. */
const UNCACHED_ROUTE = "/app/never-precached";

/** spec/examples-browser-e2e.md's revised "契约增量": the generated offline page's timing bounds for the
 * networkTimeoutSeconds scenario — high enough to prove it waited for the timeout (not an immediate fallback),
 * low enough that a genuine miss (no timeout applied) fails fast rather than hitting Playwright's own timeout. */
const TIMEOUT_LOWER_BOUND_MS = 4_500;
const TIMEOUT_UPPER_BOUND_MS = 15_000;

for (const example of EXAMPLES) {
  test.describe(`${example} example · offline`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    test("the cached shell starts offline without a blank page", async ({ page, context, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      await context.setOffline(true);
      try {
        await page.reload();
        // Not just "the document loaded": the example rendered, which means its script came from the precache too.
        await expect(page.locator("#shell")).toBeVisible();
        await expect(page.locator("#version")).toHaveText("v1");
      } finally {
        await context.setOffline(false);
      }
    });

    test("an uncached route shows the offline fallback, not another route's content", async ({ page, context, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      await context.setOffline(true);
      try {
        await page.goto(fixtureServer.url(UNCACHED_ROUTE));
        // The generated offline page (docs/guides/offline-page.md), not the example's own hand-written one.
        await expect(page.locator(".pwa-offline__heading")).toHaveText("You're offline");
        await expect(page.locator(".pwa-offline__app")).toHaveText(INSTALL.name);
        // The acceptance matrix: apart from offlineFallback.path, no other route's cached content may be returned.
        // Serving the shell here would look friendlier and still be wrong.
        await expect(page.locator("#shell")).toHaveCount(0);
      } finally {
        await context.setOffline(false);
      }
    });

    test("a stalled uncached navigation shows the offline fallback about networkTimeoutSeconds later", async ({ page, context, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      const target = fixtureServer.url(UNCACHED_ROUTE);

      // Intercept and never resolve: no fulfill/continue/abort. This is the same stall pattern
      // packages/sw-runtime/browser-tests/network-timeout.spec.ts uses — it reaches the service worker's own fetch,
      // so the worker's networkTimeoutSeconds timer fires exactly as it would against a genuinely slow network.
      const stalled: Route[] = [];
      await context.route(target, (route) => {
        stalled.push(route);
      });
      try {
        const startedAt = Date.now();
        await page.goto(target, { timeout: TIMEOUT_UPPER_BOUND_MS });
        const elapsedMs = Date.now() - startedAt;

        await expect(page.locator(".pwa-offline__heading")).toHaveText("You're offline");
        expect(elapsedMs).toBeGreaterThanOrEqual(TIMEOUT_LOWER_BOUND_MS);
        expect(elapsedMs).toBeLessThanOrEqual(TIMEOUT_UPPER_BOUND_MS);
      } finally {
        // Let the dangling request settle so the test tears down cleanly.
        await Promise.all(stalled.map((route) => route.abort().catch(() => undefined)));
        await context.unroute(target);
      }
    });
  });
}
