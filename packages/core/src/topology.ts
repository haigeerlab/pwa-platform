import { validateOriginRegistry } from "@pwa-platform/contracts";
import type {
  AbsolutePath,
  PwaDiagnostic,
  PwaIdentity,
  PwaInstallMetadata,
  PwaPathRule,
  PwaPolicy,
  PwaRegistryEntry,
  PwaTopology,
} from "@pwa-platform/contracts";
import { diagnostic, withinPath } from "./internal/diagnostics.js";
import { compareCodePoints } from "./internal/order.js";
import { decodedPathKey, isWithinKey } from "./internal/path-key.js";
import { hasExactKeys } from "./internal/shape.js";
import { resolvePrefix } from "./rules.js";

export type ResolvedTopology = {
  /** Recorded as-is in the plan's `topology` field. */
  readonly value: PwaTopology;
  /** Decoded path keys of every child scope; empty unless this app is the root of a `shared-origin` registry. */
  readonly childPrefixKeys: readonly string[];
  /** Exclude rules to place ahead of every other path rule; empty unless this app is the root. */
  readonly excludeRules: readonly PwaPathRule[];
};

export type TopologyResolution = {
  readonly findings: PwaDiagnostic[];
  /** `undefined` when the topology could not be resolved (findings then explains why, or the identity was invalid). */
  readonly resolved: ResolvedTopology | undefined;
};

/**
 * Resolves the compiler's `topology` input: validates a `shared-origin` registry, matches the
 * building app's identity to exactly one registry entry, and (for the root app) computes the
 * exclude rules and child scope keys the rest of compilation needs.
 */
export function resolveTopology(topology: unknown, identity: PwaIdentity | undefined): TopologyResolution {
  if (hasExactKeys(topology, ["kind"]) && topology.kind === "standalone-origin") {
    return { findings: [], resolved: { value: { kind: "standalone-origin" }, childPrefixKeys: [], excludeRules: [] } };
  }

  if (hasExactKeys(topology, ["kind", "registry"]) && topology.kind === "shared-origin") {
    const registryResult = validateOriginRegistry(topology.registry);
    if (!registryResult.ok) {
      return {
        findings: registryResult.diagnostics.map((finding) => withinPath(["topology", "registry"], finding)),
        resolved: undefined,
      };
    }
    const registry = registryResult.value;
    // Identity failed validation: compilation already fails, and there is nothing meaningful to match.
    if (identity === undefined) return { findings: [], resolved: undefined };

    const matches = [registry.root, ...registry.children].filter((entry) => matchesIdentity(entry, identity));
    if (registry.origin !== identity.origin || registry.environment !== identity.environment || matches.length !== 1) {
      return { findings: [diagnostic("plan.registry-identity-mismatch", ["topology", "registry"])], resolved: undefined };
    }

    const value: PwaTopology = { kind: "shared-origin", registry };
    if (!matchesIdentity(registry.root, identity)) {
      return { findings: [], resolved: { value, childPrefixKeys: [], excludeRules: [] } };
    }

    const childPrefixes = [...registry.children.map((child) => scopeToPathPrefix(child.scope))].sort(compareCodePoints);
    const excludeRules: PwaPathRule[] = childPrefixes.map((pathPrefix) => ({
      pathPrefix,
      resourceClass: "unclassified",
      action: "exclude",
      source: "platform",
    }));
    return { findings: [], resolved: { value, childPrefixKeys: childPrefixes.map(decodedPathKey), excludeRules } };
  }

  return { findings: [diagnostic("compile.unsupported-topology", ["topology"])], resolved: undefined };
}

/** Root-app check: a policy resource (any action, including deny) must not reach into a child scope. */
export function policyRulesInChildScope(
  policy: PwaPolicy,
  mountPath: AbsolutePath,
  childPrefixKeys: readonly string[],
): PwaDiagnostic[] {
  return policy.resources.flatMap((resource, index) => {
    const key = decodedPathKey(resolvePrefix(mountPath, resource.pathPrefix));
    return childPrefixKeys.some((childKey) => isWithinKey(key, childKey))
      ? [diagnostic("compile.policy-rule-in-child-scope", ["policy", "resources", index, "pathPrefix"])]
      : [];
  });
}

/** Root-app check: the install start URL must not reach into a child scope (contracts' `plan.start-url-in-child-scope`). */
export function installStartUrlInChildScope(
  install: PwaInstallMetadata,
  childPrefixKeys: readonly string[],
): PwaDiagnostic[] {
  const inChildScope = (path: string): boolean =>
    childPrefixKeys.some((childKey) => isWithinKey(decodedPathKey(path), childKey));
  const findings: PwaDiagnostic[] = [];
  if (inChildScope(install.startUrl)) findings.push(diagnostic("compile.start-url-in-child-scope", ["install", "startUrl"]));
  // Shortcuts follow the start URL's rule (ADR-0037): a root app's shortcut must not open a child's page.
  install.shortcuts?.forEach((shortcut, index) => {
    if (inChildScope(shortcut.url)) {
      findings.push(diagnostic("compile.shortcut-url-in-child-scope", ["install", "shortcuts", index, "url"]));
    }
  });
  return findings;
}

function matchesIdentity(entry: PwaRegistryEntry, identity: PwaIdentity): boolean {
  return (
    entry.appId === identity.appId &&
    entry.scope === identity.scope &&
    entry.serviceWorkerUrl === identity.serviceWorkerUrl &&
    entry.manifestId === identity.manifestId &&
    entry.manifestUrl === identity.manifestUrl
  );
}

/** Canonical path-prefix form of a scope: the scope without its trailing slash (matches `resolvePrefix`). */
function scopeToPathPrefix(scope: AbsolutePath): AbsolutePath {
  return scope === "/" ? "/" : (scope.slice(0, -1) as AbsolutePath);
}
