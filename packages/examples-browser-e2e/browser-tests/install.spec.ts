import { expect, test } from "@pwa-platform/browser-test-harness";
import { INSTALL, MANIFEST_URL, SHELL_URL } from "../apps/shared/identity.js";
import { test as installableTest } from "./installable-context.js";
import { installAndControl } from "./page.js";
import { EXAMPLES, fixtureSite } from "./sites.js";

/** How long to give the browser to decide on its own that the app is installable. */
const REAL_PROMPT_WAIT_MS = 8_000;
/** Where the init script counts `beforeinstallprompt` events the browser dispatched. */
const PROMPT_COUNT_KEY = "__pwaExampleBeforeInstallPromptCount";

for (const example of EXAMPLES) {
  test.describe(`${example} example · install`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    test("the plan carries install metadata and the manifest maps it field by field", async ({ page, fixtureServer }) => {
      // `PwaPlan.install` is not null exactly when the plugin writes a manifest: with install disabled the build
      // refuses to run at all (observed in T2). So a fetchable manifest at the identity's URL is the observable form
      // of "install is not null", and its fields are checked against the install metadata the build was given.
      const response = await page.request.get(fixtureServer.url(MANIFEST_URL));
      expect(response.status()).toBe(200);
      const manifest = (await response.json()) as Record<string, unknown>;

      expect(manifest).toMatchObject({
        id: SHELL_URL,
        scope: SHELL_URL,
        start_url: INSTALL.startUrl,
        display: INSTALL.display,
        name: INSTALL.name,
        short_name: INSTALL.shortName,
        theme_color: INSTALL.themeColor,
        background_color: INSTALL.backgroundColor,
      });
      expect(manifest["icons"]).toEqual(
        INSTALL.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
      );
      expect(manifest["description"]).toBe(INSTALL.description);
      expect(INSTALL.shortcuts).toBeDefined();
      expect(manifest["shortcuts"]).toEqual(
        INSTALL.shortcuts?.map(({ name, url, shortName, description, icons }) => ({
          name,
          url,
          ...(shortName === undefined ? {} : { short_name: shortName }),
          ...(description === undefined ? {} : { description }),
          ...(icons === undefined ? {} : { icons }),
        })),
      );
      expect(INSTALL.screenshots).toBeDefined();
      expect(manifest["screenshots"]).toEqual(
        INSTALL.screenshots?.map(({ src, sizes, type, formFactor, label }) => ({
          src,
          sizes,
          type,
          ...(formFactor === undefined ? {} : { form_factor: formFactor }),
          ...(label === undefined ? {} : { label }),
        })),
      );

      // The page actually links it — a manifest nobody references offers no installation.
      await page.goto(fixtureServer.url(SHELL_URL));
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", MANIFEST_URL);
    });

    test("every declared icon is a PNG at its manifest dimensions", async ({ page, fixtureServer }) => {
      for (const icon of INSTALL.icons) {
        const response = await page.request.get(fixtureServer.url(icon.src));
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("image/png");

        const size = /^(\d+)x(\d+)$/.exec(icon.sizes);
        expect(size).not.toBeNull();
        const bytes = await response.body();
        expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        expect(bytes.readUInt32BE(16)).toBe(Number(size?.[1]));
        expect(bytes.readUInt32BE(20)).toBe(Number(size?.[2]));
      }
    });

    test("every declared screenshot is a PNG at its manifest dimensions", async ({ page, fixtureServer }) => {
      expect(INSTALL.screenshots?.length).toBeGreaterThan(0);
      for (const screenshot of INSTALL.screenshots ?? []) {
        const response = await page.request.get(fixtureServer.url(screenshot.src));
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("image/png");

        const size = /^(\d+)x(\d+)$/.exec(screenshot.sizes);
        expect(size).not.toBeNull();
        const bytes = await response.body();
        expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        expect(bytes.readUInt32BE(16)).toBe(Number(size?.[1]));
        expect(bytes.readUInt32BE(20)).toBe(Number(size?.[2]));
      }
    });

    installableTest("the browser offers installation on its own (real beforeinstallprompt)", async ({ page, fixtureServer, browserName }, testInfo) => {
      // The only case that counts as install evidence. Chrome decides eligibility itself, including engagement
      // heuristics, so the event may never fire in an automated profile. When it does not on Chromium, that is a
      // failure: the CDP installability errors below are fetched and included in the failure message, so a run that
      // regresses (e.g. the persistent-context fix in ./installable-context.ts breaking) is never silently green.
      // A skip is kept only for a genuinely non-Chromium browser (feature-detected through Playwright's own
      // `browserName` fixture, never by parsing the page's `navigator.userAgent`), where `Page.getInstallabilityErrors`
      // does not exist to ask.
      //
      // The pass/fail is decided by the event itself, counted in the capture phase before any page code sees it —
      // not by the button. Deciding by the button would record a browser that did offer installation, followed by a
      // broken binding or interface, as "not obtained" instead of as a failure (T9 review).
      //
      // Runs through `installableTest` (./installable-context.ts), not the harness's default `test`: Chrome reports
      // `in-incognito` via CDP `Page.getInstallabilityErrors` for the default `browser.newContext()` context and
      // refuses `beforeinstallprompt` unconditionally there, independent of headless mode or engagement heuristics
      // (verified with the CDP call below). `installableTest` launches a real (non-incognito) persistent profile
      // instead, which is the only thing that clears the error.
      await page.addInitScript((key) => {
        Reflect.set(window, key, 0);
        window.addEventListener(
          "beforeinstallprompt",
          () => Reflect.set(window, key, (Reflect.get(window, key) as number) + 1),
          { capture: true },
        );
      }, PROMPT_COUNT_KEY);
      await installAndControl(page, fixtureServer);
      const fired = await page
        .waitForFunction((key) => (Reflect.get(window, key) as number) > 0, PROMPT_COUNT_KEY, {
          timeout: REAL_PROMPT_WAIT_MS,
        })
        .then(() => true)
        .catch(() => false);

      if (!fired) {
        if (browserName !== "chromium") {
          testInfo.annotations.push({
            type: "not-obtained",
            description: `beforeinstallprompt did not fire within ${REAL_PROMPT_WAIT_MS} ms in ${browserName}, which has no CDP installability diagnostics`,
          });
          test.skip(true, "未取得：非 Chromium 浏览器，无法通过 CDP 复核安装条件（按规格跳过）");
        }
        const session = await page.context().newCDPSession(page);
        const { installabilityErrors } = await session.send("Page.getInstallabilityErrors");
        await session.detach().catch(() => {});
        const details =
          installabilityErrors.length === 0
            ? "none reported"
            : installabilityErrors
                .map((error) => {
                  const args = error.errorArguments.map((argument) => `${argument.name}=${argument.value}`).join(", ");
                  return args === "" ? error.errorId : `${error.errorId} (${args})`;
                })
                .join("; ");
        throw new Error(
          `beforeinstallprompt did not fire within ${REAL_PROMPT_WAIT_MS} ms in ${testInfo.project.use.channel ?? "chrome"}; ` +
            `CDP Page.getInstallabilityErrors: ${details}`,
        );
      }
      // The browser did offer installation, so from here on a missing button is a failure, never a skip.
      await expect(page.locator("#install")).toBeVisible();
    });

    test("wiring only: a dispatched install event reaches the interface through the binding", async ({ page, fixtureServer }) => {
      // NOT install evidence. The events below are dispatched by the test, not by the browser, so this proves only the
      // chain facade -> binding -> interface: install-eligible shows the button, appinstalled hides it and marks the
      // app installed. Whether a browser would ever offer installation is the test above.
      await installAndControl(page, fixtureServer);
      await expect(page.locator("#install")).toHaveCount(0);

      await page.evaluate(() => {
        window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
      });
      await expect(page.locator("#install")).toBeVisible();
      await expect(page.locator("#installed")).toHaveCount(0);

      await page.evaluate(() => {
        window.dispatchEvent(new Event("appinstalled"));
      });
      await expect(page.locator("#installed")).toHaveText("installed");
      await expect(page.locator("#install")).toHaveCount(0);
    });
  });
}
