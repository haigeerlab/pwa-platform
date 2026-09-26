import { expect, readRegistration, test } from "@pwa-platform/browser-test-harness";
import { SHELL_URL, WORKER_URL } from "../apps/shared/identity.js";
import { EXAMPLES, VERSIONS, fixtureSite } from "./sites.js";

// One set of assertions, run once per example. Both examples share the identity and the element ids, so a failure
// on only one side points at that framework's binding rather than at a difference in how the examples were written.
for (const example of EXAMPLES) {
  test.describe(`${example} example`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    test("loads, registers the worker at the identity's path, and shows it", async ({ page, fixtureServer }) => {
      await page.goto(fixtureServer.url(SHELL_URL));

      // Asserted through the page, as a user would see it: the binding's state reaches the interface.
      await expect(page.locator("#registered")).toHaveText("registered");
      await expect(page.locator("#version")).toHaveText("v1");

      const registration = await readRegistration(page, SHELL_URL);
      expect(registration?.scope).toBe(fixtureServer.url(SHELL_URL));
    });

    test("the published example's recovery page uses the same English locale as its offline page", async ({ page, fixtureServer }) => {
      await page.goto(fixtureServer.url("/app/pwa-entry.html"));
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page).toHaveTitle("Alternative entry");
    });

    test("every site version exists and serves its own worker", async ({ page, fixtureServer }) => {
      // Without this, a global-setup that silently skipped a version would leave the smoke test green, and the
      // failure would surface later as a confusing update or recovery test. Each version must serve a worker, and
      // no two may serve the same one — recovery in particular must be the recovery worker, not a copy of v1.
      const bodies = new Map<string, string>();
      for (const version of VERSIONS) {
        fixtureServer.deploy(version);
        const response = await page.request.get(fixtureServer.url(WORKER_URL));
        expect(response.status(), `${version} serves ${WORKER_URL}`).toBe(200);
        bodies.set(version, await response.text());
      }
      expect(bodies.get("v2")).not.toBe(bodies.get("v1"));
      expect(bodies.get("recovery")).not.toBe(bodies.get("v1"));
      expect(bodies.get("recovery")).not.toBe(bodies.get("v2"));
    });
  });
}
