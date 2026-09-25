import { MINIMAL_PAGE_MARKER, expect, fixturePath, test } from "../src/index.js";

test("serves the minimal page from a secure localhost origin without registering a worker", async ({
  page,
  fixtureServer,
}) => {
  expect(fixtureServer.origin).toMatch(/^http:\/\/localhost:\d+$/);

  await page.goto(fixtureServer.url("/"));

  await expect(page.locator(MINIMAL_PAGE_MARKER)).toHaveText("ready");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test("loading the minimal page makes no incidental requests such as /favicon.ico", async ({ page, fixtureServer }) => {
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
    const response = await page.goto(fixtureServer.url("/"));

    expect(fixtureServer.version).toBe("minimal");
    expect(response?.headers()["cache-control"]).toBe("no-cache");
  });
});
