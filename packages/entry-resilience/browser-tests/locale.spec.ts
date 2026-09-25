// EL3 (tasks/pwa-entry-resilience/plan.md's "修订：恢复页的构建期语言与文案覆盖"): the recovery page built with
// `locale: "en"` and one `messages` override, in a real browser. Helpers are duplicated from styling.spec.ts on
// purpose, as that file explains, so each spec stays readable on its own.
import { expect, test, waitForController, type FixtureServer } from "@pwa-platform/browser-test-harness";
import type { Page } from "@playwright/test";
import type { EntryUpdateResult } from "../src/client/index.js";
import type { EntryRecoveryResult } from "../src/index.js";
import { SHELL_URL, WORKER_URL, startSites, type Sites } from "./sites.js";

const GO_OVERRIDE = "Open {host}";

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

function manifestPayload(alternateOrigin: string, status: string): Record<string, unknown> {
  const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    sequence: 2,
    expiresAt: iso(Date.now() + 86_400_000),
    status,
    reason: { code: "planned-migration" },
    entries: [{ origin: alternateOrigin, startPath: SHELL_URL }],
  };
}

test.describe("recovery page built with locale en", () => {
  let sites: Sites;

  test.beforeEach(async () => {
    sites = await startSites({ locale: "en", messages: { go: GO_OVERRIDE } });
  });

  test.afterEach(async () => {
    await sites.closeAll();
  });

  test("shows the en copy, the lang and title, and the overridden button text", async ({ page }) => {
    await installAndControl(page, sites.primary);
    expect((await entryUpdate(page, manifestPayload(sites.alternate.origin, "migrating"))).accepted).toBe(true);
    const result = await entryCheck(page);
    if (result.kind !== "available") throw new Error("expected an available entry");

    await page.goto(sites.primary.url(result.recoveryPageUrl));
    await expect(page.locator(".pwa-entry__headline")).toHaveText("This app is moving to a new address");
    await expect(page.locator(".pwa-entry__expiry")).toHaveText(/^This notice is valid until \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    await expect(page.locator(".pwa-entry__button")).toHaveText(`Open ${new URL(sites.alternate.origin).host}`);
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    expect(await page.title()).toBe("Alternative entry");
  });

  test("the incident headline is in en too", async ({ page }) => {
    await installAndControl(page, sites.primary);
    expect((await entryUpdate(page, manifestPayload(sites.alternate.origin, "incident"))).accepted).toBe(true);
    const result = await entryCheck(page);
    if (result.kind !== "available") throw new Error("expected an available entry");

    await page.goto(sites.primary.url(result.recoveryPageUrl));
    await expect(page.locator(".pwa-entry__headline")).toHaveText("This app's usual address is having problems");
  });
});
