// Page-side helpers shared by the specs. Everything is observed through the examples' interface where the interface
// shows it; worker state that no interface shows is read from `navigator.serviceWorker` directly.
import { expect, waitForController, type FixtureServer } from "@pwa-platform/browser-test-harness";
import type { Page } from "@playwright/test";
import { SHELL_URL, WORKER_URL } from "../apps/shared/identity.js";

export async function waitForActivatedWorker(page: Page, timeout = 10_000): Promise<void> {
  await page.evaluate(async (limit) => {
    const deadline = Date.now() + limit;
    for (;;) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active?.state === "activated") return;
      if (Date.now() >= deadline) throw new Error(`No activated worker within ${limit} ms`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, timeout);
}

/**
 * Opens the example, waits for its own registration to finish, then reloads so the worker controls the document —
 * which is what precaching and offline both depend on.
 *
 * Unlike vite-adapter's fixture, nothing has to be re-registered after the reload: the example registers itself on
 * mount, so the reloaded page does it again on its own. The interface is re-checked to prove that happened.
 */
export async function installAndControl(page: Page, fixtureServer: FixtureServer): Promise<void> {
  await page.goto(fixtureServer.url(SHELL_URL));
  await expect(page.locator("#registered")).toHaveText("registered");
  await waitForActivatedWorker(page);
  await page.reload();
  await waitForController(page, WORKER_URL);
  await expect(page.locator("#registered")).toHaveText("registered");
}

/**
 * A value stored on the document's window. A reload builds a new window, so reading the same value back is
 * evidence that the page the test started with is still the page in front of it — which is what "confirming an
 * update must not refresh open pages" comes down to.
 */
const DOCUMENT_MARK_KEY = "__pwaExampleDocumentMark";

export async function markDocument(page: Page): Promise<string> {
  const mark = `mark-${Math.random().toString(36).slice(2)}`;
  await page.evaluate(([key, value]) => Reflect.set(window, key, value), [DOCUMENT_MARK_KEY, mark] as const);
  return mark;
}

export function documentMark(page: Page): Promise<string | null> {
  return page.evaluate((key) => (Reflect.get(window, key) as string | undefined) ?? null, DOCUMENT_MARK_KEY);
}

/**
 * Deploys another version and asks the registration to look for it, the way a browser's own periodic update check
 * would. Waits for the example's own update prompt rather than for the waiting slot: the interface is what the
 * acceptance criteria are about, and a worker that activates itself never produces the prompt.
 */
export async function deployAndOffer(page: Page, fixtureServer: FixtureServer, version: string): Promise<void> {
  // The prompt must not be showing already, or the wait below would return before anything was deployed. A prior
  // prompt clears only after its page observes controllerchange, so this also proves the preceding update cycle
  // has actually completed before a new deployment begins.
  await expect(page.locator("#apply-update")).toHaveCount(0);
  fixtureServer.deploy(version);
  await checkForUpdate(page);
  await expect(page.locator("#apply-update")).toBeVisible({ timeout: 15_000 });
}

export async function checkForUpdate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
}

/** Number of entries in one cache of the page's origin; `null` when no such cache exists. */
export function cacheEntryCount(page: Page, name: string): Promise<number | null> {
  return page.evaluate(async (cacheName) => {
    if (!(await caches.has(cacheName))) return null;
    return (await (await caches.open(cacheName)).keys()).length;
  }, name);
}

/** Whether the browser still holds a registration for the example's scope — reality, as opposed to what the UI says. */
export function hasRegistration(page: Page): Promise<boolean> {
  return page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined);
}
