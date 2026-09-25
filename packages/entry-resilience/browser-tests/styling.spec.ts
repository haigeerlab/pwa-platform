// ST2 (tasks/pwa-entry-resilience/plan.md's "修订：恢复页的默认样式与宿主定制"): real-browser coverage for the
// recovery page's default style, the `css` host-override option, and theme following. Kept in its own file rather
// than folded into scenarios.spec.ts, which is about entry availability, not appearance.
//
// Helpers below (`waitForActivatedWorker`, `installAndControl`, `entryCheck`, `entryUpdate`, `manifestPayload`) are
// deliberately duplicated from scenarios.spec.ts rather than imported from it, so each spec file stays runnable and
// readable on its own — the same choice that file made relative to the now-removed standalone feasibility spec.
import { expect, test, waitForController, type FixtureServer } from "@pwa-platform/browser-test-harness";
import type { Page } from "@playwright/test";
import type { EntryUpdateResult } from "../src/client/index.js";
import type { EntryRecoveryResult } from "../src/index.js";
import { IDENTITY, SHELL_URL, WORKER_URL, startSites, type Sites } from "./sites.js";

/** `pwa:theme:<appId>:<environment>` (src/internal/theme-key.ts), computed here rather than imported so the
 *  "invalid stored value" test below writes to it directly, bypassing `setPwaTheme`. */
const THEME_KEY = `pwa:theme:${encodeURIComponent(IDENTITY.appId)}:${encodeURIComponent(IDENTITY.environment)}`;

/** `#0b5cd5` / `#4c93ff` — the accent token's light/dark values, as `getComputedStyle` reports them. */
const LIGHT_ACCENT_RGB = "rgb(11, 92, 213)";
const DARK_ACCENT_RGB = "rgb(76, 147, 255)";

async function waitForActivatedWorker(page: Page, timeout = 10_000): Promise<void> {
  await page.evaluate(async (limit) => {
    const deadline = Date.now() + limit;
    for (;;) {
      if ((await navigator.serviceWorker.getRegistration())?.active?.state === "activated") return;
      if (Date.now() >= deadline) throw new Error(`No activated worker within ${limit} ms`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, timeout);
}

async function installAndControl(page: Page, primary: FixtureServer): Promise<void> {
  await page.goto(primary.url(SHELL_URL));
  await expect(page.locator("#shell")).toBeVisible();
  await waitForActivatedWorker(page);
  await page.reload();
  await waitForController(page, WORKER_URL);
}

function entryCheck(page: Page): Promise<EntryRecoveryResult> {
  return page.evaluate(async () => {
    const check = Reflect.get(window, "__entryCheck") as () => Promise<EntryRecoveryResult>;
    return check();
  });
}

function entryUpdate(page: Page, data: unknown): Promise<EntryUpdateResult> {
  return page.evaluate(async (payload) => {
    const update = Reflect.get(window, "__entryUpdate") as (d: unknown) => Promise<EntryUpdateResult>;
    return update(payload);
  }, data);
}

/** Calls the fixture app's `window.__setPwaTheme`, i.e. the real `setPwaTheme` (src/client/index.ts). Must run on
 *  a page that loaded the fixture app's own script (SHELL_URL) — the recovery page never exposes it. */
function setStoredTheme(page: Page, theme: "light" | "dark" | "system"): Promise<void> {
  return page.evaluate((value) => {
    const set = Reflect.get(window, "__setPwaTheme") as (t: string) => void;
    set(value);
  }, theme);
}

function manifestPayload(alternateOrigin: string, sequence: number): Record<string, unknown> {
  const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    sequence,
    expiresAt: iso(Date.now() + 86_400_000),
    status: "migrating",
    reason: { code: "planned-migration" },
    entries: [{ origin: alternateOrigin, startPath: SHELL_URL }],
  };
}

/** Installs, hands in a `migrating` manifest, and returns the recovery page's own-origin URL — the shared setup
 *  every test in this file needs before it can look at the recovery page's button. */
async function recoveryPageUrl(page: Page, sites: Sites): Promise<string> {
  await installAndControl(page, sites.primary);
  const update = await entryUpdate(page, manifestPayload(sites.alternate.origin, 2));
  expect(update.accepted).toBe(true);
  const result = await entryCheck(page);
  if (result.kind !== "available") throw new Error("expected an available entry");
  return sites.primary.url(result.recoveryPageUrl);
}

function buttonBackground(page: Page): Promise<string> {
  return page.locator("button").evaluate((element) => getComputedStyle(element).backgroundColor);
}

test.describe("default style", () => {
  let sites: Sites;

  test.beforeEach(async () => {
    sites = await startSites();
  });

  test.afterEach(async () => {
    await sites.closeAll();
  });

  test("the recovery page's button is styled (not the browser default) even while the origin is offline", async ({
    page,
    context,
  }) => {
    const url = await recoveryPageUrl(page, sites);
    await page.emulateMedia({ colorScheme: "light" });

    await context.setOffline(true);
    try {
      await page.goto(url);
      const button = page.locator("button");
      await expect(button).toBeVisible();
      // The accent token's light value, not a browser's UA-stylesheet button colour (typically a grey/transparent
      // default) — proof the style travelled with the document itself and needed no extra request.
      expect(await buttonBackground(page)).toBe(LIGHT_ACCENT_RGB);
    } finally {
      await context.setOffline(false);
    }
  });

  test("host css appended through the css option overrides --pwa-entry-accent", async ({ page }) => {
    const customSites = await startSites({ css: ".pwa-entry { --pwa-entry-accent: #c8102e; }" });
    try {
      const url = await recoveryPageUrl(page, customSites);
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(url);
      const button = page.locator("button");
      await expect(button).toBeVisible();
      expect(await buttonBackground(page)).toBe("rgb(200, 16, 46)"); // #c8102e
    } finally {
      await customSites.closeAll();
    }
  });

  test("in dark mode the page background covers the whole viewport, not just the content column", async ({ page }) => {
    // Until 2026-09-24 the root was a centred max-width column: in dark mode only that column was dark and the rest
    // of the viewport stayed white. Every corner, and a point below the content, must be the root with the dark
    // background token (#0f1419).
    const url = await recoveryPageUrl(page, sites);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(url);
    await expect(page.locator("button")).toBeVisible();

    const samples = await page.evaluate(() => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const points: [number, number][] = [
        [1, 1],
        [width - 2, 1],
        [1, height - 2],
        [width - 2, height - 2],
        [Math.round(width / 2), height - 2],
      ];
      return points.map(([x, y]) => {
        const element = document.elementFromPoint(x, y);
        return { id: element?.id ?? null, background: element === null ? null : getComputedStyle(element).backgroundColor };
      });
    });
    for (const sample of samples) expect(sample).toEqual({ id: "pwa-entry", background: "rgb(15, 20, 25)" });
  });

  // The recipe docs/guides/entry-recovery-integration.md tells hosts to copy, verbatim, on both dark paths. It has
  // to name the platform's own dark selectors: the spec first documented a plain `.pwa-entry` inside the media
  // query, which loses on specificity to `.pwa-entry:not([data-theme="light"])` (0,1,0 against 0,2,0), so the
  // override silently did nothing in dark mode while reading perfectly sensibly in review. Light mode worked
  // either way, which is exactly why the test above did not catch it.
  test("the documented dark override wins on both dark paths, not just in light mode", async ({ page }) => {
    const customSites = await startSites({
      css: [
        ".pwa-entry { --pwa-entry-accent: #c8102e; }",
        "@media (prefers-color-scheme: dark) {",
        '  .pwa-entry:not([data-theme="light"]) { --pwa-entry-accent: #ff6b81; }',
        "}",
        '.pwa-entry[data-theme="dark"] { --pwa-entry-accent: #ff6b81; }',
      ].join("\n"),
    });
    try {
      const url = await recoveryPageUrl(page, customSites);
      const hostDark = "rgb(255, 107, 129)"; // #ff6b81 — the platform's own dark accent is #4c93ff

      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(url);
      await expect(page.locator("button")).toBeVisible();
      expect(await buttonBackground(page)).toBe(hostDark);

      // The other dark path: the system is light and the application asked for dark.
      await page.goto(customSites.primary.url(SHELL_URL));
      await setStoredTheme(page, "dark");
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(url);
      await expect(page.locator("button")).toBeVisible();
      expect(await buttonBackground(page)).toBe(hostDark);
    } finally {
      await customSites.closeAll();
    }
  });
});

test.describe("theme following", () => {
  let sites: Sites;

  test.beforeEach(async () => {
    sites = await startSites();
  });

  test.afterEach(async () => {
    await sites.closeAll();
  });

  test("setPwaTheme(dark) overrides a light system preference, and setPwaTheme(system) restores it", async ({
    page,
  }) => {
    const url = await recoveryPageUrl(page, sites);

    await page.emulateMedia({ colorScheme: "light" });
    await setStoredTheme(page, "dark");
    await page.goto(url);
    await expect(page.locator("button")).toBeVisible();
    expect(await buttonBackground(page)).toBe(DARK_ACCENT_RGB);

    // Back to the shell to call setPwaTheme (only it exposes __setPwaTheme), then re-check the recovery page: with
    // the override removed and the system still emulated light, it must follow the system again, not stay dark.
    await page.goto(sites.primary.url(SHELL_URL));
    await setStoredTheme(page, "system");
    await page.goto(url);
    await expect(page.locator("button")).toBeVisible();
    expect(await buttonBackground(page)).toBe(LIGHT_ACCENT_RGB);
  });

  test("setPwaTheme(light) overrides a dark system preference", async ({ page }) => {
    const url = await recoveryPageUrl(page, sites);

    await page.emulateMedia({ colorScheme: "dark" });
    await setStoredTheme(page, "light");
    await page.goto(url);
    await expect(page.locator("button")).toBeVisible();
    expect(await buttonBackground(page)).toBe(LIGHT_ACCENT_RGB);
  });

  test("an invalid stored value or an unavailable localStorage both fall back to the system preference", async ({
    page,
  }) => {
    const url = await recoveryPageUrl(page, sites);
    await page.emulateMedia({ colorScheme: "dark" });

    // Invalid value: written directly (never through setPwaTheme, which only ever writes "light"/"dark"), to prove
    // the page's own read side — not the writer — is what tolerates it.
    await page.goto(sites.primary.url(SHELL_URL));
    await page.evaluate((key) => {
      localStorage.setItem(key, "purple");
    }, THEME_KEY);
    await page.goto(url);
    await expect(page.locator("button")).toBeVisible();
    expect(await buttonBackground(page)).toBe(DARK_ACCENT_RGB);

    // Unavailable storage: stub getItem to throw before the page's own script runs, proving the read never throws
    // and still renders (rather than being stuck on "loading" or failing to navigate at all).
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("storage disabled");
        },
      });
    });
    await page.goto(url);
    await expect(page.locator("button")).toBeVisible();
    expect(await buttonBackground(page)).toBe(DARK_ACCENT_RGB);
  });
});
