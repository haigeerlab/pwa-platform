// Scenario 6 (tasks/ssr-adapters/plan.md, T7), modelled on examples-browser-e2e/browser-tests/update.spec.ts:
// deploying v2 on the same origin offers an update that waits for confirmation, and confirming hands over control
// without reloading the page the user had open.
import { expect, readRegistration, test, waitForControllerChange } from "@pwa-platform/browser-test-harness";
import { serverEntry } from "./global-setup.js";
import { checkForUpdate, documentMark, installAndControl, isSameController, markController, markDocument } from "./page.js";
import { startNuxtServer, type NuxtServer } from "./servers.js";
import { SHELL_URL, WORKER_URL } from "./urls.js";

test.describe("update prompt", () => {
  let server: NuxtServer;

  test.beforeEach(async () => {
    server = await startNuxtServer();
    await server.deploy(serverEntry("manual", "v1"));
  });

  test.afterEach(async () => {
    await server.close();
  });

  test("a new deployment waits for confirmation; the old worker stays active until then", async ({ page }) => {
    await installAndControl(page, server);
    await expect(page.locator("#apply-update")).toHaveCount(0);
    await markController(page);

    await server.deploy(serverEntry("manual", "v2"));
    await checkForUpdate(page);
    await expect(page.locator("#apply-update")).toBeVisible({ timeout: 15_000 });

    const registration = await readRegistration(page, server.url(SHELL_URL));
    expect(registration?.waiting).toBe(server.url(WORKER_URL));
    expect(registration?.active).toBe(server.url(WORKER_URL));

    // sw.js never changes address across versions, so the two checks above cannot by themselves tell v1's worker
    // apart from v2's — both witnesses below can (评审第 7 项). A reload would have replaced the document with
    // v2's and handed control to the new worker; neither happened.
    await expect(page.locator("#version")).toHaveText("v1");
    expect(await isSameController(page)).toBe(true);
  });

  test("confirming hands over control without reloading the open page", async ({ page }) => {
    await installAndControl(page, server);
    const mark = await markDocument(page);

    await server.deploy(serverEntry("manual", "v2"));
    await checkForUpdate(page);
    await expect(page.locator("#apply-update")).toBeVisible({ timeout: 15_000 });

    const after = await waitForControllerChange(page, async () => {
      await page.locator("#apply-update").click();
    });
    expect(after.waiting).toBeNull();
    expect(after.active).toBe(server.url(WORKER_URL));

    // A reload would have loaded v2 and discarded window state; both witnesses say it did not.
    expect(await documentMark(page)).toBe(mark);
    await expect(page.locator("#version")).toHaveText("v1");
  });
});
