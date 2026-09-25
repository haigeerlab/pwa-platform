import type { PwaPlatformWorkerConfig } from "../shared/config.js";
import type { PwaOfflineWriteIntent } from "./offline-write-intent.js";

const STORE_NAME = "writes";

export type PwaOfflineWriteState = "pending" | "authorization-required" | "rejected";
export type PwaStoredOfflineWrite = PwaOfflineWriteIntent & {
  readonly createdAt: number;
  readonly bodyBytes: number;
  readonly deliveryState: PwaOfflineWriteState;
};
export type PwaPreparedOfflineWrites = { readonly writes: readonly PwaStoredOfflineWrite[]; readonly purged: number };

export type PwaOfflineWriteStore = {
  enqueue(intent: PwaOfflineWriteIntent): Promise<"queued" | "existing">;
  prepareFlush(binding: string): Promise<PwaPreparedOfflineWrites>;
  remove(idempotencyKey: string): Promise<void>;
  markFailed(idempotencyKey: string, state: Exclude<PwaOfflineWriteState, "pending">): Promise<void>;
  clear(): Promise<void>;
};

/**
 * The worker-owned IndexedDB queue. Every admission decision and write shares one readwrite transaction, so a
 * concurrent enqueue cannot overrun a quota or turn one idempotency key into two different stored intents.
 */
export function createOfflineWriteStore(config: Extract<PwaPlatformWorkerConfig["offlineWrites"], { readonly enabled: true }>): PwaOfflineWriteStore {
  return {
    async enqueue(intent): Promise<"queued" | "existing"> {
      const db = await openDatabase(config.databaseName);
      try {
        return await new Promise<"queued" | "existing">((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          let outcome: "queued" | "existing" | undefined;
          transaction.oncomplete = (): void => {
            if (outcome === undefined) reject(new Error("offline-write transaction completed without an outcome"));
            else resolve(outcome);
          };
          transaction.onabort = (): void => reject(transaction.error ?? new Error("offline-write transaction aborted"));
          transaction.onerror = (): void => reject(transaction.error ?? new Error("offline-write transaction failed"));
          const store = transaction.objectStore(STORE_NAME);
          const existing = store.get(intent.idempotencyKey);
          existing.onerror = (): void => transaction.abort();
          existing.onsuccess = (): void => {
            const prior = existing.result as PwaStoredOfflineWrite | undefined;
            if (prior !== undefined) {
              if (sameIntent(prior, intent)) outcome = "existing";
              else reject(new Error("offline-write idempotency conflict"));
              return;
            }
            const all = store.getAll();
            all.onerror = (): void => transaction.abort();
            all.onsuccess = (): void => {
              const writes = all.result as PwaStoredOfflineWrite[];
              const bodyBytes = new TextEncoder().encode(intent.bodyJson).length;
              const total = writes.reduce((sum, write) => sum + write.bodyBytes, 0);
              if (writes.length >= config.maxEntries || total + bodyBytes > config.maxTotalBodyBytes) {
                reject(new Error("offline-write quota exceeded"));
                return;
              }
              // `Date.now()` may repeat within one transaction. Deriving the next value from this transaction's
              // complete snapshot keeps FIFO order stable across worker restarts instead of falling back to key order.
              const createdAt = Math.max(Date.now(), ...writes.map((write) => write.createdAt + 1));
              store.put({ ...intent, createdAt, bodyBytes, deliveryState: "pending" }, intent.idempotencyKey);
              outcome = "queued";
            };
          };
        });
      } finally {
        db.close();
      }
    },
    async prepareFlush(binding): Promise<PwaPreparedOfflineWrites> {
      const db = await openDatabase(config.databaseName);
      try {
        return await new Promise<PwaPreparedOfflineWrites>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          let selected: PwaPreparedOfflineWrites | undefined;
          transaction.oncomplete = (): void => selected === undefined ? reject(new Error("offline-write flush preparation incomplete")) : resolve(selected);
          transaction.onabort = (): void => reject(transaction.error ?? new Error("offline-write flush preparation aborted"));
          transaction.onerror = (): void => reject(transaction.error ?? new Error("offline-write flush preparation failed"));
          const store = transaction.objectStore(STORE_NAME);
          const all = store.getAll();
          all.onerror = (): void => transaction.abort();
          all.onsuccess = (): void => {
            const writes = all.result as PwaStoredOfflineWrite[];
            const stale = writes.filter((write) => write.sessionBinding !== binding);
            for (const write of stale) store.delete(write.idempotencyKey);
            selected = {
              writes: writes
                .filter((write) => write.sessionBinding === binding && write.deliveryState === "pending")
                .sort((left, right) => left.createdAt - right.createdAt),
              purged: stale.length,
            };
          };
        });
      } finally {
        db.close();
      }
    },
    async remove(idempotencyKey): Promise<void> {
      const db = await openDatabase(config.databaseName);
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          transaction.oncomplete = (): void => resolve();
          transaction.onabort = (): void => reject(transaction.error ?? new Error("offline-write delete aborted"));
          transaction.onerror = (): void => reject(transaction.error ?? new Error("offline-write delete failed"));
          transaction.objectStore(STORE_NAME).delete(idempotencyKey);
        });
      } finally {
        db.close();
      }
    },
    async markFailed(idempotencyKey, state): Promise<void> {
      const db = await openDatabase(config.databaseName);
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          transaction.oncomplete = (): void => resolve();
          transaction.onabort = (): void => reject(transaction.error ?? new Error("offline-write state update aborted"));
          transaction.onerror = (): void => reject(transaction.error ?? new Error("offline-write state update failed"));
          const store = transaction.objectStore(STORE_NAME);
          const existing = store.get(idempotencyKey);
          existing.onerror = (): void => transaction.abort();
          existing.onsuccess = (): void => {
            const write = existing.result as PwaStoredOfflineWrite | undefined;
            if (write === undefined) {
              transaction.abort();
              return;
            }
            store.put({ ...write, deliveryState: state }, idempotencyKey);
          };
        });
      } finally {
        db.close();
      }
    },
    clear: () => deleteDatabase(config.databaseName),
  };
}

function sameIntent(stored: PwaStoredOfflineWrite, intent: PwaOfflineWriteIntent): boolean {
  return stored.targetId === intent.targetId && stored.path === intent.path && stored.bodyJson === intent.bodyJson && stored.sessionBinding === intent.sessionBinding;
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = (): void => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error ?? new Error("offline-write database unavailable"));
    request.onblocked = (): void => reject(new Error("offline-write database blocked"));
  });
}

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = (): void => resolve();
    request.onerror = (): void => reject(request.error ?? new Error("offline-write database deletion failed"));
    request.onblocked = (): void => reject(new Error("offline-write database deletion blocked"));
  });
}
