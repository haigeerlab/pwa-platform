import { expect, test } from "@pwa-platform/browser-test-harness";
import { INSTALL } from "../apps/shared/identity.js";
import { installAndControl, keepWebKitOffPushManager } from "./page.js";
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

    // ADR-0042: Playwright's WebKit loses the page when the React example's push panel queries PushManager.
    if (example === "react") {
      test.beforeEach(async ({ context, browserName }) => keepWebKitOffPushManager(context, browserName));
    }

    test("the cached shell starts offline without a blank page", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      fixtureServer.goOffline();
      try {
        await page.reload();
        // Not just "the document loaded": the example rendered, which means its script came from the precache too.
        await expect.poll(() => page.locator("#shell").isVisible()).toBe(true);
        await expect.poll(() => page.locator("#version").textContent()).toBe("v1");
      } finally {
        fixtureServer.goOnline();
      }
    });

    test("an uncached route shows the offline fallback, not another route's content", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      fixtureServer.goOffline();
      try {
        await page.goto(fixtureServer.url(UNCACHED_ROUTE));
        // The generated offline page (docs/guides/offline-page.md), not the example's own hand-written one.
        await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("You're offline");
        await expect.poll(() => page.locator(".pwa-offline__app").textContent()).toBe(INSTALL.name);
        // The acceptance matrix: apart from offlineFallback.path, no other route's cached content may be returned.
        // Serving the shell here would look friendlier and still be wrong.
        await expect.poll(() => page.locator("#shell").count()).toBe(0);
      } finally {
        fixtureServer.goOnline();
      }
    });

    test("a stalled uncached navigation shows the offline fallback about networkTimeoutSeconds later", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      const target = fixtureServer.url(UNCACHED_ROUTE);

      // Held open at the fixture server rather than intercepted with context.route: the latter reaches a service
      // worker's own fetch only in Chromium (spec/browser-test-harness.md "增补：服务器端断网与网络故障"), and this
      // is the same stall pattern packages/sw-runtime/browser-tests/network-timeout.spec.ts uses — the worker's
      // networkTimeoutSeconds timer fires exactly as it would against a genuinely slow network.
      const release = fixtureServer.stall(UNCACHED_ROUTE);
      try {
        const startedAt = Date.now();
        await page.goto(target, { timeout: TIMEOUT_UPPER_BOUND_MS });
        const elapsedMs = Date.now() - startedAt;

        await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("You're offline");
        expect(elapsedMs).toBeGreaterThanOrEqual(TIMEOUT_LOWER_BOUND_MS);
        expect(elapsedMs).toBeLessThanOrEqual(TIMEOUT_UPPER_BOUND_MS);
      } finally {
        // Let the dangling request settle so the test tears down cleanly.
        release();
      }
    });
  });
}
