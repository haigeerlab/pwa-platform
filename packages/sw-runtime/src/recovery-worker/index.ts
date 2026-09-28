// Recovery worker (service worker scope): activates at once, deletes this app's caches, the workbox-expiration
// records those caches left behind (ADR-0035, "过期记录与缓存一起清理") and its offline-write database, then claims
// clients. It imports no package, so the recovery artifact never carries Workbox or a fetch listener — the
// expiration-records module is local source, not a dependency.
import { validateRecoveryWorkerConfig, type PwaRecoveryWorkerConfig } from "../shared/config.js";
import { deleteExpirationRecords } from "../shared/expiration-records.js";

export type PwaRecoveryWorkerOptions = {
  readonly scope: ServiceWorkerGlobalScope;
  /** The injected recovery config; validated before any listener is registered. */
  readonly config: PwaRecoveryWorkerConfig;
};

/** How long the offline-write database deletion keeps waiting after `onblocked` before it is treated as a failure. */
const BLOCKED_WAIT_MS = 10_000;

/**
 * Registers the recovery worker (ADR-0005): it takes over immediately only after it removes every cache and the
 * identity-derived offline-write database of this app in this environment, then serves nothing, so page requests go
 * straight to the network. On activation it also cancels this registration's push subscription, after deletion and
 * before claiming clients, so the business backend starts seeing failed sends and can clean up (ADR-0021, "对
 * ADR-0012 的修订").
 *
 * It registers only `install` and `activate`; it never registers `fetch`, `push` or `notificationclick`, never opens
 * a cache and never deletes a cache outside `config.appCachePrefix`.
 */
export function registerRecoveryWorker({ scope, config }: PwaRecoveryWorkerOptions): void {
  const { appCachePrefix, offlineWriteDatabaseName } = validateRecoveryWorkerConfig(config);

  scope.addEventListener("install", (event) => {
    // Recovery never waits for a reload: the broken worker must stop controlling pages as soon as possible.
    event.waitUntil(scope.skipWaiting());
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(recover(scope, appCachePrefix, offlineWriteDatabaseName));
  });
}

/**
 * Deletes this app's caches, this app's workbox-expiration records (best effort — see below), and the
 * identity-derived queue database, cancels this registration's push subscription (if any), then claims the open
 * clients so they stop being controlled by the broken worker. Cancelling the subscription never blocks deletion or
 * takeover: it runs after deletion and before claim, and its own failure is swallowed.
 *
 * One failed deletion never stops the others (review #15): the activate event runs once, so whatever is skipped here
 * would stay behind until the next deployment. After every deletion was attempted, any failure rejects before the
 * push step and the claim, so recovery still fails closed.
 */
async function recover(scope: ServiceWorkerGlobalScope, appCachePrefix: string, offlineWriteDatabaseName: string): Promise<void> {
  const failures: unknown[] = [];
  const record = (error: unknown): void => {
    failures.push(error);
  };
  for (const name of await scope.caches.keys()) {
    if (name.startsWith(appCachePrefix)) await scope.caches.delete(name).catch(record);
  }
  await deleteExpirationRecordsBestEffort(appCachePrefix);
  await deleteOfflineWriteDatabase(offlineWriteDatabaseName).catch(record);
  if (failures.length > 0) throw failures[0];
  await cancelPushSubscription(scope);
  await scope.clients.claim();
}

/**
 * Best-effort, like the push-subscription cancellation below: a failure here must never block deleting the
 * identity-derived offline-write database or claiming clients, so it is swallowed rather than propagated.
 */
async function deleteExpirationRecordsBestEffort(appCachePrefix: string): Promise<void> {
  try {
    await deleteExpirationRecords((name) => name.startsWith(appCachePrefix));
  } catch {
    // Swallowed: see the doc comment above.
  }
}

/**
 * Rejects on failure so recovery does not take control while sensitive queue data remains. `onblocked` alone is not
 * a failure (ADR-0012 addendum, R14 residue): it only means another connection to this database has not closed yet
 * — the delete request stays pending in the browser and usually still succeeds once that connection closes. So a
 * `blocked` event keeps this waiting for the eventual `onsuccess`/`onerror`, bounded by `BLOCKED_WAIT_MS`; only a
 * timeout after `blocked`, or an outright `onerror`, is treated as a failure.
 */
function deleteOfflineWriteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    let timer: ReturnType<typeof setTimeout> | undefined;
    request.onsuccess = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    request.onerror = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      reject(request.error ?? new Error("offline-write database deletion failed"));
    };
    request.onblocked = (): void => {
      timer = setTimeout(() => reject(new Error("offline-write database deletion blocked")), BLOCKED_WAIT_MS);
    };
  });
}

/** Best-effort: environments without a `pushManager` are skipped, and any rejection here is swallowed (ADR-0021). */
async function cancelPushSubscription(scope: ServiceWorkerGlobalScope): Promise<void> {
  if (!("pushManager" in scope.registration)) return;
  try {
    const subscription = await scope.registration.pushManager.getSubscription();
    if (subscription !== null) await subscription.unsubscribe();
  } catch {
    // Swallowed: cancelling the subscription must never block cache deletion or client takeover.
  }
}
