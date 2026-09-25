import type { Page } from "@playwright/test";

export type WorkerSlot = "installing" | "waiting" | "active";

/** Script URLs of the workers in each slot of one registration; `null` when a slot is empty. */
export type RegistrationSnapshot = {
  readonly scope: string;
  readonly installing: string | null;
  readonly waiting: string | null;
  readonly active: string | null;
};

export type PageRequestResult =
  | { readonly outcome: "response"; readonly status: number; readonly fromServiceWorker: boolean }
  | { readonly outcome: "network-error"; readonly message: string };

export type WaitOptions = {
  /** Milliseconds before the wait fails; defaults to 10 seconds. */
  readonly timeout?: number;
};

const DEFAULT_TIMEOUT = 10_000;
const POLL_INTERVAL = 50;
const REQUEST_MARKER_HEADER = "x-pwa-harness-request";
const CONTROLLER_CHANGE_KEY = "__pwaHarnessControllerChange";

let requestCounter = 0;

/** Registers a worker from the page and resolves with the registration's scope once registration succeeds. */
export async function registerWorker(
  page: Page,
  options: { readonly scriptUrl: string; readonly scope?: string },
): Promise<string> {
  return page.evaluate(
    async ({ scriptUrl, scope }) =>
      (await navigator.serviceWorker.register(scriptUrl, scope === null ? undefined : { scope })).scope,
    { scriptUrl: options.scriptUrl, scope: options.scope ?? null },
  );
}

/**
 * Waits until the page is controlled by a worker whose script URL resolves to `scriptUrl`. It compares URLs only,
 * so it cannot tell two versions served at the same URL apart; use `waitForControllerChange` for updates.
 */
export async function waitForController(page: Page, scriptUrl: string, options: WaitOptions = {}): Promise<void> {
  await page.waitForFunction(
    (expected) => navigator.serviceWorker.controller?.scriptURL === new URL(expected, location.href).href,
    scriptUrl,
    { timeout: options.timeout ?? DEFAULT_TIMEOUT },
  );
}

/**
 * Runs `trigger` (for example a deployment followed by `registration.update()`) and waits until the page's
 * controller changes to its registration's active worker. It fails when no `controllerchange` happens in time,
 * so a new version that only waits does not pass. The trigger must not navigate the page.
 */
export async function waitForControllerChange(
  page: Page,
  trigger: () => Promise<unknown>,
  options: WaitOptions = {},
): Promise<RegistrationSnapshot> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  await page.evaluate((key) => {
    const changed = new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    });
    Reflect.set(window, key, { previous: navigator.serviceWorker.controller, changed });
  }, CONTROLLER_CHANGE_KEY);

  await trigger();

  return page.evaluate(
    async ({ key, timeout: limit }) => {
      const state = Reflect.get(window, key) as { previous: ServiceWorker | null; changed: Promise<void> } | undefined;
      Reflect.deleteProperty(window, key);
      if (state === undefined) throw new Error("The page navigated during the trigger; waitForControllerChange needs the same document");
      let timer = 0;
      const outcome = await Promise.race([
        state.changed.then(() => "changed" as const),
        new Promise<"timeout">((resolve) => {
          timer = window.setTimeout(() => resolve("timeout"), limit);
        }),
      ]);
      window.clearTimeout(timer);
      if (outcome === "timeout") throw new Error(`No controllerchange within ${limit} ms`);
      const controller = navigator.serviceWorker.controller;
      const registration = await navigator.serviceWorker.getRegistration();
      if (controller === null || controller === state.previous || registration?.active !== controller) {
        throw new Error("The page's new controller is not its registration's active worker");
      }
      return {
        scope: registration.scope,
        installing: registration.installing?.scriptURL ?? null,
        waiting: registration.waiting?.scriptURL ?? null,
        active: registration.active.scriptURL,
      };
    },
    { key: CONTROLLER_CHANGE_KEY, timeout },
  );
}

/** Reads the registration whose scope is exactly `scope` (resolved against the page URL), or `null`. */
export async function readRegistration(page: Page, scope: string): Promise<RegistrationSnapshot | null> {
  return page.evaluate(async (requested) => {
    const expected = new URL(requested, location.href).href;
    const registration = await navigator.serviceWorker.getRegistration(expected);
    if (registration === undefined || registration.scope !== expected) return null;
    return {
      scope: registration.scope,
      installing: registration.installing?.scriptURL ?? null,
      waiting: registration.waiting?.scriptURL ?? null,
      active: registration.active?.scriptURL ?? null,
    };
  }, scope);
}

/**
 * Waits until the registration for `scope` has a worker in `slot`, and returns that registration. It polls, so a
 * worker that passes through `installing` very quickly can be missed; like `waitForController` it compares
 * script URLs and cannot distinguish versions served at the same URL. Navigations during the wait are tolerated.
 */
export async function waitForWorkerState(
  page: Page,
  scope: string,
  slot: WorkerSlot,
  options: WaitOptions = {},
): Promise<RegistrationSnapshot> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const deadline = Date.now() + timeout;
  for (;;) {
    let snapshot: RegistrationSnapshot | null = null;
    try {
      snapshot = await readRegistration(page, scope);
    } catch (error) {
      if (!(error instanceof Error && /Execution context was destroyed|because of a navigation/.test(error.message))) {
        throw error;
      }
    }
    if (snapshot !== null && snapshot[slot] !== null) return snapshot;
    if (Date.now() >= deadline) {
      throw new Error(`No ${slot} worker for scope ${scope} within ${timeout} ms (last: ${JSON.stringify(snapshot)})`);
    }
    await page.waitForTimeout(POLL_INTERVAL);
  }
}

/**
 * Fetches a same-origin `url` from the page, bypassing the HTTP cache, and reports either the status and whether
 * a service worker's fetch handler produced the response, or the network error. The fragment is ignored; the
 * request carries a unique `x-pwa-harness-request` header so concurrent requests to the same URL are not confused.
 */
export async function requestFromPage(page: Page, url: string, options: WaitOptions = {}): Promise<PageRequestResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const target = new URL(url, page.url());
  target.hash = "";
  requestCounter += 1;
  const marker = `${process.pid}-${requestCounter}`;
  const responseEvent = page.waitForResponse(
    (response) => response.request().headers()[REQUEST_MARKER_HEADER] === marker,
    { timeout },
  );
  // The response event never arrives for network errors; keep its eventual rejection handled.
  responseEvent.catch(() => undefined);

  const result = await page.evaluate(
    async ({ requested, header, value, limit }) => {
      try {
        const response = await fetch(requested, {
          cache: "no-store",
          headers: { [header]: value },
          signal: AbortSignal.timeout(limit),
        });
        return { ok: true as const, status: response.status };
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === "TimeoutError";
        return { ok: false as const, timedOut, message: error instanceof Error ? error.message : String(error) };
      }
    },
    { requested: target.href, header: REQUEST_MARKER_HEADER, value: marker, limit: timeout },
  );

  if (!result.ok) {
    if (result.timedOut) throw new Error(`Request to ${target.href} did not finish within ${timeout} ms`);
    return { outcome: "network-error", message: result.message };
  }
  const response = await responseEvent;
  return { outcome: "response", status: result.status, fromServiceWorker: response.fromServiceWorker() };
}
