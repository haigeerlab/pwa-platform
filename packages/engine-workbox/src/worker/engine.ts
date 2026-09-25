import { PrecacheController } from "workbox-precaching";
import { resolveManifestUrl, validatePrecacheEngineOptions, type PwaPrecacheEngineOptions } from "./options.js";

export type PwaPrecacheInstallResult = {
  /** Absolute URLs, without `__WB_REVISION__`, of the manifest entries downloaded into the precache during this install. */
  readonly updatedUrls: readonly string[];
  /** Absolute URLs, without `__WB_REVISION__`, of the manifest entries that were already cached with the same revision. */
  readonly notUpdatedUrls: readonly string[];
};

export type PwaPrecacheActivateResult = {
  /**
   * Cache keys removed from the precache because they are no longer in the manifest: absolute request URLs, including
   * the `__WB_REVISION__` query of revisioned entries.
   */
  readonly deletedUrls: readonly string[];
};

/** Precache port used by the platform worker (sw-runtime); it only acts when one of its methods is called. */
export type PwaPrecacheEngine = {
  /** Call from the install event; downloads new or changed manifest entries and fails if any request fails. */
  install(event: ExtendableEvent): Promise<PwaPrecacheInstallResult>;
  /** Call from the activate event; removes entries of this precache that are no longer in the manifest. */
  activate(event: ExtendableEvent): Promise<PwaPrecacheActivateResult>;
  /** Reads a manifest URL from this precache only; returns `undefined` otherwise, including for unparsable URLs, and never uses the network. */
  match(url: string): Promise<Response | undefined>;
  /** Manifest URLs in manifest order, exactly as given in `entries` (paths, not absolute URLs). */
  urls(): readonly string[];
};

/**
 * Creates the precache port for one plan. It registers no event listeners, never calls `skipWaiting` or
 * `clients.claim`, and touches no cache other than `cacheName`.
 */
export function createPrecacheEngine(options: PwaPrecacheEngineOptions): PwaPrecacheEngine {
  const { cacheName, entries } = validatePrecacheEngineOptions(options);
  const controller = new PrecacheController({ cacheName, fallbackToNetwork: false });
  controller.addToCacheList(entries.map(({ url, revision }) => ({ url, revision })));

  const urls = entries.map(({ url }) => url);

  return {
    async install(event) {
      const { updatedURLs, notUpdatedURLs } = await controller.install(event);
      return { updatedUrls: [...updatedURLs], notUpdatedUrls: [...notUpdatedURLs] };
    },
    async activate(event) {
      // Workbox 7.4.1 declares the result as `{ deletedCacheRequests }` but returns `{ deletedURLs }`, so read the
      // field it actually returns and fail loudly if a Workbox update changes it again.
      const { deletedURLs } = (await controller.activate(event)) as unknown as { readonly deletedURLs?: unknown };
      if (!Array.isArray(deletedURLs) || !deletedURLs.every((url) => typeof url === "string")) {
        throw new Error("Workbox did not report the deleted precache requests");
      }
      return { deletedUrls: [...deletedURLs] };
    },
    async match(url) {
      if (!URL.canParse(url, self.location.href)) return undefined;
      // Workbox keys its URL-to-cache-key map by the exact absolute URL of each manifest entry, so any other URL
      // (another query, a missing index.html, another origin) has no cache key and is never looked up.
      const cacheKey = controller.getCacheKeyForURL(resolveManifestUrl(url, self.location.href));
      if (cacheKey === undefined) return undefined;
      // CacheStorage.match with cacheName reads that cache only and, unlike caches.open, never creates it.
      return (await self.caches.match(cacheKey, { cacheName })) ?? undefined;
    },
    urls() {
      return [...urls];
    },
  };
}
