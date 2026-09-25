import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteExpirationRecords } from "../../src/shared/expiration-records.js";

/**
 * `databases()` is the fast path most browsers give us: when it lists what exists, `deleteExpirationRecords` must
 * trust it and never call `open`. The full cursor-deletion path needs a real IndexedDB, so it is covered by the
 * sw-runtime browser tests (schema-guard, T8) instead of a hand-rolled fake here.
 */
describe("deleteExpirationRecords", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never opens the database when indexedDB.databases() says workbox-expiration does not exist", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", {
      databases: vi.fn(async () => [{ name: "some-other-db", version: 1 }]),
      open,
    });

    await deleteExpirationRecords(() => true);

    expect(open).not.toHaveBeenCalled();
  });

  it("opens the database when indexedDB.databases() lists workbox-expiration", async () => {
    const objectStoreNames = { contains: () => false };
    const db = { objectStoreNames, close: vi.fn() };
    const open = vi.fn(() => {
      const request = { result: db, onsuccess: null as (() => void) | null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.(new Event("success") as never));
      return request;
    });
    vi.stubGlobal("indexedDB", {
      databases: vi.fn(async () => [{ name: "workbox-expiration", version: 1 }]),
      open,
    });

    await deleteExpirationRecords(() => true);

    expect(open).toHaveBeenCalledWith("workbox-expiration", 1);
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the cache-entries store is missing", async () => {
    const close = vi.fn();
    const transaction = vi.fn();
    const objectStoreNames = { contains: () => false };
    const db = { objectStoreNames, close, transaction };
    const open = vi.fn(() => {
      const request = { result: db, onsuccess: null as (() => void) | null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.(new Event("success") as never));
      return request;
    });
    vi.stubGlobal("indexedDB", { databases: vi.fn(async () => [{ name: "workbox-expiration", version: 1 }]), open });

    await deleteExpirationRecords(() => true);

    expect(transaction).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  describe("without indexedDB.databases (fallback open)", () => {
    let deletedDatabases: string[];

    beforeEach(() => {
      deletedDatabases = [];
    });

    it("never creates workbox-expiration when it did not already exist", async () => {
      const open = vi.fn(() => {
        const request = {
          onupgradeneeded: null as (() => void) | null,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
          transaction: { abort: vi.fn() },
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => {
          request.onupgradeneeded?.(new Event("upgradeneeded") as never);
          // Aborting the upgrade transaction fails the open with an error event, per the IndexedDB spec.
          request.onerror?.(new Event("error") as never);
        });
        return request;
      });
      vi.stubGlobal("indexedDB", { open, deleteDatabase: vi.fn((name: string) => deletedDatabases.push(name)) });

      await expect(deleteExpirationRecords(() => true)).resolves.toBeUndefined();

      expect(deletedDatabases).toEqual([]);
    });

    it("propagates a genuine open failure on an existing database", async () => {
      const failure = new Error("boom");
      const open = vi.fn(() => {
        const request = { onsuccess: null, onerror: null as (() => void) | null, error: failure } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onerror?.(new Event("error") as never));
        return request;
      });
      vi.stubGlobal("indexedDB", { open });

      await expect(deleteExpirationRecords(() => true)).rejects.toThrow("boom");
    });
  });
});
