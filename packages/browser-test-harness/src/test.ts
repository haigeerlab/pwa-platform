import { test as base } from "@playwright/test";
import type {
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from "@playwright/test";
import { fixturePath } from "./fixtures.js";
import { CHROME_PATH_ENV, desktopLaunchOverrides } from "./launch.js";
import { startFixtureServer, type FixtureServer, type FixtureServerOptions } from "./server.js";

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
export const test: TestType<HarnessTestArgs, HarnessWorkerArgs> = base.extend<HarnessFixtures, HarnessWorkerFixtures>({
  launchOptions: [
    async ({ launchOptions }, use) => {
      await use({ ...launchOptions, ...desktopLaunchOverrides(process.env) });
    },
    { scope: "worker" },
  ],
  logBrowserVersion: [
    async ({ browser }, use) => {
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
