// The default offline page in a real browser (spec/vite-adapter.md "修订：平台默认离线页", task OP4): a navigation
// the worker never precached, made with the network gone, lands on the page the plugin generated — in the built
// locale, themed, and reloading itself once the connection returns.
import { expect, test } from "@pwa-platform/browser-test-harness";
import {
  DEFAULT_OFFLINE_URL,
  EN_HEADING_OVERRIDE,
  OFFLINE_PAGE_SITE_EN,
  OFFLINE_PAGE_SITE_ZH,
  SHELL_URL,
  WORKER_URL,
} from "./fixture-site.js";
import { fetchFromPage, installAndControl } from "./page-probe.js";

const NEVER_VISITED = "/app/never-visited";

test.describe("default offline page, built-in zh-CN copy", () => {
  test.use({ fixtureSite: OFFLINE_PAGE_SITE_ZH });

  test("an offline navigation it never precached shows the generated page", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await context.setOffline(true);
    await page.goto(fixtureServer.url(NEVER_VISITED));

    await expect(page.locator(".pwa-offline__heading")).toHaveText("当前处于离线状态");
    await expect(page.locator(".pwa-offline__body")).toHaveText("网络恢复后页面会自动重新加载。");
    await expect(page.locator(".pwa-offline__retry")).toHaveText("重试");
    await expect(page.locator(".pwa-offline__app")).toHaveText("Vite Fixture");
    expect(await page.locator("html").getAttribute("lang")).toBe("zh-CN");
    expect(await page.title()).toBe("离线");
  });

  test("the generated page itself is precached", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await context.setOffline(true);
    const result = await fetchFromPage(page, fixtureServer.url(DEFAULT_OFFLINE_URL), "pwa-offline__heading");
    expect(result).toEqual({ status: 200, hasMarker: true });
  });

  test("in dark mode the background covers the whole viewport", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await context.setOffline(true);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect(page.locator(".pwa-offline__heading")).toBeVisible();

    const samples = await page.evaluate(() => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const points: [number, number][] = [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2]];
      return points.map(([x, y]) => {
        const element = document.elementFromPoint(x, y);
        return {
          isRoot: element?.classList.contains("pwa-offline") ?? false,
          background: element === null ? null : getComputedStyle(element).backgroundColor,
        };
      });
    });
    for (const sample of samples) expect(sample).toEqual({ isRoot: true, background: "rgb(15, 20, 25)" });
  });

  test("content taller than the viewport starts at the top and stays reachable", async ({ page, context, fixtureServer }) => {
    // A short landscape viewport, as with heavy zoom: centred flex content would overflow upwards out of reach.
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await context.setOffline(true);
    await page.setViewportSize({ width: 480, height: 160 });
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect(page.locator(".pwa-offline__heading")).toBeAttached();

    const layout = await page.evaluate(() => {
      const root = document.querySelector(".pwa-offline") as HTMLElement;
      const app = document.querySelector(".pwa-offline__app") as HTMLElement;
      return { overflows: root.scrollHeight > root.clientHeight, appTop: app.getBoundingClientRect().top };
    });
    expect(layout.overflows).toBe(true);
    // At scroll position 0 the first line sits inside the viewport, not above it.
    expect(layout.appTop).toBeGreaterThanOrEqual(0);
  });

  test("the page reloads by itself when the connection returns", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await context.setOffline(true);
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect(page.locator(".pwa-offline__heading")).toBeVisible();
    // A value on this document's window: a reload builds a new window, so its absence proves the reload happened.
    await page.evaluate(() => Reflect.set(window, "__beforeReconnect", true));

    // No click: only the `online` event can trigger this reload.
    const reloaded = page.waitForEvent("load");
    await context.setOffline(false);
    await reloaded;

    expect(await page.evaluate(() => Reflect.get(window, "__beforeReconnect") === true)).toBe(false);
    // Online, the same address now reaches the network instead of the offline fallback.
    await expect(page.locator(".pwa-offline__heading")).toHaveCount(0);
  });
});

test.describe("default offline page, en with a messages override", () => {
  test.use({ fixtureSite: OFFLINE_PAGE_SITE_EN });

  test("shows the en copy with exactly the overridden key replaced", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await context.setOffline(true);
    await page.goto(fixtureServer.url(NEVER_VISITED));

    await expect(page.locator(".pwa-offline__heading")).toHaveText(EN_HEADING_OVERRIDE);
    await expect(page.locator(".pwa-offline__body")).toHaveText("This page will reload when your connection is back.");
    await expect(page.locator(".pwa-offline__retry")).toHaveText("Try again");
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    expect(await page.title()).toBe("Offline");
  });
});
