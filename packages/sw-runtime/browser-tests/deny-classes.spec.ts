// Real-browser coverage for docs/architecture/v1-acceptance-matrix.md "未缓存、私有或流式请求", the non-navigation
// half: `session-data`, `mutation`, `stream` and `unclassified` requests must reach the network directly (never a
// cache) while online, and must fail with a network error — never a cached response — while offline.
//
// `offline.spec.ts`'s "denied and unclassified requests" describe block already covers `session-data` (DENIED_URL)
// and `unclassified` (UNCLASSIFIED_URL) as non-navigation fetches. This file adds `mutation` and `stream`, which
// have no existing non-navigation coverage, using the `deny-classes` fixture (`fixture-site.ts`) whose policy adds
// explicit `mutation` (`/api/orders`) and `stream` (`/api/live`) path rules on top of the existing `session-data`
// rule. `decide.ts` denies all four classes before any cache read or write: `session-data`/`mutation`/`stream` via
// their compiled `action: "deny"` path rule (decide.ts:109, "the network answers whenever it responds at all...
// never anything cached"), and a POST additionally via the `method !== "GET"` baseline check (decide.ts:99) that
// runs before any path rule is even matched. `unclassified` is denied because no path rule matches at all
// (decide.ts:105). None of these four decisions ever produces a `precache` or `runtime` decision, so nothing is
// ever written to, or read from, the platform cache namespace for them.
import { expect, readRealBrowserKind, test } from "@pwa-platform/browser-test-harness";
import type { Page } from "@playwright/test";
import { DENIED_URL, FIXTURE_SITE, MUTATION_URL, PRECACHE_CACHE_NAME, STREAM_URL, UNCLASSIFIED_URL } from "./fixture-site.js";
import { cacheContents, installAndControl } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

type MethodRequestResult =
  | { readonly outcome: "response"; readonly status: number; readonly fromServiceWorker: boolean }
  | { readonly outcome: "network-error" };

let requestCounter = 0;

/**
 * Same-origin fetch through the page with an explicit HTTP method, bypassing the HTTP cache. Mirrors
 * `requestFromPage` from `@pwa-platform/browser-test-harness` (GET-only there), duplicated here rather than
 * modified in the harness package because this change is test-only.
 */
async function requestMethodFromPage(page: Page, url: string, method: string): Promise<MethodRequestResult> {
  const target = new URL(url, page.url());
  target.hash = "";
  requestCounter += 1;
  const header = "x-pwa-harness-request";
  const marker = `deny-classes-${process.pid}-${requestCounter}`;
  // A WebDriver session has no network events (ADR-0047), so on a real Safari or Firefox the page itself reports
  // whether a worker answered, through the Resource Timing entry of the request (same evidence as the harness's
  // `requestFromPage`).
  const real = readRealBrowserKind(process.env) !== undefined;
  const responseEvent = real ? undefined : page.waitForResponse((response) => response.request().headers()[header] === marker, { timeout: 10_000 });
  responseEvent?.catch(() => undefined);

  const result = await page.evaluate(
    async ({ requested, requestMethod, headerName, headerValue, onRealBrowser }) => {
      try {
        const known = performance.getEntriesByName(requested).length;
        const response = await fetch(requested, {
          method: requestMethod,
          cache: "no-store",
          headers: { [headerName]: headerValue },
          signal: AbortSignal.timeout(10_000),
        });
        let fromWorker = 0;
        if (onRealBrowser) {
          // The entry is added once the body has finished; wait for the one this request created.
          await response.arrayBuffer();
          for (let attempt = 0; attempt < 40 && performance.getEntriesByName(requested).length <= known; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          const timing = performance.getEntriesByName(requested).at(-1) as PerformanceResourceTiming | undefined;
          // No network protocol means the response did not come over the network (a worker built it or read a cache).
          fromWorker = timing !== undefined && timing.nextHopProtocol === "" ? 1 : 0;
        }
        return { ok: true as const, status: response.status, fromWorker };
      } catch (error) {
        return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
      }
    },
    { requested: target.href, requestMethod: method, headerName: header, headerValue: marker, onRealBrowser: real },
  );

  if (!result.ok) return { outcome: "network-error" };
  if (responseEvent === undefined) return { outcome: "response", status: result.status, fromServiceWorker: result.fromWorker > 0 };
  const response = await responseEvent;
  return { outcome: "response", status: result.status, fromServiceWorker: response.fromServiceWorker() };
}

const DENY_CLASSES = [
  { name: "session-data", url: DENIED_URL, method: "GET", status: 200 },
  { name: "mutation (POST)", url: MUTATION_URL, method: "POST", status: 201 },
  { name: "mutation (GET)", url: MUTATION_URL, method: "GET", status: 200 },
  { name: "stream", url: STREAM_URL, method: "GET", status: 200 },
  { name: "unclassified", url: UNCLASSIFIED_URL, method: "GET", status: 200 },
] as const;

test.describe("未缓存、私有或流式请求: non-navigation session-data, mutation, stream and unclassified requests", () => {
  for (const { name, url, method, status } of DENY_CLASSES) {
    test(`${name}: online reaches the server and leaves no entry in the platform cache namespace`, async ({ page, fixtureServer }) => {
      fixtureServer.deploy("deny-classes");
      await installAndControl(page, fixtureServer);

      const result = await requestMethodFromPage(page, fixtureServer.url(url), method);
      expect(result).toEqual({ outcome: "response", status, fromServiceWorker: false });
      expect(fixtureServer.requests().map(({ method: seenMethod, path }) => `${seenMethod} ${path}`)).toEqual([`${method} ${url}`]);

      const contents = await cacheContents(page);
      expect(Object.keys(contents)).toEqual([PRECACHE_CACHE_NAME]);
      expect(contents[PRECACHE_CACHE_NAME]?.some((key) => key.includes(url))).toBe(false);
    });

    test(`${name}: offline gets a network error, never a cached response`, async ({ page, fixtureServer }) => {
      fixtureServer.deploy("deny-classes");
      await installAndControl(page, fixtureServer);
      // Server-side fault (ADR-0047): works in every browser, including real Safari and Firefox sessions.
      fixtureServer.goOffline();

      const result = await requestMethodFromPage(page, fixtureServer.url(url), method);
      expect(result).toEqual({ outcome: "network-error" });
      expect(fixtureServer.requests()).toEqual([]);
    });
  }
});
