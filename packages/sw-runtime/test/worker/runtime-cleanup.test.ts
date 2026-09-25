import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteExpirationRecords } from "../../src/shared/expiration-records.js";
import { deleteRuntimeCaches } from "../../src/worker/runtime-cleanup.js";
import type { PwaWorkerRuntimeCache } from "../../src/shared/config.js";

vi.mock("../../src/shared/expiration-records.js", () => ({ deleteExpirationRecords: vi.fn(async () => undefined) }));

const expirationRecordsMock = vi.mocked(deleteExpirationRecords);

const runtimeCache: PwaWorkerRuntimeCache = {
  enabled: true,
  pagesCacheName: "pwa:storefront:production:r3:runtime-pages",
  dataCacheNamePrefix: "pwa:storefront:production:r3:runtime-data-",
  dataCacheName: "pwa:storefront:production:r3:runtime-data-0123456789abcdef",
  maxEntries: 50,
  maxEntryBytes: 65_536,
  maxAgeSeconds: 300,
  rules: [],
};

function fakeScope(names: readonly string[]): { readonly caches: { readonly keys: () => Promise<string[]>; readonly delete: (name: string) => Promise<boolean> } } {
  const set = new Set(names);
  return { caches: { keys: async () => [...set], delete: async (name: string) => set.delete(name) } };
}

beforeEach(() => {
  expirationRecordsMock.mockReset();
  expirationRecordsMock.mockResolvedValue(undefined);
});

describe("deleteRuntimeCaches", () => {
  it("on activation (keep given), asks to delete expiration records for the pages cache and every stale-digest data cache, but not the kept one", async () => {
    const scope = fakeScope([]);
    await deleteRuntimeCaches(scope as never, runtimeCache, runtimeCache.dataCacheName);

    expect(expirationRecordsMock).toHaveBeenCalledTimes(1);
    const matches = expirationRecordsMock.mock.calls[0]?.[0] as (name: string) => boolean;
    expect(matches(runtimeCache.pagesCacheName)).toBe(true);
    expect(matches(`${runtimeCache.dataCacheNamePrefix}fedcba9876543210`)).toBe(true);
    expect(matches(runtimeCache.dataCacheName)).toBe(false); // kept digest
    expect(matches("pwa:other:production:r3:runtime-data-0123456789abcdef")).toBe(false); // different app
    expect(matches("images-v1")).toBe(false);
  });

  it("on logout (no keep), the predicate matches every data-cache digest, current one included", async () => {
    const scope = fakeScope([]);
    await deleteRuntimeCaches(scope as never, runtimeCache);

    const matches = expirationRecordsMock.mock.calls[0]?.[0] as (name: string) => boolean;
    expect(matches(runtimeCache.pagesCacheName)).toBe(true);
    expect(matches(runtimeCache.dataCacheName)).toBe(true);
    expect(matches(`${runtimeCache.dataCacheNamePrefix}fedcba9876543210`)).toBe(true);
  });

  it("computes the predicate from the config, not from caches.keys(): an orphan record survives even when its cache is already gone", async () => {
    // No caches at all in CacheStorage, yet the predicate must still match names under this config so an
    // already-cache-deleted-but-still-recorded entry is reachable.
    const scope = fakeScope([]);
    await deleteRuntimeCaches(scope as never, runtimeCache, runtimeCache.dataCacheName);

    const matches = expirationRecordsMock.mock.calls[0]?.[0] as (name: string) => boolean;
    expect(matches(`${runtimeCache.dataCacheNamePrefix}deadbeefdeadbeef`)).toBe(true);
  });

  it("deletes expiration records only after every cache deletion completed", async () => {
    const order: string[] = [];
    const scope = {
      caches: {
        keys: async () => [`${runtimeCache.dataCacheNamePrefix}fedcba9876543210`],
        delete: async (name: string) => {
          order.push(`delete ${name}`);
          return true;
        },
      },
    };
    expirationRecordsMock.mockImplementation(async () => {
      order.push("expiration-records");
    });

    await deleteRuntimeCaches(scope as never, runtimeCache, runtimeCache.dataCacheName);

    expect(order).toEqual([`delete ${runtimeCache.pagesCacheName}`, `delete ${runtimeCache.dataCacheNamePrefix}fedcba9876543210`, "expiration-records"]);
  });

  it("propagates a record-deletion failure", async () => {
    const scope = fakeScope([]);
    expirationRecordsMock.mockRejectedValue(new Error("workbox-expiration record deletion failed"));

    await expect(deleteRuntimeCaches(scope as never, runtimeCache)).rejects.toThrow("workbox-expiration record deletion failed");
  });
});
