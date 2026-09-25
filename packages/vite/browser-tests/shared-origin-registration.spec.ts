// T7 scenario 1: a real root app (scope "/") and a real child app (scope "/m/"), both built by the plugin against
// one registry (ADR-0019) and merged onto one origin. Both workers must register successfully and each must
// control only its own pages.
import { expect, readRegistration, test, waitForController } from "@pwa-platform/browser-test-harness";
import {
  CHILD_SHELL_URL,
  CHILD_WORKER_URL,
  ROOT_SHELL_URL,
  ROOT_WORKER_URL,
  SHARED_ORIGIN_SITE,
} from "./shared-origin-fixture-site.js";
import { installAndControl } from "./page-probe.js";

test.use({ fixtureSite: SHARED_ORIGIN_SITE });

test.describe("a shared origin with a root app and a child app (ADR-0019)", () => {
  test("each worker registers, and each has a controller distinct from the other's", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);
    await installAndControl(page, fixtureServer, CHILD_SHELL_URL, CHILD_WORKER_URL);

    // Both registrations exist regardless of which page the container query runs from: this reads them from the
    // page currently on the child's scope, right after installAndControl finished there.
    const root = await readRegistration(page, ROOT_SHELL_URL);
    const child = await readRegistration(page, CHILD_SHELL_URL);
    expect(root?.active).toBe(fixtureServer.url(ROOT_WORKER_URL));
    expect(child?.active).toBe(fixtureServer.url(CHILD_WORKER_URL));
    expect(root?.active).not.toBe(child?.active);

    const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
    expect(new Set(scopes)).toEqual(new Set([fixtureServer.url(ROOT_SHELL_URL), fixtureServer.url(CHILD_SHELL_URL)]));
  });

  test("the child page is controlled by the child worker, not the root's", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);
    await installAndControl(page, fixtureServer, CHILD_SHELL_URL, CHILD_WORKER_URL);

    const controller = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
    expect(controller).toBe(fixtureServer.url(CHILD_WORKER_URL));
    await expect(page.locator("#child-marker")).toBeVisible();
  });

  test("the root page is controlled by the root worker, not the child's", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, CHILD_SHELL_URL, CHILD_WORKER_URL);
    await installAndControl(page, fixtureServer, ROOT_SHELL_URL, ROOT_WORKER_URL);
    await waitForController(page, ROOT_WORKER_URL);

    const controller = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
    expect(controller).toBe(fixtureServer.url(ROOT_WORKER_URL));
    await expect(page.locator("#root-marker")).toBeVisible();
  });
});
