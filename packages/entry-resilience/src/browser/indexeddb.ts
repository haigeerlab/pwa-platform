// Browser adapter for the storage described in spec/pwa-entry-resilience.md's "存储" section: one
// IndexedDB database per app/environment, one object store, one record. Not unit tested — Node has no
// IndexedDB — and left for the real-browser evidence in a later task; T2's feasibility.spec.ts already
// exercises the same open/put/get shape against a real browser.
//
// ADR-0033 (2026-09-23): the stored record is now the plain manifest object itself (see src/types.ts's
// `EntryManifest`), not a signed envelope wrapped with its own `sequence` field — the platform no longer verifies a
// signature, so there is nothing left to store alongside the manifest.
import type { EntryManifest } from "../types.js";

export type CreateIndexedDbStoreOptions = {
  readonly appId: string;
  readonly environment: string;
};

export type EntryIndexedDbStore = {
  loadStored(): Promise<EntryManifest | null>;
  saveStored(manifest: EntryManifest): Promise<void>;
};

const STORE_NAME = "manifest";
const RECORD_KEY = "current";

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = (): void => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error);
  });
}

/** Builds the `loadStored`/`saveStored` ports backed by `pwa-entry:<appId>:<environment>`. */
export function createIndexedDbStore({ appId, environment }: CreateIndexedDbStoreOptions): EntryIndexedDbStore {
  const databaseName = `pwa-entry:${encodeURIComponent(appId)}:${encodeURIComponent(environment)}`;

  return {
    // Open failure (including a `VersionError` when a higher-versioned database already exists on disk),
    // transaction/request errors and transaction aborts all reject rather than resolving `null` — only a genuinely
    // missing record does that. Callers already treat a rejected `loadStored` as `entry.storage-unavailable`;
    // silently returning `null` here would mask a real failure as "nothing stored".
    async loadStored(): Promise<EntryManifest | null> {
      const db = await openDatabase(databaseName);
      try {
        return await new Promise<EntryManifest | null>((resolve, reject) => {
          let transaction: IDBTransaction;
          try {
            transaction = db.transaction(STORE_NAME, "readonly");
          } catch (error) {
            reject(error as Error);
            return;
          }
          transaction.onabort = (): void => reject(transaction.error ?? new Error("entry: readonly transaction aborted"));
          const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
          request.onsuccess = (): void => resolve((request.result as EntryManifest | undefined) ?? null);
          request.onerror = (): void => reject(request.error ?? new Error("entry: get request failed"));
        });
      } finally {
        db.close();
      }
    },

    async saveStored(manifest: EntryManifest): Promise<void> {
      const db = await openDatabase(databaseName);
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          transaction.objectStore(STORE_NAME).put(manifest, RECORD_KEY);
          transaction.oncomplete = (): void => resolve();
          transaction.onerror = (): void => reject(transaction.error);
          // A quota failure can end the transaction with `abort` and no settled request; without this the write hangs.
          transaction.onabort = (): void => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
  };
}
