// Test-side fixture override used only by install.spec.ts's real-`beforeinstallprompt` case.
//
// Root cause (verified with CDP `Page.getInstallabilityErrors` — see install.spec.ts): a page loaded in a context
// created by Playwright's default `browser.newContext()` always reports the `in-incognito` installability error,
// regardless of headless mode or Chrome's app-banner engagement heuristics. Chrome refuses `beforeinstallprompt`
// unconditionally on a profile it considers incognito. `chromium.launchPersistentContext()` launches a real user
// profile instead of an off-the-record one, which clears the error.
//
// This overrides only the `context` fixture, and only for tests that import `test` from this module — every other
// spec keeps using the harness's default `browser.newContext()` context, so this changes no other package's or
// spec's default behaviour.
import { chromium, type BrowserContext, type TestType } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BROWSER_VERSION_ANNOTATION,
  CHROME_PATH_ENV,
  test as base,
  type HarnessTestArgs,
  type HarnessWorkerArgs,
} from "@pwa-platform/browser-test-harness";

export const test: TestType<HarnessTestArgs, HarnessWorkerArgs> = base.extend<{ context: BrowserContext }>({
  context: async ({ launchOptions, headless, channel }, use) => {
    // `launchOptions` is the harness's worker-scoped fixture, which already merges `desktopLaunchOverrides` (see
    // browser-test-harness/src/test.ts) — spreading it here already carries the desktop N-1 `executablePath`.
    const userDataDir = await mkdtemp(join(tmpdir(), "pwa-installable-context-"));
    try {
      const context = await chromium.launchPersistentContext(userDataDir, {
        ...launchOptions,
        headless,
        ...(channel === undefined ? {} : { channel }),
      });
      try {
        await use(context);
      } finally {
        await context.close();
      }
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  },

  // The harness's own `recordBrowserVersion`/`logBrowserVersion` fixtures read the worker-scoped `browser`, which
  // this module never launches — tests here run in the persistent `context` above, a separate browser process that
  // can be pointed at a different executable (desktop N-1) than the worker's own. Overriding the fixture here reads
  // the version the persistent context actually launched, via CDP `Browser.getVersion`, so the annotation and the
  // log line both describe the browser the test ran in, not the harness's unrelated worker browser.
  // `auto` is fixed by the harness's base declaration (browser-test-harness/src/test.ts) and cannot be changed by an
  // override, so this keeps running for every test through this module without repeating `{ auto: true }` here.
  recordBrowserVersion: async ({ context, page }, use, testInfo) => {
    const session = await context.newCDPSession(page);
    try {
      const { product } = await session.send("Browser.getVersion");
      // Same parse the harness's own `browser.version()` performs: the CDP product string is "Chrome/1.2.3.4" or
      // "HeadlessChrome/1.2.3.4"; the version is everything after the first "/".
      const version = product.substring(product.indexOf("/") + 1);
      testInfo.annotations.push({ type: BROWSER_VERSION_ANNOTATION, description: version });
      const executable = process.env[CHROME_PATH_ENV];
      const source = executable === undefined || executable === "" ? "configured channel" : `executable ${executable}`;
      // Same format the harness's `logBrowserVersion` prints, so log-based version checks cover this persistent
      // context too.
      console.log(`[browser-test-harness] ${chromium.name()} ${version} (${source})`);
    } finally {
      await session.detach().catch(() => {});
    }
    await use();
  },
});
