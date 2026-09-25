import type { Page } from "@playwright/test";
import { registerWorker, waitForWorkerState, type WorkerSlot } from "@pwa-platform/browser-test-harness";
import { WORKER_URL } from "./fixture-site.js";

export type MatchReply = { readonly found: false } | { readonly found: true; readonly status: number; readonly body: string };

/** What the test worker recorded from the port; see worker/precache-worker.ts. */
export type EngineState = {
  readonly urls: readonly string[];
  readonly install: { readonly updatedUrls: readonly string[]; readonly notUpdatedUrls: readonly string[] } | { readonly error: string } | null;
  readonly activate: { readonly deletedUrls: readonly string[] } | { readonly error: string } | null;
};

/** Registers the v1 engine worker from the site root and waits until it is active. */
export async function installEngineWorker(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/`);
  await registerWorker(page, { scriptUrl: WORKER_URL });
  await waitForWorkerState(page, "/", "active");
}

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

/** Sends `message` with a reply port to the worker in `slot` of the page's registration and returns the reply. */
export function askWorker<Reply>(page: Page, slot: WorkerSlot, message: Readonly<Record<string, string>>): Promise<Reply> {
  return page.evaluate(
    async ({ slot: target, message: payload }) => {
      const worker = (await navigator.serviceWorker.getRegistration())?.[target];
      if (!worker) throw new Error(`No ${target} worker`);
      const channel = new MessageChannel();
      const reply = new Promise<Reply>((resolve) => {
        channel.port1.onmessage = (event: MessageEvent<Reply>) => resolve(event.data);
      });
      worker.postMessage(payload, [channel.port2]);
      return reply;
    },
    { slot, message },
  );
}

/** What `engine.match(url)` returns in the active worker; fails with the worker's error if it rejected. */
export async function matchInWorker(page: Page, url: string): Promise<MatchReply> {
  const reply = await askWorker<MatchReply | { readonly error: string }>(page, "active", { type: "match", url });
  if ("error" in reply) throw new Error(`engine.match(${url}) rejected in the worker: ${reply.error}`);
  return reply;
}

export function engineState(page: Page, slot: WorkerSlot): Promise<EngineState> {
  return askWorker<EngineState>(page, slot, { type: "state" });
}

/** Waits until the page's controller has finished activating, so its activate handler has run. */
export async function waitForActivatedController(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const worker = navigator.serviceWorker.controller;
        if (worker === null) return reject(new Error("The page has no controller"));
        if (worker.state === "activated") return resolve();
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") resolve();
        });
      }),
  );
}

/** Waits until the registration's active worker has finished activating, whether or not it controls the page. */
export async function waitForActiveWorkerActivated(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.getRegistration())?.active;
    if (!worker) throw new Error("The registration has no active worker");
    if (worker.state === "activated") return;
    await new Promise<void>((resolve) => {
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve();
      });
    });
  });
}
