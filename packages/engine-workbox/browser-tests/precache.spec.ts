import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, readRegistration, test } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, MISSING_ENTRY_URL, MISSING_ENTRY_WORKER_URL, PRECACHE_CACHE_NAME, SITE_SOURCE } from "./fixture-site.js";
import { cacheContents, installEngineWorker, matchInWorker } from "./worker-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("install", () => {
  test("stores exactly the manifest entries in the plan's precache, revisioned entries under __WB_REVISION__ keys", async ({
    page,
    fixtureServer,
  }) => {
    await installEngineWorker(page, fixtureServer.origin);

    expect(await cacheContents(page)).toEqual({
      [PRECACHE_CACHE_NAME]: [
        fixtureServer.url("/assets/app.3f9a2c7d.js"),
        fixtureServer.url("/assets/logo.svg?__WB_REVISION__=a1b2c3d4e5f60718"),
        fixtureServer.url("/offline.html?__WB_REVISION__=7d793037a0760186"),
      ],
    });
    expect(PRECACHE_CACHE_NAME).toBe("pwa:engine-fixture:staging:b1:precache");
  });

  test("fails when a manifest entry cannot be downloaded", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/"));
    const finalState = await page.evaluate(async (scriptUrl) => {
      const registration = await navigator.serviceWorker.register(scriptUrl);
      const worker = registration.installing ?? registration.waiting ?? registration.active;
      if (worker === null) throw new Error("The registration has no worker");
      const settled = (): boolean => worker.state === "redundant" || worker.state === "activating" || worker.state === "activated";
      if (settled()) return worker.state;
      return new Promise<string>((resolve) => {
        worker.addEventListener("statechange", () => {
          if (settled()) resolve(worker.state);
        });
      });
    }, MISSING_ENTRY_WORKER_URL);

    expect(finalState).toBe("redundant");
    expect((await readRegistration(page, "/"))?.active ?? null).toBeNull();
    // The install failed because of the missing entry, not because the worker script itself was broken.
    expect(fixtureServer.requests().map(({ path }) => path)).toContain(MISSING_ENTRY_URL);
  });
});

test.describe("match", () => {
  test("serves every manifest entry from the precache while offline, without touching the network", async ({
    page,
    context,
    fixtureServer,
  }) => {
    await installEngineWorker(page, fixtureServer.origin);
    fixtureServer.clearRequests();
    await context.setOffline(true);

    for (const url of ["/assets/app.3f9a2c7d.js", "/assets/logo.svg", "/offline.html"]) {
      expect(await matchInWorker(page, url), url).toEqual({
        found: true,
        status: 200,
        body: readFileSync(join(SITE_SOURCE, url), "utf8"),
      });
    }
    expect(fixtureServer.requests()).toEqual([]);
  });

  test("returns undefined for URLs outside the manifest, even when they are stored in the precache", async ({
    page,
    fixtureServer,
  }) => {
    await installEngineWorker(page, fixtureServer.origin);
    await page.evaluate(async (cacheName) => {
      await (await caches.open(cacheName)).put(new Request("/planted.txt"), new Response("planted"));
    }, PRECACHE_CACHE_NAME);

    for (const url of [
      "/planted.txt",
      "/offline.html?__WB_REVISION__=7d793037a0760186",
      "/assets/logo.svg?v=2",
      "/index.html",
      "/",
    ]) {
      expect(await matchInWorker(page, url), url).toEqual({ found: false });
    }
  });
});
