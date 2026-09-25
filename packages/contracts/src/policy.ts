import type { PwaExtensions } from "./json.js";

export const RESOURCE_CLASSES = [
  "asset",
  "navigation-public-static",
  "navigation-public-dynamic",
  "public-data",
  "session-data",
  "mutation",
  "stream",
  "unclassified",
] as const;

export type PwaResourceClass = (typeof RESOURCE_CLASSES)[number];

export const CACHE_STRATEGIES = [
  "none",
  "cache-first",
  "network-first",
  "stale-while-revalidate",
] as const;

export type PwaCacheStrategy = (typeof CACHE_STRATEGIES)[number];

export const UPDATE_MODES = ["prompt"] as const;

export type PwaUpdateMode = (typeof UPDATE_MODES)[number];

/**
 * Path prefix relative to `PwaIdentity.mountPath`. Matched on whole path segments,
 * ignoring query and fragment; no glob, regular expression or callback forms exist.
 */
export type MountRelativePath = `/${string}`;

export type PwaResourceRule = {
  readonly pathPrefix: MountRelativePath;
  readonly resourceClass: PwaResourceClass;
  readonly cache: PwaCacheStrategy;
};

export type PwaOfflineFallback =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly path: MountRelativePath };

/** A reviewed mutation target that may later be explicitly persisted for offline delivery. */
export type PwaOfflineWriteTarget = {
  readonly id: string;
  readonly pathPrefix: MountRelativePath;
  readonly maxBodyBytes: number;
};

/** Queue limits and reviewed targets for the offline-write extension. */
export type PwaOfflineWritePolicy = {
  readonly enabled: boolean;
  readonly maxEntries: number;
  readonly maxTotalBodyBytes: number;
  readonly targets: readonly PwaOfflineWriteTarget[];
};

export type PwaPolicyV1 = {
  readonly schemaVersion: 1;
  readonly install: { readonly enabled: boolean };
  readonly offlineFallback: PwaOfflineFallback;
  readonly updateMode: PwaUpdateMode;
  readonly resources: readonly PwaResourceRule[];
  readonly extensions?: PwaExtensions;
  /** Integer seconds (1-30). Applies to navigation and network-first runtime cache. Absent: no timeout. */
  readonly networkTimeoutSeconds?: number;
};

export type PwaPolicyV2 = {
  readonly schemaVersion: 2;
  readonly install: { readonly enabled: boolean };
  readonly offlineFallback: PwaOfflineFallback;
  readonly updateMode: PwaUpdateMode;
  readonly resources: readonly PwaResourceRule[];
  readonly extensions?: PwaExtensions;
  readonly offlineWrites: PwaOfflineWritePolicy;
  /** Integer seconds (1-30). Applies to navigation and network-first runtime cache. Absent: no timeout. */
  readonly networkTimeoutSeconds?: number;
};

/** Limits for the platform's explicit opt-in runtime cache (public-read data and dynamic HTML). */
export type PwaRuntimeCachePolicy = {
  readonly enabled: boolean;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxAgeSeconds: number;
};

export type PwaPolicyV3 = {
  readonly schemaVersion: 3;
  readonly install: { readonly enabled: boolean };
  readonly offlineFallback: PwaOfflineFallback;
  readonly updateMode: PwaUpdateMode;
  readonly resources: readonly PwaResourceRule[];
  readonly extensions?: PwaExtensions;
  readonly offlineWrites: PwaOfflineWritePolicy;
  readonly runtimeCache: PwaRuntimeCachePolicy;
  /** Integer seconds (1-30). Applies to navigation and network-first runtime cache. Absent: no timeout. */
  readonly networkTimeoutSeconds?: number;
};

export type PwaPolicy = PwaPolicyV1 | PwaPolicyV2 | PwaPolicyV3;
