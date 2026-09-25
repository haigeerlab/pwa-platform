// Runtime-cache cleanup, shared by the platform worker's activation listener and its logout handshake (spec
// "缓存命名与清理", "登出"). Both call sites only ever touch caches named from `runtimeCache.pagesCacheName` and
// `runtimeCache.dataCacheNamePrefix`, which are already scoped under this app's `cacheNamespacePrefix` — so nothing
// here can reach the precache, another app's caches, another environment's, or a non-platform cache. ADR-0035 ("过期
// 记录与缓存一起清理") extends this to the workbox-expiration records those caches leave behind in IndexedDB.
import type { PwaWorkerRuntimeCache } from "../shared/config.js";
import { deleteExpirationRecords } from "../shared/expiration-records.js";

/**
 * Deletes the pages runtime cache outright, and every data runtime cache except `keep` (when given), then deletes
 * the workbox-expiration record of every cache name that same rule matches — computed from `runtimeCache` and
 * `keep`, not from `caches.keys()`, so a record whose cache was already gone (e.g. from a previous run that failed
 * after the cache delete) is still reached. Activation passes the current digest's data cache as `keep` so only
 * stale configurations are purged; logout passes nothing, so every data cache — current digest included — is
 * removed. A record-deletion failure rejects, same as a cache-deletion failure, so callers that gate on this (the
 * logout handshake) see it.
 */
export async function deleteRuntimeCaches(scope: ServiceWorkerGlobalScope, runtimeCache: PwaWorkerRuntimeCache, keep?: string): Promise<void> {
  await scope.caches.delete(runtimeCache.pagesCacheName);
  for (const name of await scope.caches.keys()) {
    if (name.startsWith(runtimeCache.dataCacheNamePrefix) && name !== keep) await scope.caches.delete(name);
  }
  await deleteExpirationRecords(
    (name) => name === runtimeCache.pagesCacheName || (name.startsWith(runtimeCache.dataCacheNamePrefix) && name !== keep),
  );
}

/** The one data cache activation must keep: the current digest's, only when the runtime cache is enabled. */
export function currentDataCacheName(runtimeCache: PwaWorkerRuntimeCache): string | undefined {
  return runtimeCache.enabled ? runtimeCache.dataCacheName : undefined;
}
