// Worker config shapes and their validation, shared by the build-time entry and both workers. It imports nothing,
// so the same rules run before injection and again when a worker starts.

/** contracts' `REQUEST_BASELINE_DENIALS`, in the same canonical order (a unit test keeps them equal). */
export const WORKER_BASELINE_DENIALS = [
  "non-get",
  "cross-origin",
  "no-store",
  "opaque-response",
  "redirect",
  "websocket",
  "unclassified",
] as const;

/**
 * `"exclude"` and `"deny"` followed by contracts' `CACHE_STRATEGIES` (a unit test keeps them equal). `"exclude"` only
 * appears in a shared-origin root app's plan, once per child scope (ADR-0019).
 */
export const WORKER_PATH_RULE_ACTIONS = ["exclude", "deny", "none", "cache-first", "network-first", "stale-while-revalidate"] as const;

export type PwaWorkerBaselineDenial = (typeof WORKER_BASELINE_DENIALS)[number];
export type PwaWorkerPathRuleAction = (typeof WORKER_PATH_RULE_ACTIONS)[number];
export type PwaWorkerPath = `/${string}`;

export type PwaWorkerPathRule = {
  /** Canonical absolute path prefix, in the plan's spelling. */
  readonly pathPrefix: PwaWorkerPath;
  readonly action: PwaWorkerPathRuleAction;
};

export type PwaWorkerOfflineWriteTarget = {
  readonly id: string;
  readonly pathPrefix: PwaWorkerPath;
  readonly maxBodyBytes: number;
};

export type PwaWorkerOfflineWrites =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly databaseName: string;
      readonly maxEntries: number;
      readonly maxTotalBodyBytes: number;
      readonly targets: readonly PwaWorkerOfflineWriteTarget[];
    };

export type PwaWorkerRuntimeResourceClass = "public-data" | "navigation-public-dynamic";
export type PwaWorkerRuntimeStrategy = "network-first" | "stale-while-revalidate";

export type PwaWorkerRuntimeCacheRule = {
  readonly pathPrefix: PwaWorkerPath;
  readonly resourceClass: PwaWorkerRuntimeResourceClass;
  readonly strategy: PwaWorkerRuntimeStrategy;
};

/**
 * `pagesCacheName` and `dataCacheNamePrefix` are always present, even when disabled: T8's activation cleanup needs
 * them to remove any runtime caches a previously enabled config left behind.
 */
export type PwaWorkerRuntimeCache =
  | { readonly enabled: false; readonly pagesCacheName: string; readonly dataCacheNamePrefix: string }
  | {
      readonly enabled: true;
      readonly pagesCacheName: string;
      readonly dataCacheNamePrefix: string;
      readonly dataCacheName: string;
      readonly maxEntries: number;
      readonly maxEntryBytes: number;
      readonly maxAgeSeconds: number;
      readonly rules: readonly PwaWorkerRuntimeCacheRule[];
    };

export type PwaPlatformWorkerConfig = {
  readonly kind: "platform";
  readonly version: 1;
  /** Audit only: the worker derives its origin from `scope.location`, so nothing reads this field at runtime. */
  readonly scope: PwaWorkerPath;
  /** contracts `cacheName(identity, "precache")`. */
  readonly precacheCacheName: string;
  /**
   * Audit only: the request-level denials are enforced by the decision table itself and the response-level ones
   * govern runtime caching, which v1 does not do. Validation still requires this list to equal
   * `WORKER_BASELINE_DENIALS` exactly, so adding a denial in contracts without updating that constant makes an
   * already published worker fail to start — a deliberate fail-closed coupling, kept in step by a unit test.
   */
  readonly requestBaselineDenials: readonly PwaWorkerBaselineDenial[];
  /** In plan order: the first matching rule applies. */
  readonly pathRules: readonly PwaWorkerPathRule[];
  readonly offlineFallback: { readonly enabled: false } | { readonly enabled: true; readonly path: PwaWorkerPath };
  readonly updateMode: "prompt";
  /** Closed configuration for explicit offline writes; `false` for every v1 plan. */
  readonly offlineWrites: PwaWorkerOfflineWrites;
  /** Closed configuration for the public-read runtime cache; `enabled: false` for every v1/v2 plan. */
  readonly runtimeCache: PwaWorkerRuntimeCache;
  /**
   * 1-30 integer seconds. Present only when the plan set it; omitted entirely (not `undefined`) otherwise, so a
   * worker config built without it is byte-identical to one from before this field existed. Governs both the
   * navigation fallback timeout and the runtime cache's network-first `networkTimeoutSeconds`.
   */
  readonly networkTimeoutSeconds?: number;
};

export type PwaRecoveryWorkerConfig = {
  readonly kind: "recovery";
  readonly version: 1;
  /** contracts `appCachePrefix(identity)`: every cache of this app in this environment, across identity revisions. */
  readonly appCachePrefix: string;
  /** The only IndexedDB database recovery may delete: derived from this exact app identity. */
  readonly offlineWriteDatabaseName: string;
};

export type PwaWorkerConfig = PwaPlatformWorkerConfig | PwaRecoveryWorkerConfig;

// contracts escapes every segment with encodeURIComponent, so a segment never contains ":". Matching the whole
// structure keeps a truncated prefix such as "pwa:" from ever selecting other apps' caches.
const PRECACHE_CACHE_NAME = /^pwa:[^:]+:[^:]+:[^:]+:precache$/;
const APP_CACHE_PREFIX = /^pwa:[^:]+:[^:]+:$/;
const OFFLINE_WRITE_DATABASE_NAME = /^pwa-offline-write:[^:]+:[^:]+:[^:]+$/;
const OFFLINE_WRITE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const RUNTIME_PAGES_CACHE_NAME = /^pwa:[^:]+:[^:]+:[^:]+:runtime-pages$/;
const RUNTIME_DATA_CACHE_NAME_PREFIX = /^pwa:[^:]+:[^:]+:[^:]+:runtime-data-$/;
const RUNTIME_DATA_CACHE_NAME = /^pwa:[^:]+:[^:]+:[^:]+:runtime-data-[0-9a-f]{16}$/;
const RUNTIME_RESOURCE_CLASSES = ["public-data", "navigation-public-dynamic"] as const;
const RUNTIME_STRATEGIES = ["network-first", "stale-while-revalidate"] as const;
// Only used to check the form of paths; never requested.
const PATH_BASE = "https://sw-runtime.invalid";

const PLATFORM_KEYS = [
  "kind",
  "version",
  "scope",
  "precacheCacheName",
  "requestBaselineDenials",
  "pathRules",
  "offlineFallback",
  "updateMode",
  "offlineWrites",
  "runtimeCache",
] as const;
const RECOVERY_KEYS = ["kind", "version", "appCachePrefix", "offlineWriteDatabaseName"] as const;

/** Validates a platform worker config and returns a fresh copy with keys in canonical order. Messages name fields only. */
export function validatePlatformWorkerConfig(value: unknown): PwaPlatformWorkerConfig {
  const config = plainObject(value, "config");
  const hasNetworkTimeout = Object.hasOwn(config, "networkTimeoutSeconds");
  exactKeys(config, hasNetworkTimeout ? [...PLATFORM_KEYS, "networkTimeoutSeconds"] : PLATFORM_KEYS, "config");
  if (config["kind"] !== "platform") fail('config.kind must be "platform"');
  if (config["version"] !== 1) fail("config.version must be 1");

  const scope = canonicalPath(config["scope"], "config.scope");
  if (!scope.endsWith("/")) fail('config.scope must end with "/"');

  const precacheCacheName = config["precacheCacheName"];
  if (typeof precacheCacheName !== "string" || !PRECACHE_CACHE_NAME.test(precacheCacheName)) {
    fail('config.precacheCacheName must have the form "pwa:<app>:<environment>:<seed>:precache"');
  }

  const denials = config["requestBaselineDenials"];
  const completeDenials =
    Array.isArray(denials) &&
    denials.length === WORKER_BASELINE_DENIALS.length &&
    WORKER_BASELINE_DENIALS.every((denial, index) => denials[index] === denial);
  if (!completeDenials) fail("config.requestBaselineDenials must list every baseline denial once, in canonical order");

  const rules = config["pathRules"];
  if (!Array.isArray(rules)) fail("config.pathRules must be an array");
  const pathRules = rules.map((entry: unknown, index: number): PwaWorkerPathRule => {
    const label = `config.pathRules[${index}]`;
    const rule = plainObject(entry, label);
    exactKeys(rule, ["pathPrefix", "action"], label);
    const pathPrefix = canonicalPath(rule["pathPrefix"], `${label}.pathPrefix`);
    const action = rule["action"];
    if (!WORKER_PATH_RULE_ACTIONS.some((known) => known === action)) fail(`${label}.action must be "exclude", "deny" or a cache strategy`);
    return { pathPrefix, action: action as PwaWorkerPathRuleAction };
  });

  const fallback = plainObject(config["offlineFallback"], "config.offlineFallback");
  let offlineFallback: PwaPlatformWorkerConfig["offlineFallback"];
  if (fallback["enabled"] === false) {
    exactKeys(fallback, ["enabled"], "config.offlineFallback");
    offlineFallback = { enabled: false };
  } else if (fallback["enabled"] === true) {
    exactKeys(fallback, ["enabled", "path"], "config.offlineFallback");
    offlineFallback = { enabled: true, path: canonicalPath(fallback["path"], "config.offlineFallback.path") };
  } else {
    fail("config.offlineFallback.enabled must be true or false");
  }

  if (config["updateMode"] !== "prompt") fail('config.updateMode must be "prompt"');

  const offlineWrites = offlineWriteConfig(config["offlineWrites"], scope);
  const runtimeCache = runtimeCacheConfig(config["runtimeCache"]);
  const networkTimeoutSeconds = hasNetworkTimeout
    ? boundedInteger(config["networkTimeoutSeconds"], 1, 30, "config.networkTimeoutSeconds")
    : undefined;

  return {
    kind: "platform",
    version: 1,
    scope,
    precacheCacheName: precacheCacheName as string,
    requestBaselineDenials: [...WORKER_BASELINE_DENIALS],
    pathRules,
    offlineFallback,
    updateMode: "prompt",
    offlineWrites,
    runtimeCache,
    ...(networkTimeoutSeconds === undefined ? {} : { networkTimeoutSeconds }),
  };
}

/** Validates a recovery worker config and returns a fresh copy with keys in canonical order. Messages name fields only. */
export function validateRecoveryWorkerConfig(value: unknown): PwaRecoveryWorkerConfig {
  const config = plainObject(value, "config");
  exactKeys(config, RECOVERY_KEYS, "config");
  if (config["kind"] !== "recovery") fail('config.kind must be "recovery"');
  if (config["version"] !== 1) fail("config.version must be 1");
  const appCachePrefix = config["appCachePrefix"];
  if (typeof appCachePrefix !== "string" || !APP_CACHE_PREFIX.test(appCachePrefix)) {
    fail('config.appCachePrefix must have the form "pwa:<app>:<environment>:"');
  }
  const offlineWriteDatabaseName = config["offlineWriteDatabaseName"];
  if (typeof offlineWriteDatabaseName !== "string" || !OFFLINE_WRITE_DATABASE_NAME.test(offlineWriteDatabaseName)) {
    fail('config.offlineWriteDatabaseName must have the form "pwa-offline-write:<app>:<environment>:<seed>"');
  }
  return { kind: "recovery", version: 1, appCachePrefix: appCachePrefix as string, offlineWriteDatabaseName };
}

/** Validates either config, selected by its `kind`. */
export function validateWorkerConfig(value: unknown): PwaWorkerConfig {
  const kind = plainObject(value, "config")["kind"];
  if (kind === "platform") return validatePlatformWorkerConfig(value);
  if (kind === "recovery") return validateRecoveryWorkerConfig(value);
  return fail('config.kind must be "platform" or "recovery"');
}

function fail(detail: string): never {
  throw new Error(`Invalid sw-runtime worker config: ${detail}`);
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  const prototype: unknown = typeof value === "object" && value !== null ? Object.getPrototypeOf(value) : undefined;
  if (Array.isArray(value) || (prototype !== Object.prototype && prototype !== null)) fail(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Reflect.ownKeys(record);
  if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) {
    fail(`${label} must have exactly the fields ${keys.join(", ")}`);
  }
}

function offlineWriteConfig(value: unknown, scope: PwaWorkerPath): PwaWorkerOfflineWrites {
  const config = plainObject(value, "config.offlineWrites");
  if (config["enabled"] === false) {
    exactKeys(config, ["enabled"], "config.offlineWrites");
    return { enabled: false };
  }
  if (config["enabled"] !== true) fail("config.offlineWrites.enabled must be true or false");
  exactKeys(config, ["enabled", "databaseName", "maxEntries", "maxTotalBodyBytes", "targets"], "config.offlineWrites");

  const databaseName = config["databaseName"];
  if (typeof databaseName !== "string" || !OFFLINE_WRITE_DATABASE_NAME.test(databaseName)) {
    fail('config.offlineWrites.databaseName must have the form "pwa-offline-write:<app>:<environment>:<seed>"');
  }
  const maxEntries = boundedPositiveInteger(config["maxEntries"], 50, "config.offlineWrites.maxEntries");
  const maxTotalBodyBytes = boundedPositiveInteger(config["maxTotalBodyBytes"], 524_288, "config.offlineWrites.maxTotalBodyBytes");
  const rawTargets = config["targets"];
  if (!Array.isArray(rawTargets) || rawTargets.length === 0) fail("config.offlineWrites.targets must be a non-empty array");

  const targetIds = new Set<string>();
  const targetPaths = new Set<string>();
  const targets = rawTargets.map((entry, index): PwaWorkerOfflineWriteTarget => {
    const label = `config.offlineWrites.targets[${index}]`;
    const target = plainObject(entry, label);
    exactKeys(target, ["id", "pathPrefix", "maxBodyBytes"], label);
    const id = target["id"];
    if (typeof id !== "string" || !OFFLINE_WRITE_ID.test(id)) fail(`${label}.id must be an ASCII slug`);
    const pathPrefix = canonicalPath(target["pathPrefix"], `${label}.pathPrefix`);
    if (!isWithinScope(pathPrefix, scope)) fail(`${label}.pathPrefix must be inside config.scope`);
    const maxBodyBytes = boundedPositiveInteger(target["maxBodyBytes"], 16_384, `${label}.maxBodyBytes`);
    if (targetIds.has(id)) fail(`${label}.id must be unique`);
    const pathKey = decodedPathKey(pathPrefix, `${label}.pathPrefix`);
    if (targetPaths.has(pathKey)) fail(`${label}.pathPrefix must be unique after URL decoding`);
    targetIds.add(id);
    targetPaths.add(pathKey);
    return { id, pathPrefix, maxBodyBytes };
  });
  return { enabled: true, databaseName, maxEntries, maxTotalBodyBytes, targets };
}

function runtimeCacheConfig(value: unknown): PwaWorkerRuntimeCache {
  const config = plainObject(value, "config.runtimeCache");
  if (config["enabled"] === false) {
    exactKeys(config, ["enabled", "pagesCacheName", "dataCacheNamePrefix"], "config.runtimeCache");
    return {
      enabled: false,
      pagesCacheName: runtimeCacheNameField(config["pagesCacheName"], RUNTIME_PAGES_CACHE_NAME, "config.runtimeCache.pagesCacheName"),
      dataCacheNamePrefix: runtimeCacheNameField(
        config["dataCacheNamePrefix"],
        RUNTIME_DATA_CACHE_NAME_PREFIX,
        "config.runtimeCache.dataCacheNamePrefix",
      ),
    };
  }
  if (config["enabled"] !== true) fail("config.runtimeCache.enabled must be true or false");
  exactKeys(
    config,
    ["enabled", "pagesCacheName", "dataCacheNamePrefix", "dataCacheName", "maxEntries", "maxEntryBytes", "maxAgeSeconds", "rules"],
    "config.runtimeCache",
  );

  const pagesCacheName = runtimeCacheNameField(config["pagesCacheName"], RUNTIME_PAGES_CACHE_NAME, "config.runtimeCache.pagesCacheName");
  const dataCacheNamePrefix = runtimeCacheNameField(
    config["dataCacheNamePrefix"],
    RUNTIME_DATA_CACHE_NAME_PREFIX,
    "config.runtimeCache.dataCacheNamePrefix",
  );
  const dataCacheName = config["dataCacheName"];
  if (typeof dataCacheName !== "string" || !RUNTIME_DATA_CACHE_NAME.test(dataCacheName) || !dataCacheName.startsWith(dataCacheNamePrefix)) {
    fail('config.runtimeCache.dataCacheName must have the form "pwa:<app>:<environment>:<seed>:runtime-data-<digest>"');
  }
  const maxEntries = boundedInteger(config["maxEntries"], 1, 200, "config.runtimeCache.maxEntries");
  const maxEntryBytes = boundedInteger(config["maxEntryBytes"], 1, 1_048_576, "config.runtimeCache.maxEntryBytes");
  const maxAgeSeconds = boundedInteger(config["maxAgeSeconds"], 60, 604_800, "config.runtimeCache.maxAgeSeconds");

  const rawRules = config["rules"];
  if (!Array.isArray(rawRules)) fail("config.runtimeCache.rules must be an array");
  const rules = rawRules.map((entry: unknown, index: number): PwaWorkerRuntimeCacheRule => {
    const label = `config.runtimeCache.rules[${index}]`;
    const rule = plainObject(entry, label);
    exactKeys(rule, ["pathPrefix", "resourceClass", "strategy"], label);
    const pathPrefix = canonicalPath(rule["pathPrefix"], `${label}.pathPrefix`);
    const resourceClass = rule["resourceClass"];
    if (!RUNTIME_RESOURCE_CLASSES.some((known) => known === resourceClass)) {
      fail(`${label}.resourceClass must be "public-data" or "navigation-public-dynamic"`);
    }
    const strategy = rule["strategy"];
    if (!RUNTIME_STRATEGIES.some((known) => known === strategy)) {
      fail(`${label}.strategy must be "network-first" or "stale-while-revalidate"`);
    }
    return { pathPrefix, resourceClass: resourceClass as PwaWorkerRuntimeResourceClass, strategy: strategy as PwaWorkerRuntimeStrategy };
  });

  return { enabled: true, pagesCacheName, dataCacheNamePrefix, dataCacheName, maxEntries, maxEntryBytes, maxAgeSeconds, rules };
}

function runtimeCacheNameField(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${label} must have the form "pwa:<app>:<environment>:<seed>:runtime-…"`);
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedPositiveInteger(value: unknown, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) {
    fail(`${label} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function isWithinScope(path: PwaWorkerPath, scope: PwaWorkerPath): boolean {
  return scope === "/" || path === scope.slice(0, -1) || path.startsWith(scope);
}

function decodedPathKey(path: PwaWorkerPath, label: string): string {
  try {
    return path.split("/").map(decodeURIComponent).join("/");
  } catch {
    fail(`${label} must contain valid percent escapes`);
  }
}

/**
 * The rule contracts' `isCanonicalPath` applies to plan paths: an absolute path already in WHATWG URL serialized form,
 * without "//", backslashes, query, fragment or characters the URL parser would change.
 */
function canonicalPath(value: unknown, label: string): PwaWorkerPath {
  const canonical =
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.includes("//") &&
    !value.includes("\\") &&
    URL.canParse(value, PATH_BASE) &&
    new URL(value, PATH_BASE).pathname === value;
  if (!canonical) fail(`${label} must be a canonical absolute path`);
  return value as PwaWorkerPath;
}
