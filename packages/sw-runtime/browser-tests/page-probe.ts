import type { Page } from "@playwright/test";
import { registerWorker, waitForController, type FixtureServer } from "@pwa-platform/browser-test-harness";
import { SKIP_WAITING_MESSAGE } from "../src/messages/index.js";
import { SHELL_URL, WORKER_URL } from "./fixture-site.js";

/** Request URLs of every cache in the page's origin, by cache name. Call once the worker has settled. */
export function cacheContents(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const contents: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      contents[name] = (await (await caches.open(name)).keys()).map((request) => request.url).sort();
    }
    return contents;
  });
}

/**
 * Waits until the registration has an active worker that finished activating, whether or not it controls the page.
 * A worker is still installing when `register()` resolves, so this polls instead of listening on one worker.
 */
export async function waitForActiveWorkerActivated(page: Page, timeout = 10_000): Promise<void> {
  await page.evaluate(async (limit) => {
    const deadline = Date.now() + limit;
    for (;;) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active?.state === "activated") return;
      if (Date.now() >= deadline) {
        throw new Error(`No activated worker within ${limit} ms (active: ${registration?.active?.state ?? "none"})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, timeout);
}

/** Opens the app shell, installs the worker of the deployed version and reloads so that worker controls the page. */
export async function installAndControl(page: Page, fixtureServer: FixtureServer): Promise<void> {
  await page.goto(fixtureServer.url(SHELL_URL));
  await registerWorker(page, { scriptUrl: WORKER_URL });
  await waitForActiveWorkerActivated(page);
  await page.reload();
  await waitForController(page, WORKER_URL);
  fixtureServer.clearRequests();
}

/** Asks the registration to check for an update and waits until the new version is installed and waiting. */
export async function deployAndWait(page: Page, fixtureServer: FixtureServer, version: string, timeout = 10_000): Promise<void> {
  fixtureServer.deploy(version);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update();
  });
  await page.evaluate(async (limit) => {
    const deadline = Date.now() + limit;
    for (;;) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting !== null && registration?.waiting !== undefined) return;
      if (Date.now() >= deadline) throw new Error(`No waiting worker within ${limit} ms`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }, timeout);
}

/** Sends the platform's update confirmation to the waiting worker, the way client-runtime will. */
export async function confirmUpdate(page: Page): Promise<void> {
  await page.evaluate(async (message) => {
    const waiting = (await navigator.serviceWorker.getRegistration())?.waiting;
    if (!waiting) throw new Error("No waiting worker to confirm");
    waiting.postMessage(message);
  }, SKIP_WAITING_MESSAGE);
}

/** Marks the document so a later check can prove the page was never reloaded. */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    Reflect.set(window, "__swRuntimeMark", "kept");
  });
}

export function documentMark(page: Page): Promise<unknown> {
  return page.evaluate(() => Reflect.get(window, "__swRuntimeMark"));
}
