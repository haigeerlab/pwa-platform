import type { Page } from "@playwright/test";
import type { CacheSnapshot } from "./cache-diff.js";

export type CacheSpec = {
  readonly name: string;
  /** Number of entries to write; at least 1, defaults to 1. */
  readonly entries?: number;
};

/**
 * Records every cache of the page's origin with its entry count, reading request keys only. A cache is opened
 * only after `caches.has` confirms it still exists, and the names are listed again afterwards; if they changed,
 * the snapshot is retried and finally fails. Take snapshots once the worker under test has settled.
 */
export async function snapshotCaches(page: Page): Promise<CacheSnapshot> {
  const entries = await page.evaluate(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const names = await caches.keys();
      const counted: [string, number][] = [];
      for (const name of names) {
        if (!(await caches.has(name))) break;
        counted.push([name, (await (await caches.open(name)).keys()).length]);
      }
      const after = await caches.keys();
      const stable =
        counted.length === names.length &&
        after.length === names.length &&
        after.every((name, index) => name === names[index]);
      if (stable) return counted;
    }
    throw new Error("Cache names kept changing while taking a snapshot; wait for the worker under test to settle");
  });
  return new Map(entries);
}

/** Creates caches in the page's origin, each holding the requested number of placeholder entries. */
export async function createCaches(page: Page, specs: readonly CacheSpec[]): Promise<void> {
  const normalized = specs.map(({ name, entries = 1 }) => {
    if (!Number.isInteger(entries) || entries < 1) throw new Error(`Cache "${name}" needs at least one entry`);
    return { name, entries };
  });
  await page.evaluate(async (list) => {
    for (const { name, entries } of list) {
      const cache = await caches.open(name);
      for (let index = 0; index < entries; index += 1) {
        await cache.put(new Request(`/__harness-cache-entry/${index}`), new Response("harness cache entry"));
      }
    }
  }, normalized);
}
