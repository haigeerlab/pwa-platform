// Range requests bypass the precache (ADR-0023): a manifest-hit, non-navigation GET that carries a Range header is
// not answered from cache — the worker steps aside so the network's own Range-aware response comes back untouched.
// A request for the same URL without Range is unaffected and still comes from the precache.
import { expect, test } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, RANGE_ASSET_SIZE, RANGE_ASSET_URL } from "./fixture-site.js";
import { installAndControl } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("range requests against a precached asset (ADR-0023)", () => {
  test("a Range request is served by the network as a genuine partial response", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("range");
    await installAndControl(page, fixtureServer);
    fixtureServer.clearRequests();

    const result = await page.evaluate(async (url) => {
      const response = await fetch(url, { cache: "no-store", headers: { Range: "bytes=0-99" } });
      const body = new Uint8Array(await response.arrayBuffer());
      return { status: response.status, contentRange: response.headers.get("content-range"), bodyLength: body.byteLength };
    }, RANGE_ASSET_URL);

    expect(result).toEqual({ status: 206, contentRange: `bytes 0-99/${RANGE_ASSET_SIZE}`, bodyLength: 100 });
    // Stepping aside means the request actually reached the server, unlike a precache hit.
    expect(fixtureServer.requests().some((request) => request.path === RANGE_ASSET_URL)).toBe(true);
  });

  test("the same URL without Range is still answered from the precache", async ({ page, fixtureServer }) => {
    fixtureServer.deploy("range");
    await installAndControl(page, fixtureServer);
    fixtureServer.clearRequests();

    const status = await page.evaluate(async (url) => (await fetch(url, { cache: "no-store" })).status, RANGE_ASSET_URL);

    expect(status).toBe(200);
    expect(fixtureServer.requests().some((request) => request.path === RANGE_ASSET_URL)).toBe(false);
  });
});
