import type { PwaIdentity } from "./identity.js";

export const CACHE_KINDS = ["precache", "runtime-pages", "runtime-data"] as const;

export type PwaCacheKind = (typeof CACHE_KINDS)[number];

// Hand-written and dependency-free: recovery and service workers call these in the browser.
// Segments are encoded with `encodeURIComponent`, which always escapes the `:` separator, so no
// app's prefix can be a prefix of another app's. It throws `URIError` for lone UTF-16 surrogates,
// which `validateIdentity` rejects.

/** `pwa:<appId>:<environment>:` — every cache the app owns in one environment, across identity revisions. */
export function appCachePrefix(identity: Pick<PwaIdentity, "appId" | "environment">): string {
  return `pwa:${encodeURIComponent(identity.appId)}:${encodeURIComponent(identity.environment)}:`;
}

/** `pwa:<appId>:<environment>:<identity-revision>:` — recorded as `PwaPlan.cacheNamespace.prefix`. */
export function cacheNamespacePrefix(
  identity: Pick<PwaIdentity, "appId" | "environment" | "cacheNamespaceSeed">,
): string {
  return `${appCachePrefix(identity)}${encodeURIComponent(identity.cacheNamespaceSeed)}:`;
}

export function cacheName(
  identity: Pick<PwaIdentity, "appId" | "environment" | "cacheNamespaceSeed">,
  kind: PwaCacheKind,
): string {
  return `${cacheNamespacePrefix(identity)}${kind}`;
}

/** `<runtime-data cache name>-<configDigest>` — one cache per compiled runtime-cache configuration. */
export function runtimeDataCacheName(
  identity: Pick<PwaIdentity, "appId" | "environment" | "cacheNamespaceSeed">,
  configDigest: string,
): string {
  return `${cacheName(identity, "runtime-data")}-${configDigest}`;
}
