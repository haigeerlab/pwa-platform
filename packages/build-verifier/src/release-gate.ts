// Does a release report cover every check the caller declared mandatory? This is deliberately separate from whether
// those checks passed: a complete report can still fail and an empty report can still be structurally complete.
import { VERIFICATION_CHECKS, type PwaVerificationCheckName, type PwaVerificationReport } from "./report.js";

export type PwaReleaseGateCoverage = {
  readonly ok: boolean;
  readonly missing: readonly PwaVerificationCheckName[];
};

/**
 * Confirms that every declared check appears in `report.checks`, without re-running any verification.
 *
 * `required` is a caller-controlled policy boundary, so duplicates and names outside the published check set are
 * caller errors rather than release findings. The result intentionally does not incorporate `report.ok`: coverage
 * and passing are separate conclusions that a deployment gate must combine deliberately.
 */
export function verifyReleaseGateCoverage(
  report: PwaVerificationReport,
  required: readonly PwaVerificationCheckName[],
): PwaReleaseGateCoverage {
  const declared = new Set<PwaVerificationCheckName>();
  for (const name of required) {
    if (!VERIFICATION_CHECKS.includes(name) || declared.has(name)) {
      throw new TypeError("Required release checks must be known and unique");
    }
    declared.add(name);
  }

  const performed = new Set<PwaVerificationCheckName>();
  for (const { name } of report.checks) {
    if (!VERIFICATION_CHECKS.includes(name) || performed.has(name)) {
      throw new TypeError("Release report checks must be known and unique");
    }
    performed.add(name);
  }
  const missing = required.filter((name) => !performed.has(name));
  return { ok: missing.length === 0, missing };
}
