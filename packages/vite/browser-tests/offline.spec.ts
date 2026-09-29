import { expect, test } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, OFFLINE_URL, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import { fetchFromPage, installAndControl } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("offline behaviour of a plugin-built site", () => {
  test("serves the app shell from the precache with the network gone", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);

    // Nothing reaches the server from here on: what the page gets is what the worker precached during install,
    // which is what the plugin injected from the compiled plan.
    // Server-side fault (ADR-0047): works in every browser, including real Safari and Firefox sessions.
    fixtureServer.goOffline();
    await page.reload();

    await expect.poll(() => page.locator("#shell").isVisible()).toBe(true);
  });

  test("falls back to the offline page for a navigation it never precached", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();

    await page.goto(fixtureServer.url("/app/never-visited"));

    // The offline page lives in the app's public directory. It reaches the precache only because the plugin reads
    // that directory — files Vite copies there never enter the bundle. Without that, this navigation would fail.
    await expect.poll(() => page.locator("#offline-marker").isVisible()).toBe(true);
  });

  test("keeps the offline page itself fetchable while offline", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();

    const result = await fetchFromPage(page, fixtureServer.url(OFFLINE_URL), "offline-marker");
    expect(result.status).toBe(200);
    expect(result.hasMarker).toBe(true);
  });
});
