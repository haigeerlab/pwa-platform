import { expect, expectLifecycleSequence, readRegistration, test } from "@pwa-platform/browser-test-harness";
import { FIXTURE_SITE, IDENTITY, SHELL_URL, WORKER_URL } from "./fixture-site.js";
import { cacheNames, collectedEvents, installAndControl, pageConfig, pageRegister, waitForActiveWorkerActivated } from "./page-probe.js";

test.use({ fixtureSite: FIXTURE_SITE });

test.describe("a site the plugin built", () => {
  test("registers the worker the plugin wrote, at the identity's path", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await pageRegister(page);
    await waitForActiveWorkerActivated(page);

    const registration = await readRegistration(page, SHELL_URL);
    expect(registration?.active).toBe(fixtureServer.url(WORKER_URL));
    expect(registration?.scope).toBe(fixtureServer.url(SHELL_URL));
  });

  test("hands the page its config through the virtual module", async ({ page, fixtureServer }) => {
    // Nothing replaced a global here: the app imported virtual:pwa-config, so this is the plugin's own path from
    // the options to the page.
    await page.goto(fixtureServer.url(SHELL_URL));

    expect(await pageConfig(page)).toEqual({
      appId: IDENTITY.appId,
      scope: IDENTITY.scope,
      serviceWorkerUrl: IDENTITY.serviceWorkerUrl,
      updateMode: "prompt",
      installEnabled: true,
    });
  });

  test("emits registered, and nothing else, on a first visit", async ({ page, fixtureServer }) => {
    await page.goto(fixtureServer.url(SHELL_URL));
    await pageRegister(page);
    await waitForActiveWorkerActivated(page);

    expectLifecycleSequence(await collectedEvents(page), ["registered"]);
  });

  test("precaches into the cache name the plan derives", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);

    // The worker's cache name comes from the injected config, which the plugin built from the compiled plan. A
    // wrong one would read and write a cache nothing else on the platform uses.
    const names = await cacheNames(page);
    expect(names.some((name) => name.startsWith(`pwa:${IDENTITY.appId}:${IDENTITY.environment}:`))).toBe(true);
  });

  test("serves the precached shell while the document is controlled", async ({ page, fixtureServer }) => {
    await installAndControl(page, fixtureServer, SHELL_URL, WORKER_URL);

    // Requested through the worker, so a miss would fall through to the network rather than fail — the assertion
    // that matters is offline, in offline.spec.ts.
    await expect(page.locator("#shell")).toBeVisible();
  });
});
