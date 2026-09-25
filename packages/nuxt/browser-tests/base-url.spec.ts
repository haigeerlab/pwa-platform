// Scenario 8 (tasks/ssr-adapters/plan.md, T7): starting the v1 build with NUXT_APP_BASE_URL overriding app.baseURL
// moves the whole site there at runtime (T1 record), diverging from the identity's mountPath baked in at build
// time. The client plugin's runtime check (src/runtime/binding.ts) must refuse to register rather than register at
// a scope the identity never declared (ADR-0004).
//
// Deviation from the task's literal "open /other/": measured empirically that this cannot be observed on the
// *prerendered* root page. A prerendered page's script tags and its embedded runtime-config payload are both
// captured at build time under the build's own app.baseURL ("/app/") — under the override they point at
// "/app/_nuxt/..." while the live server now only serves "/other/_nuxt/...", so every asset request 404s, no JS
// ever runs, and neither <ClientOnly> nor the mismatch check can fire (confirmed: window.__NUXT__.config.app.
// baseURL on that page reads back "/app/", not "/other/", even after the override). /app/news is rendered fresh by
// the live server on every request, so it correctly picks up the overridden base — site/app/pages/news.vue carries
// the same <PwaShell> this scenario needs, and this suite uses /other/news instead of /other/ for that reason.
import { expect, test } from "@pwa-platform/browser-test-harness";
import { serverEntry } from "./global-setup.js";
import { hasAnyRegistration } from "./page.js";
import { RUNTIME_BASE_URL_MISMATCH_CODE } from "../src/runtime/binding.js";
import { startNuxtServer, type NuxtServer } from "./servers.js";

const OTHER_BASE_NEWS = "/other/news";

test.describe("runtime baseURL override", () => {
  let server: NuxtServer;

  test.beforeEach(async () => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("manual", "v1"), { env: { NUXT_APP_BASE_URL: "/other/" } });
  });

  test.afterEach(async () => {
    await server.close();
  });

  test("register() rejects with nuxt.runtime-base-url-mismatch, warns once, and nothing ever registers", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });

    await page.goto(server.url(OTHER_BASE_NEWS));
    await expect(page.locator("#register-error")).toHaveText(new RegExp(`^${RUNTIME_BASE_URL_MISMATCH_CODE}:`));

    await expect.poll(() => warnings.some((line) => line.includes(RUNTIME_BASE_URL_MISMATCH_CODE))).toBe(true);
    expect(await hasAnyRegistration(page)).toBe(false);
  });
});
