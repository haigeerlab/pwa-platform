// T7 scenarios 2, 3 and 4: the root worker's `exclude` rule (ADR-0019) must keep it out of the child's scope in
// every direction — serving the child's own pages offline, answering a subresource fetch a root page makes into the
// child's scope, and (when the child was never even deployed) not offering the root's own offline page in its place.
import { expect, requestFromPage, test } from "@pwa-platform/browser-test-harness";
import {
  CHILD_SERVER_JSON_URL,
  CHILD_SHELL_URL,
  CHILD_UNKNOWN_ROUTE_URL,
  CHILD_WORKER_URL,
  ROOT_LEFTOVER_URL,
  ROOT_SHELL_URL,
  ROOT_WORKER_URL,
  SHARED_ORIGIN_SITE,
} from "./shared-origin-fixture-site.js";
import { installAndControl, urlIsInAnyCache } from "./page-probe.js";

test.use({ fixtureSite: SHARED_ORIGIN_SITE });

test.describe("the root worker never answers for the child's scope", () => {
  test("offline, the child's pages are served by the child worker, never the root's", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);
    await installAndControl(page, fixtureServer, CHILD_SHELL_URL, CHILD_WORKER_URL);

    await context.setOffline(true);
    try {
      fixtureServer.clearRequests();
      await page.reload();
      await expect(page.locator("#child-marker")).toBeVisible();
      await expect(page.locator("#root-marker")).toHaveCount(0);

      // A child route nothing precached: the child's own offline page, not the root's.
      await page.goto(fixtureServer.url(CHILD_UNKNOWN_ROUTE_URL));
      await expect(page.locator("#child-offline-marker")).toBeVisible();
      await expect(page.locator("#root-offline-marker")).toHaveCount(0);

      // Both navigations were answered from a precache; the server saw neither.
      expect(fixtureServer.requests()).toEqual([]);
    } finally {
      await context.setOffline(false);
    }
  });

  test("a fetch from the root page into the child's scope never goes through the root worker", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);

    fixtureServer.clearRequests();
    const result = await requestFromPage(page, fixtureServer.url(CHILD_SERVER_JSON_URL));
    expect(result).toMatchObject({ outcome: "response", status: 200, fromServiceWorker: false });
    expect(fixtureServer.requests().map((request) => request.path)).toContain(CHILD_SERVER_JSON_URL);

    // `root-leftover.json` was built as part of the ROOT app's own output (design §3, T3/T6's compile-time
    // warning), yet it sits under the child's scope. The root's precache filter must have excluded it, so fetching
    // it behaves exactly like any other child-scope URL: no root cache claims it, and it reaches the server.
    expect(await urlIsInAnyCache(page, fixtureServer.url(ROOT_LEFTOVER_URL))).toBe(false);
    fixtureServer.clearRequests();
    const leftoverResult = await requestFromPage(page, fixtureServer.url(ROOT_LEFTOVER_URL));
    expect(leftoverResult).toMatchObject({ outcome: "response", status: 200, fromServiceWorker: false });
    expect(fixtureServer.requests().map((request) => request.path)).toContain(ROOT_LEFTOVER_URL);
  });

  test("root-only site: offline navigation to a child path with no worker gets a network error, not the root's offline page", async ({
    page,
    context,
    fixtureServer,
  }) => {
    fixtureServer.deploy("root-only");
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);

    await context.setOffline(true);
    try {
      fixtureServer.clearRequests();
      await expect(page.goto(fixtureServer.url(CHILD_UNKNOWN_ROUTE_URL))).rejects.toThrow();
      // No worker answered and nothing reached the (unreachable) server either.
      expect(fixtureServer.requests()).toEqual([]);
    } finally {
      await context.setOffline(false);
    }
  });
});
