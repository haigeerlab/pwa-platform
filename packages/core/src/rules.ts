import type {
  AbsolutePath,
  MountRelativePath,
  PwaDiagnostic,
  PwaDiagnosticCode,
  PwaPathRule,
  PwaPolicy,
  PwaResourceClass,
} from "@pwa-platform/contracts";
import { diagnostic } from "./internal/diagnostics.js";
import { compareCodePoints } from "./internal/order.js";
import { decodedPathKey, isWithinKey } from "./internal/path-key.js";

const DENY_CLASSES: ReadonlySet<PwaResourceClass> = new Set(["session-data", "mutation", "stream", "unclassified"]);

type Candidate = {
  readonly index: number;
  /** Decoded comparison key; only used to detect conflicts and to order rules. */
  readonly key: string;
  readonly rule: PwaPathRule;
};

export type CompiledPathRules = {
  /** First-match evaluation order: deny rules first, then longer prefixes, then code point order. */
  readonly pathRules: PwaPathRule[];
  /** Index of the policy resource each entry of `pathRules` was compiled from. */
  readonly resourceIndexes: number[];
  readonly findings: PwaDiagnostic[];
};

/** Resolves policy rules against the mount path, rejects conflicts and orders the rules for evaluation. */
export function compilePathRules(policy: PwaPolicy, mountPath: AbsolutePath): CompiledPathRules {
  const duplicates: PwaDiagnostic[] = [];
  const seenKeys = new Set<string>();
  const candidates: Candidate[] = [];

  policy.resources.forEach((resource, index) => {
    const pathPrefix = resolvePrefix(mountPath, resource.pathPrefix);
    const key = decodedPathKey(pathPrefix);
    if (seenKeys.has(key)) {
      duplicates.push(conflict("compile.duplicate-path-prefix", index));
      return;
    }
    seenKeys.add(key);
    const action = DENY_CLASSES.has(resource.resourceClass) ? "deny" : resource.cache;
    candidates.push({ index, key, rule: { pathPrefix, resourceClass: resource.resourceClass, action, source: "policy" } });
  });

  // Business allow rules can never override a deny rule, so an allow rule inside a deny prefix is an error.
  const denyKeys = candidates.filter((candidate) => candidate.rule.action === "deny").map((candidate) => candidate.key);
  const allowsUnderDeny = candidates
    .filter((candidate) => candidate.rule.action !== "deny" && denyKeys.some((key) => isWithinKey(candidate.key, key)))
    .map((candidate) => conflict("compile.allow-under-deny", candidate.index));

  const ordered = [...candidates].sort(byEvaluationOrder);
  return {
    pathRules: ordered.map((candidate) => candidate.rule),
    resourceIndexes: ordered.map((candidate) => candidate.index),
    findings: [...duplicates, ...allowsUnderDeny],
  };
}

/** `/api` under mount `/app` resolves to `/app/api`; the root prefix resolves to the mount path itself. */
export function resolvePrefix(mountPath: AbsolutePath, prefix: MountRelativePath): AbsolutePath {
  if (mountPath === "/") return prefix;
  const mount = mountPath.endsWith("/") ? mountPath.slice(1, -1) : mountPath.slice(1);
  return prefix === "/" ? `/${mount}` : `/${mount}${prefix}`;
}

function conflict(code: PwaDiagnosticCode, index: number): PwaDiagnostic {
  return diagnostic(code, ["policy", "resources", index, "pathPrefix"]);
}

function byEvaluationOrder(left: Candidate, right: Candidate): number {
  const leftDeny = left.rule.action === "deny";
  const rightDeny = right.rule.action === "deny";
  if (leftDeny !== rightDeny) return leftDeny ? -1 : 1;
  const lengthDifference = [...right.key].length - [...left.key].length;
  return lengthDifference !== 0 ? lengthDifference : compareCodePoints(left.key, right.key);
}
