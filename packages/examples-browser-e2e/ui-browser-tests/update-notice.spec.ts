// The default update notice in a real browser (matrix rows 5b, 5c, 5d), served by a Vite dev server.
//
// Real Safari and Firefox (ADR-0047) run the same scenarios with these differences, each marked where it applies: the
// currency-check fetch is answered by a middleware of the dev server itself (`shellFetchAnswer`) instead of
// `page.route`, which a WebDriver session has no equivalent of; the notice is read and clicked through in-page
// lookups by role and accessible name (`inspectButton`) and assertions poll, because a WebDriver session has no
// `getByRole` and no web-first matchers; the fake clock and the `load` event are replaced by a shortened timer and a
// marker on the document; screenshots (artifacts, not assertions) are not taken; and what a WebDriver session cannot
// make is recorded with `recordUnverifiable`.
import { contrastRatio, expect, readRealBrowserKind, recordUnverifiable, test } from "@pwa-platform/browser-test-harness";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const REAL_BROWSER = readRealBrowserKind(process.env) !== undefined;

let server: ViteDevServer;
let origin: string;

/**
 * The notice asks the server for the current document again (a `fetch`, not a navigation) and compares its entry
 * module script with this document's (ADR-0046). Unanswered, the dev server answers with the very page under test, so
 * the page reads as already current. Every scenario below that is about an *old* page has the dev server answer that
 * request with a shell built from a different entry script — the situation a new deployment creates — and a scenario
 * about a failed check has it cut the connection. `shellFetches` lists every such request, for the marker-query check.
 */
type ShellFetchAnswer = "stale" | "failure" | "current";

const STALE_SHELL =
  '<!doctype html><html><head><script type="module" src="/assets/index-new.js"></script></head><body></body></html>';

let shellFetchAnswer: ShellFetchAnswer = "stale";
let shellFetches: URL[] = [];

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../apps/update-notice/", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "error",
    plugins: [
      {
        name: "update-notice-shell-fetch",
        configureServer(devServer) {
          devServer.middlewares.use((request, response, next) => {
            // `Sec-Fetch-Dest: empty` is what a `fetch` sends; a navigation to the same URL sends `document`.
            const url = new URL(request.url ?? "/", "http://placeholder");
            if (url.pathname !== "/" || request.headers["sec-fetch-dest"] !== "empty") return next();
            shellFetches.push(url);
            if (shellFetchAnswer === "current") return next();
            if (shellFetchAnswer === "failure") {
              request.socket.destroy();
              return;
            }
            response.writeHead(200, { "content-type": "text/html" }).end(STALE_SHELL);
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || typeof address === "string" || address === undefined) throw new Error("Vite did not listen");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server?.close();
});

// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
  shellFetches = [];
  shellFetchAnswer = testInfo.title.includes("[current]") ? "current" : "stale";
});

const NOTICE = '[role="status"]';

type ButtonProbe = {
  readonly count: number;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly focused: boolean;
  readonly css: Record<string, string>;
};

/**
 * Looks up buttons the way `getByRole("button", { name, exact })` does (accessible name from `aria-label` or the text;
 * case-insensitive substring unless `exact`), optionally clicks the first, and reports what a spec asserts on. Written
 * as one function because a page script cannot call another helper.
 */
function inspectButton(
  page: Page,
  name: string,
  options: { readonly exact?: boolean; readonly click?: boolean; readonly css?: readonly string[] } = {},
): Promise<ButtonProbe> {
  return page.evaluate(
    (query) => {
      const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();
      const matches = [...document.querySelectorAll("button")].filter((button) => {
        const label = normalize(button.getAttribute("aria-label") ?? button.textContent ?? "");
        return query.exact ? label === query.name : label.toLowerCase().includes(query.name.toLowerCase());
      });
      const first = matches[0];
      if (first === undefined) return { count: 0, visible: false, disabled: false, focused: false, css: {} };
      const box = first.getBoundingClientRect();
      const style = getComputedStyle(first);
      const probe = {
        count: matches.length,
        visible: style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0,
        disabled: first.disabled,
        focused: false,
        css: Object.fromEntries(query.css.map((property) => [property, style.getPropertyValue(property)])),
      };
      if (query.click) first.click();
      return { ...probe, focused: document.activeElement === first };
    },
    { name, exact: options.exact === true, click: options.click === true, css: options.css ?? [] },
  );
}

/**
 * `getByRole("button", ...).click()`. Chrome clicks with real pointer input; a real browser gets the DOM `click()`, the
 * activation a pointer click ends in, once the button is visible and enabled (as Playwright's click waits for).
 */
async function clickButton(page: Page, name: string, options: { readonly exact?: boolean } = {}): Promise<void> {
  if (!REAL_BROWSER) {
    await page.getByRole("button", { name, ...options }).click();
    return;
  }
  await expect
    .poll(async () => {
      const probe = await inspectButton(page, name, options);
      return probe.visible && !probe.disabled;
    })
    .toBe(true);
  await inspectButton(page, name, { ...options, click: true });
}

async function expectButtonVisible(page: Page, name: string, options: { readonly exact?: boolean } = {}): Promise<void> {
  await expect.poll(async () => (await inspectButton(page, name, options)).visible).toBe(true);
}

async function expectButtonCount(page: Page, name: string, count: number, options: { readonly exact?: boolean } = {}): Promise<void> {
  await expect.poll(async () => (await inspectButton(page, name, options)).count).toBe(count);
}

async function noticeText(page: Page): Promise<string> {
  return (await page.locator(NOTICE).textContent()) ?? "";
}

async function expectNoticeContains(page: Page, text: string): Promise<void> {
  await expect.poll(() => noticeText(page)).toContain(text);
}

async function expectNoNotice(page: Page): Promise<void> {
  await expect.poll(() => page.locator(NOTICE).count()).toBe(0);
}

async function expectNoticeVisible(page: Page): Promise<void> {
  await expect.poll(() => page.locator(NOTICE).isVisible()).toBe(true);
}

/** Computed style property of the first element matching `selector`; `toHaveCSS` reads the same value. */
function cssOf(page: Page, selector: string, property: string): Promise<string> {
  return page.evaluate(
    (query) => getComputedStyle(document.querySelector(query.selector) as Element).getPropertyValue(query.property),
    { selector, property },
  );
}

async function expectCss(page: Page, selector: string, property: string, expected: string): Promise<void> {
  await expect.poll(() => cssOf(page, selector, property)).toBe(expected);
}

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;

/** `locator.boundingBox()` of the first match: null when it is absent or not rendered. */
function boundingBox(page: Page, selector: string): Promise<Box> {
  return page.evaluate((query) => {
    const element = document.querySelector(query);
    if (element === null) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    return width === 0 && height === 0 ? null : { x, y, width, height };
  }, selector);
}

/** Opens the fixture and waits until it exposes its controls. */
async function openFixture(page: Page, query: string): Promise<void> {
  await page.goto(`${origin}/?${query}`);
  await page.waitForFunction("typeof window.__fixture?.wait === 'function'");
}

/**
 * Presses Tab and waits until the button named `name` has focus. Safari's default keyboard navigation skips buttons on
 * a plain Tab (its "Press Tab to highlight each item" setting is off, observed on Safari 18.6), and Option+Tab is its
 * own way to reach every control, so that is what a Safari user without the setting presses; the difference is recorded.
 */
async function tabToButton(page: Page, name: string, options: { readonly exact?: boolean } = {}): Promise<void> {
  if (readRealBrowserKind(process.env) === "safari") {
    recordUnverifiable("keyboard focus by plain Tab: Safari's default navigation skips buttons, Option+Tab used");
    await page.keyboard.press("Alt+Tab");
  } else {
    await page.keyboard.press("Tab");
  }
  await expect.poll(async () => (await inspectButton(page, name, options)).focused).toBe(true);
}

for (const framework of ["vue", "react"] as const) {
  test(`${framework}: a brief waiting signal does not leave a false reload prompt`, async ({ page }) => {
    await openFixture(page, `framework=${framework}`);
    await page.evaluate("(async () => { window.__fixture.wait(); await new Promise(resolve => setTimeout(resolve, 20)); window.__fixture.applied(); })()");
    await page.waitForTimeout(150);
    await expectNoNotice(page);
  });

  test(`${framework}: waiting, later, retry, takeover and explicit reload`, async ({ page }) => {
    await openFixture(page, `framework=${framework}`);
    await page.evaluate("window.__fixture.wait()");
    await expectNoticeVisible(page);
    await expectNoticeContains(page, "有可用更新");
    await clickButton(page, "稍后");
    await expectNoNotice(page);
    await page.evaluate("window.__fixture.applied()");
    await expectNoticeContains(page, "更新已完成");
    await expect.poll(() => page.locator("h1").isVisible()).toBe(true);
    expect(await page.locator("h1").textContent()).toBe("业务页面");
    expect(await page.evaluate("window.__fixture.reloadCalls()")).toBe(0);
    await clickButton(page, "刷新页面");
    expect(await page.evaluate("window.__fixture.reloadCalls()")).toBe(1);
  });

  test(`${framework}: failure and in-flight state allow retry without duplicate apply`, async ({ page }) => {
    await openFixture(page, `framework=${framework}`);
    await page.evaluate("window.__fixture.wait()");
    await page.evaluate("window.__fixture.failNext()");
    await clickButton(page, "更新", { exact: true });
    await expectNoticeContains(page, "更新未完成");
    await page.evaluate("window.__fixture.hold()");
    await clickButton(page, "重试");
    await expect.poll(async () => (await inspectButton(page, "正在更新")).disabled).toBe(true);
    expect(await page.evaluate("window.__fixture.applyCalls()")).toBe(2);
    await page.evaluate("window.__fixture.release()");
    await expectButtonVisible(page, "刷新页面");
  });

  test(`${framework}: position, theme override and narrow viewport stay usable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 650 });
    // A browser with a minimum window width (Firefox: 500px) ends wider; the fit checks below then hold for the width
    // it really had, and the 320px claim itself is recorded as unverifiable rather than passed.
    const viewport = page.viewportSize() ?? { width: 320, height: 650 };
    if (viewport.width !== 320) {
      recordUnverifiable(`320px narrow layout: this browser's smallest viewport is ${viewport.width}px wide`);
    }
    await openFixture(page, `framework=${framework}&position=top-center&custom`);
    await page.evaluate("document.documentElement.style.setProperty('--pwa-update-accent', '#006e52')");
    await page.evaluate("window.__fixture.wait()");
    await expect.poll(() => page.locator(NOTICE).getAttribute("data-position")).toBe("top-center");
    await expectNoticeContains(page, "业务自定义更新");
    const box = await boundingBox(page, NOTICE);
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.width).toBeGreaterThan(270);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y).toBeLessThan(120);
    await expect
      .poll(async () => (await inspectButton(page, "更新", { exact: true, css: ["background-color"] })).css["background-color"])
      .toBe("rgb(0, 110, 82)");
    await tabToButton(page, "更新", { exact: true });
    // A screenshot is an artifact, not an assertion; a WebDriver session is not asked for one.
    if (!REAL_BROWSER && framework === "vue") await page.screenshot({ path: testInfo.outputPath("pwa-update-notice-mobile.png") });
  });

  test(`${framework}: colors prop overrides inherited colors for this notice`, async ({ page }, testInfo) => {
    await openFixture(page, `framework=${framework}&colors`);
    await page.evaluate("document.documentElement.style.setProperty('--pwa-update-accent', '#ff0000')");
    await page.evaluate("window.__fixture.wait()");
    await expectNoticeVisible(page);
    await expectCss(page, NOTICE, "background-color", "rgb(255, 248, 231)");
    await expectCss(page, NOTICE, "color", "rgb(27, 33, 48)");
    await expectCss(page, NOTICE, "border-color", "rgb(185, 167, 123)");
    await expectCss(page, `${NOTICE} .pwa-update-notice__body`, "color", "rgb(48, 63, 69)");
    await expect
      .poll(async () => (await inspectButton(page, "更新", { exact: true, css: ["background-color", "color"] })).css)
      .toEqual({ "background-color": "rgb(0, 110, 82)", color: "rgb(255, 255, 255)" });
    await expectCss(page, "html", "--pwa-update-accent", "#ff0000");
    if (!REAL_BROWSER && framework === "vue") await page.screenshot({ path: testInfo.outputPath("pwa-update-notice-colors.png") });
  });

  test(`${framework}: later reminds again and refresh is an explicit browser action`, async ({ page }) => {
    if (!REAL_BROWSER) await page.clock.install();
    await openFixture(page, `framework=${framework}&defaultReload`);
    await page.evaluate("window.__fixture.wait()");
    if (REAL_BROWSER) {
      // A WebDriver session cannot control the page's clock, so the 30-minute reminder timer is shortened to 2.5 s by
      // wrapping `setTimeout` in the page: the reminder mechanism runs for real, its interval value is not verified.
      recordUnverifiable("30-minute reminder interval: no clock control on a WebDriver session, timer shortened to 2.5 s");
      await page.evaluate(() => {
        const native = window.setTimeout.bind(window);
        window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
          native(handler, delay === 30 * 60_000 ? 2_500 : delay, ...args)) as typeof window.setTimeout;
      });
    }
    await clickButton(page, "稍后");
    await expectNoNotice(page);
    if (!REAL_BROWSER) await page.clock.fastForward(30 * 60_000);
    await expectButtonVisible(page, "更新", { exact: true });
    await clickButton(page, "更新", { exact: true });
    await expectButtonVisible(page, "刷新页面");
    await page.evaluate("sessionStorage.setItem('before-reload', 'present')");
    if (REAL_BROWSER) {
      // WebDriver has no `load` event: a value on this document's window is gone once a new document replaces it.
      await page.evaluate("window.__beforeReload = true");
      await clickButton(page, "刷新页面");
      await expect
        .poll(
          async () => {
            try {
              return await page.evaluate("window.__beforeReload === true");
            } catch {
              // The document is being replaced; scripts may be refused for a moment. Still the old one as far as we know.
              return true;
            }
          },
          { timeout: 10_000, intervals: [100] },
        )
        .toBe(false);
    } else {
      await Promise.all([page.waitForEvent("load"), clickButton(page, "刷新页面")]);
    }
    expect(await page.evaluate("sessionStorage.getItem('before-reload')")).toBe("present");
    await expectNoNotice(page);
  });
}

for (const framework of ["vue", "react"] as const) {
  test(`${framework}: [current] a page already on the new code offers to finish for offline use, with no reload step`, async ({ page }) => {
    await openFixture(page, `framework=${framework}`);
    await page.evaluate("window.__fixture.wait()");
    await expectNoticeContains(page, "新版已可离线使用");
    expect(await noticeText(page)).not.toContain("有可用更新");
    await clickButton(page, "更新", { exact: true });
    // The takeover still needs the user's confirmation, but there is nothing left to reload for.
    await expectNoNotice(page);
    await expectButtonCount(page, "刷新页面", 0);
    expect(await page.evaluate("window.__fixture.applyCalls()")).toBe(1);
    expect(await page.evaluate("window.__fixture.reloadCalls()")).toBe(0);
  });

  test(`${framework}: [current] a takeover confirmed in another tab leaves no reload prompt on a current page`, async ({ page }) => {
    await openFixture(page, `framework=${framework}&locale=en`);
    await page.evaluate("window.__fixture.wait()");
    await expectNoticeContains(page, "An update is ready for offline use");
    await page.evaluate("window.__fixture.applied()");
    await expectNoNotice(page);
    await expectButtonCount(page, "Reload page", 0);
  });

  test(`${framework}: the currency check carries its marker query so a precached document URL cannot answer it`, async ({ page }) => {
    await openFixture(page, `framework=${framework}&locale=en`);
    await page.evaluate("window.__fixture.wait()");
    await expectNoticeContains(page, "A new version is available");
    // What the dev server saw as a `fetch` of the shell, the same list `page.route` used to collect.
    expect(shellFetches).toHaveLength(1);
    // Kept alongside the page's own query, which the check must not drop.
    expect(shellFetches[0]!.searchParams.get("__pwa-page-currency")).toBe("1");
    expect(shellFetches[0]!.searchParams.get("framework")).toBe(framework);
  });

  test(`${framework}: a failed currency check falls back to the ordinary prompt`, async ({ page }) => {
    shellFetchAnswer = "failure";
    await openFixture(page, `framework=${framework}`);
    await page.evaluate("window.__fixture.wait()");
    await expectNoticeContains(page, "有可用更新");
    await clickButton(page, "更新", { exact: true });
    await expectButtonVisible(page, "刷新页面");
  });
}

for (const framework of ["vue", "react"] as const) {
  test(`${framework}: locale "en" renders the built-in English copy`, async ({ page }) => {
    await openFixture(page, `framework=${framework}&locale=en`);
    await page.evaluate("window.__fixture.wait()");
    await expectNoticeContains(page, "A new version is available");
    await clickButton(page, "Update", { exact: true });
    await expectNoticeContains(page, "Update complete");
    await clickButton(page, "Reload page");
    expect(await page.evaluate("window.__fixture.reloadCalls()")).toBe(1);
  });
}

for (const framework of ["vue", "react"] as const) {
  test(`${framework}: messages override single keys on top of the English built-in copy`, async ({ page }) => {
    await openFixture(page, `framework=${framework}&locale=en&custom`);
    await page.evaluate("window.__fixture.wait()");
    // The overridden key wins; every other key still comes from the selected locale, not from the Chinese default.
    await expectNoticeContains(page, "业务自定义更新");
    await expectNoticeContains(page, "The new offline resources are ready.");
    await expectButtonVisible(page, "Update", { exact: true });
    await expectButtonVisible(page, "Later", { exact: true });
  });
}

for (const framework of ["vue", "react"] as const) {
  test(`${framework}: desktop light and dark modes keep readable contrast inside the viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
    if (viewport.width !== 1280 || viewport.height !== 800) {
      recordUnverifiable(`1280x800 desktop viewport: this window reached ${viewport.width}x${viewport.height}`);
    }
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await openFixture(page, `framework=${framework}`);
      await page.evaluate("window.__fixture.wait()");
      await expectNoticeVisible(page);
      await expectCss(page, NOTICE, "background-color", colorScheme === "dark" ? "rgb(22, 27, 34)" : "rgb(255, 255, 255)");
      const colors = await page.evaluate(() => {
        const element = document.querySelector('[role="status"]') as HTMLElement;
        const body = element.querySelector(".pwa-update-notice__body") as HTMLElement;
        const primary = element.querySelector(".pwa-update-notice__button--primary") as HTMLElement;
        return {
          surface: getComputedStyle(element).backgroundColor,
          text: getComputedStyle(element).color,
          mutedText: getComputedStyle(body).color,
          primaryBackground: getComputedStyle(primary).backgroundColor,
          primaryText: getComputedStyle(primary).color,
        };
      });
      expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.mutedText, colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.primaryText, colors.primaryBackground)).toBeGreaterThanOrEqual(4.5);
      const box = await boundingBox(page, NOTICE);
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      if (!REAL_BROWSER && framework === "vue" && colorScheme === "dark") {
        await page.screenshot({ path: testInfo.outputPath("pwa-update-notice-dark.png") });
      }
    }
  });
}
