// Was the root told to stay out of this child's scope before the child ships? On a shared origin the root worker has
// to exclude a child's scope first, and only then may the child be deployed (ADR-0019). The compiler cannot see
// what is live, so the release gate checks the child against the root plan that is actually deployed.
import {
  DIAGNOSTIC_MESSAGES,
  validatePlan,
  type PwaContractPath,
  type PwaDiagnostic,
  type PwaIdentity,
  type PwaOriginRegistry,
  type PwaPlan,
  type PwaRegistryEntry,
} from "@pwa-platform/contracts";
import { check, type PwaVerificationCheck } from "./report.js";

/** True when `plan` is a child app of a shared-origin registry — the only case this check applies to. */
export function isSharedOriginChild(plan: PwaPlan): boolean {
  if (plan.topology.kind !== "shared-origin") return false;
  return plan.topology.registry.children.some((child) => child.appId === plan.identity.appId);
}

/**
 * Checks a child app's plan against the root plan currently deployed on the same origin.
 *
 * `deployedRootPlan` is whatever was read from the root's release record, still unchecked — the same stance as the
 * identity baseline: an unreadable or invalid record is a finding, not a crash. The three findings are reported
 * independently where they can be; once the deployed plan is not a shared-origin root of this origin, the other two
 * questions have no meaningful answer and are not asked.
 *
 * Throws when `plan` itself is not a shared-origin child: that is a caller mistake (`verifyRelease` only calls this
 * for children), not something the release gate should report as drift.
 */
export function verifyReleaseOrder(plan: PwaPlan, deployedRootPlan: unknown): PwaVerificationCheck {
  if (plan.topology.kind !== "shared-origin" || !isSharedOriginChild(plan)) {
    throw new TypeError("verifyReleaseOrder only applies to the plan of a shared-origin child app");
  }
  const childRegistry = plan.topology.registry;

  const rootResult = validatePlan(deployedRootPlan);
  if (!rootResult.ok) {
    return check("release-order", [diagnostic("verify.root-plan-not-shared-origin", "/deployedRootPlan")]);
  }
  const root = rootResult.value;
  if (
    root.topology.kind !== "shared-origin" ||
    // The deployed plan must be this origin's root, not another child or another app that happens to be registered.
    root.identity.appId !== root.topology.registry.root.appId ||
    root.identity.appId !== childRegistry.root.appId ||
    root.identity.origin !== plan.identity.origin ||
    root.identity.environment !== plan.identity.environment
  ) {
    return check("release-order", [diagnostic("verify.root-plan-not-shared-origin", "/deployedRootPlan/topology")]);
  }

  const diagnostics: PwaDiagnostic[] = [];

  // The compiler's prefix form for a scope: the scope without its trailing slash (contracts and core agree on this).
  const childPrefix = plan.identity.scope === "/" ? "/" : plan.identity.scope.slice(0, -1);
  if (!root.pathRules.some((rule) => rule.action === "exclude" && rule.pathPrefix === childPrefix)) {
    diagnostics.push(diagnostic("verify.root-plan-missing-exclude", "/deployedRootPlan/pathRules"));
  }

  // The exclude rule above only proves the root stopped serving this scope; it says nothing about which app the
  // root's own registry thinks lives there. A root that still lists a *different* app at this scope (or under a
  // different identity entirely) has excluded the path without actually registering this child.
  if (!root.topology.registry.children.some((child) => matchesRegistryIdentity(child, plan.identity))) {
    diagnostics.push(diagnostic("verify.root-registry-child-mismatch", "/deployedRootPlan/topology/registry/children"));
  }

  if (root.topology.registry.registryVersion < childRegistry.registryVersion) {
    diagnostics.push(diagnostic("verify.root-registry-older", "/deployedRootPlan/topology/registry/registryVersion"));
  } else if (
    root.topology.registry.registryVersion === childRegistry.registryVersion &&
    !registriesEqual(root.topology.registry, childRegistry)
  ) {
    // Same version number, different content: the two repositories' copies of the shared registry file have
    // drifted (ADR-0019 "登记表在多个仓库间漂移") without either side bumping the version that is supposed to
    // catch that.
    diagnostics.push(diagnostic("verify.root-registry-diverged", "/deployedRootPlan/topology/registry"));
  }

  return check("release-order", diagnostics);
}

function matchesRegistryIdentity(entry: PwaRegistryEntry, identity: PwaIdentity): boolean {
  return (
    entry.appId === identity.appId &&
    entry.scope === identity.scope &&
    entry.serviceWorkerUrl === identity.serviceWorkerUrl &&
    entry.manifestId === identity.manifestId &&
    entry.manifestUrl === identity.manifestUrl
  );
}

function registryEntriesEqual(left: PwaRegistryEntry, right: PwaRegistryEntry): boolean {
  return (
    left.appId === right.appId &&
    left.scope === right.scope &&
    left.serviceWorkerUrl === right.serviceWorkerUrl &&
    left.manifestId === right.manifestId &&
    left.manifestUrl === right.manifestUrl
  );
}

/** Field-by-field comparison, independent of key order: neither side is guaranteed to have passed through zod. */
function registriesEqual(left: PwaOriginRegistry, right: PwaOriginRegistry): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.registryVersion === right.registryVersion &&
    left.origin === right.origin &&
    left.environment === right.environment &&
    registryEntriesEqual(left.root, right.root) &&
    left.children.length === right.children.length &&
    left.children.every((child, index) => registryEntriesEqual(child, right.children[index]!))
  );
}

/** Diagnostics name the field at fault, never a value: messages must not echo input. */
function diagnostic(
  code:
    | "verify.root-plan-not-shared-origin"
    | "verify.root-plan-missing-exclude"
    | "verify.root-registry-older"
    | "verify.root-registry-child-mismatch"
    | "verify.root-registry-diverged",
  path: PwaContractPath,
): PwaDiagnostic {
  return { code, severity: "error", path, message: DIAGNOSTIC_MESSAGES[code] };
}
