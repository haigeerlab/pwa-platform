import { expect, readRegistration, test, waitForControllerChange } from "@pwa-platform/browser-test-harness";
import { SHELL_URL, WORKER_URL } from "../apps/shared/identity.js";
import { checkForUpdate, deployAndOffer, documentMark, installAndControl, markDocument } from "./page.js";
import { EXAMPLES, fixtureSite } from "./sites.js";

for (const example of EXAMPLES) {
  test.describe(`${example} example · update`, () => {
    test.use({ fixtureSite: fixtureSite(example) });

    test("a new deployment waits for the user and the interface says so", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      await expect(page.locator("#apply-update")).toHaveCount(0);

      await deployAndOffer(page, fixtureServer, "v2");

      // The new worker installed but did not take over: it is in the waiting slot and the old one is still active
      // (ADR-0005). A worker that called skipWaiting would have emptied that slot — and would never have produced
      // the prompt `deployAndOffer` just waited for.
      const registration = await readRegistration(page, SHELL_URL);
      expect(registration?.waiting).toBe(fixtureServer.url(WORKER_URL));
      expect(registration?.active).toBe(fixtureServer.url(WORKER_URL));
    });

    test("confirming hands over control without refreshing the open page", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      const mark = await markDocument(page);
      await deployAndOffer(page, fixtureServer, "v2");

      // `applyUpdate()` returning is not evidence that control moved; the harness waits for a real
      // `controllerchange` with a timeout, so a worker that installs and then keeps waiting fails here.
      const after = await waitForControllerChange(page, async () => {
        await page.locator("#apply-update").click();
      });
      expect(after.waiting).toBeNull();
      expect(after.active).toBe(fixtureServer.url(WORKER_URL));

      // The acceptance matrix forbids a forced global refresh, so the page the user had open must survive the
      // handover. Two witnesses: the window still holds the mark, and the document is still the v1 bundle — a
      // reload would have loaded v2 and lost the mark.
      expect(await documentMark(page)).toBe(mark);
      await expect(page.locator("#version")).toHaveText("v1");

      // `update-applied` reaches the binding only after the page actually observes controllerchange. It dismisses
      // the now-unactionable prompt without refreshing the page.
      await expect(page.locator("#apply-update")).toHaveCount(0);

      // Control moved but the page never reloaded, so the interface says so instead of silently doing nothing:
      // the same transition that clears `#apply-update` is what the confirming page's own banner turns into a
      // Reload prompt (spec: 修订：完整更新提示参考实现). Version and mark are asserted again for readability at the
      // point that actually matters, even though the lines above already prove nothing reloaded.
      await expect(page.locator("#update-reload")).toBeVisible();
      await expect(page.locator("#version")).toHaveText("v1");
      expect(await documentMark(page)).toBe(mark);
    });

    test("one confirmation clears the prompt in every controlled same-scope tab", async ({ page, context, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      const sibling = await context.newPage();
      try {
        await installAndControl(sibling, fixtureServer);
        const primaryMark = await markDocument(page);
        const siblingMark = await markDocument(sibling);

        await deployAndOffer(page, fixtureServer, "v2");
        await expect(sibling.locator("#apply-update")).toBeVisible({ timeout: 15_000 });

        await waitForControllerChange(page, async () => {
          await page.locator("#apply-update").click();
        });

        // Each page sees the browser's own controllerchange. The test deliberately creates no BroadcastChannel,
        // postMessage or test-side forwarding between pages.
        await expect(page.locator("#apply-update")).toHaveCount(0);
        await expect(sibling.locator("#apply-update")).toHaveCount(0);
        expect(await documentMark(page)).toBe(primaryMark);
        expect(await documentMark(sibling)).toBe(siblingMark);
        await expect(page.locator("#version")).toHaveText("v1");
        await expect(sibling.locator("#version")).toHaveText("v1");

        // The sibling never clicked anything; the only signal it gets is `updateWaiting` going from true to false,
        // which — per the state machine in store.ts — can only mean `update-applied`, i.e. some page's confirmation
        // already took effect. It shows the same Reload prompt as the page that actually clicked Update.
        await expect(page.locator("#update-reload")).toBeVisible();
        await expect(sibling.locator("#update-reload")).toBeVisible();
      } finally {
        await sibling.close();
      }
    });

    test("clicking Reload reloads the confirming page onto the new version", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      await deployAndOffer(page, fixtureServer, "v2");

      await waitForControllerChange(page, async () => {
        await page.locator("#apply-update").click();
      });
      await expect(page.locator("#update-reload")).toBeVisible();
      await expect(page.locator("#version")).toHaveText("v1");

      // Only this click may reload the page (V1 acceptance matrix forbids an automatic one); once it does, the new
      // worker's precache manifest is what the reloaded document comes from, so the visible marker moves to v2.
      await page.locator("#update-reload").click();
      await expect(page.locator("#version")).toHaveText("v2");
    });

    test("Later hides the banner without touching the waiting worker", async ({ page, fixtureServer }) => {
      await installAndControl(page, fixtureServer);
      await deployAndOffer(page, fixtureServer, "v2");

      await page.locator("#update-later").click();
      await expect(page.locator("#update-banner")).toHaveCount(0);

      // The dismissal is a display choice only: the worker this page was told about is still sitting in the
      // waiting slot, untouched, and a page that reloads or re-checks would see the prompt again.
      const registration = await readRegistration(page, SHELL_URL);
      expect(registration?.waiting).toBe(fixtureServer.url(WORKER_URL));
    });

    test("a page that already reloaded onto the new code offers to finish for offline use, not to reload again", async ({
      page,
      fixtureServer,
    }) => {
      await installAndControl(page, fixtureServer);
      await deployAndOffer(page, fixtureServer, "v2");
      await page.locator("#update-later").click();

      // The app shell navigation rule is network-first (apps/shared/identity.ts), so a plain reload while online
      // already loads v2's HTML and entry script from the network, even though the worker this page was told about
      // is still sitting in the waiting slot, untouched (spec: 补充修订：区分"页面已是新代码"). The reload also
      // re-registers and re-observes the still-waiting worker, which is why the prompt comes back at all.
      await page.reload();
      await expect(page.locator("#version")).toHaveText("v2");
      await expect(page.locator("#update-banner")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("#update-banner")).toContainText("An update is ready for offline use");

      // Confirming still goes through the same takeover as the stale case — nothing here skips waiting for the
      // user (V1 acceptance matrix) — but because the page was already on the new code, there is nothing left to
      // reload for: the banner disappears entirely instead of turning into a Reload prompt.
      await waitForControllerChange(page, async () => {
        await page.locator("#apply-update").click();
      });
      await expect(page.locator("#update-banner")).toHaveCount(0);
      await expect(page.locator("#update-reload")).toHaveCount(0);
      const registration = await readRegistration(page, SHELL_URL);
      expect(registration?.waiting).toBeNull();
    });

    test("a currency check that never answers still lets the ordinary prompt appear after its timeout", async ({
      page,
      context,
      fixtureServer,
    }) => {
      await installAndControl(page, fixtureServer);

      // Hold only the page's own currency request: a `fetch()` of the shell URL. Navigations to the shell are
      // `document` requests and pass through untouched. Held requests are never answered, the way a stalled network
      // would behave; `stalled` proves the hold was actually hit, so the test cannot pass just because the check
      // happened to answer quickly.
      let stalled = 0;
      await context.route(fixtureServer.url(SHELL_URL), async (route) => {
        if (route.request().resourceType() === "fetch") {
          stalled += 1;
          return;
        }
        await route.continue();
      });

      try {
        fixtureServer.deploy("v2");
        const started = Date.now();
        await checkForUpdate(page);

        // The banner stays hidden while the check is unresolved; the 5 s timeout then treats the page as stale
        // (spec: 补充修订：区分"页面已是新代码"), which is also the truth here — the page is still v1.
        await expect(page.locator("#update-banner")).toBeVisible({ timeout: 15_000 });
        expect(Date.now() - started).toBeGreaterThanOrEqual(4_000);
        expect(stalled).toBeGreaterThan(0);
        await expect(page.locator("#update-banner")).toContainText("A new version is available");
        await expect(page.locator("#version")).toHaveText("v1");
      } finally {
        await context.unrouteAll({ behavior: "ignoreErrors" });
      }
    });
  });
}
