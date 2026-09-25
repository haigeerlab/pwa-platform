// Combines a build-verifier report, its coverage result, and the history outcome into one pass/fail decision,
// without collapsing the three inputs into a single boolean before returning them (module spec, "组装与结论").
import type { PwaReleaseGateCoverage, PwaVerificationCheckName, PwaVerificationReport } from "@pwa-platform/build-verifier";
import type { PwaHistoryInconsistency, PwaReleaseHistoryOutcome } from "./assemble.ts";

export type PwaReleaseVerdict = {
  readonly reportOk: boolean;
  readonly coverageOk: boolean;
  readonly coverageMissing: readonly PwaVerificationCheckName[];
  readonly historyComplete: boolean;
  readonly missingPlanDeploymentIds: readonly string[];
  /** Entries that could not be placed in the history at all (a tie, a NaN timestamp, a duplicate id, a missing candidate); semantics unchanged from `history.inconsistencies`. */
  readonly historyInconsistencies: readonly PwaHistoryInconsistency[];
  /** True only when every one of the three components above is true. */
  readonly pass: boolean;
};

/**
 * Reads out `report.ok`, `coverage.ok` and `history.complete` as separate facts and combines them into `pass`.
 *
 * Each component is exposed on the result rather than only feeding into `pass`, so a caller can say which of the
 * three failed without re-deriving it from `report`/`coverage`/`history` a second time.
 *
 * `history` only needs `complete`/`missingPlans`/`inconsistencies` (a `Pick`, not the full `PwaReleaseHistoryOutcome`)
 * so this same function also accepts a `PwaPreDeployHistoryOutcome` (module spec, "修订：上线前核验"), which has no
 * `candidateFound`/`candidateIsNewest` to report — neither field is read here anyway.
 */
export function decideVerdict(
  report: PwaVerificationReport,
  coverage: PwaReleaseGateCoverage,
  history: Pick<PwaReleaseHistoryOutcome, "complete" | "missingPlans" | "inconsistencies">,
): PwaReleaseVerdict {
  const reportOk = report.ok;
  const coverageOk = coverage.ok;
  const historyComplete = history.complete;
  return {
    reportOk,
    coverageOk,
    coverageMissing: coverage.missing,
    historyComplete,
    missingPlanDeploymentIds: history.missingPlans.map((entry) => entry.deploymentId),
    historyInconsistencies: history.inconsistencies,
    pass: reportOk && coverageOk && historyComplete,
  };
}
