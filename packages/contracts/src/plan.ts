import type { PwaWarningDiagnostic } from "./diagnostics.js";
import type { AbsolutePath, PwaIdentity, PwaInstallMetadata } from "./identity.js";
import type {
  PwaCacheStrategy,
  PwaResourceClass,
  PwaUpdateMode,
} from "./policy.js";

export const TOPOLOGY_KINDS = ["standalone-origin", "shared-origin"] as const;

export type PwaTopologyKind = (typeof TOPOLOGY_KINDS)[number];

export type PwaRegistryEntry = {
  readonly appId: string;
  readonly scope: AbsolutePath;
  readonly serviceWorkerUrl: AbsolutePath;
  readonly manifestId: string;
  readonly manifestUrl: AbsolutePath;
};

/** Describes every application on one origin and environment (ADR-0019). */
export type PwaOriginRegistry = {
  readonly schemaVersion: 1;
  /** Monotonically increasing; incremented whenever an entry is added, removed or changed. */
  readonly registryVersion: number;
  readonly origin: string;
  readonly environment: string;
  readonly root: PwaRegistryEntry;
  /** At least one; pairwise non-overlapping and not nested within each other. */
  readonly children: readonly PwaRegistryEntry[];
};

export type PwaTopology =
  | { readonly kind: "standalone-origin" }
  | { readonly kind: "shared-origin"; readonly registry: PwaOriginRegistry };

export type PwaHostBuildOutput = {
  readonly publicPath: AbsolutePath;
};

export type PwaArtifacts = {
  /** POSIX path relative to the host build output directory. */
  readonly serviceWorkerFile: string;
  /** POSIX path relative to the host build output directory. */
  readonly manifestFile: string;
};

export type PwaPrecacheEntry = {
  readonly url: AbsolutePath;
  readonly revision: string | null;
};

export type PwaCacheNamespace = {
  /** Full prefix derived from the identity by `cacheNamespacePrefix` (ADR-0008). */
  readonly prefix: string;
};

/** Canonical order; a valid plan lists every entry exactly once in this order. */
export const REQUEST_BASELINE_DENIALS = [
  "non-get",
  "cross-origin",
  "no-store",
  "opaque-response",
  "redirect",
  "websocket",
  "unclassified",
] as const;

export type PwaRequestBaselineDenial = (typeof REQUEST_BASELINE_DENIALS)[number];

export type PwaPathRuleAction = "exclude" | "deny" | PwaCacheStrategy;

export type PwaPathRule = {
  /** Absolute path prefix, already resolved against `mountPath` by the compiler. */
  readonly pathPrefix: AbsolutePath;
  readonly resourceClass: PwaResourceClass;
  readonly action: PwaPathRuleAction;
  readonly source: "platform" | "policy";
};

export type PwaPlanOfflineFallback =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly path: AbsolutePath };

/** Runtime-safe queue configuration compiled from a reviewed offline-write policy. */
export type PwaOfflineWritePlan =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly databaseName: string;
      readonly maxEntries: number;
      readonly maxTotalBodyBytes: number;
      readonly targets: readonly {
        readonly id: string;
        readonly pathPrefix: AbsolutePath;
        readonly maxBodyBytes: number;
      }[];
    };

/** Runtime cache limits and cache-busting digest, compiled from a reviewed v3 runtime-cache policy. */
export type PwaRuntimeCachePlan =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly maxEntries: number;
      readonly maxEntryBytes: number;
      readonly maxAgeSeconds: number;
      readonly configDigest: string;
    };

type PwaPlanFields = {
  readonly identity: PwaIdentity;
  readonly install: PwaInstallMetadata | null;
  readonly hostBuildOutput: PwaHostBuildOutput;
  readonly topology: PwaTopology;
  readonly artifacts: PwaArtifacts;
  readonly precache: readonly PwaPrecacheEntry[];
  readonly cacheNamespace: PwaCacheNamespace;
  readonly requestBaselineDenials: readonly PwaRequestBaselineDenial[];
  readonly pathRules: readonly PwaPathRule[];
  readonly offlineFallback: PwaPlanOfflineFallback;
  readonly updateMode: PwaUpdateMode;
  /** A valid plan carries warnings only; a compilation with errors does not produce a plan. */
  readonly diagnostics: readonly PwaWarningDiagnostic[];
  /** Same value as the policy; absent (not `undefined`) when the policy did not set it. */
  readonly networkTimeoutSeconds?: number;
};

type Expand<T> = { readonly [Key in keyof T]: T[Key] };

/** Compiled v1 plan. Closed shape: exactly these 15 required fields plus the optional `networkTimeoutSeconds`, no extensions. */
export type PwaPlanV1 = Expand<PwaPlanFields & {
  readonly schemaVersion: 1;
  readonly planVersion: 1;
  readonly policyVersion: 1;
}>;

/** Compiled v2 plan. Its offline-write configuration is fully resolved before reaching a worker. */
export type PwaPlanV2 = Expand<PwaPlanFields & {
  readonly schemaVersion: 2;
  readonly planVersion: 2;
  readonly policyVersion: 2;
  readonly offlineWrites: PwaOfflineWritePlan;
}>;

/** Compiled v3 plan. Its runtime-cache configuration is fully resolved before reaching a worker. */
export type PwaPlanV3 = Expand<PwaPlanFields & {
  readonly schemaVersion: 3;
  readonly planVersion: 3;
  readonly policyVersion: 3;
  readonly offlineWrites: PwaOfflineWritePlan;
  readonly runtimeCache: PwaRuntimeCachePlan;
}>;

export type PwaPlan = PwaPlanV1 | PwaPlanV2 | PwaPlanV3;
