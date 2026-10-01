import { MINIMAL_PAGE_MARKER, expect, fixturePath, isIosRun, readRealBrowserKind, test } from "../src/index.js";

test("serves the minimal page from a secure origin without registering a worker", async ({
  page,
  fixtureServer,
}) => {
  // An iPhone reaches the server through an HTTPS proxy on the Mac's LAN address (ADR-0049).
  expect(fixtureServer.origin).toMatch(isIosRun() ? /^https:\/\/\d+\.\d+\.\d+\.\d+:\d+$/ : /^http:\/\/localhost:\d+$/);

  await page.goto(fixtureServer.url("/"));

  expect(await page.locator(MINIMAL_PAGE_MARKER).textContent()).toBe("ready");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test("loading the minimal page makes no incidental requests such as /favicon.ico", async ({ page, fixtureServer }) => {
  // Safari requests /favicon.ico for the tab despite the page's inline `data:` icon, a moment after the load event; whether
  // that lands before the assertion is a race (observed: always, once the navigation is followed by any page script).
  test.skip(readRealBrowserKind(process.env) === "safari", "Safari requests /favicon.ico despite the inline icon, at a time of its own choosing");
  await page.goto(fixtureServer.url("/"), { waitUntil: "networkidle" });

  expect(fixtureServer.requests().map(({ method, path }) => `${method} ${path}`)).toEqual(["GET /"]);
});

test.describe("with an overridden fixture site", () => {
  test.use({
    fixtureSite: {
      versions: { minimal: fixturePath("pages") },
      headerRules: [{ pathPrefix: "/", headers: { "Cache-Control": "no-cache" } }],
    },
  });

  test("applies the site's header rules to page responses", async ({ page, fixtureServer }) => {
    test.skip(readRealBrowserKind(process.env) !== undefined, "WebDriver exposes no HTTP response headers of a navigation");
    const response = await page.goto(fixtureServer.url("/"));

    expect(fixtureServer.version).toBe("minimal");
    expect(response?.headers()["cache-control"]).toBe("no-cache");
  });
});

test.describe("with a directory in the site", () => {
  test.use({ fixtureSite: { versions: { root: fixturePath("pages", "..") } } });

  test("a directory path redirects to its trailing slash on the origin the page was loaded from, keeping the query", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url("/pages?marker=1"));

    expect(await page.evaluate(() => `${location.origin}${location.pathname}${location.search}`)).toBe(`${fixtureServer.origin}/pages/?marker=1`);
    expect(await page.locator(MINIMAL_PAGE_MARKER).textContent()).toBe("ready");
  });
});
