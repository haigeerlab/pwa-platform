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
 */
async function recover(scope: ServiceWorkerGlobalScope, appCachePrefix: string, offlineWriteDatabaseName: string): Promise<void> {
  for (const name of await scope.caches.keys()) {
    if (name.startsWith(appCachePrefix)) await scope.caches.delete(name);
  }
  await deleteExpirationRecordsBestEffort(appCachePrefix);
  await deleteOfflineWriteDatabase(offlineWriteDatabaseName);
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

/** Rejects on failure or blocked deletion so recovery does not take control while sensitive queue data remains. */
function deleteOfflineWriteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = (): void => resolve();
    request.onerror = (): void => reject(request.error ?? new Error("offline-write database deletion failed"));
    request.onblocked = (): void => reject(new Error("offline-write database deletion blocked"));
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
