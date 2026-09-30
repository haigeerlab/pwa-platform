import { test as base } from "@playwright/test";
import type {
  Browser,
  BrowserContext,
  Page,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from "@playwright/test";
import { connectAndroidChrome, describeAndroid, readAndroidModel, readAndroidSerial, type AndroidChrome } from "./android.js";
import { fixturePath } from "./fixtures.js";
import { CHROME_PATH_ENV, desktopLaunchOverrides } from "./launch.js";
import { RealBrowser } from "./real-browser.js";
import { describeBrowser, readRealBrowserKind } from "./webdriver.js";
import { startFixtureServer, type FixtureServer, type FixtureServerOptions } from "./server.js";

// Read first: it rejects PWA_ANDROID_SERIAL combined with PWA_REAL_BROWSER before either mode starts.
const androidSerial = readAndroidSerial(process.env);
const realBrowserKind = readRealBrowserKind(process.env);

/** Annotation type under which every test records the version of the browser it ran in. */
export const BROWSER_VERSION_ANNOTATION = "browser-version";

type HarnessFixtures = {
  readonly recordBrowserVersion: void;
  /** Site served by `fixtureServer`; override with `test.use({ fixtureSite })`. Defaults to the minimal page. */
  readonly fixtureSite: FixtureServerOptions;
  /** A fixture server started for this test only and closed when the test ends. */
  readonly fixtureServer: FixtureServer;
};

type HarnessWorkerFixtures = {
  /** Prints the browser actually launched once per Playwright worker, so CI logs show the tested version. */
  readonly logBrowserVersion: void;
};

export type HarnessTestArgs = PlaywrightTestArgs & PlaywrightTestOptions & HarnessFixtures;

export type HarnessWorkerArgs = PlaywrightWorkerArgs & PlaywrightWorkerOptions & HarnessWorkerFixtures;

/**
 * Playwright `test` for harness users, running Chrome desktop through Playwright's built-in fixtures.
 * `PWA_HARNESS_CHROME_PATH` replaces the installed channel with another executable, such as a desktop N-1 build.
 * Every test records the browser version as an annotation (docs/architecture/browser-matrix.md).
 */
const chromeTest: TestType<HarnessTestArgs, HarnessWorkerArgs> = base.extend<HarnessFixtures, HarnessWorkerFixtures>({
  launchOptions: [
    async ({ launchOptions }, use) => {
      await use({ ...launchOptions, ...desktopLaunchOverrides(process.env) });
    },
    { scope: "worker" },
  ],
  logBrowserVersion: [
    async ({ browser }, use) => {
      if (androidSerial !== undefined) {
        console.log(`[browser-test-harness] ${describeAndroid(browser.version(), await readAndroidModel(androidSerial))}`);
        await use();
        return;
      }
      if (realBrowserKind !== undefined) {
        console.log(`[browser-test-harness] ${describeBrowser(realBrowserKind, { browserVersion: browser.version() }).label}`);
        await use();
        return;
      }
      const executable = process.env[CHROME_PATH_ENV];
      const source = executable === undefined || executable === "" ? "configured channel" : `executable ${executable}`;
      console.log(`[browser-test-harness] ${browser.browserType().name()} ${browser.version()} (${source})`);
      await use();
    },
    { scope: "worker", auto: true },
  ],
  recordBrowserVersion: [
    async ({ browser }, use, testInfo) => {
      testInfo.annotations.push({ type: BROWSER_VERSION_ANNOTATION, description: browser.version() });
      await use();
    },
    { auto: true },
  ],
  fixtureSite: [{ versions: { default: fixturePath("pages") } }, { option: true }],
  fixtureServer: async ({ fixtureSite }, use) => {
    const server = await startFixtureServer(fixtureSite);
    try {
      await use(server);
    } finally {
      await server.close();
    }
  },
});

type RealBrowserWorkerFixtures = {
  readonly realBrowser: RealBrowser;
  readonly browser: Browser;
  readonly browserName: "chromium" | "firefox" | "webkit";
};

type RealBrowserTestFixtures = { readonly context: BrowserContext; readonly page: Page };

/**
 * With `PWA_REAL_BROWSER=safari|firefox` (ADR-0047) the `browser`, `context` and `page` fixtures come from a W3C
 * WebDriver session on the system Safari or Firefox instead of Playwright's Chrome. One driver process runs per
 * worker; each test gets a fresh session. Session creation costs about 0.5 s in Safari and 1.5 s in Firefox
 * (measured on macOS), so a new session per test gives true isolation of service workers, caches and storage
 * without any cleanup script, and quitting the session closes every tab the test opened.
 * Unset, `test` is exactly the Chrome `test` above.
 */
export const test: TestType<HarnessTestArgs, HarnessWorkerArgs> =
  realBrowserKind === undefined
    ? androidSerial === undefined
      ? chromeTest
      : androidTest(androidSerial)
    : chromeTest.extend<RealBrowserTestFixtures, RealBrowserWorkerFixtures>({
        realBrowser: [
          // Playwright reads fixture dependencies from the destructuring pattern; this one has none.
          // eslint-disable-next-line no-empty-pattern
          async ({}, use) => {
            const real = await RealBrowser.start(realBrowserKind, process.env);
            try {
              await use(real);
            } finally {
              await real.close();
            }
          },
          { scope: "worker" },
        ],
        browser: [async ({ realBrowser }, use) => use(realBrowser.toPlaywright()), { scope: "worker" }],
        browserName: [async ({ realBrowser }, use) => use(realBrowser.browserType().name() as "webkit" | "firefox"), { scope: "worker" }],
        context: async ({ realBrowser }, use) => {
          const session = await realBrowser.openSession();
          sessions.set(session.context, session);
          await use(session.context);
          await session.quit();
        },
        page: async ({ context }, use) => {
          const session = sessions.get(context);
          if (session === undefined) throw new Error("The real-browser context has no session");
          await use(session.page);
        },
      });

const sessions = new WeakMap<BrowserContext, { readonly page: Page }>();

type AndroidWorkerFixtures = { readonly androidChrome: AndroidChrome; readonly browser: Browser };

/**
 * With `PWA_ANDROID_SERIAL=<adb serial>` (ADR-0048) `browser` is a DevTools connection to the Chrome of that USB-connected
 * phone, forwarded with `adb forward`. Each test runs in its own new context (`viewport: null`: Android refuses window
 * bounds changes) that is closed afterwards; the phone's everyday context is never used, and closing the connection only
 * disconnects. `browserName` stays "chromium": it is Chromium.
 */
function androidTest(serial: string): TestType<HarnessTestArgs, HarnessWorkerArgs> {
  return chromeTest.extend<{ readonly context: BrowserContext }, AndroidWorkerFixtures>({
    androidChrome: [
      // eslint-disable-next-line no-empty-pattern
      async ({}, use) => {
        const chrome = await connectAndroidChrome(serial);
        try {
          await use(chrome);
        } finally {
          await chrome.close();
        }
      },
      { scope: "worker" },
    ],
    browser: [async ({ androidChrome }, use) => use(androidChrome.browser), { scope: "worker" }],
    context: async ({ browser, contextOptions }, use) => {
      const context = await browser.newContext({ ...contextOptions, viewport: null });
      try {
        await use(context);
      } finally {
        await context.close();
      }
    },
  }) as unknown as TestType<HarnessTestArgs, HarnessWorkerArgs>;
}
