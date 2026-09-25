// Scenarios 2-4 (tasks/ssr-adapters/plan.md, T7).
import { expect, test } from "@pwa-platform/browser-test-harness";
import { serverEntry } from "./global-setup.js";
import { installAndControl } from "./page.js";
import { startNuxtServer, type NuxtServer } from "./servers.js";
import { ABOUT_SLASH_URL, ABOUT_URL, ACCOUNT_URL, NEWS_URL, SHELL_URL } from "./urls.js";

test.describe("offline navigation", () => {
  let server: NuxtServer;

  test.beforeEach(async () => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("manual", "v1"));
  });

  test.afterEach(async () => {
    await server.close();
  });

  // Scenario 2.
  test("prerendered pages show their own content offline, with and without a trailing slash, and the server receives no request", async ({
    page,
    context,
  }) => {
    await installAndControl(page, server);
    await context.setOffline(true);
    try {
      server.clearRequests();

      await page.goto(server.url(SHELL_URL));
      await expect(page.locator("h1")).toHaveText("home");

      // ADR-0012 (T4b): a navigation without a trailing slash also tries the same route's index.html.
      await page.goto(server.url(ABOUT_URL));
      await expect(page.locator("h1")).toHaveText("about");

      await page.goto(server.url(ABOUT_SLASH_URL));
      await expect(page.locator("h1")).toHaveText("about");

      expect(server.requests()).toEqual([]);
    } finally {
      await context.setOffline(false);
    }
  });

  // Scenario 3.
  test("a request-time public page shows the offline fallback offline, without rewriting the address", async ({ page, context }) => {
    await installAndControl(page, server);
    await context.setOffline(true);
    try {
      await page.goto(server.url(NEWS_URL));
      await expect(page.locator("#offline")).toHaveText("You are offline");
      // The offline page's route rule strips its script (design section 3), so it never hydrates and never
      // rewrites the address bar to its own route (T1 deviation C).
      expect(page.url()).toBe(server.url(NEWS_URL));
    } finally {
      await context.setOffline(false);
    }
  });

  // Scenario 4.
  test("the private page shows the offline fallback offline, not a browser error, without rewriting the address", async ({
    page,
    context,
  }) => {
    await installAndControl(page, server);
    await context.setOffline(true);
    try {
      await page.goto(server.url(ACCOUNT_URL));
      await expect(page.locator("#offline")).toHaveText("You are offline");
      expect(page.url()).toBe(server.url(ACCOUNT_URL));
    } finally {
      await context.setOffline(false);
    }
  });
});
