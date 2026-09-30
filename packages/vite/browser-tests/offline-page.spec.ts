// The default offline page in a real browser (spec/vite-adapter.md "修订：平台默认离线页", task OP4): a navigation
// the worker never precached, made with the network gone, lands on the page the plugin generated — in the built
// locale, themed, and reloading itself once the connection returns.
//
// Real Safari and Firefox (ADR-0047) run the same specs with these differences, each marked where it applies: the
// network is cut at the fixture server (`fixtureServer.goOffline`), assertions poll instead of using web-first locator
// matchers, page loads are detected by a marker on the document's window instead of a `load` event, and checks a
// WebDriver session cannot make are recorded with `recordUnverifiable` or skipped with the reason.
import type { BrowserContext, Page } from "@playwright/test";
import { contrastRatio, expect, readRealBrowserKind, recordUnverifiable, test, type FixtureServer } from "@pwa-platform/browser-test-harness";
import { renderOfflinePage } from "../src/offline-page.js";
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
const REAL_BROWSER = readRealBrowserKind(process.env) !== undefined;

/** Puts a value on this document's window: a reload builds a new window, so its absence proves the reload happened. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => Reflect.set(window, "__beforeReconnect", true));
}

/**
 * Safari's automation window is never frontmost, so its pages report `visibilityState` "hidden" and the offline page
 * rightly skips its connectivity probe (it only probes a page someone is looking at). These specs mean a page the user
 * is looking at, so on a real browser that reports "hidden" the same override a tab switch would produce says so.
 */
async function lookAtPage(page: Page): Promise<void> {
  if (!REAL_BROWSER || (await page.evaluate(() => document.visibilityState)) !== "hidden") return;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** Waits until the document `markDocument` marked has been replaced by a new one (WebDriver has no `load` event). */
async function expectDocumentReplaced(page: Page, timeout: number): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return await page.evaluate(() => Reflect.get(window, "__beforeReconnect") === true);
        } catch {
          // The document is being replaced; scripts may be refused for a moment. Still the old one as far as we know.
          return true;
        }
      },
      { timeout, intervals: [100] },
    )
    .toBe(false);
}

/** Cuts the network. Chrome goes through the browser (real `offline` state); real browsers cannot, so the server does. */
async function cutNetwork(context: BrowserContext, fixtureServer: FixtureServer): Promise<void> {
  if (REAL_BROWSER) fixtureServer.goOffline();
  else await context.setOffline(true);
}

/**
 * Restores the network. Chrome's `setOffline(false)` also raises the browser's own `online` event when `event` is set.
 * A WebDriver session cannot toggle connectivity, so on a real browser the server comes back silently: no browser
 * `online` event fires at all. Where a test is about the page's `online` listener (`event: true`), a synthetic event is
 * dispatched together with the server switch. That exercises the page's listener, not the browser's event.
 */
async function restoreNetwork(page: Page, context: BrowserContext, fixtureServer: FixtureServer, event: boolean): Promise<void> {
  if (!REAL_BROWSER) {
    await context.setOffline(false);
    return;
  }
  fixtureServer.goOnline();
  if (event) await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

function collectCspViolations(): void {
  const violations: string[] = [];
  Reflect.set(window, "__cspViolations", violations);
  document.addEventListener("securitypolicyviolation", (event) => {
    violations.push(`${event.effectiveDirective}:${event.blockedURI}`);
  });
}

function readCspViolations(): string[] {
  return Reflect.get(window, "__cspViolations") as string[];
}

test.describe("default offline page, built-in zh-CN copy", () => {
  test.use({ fixtureSite: OFFLINE_PAGE_SITE_ZH });

  test("an offline navigation it never precached shows the generated page", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();
    await page.goto(fixtureServer.url(NEVER_VISITED));

    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe("当前处于离线状态");
    await expect.poll(() => page.locator(".pwa-offline__body").textContent()).toBe("网络恢复后页面会自动重新加载。");
    await expect.poll(() => page.locator(".pwa-offline__retry").textContent()).toBe("重试");
    await expect.poll(() => page.locator(".pwa-offline__app").textContent()).toBe("Vite Fixture");
    expect(await page.locator("html").getAttribute("lang")).toBe("zh-CN");
    expect(await page.title()).toBe("离线");
  });

  test("the generated page itself is precached", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();
    const result = await fetchFromPage(page, fixtureServer.url(DEFAULT_OFFLINE_URL), "pwa-offline__heading");
    expect(result).toEqual({ status: 200, hasMarker: true });
  });

  test("a strict CSP accepts the generated page's published style and script hashes", async ({ page, fixtureServer }) => {
    const rendered = await renderOfflinePage({ locale: "zh-CN", appName: "Vite Fixture" });
    const policy = [
      "default-src 'none'",
      `style-src '${rendered.hashes.defaultStyle}'`,
      `script-src '${rendered.hashes.script}'`,
      "connect-src 'self'",
    ].join("; ");
    fixtureServer.setHeaderRules([
      {
        pathPrefix: DEFAULT_OFFLINE_URL,
        headers: {
          "content-security-policy": policy,
        },
      },
    ]);
    if (REAL_BROWSER) {
      // WebDriver cannot run a script before the page's own, so a violation listener cannot be in place while the
      // offline page loads. The style and script hashes are still exercised: the page must render and its retry
      // button (the published script) must work under the policy.
      recordUnverifiable("CSP violation events: no script can run before the page's own on a WebDriver session");
    } else {
      await page.addInitScript(collectCspViolations);
    }

    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();
    try {
      const response = await page.goto(fixtureServer.url(NEVER_VISITED));
      if (REAL_BROWSER) {
        // A WebDriver navigation exposes no response headers: read them from the same precached response by fetching it.
        recordUnverifiable("CSP header on the navigation response: read from a fetch of the same precached page instead");
        const header = await page.evaluate(
          async (url: string) => (await fetch(url)).headers.get("content-security-policy"),
          fixtureServer.url(DEFAULT_OFFLINE_URL),
        );
        expect(header).toBe(policy);
      } else {
        expect((await response?.allHeaders())?.["content-security-policy"]).toBe(policy);
      }
      await expect.poll(() => page.locator(".pwa-offline__heading").isVisible()).toBe(true);
      // The default style is applied under the strict policy: white on a light system, #0f1419 on a dark one (real Safari
      // follows the macOS appearance and cannot emulate it, ADR-0047).
      const dark = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
      expect(
        await page.evaluate(() => getComputedStyle(document.querySelector(".pwa-offline") as Element).backgroundColor),
      ).toBe(dark ? "rgb(15, 20, 25)" : "rgb(255, 255, 255)");
      if (!REAL_BROWSER) expect(await page.evaluate(readCspViolations)).toEqual([]);

      await markDocument(page);
      await page.locator(".pwa-offline__retry").click();
      await expectDocumentReplaced(page, 10_000);
      await expect.poll(() => page.locator(".pwa-offline__heading").isVisible()).toBe(true);
      if (!REAL_BROWSER) expect(await page.evaluate(readCspViolations)).toEqual([]);
    } finally {
      fixtureServer.goOnline();
    }
  });

  test("in dark mode the background covers the whole viewport", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect.poll(() => page.locator(".pwa-offline__heading").isVisible()).toBe(true);

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

  test("content taller than the viewport starts at the top and stays reachable", async ({ page, fixtureServer }) => {
    // A short landscape viewport, as with heavy zoom: centred flex content would overflow upwards out of reach.
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();
    await page.setViewportSize({ width: 480, height: 160 });
    const achieved = page.viewportSize();
    // A real browser has a minimum window size (Firefox: 500px wide, which is harmless here since the property is
    // about the height). Where it cannot be that short, the property is not shown at all.
    test.skip(
      REAL_BROWSER && achieved?.height !== 160,
      `the browser window cannot be made 160px tall: the smallest achievable viewport is ${achieved?.width}x${achieved?.height}`,
    );
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect.poll(() => page.locator(".pwa-offline__heading").count()).toBeGreaterThan(0);

    const layout = await page.evaluate(() => {
      const root = document.querySelector(".pwa-offline") as HTMLElement;
      const app = document.querySelector(".pwa-offline__app") as HTMLElement;
      return { overflows: root.scrollHeight > root.clientHeight, appTop: app.getBoundingClientRect().top };
    });
    expect(layout.overflows).toBe(true);
    // At scroll position 0 the first line sits inside the viewport, not above it.
    expect(layout.appTop).toBeGreaterThanOrEqual(0);
  });

  // One test per scheme (the same checks as one loop over both): a real Safari cannot emulate the scheme, so the one
  // that differs from the system appearance skips on its own and the other still runs.
  for (const colorScheme of ["light", "dark"] as const) {
    test(`the ${colorScheme} theme keeps readable contrast, keyboard focus and a narrow layout`, async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
      fixtureServer.goOffline();
      await page.setViewportSize({ width: 320, height: 650 });
      const achieved = page.viewportSize();
      if (REAL_BROWSER && achieved?.width !== 320) {
        // Honest limit: the checks below run at the width the browser allows, which is not 320px.
        recordUnverifiable(`320px layout: the browser window cannot be that narrow, checked at ${achieved?.width}px instead`);
      }

      await page.emulateMedia({ colorScheme });
      await page.goto(fixtureServer.url(`${NEVER_VISITED}-${colorScheme}`));
      const colors = await page.evaluate(() => {
        const root = document.querySelector(".pwa-offline") as HTMLElement;
        const body = document.querySelector(".pwa-offline__body") as HTMLElement;
        const button = document.querySelector(".pwa-offline__retry") as HTMLElement;
        return {
          rootBackground: getComputedStyle(root).backgroundColor,
          rootText: getComputedStyle(root).color,
          bodyText: getComputedStyle(body).color,
          buttonBackground: getComputedStyle(button).backgroundColor,
          buttonText: getComputedStyle(button).color,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });

      expect(contrastRatio(colors.rootText, colors.rootBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.bodyText, colors.rootBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.buttonText, colors.buttonBackground)).toBeGreaterThanOrEqual(4.5);
      expect(colors.documentWidth).toBeLessThanOrEqual(colors.viewportWidth);
      // Safari's default keyboard navigation skips buttons (only "Press Tab to highlight each item on a webpage" or
      // Option+Tab reaches them), so a plain Tab never lands on the retry button there: a genuine Safari behaviour,
      // observed with safaridriver. The check that the button is keyboard reachable uses Option+Tab in Safari.
      if (readRealBrowserKind(process.env) === "safari") {
        recordUnverifiable("plain Tab focusing the retry button: Safari's default Tab skips buttons; checked with Option+Tab");
        await page.keyboard.press("Alt+Tab");
      } else {
        await page.keyboard.press("Tab");
      }
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.classList.contains("pwa-offline__retry") ?? false))
        .toBe(true);
    });
  }

  test("the page reloads by itself when the connection returns", async ({ page, context, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await cutNetwork(context, fixtureServer);
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect.poll(() => page.locator(".pwa-offline__heading").isVisible()).toBe(true);
    await lookAtPage(page);
    await markDocument(page);

    // No click: the online event probes connectivity immediately instead of waiting for the interval.
    // (Real browsers: the event is synthetic, see `restoreNetwork`.)
    await restoreNetwork(page, context, fixtureServer, true);
    await expectDocumentReplaced(page, 25_000);

    // Online, the same address now reaches the network instead of the offline fallback.
    await expect.poll(() => page.locator(".pwa-offline__heading").count()).toBe(0);
  });

  test("a network probe recovers when the browser omits the online event", async ({ page, context, fixtureServer }) => {
    test.setTimeout(45_000);
    // A real browser under WebDriver never raises an `online` event here, so there is nothing to suppress and no
    // script could be injected before the page's own anyway.
    if (!REAL_BROWSER) {
      await page.addInitScript(() => {
        window.addEventListener("online", (event) => event.stopImmediatePropagation(), { capture: true });
      });
    }
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await cutNetwork(context, fixtureServer);
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect.poll(() => page.locator(".pwa-offline__heading").isVisible()).toBe(true);
    await lookAtPage(page);
    await markDocument(page);

    await restoreNetwork(page, context, fixtureServer, false);
    await expectDocumentReplaced(page, 25_000);

    await expect.poll(() => page.locator(".pwa-offline__heading").count()).toBe(0);
  });

  test("an early online event waits for real connectivity before reloading", async ({ page, context, fixtureServer }) => {
    test.setTimeout(45_000);
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    await cutNetwork(context, fixtureServer);
    await page.goto(fixtureServer.url(NEVER_VISITED));
    await expect.poll(() => page.locator(".pwa-offline__heading").isVisible()).toBe(true);
    await lookAtPage(page);
    await markDocument(page);

    // The premature (synthetic, in every browser) online event must not reload while the network is still gone: the
    // marked document is still the current one after the probe had time to run and fail.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(2_500);
    expect(await page.evaluate(() => Reflect.get(window, "__beforeReconnect") === true)).toBe(true);
    await expect.poll(() => page.locator(".pwa-offline__heading").isVisible()).toBe(true);

    // Real connectivity returns: no browser event on a real browser, so the probe alone must notice.
    await restoreNetwork(page, context, fixtureServer, false);
    await expectDocumentReplaced(page, 25_000);
    await expect.poll(() => page.locator(".pwa-offline__heading").count()).toBe(0);
  });
});

test.describe("default offline page, en with a messages override", () => {
  test.use({ fixtureSite: OFFLINE_PAGE_SITE_EN });

  test("shows the en copy with exactly the overridden key replaced", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);
    fixtureServer.goOffline();
    await page.goto(fixtureServer.url(NEVER_VISITED));

    await expect.poll(() => page.locator(".pwa-offline__heading").textContent()).toBe(EN_HEADING_OVERRIDE);
    await expect.poll(() => page.locator(".pwa-offline__body").textContent()).toBe("This page will reload when your connection is back.");
    await expect.poll(() => page.locator(".pwa-offline__retry").textContent()).toBe("Try again");
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    expect(await page.title()).toBe("Offline");
  });
});
