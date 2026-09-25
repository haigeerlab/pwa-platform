import { appCachePrefix, cacheName, runtimeDataCacheName, validatePlan, type PwaPlan } from "@pwa-platform/contracts";
import {
  validatePlatformWorkerConfig,
  validateRecoveryWorkerConfig,
  type PwaPlatformWorkerConfig,
  type PwaRecoveryWorkerConfig,
} from "../shared/config.js";

/**
 * The platform worker's runtime config: only the plan fields the worker reads, with the precache cache name computed
 * by contracts. Throws for an invalid plan (the message lists diagnostic codes and paths only).
 */
export function createPlatformWorkerConfig(plan: PwaPlan): PwaPlatformWorkerConfig {
  const validated = validPlan(plan);
  const { identity, requestBaselineDenials, pathRules, offlineFallback, updateMode } = validated;
  return validatePlatformWorkerConfig({
    kind: "platform",
    version: 1,
    scope: identity.scope,
    precacheCacheName: cacheName(identity, "precache"),
    requestBaselineDenials: [...requestBaselineDenials],
    pathRules: pathRules.map(({ pathPrefix, action }) => ({ pathPrefix, action })),
    offlineFallback: offlineFallback.enabled ? { enabled: true, path: offlineFallback.path } : { enabled: false },
    updateMode,
    offlineWrites: validated.schemaVersion === 1 ? { enabled: false } : validated.offlineWrites,
    runtimeCache: runtimeCacheWorkerConfig(validated),
    ...(validated.networkTimeoutSeconds === undefined ? {} : { networkTimeoutSeconds: validated.networkTimeoutSeconds }),
  });
}

/**
 * The pages and data cache names are always present, even when disabled or on a v1/v2 plan, because T8's activation
 * cleanup needs them to remove caches a previously enabled config left behind.
 */
function runtimeCacheWorkerConfig(plan: PwaPlan): PwaPlatformWorkerConfig["runtimeCache"] {
  const { identity } = plan;
  const pagesCacheName = cacheName(identity, "runtime-pages");
  const dataCacheNamePrefix = `${cacheName(identity, "runtime-data")}-`;
  if (plan.schemaVersion !== 3 || !plan.runtimeCache.enabled) {
    return { enabled: false, pagesCacheName, dataCacheNamePrefix };
  }
  const rules = plan.pathRules
    .filter(
      (rule): rule is typeof rule & { action: "network-first" | "stale-while-revalidate" } =>
        rule.source === "policy" &&
        ((rule.resourceClass === "public-data" && (rule.action === "network-first" || rule.action === "stale-while-revalidate")) ||
          (rule.resourceClass === "navigation-public-dynamic" && rule.action === "network-first")),
    )
    .map(({ pathPrefix, resourceClass, action }) => ({
      pathPrefix,
      resourceClass: resourceClass as "public-data" | "navigation-public-dynamic",
      strategy: action as "network-first" | "stale-while-revalidate",
    }));
  return {
    enabled: true,
    pagesCacheName,
    dataCacheNamePrefix,
    dataCacheName: runtimeDataCacheName(identity, plan.runtimeCache.configDigest),
    maxEntries: plan.runtimeCache.maxEntries,
    maxEntryBytes: plan.runtimeCache.maxEntryBytes,
    maxAgeSeconds: plan.runtimeCache.maxAgeSeconds,
    rules,
  };
}

/** The recovery worker's config: the app's cache prefix computed by contracts. Throws for an invalid plan. */
export function createRecoveryWorkerConfig(plan: PwaPlan): PwaRecoveryWorkerConfig {
  const { identity } = validPlan(plan);
  return validateRecoveryWorkerConfig({
    kind: "recovery",
    version: 1,
    appCachePrefix: appCachePrefix(identity),
    offlineWriteDatabaseName: `pwa-offline-write:${encodeURIComponent(identity.appId)}:${encodeURIComponent(identity.environment)}:${encodeURIComponent(identity.cacheNamespaceSeed)}`,
  });
}

function validPlan(plan: PwaPlan): PwaPlan {
  const result = validatePlan(plan);
  if (!result.ok) {
    const findings = result.diagnostics.map(({ code, path }) => `${code} at ${path === "" ? "(root)" : path}`);
    throw new Error(`Cannot create a worker config from an invalid PwaPlan: ${findings.join(", ")}`);
  }
  return result.value;
}
