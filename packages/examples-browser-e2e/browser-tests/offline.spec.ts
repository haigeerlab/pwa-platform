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

    // Engine finding (ADR-0042, 2026-09-29): under Playwright WebKit, the React example's service worker never
    // reaches "activated" — installAndControl's poll hangs until the test's own 30s timeout, reproduced 3/3 in
    // isolation. The Vue example (same fixture server, same worker build pipeline) and Firefox are both unaffected,
    // so this is a WebKit/React-example-specific difference, not a flaky wait; skipped rather than weakened, and
    // reported as a finding rather than changed in product code.
    if (example === "react") {
      test.skip(({ browserName }) => browserName === "webkit", "Playwright WebKit stops answering the page while the React example's worker installs; root cause unknown, not seen in real Safari or on iPhone (ADR-0042, 2026-09-29)");
    }

    test("the cached shell starts offline without a blank page", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      fixtureServer.goOffline();
      try {
        await page.reload();
        // Not just "the document loaded": the example rendered, which means its script came from the precache too.
        await expect(page.locator("#shell")).toBeVisible();
        await expect(page.locator("#version")).toHaveText("v1");
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
        await expect(page.locator(".pwa-offline__heading")).toHaveText("You're offline");
        await expect(page.locator(".pwa-offline__app")).toHaveText(INSTALL.name);
        // The acceptance matrix: apart from offlineFallback.path, no other route's cached content may be returned.
        // Serving the shell here would look friendlier and still be wrong.
        await expect(page.locator("#shell")).toHaveCount(0);
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

        await expect(page.locator(".pwa-offline__heading")).toHaveText("You're offline");
        expect(elapsedMs).toBeGreaterThanOrEqual(TIMEOUT_LOWER_BOUND_MS);
        expect(elapsedMs).toBeLessThanOrEqual(TIMEOUT_UPPER_BOUND_MS);
      } finally {
        // Let the dangling request settle so the test tears down cleanly.
        release();
      }
    });
  });
}
