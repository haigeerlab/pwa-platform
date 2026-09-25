// Real-browser evidence for the runtime-cache engine port (tasks/public-read-cache/plan.md T6). Each test gets its
// own server (own origin, own Cache Storage partition) via the `runtimeServer` fixture below, so tests never need
// to clean up after each other. See ADR-0035 "执行、时效与配额" for the behaviour these scenarios pin down.
import { test as base, expect } from "@pwa-platform/browser-test-harness";
import { bundledRuntimeWorker } from "./runtime-fixture.js";
import {
  cacheKeys,
  cacheNames,
  fetchZone,
  installRuntimeWorker,
  overrideQuota,
  plantCacheEntry,
  rawBody,
  rawStamp,
  waitFor,
} from "./runtime-probe.js";
import { startRuntimeServer, type RuntimeServer } from "./runtime-server.js";

const test = base.extend<{ runtimeServer: RuntimeServer }>({
  // Playwright's fixture signature must be a literal object-destructuring pattern, even with no dependencies.
  // eslint-disable-next-line no-empty-pattern
  runtimeServer: async ({}, use) => {
    const script = await bundledRuntimeWorker();
    const server = await startRuntimeServer();
    server.setWorkerScript(script);
    try {
      await use(server);
    } finally {
      await server.close();
    }
  },
});

test.describe("network-first", () => {
  test("online: the page gets the network response, nothing is served from cache, and the entry is written with a stamp", async ({
    page,
    runtimeServer,
  }) => {
    runtimeServer.route("/rt/nf/x", ({ count }) => ({ status: 200, body: `nf-${count}` }));
    await installRuntimeWorker(page, runtimeServer.origin);

    const result = await fetchZone(page, runtimeServer.url("/rt/nf/x"));
    if (!result.ok) throw new Error(result.message);
    expect(result.status).toBe(200);
    expect(result.body).toBe("nf-1");
    expect(result.servedFromCache).toBeNull();
    expect(result.hasStampHeader).toBe(false);

    await waitFor(async () => (await cacheKeys(page, "rt-nf")).length > 0);
    expect(await cacheKeys(page, "rt-nf")).toEqual([runtimeServer.url("/rt/nf/x")]);
    const stamp = await rawStamp(page, "rt-nf", runtimeServer.url("/rt/nf/x"));
    expect(stamp).not.toBeNull();
    expect(Number(stamp)).toBeCloseTo(Date.now(), -3);
  });

  test("offline: the cached copy is returned with reason network-failed, cachedAt matches the stamp, and no stamp header reaches the page", async ({
    page,
    context,
    runtimeServer,
  }) => {
    runtimeServer.route("/rt/nf/y", ({ count }) => ({ status: 200, body: `nf-${count}` }));
    await installRuntimeWorker(page, runtimeServer.origin);
    const url = runtimeServer.url("/rt/nf/y");

    const online = await fetchZone(page, url);
    if (!online.ok) throw new Error(online.message);
    await waitFor(async () => (await cacheKeys(page, "rt-nf")).length > 0);
    const stamp = await rawStamp(page, "rt-nf", url);
    expect(stamp).not.toBeNull();

    await context.setOffline(true);
    const offline = await fetchZone(page, url);
    if (!offline.ok) throw new Error(offline.message);
    expect(offline.status).toBe(200);
    expect(offline.body).toBe("nf-1");
    expect(offline.servedFromCache).toEqual({ cachedAt: Number(stamp), reason: "network-failed" });
    expect(offline.hasStampHeader).toBe(false);
  });
});

test.describe("stale-while-revalidate", () => {
  test("second read is served from cache with reason stale-while-revalidate, and a later read shows the background update", async ({
    page,
    runtimeServer,
  }) => {
    runtimeServer.route("/rt/swr/x", ({ count }) => ({ status: 200, body: `swr-${count}` }));
    await installRuntimeWorker(page, runtimeServer.origin);
    const url = runtimeServer.url("/rt/swr/x");

    const first = await fetchZone(page, url);
    if (!first.ok) throw new Error(first.message);
    expect(first.body).toBe("swr-1");
    expect(first.servedFromCache).toBeNull();
    await waitFor(async () => (await rawStamp(page, "rt-swr", url)) !== null);

    const second = await fetchZone(page, url);
    if (!second.ok) throw new Error(second.message);
    expect(second.body).toBe("swr-1");
    expect(second.servedFromCache?.reason).toBe("stale-while-revalidate");
    // The background revalidation this same read triggered must land before the next read observes it. Poll the
    // cache directly (never by fetching again): each fetch through this zone triggers its own revalidation, so
    // re-fetching here would keep advancing the counter past the value this assertion is waiting for.
    await waitFor(async () => (await rawBody(page, "rt-swr", url)) === "swr-2");

    const third = await fetchZone(page, url);
    if (!third.ok) throw new Error(third.message);
    expect(third.body).toBe("swr-2");
    expect(third.servedFromCache?.reason).toBe("stale-while-revalidate");
  });
});

test.describe("admission", () => {
  test("admit=false: a non-200 response is not written, and an offline read afterwards fails", async ({ page, context, runtimeServer }) => {
    runtimeServer.route("/rt/admit-false/x", () => ({ status: 500, body: "rejected" }));
    await installRuntimeWorker(page, runtimeServer.origin);
    const url = runtimeServer.url("/rt/admit-false/x");

    const online = await fetchZone(page, url);
    if (!online.ok) throw new Error(online.message);
    expect(online.status).toBe(500);
    // Give any (wrongly) backgrounded write a chance to land before asserting nothing was written.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await cacheNames(page)).not.toContain("rt-admit-false");

    await context.setOffline(true);
    const offline = await fetchZone(page, url);
    expect(offline.ok).toBe(false);
  });
});

test.describe("expiry", () => {
  test("an entry older than maxAgeSeconds is not returned offline, and is deleted from the cache", async ({ page, context, runtimeServer }) => {
    runtimeServer.route("/rt/expiry/x", ({ count }) => ({ status: 200, body: `expiry-${count}` }));
    await installRuntimeWorker(page, runtimeServer.origin);
    const url = runtimeServer.url("/rt/expiry/x");

    const online = await fetchZone(page, url);
    if (!online.ok) throw new Error(online.message);
    await waitFor(async () => (await cacheKeys(page, "rt-expiry")).length > 0);

    // The worker zone for this path uses maxAgeSeconds: 2.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await context.setOffline(true);
    const offline = await fetchZone(page, url);
    expect(offline.ok).toBe(false);
    expect(await cacheKeys(page, "rt-expiry")).toEqual([]);
  });
});

test.describe("maxEntries", () => {
  test("the least-recently-used entry is evicted once the cap is exceeded", async ({ page, context, runtimeServer }) => {
    for (const key of ["a", "b", "c", "d"]) {
      runtimeServer.route(`/rt/max-entries/${key}`, () => ({ status: 200, body: key }));
    }
    await installRuntimeWorker(page, runtimeServer.origin);
    const urlFor = (key: string): string => runtimeServer.url(`/rt/max-entries/${key}`);

    for (const key of ["a", "b", "c"]) {
      const result = await fetchZone(page, urlFor(key));
      if (!result.ok) throw new Error(result.message);
    }
    await waitFor(async () => (await cacheKeys(page, "rt-max-entries")).length === 3);

    // Read "a" while offline so the read goes through the cache (a NetworkFirst read online always hits the
    // network first) and its LRU timestamp is refreshed ahead of "b" and "c".
    await context.setOffline(true);
    const readA = await fetchZone(page, urlFor("a"));
    if (!readA.ok) throw new Error(readA.message);
    await context.setOffline(false);

    const writeD = await fetchZone(page, urlFor("d"));
    if (!writeD.ok) throw new Error(writeD.message);
    await waitFor(async () => !(await cacheKeys(page, "rt-max-entries")).includes(urlFor("b")));

    expect(await cacheKeys(page, "rt-max-entries")).toEqual([urlFor("a"), urlFor("c"), urlFor("d")].sort());
  });
});

test.describe("quota", () => {
  test("an oversized write does not affect the page response; it purges every runtime cache but leaves an unmanaged cache intact", async ({
    page,
    context,
    runtimeServer,
  }) => {
    runtimeServer.route("/rt/quota-b/x", () => ({ status: 200, body: "small" }));
    runtimeServer.route("/rt/quota/small", () => ({ status: 200, body: "small" }));
    runtimeServer.route("/rt/quota/big", () => ({ status: 200, body: "x".repeat(900_000) }));
    await installRuntimeWorker(page, runtimeServer.origin);

    const other = await fetchZone(page, runtimeServer.url("/rt/quota-b/x"));
    if (!other.ok) throw new Error(other.message);
    await waitFor(async () => (await cacheKeys(page, "rt-quota-b")).length > 0);
    // A completed write is what registers a cache with its ExpirationPlugin's own purge bookkeeping (workbox-
    // expiration only learns a cache name once cacheDidUpdate or cachedResponseWillBeUsed has run for it), so the
    // cache the oversized write lands in needs one successful write of its own before the quota error, too.
    const warm = await fetchZone(page, runtimeServer.url("/rt/quota/small"));
    if (!warm.ok) throw new Error(warm.message);
    await waitFor(async () => (await cacheKeys(page, "rt-quota")).length > 0);

    await plantCacheEntry(page, "rt-plain", "/planted", "unmanaged");
    await overrideQuota(context, page, 300_000);

    const big = await fetchZone(page, runtimeServer.url("/rt/quota/big"));
    if (!big.ok) throw new Error(big.message);
    expect(big.status).toBe(200);
    expect(big.body).toHaveLength(900_000);

    await waitFor(async () => {
      const names = await cacheNames(page);
      return !names.includes("rt-quota") && !names.includes("rt-quota-b");
    });
    const names = await cacheNames(page);
    expect(names).toContain("rt-plain");
    const plain = await page.evaluate(async () => {
      const cache = await caches.open("rt-plain");
      const response = await cache.match("/planted");
      return response?.text() ?? null;
    });
    expect(plain).toBe("unmanaged");
  });
});

test.describe("Date header is not consulted", () => {
  test("a freshly written entry with an old Date header is still served offline", async ({ page, context, runtimeServer }) => {
    runtimeServer.route("/rt/date/x", ({ count }) => ({
      status: 200,
      headers: { Date: new Date(0).toUTCString() },
      body: `date-${count}`,
    }));
    await installRuntimeWorker(page, runtimeServer.origin);
    const url = runtimeServer.url("/rt/date/x");

    const online = await fetchZone(page, url);
    if (!online.ok) throw new Error(online.message);
    await waitFor(async () => (await cacheKeys(page, "rt-date")).length > 0);

    await context.setOffline(true);
    const offline = await fetchZone(page, url);
    if (!offline.ok) throw new Error(offline.message);
    expect(offline.status).toBe(200);
    expect(offline.body).toBe("date-1");
    expect(offline.servedFromCache?.reason).toBe("network-failed");
  });
});
