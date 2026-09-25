// Is this release still the same app? An identity is immutable once a slot has gone to production (ADR-0004), so
// the release gate compares the candidate against the slot's baseline. Nothing here reads from disk.
import {
  DIAGNOSTIC_MESSAGES,
  validateIdentity,
  type PwaContractPath,
  type PwaDiagnostic,
  type PwaIdentity,
} from "@pwa-platform/contracts";
import { check, type PwaVerificationCheck } from "./report.js";

/**
 * The fields compared, in the order the release baseline rules list them: the eight ADR-0008 immutable fields,
 * then `environment` — renaming an environment inside one slot is an identity migration too.
 *
 * Spelled out rather than derived from the candidate's keys. `PwaIdentity` happens to have exactly these nine
 * fields today, but deriving the list would silently absorb any field contracts adds later, quietly extending a
 * set that ADR-0008 defines. A test asserts this list still covers every key.
 */
export const BASELINE_FIELDS = [
  "appId",
  "origin",
  "scope",
  "serviceWorkerUrl",
  "manifestId",
  "manifestUrl",
  "mountPath",
  "cacheNamespaceSeed",
  "environment",
] as const;

/**
 * Compares a candidate identity with the slot's stored baseline.
 *
 * Comparison is verbatim, with no normalisation whatsoever: a difference in case, a trailing slash or a
 * percent-encoded spelling all change the origin, scope or cache namespace the browser sees, which is exactly
 * what an identity migration is. Normalising here would hide one.
 *
 * `baseline` is whatever was read from storage, still unchecked. `undefined` or `null` means the comparison had
 * nothing to compare against; deciding whether that is a first production release or a gate failure needs the
 * human review ADR-0004 requires, so this reports the fact and stops there.
 */
export function compareIdentityBaseline(candidate: PwaIdentity, baseline: unknown): PwaVerificationCheck {
  const diagnostics: PwaDiagnostic[] = [];

  const candidateResult = validateIdentity(candidate);
  if (!candidateResult.ok) {
    // The candidate is the release's own identity; an invalid one is a compile-time problem, not a drift finding.
    throw new TypeError("The candidate identity is not valid; validate it before comparing against a baseline");
  }

  if (baseline === undefined || baseline === null) {
    return check("identity-baseline", [diagnostic("verify.baseline-missing", "/identity")]);
  }

  const baselineResult = validateIdentity(baseline);
  if (!baselineResult.ok) {
    return check("identity-baseline", [diagnostic("verify.baseline-invalid", "/identity")]);
  }

  for (const field of BASELINE_FIELDS) {
    if (candidateResult.value[field] !== baselineResult.value[field]) {
      diagnostics.push(diagnostic("verify.baseline-mismatch", `/identity/${field}`));
    }
  }

  return check("identity-baseline", diagnostics);
}

/** Diagnostics name the field that drifted, never the two values: messages must not echo input. */
function diagnostic(
  code: "verify.baseline-missing" | "verify.baseline-invalid" | "verify.baseline-mismatch",
  path: PwaContractPath,
): PwaDiagnostic {
  return { code, severity: "error", path, message: DIAGNOSTIC_MESSAGES[code] };
}
