// Runs the real build-verifier checks against an assembled input. Both `verifyRelease` and
// `verifyReleaseGateCoverage` are pure, so wrapping them here lets tests (and the future CLI) exercise the actual
// verifier end-to-end on fixture plans instead of re-deriving its behavior.
import {
  verifyRelease,
  verifyReleaseGateCoverage,
  type PwaReleaseGateCoverage,
  type PwaVerificationCheckName,
  type PwaVerificationReport,
  type PwaVerifyReleaseInput,
} from "@pwa-platform/build-verifier";

export type PwaReleaseCheckResult = {
  readonly report: PwaVerificationReport;
  readonly coverage: PwaReleaseGateCoverage;
};

export function runChecks(
  input: PwaVerifyReleaseInput,
  requiredChecks: readonly PwaVerificationCheckName[],
): PwaReleaseCheckResult {
  const report = verifyRelease(input);
  const coverage = verifyReleaseGateCoverage(report, requiredChecks);
  return { report, coverage };
}
