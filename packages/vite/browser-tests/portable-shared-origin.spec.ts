import { expect, test } from "@playwright/test";
import { readRegistration, startFixtureServer } from "@pwa-platform/browser-test-harness";
import {
  CHILD_SHELL_URL, CHILD_UNKNOWN_ROUTE_URL, CHILD_WORKER_URL, PORTABLE_SHARED_SITE,
  ROOT_SHELL_URL, ROOT_WORKER_URL,
} from "./shared-origin-fixture-site.js";
import { installAndControl, urlIsInAnyCache } from "./page-probe.js";

test("portable root and /m/ child keep their workers and exclusions on each origin", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await startFixtureServer(PORTABLE_SHARED_SITE);
  const b = await startFixtureServer(PORTABLE_SHARED_SITE);
  const context = await browser.newContext();
  try {
    expect(a.origin).not.toBe(b.origin);
    for (const server of [a, b]) {
      const rootPage = await context.newPage();
      await installAndControl(rootPage, server, ROOT_SHELL_URL, ROOT_WORKER_URL);
      expect(await urlIsInAnyCache(rootPage, server.url(CHILD_SHELL_URL))).toBe(false);

      server.goOffline();
      try {
        await expect(rootPage.goto(server.url(CHILD_UNKNOWN_ROUTE_URL))).rejects.toThrow();
      } finally {
        server.goOnline();
        await rootPage.close();
      }

      const page = await context.newPage();
      await installAndControl(page, server, CHILD_SHELL_URL, CHILD_WORKER_URL);
      expect((await readRegistration(page, ROOT_SHELL_URL))?.active).toBe(server.url(ROOT_WORKER_URL));
      expect((await readRegistration(page, CHILD_SHELL_URL))?.active).toBe(server.url(CHILD_WORKER_URL));
      expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(server.url(CHILD_WORKER_URL));
      server.goOffline();
      try {
        await page.goto(server.url(CHILD_UNKNOWN_ROUTE_URL));
        await expect(page.locator("#child-offline-marker")).toBeVisible();
        await expect(page.locator("#root-offline-marker")).toHaveCount(0);
      } finally {
        server.goOnline();
      }
    }
  } finally {
    await context.close();
    await Promise.all([a.close(), b.close()]);
  }
});
