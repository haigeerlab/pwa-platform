// Scenario 9 (tasks/ssr-adapters/plan.md, T7): a genuine chunk-load failure under router control.
//
// site/pwa-config.ts precaches /_nuxt broadly, same as every other real-Nuxt fixture in this package (needed by
// scenario 2). Every "asset"-classified file — including /lazy's own client chunk — is fetched *eagerly* during the
// worker's own `install` event (measured: /lazy's chunk answers `fromServiceWorker: true` on its very first
// request, before this page ever navigated there), not lazily on first visit. So a v1 session's precache already
// holds every chunk a v1 build ever shipped, and sw-runtime's fromPrecache handler answers from it regardless of
// whether the live origin still has the file — simply deploying v2 is not enough to make an already-precached
// chunk 404.
//
// This file removes every client JS chunk's precache entry (read from the manifest a real build shipped, not
// hand-guessed — Nuxt's chunk names are content hashes only, so there is no stable name to single /lazy's own out
// by) before deploying v2, reproducing "a chunk this session's precache does not (yet) hold" without touching the
// build or the policy; harmless here since this suite never visits any other page afterwards. fromPrecache's
// cache-miss path falls back to a real network fetch (see its own comment in
// packages/sw-runtime/src/worker/handlers.ts) — so once a build that genuinely lacks that file is live, the next
// import of it is a real 404, dispatching a real `vite:preloadError`, reaching Nuxt's real `app:chunkError` hook
// exactly as it would for an ordinary application whose worker had not (yet) precached that particular chunk.
//
// Two real builds exercise this: "manual" is the module's own default; "automatic" is an app that explicitly wrote
// `experimental.emitRouteChunkError: "automatic"` back into its own nuxt.config.ts (site/nuxt.config.ts, read from
// NUXT_E2E_AUTO_RELOAD — see its comment for why an app-level override, not loadNuxt's `overrides`, is required to
// exercise the module's "was this explicitly set" check).
import { expect, test } from "@pwa-platform/browser-test-harness";
import { cacheName } from "@pwa-platform/contracts";
import type { Page } from "@playwright/test";
import { publicDir, serverEntry } from "./global-setup.js";
import {
  clearHttpCache,
  clickGoLazyAndWaitForOutcome,
  deletePrecacheEntryForPath,
  documentMark,
  installAndControl,
  markDocument,
} from "./page.js";
import { readShippedPrecache } from "./release.js";
import { IDENTITY } from "./site/pwa-config.js";
import { startNuxtServer, type NuxtServer } from "./servers.js";
import { LAZY_URL, SHELL_URL } from "./urls.js";

const PRECACHE = cacheName(IDENTITY, "precache");

/**
 * Every client JS chunk a real build shipped, read from its manifest rather than guessed: Nuxt's client chunk
 * names are content hashes only (T1 record), so there is no stable name to hard-code, and no way to know in
 * advance which one is /lazy's own. Forgetting all of them (not just that one) is harmless for this test — it
 * never visits any other page after `installAndControl`.
 */
async function nuxtChunkPaths(variant: "manual" | "automatic", version: "v1" | "v2"): Promise<readonly string[]> {
  const shipped = await readShippedPrecache(publicDir(variant, version));
  return shipped.filter((entry) => /\/_nuxt\/.*\.js$/.test(entry.url)).map((entry) => entry.url);
}

/** Deletes every precache entry matching `paths` and clears Chrome's own HTTP cache, so a later re-request is a
 * genuine network round trip rather than a hit against either cache. */
async function forgetChunks(page: Page, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    await deletePrecacheEntryForPath(page, PRECACHE, path);
  }
  await clearHttpCache(page);
}

test.describe("auto-reload on a chunk-load failure", () => {
  let server: NuxtServer;

  test.afterEach(async () => {
    await server.close();
  });

  test("the module's default (manual) does not reload the page", async ({ page }) => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("manual", "v1"));
    await installAndControl(page, server);
    await forgetChunks(page, await nuxtChunkPaths("manual", "v1"));

    const mark = await markDocument(page);
    // Same origin, new build: the router still holds v1's own chunk URL in memory (nothing reloaded it), and the
    // v2 server genuinely does not have that file.
    await server.deploy(serverEntry("manual", "v2"));

    const outcome = await clickGoLazyAndWaitForOutcome(page);
    expect(outcome.startsWith("rejected:")).toBe(true);

    // No plugin listens for the failed navigation under "manual" (nuxt-build.test.ts pins this at the config
    // level); the window mark and the document's own URL are the browser-level proof that nothing reloaded it.
    expect(await documentMark(page)).toBe(mark);
    expect(page.url()).toBe(server.url(SHELL_URL));
    await expect(page.locator("h1")).toHaveText("home");
  });

  test("an app that explicitly opts back into automatic reload does reload", async ({ page }) => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("automatic", "v1"));
    await installAndControl(page, server);
    await forgetChunks(page, await nuxtChunkPaths("automatic", "v1"));

    await markDocument(page);
    await server.deploy(serverEntry("automatic", "v2"));

    await page.locator("#go-lazy").click();
    // reloadAppAtPath (Nuxt's own nuxt:chunk-reload plugin) navigates the whole browser to the failed route's own
    // path — a real, state-based condition to wait on instead of a fixed sleep.
    await page.waitForURL(server.url(LAZY_URL), { timeout: 15_000 });

    // A fresh document has no mark: the reload really happened, not merely a successful client-side navigation.
    expect(await documentMark(page)).toBeNull();
  });
});
