import {
  REQUEST_BASELINE_DENIALS,
  cacheNamespacePrefix,
  validateIdentity,
  validateInstallMetadata,
  validatePlan,
  validatePolicy,
} from "@pwa-platform/contracts";
import type {
  PwaDiagnostic,
  PwaInstallMetadata,
  PwaOfflineWritePolicy,
  PwaPlan,
  PwaPlanV2,
  PwaValidationResult,
  PwaWarningDiagnostic,
} from "@pwa-platform/contracts";
import { checkHostOutput } from "./host-output.js";
import type { PwaCompileInput } from "./input.js";
import { diagnostic, withinField } from "./internal/diagnostics.js";
import { isPlainRecord } from "./internal/shape.js";
import { compilePrecache } from "./precache.js";
import { compilePathRules } from "./rules.js";
import { decodedPathKey, isWithinKey } from "./internal/path-key.js";
import { resolvePrefix } from "./rules.js";
import { compileRuntimeCache } from "./runtime-cache.js";
import { installStartUrlInChildScope, policyRulesInChildScope, resolveTopology } from "./topology.js";

const INPUT_FIELDS = ["identity", "install", "policy", "topology", "hostBuildOutput"] as const;

type InputFields = { readonly [Field in (typeof INPUT_FIELDS)[number]]: unknown };

/**
 * Compiles platform identity, install metadata, policy, topology and host build output into a
 * `PwaPlan`. Never throws; a successful plan always passes contracts `validatePlan`.
 */
export function compilePlan(input: PwaCompileInput): PwaValidationResult<PwaPlan> {
  try {
    return compile(input);
  } catch {
    // Hostile inputs (revoked proxies, throwing traps, extreme nesting) must still produce a result.
    return failure([diagnostic("value.not-serializable", [])]);
  }
}

/** Reads each input field exactly once through its property descriptor, so accessors never run. */
function readInput(input: unknown): InputFields | PwaDiagnostic[] {
  if (!isPlainRecord(input)) return [diagnostic("schema.invalid-type", [])];
  const findings: PwaDiagnostic[] = [];
  if (Reflect.ownKeys(input).some((key) => !(INPUT_FIELDS as readonly PropertyKey[]).includes(key))) {
    findings.push(diagnostic("schema.unknown-field", []));
  }
  const fields: { [Field in (typeof INPUT_FIELDS)[number]]?: unknown } = {};
  for (const field of INPUT_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (descriptor === undefined) {
      findings.push(diagnostic("schema.missing-field", [field]));
    } else if (!descriptor.enumerable || !("value" in descriptor)) {
      findings.push(diagnostic("value.not-serializable", [field]));
    } else {
      fields[field] = descriptor.value;
    }
  }
  return findings.length > 0 ? findings : (fields as InputFields);
}

function compile(input: unknown): PwaValidationResult<PwaPlan> {
  const fields = readInput(input);
  if (Array.isArray(fields)) return failure(fields);

  const errors: PwaDiagnostic[] = [];
  const warnings: PwaWarningDiagnostic[] = [];

  const identityResult = validateIdentity(fields.identity);
  if (!identityResult.ok) errors.push(...identityResult.diagnostics.map((finding) => withinField("identity", finding)));
  const identity = identityResult.ok ? identityResult.value : undefined;

  const policyResult = validatePolicy(fields.policy);
  if (!policyResult.ok) errors.push(...policyResult.diagnostics.map((finding) => withinField("policy", finding)));
  const policy = policyResult.ok ? policyResult.value : undefined;
  // v2 policy validation lands before its plan and worker contract. Never discard an accepted offline-write
  // declaration and emit a v1 plan: until the coordinated v2 compiler slice exists, reject it explicitly.
  const installEnabled = policy?.install.enabled === true;

  let install: PwaInstallMetadata | null = null;
  if (fields.install === null) {
    if (installEnabled) errors.push(diagnostic("compile.install-metadata-missing", ["install"]));
  } else if (identity !== undefined) {
    const installResult = validateInstallMetadata(fields.install, identity);
    if (installResult.ok) {
      install = installResult.value;
      // Metadata for a disabled install is still validated, but its warnings do not reach the plan.
      if (installEnabled) warnings.push(...installResult.diagnostics.map((finding) => withinField("install", finding)));
    } else {
      errors.push(...installResult.diagnostics.map((finding) => withinField("install", finding)));
    }
  }

  const topologyResolution = resolveTopology(fields.topology, identity);
  errors.push(...topologyResolution.findings);
  const resolvedTopology = topologyResolution.resolved;

  if (identity !== undefined && policy !== undefined && resolvedTopology !== undefined && resolvedTopology.childPrefixKeys.length > 0) {
    errors.push(...policyRulesInChildScope(policy, identity.mountPath, resolvedTopology.childPrefixKeys));
    // Install metadata for a disabled install still reaches the plan as `null`, so only the value that will
    // actually be published needs checking (mirrors contracts' plan-level `plan.start-url-in-child-scope`).
    if (installEnabled && install !== null) {
      errors.push(...installStartUrlInChildScope(install, resolvedTopology.childPrefixKeys));
    }
  }

  const host = checkHostOutput(fields.hostBuildOutput, identity);
  errors.push(...host.findings);

  const rules = identity !== undefined && policy !== undefined ? compilePathRules(policy, identity.mountPath) : undefined;
  if (rules !== undefined) errors.push(...rules.findings);
  if (identity !== undefined && (policy?.schemaVersion === 2 || policy?.schemaVersion === 3) && rules !== undefined) {
    for (const [index, target] of policy.offlineWrites.targets.entries()) {
      const key = decodedPathKey(resolvePrefix(identity.mountPath, target.pathPrefix));
      const matched = rules.pathRules.find((rule) => isWithinKey(key, decodedPathKey(rule.pathPrefix)));
      if (matched?.resourceClass !== "mutation") {
        errors.push(diagnostic("compile.offline-write-target-invalid", ["policy", "offlineWrites", "targets", index, "pathPrefix"]));
      }
    }
  }

  if (identity !== undefined && policy?.schemaVersion === 3) {
    const runtimeCacheResult = compileRuntimeCache(policy, identity.mountPath);
    errors.push(...runtimeCacheResult.errors);
    warnings.push(...runtimeCacheResult.warnings);
  }

  // Precache selection needs conflict-free rules and a valid build output manifest.
  const precache =
    identity !== undefined && policy !== undefined && rules !== undefined && rules.findings.length === 0 && host.output !== undefined
      ? compilePrecache(policy, identity.mountPath, host.output, rules, resolvedTopology?.childPrefixKeys ?? [])
      : undefined;
  if (precache !== undefined) {
    errors.push(...precache.errors);
    warnings.push(...precache.warnings);
  }

  if (
    errors.length > 0 ||
    identity === undefined ||
    policy === undefined ||
    rules === undefined ||
    host.output === undefined ||
    precache === undefined ||
    resolvedTopology === undefined
  ) {
    return failure(errors);
  }

  const planFields = {
    identity,
    install: installEnabled ? install : null,
    hostBuildOutput: { publicPath: host.output.publicPath },
    topology: resolvedTopology.value,
    artifacts: { serviceWorkerFile: host.output.serviceWorkerFile, manifestFile: host.output.manifestFile },
    precache: precache.precache,
    cacheNamespace: { prefix: cacheNamespacePrefix(identity) },
    requestBaselineDenials: [...REQUEST_BASELINE_DENIALS],
    pathRules: [...resolvedTopology.excludeRules, ...rules.pathRules],
    offlineFallback: precache.offlineFallback,
    updateMode: policy.updateMode,
    diagnostics: warnings,
    // Only present when the policy set it, so an unset policy produces a plan with no such key.
    ...(policy.networkTimeoutSeconds !== undefined
      ? { networkTimeoutSeconds: policy.networkTimeoutSeconds }
      : {}),
  };
  const plan: PwaPlan =
    policy.schemaVersion === 3
      ? {
          ...planFields,
          schemaVersion: 3,
          planVersion: 3,
          policyVersion: 3,
          offlineWrites: compileOfflineWrites(policy.offlineWrites, identity),
          // Errors from an unsupported strategy already returned `failure` above; recomputing here is
          // pure and side-effect free, and keeps the runtime-cache plan shape colocated with the others.
          runtimeCache: compileRuntimeCache(policy, identity.mountPath).runtimeCache,
        }
      : policy.schemaVersion === 2
        ? {
            ...planFields,
            schemaVersion: 2,
            planVersion: 2,
            policyVersion: 2,
            offlineWrites: compileOfflineWrites(policy.offlineWrites, identity),
          }
        : { ...planFields, schemaVersion: 1, planVersion: 1, policyVersion: 1 };

  // Guarantees the documented contract: a successful compilation always passes validatePlan.
  const checked = validatePlan(plan);
  if (!checked.ok) return checked;
  return { ok: true, value: checked.value, diagnostics: warnings };
}

function compileOfflineWrites(policy: PwaOfflineWritePolicy, identity: PwaPlan["identity"]): PwaPlanV2["offlineWrites"] {
  if (!policy.enabled) return { enabled: false };
  const resolve = (prefix: string): `/${string}` =>
    (identity.mountPath === "/" ? prefix : prefix === "/" ? identity.mountPath : `${identity.mountPath}${prefix}`) as `/${string}`;
  return {
    enabled: true,
    databaseName: `pwa-offline-write:${encodeURIComponent(identity.appId)}:${encodeURIComponent(identity.environment)}:${encodeURIComponent(identity.cacheNamespaceSeed)}`,
    maxEntries: policy.maxEntries,
    maxTotalBodyBytes: policy.maxTotalBodyBytes,
    targets: policy.targets.map((target) => ({ id: target.id, pathPrefix: resolve(target.pathPrefix), maxBodyBytes: target.maxBodyBytes })),
  };
}

function failure(diagnostics: readonly PwaDiagnostic[]): PwaValidationResult<never> {
  const [first, ...rest] = diagnostics;
  if (!first) throw new Error("A failed compilation must carry at least one diagnostic.");
  return { ok: false, diagnostics: [first, ...rest] };
}
