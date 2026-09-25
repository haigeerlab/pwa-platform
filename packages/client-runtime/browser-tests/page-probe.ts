import type { Page } from "@playwright/test";
import { waitForController, type FixtureServer } from "@pwa-platform/browser-test-harness";
import { SHELL_URL, WORKER_URL } from "./fixture-site.js";

/** Reads the facade the page script exposed, failing loudly when the bundle is missing or broken. */
function exposed<T>(page: Page, method: string): Promise<T> {
  return page.evaluate(async (name) => {
    const client = Reflect.get(window, "__pwaClient") as Record<string, () => Promise<unknown>> | undefined;
    if (client === undefined) throw new Error("The page script did not expose __pwaClient");
    const call = client[name];
    if (typeof call !== "function") throw new Error(`The exposed client has no ${name}()`);
    return (await call.call(client)) as unknown;
  }, method) as Promise<T>;
}

/** Calls `register()` inside the page, the way an application would on startup. */
export async function pageRegister(page: Page): Promise<void> {
  await exposed<void>(page, "register");
}

/** Calls `applyUpdate()` inside the page, as an update prompt's confirm button would. */
export function pageApplyUpdate(page: Page): Promise<boolean> {
  return exposed<boolean>(page, "applyUpdate");
}

/** Calls `logout()` inside the page. */
export function pageLogout(page: Page): Promise<boolean> {
  return exposed<boolean>(page, "logout");
}

/** Calls `checkForUpdate()` inside the page. */
export function pageCheckForUpdate(page: Page): Promise<"update-available" | "up-to-date" | "unavailable"> {
  return exposed<"update-available" | "up-to-date" | "unavailable">(page, "checkForUpdate");
}

/** Lifecycle event envelopes the page collected so far, as plain JSON. */
export async function collectedEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const events = Reflect.get(window, "__pwaEvents") as unknown[] | undefined;
    if (events === undefined) throw new Error("The page script did not expose __pwaEvents");
    return structuredClone(events);
  });
}

/** Waits until the registration has an active worker that finished activating. */
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

/**
 * Opens the app shell, installs the worker and reloads so that it controls the page.
 *
 * The reload replaces the document, so the page script runs again and builds a **new** facade with an empty event
 * list. Registering again is what makes that facade watch the registration for updates; without it no
 * `update-waiting` could ever be announced in this document.
 */
export async function installAndControl(page: Page, fixtureServer: FixtureServer): Promise<void> {
  await page.goto(fixtureServer.url(SHELL_URL));
  await pageRegister(page);
  await waitForActiveWorkerActivated(page);
  await page.reload();
  await waitForController(page, WORKER_URL);
  await pageRegister(page);
  fixtureServer.clearRequests();
}

/** Deploys another version and waits until its worker is installed and waiting. */
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

/** Marks the document so a later check can prove the page was never reloaded. */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    Reflect.set(window, "__clientRuntimeMark", "kept");
  });
}

export function documentMark(page: Page): Promise<unknown> {
  return page.evaluate(() => Reflect.get(window, "__clientRuntimeMark"));
}

/** Shell URL that turns on the automatic update check in the page script (see page-entry.ts). */
export function shellUrlWithUpdateCheck(intervalMs: number): string {
  return `${SHELL_URL}?updateCheck=${intervalMs}`;
}

/**
 * Like `installAndControl`, but the reloaded document is built with the automatic update check enabled, and a
 * fake clock takes over its timers right afterwards.
 *
 * The clock is installed *after* `waitForController`, not before `page.goto` as `page.clock` usually wants: at
 * that point the reloaded document has already finished loading, so `waitForController`'s default requestAnimationFrame
 * polling still runs against real frames instead of the now-fake ones. What actually needs to be fake is the
 * `setTimeout` the facade's scheduler arms once `register()` succeeds, and `setTimeout` is looked up dynamically
 * at call time, not captured when the page script first ran — so installing the clock any time before this last
 * `register()` call is enough for `page.clock.runFor()` to later drive that timer.
 */
export async function installAndControlWithUpdateCheck(
  page: Page,
  fixtureServer: FixtureServer,
  intervalMs: number,
): Promise<void> {
  await page.goto(fixtureServer.url(shellUrlWithUpdateCheck(intervalMs)));
  await pageRegister(page);
  await waitForActiveWorkerActivated(page);
  await page.reload();
  await waitForController(page, WORKER_URL);
  await page.clock.install();
  await pageRegister(page);
  fixtureServer.clearRequests();
}

/** Overrides `document.visibilityState` in the page and dispatches `visibilitychange`, as a real tab switch would. */
export async function setPageVisibility(page: Page, state: "visible" | "hidden"): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/**
 * Polls for a lifecycle event of `type` in `window.__pwaEvents`, from Node rather than a page-side loop: while a
 * test drives `page.clock`, a wait built from the page's own (possibly fake) `setTimeout` could stall forever.
 */
export async function waitForClientEvent(page: Page, type: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = await page.evaluate((expected) => {
      const events = Reflect.get(window, "__pwaEvents") as { type: string }[] | undefined;
      return events?.some((event) => event.type === expected) ?? false;
    }, type);
    if (found) return;
    if (Date.now() >= deadline) throw new Error(`No "${type}" event within ${timeout} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Like `waitForClientEvent`, but waits until at least `count` events of `type` have arrived. Used as a deterministic
 * settle point before asserting an *exact* count: `waitForClientEvent` only proves the first one landed, so a test
 * that asserted the count right after it could pass just as well if a duplicate followed a moment later. A caller
 * that expects exactly `count` events drives a `count`-th real, known-to-be-served-from-cache read and waits for it
 * here before reading the final array — a duplicate emitted anywhere along the way then shows up in the count.
 */
export async function waitForClientEventCount(page: Page, type: string, count: number, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const total = await page.evaluate((expected) => {
      const events = Reflect.get(window, "__pwaEvents") as { type: string }[] | undefined;
      return events?.filter((event) => event.type === expected).length ?? 0;
    }, type);
    if (total >= count) return;
    if (Date.now() >= deadline) throw new Error(`Fewer than ${count} "${type}" events within ${timeout} ms (got ${total})`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
