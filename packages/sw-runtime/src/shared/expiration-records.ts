// Deletes workbox-expiration's own per-entry IndexedDB records for the caches this app just deleted (ADR-0035,
// "过期记录与缓存一起清理"): `caches.delete` never touches them, so without this they outlive the cache they described.
// Imports nothing — this file is loaded by the recovery worker too, which must never carry a package import — so the
// schema below is duplicated from workbox-expiration, not imported from it.
//
// Schema constants are workbox-expiration@7.4.1's own
// (node_modules/workbox-expiration/models/CacheTimestampsModel.js): database `workbox-expiration` version 1, a
// single object store `cache-entries` (keyPath `id`, one record per `cacheName + '|' + url`), with a non-unique
// index named `cacheName`.
const DATABASE_NAME = "workbox-expiration";
const DATABASE_VERSION = 1;
const OBJECT_STORE_NAME = "cache-entries";

/**
 * Deletes every `workbox-expiration` record whose `cacheName` field satisfies `matches`. Never creates the database:
 * when `indexedDB.databases` reports it does not exist, this returns without opening anything; when `databases` is
 * unavailable, it opens without forcing a version bump and, if that open turns out to create the database (an
 * `upgradeneeded` fires), aborts the upgrade transaction so nothing is left behind and returns. A missing
 * `cache-entries` store (a `workbox-expiration` from some future/incompatible schema) is treated the same way.
 */
export async function deleteExpirationRecords(matches: (cacheName: string) => boolean): Promise<void> {
  if (!(await mayExist())) return;
  const db = await openExistingDatabase();
  if (db === undefined) return;
  try {
    if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) return;
    await deleteMatchingRecords(db, matches);
  } finally {
    db.close();
  }
}

/** `false` only when `indexedDB.databases` is available and its listing does not include `workbox-expiration`. */
async function mayExist(): Promise<boolean> {
  if (typeof indexedDB.databases !== "function") return true;
  const databases = await indexedDB.databases();
  return databases.some((entry) => entry.name === DATABASE_NAME);
}

/**
 * Opens `workbox-expiration` at its known version without creating it: an `upgradeneeded` firing means no such
 * database existed yet, so the transaction is aborted (which discards the database `open` would otherwise have just
 * created) and this resolves to `undefined` instead of a connection.
 */
function openExistingDatabase(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    let didNotExist = false;
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (): void => {
      didNotExist = true;
      request.transaction?.abort();
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => {
      if (didNotExist) {
        resolve(undefined);
        return;
      }
      reject(request.error ?? new Error("workbox-expiration open failed"));
    };
  });
}

/** One readwrite transaction: every entry whose `cacheName` matches is deleted while the cursor walks the store. */
function deleteMatchingRecords(db: IDBDatabase, matches: (cacheName: string) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OBJECT_STORE_NAME, "readwrite");
    transaction.oncomplete = (): void => resolve();
    transaction.onerror = (): void => reject(transaction.error ?? new Error("workbox-expiration record deletion failed"));
    transaction.onabort = (): void => reject(transaction.error ?? new Error("workbox-expiration record deletion aborted"));
    const request = transaction.objectStore(OBJECT_STORE_NAME).openCursor();
    request.onerror = (): void => reject(request.error ?? new Error("workbox-expiration cursor failed"));
    request.onsuccess = (): void => {
      const cursor = request.result;
      if (cursor === null) return;
      const cacheName: unknown = (cursor.value as { readonly cacheName?: unknown }).cacheName;
      if (typeof cacheName === "string" && matches(cacheName)) cursor.delete();
      cursor.continue();
    };
  });
}
