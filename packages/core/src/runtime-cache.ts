import type {
  AbsolutePath,
  PwaCacheStrategy,
  PwaDiagnostic,
  PwaPolicyV3,
  PwaRuntimeCachePlan,
  PwaWarningDiagnostic,
} from "@pwa-platform/contracts";
import { fnv1a64 } from "./internal/digest.js";
import { diagnostic, warningDiagnostic } from "./internal/diagnostics.js";
import { compareCodePoints } from "./internal/order.js";
import { resolvePrefix } from "./rules.js";

/** The only two resource classes a v3 policy may run a runtime-cache strategy against. */
type ExecutableResourceClass = "public-data" | "navigation-public-dynamic";

/** Per the spec's compilation table: outcome of enabling runtime cache for a class/strategy pair. */
type RuntimeStrategyOutcome = "passthrough" | "executable" | "error";

const RUNTIME_STRATEGY_TABLE: Record<ExecutableResourceClass, Partial<Record<PwaCacheStrategy, RuntimeStrategyOutcome>>> = {
  "public-data": {
    "network-first": "executable",
    "stale-while-revalidate": "executable",
    "cache-first": "error",
  },
  "navigation-public-dynamic": {
    "network-first": "executable",
    "stale-while-revalidate": "error",
    "cache-first": "error",
  },
};

type ExecutableRule = {
  readonly pathPrefix: AbsolutePath;
  readonly resourceClass: ExecutableResourceClass;
  readonly strategy: PwaCacheStrategy;
};

export type CompiledRuntimeCache = {
  readonly runtimeCache: PwaRuntimeCachePlan;
  readonly errors: PwaDiagnostic[];
  readonly warnings: PwaWarningDiagnostic[];
};

function isExecutableClass(resourceClass: string): resourceClass is ExecutableResourceClass {
  return resourceClass === "public-data" || resourceClass === "navigation-public-dynamic";
}

/**
 * Compiles a v3 policy's `runtimeCache` opt-in against its resource rules, per the spec's
 * compilation table. `enabled=false` always passes every rule through unchanged and never
 * produces a diagnostic. `enabled=true` marks `public-data`/`navigation-public-dynamic` rules
 * executable, unsupported, or leaves them (and every other class) untouched.
 */
export function compileRuntimeCache(policy: PwaPolicyV3, mountPath: AbsolutePath): CompiledRuntimeCache {
  if (!policy.runtimeCache.enabled) {
    return { runtimeCache: { enabled: false }, errors: [], warnings: [] };
  }

  const errors: PwaDiagnostic[] = [];
  const executableRules: ExecutableRule[] = [];

  policy.resources.forEach((resource, index) => {
    if (!isExecutableClass(resource.resourceClass) || resource.cache === "none") return;
    const outcome = RUNTIME_STRATEGY_TABLE[resource.resourceClass][resource.cache] ?? "passthrough";
    if (outcome === "error") {
      errors.push(diagnostic("compile.runtime-strategy-unsupported", ["policy", "resources", index, "cache"]));
      return;
    }
    if (outcome === "executable") {
      executableRules.push({
        pathPrefix: resolvePrefix(mountPath, resource.pathPrefix),
        resourceClass: resource.resourceClass,
        strategy: resource.cache,
      });
    }
  });

  const warnings: PwaWarningDiagnostic[] =
    executableRules.length === 0 ? [warningDiagnostic("compile.runtime-cache-unused", ["policy", "runtimeCache"])] : [];

  const { maxEntries, maxEntryBytes, maxAgeSeconds } = policy.runtimeCache;
  return {
    runtimeCache: {
      enabled: true,
      maxEntries,
      maxEntryBytes,
      maxAgeSeconds,
      configDigest: configDigest({ maxEntries, maxEntryBytes, maxAgeSeconds }, executableRules),
    },
    errors,
    warnings,
  };
}

/**
 * FNV-1a 64 of a canonical JSON string over the limits and the executable rules, sorted by path
 * prefix so resource input order never changes the digest. Fixed key order throughout.
 */
function configDigest(
  limits: { readonly maxEntries: number; readonly maxEntryBytes: number; readonly maxAgeSeconds: number },
  rules: readonly ExecutableRule[],
): string {
  const sortedRules = [...rules].sort((left, right) => compareCodePoints(left.pathPrefix, right.pathPrefix));
  const rulesJson = sortedRules
    .map(
      (rule) =>
        `{"pathPrefix":${JSON.stringify(rule.pathPrefix)},"resourceClass":${JSON.stringify(rule.resourceClass)},"strategy":${JSON.stringify(rule.strategy)}}`,
    )
    .join(",");
  const canonical = `{"limits":{"maxEntries":${limits.maxEntries},"maxEntryBytes":${limits.maxEntryBytes},"maxAgeSeconds":${limits.maxAgeSeconds}},"rules":[${rulesJson}]}`;
  return fnv1a64(canonical);
}
